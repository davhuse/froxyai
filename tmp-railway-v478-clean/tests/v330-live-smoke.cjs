const { chromium } = require('@playwright/test');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const out = {};
  await page.goto('https://froxyai.com/sohbet?fresh=v330-live', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4200);
  await page.evaluate(() => {
    if (typeof window.renderModelPicker === 'function') window.renderModelPicker('');
    const p = document.querySelector('#model-picker');
    if (p) p.classList.add('open');
    document.body.classList.add('model-picker-open');
    const firstStar = document.querySelector('#model-picker .mp-star');
    if (firstStar && !firstStar.classList.contains('on')) {
      firstStar.classList.add('on');
      const sp = firstStar.querySelector('span'); if (sp) sp.textContent = '★';
    }
  });
  await page.waitForTimeout(700);
  out.picker = await page.evaluate(() => {
    const on = document.querySelector('#model-picker .mp-star.on span');
    const icon = document.querySelector('#model-picker .mp-cat .mp-provider-logo, #model-picker .mp-cat svg, #model-picker .mp-cat span:first-child');
    return { open: !!document.querySelector('#model-picker.open'), starColor: on && getComputedStyle(on).color, starText: on && on.textContent, catCount: document.querySelectorAll('#model-picker .mp-cat').length, iconColor: icon && getComputedStyle(icon).color, iconW: icon && Math.round(icon.getBoundingClientRect().width), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  for (const [key,url,sel] of [
    ['tools','https://froxyai.com/ai-araclar?fresh=v330-live','#ptab-tools .ai-tool-card'],
    ['prompts','https://froxyai.com/promptlar?fresh=v330-live','#ptab-prompts .prompt-card, #ptab-prompts .pro-prompt-card'],
    ['home','https://froxyai.com/?fresh=v330-live','.ah-bg']
  ]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3600);
    out[key] = await page.evaluate((sel) => {
      const el = document.querySelector(sel) || document.body;
      const bg = document.querySelector('.ah-bg');
      return { cards: document.querySelectorAll(sel).length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, transform: getComputedStyle(el).transform, bgDisplay: bg ? getComputedStyle(bg).display : null, bgSpanVisible: [...document.querySelectorAll('.ah-bg span')].some(s => getComputedStyle(s).display !== 'none') };
    }, sel);
  }
  await browser.close();
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e); process.exit(1)});
