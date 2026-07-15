/**
 * CSS Cleaning Script — Deep Deduplication
 * 
 * Strategy:
 *   1. Parse CSS into top-level blocks (rules, @media, @keyframes, comments)
 *   2. For duplicate selectors at top level → keep LAST definition only
 *   3. For duplicate @keyframes → keep LAST definition only
 *   4. Remove orphaned @keyframes not referenced by any animation property
 *   5. Merge duplicate @media queries → then deduplicate rules inside them
 *   6. Optionally dry-run first
 *
 * Usage: node css_clean.js <file.css> [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const cssFile = process.argv[2] || path.join(__dirname, '..', 'style.css');
const dryRun = process.argv.includes('--dry-run');
const cssName = path.basename(cssFile);

console.log(`\n${'='.repeat(60)}`);
console.log(`CSS CLEANER: ${cssName} ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
console.log(`${'='.repeat(60)}`);

const raw = fs.readFileSync(cssFile, 'utf8');
const originalSize = Buffer.byteLength(raw);
console.log(`Original size: ${(originalSize / 1024).toFixed(1)} KB (${raw.split('\n').length} lines)`);

// ─── Tokenizer ───────────────────────────────────────────────────────────
// Parse CSS into top-level blocks preserving order and content exactly.
function tokenize(css) {
  const tokens = [];
  let i = 0;
  const len = css.length;

  while (i < len) {
    // Collect whitespace
    const wsStart = i;
    while (i < len && /[\s\r\n]/.test(css[i])) i++;
    if (i > wsStart) {
      tokens.push({ type: 'ws', text: css.substring(wsStart, i) });
    }
    if (i >= len) break;

    // Comment
    if (css[i] === '/' && css[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < len - 1 && !(css[i] === '*' && css[i + 1] === '/')) i++;
      i += 2;
      tokens.push({ type: 'comment', text: css.substring(start, i) });
      continue;
    }

    // Read selector/at-rule
    const start = i;
    let selector = '';

    // Read until opening brace
    while (i < len && css[i] !== '{') {
      // Skip comments inside selector
      if (css[i] === '/' && css[i + 1] === '*') {
        i += 2;
        while (i < len - 1 && !(css[i] === '*' && css[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      i++;
    }
    if (i >= len) {
      // Leftover text (no brace found)
      tokens.push({ type: 'text', text: css.substring(start, i) });
      break;
    }

    selector = css.substring(start, i).trim();

    // Read block with balanced braces
    let depth = 1;
    i++; // skip opening {
    const bodyStart = i;
    while (i < len && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      else if (css[i] === '/' && css[i + 1] === '*') {
        i += 2;
        while (i < len - 1 && !(css[i] === '*' && css[i + 1] === '/')) i++;
        i++;
      } else if (css[i] === '"' || css[i] === "'") {
        const q = css[i]; i++;
        while (i < len && css[i] !== q) { if (css[i] === '\\') i++; i++; }
      }
      i++;
    }

    const fullBlock = css.substring(start, i);
    const body = css.substring(bodyStart, i - 1); // content between { }

    const isKeyframe = /^@keyframes\s+/i.test(selector);
    const isMedia = /^@media/i.test(selector);
    const kfName = isKeyframe ? selector.replace(/^@keyframes\s+/, '').trim() : null;
    // Normalise media query key for grouping (remove whitespace differences)
    const mqKey = isMedia ? selector.replace(/\s+/g, '').toLowerCase() : null;

    tokens.push({
      type: 'rule',
      selector,
      body,
      fullBlock,
      isKeyframe,
      isMedia,
      kfName,
      mqKey
    });
  }
  return tokens;
}

// ─── Normalise selector for comparison ───────────────────────────────────
function normSel(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
}

// ─── Parse inner rules of a block (single-level, for @media bodies) ────
function parseInnerRules(bodyText) {
  const rules = [];
  let i = 0;
  const len = bodyText.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /[\s\r\n]/.test(bodyText[i])) i++;
    if (i >= len) break;

    // Comment
    if (bodyText[i] === '/' && bodyText[i + 1] === '*') {
      const s = i; i += 2;
      while (i < len - 1 && !(bodyText[i] === '*' && bodyText[i + 1] === '/')) i++;
      i += 2;
      rules.push({ type: 'comment', text: bodyText.substring(s, i) });
      continue;
    }

    const ruleStart = i;
    // Find opening brace
    while (i < len && bodyText[i] !== '{') {
      if (bodyText[i] === '/' && bodyText[i + 1] === '*') {
        i += 2;
        while (i < len - 1 && !(bodyText[i] === '*' && bodyText[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      i++;
    }
    if (i >= len) {
      const leftover = bodyText.substring(ruleStart).trim();
      if (leftover) rules.push({ type: 'text', text: leftover });
      break;
    }

    const sel = bodyText.substring(ruleStart, i).trim();
    // Read block
    let depth = 1; i++;
    while (i < len && depth > 0) {
      if (bodyText[i] === '{') depth++;
      else if (bodyText[i] === '}') depth--;
      i++;
    }
    const fullRule = bodyText.substring(ruleStart, i);
    rules.push({ type: 'rule', selector: sel, fullText: fullRule });
  }
  return rules;
}

// ─── Deduplicate inner rules (keep last) ─────────────────────────────────
function deduplicateInnerRules(innerRules) {
  const selMap = new Map();
  // First pass: find all selectors and their indices
  for (let idx = 0; idx < innerRules.length; idx++) {
    const r = innerRules[idx];
    if (r.type !== 'rule') continue;
    const key = normSel(r.selector);
    if (!selMap.has(key)) selMap.set(key, []);
    selMap.get(key).push(idx);
  }

  const removeSet = new Set();
  for (const [, indices] of selMap) {
    if (indices.length > 1) {
      // Remove all but the last
      for (let j = 0; j < indices.length - 1; j++) {
        removeSet.add(indices[j]);
      }
    }
  }

  return {
    filtered: innerRules.filter((_, idx) => !removeSet.has(idx)),
    removedCount: removeSet.size
  };
}

const tokens = tokenize(raw);
const ruleTokens = tokens.filter(t => t.type === 'rule');
console.log(`Parsed ${ruleTokens.length} top-level blocks`);

// ─── Step 1: Deduplicate top-level non-media, non-keyframe selectors ────
const selectorLastIndex = new Map(); // normSel -> last index in tokens
const keyframeLastIndex = new Map(); // kfName -> last index
const mediaGroups = new Map(); // mqKey -> [indices]

let stats = {
  dupSelectorsRemoved: 0,
  dupKeyframesRemoved: 0,
  orphanedKeyframesRemoved: 0,
  dupMediaMerged: 0,
  dupInsideMediaRemoved: 0,
};

for (let idx = 0; idx < tokens.length; idx++) {
  const t = tokens[idx];
  if (t.type !== 'rule') continue;

  if (t.isKeyframe) {
    keyframeLastIndex.set(t.kfName, idx);
  } else if (t.isMedia) {
    if (!mediaGroups.has(t.mqKey)) mediaGroups.set(t.mqKey, []);
    mediaGroups.get(t.mqKey).push(idx);
  } else {
    const key = normSel(t.selector);
    selectorLastIndex.set(key, idx);
  }
}

// Mark tokens for removal
const removeIndices = new Set();

// Remove earlier duplicates of top-level selectors
{
  const selectorOccurrences = new Map();
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.type !== 'rule' || t.isKeyframe || t.isMedia) continue;
    const key = normSel(t.selector);
    if (!selectorOccurrences.has(key)) selectorOccurrences.set(key, []);
    selectorOccurrences.get(key).push(idx);
  }
  for (const [, indices] of selectorOccurrences) {
    if (indices.length > 1) {
      for (let j = 0; j < indices.length - 1; j++) {
        removeIndices.add(indices[j]);
        stats.dupSelectorsRemoved++;
      }
    }
  }
}

// Remove earlier duplicates of @keyframes
{
  const kfOccurrences = new Map();
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.type !== 'rule' || !t.isKeyframe) continue;
    if (!kfOccurrences.has(t.kfName)) kfOccurrences.set(t.kfName, []);
    kfOccurrences.get(t.kfName).push(idx);
  }
  for (const [, indices] of kfOccurrences) {
    if (indices.length > 1) {
      for (let j = 0; j < indices.length - 1; j++) {
        removeIndices.add(indices[j]);
        stats.dupKeyframesRemoved++;
      }
    }
  }
}

// ─── Step 2: Remove orphaned @keyframes ──────────────────────────────────
// Collect all keyframe names, then check if they're referenced
{
  const allCSS = raw.replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments
  const allKfNames = new Set();
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.type === 'rule' && t.isKeyframe && !removeIndices.has(idx)) {
      allKfNames.add(t.kfName);
    }
  }

  for (const name of allKfNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`animation(?:-name)?\\s*:[^;}]*\\b${escaped}\\b`, 'i');
    if (!regex.test(allCSS)) {
      // Find the remaining (last) token for this keyframe and remove it
      for (let idx = tokens.length - 1; idx >= 0; idx--) {
        const t = tokens[idx];
        if (t.type === 'rule' && t.isKeyframe && t.kfName === name && !removeIndices.has(idx)) {
          removeIndices.add(idx);
          stats.orphanedKeyframesRemoved++;
          break;
        }
      }
    }
  }
}

// ─── Step 3: Merge duplicate @media queries ──────────────────────────────
// For each group of same-query @media blocks, merge their bodies and deduplicate inner rules.
// We'll replace the LAST occurrence with the merged content, and remove earlier ones.
const mergedMediaBodies = new Map(); // index -> new body text

for (const [mqKey, indices] of mediaGroups) {
  if (indices.length <= 1) continue;

  // Collect all inner rules from all blocks
  let allInner = [];
  for (const idx of indices) {
    const t = tokens[idx];
    const inner = parseInnerRules(t.body);
    allInner = allInner.concat(inner);
  }

  // Deduplicate inner rules
  const { filtered, removedCount } = deduplicateInnerRules(allInner);
  stats.dupInsideMediaRemoved += removedCount;
  stats.dupMediaMerged += indices.length - 1;

  // Rebuild merged body
  const mergedBody = filtered.map(r => {
    if (r.type === 'rule') return r.fullText;
    if (r.type === 'comment') return r.text;
    return r.text || '';
  }).join('\n');

  // Remove all but last, replace last with merged
  const lastIdx = indices[indices.length - 1];
  for (let j = 0; j < indices.length - 1; j++) {
    removeIndices.add(indices[j]);
  }
  mergedMediaBodies.set(lastIdx, mergedBody);
}

// ─── Step 4: Also deduplicate within non-merged single @media blocks ────
for (let idx = 0; idx < tokens.length; idx++) {
  const t = tokens[idx];
  if (t.type !== 'rule' || !t.isMedia || removeIndices.has(idx)) continue;
  if (mergedMediaBodies.has(idx)) continue; // already handled

  const inner = parseInnerRules(t.body);
  const { filtered, removedCount } = deduplicateInnerRules(inner);
  if (removedCount > 0) {
    stats.dupInsideMediaRemoved += removedCount;
    const mergedBody = filtered.map(r => {
      if (r.type === 'rule') return r.fullText;
      if (r.type === 'comment') return r.text;
      return r.text || '';
    }).join('\n');
    mergedMediaBodies.set(idx, mergedBody);
  }
}

// ─── Build output ────────────────────────────────────────────────────────
let output = '';
for (let idx = 0; idx < tokens.length; idx++) {
  const t = tokens[idx];

  if (removeIndices.has(idx)) {
    // Also remove any preceding whitespace token
    continue;
  }

  if (t.type === 'ws') {
    // Collapse excessive newlines
    const collapsed = t.text.replace(/(\r?\n){3,}/g, '\n\n');
    output += collapsed;
    continue;
  }

  if (t.type === 'comment') {
    output += t.text;
    continue;
  }

  if (t.type === 'text') {
    output += t.text;
    continue;
  }

  // Rule token
  if (mergedMediaBodies.has(idx)) {
    // Rebuild with merged body
    output += t.selector + '{\n' + mergedMediaBodies.get(idx) + '\n}';
  } else {
    output += t.fullBlock;
  }
}

// Clean up excessive blank lines
output = output.replace(/\n{4,}/g, '\n\n\n');

const newSize = Buffer.byteLength(output);
const savings = originalSize - newSize;

console.log(`\n── CLEANING RESULTS ──`);
console.log(`Duplicate selectors removed: ${stats.dupSelectorsRemoved}`);
console.log(`Duplicate @keyframes removed: ${stats.dupKeyframesRemoved}`);
console.log(`Orphaned @keyframes removed: ${stats.orphanedKeyframesRemoved}`);
console.log(`@media blocks merged: ${stats.dupMediaMerged}`);
console.log(`Duplicate rules inside @media removed: ${stats.dupInsideMediaRemoved}`);
console.log(`\nOriginal: ${(originalSize / 1024).toFixed(1)} KB`);
console.log(`Cleaned:  ${(newSize / 1024).toFixed(1)} KB`);
console.log(`Saved:    ${(savings / 1024).toFixed(1)} KB (${((savings / originalSize) * 100).toFixed(1)}%)`);

if (dryRun) {
  console.log(`\n** DRY RUN — no files written. Run without --dry-run to apply. **`);
} else {
  fs.writeFileSync(cssFile, output, 'utf8');
  console.log(`\n✓ Written to ${cssFile}`);
}

console.log(`${'='.repeat(60)}\n`);
