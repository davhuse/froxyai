/**
 * Preservation property tests for the
 *   "image routing — multi-provider" bugfix.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**
 *
 * Spec: .kiro/specs/image-routing-multi-provider-bugfix/
 *
 * Property 2 (Preservation): For any image-generation flow that does NOT
 * trigger the routing/error-message bug condition (i.e. Pollinations
 * whitelist {flux, turbo, sana} or `style-*` for the direct branch;
 * `imagen-*`/`runware-*`/`stability-*`/`aiml-*`/`together-*`/`cf-sdxl` for
 * the server-proxy branch), the *observable* behaviour of `genImage`,
 * `pollinationsDirectUrl`, `shouldUseDirectImageModel`,
 * `imageUrlForDisplay`, `addImageHistory`, and `renderImageErrorCard` MUST
 * remain identical to the unfixed baseline.
 *
 * Methodology — observation-first: every test below first documents the
 * exact behaviour we observed by running the test against the UNFIXED
 * `app.min.js`, then encodes that behaviour as an invariant. The whole
 * suite therefore PASSES on the unfixed code (baseline) and is expected to
 * keep passing after the Task 3 fix is applied (regression guard).
 *
 * Notes:
 *  - `lastImgUrl` is declared as a top-level `let` in `app.min.js` and is
 *    NOT exposed on `window`. We reach it inside `page.evaluate` via the
 *    `(0, eval)('lastImgUrl')` indirect-eval trick, exactly like the
 *    existing `tests/bugfix-image-empty-card/preservation.spec.ts`.
 *  - `#img-model` exposes a fixed `<option>` list. For models that aren't
 *    in the markup (`turbo`, `sana`, `imagen-3`), we inject options on the
 *    fly via `ensureModelOption`, mirroring the helper in
 *    `tests/bugfix-image-routing/exploration.spec.ts`.
 *  - For server-proxy routing of `runware-*`, `stability-*`, `aiml-*`,
 *    `cf-sdxl`, `together-*` we need user-provided API keys in
 *    localStorage so `shouldUseDirectImageModel` returns `false` (the
 *    unfixed second branch keeps these models on the *direct* CDN as a
 *    fallback when no key is set).
 */

import { test, expect, type Page } from '@playwright/test';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Shared fixtures + helpers
// ---------------------------------------------------------------------------

/** A 1×1 transparent PNG (67 bytes). Browsers decode it from the magic
 *  bytes regardless of the surrounding `Content-Type`, so this is safe as
 *  a stand-in for `image/jpeg` mocks too. */
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

/** Provider keys we seed into `ap_user_keys` so
 *  `providerKeyFor(imageProviderForModel(<server-proxy model>))` returns a
 *  truthy value. Without this, `shouldUseDirectImageModel` returns `true`
 *  for `runware-*` / `stability-*` / `aiml-*` / `cf-sdxl` / `together-*`
 *  (the unfixed code's "no key → direct fallback" branch). */
const PROVIDER_KEYS = {
  runware: 'test-runware-key',
  stability: 'test-stability-key',
  together: 'test-together-key',
  aimlapi: 'test-aimlapi-key',
  cloudflare: 'test-cloudflare-key',
  gemini: 'test-gemini-key',
};

async function bypassAuthAndResetHistory(page: Page) {
  await page.addInitScript(
    ([mockUser, providerKeys]) => {
      try {
        localStorage.setItem('ap_user', JSON.stringify(mockUser));
        localStorage.setItem('ap_image_history', JSON.stringify([]));
        localStorage.setItem('ap_user_keys', JSON.stringify(providerKeys));
        localStorage.removeItem('saas_token');
      } catch (_) {
        /* ignore */
      }
    },
    [MOCK_USER, PROVIDER_KEYS] as const
  );
}

