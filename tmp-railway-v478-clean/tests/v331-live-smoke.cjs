const { chromium } = require('@playwright/test');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1419, height: 817 } });
  const out = {};
  await page.goto('https://froxyai.com/sohbet?fresh=v331-live', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4200);
  await page.evaluate(() => { if (typeof window.renderModelPicker === 'function') window.renderModelPicker(''); document.querySelector('#model-picker')?.classList.add('open'); document.body.classList.add('model-picker-open'); });
  await page.waitForTimeout(700);
  out.logos = await page.evaluate(() => [...document.querySelectorAll('#model-picker .mp-provider-logo')].slice(0,10).map(el => ({ cls: el.className, bg: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).color, w: Math.round(el.getBoundingClientRect().width) })));
  await page.goto('https://froxyai.com/ai-araclar?fresh=v331-live', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3600);
  out.tools = await page.evaluate(() => { const icon=document.querySelector('#ptab-tools .tool-card-top span'); const card=document.querySelector('#ptab-tools .ai-tool-card'); return { cards:document.querySelectorAll('#ptab-tools .ai-tool-card').length, overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth, iconW:icon&&Math.round(icon.getBoundingClientRect().width), cardBefore:card&&getComputedStyle(card,'::before').display, transform:card&&getComputedStyle(card).transform }; });
  await page.goto('https://froxyai.com/promptlar?fresh=v331-live', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3600);
  out.prompts = await page.evaluate(() => { const icon=document.querySelector('#ptab-prompts .prompt-card .persona-icon-3d'); const card=document.querySelector('#ptab-prompts .prompt-card'); return { cards:document.querySelectorAll('#ptab-prompts .prompt-card, #ptab-prompts .pro-prompt-card').length, overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth, iconW:icon&&Math.round(icon.getBoundingClientRect().width), cardBefore:card&&getComputedStyle(card,'::before').display, transform:card&&getComputedStyle(card).transform }; });
  await browser.close();
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e); process.exit(1)});
