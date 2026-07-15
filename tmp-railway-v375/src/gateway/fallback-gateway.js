const { estimateTokensFromText } = require('./billing');

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 10000;

const PROVIDER_REGIONS = {
  openai: ['US', 'EU'],
  openrouter: ['US', 'EU'],
  anthropic: ['US'],
  claude: ['US'],
  google: ['US', 'EU'],
  google_direct: ['US', 'EU'],
  gemini_direct: ['US', 'EU'],
  groq: ['US'],
  mistral: ['EU'],
  together: ['US'],
  xai: ['US']
};

function stripProviderPrefix(modelId) {
  const raw = String(modelId || '').trim();
  const idx = raw.indexOf('/');
  return idx > 0 ? raw.slice(idx + 1) : raw;
}

function modelProvider(modelId, inferProviderFromModel) {
  const id = String(modelId || '').toLowerCase();
  if (id.startsWith('openai/')) return 'openai';
  if (id.startsWith('anthropic/')) return 'anthropic';
  if (id.startsWith('google/')) return 'google_direct';
  if (id.startsWith('groq/')) return 'groq';
  if (id.startsWith('mistral/')) return 'mistral';
  if (id.includes('/')) return 'openrouter';
  return inferProviderFromModel ? inferProviderFromModel(modelId) : 'openai';
}

function toGeminiParts(content) {
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (!item) continue;
      if (typeof item === 'string') parts.push({ text: item });
      else if (item.type === 'text' && item.text) parts.push({ text: item.text });
      else if (item.type === 'image_url' && item.image_url?.url) {
        const match = /^data:([^;]+);base64,(.+)$/i.exec(item.image_url.url);
        if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        else parts.push({ text: `[image_url: ${item.image_url.url}]` });
      } else if (item.text) parts.push({ text: String(item.text) });
    }
    return parts.length ? parts : [{ text: '' }];
  }
  if (typeof content === 'string') return [{ text: content }];
  return [{ text: String(content || '') }];
}

function toGeminiContents(messages = []) {
  const contents = [];
  const systemParts = [];
  for (const message of messages) {
    if (!message) continue;
    if (message.role === 'system') {
      systemParts.push(...toGeminiParts(message.content));
      continue;
    }
    contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts: toGeminiParts(message.content) });
  }
  const body = { contents };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  return body;
}

function splitAnthropicMessages(messages = []) {
  const system = [];
  const out = [];
  for (const message of messages) {
    if (!message) continue;
    if (message.role === 'system') {
      if (typeof message.content === 'string') system.push(message.content);
      continue;
    }
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const content = Array.isArray(message.content)
      ? message.content.map((part) => {
          if (part.type === 'text') return { type: 'text', text: part.text || '' };
          if (part.type === 'image_url' && part.image_url?.url) {
            const match = /^data:([^;]+);base64,(.+)$/i.exec(part.image_url.url);
            if (match) return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
          }
          return { type: 'text', text: part.text || '' };
        })
      : String(message.content || '');
    out.push({ role, content });
  }
  return { system: system.join('\n\n'), messages: out };
}

