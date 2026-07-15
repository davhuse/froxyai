/**
 * CSS Analysis Script
 * Parses a CSS file and reports:
 *   1. Duplicate selectors (same selector appearing multiple times)
 *   2. @keyframes that are never referenced by animation/animation-name
 *   3. Version-tagged blocks with superseded older versions
 */
const fs = require('fs');
const path = require('path');

const cssFile = process.argv[2] || path.join(__dirname, '..', 'style.css');
const cssName = path.basename(cssFile);
console.log(`\n=== CSS Analysis: ${cssName} ===`);
console.log(`File: ${cssFile}`);

const raw = fs.readFileSync(cssFile, 'utf8');
const lines = raw.split('\n');
console.log(`Size: ${(Buffer.byteLength(raw) / 1024).toFixed(1)} KB`);
console.log(`Lines: ${lines.length}`);

// ─── Parse CSS into blocks ───────────────────────────────────────────────
// We'll track: selector, startLine, endLine, content, isKeyframe, version
function parseBlocks(css) {
  const blocks = [];
  let i = 0;
  const len = css.length;
  
  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(css[i])) i++;
    if (i >= len) break;
    
    // Check for comments
    if (css[i] === '/' && css[i+1] === '*') {
      const commentStart = i;
      i += 2;
      while (i < len - 1 && !(css[i] === '*' && css[i+1] === '/')) i++;
      i += 2;
      // Store comment text for version detection
      const commentText = css.substring(commentStart, i);
      // Don't skip - we need to associate with next block
      blocks.push({ type: 'comment', text: commentText, start: commentStart, end: i });
      continue;
    }
    
    // Read selector (everything before {)
    let selectorStart = i;
    let braceDepth = 0;
    let selector = '';
    
    // Find the opening brace
    while (i < len && css[i] !== '{') {
      i++;
    }
    if (i >= len) break;
    
    selector = css.substring(selectorStart, i).trim();
    if (!selector) { i++; continue; }
    
    // Now read the entire block including nested braces
    const blockStart = selectorStart;
    braceDepth = 0;
    let blockEnd = i;
    
    // Count opening brace
    braceDepth++;
    i++;
    
    while (i < len && braceDepth > 0) {
      if (css[i] === '{') braceDepth++;
      else if (css[i] === '}') braceDepth--;
      // Skip string literals and comments inside blocks
      else if (css[i] === '/' && css[i+1] === '*') {
        i += 2;
        while (i < len - 1 && !(css[i] === '*' && css[i+1] === '/')) i++;
        i += 1; // will be incremented below
      }
      else if (css[i] === '"' || css[i] === "'") {
        const q = css[i];
        i++;
        while (i < len && css[i] !== q) {
          if (css[i] === '\\') i++;
          i++;
        }
      }
      i++;
    }
    
    blockEnd = i;
    const content = css.substring(blockStart, blockEnd);
    
    // Determine line numbers
    const startLine = css.substring(0, blockStart).split('\n').length;
    const endLine = css.substring(0, blockEnd).split('\n').length;
    
    const isKeyframe = /^@keyframes\s+/i.test(selector);
    const isMediaQuery = /^@media/i.test(selector);
    
    blocks.push({
      type: 'rule',
      selector: selector,
      content: content,
      startLine,
      endLine,
      isKeyframe,
      isMediaQuery,
      keyframeName: isKeyframe ? selector.replace(/^@keyframes\s+/, '').trim() : null
    });
  }
  
  return blocks;
}

// ─── Remove comments for clean parsing ───────────────────────────────────
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const blocks = parseBlocks(raw).filter(b => b.type === 'rule');
console.log(`\nTotal CSS blocks: ${blocks.length}`);

// ─── 1. Duplicate Selectors ─────────────────────────────────────────────
const selectorMap = new Map();
for (const block of blocks) {
  if (block.isKeyframe || block.isMediaQuery) continue;
  const key = block.selector.replace(/\s+/g, ' ').trim();
  if (!selectorMap.has(key)) selectorMap.set(key, []);
  selectorMap.get(key).push(block);
}