async function gotoImagePanel(page: Page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      typeof (window as any).panelTab === 'function' &&
      typeof (window as any).shouldUseDirectImageModel === 'function' &&
      typeof (window as any).pollinationsDirectUrl === 'function' &&
      typeof (window as any).imageUrlForDisplay === 'function' &&
      typeof (window as any).renderImageErrorCard === 'function' &&
      typeof (window as any).getImageModelLabel === 'function' &&
      typeof (window as any).addImageHistory === 'function' &&
      !!document.getElementById('ptab-img'),
    null,
    { timeout: 15_000 }
  );
  await page.evaluate(() => (window as any).panelTab('image'));
  await page.locator('#ptab-img').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#img-prompt').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#img-model').waitFor({ state: 'attached', timeout: 10_000 });
}

/** Inject an `<option>` into `#img-model` if missing. The routing helpers
 *  read the model value directly from the `<select>`, so this is the
 *  minimum-viable setup for models not in the static markup
 *  (e.g. `turbo`, `sana`, `imagen-3`). */
async function ensureModelOption(page: Page, value: string, label: string) {
  await page.evaluate(
    ([v, l]) => {
      const sel = document.getElementById('img-model') as HTMLSelectElement | null;
      if (!sel) throw new Error('img-model not found');
      if (![...sel.options].some((o) => o.value === v)) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = l;
        sel.appendChild(opt);
      }
    },
    [value, label] as const
  );
}

/** Wait for the `<img>` inside the freshly-rendered result card to actually
 *  decode (`naturalWidth > 0`). This is the post-load steady state for the
 *  successful preservation cases. */
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
    let lastImgUrlVal = '';
    try {
      lastImgUrlVal = (0, eval)(
        'typeof lastImgUrl === "string" ? lastImgUrl : ""'
      );
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

/** Reset DOM + history + lastImgUrl between PBT iterations so each
 *  iteration starts from a known-clean state without paying for a full
 *  page navigation. */
async function resetPerIterationState(page: Page) {
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
}

// ===========================================================================
// 3.1 / 3.2 — Pollinations whitelist direct URL (model query param round-trip)
// ===========================================================================
//
// Observation on UNFIXED app.min.js (`pollinationsDirectUrl` body):
//
//   const safeModel = String(model||'').startsWith('style-')
//     ? 'flux'
//     : (POLLINATIONS_SUPPORTED_MODELS.includes(model) ? model : 'flux');
//
// where `POLLINATIONS_SUPPORTED_MODELS = ['flux','turbo','sana']`.
//
// Therefore:
//   - pollinationsDirectUrl('cat','flux')  → ?model=flux&...
//   - pollinationsDirectUrl('dog','turbo') → ?model=turbo&...
//   - pollinationsDirectUrl('fish','sana') → ?model=sana&...
//
// Invariant: for every prompt and every whitelist model, the returned
// URL's `model=` query parameter equals the model the caller passed in
// (i.e. NO silent fallback for whitelist members).
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.1, 3.2): whitelist direct URL', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
    await gotoImagePanel(page);
  });

  test('pollinationsDirectUrl preserves model= for flux/turbo/sana (deterministic)', async ({
    page,
  }) => {
    const samples = [
      { prompt: 'cat', model: 'flux' },
      { prompt: 'dog', model: 'turbo' },
      { prompt: 'fish', model: 'sana' },
    ];
    for (const { prompt, model } of samples) {
      const url = await page.evaluate(
        ([p, m]) => (window as any).pollinationsDirectUrl(p, m) as string,
        [prompt, model] as const
      );
      const u = new URL(url);
      expect(u.searchParams.get('model'), `model param for ${model}`).toBe(model);
      expect(u.host).toBe('image.pollinations.ai');
      // The path encodes the prompt — sanity check the round-trip.
      expect(decodeURIComponent(u.pathname)).toContain(prompt);
    }
  });

  test('PBT: arbitrary printable prompt × {flux,turbo,sana} → URL.model=<input>', async ({
    page,
  }) => {
    const promptArb = fc
      .string({ minLength: 1, maxLength: 60 })
      .filter((s) => s.trim().length > 0 && /^[\x20-\x7E]+$/.test(s));
    const modelArb = fc.constantFrom('flux', 'turbo', 'sana');

    await fc.assert(
      fc.asyncProperty(promptArb, modelArb, async (prompt, model) => {
        const url: string = await page.evaluate(
          ({ p, m }) => (window as any).pollinationsDirectUrl(p, m),
          { p: prompt, m: model }
        );
        const u = new URL(url);
        return (
          u.host === 'image.pollinations.ai' &&
          u.searchParams.get('model') === model
        );
      }),
      { numRuns: 8, verbose: false }
    );
  });

  test('shouldUseDirectImageModel returns true for flux/turbo/sana/style-cinematic', async ({
    page,
  }) => {
    const truthy = await page.evaluate(() => ({
      flux: (window as any).shouldUseDirectImageModel('flux'),
      turbo: (window as any).shouldUseDirectImageModel('turbo'),
      sana: (window as any).shouldUseDirectImageModel('sana'),
      style: (window as any).shouldUseDirectImageModel('style-cinematic'),
    }));
    expect(truthy.flux).toBe(true);
    expect(truthy.turbo).toBe(true);
    expect(truthy.sana).toBe(true);
    expect(truthy.style).toBe(true);
  });
});

