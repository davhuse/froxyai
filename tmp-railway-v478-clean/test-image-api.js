// Test Railway image endpoint
const url = 'https://froxyai-production.up.railway.app/api/image';
const body = JSON.stringify({ prompt: 'test cat', model: 'flux' });

(async () => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body,
      signal: AbortSignal.timeout(60000)
    });
    const text = await res.text();
    console.log('STATUS:', res.status);
    console.log('CT:', res.headers.get('content-type'));
    console.log('BODY (first 500 chars):', text.substring(0, 500));
  } catch (err) {
    console.error('ERROR:', err.message);
  }
})();
