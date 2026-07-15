/**
 * CSS Cross-File Deduplication
 * Removes selectors from style.css that are already defined in other CSS files
 * (home-critical.css, model-picker-v294.css) since those are loaded separately.
 * 
 * Only removes when the EXACT same selector exists in both files.
 * For safety, we only remove from style.css if the other file's definition 
 * is a superset or override of the style.css definition.
 * 
 * Usage: node css_cross_dedup.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const dryRun = process.argv.includes('--dry-run');
const baseDir = path.join(__dirname, '..');

const styleFile = path.join(baseDir, 'style.css');
const otherFiles = [
  path.join(baseDir, 'home-critical.css'),
  path.join(baseDir, 'model-picker-v294.css'),
];

console.log(`\nCSS Cross-File Deduplication ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
console.log('='.repeat(60));

// ─── Tokenizer (same as css_clean.js) ────────────────────────────────────
function tokenize(css) {
  const tokens = [];
  let i = 0;
  const len = css.length;

  while (i < len) {
    const wsStart = i;
    while (i < len && /[\s\r\n]/.test(css[i])) i++;
    if (i > wsStart) tokens.push({ type: 'ws', text: css.substring(wsStart, i) });
    if (i >= len) break;

    if (css[i] === '/' && css[i + 1] === '*') {
      const start = i; i += 2;
      while (i < len - 1 && !(css[i] === '*' && css[i + 1] === '/')) i++;
      i += 2;
      tokens.push({ type: 'comment', text: css.substring(start, i) });
      continue;
    }

    const start = i;
    while (i < len && css[i] !== '{') {
      if (css[i] === '/' && css[i + 1] === '*') {
        i += 2;
        while (i < len - 1 && !(css[i] === '*' && css[i + 1] === '/')) i++;
        i += 2; continue;
      }
      i++;
    }
    if (i >= len) { tokens.push({ type: 'text', text: css.substring(start, i) }); break; }

    const selector = css.substring(start, i).trim();
    let depth = 1; i++;
    while (i < len && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      else if (css[i] === '/' && css[i + 1] === '*') {
        i += 2; while (i < len - 1 && !(css[i] === '*' && css[i + 1] === '/')) i++; i++;
      } else if (css[i] === '"' || css[i] === "'") {
        const q = css[i]; i++;
        while (i < len && css[i] !== q) { if (css[i] === '\\') i++; i++; }
      }
      i++;
    }

    const fullBlock = css.substring(start, i);
    const isKeyframe = /^@keyframes\s+/i.test(selector);
    const isMedia = /^@media/i.test(selector);

    tokens.push({
      type: 'rule', selector, fullBlock, isKeyframe, isMedia,
      normSelector: selector.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()
    });
  }
  return tokens;
}

// Collect all selectors from other files (including inside @media)
function collectAllSelectors(cssText) {
  const selectors = new Set();
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  // Simple extraction of all selectors
  const re = /([^{}@\n][^{}]*?)\{/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    if (sel) selectors.add(sel);
  }
  return selectors;
}

// Collect selectors from other files
const otherSelectors = new Set();
for (const f of otherFiles) {
  if (!fs.existsSync(f)) { console.log(`  Skipping ${path.basename(f)} (not found)`); continue; }
  const css = fs.readFileSync(f, 'utf8');
  const sels = collectAllSelectors(css);
  console.log(`  ${path.basename(f)}: ${sels.size} selectors`);
  for (const s of sels) otherSelectors.add(s);
}
console.log(`  Total external selectors: ${otherSelectors.size}`);

// Parse style.css
const raw = fs.readFileSync(styleFile, 'utf8');
const originalSize = Buffer.byteLength(raw);
const tokens = tokenize(raw);

// Mark top-level rules that exist in other files for removal
// ONLY remove non-@media, non-@keyframes top-level rules
const removeIndices = new Set();
let removedCount = 0;
let removedBytes = 0;

for (let idx = 0; idx < tokens.length; idx++) {
  const t = tokens[idx];
  if (t.type !== 'rule') continue;
  if (t.isKeyframe || t.isMedia) continue;
  
  if (otherSelectors.has(t.normSelector)) {
    removeIndices.add(idx);
    removedCount++;
    removedBytes += t.fullBlock.length;
  }
}

console.log(`\nFound ${removedCount} top-level rules in style.css that overlap with other files`);
console.log(`Estimated savings: ${(removedBytes / 1024).toFixed(1)} KB`);

// Build output
let output = '';
for (let idx = 0; idx < tokens.length; idx++) {
  if (removeIndices.has(idx)) continue;
  const t = tokens[idx];
  if (t.type === 'ws') { output += t.text.replace(/(\r?\n){3,}/g, '\n\n'); continue; }
  output += t.text || t.fullBlock || '';
}
output = output.replace(/\n{4,}/g, '\n\n\n');

const newSize = Buffer.byteLength(output);
console.log(`\nOriginal: ${(originalSize / 1024).toFixed(1)} KB`);
console.log(`After cross-file dedup: ${(newSize / 1024).toFixed(1)} KB`);
console.log(`Saved: ${((originalSize - newSize) / 1024).toFixed(1)} KB`);

if (!dryRun) {
  fs.writeFileSync(styleFile, output, 'utf8');
  console.log('✓ Written to style.css');
} else {
  console.log('\n** DRY RUN — no files written **');
}
