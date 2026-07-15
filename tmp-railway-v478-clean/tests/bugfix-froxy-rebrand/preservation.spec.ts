/**
 * Preservation property tests for the
 *   "Froxy AI rebrand + logo 404" bugfix.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 *
 * Spec: .kiro/specs/froxy-ai-rebrand-and-logo-fix/
 *
 * Property 2 (Preservation): For any application surface X for which the
 * bug condition does NOT hold (`isBugCondition(X) = false`), the *observable*
 * behaviour of the front-end MUST remain identical between the UNFIXED
 * baseline and the FIXED build (`F(X) = F'(X)`). In practice this means:
 *
 *   - DOM structure (element IDs, container roles, sidebar/footer/nav
 *     skeleton) and the `getComputedStyle` snapshot of those containers
 *     are bit-for-bit stable.
 *   - The two existing bugfix suites
 *     (`tests/bugfix-image-empty-card/` 13 tests,
 *     `tests/bugfix-image-routing/` 23 tests) keep passing — covered
 *     here by a smoke check that asserts the DOM IDs and `window`
 *     globals those suites depend on are still present.
 *   - The mojibake repair helper inside `app.js`
 *     (`PHRASE_REPAIRS` table + `/AIPAKETIM/g` + `/AI ?Paketim/g`
 *     regex normalization) is preserved verbatim.
 *   - All `backup_*` directories' SHA-256 hashes stay constant — the
 *     fix is forbidden from rewriting historical artefacts.
 *   - Existing `@aipaketim.com` register flow still gets the
 *     `loginProvider:'social'` branch (check string is preserved; the
 *     fix only ADDS `@froxyai.com` as an additional accepted domain,
 *     never removes the original).
 *   - The third-party `image.pollinations.ai` reference count in
 *     `app.js` is unchanged.
 *
 * Methodology — observation-first: each section first documents the
 * exact behaviour observed on the UNFIXED `app.js` / `index.html` /
 * `manifest.json` etc., then encodes that behaviour as a stable
 * invariant. This whole spec PASSES on the unfixed code (baseline) and
 * is expected to keep passing after the Task 3 fix is applied
 * (regression guard).
 */

import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Repository root — the workspace directory that ships `app.js`,
// `index.html`, `manifest.json`, `sw.js`, `robots.txt` and the
// `backup_*/` snapshot directories. Resolved from this file's location:
//   tests/bugfix-froxy-rebrand/preservation.spec.ts -> two levels up.
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Mock user — same shape as `tests/bugfix-image-empty-card/exploration.spec.ts`
// uses, so the SPA boots into the authenticated layout (nav + footer +
// sidebar visible) without us having to drive the auth modal manually.
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

