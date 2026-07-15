const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4314';
const OUT = path.join(process.cwd(), 'tests');
const routes = ['/', '/sohbet', '/gorsel', '/promptlar', '/ai-araclar', '/galeri', '/destek', '/admin'];
const badRe = /(Ã|Å|Ä|Â|â€|â€™|â€œ|Gorsel|Secili|Kullanici|Sifre|Uret|Calisma Alani|Bugun ne|Giris Yap)/;
fs.mkdirSync(OUT, { recursive: true });
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function state(page){
  return await page.evaluate((badSource) => {
    const re = new RegExp(badSource);
    const text = document.body?.innerText || '';
    const els = Array.from(document.querySelectorAll('button,a,input,textarea,select,[onclick],[role="button"]'));
    const blockers = Array.from(document.querySelectorAll('*')).filter(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.position === 'fixed' && cs.pointerEvents !== 'none' && r.width > innerWidth * .65 && r.height > innerHeight * .65 && r.left < innerWidth * .2 && r.top < innerHeight * .2 && !/app-route-skeleton|modal open|auth-modal|model-picker|chat-model-stable|img-model-stable/.test(el.id + ' ' + el.className);
    }).slice(0, 8).map(el => ({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0,80), text: (el.innerText||'').slice(0,80) }));
    return {
      url: location.href,
      title: document.title,
      ready: document.documentElement.classList.contains('app-ready'),
      prepaint: document.documentElement.classList.contains('app-route-prepaint'),
      badVisibleText: re.test(text),
      sample: text.slice(0, 600),
      clickableCount: els.length,
      blockers,
      bodyClasses: document.body.className,
      htmlClasses: document.documentElement.className,
      consoleErrors: window.__smokeErrors || []
    };
  }, badRe.source);
}
async function routeSmoke(browser){
  const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') page.evaluate(m => { window.__smokeErrors = (window.__smokeErrors || []).concat(String(m)).slice(-30); }, msg.text()).catch(()=>{}); });
  const out = {};
  for (const route of routes) {
    await page.goto(BASE + route + '?cb=v470x', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(2600);
    out[route] = await state(page);
    await page.screenshot({ path: path.join(OUT, 'v470x-route-' + (route === '/' ? 'home' : route.slice(1)) + '.png'), fullPage: false });
  }
  await context.close();
  return out;
}
async function pickerDeep(browser, mobile=false){
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 768 }, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(BASE + '/sohbet?cb=v470x', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await p.locator('.ai-top-chip,.model-picker-chip,[data-open-model-picker]').first().click({ timeout: 8000 });
  await sleep(400);
  const chat = await p.evaluate(() => {
    const menu = document.querySelector('.chat-model-stable-menu-v463');
    const list = menu?.querySelector('.chat-model-stable-list');
    const first = menu?.querySelector('.chat-model-stable-option[data-value]');
    const before = list ? list.scrollTop : -1;
    if (list) { list.scrollTop = 9999; list.dispatchEvent(new Event('scroll')); }
    const after = list ? list.scrollTop : -1;
    const logo = first?.querySelector('.chat-model-stable-logo');
    return { open: !!menu, before, after, canScroll: after > before, options: menu?.querySelectorAll('.chat-model-stable-option[data-value]').length || 0, logoHtml: logo?.innerHTML?.slice(0,120) || '', logoClass: logo?.className || '', title: menu?.querySelector('.chat-model-stable-head strong')?.textContent || '' };
  });
  await p.keyboard.press('Escape');
  await sleep(200);
  chat.closedByEsc = await p.evaluate(() => !document.querySelector('.chat-model-stable-menu-v463'));
  await p.goto(BASE + '/gorsel?cb=v470x', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await p.locator('.img-model-picker-trigger').click({ timeout: 8000 });
  await sleep(400);
  const image = await p.evaluate(() => {
    const menu = document.querySelector('.img-model-stable-menu-v461');
    const list = menu?.querySelector('.img-model-stable-list');
    const first = menu?.querySelector('.img-model-stable-option[data-value]');
    const before = list ? list.scrollTop : -1;
    if (list) { list.scrollTop = 9999; list.dispatchEvent(new Event('scroll')); }
    const after = list ? list.scrollTop : -1;
    const logo = first?.querySelector('.img-model-stable-logo');
    return { open: !!menu, before, after, canScroll: after > before, options: menu?.querySelectorAll('.img-model-stable-option[data-value]').length || 0, logoHtml: logo?.innerHTML?.slice(0,120) || '', logoClass: logo?.className || '', title: menu?.querySelector('.img-model-stable-head strong')?.textContent || '' };
  });
  await p.keyboard.press('Escape');
  await sleep(200);
  image.closedByEsc = await p.evaluate(() => !document.querySelector('.img-model-stable-menu-v461'));
  await p.screenshot({ path: path.join(OUT, mobile ? 'v470x-picker-mobile.png' : 'v470x-picker-desktop.png'), fullPage: false });
  await ctx.close();
  return { chat, image };
}
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const report = { at: new Date().toISOString(), base: BASE };
  report.routes = await routeSmoke(browser);
  report.desktop = await pickerDeep(browser, false);
  report.mobile = await pickerDeep(browser, true);
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'v470x-full-smoke.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, report: path.join(OUT, 'v470x-full-smoke.json'), summary: { routes: Object.fromEntries(Object.entries(report.routes).map(([k,v])=>[k,{bad:v.badVisibleText, blockers:v.blockers.length, errors:v.consoleErrors.length, ready:v.ready, prepaint:v.prepaint}])), desktop: report.desktop, mobile: report.mobile } }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
