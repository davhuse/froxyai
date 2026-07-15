const { createId, DEFAULT_PRICING, normalizePricing } = require('./model-catalog');
const { getRedisClient } = require('./security');

function optionalRequire(name) {
  try { return require(name); } catch (_) { return null; }
}

function redisConnectionOptions(redisUrl) {
  const parsed = new URL(redisUrl);
  const options = {
    host: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379))
  };
  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  if (parsed.password) options.password = decodeURIComponent(parsed.password);
  if (parsed.protocol === 'rediss:') options.tls = {};
  return options;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeUsage(raw = {}) {
  const details = raw.prompt_tokens_details || raw.input_tokens_details || raw.input_token_details || {};
  const completionDetails = raw.completion_tokens_details || raw.output_tokens_details || raw.output_token_details || {};
  return {
    prompt_tokens: Math.max(0, Math.trunc(toNumber(raw.prompt_tokens ?? raw.input_tokens ?? raw.inputTokenCount))),
    completion_tokens: Math.max(0, Math.trunc(toNumber(raw.completion_tokens ?? raw.output_tokens ?? raw.outputTokenCount))),
    reasoning_tokens: Math.max(0, Math.trunc(toNumber(
      raw.reasoning_tokens ??
      completionDetails.reasoning_tokens ??
      completionDetails.reasoning ??
      raw.output_tokens_details?.reasoning_tokens
    ))),
    cache_read_tokens: Math.max(0, Math.trunc(toNumber(
      raw.cache_read_tokens ??
      raw.cached_tokens ??
      details.cached_tokens ??
      details.cache_read_tokens ??
      details.input_cache_read ??
      details.cache_read
    ))),
    cache_write_tokens: Math.max(0, Math.trunc(toNumber(
      raw.cache_write_tokens ??
      details.cache_write_tokens ??
      details.input_cache_write ??
      details.cache_write
    ))),
    image_units: Math.max(0, Math.trunc(toNumber(raw.image_units ?? raw.images ?? 0))),
    web_search_units: Math.max(0, Math.trunc(toNumber(raw.web_search_units ?? raw.web_searches ?? 0)))
  };
}

function countImages(messages = []) {
  let count = 0;
  for (const message of messages || []) {
    const content = message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && (part.type === 'image_url' || part.image_url || part.inlineData)) count += 1;
    }
  }
  return count;
}

