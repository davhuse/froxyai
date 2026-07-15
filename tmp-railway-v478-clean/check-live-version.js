(async()=>{
  const r = await fetch('https://froxyai.com/index.html', {cache:'no-store'});
  const t = await r.text();
  const cssV = t.match(/style\.min\.css\?v=([^"&]+)/);
  const jsV = t.match(/app\.min\.js\?v=([^"&]+)/);
  console.log('Live CSS:', cssV?cssV[1]:'?');
  console.log('Live JS:', jsV?jsV[1]:'?');
  console.log('File size:', t.length, 'chars');
  // Check if sup-pro-hero exists
  console.log('sup-pro-hero:', t.includes('sup-pro-hero'));
  console.log('auth-hero-logo-rail:', t.includes('auth-hero-logo-rail'));
})();
