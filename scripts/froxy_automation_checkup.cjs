#!/usr/bin/env node
/* Deterministic Froxy automation check-up.
   Keeps provider spend low: image generation is mocked for UI model-lock checks. */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tests');
const PORT = Number(process.env.FROXY_CHECKUP_PORT || process.env.PORT || 4311);
const BASE = process.env.FROXY_CHECKUP_BASE_URL || `http://127.0.0.1:${PORT}`;
const ROUTES = ['/', '/sohbet', '/gorsel', '/promptlar', '/ai-araclar', '/galeri', '/destek', '/admin'];
const API_ROUTES = ['/api/health', '/api/provider-status', '/api/local-providers/status'];
const START_SERVER = process.env.FROXY_CHECKUP_START_SERVER !== '0';
const RUN_BROWSER = process.env.FROXY_CHECKUP_BROWSER !== '0';
const RUN_PROVIDER_SMOKE = process.env.FROXY_CHECKUP_PROVIDER_SMOKE === '1';

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function fetchText(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const started = Date.now();
    let client = http;
    try {
      client = new URL(url).protocol === 'https:' ? https : http;
    } catch {}
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, ms: Date.now() - started, bytes: body.length, body });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => {
      resolve({ ok: false, status: 0, ms: Date.now() - started, bytes: 0, body: '', error: err.message });
    });
  });
}

async function waitForServer(base, timeoutMs = 22000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fetchText(`${base}/api/health`, 3500);
    if (last.ok) return last;
    await new Promise((r) => setTimeout(r, 700));
  }
  return last || { ok: false, error: 'server did not respond' };
}

async function ensureServer(report) {
  const first = await fetchText(`${BASE}/api/health`, 2500);
  if (first.ok) {
    report.server = { startedByScript: false, base: BASE, health: compactHealth(first.body), ms: first.ms };
    return null;
  }
  if (!START_SERVER) {
    report.server = { startedByScript: false, base: BASE, error: first.error || `HTTP ${first.status}` };
    return null;
  }
  const env = { ...process.env, PORT: String(PORT) };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString().slice(0, 500)));
  child.stderr.on('data', (d) => logs.push(d.toString().slice(0, 500)));
  const ready = await waitForServer(BASE);
  report.server = {
    startedByScript: true,
    base: BASE,
    ok: ready.ok,
    health: compactHealth(ready.body),
    error: ready.ok ? '' : (ready.error || `HTTP ${ready.status}`),
    recentLog: logs.join('').slice(-1800)
  };
  return child;
}

function compactHealth(body) {
  try {
    const json = JSON.parse(body || '{}');
    return { ok: json.ok, status: json.status, version: json.version, uptime: json.uptime };
  } catch {
    return null;
  }
}

function hasMojibake(text) {
  const sample = String(text || '').slice(0, 250000);
  return /Ã.|Ä.|Å.|Â[^\s]|ï¿½|�/.test(sample);
}

