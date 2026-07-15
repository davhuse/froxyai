/**
 * Bug-condition exploration test for the
 *   "image routing — multi-provider" bug.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 *
 * Spec: .kiro/specs/image-routing-multi-provider-bugfix/
 *
 * Property 1 — Bug Condition (encodes the *expected* behavior after the fix):
 *   - `shouldUseDirectImageModel(model)` MUST be `false` for every model in
 *     `{gptimage, wan-image, qwen-image, klein, zimage}`. The unfixed code
 *     keeps these in the legacy `freeModels` list and returns `true`, so the
 *     direct-CDN branch is taken and the user never gets the model they
 *     selected.
 *   - When the user picks any of those models and clicks "Görsel Üret",
 *     `genImage()` MUST dispatch via the server proxy (`POST /api/image`)
 *     with the original `model` field carried in the request body, and MUST
 *     NOT issue any request to `image.pollinations.ai`.
 *   - `renderImageErrorCard(div, prompt, model, failedUrl)` MUST produce DOM
 *     text that does NOT mention "Pollinations sağlayıcısı" — error cards
 *     are provider-agnostic.
 *   - As a regression guard the same call MUST still surface the model
 *     label (`getImageModelLabel(model)`).
 *
 * UNFIXED-CODE EXPECTATION:
 *   - Case A FAILS  (shouldUseDirectImageModel returns true)
 *   - Case B FAILS  (image.pollinations.ai is called instead of /api/image)
 *   - Case C FAILS  ("Pollinations sağlayıcısı" appears in the error card)
 *   - Case D PASSES (label is already rendered — pure regression guard)
 *
 * Counter-examples are documented under
 *   tests/bugfix-image-routing/counterexamples.md
 */

import { test, expect, type Page, type Request } from '@playwright/test';
import fc from 'fast-check';

/** The five models that the bug mis-routes to the Pollinations CDN. */
const MISCATEGORIZED_FREE_MODELS = [
  'gptimage',
  'wan-image',
  'qwen-image',
  'klein',
  'zimage',
] as const;

/** Models served by other providers (used for Case C/D — error card text). */
const NON_POLLINATIONS_MODELS = [
  'imagen-4',
  'imagen-4-fast',
  'runware-flux',
  'stability-core',
  'aiml-flux',
  'flux',
] as const;

const POLLINATIONS_HOST = 'image.pollinations.ai';

/**
 * Mock user injected into localStorage so the auth modal stays closed and
 * `genImage()` does not bail out on `if(!user) ...`.
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

/**
 * Boot the page and wait until app.js has wired up `panelTab` and the image
 * sub-tab is mounted. The image panel itself is activated via the app's own
 * router (`window.panelTab('image')`) because that's what the spec expects.
 */
async function gotoImagePanel(page: Page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      typeof (window as any).panelTab === 'function' &&
      typeof (window as any).shouldUseDirectImageModel === 'function' &&
      typeof (window as any).pollinationsDirectUrl === 'function' &&
      typeof (window as any).renderImageErrorCard === 'function' &&
      typeof (window as any).getImageModelLabel === 'function' &&
      !!document.getElementById('ptab-img'),
    null,
    { timeout: 15_000 }
  );
  await page.evaluate(() => (window as any).panelTab('image'));
  await page.locator('#ptab-img').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#img-prompt').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#img-model').waitFor({ state: 'attached', timeout: 10_000 });
}

/**
 * Add a single <option> to #img-model on the fly. The bug-list models
 * (gptimage / wan-image / qwen-image / klein / zimage) aren't in the
 * production HTML <select>, so we inject them dynamically before each
 * iteration of Case B. The routing helpers in app.js read the model value
 * directly from the <select>, so this is the minimum-viable setup.
 */
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

// ---------------------------------------------------------------------------
// Case A — shouldUseDirectImageModel routing whitelist
// (deterministic, network-free)
// ---------------------------------------------------------------------------

