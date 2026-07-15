const fs = require('fs');

// Read app.js
let code = fs.readFileSync('app.js', 'utf8');
const before = code.length;

// ---- Fix 1: Replace "OK" checkmark placeholders with SVG checkmark ----
const okSpanPattern = /<span class="ck">OK<\/span>/g;
const checkSvg = '<svg class="ck" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="currentColor" opacity=".18"/><path d="M5 8.2l2 2 4-4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const okCount = (code.match(okSpanPattern) || []).length;
code = code.replace(okSpanPattern, checkSvg);
console.log(`Fixed ${okCount} "OK" → checkmark SVG`);

// ---- Fix 2: Replace broken "Sat?n Al" with correct "Satın Al" ----
const satinBroken = /Sat\?n Al/g;
const satinCount = (code.match(satinBroken) || []).length;
code = code.replace(satinBroken, 'Sat\u0131n Al');
console.log(`Fixed ${satinCount} "Sat?n Al" → "Satın Al"`);

// ---- Fix 3: Fix UTF-8 double-encoded mojibake (Ã¶ → ö etc.) ----
// These are UTF-8 bytes interpreted as Latin-1
const mojibakeMap = [
  // Lowercase Turkish
  [/Ã¶/g, 'ö'],    // ö
  [/Ã¼/g, 'ü'],    // ü  
  [/Ã§/g, 'ç'],    // ç
  [/Ä±/g, 'ı'],    // ı (dotless i)
  [/ÅŸ/g, 'ş'],    // ş
  [/ÄŸ/g, 'ğ'],    // ğ
  
  // Uppercase Turkish
  [/Ãœ/g, 'Ü'],    // Ü
  [/Ã–/g, 'Ö'],    // Ö
  [/Ã‡/g, 'Ç'],    // Ç
  [/Ä°/g, 'İ'],    // İ (dotted I)
  [/Åž/g, 'Ş'],    // Ş
  [/Äž/g, 'Ğ'],    // Ğ
  
  // Common combinations
  [/Ä±nÄ±/g, 'ını'],
  [/Ä±n/g, 'ın'],
  [/Ã¢/g, 'â'],
  [/Ã®/g, 'î'],
  [/Ãª/g, 'ê'],
  [/Ã©/g, 'é'],
];

let totalMojibake = 0;
for (const [pattern, replacement] of mojibakeMap) {
  const matches = code.match(pattern) || [];
  if (matches.length > 0) {
    totalMojibake += matches.length;
    code = code.replace(pattern, replacement);
    console.log(`  ${pattern.source} → ${replacement}: ${matches.length} fixes`);
  }
}
console.log(`Fixed ${totalMojibake} total mojibake patterns`);

// ---- Fix 4: Fix remaining ? that should be Turkish chars in known words ----
const wordFixes = [
  [/\bPop\?ler\b/g, 'Popüler'],
  [/\bpop\?ler\b/g, 'popüler'],
  [/\b\?htiyac/g, 'İhtiyac'],
  [/\b\?cretsiz\b/g, 'Ücretsiz'],
  [/\b\?cret\b/g, 'Ücret'],
  [/\b\?zel\b/g, 'Özel'],
  [/\b\?ncelikli\b/g, 'Öncelikli'],
  [/\b\?retici\b/g, 'Üretici'],
  [/\b\?ye\b/g, 'Üye'],
  [/\b\?yelik\b/g, 'Üyelik'],
  [/g\?nl\?k/g, 'günlük'],
  [/G\?nl\?k/g, 'Günlük'],
  [/g\?rsel/g, 'görsel'],
  [/G\?rsel/g, 'Görsel'],
  [/d\?k\?man/g, 'döküman'],
  [/y\?kleniyor/g, 'yükleniyor'],
  [/Y\?kleniyor/g, 'Yükleniyor'],
  [/s\?n\?rs\?z/g, 'sınırsız'],
  [/S\?n\?rs\?z/g, 'Sınırsız'],
  [/ba\?lang\?\?/g, 'başlangıç'],
  [/Ba\?lang\?\?/g, 'Başlangıç'],
  [/ba\?ar\?l\?/g, 'başarılı'],
  [/Ba\?ar\?l\?/g, 'Başarılı'],
];

let wordFixCount = 0;
for (const [pattern, replacement] of wordFixes) {
  const matches = code.match(pattern) || [];
  if (matches.length > 0) {
    wordFixCount += matches.length;
    code = code.replace(pattern, replacement);
    console.log(`  Word: ${pattern.source} → ${replacement}: ${matches.length}`);
  }
}
console.log(`Fixed ${wordFixCount} word-level patterns`);

// Write back
fs.writeFileSync('app.js', code);
console.log(`\nDone. Size: ${(before/1024).toFixed(1)}KB → ${(code.length/1024).toFixed(1)}KB`);

// ---- Also fix index.html if it has similar issues ----
if (fs.existsSync('index.html')) {
  let html = fs.readFileSync('index.html', 'utf8');
  let htmlChanged = false;
  for (const [pattern, replacement] of mojibakeMap) {
    if (pattern.test(html)) {
      html = html.replace(pattern, replacement);
      htmlChanged = true;
    }
  }
  if (htmlChanged) {
    fs.writeFileSync('index.html', html);
    console.log('Also fixed mojibake in index.html');
  }
}
