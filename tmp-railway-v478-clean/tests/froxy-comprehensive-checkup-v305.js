const { chromium } = require('playwright');
const { spawn } = require('child_process');

const mode = process.argv[2] || 'live';
const port = Number(process.env.CHECKUP_PORT || 3017);
const base = mode === 'local' ? `http://127.0.0.1:${port}` : 'https://froxyai.com';
const version = process.env.CHECKUP_VERSION || 'v305';
const routes = [
  '/', '/sohbet', '/dashboard', '/gorsel', '/galeri', '/ai-araclar',
  '/ajanlar', '/promptlar', '/bilgi-bankasi', '/magaza', '/destek', '/admin'
];
const viewports = [
  { name: 'desktop', width: 1366, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true }
];

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForLocalServer() {
  const deadline = Date.now() + 30000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return true;
    } catch (err) {
      last = err;
    }
    await wait(500);
  }
  throw last || new Error('Local server did not start');
}

async function startLocalServer() {
  if (mode !== 'local') return null;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => process.stderr.write(`[server] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[server-err] ${chunk}`));
  await waitForLocalServer();
  return child;
}

function routeUrl(path, suffix) {
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}fresh=${version}-${suffix}-${Date.now()}`;
}

async function evaluateBasics(page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || '';
    const skeleton = document.documentElement.classList.contains('app-route-prepaint') ||
      (document.querySelector('#app-route-skeleton') && getComputedStyle(document.querySelector('#app-route-skeleton')).display !== 'none');
    const bad = bodyText.match(/[ÃƒÃ„Ã…Ã‚]|Ã¢â‚¬â€|ï¿½/g) || [];
    const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    const visibleRoots = [...document.querySelectorAll('.v.on,.ptab.on')].map(el => el.id || el.className).slice(0, 6);
    return {
      title: document.title,
      textLength: bodyText.trim().length,
      badCount: bad.length,
      badSample: bad.slice(0, 10),
      overflow,
      skeleton: !!skeleton,
      visibleRoots,
      hasToast: !!document.querySelector('#toast')
    };
  });
}

async function checkRoute(browser, path, viewport) {
  const page = await browser.newPage({ viewport, isMobile: viewport.isMobile });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !/favicon|Failed to load resource.*404/i.test(text)) {
      consoleErrors.push(text.slice(0, 240));
    }
  });
  page.on('pageerror', err => pageErrors.push(String(err.message || err).slice(0, 240)));
  let status = 0;
  try {
    const res = await page.goto(routeUrl(path, `${viewport.name}-route`), { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = res ? res.status() : 0;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => window.__loadFroxyApp && window.__loadFroxyApp()).catch(() => {});
    await page.waitForTimeout(path === '/' ? 1800 : 2800);
    const basics = await evaluateBasics(page);
    return {
      path,
      viewport: viewport.name,
      status,
      ...basics,
      consoleErrors,
      pageErrors,
      ok: status < 400 && basics.textLength > 80 && !basics.skeleton && basics.overflow < 4 && !basics.badCount && !pageErrors.length
    };
  } catch (err) {
    return {
      path,
      viewport: viewport.name,
      status,
      ok: false,
      error: String(err.message || err),
      consoleErrors,
      pageErrors
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function checkChat(browser, viewport) {
  const page = await browser.newPage({ viewport, isMobile: viewport.isMobile });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 240));
  });
  page.on('pageerror', err => pageErrors.push(String(err.message || err).slice(0, 240)));
  try {
    await page.goto(routeUrl('/sohbet', `${viewport.name}-chat`), { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => window.__loadFroxyApp && window.__loadFroxyApp()).catch(() => {});
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      const trigger = document.querySelector('.model-picker-chip,#mpb-name,[data-open-model-picker]');
      if (trigger) trigger.click();
      else window.openModelPicker && window.openModelPicker();
    });
    await page.waitForFunction(() => {
      const sortReady = document.querySelectorAll('#model-picker .mp-sort button').length >= 4;
      const itemReady = document.querySelectorAll('#model-picker .mp-item').length > 10;
      return sortReady && itemReady && !/yÃ¼kleniyor/i.test(document.querySelector('#mp-count')?.textContent || '');
    }, { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(400);
    return await page.evaluate(() => {
      const picker = document.querySelector('#model-picker');
      const items = [...document.querySelectorAll('#model-picker .mp-item')].slice(0, 12).map(el => {
        const name = el.querySelector('.mp-item-name')?.getBoundingClientRect();
        const meta = el.querySelector('.mp-item-meta')?.getBoundingClientRect();
        return {
          text: el.innerText.slice(0, 160),
          h: Math.round(el.getBoundingClientRect().height),
          overlap: !!(name && meta && name.bottom > meta.top)
        };
      });
      const search = document.querySelector('#mp-search');
      if (search) {
        search.value = 'gemini';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const filteredCount = document.querySelectorAll('#model-picker .mp-item').length;
      const bad = (picker?.innerText || '').match(/[ÃƒÃ„Ã…Ã‚]|Ã¢â‚¬â€|ï¿½/g) || [];
      return {
        viewport: window.innerWidth < 700 ? 'mobile' : 'desktop',
        open: !!picker?.classList.contains('open'),
        countText: document.querySelector('#mp-count')?.textContent || '',
        sortLabels: [...document.querySelectorAll('#model-picker .mp-sort button')].map(b => b.textContent.trim()),
        itemCount: items.length,
        filteredCount,
        itemHeights: items.map(x => x.h),
        overlaps: items.filter(x => x.overlap).length,
        badCount: bad.length,
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        consoleErrors: [],
        pageErrors: []
      };
    }).then(result => ({
      ...result,
      consoleErrors,
      pageErrors,
      ok: result.open && result.sortLabels.length === 4 && result.itemCount > 0 && result.filteredCount > 0 &&
        result.overlaps === 0 && result.overflow < 4 && result.badCount === 0 && !pageErrors.length
    }));
  } catch (err) {
    return { viewport: viewport.name, ok: false, error: String(err.message || err), consoleErrors, pageErrors };
  } finally {
    await page.close().catch(() => {});
  }
}

async function checkImage(browser, viewport) {
  const page = await browser.newPage({ viewport, isMobile: viewport.isMobile });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 240));
  });
  page.on('pageerror', err => pageErrors.push(String(err.message || err).slice(0, 240)));
  try {
    await page.goto(routeUrl('/gorsel', `${viewport.name}-image`), { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => window.__loadFroxyApp && window.__loadFroxyApp()).catch(() => {});
    await page.waitForTimeout(3200);
    const result = await page.evaluate(() => {
      const allCount = document.querySelectorAll('#img-model option').length;
      window.setImageWorkflowMode && window.setImageWorkflowMode('edit');
      const editCount = document.querySelectorAll('#img-model option').length;
      const badEditModels = [...document.querySelectorAll('#img-model option')]
        .filter(o => !/^(auto-quality|openai-)|gpt-image|style-dalle3|^gemini-|nano-banana|nanobanana/i.test(o.value))
        .map(o => o.value)
        .slice(0, 10);
      const trigger = document.querySelector('.img-model-picker-trigger');
      const cost = document.querySelector('.img-model-picker-trigger>.img-model-picker-cost');
      const bad = (document.body.innerText || '').match(/[ÃƒÃ„Ã…Ã‚]|Ã¢â‚¬â€|ï¿½/g) || [];
      return {
        viewport: window.innerWidth < 700 ? 'mobile' : 'desktop',
        allCount,
        editCount,
        badEditModels,
        qualityLabels: [...document.querySelectorAll('[data-img-quality]')].map(b => b.textContent.trim()),
        triggerText: trigger?.innerText || '',
        triggerCostDisplay: cost ? getComputedStyle(cost).display : 'missing',
        arrowCount: document.querySelectorAll('.img-model-picker-trigger .img-model-picker-arrow').length,
        badCount: bad.length,
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    });
    return {
      ...result,
      consoleErrors,
      pageErrors,
      ok: result.allCount > result.editCount && result.editCount > 0 && result.badEditModels.length === 0 &&
        result.qualityLabels.includes('Hızlı Düzenle') && result.triggerCostDisplay === 'none' &&
        result.arrowCount === 1 && result.overflow < 4 && result.badCount === 0 && !pageErrors.length
    };
  } catch (err) {
    return { viewport: viewport.name, ok: false, error: String(err.message || err), consoleErrors, pageErrors };
  } finally {
    await page.close().catch(() => {});
  }
}

async function checkSpecificPanels(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    const checks = {};
    await page.goto(routeUrl('/dashboard', 'panels-dashboard'), { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => window.__loadFroxyApp && window.__loadFroxyApp()).catch(() => {});
    await page.waitForTimeout(5200);
    checks.dashboard = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const voicePanel = document.querySelector('#voice-panel.voice-selection-panel');
      const voicePanelRect = voicePanel ? voicePanel.getBoundingClientRect() : null;
      const voicePanelText = voicePanel?.textContent || '';
      return {
        audioEngineCount: (text.match(/Ses Motoru/g) || []).length,
        audioCharacterCount: (text.match(/Karakter/g) || []).length,
        voicePanelCount: document.querySelectorAll('#voice-panel.voice-selection-panel').length,
        voicePanelVisible: !!(voicePanelRect && voicePanelRect.width > 40 && voicePanelRect.height > 40),
        apiKeyCount: (text.match(/API Key|Api Key|api key/gi) || []).length,
        badCount: (text.match(/[ÃƒÃ„Ã…Ã‚]|Ã¢â‚¬â€|ï¿½/g) || []).length,
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        ok: document.querySelectorAll('#voice-panel.voice-selection-panel').length === 1 &&
          !!(voicePanelRect && voicePanelRect.width > 40 && voicePanelRect.height > 40) &&
          /Ses Motoru/.test(voicePanelText) &&
          /Karakter/.test(voicePanelText) &&
          (text.match(/API Key|Api Key|api key/gi) || []).length === 0 &&
          (text.match(/[ÃƒÃ„Ã…Ã‚]|Ã¢â‚¬â€|ï¿½/g) || []).length === 0 &&
          Math.max(0, document.documentElement.scrollWidth - window.innerWidth) < 4
      };
    });
    await page.goto(routeUrl('/destek', 'panels-support'), { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => window.__loadFroxyApp && window.__loadFroxyApp()).catch(() => {});
    await page.waitForTimeout(2500);
    checks.support = await page.evaluate(() => ({
      inputs: document.querySelectorAll('input,textarea,select').length,
      buttons: document.querySelectorAll('button').length,
      hasSupportEmail: /destek@froxyai\.com/i.test(document.body.innerText || ''),
      badCount: ((document.body.innerText || '').match(/[ÃƒÃ„Ã…Ã‚]|Ã¢â‚¬â€|ï¿½/g) || []).length,
      ok: /destek@froxyai\.com/i.test(document.body.innerText || '') &&
        ((document.body.innerText || '').match(/[ÃƒÃ„Ã…Ã‚]|Ã¢â‚¬â€|ï¿½/g) || []).length === 0
    }));
    await page.goto(routeUrl('/admin', 'panels-admin'), { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => window.__loadFroxyApp && window.__loadFroxyApp()).catch(() => {});
    await page.waitForTimeout(2500);
    checks.admin = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        textLength: text.trim().length,
        hasAdminCopy: /admin|yetki|oturum|kullanÄ±cÄ±/i.test(text),
        badCount: (text.match(/[ÃƒÃ„Ã…Ã‚]|Ã¢â‚¬â€|ï¿½/g) || []).length,
        ok: text.trim().length > 400 &&
          /admin|yetki|oturum|kullanÄ±cÄ±/i.test(text) &&
          (text.match(/[ÃƒÃ„Ã…Ã‚]|Ã¢â‚¬â€|ï¿½/g) || []).length === 0
      };
    });
    return checks;
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  const server = await startLocalServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const routeResults = [];
    for (const viewport of viewports) {
      for (const path of routes) {
        routeResults.push(await checkRoute(browser, path, viewport));
      }
    }
    const chatResults = [];
    const imageResults = [];
    for (const viewport of viewports) {
      chatResults.push(await checkChat(browser, viewport));
      imageResults.push(await checkImage(browser, viewport));
    }
    const panelResults = await checkSpecificPanels(browser);
    const failedRoutes = routeResults.filter(r => !r.ok);
    const failedCritical = [...chatResults, ...imageResults].filter(r => !r.ok);
    const failedPanels = Object.entries(panelResults).filter(([, result]) => result && result.ok === false);
    const summary = {
      mode,
      base,
      version,
      routeTotal: routeResults.length,
      routeFailures: failedRoutes.length,
      criticalFailures: failedCritical.length,
      panelFailures: failedPanels.length,
      routeResults,
      chatResults,
      imageResults,
      panelResults
    };
    console.log(JSON.stringify(summary, null, 2));
    if (failedRoutes.length || failedCritical.length || failedPanels.length) process.exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    if (server) server.kill();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
