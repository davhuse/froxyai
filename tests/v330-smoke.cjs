const { chromium } = require('@playwright/test');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const out = {};
  await page.goto('http://localhost:3010/sohbet?fresh=v330-smoke', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3200);
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
  await page.waitForTimeout(600);
  out.picker = await page.evaluate(() => {
    const on = document.querySelector('#model-picker .mp-star.on span');
    const cats = [...document.querySelectorAll('#model-picker .mp-cat')].slice(0,8).map(c => {
      const icon = c.querySelector('.mp-provider-logo, svg, span:first-child');
      const cs = icon ? getComputedStyle(icon) : null;
      return { text: c.textContent.trim().slice(0,40), color: cs && cs.color, bg: cs && cs.backgroundColor, w: icon && Math.round(icon.getBoundingClientRect().width), h: icon && Math.round(icon.getBoundingClientRect().height) };
    });
    return { open: !!document.querySelector('#model-picker.open'), starColor: on && getComputedStyle(on).color, starText: on && on.textContent, catCount: document.querySelectorAll('#model-picker .mp-cat').length, cats, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  for (const [key,url,sel] of [
    ['tools','http://localhost:3010/ai-araclar?fresh=v330-smoke','#ptab-tools .ai-tool-card'],
    ['prompts','http://localhost:3010/promptlar?fresh=v330-smoke','#ptab-prompts .prompt-card, #ptab-prompts .pro-prompt-card'],
    ['home','http://localhost:3010/?fresh=v330-smoke','.ah-bg']
  ]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2600);
    out[key] = await page.evaluate((sel) => {
      const el = document.querySelector(sel) || document.body;
      const bg = document.querySelector('.ah-bg');
      return {
        cards: document.querySelectorAll(sel).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        transform: getComputedStyle(el).transform,
        bgDisplay: bg ? getComputedStyle(bg).display : null,
        bgSpanVisible: [...document.querySelectorAll('.ah-bg span')].some(s => getComputedStyle(s).display !== 'none')
      };
    }, sel);
  }
  await browser.close();
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e); process.exit(1)});
