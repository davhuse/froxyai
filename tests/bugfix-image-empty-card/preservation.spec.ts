/**
 * Preservation property tests for the "image generation — empty card" bugfix.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * Spec: .kiro/specs/image-generation-empty-card-bugfix/
 *
 * Property 2 (Preservation): For any image-generation attempt that does NOT
 * trigger the bug condition (CDN succeeds OR shouldUseDirectImageModel is
 * false OR prompt is empty OR URL is data:/blob:), the *observable*
 * behaviour of `genImage` / `renderImageResult` / `pollinationsDirectUrl` /
 * `imageUrlForDisplay` / `addImageHistory` must remain identical to the
 * unfixed baseline.
 *
 * Methodology: observation-first. Each section below documents the exact
 * behaviour observed on the UNFIXED `app.min.js` and then encodes that
 * behaviour as an invariant. These tests therefore PASS on unfixed code
 * (baseline) and must continue to PASS after the fix in Task 3 (regression
 * guard).
 */

import { test, expect, type Page } from '@playwright/test';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Fixtures + helpers (mirrors exploration.spec.ts so behaviour stays
// consistent across the whole bugfix suite).
// ---------------------------------------------------------------------------

/** A 1×1 transparent PNG, exactly 67 bytes. Decoded by every modern
 *  browser regardless of the surrounding `Content-Type`. */
const TINY_PNG = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4' +
    '890000000D4944415478DA63F8FFFF3F0000050001019D81B7C9000000004945' +
    '4E44AE426082',
  'hex'
);

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

async function bypassAuthAndResetHistory(page: Page) {
  await page.addInitScript((mockUser) => {
    try {
      localStorage.setItem('ap_user', JSON.stringify(mockUser));
      localStorage.setItem('ap_image_history', JSON.stringify([]));
      localStorage.removeItem('saas_token');
    } catch (_) {
      /* ignore */
    }
  }, MOCK_USER);
}

async function gotoImagePanel(page: Page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      typeof (window as any).panelTab === 'function' &&
      !!document.getElementById('ptab-img'),
    null,
    { timeout: 10_000 }
  );
  await page.evaluate(() => (window as any).panelTab('image'));
  await page.locator('#ptab-img').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#img-prompt').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#img-model').waitFor({ state: 'attached', timeout: 10_000 });
}

/** Wait for `<img>` inside the freshly-rendered result card to actually
 *  decode (naturalWidth > 0). This is the post-load steady state we want
 *  to observe for the *successful* preservation cases. */
async function waitForImageLoaded(page: Page, timeoutMs = 10_000) {
  await page
    .locator('#img-result .image-result-card img')
    .waitFor({ state: 'attached', timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const img = document.querySelector(
        '#img-result .image-result-card img'
      ) as HTMLImageElement | null;
      return !!img && img.complete && img.naturalWidth > 0;
    },
    null,
    { timeout: timeoutMs }
  );
}

async function readImageState(page: Page) {
  return await page.evaluate(() => {
    const card = document.querySelector('#img-result .image-result-card');
    const errorCard = document.querySelector('#img-result .image-error-card');
    const img = card ? (card.querySelector('img') as HTMLImageElement | null) : null;
    const meta = card ? card.querySelector('.image-result-meta') : null;
    const actions = card ? card.querySelector('.image-result-actions') : null;
    let history: any[] = [];
    try {
      history = JSON.parse(localStorage.getItem('ap_image_history') || '[]');
    } catch (_) {
      history = [];
    }
    // `lastImgUrl` is declared as `let` at script top level in app.min.js,
    // which means it lives in the script's lexical environment — *not* on
    // `window`. Inside this `evaluate` callback we therefore reach it via a
    // plain bare-identifier lookup (eval) so the test sees the real value.
    let lastImgUrlVal = '';
    try {
      lastImgUrlVal = (0, eval)('typeof lastImgUrl === "string" ? lastImgUrl : ""');
    } catch (_) {
      lastImgUrlVal = '';
    }
    return {
      hasResultCard: !!card,
      hasErrorCard: !!errorCard,
      hasMeta: !!meta,
      hasActions: !!actions,
      imgSrc: img ? img.src : '',
      naturalWidth: img ? img.naturalWidth : -1,
      complete: img ? img.complete : false,
      lastImgUrl: lastImgUrlVal,
      historyLength: history.length,
      historyTopUrl: history[0]?.url || '',
      historyTopPrompt: history[0]?.prompt || '',
      historyTopModel: history[0]?.model || '',
    };
  });
}

