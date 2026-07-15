const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  
  // Desktop light theme test
  const p = await b.newPage();
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('http://localhost:3000/sohbet', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.body.classList.add('theme-light'); localStorage.setItem('froxy_theme','light'); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'scratch/v495-light-chat.png' });
  
  // Light theme with model picker
  await p.evaluate(() => { if(window.openModelPicker) window.openModelPicker(); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'scratch/v495-light-picker.png' });
  
  // Light theme gorsel
  await p.goto('http://localhost:3000/gorsel', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { document.body.classList.add('theme-light'); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'scratch/v495-light-gorsel.png' });
  
  // Dark theme gorsel (check image gen is not broken)
  await p.evaluate(() => { document.body.classList.remove('theme-light'); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'scratch/v495-dark-gorsel.png' });
  
  // Mobile
  const m = await b.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await m.waitForTimeout(2000);
  await m.screenshot({ path: 'scratch/v495-mobile-home.png', fullPage: true });
  
  await m.goto('http://localhost:3000/gorsel', { waitUntil: 'networkidle' });
  await m.waitForTimeout(3000);
  await m.screenshot({ path: 'scratch/v495-mobile-gorsel.png' });
  
  // Desktop home - floating cards area
  const d2 = await b.newPage();
  await d2.setViewportSize({ width: 1440, height: 900 });
  await d2.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await d2.waitForTimeout(2000);
  // Scroll to floating cards section
  await d2.evaluate(() => {
    const el = document.querySelector('.neo-growth-banner');
    if(el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await d2.waitForTimeout(1000);
  await d2.screenshot({ path: 'scratch/v495-desktop-floating.png' });
  
  const c1Anim = await d2.evaluate(() => {
    const el = document.querySelector('.neo-float-card.c1');
    if(!el) return 'NOT FOUND';
    return getComputedStyle(el).animationName;
  });
  console.log('Card c1 animation:', c1Anim);
  
  await b.close();
  console.log('=== TESTS DONE ===');
})();
