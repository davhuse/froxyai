#!/usr/bin/env node
/**
 * js_clean_pass3.js — Third pass: remove clearly superseded old tool/render blocks
 * 
 * The old AI_TOOL_PACKS (lines 8594-8698) and v113 override (8700-8840)
 * define useAITool, copyAIToolPrompt, renderAIToolsHub which are ALL
 * overwritten by the v351 final block. The old versions run during init
 * but are immediately replaced.
 * 
 * Strategy: Remove the old tool definitions and the v113 render duplicates,
 * BUT keep AI_PROVIDER_RADAR since it may still be referenced elsewhere.
 * Also keep PRO_PROMPT_PACKS, PRO_AGENT_PACKS and the professional feature
 * layer since those have unique agent/prompt rendering code.
 * 
 * Also: clean up blank line clusters (more than 2 consecutive blank lines -> 1)
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'app.js');
const content = fs.readFileSync(FILE, 'utf8');
const lines = content.split('\n');

console.log('=== app.js Cleanup Pass 3 ===');
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

// === REMOVAL: Old AI_TOOL_PACKS + v110 tool functions + v110 renderAIToolsHub ===
// Lines 8594-8698: AI_TOOL_PACKS, AI_PROVIDER_RADAR, old useAITool, old renderAIToolsHub, old copyAIToolPrompt
// These are all replaced by v351 block. Keep AI_PROVIDER_RADAR though.
// Actually the old useAITool/copyAIToolPrompt/renderAIToolsHub are non-IIFE globals that just get overwritten
// Let's remove lines 8594-8698 (old AI_TOOL_PACKS through the DOMContentLoaded listener)
{
  // Find start: const AI_TOOL_PACKS=[
  const startIdx = lines.findIndex((l, i) => i >= 8590 && i <= 8600 && l.includes('const AI_TOOL_PACKS=['));
  if (startIdx >= 0) {
    // Also include the comment before it
    const commentIdx = startIdx > 0 && lines[startIdx - 1].includes('AI TOOLS HUB') ? startIdx - 1 : startIdx;
    // Find end: the DOMContentLoaded handler after window.openProviderRadar
    let endIdx = startIdx;
    for (let i = startIdx; i < Math.min(startIdx + 120, lines.length); i++) {
      if (lines[i].includes('DOMContentLoaded') && lines[i].includes('renderAIToolsHub')) {
        endIdx = i + 1; // include the closing });
        break;
      }
    }
    if (endIdx > startIdx) {
      console.log(`\nRemoval: Old AI_TOOL_PACKS + v110 tools (lines ${commentIdx+1}-${endIdx+1})`);
      removals.push([commentIdx, endIdx]);
    }
  }
}

// === REMOVAL: v113 AI_TOOL_PACKS_V113 + v113 functions + v113 renderAIToolsHub ===
// Lines 8700-8839: AI_TOOL_PACKS_V113, runAIToolPrompt, useAITool, copyAIToolPrompt, renderAIToolsHub
{
  const startIdx = lines.findIndex((l, i) => i >= 8695 && i <= 8705 && l.includes('v113: make AI tools'));
  if (startIdx >= 0) {
    // Find end: the window.copyAIToolPrompt or window.renderAIToolsHub lines
    let endIdx = startIdx;
    for (let i = startIdx; i < Math.min(startIdx + 150, lines.length); i++) {
      if (lines[i].match(/^window\.(renderAIToolsHub|useAITool|copyAIToolPrompt)=/) ||
          lines[i].trim() === '') {
        endIdx = i;
      }
      // Stop at the next section
      if (i > startIdx + 5 && lines[i].includes('===== PROFESSIONAL FEATURE LAYER')) {
        endIdx = i - 1;
        // Trim trailing blank lines
        while (endIdx > startIdx && lines[endIdx].trim() === '') endIdx--;
        break;
      }
    }
    if (endIdx > startIdx) {
      console.log(`\nRemoval: v113 tools override (lines ${startIdx+1}-${endIdx+1})`);
      removals.push([startIdx, endIdx]);
    }
  }
}

// Sort removals descending
removals.sort((a, b) => b[0] - a[0]);

let result = [...lines];
let totalRemoved = 0;

for (const [start, end] of removals) {
  const count = end - start + 1;
  result.splice(start, count);
  totalRemoved += count;
  console.log(`  → Removed ${count} lines`);
}

// === CLEANUP: Remove excessive blank lines (3+ consecutive -> 1) ===
let cleaned = [];
let blankCount = 0;
for (const line of result) {
  if (line.trim() === '') {
    blankCount++;
    if (blankCount <= 2) cleaned.push(line);
  } else {
    blankCount = 0;
    cleaned.push(line);
  }
}
const blanksRemoved = result.length - cleaned.length;
console.log(`\nBlank line cleanup: removed ${blanksRemoved} excessive blank lines`);

const joined = cleaned.join('\n');
fs.writeFileSync(FILE, joined, 'utf8');

console.log(`\n--- Total lines removed: ${totalRemoved + blanksRemoved} ---`);
console.log(`After: ${cleaned.length} lines, ${(joined.length/1024).toFixed(1)} KB`);
console.log(`Saved: ${((content.length - joined.length)/1024).toFixed(1)} KB`);