// ===========================================================================
// 3.5 — style-* prompt suffix application
// ===========================================================================
//
// Observation on UNFIXED app.min.js (`pollinationsPromptForModel` body):
//
//   styles = {
//     'style-midjourney':  ', in the style of Midjourney V6, ...',
//     'style-dalle3':      ', DALL-E 3 aesthetic, ...',
//     'style-anime':       ', anime style, ...',
//     'style-realism':     ', ultra realistic, ...',
//     'style-cinematic':   ', cinematic lighting, dramatic shadows, movie still',
//     'style-3d':          ', 3d render, unreal engine 5, ...',
//     'style-cyberpunk':   ', cyberpunk style, neon lights, ...',
//   };
//
// And `pollinationsDirectUrl` rewrites `model=` to `flux` for every
// `style-*` model. Invariant: each style-* signature suffix appears
// (URL-decoded) in the path AND `?model=flux`.
// ===========================================================================

const STYLE_SUFFIX_MARKERS: Record<string, string[]> = {
  'style-cinematic': ['cinematic lighting', 'dramatic shadows', 'movie still'],
  'style-anime': ['anime style', 'expressive lighting'],
  'style-realism': ['ultra realistic', 'photorealistic'],
  'style-3d': ['3d render', 'unreal engine 5'],
  'style-cyberpunk': ['cyberpunk style', 'neon lights'],
};

function decodePromptPath(url: string): string {
  const u = new URL(url);
  const idx = u.pathname.indexOf('/prompt/');
  if (idx < 0) return '';
  const encoded = u.pathname.slice(idx + '/prompt/'.length);
  try {
    return decodeURIComponent(encoded);
  } catch (_) {
    return encoded;
  }
}

