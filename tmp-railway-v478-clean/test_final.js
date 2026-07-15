const { chromium } = require('@playwright/test');

(async () => {
  console.log('=== Final Test v249 ===\n');
  const browser = await chromium.launch({ headless: true });

  // ---- DESKTOP ----
  console.log('--- Desktop (1280x900) ---');
  const d = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dp = await d.newPage();
  const de = [];
  dp.on('pageerror', e => de.push(e.message));
  await dp.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await dp.waitForTimeout(3000);

  // Legal modal
  await dp.evaluate(() => showLegal('kvkk'));
  await dp.waitForTimeout(300);
  const legal = await dp.evaluate(() => {
    const m = document.getElementById('legal-modal');
    return m && m.classList.contains('open') && window.getComputedStyle(m).display !== 'none';
  });
  console.log(`  ${legal ? '✅' : '❌'} Legal modal opens VISIBLY`);

  // Scroll-reveal on features
  await dp.evaluate(() => window.scrollTo(0, 800));
  await dp.waitForTimeout(500);
  const featRevealed = await dp.evaluate(() => {
    const s = document.getElementById('home-tools');
    return s && (s.classList.contains('in-view') || !s.classList.contains('will-reveal'));
  });
  console.log(`  ${featRevealed ? '✅' : '❌'} Features section reveals on scroll`);

  // Feature card animated
  const featCardVisible = await dp.evaluate(() => {
    const c = document.querySelector('.home-feature-card');
    return c && parseFloat(window.getComputedStyle(c).opacity) > 0;
  });
  console.log(`  ${featCardVisible ? '✅' : '❌'} Feature cards visible`);

  if (de.length) console.log('  ⚠️ Errors:', de.join('; '));
  else console.log('  ✅ No errors');
  await d.close();

  // ---- MOBILE ----
  console.log('\n--- Mobile (390x844) ---');
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  const me = [];
  mp.on('pageerror', e => me.push(e.message));
  await mp.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await mp.waitForTimeout(4000);

  // Check scroll works
  const scrollOK = await mp.evaluate(() => {
    window.scrollTo(0, 500);
    return window.scrollY > 0;
  });
  console.log(`  ${scrollOK ? '✅' : '❌'} Scrollable on mobile`);

  // Check overflow computed
  const ov = await mp.evaluate(() => {
    const b = window.getComputedStyle(document.body);
    return { overflow: b.overflow, height: b.height, position: b.position };
  });
  console.log(`  body: overflow=${ov.overflow}, pos=${ov.position}, h=${ov.height.substring(0,6)}..`);

  // Check no horizontal overflow
  const noHoriz = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 5);
  console.log(`  ${noHoriz ? '✅' : '❌'} No horizontal overflow`);

  // Scroll to bottom
  const canBottom = await mp.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY > 100;
  });
  console.log(`  ${canBottom ? '✅' : '❌'} Can scroll to bottom`);

  // Check footer reachable
  await mp.waitForTimeout(200);
  const footerOk = await mp.evaluate(() => {
    const f = document.querySelector('.home-footer');
    return f && f.getBoundingClientRect().top < window.innerHeight;
  });
  console.log(`  ${footerOk ? '✅' : '❌'} Footer reachable`);

  // Check pricing stacked
  const pricingOk = await mp.evaluate(() => {
    const g = document.querySelector('.home-price-premium-grid');
    if (!g) return false;
    const cs = window.getComputedStyle(g);
    return cs.gridTemplateColumns === '1fr' || !cs.gridTemplateColumns.includes(' ');
  });
  console.log(`  ${pricingOk ? '✅' : '❌'} Pricing cards stacked`);

  if (me.length) console.log('  ⚠️ Errors:', me.join('; '));
  else console.log('  ✅ No errors');
  await m.close();

  // ---- TABLET ----
  console.log('\n--- Tablet (768x1024) ---');
  const t = await browser.newContext({ viewport: { width: 768, height: 1024 }, isMobile: true });
  const tp = await t.newPage();
  await tp.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await tp.waitForTimeout(3000);

  const tabScroll = await tp.evaluate(() => { window.scrollTo(0, 400); return window.scrollY > 0; });
  console.log(`  ${tabScroll ? '✅' : '❌'} Tablet scrollable`);

  const tabHero = await tp.evaluate(() => {
    const h = document.querySelector('.home-premium-v237 .home-hero');
    return h && window.getComputedStyle(h).gridTemplateColumns.split(' ').length === 1;
  });
  console.log(`  ${tabHero ? '✅' : '❌'} Hero stacked on tablet`);
  await t.close();

  await browser.close();
  console.log('\n=== All Done ===');
})();