test.describe('Case A — shouldUseDirectImageModel routing whitelist', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
    await gotoImagePanel(page);
  });

  test('shouldUseDirectImageModel(model) === false for misrouted free models', async ({
    page,
  }) => {
    // Property: for every miscategorized "free" model, the routing helper
    // must return false so that genImage falls through to the server proxy.
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...MISCATEGORIZED_FREE_MODELS),
        async (model) => {
          const v = await page.evaluate(
            (m) => (window as any).shouldUseDirectImageModel(m) as boolean,
            model
          );
          // Surface every counterexample directly in the test annotations.
          test.info().annotations.push({
            type: 'counterexample',
            description: `Case A: shouldUseDirectImageModel("${model}") === ${v} (expected false)`,
          });
          expect(v, `shouldUseDirectImageModel("${model}") must be false`).toBe(
            false
          );
        }
      ),
      { numRuns: MISCATEGORIZED_FREE_MODELS.length, seed: 42 }
    );
  });
});

// ---------------------------------------------------------------------------
// Case B — /api/image server-proxy dispatch
// (integration with mocked CDN and mocked /api/image endpoint)
// ---------------------------------------------------------------------------

test.describe('Case B — server-proxy dispatch via /api/image', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
  });

  test('genImage with miscategorized free models hits /api/image, never image.pollinations.ai', async ({
    page,
  }) => {
    // Important: we install the routes BEFORE navigating so they apply
    // to the very first network call from the click. We mock both:
    //   - image.pollinations.ai/** -> a tiny valid JPEG so the unfixed
    //     code's <img> would actually load (this confirms the unfixed
    //     branch goes here).
    //   - /api/image -> a stub JSON response with an image URL.
    // We also count both: the property is "/api/image was hit AND
    // image.pollinations.ai was NOT hit".

    // 1×1 black JPEG, base64 — small enough to inline.
    const tinyJpegB64 =
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/9sAQwEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/8AAEQgAAQABAwERAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A/v8AKAP/2Q==';

    // Counters across the run — each iteration mutates and inspects them.
    const seen = {
      pollinationsCalls: 0,
      apiImageCalls: 0,
      apiImageBodies: [] as Array<{ model?: string; prompt?: string } | null>,
    };

    await page.route(`https://${POLLINATIONS_HOST}/**`, (route) => {
      seen.pollinationsCalls++;
      return route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: Buffer.from(tinyJpegB64, 'base64'),
      });
    });
    // IMPORTANT: anchored regex instead of `**/api/image` glob. After the
    // routing fix `genImage` appends a cache-buster (`?_t=<timestamp>`) to
    // the request URL, and Playwright's `**/api/image` glob does NOT match
    // URLs with a query string. Using `/\/api\/image(\?.*)?$/` matches
    // both bare paths and any query-string suffix, mirroring what the
    // preservation suite already does. The `imagen` regex is anchored the
    // same way so `image` is not a prefix-match for `imagen`.
    await page.route(/\/api\/imagen(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'data:image/jpeg;base64,' + tinyJpegB64 }),
      })
    );
    await page.route(/\/api\/image(\?.*)?$/, (route) => {
      seen.apiImageCalls++;
      let parsed: any = null;
      try {
        parsed = JSON.parse(route.request().postData() || '{}');
      } catch (_) {
        parsed = null;
      }
      seen.apiImageBodies.push(parsed);
      return route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          url: 'data:image/jpeg;base64,' + tinyJpegB64,
        }),
      });
    });

    await gotoImagePanel(page);

    // Make sure all five values exist as <option>s before we try to select.
    for (const m of MISCATEGORIZED_FREE_MODELS) {
      await ensureModelOption(page, m, m);
    }

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...MISCATEGORIZED_FREE_MODELS),
        async (model) => {
          // Reset counters for this iteration so each model gets its own
          // observation window.
          const beforePollinations = seen.pollinationsCalls;
          const beforeApiImage = seen.apiImageCalls;
          const beforeBodies = seen.apiImageBodies.length;

          // Reset DOM state so the result card is clean.
          await page.evaluate(() => {
            const r = document.getElementById('img-result');
            if (r) r.innerHTML = '';
            (window as any).lastImgUrl = '';
          });

          await page.locator('#img-prompt').fill('a futuristic city');
          await page.locator('#img-model').selectOption({ value: model });
          await page.locator('#btn-gen-img').click();

          // Wait until a card has been rendered — either the result card
          // (server-proxy success path or direct-CDN success path) or the
          // error card (any failure path). Once the click handler has
          // returned and the network has settled, the counters reflect the
          // truth of which branch was taken.
          await page
            .locator(
              '#img-result .image-result-card, #img-result .image-error-card'
            )
            .waitFor({ state: 'visible', timeout: 10_000 });
          // Give any pending fetch/XHR a tick to land.
          await page.waitForTimeout(500);

          const pollDelta = seen.pollinationsCalls - beforePollinations;
          const apiDelta = seen.apiImageCalls - beforeApiImage;
          const newBodies = seen.apiImageBodies.slice(beforeBodies);

          test.info().annotations.push({
            type: 'counterexample',
            description:
              `Case B: model=${model} ` +
              `pollinationsCalls=${pollDelta} ` +
              `apiImageCalls=${apiDelta} ` +
              `bodies=${JSON.stringify(newBodies)}`,
          });

          // Property: server-proxy was used.
          expect(
            apiDelta,
            `Expected /api/image to be called for model "${model}"`
          ).toBeGreaterThan(0);
          // Property: Pollinations CDN was NOT used.
          expect(
            pollDelta,
            `Expected NO image.pollinations.ai calls for model "${model}", got ${pollDelta}`
          ).toBe(0);
          // Property: original model name reaches the server.
          expect(
            newBodies.some((b) => b && b.model === model),
            `Expected /api/image POST body.model === "${model}", saw ${JSON.stringify(newBodies)}`
          ).toBe(true);
        }
      ),
      { numRuns: MISCATEGORIZED_FREE_MODELS.length, seed: 42 }
    );
  });
});

