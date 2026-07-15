/**
 * Bug condition exploration test for the "image generation — empty card" bug.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4**
 *
 * Spec: .kiro/specs/image-generation-empty-card-bugfix/
 *
 * These tests encode the *expected* behavior after the fix (Property 1):
 *   - Direct image model failures are surfaced transparently (error card or
 *     successful retry) instead of leaving a blank `<img>` in a happy-looking
 *     result card.
 *   - The failed URL is NOT written to `lastImgUrl` or `ap_image_history`.
 *   - `pollinationsDirectUrl(prompt, model)` reflects the requested `model` in
 *     the URL's `model=` query parameter (or falls back to a supported model
 *     when the requested one is outside the whitelist).
 *
 * UNFIXED-CODE EXPECTATION: every case below FAILS — the failure *is* the
 * bug-existence proof. Counter-examples are documented under
 *   tests/bugfix-image-empty-card/counterexamples.md
 */

import { test, expect, type Page } from '@playwright/test';

const POLLINATIONS_SUPPORTED_MODELS = ['flux', 'turbo', 'sana'];

/**
 * Mock user injected into localStorage so the auth modal stays closed and
 * `genImage()` does not bail out on `if(!user) ...`. Matches the shape used
 * elsewhere in app.js (LS.get('ap_user', null)).
 */
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

/**
 * Inject a mock user into localStorage *before* any page script runs, so that
 *   `let user = LS.get('ap_user', null);`
 * at app.js boot already finds a valid user and the auth modal does not open.
 *
 * Also clears ap_image_history so each test starts from a known baseline.
 */
async function bypassAuthAndResetHistory(page: Page) {
  await page.addInitScript((mockUser) => {
    try {
      localStorage.setItem('ap_user', JSON.stringify(mockUser));
      localStorage.setItem('ap_image_history', JSON.stringify([]));
      // Avoid OAuth redirect leftovers on the same origin.
      localStorage.removeItem('saas_token');
    } catch (_) {
      /* ignore */
    }
  }, MOCK_USER);
}

/**
 * Navigate to the image panel via the app's own router. The image UI is a
 * sub-tab (`#ptab-img`) inside the main `#v-chat` view; `panelTab('image')`
 * is the function that activates it.
 */