// ===========================================================================
// 3.1 — Happy-path direct model: card layout + img loads + history +1
// ===========================================================================
//
// Observation on UNFIXED app.min.js:
//   prompt="forest", model="flux", CDN 200 + image bytes
//   ⇒ #img-result .image-result-card present
//   ⇒ <img>.naturalWidth > 0 once loaded
//   ⇒ ap_image_history grows by exactly 1 entry whose url matches the CDN url
//   ⇒ window.lastImgUrl === the same CDN url (sans the cache-buster)
//
// Invariant we encode: same DOM skeleton (img + meta + actions), naturalWidth
// > 0, history length 1, lastImgUrl points at the pollinations CDN.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.1): direct-model happy path', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('successful Flux CDN response keeps card + meta + actions layout intact', async ({
    page,
  }) => {
    await page.route('https://image.pollinations.ai/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: TINY_PNG, // browsers detect format from magic bytes regardless of CT
      })
    );

    await gotoImagePanel(page);
    await page.locator('#img-prompt').fill('forest');
    await page.locator('#img-model').selectOption({ value: 'flux' });
    await page.locator('#btn-gen-img').click();
    await waitForImageLoaded(page);

    const state = await readImageState(page);

    // Card skeleton — exactly what design.md §Preservation lists as untouched.
    expect(state.hasResultCard, 'result card must render').toBe(true);
    expect(state.hasMeta, 'meta block must render').toBe(true);
    expect(state.hasActions, 'actions block (Download/Regen/Edit) must render').toBe(true);
    expect(state.hasErrorCard, 'no error card on a successful CDN response').toBe(false);

    // <img> actually decoded.
    expect(state.naturalWidth).toBeGreaterThan(0);
    expect(state.complete).toBe(true);

    // History got +1 entry pointing at the pollinations CDN.
    expect(state.historyLength).toBe(1);
    expect(state.historyTopUrl).toContain('https://image.pollinations.ai/');
    expect(state.historyTopUrl).toContain('forest');
    expect(state.historyTopPrompt).toBe('forest');
    expect(state.historyTopModel).toBe('flux');

    // lastImgUrl matches the URL we put in history (cache-buster aside).
    expect(state.lastImgUrl.startsWith('https://image.pollinations.ai/')).toBe(true);
    // The displayed src has `?...&t=` appended by imageUrlForDisplay; the raw
    // history url should NOT include `&t=` because addImageHistory receives
    // the un-busted form from `pollinationsDirectUrl`.
    expect(state.historyTopUrl.includes('&t=')).toBe(false);
  });
});

