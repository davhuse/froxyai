#!/usr/bin/env node
/**
 * js_clean.js — Conservative cleanup of app.js
 * 
 * Strategy:
 * 1. The file has massive IIFE duplication at lines 356-925 (v350/v351 early copies)
 *    that are fully superseded by the final v351 IIFE at lines 14339-14519
 *    and v354 blocks at 14522-14601.
 * 
 * 2. The v350 "last writer" IIFE at lines 538-592 is superseded by v350 absolute final at 14297-14337
 * 
 * 3. The v350 "unified UI repair" IIFE at lines 594-925 is superseded by v351 at 14339-14519
 * 
 * 4. The v347 "last-mile repair" at 14214-14281 is superseded by v354 blocks at end
 * 
 * 5. The v350 "absolute tail runner" timeout at 14283-14295 is subsumed by v354 hooks
 * 
 * 6. The v350 "absolute final" IIFE at 14297-14337 is superseded by v351 at 14339-14519
 * 
 * 7. Fix Turkish mojibake in the v354 hard final block (lines 14547-14601)
 *    which has ? instead of Turkish characters
 * 
 * 8. Remove the duplicate early v351 IIFE (lines 356-536) which is superseded
 *    by the final v351 at 14339-14519
 *
 * IMPORTANT: We keep all unique functionality blocks and only remove
 * blocks that are 100% superseded by later identical/improved versions.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'app.js');
const content = fs.readFileSync(FILE, 'utf8');
const lines = content.split('\n');

console.log('=== app.js Cleanup Script ===');
console.log(`Before: ${lines.length} lines, ${(content.length/1024).toFixed(1)} KB`);

// Helper: find IIFE boundaries starting from a given line
function findIIFEEnd(lines, startLine) {
  let depth = 0;
  let started = false;
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; started = true; }
      if (ch === '}') { depth--; }
      if (started && depth === 0) return i;
    }
  }
  return lines.length - 1;
}

// We'll collect ranges to remove (0-indexed line numbers, inclusive)
const removals = [];

// === REMOVAL 1: Early v351 IIFE block (lines 356-536) ===
// This is "v351 UI repair" that's fully superseded by the final v351 at lines 14339-14519
// Line 356 starts with: /* v351 UI repair: one stable renderer...
// Line 536 ends with: })();
{
  const startIdx = lines.findIndex((l, i) => i >= 355 && i <= 360 && l.includes('v351 UI repair'));
  if (startIdx >= 0) {
    const endIdx = findIIFEEnd(lines, startIdx);
    console.log(`\nRemoval 1: Early v351 IIFE (lines ${startIdx+1}-${endIdx+1})`);
    console.log(`  First line: ${lines[startIdx].substring(0, 80)}`);
    console.log(`  Last line:  ${lines[endIdx].substring(0, 80)}`);
    removals.push([startIdx, endIdx]);
  }
}

// === REMOVAL 2: v350 "last writer" IIFE (lines 538-592) ===
// Superseded by v350 absolute final at 14297-14337
{
  const startIdx = lines.findIndex((l, i) => i >= 536 && i <= 542 && l.includes('v350 last writer'));
  if (startIdx >= 0) {
    const endIdx = findIIFEEnd(lines, startIdx + 1);
    console.log(`\nRemoval 2: v350 last writer IIFE (lines ${startIdx+1}-${endIdx+1})`);
    console.log(`  First line: ${lines[startIdx].substring(0, 80)}`);
    console.log(`  Last line:  ${lines[endIdx].substring(0, 80)}`);
    removals.push([startIdx, endIdx]);
  }
}

// === REMOVAL 3: v350 "final unified UI repair" IIFE (lines 594-925) ===
// Superseded by v351 absolute final at 14339
{
  const startIdx = lines.findIndex((l, i) => i >= 592 && i <= 598 && l.includes('v350 final: unified UI repair'));
  if (startIdx >= 0) {
    const endIdx = findIIFEEnd(lines, startIdx + 1);
    console.log(`\nRemoval 3: v350 unified UI repair IIFE (lines ${startIdx+1}-${endIdx+1})`);
    console.log(`  First line: ${lines[startIdx].substring(0, 80)}`);
    console.log(`  Last line:  ${lines[endIdx].substring(0, 80)}`);
    removals.push([startIdx, endIdx]);
  }
}

// === REMOVAL 4: v347 "last-mile repair" IIFE (lines 14214-14281) ===
// Superseded by v354 hooks at end of file
{
  const startIdx = lines.findIndex((l, i) => i >= 14210 && i <= 14220 && l.includes('v347 last-mile repair'));
  if (startIdx >= 0) {
    const endIdx = findIIFEEnd(lines, startIdx + 1);
    console.log(`\nRemoval 4: v347 last-mile repair IIFE (lines ${startIdx+1}-${endIdx+1})`);
    console.log(`  First line: ${lines[startIdx].substring(0, 80)}`);
    console.log(`  Last line:  ${lines[endIdx].substring(0, 80)}`);
    removals.push([startIdx, endIdx]);
  }
}

// === REMOVAL 5: v350 absolute tail runner (lines 14283-14295) ===
// Subsumed by v354 hooks
{
  const startIdx = lines.findIndex((l, i) => i >= 14280 && i <= 14290 && l.includes('v350 absolute tail runner'));
  if (startIdx >= 0) {
    // This is a setTimeout block, not an IIFE in the traditional sense
    // Find the closing ");", should be around line 14295
    let endIdx = startIdx;
    let depth = 0;
    for (let i = startIdx; i < Math.min(startIdx + 20, lines.length); i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      endIdx = i;
      if (depth <= 0 && i > startIdx + 1) break;
    }
    console.log(`\nRemoval 5: v350 absolute tail runner (lines ${startIdx+1}-${endIdx+1})`);
    console.log(`  First line: ${lines[startIdx].substring(0, 80)}`);
    console.log(`  Last line:  ${lines[endIdx].substring(0, 80)}`);
    removals.push([startIdx, endIdx]);
  }
}

// === REMOVAL 6: v350 "absolute final" IIFE (lines 14297-14337) ===
// Superseded by v351 absolute final at 14339-14519
{
  const startIdx = lines.findIndex((l, i) => i >= 14294 && i <= 14302 && l.includes('v350 absolute final'));
  if (startIdx >= 0) {
    const endIdx = findIIFEEnd(lines, startIdx + 1);
    console.log(`\nRemoval 6: v350 absolute final IIFE (lines ${startIdx+1}-${endIdx+1})`);
    console.log(`  First line: ${lines[startIdx].substring(0, 80)}`);
    console.log(`  Last line:  ${lines[endIdx].substring(0, 80)}`);
    removals.push([startIdx, endIdx]);
  }
}

// === REMOVAL 7: First v354 final hook duplicate (lines 241-263) ===
// This is an early copy of v354 final hook, superseded by the one at 14522-14544
{
  const startIdx = lines.findIndex((l, i) => i >= 240 && i <= 242 && l.includes('v354 final hook'));
  if (startIdx >= 0) {
    const endIdx = findIIFEEnd(lines, startIdx + 1);
    // Make sure it's the early one (around line 241), not the final one (14522)
    if (endIdx < 300) {
      console.log(`\nRemoval 7: Early v354 final hook IIFE (lines ${startIdx+1}-${endIdx+1})`);
      console.log(`  First line: ${lines[startIdx].substring(0, 80)}`);
      console.log(`  Last line:  ${lines[endIdx].substring(0, 80)}`);
      removals.push([startIdx, endIdx]);
    }
  }
}

// === REMOVAL 8: First v354 image showcase IIFE (lines 265-354) ===
// Superseded by v354 hard final image showcase at 14547-14580
{
  const startIdx = lines.findIndex((l, i) => i >= 264 && i <= 266 && l.includes('v354: real image results'));
  if (startIdx >= 0) {
    const endIdx = findIIFEEnd(lines, startIdx + 1);
    if (endIdx < 400) {
      console.log(`\nRemoval 8: Early v354 image showcase IIFE (lines ${startIdx+1}-${endIdx+1})`);
      console.log(`  First line: ${lines[startIdx].substring(0, 80)}`);
      console.log(`  Last line:  ${lines[endIdx].substring(0, 80)}`);
      removals.push([startIdx, endIdx]);
    }
  }
}

// Sort removals by start index descending (remove from bottom to top to preserve indices)
removals.sort((a, b) => b[0] - a[0]);

let result = [...lines];
let totalRemoved = 0;

for (const [start, end] of removals) {
  const count = end - start + 1;
  result.splice(start, count);
  totalRemoved += count;
  console.log(`  → Removed ${count} lines from ${start+1}-${end+1}`);
}

console.log(`\n--- Total lines removed: ${totalRemoved} ---`);

// === MOJIBAKE FIX ===
// Fix Turkish characters in the v354 hard final block that has ? instead of proper chars
console.log('\n=== Fixing Turkish mojibake ===');
let joined = result.join('\n');
const mojibakeMap = [
  ['Ã¶', 'ö'], ['Ã¼', 'ü'], ['Ã§', 'ç'], ['Ä±', 'ı'],
  ['Ã–', 'Ö'], ['Ãœ', 'Ü'], ['Ã‡', 'Ç'], ['Ä°', 'İ'],
  ['Äž', 'Ğ'], ['ÄŸ', 'ğ'], ['Åž', 'Ş'], ['ÅŸ', 'ş'],
];
let mojibakeFixCount = 0;
for (const [bad, good] of mojibakeMap) {
  const before = joined;
  joined = joined.split(bad).join(good);
  if (joined !== before) {
    const c = (before.length - joined.length) / (bad.length - good.length);
    mojibakeFixCount += c;
    console.log(`  Fixed ${c} instances of ${bad} → ${good}`);
  }
}

// Also fix ? placeholders in v354 data blocks (lines that have question marks where Turkish chars should be)
// These are in the v354 hard final showcase block 
// Pattern: 'Foto?raf' should be 'Fotoğraf', etc.
const v354Fixes = [
  // Common Turkish word patterns with ? replacing special chars
  [/Foto\?raf/g, 'Fotoğraf'],
  [/foto\?raf/g, 'fotoğraf'],
  [/d\?zenleme/g, 'düzenleme'],
  [/\?r\?n/g, 'Ürün'],
  [/g\?rseli/g, 'görseli'],
  [/g\?rsel/g, 'görsel'],
  [/G\?rsel/g, 'Görsel'],
  [/Afi\?/g, 'Afiş'],
  [/sad\?k/g, 'sadık'],
  [/kontrol\?/g, 'kontrolü'],
  [/g\?\?l\?/g, 'güçlü'],
  [/i\?lerinde/g, 'işlerinde'],
  [/g\?venli/g, 'güvenli'],
  [/st\?dyo/g, 'stüdyo'],
  [/\?\?\?\?\?nda/g, 'ışığında'],
  [/parf\?m/g, 'parfüm'],
  [/\?i\?esi/g, 'şişesi'],
  [/yumu\?ak/g, 'yumuşak'],
  [/yans\?ma/g, 'yansıma'],
  [/k\?sa/g, 'kısa'],
  [/ba\?l\?k/g, 'başlık'],
  [/alan\?/g, 'alanı'],
  [/\?r\?n/g, 'ürün'],
  [/H\?zl\?/g, 'Hızlı'],
  [/h\?zl\?/g, 'hızlı'],
  [/tutarl\?l\?\?\?/g, 'tutarlılığı'],
  [/anlay\?p/g, 'anlayıp'],
  [/\?retmekte/g, 'üretmekte'],
  [/d\?n\?\?t\?r/g, 'dönüştür'],
  [/ger\?ek\?i/g, 'gerçekçi'],
  [/\?\?\?k/g, 'ışık'],
  [/Ger\?ek\?i/g, 'Gerçekçi'],
  [/Yarat\?c\?/g, 'Yaratıcı'],
  [/sahnelerde/g, 'sahnelerde'],
  [/Do\?al/g, 'Doğal'],
  [/\?\?\?kl\?/g, 'ışıklı'],
  [/kapa\?\?/g, 'kapağı'],
  [/D\?\?\?k/g, 'Düşük'],
  [/ge\?meden/g, 'geçmeden'],
  [/\?nce/g, 'önce'],
  [/i\?in/g, 'için'],
  [/tasla\?\?/g, 'taslağı'],
  [/\?cretsiz/g, 'Ücretsiz'],
  [/\?retim/g, 'üretim'],
  [/kullan\?\?l\?d\?r/g, 'kullanışlıdır'],
  [/vitrini/g, 'vitrini'],
  [/y\?ksek/g, 'yüksek'],
  [/tan\?t\?m/g, 'tanıtım'],
  [/ama\?l\?/g, 'amaçlı'],
  [/\?\?\?\?yla/g, 'ışığıyla'],
  [/\?ret/g, 'üret'],
  [/\?rnek/g, 'Örnek'],
  [/Model Yetene\?i/g, 'Model Yeteneği'],
  [/Foto\?raf d\?zenleme/g, 'Fotoğraf düzenleme'],
  [/Yeni g\?rsel \?retimi/g, 'Yeni görsel üretimi'],
  [/\?rnek kullan\?m/g, 'Örnek kullanım'],
  [/prompt alana aktar\?ld\?/g, 'prompt alana aktarıldı'],
];
let v354FixCount = 0;
for (const [pattern, replacement] of v354Fixes) {
  const before = joined;
  joined = joined.replace(pattern, replacement);
  if (joined !== before) v354FixCount++;
}
console.log(`  Fixed ${v354FixCount} v354 Turkish ? patterns`);
console.log(`  Total mojibake fixes: ${mojibakeFixCount + v354FixCount}`);

// Write result
const finalLines = joined.split('\n');
fs.writeFileSync(FILE, joined, 'utf8');

console.log(`\nAfter: ${finalLines.length} lines, ${(joined.length/1024).toFixed(1)} KB`);
console.log(`Saved: ${totalRemoved} lines removed, ${((content.length - joined.length)/1024).toFixed(1)} KB saved`);
console.log('\nDone! Run "node -c app.js" to verify syntax.');