test.describe('Property 2 — Preservation (Requirement 3.3): style-* suffix', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
    await gotoImagePanel(page);
  });

  test('pollinationsDirectUrl("ocean","style-cinematic") embeds suffix and uses model=flux', async ({
    page,
  }) => {
    const url: string = await page.evaluate(() =>
      (window as any).pollinationsDirectUrl('ocean', 'style-cinematic')
    );
    const u = new URL(url);
    expect(u.searchParams.get('model')).toBe('flux');
    const decoded = decodePromptPath(url);
    expect(decoded).toContain('ocean');
    for (const marker of STYLE_SUFFIX_MARKERS['style-cinematic']) {
      expect(decoded, `decoded path missing marker "${marker}"`).toContain(marker);
    }
  });

  test('PBT: every style-* model → URL.model=flux AND suffix present', async ({
    page,
  }) => {
    const promptArb = fc
      .string({ minLength: 1, maxLength: 40 })
      .filter((s) => s.trim().length > 0 && /^[\x20-\x7E]+$/.test(s));
    const styleArb = fc.constantFrom(
      'style-cinematic',
      'style-anime',
      'style-realism',
      'style-3d',
      'style-cyberpunk'
    );

    await fc.assert(
      fc.asyncProperty(promptArb, styleArb, async (prompt, style) => {
        const url: string = await page.evaluate(
          ({ p, m }) => (window as any).pollinationsDirectUrl(p, m),
          { p: prompt, m: style }
        );
        const u = new URL(url);
        if (u.searchParams.get('model') !== 'flux') return false;
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
// 3.4 — Direct flux happy-path observation
// ===========================================================================
//
// Observation on UNFIXED app.min.js with prompt="forest", model="flux", and
// `image.pollinations.ai/**` mocked to return 200 + image bytes:
//   ⇒ #img-result .image-result-card present
//   ⇒ <img>.naturalWidth > 0 once loaded
//   ⇒ ap_image_history grows by exactly 1 entry, url starts with the CDN
//   ⇒ lastImgUrl points at the same CDN url
// ===========================================================================

test.describe('Property 2 — Preservation: direct flux happy path', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('prompt="forest" + flux + Pollinations 200 → card render, history+1, lastImgUrl set', async ({
    page,
  }) => {
    await page.route('https://image.pollinations.ai/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: TINY_PNG,
      })
    );

    await gotoImagePanel(page);
    await page.locator('#img-prompt').fill('forest');
    await page.locator('#img-model').selectOption({ value: 'flux' });
    await page.locator('#btn-gen-img').click();
    await waitForImageLoaded(page);

    const state = await readImageState(page);
    expect(state.hasResultCard).toBe(true);
    expect(state.hasMeta).toBe(true);
    expect(state.hasActions).toBe(true);
    expect(state.hasErrorCard).toBe(false);
    expect(state.naturalWidth).toBeGreaterThan(0);
    expect(state.complete).toBe(true);
    expect(state.historyLength).toBe(1);
    expect(state.historyTopUrl).toContain('https://image.pollinations.ai/');
    expect(state.historyTopUrl).toContain('forest');
    expect(state.historyTopPrompt).toBe('forest');
    expect(state.historyTopModel).toBe('flux');
    expect(state.lastImgUrl.startsWith('https://image.pollinations.ai/')).toBe(true);
  });
});

// ===========================================================================
// 3.6 / 3.7 — Server-proxy dispatch observations + PBT
// ===========================================================================
//
// Observation on UNFIXED app.min.js (`genImage` body):
//
//   const isImagen = model.startsWith('imagen-');
//   const endpoint = isImagen ? '/api/imagen' : '/api/image';
//   const {res,data} = await postJsonApi(endpoint, { prompt, model, apiKey: ... });
//
// With `ap_user_keys` pre-populated so `shouldUseDirectImageModel` returns
// `false` for `runware-*`/`stability-*`/`aiml-*`/`cf-sdxl`/`together-*`,
// and `imagen-*` already routes to the server-proxy regardless of keys,
// the click handler issues exactly one POST to the right endpoint with
// `body.model === <input>`.
// ===========================================================================

/** Build the standard server-proxy mocks. Returns counters + body capture
 *  so individual tests can assert on what flowed through. */
function installServerProxyMocks(page: Page) {
  const seen = {
    apiImageCalls: 0,
    apiImagenCalls: 0,
    pollinationsCalls: 0,
    apiImageBodies: [] as Array<any>,
    apiImagenBodies: [] as Array<any>,
  };
  // Normalize on a unique generated URL per call so `addImageHistory` can
  // dedupe by url cleanly.
  //
  // IMPORTANT: glob patterns like `**/api/image**` would also match
  // `/api/imagen?...` because `image` is a prefix of `imagen`. We use
  // anchored regexes here so each handler matches exactly one endpoint.
  let counter = 0;
  page.route(/\/api\/imagen(\?.*)?$/, (route) => {
    seen.apiImagenCalls++;
    let parsed: any = null;
    try {
      parsed = JSON.parse(route.request().postData() || '{}');
    } catch (_) {
      parsed = null;
    }
    seen.apiImagenBodies.push(parsed);
    counter++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: `/generated/test-imagen-${counter}.jpg` }),
    });
  });
  page.route(/\/api\/image(\?.*)?$/, (route) => {
    seen.apiImageCalls++;
    let parsed: any = null;
    try {
      parsed = JSON.parse(route.request().postData() || '{}');
    } catch (_) {
      parsed = null;
    }
    seen.apiImageBodies.push(parsed);
    counter++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: `/generated/test-image-${counter}.jpg` }),
    });
  });
  page.route('**/generated/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: TINY_PNG,
    })
  );
  page.route('https://image.pollinations.ai/**', (route) => {
    seen.pollinationsCalls++;
    return route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: TINY_PNG,
    });
  });
  return seen;
}

