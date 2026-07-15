#!/usr/bin/env node
// Güvenli minify pipeline — emoji/UTF-8 bozmadan
// Kullanim: node build.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function log(...args) { console.log('[build]', ...args); }

// JS minify - SADECE yorum ve gereksiz boşluk silme
// esbuild minify emojileri bozduğu için kullanmıyoruz
function minifyJs(raw) {
  // 1. // tek satır yorumları sil (string içinde değilse)
  // basit yaklaşım: eğer satır boşluk + // ile başlıyorsa veya sadece // varsa
  let s = raw;
  // 2. /* ... */ yorumlarını sil (multiline)
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  // 3. Satır sonu yorumları (// ...) - basit ama güvenli versiyon
  s = s.replace(/^\s*\/\/[^\n]*$/gm, '');
  // 4. Birden fazla boş satırı tek boş satıra
  s = s.replace(/\n\s*\n+/g, '\n');
  // 5. Baş ve son boşlukları sil
  s = s.replace(/^[ \t]+/gm, '');
  return s;
}

function buildJs() {
  const src = path.join(ROOT, 'app.js');
  const out = path.join(ROOT, 'app.min.js');
  const raw = fs.readFileSync(src, 'utf8');
  const min = minifyJs(raw);
  fs.writeFileSync(out, min, 'utf8');
  const before = Buffer.byteLength(raw, 'utf8');
  const after = Buffer.byteLength(min, 'utf8');
  log('app.js -> app.min.js',
      (before / 1024).toFixed(1) + 'KB ->',
      (after / 1024).toFixed(1) + 'KB',
      '(' + Math.round((1 - after / before) * 100) + '% azalma)');
}

// CSS minifier
function minifyCss(raw) {
  let s = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/^\s+|\s+$/gm, '');
  s = s.replace(/\s*([{};,:>~])\s*/g, '$1');
  s = s.replace(/;}/g, '}');
  s = s.replace(/\n/g, '');
  return s;
}

function buildCss() {
  const src = path.join(ROOT, 'style.css');
  const out = path.join(ROOT, 'style.min.css');
  const raw = fs.readFileSync(src, 'utf8');
  const min = minifyCss(raw);
  fs.writeFileSync(out, min, 'utf8');
  const before = Buffer.byteLength(raw, 'utf8');
  const after = Buffer.byteLength(min, 'utf8');
  log('style.css -> style.min.css',
      (before / 1024).toFixed(1) + 'KB ->',
      (after / 1024).toFixed(1) + 'KB',
      '(' + Math.round((1 - after / before) * 100) + '% azalma)');
}

try {
  buildJs();
  buildCss();
  log('OK');
} catch (e) {
  console.error('[build] HATA:', e.message);
  process.exit(1);
}
