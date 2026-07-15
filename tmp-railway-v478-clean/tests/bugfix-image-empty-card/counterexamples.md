# Bug Condition Exploration — Counter-examples

Spec: `.kiro/specs/image-generation-empty-card-bugfix/`
Test file: `tests/bugfix-image-empty-card/exploration.spec.ts`

These counter-examples are produced by running the exploration spec against
the **UNFIXED** `app.js` / `app.min.js`. The pattern of failures is what
proves the bug exists and pin-points its root causes.

## How to reproduce

```sh
npx playwright test tests/bugfix-image-empty-card/exploration.spec.ts
```

The Playwright `webServer` block boots `node server.js` on port 3000 before
the tests run, so no manual setup is required.

## Cases

> The `Case X state: {...}` JSON blobs in test annotations capture the
> observable invariants at the moment the result card was rendered. Each one
> documents *which* Property 1 invariant is being violated.

### Case A — mocked CDN 502 (`prompt="dog"`, `model="flux"`)

**What we observe on unfixed code**
- `hasResultCard: true` — the happy-path `.image-result-card` is rendered.
- `hasErrorCard: false` — no `.image-error-card` is shown.
- `naturalWidth: 0` and `complete: true` — the `<img>` failed silently.
- `historyLength: 1` — `addImageHistory` was called *before* `<img>` loaded,
  so the broken URL is now persisted in `ap_image_history`.
- `lastImgUrl` starts with `https://image.pollinations.ai/` — the broken URL
  is also saved on the global `window.lastImgUrl`, so a subsequent
  `downloadImage()` would download nothing/garbage.

**Which Property 1 sub-invariant breaks**
- `naturalWidth > 0 || hasErrorCard` — both sides false.
- `historyLength === 0` — fails (history has 1 entry).
- `!lastImgUrl.startsWith('https://image.pollinations.ai/')` — fails.

**Maps to root-cause hypotheses (design.md)**
- (1) `<img>` has no `onerror` handler in `renderImageResult`.
- (3) `addImageHistory` and `lastImgUrl = url` are written *before* the
  image actually loads.

### Case B — mocked abort/timeout (`prompt="dog"`, `model="flux"`)

Same observable failure pattern as Case A. The fact that an aborted request
produces an identical UI state to a 502 is itself evidence that `<img>` has
no error handling at all — the browser does what it can on its own
(`naturalWidth = 0`) and the app simply does not react.

### Case C — mocked 200 + `Content-Type: text/html`

A 200 response that the browser cannot decode as an image. Same failure
pattern as A and B. This case in particular shows that "the network
succeeded" is not a sufficient signal; only `<img>.onload` is.

### Case D — `pollinationsDirectUrl(prompt, model)` model-parameter reflection

Network-free. Calls `window.pollinationsDirectUrl("cat", model)` for several
models and inspects the resulting URL's `?model=` parameter.

| requested model | observed `model=` (unfixed) | expected `model=` (post-fix)               |
| --------------- | --------------------------- | ------------------------------------------ |
| `turbo`         | `flux`                      | `turbo` (whitelisted, must round-trip)     |
| `sana`          | `flux`                      | `sana` (whitelisted, must round-trip)      |
| `gptimage`      | `flux`                      | any model in the supported whitelist (OK)  |
| `wan-image`     | `flux`                      | any model in the supported whitelist (OK)  |

The first two rows are direct invariant violations: the requested model is
discarded and replaced by the hard-coded literal in `pollinationsDirectUrl`
(`?model=flux&...`). Maps to root-cause hypothesis (2) in design.md.

## Summary

Cases A, B, C all fail the same three Property 1 invariants in the same way,
which is consistent with two independent defects in `renderImageResult`:

1. No `<img>` `onerror`/`onload` handlers, so silent decode failures are
   never surfaced.
2. State writes (`lastImgUrl`, `addImageHistory`) happen synchronously, before
   the image has loaded — so failures get persisted.

Case D fails an orthogonal invariant on `pollinationsDirectUrl`, confirming
the second defect documented in the spec: the `model` argument is ignored
and replaced by the hard-coded `model=flux` query parameter.

After Task 3 ships the fix, this exact same spec is re-run unmodified and
must turn green — that is what the design calls "Property 1 fix-checking".


---

## Actual run output (UNFIXED `app.min.js`)

`npx playwright test tests/bugfix-image-empty-card/exploration.spec.ts`

```
Running 4 tests using 1 worker

  ✘  1 Case A — mocked CDN 502 (model=flux) surfaces a transparent failure
  ✘  2 Case B — mocked CDN abort/timeout surfaces a transparent failure
  ✘  3 Case C — mocked 200 + text/html surfaces a transparent failure
  ✘  4 Case D — pollinationsDirectUrl(prompt, model) reflects the model argument

  4 failed
```

### Concrete counter-examples extracted from the failures

| Case | Failing assertion                               | Observed value | Expected value |
| ---- | ----------------------------------------------- | -------------- | -------------- |
| A    | `naturalWidth > 0 || hasErrorCard`              | `false`        | `true`         |
| B    | `naturalWidth > 0 || hasErrorCard`              | `false`        | `true`         |
| C    | `naturalWidth > 0 || hasErrorCard`              | `false`        | `true`         |
| D    | `URL.searchParams.get('model')` for `model=turbo` | `"flux"`     | `"turbo"`      |

The first failing input is therefore:

> **`{ prompt: "dog", model: "flux", cdnState: { status: 502 } }`**
> Result card rendered, `<img>.naturalWidth === 0`, no `.image-error-card`.

…and the orthogonal model-parameter counter-example:

> **`pollinationsDirectUrl("cat", "turbo")`** ⇒ URL contains `model=flux`,
> not `model=turbo`.

Both confirm the bug is reachable from the live, unfixed code path.