function parseJsonSafe(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function compactApiJson(route, json) {
  if (!json || typeof json !== 'object') return json;
  if (route === '/api/health') {
    const poll = json.imageProviderStatus?.pollinations;
    return {
      ok: json.ok,
      app: json.app,
      version: json.version,
      uptime: json.uptime,
      database: json.database,
      providers: json.providers,
      keyPools: json.keyPools,
      imageProviders: json.imageProviders,
      videoProviders: json.videoProviders,
      imageProviderStatus: {
        cloudflare: json.imageProviderStatus?.cloudflare,
        modal: json.imageProviderStatus?.modal,
        pollinations: poll ? {
          configured: poll.configured,
          keyCount: Array.isArray(poll.keys) ? poll.keys.length : 0,
          queueActive: poll.queueActive,
          queuePending: poll.queuePending,
          cooldowns: poll.cooldowns,
          keys: Array.isArray(poll.keys) ? poll.keys.map((k) => ({
            type: k.type,
            configured: k.configured,
            ok: k.ok,
            status: k.status,
            detail: k.detail,
            usageCount: k.usage?.count,
            account: k.account ? {
              valid: k.account.valid,
              type: k.account.type,
              name: k.account.name,
              pollenBudget: k.account.pollenBudget,
              rateLimitEnabled: k.account.rateLimitEnabled
            } : null,
            nextResetAt: k.nextResetAt,
            rateLimitEnabled: k.rateLimitEnabled,
            pollenBudget: k.pollenBudget
          })) : []
        } : undefined
      }
    };
  }
  return json;
}

async function routeChecks(report) {
  report.routes = [];
  for (const route of ROUTES) {
    const out = await fetchText(`${BASE}${route}`, 15000);
    report.routes.push({
      route,
      ok: out.ok,
      status: out.status,
      ms: out.ms,
      bytes: out.bytes,
      mojibake: hasMojibake(out.body),
      error: out.error || ''
    });
  }
  report.api = [];
  for (const route of API_ROUTES) {
    const out = await fetchText(`${BASE}${route}`, 15000);
    report.api.push({
      route,
      ok: out.ok,
      status: out.status,
      ms: out.ms,
      bytes: out.bytes,
      json: compactApiJson(route, parseJsonSafe(out.body)),
      error: out.error || ''
    });
  }
}

async function providerStatus(report) {
  const local = report.api.find((r) => r.route === '/api/local-providers/status')?.json;
  const provider = report.api.find((r) => r.route === '/api/provider-status')?.json;
  report.providerSummary = {
    localReady: local ? Object.entries(local)
      .filter(([, v]) => v && typeof v === 'object' && v.ready)
      .map(([k]) => k) : [],
    configuredCloud: provider ? Object.entries(provider)
      .filter(([, v]) => v && typeof v === 'object' && v.configured)
      .map(([k]) => k) : []
  };

  if (RUN_PROVIDER_SMOKE) {
    const smoke = await fetchText(`${BASE}/api/model-check`, 420000);
    report.modelCheck = {
      ok: smoke.ok,
      status: smoke.status,
      ms: smoke.ms,
      json: parseJsonSafe(smoke.body),
      error: smoke.error || ''
    };
  } else {
    report.modelCheck = { skipped: true, reason: 'Set FROXY_CHECKUP_PROVIDER_SMOKE=1 for real provider smoke.' };
  }
}

async function browserChecks(report) {
  if (!RUN_BROWSER) {
    report.browser = { skipped: true };
    return;
  }
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (err) {
    report.browser = { ok: false, error: `playwright not available: ${err.message}` };
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 850 } });
  const errors = [];
  const failedRequests = [];
  const imageRequests = [];
  await page.addInitScript(() => {
    window.__froxyCheckupImageRequests = [];
    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (String(url).includes('/api/image')) {
        let body = init && init.body;
        try { body = JSON.parse(body || '{}'); } catch {}
        window.__froxyCheckupImageRequests.push({ url: String(url), body });
        return new Response(JSON.stringify({
          ok: true,
          url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
          model: body && body.model,
          provider: 'mock-checkup'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch.apply(this, arguments);
    };
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) errors.push(msg.text());
  });
  page.on('requestfailed', (req) => failedRequests.push({ url: req.url(), failure: req.failure()?.errorText || '' }));
  await page.route('**/api/image', async (route) => {
    const req = route.request();
    let body = null;
    try { body = JSON.parse(req.postData() || '{}'); } catch { body = req.postData(); }
    imageRequests.push({ url: req.url(), body });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        model: body && body.model,
        provider: 'mock-checkup'
      })
    });
  });

  try {
    await page.goto(`${BASE}/gorsel`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.__loadFroxyApp || document.querySelector('#img-model'), null, { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => window.__loadFroxyApp && window.__loadFroxyApp());
    await page.waitForSelector('#img-model', { timeout: 45000 });
    await page.waitForTimeout(1200);
    const pick = await page.evaluate(() => {
      const sel = document.getElementById('img-model');
      const preferred = ['modal-dreamshaper', 'modal-sdxl', 'cf-sdxl-lightning', 'pollinations-flux', 'comfyui-local', 'a1111-local'];
      const usable = Array.from(sel.options || []).filter((o) => !o.disabled).map((o) => o.value);
      const chosen = preferred.find((id) => usable.includes(id)) || usable[0] || '';
      if (chosen) {
        sel.value = chosen;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const groups = Array.from(sel.querySelectorAll('optgroup')).map((g) => ({
        label: g.label,
        values: Array.from(g.querySelectorAll('option')).map((o) => ({ value: o.value, disabled: o.disabled, text: o.textContent.trim() }))
      }));
      return { chosen, value: sel.value, groups, optionCount: sel.options.length };
    });
    await page.evaluate(() => {
      const prompt = document.getElementById('img-prompt') || document.querySelector('textarea[id*="prompt"]');
      if (prompt) {
        prompt.value = 'small blue ceramic cup on white table, studio light';
        prompt.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const generated = await page.evaluate(async () => {
      const selected = document.getElementById('img-model')?.value || '';
      if (typeof window.postJsonApi !== 'function') return { ok: false, error: 'postJsonApi missing', selected };
      window.__froxyCheckupImageRequests = [];
      const intentionallyWrong = selected === 'pollinations-flux' ? 'modal-sdxl' : 'pollinations-flux';
      const out = await window.postJsonApi('/api/image', {
        prompt: 'small blue ceramic cup on white table, studio light',
        model: intentionallyWrong,
        size: '512x512',
        qualityMode: 'cheap'
      }, 12000);
      return {
        ok: true,
        selected,
        intentionallyWrong,
        modelValue: document.getElementById('img-model')?.value || '',
        responseModel: out && out.model
      };
    });
    await page.waitForTimeout(800);
    const patchedImageRequests = await page.evaluate(() => window.__froxyCheckupImageRequests || []);
    if (patchedImageRequests.length && imageRequests.length === 0) imageRequests.push(...patchedImageRequests);
    const workingSwitch = await page.evaluate(() => {
      if (typeof window.selectWorkingImageModel !== 'function') return { ok: false, error: 'selectWorkingImageModel missing' };
      const before = document.getElementById('img-model')?.value || '';
      const picked = window.selectWorkingImageModel(before, 'HTTP 429 cooldown');
      const after = document.getElementById('img-model')?.value || '';
      return { ok: Boolean(picked && after && after !== before), before, picked, after };
    });
    const uiState = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : '';
      const sel = document.getElementById('img-model');
      return {
        title: document.title,
        bodyLen: body.length,
        hasMojibakeText: /Ã.|Ä.|Å.|Â[^\s]|ï¿½|�/.test(body),
        selectValue: sel ? sel.value : '',
        visibleLocalInstallNoise: /Kurulum gerekli/.test(body),
        hasModalGroup: /Cloud GPU\s*\/\s*Modal/i.test(body),
        hasLocalGroup: /Local PC/i.test(body)
      };
    });
    const routeUi = await runRouteUiAudit(browser, errors);
    report.browser = {
      ok: generated.ok && imageRequests[0]?.body?.model === pick.chosen,
      pick,
      generated,
      imageRequests,
      modelLockOk: imageRequests[0]?.body?.model === pick.chosen,
      workingSwitch,
      uiState,
      routeUi,
      errors: errors.filter((x) => !/Splash screen auto-dismissed/i.test(x)).slice(0, 20),
      failedRequests: failedRequests.slice(0, 20)
    };
  } catch (err) {
    report.browser = { ok: false, error: err.message, errors, failedRequests };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runRouteUiAudit(browser, sharedErrors) {
  const out = [];
  const viewports = [
    { name: 'desktop', width: 1365, height: 850 },
    { name: 'mobile', width: 390, height: 844 }
  ];
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) consoleErrors.push(msg.text());
    });
    for (const route of ROUTES) {
      const entry = { route, viewport: viewport.name, ok: false };
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.evaluate(() => window.__loadFroxyApp && window.__loadFroxyApp()).catch(() => {});
        await page.waitForTimeout(route === '/gorsel' ? 1400 : 800);
        if (route === '/gorsel') {
          await page.locator('.img-model-picker-trigger').first().click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(250);
          await page.mouse.wheel(0, 900);
          await page.waitForTimeout(250);
        }
        if (route === '/galeri') {
          await page.mouse.wheel(0, 800);
          await page.waitForTimeout(300);
          await page.mouse.wheel(0, 800);
          await page.waitForTimeout(300);
          const scrollPerf = await page.evaluate(() => {
            const entries = performance.getEntriesByType('longtask') || [];
            return {
              longTasks: entries.length,
              maxDuration: entries.reduce((m, e) => Math.max(m, e.duration), 0)
            };
          });
          entry.scrollPerf = scrollPerf;
        }
        const state = await page.evaluate((routeName) => {
          const text = document.body?.innerText || '';
          const doc = document.documentElement;
          const wide = Math.max(doc.scrollWidth || 0, document.body?.scrollWidth || 0);
          const tall = Math.max(doc.scrollHeight || 0, document.body?.scrollHeight || 0);
          const picker = document.querySelector('.img-model-stable-menu-v434,.img-model-stable-menu-v432,.img-model-picker-panel');
          const pickerRect = picker ? picker.getBoundingClientRect() : null;
          const robot = document.getElementById('froxy-robot-root');
          const showcase = document.querySelector('#img-model-showcase-v350,.img-model-showcase-v350,.img-model-showcase-v354');
          return {
            title: document.title,
            bodyLen: text.length,
            viewportW: window.innerWidth,
            viewportH: window.innerHeight,
            scrollWidth: wide,
            scrollHeight: tall,
            horizontalOverflow: wide > window.innerWidth + 3,
            mojibake: /(?:Ãƒ|Ã„|Ã…|Ã‚|ï¿½|\uFFFD)/.test(text.slice(0, 200000)),
            pickerOpen: !!picker,
            pickerTooTall: pickerRect ? pickerRect.height > window.innerHeight - 24 : false,
            pickerOffscreen: pickerRect ? pickerRect.left < -2 || pickerRect.right > window.innerWidth + 2 || pickerRect.top < -2 || pickerRect.bottom > window.innerHeight + 2 : false,
            imageShowcaseVisible: !!(showcase && getComputedStyle(showcase).display !== 'none' && showcase.getBoundingClientRect().height > 8),
            adminRobotVisible: routeName === '/admin' && !!(robot && getComputedStyle(robot).display !== 'none' && getComputedStyle(robot).visibility !== 'hidden'),
            adminHasCleanAuthCta: routeName === '/admin' ? /Giriş|giriş|oturum|Sohbete/i.test(text) : true
          };
        }, route);
        entry.state = state;
        entry.ok = !state.horizontalOverflow && !state.mojibake && !state.pickerTooTall && !state.pickerOffscreen && !state.imageShowcaseVisible && !state.adminRobotVisible;
        if (!entry.ok) {
          entry.issues = Object.entries({
            horizontalOverflow: state.horizontalOverflow,
            mojibake: state.mojibake,
            pickerTooTall: state.pickerTooTall,
            pickerOffscreen: state.pickerOffscreen,
            imageShowcaseVisible: state.imageShowcaseVisible,
            adminRobotVisible: state.adminRobotVisible
          }).filter(([, v]) => v).map(([k]) => k);
        }
      } catch (err) {
        entry.error = err.message;
      }
      out.push(entry);
    }
    if (consoleErrors.length) sharedErrors.push(...consoleErrors);
    await page.close().catch(() => {});
  }
  return out;
}