function estimateTokensFromText(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function estimatePromptTokens(messages = []) {
  let chars = 0;
  for (const message of messages || []) {
    const content = message?.content;
    if (typeof content === 'string') chars += content.length;
    else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string') chars += part.length;
        else if (part?.text) chars += String(part.text).length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

function calculateRequestCost({ usage = {}, pricing = DEFAULT_PRICING, messages = [] }) {
  const normalizedUsage = normalizeUsage(usage);
  if (!normalizedUsage.prompt_tokens && messages.length) normalizedUsage.prompt_tokens = estimatePromptTokens(messages);
  normalizedUsage.image_units += countImages(messages);
  const p = normalizePricing(pricing);
  const total =
    normalizedUsage.prompt_tokens * toNumber(p.prompt) +
    normalizedUsage.completion_tokens * toNumber(p.completion) +
    normalizedUsage.reasoning_tokens * toNumber(p.internal_reasoning) +
    normalizedUsage.cache_read_tokens * toNumber(p.input_cache_read) +
    normalizedUsage.cache_write_tokens * toNumber(p.input_cache_write) +
    normalizedUsage.image_units * toNumber(p.image) +
    normalizedUsage.web_search_units * toNumber(p.web_search) +
    toNumber(p.request);
  return {
    cost_usd: Math.max(0, total).toFixed(12).replace(/0+$/, '').replace(/\.$/, '') || '0',
    usage: normalizedUsage,
    pricing: p
  };
}

const DEDUCT_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or ARGV[1] or '0')
local cost = tonumber(ARGV[2])
if current <= 0 then
  return {0, tostring(current)}
end
if current < cost then
  return {0, tostring(current)}
end
local next_balance = current - cost
redis.call('SET', KEYS[1], tostring(next_balance))
return {1, tostring(next_balance)}
`;

function getWorkspaceBalance(db, workspaceId) {
  const row = db.prepare('SELECT balance_usd FROM workspaces WHERE id = ?').get(workspaceId);
  return toNumber(row?.balance_usd, 0);
}

function persistWorkspaceBalance(db, workspaceId, balance) {
  db.prepare('UPDATE workspaces SET balance_usd = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(String(balance), workspaceId);
}

function createBillingEngine({ db }) {
  let usageQueuePromise = null;
  const logBuffer = [];
  let flushTimeout = null;

  const insertUsageStmt = db.prepare(`
    INSERT INTO usage_events (
      id, workspace_id, api_key_id, user_id, endpoint, model_id, provider, latency_ms,
      prompt_tokens, completion_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens,
      image_units, cost_usd, status, request_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const flushUsageBuffer = db.transaction((events) => {
    for (const payload of events) {
      insertUsageStmt.run(
        payload.id,
        payload.workspace_id || null,
        payload.api_key_id || null,
        payload.user_id || null,
        payload.endpoint || 'unknown',
        payload.model_id || null,
        payload.provider || null,
        Math.trunc(toNumber(payload.latency_ms)),
        Math.trunc(toNumber(payload.prompt_tokens)),
        Math.trunc(toNumber(payload.completion_tokens)),
        Math.trunc(toNumber(payload.reasoning_tokens)),
        Math.trunc(toNumber(payload.cache_read_tokens)),
        Math.trunc(toNumber(payload.cache_write_tokens)),
        Math.trunc(toNumber(payload.image_units)),
        String(payload.cost_usd || '0'),
        payload.status || 'ok',
        payload.request_id || null
      );
    }
  });

  function triggerFlush() {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    if (logBuffer.length === 0) return;
    const batch = [...logBuffer];
    logBuffer.length = 0;
    try {
      flushUsageBuffer(batch);
    } catch (err) {
      console.warn('[BILLING_BATCH_FLUSH]', err.message);
    }
  }

  function queueUsageEventBatch(payload) {
    logBuffer.push(payload);
    if (logBuffer.length >= 50) {
      triggerFlush();
    } else if (!flushTimeout) {
      flushTimeout = setTimeout(triggerFlush, 2000);
    }
  }

  try {
    process.on('exit', () => {
      try { triggerFlush(); } catch(_) {}
    });
  } catch(_) {}

  async function getUsageQueue() {
    if (!process.env.REDIS_URL || !process.env.BILLING_QUEUE_ENABLED) return null;
    if (usageQueuePromise) return usageQueuePromise;
    const bullmq = optionalRequire('bullmq');
    if (!bullmq?.Queue) return null;
    usageQueuePromise = (async () => {
      const connection = redisConnectionOptions(process.env.REDIS_URL);
      return new bullmq.Queue(process.env.BILLING_QUEUE_NAME || 'froxy-usage-events', { connection });
    })().catch((err) => {
      console.warn('[BILLING_QUEUE] disabled:', err.message);
      usageQueuePromise = null;
      return null;
    });
    return usageQueuePromise;
  }

  async function ensureRedisBalance(workspaceId, key) {
    const redis = await getRedisClient();
    if (!redis) return null;
    const exists = await redis.exists(key);
    if (!exists) {
      await redis.set(key, String(getWorkspaceBalance(db, workspaceId)));
    }
    return redis;
  }

  async function assertPositiveBalance(auth) {
    const workspaceId = auth.workspaceId;
    const key = auth.balanceKey || `balance:workspace:${workspaceId}`;
    const redis = await ensureRedisBalance(workspaceId, key);
    const balance = redis ? toNumber(await redis.get(key), 0) : getWorkspaceBalance(db, workspaceId);
    if (balance <= 0) {
      const err = new Error('Insufficient balance');
      err.status = 402;
      err.balance = balance;
      throw err;
    }
    return balance;
  }

  async function deductBalance(auth, costUsd) {
    const cost = toNumber(costUsd, 0);
    if (cost <= 0) return { ok: true, balance: null, cost_usd: '0' };
    const workspaceId = auth.workspaceId;
    const key = auth.balanceKey || `balance:workspace:${workspaceId}`;
    const redis = await ensureRedisBalance(workspaceId, key);

    if (redis) {
      const initialBalance = String(getWorkspaceBalance(db, workspaceId));
      const result = await redis.eval(DEDUCT_LUA, { keys: [key], arguments: [initialBalance, String(cost)] });
      const ok = Array.isArray(result) ? Number(result[0]) === 1 : false;
      const balance = Array.isArray(result) ? toNumber(result[1], 0) : 0;
      if (ok) setImmediate(() => { try { persistWorkspaceBalance(db, workspaceId, balance); } catch (_) {} });
      return { ok, balance, cost_usd: String(cost) };
    }

    const tx = db.transaction(() => {
      const current = getWorkspaceBalance(db, workspaceId);
      if (current <= 0 || current < cost) return { ok: false, balance: current, cost_usd: String(cost) };
      const next = Math.max(0, current - cost);
      persistWorkspaceBalance(db, workspaceId, next.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') || '0');
      return { ok: true, balance: next, cost_usd: String(cost) };
    });
    return tx();
  }

  async function enqueueUsageEvent(event) {
    const payload = { id: createId('usage'), ...event };
    const queue = await getUsageQueue();
    if (queue) {
      await queue.add('usage-event', payload, { removeOnComplete: 10000, removeOnFail: 1000 });
      return payload;
    }
    queueUsageEventBatch(payload);
    return payload;
  }

  return {
    assertPositiveBalance,
    calculateRequestCost,
    deductBalance,
    enqueueUsageEvent
  };
}

module.exports = {
  calculateRequestCost,
  countImages,
  createBillingEngine,
  estimatePromptTokens,
  estimateTokensFromText,
  normalizeUsage
};
