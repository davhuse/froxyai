const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  const errors = [];
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  
  console.log('1. Site yukleniyor...');
  await page.goto('https://froxyai.com/?v=v169', { waitUntil: 'networkidle', timeout: 60000 });
  
  console.log('2. compareImageModels fonksiyonu var mi?');
  const hasCompare = await page.evaluate(() => typeof window.compareImageModels === 'function');
  console.log('   compareImageModels:', hasCompare);
  
  const hasBatch = await page.evaluate(() => typeof window.showBatchPanel === 'function');
  console.log('   showBatchPanel:', hasBatch);
  
  const hasEscAttr = await page.evaluate(() => typeof window.escAttr === 'function' || (typeof escAttr !== 'undefined' && typeof escAttr === 'function'));
  console.log('   escAttr defined:', hasEscAttr);
  
  // Check escAttr definition globally
  const escAttrCheck = await page.evaluate(() => {
    try {
      // Try to call escAttr
      const result = (function(){
        try { return typeof escAttr; } catch(e) { return 'undefined: ' + e.message; }
      })();
      return result;
    } catch(e) { return 'error: ' + e.message; }
  });
  console.log('   escAttr type check:', escAttrCheck);
  
  console.log('\n3. Console loglari:');
  consoleLogs.slice(-20).forEach(log => console.log('   ' + log));
  
  console.log('\n4. Hatalar:');
  if (errors.length === 0) {
    console.log('   YOK - temiz!');
  } else {
    errors.forEach(err => console.log('   ❌ ' + err));
  }
  
  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
})();
