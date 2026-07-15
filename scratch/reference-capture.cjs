const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto('https://froxy-yapici-mekan.lovable.app', { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: 'scratch/reference-desktop.png', fullPage: true });
  const data = await page.evaluate(() => ({
    title: document.title,
    text: document.body.innerText.slice(0, 12000),
    headings: [...document.querySelectorAll('h1,h2,h3')].map((el) => el.textContent.trim()),
    links: [...document.querySelectorAll('a')].map((el) => ({ text: el.textContent.trim(), href: el.getAttribute('href') })),
  }));
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
