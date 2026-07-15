const { chromium } = require('@playwright/test');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Test 1: Check if showLegal is defined
  const showLegalDefined = await page.evaluate(() => typeof window.showLegal === 'function');
  console.log(`  ${showLegalDefined ? '✅' : '❌'} showLegal function defined: ${showLegalDefined}`);

  // Test 2: Check if go is defined
  const goDefined = await page.evaluate(() => typeof window.go === 'function');
  console.log(`  ${goDefined ? '✅' : '❌'} go function defined: ${goDefined}`);

  // Test 3: Scroll to footer and click a legal link
  const footerLink = page.locator('.footer-links-group a[onclick*="showLegal"]').first();
  const footerLinkCount = await footerLink.count();
  console.log(`  Footer legal links found: ${footerLinkCount}`);

  if (footerLinkCount > 0) {
    await footerLink.scrollIntoViewIfNeeded();
    await footerLink.click();
    await page.waitForTimeout(500);
    const modalOpen = await page.evaluate(() => {
      const m = document.getElementById('legal-modal');
      return m ? m.classList.contains('open') : false;
    });
    console.log(`  ${modalOpen ? '✅' : '❌'} Legal modal opened after footer click: ${modalOpen}`);
    
    if (!modalOpen) {
      // Try calling showLegal directly
      await page.evaluate(() => showLegal('kvkk'));
      await page.waitForTimeout(500);
      const modalOpen2 = await page.evaluate(() => {
        const m = document.getElementById('legal-modal');
        return m ? m.classList.contains('open') : false;
      });
      console.log(`  ${modalOpen2 ? '✅' : '❌'} Legal modal opened after direct showLegal call: ${modalOpen2}`);
      
      // Check modal visibility
      const modalDisplay = await page.evaluate(() => {
        const m = document.getElementById('legal-modal');
        return m ? window.getComputedStyle(m).display : 'not found';
      });
      console.log(`  Legal modal display: ${modalDisplay}`);
      
      const modalZIndex = await page.evaluate(() => {
        const m = document.getElementById('legal-modal');
        return m ? window.getComputedStyle(m).zIndex : 'not found';
      });
      console.log(`  Legal modal z-index: ${modalZIndex}`);
    }
  }

  // Test 4: Check if there are TWO legal-modal elements (conflict)
  const legalModalCount = await page.locator('#legal-modal').count();
  console.log(`  ⚠️ legal-modal elements count: ${legalModalCount}`);
  
  // Test 5: Check legal-title and legal-body
  const titleCount = await page.locator('#legal-title').count();
  const bodyCount = await page.locator('#legal-body').count();
  console.log(`  legal-title elements: ${titleCount}, legal-body elements: ${bodyCount}`);

  if (errors.length) {
    console.log('\n⚠️ Console errors:');
    errors.forEach(e => console.log('  ', e));
  } else {
    console.log('\n✅ No console errors');
  }

  await browser.close();
  console.log('\nDone!');
})();