// ===========================================================================
// 3.2 — Server-proxy branch (shouldUseDirectImageModel === false)
// ===========================================================================
//
// Observation on UNFIXED app.min.js:
//   model="imagen-4-fast" routes to /api/imagen (NOT direct CDN). With a
//   mocked `{url:'/generated/test.jpg'}` JSON response and a mocked
//   `/generated/test.jpg` image asset:
//   ⇒ #img-result .image-result-card present
//   ⇒ <img>.naturalWidth > 0 once loaded
//   ⇒ history grows by exactly 1, with url '/generated/test.jpg'
//
// Invariant: server-proxy branch keeps the same DOM contract as direct.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.2): server-proxy branch', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('imagen-* routes through /api/imagen and renders card with loaded image', async ({
    page,
  }) => {
    // Mock the JSON endpoint. Note: postJsonApi appends `_t=...`, so we
    // match with a glob.
    await page.route('**/api/imagen**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/generated/test.jpg' }),
      })
    );
    // Mock the image asset itself. imageUrlForDisplay appends `?t=...` so
    // again, glob.
    await page.route('**/generated/test.jpg**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: TINY_PNG,
      })
    );

    await gotoImagePanel(page);

    // Sanity: shouldUseDirectImageModel('imagen-4-fast') must be false on the
    // current build, otherwise this test isn't hitting the server-proxy
    // branch we mean to observe.
    const isDirect = await page.evaluate(() =>
      (window as any).shouldUseDirectImageModel('imagen-4-fast')
    );
    expect(
      isDirect,
      'imagen-4-fast must take the server-proxy branch for this test to be meaningful'
    ).toBe(false);

    await page.locator('#img-prompt').fill('cat in the rain');
    await page.locator('#img-model').selectOption({ value: 'imagen-4-fast' });
    await page.locator('#btn-gen-img').click();
    await waitForImageLoaded(page, 15_000);

    const state = await readImageState(page);

    expect(state.hasResultCard).toBe(true);
    expect(state.hasMeta).toBe(true);
    expect(state.hasActions).toBe(true);
    expect(state.hasErrorCard).toBe(false);

    expect(state.naturalWidth).toBeGreaterThan(0);
    expect(state.historyLength).toBe(1);
    expect(state.historyTopUrl).toBe('/generated/test.jpg');
    expect(state.historyTopPrompt).toBe('cat in the rain');
    expect(state.historyTopModel).toBe('imagen-4-fast');
    expect(state.lastImgUrl).toBe('/generated/test.jpg');
  });
});

// ===========================================================================
// 3.5 — style-* prompt suffix application
// ===========================================================================
//
// Observation on UNFIXED app.min.js:
//   pollinationsDirectUrl('ocean','style-cinematic') produces a URL whose
//   path component, after URL-decoding, contains:
//     "ocean, cinematic lighting, dramatic shadows, movie still"
//
// Invariant: every style-* model's signature suffix appears (URL-decoded)
// somewhere in the path of the returned URL, regardless of the prompt.
// ===========================================================================

const STYLE_SUFFIX_MARKERS: Record<string, string[]> = {
  'style-midjourney': ['Midjourney V6', 'masterpiece'],
  'style-dalle3': ['DALL-E 3 aesthetic'],
  'style-anime': ['anime style', 'expressive lighting'],
  'style-realism': ['ultra realistic', 'photorealistic'],
  'style-cinematic': ['cinematic lighting', 'dramatic shadows', 'movie still'],
  'style-3d': ['3d render', 'unreal engine 5'],
  'style-cyberpunk': ['cyberpunk style', 'neon lights'],
};

/** Decode the `/prompt/...` portion of a pollinations URL safely. */
function decodePromptPath(url: string): string {
  const u = new URL(url);
  // pathname is `/prompt/<encoded prompt+suffix>`
  const idx = u.pathname.indexOf('/prompt/');
  if (idx < 0) return '';
  const encoded = u.pathname.slice(idx + '/prompt/'.length);
  try {
    return decodeURIComponent(encoded);
  } catch (_) {
    return encoded;
  }
}

