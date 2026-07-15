const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(`PAGE: ${err.message}`));
  
  await page.goto('https://froxyai.com/?v=v172', { waitUntil: 'networkidle', timeout: 60000 });
  
  // Test 1: Şerit hover'da durmuyor
  await page.evaluate(() => {
    if (typeof go === 'function') go('chat');
    if (typeof panelTab === 'function') panelTab('store');
  });
  await page.waitForTimeout(2000);
  
  const ribbonHoverPause = await page.evaluate(() => {
    const ribbon = document.querySelector('.store-ribbon');
    if (!ribbon) return null;
    // Get pre-hover state
    const beforeHover = getComputedStyle(ribbon).animationPlayState;
    // Simulate hover by adding mouseover-like event
    const ribbons = document.querySelector('.store-ribbons');
    ribbons.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
    // Try CSS hover state
    const afterHoverPointerEvents = getComputedStyle(ribbon).pointerEvents;
    return {
      animationPlayState: beforeHover,
      pointerEvents: afterHoverPointerEvents,
      ribbonChildCount: ribbon.children.length
    };
  });
  console.log('1. Şerit pointer-events:', JSON.stringify(ribbonHoverPause));
  
  // Test 2: Loader inject and check styles
  const loaderTest = await page.evaluate(() => {
    let wrap = document.getElementById('img-result');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'img-result';
      wrap.style.cssText = 'position:fixed;top:0;left:0;width:600px;z-index:9999';
      document.body.appendChild(wrap);
    }
    
    if (typeof imageLoadingHtml !== 'function') return { ok: false };
    
    wrap.innerHTML = `<div class="img-compare-shell">
      <article class="image-result-card img-compare-card">
        ${imageLoadingHtml('a beautiful sunset over mountains', 'Flux AI')}
      </article>
      <article class="image-result-card img-compare-card">
        ${imageLoadingHtml('cyberpunk city night', 'Cloudflare SDXL')}
      </article>
    </div>`;
    
    const loader = wrap.querySelector('.image-live-loader');
    const ring = wrap.querySelector('.image-live-minimal-ring');
    const core = wrap.querySelector('.image-live-minimal-core');
    const progress = wrap.querySelector('.image-live-minimal-progress i');
    const topBadge = wrap.querySelector('.image-live-minimal-top span');
    
    const cs = (el) => el ? getComputedStyle(el) : null;
    const lcs = cs(loader);
    const rcs = cs(ring);
    const ccs = cs(core);
    const pcs = cs(progress);
    const tcs = cs(topBadge);
    
    return {
      ok: true,
      loader: { display: lcs.display, gridCols: lcs.gridTemplateColumns, padding: lcs.padding, borderRadius: lcs.borderRadius },
      ring: { width: rcs.width, animation: rcs.animationName, duration: rcs.animationDuration },
      core: { background: ccs.backgroundImage.substring(0, 60), animation: ccs.animationName },
      progress: { animation: pcs.animationName, duration: pcs.animationDuration },
      topBadge: { text: topBadge?.textContent.trim(), background: tcs.backgroundImage.substring(0, 50) }
    };
  });
  console.log('2. Loader styles:', JSON.stringify(loaderTest, null, 2));
  
  // Take screenshot of loader for visual review
  await page.screenshot({ path: 'tests/loader-v172.png', fullPage: false, clip: { x: 0, y: 0, width: 600, height: 400 } });
  console.log('3. Screenshot: tests/loader-v172.png');
  
  console.log('\nErrors:', errors.length === 0 ? 'YOK' : errors.join('\n  '));
  
  await browser.close();
})();
