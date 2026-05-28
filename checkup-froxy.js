const { chromium } = require('playwright');

const BASE_URL = process.env.CHECKUP_BASE_URL || 'http://localhost:3010';
const ROUTES = ['/', '/sohbet', '/dashboard', '/gorsel', '/galeri', '/ai-araclar', '/ajanlar', '/promptlar', '/bilgi-bankasi', '/magaza', '/destek', '/admin'];
const APP_ROUTES = ROUTES.filter(route => route !== '/');
const VIEWPORTS = [
  { name: 'desktop', width: 1366, height: 768, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true }
];

async function snapshot(page) {
  return page.evaluate(() => {
    const skeleton = document.querySelector('#app-route-skeleton');
    return {
      htmlClass: document.documentElement.className,
      skeletonDisplay: skeleton ? getComputedStyle(skeleton).display : 'missing',
      visibleMain: document.body.offsetHeight > 200 && document.body.innerText.trim().length > 20,
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 260)
    };
  });
}

async function routeSmoke(browser) {
  const rows = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
    const page = await context.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 220)); });
    page.on('pageerror', err => errors.push(('PAGE ' + err.message).slice(0, 220)));

    for (const route of ROUTES) {
      errors.length = 0;
      const res = await page.goto(BASE_URL + route + '?checkup=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3600);
      const state = await snapshot(page);
      const interactions = {};

      if (route === '/sohbet') {
        await page.click('[data-open-model-picker], .model-picker-chip, .ai-top-chip').catch(() => {});
        await page.waitForTimeout(800);
        interactions.modelPicker = await page.evaluate(() => {
          const cats = [...document.querySelectorAll('#mp-cats .mp-cat')].map(el => el.textContent.trim());
          const rows = [...document.querySelectorAll('#model-picker .mp-item')].slice(0, 18);
          const clipped = rows
            .filter(el => {
              const name = el.querySelector('.mp-item-name');
              return name && name.scrollHeight > name.clientHeight + 3;
            })
            .map(el => el.querySelector('.mp-item-name')?.textContent.trim());
          const heights = rows.map(el => el.getBoundingClientRect().height).filter(Boolean);
          return {
            open: !!document.querySelector('#model-picker.open'),
            hasQualityFree: cats.some(text => text.includes('Ücretsiz Kaliteli') || text.includes('Ucretsiz Kaliteli')),
            clipped,
            scoreRows: document.querySelectorAll('#model-picker .pro-model-score').length,
            minRowHeight: heights.length ? Math.min(...heights) : 0,
            overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
          };
        });
      }

      if (route === '/gorsel') {
        interactions.imagePicker = await page.evaluate(() => {
          const triggerName = document.querySelector('.img-model-picker-trigger strong');
          const options = [...document.querySelectorAll('#img-model option')].map(o => o.textContent.trim());
          const groups = [...document.querySelectorAll('#img-model optgroup')].map(g => g.label);
          const galleryImages = [...document.querySelectorAll('#pro-image-gallery img,.img-history-card img,.gallery-item img')];
          return {
            hasQualityFree: groups.some(label => label === 'Ücretsiz Kaliteli' || label === 'Ucretsiz Kaliteli'),
            hasCloudflare: options.some(text => text.includes('Cloudflare SDXL')),
            hasFlux: options.some(text => text.includes('Flux')),
            triggerClipped: !!(triggerName && triggerName.scrollHeight > triggerName.clientHeight + 2),
            brokenGalleryImages: galleryImages.filter(img => !img.complete || img.naturalWidth === 0).length,
            hasGalleryState: !!document.querySelector('#pro-image-gallery')
          };
        });
      }

      if (route === '/dashboard') {
        interactions.dashboardModels = await page.evaluate(() => {
          const box = document.querySelector('#dash-models-list');
          return {
            visible: !!box,
            count: box ? box.querySelectorAll('.dm-tag').length : 0,
            empty: !!box?.querySelector('.dm-empty'),
            text: box ? box.innerText.replace(/\s+/g, ' ').slice(0, 180) : ''
          };
        });
      }

      if (route === '/destek') {
        interactions.supportVisible = /destek|yardımcı|yardimci|talep/i.test(state.text);
      }
      if (route === '/admin') {
        interactions.adminVisible = /admin|yönetim|yonetim|oturumu|yetki/i.test(state.text);
      }

      rows.push({
        type: 'route',
        viewport: vp.name,
        route,
        status: res ? res.status() : 0,
        state,
        interactions,
        errors: [...new Set(errors)]
      });
    }
    await context.close();
  }
  return rows;
}