// ---------------------------------------------------------------------------
// Case C — error card text is provider-agnostic
// (deterministic, network-free)
// ---------------------------------------------------------------------------

test.describe('Case C — renderImageErrorCard text is provider-agnostic', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
    await gotoImagePanel(page);
  });

  test('error card DOM does NOT contain "Pollinations sağlayıcısı"', async ({
    page,
  }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NON_POLLINATIONS_MODELS),
        // Restrict prompts to printable ASCII so the assertion never matches
        // by accident: the substring "Pollinations sağlayıcısı" contains
        // non-ASCII characters that would never be produced by a basic
        // generator.
        fc.string({ minLength: 1, maxLength: 40 }),
        async (model, prompt) => {
          const text = await page.evaluate(
            ([m, p]) => {
              const div = document.createElement('div');
              (window as any).renderImageErrorCard(div, p, m, 'about:blank');
              return div.textContent || '';
            },
            [model, prompt] as const
          );
          test.info().annotations.push({
            type: 'counterexample',
            description: `Case C: model=${model} prompt=${JSON.stringify(prompt)} text=${JSON.stringify(text)}`,
          });
          expect(
            text.includes('Pollinations sağlayıcısı'),
            `Expected error card for model="${model}" to NOT contain "Pollinations sağlayıcısı", but got: ${text}`
          ).toBe(false);
        }
      ),
      { numRuns: 6, seed: 42 }
    );
  });
});

// ---------------------------------------------------------------------------
// Case D — model label preserved (regression guard, expected to PASS even
// on unfixed code)
// ---------------------------------------------------------------------------

test.describe('Case D — error card preserves the model label', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuthAndResetHistory(page);
    await gotoImagePanel(page);
  });

  test('error card DOM contains getImageModelLabel(model)', async ({ page }) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NON_POLLINATIONS_MODELS),
        fc.string({ minLength: 1, maxLength: 40 }),
        async (model, prompt) => {
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
          test.info().annotations.push({
            type: 'observation',
            description: `Case D: model=${model} label=${JSON.stringify(label)} text=${JSON.stringify(text)}`,
          });
          expect(
            text.includes(label),
            `Expected error card for model="${model}" to contain label "${label}"`
          ).toBe(true);
        }
      ),
      { numRuns: 6, seed: 42 }
    );
  });
});