test.describe('Property 2 — Preservation (Requirement 3.4): imagen-* server proxy', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('imagen-4-fast + /api/imagen mock 200 → card render, history+1', async ({
    page,
  }) => {
    const seen = installServerProxyMocks(page);
    await gotoImagePanel(page);

    // Sanity: imagen-4-fast must take the server-proxy branch.
    const isDirect = await page.evaluate(() =>
      (window as any).shouldUseDirectImageModel('imagen-4-fast')
    );
    expect(isDirect, 'imagen-4-fast must take server-proxy branch').toBe(false);

    await page.locator('#img-prompt').fill('cat in the rain');
    await page.locator('#img-model').selectOption({ value: 'imagen-4-fast' });
    await page.locator('#btn-gen-img').click();
    await waitForImageLoaded(page, 15_000);

    const state = await readImageState(page);
    expect(state.hasResultCard).toBe(true);
    expect(state.hasErrorCard).toBe(false);
    expect(state.naturalWidth).toBeGreaterThan(0);
    expect(state.historyLength).toBe(1);
    expect(state.historyTopPrompt).toBe('cat in the rain');
    expect(state.historyTopModel).toBe('imagen-4-fast');
    expect(state.historyTopUrl).toMatch(/^\/generated\/test-imagen-\d+\.jpg$/);

    expect(seen.apiImagenCalls).toBeGreaterThan(0);
    expect(seen.apiImageCalls).toBe(0);
    expect(seen.pollinationsCalls).toBe(0);
    expect(seen.apiImagenBodies[0]?.model).toBe('imagen-4-fast');
    expect(seen.apiImagenBodies[0]?.prompt).toBe('cat in the rain');
  });
});

test.describe('Property 2 — Preservation (Requirement 3.5): /api/image server proxy', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  // Each model in this list maps to a non-Pollinations provider whose key
  // we seeded in PROVIDER_KEYS. With keys present, the unfixed
  // `shouldUseDirectImageModel` returns `false` and `genImage` POSTs to
  // `/api/image`.
  const NON_IMAGEN_MODELS = [
    'runware-flux',
    'stability-core',
    'aiml-flux',
    'cf-sdxl',
    'together-flux',
  ] as const;

  for (const model of NON_IMAGEN_MODELS) {
    test(`${model} + /api/image mock 200 → card render, history+1, body.model="${model}"`, async ({
      page,
    }) => {
      const seen = installServerProxyMocks(page);
      await gotoImagePanel(page);

      const isDirect = await page.evaluate(
        (m) => (window as any).shouldUseDirectImageModel(m),
        model
      );
      expect(
        isDirect,
        `${model} must take server-proxy branch (key present)`
      ).toBe(false);

      await page.locator('#img-prompt').fill(`prompt-${model}`);
      await page.locator('#img-model').selectOption({ value: model });
      await page.locator('#btn-gen-img').click();
      await waitForImageLoaded(page, 15_000);

      const state = await readImageState(page);
      expect(state.hasResultCard, `${model}: result card`).toBe(true);
      expect(state.hasErrorCard, `${model}: no error card`).toBe(false);
      expect(state.naturalWidth, `${model}: image decoded`).toBeGreaterThan(0);
      expect(state.historyLength, `${model}: history+1`).toBe(1);
      expect(state.historyTopModel, `${model}: history.model`).toBe(model);

      expect(seen.apiImageCalls, `${model}: /api/image called`).toBeGreaterThan(0);
      expect(seen.apiImagenCalls, `${model}: /api/imagen NOT called`).toBe(0);
      expect(seen.pollinationsCalls, `${model}: pollinations NOT called`).toBe(0);
      expect(
        seen.apiImageBodies[0]?.model,
        `${model}: body.model`
      ).toBe(model);
    });
  }
});