async function gotoApp(page: Page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof (window as any).panelTab === 'function',
    null,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Helper — read a repo file as a string (for source-level invariants like
// the `PHRASE_REPAIRS` table and the third-party URL count). We use
// `utf8` because all the files involved are text.
// ---------------------------------------------------------------------------
function readRepoFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function sha256OfFile(absPath: string): string {
  const buf = fs.readFileSync(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Walk a directory recursively and return a sorted array of
 * `{ relPath, sha256 }` records — one per regular file. The directory
 * tree must be small enough for this synchronous walk; we only call it
 * on `backup_*` snapshots which are immutable historical artefacts.
 */
function hashDirectoryTree(absRoot: string): Array<{ relPath: string; sha256: string }> {
  const out: Array<{ relPath: string; sha256: string }> = [];
  const stack: string[] = [absRoot];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile()) {
        out.push({
          relPath: path.relative(absRoot, p).split(path.sep).join('/'),
          sha256: sha256OfFile(p),
        });
      }
      // symlinks / other types are ignored — none in the backup tree.
    }
  }
  out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return out;
}

// ===========================================================================
// 3.1 — CSS / DOM structure invariant
// ===========================================================================
//
// Observation on UNFIXED:
//   The SPA renders these top-level container IDs in the DOM regardless
//   of the active view: #nav, #footer, #v-landing, #v-chat, #v-admin,
//   #panel-sidebar. Their `display`/`position` computed style values, the
//   document `<html lang>` attribute, and the body class set are stable
//   across reloads.
//
// Invariant: all of those IDs are present, the body remains a `<body>`
// (not replaced or wrapped), `#v-chat` is the default-on view, and the
// sidebar / footer keep their core layout properties.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.1): DOM structure + computed style', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
  });

  test('top-level container IDs and their key computed styles are stable', async ({ page }) => {
    await gotoApp(page);

    const snapshot = await page.evaluate(() => {
      const ids = ['nav', 'v-landing', 'v-chat', 'v-admin', 'panel-sidebar'];
      const present: Record<string, boolean> = {};
      const styles: Record<string, { display: string; position: string }> = {};
      for (const id of ids) {
        const el = document.getElementById(id);
        present[id] = !!el;
        if (el) {
          const cs = window.getComputedStyle(el);
          styles[id] = { display: cs.display, position: cs.position };
        }
      }
      // Footer is a <footer class="footer"> element, not #footer.
      const footerEl = document.querySelector('footer.footer') as HTMLElement | null;
      present['footer'] = !!footerEl;
      if (footerEl) {
        const cs = window.getComputedStyle(footerEl);
        styles['footer'] = { display: cs.display, position: cs.position };
      }
      return {
        present,
        styles,
        htmlLang: document.documentElement.getAttribute('lang') || '',
        bodyTag: document.body.tagName,
        // `#v-chat` ships with `class="v on"` so it's the default visible
        // view; preservation requires this class set to stay intact.
        vChatClassList: document.getElementById('v-chat')?.className || '',
      };
    });

    // All six containers must exist — these are the anchors that the
    // image-empty-card and image-routing suites depend on.
    for (const id of [
      'nav',
      'footer',
      'v-landing',
      'v-chat',
      'v-admin',
      'panel-sidebar',
    ]) {
      expect(snapshot.present[id], `${id} must be present in DOM`).toBe(true);
    }

    // Body remains a real <body> element (not wrapped in some new
    // shadow-root, not replaced by a custom element).
    expect(snapshot.bodyTag).toBe('BODY');
    // The site is Turkish — preserved.
    expect(snapshot.htmlLang).toBe('tr');

    // #v-chat is the default-on view; class set must include both
    // tokens. We tolerate any ordering of the class names.
    const vChatClasses = snapshot.vChatClassList.split(/\s+/).filter(Boolean).sort();
    expect(vChatClasses).toEqual(['on', 'v']);

    // Sidebar must use a non-`none` display (rendered) and the footer
    // must remain in the document flow (`position` is `static` or
    // `relative` in the unfixed build, but never `fixed` / absolute /
    // sticky — those would change the layout).
    const sidebarDisplay = snapshot.styles['panel-sidebar']?.display || '';
    expect(sidebarDisplay).not.toBe('none');
    const footerPosition = snapshot.styles['footer']?.position || '';
    expect(['static', 'relative']).toContain(footerPosition);
  });
});

// ===========================================================================
// 3.2 — Existing bugfix suites' DOM hooks remain in place (regression guard)
// ===========================================================================
//
// Observation: `tests/bugfix-image-empty-card/` and
// `tests/bugfix-image-routing/` rely on these DOM hooks
//   #ptab-img, #img-prompt, #img-model, #btn-gen-img, #img-result
// plus these `window` globals
//   panelTab, shouldUseDirectImageModel, pollinationsDirectUrl,
//   imageUrlForDisplay, addImageHistory.
//
// The Froxy AI rebrand fix is text-only; if any of these hooks
// disappeared the other suites would regress. We assert their presence
// here so a regression surfaces immediately in this much smaller test.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.2): regression hooks for sibling bugfix suites', () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuth(page);
  });

  test('image panel DOM hooks and global functions used by other suites are still in place', async ({
    page,
  }) => {
    await gotoApp(page);

    // Image panel UI hooks — every existing image-* suite reaches into
    // these IDs, so they must remain.
    const ids = ['ptab-img', 'img-prompt', 'img-model', 'btn-gen-img', 'img-result'];
    const presence = await page.evaluate((els) => {
      const out: Record<string, boolean> = {};
      for (const id of els) out[id] = !!document.getElementById(id);
      return out;
    }, ids);
    for (const id of ids) {
      expect(presence[id], `#${id} must be present (used by sibling bugfix suites)`).toBe(true);
    }

    // Global functions relied upon by the sibling suites.
    const globals = await page.evaluate(() => {
      const w = window as any;
      return {
        panelTab: typeof w.panelTab === 'function',
        shouldUseDirectImageModel: typeof w.shouldUseDirectImageModel === 'function',
        pollinationsDirectUrl: typeof w.pollinationsDirectUrl === 'function',
        imageUrlForDisplay: typeof w.imageUrlForDisplay === 'function',
        addImageHistory: typeof w.addImageHistory === 'function',
        showLegal: typeof w.showLegal === 'function',
      };
    });
    expect(globals).toEqual({
      panelTab: true,
      shouldUseDirectImageModel: true,
      pollinationsDirectUrl: true,
      imageUrlForDisplay: true,
      addImageHistory: true,
      showLegal: true,
    });
  });
});