function summarize(report) {
  const routes = Array.isArray(report.routes) ? report.routes : [];
  const failedRoutes = routes.filter((r) => !r.ok);
  const slowRoutes = routes.filter((r) => r.ms > 3500);
  const mojibakeRoutes = routes.filter((r) => r.mojibake);
  const uiFailures = (report.browser?.routeUi || []).filter((r) => !r.ok);
  const issues = [];
  if (!report.server?.health && !report.server?.ok) issues.push('server health failed');
  if (failedRoutes.length) issues.push(`failed routes: ${failedRoutes.map((r) => r.route).join(', ')}`);
  if (slowRoutes.length) issues.push(`slow routes: ${slowRoutes.map((r) => `${r.route} ${r.ms}ms`).join(', ')}`);
  if (mojibakeRoutes.length) issues.push(`raw html mojibake: ${mojibakeRoutes.map((r) => r.route).join(', ')}`);
  if (report.browser && report.browser.ok === false) issues.push('browser image UI check failed');
  if (report.browser && report.browser.modelLockOk === false) issues.push('image model lock failed');
  if (uiFailures.length) issues.push(`route UI audit failed: ${uiFailures.map((r) => `${r.route}/${r.viewport}`).join(', ')}`);
  report.summary = {
    ok: issues.length === 0,
    issues,
    routeOk: routes.filter((r) => r.ok).length,
    routeTotal: routes.length,
    localReady: report.providerSummary?.localReady || [],
    configuredCloud: report.providerSummary?.configuredCloud || []
  };
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    cwd: ROOT,
    policy: {
      mockedImageGenerationForModelLock: true,
      realProviderSmoke: RUN_PROVIDER_SMOKE,
      noTogetherSpendDuringDefaultCheck: true
    }
  };
  let child = null;
  try {
    child = await ensureServer(report);
    if (report.server && report.server.ok === false) throw new Error(report.server.error || 'server not ready');
    await routeChecks(report);
    await providerStatus(report);
    await browserChecks(report);
    summarize(report);
  } catch (err) {
    report.fatal = err.message;
    summarize(report);
    process.exitCode = 1;
  } finally {
    const outPath = path.join(OUT_DIR, `checkup-automation-${stamp()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: report.summary?.ok || false, report: outPath, summary: report.summary, fatal: report.fatal || '' }, null, 2));
    if (child) child.kill();
  }
})();