async function loaderTimingSmoke(browser) {
  const rows = [];
  for (const vp of VIEWPORTS) {
    for (const route of ['/sohbet', '/dashboard', '/gorsel']) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
      const page = await context.newPage();
      await page.goto(BASE_URL + route + '?loader_timing=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(500);
      const early = await snapshot(page);
      await page.waitForTimeout(1300);
      const late = await snapshot(page);
      rows.push({ type: 'loader-timing', viewport: vp.name, route, early, late });
      await context.close();
    }
  }
  return rows;
}

async function blockedAppLoaderSmoke(browser) {
  const rows = [];
  for (const vp of VIEWPORTS) {
    for (const route of APP_ROUTES) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
      const page = await context.newPage();
      await page.route(/app\.min\.js/, routeObj => {});
      await page.goto(BASE_URL + route + '?blocked_app=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(500);
      const state = await snapshot(page);
      const leak = /Model Seçin|Yasal ✕|Froxy AI Yeni sohbet Sohbete yaz|Sohbet Panel Görsel Bilgi/.test(state.text);
      rows.push({ type: 'blocked-loader', viewport: vp.name, route, state, leak });
      await context.close();
    }
  }
  return rows;
}

function findFailures(rows) {
  return rows.filter(row => {
    if (row.type === 'blocked-loader') return row.state.skeletonDisplay !== 'flex' || row.leak;
    if (row.type === 'loader-timing') {
      if (row.early.skeletonDisplay !== 'flex') return true;
      if (row.late.skeletonDisplay === 'flex' || !row.late.visibleMain) return true;
      return false;
    }
    if (row.status >= 400 || !row.state.visibleMain || row.state.overflow > 8 || row.errors.length) return true;
    if (row.interactions.modelPicker) {
      const mp = row.interactions.modelPicker;
      if (!mp.open || !mp.hasQualityFree || mp.clipped.length || mp.scoreRows !== 0 || mp.minRowHeight < 64 || mp.overflow > 8) return true;
    }
    if (row.interactions.imagePicker) {
      const ip = row.interactions.imagePicker;
      if (!ip.hasQualityFree || !ip.hasCloudflare || !ip.hasFlux || ip.triggerClipped || ip.brokenGalleryImages > 0 || !ip.hasGalleryState) return true;
    }
    if (row.interactions.dashboardModels) {
      const dm = row.interactions.dashboardModels;
      if (!dm.visible || (!dm.empty && dm.count < 1)) return true;
    }
    if (row.route === '/destek' && row.interactions.supportVisible === false) return true;
    if (row.route === '/admin' && row.interactions.adminVisible === false) return true;
    return false;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const rows = [
    ...(await routeSmoke(browser)),
    ...(await loaderTimingSmoke(browser)),
    ...(await blockedAppLoaderSmoke(browser))
  ];
  await browser.close();

  const failures = findFailures(rows);
  rows.forEach(row => console.log(JSON.stringify(row)));
  console.log('SUMMARY', JSON.stringify({
    baseUrl: BASE_URL,
    total: rows.length,
    failures: failures.length,
    failed: failures.map(row => `${row.type}:${row.viewport}:${row.route}`)
  }));
  process.exit(failures.length ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
