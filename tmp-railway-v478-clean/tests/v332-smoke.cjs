const { chromium } = require('@playwright/test');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1419, height: 817 } });
  const out = {};
  await page.goto('http://localhost:3010/sohbet?fresh=v332-smoke', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3200);
  await page.evaluate(() => { if (typeof window.renderModelPicker === 'function') window.renderModelPicker(''); document.querySelector('#model-picker')?.classList.add('open'); document.body.classList.add('model-picker-open'); });
  await page.waitForTimeout(500);
  out.cats = await page.evaluate(() => [...document.querySelectorAll('#model-picker .mp-cat')].slice(0,12).map(c => {
    const icon = c.querySelector('.mp-provider-logo, svg, span:first-child');
    const label = c.querySelector('span:not(.mp-provider-logo):not(.mp-cat-count)');
    const cs = icon ? getComputedStyle(icon) : null;
    return { text: c.textContent.trim(), iconBg: cs && cs.backgroundImage, iconColor: cs && cs.color, iconW: icon && Math.round(icon.getBoundingClientRect().width), labelW: label && Math.round(label.getBoundingClientRect().width), labelScroll: label && label.scrollWidth, clipped: label ? label.scrollWidth > label.clientWidth + 1 : false };
  }));
  out.picker = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth, bodyGrid: getComputedStyle(document.querySelector('#model-picker .mp-body')).gridTemplateColumns }));
  await page.goto('http://localhost:3010/promptlar?fresh=v332-smoke', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2800);
  out.prompts = await page.evaluate(() => [...document.querySelectorAll('#ptab-prompts .prompt-card')].slice(0,8).map(card => {
    const icon=card.querySelector('.persona-icon-3d'); const h=card.querySelector('h3'); const p=card.querySelector('p'); const cta=card.querySelector('.prompt-card-cta');
    return { cardH: Math.round(card.getBoundingClientRect().height), iconY: Math.round(icon.getBoundingClientRect().top-card.getBoundingClientRect().top), titleY: Math.round(h.getBoundingClientRect().top-card.getBoundingClientRect().top), descY: Math.round(p.getBoundingClientRect().top-card.getBoundingClientRect().top), ctaY: Math.round(cta.getBoundingClientRect().top-card.getBoundingClientRect().top), align: getComputedStyle(h).textAlign, overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth };
  }));
  await browser.close();
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e); process.exit(1)});