test.describe('Property 2 — Preservation (PBT): server-proxy dispatch routing', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('PBT: server-proxy models hit the right endpoint with body.model preserved', async ({
    page,
  }) => {
    // Iterations include real <img> load round-trips against mocked
    // endpoints. Bump the timeout so the suite has headroom under shrinking.
    test.setTimeout(180_000);

    const seen = installServerProxyMocks(page);
    await gotoImagePanel(page);

    // Models present in #img-model markup so we don't need ensureModelOption.
    // imagen-4 / imagen-4-fast / imagen-4-ultra → /api/imagen
    // runware-* / stability-* / together-flux / aiml-* / cf-sdxl → /api/image
    const imagenArb = fc.constantFrom(
      'imagen-4',
      'imagen-4-fast',
      'imagen-4-ultra'
    );
    const otherArb = fc.constantFrom(
      'runware-flux',
      'runware-sdxl',
      'stability-core',
      'stability-ultra',
      'together-flux',
      'aiml-flux',
      'aiml-nano',
      'cf-sdxl'
    );
    const modelArb = fc.oneof(imagenArb, otherArb);
    const promptArb = fc
      .string({ minLength: 1, maxLength: 25 })
      .filter(
        (s) =>
          s.length > 0 &&
          s === s.trim() &&
          /^[A-Za-z0-9 .,()_+\-:]+$/.test(s)
      );

    await fc.assert(
      fc.asyncProperty(promptArb, modelArb, async (prompt, model) => {
        await resetPerIterationState(page);
        const beforeImage = seen.apiImageCalls;
        const beforeImagen = seen.apiImagenCalls;
        const beforePoll = seen.pollinationsCalls;
        const beforeImageBodies = seen.apiImageBodies.length;
        const beforeImagenBodies = seen.apiImagenBodies.length;

        await page.locator('#img-prompt').fill(prompt);
        await page.locator('#img-model').selectOption({ value: model });
        await page.locator('#btn-gen-img').click();
        try {
          await waitForImageLoaded(page, 8_000);
        } catch (_) {
          return false;
        }

        const isImagen = model.startsWith('imagen-');
        const imageDelta = seen.apiImageCalls - beforeImage;
        const imagenDelta = seen.apiImagenCalls - beforeImagen;
        const pollDelta = seen.pollinationsCalls - beforePoll;

        if (pollDelta !== 0) return false;
        if (isImagen) {
          if (imagenDelta < 1 || imageDelta !== 0) return false;
          const body = seen.apiImagenBodies[beforeImagenBodies];
          if (!body || body.model !== model || body.prompt !== prompt) return false;
        } else {
          if (imageDelta < 1 || imagenDelta !== 0) return false;
          const body = seen.apiImageBodies[beforeImageBodies];
          if (!body || body.model !== model || body.prompt !== prompt) return false;
        }

        const state = await readImageState(page);
        return (
          state.hasResultCard &&
          !state.hasErrorCard &&
          state.naturalWidth > 0 &&
          state.historyLength === 1 &&
          state.historyTopModel === model &&
          state.historyTopPrompt === prompt
        );
      }),
      { numRuns: 3, verbose: false }
    );
  });
});

