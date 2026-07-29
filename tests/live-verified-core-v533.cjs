#!/usr/bin/env node

const backend = 'https://www.froxyai.com';
const frontend = 'https://froxy-web-production.up.railway.app';
const skipImageGeneration = process.env.SKIP_IMAGE_GENERATION === '1';

async function request(url, init = {}, timeout = 180000) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());
    let data = null;
    if (contentType.includes('json')) {
      try { data = JSON.parse(buffer.toString('utf8')); } catch (_) {}
    }
    return { ok: response.ok, status: response.status, contentType, bytes: buffer.length, data, text: buffer.toString('utf8'), ms: Date.now() - started };
  } catch (error) {
    return { ok: false, status: 0, error: error.message, bytes: 0, ms: Date.now() - started };
  }
}

const post = (url, body, timeout) => request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify(body)
}, timeout);

(async () => {
  const checks = [];
  const catalog = await request(`${backend}/api/model-catalog`);
  const chatModels = catalog.data?.models || [];
  const verifiedChatModels = chatModels.filter(item => item.verified === true);
  checks.push({
    name: 'backend-chat-catalog',
    ok: catalog.ok
      && catalog.data?.source === 'configured-provider-catalog'
      && chatModels.length >= 1000
      && verifiedChatModels.length >= 8,
    status: catalog.status,
    count: chatModels.length,
    verifiedCount: verifiedChatModels.length,
    sampleIds: chatModels.slice(0, 20).map(item => `${item.provider}:${item.id}`)
  });

  const imageCatalog = await request(`${backend}/api/image-models`);
  const imageModels = imageCatalog.data?.models || [];
  const verifiedImageModels = imageModels.filter(item => item.verified === true);
  checks.push({
    name: 'backend-image-catalog',
    ok: imageCatalog.ok
      && imageCatalog.data?.source === 'configured-provider-catalog'
      && imageModels.length >= 30
      && verifiedImageModels.length >= 3,
    status: imageCatalog.status,
    count: imageModels.length,
    verifiedCount: verifiedImageModels.length,
    sampleIds: imageModels.slice(0, 20).map(item => `${item.provider}:${item.id}`)
  });

  const betaVideo = await post(`${backend}/api/video`, { model: 'wavespeed-wan', prompt: 'blue circle' });
  checks.push({
    name: 'video-beta-gate',
    ok: betaVideo.status === 503 && betaVideo.data?.code === 'video_beta_unavailable' && betaVideo.data?.beta === true,
    status: betaVideo.status,
    code: betaVideo.data?.code || ''
  });

  for (const item of verifiedChatModels) {
    const result = await post(`${backend}/api/chat`, {
      model: item.id,
      provider: item.provider,
      messages: [{ role: 'user', content: 'Sadece OK yaz.' }],
      max_tokens: 16
    }, 60000);
    const content = String(result.data?.choices?.[0]?.message?.content || '').trim();
    checks.push({
      name: `chat:${item.provider}:${item.id}`,
      ok: result.ok && Boolean(content) && !result.data?.fallback && !result.data?.fallbackFrom,
      status: result.status,
      responseModel: result.data?.model || '',
      responseProvider: result.data?.provider || '',
      sample: content.slice(0, 40),
      error: result.data?.error?.message || result.data?.error || result.error || ''
    });
  }

  if (!skipImageGeneration) {
    for (const item of verifiedImageModels) {
      const result = await post(`${backend}/api/image`, {
        model: item.id,
        prompt: 'A single blue circle centered on a clean white background.',
        aspectRatio: '1:1',
        rawPrompt: true,
        promptEnhance: false,
        qualityMode: 'cheap'
      }, 360000);
      const rawUrl = String(result.data?.url || '');
      const absoluteUrl = rawUrl ? new URL(rawUrl, backend).toString() : '';
      const media = absoluteUrl ? await request(absoluteUrl, { headers: { accept: 'image/*' } }, 90000) : null;
      checks.push({
        name: `image:${item.provider}:${item.id}`,
        ok: result.ok && Boolean(rawUrl) && Boolean(media?.ok) && /^image\//i.test(media?.contentType || '') && Number(media?.bytes || 0) > 1000,
        status: result.status,
        actualProvider: result.data?.provider || '',
        actualModel: result.data?.model || '',
        mediaStatus: media?.status || 0,
        mediaType: media?.contentType || '',
        mediaBytes: media?.bytes || 0,
        error: result.data?.error || result.error || ''
      });
    }
  }

  for (const path of ['/', '/sohbet', '/gorsel-studyo', '/video-studyo']) {
    const page = await request(`${frontend}${path}`);
    checks.push({ name: `frontend-page:${path}`, ok: page.ok && page.contentType.includes('text/html'), status: page.status, bytes: page.bytes });
  }

  const frontendCatalog = await request(`${frontend}/api/froxy/model-catalog`);
  checks.push({
    name: 'frontend-bff-chat-catalog',
    ok: frontendCatalog.ok && frontendCatalog.data?.models?.length >= 1000,
    status: frontendCatalog.status,
    count: frontendCatalog.data?.models?.length || 0
  });
  const frontendImages = await request(`${frontend}/api/froxy/image-models`);
  checks.push({
    name: 'frontend-bff-image-catalog',
    ok: frontendImages.ok && frontendImages.data?.models?.length >= 30,
    status: frontendImages.status,
    count: frontendImages.data?.models?.length || 0
  });
  const retiredDemo = await post(`${frontend}/api/chat`, { model: 'fake', messages: [] });
  checks.push({
    name: 'retired-demo-chat',
    ok: retiredDemo.status === 410,
    status: retiredDemo.status
  });

  const failed = checks.filter(item => !item.ok);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    ok: failed.length === 0,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks
  }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
