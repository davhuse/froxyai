const { chromium } = require('@playwright/test');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Check key elements exist
  const checks = [
    { sel: '.card-icon svg', label: 'SVG feature icons' },
    { sel: '.mockup-typing', label: 'Typing animation' },
    { sel: '.provider-glow', label: 'Provider glow' },
    { sel: '.provider-stat', label: 'Provider stats' },
    { sel: '.workflow-connector', label: 'Workflow connectors' },
    { sel: '.compliance-icon', label: 'Compliance icons' },
    { sel: '.trust-shield-icon', label: 'Trust shield icon' },
    { sel: '.step-badge svg', label: 'Step badge SVGs' },
  ];

  for (const { sel, label } of checks) {
    const count = await page.locator(sel).count();
    console.log(`  ${count > 0 ? '✅' : '❌'} ${label}: ${count} found`);
  }

  // Check footer links are clickable
  const footerLinks = await page.locator('.footer-links-group a').count();
  console.log(`  ${footerLinks > 0 ? '✅' : '❌'} Footer links: ${footerLinks} found`);

  // Check compliance items are clickable
  const compItems = await page.locator('.compliance-item[onclick]').count();
  console.log(`  ${compItems > 0 ? '✅' : '❌'} Compliance items with onclick: ${compItems} found`);

  if (errors.length) {
    console.log('\n⚠️ Console errors:');
    errors.forEach(e => console.log('  ', e));
  } else {
    console.log('\n✅ No console errors');
  }

  await browser.close();
  console.log('\nDone!');
})();
