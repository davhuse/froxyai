const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

(async () => {
  const outDir = path.join(__dirname, '..', 'generated', 'froxy_site_caps');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
  });

  await page.goto('https://froxyai.com/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: path.join(outDir, '01_hero.png'), fullPage: false });

  const positions = [520, 1120, 1750, 2450, 3250];
  let i = 2;
  for (const y of positions) {
    await page.evaluate((scrollY) => window.scrollTo({ top: scrollY, behavior: 'instant' }), y);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outDir, `${String(i).padStart(2, '0')}_scroll_${y}.png`), fullPage: false });
    i++;
  }

  await browser.close();
  console.log(outDir);
})();