// ===========================================================================
// 3.8 — addImageHistory FIFO cap (25 → 24)
// ===========================================================================
//
// Observation on UNFIXED app.min.js: 25 successive addImageHistory(...)
// calls with distinct urls leave `ap_image_history` with exactly 24
// entries; oldest is dropped, newest is at index 0.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.6): history FIFO cap', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
    await gotoImagePanel(page);
  });

  test('25 sequential addImageHistory calls yield exactly 24 entries (newest first)', async ({
    page,
  }) => {
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
        lastUrl: arr[arr.length - 1]?.url ?? '',
        keys: sample ? Object.keys(sample).sort() : [],
      };
    });

    expect(summary.len).toBe(24);
    expect(summary.firstUrl).toBe('https://example.com/img-24.jpg');
    expect(summary.firstPrompt).toBe('prompt-24');
    expect(summary.firstModel).toBe('flux');
    // The oldest entry (img-0) was dropped from the FIFO window.
    expect(summary.lastUrl).not.toBe('https://example.com/img-0.jpg');
    expect(summary.keys).toEqual(['date', 'model', 'prompt', 'url']);
  });
});

// ===========================================================================
// 3.7 — Empty prompt early return
// ===========================================================================
//
// Observation on UNFIXED app.min.js (`genImage` first line):
//
//   if(!prompt) return msg('Lütfen bir prompt girin!','error');
//
// `prompt` here is `promptEl.value.trim()`, so '', '   ', and ' \t '
// (which trim to '') trigger the early return. No CDN/API call is made,
// no card is rendered, history is unchanged.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.7): empty prompt early return', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('PBT: whitespace-only prompts × multiple models → no card, no network', async ({
    page,
  }) => {
    let pollHits = 0;
    let apiImageHits = 0;
    let apiImagenHits = 0;
    await page.route('https://image.pollinations.ai/**', (route) => {
      pollHits++;
      return route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: TINY_PNG,
      });
    });
    // Anchored regexes so `/api/image` does not catch `/api/imagen` (which
    // shares the prefix).
    await page.route(/\/api\/imagen(\?.*)?$/, (route) => {
      apiImagenHits++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/generated/should-not-load.jpg' }),
      });
    });
    await page.route(/\/api\/image(\?.*)?$/, (route) => {
      apiImageHits++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/generated/should-not-load.jpg' }),
      });
    });

    await gotoImagePanel(page);

    const emptyPromptArb = fc.constantFrom('', '   ', ' \t ');
    const modelArb = fc.constantFrom(
      'flux',
      'style-cinematic',
      'imagen-4-fast',
      'runware-flux',
      'aiml-flux',
      'cf-sdxl'
    );

    await fc.assert(
      fc.asyncProperty(emptyPromptArb, modelArb, async (prompt, model) => {
        await resetPerIterationState(page);
        const beforePoll = pollHits;
        const beforeImg = apiImageHits;
        const beforeImagen = apiImagenHits;

        // Use page.evaluate to set the value directly so we don't have to
        // worry about Playwright's keyboard semantics for tabs/spaces.
        await page.evaluate(
          ([p, m]) => {
            const ta = document.getElementById('img-prompt') as HTMLTextAreaElement;
            const sel = document.getElementById('img-model') as HTMLSelectElement;
            ta.value = p;
            sel.value = m;
          },
          [prompt, model] as const
        );
        await page.locator('#btn-gen-img').click();
        // Allow the synchronous early-return path to settle. We don't wait
        // for any DOM mutation because there shouldn't be one.
        await page.waitForTimeout(300);

        const cards = await page.locator('#img-result .image-result-card').count();
        const errors = await page.locator('#img-result .image-error-card').count();
        const historyLen = await page.evaluate(() => {
          try {
            return JSON.parse(localStorage.getItem('ap_image_history') || '[]').length;
          } catch {
            return -1;
          }
        });

        return (
          cards === 0 &&
          errors === 0 &&
          historyLen === 0 &&
          pollHits === beforePoll &&
          apiImageHits === beforeImg &&
          apiImagenHits === beforeImagen
        );
      }),
      { numRuns: 3, verbose: false }
    );
  });
});

