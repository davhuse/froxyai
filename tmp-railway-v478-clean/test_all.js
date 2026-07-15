const { chromium } = require('@playwright/test');

(async () => {
  console.log('=== Testing Homepage v248 ===\n');
  const browser = await chromium.launch({ headless: true });

  // TEST 1: Desktop
  console.log('--- Desktop (1280x900) ---');
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p1 = await ctx1.newPage();
  const errors1 = [];
  p1.on('pageerror', err => errors1.push(err.message));
  await p1.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await p1.waitForTimeout(3000);

  // Legal modal test (most important fix)
  await p1.evaluate(() => showLegal('kvkk'));
  await p1.waitForTimeout(300);
  const legalOpen = await p1.evaluate(() => {
    const m = document.getElementById('legal-modal');
    return m && m.classList.contains('open') && window.getComputedStyle(m).display !== 'none';
  });
  console.log(`  ${legalOpen ? '✅' : '❌'} Legal modal opens and is VISIBLE`);

  // Check only 1 legal-modal exists
  const legalCount = await p1.locator('#legal-modal').count();
  console.log(`  ${legalCount === 1 ? '✅' : '❌'} Legal modal count: ${legalCount} (expected: 1)`);

  // Check section heads are centered
  const featHeadCentered = await p1.evaluate(() => {
    const el = document.querySelector('#home-tools .home-section-head');
    return el && el.classList.contains('center');
  });
  console.log(`  ${featHeadCentered ? '✅' : '❌'} Features section head centered`);

  // Check no emoji in pricing
  const pricingEmoji = await p1.evaluate(() => {
    const text = document.querySelector('.home-price-premium-grid')?.textContent || '';
    return /[💎✨💬🔒🔥🌟]/.test(text);
  });
  console.log(`  ${!pricingEmoji ? '✅' : '❌'} No emoji in pricing cards`);

  // Scroll-reveal IntersectionObserver
  const scrollRevealExists = await p1.evaluate(() => {
    return document.querySelectorAll('.home-premium-v237 .home-section').length > 0;
  });
  console.log(`  ${scrollRevealExists ? '✅' : '❌'} Scroll-reveal sections found`);

  if (errors1.length) console.log('  ⚠️ Page errors:', errors1.join(', '));
  else console.log('  ✅ No page errors');
  await ctx1.close();

  // TEST 2: Mobile
  console.log('\n--- Mobile (390x844 iPhone 14) ---');
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p2 = await ctx2.newPage();
  const errors2 = [];
  p2.on('pageerror', err => errors2.push(err.message));
  await p2.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await p2.waitForTimeout(3000);

  // Can scroll?
  const scrollable = await p2.evaluate(() => {
    const home = document.getElementById('v-home');
    if (!home) return false;
    window.scrollTo(0, 500);
    return window.scrollY > 0 || document.documentElement.scrollTop > 0;
  });
  console.log(`  ${scrollable ? '✅' : '❌'} Page is scrollable on mobile`);

  // Check nav links hidden
  const navHidden = await p2.evaluate(() => {
    const links = document.querySelector('.home-premium-v237 .home-links');
    return links && window.getComputedStyle(links).display === 'none';
  });
  console.log(`  ${navHidden ? '✅' : '❌'} Nav links hidden on mobile`);

  // Check hero stacked
  const heroStacked = await p2.evaluate(() => {
    const hero = document.querySelector('.home-premium-v237 .home-hero');
    if (!hero) return false;
    const cs = window.getComputedStyle(hero);
    return cs.gridTemplateColumns === '1fr' || cs.gridTemplateColumns.split(' ').length === 1;
  });
  console.log(`  ${heroStacked ? '✅' : '❌'} Hero stacked (single column)`);

  // Check pricing stacked
  const pricingStacked = await p2.evaluate(() => {
    const grid = document.querySelector('.home-price-premium-grid');
    if (!grid) return false;
    const cs = window.getComputedStyle(grid);
    return cs.gridTemplateColumns === '1fr' || cs.gridTemplateColumns.split(' ').length === 1;
  });
  console.log(`  ${pricingStacked ? '✅' : '❌'} Pricing cards stacked (single column)`);

  // Page overflow check
  const noOverflow = await p2.evaluate(() => {
    return document.documentElement.scrollWidth <= window.innerWidth + 2;
  });
  console.log(`  ${noOverflow ? '✅' : '❌'} No horizontal overflow`);

  // Footer accessible
  await p2.evaluate(() => window.scrollTo(0, 99999));
  await p2.waitForTimeout(500);
  const footerVisible = await p2.evaluate(() => {
    const footer = document.querySelector('.home-footer');
    if (!footer) return false;
    const r = footer.getBoundingClientRect();
    return r.top < window.innerHeight;
  });
  console.log(`  ${footerVisible ? '✅' : '❌'} Footer is reachable by scrolling`);

  if (errors2.length) console.log('  ⚠️ Page errors:', errors2.join(', '));
  else console.log('  ✅ No page errors');
  await ctx2.close();

  await browser.close();
  console.log('\n=== All Tests Complete ===');
})();
