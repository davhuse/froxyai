const { chromium } = require('@playwright/test');
const fs = require('fs');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const routes = ['ai-araclar','promptlar','destek'];
  const sizes = [{name:'desktop', width:1440, height:1000}, {name:'mobile', width:390, height:844}];
  const results = [];
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width:size.width, height:size.height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    for (const route of routes) {
      await page.goto(`http://localhost:3010/${route}?fresh=v324-${size.name}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4500);
      const data = await page.evaluate((route) => ({
        route,
        active: document.querySelector('.ptab.on')?.id || '',
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        mojibake: /Ã|Ä|Å|�|D\?|Foto\?/.test(document.body.innerText),
        toolCards: document.querySelectorAll('#ptab-tools .ai-tool-card').length,
        promptCards: document.querySelectorAll('#ptab-prompts .prompt-card').length,
        supportCards: document.querySelectorAll('#ptab-support .sp4-card').length,
        sample: document.body.innerText.slice(0,350)
      }), route);
      results.push({ size:size.name, ...data });
      await page.screenshot({ path: `tests/v324-${size.name}-${route}.png`, fullPage: false });
    }
    results.push({ size:size.name, consoleErrors: errors.slice(0,8) });
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})();
