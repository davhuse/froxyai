const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const desktop = await b.newPage();
  await desktop.setViewportSize({ width: 1440, height: 900 });
  
  await desktop.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(2000);
  await desktop.screenshot({ path: 'scratch/v494-desktop-home.png' });
  console.log('[OK] Desktop home');
  
  const c1Anim = await desktop.evaluate(() => {
    const el = document.querySelector('.neo-float-card.c1');
    if (!el) return 'NOT FOUND';
    return getComputedStyle(el).animationName;
  });
  console.log('[CHECK] Card c1 animation:', c1Anim);
  
  await desktop.goto('http://localhost:3000/gorsel', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(3000);
  await desktop.screenshot({ path: 'scratch/v494-desktop-gorsel.png' });
  console.log('[OK] Desktop gorsel');
  
  await desktop.goto('http://localhost:3000/sohbet', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(3000);
  await desktop.evaluate(() => { if(window.openModelPicker) window.openModelPicker(); });
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: 'scratch/v494-desktop-model-picker.png' });
  console.log('[OK] Desktop model picker');
  
  await desktop.evaluate(() => { document.body.className = 'theme-light'; });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: 'scratch/v494-desktop-light-sohbet.png' });
  console.log('[OK] Light theme sohbet');
  
  await desktop.goto('http://localhost:3000/gorsel', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(2000);
  await desktop.evaluate(() => { document.body.className = 'theme-light'; });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: 'scratch/v494-desktop-light-gorsel.png' });
  console.log('[OK] Light theme gorsel');
  
  const mobile = await b.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: 'scratch/v494-mobile-home.png' });
  console.log('[OK] Mobile home');
  
  await mobile.goto('http://localhost:3000/gorsel', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(3000);
  await mobile.screenshot({ path: 'scratch/v494-mobile-gorsel.png' });
  console.log('[OK] Mobile gorsel');
  
  await mobile.goto('http://localhost:3000/sohbet', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(3000);
  await mobile.screenshot({ path: 'scratch/v494-mobile-sohbet.png' });
  console.log('[OK] Mobile sohbet');
  
  await b.close();
  console.log('=== ALL TESTS COMPLETE ===');
})();