function openAiError(message, type = 'server_error') {
  return { error: { message, type } };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

class CircuitBreaker {
  constructor({ failureThreshold = 3, cooldownMs = 30000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.state = new Map();
  }

  canTry(key) {
    const record = this.state.get(key);
    return !record || !record.openUntil || record.openUntil <= Date.now();
  }

  success(key) {
    this.state.delete(key);
  }

  failure(key) {
    const record = this.state.get(key) || { failures: 0, openUntil: 0 };
    record.failures += 1;
    if (record.failures >= this.failureThreshold) {
      record.openUntil = Date.now() + this.cooldownMs;
    }
    this.state.set(key, record);
  }
}

class FallbackGateway {
  constructor({ providers = {}, inferProviderFromModel } = {}) {
    this.providers = providers;
    this.inferProviderFromModel = inferProviderFromModel;
    this.breaker = new CircuitBreaker();
  }

  buildCandidates(body, dataRegion) {
    const requested = Array.isArray(body.models) && body.models.length ? body.models : [body.model || 'openai/gpt-5.5'];
    const candidates = requested.map((modelId) => {
      const providerName = modelProvider(modelId, this.inferProviderFromModel);
      return { modelId: String(modelId), providerName };
    });
    if (!dataRegion) return candidates;
    const region = String(dataRegion).toUpperCase();
    return candidates.filter((candidate) => {
      const regions = PROVIDER_REGIONS[candidate.providerName] || ['US'];
      return regions.includes(region);
    });
  }

  providerConfig(providerName) {
    if (providerName === 'anthropic') {
      return {
        key: process.env.ANTHROPIC_API_KEY || this.providers.claude?.key,
        base: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'
      };
    }
    if (providerName === 'google') return this.providers.google_direct || this.providers.gemini_direct;
    return this.providers[providerName] || this.providers.openai;
  }

  buildRequest(candidate, body, stream = false) {
    const provider = this.providerConfig(candidate.providerName);
    if (!provider) throw new Error(`Provider not configured: ${candidate.providerName}`);
    const model = stripProviderPrefix(candidate.modelId);
    const base = String(provider.base || '').replace(/\/+$/, '');
    const key = provider.key;

    if (candidate.providerName === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      const split = splitAnthropicMessages(body.messages || []);
      const payload = {
        model,
        messages: split.messages,
        max_tokens: body.max_tokens || body.max_completion_tokens || 1024,
        stream
      };
      if (split.system) payload.system = split.system;
      return {
        url: `${base}/messages`,
        options: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01'
          },
          body: JSON.stringify(payload)
        },
        responseKind: 'anthropic'
      };
    }

    if (candidate.providerName === 'google_direct' || candidate.providerName === 'google') {
      const geminiBody = toGeminiContents(body.messages || []);
      if (body.max_tokens || body.max_completion_tokens) geminiBody.generationConfig = { maxOutputTokens: body.max_tokens || body.max_completion_tokens };
      return {
        url: `${base.replace(/\/openai$/i, '')}/models/${model}:generateContent`,
        options: {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(geminiBody)
        },
        responseKind: 'gemini'
      };
    }

    const payload = {
      ...body,
      model: candidate.providerName === 'openrouter' ? candidate.modelId : model,
      stream
    };
    delete payload.models;
    return {
      url: `${base}/chat/completions`,
      options: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': stream ? 'text/event-stream' : 'application/json',
          ...(key && key !== 'none' ? { authorization: `Bearer ${key}` } : {})
        },
        body: JSON.stringify(payload)
      },
      responseKind: 'openai'
    };
  }

  normalizeResponse(kind, json, candidate, latencyMs, attempts) {
    if (kind === 'anthropic') {
      const text = (json.content || []).map((item) => item.text || '').join('');
      return {
        id: json.id || `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: candidate.modelId,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: json.stop_reason || 'stop' }],
        usage: {
          prompt_tokens: json.usage?.input_tokens || 0,
          completion_tokens: json.usage?.output_tokens || estimateTokensFromText(text),
          total_tokens: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || estimateTokensFromText(text))
        },
        provider: candidate.providerName,
        latency_ms: latencyMs,
        attempts
      };
    }
    if (kind === 'gemini') {
      const parts = json.candidates?.[0]?.content?.parts || [];
      const text = parts.map((part) => part.text || '').join('');
      const promptTokens = json.usageMetadata?.promptTokenCount || 0;
      const completionTokens = json.usageMetadata?.candidatesTokenCount || estimateTokensFromText(text);
      return {
        id: `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: candidate.modelId,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
        provider: candidate.providerName,
        latency_ms: latencyMs,
        attempts
      };
    }
    return { ...json, model: json.model || candidate.modelId, provider: candidate.providerName, latency_ms: latencyMs, attempts };
  }

  async forwardChat(body, { dataRegion } = {}) {
    const startedAt = Date.now();
    const candidates = this.buildCandidates(body, dataRegion);
    if (!candidates.length) {
      const err = new Error('No provider matches requested data_region');
      err.status = 400;
      throw err;
    }
    const attempts = [];
    for (const candidate of candidates) {
      const breakerKey = `${candidate.providerName}:${candidate.modelId}`;
      if (!this.breaker.canTry(breakerKey)) {
        attempts.push({ model: candidate.modelId, provider: candidate.providerName, skipped: 'circuit_open' });
        continue;
      }
      try {
        const req = this.buildRequest(candidate, body, false);
        const attemptStarted = Date.now();
        const response = await fetchWithTimeout(req.url, req.options, DEFAULT_TIMEOUT_MS);
        const text = await response.text();
        const latency = Date.now() - attemptStarted;
        attempts.push({ model: candidate.modelId, provider: candidate.providerName, status: response.status, latency_ms: latency });
        if (RETRYABLE_STATUSES.has(response.status)) {
          this.breaker.failure(breakerKey);
          continue;
        }
        let json;
        try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { error: { message: text || 'Invalid upstream response' } }; }
        if (!response.ok || json.error) {
          if (response.status >= 500 || response.status === 429) {
            this.breaker.failure(breakerKey);
            continue;
          }
          const err = new Error(json.error?.message || `Provider error (${response.status})`);
          err.status = response.status;
          err.providerError = json;
          throw err;
        }
        this.breaker.success(breakerKey);
        return this.normalizeResponse(req.responseKind, json, candidate, Date.now() - startedAt, attempts);
      } catch (err) {
        attempts.push({ model: candidate.modelId, provider: candidate.providerName, error: err.name === 'AbortError' ? 'timeout' : err.message });
        this.breaker.failure(breakerKey);
      }
    }
    const error = new Error('All fallback models failed');
    error.status = 503;
    error.openAi = openAiError('All fallback models failed', 'server_error');
    error.attempts = attempts;
    throw error;
  }

  async streamChat(body, res, { dataRegion, onComplete } = {}) {
    const startedAt = Date.now();
    const candidates = this.buildCandidates(body, dataRegion);
    const attempts = [];
    for (const candidate of candidates) {
      const breakerKey = `${candidate.providerName}:${candidate.modelId}`;
      if (!this.breaker.canTry(breakerKey)) continue;
      try {
        const req = this.buildRequest(candidate, body, true);
        if (req.responseKind !== 'openai') {
          const nonStream = await this.forwardChat({ ...body, model: candidate.modelId, stream: false }, { dataRegion });
          res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
          const chunk = { choices: [{ delta: { content: nonStream.choices?.[0]?.message?.content || '' }, index: 0, finish_reason: null }], model: candidate.modelId };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          if (onComplete) await onComplete({ response: nonStream, text: nonStream.choices?.[0]?.message?.content || '', model: candidate.modelId, provider: candidate.providerName, latency_ms: Date.now() - startedAt });
          return;
        }
        const response = await fetchWithTimeout(req.url, req.options, DEFAULT_TIMEOUT_MS);
        attempts.push({ model: candidate.modelId, provider: candidate.providerName, status: response.status });
        if (RETRYABLE_STATUSES.has(response.status) || !response.ok) {
          this.breaker.failure(breakerKey);
          continue;
        }
        this.breaker.success(breakerKey);
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
        let fullText = '';
        let usage = null;
        const decoder = new TextDecoder();
        for await (const rawChunk of response.body) {
          const text = typeof rawChunk === 'string' ? rawChunk : decoder.decode(rawChunk, { stream: true });
          res.write(text);
          for (const line of text.split(/\r?\n/)) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || '';
              fullText += delta;
              if (json.usage) usage = json.usage;
            } catch (_) {}
          }
        }
        res.end();
        if (onComplete) await onComplete({ response: { usage: usage || { completion_tokens: estimateTokensFromText(fullText) } }, text: fullText, model: candidate.modelId, provider: candidate.providerName, latency_ms: Date.now() - startedAt });
        return;
      } catch (err) {
        attempts.push({ model: candidate.modelId, provider: candidate.providerName, error: err.name === 'AbortError' ? 'timeout' : err.message });
        this.breaker.failure(`${candidate.providerName}:${candidate.modelId}`);
      }
    }
    res.status(503).json(openAiError('All fallback models failed', 'server_error'));
  }
}

module.exports = {
  FallbackGateway,
  PROVIDER_REGIONS,
  RETRYABLE_STATUSES,
  modelProvider,
  stripProviderPrefix,
  toGeminiContents
};