test.describe('Property 2 — Preservation (Requirement 3.5): style-* suffix', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('pollinationsDirectUrl("ocean","style-cinematic") embeds the cinematic suffix', async ({
    page,
  }) => {
    await gotoImagePanel(page);
    const url = await page.evaluate(() =>
      (window as any).pollinationsDirectUrl('ocean', 'style-cinematic')
    );
    const decoded = decodePromptPath(url);
    expect(decoded).toContain('ocean');
    for (const marker of STYLE_SUFFIX_MARKERS['style-cinematic']) {
      expect(decoded, `decoded path missing marker "${marker}"`).toContain(marker);
    }
  });

  test('pollinationsDirectUrl preserves every known style suffix for arbitrary prompts (PBT)', async ({
    page,
  }) => {
    await gotoImagePanel(page);

    // Constrain prompts to printable, non-empty strings so the URL stays
    // round-trippable through URL parsing.
    const promptArb = fc
      .string({ minLength: 1, maxLength: 60 })
      .filter((s) => s.trim().length > 0 && /^[\x20-\x7E]+$/.test(s));
    const styleArb = fc.constantFrom(
      ...(Object.keys(STYLE_SUFFIX_MARKERS) as Array<keyof typeof STYLE_SUFFIX_MARKERS>)
    );

    await fc.assert(
      fc.asyncProperty(promptArb, styleArb, async (prompt, style) => {
        const url = await page.evaluate(
          ({ p, m }) => (window as any).pollinationsDirectUrl(p, m),
          { p: prompt, m: style }
        );
        const decoded = decodePromptPath(url);
        if (!decoded.includes(prompt)) return false;
        const markers = STYLE_SUFFIX_MARKERS[style];
        return markers.every((marker) => decoded.includes(marker));
      }),
      { numRuns: 6, verbose: false }
    );
  });
});

// ===========================================================================
// 3.3 — imageUrlForDisplay invariants
// ===========================================================================
//
// Observation on UNFIXED app.min.js:
//   - imageUrlForDisplay('data:image/png;base64,...') === input
//   - imageUrlForDisplay('blob:https://x/y')         === input
//   - imageUrlForDisplay('https://example.com/x.jpg')
//       === 'https://example.com/x.jpg?t=<digits>'
//   - imageUrlForDisplay('https://example.com/x.jpg?v=1')
//       === 'https://example.com/x.jpg?v=1&t=<digits>'
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.3): imageUrlForDisplay', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('data: and blob: URLs are returned verbatim; http URLs get a ?t= cache-buster', async ({
    page,
  }) => {
    await gotoImagePanel(page);

    const result = await page.evaluate(() => {
      const fn = (window as any).imageUrlForDisplay as (u: string) => string;
      return {
        empty: fn(''),
        data: fn('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
        blob: fn('blob:https://example.com/abc-123-def'),
        plainHttp: fn('https://example.com/x.jpg'),
        httpWithQuery: fn('https://example.com/x.jpg?v=1&size=big'),
      };
    });

    expect(result.empty).toBe('');
    expect(result.data).toBe(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    );
    expect(result.blob).toBe('blob:https://example.com/abc-123-def');
    expect(result.plainHttp).toMatch(/^https:\/\/example\.com\/x\.jpg\?t=\d+$/);
    expect(result.httpWithQuery).toMatch(
      /^https:\/\/example\.com\/x\.jpg\?v=1&size=big&t=\d+$/
    );
  });

  test('imageUrlForDisplay invariants hold for arbitrary inputs (PBT)', async ({ page }) => {
    await gotoImagePanel(page);

    // data: branch — output equals input verbatim.
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 60 }).map((s) =>
          'data:image/png;base64,' + Buffer.from(s).toString('base64')
        ),
        async (input) => {
          const out = await page.evaluate(
            (u) => (window as any).imageUrlForDisplay(u),
            input
          );
          return out === input;
        }
      ),
      { numRuns: 8, verbose: false }
    );

    // blob: branch — output equals input verbatim.
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => 'blob:https://example.com/' + id),
        async (input) => {
          const out = await page.evaluate(
            (u) => (window as any).imageUrlForDisplay(u),
            input
          );
          return out === input;
        }
      ),
      { numRuns: 8, verbose: false }
    );

    // http(s) branch — output is `<input>?t=<digits>` (or
    // `<input>&t=<digits>` if the input already had a query string).
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'https://example.com/x.jpg',
          'https://cdn.example.com/path/to/img.png',
          'https://images.test/file.webp'
        ),
        fc.boolean(),
        async (base, withQuery) => {
          const input = withQuery ? base + '?v=1' : base;
          const out: string = await page.evaluate(
            (u) => (window as any).imageUrlForDisplay(u),
            input
          );
          const sep = withQuery ? '&' : '?';
          const re = new RegExp(
            '^' +
              input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
              sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
              't=\\d+$'
          );
          return re.test(out);
        }
      ),
      { numRuns: 8, verbose: false }
    );
  });
});

