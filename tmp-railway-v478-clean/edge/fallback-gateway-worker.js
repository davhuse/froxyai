// Cloudflare Workers / Vercel Edge-compatible fallback router.
// It intentionally uses only Fetch API primitives, no Node.js modules.

const RETRYABLE = new Set([500, 502, 503, 504]);

function stripPrefix(model) {
  const value = String(model || '');
  const slash = value.indexOf('/');
  return slash > 0 ? value.slice(slash + 1) : value;
}

function providerFor(model) {
  const id = String(model || '').toLowerCase();
  if (id.startsWith('openai/')) return 'openai';
  if (id.startsWith('anthropic/')) return 'anthropic';
  if (id.startsWith('google/')) return 'google';
  if (id.startsWith('groq/')) return 'groq';
  return id.includes('/') ? 'openrouter' : 'openai';
}

function toGeminiContents(messages = []) {
  const contents = [];
  const systemParts = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push({ text: String(message.content || '') });
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content || '') }]
    });
  }
  const body = { contents };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  return body;
}

function buildRequest(candidate, body, env) {
  const provider = providerFor(candidate);
  const model = stripPrefix(candidate);
  if (provider === 'google') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GOOGLE_API_KEY },
        body: JSON.stringify(toGeminiContents(body.messages || []))
      },
      provider
    };
  }
  const bases = {
    openai: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    anthropic: env.ANTHROPIC_OPENAI_COMPAT_BASE_URL || env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    groq: 'https://api.groq.com/openai/v1'
  };
  const keys = {
    openai: env.OPENAI_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    groq: env.GROQ_API_KEY
  };
  const payload = { ...body, model: provider === 'openrouter' ? candidate : model };
  delete payload.models;
  return {
    url: `${bases[provider]}/chat/completions`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${keys[provider] || ''}` },
      body: JSON.stringify(payload)
    },
    provider
  };
}

export async function handleFallbackGateway(request, env) {
  const body = await request.json();
  const models = Array.isArray(body.models) && body.models.length ? body.models : [body.model || 'openai/gpt-5.5'];
  const attempts = [];
  for (const model of models) {
    const built = buildRequest(model, body, env);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const upstream = await fetch(built.url, { ...built.init, signal: controller.signal });
      clearTimeout(timeout);
      attempts.push({ model, provider: built.provider, status: upstream.status });
      if (RETRYABLE.has(upstream.status)) continue;
      if (!upstream.ok) continue;
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'application/json',
          'x-froxy-fallback-model': model,
          'x-froxy-fallback-provider': built.provider
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      attempts.push({ model, provider: built.provider, error: err.name === 'AbortError' ? 'timeout' : err.message });
    }
  }
  return Response.json({
    error: {
      message: 'All fallback models failed',
      type: 'server_error',
      attempts
    }
  }, { status: 503 });
}

export default {
  fetch: handleFallbackGateway
};
