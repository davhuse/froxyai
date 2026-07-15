const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  
  await page.goto('https://froxyai.com/?v=v171', { waitUntil: 'networkidle', timeout: 60000 });
  
  // Setup auth
  await page.evaluate(() => {
    localStorage.setItem('saas_token', 'test-token');
    localStorage.setItem('saas_user', JSON.stringify({id: 999, username: 'test', email: 'test@test.com', credits: 50000, plan: 'pro', is_admin: true}));
  });
  await page.reload({ waitUntil: 'networkidle' });
  
  // Navigate to store
  const storeOk = await page.evaluate(() => {
    if (typeof panelTab === 'function') { panelTab('store'); return true; }
    if (typeof go === 'function') { go('chat'); return true; }
    return false;
  });
  console.log('1. panelTab navigation:', storeOk);
  
  await page.waitForTimeout(2000);
  
  // Check store-ribbon animation
  const ribbonStatus = await page.evaluate(() => {
    const ribbon = document.querySelector('.store-ribbon');
    if (!ribbon) return { found: false };
    const cs = getComputedStyle(ribbon);
    return {
      found: true,
      animation: cs.animation,
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      animationPlayState: cs.animationPlayState,
      hasItems: ribbon.children.length
    };
  });
  console.log('2. Store ribbon animation:', JSON.stringify(ribbonStatus, null, 2));
  
  // Check pricing buttons (landing page - not in panel)
  await page.goto('https://froxyai.com/?v=v171#pricing', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Test imageLoadingHtml renders compact in #img-result context
  const loaderCompactCheck = await page.evaluate(() => {
    // Inject test
    const wrap = document.createElement('div');
    wrap.id = 'img-result';
    wrap.style.cssText = 'position:fixed;top:9999px;left:0;width:600px';
    document.body.appendChild(wrap);
    
    if (typeof imageLoadingHtml !== 'function') return { ok: false, reason: 'no imageLoadingHtml' };
    
    wrap.innerHTML = `<div class="img-compare-shell">
      <article class="image-result-card img-compare-card">
        ${imageLoadingHtml('test prompt cat in space', 'Flux AI')}
      </article>
    </article></div>`;
    
    const loader = wrap.querySelector('.image-live-loader');
    if (!loader) return { ok: false, reason: 'no loader' };
    
    const cs = getComputedStyle(loader);
    return {
      ok: true,
      display: cs.display,
      padding: cs.padding,
      borderRadius: cs.borderRadius,
      flexDirection: cs.flexDirection
    };
  });
  console.log('3. Loader compact CSS in #img-result:', JSON.stringify(loaderCompactCheck, null, 2));
  
  console.log('\nErrors:', errors.length === 0 ? 'YOK' : errors.join('\n'));
  
  await browser.close();
})();