async function gotoImagePanel(page: Page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  // Give app.js DOMContentLoaded handlers (which set up panels) a moment.
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

/**
 * Trigger an image generation with the given prompt + model and wait until
 * the result card has been rendered into `#img-result`. We intentionally do
 * NOT wait for the `<img>` to load — observing the post-render state IS the
 * point of the test.
 */
async function triggerGenerate(page: Page, prompt: string, model: string) {
  await page.locator('#img-prompt').fill(prompt);
  await page.locator('#img-model').selectOption({ value: model });
  await page.locator('#btn-gen-img').click();
  await page
    .locator('#img-result .image-result-card')
    .waitFor({ state: 'visible', timeout: 10_000 });
  // Allow the (mocked) image request to actually settle: 502 / abort / wrong
  // content-type all complete quickly, but the `<img>` decode step itself
  // still needs a tick or two.
  await page.waitForTimeout(2000);
}

/**
 * Snapshot the observable invariants that Property 1 talks about, all in one
 * `evaluate` round-trip so the assertions read cleanly.
 */
async function readImageState(page: Page) {
  return await page.evaluate(() => {
    const card = document.querySelector('#img-result .image-result-card');
    const errorCard = document.querySelector('#img-result .image-error-card');
    const img = card ? (card.querySelector('img') as HTMLImageElement | null) : null;
    let history: any[] = [];
    try {
      history = JSON.parse(localStorage.getItem('ap_image_history') || '[]');
    } catch (_) {
      history = [];
    }
    return {
      hasResultCard: !!card,
      hasErrorCard: !!errorCard,
      imgSrc: img ? img.src : '',
      naturalWidth: img ? img.naturalWidth : -1,
      complete: img ? img.complete : false,
      lastImgUrl: (window as any).lastImgUrl || '',
      historyLength: history.length,
      historyTopUrl: history[0]?.url || '',
    };
  });
}

test.describe('Property 1: Bug Condition — direct-model image failure must be transparent', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  // -------------------------------------------------------------------------
  // Case A: Pollinations CDN returns HTTP 502 for a Flux request.
  //
  // Expected (post-fix): either the `<img>` somehow loads (naturalWidth > 0)
  // or a `.image-error-card` is rendered. Failed URL must NOT enter history
  // or `lastImgUrl`.
  //
  // UNFIXED-CODE OBSERVATION: result card stays put with a blank `<img>`,
  // history gets a new entry, `lastImgUrl` is set to the broken URL.
  // -------------------------------------------------------------------------
  test('Case A — mocked CDN 502 (model=flux) surfaces a transparent failure', async ({ page }) => {
    await page.route('https://image.pollinations.ai/**', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'text/plain',
        body: 'Bad Gateway (mocked)',
      })
    );

    await gotoImagePanel(page);
    await triggerGenerate(page, 'dog', 'flux');

    const state = await readImageState(page);

    // Diagnostic — surfaces a counterexample directly in test output.
    test.info().annotations.push({
      type: 'counterexample',
      description: `Case A state: ${JSON.stringify(state)}`,
    });

    // Result card MUST be visible (already asserted by triggerGenerate).
    expect(state.hasResultCard).toBe(true);

    // Property 1 invariants:
    // (a) Either the image actually loaded OR an error card is shown.
    expect(
      state.naturalWidth > 0 || state.hasErrorCard,
      'Expected either a loaded image (naturalWidth > 0) or a visible .image-error-card. ' +
        'On unfixed code the result card is rendered with a blank <img> and no error UI — ' +
        'this is the bug.'
    ).toBe(true);

    // (b) Failed URL must not be written to history.
    expect(
      state.historyLength,
      'Expected ap_image_history to remain empty when the CDN returns 502; ' +
        'on unfixed code addImageHistory is called before <img> loads, so the ' +
        'broken URL is persisted.'
    ).toBe(0);

    // (c) lastImgUrl must not retain the failed URL.
    expect(
      state.lastImgUrl.startsWith('https://image.pollinations.ai/'),
      'Expected window.lastImgUrl to NOT point at a failed pollinations URL.'
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Case B: Pollinations CDN aborts the connection (simulated timeout).
  //
  // Expected (post-fix): same Property 1 invariants — error UI or success,
  // never silent failure.
  // -------------------------------------------------------------------------
  test('Case B — mocked CDN abort/timeout surfaces a transparent failure', async ({ page }) => {
    await page.route('https://image.pollinations.ai/**', async (route) => {
      // Simulate a connection that drops on the way back. `abort('failed')`
      // mirrors what the browser sees on a timeout/network error: the <img>
      // ends up with naturalWidth === 0 and no useful onload.
      await route.abort('failed');
    });

    await gotoImagePanel(page);
    await triggerGenerate(page, 'dog', 'flux');

    const state = await readImageState(page);

    test.info().annotations.push({
      type: 'counterexample',
      description: `Case B state: ${JSON.stringify(state)}`,
    });

    expect(state.hasResultCard).toBe(true);

    expect(
      state.naturalWidth > 0 || state.hasErrorCard,
      'Expected either a loaded image or an .image-error-card after a network abort. ' +
        'Unfixed code shows a blank <img> with no error UI.'
    ).toBe(true);

    expect(
      state.historyLength,
      'Expected no history entry to be written for an aborted CDN request.'
    ).toBe(0);

    expect(
      state.lastImgUrl.startsWith('https://image.pollinations.ai/'),
      'Expected window.lastImgUrl to NOT retain a URL whose request was aborted.'
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Case C: CDN returns HTTP 200 but with a non-image content-type
  // (`text/html`). Browsers cannot decode the body as an image, so the
  // `<img>` ends up with naturalWidth === 0 even though the network call
  // succeeded.
  // -------------------------------------------------------------------------
  test('Case C — mocked 200 + text/html surfaces a transparent failure', async ({ page }) => {
    await page.route('https://image.pollinations.ai/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body>rate-limit notice</body></html>',
      })
    );

    await gotoImagePanel(page);
    await triggerGenerate(page, 'dog', 'flux');

    const state = await readImageState(page);

    test.info().annotations.push({
      type: 'counterexample',
      description: `Case C state: ${JSON.stringify(state)}`,
    });

    expect(state.hasResultCard).toBe(true);

    expect(
      state.naturalWidth > 0 || state.hasErrorCard,
      'Expected either a loaded image or an .image-error-card when CDN returns ' +
        'a non-image content-type. Unfixed code keeps the empty <img>.'
    ).toBe(true);

    expect(
      state.historyLength,
      'Expected no history entry when the response is not actually an image.'
    ).toBe(0);

    expect(
      state.lastImgUrl.startsWith('https://image.pollinations.ai/'),
      'Expected window.lastImgUrl to NOT retain a URL whose response was not an image.'
    ).toBe(false);
  });
});

test.describe('Property 1 (sub-invariant): pollinationsDirectUrl must reflect the model arg', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  // -------------------------------------------------------------------------
  // Case D: Deterministic, network-free check that the `model=` parameter in
  // the generated CDN URL matches the requested model — or, if the requested
  // model is outside the Pollinations whitelist, falls back to a supported
  // model. Unfixed code hardcodes `model=flux`.
  // -------------------------------------------------------------------------
  test('Case D — pollinationsDirectUrl(prompt, model) reflects the model argument', async ({
    page,
  }) => {
    await gotoImagePanel(page);

    const samples = [
      { prompt: 'cat', model: 'turbo' },
      { prompt: 'cat', model: 'sana' },
      { prompt: 'cat', model: 'gptimage' }, // outside whitelist -> must fall back
      { prompt: 'cat', model: 'wan-image' }, // outside whitelist -> must fall back
    ];

    const results = await page.evaluate((cases) => {
      // pollinationsDirectUrl is declared at script top level, so it lives on
      // the global object as a function declaration in classic-script mode.
      const fn = (window as any).pollinationsDirectUrl as (p: string, m: string) => string;
      if (typeof fn !== 'function') {
        throw new Error('pollinationsDirectUrl is not exposed on window');
      }
      return cases.map((c) => {
        const url = fn(c.prompt, c.model);
        let modelParam = '';
        try {
          modelParam = new URL(url).searchParams.get('model') || '';
        } catch (_) {
          modelParam = '';
        }
        return { ...c, url, modelParam };
      });
    }, samples);

    for (const r of results) {
      test.info().annotations.push({
        type: 'counterexample',
        description: `Case D sample: model=${r.model} -> URL model param=${r.modelParam} (full url: ${r.url})`,
      });

      const inWhitelist = POLLINATIONS_SUPPORTED_MODELS.includes(r.model);
      if (inWhitelist) {
        // Whitelisted models MUST be passed through verbatim.
        expect(
          r.modelParam,
          `pollinationsDirectUrl("${r.prompt}", "${r.model}") should put model=${r.model} into the URL ` +
            `but produced model=${r.modelParam}.`
        ).toBe(r.model);
      } else {
        // Non-whitelisted models MUST fall back to a supported one (typically 'flux').
        expect(
          POLLINATIONS_SUPPORTED_MODELS.includes(r.modelParam),
          `pollinationsDirectUrl("${r.prompt}", "${r.model}") should fall back to a supported model ` +
            `(one of ${POLLINATIONS_SUPPORTED_MODELS.join(', ')}) but produced model=${r.modelParam}.`
        ).toBe(true);
        // Plus: the function must NOT silently masquerade a non-whitelisted
        // request as a different non-whitelisted model. Right now the unfixed
        // code always says `flux`, which is fine for this branch — the
        // *primary* defect for whitelisted models is what fails Case D above.
      }
    }
  });
});
