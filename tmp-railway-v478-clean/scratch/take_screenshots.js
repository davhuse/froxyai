const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  const artifactDir = 'C:\\Users\\habil\\.gemini\\antigravity\\brain\\d2327c60-3ec8-40ee-b6ee-7cd8bbcd3547';
  
  console.log('Visiting /gorsel...');
  await page.goto('https://www.froxyai.com/gorsel', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(artifactDir, 'screenshot_gorsel_page.png') });
  
  console.log('Attempting to click img model picker trigger...');
  const imgTrigger = await page.$('.img-model-picker-trigger');
  if (imgTrigger) {
    await imgTrigger.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_gorsel_picker_open.png') });
  } else {
    console.log('img-model-picker-trigger not found');
  }
  
  console.log('Visiting /sohbet...');
  await page.goto('https://www.froxyai.com/sohbet', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(artifactDir, 'screenshot_sohbet_page.png') });
  
  console.log('Attempting to click chat model picker trigger...');
  const chatTrigger = await page.$('[data-open-model-picker], .model-picker-chip, .ai-top-chip');
  if (chatTrigger) {
    await chatTrigger.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_sohbet_picker_open.png') });
  } else {
    console.log('chat model picker trigger not found');
  }
  
  console.log('Visiting /admin...');
  await page.goto('https://www.froxyai.com/admin', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(artifactDir, 'screenshot_admin_page.png') });
  
  await browser.close();
  console.log('All screenshots taken successfully.');
})().catch(err => {
  console.error('Error during screenshot generation:', err);
  process.exit(1);
});