const duplicates = [...selectorMap.entries()]
  .filter(([, arr]) => arr.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

console.log(`\n── DUPLICATE SELECTORS ──`);
console.log(`Unique selectors: ${selectorMap.size}`);
console.log(`Selectors with duplicates: ${duplicates.length}`);

let totalDuplicateBlocks = 0;
let totalDuplicateBytes = 0;

for (const [sel, arr] of duplicates) {
  totalDuplicateBlocks += arr.length - 1; // all but the last one are redundant
  // Sum bytes of all but the last
  for (let i = 0; i < arr.length - 1; i++) {
    totalDuplicateBytes += arr[i].content.length;
  }
}
console.log(`Total removable duplicate blocks: ${totalDuplicateBlocks}`);
console.log(`Estimated savings: ${(totalDuplicateBytes / 1024).toFixed(1)} KB`);

// Show top duplicates
console.log(`\nTop 30 duplicated selectors:`);
for (const [sel, arr] of duplicates.slice(0, 30)) {
  const displaySel = sel.length > 80 ? sel.substring(0, 77) + '...' : sel;
  console.log(`  ${arr.length}x  ${displaySel}  (lines: ${arr.map(a=>a.startLine).join(', ')})`);
}

// ─── 2. @keyframes Analysis ─────────────────────────────────────────────
const keyframeBlocks = blocks.filter(b => b.isKeyframe);
const keyframeNames = new Set(keyframeBlocks.map(b => b.keyframeName));

// Duplicate keyframes
const kfMap = new Map();
for (const block of keyframeBlocks) {
  if (!kfMap.has(block.keyframeName)) kfMap.set(block.keyframeName, []);
  kfMap.get(block.keyframeName).push(block);
}
const dupKeyframes = [...kfMap.entries()].filter(([, arr]) => arr.length > 1);

console.log(`\n── @KEYFRAMES ANALYSIS ──`);
console.log(`Total @keyframes blocks: ${keyframeBlocks.length}`);
console.log(`Unique @keyframes names: ${keyframeNames.size}`);
console.log(`Duplicate @keyframes: ${dupKeyframes.length} names with duplicates`);

for (const [name, arr] of dupKeyframes) {
  console.log(`  ${arr.length}x  @keyframes ${name}  (lines: ${arr.map(a=>a.startLine).join(', ')})`);
}

// Check which keyframes are actually referenced
const cleanedCSS = stripComments(raw);
// Look for animation: or animation-name: properties that reference keyframe names
const referencedKeyframes = new Set();

for (const name of keyframeNames) {
  // Check if name appears in animation or animation-name property values
  // We need to be careful: the name might appear in a selector name too
  // Look for: animation:...name... or animation-name:...name...
  const animRegex = new RegExp(`animation(?:-name)?\\s*:[^;}]*\\b${escapeRegex(name)}\\b`, 'gi');
  if (animRegex.test(cleanedCSS)) {
    referencedKeyframes.add(name);
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const orphanedKeyframes = [...keyframeNames].filter(n => !referencedKeyframes.has(n));
let orphanedKfBytes = 0;
for (const name of orphanedKeyframes) {
  const kfBlocks = kfMap.get(name) || [];
  for (const b of kfBlocks) orphanedKfBytes += b.content.length;
}

console.log(`\nReferenced keyframes: ${referencedKeyframes.size}`);
console.log(`Orphaned (unreferenced) keyframes: ${orphanedKeyframes.length}`);
console.log(`Orphaned keyframes bytes: ${(orphanedKfBytes / 1024).toFixed(1)} KB`);
if (orphanedKeyframes.length > 0) {
  console.log(`\nOrphaned keyframes list:`);
  for (const name of orphanedKeyframes) {
    const kfBlocks = kfMap.get(name) || [];
    console.log(`  @keyframes ${name}  (${kfBlocks.length} definition(s), lines: ${kfBlocks.map(b=>b.startLine).join(', ')})`);
  }
}

// ─── 3. Version-Tagged Blocks ────────────────────────────────────────────
// Look for patterns like /* v192 */, /* v206 */, etc.
const versionCommentRegex = /\/\*\s*v(\d+)\s*\*\//g;
const versionMap = new Map(); // base pattern -> [{version, startIndex, ...}]

// Find all version comments and the block that follows them
let match;
while ((match = versionCommentRegex.exec(raw)) !== null) {
  const version = parseInt(match[1]);
  const commentEnd = match.index + match[0].length;
  const lineNum = raw.substring(0, match.index).split('\n').length;
  
  // Try to identify what selector/section this version tag applies to
  // Look at the next non-whitespace content after the comment
  let nextContent = raw.substring(commentEnd, commentEnd + 200).trim();
  // Get the selector or first meaningful line
  const selectorMatch = nextContent.match(/^([^{]+)\{/);
  const baseSelector = selectorMatch ? selectorMatch[1].trim() : nextContent.substring(0, 60);
  
  if (!versionMap.has(baseSelector)) versionMap.set(baseSelector, []);
  versionMap.get(baseSelector).push({ version, line: lineNum, commentIndex: match.index });
}

const versionedSelectors = [...versionMap.entries()].filter(([, arr]) => arr.length > 1);
console.log(`\n── VERSION-TAGGED BLOCKS ──`);
console.log(`Total version comments found: ${[...versionMap.values()].reduce((s, a) => s + a.length, 0)}`);
console.log(`Selectors with version tags: ${versionMap.size}`);
console.log(`Selectors with MULTIPLE versions (superseded older ones): ${versionedSelectors.length}`);

for (const [sel, arr] of versionedSelectors.slice(0, 20)) {
  const versions = arr.map(a => `v${a.version}(L${a.line})`).join(', ');
  const displaySel = sel.length > 60 ? sel.substring(0, 57) + '...' : sel;
  console.log(`  ${displaySel}: ${versions}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════`);
console.log(`SUMMARY for ${cssName}:`);
console.log(`  Current size: ${(Buffer.byteLength(raw) / 1024).toFixed(1)} KB`);
console.log(`  Duplicate selector blocks to remove: ${totalDuplicateBlocks} (~${(totalDuplicateBytes/1024).toFixed(1)} KB)`);
console.log(`  Orphaned @keyframes to remove: ${orphanedKeyframes.length} (~${(orphanedKfBytes/1024).toFixed(1)} KB)`);
console.log(`  Duplicate @keyframes to deduplicate: ${dupKeyframes.length}`);
console.log(`  Version-tagged blocks to clean: ${versionedSelectors.length}`);
console.log(`  Estimated total savings: ~${((totalDuplicateBytes + orphanedKfBytes) / 1024).toFixed(1)} KB`);
console.log(`══════════════════════════════════════════\n`);

// Write analysis data to JSON for the cleaning script
const analysisData = {
  file: cssFile,
  size: Buffer.byteLength(raw),
  lines: lines.length,
  totalBlocks: blocks.length,
  duplicateSelectors: duplicates.map(([sel, arr]) => ({
    selector: sel,
    count: arr.length,
    lines: arr.map(a => a.startLine)
  })),
  keyframes: {
    total: keyframeBlocks.length,
    unique: keyframeNames.size,
    referenced: [...referencedKeyframes],
    orphaned: orphanedKeyframes,
    duplicates: dupKeyframes.map(([name, arr]) => ({
      name,
      count: arr.length,
      lines: arr.map(a => a.startLine)
    }))
  },
  versionedBlocks: versionedSelectors.map(([sel, arr]) => ({
    selector: sel,
    versions: arr.map(a => ({ version: a.version, line: a.line }))
  }))
};

const outFile = path.join(__dirname, `analysis_${cssName.replace('.css', '')}.json`);
fs.writeFileSync(outFile, JSON.stringify(analysisData, null, 2));
console.log(`Analysis data saved to: ${outFile}`);
