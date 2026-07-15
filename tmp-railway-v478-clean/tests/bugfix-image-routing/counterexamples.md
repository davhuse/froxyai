# Counterexamples — image-routing-multi-provider-bugfix exploration

Spec: `.kiro/specs/image-routing-multi-provider-bugfix/`
Test: `tests/bugfix-image-routing/exploration.spec.ts`
Run: UNFIXED code (commit before Task 3 fix is applied).
Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5

These counterexamples are produced by Playwright + fast-check while exercising the
unfixed `app.js`. The failure of Cases A–C is the *positive* result for an
exploration test — it confirms the bug exists. Case D (regression guard) passes
on unfixed code as expected.

## Summary

| Case | Property                                                                 | Status (UNFIXED) | Counter-example                            |
|------|---------------------------------------------------------------------------|------------------|---------------------------------------------|
| A    | `shouldUseDirectImageModel(m) === false` for misrouted free models       | **FAIL**         | `m = "gptimage"` → returned `true`          |
| B    | `genImage` dispatches to `/api/image`; no `image.pollinations.ai` call   | **FAIL**         | `m = "gptimage"`: 0 `/api/image` calls; direct CDN branch taken |
| C    | `renderImageErrorCard` DOM has no `"Pollinations sağlayıcısı"`            | **FAIL**         | `m = "imagen-4"`, `prompt = " "` → text contains the substring |
| D    | `renderImageErrorCard` DOM still contains `getImageModelLabel(m)`         | **PASS**         | Label `"Imagen 4.0 Standart"` rendered      |

## Case A — `shouldUseDirectImageModel` whitelist (deterministic, network-free)

```text
Property failed after 1 tests
{ seed: 42, path: "0:0", endOnFailure: true }
Counterexample: ["gptimage"]

Expected: false
Received: true
```

The unfixed `freeModels` array in `app.js:455` —
`['flux','turbo','sana','zimage','klein','gptimage','wan-image','qwen-image']`
— admits the five misrouted models, so the helper returns `true` and `genImage`
takes the direct-CDN branch. Same outcome holds for `wan-image`, `qwen-image`,
`klein`, and `zimage` (the property quantifies over all five; the shrinker
reports the first failing element).

## Case B — `/api/image` server-proxy dispatch (mocked endpoints)

```text
Property failed after 1 tests
{ seed: 42, path: "0:0", endOnFailure: true }
Counterexample: ["gptimage"]

Expected: > 0
Received:   0     // /api/image call count for model="gptimage"
```

Annotation captured during the run:

```text
Case B: model=gptimage pollinationsCalls=1 apiImageCalls=0 bodies=[]
```

The unfixed code calls `pollinationsDirectUrl(prompt, "gptimage")`, which
silently rewrites `model=` to `flux` (because `gptimage ∉ POLLINATIONS_SUPPORTED_MODELS`)
and the request goes to `https://image.pollinations.ai/prompt/...?model=flux&...`.
`/api/image` is never reached, so the registered API keys for AIMLAPI / Runware /
Stability / Cloudflare / Together remain unused.

## Case C — Error card text agnostic (deterministic, network-free)

```text
Property failed after 1 tests
{ seed: 42, path: "0:0:0:0", endOnFailure: true }
Counterexample: ["imagen-4", " "]

Expected: false
Received: true     // text.includes("Pollinations sağlayıcısı")
```

Captured DOM text:

```
Imagen 4.0 Standart
Görsel yüklenemedi. Pollinations sağlayıcısı şu an yanıt vermiyor.
Yeniden Dene
Promptu Düzenle
```

The hard-coded sentence in `renderImageErrorCard` (`app.js:528`) appears
regardless of which model was selected, so an `imagen-4` failure misleadingly
blames Pollinations. The same fault applies to every non-Pollinations model
(`runware-flux`, `stability-core`, `aiml-flux`, `imagen-4-fast`, …); the
shrinker just reports the first one tried.

## Case D — Model label preserved (regression guard)

```text
ok 4 — Case D — error card DOM contains getImageModelLabel(model)
```

Sample annotation:

```text
Case D: model=imagen-4 label="Imagen 4.0 Standart"
        text="Imagen 4.0 Standart Görsel yüklenemedi. Pollinations sağlayıcısı …"
```

`<strong>${esc(getImageModelLabel(model))}</strong>` inside `image-error-meta`
keeps the label visible. Case D must continue to pass after Task 3.3 changes
the sentence text so the label-visibility regression guard stays intact.

## Reproduction

```powershell
npx playwright test tests/bugfix-image-routing/exploration.spec.ts --reporter=list
```

Required environment:
- `node_modules` populated (`@playwright/test@^1.60.0`, `fast-check@^4.8.0`).
- A Playwright browser cache (the test driver auto-launches Chromium).
- The local dev server is started by `playwright.config.ts`'s `webServer` hook
  (`PORT=3000 node server.js`).