// ===========================================================================
// 3.9 — imageUrlForDisplay: data:/blob: pass-through, http(s) cache-buster
// ===========================================================================
//
// Observation on UNFIXED app.min.js:
//   imageUrlForDisplay('') === ''
//   imageUrlForDisplay('data:image/png;base64,XXX') === 'data:image/png;base64,XXX'
//   imageUrlForDisplay('blob:https://x/y') === 'blob:https://x/y'
//   imageUrlForDisplay('https://e.com/x.jpg') === 'https://e.com/x.jpg?t=<digits>'
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.9): imageUrlForDisplay passthrough', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
    await gotoImagePanel(page);
  });

  test('PBT: data: prefix → output equals input verbatim', async ({ page }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 60 }).map(
          (s) => 'data:image/png;base64,' + Buffer.from(s).toString('base64')
        ),
        async (input) => {
          const out: string = await page.evaluate(
            (u) => (window as any).imageUrlForDisplay(u),
            input
          );
          return out === input;
        }
      ),
      { numRuns: 8, verbose: false }
    );
  });

  test('PBT: blob: prefix → output equals input verbatim', async ({ page }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid().map((id) => 'blob:https://example.com/' + id),
        async (input) => {
          const out: string = await page.evaluate(
            (u) => (window as any).imageUrlForDisplay(u),
            input
          );
          return out === input;
        }
      ),
      { numRuns: 8, verbose: false }
    );
  });
});

// ===========================================================================
// 3.10 — renderImageErrorCard preserves the model label
// ===========================================================================
//
// Observation on UNFIXED app.min.js (`renderImageErrorCard` body):
//
//   <strong>${esc(getImageModelLabel(model))}</strong>
//
// inside `image-error-meta`. The label is rendered regardless of which
// model was selected. This property must keep holding after Task 3.3
// (which only changes the body sentence, not the label).
//
// NOTE: This deliberately overlaps with Case D in exploration.spec.ts —
// the spec lists it as a preservation invariant in its own right.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.10): error card label preserved', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
    await gotoImagePanel(page);
  });

  test('renderImageErrorCard surfaces getImageModelLabel(model) for known models', async ({
    page,
  }) => {
    const samples = ['flux', 'imagen-4', 'runware-flux', 'stability-core'];
    for (const model of samples) {
      const { text, label } = await page.evaluate((m) => {
        const div = document.createElement('div');
        (window as any).renderImageErrorCard(div, 'cat', m, 'about:blank');
        return {
          text: div.textContent || '',
          label: (window as any).getImageModelLabel(m) as string,
        };
      }, model);
      expect(label, `getImageModelLabel(${model}) must be non-empty`).toBeTruthy();
      expect(
        text.includes(label),
        `error card for "${model}" must contain label "${label}", got: ${text}`
      ).toBe(true);
    }
  });

  test('PBT: arbitrary model + arbitrary prompt → label always rendered', async ({
    page,
  }) => {
    const modelArb = fc.constantFrom(
      'flux',
      'imagen-4',
      'imagen-4-fast',
      'runware-flux',
      'runware-sdxl',
      'stability-core',
      'stability-ultra',
      'aiml-flux',
      'aiml-nano',
      'cf-sdxl',
      'together-flux'
    );
    const promptArb = fc.string({ minLength: 1, maxLength: 40 });

    await fc.assert(
      fc.asyncProperty(modelArb, promptArb, async (model, prompt) => {
        const { text, label } = await page.evaluate(
          ([m, p]) => {
            const div = document.createElement('div');
            (window as any).renderImageErrorCard(div, p, m, 'about:blank');
            return {
              text: div.textContent || '',
              label: (window as any).getImageModelLabel(m) as string,
            };
          },
          [model, prompt] as const
        );
        return label.length > 0 && text.includes(label);
      }),
      { numRuns: 6, verbose: false }
    );
  });
});
