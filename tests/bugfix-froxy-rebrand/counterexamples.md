# Bug Condition Exploration — Counter-examples

Spec: `.kiro/specs/froxy-ai-rebrand-and-logo-fix/`
Test file: `tests/bugfix-froxy-rebrand/exploration.spec.ts`

These counter-examples are produced by running the exploration spec against
the **UNFIXED** front-end (`index.html`, `app.js`, `app.min.js`,
`manifest.json`, `sw.js`, `robots.txt`). All nine test cases fail, which is
the proof that the bug exists and pin-points its root causes (see the
"Hypothesized Root Cause" section in `design.md`).

## How to reproduce

```sh
npx playwright test tests/bugfix-froxy-rebrand/exploration.spec.ts
```

The Playwright `webServer` block boots `node server.js` on port 3000 before
the tests run, so no manual setup is required. The other two existing
bugfix suites (`tests/bugfix-image-empty-card/` 13 tests,
`tests/bugfix-image-routing/` 23 tests) keep passing on the same UNFIXED
code, confirming that the new exploration spec is scoped to the rebrand /
logo bug and does not introduce any regression.

## Cases

> Each `Case N counterexample` annotation in the test output captures the
> exact observed value that violates the corresponding Property 1
> sub-invariant. Below is the consolidated picture from a fresh UNFIXED run.

### Case 1 — `<img>` src must not match `/logo(-192)?\.jpg$/`

**Observed**: 5 distinct `<img>` elements in the rendered DOM still point
at `logo-192.jpg` / `logo.jpg` even though only `.png` files exist on disk.

```text
[ "logo-192.jpg",  // nav <img>
  "logo-192.jpg",  // auth modal brand <img>
  "logo-192.jpg",  // footer brand <img>
  "logo-192.jpg",  // sidebar brand <img>
  "logo-192.jpg" ] // chat-welcome ("Bugün ne üretelim?") <img>
```

**Root cause**: `index.html` carries five literal `logo-192.jpg` references
(nav, auth modal, footer, sidebar brand, chat-welcome) plus a
`<link rel="preload" href="logo-192.jpg">`; the actual asset names on disk
are `logo-192.png` and `logo.png`. Every such request 404s.

### Case 2 — visible DOM contains no "AiPaketim" literal

**Observed**: dozens of visible text nodes / image alt strings still carry
"AiPaketim". A truncated sample:

```text
[ "AiPaketim",            // nav brand label
  "AiPaketim",            // sidebar brand label
  "AiPaketim",            // auth modal brand
  "AiPaketim Chat",       // landing bot demo header
  "Neden AiPaketim?",     // features section heading
  "AiPaketim'e geçtikten sonra ...",  // testimonial
  "© 2026 AiPaketim. Tüm hakları saklıdır. ...",  // footer copyright
  "AiPaketim" ]           // <img alt> on multiple logos
```

**Root cause**: brand rebrand is unfinished. `manifest.json` already says
`"Froxy AI"` but `index.html` and `app.js` still emit "AiPaketim" across
nav, sidebar, footer, auth modal, landing copy and image alt text. The
mojibake repair helper (`PHRASE_REPAIRS` in `app.js` source) is excluded
from this assertion because the test walker ignores `<script>` content.

### Case 3 — `document.title` must contain "Froxy AI" and not "AiPaketim"

**Observed**: `document.title === "AiPaketim — Premium AI API Platformu"`.

**Root cause**: `<title>` in `index.html` line 6 still uses the old brand.

### Case 4 — `og:image` must reference froxyai.com + use a `.png` asset

**Observed**: `meta[property=og:image].content === "https://aipaketim.com/logo.jpg"`.

**Root cause**: `index.html` lines 14 and 21 both point at the old domain
and the wrong file extension. Sosyal paylaşım önizlemesi 404 alır.

### Case 5 — `manifest.json` brand fields + icon types

**Observed**: `manifest.description` does not contain "Froxy AI" (and
`manifest.icons[*].type` is `"image/jpeg"` even though `src` is a `.png`).
Failing assertion sample:

```text
manifest.description should contain "Froxy AI"
Received: "Türkiye'nin en gelişmiş AI sohbet platformu. 100+ model, görsel üretim, sesli yanıt."
```

The first failing assertion stops execution before reaching the icon-type
assertion, but inspection of `manifest.json` confirms the secondary
defect:

```json
"icons": [
  {"src": "logo-192.png", "sizes": "192x192", "type": "image/jpeg"},
  {"src": "logo.png",     "sizes": "512x512", "type": "image/jpeg", "purpose": "any maskable"}
]
```

**Root cause**: `manifest.json` has been partially rebranded — `name` and
`short_name` already say "Froxy AI" but `description` is brand-neutral
(should explicitly carry the new brand) and the icon `type` is the wrong
MIME tipi for the `.png` files actually shipped.

### Case 6 — privacy/terms/kvkk/disclaimer modal bodies

**Observed (privacy modal)**:

```text
"... AiPaketim, yalnızca hizmet sunumu için gerekli kişisel verileri toplar ...
   Gizlilik ile ilgili sorularınız için: info@aipaketim.com"
```

