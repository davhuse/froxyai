/**
 * Bug condition exploration test for the "Froxy AI rebrand + logo 404" bug.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10,
 *              2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10**
 *
 * Spec: .kiro/specs/froxy-ai-rebrand-and-logo-fix/
 *
 * These tests encode the **expected** behavior after the fix (Property 1):
 *   - No `<img>` references `logo.jpg` / `logo-192.jpg`; all logo paths use
 *     `.png` files that actually exist on disk.
 *   - No visible DOM text contains "AiPaketim" (mojibake repair helper in
 *     `app.js` source is not visible DOM text, so it is excluded).
 *   - `<title>`, `og:image`, `manifest.json`, contract modals, landing code
 *     panels, `robots.txt`, `sw.js` are all consistent with the Froxy AI
 *     brand and the `froxyai.com` domain family.
 *
 * UNFIXED-CODE EXPECTATION: every case below FAILS — the failure *is* the
 * bug-existence proof. Counter-examples are documented under
 *   tests/bugfix-froxy-rebrand/counterexamples.md
 *
 * Test conventions follow `tests/bugfix-image-empty-card/exploration.spec.ts`:
 * a mock user is injected via `addInitScript` so the auth modal stays closed
 * and `app.js` boot does not redirect us out of `#v-chat`. Playwright config
 * boots `node server.js` on port 3000 before the suite runs.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock user — same shape as `tests/bugfix-image-empty-card/exploration.spec.ts`
// uses, so we reach the same authenticated UI surface (nav visible, footer
// rendered, brand text + logos in DOM).
// ---------------------------------------------------------------------------
const MOCK_USER = {
  id: 'test-1',
  name: 'Test User',
  username: 'test',
  email: 't@e.com',
  pass: 'x',
  plan: 'enterprise',
  credits: 9_999_999,
  totalTokens: 9_999_999,
  usedTokens: 0,
  requests: 0,
  isAdmin: true,
  status: 'active',
};

async function bypassAuth(page: Page) {
  await page.addInitScript((mockUser) => {
    try {
      localStorage.setItem('ap_user', JSON.stringify(mockUser));
      localStorage.removeItem('saas_token');
    } catch (_) {
      /* ignore */
    }
  }, MOCK_USER);
}

/**
 * Open the SPA at `/index.html` and wait for `app.js` to finish wiring up the
 * panels. We do not switch panels — the chat / panel view (`#v-chat`) is
 * already `.on` by default in `index.html`, so nav, footer, sidebar and code
 * panels are all in the DOM after init.
 */
async function gotoApp(page: Page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  // app.js attaches `panelTab` to window during DOMContentLoaded; once it is
  // there we know the page-level scripts have finished running.
  await page.waitForFunction(
    () => typeof (window as any).panelTab === 'function',
    null,
    { timeout: 10_000 }
  );
  // Give a couple of ticks for any post-init UI text rendering.
  await page.waitForTimeout(500);
}

/**
 * Walk the rendered DOM and collect every visible (`getBoundingClientRect`
 * non-zero, not `display:none` / `visibility:hidden`) text node value plus
 * the `alt` attribute of visible images. We **explicitly** exclude content
 * inside `<script>` and `<style>` elements — that is source code, not DOM
 * text — which is what the spec calls out as "mojibake helper script body
 * does not count as DOM text".
 */
async function collectVisibleText(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      const parent = n.parentElement;
      if (!parent) continue;
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') {
        continue;
      }
      const cs = window.getComputedStyle(parent);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const text = (n.nodeValue || '').trim();
      if (text) out.push(text);
    }
    // Also include alt attributes of visible images — these are spoken out
    // by screen readers and, for our purposes, count as "visible" branding.
    document.querySelectorAll('img').forEach((img) => {
      const cs = window.getComputedStyle(img);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const alt = img.getAttribute('alt');
      if (alt) out.push(alt);
    });
    return out;
  });
}