// ===========================================================================
// 3.6 (operational) — empty prompt: genImage early return, card never opens
// ===========================================================================
//
// Observation on UNFIXED app.min.js:
//   genImage() with prompt="" returns BEFORE setting #img-result innerHTML.
//   No CDN call is made; no result card and no error card are rendered;
//   ap_image_history is unchanged.
// ===========================================================================

test.describe('Property 2 — Preservation: empty prompt early-return', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('empty prompt does not open a card and does not touch history', async ({ page }) => {
    let cdnHits = 0;
    await page.route('https://image.pollinations.ai/**', (route) => {
      cdnHits += 1;
      return route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: TINY_PNG,
      });
    });

    await gotoImagePanel(page);
    await page.locator('#img-prompt').fill('   '); // whitespace-only -> trim() === ''
    await page.locator('#img-model').selectOption({ value: 'flux' });
    await page.locator('#btn-gen-img').click();

    // Give genImage a chance to *not* do anything async.
    await page.waitForTimeout(800);

    await expect(page.locator('#img-result .image-result-card')).toHaveCount(0);
    await expect(page.locator('#img-result .image-error-card')).toHaveCount(0);

    expect(cdnHits, 'Pollinations CDN must not be hit when prompt is empty').toBe(0);

    const historyLength = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('ap_image_history') || '[]').length;
      } catch {
        return -1;
      }
    });
    expect(historyLength).toBe(0);
  });
});

// ===========================================================================
// 3.4 — addImageHistory format + 24-entry FIFO cap
// ===========================================================================
//
// Observation on UNFIXED app.min.js:
//   After 25 successive addImageHistory(...) calls with distinct urls, the
//   localStorage `ap_image_history` array contains exactly 24 entries; the
//   oldest entry has been dropped. Each entry has shape
//   { url, prompt, model, date }. unshift order: newest first.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.4): history format + FIFO cap', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('25 sequential addImageHistory calls yield 24 entries, newest first', async ({
    page,
  }) => {
    await gotoImagePanel(page);

    const summary = await page.evaluate(() => {
      const fn = (window as any).addImageHistory as (
        u: string,
        p: string,
        m: string
      ) => void;
      for (let i = 0; i < 25; i++) {
        fn(`https://example.com/img-${i}.jpg`, `prompt-${i}`, 'flux');
      }
      let arr: any[] = [];
      try {
        arr = JSON.parse(localStorage.getItem('ap_image_history') || '[]');
      } catch (_) {
        arr = [];
      }
      const sample = arr[0] || null;
      return {
        len: arr.length,
        firstUrl: sample?.url ?? '',
        firstPrompt: sample?.prompt ?? '',
        firstModel: sample?.model ?? '',
        hasDate: !!sample?.date && !isNaN(Date.parse(sample.date)),
        lastUrl: arr[arr.length - 1]?.url ?? '',
        keys: sample ? Object.keys(sample).sort() : [],
      };
    });

    expect(summary.len).toBe(24);
    // unshift-newest-first: the 24th call ('img-24.jpg') is at index 0.
    expect(summary.firstUrl).toBe('https://example.com/img-24.jpg');
    expect(summary.firstPrompt).toBe('prompt-24');
    expect(summary.firstModel).toBe('flux');
    expect(summary.hasDate).toBe(true);
    // The first inserted url ('img-0.jpg') has been dropped.
    expect(summary.lastUrl).not.toBe('https://example.com/img-0.jpg');
    // Format stability: exactly these four keys per entry.
    expect(summary.keys).toEqual(['date', 'model', 'prompt', 'url']);
  });
});

