const { createBillingEngine, calculateRequestCost, estimatePromptTokens } = require('./billing');
const { FallbackGateway, modelProvider, stripProviderPrefix } = require('./fallback-gateway');
const {
  createGatewayAuth,
  createGatewayRateLimiter,
  createAnomalyDetector,
  createWorkspaceApiKey,
  decryptProviderKey,
  encryptProviderKey,
  openAiError
} = require('./security');
const {
  DEFAULT_PRICING,
  createId,
  getActiveModels,
  getModelById,
  initGatewaySchema,
  seedDefaultModels
} = require('./model-catalog');

function withAsync(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function openAiServerError(res, err) {
  const status = err.status || 500;
  const payload = err.openAi || {
    error: {
      message: err.message || 'Internal server error',
      type: status >= 500 ? 'server_error' : 'invalid_request_error'
    }
  };
  return res.status(status).json(payload);
}

function loadByokProviders(db, providers, workspaceId) {
  const merged = { ...providers };
  const rows = db.prepare("SELECT provider, encrypted_key, iv, auth_tag FROM workspace_provider_keys WHERE workspace_id = ? AND status = 'active'").all(workspaceId);
  for (const row of rows) {
    try {
      const providerName = row.provider;
      const key = decryptProviderKey(row);
      if (providerName === 'anthropic') {
        merged.anthropic = { key, base: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1' };
      } else if (providerName === 'google') {
        merged.google_direct = { ...(merged.google_direct || {}), key };
      } else {
        merged[providerName] = { ...(merged[providerName] || {}), key };
      }
    } catch (err) {
      console.warn('[BYOK] provider key skipped:', err.message);
    }
  }
  return merged;
}

function buildGatewayForRequest(req, deps) {
  return new FallbackGateway({
    providers: loadByokProviders(deps.db, deps.providers, req.gatewayAuth.workspaceId),
    inferProviderFromModel: deps.inferProviderFromModel
  });
}

function getPricingForModel(db, modelId) {
  const found = getModelById(db, modelId);
  return found ? found.pricing : DEFAULT_PRICING;
}

function getRequestId(req) {
  return req.headers['x-request-id'] || createId('req');
}

async function logAndCharge({ billing, req, endpoint, modelId, provider, latencyMs, usage, pricing, status = 'ok' }) {
  const cost = calculateRequestCost({ usage, pricing, messages: req.body?.messages || [] });
  const deduction = await billing.deductBalance(req.gatewayAuth, cost.cost_usd);
  await billing.enqueueUsageEvent({
    workspace_id: req.gatewayAuth.workspaceId,
    api_key_id: req.gatewayAuth.apiKeyId || null,
    user_id: req.gatewayAuth.userId || null,
    endpoint,
    model_id: modelId,
    provider,
    latency_ms: latencyMs,
    prompt_tokens: cost.usage.prompt_tokens,
    completion_tokens: cost.usage.completion_tokens,
    reasoning_tokens: cost.usage.reasoning_tokens,
    cache_read_tokens: cost.usage.cache_read_tokens,
    cache_write_tokens: cost.usage.cache_write_tokens,
    image_units: cost.usage.image_units,
    cost_usd: cost.cost_usd,
    status: deduction.ok ? status : 'payment_shortfall',
    request_id: getRequestId(req)
  });
  return { cost, deduction };
}

async function forwardEmbeddings(req, deps) {
  const body = req.body || {};
  const modelId = body.model || 'openai/text-embedding-3-large';
  const providerName = modelProvider(modelId, deps.inferProviderFromModel);
  const providers = loadByokProviders(deps.db, deps.providers, req.gatewayAuth.workspaceId);
  const provider = providers[providerName] || providers.openai;
  if (!provider?.base) {
    const err = new Error(`Provider not configured: ${providerName}`);
    err.status = 503;
    throw err;
  }

  const base = String(provider.base).replace(/\/+$/, '');
  const payload = { ...body, model: providerName === 'openrouter' ? modelId : stripProviderPrefix(modelId) };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(provider.key && provider.key !== 'none' ? { authorization: `Bearer ${provider.key}` } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { error: { message: text || 'Invalid embeddings response' } }; }
    if (!response.ok || json.error) {
      const err = new Error(json.error?.message || `Embeddings provider failed (${response.status})`);
      err.status = response.status || 502;
      err.providerError = json;
      throw err;
    }
    if (!json.usage) {
      const input = Array.isArray(body.input) ? body.input.join('\n') : String(body.input || '');
      const promptTokens = estimatePromptTokens([{ role: 'user', content: input }]);
      json.usage = { prompt_tokens: promptTokens, total_tokens: promptTokens };
    }
    return { json, modelId, providerName };
  } finally {
    clearTimeout(timeout);
  }
}

function registerGatewayRoutes(app, deps) {
  const { db, jwt, activeJwtSecret } = deps;
  initGatewaySchema(db);
  seedDefaultModels(db);

  const billing = createBillingEngine({ db });
  const auth = createGatewayAuth({ db, jwt, activeJwtSecret });
  const rateLimit = createGatewayRateLimiter();
  const anomaly = createAnomalyDetector({ db });
  const guards = [auth, rateLimit, anomaly];

  app.get('/v1/models', auth, withAsync(async (req, res) => {
    try {
      const models = getActiveModels(db);
      res.setHeader('Cache-Control', 'private, max-age=30');
      return res.json({ data: models });
    } catch (err) {
      console.error('[GET /v1/models]', err);
      return openAiServerError(res, err);
    }
  }));

  app.post('/v1/chat/completions', guards, withAsync(async (req, res) => {
    const body = req.body || {};
    if (!Array.isArray(body.messages)) return openAiError(res, 400, 'messages must be an array');
    const stream = body.stream === true;
    try {
      await billing.assertPositiveBalance(req.gatewayAuth);
      const gateway = buildGatewayForRequest(req, deps);
      const dataRegion = body.data_region || req.gatewayAuth.dataRegion || null;

      if (stream) {
        return gateway.streamChat(body, res, {
          dataRegion,
          onComplete: async ({ response, model, provider, latency_ms }) => {
            try {
              const pricing = getPricingForModel(db, model);
              await logAndCharge({
                billing,
                req,
                endpoint: '/v1/chat/completions',
                modelId: model,
                provider,
                latencyMs: latency_ms,
                usage: response.usage || {},
                pricing
              });
            } catch (err) {
              console.warn('[STREAM_BILLING]', err.message);
            }
          }
        });
      }

      const result = await gateway.forwardChat(body, { dataRegion });
      const modelId = result.model || body.model || (Array.isArray(body.models) ? body.models[0] : 'unknown');
      const pricing = getPricingForModel(db, modelId);
      const billed = await logAndCharge({
        billing,
        req,
        endpoint: '/v1/chat/completions',
        modelId,
        provider: result.provider,
        latencyMs: result.latency_ms,
        usage: result.usage || {},
        pricing
      });
      if (!billed.deduction.ok) {
        return openAiError(res, 402, 'Insufficient balance after request accounting', 'billing_error');
      }
      res.setHeader('X-Froxy-Cost-USD', billed.cost.cost_usd);
      if (billed.deduction.balance !== null) res.setHeader('X-Froxy-Balance-USD', String(billed.deduction.balance));
      return res.json(result);
    } catch (err) {
      if (err.status === 402) return openAiError(res, 402, 'Insufficient balance', 'billing_error');
      console.error('[POST /v1/chat/completions]', err.message);
      return openAiServerError(res, err);
    }
  }));

  app.post('/v1/embeddings', guards, withAsync(async (req, res) => {
    try {
      if (!req.body || req.body.input === undefined) return openAiError(res, 400, 'input is required');
      await billing.assertPositiveBalance(req.gatewayAuth);
      const startedAt = Date.now();
      const { json, modelId, providerName } = await forwardEmbeddings(req, deps);
      const pricing = getPricingForModel(db, modelId);
      const billed = await logAndCharge({
        billing,
        req,
        endpoint: '/v1/embeddings',
        modelId,
        provider: providerName,
        latencyMs: Date.now() - startedAt,
        usage: json.usage || {},
        pricing
      });
      if (!billed.deduction.ok) return openAiError(res, 402, 'Insufficient balance after request accounting', 'billing_error');
      res.setHeader('X-Froxy-Cost-USD', billed.cost.cost_usd);
      return res.json(json);
    } catch (err) {
      if (err.status === 402) return openAiError(res, 402, 'Insufficient balance', 'billing_error');
      console.error('[POST /v1/embeddings]', err.message);
      return openAiServerError(res, err);
    }
  }));

  app.post('/api/gateway/api-keys', auth, withAsync(async (req, res) => {
    try {
      const created = createWorkspaceApiKey(
        db,
        req.gatewayAuth.workspaceId,
        req.body?.name || 'Gateway API Key',
        req.body?.scopes || ['chat', 'models', 'embeddings']
      );
      return res.status(201).json({
        id: created.id,
        key: created.key,
        prefix: created.prefix,
        warning: 'Store this key now; it is shown only once.'
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }));

  app.post('/api/gateway/provider-keys', auth, withAsync(async (req, res) => {
    try {
      const provider = String(req.body?.provider || '').trim().toLowerCase();
      const apiKey = String(req.body?.api_key || '').trim();
      if (!provider || !apiKey) return res.status(400).json({ error: 'provider and api_key are required' });
      const encrypted = encryptProviderKey(apiKey);
      const id = createId('byok');
      db.prepare(`
        INSERT INTO workspace_provider_keys (id, workspace_id, provider, encrypted_key, iv, auth_tag, key_version, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id, provider) DO UPDATE SET
          encrypted_key = excluded.encrypted_key,
          iv = excluded.iv,
          auth_tag = excluded.auth_tag,
          key_version = excluded.key_version,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      `).run(id, req.gatewayAuth.workspaceId, provider, encrypted.encrypted_key, encrypted.iv, encrypted.auth_tag, encrypted.key_version);
      return res.status(201).json({ success: true, provider });
    } catch (err) {
      console.error('[BYOK_SAVE]', err.message);
      return res.status(500).json({ error: 'Provider key could not be stored securely' });
    }
  }));

  app.get('/api/gateway/usage', auth, withAsync(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const events = db.prepare('SELECT * FROM usage_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(req.gatewayAuth.workspaceId, limit);
    res.json({ data: events });
  }));
}

module.exports = { registerGatewayRoutes };
