const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = path.join(process.cwd(), 'tests');
fs.mkdirSync(OUT, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function routeState(page, route) {
  await page.goto(`${BASE}${route}?cb=v474-final2`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1800);
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    const bad = /(Ã|Å|Ä|Â|â€|â€™|â€œ|ĞĞ|Gorsel|Secili|Kullanici|Sifre|Uret|Calisma Alani|Bugun ne)/g;
    const badSamples = Array.from(new Set(text.match(bad) || [])).slice(0, 12);
    const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
    const fixedStyle = !!document.querySelector('#froxy-final-fix-v474-style');
    const rect = document.body.getBoundingClientRect();
    return {
      href: location.href,
      finalFlag: !!window.__froxyUseFinalChatPickerV474,
      finalScript: scripts.some((s) => s.includes('froxy-final-fix-v474.js')),
      finalStyle: fixedStyle,
      badCount: badSamples.length,
      badSamples,
      blackScreen: text.trim().length < 20 || rect.width < 100,
      textTop: text.slice(0, 900),
    };
  });
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const count = await page.locator(selector).count();
    for (let i = 0; i < count; i += 1) {
      const loc = page.locator(selector).nth(i);
      const box = await loc.boundingBox().catch(() => null);
      if (!box || box.width <= 0 || box.height <= 0) continue;
      await loc.click({ timeout: 8000, force: true });
      return selector;
    }
  }
  throw new Error(`No selector matched: ${selectors.join(', ')}`);
}

async function pickerSmoke(browser, mobile) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 768 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/sohbet?cb=v474-final2`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2200);
  let chatTrigger = 'event-dispatch';
  if (mobile) {
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.ai-top-chip,[data-open-model-picker],.model-picker-chip'))
        .find((node) => {
          const r = node.getBoundingClientRect();
          const cs = getComputedStyle(node);
          return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
        });
      if (!el) throw new Error('visible chat model trigger not found');
      ['pointerdown', 'touchstart', 'mousedown', 'mouseup', 'click'].forEach((type) => {
        el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
      });
    });
  } else {
    chatTrigger = await clickFirst(page, [
      '[data-open-model-picker]',
      '.ai-top-chip',
      '.model-picker-chip',
      '#currentModelBtn',
      '.current-model',
    ]);
  }
  await sleep(500);
  const chat = await page.evaluate(() => {
    const menu = document.querySelector('.chat-model-stable-menu-v474,.chat-model-stable-menu-v463');
    const list = menu?.querySelector('.chat-model-stable-list');
    const tabs = Array.from(menu?.querySelectorAll('.chat-model-tabs-v474 button') || []).map((b) => b.textContent.trim());
    const before = list ? list.scrollTop : -1;
    if (list) {
      list.scrollTop = 9999;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    const after = list ? list.scrollTop : -1;
    const firstLogo = menu?.querySelector('.chat-model-stable-logo');
    return {
      trigger: window.__lastTrigger || null,
      open: !!menu,
      className: menu?.className || '',
      tabs,
      optionCount: menu?.querySelectorAll('.chat-model-stable-option[data-value]').length || 0,
      listScrollable: !!list && list.scrollHeight > list.clientHeight,
      scrollMoved: after > before,
      firstLogoClass: firstLogo?.className || '',
      firstLogoHtml: (firstLogo?.innerHTML || '').slice(0, 80),
      touchAction: list ? getComputedStyle(list).touchAction : '',
    };
  });
  await page.keyboard.press('Escape');
  await sleep(300);
  chat.closed = await page.evaluate(() => !document.querySelector('.chat-model-stable-menu-v474,.chat-model-stable-menu-v463'));

  await page.goto(`${BASE}/gorsel?cb=v474-final2`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2200);
  const imageTrigger = await clickFirst(page, [
    '.img-model-picker-trigger',
    '[data-open-image-model-picker]',
    '#img-model',
  ]);
  await sleep(500);
  const image = await page.evaluate(() => {
    const menu = document.querySelector('.img-model-stable-menu-v461,.img-model-stable-menu-v462,.img-model-stable-menu-v463,.img-model-stable-menu-v434');
    const list = menu?.querySelector('.img-model-stable-list');
    const before = list ? list.scrollTop : -1;
    if (list) {
      list.scrollTop = 9999;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    const after = list ? list.scrollTop : -1;
    const firstLogo = menu?.querySelector('.img-model-stable-logo');
    return {
      open: !!menu,
      className: menu?.className || '',
      optionCount: menu?.querySelectorAll('.img-model-stable-option[data-value]').length || 0,
      listScrollable: !!list && list.scrollHeight > list.clientHeight,
      scrollMoved: after > before,
      firstLogoClass: firstLogo?.className || '',
      firstLogoHtml: (firstLogo?.innerHTML || '').slice(0, 80),
      touchAction: list ? getComputedStyle(list).touchAction : '',
    };
  });
  await page.keyboard.press('Escape');
  await sleep(300);
  image.closed = await page.evaluate(() => !document.querySelector('.img-model-stable-menu-v461,.img-model-stable-menu-v462,.img-model-stable-menu-v463,.img-model-stable-menu-v434'));
  await page.screenshot({ path: path.join(OUT, mobile ? 'v474-final2-mobile.png' : 'v474-final2-desktop.png'), fullPage: false });
  await context.close();
  return { mobile, chatTrigger, imageTrigger, chat, image };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
  const page = await context.newPage();
  const routes = {};
  for (const route of ['/', '/sohbet', '/gorsel', '/promptlar', '/ai-araclar', '/galeri', '/destek', '/admin']) {
    routes[route] = await routeState(page, route);
  }
  await context.close();
  const desktop = await pickerSmoke(browser, false);
  const mobile = await pickerSmoke(browser, true);
  await browser.close();
  const report = { at: new Date().toISOString(), base: BASE, routes, desktop, mobile };
  const file = path.join(OUT, 'v474-final2-smoke.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    file,
    routes: Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, {
      finalFlag: v.finalFlag,
      finalScript: v.finalScript,
      finalStyle: v.finalStyle,
      badCount: v.badCount,
      badSamples: v.badSamples,
      blackScreen: v.blackScreen,
    }])),
    desktop,
    mobile,
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