test.describe('Property 1: Bug Condition — Logo 200 ve Froxy AI Marka Birliği', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
  });

  // -------------------------------------------------------------------------
  // Case 1: Logo paths must not reference .jpg files.
  //
  // The FS only contains logo.png / logo-192.png; any <img src> ending in
  // logo[-192].jpg is a 404 in waiting. Post-fix every <img> in the DOM
  // points at a .png. Unfixed code has multiple .jpg references in nav,
  // auth modal, footer, sidebar brand, and chat-welcome.
  // -------------------------------------------------------------------------
  test('Case 1 — no <img> src matches /logo(-192)?\\.jpg$/', async ({ page }) => {
    await gotoApp(page);

    const allImgSrcs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img')).map((i) => i.getAttribute('src') || '')
    );
    const badJpgRegex = /logo(-192)?\.jpg(\?.*)?$/i;
    const offending = allImgSrcs.filter((src) => badJpgRegex.test(src));

    test.info().annotations.push({
      type: 'counterexample',
      description: `Case 1 offending <img src> values: ${JSON.stringify(offending)}`,
    });

    expect(
      offending,
      'Expected zero <img> src values to match /logo(-192)?\\.jpg$/. ' +
        'On the unfixed code, nav, auth modal, footer and chat-welcome all ' +
        'still reference logo-192.jpg / logo.jpg even though only the .png ' +
        'files exist on disk — every such reference is a 404.'
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Case 2: No visible DOM text contains the literal "AiPaketim".
  //
  // Mojibake helper (`PHRASE_REPAIRS` in app.js source) is *script source*,
  // not DOM text, so collectVisibleText() already excludes <script> nodes.
  // -------------------------------------------------------------------------
  test('Case 2 — visible DOM contains no "AiPaketim" literal', async ({ page }) => {
    await gotoApp(page);

    const visibleText = await collectVisibleText(page);
    const hits = visibleText.filter((t) => t.includes('AiPaketim'));

    test.info().annotations.push({
      type: 'counterexample',
      description: `Case 2 sample DOM hits (first 5): ${JSON.stringify(hits.slice(0, 5))}; total=${hits.length}`,
    });

    expect(
      hits,
      'Expected no visible DOM text to contain "AiPaketim". ' +
        'On unfixed code, nav brand, sidebar brand, footer copyright, auth ' +
        'modal title and chat-welcome alt all surface the old brand.'
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Case 3: <title> reflects the Froxy AI brand.
  // -------------------------------------------------------------------------
  test('Case 3 — document.title contains "Froxy AI" and not "AiPaketim"', async ({ page }) => {
    await gotoApp(page);

    const title = await page.evaluate(() => document.title);

    test.info().annotations.push({
      type: 'counterexample',
      description: `Case 3 document.title = ${JSON.stringify(title)}`,
    });

    expect(title, 'document.title should contain "Froxy AI"').toContain('Froxy AI');
    expect(title, 'document.title should not contain "AiPaketim"').not.toContain('AiPaketim');
  });

  // -------------------------------------------------------------------------
  // Case 4: og:image meta points at froxyai.com, uses .png, returns 200.
  //
  // We HEAD the URL through Playwright's request fixture (request-context
  // routes do NOT apply here, so we get the real host's response). The local
  // dev server only serves files from this repo, so a URL on
  // `aipaketim.com` / `froxyai.com` will not 200 from `http://localhost:3000`.
  // We therefore validate (a) the URL string and (b) that the URL itself
  // refers to a .png file under froxyai.com — these are the in-repo
  // invariants that a fix would satisfy.
  // -------------------------------------------------------------------------
  test('Case 4 — og:image references froxyai.com and a .png asset', async ({ page }) => {
    await gotoApp(page);

    const ogImage = await page.evaluate(() => {
      const m = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
      return m ? m.content : '';
    });

    test.info().annotations.push({
      type: 'counterexample',
      description: `Case 4 og:image content = ${JSON.stringify(ogImage)}`,
    });

    expect(ogImage, 'og:image must be present').toBeTruthy();
    expect(ogImage, 'og:image must reference froxyai.com').toContain('froxyai.com');
    expect(ogImage, 'og:image must use the .png asset (not .jpg)').toMatch(/\.png(\?.*)?$/i);
    expect(ogImage, 'og:image must not reference aipaketim.com').not.toContain('aipaketim.com');
  });

  // -------------------------------------------------------------------------
  // Case 5: manifest.json is brand-consistent.
  //
  // Fetch through page.request so it goes to the Playwright webServer
  // (`node server.js`), parse JSON, then assert each invariant separately
  // so the counter-example surfaces the *exact* offending field.
  // -------------------------------------------------------------------------
  test('Case 5 — manifest.json name/short_name/description + icon types', async ({ page, request }) => {
    await gotoApp(page);

    const res = await request.get('/manifest.json');
    expect(res.status(), 'manifest.json must return 200').toBe(200);
    // Strip a leading UTF-8 BOM if present — JSON.parse cannot handle it but
    // the brand-consistency invariant is independent of file encoding.
    const raw = (await res.text()).replace(/^\uFEFF/, '');
    let manifest: any;
    try {
      manifest = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `manifest.json failed to parse as JSON (raw head=${JSON.stringify(raw.slice(0, 80))}): ${err}`
      );
    }

    test.info().annotations.push({
      type: 'counterexample',
      description: `Case 5 manifest snapshot: ${JSON.stringify(manifest)}`,
    });

    // Bug condition (per design.md): manifest.name / .short_name / .description
    // must contain "Froxy AI" and must not contain "AiPaketim". On the
    // unfixed code the description carries no brand at all and the icon
    // types are image/jpeg even though src is .png.
    for (const field of ['name', 'short_name', 'description'] as const) {
      const v = manifest[field] || '';
      expect(v, `manifest.${field} should contain "Froxy AI"`).toContain('Froxy AI');
      expect(v, `manifest.${field} should not contain "AiPaketim"`).not.toContain('AiPaketim');
    }

    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    expect(icons.length, 'manifest must declare at least one icon').toBeGreaterThan(0);
    for (const icon of icons) {
      expect(
        icon.type,
        `manifest icon ${JSON.stringify(icon.src)} type should be image/png`
      ).toBe('image/png');
    }
  });

  // -------------------------------------------------------------------------
  // Case 6: Contract modals are brand-consistent.
  //
  // The footer exposes triggers via `data-legal="..."` and `onclick=showLegal('...')`.
  // We invoke `window.showLegal(key)` directly via page.evaluate — that is
  // the function `app.js` exposes for these modals — read the rendered modal
  // body, then close the modal between iterations.
  // -------------------------------------------------------------------------
  test('Case 6 — privacy/terms/kvkk/disclaimer modals show Froxy AI + froxyai.com emails', async ({ page }) => {
    await gotoApp(page);

    // showLegal is registered on window inside app.js (`window.showLegal = showLegal;`).
    await page.waitForFunction(() => typeof (window as any).showLegal === 'function', null, {
      timeout: 5_000,
    });

    const keys = ['privacy', 'terms', 'kvkk', 'disclaimer'] as const;
    for (const key of keys) {
      const body = await page.evaluate((k: string) => {
        (window as any).showLegal(k);
        const el = document.getElementById('legal-body');
        return el ? el.textContent || '' : '';
      }, key);

      test.info().annotations.push({
        type: 'counterexample',
        description: `Case 6 modal=${key} body length=${body.length}; sample="${body.slice(0, 200)}"`,
      });

      expect(body.length, `${key} modal body must render some text`).toBeGreaterThan(0);
      expect(body, `${key} modal body should contain "Froxy AI"`).toContain('Froxy AI');
      expect(body, `${key} modal body should not contain "AiPaketim"`).not.toContain('AiPaketim');
      expect(
        body,
        `${key} modal body should reference destek@froxyai.com`
      ).toContain('destek@froxyai.com');
      expect(
        body,
        `${key} modal body should reference info@froxyai.com`
      ).toContain('info@froxyai.com');

      // Close the modal so we start the next iteration from a clean state.
      await page.evaluate(() => {
        const m = document.getElementById('legal-modal');
        if (m) m.classList.remove('open');
      });
    }
  });

  // -------------------------------------------------------------------------
  // Case 7: Landing code panels reference api.froxyai.com/v1, not
  // api.aipaketim.com/v1. The `<pre class="code-panel">` blocks live inside
  // the landing view (`#v-landing`) but are present in the DOM regardless
  // of whether that view is currently `.on`, because they ship in the
  // HTML payload. Asserting on `textContent` is sufficient and avoids
  // having to navigate into the landing view explicitly.
  // -------------------------------------------------------------------------
  test('Case 7 — landing code panels use api.froxyai.com/v1', async ({ page }) => {
    await gotoApp(page);

    const panels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('pre.code-panel, pre')).map((el) => el.textContent || '')
    );
    const allText = panels.join('\n---\n');

    test.info().annotations.push({
      type: 'counterexample',
      description:
        `Case 7 panel count=${panels.length}; ` +
        `aipaketim hits=${(allText.match(/api\.aipaketim\.com/g) || []).length}; ` +
        `froxyai hits=${(allText.match(/api\.froxyai\.com/g) || []).length}`,
    });

    expect(
      allText,
      'Code panels should reference api.froxyai.com/v1'
    ).toContain('api.froxyai.com/v1');
    expect(
      allText,
      'Code panels should not reference api.aipaketim.com/v1'
    ).not.toContain('api.aipaketim.com/v1');
  });

  // -------------------------------------------------------------------------
  // Case 8: robots.txt sitemap line points at https://froxyai.com/sitemap.xml.
  // -------------------------------------------------------------------------
  test('Case 8 — robots.txt declares https://froxyai.com/sitemap.xml', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status(), 'robots.txt must return 200').toBe(200);
    const body = await res.text();

    test.info().annotations.push({
      type: 'counterexample',
      description: `Case 8 robots.txt body=\n${body}`,
    });

    expect(
      body,
      'robots.txt should contain "Sitemap: https://froxyai.com/sitemap.xml"'
    ).toContain('Sitemap: https://froxyai.com/sitemap.xml');
    expect(
      body,
      'robots.txt should not reference aipaketim.com'
    ).not.toContain('aipaketim.com');
  });

  // -------------------------------------------------------------------------
  // Case 9: sw.js cache name uses the froxyai- prefix; the old
  // aipaketim-disabled-vNN cache name pattern is gone.
  // -------------------------------------------------------------------------
  test('Case 9 — sw.js cache name uses "froxyai-" prefix, not "aipaketim-"', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.status(), 'sw.js must return 200').toBe(200);
    const body = await res.text();

    test.info().annotations.push({
      type: 'counterexample',
      description: `Case 9 sw.js body=\n${body}`,
    });

    expect(
      body,
      'sw.js should declare a cache name that starts with "froxyai-"'
    ).toMatch(/['"]froxyai-[^'"]*['"]/);
    expect(
      body,
      'sw.js should not declare a cache name with the "aipaketim-disabled-v" pattern'
    ).not.toMatch(/aipaketim-disabled-v\d+/);
  });
});
