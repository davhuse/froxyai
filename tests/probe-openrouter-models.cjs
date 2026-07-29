#!/usr/bin/env node

const keys = String(process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

if (!keys.length) {
  console.error('OpenRouter key is not configured.');
  process.exit(2);
}

async function json(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(60_000)
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

(async () => {
  const { response: catalogResponse, body: catalog } = await json('https://openrouter.ai/api/v1/models');
  if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`);

  const models = (catalog.data || [])
    .filter(model => model?.id?.endsWith(':free'))
    .filter(model => !/content-safety|vision|image|embed|audio|moderation|\bvl\b/i.test(`${model.id} ${model.name || ''}`))
    .map(model => ({ id: model.id, name: model.name || model.id }));

  const results = [];
  for (const [index, model] of models.entries()) {
    const key = keys[index % keys.length];
    const { response, body } = await json('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://froxyai.com',
        'X-Title': 'Froxy AI provider verification'
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 24,
        stream: false
      })
    });
    const content = String(body?.choices?.[0]?.message?.content || '').trim();
    results.push({
      id: model.id,
      name: model.name,
      ok: response.ok && Boolean(content),
      status: response.status,
      sample: content.slice(0, 80),
      error: body?.error?.message || ''
    });
  }

  console.log(JSON.stringify({
    testedAt: new Date().toISOString(),
    keyCount: keys.length,
    passed: results.filter(result => result.ok).length,
    failed: results.filter(result => !result.ok).length,
    results
  }, null, 2));
  process.exitCode = results.some(result => !result.ok) ? 1 : 0;
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(2);
});
