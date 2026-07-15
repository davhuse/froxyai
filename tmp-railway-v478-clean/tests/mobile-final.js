const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'], locale: 'tr-TR' });
  const page = await ctx.newPage();
  
  await page.goto('https://froxyai.com/?v=v178', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('saas_token','t');
    localStorage.setItem('saas_user', JSON.stringify({id:1,credits:50000,plan:'pro'}));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (typeof go === 'function') go('chat'); });
  await page.waitForTimeout(1500);
  
  // Composer pozisyon kontrolü
  const cmp = await page.evaluate(() => {
    const w = document.querySelector('.chat-input-wrap.ai-composer');
    if (!w) return null;
    const cs = getComputedStyle(w);
    const r = w.getBoundingClientRect();
    return {
      position: cs.position,
      bottom: cs.bottom,
      zIndex: cs.zIndex,
      visibleTop: Math.round(r.top),
      windowH: window.innerHeight
    };
  });
  console.log('Composer:', JSON.stringify(cmp, null, 2));
  
  // Bottom nav pozisyon
  const nav = await page.evaluate(() => {
    const n = document.querySelector('.mobile-app-nav');
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return { 
      position: cs.position, 
      bottom: cs.bottom, 
      zIndex: cs.zIndex,
      top: Math.round(r.top),
      bottom_pos: Math.round(r.bottom)
    };
  });
  console.log('Nav:', JSON.stringify(nav, null, 2));
  
  // Composer nav üstünde mi?
  await page.screenshot({ path: 'tests/v178-mobile-final.png' });
  
  // Destek tıkla
  await page.evaluate(() => {
    document.querySelectorAll('.mobile-app-nav-btn').forEach(b => {
      if (b.querySelector('span')?.textContent.trim() === 'Destek') b.click();
    });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/v178-mobile-destek.png' });
  console.log('Destek screenshot kaydedildi');
  
  await browser.close();
})();
