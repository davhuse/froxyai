#!/usr/bin/env node
/**
 * js_clean_pass2.js — Second pass cleanup
 * 
 * Removes more superseded blocks:
 * 1. v347 final IIFE (line 246) - superseded by v351 at line 13644
 * 2. v347 site UI repair IIFE (line 370) - superseded by v351/v354
 * 3. v323 final UI override IIFE (line 539) - superseded by v351
 * 4. v322 clean Turkish copy IIFE (line 771) - superseded by v351/v354
 * 5. v324 last-mile route polish (line 13262) - superseded by v354
 * 6. v341 conversion tools (line 13384) - superseded by v351 at 13644
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'app.js');
const content = fs.readFileSync(FILE, 'utf8');
const lines = content.split('\n');

console.log('=== app.js Cleanup Pass 2 ===');
console.log(`Before: ${lines.length} lines, ${(content.length/1024).toFixed(1)} KB`);

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

const removals = [];

// Helper to find a block by comment and remove it
function findAndRemove(label, searchText, searchStart, searchEnd) {
  const startIdx = lines.findIndex((l, i) => 
    i >= searchStart && i <= searchEnd && l.includes(searchText)
  );
  if (startIdx < 0) {
    console.log(`\n[SKIP] ${label}: pattern not found`);
    return;
  }
  // Find the IIFE start (might be next line)
  let iifeStart = startIdx;
  if (!/\(function/.test(lines[startIdx])) {
    // Check next line
    if (iifeStart + 1 < lines.length && /\(function/.test(lines[iifeStart + 1])) {
      iifeStart = startIdx; // keep comment line
    }
  }
  const endIdx = findIIFEEnd(lines, iifeStart + 1);
  const count = endIdx - startIdx + 1;
  console.log(`\n${label} (lines ${startIdx+1}-${endIdx+1}, ${count} lines)`);
  console.log(`  First: ${lines[startIdx].substring(0, 90)}`);
  console.log(`  Last:  ${lines[endIdx].substring(0, 60)}`);
  removals.push([startIdx, endIdx]);
}

// 1. v347 final IIFE at line 246
findAndRemove('Remove 1: v347 final', 'v347 final: keep the premium repair', 244, 248);

// 2. v347 site UI repair at line 370
findAndRemove('Remove 2: v347 site UI repair', 'v347: mevcut site UI onarimi', 368, 372);

// 3. v323 final UI override at line 539
findAndRemove('Remove 3: v323 final UI override', 'v323: final UI override', 537, 541);

// 4. v322 clean Turkish copy at line 771
findAndRemove('Remove 4: v322 clean Turkish copy', 'v322: clean Turkish copy', 769, 773);

// 5. v324 last-mile route polish at line ~13262 
findAndRemove('Remove 5: v324 route polish', 'v324: last-mile route polish', 13250, 13270);

// 6. v341 conversion tools at line ~13384
findAndRemove('Remove 6: v341 conversion tools', 'v341: conversion-focused growth tools', 13370, 13390);

// Sort removals descending
removals.sort((a, b) => b[0] - a[0]);

let result = [...lines];
let totalRemoved = 0;

for (const [start, end] of removals) {
  const count = end - start + 1;
  result.splice(start, count);
  totalRemoved += count;
  console.log(`  → Removed ${count} lines from ${start+1}-${end+1}`);
}

const joined = result.join('\n');
fs.writeFileSync(FILE, joined, 'utf8');

console.log(`\n--- Total lines removed: ${totalRemoved} ---`);
console.log(`After: ${result.length} lines, ${(joined.length/1024).toFixed(1)} KB`);
console.log(`Saved: ${((content.length - joined.length)/1024).toFixed(1)} KB`);
