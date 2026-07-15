const { chromium } = require('@playwright/test');

(async () => {
  console.log('=== Mobile Scroll Test v249 ===\n');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ 
    viewport: { width: 390, height: 844 }, 
    isMobile: true, 
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(4000);

  // Check classes
  const classes = await page.evaluate(() => ({
    html: document.documentElement.className,
    body: document.body.className
  }));
  console.log('html:', classes.html);
  console.log('body:', classes.body);

  // Check key computed styles
  const overflows = await page.evaluate(() => {
    const cs = (el) => window.getComputedStyle(el);
    const h = cs(document.documentElement);
    const b = cs(document.body);
    return {
      html: { overflow: h.overflow, height: h.height, position: h.position, touchAction: h.touchAction },
      body: { overflow: b.overflow, height: b.height, position: b.position, touchAction: b.touchAction },
    };
  });
  console.log('\nhtml computed:', JSON.stringify(overflows.html));
  console.log('body computed:', JSON.stringify(overflows.body));

  // Check if mobile-shell-v192 AND home-mode are both present
  const hasBothClasses = await page.evaluate(() => {
    return document.body.classList.contains('mobile-shell-v192') && document.body.classList.contains('home-mode');
  });
  console.log(`\n${hasBothClasses ? '✅' : '❌'} Both mobile-shell-v192 AND home-mode classes present`);

  // Test scroll via JS
  const jsScroll = await page.evaluate(() => {
    window.scrollTo(0, 800);
    return window.scrollY;
  });
  console.log(`${jsScroll > 0 ? '✅' : '❌'} JS scroll works: scrollY=${jsScroll}`);

  // Test touch scroll simulation
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  await page.touchscreen.tap(195, 400);
  await page.mouse.move(195, 400);
  // Simulate swipe
  await page.evaluate(() => {
    const target = document.elementFromPoint(195, 400);
    if (!target) return;
    const touchStart = new TouchEvent('touchstart', {
      bubbles: true, cancelable: true,
      touches: [new Touch({ identifier: 1, target, clientX: 195, clientY: 500 })]
    });
    const touchMove = new TouchEvent('touchmove', {
      bubbles: true, cancelable: true,
      touches: [new Touch({ identifier: 1, target, clientX: 195, clientY: 200 })]
    });
    const touchEnd = new TouchEvent('touchend', {
      bubbles: true, cancelable: true,
      changedTouches: [new Touch({ identifier: 1, target, clientX: 195, clientY: 200 })]
    });
    target.dispatchEvent(touchStart);
    target.dispatchEvent(touchMove);
    target.dispatchEvent(touchEnd);
  });
  await page.waitForTimeout(300);

  // Page dimensions
  const dims = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight
  }));
  console.log(`${dims.scrollable ? '✅' : '❌'} Page height (${dims.scrollHeight}px) > viewport (${dims.clientHeight}px)`);

  // Check footer reachability
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const finalScroll = await page.evaluate(() => window.scrollY);
  console.log(`${finalScroll > 0 ? '✅' : '❌'} Can scroll to bottom: scrollY=${finalScroll}`);

  // Check scroll-reveal animation
  const revealState = await page.evaluate(() => {
    const secs = document.querySelectorAll('.home-premium-v237 .home-section');
    return Array.from(secs).map(s => ({
      id: s.id,
      inView: s.classList.contains('in-view'),
      willReveal: s.classList.contains('will-reveal')
    }));
  });
  console.log('\nScroll-reveal state:');
  revealState.forEach(s => console.log(`  ${s.id}: in-view=${s.inView}, will-reveal=${s.willReveal}`));

  if (errors.length) console.log('\n⚠️ Errors:', errors);
  else console.log('\n✅ No errors');

  await browser.close();
  console.log('\n=== Done ===');
})();
