const { chromium } = require('@playwright/test');

(async () => {
  console.log('=== Mobile Debug ===\n');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(4000);

  // 1. Check what classes are on html/body
  const htmlClasses = await page.evaluate(() => document.documentElement.className);
  const bodyClasses = await page.evaluate(() => document.body.className);
  console.log('html classes:', htmlClasses);
  console.log('body classes:', bodyClasses);

  // 2. Check computed overflow on html, body, v-home
  const overflows = await page.evaluate(() => {
    const cs = (el) => {
      const s = window.getComputedStyle(el);
      return {
        overflow: s.overflow,
        overflowX: s.overflowX,
        overflowY: s.overflowY,
        height: s.height,
        maxHeight: s.maxHeight,
        position: s.position,
        display: s.display
      };
    };
    return {
      html: cs(document.documentElement),
      body: cs(document.body),
      vHome: cs(document.getElementById('v-home') || document.body),
    };
  });
  console.log('\nhtml styles:', JSON.stringify(overflows.html, null, 2));
  console.log('\nbody styles:', JSON.stringify(overflows.body, null, 2));
  console.log('\nv-home styles:', JSON.stringify(overflows.vHome, null, 2));

  // 3. Check if v-home has 'on' class
  const vHomeOn = await page.evaluate(() => {
    const el = document.getElementById('v-home');
    return el ? el.classList.toString() : 'not found';
  });
  console.log('\nv-home classes:', vHomeOn);

  // 4. Check total page height
  const pageHeight = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    bodyScrollHeight: document.body.scrollHeight,
    bodyClientHeight: document.body.clientHeight,
    vHomeHeight: document.getElementById('v-home')?.scrollHeight || 0,
  }));
  console.log('\nPage heights:', JSON.stringify(pageHeight, null, 2));

  // 5. Try scrolling
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(200);
  const scrolled = await page.evaluate(() => ({ 
    scrollY: window.scrollY, 
    pageYOffset: window.pageYOffset,
    scrollTop: document.documentElement.scrollTop,
    bodyScrollTop: document.body.scrollTop
  }));
  console.log('\nAfter scroll attempt:', JSON.stringify(scrolled));

  // 6. Check the #v-home inline style
  const vHomeStyle = await page.evaluate(() => {
    const el = document.getElementById('v-home');
    return el ? el.getAttribute('style') : 'no style';
  });
  console.log('\nv-home inline style:', vHomeStyle);

  // 7. Check if any parent has overflow:hidden
  const overflowChain = await page.evaluate(() => {
    const results = [];
    let el = document.getElementById('v-home');
    while (el && el !== document.documentElement) {
      const cs = window.getComputedStyle(el);
      if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
        results.push({
          tag: el.tagName,
          id: el.id,
          class: el.className.substring(0, 80),
          overflow: cs.overflow,
          overflowY: cs.overflowY,
          height: cs.height,
          position: cs.position
        });
      }
      el = el.parentElement;
    }
    return results;
  });
  console.log('\nParents with overflow:hidden:', JSON.stringify(overflowChain, null, 2));

  // 8. Check .v#v-home computed styles specifically  
  const vStyles = await page.evaluate(() => {
    const el = document.getElementById('v-home');
    if (!el) return 'not found';
    const cs = window.getComputedStyle(el);
    return {
      display: cs.display,
      height: cs.height,
      minHeight: cs.minHeight,
      maxHeight: cs.maxHeight,
      overflow: cs.overflow,
      position: cs.position
    };
  });
  console.log('\nv-home computed:', JSON.stringify(vStyles, null, 2));

  // 9. Check .v class base styles
  const vBaseStyle = await page.evaluate(() => {
    const rules = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText && (rule.selectorText === '.v' || rule.selectorText === '#v-home' || rule.selectorText === '.v.on')) {
            rules.push({ sel: rule.selectorText, text: rule.cssText.substring(0, 200) });
          }
        }
      } catch(e) {}
    }
    return rules;
  });
  console.log('\n.v CSS rules:', JSON.stringify(vBaseStyle, null, 2));

  await browser.close();
  console.log('\nDone!');
})();
