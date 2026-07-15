const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SAMPLES = 120;

const PATTERNS = [
  ['openrouter', /\bsk-or-v1-[a-z0-9]{32,}\b/gi],
  ['groq', /\bgsk_[A-Za-z0-9]{32,}\b/g],
  ['brevo', /\bxkeysib-[A-Za-z0-9_-]{30,}(?:-[A-Za-z0-9_-]+)?\b/g],
  ['google-api', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ['google-ai-studio', /\bAQ\.Ab8RN6[A-Za-z0-9_-]{20,}\b/g],
  ['together', /\btgp_v1_[A-Za-z0-9_-]{20,}\b/g],
  ['huggingface', /\bhf_[A-Za-z0-9]{20,}\b/g],
  ['imagegpt', /\bimagegpt-[A-Za-z0-9_-]{12,}\b/g],
  ['workspace-live', /\bwsk_live_[A-Za-z0-9_-]{20,}\b/g],
  ['generic-sk-underscore', /\bsk_[A-Za-z0-9_-]{24,}\b/g],
  ['openai-or-compatible', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
  ['replicate', /\br8_[A-Za-z0-9]{24,}\b/g]
];

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'generated',
  'lh-chrome-profile',
  'tmp-lighthouse',
  'test-results'
]);

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mp3', '.mp4', '.wav',
  '.pdf', '.zip', '.7z', '.gz', '.tar', '.bin', '.sqlite', '.db', '.db-shm', '.db-wal'
]);

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function mask(value) {
  if (!value) return '';
  if (value.length <= 14) return value[0] + '***' + value[value.length - 1];
  return value.slice(0, 8) + '...' + value.slice(-6);
}

function findSecrets(text) {
  const hits = [];
  for (const [type, re] of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      hits.push({ type, value: m[0], index: m.index });
    }
  }
  return hits;
}

function addHit(results, scope, file, line, hit, commit = '') {
  const id = sha(hit.value);
  const key = scope + ':' + hit.type + ':' + id;
  if (!results.unique.has(key)) {
    results.unique.set(key, {
      scope,
      type: hit.type,
      id,
      masked: mask(hit.value),
      firstFile: file,
      firstLine: line,
      firstCommit: commit,
      count: 0
    });
  }
  results.unique.get(key).count++;
  results.total++;
  if (results.samples.length < MAX_SAMPLES) {
    results.samples.push({
      scope,
      type: hit.type,
      id,
      masked: mask(hit.value),
      file,
      line,
      commit: commit ? commit.slice(0, 10) : ''
    });
  }
}

function shouldSkipFile(file) {
  const parts = file.split(/[\\/]+/);
  if (parts.some(p => SKIP_DIRS.has(p))) return true;
  const ext = path.extname(file).toLowerCase();
  return SKIP_EXT.has(ext);
}

function readTextIfSmall(abs) {
  const stat = fs.statSync(abs);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
  const buf = fs.readFileSync(abs);
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}

function scanWorktreeFiles(label, files, results) {
  for (const file of files) {
    if (!file || shouldSkipFile(file)) continue;
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) continue;
    let text;
    try { text = readTextIfSmall(abs); } catch { continue; }
    if (!text) continue;
    const lineStarts = [0];
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
    for (const hit of findSecrets(text)) {
      let lo = 0, hi = lineStarts.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lineStarts[mid] <= hit.index) lo = mid + 1;
        else hi = mid - 1;
      }
      addHit(results, label, file, hi + 1, hit);
    }
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function scanHistory(results) {
  const fixedNeedles = [
    'sk-or-v1-', 'gsk_', 'xkeysib-', 'AIza', 'AQ.Ab8RN6', 'tgp_v1_',
    'hf_', 'imagegpt-', 'wsk_live_', 'sk_', 'sk-', 'r8_'
  ];
  const commits = git(['rev-list', '--all']).trim().split(/\s+/).filter(Boolean);
  const seenBlobHits = new Set();
  for (const commit of commits) {
    let out = '';
    try {
      out = git(['grep', '-I', '-n', '-F', ...fixedNeedles.flatMap(n => ['-e', n]), commit, '--', '.', ':(exclude)node_modules', ':(exclude)generated']);
    } catch (e) {
      out = e.stdout || '';
    }
    if (!out) continue;
    for (const row of out.split(/\r?\n/)) {
      if (!row.trim()) continue;
      const parts = row.split(':');
      if (parts.length < 4) continue;
      const rowCommit = parts.shift();
      const file = parts.shift();
      const line = Number(parts.shift()) || 0;
      const content = parts.join(':');
      for (const hit of findSecrets(content)) {
        const dedupe = rowCommit + ':' + file + ':' + line + ':' + hit.type + ':' + sha(hit.value);
        if (seenBlobHits.has(dedupe)) continue;
        seenBlobHits.add(dedupe);
        addHit(results, 'git-history', file, line, hit, rowCommit);
      }
    }
  }
}

function main() {
  const results = { total: 0, unique: new Map(), samples: [] };
  const tracked = git(['ls-files']).split(/\r?\n/).filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean);
  const publicFiles = tracked.filter(f => /^(app(\.min)?\.js|server\.js|index\.html|style(\.min)?\.css|model-picker-v294(\.min)?\.css|home-critical(\.min)?\.css|sw\.js|manifest\.json|robots\.txt|sitemap\.xml)$/.test(f));

  scanWorktreeFiles('public-current', publicFiles, results);
  scanWorktreeFiles('tracked-current', tracked, results);
  scanWorktreeFiles('untracked-local', untracked, results);
  scanHistory(results);

  const byScope = {};
  const byType = {};
  for (const item of results.unique.values()) {
    byScope[item.scope] = (byScope[item.scope] || 0) + 1;
    byType[item.type] = (byType[item.type] || 0) + 1;
  }

  console.log(JSON.stringify({
    totalMatches: results.total,
    uniqueFindings: results.unique.size,
    byScope,
    byType,
    samples: results.samples
  }, null, 2));
}

main();