The other three (`terms`, `kvkk`, `disclaimer`) follow the same pattern:
"veri sorumlusu sıfatıyla AiPaketim", `destek@aipaketim.com`,
`info@aipaketim.com`, references to `aipaketim.com`.

**Root cause**: `LEGAL` table in `app.js` (lines ~5066–5070) still hard-codes
the old brand, the old domain and the old support / contact e-posta
addresses across all four sözleşme entries.

### Case 7 — landing code panels must reference api.froxyai.com/v1

**Observed**: All four `<pre class="code-panel">` blocks (Python, Node,
cURL, PHP) on the landing page hard-code
`https://api.aipaketim.com/v1/...`:

```text
base_url="https://api.aipaketim.com/v1"
baseURL: "https://api.aipaketim.com/v1"
curl https://api.aipaketim.com/v1/chat/completions \
$ch = curl_init("https://api.aipaketim.com/v1/chat/completions");
```

A fifth panel inside the dashboard (`dsec` "Kullanım Örneği") repeats the
same pattern. Counterexample stat: `aipaketim hits = 5`,
`froxyai hits = 0`.

**Root cause**: `index.html` lines ~611, 622, 631, 644 plus the dashboard
copy at line ~1203 still print the old API host in the developer-facing
SDK examples.

### Case 8 — `robots.txt` Sitemap directive

**Observed**:

```text
User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/

Sitemap: https://aipaketim.com/sitemap.xml
```

**Root cause**: `robots.txt` line 6 hâlâ eski domain'e işaret eder.

### Case 9 — `sw.js` cache prefix

**Observed**:

```text
const CACHE_NAME = 'aipaketim-disabled-v140';
```

`'froxyai-'` prefix yok. Bu, fix sonrası yeni asset'lerin tarayıcı cache'i
tarafından eski 404 cevaplarıyla çakışmaması için **mutlaka** güncellenmeli
(yeni prefix + sürüm bump → activate event'inde eski cache invalidate olur).

**Root cause**: `sw.js` line 1.

## Summary

| Case | Failing assertion (UNFIXED) | Observed | Expected (post-fix) |
| ---- | --------------------------- | -------- | ------------------- |
| 1    | `<img>` src list ⊆ `*.png` | 5× `logo-192.jpg` references | `[]` (every `<img>` uses `.png`) |
| 2    | visible DOM has no "AiPaketim" | dozens of hits in nav / footer / modals / alt | `[]` |
| 3    | `document.title` contains "Froxy AI" | `"AiPaketim — Premium AI API Platformu"` | `"Froxy AI ..."` |
| 4    | `og:image` URL | `https://aipaketim.com/logo.jpg` | `https://froxyai.com/logo.png` |
| 5    | manifest brand + icon types | `description` brand-neutral, `type=image/jpeg` | `"Froxy AI"` + `image/png` |
| 6    | privacy modal body | "AiPaketim", `info@aipaketim.com` | "Froxy AI", `info@froxyai.com`, `destek@froxyai.com` |
| 7    | code panels reference | `api.aipaketim.com/v1` ×5 | `api.froxyai.com/v1` |
| 8    | robots.txt sitemap | `https://aipaketim.com/sitemap.xml` | `https://froxyai.com/sitemap.xml` |
| 9    | sw.js cache name | `aipaketim-disabled-v140` | starts with `froxyai-` |

The first failing input that proves the bug is reachable from the live,
unfixed code path is therefore:

> `GET /index.html` → rendered DOM contains `<img src="logo-192.jpg">`
> in 5 distinct UI surfaces, while the file system only ships
> `logo-192.png` / `logo.png`. Every such request is a 404.

…and the orthogonal brand counter-example:

> `document.title === "AiPaketim — Premium AI API Platformu"` while
> `manifest.json.name === "Froxy AI - AI Platform"` — the rebrand is
> half-finished and the two surfaces disagree on the brand identity.

After Task 3 ships the fix, this exact same spec is re-run unmodified and
must turn green — that is what `design.md` calls "Property 1 fix-checking".

---

## Actual run output (UNFIXED)

`npx playwright test tests/bugfix-froxy-rebrand/exploration.spec.ts`

```
Running 9 tests using 1 worker

  ✘  1 Case 1 — no <img> src matches /logo(-192)?\.jpg$/
  ✘  2 Case 2 — visible DOM contains no "AiPaketim" literal
  ✘  3 Case 3 — document.title contains "Froxy AI" and not "AiPaketim"
  ✘  4 Case 4 — og:image references froxyai.com and a .png asset
  ✘  5 Case 5 — manifest.json name/short_name/description + icon types
  ✘  6 Case 6 — privacy/terms/kvkk/disclaimer modals show Froxy AI + froxyai.com emails
  ✘  7 Case 7 — landing code panels use api.froxyai.com/v1
  ✘  8 Case 8 — robots.txt declares https://froxyai.com/sitemap.xml
  ✘  9 Case 9 — sw.js cache name uses "froxyai-" prefix, not "aipaketim-"

  9 failed
```

Existing suites stay green on the same UNFIXED tree:

```
tests/bugfix-image-empty-card  → 13 passed
tests/bugfix-image-routing     → 23 passed
```