// ===========================================================================
// PBT — Random successful direct-model attempts keep the card invariants
// ===========================================================================
//
// Random (non-empty, ASCII-printable) prompts × any direct model with a
// mocked 200 + image response: the result card must contain a loaded
// <img>, history must have grown by exactly 1, and lastImgUrl must point
// at the pollinations CDN.
// ===========================================================================

test.describe('Property 2 — Preservation (PBT): random direct-model successes', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('arbitrary printable prompts × direct models render + log history', async ({
    page,
  }) => {
    // Each fast-check iteration drives a real `genImage` + `<img>` load
    // round-trip; with shrinking, the per-test runtime can climb above the
    // global 60 s default. Give this property test more headroom.
    test.setTimeout(180_000);

    await page.route('https://image.pollinations.ai/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: TINY_PNG,
      })
    );

    // Navigate ONCE — fast-check iterations stay on the same page so we
    // don't accumulate init-scripts and don't pay the cost of a full
    // page load per shrink attempt.
    await gotoImagePanel(page);

    // Generators
    // Constrain to a tame ASCII alphabet so the test focuses on app
    // behaviour rather than on `<textarea>` keyboard semantics for exotic
    // characters. Prompts must also be already-trimmed because
    // `genImage()` trims `#img-prompt.value` before persisting it to
    // history; comparing against the un-trimmed source would create a
    // spurious counter-example out of pure whitespace.
    const promptArb = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter(
        (s) =>
          s.length > 0 &&
          s === s.trim() &&
          /^[A-Za-z0-9 .,()_+\-:]+$/.test(s)
      );
    // NOTE: index.html exposes a fixed `<option>` list. `turbo`/`sana` are
    // valid `shouldUseDirectImageModel` values *internally* but are NOT
    // selectable from the UI, so we restrict the property to models that
    // actually appear in `#img-model`. The style-* options *are* in the
    // markup and round-trip through `pollinationsPromptForModel`.
    const directModelArb = fc.constantFrom(
      'flux',
      'style-cinematic',
      'style-anime',
      'style-realism',
      'style-midjourney',
      'style-dalle3'
    );

    await fc.assert(
      fc.asyncProperty(promptArb, directModelArb, async (prompt, model) => {
        // Per-iteration reset: clear the result pane, the history, and the
        // global lastImgUrl so each iteration starts from a known state.
        await page.evaluate(() => {
          try {
            localStorage.setItem('ap_image_history', '[]');
          } catch (_) {
            /* ignore */
          }
          try {
            (0, eval)('lastImgUrl = ""');
          } catch (_) {
            /* ignore */
          }
          const r = document.getElementById('img-result');
          if (r) r.innerHTML = '';
        });

        await page.locator('#img-prompt').fill(prompt);
        await page.locator('#img-model').selectOption({ value: model });
        await page.locator('#btn-gen-img').click();
        try {
          await waitForImageLoaded(page, 8_000);
        } catch (_) {
          return false;
        }

        const state = await readImageState(page);
        return (
          state.hasResultCard &&
          state.hasMeta &&
          state.hasActions &&
          !state.hasErrorCard &&
          state.naturalWidth > 0 &&
          state.historyLength === 1 &&
          state.historyTopUrl.startsWith('https://image.pollinations.ai/') &&
          state.historyTopModel === model &&
          state.historyTopPrompt === prompt &&
          state.lastImgUrl.startsWith('https://image.pollinations.ai/')
        );
      }),
      // Each iteration triggers a real <img> load against the mocked CDN.
      // Keep numRuns modest so a full suite stays under the per-test
      // timeout (we already bumped it to 180s above).
      { numRuns: 3, verbose: false }
    );
  });
});
