const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://www.froxyai.com/gorsel', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const imgTrigger = await page.$('.img-model-picker-trigger');
  if (imgTrigger) {
    await imgTrigger.click();
    await page.waitForTimeout(1000);
    const pickerHtml = await page.evaluate(() => {
      const list = document.querySelector('.img-model-stable-list');
      return list ? list.innerHTML : 'list not found';
    });
    console.log('--- PICKER LIST HTML ---');
    console.log(pickerHtml);
  } else {
    console.log('img-model-picker-trigger not found');
  }
  
  await browser.close();
})().catch(err => {
  console.error(err);
});
