#!/usr/bin/env node
/**
 * js_clean_pass4b.js — Remove old AI_TOOL_PACKS block (8580-8683)
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'app.js');
const content = fs.readFileSync(FILE, 'utf8');
const lines = content.split('\n');

console.log('=== app.js Cleanup Pass 4b ===');
console.log(`Before: ${lines.length} lines, ${(content.length/1024).toFixed(1)} KB`);

// Find start: const AI_TOOL_PACKS=[
const startIdx = lines.findIndex((l) => l.trim().startsWith('const AI_TOOL_PACKS=['));
if (startIdx < 0) {
  console.log('Could not find AI_TOOL_PACKS'); process.exit(1);
}

// Find end: look for the DOMContentLoaded handler with renderAIToolsHub
let endIdx = startIdx;
for (let i = startIdx; i < Math.min(startIdx + 120, lines.length); i++) {
  if (lines[i].includes('DOMContentLoaded')) {
    // Find the end of this statement (could be multi-line)
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      endIdx = j;
      if (lines[j].includes('));')) break;
    }
    break;
  }
}

// Verify: the end line should be before PRO_PROMPT_PACKS
const proIdx = lines.findIndex((l, i) => i > startIdx && l.includes('PROFESSIONAL FEATURE LAYER'));
if (proIdx > 0 && endIdx >= proIdx) {
  endIdx = proIdx - 1;
  while (endIdx > startIdx && lines[endIdx].trim() === '') endIdx--;
}

const count = endIdx - startIdx + 1;
console.log(`\nRemoving: lines ${startIdx+1}-${endIdx+1} (${count} lines)`);
console.log(`  First: ${lines[startIdx].substring(0, 80)}`);
console.log(`  Last:  ${lines[endIdx].substring(0, 80)}`);

// Verify we're not removing PRO stuff
for (let i = startIdx; i <= endIdx; i++) {
  if (lines[i].includes('PRO_PROMPT_PACKS') || lines[i].includes('PRO_AGENT_PACKS')) {
    console.log('ERROR: Would remove PRO data! Aborting.');
    process.exit(1);
  }
}

const result = [...lines];
result.splice(startIdx, count);

const joined = result.join('\n');
fs.writeFileSync(FILE, joined, 'utf8');

console.log(`\nAfter: ${result.length} lines, ${(joined.length/1024).toFixed(1)} KB`);
console.log(`Saved: ${((content.length - joined.length)/1024).toFixed(1)} KB`);
