const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  
  await page.goto('https://froxyai.com/?v=v170', { waitUntil: 'networkidle', timeout: 60000 });
  
  // 1. Check escAttr exists
  const hasEscAttr = await page.evaluate(() => {
    try { return typeof escAttr === 'function'; } catch(e) { return false; }
  });
  console.log('1. escAttr defined:', hasEscAttr);
  
  // 2. Check imageLoadingHtml exists
  const hasLoader = await page.evaluate(() => {
    try { return typeof imageLoadingHtml === 'function'; } catch(e) { return false; }
  });
  console.log('2. imageLoadingHtml defined:', hasLoader);
  
  // 3. Check store-coupon-mini class exists in CSS  
  const couponMiniRendered = await page.evaluate(() => {
    // Check if CSS class is defined
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.selectorText && rule.selectorText.includes('store-coupon-mini')) return true;
        }
      } catch(e) {}
    }
    return false;
  });
  console.log('3. store-coupon-mini CSS exists:', couponMiniRendered);
  
  // 4. Check code-editor-modern class
  const codeEditorClass = await page.evaluate(() => {
    return document.querySelector('.code-editor-modern') !== null;
  });
  console.log('4. code-editor-modern element exists:', codeEditorClass);
  
  // 5. Check sp4-ops-board removed (should NOT exist anymore)
  const sp4OpsBoard = await page.evaluate(() => {
    return document.querySelector('.sp4-ops-board') !== null;
  });
  console.log('5. sp4-ops-board removed (should be false):', sp4OpsBoard);
  
  // 6. Check sp4-live-rail removed
  const sp4LiveRail = await page.evaluate(() => {
    return document.querySelector('.sp4-live-rail') !== null;
  });
  console.log('6. sp4-live-rail removed (should be false):', sp4LiveRail);
  
  // 7. Check imageLoadingHtml output
  const loaderHtml = await page.evaluate(() => {
    if (typeof imageLoadingHtml !== 'function') return null;
    return imageLoadingHtml('test prompt', 'Flux AI').substring(0, 200);
  });
  console.log('7. Loader HTML preview:', loaderHtml);
  
  console.log('\nErrors:');
  if (errors.length === 0) console.log('  YOK - temiz!');
  else errors.forEach(e => console.log('  ❌ ' + e));
  
  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
})();
