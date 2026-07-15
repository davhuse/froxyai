// Invariant tests for auth-modal-redesign (centered card + particles version)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('style.css: v119 legacy banner removed', () => {
  assert.ok(!/v119\s*[—-]\s*MODERN AUTH MODAL/.test(CSS));
});

test('style.css: v119.2 legacy banner removed', () => {
  assert.ok(!/v119\.2\s*[—-]\s*AUTH MODAL/.test(CSS));
});

test('style.css: new centered card banner present', () => {
  assert.ok(/AUTH MODAL.*centered card/.test(CSS));
});

test('style.css: no dead selectors (auth-hero-stack, auth-blob, ahc-*)', () => {
  assert.ok(!/\.auth-hero-stack\b/.test(CSS));
  assert.ok(!/\.auth-hero-card\b/.test(CSS));
  assert.ok(!/\.auth-blob-[abc]\b/.test(CSS));
  assert.ok(!/\.ahc-(icon|body|status)\b/.test(CSS));
});

test('style.css: no stale keyframes', () => {
  assert.ok(!/@keyframes\s+(cardFloat|blobFloatA|blobFloatB|blobFloatC)\b/.test(CSS));
});

test('style.css: new selectors present', () => {
  for (const sel of ['.modal.auth-modal-v2', '.auth-modal-v2 .auth-shell', '.auth-modal-v2 .auth-panel', '.auth-particle', '.auth-modal-v2 .auth-primary-btn']) {
    assert.ok(CSS.includes(sel), `missing: ${sel}`);
  }
});

test('style.css: responsive + reduced motion present', () => {
  assert.ok(/@media\s*\(max-width\s*:\s*480px\)/.test(CSS));
  assert.ok(/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/.test(CSS));
});

test('style.css: light theme overrides present', () => {
  assert.ok(/body\.theme-light .modal\.auth-modal-v2/.test(CSS) || /body\.theme-light .auth-modal-v2/.test(CSS));
});

test('index.html: all required ids present', () => {
  for (const id of ['auth-modal','auth-modal-title','auth-error','f-login','f-reg','f-forgot','t-login','t-reg','l-email','l-pass','r-user','r-email','r-pass','r-ref','r-plan','fp-email','fp-msg','first-time-banner']) {
    assert.ok(new RegExp(`id="${id}"`).test(HTML), `missing id="${id}"`);
  }
});

test('index.html: JS contract handlers present', () => {
  for (const pat of [/onclick="closeM\(\)"/, /onclick="tab\('login'\)"/, /onclick="tab\('reg'\)"/, /onclick="tab\('forgot'\);return false;"/, /onclick="doAuth\('login'\)"/, /onclick="doAuth\('register'\)"/, /onclick="doForgotPassword\(\)"/, /onclick="socialLogin\('google'\)"/, /onclick="socialLogin\('github'\)"/]) {
    assert.ok(pat.test(HTML), `missing: ${pat}`);
  }
});

test('index.html: floating particles present', () => {
  assert.ok(/class="auth-particle p1"/.test(HTML));
  assert.ok(/class="auth-particle p8"/.test(HTML));
});

test('index.html: no old dead decorative elements', () => {
  assert.ok(!/class="auth-orbit"/.test(HTML), 'auth-orbit should not exist');
  assert.ok(!/auth-blob/.test(HTML), 'auth-blob should not exist');
  assert.ok(!/auth-hero-stack/.test(HTML), 'auth-hero-stack should not exist');
});
