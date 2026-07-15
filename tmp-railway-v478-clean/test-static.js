(async () => {
  try {
    const res = await fetch('https://froxyai-production.up.railway.app/generated/cf_1779058791457.png', {
      signal: AbortSignal.timeout(15000)
    });
    console.log('STATUS:', res.status);
    console.log('CT:', res.headers.get('content-type'));
    console.log('Size:', res.headers.get('content-length'));
  } catch (err) {
    console.error('ERROR:', err.message);
  }
})();