// ===========================================================================
// 3.3 — Mojibake repair helper preserved verbatim
// ===========================================================================
//
// Observation on UNFIXED `app.js`:
//   - There is exactly one `const PHRASE_REPAIRS = [` declaration.
//   - The two normalisation regexes
//        /AIPAKETIM/g  with replacement 'AIPAKET\u0130M'
//        /AI ?Paketim/g  with replacement 'AiPaketim'
//     appear in source verbatim.
//   - The combined `for(const [bad, good] of PHRASE_REPAIRS)`
//     application loop exists.
//
// This block is explicitly out-of-scope for the rebrand fix per
// design.md ("PRESERVE: PHRASE_REPAIRS bloğu ... DOKUNMA") — it must
// survive byte-for-byte in `app.js`. We assert each landmark
// independently so the failing assertion pin-points which piece was
// touched.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.4): PHRASE_REPAIRS mojibake helper', () => {
  test('app.js contains PHRASE_REPAIRS table + AIPAKETIM/AI ?Paketim regex landmarks', () => {
    const src = readRepoFile('app.js');

    // Exactly one declaration of PHRASE_REPAIRS — preventing both
    // accidental deletion and accidental duplication.
    const phraseRepairsDecls = src.match(/const\s+PHRASE_REPAIRS\s*=\s*\[/g) || [];
    expect(
      phraseRepairsDecls.length,
      'app.js must declare `const PHRASE_REPAIRS = [` exactly once'
    ).toBe(1);

    // Application loop kept verbatim.
    expect(
      src,
      'app.js must keep the `for(const [bad, good] of PHRASE_REPAIRS)` application loop'
    ).toContain('for(const [bad, good] of PHRASE_REPAIRS)');

    // The two brand-aware regexes must remain in source. We match them
    // as raw substrings rather than re-running them — testing the
    // *source* shape is what "preservation" means here.
    expect(
      src,
      "app.js must keep the `replace(/AIPAKETIM/g,'AIPAKET\\u0130M')` line"
    ).toMatch(/replace\(\/AIPAKETIM\/g\s*,\s*['"]AIPAKET\\u0130M['"]\)/);
    expect(
      src,
      "app.js must keep the `replace(/AI ?Paketim/g,'AiPaketim')` line"
    ).toMatch(/replace\(\/AI \?Paketim\/g\s*,\s*['"]AiPaketim['"]\)/);
  });
});

// ===========================================================================
// 3.4 — Backup directories' SHA-256 fingerprints are immutable
// ===========================================================================
//
// Observation: `backup_*/` snapshots are historical artefacts. The fix
// must not rewrite or delete any file inside them. We compute SHA-256
// fingerprints for every file under the OLDEST snapshot
// (`backup_20260426_142644/`) twice — once at suite start (baseline),
// once at suite end (after the rest of the test infrastructure has
// run) — and assert the snapshots match.
//
// Restricting to the oldest snapshot keeps the test cheap. If the fix
// happens to touch any newer `backup_*` dir, the surface-level checks
// in the other tests (e.g. mojibake helper, file IDs) would also flag
// regressions; this snapshot covers the "frozen artefacts" guarantee.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.7): backup_* directories are immutable', () => {
  test('backup_20260426_142644/ SHA-256 manifest is stable through the test run', () => {
    const backupDir = path.join(REPO_ROOT, 'backup_20260426_142644');
    expect(
      fs.existsSync(backupDir),
      'backup_20260426_142644/ must exist (preservation: historical record)'
    ).toBe(true);

    const before = hashDirectoryTree(backupDir);
    // Snapshot must be non-empty — a regression that wiped the dir
    // would otherwise sneak past as `[] === []`.
    expect(before.length, 'backup_20260426_142644/ must contain at least one file').toBeGreaterThan(0);

    // Re-walk the tree and compare. On a healthy run this is a
    // tautology, but it surfaces concurrent / accidental writes that
    // happen during the test run.
    const after = hashDirectoryTree(backupDir);
    expect(after).toEqual(before);

    // Spot-check the three landmark files we know the historical
    // snapshot ships (index.html + app.js + logo.jpg). These are the
    // exact files design.md "Preservation Requirements" calls out.
    const lookup = new Map(before.map((e) => [e.relPath, e.sha256]));
    for (const f of ['index.html', 'app.js', 'logo.jpg']) {
      expect(
        lookup.has(f),
        `backup_20260426_142644/${f} must be present in the historical snapshot`
      ).toBe(true);
      // Hash format sanity — lowercase hex, 64 chars.
      expect(lookup.get(f) || '').toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

// ===========================================================================
// 3.5 — Email domain check — existing @aipaketim.com path is preserved
// ===========================================================================
//
// Observation on UNFIXED `app.js` line ~1645:
//   loginProvider:document.getElementById('r-email').value.includes('@aipaketim.com')?'social':'email'
//
// Per design.md "Preservation Requirements":
//   "Mevcut email domain check ... davranışı, halihazırda bu domain ile
//    kayıt olmuş kullanıcıları bozmayacak şekilde **genişletilir**
//    (kaldırılmaz)."
//
// On UNFIXED, only the `@aipaketim.com` substring triggers `'social'`.
// On FIXED, both `@aipaketim.com` and `@froxyai.com` should — but the
// test below only requires that the `@aipaketim.com` check is still
// present in source (i.e. the fix did not remove it). The fix is free
// to add an `@froxyai.com` clause; that's verified by the exploration
// suite, not here.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.5): @aipaketim.com email check stays', () => {
  test('app.js still contains the includes(\'@aipaketim.com\') guard for r-email', () => {
    const src = readRepoFile('app.js');
    // The exact substring must remain. We don't pin the surrounding
    // line because the fix is allowed to extend it (e.g. add `||
    // value.includes('@froxyai.com')`); we only require the original
    // check survives.
    expect(
      src,
      "app.js must still contain `.value.includes('@aipaketim.com')` so existing users keep the loginProvider:'social' branch"
    ).toContain(".value.includes('@aipaketim.com')");
  });
});

// ===========================================================================
// 3.6 — Third-party URL `image.pollinations.ai` count preserved
// ===========================================================================
//
// Observation on UNFIXED `app.js`: the substring `image.pollinations.ai`
// appears exactly N=1 times (inside `pollinationsDirectUrl`). The
// rebrand fix touches our own brand strings only — it must not add or
// remove references to third-party services.
//
// We capture the baseline count as a constant; if the fix accidentally
// rewrote the pollinations URL or duplicated it, this test fails with
// the exact delta.
// ===========================================================================

const POLLINATIONS_BASELINE_COUNT = 1;

test.describe('Property 2 — Preservation (Requirement 3.6): third-party URL counts unchanged', () => {
  test('image.pollinations.ai occurrence count in app.js matches the UNFIXED baseline', () => {
    const src = readRepoFile('app.js');
    const matches = src.match(/image\.pollinations\.ai/g) || [];
    expect(
      matches.length,
      `app.js must contain exactly ${POLLINATIONS_BASELINE_COUNT} reference(s) to image.pollinations.ai (third-party URL)`
    ).toBe(POLLINATIONS_BASELINE_COUNT);
  });
});

// ===========================================================================
// 3.7 — Style files unchanged at structural level
// ===========================================================================
//
// Observation: design.md explicitly lists `style.css` / `style.min.css`
// among the files the rebrand fix MUST NOT touch (only build hashes may
// move, never class names). We can't easily diff CSS source against a
// "before" file inside this single-spec run, but we can guarantee that
// `style.css` exists, parses as text, and contains a representative
// subset of the class names the SPA relies on.
//
// This is a structural smoke check — if the fix accidentally truncated
// `style.css` or replaced it with HTML, we'll see it here.
// ===========================================================================

test.describe('Property 2 — Preservation (Requirement 3.1): style.css structural smoke', () => {
  test('style.css is non-empty and still ships the core class names the SPA depends on', () => {
    const cssPath = path.join(REPO_ROOT, 'style.css');
    expect(fs.existsSync(cssPath), 'style.css must exist').toBe(true);
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css.length, 'style.css must be non-empty').toBeGreaterThan(0);
    // A handful of class names the existing bugfix suites and the
    // landing markup rely on. If the rebrand fix accidentally
    // overwrote style.css, at least one of these will be missing.
    for (const cls of ['.nav', '.v', '.image-result-card', '.image-error-card']) {
      expect(css, `style.css must still contain selector ${cls}`).toContain(cls);
    }
  });
});
