const { chromium } = require('@playwright/test');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const BAD_RE = /(\u00c3|\u00c5|\u00c4|\u00c2|\u00e2\u20ac|\u011e\u011e|Uret|Gorsel|Calisma|Kullanici|Sifre)/;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1365, height: 768 } });
  const page = await ctx.newPage();
  const report = { at: new Date().toISOString(), base: BASE };
  for (const route of ['/ai-araclar', '/promptlar']) {
    await page.goto(`${BASE}${route}?cb=v474-transfer`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2200);
    report[route] = await page.evaluate(async (badSource) => {
      const badRe = new RegExp(badSource);
      const candidates = Array.from(document.querySelectorAll('button,a,[role="button"]')).filter((el) => {
        const text = (el.innerText || el.textContent || el.title || '').toLocaleLowerCase('tr-TR');
        return text.includes('çalıştır') || text.includes('kullan') || text.includes('sohbete') || text.includes('kopyala');
      });
      const target = candidates.find((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      });
      const clicked = target ? (target.innerText || target.textContent || target.title || '').trim().slice(0, 120) : null;
      if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await new Promise((resolve) => setTimeout(resolve, 700));
      const input = document.querySelector('#chat-in,#msg,#chat-input,textarea.chat-input');
      return {
        clicked,
        input: (input?.value || '').slice(0, 1000),
        bodyBad: badRe.test(document.body.innerText || ''),
        inputBad: badRe.test(input?.value || ''),
        textTop: (document.body.innerText || '').slice(0, 500),
      };
    }, BAD_RE.source);
  }
  await browser.close();
  fs.writeFileSync('tests/v474-transfer-smoke.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
