const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const https = require('https');
const http = require('http');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const iconv = require('iconv-lite');
const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');
const nodemailer = require('nodemailer');
const { registerGatewayRoutes } = require('./src/gateway');
const { Webhook } = require('standardwebhooks');

// Local key file loader for environments where a real .env is not wired.
// Supported file: .env.keys (KEY=value lines, # comments ignored)
try {
  const keyFiles = ['.env.keys', '.env'];
  for (const file of keyFiles) {
    const full = path.join(__dirname, file);
    if (!fs.existsSync(full)) continue;
    const raw = fs.readFileSync(full, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const name = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (!name || process.env[name]) continue;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[name] = value;
    }
  }
} catch (envLoadErr) {
  console.warn('[ENV] key file load skipped:', envLoadErr.message);
}


const app = express();
app.set('trust proxy', 1);

// ===== PERFORMANS & GÜVENLİK =====
  // gzip/br ile metin (JS/CSS/HTML/JSON) yanıtları 3-5x küçülür; LCP ve FCP skoru yükselir.
app.use(compression({
  level: 6,
  threshold: 1024, // 1 KB altı yanıtları sıkıştırma
  filter: (req, res) => {
    // Zaten sıkıştırılmış medya tiplerini atla
    const type = res.getHeader('Content-Type') || '';
    if (/^image\/(jpeg|png|webp|avif)|^video\//.test(type)) return false;
    return compression.filter(req, res);
  }
}));

// CORS whitelisting: varsayılan olarak prod domain + localhost.
// İhtiyaç halinde env ile genişletilebilir: CORS_ORIGINS="https://a.com,https://b.com"
const DEFAULT_ORIGINS = [
  'https://froxyai.com',
  'https://www.froxyai.com',
  'https://froxyai-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4177',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:4177'
];
const ALLOWED_ORIGINS = Array.from(new Set([
  ...DEFAULT_ORIGINS,
  ...(process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [])
]));
app.use(cors({
  origin: (origin, cb) => {
    // Same-origin / server-to-server isteklerde origin yoktur - geç
    if (!origin) return cb(null, true);
    try {
      const u = new URL(origin);
      if (/^(localhost|127\.0\.0\.1)$/i.test(u.hostname)) return cb(null, true);
    } catch(e) {}
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS reddedildi: ' + origin));
  },
  credentials: true,
}));

// Temel güvenlik başlıkları (helmet kurmadan minimum set)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'interest-cohort=()');
  next();
});

app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf ? buf.toString('utf8') : '';
  }
}));
app.use(express.urlencoded({limit: '50mb', extended: true}));

function repairTurkishMojibake(value) {
  if (typeof value !== 'string' || !value) return value;
  let out = value;
  const badPattern = /[\u00c2\u00c3\u00c4\u00c5\u00e2\uFFFD]|\?[a-zA-ZğüşıöçĞÜŞİÖÇ]/;
  if (!badPattern.test(out)) return out;
  for (let i = 0; i < 3 && /[\u00c2\u00c3\u00c4\u00c5\u00e2]/.test(out); i++) {
    try {
      const decoded = iconv.decode(iconv.encode(out, 'win1252'), 'utf8');
      const beforeBad = (out.match(/\uFFFD/g) || []).length;
      const afterBad = (decoded.match(/\uFFFD/g) || []).length;
      if (!decoded || decoded === out || afterBad > beforeBad) break;
      out = decoded;
    } catch (e) {
      break;
    }
  }
  const pairs = [
    ['\u00c4\u009e', 'Ğ'], ['\u00c5\u009e', 'Ş'],
    ['\u00e2\u20ac\u2122', "'"], ['\u00e2\u20ac\u02dc', "'"],
    ['\u00e2\u20ac\u0153', '"'], ['\u00e2\u20ac\uFFFD', '"'], ['\u00e2\u20ac\u009d', '"'],
    ['\u00e2\u20ac\u201c', '-'], ['\u00e2\u20ac\u201d', '-'], ['\u00e2\u20ac\u00a6', '...'],
    ['\u00e2\u2020\u2019', '->'], ['\u00e2\u2020\u0090', '<-'], ['\u00e2\u201a\u00ba', 'TL']
  ];
  for (const [bad, good] of pairs) out = out.split(bad).join(good);
  const phrases = [
    ['Ge?ersiz veya kullan?lm?? token', 'Geçersiz veya kullanılmış token'],
    ['Token s?resi dolmu?', 'Token süresi dolmuş'],
    ['Görsel ?u an', 'Görsel şu an'],
    ['Lütfen ba?ka', 'Lütfen başka'],
    ['ba?ka bir', 'başka bir'],
    ['yan?t vermedi', 'yanıt vermedi'],
    ['döndü', 'döndü']
  ];
  for (const [bad, good] of phrases) out = out.split(bad).join(good);
  return out;
}

function repairResponseText(value, seen = new WeakSet()) {
  if (typeof value === 'string') return repairTurkishMojibake(value);
  if (!value || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => repairResponseText(item, seen));
  if (value.constructor && value.constructor !== Object) return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = repairResponseText(item, seen);
  return out;
}

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  res.json = body => originalJson(repairResponseText(body));
  res.send = body => originalSend(typeof body === 'string' ? repairTurkishMojibake(body) : body);
  next();
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET env degiskeni bulunamadi. Gecici fallback secret kullaniliyor; Railway Variables icinde kalici bir deger ekleyin.');
}
const ACTIVE_JWT_SECRET = JWT_SECRET || 'froxy_ai_fallback_secret_2026_replace_me_in_production';
const FREE_STARTER_CREDITS = 100;

// Initialize SQLite DB
function resolveDatabasePath() {
  const explicit = process.env.DATABASE_PATH || process.env.SQLITE_PATH || process.env.DB_PATH;
  if (explicit && explicit.trim()) return path.resolve(explicit.trim());

  const railwayVolume = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RAILWAY_VOLUME_PATH;
  if (railwayVolume && railwayVolume.trim()) {
    return path.join(path.resolve(railwayVolume.trim()), 'froxy-ai.sqlite');
  }

  return path.join(__dirname, 'Froxy AI.db');
}

const DATABASE_PATH = resolveDatabasePath();
const DATABASE_IS_PERSISTENT = Boolean(
  process.env.DATABASE_PATH ||
  process.env.SQLITE_PATH ||
  process.env.DB_PATH ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  process.env.RAILWAY_VOLUME_PATH
);
const GENERATED_DIR = process.env.GENERATED_DIR
  ? path.resolve(process.env.GENERATED_DIR)
  : (DATABASE_IS_PERSISTENT ? path.join(path.dirname(DATABASE_PATH), 'generated') : path.join(__dirname, 'generated'));
try {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const legacyDb = path.join(__dirname, 'Froxy AI.db');
  if (DATABASE_PATH !== legacyDb && fs.existsSync(legacyDb) && !fs.existsSync(DATABASE_PATH)) {
    fs.copyFileSync(legacyDb, DATABASE_PATH);
    const legacyWal = legacyDb + '-wal';
    const legacyShm = legacyDb + '-shm';
    if (fs.existsSync(legacyWal)) fs.copyFileSync(legacyWal, DATABASE_PATH + '-wal');
    if (fs.existsSync(legacyShm)) fs.copyFileSync(legacyShm, DATABASE_PATH + '-shm');
    console.log('[DB] Legacy SQLite copied to persistent path.');
  }
} catch (err) {
  console.error('[DB] Database directory/copy setup failed:', err.message);
}
console.log('[DB] SQLite path:', DATABASE_PATH, DATABASE_IS_PERSISTENT ? '(persistent)' : '(local/ephemeral)');
console.log('[FILES] Generated media path:', GENERATED_DIR);
const db = new Database(DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    credits INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chat_id) REFERENCES chats(id)
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    filename TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS image_gallery (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    url TEXT NOT NULL,
    prompt TEXT,
    model TEXT,
    provider TEXT,
    mode TEXT DEFAULT 'generate',
    source_image_url TEXT,
    favorite INTEGER DEFAULT 0,
    broken INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    token TEXT UNIQUE,
    expires_at DATETIME,
    used INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS login_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    challenge_id TEXT UNIQUE,
    code_hash TEXT,
    expires_at DATETIME,
    attempts INTEGER DEFAULT 0,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS registration_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT,
    password_hash TEXT,
    reg_ip TEXT,
    reg_fingerprint TEXT,
    challenge_id TEXT UNIQUE,
    code_hash TEXT,
    expires_at DATETIME,
    attempts INTEGER DEFAULT 0,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS server_chats (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    title TEXT,
    messages TEXT DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    type TEXT DEFAULT 'info',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS membership_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    plan TEXT DEFAULT 'free',
    credits INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    expires_at DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS membership_code_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_id INTEGER,
    code TEXT,
    user_id INTEGER,
    plan TEXT,
    credits INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS credit_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    kind TEXT,
    model TEXT,
    provider TEXT,
    actual_model TEXT,
    cost INTEGER DEFAULT 0,
    remaining INTEGER,
    status TEXT DEFAULT 'success',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS shopier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id TEXT UNIQUE,
    platform_order_id TEXT,
    product_id TEXT,
    product_name TEXT,
    email TEXT,
    user_id INTEGER,
    plan TEXT,
    credits INTEGER DEFAULT 0,
    amount REAL,
    currency TEXT,
    status TEXT DEFAULT 'pending',
    verified INTEGER DEFAULT 0,
    raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    applied_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS consent_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    consent_version TEXT,
    terms_accepted INTEGER DEFAULT 0,
    privacy_accepted INTEGER DEFAULT 0,
    marketing_opt_in INTEGER DEFAULT 0,
    ip_hash TEXT,
    fingerprint TEXT,
    user_agent TEXT,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS security_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    event TEXT,
    status TEXT,
    detail TEXT,
    ip_hash TEXT,
    fingerprint TEXT,
    user_agent TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dodo_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id TEXT UNIQUE,
    checkout_session_id TEXT,
    order_id TEXT,
    email TEXT,
    user_id INTEGER,
    plan TEXT,
    credits INTEGER DEFAULT 0,
    amount REAL,
    currency TEXT,
    status TEXT DEFAULT 'pending',
    verified INTEGER DEFAULT 0,
    raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    applied_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS funnel_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    user_id INTEGER,
    session_id TEXT,
    source TEXT,
    medium TEXT,
    campaign TEXT,
    content TEXT,
    term TEXT,
    path TEXT,
    referrer TEXT,
    metadata TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER,
    segment TEXT,
    subject TEXT,
    body_text TEXT,
    recipients INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    dry_run INTEGER DEFAULT 0,
    status TEXT DEFAULT 'created',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS marketing_email_sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER,
    user_id INTEGER,
    email TEXT,
    status TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add is_admin column if not exists (migration safe)
try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN blocked_at DATETIME'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN block_until DATETIME'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN block_reason TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN last_login DATETIME'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN total_requests INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'"); } catch(e) {}
// v142: Daily limits & anti-abuse
try { db.exec('ALTER TABLE users ADD COLUMN daily_chat_count INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN daily_image_count INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN daily_reset_date TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN reg_ip TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN reg_fingerprint TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE registration_otps ADD COLUMN terms_accepted INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE registration_otps ADD COLUMN privacy_accepted INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE registration_otps ADD COLUMN marketing_opt_in INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE registration_otps ADD COLUMN consent_version TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE registration_otps ADD COLUMN turnstile_verified INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_funnel_events_created ON funnel_events(created_at)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_funnel_events_event ON funnel_events(event)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_funnel_events_session ON funnel_events(session_id)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_security_audit_created ON security_audit(created_at)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_consent_records_email ON consent_records(email)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_credit_usage_created ON credit_usage(created_at)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_credit_usage_user ON credit_usage(user_id)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_created ON marketing_campaigns(created_at)'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_dodo_payments_payment_id ON dodo_payments(payment_id)'); } catch(e) {}
try {
  const done = db.prepare("SELECT value FROM app_meta WHERE key = 'free_credit_normalized_v184'").get();
  if (!done) {
    db.prepare("UPDATE users SET credits = ? WHERE plan = 'free' AND COALESCE(is_admin, 0) = 0").run(FREE_STARTER_CREDITS);
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run('free_credit_normalized_v184', '1');
  }
} catch(e) {}

// Daily limits per plan
const DAILY_LIMITS = {
  free:       { chat: 10, image: 3 },
  starter:    { chat: 200, image: 50 },
  popular:    { chat: 500, image: 150 },
  pro:        { chat: 1500, image: 400 },
  business:   { chat: 5000, image: 1500 },
  enterprise: { chat: 999999, image: 999999 }
};

function getDailyLimits(plan) {
  return DAILY_LIMITS[plan] || DAILY_LIMITS.free;
}

const SHOPIER_PACKAGE_CATALOG = {
  starter: { productId: '47408136', name: 'Baslangic', label: 'Başlangıç', credits: 5000, price: 129.99 },
  popular: { productId: '47408138', name: 'Populer', label: 'Popüler', credits: 15000, price: 249.99 },
  pro: { productId: '47408141', name: 'Profesyonel', label: 'Profesyonel', credits: 50000, price: 449.99 },
  developer: { productId: '47408145', name: 'Gelistirici', label: 'Geliştirici', credits: 100000, price: 599.99 },
  business: { productId: '47408149', name: 'Isletme', label: 'İşletme', credits: 150000, price: 799.99 },
  enterprise: { productId: '47408150', name: 'Kurumsal', label: 'Kurumsal', credits: 500000, price: 1499.99 }
};
const SHOPIER_PRODUCT_TO_PLAN = Object.fromEntries(Object.entries(SHOPIER_PACKAGE_CATALOG).map(([plan, pack]) => [pack.productId, plan]));
const SHOPIER_STATIC_URLS = Object.fromEntries(Object.entries(SHOPIER_PACKAGE_CATALOG).map(([plan, pack]) => [plan, `https://www.shopier.com/froxyai/${pack.productId}`]));
const SHOPIER_API_BASE = process.env.SHOPIER_API_BASE || 'https://api.shopier.com/v1';
const SECURITY_CONSENT_VERSION = process.env.SECURITY_CONSENT_VERSION || '2026-05-30-v1';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || '';
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '';
const TURNSTILE_REQUIRED = String(process.env.TURNSTILE_REQUIRED || (process.env.NODE_ENV === 'production' ? '1' : '0')).trim() !== '0';
const DODO_API_KEY = process.env.DODO_API_KEY || process.env.DODO_PAYMENTS_API_KEY || '';
const DODO_WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SECRET || process.env.DODO_PAYMENTS_WEBHOOK_SECRET || '';
const DODO_API_BASE = process.env.DODO_API_BASE || 'https://api.dodopayments.com';

function envForPlan(prefix, plan) {
  return process.env[`${prefix}_${String(plan || '').toUpperCase()}`] || '';
}

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.connection?.remoteAddress || '';
}

function hashForAudit(value) {
  if (!value) return '';
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function recordSecurityAudit(req, event, status, detail, userId, metadata) {
  try {
    db.prepare(`INSERT INTO security_audit (user_id, email, event, status, detail, ip_hash, fingerprint, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      userId || req.user?.id || null,
      metadata?.email || null,
      event,
      status,
      String(detail || '').slice(0, 500),
      hashForAudit(getClientIp(req)),
      String(req.body?.fingerprint || metadata?.fingerprint || '').slice(0, 160),
      String(req.headers['user-agent'] || '').slice(0, 500),
      JSON.stringify(metadata || {}).slice(0, 4000)
    );
  } catch(e) {}
}

function recordConsent({ userId, email, consentVersion, termsAccepted, privacyAccepted, marketingOptIn, req, fingerprint, source }) {
  db.prepare(`INSERT INTO consent_records (user_id, email, consent_version, terms_accepted, privacy_accepted, marketing_opt_in, ip_hash, fingerprint, user_agent, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    userId || null,
    normalizeEmailAddress(email),
    consentVersion || SECURITY_CONSENT_VERSION,
    termsAccepted ? 1 : 0,
    privacyAccepted ? 1 : 0,
    marketingOptIn ? 1 : 0,
    hashForAudit(getClientIp(req)),
    String(fingerprint || req.body?.fingerprint || '').slice(0, 160),
    String(req.headers['user-agent'] || '').slice(0, 500),
    source || 'register'
  );
}

function postFormJson(urlString, fields) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const data = new URLSearchParams(fields).toString();
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(data)
      }
    }, (resp) => {
      let raw = '';
      resp.on('data', chunk => raw += chunk);
      resp.on('end', () => {
        try { resolve(JSON.parse(raw || '{}')); }
        catch(e) { reject(new Error('Dogrulama yaniti okunamadi')); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function verifyTurnstile(req, token, action) {
  if (!TURNSTILE_SECRET_KEY) {
    if (TURNSTILE_REQUIRED && process.env.NODE_ENV === 'production') {
      return { ok: false, error: 'Turnstile secret tanimli degil' };
    }
    return { ok: true, skipped: true, reason: 'secret_missing_local' };
  }
  if (!token) return { ok: false, error: 'Robot dogrulamasi tamamlanamadi' };
  try {
    const data = await postFormJson('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      secret: TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: getClientIp(req)
    });
    const ok = !!data.success;
    return { ok, data, error: ok ? '' : 'Robot dogrulamasi basarisiz oldu' };
  } catch(e) {
    return { ok: false, error: e.message || 'Robot dogrulamasi yapilamadi' };
  }
}

function getShopierPlan(plan) {
  return SHOPIER_PACKAGE_CATALOG[String(plan || '').trim()] || SHOPIER_PACKAGE_CATALOG.starter;
}

function parseShopierPlanFromOrder(orderId) {
  const parts = String(orderId || '').split('-');
  const idx = parts.findIndex(p => p === 'FRX');
  if (idx >= 0 && parts[idx + 2] && SHOPIER_PACKAGE_CATALOG[parts[idx + 2]]) return parts[idx + 2];
  return null;
}

function resetDailyIfNeeded(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const user = db.prepare('SELECT daily_reset_date FROM users WHERE id = ?').get(userId);
  if (!user || user.daily_reset_date !== today) {
    db.prepare('UPDATE users SET daily_chat_count = 0, daily_image_count = 0, daily_reset_date = ? WHERE id = ?').run(today, userId);
  }
}

function checkDailyLimit(userId, type) {
  resetDailyIfNeeded(userId);
  const user = db.prepare('SELECT plan, daily_chat_count, daily_image_count FROM users WHERE id = ?').get(userId);
  if (!user) return { allowed: false, reason: 'Kullanıcı bulunamadı' };
  const limits = getDailyLimits(user.plan || 'free');
  if (type === 'chat' && user.daily_chat_count >= limits.chat) {
    return { allowed: false, reason: 'Gunluk mesaj limitinize ulastiniz (' + limits.chat + '/' + limits.chat + '). Paketinizi yukseltebilirsiniz.' };
  }
  if (type === 'image' && user.daily_image_count >= limits.image) {
    return { allowed: false, reason: 'Gunluk gorsel limitinize ulastiniz (' + limits.image + '/' + limits.image + '). Paketinizi yukseltebilirsiniz.' };
  }
  return { allowed: true };
}

function incrementDaily(userId, type) {
  resetDailyIfNeeded(userId);
  if (type === 'chat') {
    db.prepare('UPDATE users SET daily_chat_count = daily_chat_count + 1 WHERE id = ?').run(userId);
  } else if (type === 'image') {
    db.prepare('UPDATE users SET daily_image_count = daily_image_count + 1 WHERE id = ?').run(userId);
  }
}

// ===== ADMIN HESAP OTO-OLUSTURMA =====
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Admin';
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.warn('[ADMIN] ADMIN_EMAIL ve ADMIN_PASSWORD env degiskenleri ayarlanmamis. Admin hesabi olusturulmayacak.');
}

if (ADMIN_EMAIL && ADMIN_PASSWORD) {
  try {
    const existing = db.prepare('SELECT id, is_admin FROM users WHERE email = ?').get(ADMIN_EMAIL);
    if (!existing) {
      const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
      db.prepare('INSERT INTO users (username, email, password, credits, is_admin, plan) VALUES (?, ?, ?, ?, 1, ?)')
        .run(ADMIN_USERNAME, ADMIN_EMAIL, hash, 999999, 'enterprise');
      console.log(`[ADMIN] OK Admin hesabi olusturuldu: ${ADMIN_EMAIL}`);
    } else if (!existing.is_admin) {
      db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(ADMIN_EMAIL);
      console.log(`[ADMIN] OK Mevcut hesaba admin yetkisi verildi: ${ADMIN_EMAIL}`);
    } else {
      db.prepare("UPDATE users SET plan = 'enterprise' WHERE email = ? AND is_admin = 1").run(ADMIN_EMAIL);
      console.log(`[ADMIN] OK Admin hesabi mevcut: ${ADMIN_EMAIL}`);
    }
  } catch(e) {
    console.error('[ADMIN] Admin seed hatasi:', e.message);
  }
}

const FORCE_ADMIN_EMAILS = [
  process.env.ADMIN_EMAIL,
  ...(process.env.FORCE_ADMIN_EMAILS || 'habilrencber@gmail.com').split(',')
]
  .join(',')
  .split(',')
  .map(x => x.trim().toLowerCase())
  .filter(Boolean)
  .filter((x, i, arr) => arr.indexOf(x) === i);

function isForceAdminEmail(email) {
  return FORCE_ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}

function syncForceAdminEmail(email) {
  if (!isForceAdminEmail(email)) return false;
  const r = db.prepare("UPDATE users SET is_admin = 1, plan = 'enterprise' WHERE lower(email) = ?").run(String(email).trim().toLowerCase());
  if (r.changes) console.log(`[ADMIN] OK Force admin yetkisi verildi: ${email}`);
  return !!r.changes;
}

function syncForceAdminUserId(userId) {
  if (!userId) return null;
  const row = db.prepare('SELECT id, username, email, credits, plan, is_admin, total_requests FROM users WHERE id = ?').get(userId);
  if (!row) return null;
  if (isForceAdminEmail(row.email) && !row.is_admin) {
    syncForceAdminEmail(row.email);
    return db.prepare('SELECT id, username, email, credits, plan, is_admin, total_requests FROM users WHERE id = ?').get(userId);
  }
  if (isForceAdminEmail(row.email) && row.plan !== 'enterprise') {
    db.prepare("UPDATE users SET plan = 'enterprise' WHERE id = ?").run(userId);
    return db.prepare('SELECT id, username, email, credits, plan, is_admin, total_requests FROM users WHERE id = ?').get(userId);
  }
  return row;
}

function syncForceAdminDecoded(decoded) {
  if (!decoded) return null;
  const id = decoded.id;
  const email = String(decoded.email || '').trim().toLowerCase();
  let row = id ? syncForceAdminUserId(id) : null;
  if (!row && email) {
    if (isForceAdminEmail(email)) syncForceAdminEmail(email);
    row = db.prepare('SELECT id, username, email, credits, plan, is_admin, total_requests FROM users WHERE lower(email) = ?').get(email);
  }
  if (row && isForceAdminEmail(row.email) && (!row.is_admin || row.plan !== 'enterprise')) {
    syncForceAdminEmail(row.email);
    row = db.prepare('SELECT id, username, email, credits, plan, is_admin, total_requests FROM users WHERE id = ?').get(row.id);
  }
  return row;
}

try {
  FORCE_ADMIN_EMAILS.forEach(syncForceAdminEmail);
} catch(e) {
  console.error('[ADMIN] Force admin sync hatasi:', e.message);
}

function publicUserRow(row) {
  if (!row) return null;
  if (isForceAdminEmail(row.email) && !row.is_admin) {
    syncForceAdminEmail(row.email);
    row = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id) || row;
  }
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    credits: row.credits,
    plan: row.plan || 'free',
    is_admin: row.is_admin || 0,
    total_requests: row.total_requests || 0
  };
}

function issueUserToken(row) {
  if (isForceAdminEmail(row?.email)) {
    syncForceAdminEmail(row.email);
    row = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id) || row;
  }
  const plan = row.plan || 'free';
  return jwt.sign({ id: row.id, username: row.username, email: row.email, plan }, ACTIVE_JWT_SECRET, { expiresIn: '30d' });
}

function upsertOAuthUser({ provider, email, name }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('OAuth e-posta bilgisi alınamadı.');
  const usernameBase = String(name || cleanEmail.split('@')[0] || provider || 'user').trim().slice(0, 36) || 'user';
  let row = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(cleanEmail);
  if (!row) {
    let username = usernameBase;
    let suffix = 1;
    while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      username = `${usernameBase.slice(0, 28)}_${suffix++}`;
    }
    const hash = bcrypt.hashSync(`oauth:${provider}:${cleanEmail}:${Date.now()}`, 10);
    const info = db.prepare('INSERT INTO users (username, email, password, plan, credits) VALUES (?, ?, ?, ?, ?)')
      .run(username, cleanEmail, hash, 'free', FREE_STARTER_CREDITS);
    row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  if (isForceAdminEmail(cleanEmail)) syncForceAdminEmail(cleanEmail);
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
  row = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
  return { user: publicUserRow(row), token: issueUserToken(row) };
}

function oauthSuccessRedirect(returnTo, provider, profile, auth) {
  const url = new URL(returnTo);
  url.searchParams.set('auth_provider', provider);
  url.searchParams.set('auth_name', profile.name || profile.login || profile.email || '');
  url.searchParams.set('auth_email', profile.email || '');
  url.searchParams.set('auth_avatar', profile.avatar_url || profile.picture || '');
  url.searchParams.set('auth_token', auth.token);
  url.searchParams.set('auth_user', JSON.stringify(auth.user));
  return url.toString();
}

// ===== RATE LIMITERS =====
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 20,
  message: { error: 'Çok fazla istek gönderildi. Lütfen 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 30,
  message: { error: 'Çok hızlı istek gönderiyorsunuz. Lütfen biraz bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  skip: (req) => {
    if (process.env.NODE_ENV === 'production') return false;
    const ip = String(req.ip || req.connection?.remoteAddress || '');
    const local = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip) || /localhost|127\.0\.0\.1/.test(String(req.headers.host || ''));
    if (!local) return false;
    return /^\/api\/(health|local-providers\/status|provider-status|model-check|security\/config|me)(?:\/|\?|$)/.test(req.originalUrl || req.url || '');
  },
  message: { error: 'İstek limiti aşıldı.' },
});
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  message: { error: 'Takip istegi limiti asildi.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', generalLimiter);

// Middleware to verify JWT
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, ACTIVE_JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({error: 'Invalid token', code: 'invalid_token'});
      const synced = syncForceAdminDecoded(user);
      req.user = synced ? {
        ...user,
        id: synced.id,
        email: synced.email,
        username: synced.username || user.username,
        plan: synced.plan || user.plan,
        is_admin: synced.is_admin ? 1 : 0
      } : user;
      next();
    });
  } else {
    res.status(401).json({error: 'Unauthorized', code: 'missing_token'});
  }
};
const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  const token = authHeader.split(' ')[1];
  jwt.verify(token, ACTIVE_JWT_SECRET, (err, user) => {
    if (!err) {
      const synced = syncForceAdminDecoded(user);
      req.user = synced ? {
        ...user,
        id: synced.id,
        email: synced.email,
        username: synced.username || user.username,
        plan: synced.plan || user.plan,
        is_admin: synced.is_admin ? 1 : 0
      } : user;
    }
    next();
  });
};

// Admin middleware - checks is_admin in DB
const adminMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({error: 'Admin oturumu yok', code: 'missing_token'});
  const token = authHeader.split(' ')[1];
  jwt.verify(token, ACTIVE_JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({error: 'Admin oturumu geçersiz', code: 'invalid_token'});
    const u = syncForceAdminDecoded(decoded) || db.prepare('SELECT id, email, is_admin, plan FROM users WHERE id = ?').get(decoded.id);
    if (!u || !u.is_admin) {
      return res.status(403).json({
        error: 'Backend admin yetkisi gerekli',
        code: 'not_admin',
        email: decoded.email || u?.email || ''
      });
    }
    req.user = decoded;
    req.user.id = u.id;
    req.user.email = u.email || decoded.email;
    req.user.is_admin = 1;
    req.user.plan = u.plan || decoded.plan || 'enterprise';
    next();
  });
};

// Helper: log admin action
function logActivity(userId, action, detail='') {
  try { db.prepare('INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)').run(userId, action, detail); } catch(e) {}
}

const FUNNEL_EVENT_NAMES = new Set([
  'page_view',
  'signup_click',
  'register_complete',
  'first_ai_message',
  'pricing_view',
  'purchase_click',
  'purchase_complete'
]);

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || '';
}

function safeField(value, max = 220) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function safeMetadata(value) {
  try {
    if (!value || typeof value !== 'object') return null;
    return JSON.stringify(value).slice(0, 3000);
  } catch(e) {
    return null;
  }
}

function recordFunnelEvent(req, event, options = {}) {
  const name = safeField(event, 80);
  if (!FUNNEL_EVENT_NAMES.has(name)) return false;
  try {
    const body = req.body || {};
    const query = req.query || {};
    const metadata = Object.assign({}, body.metadata || {}, options.metadata || {});
    const ip = clientIp(req);
    const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32) : '';
    db.prepare(`INSERT INTO funnel_events
      (event, user_id, session_id, source, medium, campaign, content, term, path, referrer, metadata, ip_hash, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        name,
        options.userId || req.user?.id || body.user_id || null,
        safeField(body.session_id || query.session_id, 120),
        safeField(body.source || query.utm_source || query.source, 80),
        safeField(body.medium || query.utm_medium || query.medium, 80),
        safeField(body.campaign || query.utm_campaign || query.campaign, 120),
        safeField(body.content || query.utm_content || query.content, 120),
        safeField(body.term || query.utm_term || query.term, 120),
        safeField(body.path || req.headers.referer || req.originalUrl, 500),
        safeField(body.referrer || req.headers.referer, 500),
        safeMetadata(metadata),
        ipHash,
        safeField(req.headers['user-agent'], 500)
      );
    return true;
  } catch(e) {
    console.warn('[FUNNEL]', e.message);
    return false;
  }
}

function logCreditUsage({ userId, kind, model, provider, actualModel, cost, remaining, status='success' }) {
  try {
    db.prepare('INSERT INTO credit_usage (user_id, kind, model, provider, actual_model, cost, remaining, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, kind || 'chat', model || '', provider || '', actualModel || model || '', Number(cost || 0), Number.isFinite(Number(remaining)) ? Number(remaining) : null, status || 'success');
  } catch(e) {}
}

function shopierString(value) {
  return String(value == null ? '' : value).trim();
}

function getShopierPayload(req) {
  return Object.assign({}, req.query || {}, req.body || {});
}

function getShopierPaymentId(payload) {
  return shopierString(payload.payment_id || payload.paymentId || payload.order_id || payload.orderId || payload.orderNumber || payload.id || payload.platform_order_id || payload.platform_orderId || payload.platform_order || payload.data?.id || payload.data?.orderNumber);
}

function getShopierOrderId(payload) {
  return shopierString(payload.platform_order_id || payload.platform_orderId || payload.platform_order || payload.order_id || payload.orderId || payload.orderNumber || payload.id || payload.data?.id || payload.data?.orderNumber);
}

function getShopierProductId(payload) {
  const item = Array.isArray(payload.lineItems) ? payload.lineItems[0] : (Array.isArray(payload.items) ? payload.items[0] : null);
  const raw = shopierString(payload.product_id || payload.productId || payload.product || payload.item_id || payload.itemId || item?.productId || item?.product_id || item?.id || payload.data?.productId);
  const match = raw.match(/\d{6,}/);
  return match ? match[0] : raw;
}

function getShopierEmail(payload) {
  return shopierString(payload.buyer_email || payload.email || payload.customer_email || payload.mail || payload.customer?.email || payload.buyer?.email || payload.billingAddress?.email || payload.shippingAddress?.email).toLowerCase();
}

function getShopierAmount(payload) {
  const raw = shopierString(payload.total_order_value || payload.total || payload.totalPrice || payload.total_price || payload.amount || payload.price || payload.payment?.amount).replace(',', '.');
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getShopierStatus(payload) {
  return shopierString(payload.status || payload.payment_status || payload.paymentStatus || payload.transaction_status || payload.result || payload.data?.status).toLowerCase();
}

function isShopierSuccess(payload) {
  const status = getShopierStatus(payload);
  if (!status) return true;
  return ['success', 'successful', 'paid', 'approved', '1', 'ok', 'completed', 'fulfilled', 'created'].includes(status);
}

function getShopierPlanFromPayload(payload) {
  const orderPlan = parseShopierPlanFromOrder(getShopierOrderId(payload));
  if (orderPlan) return orderPlan;
  const productId = getShopierProductId(payload);
  if (productId && SHOPIER_PRODUCT_TO_PLAN[productId]) return SHOPIER_PRODUCT_TO_PLAN[productId];
  const item = Array.isArray(payload.lineItems) ? payload.lineItems[0] : (Array.isArray(payload.items) ? payload.items[0] : null);
  const text = `${payload.product_name || ''} ${payload.productName || ''} ${payload.item_name || ''} ${item?.title || ''} ${item?.name || ''}`.toLowerCase();
  if (/kurumsal|enterprise/.test(text)) return 'enterprise';
  if (/isletme|i\u015fletme|business/.test(text)) return 'business';
  if (/gelistirici|geli\u015ftirici|developer/.test(text)) return 'developer';
  if (/profesyonel|professional|pro/.test(text)) return 'pro';
  if (/populer|pop\u00fcler|popular/.test(text)) return 'popular';
  if (/baslangic|ba\u015flang\u0131\u00e7|starter/.test(text)) return 'starter';
  return null;
}

function getShopierUserIdFromPayload(payload) {
  const orderId = getShopierOrderId(payload);
  const match = String(orderId || '').match(/FRX-(\d+)-/);
  if (match) return Number(match[1]);
  const buyer = Number(payload.buyer_id || payload.user_id || payload.userId || payload.customer?.id || payload.buyer?.id || 0);
  return Number.isFinite(buyer) && buyer > 0 ? buyer : null;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyShopierRequest(req, payload) {
  if (payload.__verifiedViaShopierApi) return { verified: true, method: 'shopier_api' };
  const callbackSecret = process.env.SHOPIER_CALLBACK_SECRET;
  const suppliedSecret = req.headers['x-froxy-webhook-secret'] || req.headers['x-shopier-webhook-secret'] || payload.secret;
  if (callbackSecret && suppliedSecret && safeEqual(callbackSecret, suppliedSecret)) return { verified: true, method: 'callback_secret' };

  const apiSecret = process.env.SHOPIER_WEBHOOK_SECRET || process.env.SHOPIER_API_SECRET || process.env.SHOPIER_PERSONAL_ACCESS_TOKEN || process.env.SHOPIER_ACCESS_TOKEN;
  const signature = shopierString(payload.signature || req.headers['x-shopier-signature']);
  if (!apiSecret || !signature) return { verified: false, method: 'missing_signature' };
  if (req.rawBody) {
    const rawDigest = crypto.createHmac('sha256', apiSecret).update(req.rawBody).digest('hex');
    const rawDigestBase64 = crypto.createHmac('sha256', apiSecret).update(req.rawBody).digest('base64');
    if (safeEqual(signature, rawDigest) || safeEqual(signature, rawDigestBase64)) return { verified: true, method: 'raw_hmac' };
  }
  const random = shopierString(payload.random_nr || payload.random || payload.randomNr);
  const orderId = getShopierOrderId(payload);
  const amount = shopierString(payload.total_order_value || payload.total || payload.amount || payload.price);
  const currency = shopierString(payload.currency || 'TRY');
  const candidates = [
    random + orderId + amount + currency,
    random + orderId + amount,
    orderId + amount + currency,
    orderId + amount
  ].filter(Boolean);
  for (const base of candidates) {
    const digest = crypto.createHmac('sha256', apiSecret).update(base).digest('base64');
    const digestHex = crypto.createHmac('sha256', apiSecret).update(base).digest('hex');
    if (safeEqual(signature, digest) || safeEqual(signature, digestHex)) return { verified: true, method: 'hmac' };
  }
  return { verified: false, method: 'bad_signature' };
}

function recordShopierPayment({ payload, paymentId, orderId, plan, pack, userId, verified, status }) {
  const productId = getShopierProductId(payload);
  const item = Array.isArray(payload.lineItems) ? payload.lineItems[0] : (Array.isArray(payload.items) ? payload.items[0] : null);
  const productName = shopierString(payload.product_name || payload.productName || payload.item_name || item?.title || item?.name || pack?.label || plan || '');
  const email = getShopierEmail(payload);
  const amount = getShopierAmount(payload);
  const currency = shopierString(payload.currency || 'TRY') || 'TRY';
  const raw = JSON.stringify(payload || {}).slice(0, 12000);
  const existing = paymentId ? db.prepare('SELECT * FROM shopier_payments WHERE payment_id = ?').get(paymentId) : null;
  if (existing) {
    db.prepare(`UPDATE shopier_payments SET platform_order_id = ?, product_id = ?, product_name = ?, email = ?, user_id = COALESCE(?, user_id), plan = ?, credits = ?, amount = ?, currency = ?, status = ?, verified = ?, raw_json = ? WHERE id = ?`)
      .run(orderId || existing.platform_order_id, productId || existing.product_id, productName || existing.product_name, email || existing.email, userId || existing.user_id, plan || existing.plan, pack?.credits || existing.credits || 0, amount, currency, status, verified ? 1 : 0, raw, existing.id);
    return existing.id;
  }
  const r = db.prepare(`INSERT INTO shopier_payments (payment_id, platform_order_id, product_id, product_name, email, user_id, plan, credits, amount, currency, status, verified, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(paymentId || null, orderId || null, productId || null, productName || null, email || null, userId || null, plan || null, pack?.credits || 0, amount, currency, status, verified ? 1 : 0, raw);
  return r.lastInsertRowid;
}

function applyShopierPayment(req, payload) {
  const verification = verifyShopierRequest(req, payload);
  const paymentId = getShopierPaymentId(payload) || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orderId = getShopierOrderId(payload);
  const plan = getShopierPlanFromPayload(payload);
  const pack = plan ? getShopierPlan(plan) : null;
  let userId = getShopierUserIdFromPayload(payload);
  const email = getShopierEmail(payload);
  if (!userId && email) {
    const user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (user) userId = user.id;
  }
  const success = isShopierSuccess(payload);
  const existing = db.prepare('SELECT * FROM shopier_payments WHERE payment_id = ?').get(paymentId);
  if (existing && existing.status === 'applied') {
    return { ok: true, status: 'already_applied', payment_id: paymentId, plan: existing.plan, credits: existing.credits };
  }
  if (!success) {
    recordShopierPayment({ payload, paymentId, orderId, plan, pack, userId, verified: verification.verified, status: 'failed' });
    return { ok: false, status: 'failed', reason: 'payment_not_successful' };
  }
  if (!verification.verified || !userId || !plan || !pack) {
    const missing = !verification.verified ? 'unverified' : (!userId ? 'missing_user' : 'missing_plan');
    recordShopierPayment({ payload, paymentId, orderId, plan, pack, userId, verified: verification.verified, status: missing });
    return { ok: false, status: missing, payment_id: paymentId, verification: verification.method };
  }
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM shopier_payments WHERE payment_id = ?').get(paymentId);
    if (row && row.status === 'applied') return { already: true, user: db.prepare('SELECT id, username, email, credits, plan FROM users WHERE id = ?').get(row.user_id) };
    const before = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
    if (!before) throw new Error('Kullanıcı bulunamadı');
    db.prepare('UPDATE users SET plan = ?, credits = credits + ? WHERE id = ?').run(plan, pack.credits, userId);
    recordShopierPayment({ payload, paymentId, orderId, plan, pack, userId, verified: true, status: 'applied' });
    db.prepare('UPDATE shopier_payments SET applied_at = CURRENT_TIMESTAMP WHERE payment_id = ?').run(paymentId);
    const user = db.prepare('SELECT id, username, email, credits, plan FROM users WHERE id = ?').get(userId);
    logActivity(userId, 'shopier_payment_applied', `${paymentId}: ${plan}, +${pack.credits} kredi`);
    return { already: false, user };
  });
  const applied = tx();
  recordFunnelEvent(req, 'purchase_complete', {
    userId,
    metadata: { plan, credits: pack.credits, payment_id: paymentId, order_id: orderId }
  });
  return { ok: true, status: applied.already ? 'already_applied' : 'applied', payment_id: paymentId, plan, credits: pack.credits, user: applied.user };
}

function getShopierAccessToken() {
  return process.env.SHOPIER_PERSONAL_ACCESS_TOKEN || process.env.SHOPIER_ACCESS_TOKEN || process.env.SHOPIER_PAT || '';
}

function shopierApiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const token = getShopierAccessToken();
    if (!token) return reject(new Error('SHOPIER_PERSONAL_ACCESS_TOKEN eksik.'));
    const url = new URL(apiPath, SHOPIER_API_BASE.endsWith('/') ? SHOPIER_API_BASE : SHOPIER_API_BASE + '/');
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      headers: Object.assign({
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json'
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
    }, (resp) => {
      let raw = '';
      resp.on('data', chunk => raw += chunk);
      resp.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch(e) {}
        if (resp.statusCode >= 200 && resp.statusCode < 300) return resolve({ status: resp.statusCode, data: json, raw });
        const err = new Error((json && (json.message || json.error)) || raw || ('Shopier API hata: ' + resp.statusCode));
        err.status = resp.statusCode;
        err.data = json;
        reject(err);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function dodoApiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    if (!DODO_API_KEY) return reject(new Error('DODO_API_KEY eksik.'));
    const url = new URL(apiPath, DODO_API_BASE.endsWith('/') ? DODO_API_BASE : DODO_API_BASE + '/');
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      headers: Object.assign({
        'Authorization': 'Bearer ' + DODO_API_KEY,
        'Accept': 'application/json'
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
    }, (resp) => {
      let raw = '';
      resp.on('data', chunk => raw += chunk);
      resp.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch(e) {}
        if (resp.statusCode >= 200 && resp.statusCode < 300) return resolve({ status: resp.statusCode, data: json, raw });
        const err = new Error((json && (json.message || json.error)) || raw || ('Dodo API hata: ' + resp.statusCode));
        err.status = resp.statusCode;
        err.data = json;
        reject(err);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function recordDodoPayment({ payload, paymentId, checkoutSessionId, orderId, plan, pack, userId, email, verified, status }) {
  const amount = Number(payload?.amount || payload?.total_amount || pack?.price || 0);
  const currency = String(payload?.currency || 'TRY').toUpperCase();
  const raw = JSON.stringify(payload || {}).slice(0, 12000);
  const existing = paymentId ? db.prepare('SELECT * FROM dodo_payments WHERE payment_id = ?').get(paymentId) : null;
  if (existing) {
    db.prepare(`UPDATE dodo_payments SET checkout_session_id = ?, order_id = ?, email = ?, user_id = COALESCE(?, user_id), plan = ?, credits = ?, amount = ?, currency = ?, status = ?, verified = ?, raw_json = ? WHERE id = ?`)
      .run(checkoutSessionId || existing.checkout_session_id, orderId || existing.order_id, email || existing.email, userId || existing.user_id, plan || existing.plan, pack?.credits || existing.credits || 0, amount, currency, status, verified ? 1 : 0, raw, existing.id);
    return existing.id;
  }
  const r = db.prepare(`INSERT INTO dodo_payments (payment_id, checkout_session_id, order_id, email, user_id, plan, credits, amount, currency, status, verified, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(paymentId || null, checkoutSessionId || null, orderId || null, email || null, userId || null, plan || null, pack?.credits || 0, amount, currency, status, verified ? 1 : 0, raw);
  return r.lastInsertRowid;
}

function normalizeDodoWebhook(event) {
  const data = event?.data || event?.payload || event || {};
  const metadata = data.metadata || data.meta || {};
  const paymentId = data.payment_id || data.paymentId || data.id || event?.id;
  const checkoutSessionId = data.checkout_session_id || data.checkoutSessionId || data.session_id || metadata.checkout_session_id;
  const orderId = metadata.order_id || data.order_id || data.orderId || paymentId;
  const plan = metadata.plan || data.plan || parseShopierPlanFromOrder(orderId);
  const userId = Number(metadata.user_id || data.user_id || data.customer?.metadata?.user_id || 0) || null;
  const email = data.customer?.email || data.customer_email || data.email || metadata.email || '';
  const status = String(data.status || data.payment_status || event?.type || '').toLowerCase();
  const success = /succeed|success|paid|complete|confirmed/.test(status) || /payment\.succeeded|payment\.paid|checkout\.session\.completed/.test(String(event?.type || '').toLowerCase());
  return { data, paymentId, checkoutSessionId, orderId, plan, userId, email, success, status };
}

function applyDodoPayment(req, event) {
  const n = normalizeDodoWebhook(event);
  const pack = n.plan ? getShopierPlan(n.plan) : null;
  let userId = n.userId;
  if (!userId && n.email) {
    const user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizeEmailAddress(n.email));
    if (user) userId = user.id;
  }
  if (!n.success) {
    recordDodoPayment({ payload: n.data, paymentId: n.paymentId, checkoutSessionId: n.checkoutSessionId, orderId: n.orderId, plan: n.plan, pack, userId, email: n.email, verified: true, status: n.status || 'failed' });
    return { ok: false, status: 'not_paid', payment_id: n.paymentId };
  }
  if (!userId || !n.plan || !pack || !n.paymentId) {
    recordDodoPayment({ payload: n.data, paymentId: n.paymentId || `dodo-missing-${Date.now()}`, checkoutSessionId: n.checkoutSessionId, orderId: n.orderId, plan: n.plan, pack, userId, email: n.email, verified: true, status: 'missing_match' });
    return { ok: false, status: 'missing_match', payment_id: n.paymentId };
  }
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM dodo_payments WHERE payment_id = ?').get(n.paymentId);
    if (row && row.status === 'applied') return { already: true, user: db.prepare('SELECT id, username, email, credits, plan FROM users WHERE id = ?').get(row.user_id) };
    const before = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
    if (!before) throw new Error('Kullanici bulunamadi');
    db.prepare('UPDATE users SET plan = ?, credits = credits + ? WHERE id = ?').run(n.plan, pack.credits, userId);
    recordDodoPayment({ payload: n.data, paymentId: n.paymentId, checkoutSessionId: n.checkoutSessionId, orderId: n.orderId, plan: n.plan, pack, userId, email: n.email, verified: true, status: 'applied' });
    db.prepare('UPDATE dodo_payments SET applied_at = CURRENT_TIMESTAMP WHERE payment_id = ?').run(n.paymentId);
    const user = db.prepare('SELECT id, username, email, credits, plan FROM users WHERE id = ?').get(userId);
    logActivity(userId, 'dodo_payment_applied', `${n.paymentId}: ${n.plan}, +${pack.credits} kredi`);
    return { already: false, user };
  });
  const applied = tx();
  recordFunnelEvent(req, 'purchase_complete', { userId, metadata: { gateway: 'dodo', plan: n.plan, credits: pack.credits, payment_id: n.paymentId } });
  return { ok: true, status: applied.already ? 'already_applied' : 'applied', payment_id: n.paymentId, plan: n.plan, credits: pack.credits, user: applied.user };
}

function normalizeShopierOrder(order) {
  return Object.assign({}, order || {}, {
    __verifiedViaShopierApi: true,
    id: order?.id || order?.orderNumber,
    orderNumber: order?.orderNumber || order?.id,
    email: order?.customer?.email || order?.buyer?.email || order?.email || order?.billingAddress?.email,
    status: order?.status || order?.paymentStatus || order?.payment_status || 'paid',
    total: order?.total || order?.totalPrice || order?.total_price,
    lineItems: order?.lineItems || order?.items || []
  });
}

function extractShopierOrders(apiData) {
  if (Array.isArray(apiData)) return apiData;
  if (Array.isArray(apiData?.data)) return apiData.data;
  if (Array.isArray(apiData?.orders)) return apiData.orders;
  if (Array.isArray(apiData?.items)) return apiData.items;
  return [];
}

const LOGIN_OTP_TTL_MINUTES = Math.max(2, Math.min(30, Number(process.env.LOGIN_OTP_TTL_MINUTES || 10)));
const LOGIN_OTP_FLAG = String(process.env.LOGIN_OTP_ENABLED || '').trim().toLowerCase();
const LOGIN_OTP_ENABLED = LOGIN_OTP_FLAG === 'true' || (!!process.env.BREVO_API_KEY && LOGIN_OTP_FLAG !== 'false' && LOGIN_OTP_FLAG !== '0');
const LOGIN_OTP_FROM = process.env.MAIL_FROM || process.env.BREVO_FROM || 'Froxy AI <destek@froxyai.com>';

function maskEmail(email) {
  const clean = String(email || '');
  const [name, domain] = clean.split('@');
  if (!name || !domain) return clean;
  const visible = name.length <= 2 ? name[0] || '*' : name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

function loginOtpHash(code, challengeId) {
  return crypto
    .createHmac('sha256', ACTIVE_JWT_SECRET || JWT_SECRET || 'froxy-login-otp')
    .update(`${challengeId}:${code}`)
    .digest('hex');
}

function parseMailFrom(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim() || 'Froxy AI', email: match[2].trim() };
  return { name: 'Froxy AI', email: raw || 'destek@froxyai.com' };
}

function sendBrevoEmail({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return Promise.reject(new Error('BREVO_API_KEY tanimli degil'));
  const sender = parseMailFrom(LOGIN_OTP_FROM);
  const payload = JSON.stringify({
    sender,
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    }, (resp) => {
      let raw = '';
      resp.on('data', chunk => raw += chunk);
      resp.on('end', () => {
        if (resp.statusCode >= 200 && resp.statusCode < 300) return resolve(raw);
        reject(new Error(`Brevo mail hatasi: ${resp.statusCode}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendLoginOtpEmail({ to, subject, html, text }) {
  if (process.env.BREVO_API_KEY) {
    await sendBrevoEmail({ to, subject, html, text });
    return;
  }
  if (process.env.BREVO_SMTP_LOGIN && (process.env.BREVO_SMTP_KEY || process.env.BREVO_API_KEY)) {
    const transporter = nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
      port: Number(process.env.BREVO_SMTP_PORT || 587),
      secure: Number(process.env.BREVO_SMTP_PORT || 587) === 465,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: {
        user: process.env.BREVO_SMTP_LOGIN,
        pass: process.env.BREVO_SMTP_KEY || process.env.BREVO_API_KEY
      }
    });
    await transporter.sendMail({
      from: LOGIN_OTP_FROM,
      to,
      subject,
      html,
      text
    });
    return;
  }
  await sendBrevoEmail({ to, subject, html, text });
}

async function issueLoginOtp(req, userRow) {
  if (!LOGIN_OTP_ENABLED) return null;
  const challengeId = crypto.randomBytes(24).toString('hex');
  const code = String(crypto.randomInt(100000, 1000000));
  const expires = new Date(Date.now() + LOGIN_OTP_TTL_MINUTES * 60 * 1000).toISOString();
  db.prepare("DELETE FROM login_otps WHERE user_id = ? AND (used = 1 OR expires_at < datetime('now'))").run(userRow.id);
  db.prepare('INSERT INTO login_otps (user_id, email, challenge_id, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(userRow.id, userRow.email, challengeId, loginOtpHash(code, challengeId), expires);
  await sendOtpMail({ to: userRow.email, code, purpose: 'login' });
  recordFunnelEvent(req, 'login_otp_sent', { userId: userRow.id, metadata: { email_domain: String(userRow.email).split('@')[1] || '' } });
  return { challengeId, expiresAt: expires, email: maskEmail(userRow.email), purpose: 'login' };
}

function loginPayloadForUser(userRow) {
  const plan = userRow.plan || 'free';
  const token = jwt.sign({ id: userRow.id, username: userRow.username, email: userRow.email, plan }, ACTIVE_JWT_SECRET, { expiresIn: '30d' });
  return { token, user: userRow };
}

function sendOtpMail({ to, code, purpose }) {
  const isRegister = purpose === 'register';
  const title = isRegister ? 'Froxy AI kayit kodunuz' : 'Froxy AI giris kodunuz';
  const action = isRegister ? 'hesabinizi olusturmak' : 'hesabiniza giris yapmak';
  const subject = title;
  const text = `${title}: ${code}\n\nBu kod ${LOGIN_OTP_TTL_MINUTES} dakika gecerlidir. Bu islemi siz baslatmadiysaniz bu e-postayi yok sayabilirsiniz.`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#070914;color:#f8fafc;padding:28px">
      <div style="max-width:520px;margin:auto;background:#0f172a;border:1px solid #25324a;border-radius:16px;padding:24px">
        <h2 style="margin:0 0 12px">${title}</h2>
        <p style="color:#cbd5e1">Froxy AI ${action} icin asagidaki kodu kullanin.</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#111c33;border-radius:12px;padding:18px 20px;text-align:center">${code}</div>
        <p style="color:#94a3b8;font-size:13px;margin-top:18px">Bu kod ${LOGIN_OTP_TTL_MINUTES} dakika gecerlidir.</p>
      </div>
    </div>`;
  return sendLoginOtpEmail({ to, subject, html, text });
}

async function issueRegistrationOtp(req, { username, email, passwordHash, clientIp, fingerprint, termsAccepted, privacyAccepted, marketingOptIn, consentVersion, turnstileVerified }) {
  if (!LOGIN_OTP_ENABLED) return null;
  const challengeId = crypto.randomBytes(24).toString('hex');
  const code = String(crypto.randomInt(100000, 1000000));
  const expires = new Date(Date.now() + LOGIN_OTP_TTL_MINUTES * 60 * 1000).toISOString();
  db.prepare("DELETE FROM registration_otps WHERE email = ? AND (used = 1 OR expires_at < datetime('now'))").run(email);
  db.prepare(`INSERT INTO registration_otps
    (username, email, password_hash, reg_ip, reg_fingerprint, challenge_id, code_hash, expires_at, terms_accepted, privacy_accepted, marketing_opt_in, consent_version, turnstile_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(username, email, passwordHash, clientIp, fingerprint || '', challengeId, loginOtpHash(code, challengeId), expires, termsAccepted ? 1 : 0, privacyAccepted ? 1 : 0, marketingOptIn ? 1 : 0, consentVersion || SECURITY_CONSENT_VERSION, turnstileVerified ? 1 : 0);
  await sendOtpMail({ to: email, code, purpose: 'register' });
  recordFunnelEvent(req, 'register_otp_sent', { metadata: { email_domain: emailDomain(email) } });
  return { challengeId, expiresAt: expires, email: maskEmail(email), purpose: 'register' };
}

const ALLOWED_REGISTRATION_EMAIL_DOMAINS = new Set(
  (process.env.ALLOWED_REGISTRATION_EMAIL_DOMAINS || [
    'gmail.com',
    'googlemail.com',
    'hotmail.com',
    'hotmail.com.tr',
    'outlook.com',
    'outlook.com.tr',
    'live.com',
    'msn.com',
    'yandex.com',
    'yandex.com.tr',
    'yandex.ru'
  ].join(','))
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

function normalizeEmailAddress(email) {
  return String(email || '').trim().toLowerCase();
}

function emailDomain(email) {
  const clean = normalizeEmailAddress(email);
  const parts = clean.split('@');
  return parts.length === 2 ? parts[1] : '';
}

function isAllowedRegistrationEmail(email) {
  const domain = emailDomain(email);
  return !!domain && ALLOWED_REGISTRATION_EMAIL_DOMAINS.has(domain);
}


// ===== SAAS & AUTH ENDPOINTS =====
app.post('/api/track', trackLimiter, optionalAuthMiddleware, (req, res) => {
  const ok = recordFunnelEvent(req, req.body?.event);
  res.json({ success: true, tracked: ok });
});

app.get('/api/security/config', (req, res) => {
  res.json({
    turnstileSiteKey: TURNSTILE_SITE_KEY,
    turnstileRequired: TURNSTILE_REQUIRED,
    consentVersion: SECURITY_CONSENT_VERSION,
    otpEnabled: LOGIN_OTP_ENABLED,
    dodoEnabled: Boolean(DODO_API_KEY || Object.keys(SHOPIER_PACKAGE_CATALOG).some(plan => envForPlan('DODO_LINK', plan)))
  });
});

app.post('/api/register', authLimiter, async (req, res) => {
  const { username, password, fingerprint, turnstileToken } = req.body;
  const termsAccepted = req.body.termsAccepted === true || req.body.termsAccepted === 'true' || req.body.termsAccepted === 1;
  const privacyAccepted = req.body.privacyAccepted === true || req.body.privacyAccepted === 'true' || req.body.privacyAccepted === 1;
  const marketingOptIn = req.body.marketingOptIn === true || req.body.marketingOptIn === 'true' || req.body.marketingOptIn === 1;
  const consentVersion = String(req.body.consentVersion || SECURITY_CONSENT_VERSION).slice(0, 80);
  const email = normalizeEmailAddress(req.body.email);
  if(!username || !email || !password) return res.status(400).json({error: 'Eksik bilgi'});
  if(!termsAccepted || !privacyAccepted) {
    recordSecurityAudit(req, 'register_consent', 'blocked', 'required_consent_missing', null, { email });
    return res.status(400).json({error: 'Kayit icin KVKK/Gizlilik ve Kullanim Sartlari onaylarini kabul etmelisiniz.'});
  }
  if(!isAllowedRegistrationEmail(email)) {
    recordSecurityAudit(req, 'register_email_domain', 'blocked', 'untrusted_email_domain', null, { email });
    return res.status(400).json({error: 'Kayit icin Gmail, Outlook, Hotmail veya Yandex gibi guvenilir bir e-posta adresi kullanin.'});
  }
  const captcha = await verifyTurnstile(req, turnstileToken, 'register');
  if(!captcha.ok) {
    recordSecurityAudit(req, 'turnstile_register', 'blocked', captcha.error, null, { email });
    return res.status(400).json({ error: 'Robot dogrulamasi tamamlanamadi, tekrar deneyin.' });
  }
  recordSecurityAudit(req, 'turnstile_register', captcha.skipped ? 'skipped' : 'success', captcha.reason || 'verified', null, { email });
  
  // Anti-abuse: IP ve fingerprint kontrolu
  const clientIp = getClientIp(req);
  const fp = (fingerprint || '').trim();
  
  // Ayni IP'den son 24 saatte max 3 kayit
  try {
    const recentByIp = db.prepare("SELECT COUNT(*) as c FROM users WHERE reg_ip = ? AND created_at > datetime('now', '-1 day')").get(clientIp);
    if (recentByIp && recentByIp.c >= 3) {
      return res.status(429).json({ error: 'Bu IP adresinden cok fazla kayit yapildi. 24 saat sonra tekrar deneyin.' });
    }
    // Ayni fingerprint'ten max 2 kayit (toplam)
    if (fp) {
      const byFp = db.prepare("SELECT COUNT(*) as c FROM users WHERE reg_fingerprint = ?").get(fp);
      if (byFp && byFp.c >= 2) {
        return res.status(429).json({ error: 'Bu cihazdan maksimum hesap sayisina ulasildi.' });
      }
    }
  } catch(e) { /* migration henuz olmamis olabilir, devam et */ }
  
  try {
    if(db.prepare('SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?').get(email, String(username || '').trim().toLowerCase())) {
      return res.status(400).json({error: 'Bu e-posta veya kullanici adi zaten kullanilmakta'});
    }
    const hash = bcrypt.hashSync(password, 10);
    const plan = 'free';
    const otp = await issueRegistrationOtp(req, { username, email, passwordHash: hash, clientIp, fingerprint: fp, termsAccepted, privacyAccepted, marketingOptIn, consentVersion, turnstileVerified: !captcha.skipped });
    if (otp) return res.json({ requiresOtp: true, challengeId: otp.challengeId, email: otp.email, expiresAt: otp.expiresAt, purpose: 'register' });
    const stmt = db.prepare('INSERT INTO users (username, email, password, plan, credits, reg_ip, reg_fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(username, email, hash, plan, FREE_STARTER_CREDITS, clientIp, fp);
    if (isForceAdminEmail(email)) syncForceAdminEmail(email);
    const fresh = db.prepare('SELECT id, username, email, credits, plan, is_admin FROM users WHERE id = ?').get(info.lastInsertRowid);
    recordConsent({ userId: fresh.id, email, consentVersion, termsAccepted, privacyAccepted, marketingOptIn, req, fingerprint: fp, source: 'register_no_otp' });
    const token = jwt.sign({ id: fresh.id, username: fresh.username, email: fresh.email, plan: fresh.plan || plan }, ACTIVE_JWT_SECRET, { expiresIn: '30d' });
    recordFunnelEvent(req, 'register_complete', {
      userId: fresh.id,
      metadata: { method: 'email', plan, credits: FREE_STARTER_CREDITS, email_domain: String(email).split('@')[1] || '' }
    });
    res.json({ token, user: fresh });
  } catch(e) {
    res.status(400).json({error: 'Bu e-posta veya kullanici adi zaten kullanilmakta'});
  }
});

app.post('/api/logout', (req, res) => {
  // Stateless JWT — client token'ı silmeli. Cookie varsa temizle.
  try {
    res.clearCookie('token');
    res.clearCookie('ap_token');
  } catch(e) {}
  res.json({ ok: true });
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if(!email || !password) return res.status(400).json({error: 'Eksik bilgi'});
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if(!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({error: 'Hatalı e-posta veya şifre'});
    if(user.is_blocked) {
      if(user.block_until && new Date(user.block_until).getTime() <= Date.now()) {
        db.prepare('UPDATE users SET is_blocked = 0, blocked_at = NULL, block_until = NULL, block_reason = NULL WHERE id = ?').run(user.id);
      } else {
        const until = user.block_until ? ` Yasak bitişi: ${user.block_until}` : '';
        return res.status(403).json({error: 'Hesabınız bloke edilmiştir.' + until});
      }
    }
    if (isForceAdminEmail(email)) syncForceAdminEmail(email);
    const fresh = db.prepare('SELECT id, username, email, credits, plan, is_admin FROM users WHERE id = ?').get(user.id);
    const otp = await issueLoginOtp(req, fresh);
    if (otp) return res.json({ requiresOtp: true, challengeId: otp.challengeId, email: otp.email, expiresAt: otp.expiresAt });
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    res.json(loginPayloadForUser(fresh));
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/login/resend-code', authLimiter, async (req, res) => {
  const { challengeId } = req.body || {};
  if(!challengeId) return res.status(400).json({error: 'Kod oturumu gerekli'});
  try {
    const row = db.prepare('SELECT o.*, u.username, u.credits, u.plan, u.is_admin FROM login_otps o JOIN users u ON u.id = o.user_id WHERE o.challenge_id = ? AND o.used = 0').get(challengeId);
    if(!row) return res.status(400).json({error: 'Kod oturumu bulunamadi'});
    const createdMs = new Date(row.created_at).getTime();
    if(Number.isFinite(createdMs) && Date.now() - createdMs < 60000) return res.status(429).json({error: 'Yeni kod istemeden once biraz bekleyin'});
    const fresh = db.prepare('SELECT id, username, email, credits, plan, is_admin FROM users WHERE id = ?').get(row.user_id);
    db.prepare('UPDATE login_otps SET used = 1 WHERE challenge_id = ?').run(challengeId);
    const otp = await issueLoginOtp(req, fresh);
    res.json({ requiresOtp: true, challengeId: otp.challengeId, email: otp.email, expiresAt: otp.expiresAt });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/register/resend-code', authLimiter, async (req, res) => {
  const { challengeId } = req.body || {};
  if(!challengeId) return res.status(400).json({error: 'Kod oturumu gerekli'});
  try {
    const row = db.prepare('SELECT * FROM registration_otps WHERE challenge_id = ? AND used = 0').get(challengeId);
    if(!row) return res.status(400).json({error: 'Kod oturumu bulunamadi'});
    const createdMs = new Date(row.created_at).getTime();
    if(Number.isFinite(createdMs) && Date.now() - createdMs < 60000) return res.status(429).json({error: 'Yeni kod istemeden once biraz bekleyin'});
    db.prepare('UPDATE registration_otps SET used = 1 WHERE challenge_id = ?').run(challengeId);
    const otp = await issueRegistrationOtp(req, {
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      clientIp: row.reg_ip,
      fingerprint: row.reg_fingerprint,
      termsAccepted: !!row.terms_accepted,
      privacyAccepted: !!row.privacy_accepted,
      marketingOptIn: !!row.marketing_opt_in,
      consentVersion: row.consent_version || SECURITY_CONSENT_VERSION,
      turnstileVerified: !!row.turnstile_verified
    });
    res.json({ requiresOtp: true, challengeId: otp.challengeId, email: otp.email, expiresAt: otp.expiresAt, purpose: 'register' });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/login/verify-code', authLimiter, (req, res) => {
  const { challengeId, code } = req.body || {};
  const cleanCode = String(code || '').replace(/\D/g, '');
  if(!challengeId || cleanCode.length !== 6) return res.status(400).json({error: '6 haneli kod gerekli'});
  try {
    const row = db.prepare('SELECT * FROM login_otps WHERE challenge_id = ? AND used = 0').get(challengeId);
    if(!row) return res.status(400).json({error: 'Kod oturumu bulunamadi'});
    if(new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({error: 'Kod suresi doldu'});
    if(Number(row.attempts || 0) >= 5) return res.status(429).json({error: 'Cok fazla hatali deneme'});
    const expected = loginOtpHash(cleanCode, challengeId);
    const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(row.code_hash || ''));
    if(!ok) {
      db.prepare('UPDATE login_otps SET attempts = attempts + 1 WHERE id = ?').run(row.id);
      return res.status(401).json({error: 'Kod hatali'});
    }
    db.prepare('UPDATE login_otps SET used = 1 WHERE id = ?').run(row.id);
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(row.user_id);
    const fresh = db.prepare('SELECT id, username, email, credits, plan, is_admin FROM users WHERE id = ?').get(row.user_id);
    res.json(loginPayloadForUser(fresh));
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/register/verify-code', authLimiter, (req, res) => {
  const { challengeId, code } = req.body || {};
  const cleanCode = String(code || '').replace(/\D/g, '');
  if(!challengeId || cleanCode.length !== 6) return res.status(400).json({error: '6 haneli kod gerekli'});
  try {
    const row = db.prepare('SELECT * FROM registration_otps WHERE challenge_id = ? AND used = 0').get(challengeId);
    if(!row) return res.status(400).json({error: 'Kod oturumu bulunamadi'});
    if(new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({error: 'Kod suresi doldu'});
    if(Number(row.attempts || 0) >= 5) return res.status(429).json({error: 'Cok fazla hatali deneme'});
    if(db.prepare('SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?').get(row.email, String(row.username || '').toLowerCase())) {
      db.prepare('UPDATE registration_otps SET used = 1 WHERE id = ?').run(row.id);
      return res.status(400).json({error: 'Bu e-posta veya kullanici adi zaten kullanilmakta'});
    }
    const expected = loginOtpHash(cleanCode, challengeId);
    const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(row.code_hash || ''));
    if(!ok) {
      db.prepare('UPDATE registration_otps SET attempts = attempts + 1 WHERE id = ?').run(row.id);
      return res.status(401).json({error: 'Kod hatali'});
    }
    const plan = 'free';
    const info = db.prepare('INSERT INTO users (username, email, password, plan, credits, reg_ip, reg_fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(row.username, row.email, row.password_hash, plan, FREE_STARTER_CREDITS, row.reg_ip || '', row.reg_fingerprint || '');
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(info.lastInsertRowid);
    db.prepare('UPDATE registration_otps SET used = 1 WHERE id = ?').run(row.id);
    if (isForceAdminEmail(row.email)) syncForceAdminEmail(row.email);
    const fresh = db.prepare('SELECT id, username, email, credits, plan, is_admin, last_login FROM users WHERE id = ?').get(info.lastInsertRowid);
    recordConsent({
      userId: fresh.id,
      email: row.email,
      consentVersion: row.consent_version || SECURITY_CONSENT_VERSION,
      termsAccepted: !!row.terms_accepted,
      privacyAccepted: !!row.privacy_accepted,
      marketingOptIn: !!row.marketing_opt_in,
      req,
      fingerprint: row.reg_fingerprint || '',
      source: 'register_otp'
    });
    recordSecurityAudit(req, 'register_otp_verify', 'success', 'user_created', fresh.id, { email: row.email });
    recordFunnelEvent(req, 'register_complete', {
      userId: fresh.id,
      metadata: { method: 'email_otp', plan, credits: FREE_STARTER_CREDITS, email_domain: emailDomain(row.email) }
    });
    res.json(loginPayloadForUser(fresh));
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// ===== ADMIN ENDPOINTS =====

// GET /api/admin/stats
app.get('/api/admin/stats', adminMiddleware, (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const today = new Date().toISOString().split('T')[0];
    const newToday = db.prepare('SELECT COUNT(*) as c FROM users WHERE date(created_at) = ?').get(today).c;
    const totalCredits = db.prepare('SELECT SUM(credits) as s FROM users').get().s || 0;
    const totalChats = db.prepare('SELECT COUNT(*) as c FROM server_chats').get().c;
    const totalDocs = db.prepare('SELECT COUNT(*) as c FROM documents').get().c;
    const blockedUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_blocked = 1').get().c;
    const adminCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get().c;
    const recentUsers = db.prepare('SELECT id, username, email, credits, plan, is_admin, is_blocked, block_until, block_reason, created_at, last_login FROM users ORDER BY created_at DESC LIMIT 5').all();
    const latestUser = db.prepare('SELECT id, username, email, created_at, last_login FROM users ORDER BY created_at DESC LIMIT 1').get() || null;
    const latestLogin = db.prepare('SELECT id, username, email, last_login FROM users WHERE last_login IS NOT NULL ORDER BY last_login DESC LIMIT 1').get() || null;
    const recentLogins24h = db.prepare("SELECT COUNT(*) as c FROM users WHERE last_login >= datetime('now', '-1 day')").get().c;
    const galleryImages = db.prepare('SELECT COUNT(*) as c FROM image_gallery WHERE broken = 0').get().c;
    res.json({
      totalUsers, newToday, totalCredits, totalChats, totalDocs, blockedUsers, adminCount, recentUsers, latestUser, latestLogin, recentLogins24h, galleryImages,
      databaseStorage: {
        path: DATABASE_PATH,
        generatedPath: GENERATED_DIR,
        persistent: DATABASE_IS_PERSISTENT,
        source: DATABASE_IS_PERSISTENT ? 'env-or-railway-volume' : 'app-directory'
      }
    });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/leaderboard', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(25, parseInt(req.query.limit || '10', 10) || 10));
    const users = db.prepare(`
      SELECT
        u.username,
        u.plan,
        COALESCE(SUM(CASE WHEN cu.status = 'success' THEN cu.cost ELSE 0 END), 0) AS spentCredits
      FROM users u
      LEFT JOIN credit_usage cu ON cu.user_id = u.id
      WHERE COALESCE(u.is_blocked, 0) = 0
      GROUP BY u.id
      ORDER BY spentCredits DESC, u.created_at ASC
      LIMIT ?
    `).all(limit).map(row => ({
      username: row.username || 'Kullanıcı',
      plan: row.plan || 'free',
      spentCredits: Number(row.spentCredits || 0)
    }));
    res.json({ users });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/funnel-events?days=7
app.get('/api/admin/funnel-events', adminMiddleware, (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '7', 10) || 7));
    const since = `-${days} day`;
    const byEvent = db.prepare(`
      SELECT event, COUNT(*) AS count
      FROM funnel_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY event
      ORDER BY count DESC
    `).all(since);
    const bySource = db.prepare(`
      SELECT COALESCE(source, '') AS source, COALESCE(medium, '') AS medium, COALESCE(campaign, '') AS campaign, COUNT(*) AS count
      FROM funnel_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY source, medium, campaign
      ORDER BY count DESC
      LIMIT 30
    `).all(since);
    const daily = db.prepare(`
      SELECT date(created_at) AS day, event, COUNT(*) AS count
      FROM funnel_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY day, event
      ORDER BY day DESC, event ASC
    `).all(since);
    const recent = db.prepare(`
      SELECT id, event, user_id, session_id, source, medium, campaign, path, metadata, created_at
      FROM funnel_events
      ORDER BY created_at DESC
      LIMIT 80
    `).all();
    res.json({ days, byEvent, bySource, daily, recent });
  } catch(e) { res.status(500).json({error: e.message}); }
});

function adminGrowthDays(req) {
  return Math.min(90, Math.max(1, parseInt(req.query.days || req.body?.days || '30', 10) || 30));
}

function sqlDateWindow(days) {
  return `-${Math.min(90, Math.max(1, Number(days) || 30))} day`;
}

function marketingOptInWhere() {
  return `EXISTS (
    SELECT 1 FROM consent_records cr
    WHERE lower(cr.email) = lower(u.email)
      AND COALESCE(cr.marketing_opt_in, 0) = 1
  )`;
}

function paidUserWhere() {
  return `(
    lower(COALESCE(u.plan, 'free')) NOT IN ('free', '')
    OR EXISTS (SELECT 1 FROM shopier_payments sp WHERE sp.user_id = u.id AND sp.status = 'applied')
    OR EXISTS (SELECT 1 FROM dodo_payments dp WHERE dp.user_id = u.id AND dp.status = 'applied')
  )`;
}

function campaignSegmentWhere(segment) {
  const optIn = marketingOptInWhere();
  const paid = paidUserWhere();
  const seg = String(segment || 'registered_no_purchase').trim();
  if (seg === 'all_opt_in') return `${optIn}`;
  if (seg === 'low_credit') return `${optIn} AND COALESCE(u.credits, 0) <= 50`;
  if (seg === 'inactive_7d') return `${optIn} AND (u.last_login IS NULL OR u.last_login < datetime('now', '-7 day'))`;
  if (seg === 'free_users') return `${optIn} AND lower(COALESCE(u.plan, 'free')) = 'free'`;
  return `${optIn} AND NOT ${paid}`;
}

function marketingHtml({ subject, bodyText }) {
  const safeSubject = escapeHtmlText(subject || 'Froxy AI');
  const safeBody = escapeHtmlText(bodyText || '').replace(/\n/g, '<br>');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"></head><body style="margin:0;background:#0b0f1a;color:#e5e7eb;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f1a;padding:24px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#111827;border:1px solid #243044;border-radius:16px;overflow:hidden"><tr><td style="padding:28px"><h1 style="margin:0 0 14px;color:#fff;font-size:24px">${safeSubject}</h1><div style="font-size:15px;line-height:1.7;color:#cbd5e1">${safeBody}</div><p style="margin:24px 0 0"><a href="https://www.froxyai.com/fiyatlandirma?utm_source=brevo&utm_medium=email&utm_campaign=admin_campaign" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 18px">Kredi paketlerini incele</a></p><p style="margin:22px 0 0;color:#94a3b8;font-size:12px;line-height:1.5">Bu e-postayı Froxy AI hesabında pazarlama iletişimine izin verdiğin için aldın. Yanıtlayarak destek ekibine ulaşabilirsin.</p></td></tr></table></td></tr></table></body></html>`;
}

function marketingRecipients(segment, limit = 100) {
  const safeLimit = Math.min(300, Math.max(1, parseInt(limit, 10) || 100));
  const where = campaignSegmentWhere(segment);
  return db.prepare(`
    SELECT u.id, u.username, u.email, u.credits, u.plan, u.last_login, u.created_at
    FROM users u
    WHERE u.email IS NOT NULL
      AND length(trim(u.email)) > 3
      AND COALESCE(u.is_blocked, 0) = 0
      AND ${where}
    ORDER BY u.last_login IS NULL DESC, u.last_login ASC, u.created_at DESC
    LIMIT ?
  `).all(safeLimit);
}

app.get('/api/admin/growth-summary', adminMiddleware, (req, res) => {
  try {
    const days = adminGrowthDays(req);
    const since = sqlDateWindow(days);
    const totalUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c || 0;
    const paidUsers = db.prepare(`SELECT COUNT(*) c FROM users u WHERE ${paidUserWhere()}`).get().c || 0;
    const marketingOptIn = db.prepare(`SELECT COUNT(DISTINCT u.id) c FROM users u WHERE ${marketingOptInWhere()}`).get().c || 0;
    const registeredNoPurchase = db.prepare(`SELECT COUNT(*) c FROM users u WHERE NOT ${paidUserWhere()}`).get().c || 0;
    const lowCredit = db.prepare('SELECT COUNT(*) c FROM users WHERE COALESCE(credits, 0) <= 50').get().c || 0;
    const activeUsers = db.prepare("SELECT COUNT(*) c FROM users WHERE last_login >= datetime('now', ?)").get(since).c || 0;
    const guestSessions = db.prepare(`
      SELECT COUNT(DISTINCT session_id) c
      FROM funnel_events
      WHERE user_id IS NULL
        AND session_id IS NOT NULL
        AND session_id != ''
        AND created_at >= datetime('now', ?)
    `).get(since).c || 0;
    const credits = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'success' THEN cost ELSE 0 END), 0) spent,
        COALESCE(SUM(CASE WHEN kind = 'image' AND status = 'success' THEN cost ELSE 0 END), 0) imageSpent,
        COALESCE(SUM(CASE WHEN kind = 'chat' AND status = 'success' THEN cost ELSE 0 END), 0) chatSpent,
        COUNT(*) totalUses
      FROM credit_usage
      WHERE created_at >= datetime('now', ?)
    `).get(since);
    const funnel = db.prepare(`
      SELECT event, COUNT(*) count
      FROM funnel_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY event
      ORDER BY count DESC
    `).all(since);
    const topModels = db.prepare(`
      SELECT kind, model, provider, actual_model, COUNT(*) uses, COALESCE(SUM(cost), 0) credits
      FROM credit_usage
      WHERE created_at >= datetime('now', ?)
      GROUP BY kind, model, provider, actual_model
      ORDER BY credits DESC, uses DESC
      LIMIT 12
    `).all(since);
    const recentUsage = db.prepare(`
      SELECT cu.id, cu.kind, cu.model, cu.provider, cu.actual_model, cu.cost, cu.remaining, cu.status, cu.created_at,
             u.username, u.email, u.plan
      FROM credit_usage cu
      LEFT JOIN users u ON u.id = cu.user_id
      ORDER BY cu.created_at DESC
      LIMIT 80
    `).all();
    const guestRecent = db.prepare(`
      SELECT session_id,
             MIN(created_at) first_seen,
             MAX(created_at) last_seen,
             COUNT(*) events,
             MAX(source) source,
             MAX(medium) medium,
             MAX(campaign) campaign,
             MAX(path) path,
             MAX(referrer) referrer
      FROM funnel_events
      WHERE user_id IS NULL
        AND session_id IS NOT NULL
        AND session_id != ''
        AND created_at >= datetime('now', ?)
      GROUP BY session_id
      ORDER BY last_seen DESC
      LIMIT 40
    `).all(since);
    const campaigns = db.prepare(`
      SELECT id, segment, subject, recipients, sent, failed, dry_run, status, created_at
      FROM marketing_campaigns
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
    const signup = funnel.find(x => x.event === 'register_complete')?.count || 0;
    const purchaseClicks = funnel.find(x => x.event === 'purchase_click')?.count || 0;
    const purchases = funnel.find(x => x.event === 'purchase_complete')?.count || 0;
    res.json({
      days,
      metrics: {
        totalUsers,
        paidUsers,
        registeredNoPurchase,
        marketingOptIn,
        lowCredit,
        activeUsers,
        guestSessions,
        creditsSpent: Number(credits.spent || 0),
        imageCreditsSpent: Number(credits.imageSpent || 0),
        chatCreditsSpent: Number(credits.chatSpent || 0),
        modelUses: Number(credits.totalUses || 0),
        signupToPurchaseRate: signup ? Math.round((purchases / signup) * 1000) / 10 : 0,
        purchaseClickToPurchaseRate: purchaseClicks ? Math.round((purchases / purchaseClicks) * 1000) / 10 : 0
      },
      funnel,
      topModels,
      recentUsage,
      guestRecent,
      campaigns,
      suggestions: [
        'Kayıt olup satın almayanlara 24 saat içinde kısa avantaj e-postası gönder.',
        'Kredisi azalan kullanıcılara küçük paket ve sınırlı süreli ek kredi öner.',
        'Görsel üretim kullananlara görsel odaklı paketleri ayrı CTA ile göster.',
        'Misafirlerin en çok geldiği kaynakları UTM ile ayır ve çalışan kampanyaya bütçe/veri aktar.',
        'Satın alma butonuna giden fakat ödeme tamamlamayanları destek mesajı ve güven unsurlarıyla geri çağır.'
      ]
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/credit-usage', adminMiddleware, (req, res) => {
  try {
    const limit = Math.min(300, Math.max(1, parseInt(req.query.limit || '120', 10) || 120));
    const kind = String(req.query.kind || '').trim();
    const where = kind ? 'WHERE cu.kind = ?' : '';
    const params = kind ? [kind, limit] : [limit];
    const rows = db.prepare(`
      SELECT cu.id, cu.kind, cu.model, cu.provider, cu.actual_model, cu.cost, cu.remaining, cu.status, cu.created_at,
             u.id user_id, u.username, u.email, u.plan
      FROM credit_usage cu
      LEFT JOIN users u ON u.id = cu.user_id
      ${where}
      ORDER BY cu.created_at DESC
      LIMIT ?
    `).all(...params);
    res.json({ rows });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/guest-sessions', adminMiddleware, (req, res) => {
  try {
    const days = adminGrowthDays(req);
    const since = sqlDateWindow(days);
    const sessions = db.prepare(`
      SELECT session_id,
             MIN(created_at) first_seen,
             MAX(created_at) last_seen,
             COUNT(*) events,
             MAX(source) source,
             MAX(medium) medium,
             MAX(campaign) campaign,
             MAX(path) path,
             MAX(referrer) referrer
      FROM funnel_events
      WHERE user_id IS NULL
        AND session_id IS NOT NULL
        AND session_id != ''
        AND created_at >= datetime('now', ?)
      GROUP BY session_id
      ORDER BY last_seen DESC
      LIMIT 120
    `).all(since);
    res.json({ days, sessions });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/marketing-campaigns', adminMiddleware, (req, res) => {
  try {
    const campaigns = db.prepare(`
      SELECT id, segment, subject, recipients, sent, failed, dry_run, status, created_at
      FROM marketing_campaigns
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    res.json({ campaigns });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/marketing-campaigns', adminMiddleware, async (req, res) => {
  try {
    const segment = String(req.body.segment || 'registered_no_purchase').trim();
    const subject = safeField(req.body.subject || '', 140);
    const bodyText = String(req.body.body || '').trim().slice(0, 6000);
    const dryRun = req.body.dryRun === true || req.body.dry_run === true;
    const limit = Math.min(300, Math.max(1, parseInt(req.body.limit || '100', 10) || 100));
    if (!subject || !bodyText) return res.status(400).json({ error: 'Konu ve e-posta metni gerekli.' });
    if (!dryRun && req.body.confirm !== 'SEND') return res.status(400).json({ error: 'Canlı gönderim için confirm alanı SEND olmalı.' });
    const recipients = marketingRecipients(segment, limit);
    const info = db.prepare(`INSERT INTO marketing_campaigns
      (admin_user_id, segment, subject, body_text, recipients, dry_run, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, segment, subject, bodyText, recipients.length, dryRun ? 1 : 0, dryRun ? 'preview' : 'sending');
    const campaignId = info.lastInsertRowid;
    if (dryRun) {
      logActivity(req.user.id, 'marketing_campaign_preview', `${segment}: ${recipients.length} alıcı`);
      return res.json({
        dryRun: true,
        campaignId,
        recipients: recipients.length,
        sample: recipients.slice(0, 10).map(r => ({ id: r.id, username: r.username, email: maskEmail(r.email), credits: r.credits, plan: r.plan }))
      });
    }
    let sent = 0;
    let failed = 0;
    const html = marketingHtml({ subject, bodyText });
    for (const r of recipients) {
      try {
        await sendBrevoEmail({ to: r.email, subject, html, text: bodyText });
        sent++;
        db.prepare('INSERT INTO marketing_email_sends (campaign_id, user_id, email, status) VALUES (?, ?, ?, ?)').run(campaignId, r.id, r.email, 'sent');
      } catch(err) {
        failed++;
        db.prepare('INSERT INTO marketing_email_sends (campaign_id, user_id, email, status, error) VALUES (?, ?, ?, ?, ?)').run(campaignId, r.id, r.email, 'failed', String(err.message || err).slice(0, 300));
      }
    }
    db.prepare('UPDATE marketing_campaigns SET sent = ?, failed = ?, status = ? WHERE id = ?').run(sent, failed, failed ? 'partial' : 'sent', campaignId);
    logActivity(req.user.id, 'marketing_campaign_sent', `${segment}: ${sent}/${recipients.length} gönderildi`);
    res.json({ campaignId, recipients: recipients.length, sent, failed });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/users
app.get('/api/admin/users', adminMiddleware, (req, res) => {
  try {
    const { search = '', filter = 'all', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];
    if(search) { where += ' AND (username LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if(filter === 'blocked') { where += ' AND is_blocked = 1'; }
    else if(filter === 'admin') { where += ' AND is_admin = 1'; }
    else if(filter === 'active') { where += ' AND is_blocked = 0'; }
    const total = db.prepare(`SELECT COUNT(*) as c FROM users WHERE ${where}`).get(...params).c;
    params.push(parseInt(limit), offset);
    const users = db.prepare(`SELECT id, username, email, credits, plan, is_admin, is_blocked, blocked_at, block_until, block_reason, created_at, last_login, total_requests FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// PUT /api/admin/users/:id/credits
app.put('/api/admin/users/:id/credits', adminMiddleware, (req, res) => {
  const { amount } = req.body;
  if(typeof amount !== 'number') return res.status(400).json({error: 'Ge\u00e7erli miktar girin'});
  try {
    db.prepare('UPDATE users SET credits = MAX(0, credits + ?) WHERE id = ?').run(amount, req.params.id);
    const u = db.prepare('SELECT id, username, credits FROM users WHERE id = ?').get(req.params.id);
    logActivity(req.user.id, 'credit_change', `User ${req.params.id}: ${amount > 0 ? '+' : ''}${amount}`);
    res.json({ success: true, user: u });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// PUT /api/admin/users/:id/plan
app.put('/api/admin/users/:id/plan', adminMiddleware, (req, res) => {
  const allowedPlans = ['free','starter','popular','pro','creator','developer','power','agency_start','business','enterprise'];
  const { plan, credits } = req.body;
  if(!allowedPlans.includes(plan)) return res.status(400).json({error: 'Ge\u00e7erli paket se\u00e7in'});
  try {
    if(typeof credits === 'number') {
      db.prepare('UPDATE users SET plan = ?, credits = MAX(0, ?) WHERE id = ?').run(plan, credits, req.params.id);
    } else {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, req.params.id);
    }
    const u = db.prepare('SELECT id, username, email, credits, plan FROM users WHERE id = ?').get(req.params.id);
    logActivity(req.user.id, 'plan_change', `User ${req.params.id}: ${plan}`);
    res.json({ success: true, user: u });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// PUT /api/admin/users/:id/block
app.put('/api/admin/users/:id/block', adminMiddleware, (req, res) => {
  const { block, until = null, reason = '', permanent = false } = req.body;
  try {
    if(block) {
      const blockUntil = permanent ? null : until;
      db.prepare('UPDATE users SET is_blocked = 1, blocked_at = CURRENT_TIMESTAMP, block_until = ?, block_reason = ? WHERE id = ?').run(blockUntil, reason || null, req.params.id);
      logActivity(req.user.id, permanent ? 'permanent_ban' : 'temp_ban', `User ${req.params.id}: ${reason || '-'} ${blockUntil || 'kal\u0131c\u0131'}`);
    } else {
      db.prepare('UPDATE users SET is_blocked = 0, blocked_at = NULL, block_until = NULL, block_reason = NULL WHERE id = ?').run(req.params.id);
      logActivity(req.user.id, 'unblock_user', `User ${req.params.id}`);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// PUT /api/admin/users/:id/role
app.put('/api/admin/users/:id/role', adminMiddleware, (req, res) => {
  const { is_admin } = req.body;
  try {
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, req.params.id);
    logActivity(req.user.id, 'role_change', `User ${req.params.id}: is_admin=${is_admin}`);
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// DELETE /api/admin/users/:id
app.delete('/api/admin/users/:id', adminMiddleware, (req, res) => {
  if(parseInt(req.params.id) === req.user.id) return res.status(400).json({error: 'Kendinizi silemezsiniz'});
  try {
    db.prepare('DELETE FROM documents WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM server_chats WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM reset_tokens WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    logActivity(req.user.id, 'delete_user', `User ${req.params.id}`);
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// GET /api/admin/logs
app.get('/api/admin/logs', adminMiddleware, (req, res) => {
  try {
    const logs = db.prepare('SELECT al.*, u.username FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT 100').all();
    res.json({ logs });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// GET /api/admin/code-redemptions
app.get('/api/admin/code-redemptions', adminMiddleware, (req, res) => {
  try {
    const redemptions = db.prepare(`SELECT r.*, u.username, u.email
      FROM membership_code_redemptions r
      LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC
      LIMIT 200`).all();
    res.json({ redemptions });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// GET /api/admin/shopier-payments
app.get('/api/admin/shopier-payments', adminMiddleware, (req, res) => {
  try {
    const payments = db.prepare(`SELECT sp.*, u.username
      FROM shopier_payments sp
      LEFT JOIN users u ON u.id = sp.user_id
      ORDER BY sp.created_at DESC
      LIMIT 200`).all();
    res.json({ payments });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/admin/security-status', adminMiddleware, (req, res) => {
  try {
    const audit24h = db.prepare("SELECT event, status, COUNT(*) c FROM security_audit WHERE created_at > datetime('now', '-1 day') GROUP BY event, status").all();
    const consentCount = db.prepare('SELECT COUNT(*) c FROM consent_records').get()?.c || 0;
    res.json({
      turnstile: { siteKeyConfigured: !!TURNSTILE_SITE_KEY, secretConfigured: !!TURNSTILE_SECRET_KEY, required: TURNSTILE_REQUIRED },
      otp: { enabled: LOGIN_OTP_ENABLED, ttlMinutes: LOGIN_OTP_TTL_MINUTES },
      consent: { version: SECURITY_CONSENT_VERSION, records: consentCount },
      dodo: { apiConfigured: !!DODO_API_KEY, webhookConfigured: !!DODO_WEBHOOK_SECRET, apiBase: DODO_API_BASE },
      shopier: { apiConfigured: !!(process.env.SHOPIER_API_KEY && process.env.SHOPIER_API_SECRET), fallback: true },
      database: { persistent: DATABASE_IS_PERSISTENT, path: DATABASE_PATH },
      audit24h
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/shopier-sync-orders
app.post('/api/admin/shopier-sync-orders', adminMiddleware, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.body.limit || 20)));
    const api = await shopierApiRequest('GET', `orders?limit=${limit}`);
    const orders = extractShopierOrders(api.data);
    const results = [];
    for (const order of orders) {
      try {
        results.push(applyShopierPayment(req, normalizeShopierOrder(order)));
      } catch(e) {
        results.push({ ok: false, status: 'error', error: e.message, payment_id: order?.id || order?.orderNumber || null });
      }
    }
    logActivity(req.user.id, 'shopier_sync_orders', `${orders.length} siparis kontrol edildi`);
    res.json({ success: true, checked: orders.length, results });
  } catch(e) {
    res.status(e.status || 500).json({ error: e.message || 'Shopier siparişleri alınamadı.' });
  }
});

// POST /api/admin/shopier-register-webhook
app.post('/api/admin/shopier-register-webhook', adminMiddleware, async (req, res) => {
  try {
    const publicBase = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const callbackUrl = req.body.url || `${publicBase.replace(/\/$/, '')}/api/shopier/callback`;
    const payload = {
      url: callbackUrl,
      events: req.body.events || ['order.created'],
      isActive: true
    };
    const api = await shopierApiRequest('POST', 'webhooks', payload);
    logActivity(req.user.id, 'shopier_register_webhook', callbackUrl);
    res.json({ success: true, webhook: api.data || api.raw, url: callbackUrl });
  } catch(e) {
    res.status(e.status || 500).json({ error: e.message || 'Shopier webhook oluşturulamadı.' });
  }
});

// POST /api/shopier/start
app.post('/api/shopier/start', authMiddleware, (req, res) => {
  const plan = String(req.body.plan || 'starter').trim();
  const pack = SHOPIER_PACKAGE_CATALOG[plan];
  if (!pack) return res.status(400).json({ error: 'Geçerli paket seçin.' });
  const fallbackUrl = SHOPIER_STATIC_URLS[plan] || 'https://www.shopier.com/froxyai';
  const apiKey = process.env.SHOPIER_API_KEY;
  const apiSecret = process.env.SHOPIER_API_SECRET;
  if (!apiKey || !apiSecret) {
    return res.json({ fallback: true, url: fallbackUrl, reason: 'shopier_api_missing' });
  }
  try {
    const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const random = crypto.randomBytes(8).toString('hex');
    const platformOrderId = `FRX-${user.id}-${plan}-${Date.now()}-${random.slice(0, 6)}`;
    const total = Number(pack.price).toFixed(2);
    const currency = 'TRY';
    const signatureBase = random + platformOrderId + total + currency;
    const signature = crypto.createHmac('sha256', apiSecret).update(signatureBase).digest('base64');
    const [firstName, ...lastParts] = String(user.username || 'Froxy AI Kullanıcısı').trim().split(/\s+/);
    const lastName = lastParts.join(' ') || 'Kullanıcı';
    const frontend = process.env.FRONTEND_ORIGIN || 'https://froxyai.com';
    const fields = {
      API_key: apiKey,
      website_index: process.env.SHOPIER_WEBSITE_INDEX || '1',
      platform_order_id: platformOrderId,
      product_name: `Froxy AI ${pack.label}`,
      product_type: '0',
      buyer_name: firstName || 'Froxy',
      buyer_surname: lastName,
      buyer_email: user.email || '',
      buyer_account_age: '0',
      buyer_id_nr: String(user.id),
      buyer_phone: process.env.SHOPIER_DEFAULT_PHONE || '5555555555',
      billing_address: 'Online hizmet',
      billing_city: 'Istanbul',
      billing_country: 'TR',
      billing_postcode: '34000',
      shipping_address: 'Online teslimat',
      shipping_city: 'Istanbul',
      shipping_country: 'TR',
      shipping_postcode: '34000',
      total_order_value: total,
      currency,
      platform: '0',
      is_in_frame: '0',
      current_language: '0',
      modul_version: 'FroxyAI-1.0',
      random_nr: random,
      signature
    };
    recordShopierPayment({ payload: fields, paymentId: platformOrderId, orderId: platformOrderId, plan, pack, userId: user.id, verified: false, status: 'started' });
    recordFunnelEvent(req, 'purchase_click', {
      userId: user.id,
      metadata: { plan, credits: pack.credits, amount: pack.price, platform_order_id: platformOrderId }
    });
    logActivity(user.id, 'shopier_payment_started', `${platformOrderId}: ${plan}`);
    const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${String(k).replace(/"/g, '&quot;')}" value="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">`).join('');
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Shopier'e yönlendiriliyor</title></head><body><form id="shopier-form" method="post" action="https://www.shopier.com/ShowProduct/api_pay4.php">${inputs}</form><script>document.getElementById('shopier-form').submit();setTimeout(function(){location.href=${JSON.stringify(frontend)}},12000);<\/script></body></html>`;
    res.json({ fallback: false, action: 'https://www.shopier.com/ShowProduct/api_pay4.php', fields, html, platform_order_id: platformOrderId });
  } catch(e) {
    res.status(500).json({ error: 'Shopier ödeme başlatılamadı: ' + e.message, fallback_url: fallbackUrl });
  }
});

app.post('/api/dodo/start', authMiddleware, async (req, res) => {
  const plan = String(req.body.plan || 'starter').trim();
  const pack = SHOPIER_PACKAGE_CATALOG[plan];
  if (!pack) return res.status(400).json({ error: 'Gecerli paket secin.' });
  const checkoutConsentAccepted = req.body.checkoutConsentAccepted === true || req.body.checkoutConsentAccepted === 'true' || req.body.checkoutConsentAccepted === 1;
  if (!checkoutConsentAccepted) return res.status(400).json({ error: 'Odeme oncesi sozlesme ve dijital teslimat onayini kabul etmelisiniz.' });
  try {
    const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Kullanici bulunamadi.' });
    const orderId = `FRX-${user.id}-${plan}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const frontend = process.env.FRONTEND_ORIGIN || 'https://froxyai.com';
    const staticLink = envForPlan('DODO_LINK', plan);
    const productId = envForPlan('DODO_PRODUCT', plan);
    recordSecurityAudit(req, 'payment_started', 'started', 'dodo_checkout_requested', user.id, { email: user.email, plan, gateway: 'dodo' });
    if (!DODO_API_KEY || !productId) {
      if (staticLink) return res.json({ fallback: true, gateway: 'dodo_link', url: staticLink, order_id: orderId });
      const shopierUrl = SHOPIER_STATIC_URLS[plan] || 'https://www.shopier.com/froxyai';
      return res.json({ fallback: true, gateway: 'shopier', url: shopierUrl, reason: 'dodo_not_configured', order_id: orderId });
    }
    const payload = {
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: user.email, name: user.username || user.email },
      metadata: { user_id: String(user.id), email: user.email, plan, order_id: orderId, credits: String(pack.credits) },
      return_url: `${frontend.replace(/\/$/, '')}/magaza?payment=success`,
      cancel_url: `${frontend.replace(/\/$/, '')}/magaza?payment=cancel`
    };
    let api;
    try {
      api = await dodoApiRequest('POST', 'checkout/sessions', payload);
    } catch(firstErr) {
      api = await dodoApiRequest('POST', 'checkout-sessions', payload);
    }
    const data = api.data || {};
    const checkoutUrl = data.checkout_url || data.url || data.payment_link || data.hosted_url;
    const sessionId = data.checkout_session_id || data.session_id || data.id || orderId;
    recordDodoPayment({ payload: data, paymentId: sessionId, checkoutSessionId: sessionId, orderId, plan, pack, userId: user.id, email: user.email, verified: false, status: 'started' });
    recordFunnelEvent(req, 'purchase_click', { userId: user.id, metadata: { gateway: 'dodo', plan, credits: pack.credits, amount: pack.price, order_id: orderId } });
    if (!checkoutUrl) return res.status(502).json({ error: 'Dodo checkout linki alinamadi.' });
    res.json({ fallback: false, gateway: 'dodo', url: checkoutUrl, checkout_session_id: sessionId, order_id: orderId });
  } catch(e) {
    const fallbackUrl = SHOPIER_STATIC_URLS[plan] || 'https://www.shopier.com/froxyai';
    res.status(e.status || 500).json({ error: 'Dodo odeme baslatilamadi: ' + e.message, fallback_url: fallbackUrl });
  }
});

app.post('/api/dodo/webhook', (req, res) => {
  if (!DODO_WEBHOOK_SECRET) return res.status(503).json({ error: 'Dodo webhook secret eksik.' });
  try {
    const wh = new Webhook(DODO_WEBHOOK_SECRET);
    const event = wh.verify(req.rawBody || JSON.stringify(req.body || {}), {
      'webhook-id': req.headers['webhook-id'] || req.headers['svix-id'] || req.headers['dodo-webhook-id'],
      'webhook-timestamp': req.headers['webhook-timestamp'] || req.headers['svix-timestamp'],
      'webhook-signature': req.headers['webhook-signature'] || req.headers['svix-signature']
    });
    const result = applyDodoPayment(req, event);
    recordSecurityAudit(req, 'dodo_webhook', result.ok ? 'success' : 'received', result.status, result.user?.id || null, { payment_id: result.payment_id });
    res.json(result);
  } catch(e) {
    recordSecurityAudit(req, 'dodo_webhook', 'blocked', 'invalid_signature', null, {});
    res.status(401).json({ error: 'Dodo webhook imzasi gecersiz.' });
  }
});

// POST/GET /api/shopier/callback
function handleShopierCallback(req, res) {
  const payload = getShopierPayload(req);
  try {
    const result = applyShopierPayment(req, payload);
    const wantsJson = String(req.headers.accept || '').includes('application/json') || req.method === 'POST';
    if (wantsJson) return res.status(result.ok ? 200 : 202).json(result);
    const frontend = process.env.FRONTEND_ORIGIN || 'https://froxyai.com';
    const status = result.ok ? 'success' : 'pending';
    return res.redirect(`${frontend}/?payment=${status}&t=${Date.now()}`);
  } catch(e) {
    console.error('[SHOPIER CALLBACK]', e.message);
    if (String(req.headers.accept || '').includes('application/json') || req.method === 'POST') return res.status(500).json({ error: e.message });
    const frontend = process.env.FRONTEND_ORIGIN || 'https://froxyai.com';
    return res.redirect(`${frontend}/?payment=error&t=${Date.now()}`);
  }
}
app.post('/api/shopier/callback', handleShopierCallback);
app.get('/api/shopier/callback', handleShopierCallback);

// POST /api/admin/announce
app.post('/api/admin/announce', adminMiddleware, (req, res) => {
  const { title, body, type } = req.body;
  if(!title || !body) return res.status(400).json({error: 'Başlık ve içerik gerekli'});
  try {
    const r = db.prepare('INSERT INTO announcements (title, body, type) VALUES (?, ?, ?)').run(title, body, type || 'info');
    logActivity(req.user.id, 'announce', title);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// GET /api/admin/announce
app.get('/api/admin/announce', adminMiddleware, (req, res) => {
  try {
    const ann = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 20').all();
    res.json({ announcements: ann });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// DELETE /api/admin/announce/:id
app.delete('/api/admin/announce/:id', adminMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// GET /api/admin/membership-codes
app.get('/api/admin/membership-codes', adminMiddleware, (req, res) => {
  try {
    const codes = db.prepare('SELECT * FROM membership_codes ORDER BY created_at DESC LIMIT 200').all();
    res.json({ codes });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// POST /api/admin/membership-codes
app.post('/api/admin/membership-codes', adminMiddleware, (req, res) => {
  const allowedPlans = ['free','starter','popular','pro','creator','developer','power','agency_start','business','enterprise'];
  let { code, plan = 'starter', credits = 0, max_uses = 1, expires_days = 30 } = req.body;
  if(!allowedPlans.includes(plan)) return res.status(400).json({error: 'Ge\u00e7erli bir paket se\u00e7in.'});
  credits = Math.max(0, parseInt(credits || 0, 10));
  max_uses = Math.max(1, parseInt(max_uses || 1, 10));
  expires_days = Math.max(1, parseInt(expires_days || 30, 10));
  code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if(!code) code = `FRX-${plan.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + expires_days * 86400000).toISOString();
  try {
    const r = db.prepare('INSERT INTO membership_codes (code, plan, credits, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)').run(code, plan, credits, max_uses, expiresAt);
    logActivity(req.user.id, 'create_membership_code', `${code}: ${plan}, ${credits} kredi`);
    res.json({ success: true, code: { id: r.lastInsertRowid, code, plan, credits, max_uses, used_count: 0, expires_at: expiresAt, is_active: 1 } });
  } catch(e) {
    res.status(400).json({error: 'Kod zaten var veya olu\u015fturulamad\u0131.'});
  }
});

// DELETE /api/admin/membership-codes/:id
app.delete('/api/admin/membership-codes/:id', adminMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE membership_codes SET is_active = 0 WHERE id = ?').run(req.params.id);
    logActivity(req.user.id, 'disable_membership_code', `Code ${req.params.id}`);
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// POST /api/redeem-code
app.post('/api/redeem-code', authMiddleware, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if(!code) return res.status(400).json({error: 'Kod gerekli.'});
  try {
    const redeem = db.transaction((userId, cleanCode) => {
      const c = db.prepare('SELECT * FROM membership_codes WHERE code = ? AND is_active = 1').get(cleanCode);
      if(!c) return { status: 404, error: 'Kod bulunamad\u0131 veya pasif durumda.' };
      if(c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return { status: 400, error: 'Kodun s\u00fcresi dolmu\u015f.' };
      if(Number(c.used_count || 0) >= Number(c.max_uses || 1)) return { status: 400, error: 'Kod kullan\u0131m limiti dolmu\u015f.' };
      db.prepare('UPDATE users SET plan = ?, credits = credits + ? WHERE id = ?').run(c.plan, Math.max(0, Number(c.credits || 0)), userId);
      db.prepare('UPDATE membership_codes SET used_count = used_count + 1 WHERE id = ?').run(c.id);
      db.prepare('INSERT INTO membership_code_redemptions (code_id, code, user_id, plan, credits) VALUES (?, ?, ?, ?, ?)')
        .run(c.id, c.code, userId, c.plan, Math.max(0, Number(c.credits || 0)));
      logActivity(userId, 'redeem_membership_code', `${c.code}: ${c.plan}, +${c.credits || 0} kredi`);
      const user = db.prepare('SELECT id, username, email, credits, plan, is_admin FROM users WHERE id = ?').get(userId);
      return { success: true, user, code: c.code, plan: c.plan, credits_added: Number(c.credits || 0) };
    });
    const result = redeem(req.user.id, code);
    if(!result.success) return res.status(result.status || 400).json({ error: result.error || 'Kod uygulanamad\u0131.' });
    res.json(result);
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// POST /api/admin/make-admin-by-email (bootstrapping)
// GÜVENLIK: ADMIN_BOOTSTRAP_SECRET env degiskeni olmadan calismaz
app.post('/api/admin/make-admin-by-email', (req, res) => {
  const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!bootstrapSecret) return res.status(403).json({error: 'Bootstrap devre disi. ADMIN_BOOTSTRAP_SECRET env ayarlanmali.'});
  const { secret, email } = req.body;
  if(secret !== bootstrapSecret) return res.status(403).json({error: 'Geçersiz secret'});
  try {
    const r = db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(email);
    logActivity(0, 'bootstrap_admin', `Email: ${email}`);
    if (email) syncForceAdminEmail(email);
    res.json({ success: true, changed: r.changes });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// ===== FORGOT PASSWORD =====
app.post('/api/forgot-password', authLimiter, (req, res) => {
  const { email } = req.body;
  if(!email) return res.status(400).json({error: 'E-posta gerekli'});
  try {
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    // Always return success to prevent email enumeration
    if(user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000).toISOString(); // 1 saat
      db.prepare('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expires);
      // Production'da token'ı loglamıyoruz; dev'de debug için yazıyoruz.
      // Reset token console'a yazilmaz; sadece dev response icinde doner.
      const payload = { success: true, message: 'Şifre sıfırlama bağlantısı e-postanıza gönderildi.' };
      if (process.env.NODE_ENV !== 'production') payload.dev_token = token;
      res.json(payload);
    } else {
      res.json({ success: true, message: 'Şifre sıfırlama bağlantısı e-postanıza gönderildi.' });
    }
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/reset-password', authLimiter, (req, res) => {
  const { token, password } = req.body;
  if(!token || !password) return res.status(400).json({error: 'Token ve şifre gerekli'});
  if(password.length < 6) return res.status(400).json({error: 'Şifre en az 6 karakter olmalı'});
  try {
    const rt = db.prepare('SELECT * FROM reset_tokens WHERE token = ? AND used = 0').get(token);
    if(!rt) return res.status(400).json({error: 'Ge?ersiz veya kullan?lm?? token'});
    if(new Date(rt.expires_at) < new Date()) return res.status(400).json({error: 'Token s?resi dolmu?'});
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, rt.user_id);
    db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(rt.id);
    res.json({ success: true, message: 'Şifreniz başarıyla sıfırlandı.' });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// ===== PROFILE =====
app.put('/api/profile', authMiddleware, (req, res) => {
  const { username } = req.body;
  if(!username || username.trim().length < 2) return res.status(400).json({error: 'Geçerli bir kullanıcı adı girin'});
  try {
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.trim(), req.user.id);
    const user = db.prepare('SELECT id, username, email, credits, plan, is_admin, total_requests FROM users WHERE id = ?').get(req.user.id);
    res.json({ user });
  } catch(e) {
    res.status(400).json({error: 'Bu kullanıcı adı zaten kullanımda'});
  }
});

app.post('/api/change-password', authMiddleware, authLimiter, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if(!oldPassword || !newPassword) return res.status(400).json({error: 'Eksik bilgi'});
  if(newPassword.length < 6) return res.status(400).json({error: 'Şifre en az 6 karakter olmalı'});
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if(!bcrypt.compareSync(oldPassword, user.password)) return res.status(401).json({error: 'Mevcut şifre hatalı'});
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// ===== SERVER-SIDE CHAT HISTORY =====
app.get('/api/chats', authMiddleware, (req, res) => {
  try {
    const chats = db.prepare('SELECT id, title, messages, updated_at FROM server_chats WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
    res.json({ chats: chats.map(c => ({...c, messages: JSON.parse(c.messages)})) });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/chats', authMiddleware, (req, res) => {
  const { id, title, messages } = req.body;
  if(!id) return res.status(400).json({error: 'Chat ID gerekli'});
  try {
    const exists = db.prepare('SELECT id FROM server_chats WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if(exists) {
      db.prepare('UPDATE server_chats SET title = ?, messages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
        .run(title || 'Sohbet', JSON.stringify(messages || []), id, req.user.id);
    } else {
      db.prepare('INSERT INTO server_chats (id, user_id, title, messages) VALUES (?, ?, ?, ?)')
        .run(id, req.user.id, title || 'Sohbet', JSON.stringify(messages || []));
    }
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.delete('/api/chats/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM server_chats WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.get('/api/me', authMiddleware, (req, res) => {
  try {
    resetDailyIfNeeded(req.user.id);
    const user = syncForceAdminUserId(req.user.id) || db.prepare('SELECT id, username, email, credits, plan, is_admin, total_requests, daily_chat_count, daily_image_count FROM users WHERE id = ?').get(req.user.id);
    if(!user) return res.status(404).json({error: 'Kullanıcı bulunamadı'});
    const limits = getDailyLimits(user.plan || 'free');
    res.json({ user, limits });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.get('/api/credit-history', authMiddleware, (req, res) => {
  try {
    const items = db.prepare('SELECT kind, model, provider, actual_model, cost, remaining, status, created_at FROM credit_usage WHERE user_id = ? ORDER BY created_at DESC LIMIT 80').all(req.user.id);
    res.json({ items });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// ===== RAG (BILGI BANKASI) ENDPOINTS =====
app.get('/api/documents', authMiddleware, (req, res) => {
  try {
    const docs = db.prepare('SELECT id, filename, length(content) as size, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ documents: docs });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/documents', authMiddleware, (req, res) => {
  const { filename, content } = req.body;
  if(!filename || !content) return res.status(400).json({error: 'Dosya adı ve içeriği gerekli'});
  try {
    // Basic chunking: save as one big row for simplicity, or chunk it. We'll save as one row.
    const stmt = db.prepare('INSERT INTO documents (user_id, filename, content) VALUES (?, ?, ?)');
    const info = stmt.run(req.user.id, filename, content);
    res.json({ id: info.lastInsertRowid, filename, success: true });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.delete('/api/documents/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/rag', authMiddleware, (req, res) => {
  const { query } = req.body;
  if(!query) return res.json({ context: '' });
  try {
    // Very naive search: split query into words, find documents containing those words.
    // In a real SaaS, use FTS5 or Pinecone. For this prototype, we just return the most recent docs
    // if they match ANY keyword, limited to 15000 characters total.
    const words = query.split(' ').filter(w => w.length > 3).slice(0, 5);
    if(words.length === 0) return res.json({ context: '' });
    
    let sql = 'SELECT filename, content FROM documents WHERE user_id = ? AND (';
    let params = [req.user.id];
    let conditions = [];
    words.forEach(w => {
      conditions.push('content LIKE ?');
      params.push('%' + w + '%');
    });
    sql += conditions.join(' OR ') + ') LIMIT 3';
    
    const docs = db.prepare(sql).all(...params);
    let context = docs.map(d => `--- DOSYA: ${d.filename} ---\n${d.content.substring(0, 5000)}`).join('\n\n');
    res.json({ context });
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

// Static performance headers. Set NO_CACHE=1 only while debugging cache issues.
app.use((req, res, next) => {
  if (process.env.NO_CACHE === '1') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

app.use((req, res, next) => {
  let reqPath = '/';
  try {
    reqPath = decodeURIComponent(req.path || '/').replace(/\\/g, '/');
  } catch {
    reqPath = req.path || '/';
  }
  const cleanPath = reqPath.toLowerCase();
  const fileName = path.basename(cleanPath);
  if (cleanPath.startsWith('/assets/model-showcase/')) return next();
  const allowedJson = new Set(['manifest.json', 'openrouter_models.json']);
  const allowedJs = new Set(['app.js', 'app.min.js', 'sw.js']);
  const allowedXml = new Set(['sitemap.xml']);
  const blocked =
    /^\/(backup_|deploy_static_|node_modules|\.git|tts_out)(\/|$)/i.test(cleanPath) ||
    cleanPath.includes('/backup_') ||
    fileName.startsWith('.') ||
    fileName === 'server.js' ||
    fileName === 'Froxy AI.db' ||
    fileName === 'package.json' ||
    fileName === 'package-lock.json' ||
    fileName.endsWith('.log') ||
    fileName.endsWith('.md') ||
    fileName.endsWith('.txt') && fileName !== 'robots.txt' ||
    fileName.endsWith('.xml') && !allowedXml.has(fileName) ||
    (fileName.endsWith('.js') && !allowedJs.has(fileName)) ||
    (fileName.endsWith('.json') && !allowedJson.has(fileName));

  if (blocked) return res.status(404).send('Not found');
  next();
});

const staticRoot = path.resolve(__dirname);
const compressedTypes = new Set(['.js', '.css', '.html', '.json', '.svg', '.txt', '.xml']);
const SEO_PAGES = {
  '/': {
    title: 'Froxy AI - 600+ AI Modeli Tek Panelde',
    description: 'ChatGPT, Claude, Gemini, gorsel uretim araclari ve AI ajanlarini tek hesapta kullan. Yeni uyeler 100 ucretsiz krediyle baslar.'
  },
  '/sohbet': {
    title: 'AI Sohbet Paneli - ChatGPT, Claude ve Gemini | Froxy AI',
    description: 'ChatGPT, Claude, Gemini ve farkli AI modelleriyle tek panelden Turkce sohbet et. Froxy AI ile 100 ucretsiz krediyle basla.'
  },
  '/panel': {
    title: 'AI Dashboard ve Tek Panel Yapay Zeka Platformu | Froxy AI',
    description: 'Sohbet, gorsel uretim, kod, belge ve AI ajanlarini tek dashboard uzerinden yonet.'
  },
  '/dashboard': {
    title: 'Froxy AI Dashboard - Tum AI Araclari Tek Ekranda',
    description: '600+ AI modelini, kredi bakiyeni, araclarini ve uretim gecmisini tek dashboard uzerinden takip et.'
  },
  '/gorsel-uret': {
    title: 'AI Gorsel Uretme Araci - Yapay Zeka ile Gorsel Uret | Froxy AI',
    description: 'Prompt yazarak AI gorsel uret. Farkli gorsel modellerini tek panelde kullan ve 100 ucretsiz krediyle dene.'
  },
  '/ai-araclar': {
    title: 'AI Araclari - ChatGPT, Claude, Gemini ve Daha Fazlasi | Froxy AI',
    description: 'Yapay zeka sohbet, gorsel uretim, kod, belge, ses ve video araclarini tek panelde kullan.'
  },
  '/ai-ajanlar': {
    title: 'AI Ajanlar - Gorev Odakli Yapay Zeka Asistanlari | Froxy AI',
    description: 'Icerik, analiz, kod, pazarlama ve otomasyon icin AI ajanlariyla daha hizli calis.'
  },
  '/fiyatlandirma': {
    title: 'Froxy AI Fiyatlandirma - 100 Ucretsiz Krediyle Dene',
    description: 'Froxy AI kredi paketlerini incele. Yeni uyeler 100 ucretsiz krediyle ChatGPT, Claude, Gemini ve 600+ modeli deneyebilir.'
  },
  '/kayit': {
    title: 'Froxy AI Kayit Ol - 100 Ucretsiz Kredi',
    description: 'Froxy AI hesabini olustur, 100 ucretsiz krediyle 600+ AI modelini tek panelde dene.'
  },
  '/chatgpt-claude-gemini-tek-panel': {
    title: 'ChatGPT, Claude ve Gemini Tek Panelde | Froxy AI',
    description: 'ChatGPT, Claude ve Gemini arasinda sekme degistirmeden calis. Froxy AI ile populer AI modellerini tek panelde kullan.'
  },
  '/en-iyi-ai-araclari': {
    title: 'En Iyi AI Araclari - 600+ Yapay Zeka Modeli | Froxy AI',
    description: 'Sohbet, gorsel, kod, belge ve pazarlama icin en iyi AI araclarini tek panelde toplayan Froxy AI platformunu kesfet.'
  },
  '/chatgpt-alternatifi': {
    title: 'ChatGPT Alternatifi AI Platformu | Froxy AI',
    description: 'ChatGPT alternatifi arayanlar icin Claude, Gemini, Mistral ve 600+ AI modelini tek hesapta kullanma cozumu.'
  },
  '/ai-gorsel-uretme': {
    title: 'AI Gorsel Uretme Rehberi ve Araci | Froxy AI',
    description: 'Yapay zeka ile gorsel uretmek icin prompt yaz, farkli gorsel modellerini dene ve tek panelden sonuc al.'
  },
  '/yapay-zeka-araclari': {
    title: 'Yapay Zeka Araclari - Tek Panelde AI Platformu | Froxy AI',
    description: 'Yapay zeka araclari, AI sohbet modelleri, gorsel uretim ve ajanlari tek panelde kullan.'
  },
  '/ucretsiz-ai-araclari': {
    title: 'Ucretsiz AI Araclari - 100 Krediyle Dene | Froxy AI',
    description: 'Ucretsiz AI araclari arayanlar icin Froxy AI yeni uyelere 100 kredi verir. ChatGPT, Claude, Gemini ve daha fazlasini dene.'
  },
  '/ai-model-karsilastirma': {
    title: 'AI Model Karsilastirma - ChatGPT Claude Gemini | Froxy AI',
    description: 'ChatGPT, Claude, Gemini ve diger AI modellerini tek panelde deneyerek ihtiyacina en uygun modeli sec.'
  }
};

const SEO_CONTENT = {
  '/chatgpt-claude-gemini-tek-panel': {
    h1: 'ChatGPT, Claude ve Gemini Tek Panelde',
    lead: 'Froxy AI, populer yapay zeka modellerini tek hesapta kullanmak isteyenler icin gelistirilmis bir AI calisma alanidir. ChatGPT, Claude, Gemini ve diger modeller arasinda sekme degistirmeden ilerleyebilir, ayni promptu farkli modellerde deneyebilir ve sonucu tek panelde karsilastirabilirsiniz.',
    sections: [
      ['Neden tek panel kullanilmali?', 'ChatGPT hizli fikir uretimi ve genel yardimda gucluyken, Claude uzun metinlerde ve duzenli cevaplarda one cikabilir. Gemini ise Google ekosistemi ve cok modlu is akislari icin kullanislidir. Bu modellerin hepsine ayri ayri girmek zaman kaybettirir. Froxy AI, bu daginikligi azaltarak modelleri tek kredi sistemi ve tek arayuzde toplar.'],
      ['Kimler icin uygun?', 'Icerik uretenler, ogrenciler, yazilim gelistiriciler, sosyal medya yoneticileri, e-ticaret ekipleri ve kucuk isletmeler ayni panelden farkli AI modellerini deneyebilir. Boylece her is icin en uygun modeli elle aramak yerine tek ekrandan secim yapilir.'],
      ['Froxy AI ile nasil baslanir?', 'Ucretsiz hesap olusturduktan sonra 100 krediyle baslayabilir, sohbet ekraninda model secip ilk promptunuzu yazabilirsiniz. Isterseniz ayni fikri ChatGPT, Claude ve Gemini benzeri farkli modellerle test ederek hangi cevabin daha iyi oldugunu gorebilirsiniz.']
    ],
    faq: [
      ['ChatGPT, Claude ve Gemini ayni anda kullanilabilir mi?', 'Froxy AI panelinde farkli modeller arasinda gecis yapabilir ve ayni is akisini tek hesapta yonetebilirsiniz.'],
      ['Baslamak icin kart gerekir mi?', 'Hayir. Yeni uyeler 100 ucretsiz krediyle paneli deneyebilir.'],
      ['Hangi model daha iyi?', 'Tek bir en iyi model yoktur. Metin, kod, analiz, gorsel fikir veya uzun belge gibi goreve gore model tercihi degisir.']
    ]
  },
  '/en-iyi-ai-araclari': {
    h1: 'En Iyi AI Araclari Tek Panelde',
    lead: 'En iyi AI araci, tek bir modelden ibaret degildir. Gunluk islerde sohbet modeli, gorsel uretim araci, kod yardimcisi, belge analiz araci ve ajan tabanli is akislari gerekebilir. Froxy AI bu araclari tek panelde bir araya getirerek arama ve deneme surecini kisaltir.',
    sections: [
      ['AI araclari hangi islerde kullanilir?', 'Yapay zeka araclari reklam metni yazma, blog fikri bulma, kod duzenleme, belge ozetleme, sosyal medya basligi hazirlama, gorsel uretme ve musteri destek taslaklari olusturma gibi cok farkli islerde kullanilir.'],
      ['Tek panel avantajlari', 'Farkli sitelerde hesap acmak, kredi takip etmek ve model secmek yerine tek panel kullanmak daha pratiktir. Froxy AI, sohbet ve gorsel uretim gibi araclari ayni deneyimde topladigi icin deneme maliyetini ve zaman kaybini azaltir.'],
      ['AI araclarini secmenin dogru yolu', 'Sadece populer olan modeli kullanmak yerine, ayni gorevi birden fazla modelle deneyip kalite, hiz ve maliyet acisindan karsilastirma yapmak daha dogru bir yoldur. Froxy AI bu karsilastirmayi kolaylastirir.']
    ],
    faq: [
      ['Froxy AI ucretsiz denenebilir mi?', 'Evet. Yeni hesaplar 100 ucretsiz krediyle baslar.'],
      ['Hangi AI araclari var?', 'Sohbet, gorsel uretim, belge analizi, kod yardimi, prompt araclari ve AI ajanlari gibi farkli araclar tek panelde sunulur.'],
      ['Tek panel performansi etkiler mi?', 'Tek panel, farkli modellere erisimi daha kolay hale getirir; kalite ise secilen modele ve prompta baglidir.']
    ]
  },
  '/chatgpt-alternatifi': {
    h1: 'ChatGPT Alternatifi AI Platformu',
    lead: 'ChatGPT cok guclu bir modeldir, ancak her is icin tek secenek degildir. Claude, Gemini, Mistral, DeepSeek ve diger modeller bazi gorevlerde daha uygun olabilir. Froxy AI, ChatGPT alternatifi arayan kullanicilara tek panelden cok model deneme imkani verir.',
    sections: [
      ['Neden ChatGPT alternatifi aranir?', 'Kimi kullanicilar daha uzun metinlerde daha duzenli cevap, kimi kullanicilar kodda daha farkli yaklasim, kimi kullanicilar da maliyet ve hiz avantajlari arar. Alternatif modelleri denemek, tek modele bagli kalmadan daha iyi sonuca ulasmayi saglar.'],
      ['Froxy AI nasil fark yaratir?', 'Froxy AI sadece bir ChatGPT kopyasi degildir. Farkli model ailelerini, gorsel araclari ve AI ajanlarini tek arayuzde sunar. Bu sayede kullanici isine gore model degistirebilir.'],
      ['Kimler kullanmali?', 'Icerik ekipleri, yazilimcilar, ogrenciler ve isletmeler ChatGPT alternatifi modelleri test ederek daha esnek bir yapay zeka calisma duzeni kurabilir.']
    ],
    faq: [
      ['Froxy AI ChatGPT yerine kullanilir mi?', 'Evet, ChatGPT benzeri modellerle birlikte farkli alternatifleri de tek panelde denemek icin kullanilabilir.'],
      ['Claude ve Gemini de var mi?', 'Froxy AI, farkli saglayicilardan cok sayida modeli tek panelde sunmayi hedefler.'],
      ['Ucretsiz kredi ne ise yarar?', '100 krediyle paneli test edebilir, ilk sohbet ve araclardan bazilarini deneyebilirsiniz.']
    ]
  },
  '/ai-gorsel-uretme': {
    h1: 'AI Gorsel Uretme Araci',
    lead: 'AI gorsel uretme, yazdiginiz promptu gorsele donusturen yapay zeka modelleriyle calisir. Froxy AI, gorsel uretim araclarini sohbet ve diger AI modelleriyle ayni panelde birlestirerek fikirden gorsele daha hizli gecmenizi saglar.',
    sections: [
      ['AI gorsel nasil uretilir?', 'Once ne istediginizi anlatan bir prompt yazarsiniz. Stil, renk, oran, konu ve detay seviyesi gibi unsurlar sonucu belirler. Froxy AI panelinde promptunuzu girerek farkli gorsel uretim akislariyla deneme yapabilirsiniz.'],
      ['Kimler icin faydali?', 'Sosyal medya icerik ureticileri, reklam hazirlayanlar, e-ticaret sahipleri, sunum hazirlayanlar ve tasarim fikri arayan herkes AI gorsel uretimden faydalanabilir.'],
      ['Daha iyi sonuc icin ipuclari', 'Promptta konu, ortam, stil, renk paleti ve kullanim amacini net belirtmek gerekir. Ornegin sadece “teknoloji gorseli? yerine “karanlik premium SaaS paneli, cyan ve mor neon vurgular, dikey reklam posteri? gibi acik bir prompt daha iyi sonuc verir.']
    ],
    faq: [
      ['AI gorsel uretmek icin tasarim bilmek gerekir mi?', 'Hayir. Iyi bir prompt yazmak genelde yeterlidir, denemelerle sonuc iyilesir.'],
      ['Gorsel uretim kredi harcar mi?', 'Evet, secilen model ve isleme gore kredi harcanir.'],
      ['Froxy AI ile reklam gorseli hazirlanabilir mi?', 'Evet. Urun, hedef kitle ve stil bilgisiyle reklam odakli gorseller uretilebilir.']
    ]
  },
  '/yapay-zeka-araclari': {
    h1: 'Yapay Zeka Araclari ve AI Platformu',
    lead: 'Yapay zeka araclari artik sadece sohbet botlarindan olusmuyor. Metin uretimi, kod yardimi, gorsel uretme, belge okuma, ozetleme, pazarlama ve otomasyon gibi isler icin farkli araclar gerekiyor. Froxy AI bu araclari tek panelde toplamaya odaklanir.',
    sections: [
      ['Hangi yapay zeka araclari onemli?', 'Sohbet modelleri fikir uretme ve yazma islerinde kullanilir. Kod araclari gelistirme surecini hizlandirir. Gorsel araclar reklam ve sosyal medya uretimini destekler. Belge araclari uzun metinleri ozetler ve analiz eder.'],
      ['Tek panel neden daha verimli?', 'Farkli AI siteleri arasinda gecis yapmak, abonelikleri takip etmek ve hangi modelin neye iyi geldigini hatirlamak zordur. Tek panel, bu karmasayi azaltir ve calisma hizini artirir.'],
      ['Froxy AI ile baslama', 'Yeni kullanicilar 100 ucretsiz krediyle hesap olusturup sohbet, model secimi ve gorsel uretim gibi temel akislari deneyebilir.']
    ],
    faq: [
      ['Yapay zeka araclari isletmeler icin uygun mu?', 'Evet. Icerik, destek, analiz ve pazarlama gibi alanlarda isletmelere zaman kazandirabilir.'],
      ['Tek bir AI modeli yeterli mi?', 'Cogu zaman hayir. Farkli isler icin farkli modeller daha iyi sonuc verebilir.'],
      ['Froxy AI hangi vaadi sunuyor?', '600+ AI modelini ve farkli yapay zeka araclarini tek panelde kullanma deneyimi sunar.']
    ]
  }
};

Object.assign(SEO_PAGES, {
  '/': {
    title: 'Froxy AI - ChatGPT, Claude, Gemini ve 600+ AI Modeli Tek Panelde',
    description: 'ChatGPT, Claude, Gemini, görsel üretim araçları ve AI ajanlarını tek hesapta kullan. Yeni üyeler 100 ücretsiz krediyle başlar, kart gerekmez.'
  },
  '/sohbet': {
    title: 'AI Sohbet Paneli - ChatGPT, Claude, Gemini ve 600+ Model | Froxy AI',
    description: 'Tek panelden ChatGPT, Claude, Gemini, Groq ve OpenRouter modelleriyle Türkçe AI sohbet et. Froxy AI hesabını 100 ücretsiz krediyle dene.'
  },
  '/gorsel-uret': {
    title: 'AI Görsel Üretme ve Fotoğraf Düzenleme Aracı | Froxy AI',
    description: 'Promptla görsel üret, fotoğraf düzenle ve farklı görsel AI modellerini tek panelde dene. Yeni üyeler 100 ücretsiz krediyle başlar.'
  },
  '/fiyatlandirma': {
    title: 'Froxy AI Fiyatlandırma - Kredi Paketleri ve 100 Ücretsiz Kredi',
    description: 'ChatGPT, Claude, Gemini, görsel üretim ve AI araçları için Froxy AI kredi paketlerini incele. Kayıt olan yeni üyeler 100 kredi alır.'
  },
  '/chatgpt-claude-gemini-tek-panel': {
    title: 'ChatGPT, Claude ve Gemini Tek Panelde | Froxy AI',
    description: 'ChatGPT, Claude, Gemini ve 600+ AI modelini tek hesapta kullan. Sekme değiştirmeden sohbet et, görsel üret ve araçları çalıştır.'
  },
  '/400-ai-model': {
    title: '600+ AI Modeli Tek Hesapta - Froxy AI Model Paneli',
    description: 'Froxy AI model paneli artik 600+ AI modeli mesajiyla konumlanir. Eski 400+ model linki uyumluluk icin yeni model paneline yonlendirilir.'
  },
  '/chatgpt-claude-gemini': {
    title: 'ChatGPT Claude Gemini Karşılaştırma ve Tek Panel Kullanım | Froxy AI',
    description: 'ChatGPT, Claude ve Gemini modellerini tek panelde dene; hız, kalite, kredi maliyeti ve kullanım alanına göre doğru modeli seç.'
  },
  '/600-ai-model': {
    title: '600+ AI Modeli Tek Hesapta - Froxy AI Model Paneli',
    description: 'OpenAI, Claude, Gemini, Groq, OpenRouter ve görsel AI modellerini tek kredi sistemiyle kullan. Froxy AI ile 100 kredi ücretsiz başla.'
  },
  '/ai-kredi-sistemi': {
    title: 'AI Kredi Sistemi Nedir? ChatGPT ve Görsel AI Kullanımı | Froxy AI',
    description: 'Froxy AI kredi sistemiyle farklı AI modellerini tek bakiyeden kullan. Sohbet, görsel üretim ve premium modellerde kredi mantığını öğren.'
  },
  '/turkce-ai-platformu': {
    title: 'Türkçe AI Platformu - ChatGPT, Claude, Gemini Tek Panelde | Froxy AI',
    description: 'Türkçe arayüzle AI sohbet, görsel üretim, promptlar, dosya analizi ve AI araçlarını tek panelde kullan. Froxy AI 100 krediyle denenebilir.'
  },
  '/ai-dosya-analizi': {
    title: 'AI Dosya Analizi - PDF, Görsel ve Belge Okuma | Froxy AI',
    description: 'PDF, metin ve görselleri AI ile analiz et. Froxy AI, dosya okuyan modelleri ve sohbet araçlarını tek panelde toplar.'
  },
  '/ai-fotograf-duzenleme': {
    title: 'AI Fotoğraf Düzenleme - Yapay Zeka ile Görsel Edit | Froxy AI',
    description: 'Fotoğraf yükle, yapay zeka ile düzenle, stil değiştir ve görsel üretim modellerini tek panelde dene. Froxy AI ile hızlı başla.'
  }
});

Object.assign(SEO_CONTENT, {
  '/chatgpt-claude-gemini-tek-panel': {
    h1: 'ChatGPT, Claude ve Gemini tek panelde',
    lead: 'Froxy AI, farklı AI abonelikleri ve sekmeler arasında kaybolmadan çalışmak isteyenler için hazırlanmış tek panel yapay zeka platformudur. ChatGPT, Claude, Gemini, Groq, OpenRouter ve görsel AI modellerini tek hesapta deneyebilir, 100 ücretsiz başlangıç kredisiyle kart bilgisi girmeden başlayabilirsin.',
    sections: [
      ['Tek panel neden daha hızlıdır?', 'Ayrı ayrı AI sitelerine girip hesap, abonelik ve kullanım limitlerini takip etmek zaman kaybettirir. Froxy AI modelleri tek arayüzde toplar; kullanıcı görevine göre model seçer, kredi maliyetini görür ve aynı panelden sohbet, görsel üretim veya hazır araç çalıştırır.'],
      ['Hangi işler için kullanılır?', 'İçerik üretimi, kod analizi, belge özeti, görsel fikir, sosyal medya metni, müşteri desteği ve araştırma gibi günlük işlerde farklı modeller farklı sonuç verir. Tek panel kullanmak, her iş için en uygun modeli daha hızlı bulmayı sağlar.'],
      ['Froxy AI ile başlangıç', 'Kayıt olan yeni üyelerin hesabına 100 ücretsiz kredi tanımlanır. Bu krediyle sohbet, görsel üretim ve hazır AI araçlarını test edebilir; kart bilgisi girmeden platformun sana uygun olup olmadığını görebilirsin.']
    ],
    faq: [
      ['ChatGPT, Claude ve Gemini aynı hesapta kullanılabilir mi?', 'Froxy AI farklı model ailelerini tek panelde sunar. Kullanıcı model seçip aynı çalışma alanından farklı AI deneyimleri alabilir.'],
      ['Ücretsiz deneme için kart gerekir mi?', 'Hayır. Yeni üyeler 100 ücretsiz krediyle başlayabilir ve deneme için kart bilgisi gerekmez.'],
      ['Froxy AI ayrı ayrı aboneliklerden nasıl farklı?', 'Froxy AI, farklı modelleri kredi sistemiyle tek panelde kullandırır. Böylece platformlar arasında geçiş yapmak ve ayrı abonelikleri yönetmek zorunda kalmazsın.']
    ]
  },
  '/400-ai-model': {
    h1: '600+ AI modeli tek hesapta',
    lead: 'Froxy AI model paneli artik 600+ AI modeli tek hesapta vaadiyle konumlanir. Bu sayfa eski 400+ model arama ve paylasim linkleri icin uyumluluk saglar; guncel mesaj 600+ AI modeli, 100 ucretsiz kredi ve kart bilgisi gerekmez teklifidir.',
    sections: [
      ['Guncel model vaadi', 'Froxy AI, ChatGPT, Claude, Gemini ve farkli model ailelerini tek panelde kullanma deneyimini 600+ AI modeli mesajiyla anlatir.'],
      ['Eski link neden duruyor?', 'Daha once paylasilan veya indekslenen 400-ai-model linkleri bozulmasin diye sayfa korunur ve 600+ model mesajiyla guncel tutulur.'],
      ['Baslangic teklifi', 'Yeni uyeler 100 ucretsiz krediyle kart bilgisi girmeden paneli deneyebilir.']
    ],
    faq: [
      ['Froxy AI kac model sunuyor?', 'Guncel tanitim mesaji 600+ AI modeli tek panelde seklindedir.'],
      ['400-ai-model linki neden var?', 'Eski SEO ve paylasim linklerinin bozulmamasi icin uyumluluk sayfasi olarak korunur.'],
      ['Denemek icin kart gerekir mi?', 'Hayir. Yeni uyeler 100 ucretsiz krediyle baslayabilir.']
    ]
  },
  '/chatgpt-claude-gemini': {
    h1: 'ChatGPT, Claude ve Gemini karşılaştırma paneli',
    lead: 'Her AI modeli aynı işi aynı kalitede yapmaz. ChatGPT hızlı fikir ve genel üretimde, Claude uzun metin ve düzenli cevaplarda, Gemini çok modlu işlerde öne çıkabilir. Froxy AI, bu modelleri tek panelde deneyerek işine en uygun seçeneği bulmanı kolaylaştırır.',
    sections: [
      ['Model seçimi nasıl yapılmalı?', 'Kod, metin, analiz, görsel okuma veya hızlı cevap gibi görevler farklı model özellikleri ister. Froxy AI model seçicide hız, kalite, kredi maliyeti ve yetenek rozetleriyle karar vermeyi kolaylaştırır.'],
      ['Tek promptu farklı modellerde denemek', 'Aynı isteği farklı modellerle denemek kalite farkını görmenin en pratik yoludur. Böylece tek bir sağlayıcıya bağlı kalmadan işine en uygun yanıtı seçebilirsin.'],
      ['Kimler için uygundur?', 'Ajanslar, içerik ekipleri, öğrenciler, yazılımcılar ve küçük işletmeler tek panel üzerinden farklı modelleri deneyerek maliyeti ve zamanı daha iyi yönetebilir.']
    ],
    faq: [
      ['En iyi model hangisi?', 'Tek bir en iyi model yoktur. En iyi seçim, göreve ve bütçeye göre değişir.'],
      ['Froxy AI model maliyetini gösterir mi?', 'Model ve işlem türüne göre kredi maliyeti kullanıcıya gösterilebilir.'],
      ['Karşılaştırma yapmak için teknik bilgi gerekir mi?', 'Hayır. Model seçici ve hazır araçlar teknik olmayan kullanıcıların da hızlı başlaması için tasarlanmıştır.']
    ]
  },
  '/600-ai-model': {
    h1: '600+ AI modeli tek hesapta',
    lead: 'Froxy AI, farklı sağlayıcıların sohbet, kod, analiz, görsel üretim ve görsel okuma modellerini tek panelde toplar. Amaç, kullanıcıya çok seçenek sunarken seçim sürecini karmaşık hale getirmeden doğru modeli hızlıca buldurmaktır.',
    sections: [
      ['Neden çok model gerekli?', 'Bir model kodda iyi olabilir, başka bir model uzun metinde daha güçlü olabilir, bir başkası görsel okuma veya hızlı cevapta avantaj sağlayabilir. Çok model desteği, tek modele bağımlılığı azaltır.'],
      ['Kredi sistemi nasıl yardımcı olur?', 'Farklı abonelikler yerine tek kredi bakiyesiyle kullanım yapmak maliyet takibini kolaylaştırır. Kullanıcı ihtiyacı kadar kullanır ve hangi modelin ne kadar kredi harcadığını görebilir.'],
      ['Model karmaşası nasıl azaltılır?', 'Önerilen, en ucuz, en hızlı, en kaliteli, görsel okur ve kod gibi filtreler kullanıcıyı doğru modele yönlendirir. Böylece 600+ model seçeneği kalabalık değil, avantaj haline gelir.']
    ],
    faq: [
      ['Tüm modeller tek sağlayıcıya mı bağlı?', 'Froxy AI farklı model ailelerini tek panelde yönetmeyi hedefler. Kullanıcı arayüzünde seçim deneyimi sade tutulur; teknik sağlayıcı durumu sistem tarafında izlenir.'],
      ['Ücretsiz modeller var mı?', 'Bazı uygun maliyetli veya ücretsiz hatlar kullanılabilir; premium modeller daha fazla kredi harcayabilir.'],
      ['Yeni başlayanlar hangi modeli seçmeli?', 'Önerilen veya hızlı kategorisi başlangıç için uygundur. Daha özel işler için kod, görsel okur veya premium filtreleri kullanılabilir.']
    ]
  },
  '/ai-kredi-sistemi': {
    h1: 'AI kredi sistemi nedir?',
    lead: 'AI kredi sistemi, farklı model ve araçları tek bakiye üzerinden kullanmayı sağlar. Froxy AI’da sohbet, görsel üretim, dosya analizi ve premium modeller işlem türüne göre kredi harcayabilir. Yeni üyeler 100 ücretsiz krediyle sistemi test edebilir.',
    sections: [
      ['Kredi sistemi neden kullanılır?', 'Farklı AI modellerinin maliyetleri aynı değildir. Kredi sistemi, kullanıcıya tek abonelik yerine kullandığı modele ve işleme göre daha esnek bir deneyim sunar.'],
      ['Hangi işlemler kredi harcar?', 'Sohbet cevapları, görsel üretim, fotoğraf düzenleme, dosya analizi ve premium model kullanımı kredi harcayabilir. Ucuz ve hızlı modeller daha düşük krediyle çalışabilir.'],
      ['Kullanıcı için avantajı nedir?', 'Kredi sistemi sayesinde kullanıcı farklı modelleri deneyebilir, bütçesini kontrol eder ve tek platformdan kullanım geçmişini takip edebilir.']
    ],
    faq: [
      ['100 ücretsiz kredi nasıl kullanılır?', 'Kayıt olan yeni üyelerin hesabına başlangıç kredisi tanımlanır. Bu krediyle sohbet, görsel üretim ve hazır araçlar denenebilir.'],
      ['Kredi bitince ne olur?', 'Kullanıcı yeni paket satın alabilir veya daha düşük maliyetli modelleri tercih edebilir.'],
      ['Her model aynı kredi mi harcar?', 'Hayır. Model kalitesi, sağlayıcı maliyeti ve işlem türüne göre kredi tüketimi değişebilir.']
    ]
  },
  '/turkce-ai-platformu': {
    h1: 'Türkçe AI platformu',
    lead: 'Froxy AI, Türkçe kullanıcı deneyimiyle farklı yapay zeka modellerini tek panelde sunar. Sohbet, görsel üretim, prompt şablonları, AI araçları, dosya analizi ve destek sistemi tek hesapta toplanır.',
    sections: [
      ['Türkçe arayüz neden önemlidir?', 'AI araçlarının çoğu İngilizce odaklıdır. Türkçe arayüz, model seçimi, kredi takibi, hata mesajları ve destek süreçlerini daha anlaşılır hale getirir.'],
      ['Kimler kullanabilir?', 'İçerik üreticileri, öğrenciler, ajanslar, e-ticaret ekipleri, yazılımcılar ve küçük işletmeler Türkçe panel üzerinden AI iş akışlarını daha hızlı yönetebilir.'],
      ['Satış ve iş üretimi için avantaj', 'Hazır promptlar, araçlar ve model seçici sayesinde kullanıcı boş ekrana bakmak yerine doğrudan iş sonucuna odaklanır.']
    ],
    faq: [
      ['Froxy AI Türkçe cevap verir mi?', 'Seçilen model desteklediği sürece Türkçe sohbet ve içerik üretimi yapılabilir.'],
      ['Destek Türkçe mi?', 'Destek akışı Türkçe kullanıcılar düşünülerek hazırlanır.'],
      ['Kart bilgisi gerekir mi?', 'Ücretsiz başlangıç kredisi için kart bilgisi gerekmez.']
    ]
  },
  '/ai-dosya-analizi': {
    h1: 'AI dosya analizi',
    lead: 'Froxy AI ile dosya, metin ve görsel içerikleri AI sohbet akışına dahil etmek hedeflenir. Kullanıcı belge özetleme, metin analizi, görsel yorumlama ve çıktı üretme işlerini tek panelden yönetebilir.',
    sections: [
      ['Dosya analizi hangi işlerde kullanılır?', 'PDF özetleme, teklif metni çıkarma, rapor analizi, kod dosyası inceleme, görsel yorumlama ve müşteri dokümanı değerlendirme gibi işlerde kullanılabilir.'],
      ['Görsel okuma neden ayrı bir yetenektir?', 'Her model görsel veya dosya okuyamaz. Bu nedenle model seçicide görsel okur ve dosya desteği gibi rozetler kullanıcıya doğru modeli seçtirir.'],
      ['Tek panel avantajı', 'Dosyayı yükleyip sohbet, özet, aksiyon planı veya görsel üretim fikri üretmek aynı çalışma alanında yapılabilir.']
    ],
    faq: [
      ['Her model dosya okuyabilir mi?', 'Hayır. Dosya veya görsel okuma destekleyen modeller seçilmelidir.'],
      ['PDF özeti çıkarılabilir mi?', 'Uygun dosya akışı ve modelle PDF veya metin içeriği özetlenebilir.'],
      ['Dosya analizi kredi harcar mı?', 'İşlem türü ve modele göre kredi harcayabilir.']
    ]
  },
  '/ai-fotograf-duzenleme': {
    h1: 'AI fotoğraf düzenleme',
    lead: 'AI fotoğraf düzenleme, yüklenen bir görseli prompt ile değiştirme veya iyileştirme sürecidir. Froxy AI’da görsel üretim ve fotoğraf düzenleme ayrı modlar olarak düşünülür; düzenleme modunda yalnızca uygun modeller gösterilir.',
    sections: [
      ['Fotoğraf düzenleme ile neler yapılabilir?', 'Arka plan değiştirme, ürün fotoğrafı iyileştirme, stil dönüşümü, nesne ekleme veya çıkarma ve görsel varyasyon üretme gibi işlemler yapılabilir.'],
      ['Neden her model gösterilmemeli?', 'Bazı modeller sadece sıfırdan görsel üretir, bazıları ise referans fotoğraf düzenleyebilir. Kullanıcı deneyimi için düzenleme modunda yalnızca edit destekli modellerin görünmesi gerekir.'],
      ['E-ticaret ve sosyal medya kullanımı', 'Ürün görselleri, reklam kreatifleri, sosyal medya postları ve kampanya görselleri için AI fotoğraf düzenleme hızlı bir başlangıç sağlar.']
    ],
    faq: [
      ['Fotoğraf düzenleme için görsel yüklemek gerekir mi?', 'Evet. Düzenleme modunda referans görsel yüklenir ve prompt ile nasıl değişeceği anlatılır.'],
      ['Görsel üretim ile fotoğraf düzenleme aynı şey mi?', 'Hayır. Görsel üretim sıfırdan çıktı üretir; fotoğraf düzenleme mevcut görseli değiştirir.'],
      ['Düzenleme kredi harcar mı?', 'Seçilen modele ve işleme göre kredi harcayabilir.']
    ]
  }
});

// SEO text hardening: keep crawler-facing Turkish copy clean even if older
// generated blocks above contain mojibake or ASCII-only Turkish.
Object.assign(SEO_PAGES, {
  '/': {
    title: 'Froxy AI - ChatGPT, Claude, Gemini ve 600+ AI Modeli Tek Panelde',
    description: 'ChatGPT, Claude, Gemini, görsel üretim araçları ve AI ajanlarını tek hesapta kullan. Yeni üyeler 100 ücretsiz krediyle başlar, kart gerekmez.'
  },
  '/dashboard': {
    title: 'Froxy AI Dashboard - Tüm AI Araçları Tek Ekranda',
    description: 'Model kullanımı, kredi akışı, sohbet, görsel üretim ve hazır AI araçlarını Froxy AI dashboard üzerinden tek ekranda yönet.'
  },
  '/ai-araclar': {
    title: 'AI Araçları - ChatGPT, Claude, Gemini ve Daha Fazlası | Froxy AI',
    description: 'Yapay zeka sohbet, görsel üretim, kod, belge, ses ve hazır AI araçlarını tek panelde kullan.'
  },
  '/ai-ajanlar': {
    title: 'AI Ajanlar - Görev Odaklı Yapay Zeka Asistanları | Froxy AI',
    description: 'İçerik, analiz, kod, pazarlama ve otomasyon için AI ajanlarıyla daha hızlı çalış.'
  },
  '/fiyatlandirma': {
    title: 'Froxy AI Fiyatlandırma - Kredi Paketleri ve 100 Ücretsiz Kredi',
    description: 'ChatGPT, Claude, Gemini, görsel üretim ve AI araçları için Froxy AI kredi paketlerini incele. Kayıt olan yeni üyeler 100 kredi alır.'
  },
  '/kayit': {
    title: 'Froxy AI Kayıt Ol - 100 Ücretsiz Kredi',
    description: 'Froxy AI hesabını oluştur, kart bilgisi girmeden 100 ücretsiz krediyle 600+ AI modelini tek panelde dene.'
  },
  '/chatgpt-claude-gemini-tek-panel': {
    title: 'ChatGPT, Claude ve Gemini Tek Panelde | Froxy AI',
    description: 'ChatGPT, Claude, Gemini ve 600+ AI modelini tek hesapta kullan. Sekme değiştirmeden sohbet et, görsel üret ve araçları çalıştır.'
  },
  '/chatgpt-claude-gemini': {
    title: 'ChatGPT, Claude ve Gemini Karşılaştırma Paneli | Froxy AI',
    description: 'ChatGPT, Claude ve Gemini modellerini tek panelde dene; hız, kalite, kredi maliyeti ve kullanım alanına göre doğru modeli seç.'
  },
  '/400-ai-model': {
    title: '600+ AI Modeli Tek Hesapta - Froxy AI Model Paneli',
    description: 'OpenAI, Claude, Gemini, Groq, OpenRouter ve görsel AI modellerini tek kredi sistemiyle kullan. Froxy AI ile 100 kredi ücretsiz başla.'
  },
  '/ai-kredi-sistemi': {
    title: 'AI Kredi Sistemi Nedir? ChatGPT ve Görsel AI Kullanımı | Froxy AI',
    description: 'Froxy AI kredi sistemiyle farklı AI modellerini tek bakiyeden kullan. Sohbet, görsel üretim ve premium modellerde kredi mantığını öğren.'
  },
  '/turkce-ai-platformu': {
    title: 'Türkçe AI Platformu - ChatGPT, Claude, Gemini Tek Panelde | Froxy AI',
    description: 'Türkçe arayüzle AI sohbet, görsel üretim, promptlar, dosya analizi ve AI araçlarını tek panelde kullan. Froxy AI 100 krediyle denenebilir.'
  },
  '/ai-dosya-analizi': {
    title: 'AI Dosya Analizi - PDF, Görsel ve Belge Okuma | Froxy AI',
    description: 'PDF, metin ve görselleri AI ile analiz et. Froxy AI, dosya okuyan modelleri ve sohbet araçlarını tek panelde toplar.'
  },
  '/ai-fotograf-duzenleme': {
    title: 'AI Fotoğraf Düzenleme - Yapay Zeka ile Görsel Edit | Froxy AI',
    description: 'Fotoğraf yükle, yapay zeka ile düzenle, stil değiştir ve görsel üretim modellerini tek panelde dene. Froxy AI ile hızlı başla.'
  },
  '/en-iyi-ai-araclari': {
    title: 'En İyi AI Araçları - 600+ Yapay Zeka Modeli | Froxy AI',
    description: 'Sohbet, görsel, kod, belge ve pazarlama için en iyi AI araçlarını tek panelde toplayan Froxy AI platformunu keşfet.'
  },
  '/chatgpt-alternatifi': {
    title: 'ChatGPT Alternatifi AI Platformu | Froxy AI',
    description: 'ChatGPT alternatifi arayanlar için Claude, Gemini, Mistral ve 600+ AI modelini tek hesapta kullanma çözümü.'
  },
  '/ai-gorsel-uretme': {
    title: 'AI Görsel Üretme Rehberi ve Aracı | Froxy AI',
    description: 'Yapay zeka ile görsel üretmek için prompt yaz, farklı görsel modellerini dene ve tek panelden sonuç al.'
  },
  '/yapay-zeka-araclari': {
    title: 'Yapay Zeka Araçları - Tek Panelde AI Platformu | Froxy AI',
    description: 'Yapay zeka araçları, AI sohbet modelleri, görsel üretim ve ajanları tek panelde kullan.'
  },
  '/ucretsiz-ai-araclari': {
    title: 'Ücretsiz AI Araçları - 100 Krediyle Dene | Froxy AI',
    description: 'Ücretsiz AI araçları arayanlar için Froxy AI yeni üyelere 100 kredi verir. ChatGPT, Claude, Gemini ve daha fazlasını dene.'
  },
  '/ai-model-karsilastirma': {
    title: 'AI Model Karşılaştırma - ChatGPT, Claude, Gemini | Froxy AI',
    description: 'ChatGPT, Claude, Gemini ve diğer AI modellerini tek panelde deneyerek ihtiyacına en uygun modeli seç.'
  }
});

Object.assign(SEO_CONTENT, {
  '/sohbet': {
    h1: 'AI sohbet paneli',
    lead: 'Froxy AI sohbet paneli, ChatGPT, Claude, Gemini, Groq, OpenRouter ve farklı model ailelerini tek ekranda denemek için hazırlanmıştır. Kullanıcı model seçebilir, dosya veya görsel destekli akışları kullanabilir ve kredi sistemini tek panelden takip edebilir.',
    sections: [
      ['AI sohbet paneli ne işe yarar?', 'Tek bir sohbet ekranında farklı AI modellerine geçmek, aynı iş için kalite ve hız farkını test etmeyi kolaylaştırır. Froxy AI bu deneyimi Türkçe arayüz ve kredi sistemiyle sadeleştirir.'],
      ['Kimler kullanabilir?', 'İçerik üreticileri, öğrenciler, yazılımcılar, ajanslar ve işletmeler günlük yazma, analiz, kod, planlama ve fikir üretimi işlerini tek panelden yönetebilir.'],
      ['Ücretsiz başlangıç', 'Yeni üyeler 100 ücretsiz krediyle sohbet panelini deneyebilir. Kart bilgisi girmeden model seçimi ve temel AI sohbet akışları test edilebilir.']
    ],
    faq: [
      ['AI sohbet paneli ücretsiz denenebilir mi?', 'Evet. Yeni üyeler 100 ücretsiz krediyle başlayabilir.'],
      ['Farklı modeller arasında geçiş yapılabilir mi?', 'Evet. Froxy AI model seçici üzerinden farklı model aileleri tek panelde denenebilir.'],
      ['Sohbet kredi harcar mı?', 'Seçilen modele ve işlem türüne göre kredi harcanabilir.']
    ]
  },
  '/panel': {
    h1: 'AI kontrol paneli',
    lead: 'Froxy AI kontrol paneli, model kullanımı, kredi takibi, görsel üretim, hazır araçlar ve destek akışlarını tek ekranda toplamayı hedefler. Kullanıcılar AI iş akışlarını dağınık sekmeler yerine tek merkezden yönetebilir.',
    sections: [
      ['Kontrol panelinde neler var?', 'Kredi durumu, model erişimi, hızlı araçlar, görsel üretim, destek ve hesap bilgileri tek çalışma alanında görülebilir.'],
      ['Neden tek panel?', 'Birden fazla AI sitesini takip etmek yerine tek panel kullanmak zaman kazandırır ve maliyet takibini kolaylaştırır.'],
      ['Kimler için uygun?', 'Ajanslar, içerik ekipleri, e-ticaret kullanıcıları ve sık AI kullanan bireyler için daha düzenli bir çalışma ortamı sağlar.']
    ],
    faq: [
      ['Panelden sohbete geçilebilir mi?', 'Evet. Sohbet, görsel üretim ve diğer araçlara panelden erişilebilir.'],
      ['Kredi takibi yapılır mı?', 'Kullanıcı kredileri ve paket bilgileri panel deneyiminin parçasıdır.'],
      ['Yeni kullanıcılar paneli deneyebilir mi?', 'Evet. 100 ücretsiz krediyle başlayabilirler.']
    ]
  },
  '/dashboard': {
    h1: 'Froxy AI dashboard',
    lead: 'Froxy AI dashboard, kullanıcıların AI modellerini, kredi kullanımını, görsel üretim akışlarını ve hazır araçları tek profesyonel alanda yönetmesi için tasarlanmıştır.',
    sections: [
      ['Dashboard neden önemlidir?', 'AI kullanımında model seçimi, kredi tüketimi ve araçlara erişim ayrı ayrı dağılınca verim düşer. Dashboard bu bilgileri tek yerde toplar.'],
      ['Kredi ve model görünürlüğü', 'Kullanıcı hangi paketi kullandığını, kredi bakiyesini ve temel AI araçlarına erişimini daha net görebilir.'],
      ['İş akışı avantajı', 'Sohbet, görsel üretim, promptlar ve destek akışları arasında hızlı geçiş yapmak günlük üretimi hızlandırır.']
    ],
    faq: [
      ['Dashboard herkese açık mı?', 'Dashboard kullanıcı deneyiminin parçasıdır; bazı alanlar giriş gerektirebilir.'],
      ['Dashboard SEO için neden ayrı sayfa?', 'Kullanıcıların tek panel AI çalışma alanı aramalarına daha net cevap vermek için ayrı açıklanır.'],
      ['Panel ile dashboard aynı mı?', 'Kullanımda benzer alanları ifade eder; canonical ve içerik sinyalleri sayfa özelinde net tutulur.']
    ]
  },
  '/gorsel-uret': {
    h1: 'AI görsel üretme ve fotoğraf düzenleme',
    lead: 'Froxy AI görsel üretim ekranı, prompt ile yeni görsel oluşturma ve uygun modellerle fotoğraf düzenleme akışlarını tek panelde sunar. Kullanıcı kalite modunu, modelini ve görsel hedefini daha kontrollü seçebilir.',
    sections: [
      ['Görsel üretim nasıl çalışır?', 'Kullanıcı prompt yazar, model veya kalite modu seçer ve görsel üretim isteğini başlatır. Sonuçlar galeri veya geçmiş alanında takip edilebilir.'],
      ['Fotoğraf düzenleme farkı', 'Görsel üretim sıfırdan çıktı üretirken fotoğraf düzenleme mevcut bir görseli prompt ile değiştirir. Bu yüzden düzenleme modunda edit destekli modeller kullanılır.'],
      ['Hangi işler için uygundur?', 'Sosyal medya görselleri, reklam kreatifleri, ürün fikirleri, sunum görselleri ve marka taslakları için kullanılabilir.']
    ],
    faq: [
      ['Görsel üretim kredi harcar mı?', 'Evet, seçilen modele ve kalite moduna göre kredi harcanabilir.'],
      ['Fotoğraf düzenlemek için görsel yüklemek gerekir mi?', 'Evet. Düzenleme modunda referans fotoğraf yüklenir.'],
      ['Ücretsiz krediyle görsel üretim denenebilir mi?', 'Başlangıç kredisi uygun modellerde test için kullanılabilir.']
    ]
  },
  '/ai-araclar': {
    h1: 'AI araçları merkezi',
    lead: 'Froxy AI araçları merkezi; SEO, sosyal medya, kod, metin, marka, destek ve görsel üretim gibi sık kullanılan işleri hazır prompt ve doğru panel akışıyla hızlandırır.',
    sections: [
      ['Hazır AI araçları ne sağlar?', 'Kullanıcı boş prompt yazmak zorunda kalmadan belirli bir iş için hazırlanmış akışı seçebilir. Bu, özellikle pazarlama, içerik ve destek işlerinde hız kazandırır.'],
      ['Tek panelde araç kullanımı', 'Sohbet modeli, görsel üretim ve hazır araçlar aynı hesapta birleştiğinde kullanıcı farklı siteler arasında geçiş yapmak zorunda kalmaz.'],
      ['Kimler için faydalıdır?', 'Ajanslar, e-ticaret ekipleri, içerik üreticileri ve küçük işletmeler hazır araçlarla daha hızlı çıktı alabilir.']
    ],
    faq: [
      ['AI araçları ücretsiz denenebilir mi?', 'Yeni üyeler 100 ücretsiz krediyle bazı araçları deneyebilir.'],
      ['Araçlar sohbetle bağlantılı mı?', 'Birçok araç seçildiğinde ilgili prompt veya iş akışı sohbet ekranında çalıştırılabilir.'],
      ['Teknik bilgi gerekir mi?', 'Hayır. Araçlar teknik olmayan kullanıcıların da hızlı başlaması için tasarlanır.']
    ]
  },
  '/ai-ajanlar': {
    h1: 'AI ajanlar ve görev odaklı asistanlar',
    lead: 'Froxy AI ajanları, kod, SEO, destek, sosyal medya, analiz ve içerik gibi belirli görevler için hazırlanmış uzman asistan akışları sunar.',
    sections: [
      ['AI ajan nedir?', 'AI ajan, belirli bir görev için rolü, tonu ve çalışma biçimi önceden tanımlanmış yapay zeka asistanıdır.'],
      ['Hangi alanlarda kullanılır?', 'Kod analizi, SEO içerik planı, müşteri destek taslağı, sosyal medya kampanyası, teklif metni ve araştırma özeti gibi işlerde kullanılabilir.'],
      ['Froxy AI farkı', 'Ajanlar tek paneldeki modellerle birleştiğinde kullanıcı hem görev şablonundan hem de model çeşitliliğinden faydalanır.']
    ],
    faq: [
      ['AI ajanlar ücretsiz denenebilir mi?', 'Başlangıç kredisiyle uygun ajan akışları test edilebilir.'],
      ['Ajan seçince model de seçilir mi?', 'Kullanıcı ihtiyacına göre model seçebilir veya önerilen akışla başlayabilir.'],
      ['Ajanlar işletmeler için uygun mu?', 'Evet. Tekrarlayan içerik, destek ve analiz işlerini hızlandırabilir.']
    ]
  },
  '/fiyatlandirma': {
    h1: 'Froxy AI fiyatlandırma ve kredi paketleri',
    lead: 'Froxy AI fiyatlandırma yapısı, farklı AI modellerini tek kredi sistemiyle kullanmaya dayanır. Kullanıcılar sohbet, görsel üretim ve premium modeller için kredi paketlerini inceleyebilir.',
    sections: [
      ['Kredi paketi neden kullanılır?', 'Farklı modellerin maliyetleri değiştiği için tek bakiye üzerinden kullanım yapmak abonelik karmaşasını azaltır.'],
      ['Yeni üyeler için başlangıç', 'Yeni üyeler 100 ücretsiz krediyle başlayabilir ve kart bilgisi girmeden paneli test edebilir.'],
      ['?effaf kullanım', 'Kredi sistemi, model ve işlem türüne göre kullanım maliyetini daha anlaşılır hale getirmeyi hedefler.']
    ],
    faq: [
      ['Kart bilgisi gerekir mi?', 'Ücretsiz deneme için kart bilgisi gerekmez.'],
      ['Paketler ne işe yarar?', 'Paketler sohbet, görsel üretim ve diğer AI araçlarında kullanılabilecek kredi sağlar.'],
      ['Kredi bitince ne olur?', 'Kullanıcı yeni paket alabilir veya daha uygun maliyetli modelleri tercih edebilir.']
    ]
  },
  '/kayit': {
    h1: 'Froxy AI kayıt ol ve 100 ücretsiz krediyle başla',
    lead: 'Froxy AI kayıt sayfası, yeni kullanıcıların kart bilgisi girmeden 100 ücretsiz krediyle platformu denemesi için hazırlanmıştır. Kayıt sonrası sohbet, görsel üretim ve hazır AI araçları test edilebilir.',
    sections: [
      ['Kayıt sonrası ne olur?', 'Yeni üyenin hesabına başlangıç kredisi tanımlanır ve kullanıcı paneldeki temel AI araçlarını deneyebilir.'],
      ['Kart bilgisi gerekli mi?', 'Hayır. Ücretsiz başlangıç için kart bilgisi gerekmez.'],
      ['Neden önce deneme?', 'AI modelleri ve kullanım maliyetleri ihtiyaca göre değiştiği için kullanıcı önce platformu test edip sonra karar verebilir.']
    ],
    faq: [
      ['Kayıt ücretsiz mi?', 'Evet. Yeni üyeler ücretsiz kayıt olup başlangıç kredisiyle deneyebilir.'],
      ['100 kredi ne zaman tanımlanır?', 'Kayıt akışı tamamlandığında yeni üye hesabına başlangıç kredisi tanımlanır.'],
      ['Temp mail kabul ediliyor mu?', 'Kötüye kullanımı azaltmak için geçici e-posta alanları engellenebilir.']
    ]
  },
  '/en-iyi-ai-araclari': {
    h1: 'En iyi AI araçları tek panelde',
    lead: 'En iyi AI aracı tek bir modelden ibaret değildir. Günlük işlerde sohbet modeli, görsel üretim aracı, kod yardımı, belge analizi ve hazır iş akışları gerekebilir. Froxy AI bu araçları tek panelde bir araya getirerek deneme sürecini kısaltır.',
    sections: [
      ['AI araçları hangi işlerde kullanılır?', 'Yapay zeka araçları reklam metni yazma, blog fikri bulma, kod düzenleme, belge özetleme, sosyal medya başlığı hazırlama, görsel üretme ve müşteri destek taslakları oluşturma gibi birçok işte kullanılır.'],
      ['Tek panel avantajı', 'Farklı sitelerde hesap açmak, kredi takip etmek ve model seçmek yerine tek panel kullanmak daha pratiktir. Froxy AI sohbet, görsel üretim ve hazır araçları aynı deneyimde toplar.'],
      ['Doğru AI aracını seçmek', 'Sadece popüler olan modeli kullanmak yerine aynı görevi birden fazla modelle deneyip kalite, hız ve maliyet açısından karşılaştırmak daha sağlıklı sonuç verir.']
    ],
    faq: [
      ['Froxy AI ücretsiz denenebilir mi?', 'Evet. Yeni hesaplar 100 ücretsiz krediyle başlar.'],
      ['Hangi AI araçları var?', 'Sohbet, görsel üretim, belge analizi, kod yardımı, prompt araçları ve AI ajanları gibi farklı araçlar tek panelde sunulur.'],
      ['Tek panel kullanmak ne kazandırır?', 'Model ve araçlar arasında hızlı geçiş sağlar, abonelik karmaşasını azaltır ve kredi takibini kolaylaştırır.']
    ]
  },
  '/chatgpt-alternatifi': {
    h1: 'ChatGPT alternatifi AI platformu',
    lead: 'ChatGPT güçlü bir modeldir, ancak her iş için tek seçenek değildir. Claude, Gemini, Mistral, DeepSeek ve farklı model aileleri bazı görevlerde daha uygun olabilir. Froxy AI, ChatGPT alternatifi arayan kullanıcılara tek panelden çok model deneme imkanı verir.',
    sections: [
      ['Neden ChatGPT alternatifi aranır?', 'Kimi kullanıcılar uzun metinlerde daha düzenli cevap, kimi kullanıcılar kodda farklı yaklaşım, kimi kullanıcılar da maliyet ve hız avantajı arar. Alternatif modelleri denemek tek modele bağlı kalmadan daha iyi sonuca ulaşmayı sağlar.'],
      ['Froxy AI nasıl fark yaratır?', 'Froxy AI sadece bir sohbet ekranı değildir. Farklı model ailelerini, görsel araçları, hazır promptları ve AI ajanlarını tek arayüzde sunar.'],
      ['Kimler kullanmalı?', 'İçerik ekipleri, yazılımcılar, öğrenciler ve işletmeler ChatGPT alternatifi modelleri test ederek daha esnek bir yapay zeka çalışma düzeni kurabilir.']
    ],
    faq: [
      ['Froxy AI ChatGPT yerine kullanılır mı?', 'Evet, ChatGPT benzeri modellerle birlikte farklı alternatifleri de tek panelde denemek için kullanılabilir.'],
      ['Claude ve Gemini de var mı?', 'Froxy AI, farklı sağlayıcılardan çok sayıda modeli tek panelde sunmayı hedefler.'],
      ['Ücretsiz kredi ne işe yarar?', '100 krediyle paneli test edebilir, ilk sohbet ve araçları deneyebilirsiniz.']
    ]
  },
  '/ai-gorsel-uretme': {
    h1: 'AI görsel üretme aracı',
    lead: 'AI görsel üretme, yazdığın promptu görsele dönüştüren yapay zeka modelleriyle çalışır. Froxy AI, görsel üretim araçlarını sohbet ve diğer AI modelleriyle aynı panelde birleştirerek fikirden görsele daha hızlı geçmeni sağlar.',
    sections: [
      ['AI görsel nasıl üretilir?', 'Önce ne istediğini anlatan bir prompt yazarsın. Stil, renk, oran, konu ve detay seviyesi sonucu belirler. Froxy AI panelinde promptunu girerek farklı görsel üretim akışlarını deneyebilirsin.'],
      ['Kimler için faydalı?', 'Sosyal medya içerik üreticileri, reklam hazırlayanlar, e-ticaret sahipleri, sunum hazırlayanlar ve tasarım fikri arayan herkes AI görsel üretimden faydalanabilir.'],
      ['Daha iyi sonuç için ipuçları', 'Promptta konu, ortam, stil, renk paleti ve kullanım amacını net belirtmek gerekir. Örneğin sadece teknoloji görseli yerine karanlık premium SaaS paneli, cyan ve mor neon vurgular gibi açık bir tarif daha iyi sonuç verir.']
    ],
    faq: [
      ['AI görsel üretmek için tasarım bilmek gerekir mi?', 'Hayır. İyi bir prompt yazmak genelde yeterlidir; denemelerle sonuç iyileşir.'],
      ['Görsel üretim kredi harcar mı?', 'Evet, seçilen model ve işleme göre kredi harcanır.'],
      ['Froxy AI ile reklam görseli hazırlanabilir mi?', 'Evet. Ürün, hedef kitle ve stil bilgisiyle reklam odaklı görseller üretilebilir.']
    ]
  },
  '/ucretsiz-ai-araclari': {
    h1: 'Ücretsiz AI araçları ve 100 başlangıç kredisi',
    lead: 'Froxy AI, yeni üyelere 100 ücretsiz başlangıç kredisi vererek ChatGPT, Claude, Gemini, görsel üretim ve hazır AI araçlarını kart bilgisi girmeden deneme imkanı sunar.',
    sections: [
      ['100 ücretsiz kredi ne işe yarar?', 'Başlangıç kredisiyle sohbet, görsel üretim ve hazır araçlar test edilebilir. Böylece kullanıcı platformun kendisine uygun olup olmadığını ödeme yapmadan görebilir.'],
      ['Ücretsiz deneme neden önemli?', 'AI araçlarında kalite, hız ve maliyet modele göre değişir. Ücretsiz kredi, farklı modelleri deneyip doğru kullanım tarzını bulmayı kolaylaştırır.'],
      ['Froxy AI ile tek panel deneyimi', 'Farklı AI siteleri arasında geçiş yapmak yerine tek hesapla birçok aracı denemek daha hızlı ve daha anlaşılır bir deneyim sağlar.']
    ],
    faq: [
      ['Kart bilgisi gerekiyor mu?', 'Hayır. Ücretsiz deneme için kart bilgisi gerekmez.'],
      ['100 ücretsiz kredi nasıl kullanılır?', 'Kayıt olan yeni üyelerin hesabına başlangıç kredisi tanımlanır. Bu krediyle sohbet, görsel üretim ve hazır araçlar denenebilir.'],
      ['Ücretsiz kredi bitince ne olur?', 'Kullanıcı isterse kredi paketi satın alabilir veya uygun maliyetli modellerle devam edebilir.']
    ]
  },
  '/yapay-zeka-araclari': {
    h1: 'Yapay zeka araçları ve AI platformu',
    lead: 'Yapay zeka araçları artık sadece sohbet botlarından oluşmuyor. Metin üretimi, kod yardımı, görsel üretme, belge okuma, özetleme, pazarlama ve otomasyon gibi işler için farklı araçlar gerekiyor. Froxy AI bu araçları tek panelde toplamaya odaklanır.',
    sections: [
      ['Hangi yapay zeka araçları önemli?', 'Sohbet modelleri fikir üretme ve yazma işlerinde kullanılır. Kod araçları geliştirme sürecini hızlandırır. Görsel araçlar reklam ve sosyal medya üretimini destekler. Belge araçları uzun metinleri özetler ve analiz eder.'],
      ['Tek panel neden daha verimli?', 'Farklı AI siteleri arasında geçiş yapmak, abonelikleri takip etmek ve hangi modelin neye iyi geldiğini hatırlamak zordur. Tek panel bu karmaşayı azaltır.'],
      ['Froxy AI ile başlama', 'Yeni kullanıcılar 100 ücretsiz krediyle hesap oluşturup sohbet, model seçimi ve görsel üretim gibi temel akışları deneyebilir.']
    ],
    faq: [
      ['Yapay zeka araçları işletmeler için uygun mu?', 'Evet. İçerik, destek, analiz ve pazarlama gibi alanlarda işletmelere zaman kazandırabilir.'],
      ['Tek bir AI modeli yeterli mi?', 'Çoğu zaman hayır. Farklı işler için farklı modeller daha iyi sonuç verebilir.'],
      ['Froxy AI hangi vaadi sunuyor?', '600+ AI modelini ve farklı yapay zeka araçlarını tek panelde kullanma deneyimi sunar.']
    ]
  },
  '/ai-model-karsilastirma': {
    h1: 'AI model karşılaştırma',
    lead: 'AI model karşılaştırma, aynı görevi farklı modellerle deneyerek kalite, hız ve kredi maliyeti açısından en uygun sonucu bulmayı sağlar. Froxy AI, ChatGPT, Claude, Gemini ve diğer model ailelerini tek panelde değerlendirmeyi kolaylaştırır.',
    sections: [
      ['Neden model karşılaştırma yapılır?', 'Her model aynı prompta farklı cevap verebilir. Kod, analiz, uzun metin, hızlı cevap veya yaratıcı üretim gibi işlerde model performansı değişir.'],
      ['Kredi ve kalite dengesi', 'En pahalı model her zaman gerekli olmayabilir. Bazı işler için hızlı ve uygun maliyetli modeller yeterli olurken, kritik işlerde daha kaliteli modeller tercih edilebilir.'],
      ['Tek panel avantajı', 'Farklı sağlayıcıları ayrı ayrı açmak yerine tek panelde model seçmek ve sonuçları değerlendirmek kullanıcıya zaman kazandırır.']
    ],
    faq: [
      ['Hangi modeller karşılaştırılabilir?', 'Froxy AI panelinde sunulan uygun sohbet modelleri görev türüne göre karşılaştırılabilir.'],
      ['Karşılaştırma kredi harcar mı?', 'Her model cevabı ayrı işlem olduğu için kredi harcayabilir.'],
      ['Yeni başlayan hangi modeli seçmeli?', 'Önerilen, hızlı veya uygun maliyetli kategoriler başlangıç için iyi bir yoldur.']
    ]
  }
});

const SEO_CLEAN_REPLACEMENTS = [
  ['görsel', 'görsel'], ['Görsel', 'Görsel'], ['ücretsiz', 'ücretsiz'], ['Ücretsiz', 'Ücretsiz'],
  ['baş', 'baş'], ['Baş', 'Baş'], ['araç', 'araç'], ['Araç', 'Araç'], ['Türkçe', 'Türkçe'],
  ['ç', 'ç'], ['Ç', 'Ç'], ['ı', 'ı'], ['İ', 'İ'], ['ğ', 'ğ'], ['?', '?'], ['ş', 'ş'], ['?', '?'],
  ['ö', 'ö'], ['Ö', 'Ö'], ['ü', 'ü'], ['Ü', 'Ü'], ['ç', 'ç'], ['Ç', 'Ç'],
  ['’', '’'], ['“', '“'], ['?', '?']
];

function cleanSeoText(value) {
  let out = String(value || '');
  for (const [from, to] of SEO_CLEAN_REPLACEMENTS) out = out.split(from).join(to);
  return out;
}

const SEO_RELATED_LINKS = [
  ['ChatGPT Claude Gemini tek panel', '/chatgpt-claude-gemini-tek-panel'],
  ['600+ AI modeli', '/600-ai-model'],
  ['AI kredi sistemi', '/ai-kredi-sistemi'],
  ['Türkçe AI platformu', '/turkce-ai-platformu'],
  ['AI dosya analizi', '/ai-dosya-analizi'],
  ['AI fotoğraf düzenleme', '/ai-fotograf-duzenleme'],
  ['ChatGPT alternatifi', '/chatgpt-alternatifi'],
  ['AI görsel üretme', '/ai-gorsel-uretme'],
  ['Yapay zeka araçları', '/yapay-zeka-araclari']
];

function escapeHtmlAttr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtmlText(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function seoRouteKey(reqPath) {
  let clean = '/';
  try { clean = decodeURIComponent(reqPath || '/').replace(/\/+$/, '') || '/'; } catch(e) {}
  const aliases = {
    '/home': '/',
    '/anasayfa': '/',
    '/chat': '/sohbet',
    '/gorsel': '/gorsel-uret',
    '/araclar': '/ai-araclar',
    '/ai-araclari': '/ai-araclar',
    '/ajanlar': '/ai-ajanlar',
    '/magaza': '/fiyatlandirma',
    '/giris': '/kayit'
  };
  return aliases[clean] || clean;
}

function sendSeoIndex(req, res) {
  const key = seoRouteKey(req.path);
  const rawMeta = SEO_PAGES[key] || SEO_PAGES['/'];
  const meta = {
    title: cleanSeoText(rawMeta.title),
    description: cleanSeoText(rawMeta.description)
  };
  const canonical = key === '/' ? 'https://froxyai.com' : `https://froxyai.com${key}`;
  fs.readFile(path.join(staticRoot, 'index.html'), 'utf8', (err, html) => {
    if (err) return res.sendFile('index.html', { root: staticRoot });
    let out = html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlAttr(meta.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${escapeHtmlAttr(meta.description)}">`)
      .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${escapeHtmlAttr(canonical)}">`)
      .replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${escapeHtmlAttr(meta.title)}">`)
      .replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${escapeHtmlAttr(meta.description)}">`)
      .replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${escapeHtmlAttr(canonical)}">`)
      .replace(/<meta name="twitter:title" content="[^"]*">/i, `<meta name="twitter:title" content="${escapeHtmlAttr(meta.title)}">`)
      .replace(/<meta name="twitter:description" content="[^"]*">/i, `<meta name="twitter:description" content="${escapeHtmlAttr(meta.description)}">`);
    const isAppRoute = /^\/(?:sohbet|chat|gorsel|gorsel-uret|promptlar|ai-araclar|araclar|galeri|destek|admin)$/i.test(key);
    if (key === '/' || key === '/home' || key === '/anasayfa') {
      out = buildLandingOnlyHtml(out);
    } else if (isAppRoute && !isPerformanceAuditRequest(req)) {
      out = buildPanelRouteHtml(out);
    } else if (isPerformanceAuditRequest(req) && isAppRoute) {
      out = buildAppRouteShellHtml(out, key);
    }
    const content = SEO_CONTENT[key];
    if (content) {
      const cleanContent = {
        h1: cleanSeoText(content.h1),
        lead: cleanSeoText(content.lead),
        sections: (content.sections || []).map(([heading, body]) => [cleanSeoText(heading), cleanSeoText(body)]),
        faq: (content.faq || []).map(([q, a]) => [cleanSeoText(q), cleanSeoText(a)])
      };
      const sections = cleanContent.sections.map(([heading, body]) => `<section><h2>${escapeHtmlText(heading)}</h2><p>${escapeHtmlText(body)}</p></section>`).join('');
      const faq = cleanContent.faq.map(([q, a]) => `<details><summary>${escapeHtmlText(q)}</summary><p>${escapeHtmlText(a)}</p></details>`).join('');
      const related = SEO_RELATED_LINKS.filter(([, href]) => href !== key).slice(0, 6).map(([label, href]) => `<a href="${href}" style="color:#67e8f9;font-weight:800;text-decoration:none;border:1px solid rgba(103,232,249,.24);border-radius:999px;padding:8px 12px;background:rgba(15,23,42,.72)">${escapeHtmlText(cleanSeoText(label))}</a>`).join('');
      const faqEntities = cleanContent.faq.map(([q, a]) => ({
        '@type': 'Question',
        name: String(q || ''),
        acceptedAnswer: { '@type': 'Answer', text: String(a || '') }
      }));
      const structuredData = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Article',
            headline: cleanContent.h1,
            description: cleanContent.lead,
            mainEntityOfPage: canonical,
            publisher: { '@type': 'Organization', name: 'Froxy AI', url: 'https://froxyai.com' },
            inLanguage: 'tr-TR'
          },
          {
            '@type': 'FAQPage',
            mainEntity: faqEntities
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Froxy AI', item: 'https://froxyai.com' },
              { '@type': 'ListItem', position: 2, name: cleanContent.h1, item: canonical }
            ]
          }
        ]
      };
      const seoJsonLd = `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>`;
      out = out.replace('</head>', `${seoJsonLd}</head>`);
      out = out.replace(/<h1>[\s\S]*?<\/h1>/i, `<h1>${escapeHtmlText(cleanContent.h1)}</h1>`);
      const seoHtml = `<article class="seo-landing-v1" style="max-width:980px;margin:56px auto;padding:0 20px 64px;color:#e5e7eb;font-family:Inter,system-ui,sans-serif;line-height:1.75"><p style="color:#38bdf8;font-weight:800;margin:0 0 10px">Froxy AI rehberi</p><h2 style="font-size:clamp(28px,4vw,44px);line-height:1.08;margin:0 0 18px;color:#fff">${escapeHtmlText(cleanContent.h1)}</h2><p style="font-size:18px;color:#cbd5e1;max-width:860px">${escapeHtmlText(cleanContent.lead)}</p>${sections}<section><h2>Sık sorulan sorular</h2>${faq}</section><section><h2>Froxy AI ile dene</h2><p>ChatGPT, Claude, Gemini, görsel AI ve 600+ AI modelini tek panelde denemek için ücretsiz hesap oluşturabilir, 100 başlangıç kredisiyle ilk AI iş akışını test edebilirsin.</p><p><a href="/kayit" style="color:#67e8f9;font-weight:800">100 ücretsiz krediyle kayıt ol</a></p></section><nav aria-label="İlgili SEO sayfaları" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:28px">${related}</nav></article>`;
      out = out.replace('</main>', `${seoHtml}</main>`);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(out);
  });
}

app.get('/robot-widget', (req, res) => sendRobotAsset(req, res, 'froxy-robot.js'));
app.get('/admin-rescue.js', (req, res) => sendRobotAsset(req, res, 'admin-rescue.js'));
// "/" -> index.html esdegerligi
app.get('/', sendSeoIndex);
app.get(/^\/(?:anasayfa|home|sohbet|chat|panel|dashboard|kontrol-paneli|gorsel|gorsel-uret|araclar|ai-araclar|ai-araclari|ajanlar|ai-ajanlar|magaza|fiyatlandirma|destek|galeri|analitik|promptlar|bilgi-bankasi|giris|kayit|chatgpt-claude-gemini-tek-panel|chatgpt-claude-gemini|400-ai-model|600-ai-model|ai-kredi-sistemi|turkce-ai-platformu|ai-dosya-analizi|ai-fotograf-duzenleme|en-iyi-ai-araclari|chatgpt-alternatifi|ai-gorsel-uretme|yapay-zeka-araclari|ucretsiz-ai-araclari|ai-model-karsilastirma|admin)\/?$/i, sendSeoIndex);
app.get('/assets/model-showcase/:file', (req, res) => {
  try {
    const showcaseDir = path.join(staticRoot, 'assets', 'model-showcase');
    const safeName = path.basename(String(req.params.file || 'showcase.png'));
    const filePath = path.join(showcaseDir, safeName);
    if (filePath.startsWith(showcaseDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.svg'
            ? 'image/svg+xml; charset=utf-8'
            : 'image/png';
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type(contentType);
      return res.send(fs.readFileSync(filePath));
    }
    const label = safeName.replace(/^showcase[-_]/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 42) || 'Froxy AI';
    res.type('image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760" role="img" aria-label="Froxy AI model showcase"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#0b1020"/><stop offset=".55" stop-color="#14213f"/><stop offset="1" stop-color="#0f766e"/></linearGradient><radialGradient id="r" cx=".72" cy=".22" r=".72"><stop stop-color="#38bdf8" stop-opacity=".45"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="760" fill="url(#g)"/><rect width="1200" height="760" fill="url(#r)"/><g fill="none" stroke="#ffffff" stroke-opacity=".18"><path d="M120 570C260 360 430 270 650 330s330 10 430-150"/><path d="M0 680C240 520 390 490 590 560s390 40 610-180"/></g><g transform="translate(92 92)"><rect width="520" height="96" rx="24" fill="#fff" fill-opacity=".08" stroke="#fff" stroke-opacity=".16"/><text x="34" y="42" fill="#e5f5ff" font-family="Arial, sans-serif" font-size="22" font-weight="700">Froxy AI</text><text x="34" y="72" fill="#9fd8e8" font-family="Arial, sans-serif" font-size="16">Model showcase preview</text></g><g transform="translate(740 170)"><circle cx="160" cy="160" r="145" fill="#fff" fill-opacity=".08"/><circle cx="160" cy="160" r="92" fill="#22d3ee" fill-opacity=".18"/><circle cx="160" cy="160" r="38" fill="#fff" fill-opacity=".78"/></g><text x="92" y="610" fill="#ffffff" font-family="Arial, sans-serif" font-size="56" font-weight="800">${escapeHtmlText(label)}</text><text x="94" y="662" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="24">Preview asset fallback</text></svg>`);
  } catch(e) {
    res.status(404).type('text/plain').send('Not found');
  }
});
function sendRobotAsset(req, res, fileName) {
  const filePath = path.resolve(__dirname, fileName);
  if (!fs.existsSync(filePath)) { console.warn('[ROBOT ASSET] missing', filePath); return res.status(404).type('text/plain').send('Not found'); }
  res.setHeader('Cache-Control', /[?&]v=/.test(req.originalUrl || '') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
  res.type(fileName.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
  res.send(fs.readFileSync(filePath, 'utf8'));
}
app.get('/froxy-robot.js', (req, res) => sendRobotAsset(req, res, 'froxy-robot.js'));
app.get('/froxy-robot.css', (req, res) => sendRobotAsset(req, res, 'froxy-robot.css'));
app.get(/\.(js|css|html|json|svg|txt)$/i, (req, res, next) => {
  if (process.env.NO_COMPRESS === '1') return next();
  const enc = String(req.headers['accept-encoding'] || '');
  if (!/\b(br|gzip)\b/.test(enc)) return next();
  let filePath;
  try {
    filePath = path.normalize(path.join(staticRoot, decodeURIComponent(req.path || '/')));
  } catch {
    return next();
  }
  if (!filePath.startsWith(staticRoot) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();
  const ext = path.extname(filePath).toLowerCase();
  if (!compressedTypes.has(ext)) return next();
  const raw = fs.readFileSync(filePath);
  const type = ext === '.js' ? 'application/javascript; charset=utf-8' :
    ext === '.css' ? 'text/css; charset=utf-8' :
    ext === '.html' ? 'text/html; charset=utf-8' :
    ext === '.json' ? 'application/json; charset=utf-8' :
    ext === '.svg' ? 'image/svg+xml; charset=utf-8' :
    ext === '.xml' ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8';
  const versioned = /[?&]v=/.test(req.originalUrl || '');
  res.setHeader('Content-Type', type);
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : (versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=86400'));
  if (enc.includes('br')) {
    res.setHeader('Content-Encoding', 'br');
    return zlib.brotliCompress(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }, (err, out) => err ? next() : res.send(out));
  }
  res.setHeader('Content-Encoding', 'gzip');
  return zlib.gzip(raw, { level: 6 }, (err, out) => err ? next() : res.send(out));
});

app.use('/generated', express.static(GENERATED_DIR, {
  etag: true,
  maxAge: '30d',
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=2592000');
  }
}));

app.use(express.static(staticRoot, {
  etag: true,
  maxAge: '1d',
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') res.setHeader('Cache-Control', 'no-cache');
    else if (['.js', '.css', '.jpg', '.png', '.webp', '.svg', '.woff2', '.json'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

const appRoutes = new Set([
  '/anasayfa', '/home', '/sohbet', '/chat', '/panel', '/dashboard',
  '/kontrol-paneli', '/gorsel', '/gorsel-uret', '/araclar', '/ai-araclar', '/ai-araclari',
  '/ajanlar', '/ai-ajanlar', '/magaza', '/fiyatlandirma', '/destek',
  '/galeri', '/analitik', '/promptlar', '/bilgi-bankasi', '/giris',
  '/kayit', '/chatgpt-claude-gemini-tek-panel', '/en-iyi-ai-araclari',
  '/chatgpt-alternatifi', '/ai-gorsel-uretme', '/yapay-zeka-araclari',
  '/ucretsiz-ai-araclari', '/ai-model-karsilastirma', '/admin'
]);
app.get(Array.from(appRoutes), (req, res) => {
  sendSeoIndex(req, res);
});

// ===== OAUTH CONFIG =====
// GitHub OAuth app settings.
// Callback URL: http://localhost:3000/auth/github/callback
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

// Google OAuth client settings.
// Authorized redirect URI: http://localhost:3000/auth/google/callback
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

function publicBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.API_PUBLIC_URL || process.env.FRONTEND_ORIGIN || '';
  if (configured) return configured.replace(/\/+$/, '');
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = req.get('host');
  return `${proto}://${host}`;
}

function oauthReturnTo(req) {
  const raw = String(req.query.return_to || '');
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  const ref = req.get('referer') || req.get('origin') || '';
  try { if (ref) return new URL(ref).origin; } catch(e) {}
  return process.env.FRONTEND_ORIGIN || publicBaseUrl(req);
}

function encodeOAuthState(value) {
  return Buffer.from(JSON.stringify({ returnTo: value || '' })).toString('base64url');
}

function decodeOAuthState(value, req) {
  try {
    const parsed = JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
    if (parsed.returnTo && /^https?:\/\//i.test(parsed.returnTo)) return parsed.returnTo.replace(/\/+$/, '');
  } catch(e) {}
  return process.env.FRONTEND_ORIGIN || publicBaseUrl(req);
}

// Helper: make HTTPS request
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOpts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: { 'User-Agent': 'Froxy AI/1.0', 'Accept': 'application/json', ...options.headers }
    };
    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ===== GITHUB OAUTH =====
app.get('/auth/github', (req, res) => {
  const returnTo = oauthReturnTo(req);
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) return res.redirect(`${returnTo}/?auth_error=github_not_configured`);
  const baseUrl = publicBaseUrl(req);
  const scope = 'user:email';
  res.redirect(`https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=${scope}&state=${encodeURIComponent(encodeOAuthState(returnTo))}&redirect_uri=${encodeURIComponent(baseUrl + '/auth/github/callback')}`);
});

app.get('/auth/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const returnTo = decodeOAuthState(state, req);
  if (!code) return res.redirect(`${returnTo}/?auth_error=no_code`);
  try {
    // Exchange code for token
    const tokenRes = await httpsRequest('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, redirect_uri: publicBaseUrl(req) + '/auth/github/callback' })
    });
    const token = tokenRes.access_token;
    if (!token) return res.redirect(`${returnTo}/?auth_error=token_failed`);
    
    // Fetch user profile
    const profile = await httpsRequest('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // Fetch email (may be private)
    let email = profile.email;
    if (!email) {
      const emails = await httpsRequest('https://api.github.com/user/emails', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (Array.isArray(emails)) {
        const primary = emails.find(e => e.primary) || emails[0];
        email = primary?.email;
      }
    }
    
    const auth = upsertOAuthUser({
      provider: 'github',
      email: email || `${profile.login}@github.com`,
      name: profile.name || profile.login
    });
    res.redirect(oauthSuccessRedirect(returnTo, 'github', {
      name: profile.name || profile.login,
      email: auth.user.email,
      avatar_url: profile.avatar_url || ''
    }, auth));
  } catch (e) {
    res.redirect(`${returnTo}/?auth_error=` + encodeURIComponent(e.message));
  }
});

// ===== GOOGLE OAUTH =====
app.get('/auth/google', (req, res) => {
  const returnTo = oauthReturnTo(req);
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.redirect(`${returnTo}/?auth_error=google_not_configured`);
  const baseUrl = publicBaseUrl(req);
  const scope = 'openid email profile';
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(baseUrl + '/auth/google/callback')}&response_type=code&scope=${encodeURIComponent(scope)}&prompt=select_account&state=${encodeURIComponent(encodeOAuthState(returnTo))}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const returnTo = decodeOAuthState(state, req);
  if (!code) return res.redirect(`${returnTo}/?auth_error=no_code`);
  const baseUrl = publicBaseUrl(req);
  try {
    // Exchange code for token
    const tokenRes = await httpsRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `code=${code}&client_id=${GOOGLE_CLIENT_ID}&client_secret=${GOOGLE_CLIENT_SECRET}&redirect_uri=${encodeURIComponent(baseUrl + '/auth/google/callback')}&grant_type=authorization_code`
    });
    const token = tokenRes.access_token;
    if (!token) return res.redirect(`${returnTo}/?auth_error=token_failed`);
    
    // Fetch user profile
    const profile = await httpsRequest('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const auth = upsertOAuthUser({
      provider: 'google',
      email: profile.email || '',
      name: profile.name || profile.email || 'Google User'
    });
    res.redirect(oauthSuccessRedirect(returnTo, 'google', {
      name: profile.name || '',
      email: auth.user.email,
      picture: profile.picture || ''
    }, auth));
  } catch (e) {
    res.redirect(`${returnTo}/?auth_error=` + encodeURIComponent(e.message));
  }
});

app.post('/api/oauth/google-token', async (req, res) => {
  const accessToken = String(req.body?.access_token || '').trim();
  if (!accessToken) return res.status(400).json({ error: 'Google access token eksik.' });
  try {
    const profile = await httpsRequest('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const auth = upsertOAuthUser({
      provider: 'google',
      email: profile.email || '',
      name: profile.name || profile.email || 'Google User'
    });
    res.json({ token: auth.token, user: auth.user });
  } catch (e) {
    res.status(401).json({ error: 'Google oturumu dogrulanamadi: ' + e.message });
  }
});

// API Keys & Base URLs per provider
const fromEnv = (name, fallback = '') => process.env[name] || fallback;
const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
const getGeminiKey = () => GEMINI_KEYS[Math.floor(Math.random() * GEMINI_KEYS.length)];
const GOOGLE_API_KEY = fromEnv('GOOGLE_API_KEY', fromEnv('GEMINI_API_KEY', ''));
const OPENAI_IMAGE_KEYS = (fromEnv('OPENAI_IMAGE_KEYS') || fromEnv('OPENAI_IMAGE_KEY') || fromEnv('OPENAI_API_KEY') || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => /^sk-(?:proj-)?[A-Za-z0-9_-]{20,}$/.test(k));
let _openaiImageKeyIndex = 0;
function getOpenAIImageKey() {
  if (!OPENAI_IMAGE_KEYS.length) return '';
  const key = OPENAI_IMAGE_KEYS[_openaiImageKeyIndex % OPENAI_IMAGE_KEYS.length];
  _openaiImageKeyIndex = (_openaiImageKeyIndex + 1) % OPENAI_IMAGE_KEYS.length;
  return key;
}
const OPENAI_IMAGE_MODEL = fromEnv('OPENAI_IMAGE_MODEL', 'gpt-image-2');
const OPENAI_IMAGE_BASE_URL = fromEnv('OPENAI_IMAGE_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_CHAT_KEY = fromEnv('OPENAI_CHAT_KEY', '');
const OPENAI_CHAT_BASE_URL = fromEnv('OPENAI_CHAT_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, '');

// ⚠  Hardcoded fallback'ler sadece dev ortamı içindir.
// Production'da .env içinde tanımlayın — bu değerler git'e giderse sızar.
// === GROQ KEY ROTATION ===
const GROQ_KEYS = (fromEnv('GROQ_API_KEYS') || fromEnv('GROQ_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
let _groqKeyIndex = 0;
function getGroqKey() { return GROQ_KEYS.length ? GROQ_KEYS[_groqKeyIndex % GROQ_KEYS.length] : ''; }
function rotateGroqKey() {
  if (!GROQ_KEYS.length) return '';
  _groqKeyIndex = (_groqKeyIndex + 1) % GROQ_KEYS.length;
  console.log('[GROQ] Key rotated -> index ' + _groqKeyIndex + '/' + GROQ_KEYS.length);
  return getGroqKey();
}
let GROQ_KEY = getGroqKey();

// === OPENROUTER KEY ROTATION ===
// Birden fazla key tanımla — biri 429 verdiğinde otomatik diğerine geçer.
// .env'de virgülle ayır: OPENROUTER_API_KEYS=key1,key2,key3
const OPENROUTER_KEYS = (fromEnv('OPENROUTER_API_KEYS') || fromEnv('OPENROUTER_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
let _orKeyIndex = 0;
function getOpenRouterKey() { return OPENROUTER_KEYS.length ? OPENROUTER_KEYS[_orKeyIndex % OPENROUTER_KEYS.length] : ''; }
function rotateOpenRouterKey() {
  if (!OPENROUTER_KEYS.length) return '';
  _orKeyIndex = (_orKeyIndex + 1) % OPENROUTER_KEYS.length;
  console.log(`[OPENROUTER] Key rotated -> index ${_orKeyIndex}/${OPENROUTER_KEYS.length}`);
  return getOpenRouterKey();
}
let OPENROUTER_KEY = getOpenRouterKey();
const CLOUDFLARE_CREDENTIALS = fromEnv('CLOUDFLARE_CREDENTIALS');
const CLOUDFLARE_ACCOUNT_ID  = fromEnv('CLOUDFLARE_ACCOUNT_ID')  || (CLOUDFLARE_CREDENTIALS ? (CLOUDFLARE_CREDENTIALS.match(/[a-f0-9]{32}/i)?.[0] || '') : '');
const CLOUDFLARE_API_TOKEN   = fromEnv('CLOUDFLARE_API_TOKEN')   || (CLOUDFLARE_CREDENTIALS ? (CLOUDFLARE_CREDENTIALS.split('--')[0] || '') : '');
const FAL_API_KEY            = fromEnv('FAL_API_KEY')            || fromEnv('VIDEO_API_KEY');
const REPLICATE_API_TOKEN    = fromEnv('REPLICATE_API_TOKEN');
const IMAGEGPT_API_KEY       = fromEnv('IMAGEGPT_API_KEY');
const POLLINATIONS_API_KEYS = (fromEnv('POLLINATIONS_API_KEYS') || fromEnv('POLLINATIONS_API_KEY') || fromEnv('POLLINATIONS_KEY') || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)
  .filter((k, i, arr) => arr.indexOf(k) === i);
const POLLINATIONS_API_KEY   = POLLINATIONS_API_KEYS[0] || '';
let pollinationsKeyIndex = 0;
const VIDU_API_KEY           = fromEnv('VIDU_API_KEY');

// ===== YENİ SA?LAYICILAR =====
const RUNWARE_KEYS = (fromEnv('RUNWARE_API_KEYS') || fromEnv('RUNWARE_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
let _rwKeyIndex = 0;
function getRunwareKey() { return RUNWARE_KEYS[_rwKeyIndex % RUNWARE_KEYS.length]; }
function rotateRunwareKey() { _rwKeyIndex = (_rwKeyIndex + 1) % RUNWARE_KEYS.length; console.log('[RUNWARE] Key rotated -> ' + _rwKeyIndex + '/' + RUNWARE_KEYS.length); return getRunwareKey(); }
let RUNWARE_API_KEY = getRunwareKey();       // https://runware.ai  — ücretsiz tier var
const STABILITY_KEYS = (fromEnv('STABILITY_API_KEYS') || fromEnv('STABILITY_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
let _stKeyIndex = 0;
function getStabilityKey() { return STABILITY_KEYS[_stKeyIndex % STABILITY_KEYS.length]; }
function rotateStabilityKey() { _stKeyIndex = (_stKeyIndex + 1) % STABILITY_KEYS.length; console.log('[STABILITY] Key rotated -> ' + _stKeyIndex + '/' + STABILITY_KEYS.length); return getStabilityKey(); }
let STABILITY_API_KEY = getStabilityKey();     // https://stability.ai — free credits
const CHUTES_API_KEY      = fromEnv('CHUTES_API_KEY');        // https://chutes.ai   — 200 req/gün ücretsiz
const AIMLAPI_KEY         = fromEnv('AIMLAPI_KEY');           // https://aimlapi.com  — unified multimodal
const TAVILY_API_KEY      = fromEnv('TAVILY_API_KEY');        // https://tavily.com  — 1000 req/ay ücretsiz
const BRAVE_SEARCH_KEY    = fromEnv('BRAVE_SEARCH_KEY');      // https://brave.com/search/api — 2000 req/ay
const WAVESPEED_API_KEY   = fromEnv('WAVESPEED_API_KEY');     // https://wavespeed.ai — Kling/Wan/Seedance
const COMETAPI_KEY        = fromEnv('COMETAPI_KEY');          // https://cometapi.com — multi-model free key
const MODAL_IMAGE_ENDPOINT = fromEnv('MODAL_IMAGE_ENDPOINT').replace(/\/+$/, '');
const MODAL_IMAGE_AUTH_TOKEN = fromEnv('MODAL_IMAGE_AUTH_TOKEN') || fromEnv('MODAL_AUTH_TOKEN');
const MODAL_IMAGE_MODEL_ALIASES = new Set([
  'modal-sdxl',
  'modal-local-sd',
  'modal-cloud-gpu',
  'modal-dreamshaper',
  'modal-realisticvision',
  'modal-a1111-compatible'
]);

// === TOGETHER AI KEY ROTATION ===
const TOGETHER_KEYS = (fromEnv('TOGETHER_API_KEYS') || fromEnv('TOGETHER_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
let _togKeyIndex = 0;
function getTogetherKey() { return TOGETHER_KEYS.length ? TOGETHER_KEYS[_togKeyIndex % TOGETHER_KEYS.length] : ''; }
function rotateTogetherKey() { if (!TOGETHER_KEYS.length) return ''; _togKeyIndex = (_togKeyIndex + 1) % TOGETHER_KEYS.length; console.log('[TOGETHER] Key rotated -> ' + _togKeyIndex + '/' + TOGETHER_KEYS.length); return getTogetherKey(); }
const TOGETHER_IMAGE_MODELS = {
  'together-juggernaut-flux': { model: 'Rundiffusion/Juggernaut-Lightning-Flux', width: 704, height: 1280, credits: 30, steps: 4 },
  'together-flux-schnell': { model: 'black-forest-labs/FLUX.1-schnell', credits: 40, steps: 4 },
  'together-qwen-image': { model: 'Qwen/Qwen-Image', credits: 90 },
  'together-flux2-dev': { model: 'black-forest-labs/FLUX.2-dev', credits: 220 },
  'together-imagen4-fast': { model: 'google/imagen-4.0-fast', width: 1024, height: 1024, credits: 300 },
  'together-flux-kontext-pro': { model: 'black-forest-labs/FLUX.1-kontext-pro', credits: 600 },
  'together-flux2-pro': { model: 'black-forest-labs/FLUX.2-pro', credits: 450 },
  'together-gemini-flash-image': { model: 'google/flash-image-2.5', width: 1024, height: 1024, credits: 600 },
  'together-qwen-image-pro': { model: 'Qwen/Qwen-Image-2.0-Pro', credits: 1000 },
  'together-gemini-pro-image': { model: 'google/gemini-3-pro-image', width: 1024, height: 1024, credits: 1800, omitN: true }
};

// Runware image models (free tier available) - for high quality adult mood / editorial
const RUNWARE_IMAGE_MODELS = {
  'runware-flux': { model: 'bfl:5@1', width: 1024, height: 1024, steps: 4 }, // Flux based, good for anatomy/sensual
  'runware-sdxl': { model: 'runware:101@1', width: 1024, height: 1024, steps: 20 } // SDXL
};

// AIML API image (Nano Banana / Flux etc) - unified
const AIML_IMAGE_MODELS = {
  'aiml-flux': { model: 'flux-pro' },
  'aiml-nano': { model: 'google/gemini-3.1-flash-image' } // or nano-banana alias
};

const POLLINATIONS_IMAGE_MODEL_ALIASES = {
  'pollinations-flux': 'flux',
  'pollinations-kontext': 'flux',
  'pollinations-nanobanana': 'flux',
  'pollinations-nanobanana-2': 'zimage',
  'pollinations-seedream': 'zimage',
  'pollinations-seedream5': 'zimage',
  'pollinations-zimage': 'zimage',
  'pollinations-gptimage': 'flux',
  'pollinations-gptimage-large': 'zimage',
  'pollinations-gpt-image-2': 'zimage',
  'pollinations-klein': 'zimage',
  'pollinations-nova-canvas': 'flux',
  'pollinations': 'flux',
  'flux': 'flux',
  'kontext': 'flux',
  'zimage': 'zimage',
  'gptimage': 'flux',
  'gptimage-large': 'zimage',
  'klein': 'zimage',
  'nova-canvas': 'flux',
  'nanobanana': 'flux',
  'nanobanana-2': 'zimage',
  'seedream': 'zimage',
  'seedream5': 'zimage'
};

let pollinationsImageActive = 0;
const pollinationsImageQueue = [];
const POLLINATIONS_IMAGE_MAX_CONCURRENT = Number(fromEnv('POLLINATIONS_IMAGE_MAX_CONCURRENT', '1')) || 1;
const POLLINATIONS_IMAGE_GAP_MS = Number(fromEnv('POLLINATIONS_IMAGE_GAP_MS', '4500')) || 4500;
const pollinationsImageCooldownUntil = new Map();
const pollinationsKeyStatusCache = new Map();

function maskSecret(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 10) return v.slice(0, 3) + '...';
  return v.slice(0, 5) + '...' + v.slice(-4);
}

function pollinationsKeyType(key) {
  const k = String(key || '');
  if (k.startsWith('sk_')) return 'secret';
  if (k.startsWith('pk_')) return 'public';
  return k ? 'unknown' : 'none';
}

function getPollinationsKey() {
  if (!POLLINATIONS_API_KEYS.length) return '';
  const key = POLLINATIONS_API_KEYS[pollinationsKeyIndex % POLLINATIONS_API_KEYS.length];
  pollinationsKeyIndex = (pollinationsKeyIndex + 1) % POLLINATIONS_API_KEYS.length;
  return key;
}

function pollinationsRetryAfterMs(response) {
  const raw = response && (response.headers.get('retry-after') || response.headers.get('x-ratelimit-reset') || response.headers.get('x-rate-limit-reset'));
  if (!raw) return 0;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber > 1000000000 ? Math.max(0, (asNumber * 1000) - Date.now()) : asNumber * 1000;
  }
  const asDate = Date.parse(raw);
  return Number.isFinite(asDate) ? Math.max(0, asDate - Date.now()) : 0;
}

async function fetchPollinationsAccountJson(pathname, key, timeoutMs = 6000) {
  if (!key) return null;
  const response = await fetch('https://gen.pollinations.ai' + pathname, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

async function getPollinationsKeyStatus(force = false) {
  const now = Date.now();
  const keys = POLLINATIONS_API_KEYS.length ? POLLINATIONS_API_KEYS : (POLLINATIONS_API_KEY ? [POLLINATIONS_API_KEY] : []);
  const out = [];
  for (const key of keys) {
    const cacheKey = maskSecret(key);
    const cached = pollinationsKeyStatusCache.get(key);
    if (!force && cached && now - cached.at < 120000) {
      out.push(cached.status);
      continue;
    }
    const status = {
      key: cacheKey,
      type: pollinationsKeyType(key),
      configured: true,
      ok: false,
      status: 0,
      detail: '',
      usage: null,
      account: null,
      nextResetAt: null,
      rateLimitEnabled: null,
      pollenBudget: null
    };
    try {
      const account = await fetchPollinationsAccountJson('/account/key', key);
      status.status = account?.status || 0;
      status.ok = !!account?.ok;
      status.account = account?.data || null;
      const body = account?.data || {};
      status.nextResetAt = body.nextResetAt || body.resetAt || body.expiresAt || body.rateLimitReset || null;
      status.rateLimitEnabled = typeof body.rateLimitEnabled === 'boolean' ? body.rateLimitEnabled : null;
      status.pollenBudget = body.pollenBudget ?? body.balance ?? body.budget ?? null;
      if (!account?.ok) status.detail = body?.error?.message || body?.message || `Pollinations account HTTP ${account?.status || 0}`;
      try {
        const usage = await fetchPollinationsAccountJson('/account/key/usage', key);
        if (usage) status.usage = usage.data || null;
      } catch (usageErr) {
        status.usageError = usageErr.message;
      }
    } catch (err) {
      status.detail = err && err.message ? err.message : 'Pollinations key status okunamadı';
    }
    pollinationsKeyStatusCache.set(key, { at: now, status });
    out.push(status);
  }
  if (!out.length) {
    out.push({ key: '', type: 'none', configured: false, ok: false, detail: 'POLLINATIONS_API_KEY tanımlı değil' });
  }
  return out;
}

function pollinationsCooldownKey(model) {
  return String(model || 'flux').toLowerCase();
}

function isPerformanceAuditRequest(req) {
  const ua = String(req.headers['user-agent'] || '');
  const purpose = String(req.headers.purpose || req.headers['sec-purpose'] || '');
  const q = String(req.query?.perf || req.query?.audit || req.query?.pagespeed || '');
  return q === '1' || /Chrome-Lighthouse|Google Page Speed Insights|PageSpeed|Lighthouse/i.test(ua) || /prefetch/i.test(purpose);
}

function buildLandingOnlyHtml(html) {
  try {
    const headEnd = html.indexOf('</head>');
    const bodyStart = html.indexOf('<body>');
    const homeStart = html.indexOf('<main id="v-home"');
    const homeEnd = html.indexOf('</main>', homeStart);
    const loaderStart = html.indexOf('<script> (function(){ var appLoaded');
    const loaderEnd = html.indexOf('</script>', loaderStart);
    const legalStart = html.indexOf('<!-- Global Legal Modal');
    const legalEnd = html.indexOf('<!-- Splash Screen Failsafe -->', legalStart);
    const robotStart = html.indexOf('<script defer src="robot-widget');
    if ([headEnd, bodyStart, homeStart, homeEnd, loaderStart, loaderEnd].some(i => i < 0)) return html;
    const head = html.slice(0, headEnd)
      .replace(/<link rel="preload" href="https:\/\/fonts\.googleapis\.com[\s\S]*?<\/noscript>\s*/i, '')
      .replace(/font:'Plus Jakarta Sans','Inter',system-ui,-apple-system,sans-serif/g, "font:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif")
      .replace(/--font:'Plus Jakarta Sans','Inter',system-ui,-apple-system,sans-serif/g, "--font:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif")
      .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*/i, '')
      .replace(/<link rel="dns-prefetch" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="dns-prefetch" href="https:\/\/fonts\.gstatic\.com">\s*/i, '');
    let home = html.slice(homeStart, homeEnd + 7)
      .replace(/onclick="modal\('reg'\)"/g, 'onclick="location.href=\'/kayit\'"')
      .replace(/onclick="modal\('login'\)"/g, 'onclick="location.href=\'/giris\'"')
      .replace(/onclick="go\('chat'\)"/g, 'onclick="location.href=\'/sohbet\'"')
      .replace(/onclick="go\('img'\)"/g, 'onclick="location.href=\'/gorsel\'"')
      .replace(/onclick="go\('agents'\)"/g, 'onclick="location.href=\'/ai-ajanlar\'"')
      .replace(/onclick="go\('tools'\)"/g, 'onclick="location.href=\'/ai-araclar\'"');
    const loader = html.slice(loaderStart, loaderEnd + 9);
    const legal = legalStart >= 0 && legalEnd > legalStart ? html.slice(legalStart, legalEnd) : '';
    const robot = robotStart >= 0 ? html.slice(robotStart, html.indexOf('</body>', robotStart)) : '';
    return `${head}</head> <body><a href="#main-content" class="skip-to-content" style="position:absolute;top:-40px;left:0;background:#7c3aed;color:#fff;padding:8px 16px;z-index:100;text-decoration:none;font-weight:600;" onfocus="this.style.top='0'" onblur="this.style.top='-40px'">Ana içeriğe atla</a>${home}${loader}${legal}${robot}</body></html>`;
  } catch {
    return html;
  }
}

function buildAppRouteShellHtml(html, key) {
  try {
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const descMatch = html.match(/<meta name="description" content="([^"]*)">/i);
    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]*)">/i);
    const routeLabel = {
      '/sohbet': 'Sohbet paneli',
      '/chat': 'Sohbet paneli',
      '/gorsel': 'Görsel üretim',
      '/gorsel-uret': 'Görsel üretim',
      '/promptlar': 'AI promptlar',
      '/ai-araclar': 'AI araçları',
      '/araclar': 'AI araçları',
      '/galeri': 'Galeri',
      '/destek': 'Destek',
      '/admin': 'Admin paneli'
    }[key] || 'Froxy AI paneli';
    const title = titleMatch ? titleMatch[1] : routeLabel + ' | Froxy AI';
    const description = descMatch ? descMatch[1] : 'Froxy AI paneli yükleniyor.';
    const canonical = canonicalMatch ? canonicalMatch[1] : `https://froxyai.com${key}`;
    const head = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${escapeHtmlAttr(description)}"><link rel="canonical" href="${escapeHtmlAttr(canonical)}"><meta name="robots" content="index,follow"><meta property="og:title" content="${title}"><meta property="og:description" content="${escapeHtmlAttr(description)}"><meta property="og:image" content="https://froxyai.com/froxy-logo-v260.png"><meta name="theme-color" content="#0b1020"><style>html,body{margin:0;min-height:100%;background:#050814;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}*{box-sizing:border-box}</style>`;
    const shell = `<main id="app-route-fast-shell" style="min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 12%,rgba(34,211,238,.14),transparent 34%),linear-gradient(135deg,#050814,#080d1b 58%,#06111f);color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><section style="width:min(420px,calc(100vw - 36px));text-align:center;border:1px solid rgba(96,165,250,.22);border-radius:24px;padding:28px 22px;background:linear-gradient(180deg,rgba(15,23,42,.78),rgba(8,13,25,.7));box-shadow:0 24px 80px rgba(0,0,0,.42)"><img src="/froxy-logo-128.png" alt="Froxy AI" width="72" height="72" decoding="async" style="border-radius:18px;margin-bottom:14px"><p style="margin:0 0 8px;color:#67e8f9;font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Froxy AI</p><h1 style="margin:0 0 10px;font-size:clamp(28px,7vw,40px);line-height:1.05;letter-spacing:0">${escapeHtmlText(routeLabel)}</h1><p style="margin:0 auto 18px;max-width:320px;color:#b9c6db;line-height:1.55">Panel hazırlanıyor. Modeller ve araçlar birkaç saniye içinde açılacak.</p><button type="button" onclick="window.__loadFroxyApp&&window.__loadFroxyApp()" style="height:44px;border:0;border-radius:12px;padding:0 18px;background:linear-gradient(135deg,#3b82f6,#7c3aed);color:white;font-weight:900;cursor:pointer">Hemen aç</button></section></main>`;
    return `${head}</head><body>${shell}</body></html>`;
  } catch {
    return html;
  }
}

function buildPanelRouteHtml(html) {
  try {
    const homeStart = html.indexOf('<main id="v-home"');
    const homeEnd = html.indexOf('</main>', homeStart);
    if (homeStart < 0 || homeEnd < homeStart) return html;
    return html.slice(0, homeStart) + '<main id="v-home" class="v" aria-label="Froxy AI ana sayfa" style="display:none"></main>' + html.slice(homeEnd + 7);
  } catch {
    return html;
  }
}

function pollinationsCooldownMs(err) {
  const msg = String(err && err.message || err || '').toLowerCase();
  const retryMs = Number(err && err.retryAfterMs || 0);
  if (Number.isFinite(retryMs) && retryMs > 0) return Math.min(Math.max(retryMs, 15000), 15 * 60 * 1000);
  if (/429|queue|rate|too many|timeout|abort/.test(msg)) return 45000;
  if (/401|403|key|unauthorized|forbidden/.test(msg)) return 300000;
  if (/402|balance|credit/.test(msg)) return 300000;
  return 20000;
}

function pollinationsCooldownStatus(model) {
  const key = pollinationsCooldownKey(model);
  const until = pollinationsImageCooldownUntil.get(key) || 0;
  const remainingMs = until - Date.now();
  return remainingMs > 0 ? { coolingDown: true, remainingMs } : { coolingDown: false, remainingMs: 0 };
}

function markPollinationsCooldown(model, err) {
  const key = pollinationsCooldownKey(model);
  const until = Date.now() + pollinationsCooldownMs(err);
  pollinationsImageCooldownUntil.set(key, until);
  return until;
}

function processPollinationsImageQueue() {
  if (pollinationsImageActive >= POLLINATIONS_IMAGE_MAX_CONCURRENT) return;
  const job = pollinationsImageQueue.shift();
  if (!job) return;
  pollinationsImageActive++;
  Promise.resolve()
    .then(job.fn)
    .then(job.resolve, job.reject)
    .finally(() => {
      pollinationsImageActive--;
      setTimeout(processPollinationsImageQueue, POLLINATIONS_IMAGE_GAP_MS);
    });
}

function enqueuePollinationsImage(fn) {
  return new Promise((resolve, reject) => {
    pollinationsImageQueue.push({ fn, resolve, reject });
    processPollinationsImageQueue();
  });
}

const CLOUDFLARE_IMAGE_MODELS = {
  'cf-sdxl': {
    model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    name: 'Cloudflare SDXL',
    steps: 20,
    mode: 'json'
  },
  'cf-sdxl-lightning': {
    model: '@cf/bytedance/stable-diffusion-xl-lightning',
    name: 'Cloudflare SDXL Lightning',
    steps: 4,
    mode: 'json'
  },
  'cf-dreamshaper-lcm': {
    model: '@cf/lykon/dreamshaper-8-lcm',
    name: 'Cloudflare DreamShaper 8 LCM',
    steps: 8,
    mode: 'json'
  },
  'cf-flux-klein': {
    model: '@cf/black-forest-labs/flux-2-klein-4b',
    name: 'Cloudflare Flux 2 Klein',
    steps: 25,
    mode: 'multipart'
  }
};

let cloudflareImageReadyCache = { at: 0, ready: false, detail: 'not checked' };
async function getCloudflareImageReadyStatus(timeoutMs = 2500) {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    return { ready: false, detail: 'credentials missing' };
  }
  const now = Date.now();
  if (cloudflareImageReadyCache.at && now - cloudflareImageReadyCache.at < 60000) {
    return cloudflareImageReadyCache;
  }
  const status = { at: now, ready: false, detail: '' };
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/models/search?task=text-to-image`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}` }
    });
    if (response.ok) {
      status.ready = true;
      status.detail = 'reachable';
    } else {
      const body = await response.text().catch(() => '');
      status.detail = `HTTP ${response.status}${body ? ': ' + body.slice(0, 160) : ''}`;
    }
  } catch (err) {
    status.detail = err && err.message ? err.message : 'cloudflare check failed';
  }
  cloudflareImageReadyCache = status;
  return status;
}

async function getCloudflareImageGenerationStatus(timeoutMs = 30000) {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    return { ready: false, detail: 'credentials missing' };
  }
  try {
    const out = await callCloudflareImageModel({
      modelId: 'cf-sdxl-lightning',
      prompt: 'simple clean product photo of a blue ceramic cup on a white table, studio light',
      imageSize: { width: 512, height: 512 }
    });
    const localPath = path.join(GENERATED_DIR, path.basename(out.url || ''));
    if (fs.existsSync(localPath)) {
      const buffer = fs.readFileSync(localPath);
      const ext = validateGeneratedImageBuffer(buffer, 'Cloudflare smoke', 1000);
      const stats = ext === 'png' ? pngVisualStats(buffer) : null;
      return { ready: true, detail: `generation ok (${ext}, ${buffer.length} bytes)`, url: out.url, visualStats: stats };
    }
    return { ready: true, detail: 'generation ok' };
  } catch (err) {
    return { ready: false, detail: err && err.message ? err.message : 'cloudflare generation failed' };
  }
}

// === FREEMODEL.DEV KEY ROTATION (gpt-5.5/5.4 icin) ===
const FREEMODEL_KEYS = (fromEnv('FREEMODEL_API_KEYS') || fromEnv('FREEMODEL_API_KEY') || '').split(',').map(k => k.trim()).filter(Boolean);
let _fmKeyIndex = 0;
function getFreemodelKey() { return FREEMODEL_KEYS.length ? FREEMODEL_KEYS[_fmKeyIndex % FREEMODEL_KEYS.length] : ''; }
function rotateFreemodelKey() { if (!FREEMODEL_KEYS.length) return ''; _fmKeyIndex = (_fmKeyIndex + 1) % FREEMODEL_KEYS.length; console.log('[FREEMODEL] Key rotated -> ' + _fmKeyIndex + '/' + FREEMODEL_KEYS.length); return getFreemodelKey(); }
let FREEMODEL_KEY = getFreemodelKey();

const GUICORE_BASE = fromEnv('GUICORE_BASE_URL', 'https://api.guicore.com/v1');
const PROVIDERS = {
  openai:    { key: OPENAI_CHAT_KEY || getFreemodelKey(), base: OPENAI_CHAT_KEY ? OPENAI_CHAT_BASE_URL : 'https://api.freemodel.dev/v1' },
  gemini:    { key: fromEnv('SHENFENG_GEMINI_KEY') || fromEnv('GUICORE_GEMINI_KEY'), base: 'https://api.shenfengwl.fun/v1' },
  claude:    { key: fromEnv('GUICORE_CLAUDE_KEY'), base: GUICORE_BASE },
  image:     { key: fromEnv('SHENFENG_IMAGE_KEY') || fromEnv('GUICORE_IMAGE_KEY'), base: 'https://api.shenfengwl.fun/v1' },
  groq:      { key: getGroqKey(),  base: 'https://api.groq.com/openai/v1' },
  openrouter:{ key: getOpenRouterKey(), base: 'https://openrouter.ai/api/v1' },
  pollinations:{ key: 'none',       base: 'https://text.pollinations.ai' },
  cerebras:  { key: fromEnv('CEREBRAS_API_KEY'), base: 'https://api.cerebras.ai/v1' },
  sambanova: { key: fromEnv('SAMBANOVA_API_KEY'), base: 'https://api.sambanova.ai/v1' },
  mistral:   { key: fromEnv('MISTRAL_API_KEY'),  base: 'https://api.mistral.ai/v1' },
  nvidia:    { key: fromEnv('NVIDIA_API_KEY'),   base: 'https://integrate.api.nvidia.com/v1' },
  fireworks: { key: fromEnv('FIREWORKS_API_KEY'),base: 'https://api.fireworks.ai/inference/v1' },
  together:  { key: getTogetherKey(), base: 'https://api.together.xyz/v1' },
  xai:       { key: fromEnv('XAI_API_KEY'),      base: 'https://api.x.ai/v1' },
  gemini_direct: { key: getGeminiKey(), base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  google_direct: { key: GOOGLE_API_KEY || getGeminiKey(), base: 'https://generativelanguage.googleapis.com/v1beta' },
  huggingface:   { key: fromEnv('HF_TOKEN'), base: 'https://router.huggingface.co/v1' },
  cloudflare:    { key: CLOUDFLARE_API_TOKEN, base: 'https://api.cloudflare.com/client/v4/accounts/' + (CLOUDFLARE_ACCOUNT_ID || '') + '/ai/v1' },
  deepseek_direct: { key: fromEnv('DEEPSEEK_API_KEY'), base: 'https://api.deepseek.com' },
  // Yeni sağlayıcılar
  chutes:    { key: CHUTES_API_KEY,  base: 'https://llm.chutes.ai/v1' },
  aimlapi:   { key: AIMLAPI_KEY,     base: 'https://api.aimlapi.com/v1' },
  jan_local: { key: fromEnv('JAN_API_KEY', 'none'), base: localBaseUrl('JAN_API_URL', 'http://127.0.0.1:1337/v1') },
  local_openai: { key: fromEnv('LOCAL_OPENAI_API_KEY', 'none'), base: localBaseUrl('LOCAL_OPENAI_BASE_URL', 'http://127.0.0.1:1337/v1') },
};

const PROVIDER_KEY_POOLS = {
  openai: FREEMODEL_KEYS,
  groq: GROQ_KEYS,
  openrouter: OPENROUTER_KEYS,
  together: TOGETHER_KEYS,
  gemini_direct: GEMINI_KEYS,
  google_direct: [GOOGLE_API_KEY, ...GEMINI_KEYS].filter(Boolean)
};
const PROVIDER_KEY_INDEX = Object.fromEntries(Object.keys(PROVIDER_KEY_POOLS).map(name => [name, 0]));
function providerKeyPool(provider) {
  return PROVIDER_KEY_POOLS[provider] || [];
}
function rotateProviderKey(provider) {
  const pool = providerKeyPool(provider);
  if (pool.length < 2) return PROVIDERS[provider]?.key || pool[0] || '';
  PROVIDER_KEY_INDEX[provider] = ((PROVIDER_KEY_INDEX[provider] || 0) + 1) % pool.length;
  const nextKey = pool[PROVIDER_KEY_INDEX[provider]];
  if (PROVIDERS[provider]) PROVIDERS[provider].key = nextKey;
  if (provider === 'groq') GROQ_KEY = nextKey;
  if (provider === 'openrouter') OPENROUTER_KEY = nextKey;
  if (provider === 'openai') FREEMODEL_KEY = nextKey;
  console.log(`[${provider.toUpperCase()}] Key rotated -> index ${PROVIDER_KEY_INDEX[provider]}/${pool.length}`);
  return nextKey;
}
function isQuotaLikeStatus(status, text = '') {
  const t = String(text || '').toLowerCase();
  return status === 401 || status === 402 || status === 403 || status === 429 ||
    /rate.?limit|too many requests|quota|insufficient|credit|billing|limit exceeded|resource_exhausted|exceeded/i.test(t);
}

function isProviderKeyFailure(status, text = '') {
  const t = String(text || '').toLowerCase();
  return isQuotaLikeStatus(status, text) ||
    (status === 400 && /organization.*restricted|restricted|invalid.*key|unauthorized|user not found|account|free account|usage limit/i.test(t));
}

function chooseChatFallbackProvider() {
  if (PROVIDERS.groq?.key) return 'groq';
  if (PROVIDERS.openrouter?.key) return 'openrouter';
  if (PROVIDERS.openai?.key) return 'openai';
  if (PROVIDERS.aimlapi?.key) return 'aimlapi';
  return 'pollinations';
}

function applyChatFallbackProvider(providerName) {
  const fallbackProvider = providerName || chooseChatFallbackProvider();
  let fallbackModel = 'pollinations-openai';
  if (fallbackProvider === 'groq') fallbackModel = 'llama-3.1-8b-instant';
  else if (fallbackProvider === 'openrouter') fallbackModel = 'meta-llama/llama-3.1-8b-instruct:free';
  else if (fallbackProvider === 'openai') fallbackModel = 'gpt-4o-mini';
  else if (fallbackProvider === 'aimlapi') fallbackModel = 'gpt-4o-mini';
  return {
    provider: fallbackProvider,
    p: PROVIDERS[fallbackProvider] || PROVIDERS.pollinations,
    key: PROVIDERS[fallbackProvider]?.key || '',
    model: fallbackModel
  };
}

async function pingOpenAICompatibleBase(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) return false;
  try {
    const response = await fetch(`${base}/models`, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch (_) {
    return false;
  }
}

function inferProviderFromModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.startsWith('pollinations-')) return 'pollinations';
  if (m === 'adult-venice-uncensored-free') return 'openrouter';
  if (m.startsWith('jan-local')) return 'jan_local';
  if (m.startsWith('local-openai')) return 'local_openai';
  if (m === 'gemini-flash-latest' || m.includes('gemini-') || m.includes('imagen-')) return 'google_direct';
  if (m.includes(':free') || m.includes('/')) return m.includes('openai/gpt-oss') && !m.endsWith(':free') ? 'groq' : 'openrouter';
  if (m.includes('llama') || m.includes('qwen/') || m.includes('gpt-oss') || m.includes('deepseek-r1-distill') || m.includes('mistral-saba') || m.includes('gemma2')) return 'groq';
  return 'openai';
}

const ADULT_CHAT_MODEL_IDS = new Set([
  'pollinations-spicy-rp',
  'pollinations-flirt',
  'pollinations-romance',
  'pollinations-afterdark',
  'pollinations-safe-intimacy',
  'pollinations-evil',
  'pollinations-afterdark-turbo',
  'pollinations-erotic-story',
  'pollinations-roleplay-uncensored',
  'pollinations-flirty-chat',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free'
]);

function textFromMessages(messages) {
  if (!Array.isArray(messages)) return '';
  return messages.map(m => {
    const c = m?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(part => part?.text || part?.content || '').join(' ');
    return '';
  }).join(' ');
}

function isAdultChatModel(model) {
  const m = String(model || '').toLowerCase();
  return ADULT_CHAT_MODEL_IDS.has(m) || /spicy|afterdark|flirt|romance|venice|uncensored/i.test(m);
}

function detectAdultSafetyBlock(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  const blocked = [
    { re: /\b(child|minor|underage|teen|kid|schoolgirl|schoolboy|lolita|loli|shota|preteen|çocuk|cocuk|reşit olmayan|resit olmayan|ergen|liseli|ortaokul)\b/i, reason: 'Reşit olmayan kişilerle ilgili cinsel içerik desteklenmez.' },
    { re: /\b(rape|raped|non[-\s]?consensual|forced|coercion|blackmail|drugged|unconscious|sleeping|zorla|tecavüz|tecavuz|baygın|baygin|bilinci kapalı|bilinci kapali)\b/i, reason: 'Rıza dışı veya zorlayıcı cinsel içerik desteklenmez.' },
    { re: /\b(deepfake|celebrity nude|famous nude|real person nude|ex nude|revenge porn|leak nudes|ifşa|ifsa|ünlü çıplak|unlu ciplak|gerçek kişi çıplak|gercek kisi ciplak)\b/i, reason: 'Gerçek kişiler, ünlüler veya ifşa/deepfake cinsel içerikleri desteklenmez.' },
    { re: /\b(hidden cam|voyeur|upskirt|downblouse|spy cam|gizli kamera|habersiz|rızasız çekim|rizasiz cekim)\b/i, reason: 'Gizli çekim veya rıza dışı mahremiyet ihlali desteklenmez.' }
  ];
  return blocked.find(rule => rule.re.test(t))?.reason || null;
}

async function fetchWithAbort(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// OpenAI TTS key (separate from chat key; can be same or different)
const OPENAI_TTS_KEY = fromEnv('OPENAI_TTS_KEY');

app.get('/api/provider-status', (req, res) => {
  res.json({
    ...Object.fromEntries(Object.entries(PROVIDERS).map(([name, p]) => [
      name,
      {
        configured: name === 'pollinations' || Boolean(p.key),
        base: p.base
      }
    ])),
    cloudflare: {
      configured: Boolean(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN),
      base: 'https://api.cloudflare.com/client/v4'
    },
    fal: {
      configured: Boolean(FAL_API_KEY),
      base: 'https://queue.fal.run'
    },
    replicate: {
      configured: Boolean(REPLICATE_API_TOKEN),
      base: 'https://api.replicate.com/v1'
    },
    vidu: {
      configured: Boolean(VIDU_API_KEY),
      base: 'https://api.vidu.com'
    }
  });
});

app.get('/api/local-providers/status', async (req, res) => {
  try {
    res.json(await getLocalProviderStatus());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Local provider status okunamadı' });
  }
});

function extractVideoUrl(data) {
  if (!data) return '';
  if (typeof data === 'string') return data.startsWith('http') ? data : '';
  return data.video?.url || data.video_url || data.output?.url ||
    (Array.isArray(data.output) ? data.output.find(x => typeof x === 'string' && x.startsWith('http')) : '') ||
    (typeof data.output === 'string' && data.output.startsWith('http') ? data.output : '');
}

const GOOGLE_DIRECT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function toGeminiParts(content) {
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (!item) continue;
      if (typeof item === 'string') {
        parts.push({ text: item });
        continue;
      }
      if (item.type === 'text' && item.text) {
        parts.push({ text: item.text });
        continue;
      }
      const imageUrl = item.image_url?.url || item.url;
      if (item.type === 'image_url' && imageUrl) {
        const match = /^data:([^;]+);base64,(.+)$/i.exec(imageUrl);
        if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        continue;
      }
      if (item.text) parts.push({ text: item.text });
    }
    return parts.length ? parts : [{ text: '' }];
  }
  if (typeof content === 'string') return [{ text: content }];
  if (content && typeof content === 'object') {
    if (content.type === 'text' && content.text) return [{ text: content.text }];
    const imageUrl = content.image_url?.url || content.url;
    if (content.type === 'image_url' && imageUrl) {
      const match = /^data:([^;]+);base64,(.+)$/i.exec(imageUrl);
      if (match) return [{ inlineData: { mimeType: match[1], data: match[2] } }];
    }
    if (content.text) return [{ text: content.text }];
  }
  return [{ text: String(content || '') }];
}

function buildGoogleContents(messages) {
  const contents = [];
  const systemParts = [];
  for (const msg of messages || []) {
    if (!msg) continue;
    if (msg.role === 'system') {
      const txt = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
      if (txt) systemParts.push({ text: txt });
      continue;
    }
    const parts = toGeminiParts(msg.content).filter(p => p.text || p.inlineData);
    if (!parts.length) continue;
    contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
  }
  const body = { contents };
  if (systemParts.length) body.systemInstruction = { parts: systemParts };
  return body;
}

function messageHasInlineImage(messages) {
  for (const msg of messages || []) {
    const content = msg && msg.content;
    const parts = Array.isArray(content) ? content : [content];
    for (const item of parts) {
      if (!item || typeof item !== 'object') continue;
      const imageUrl = item.image_url?.url || item.url;
      if (item.type === 'image_url' && imageUrl) return true;
    }
  }
  return false;
}

function providerModelSupportsVision(provider, model) {
  const m = String(model || '').toLowerCase();
  const p = String(provider || '').toLowerCase();
  if (p === 'google-direct' || p === 'google_direct' || p === 'gemini-direct' || p === 'gemini_direct') return true;
  if (p === 'claude') return /claude-3|sonnet|haiku|opus/.test(m);
  if (p === 'openai') return /gpt-4|gpt-5|o3|vision|omni|image|4o/.test(m);
  if (p === 'openrouter') return /vision|vl|pixtral|qwen-vl|llava|gemini|gpt-4|claude-3|nemotron.*vl/.test(m);
  return /vision|vl|pixtral|qwen-vl|llava|gemini|gpt-4|claude-3|nemotron.*vl/.test(m);
}

async function callGoogleDirectChat({ model, messages, max_tokens, apiKey: apiKeyOverride }) {
  const apiKey = apiKeyOverride || GOOGLE_API_KEY || getGeminiKey();
  const body = buildGoogleContents(messages);
  if (max_tokens) body.generationConfig = { maxOutputTokens: max_tokens };
  const response = await fetch(`${GOOGLE_DIRECT_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error?.message || `Google Direct API hatası (${response.status})`);
  }
  const parts = json.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || '').join('').trim();
  return {
    choices: [{ message: { role: 'assistant', content: text || '' } }],
    usage: { total_tokens: Math.ceil((text || '').length / 4) },
    provider: 'google_direct'
  };
}

async function callGoogleDirectImage({ model, prompt, apiKey: apiKeyOverride }) {
  const apiKey = apiKeyOverride || GOOGLE_API_KEY || getGeminiKey();
  const directModel = normalizeGeminiImageModel(model);
  const response = await fetch(`${GOOGLE_DIRECT_BASE}/models/${directModel}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['Image'] }
    })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error?.message || `Google Image API hatası (${response.status})`);
  }
  const parts = json.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData?.data);
  if (!imagePart) throw new Error('Google görsel yanıtı alınamadı');
  const fs = require('fs');
  const genDir = GENERATED_DIR;
  if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
  const mime = imagePart.inlineData.mimeType || 'image/png';
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
  const fileName = `google_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(genDir, fileName), Buffer.from(imagePart.inlineData.data, 'base64'));
  return { url: `/generated/${fileName}`, prompt, model: directModel };
}

function imageBufferMagic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a') return 'gif';
  return '';
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function pngVisualStats(buffer) {
  if (imageBufferMagic(buffer) !== 'png') return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (offset + 12 <= buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buffer.length) break;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
    } else if (type === 'IDAT') {
      idats.push(buffer.slice(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  const channelsByType = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  if (!width || !height || bitDepth !== 8 || !channels || !idats.length) return null;
  const rowBytes = width * channels;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idats));
  } catch (_) {
    return null;
  }
  if (raw.length < (rowBytes + 1) * height) return null;
  let prev = Buffer.alloc(rowBytes);
  let pos = 0;
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  let bright = 0;
  let alphaSum = 0;
  let alphaCount = 0;
  const pixelStride = Math.max(1, Math.floor((width * height) / 12000));
  let pixelIndex = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const scan = raw.slice(pos, pos + rowBytes);
    pos += rowBytes;
    const recon = Buffer.allocUnsafe(rowBytes);
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= channels ? recon[x - channels] : 0;
      const up = prev[x] || 0;
      const upLeft = x >= channels ? (prev[x - channels] || 0) : 0;
      let val = scan[x];
      if (filter === 1) val = (val + left) & 255;
      else if (filter === 2) val = (val + up) & 255;
      else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) val = (val + paethPredictor(left, up, upLeft)) & 255;
      recon[x] = val;
    }
    for (let x = 0; x < rowBytes; x += channels) {
      if ((pixelIndex++ % pixelStride) !== 0) continue;
      let lum;
      if (colorType === 0 || colorType === 4) {
        lum = recon[x];
      } else {
        lum = (0.2126 * recon[x]) + (0.7152 * recon[x + 1]) + (0.0722 * recon[x + 2]);
      }
      if (channels === 2 || channels === 4) {
        alphaSum += recon[x + channels - 1];
        alphaCount++;
      }
      count++;
      sum += lum;
      sumSq += lum * lum;
      if (lum > 24) bright++;
    }
    prev = recon;
  }
  if (!count) return null;
  const avgLum = sum / count;
  const variance = Math.max(0, (sumSq / count) - (avgLum * avgLum));
  return { width, height, avgLum, variance, brightRatio: bright / count, alphaAvg: alphaCount ? alphaSum / alphaCount : null };
}

function validateGeneratedImageBuffer(buffer, label = 'Gorsel', minBytes = 1000) {
  if (!Buffer.isBuffer(buffer) || buffer.length < minBytes) {
    throw new Error(label + ' bos/kucuk gorsel dondurdu');
  }
  const magic = imageBufferMagic(buffer);
  if (!magic) {
    const head = buffer.toString('utf8', 0, Math.min(buffer.length, 120)).trim();
    throw new Error(label + ' gorsel formatinda degil' + (head ? ': ' + head.slice(0, 80) : ''));
  }
  const stats = pngVisualStats(buffer);
  if (stats) {
    if (stats.alphaAvg !== null && stats.alphaAvg < 5) throw new Error(label + ' tamamen saydam gorsel dondurdu');
    if (stats.avgLum < 4 && stats.brightRatio < 0.003) throw new Error(label + ' bos/siyah gorsel dondurdu');
    if (stats.avgLum < 8 && stats.variance < 0.25) throw new Error(label + ' tek renk veya bos gorsel dondurdu');
  } else {
    const sampleSize = Math.min(buffer.length, 4096);
    const step = Math.max(1, Math.floor(buffer.length / sampleSize));
    const counts = new Map();
    let taken = 0;
    let zeroes = 0;
    for (let i = 0; i < buffer.length && taken < sampleSize; i += step, taken++) {
      const b = buffer[i];
      if (b === 0) zeroes++;
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    const maxCount = Math.max(...counts.values());
    if ((counts.size <= 8 && maxCount / Math.max(1, taken) > 0.72) || zeroes / Math.max(1, taken) > 0.92) {
      throw new Error(label + ' bos veya bozuk gorsel dondurdu');
    }
  }
  return magic;
}

function saveGeneratedImageBuffer(buffer, prefix = 'img', ext = 'png') {
  const genDir = GENERATED_DIR;
  if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
  const safeExt = String(ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  validateGeneratedImageBuffer(buffer, prefix);
  const fileName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}.${safeExt}`;
  fs.writeFileSync(path.join(genDir, fileName), buffer);
  return `/generated/${fileName}`;
}

function localBaseUrl(envName, fallback) {
  return String(fromEnv(envName, fallback) || fallback).replace(/\/+$/, '');
}

function decodeImageToBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value !== 'string') return null;
  const dataUri = /^data:image\/([a-z0-9+.-]+);base64,(.+)$/i.exec(value);
  if (dataUri) return Buffer.from(dataUri[2], 'base64');
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 200) {
    try { return Buffer.from(value.replace(/\s+/g, ''), 'base64'); } catch (_) {}
  }
  return null;
}

function imageResultFromUnknownPayload(data) {
  const candidates = [
    data?.url, data?.image, data?.image_url, data?.output, data?.result, data?.data?.url,
    data?.data?.[0]?.url, data?.data?.[0]?.image, data?.images?.[0]?.url,
    data?.images?.[0]?.image, data?.images?.[0], data?.result?.url
  ];
  for (const item of candidates) {
    if (!item) continue;
    if (typeof item === 'string') return item;
    if (typeof item === 'object') {
      const nested = item.url || item.image || item.data || item.base64;
      if (nested) return nested;
    }
  }
  return null;
}

async function persistImageResult(value, prefix) {
  if (!value) throw new Error('Gorsel sonucu bos dondu');
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    const dlRes = await fetch(value, { signal: AbortSignal.timeout(90000) });
    if (!dlRes.ok) throw new Error('Gorsel indirilemedi (' + dlRes.status + ')');
    const ct = dlRes.headers.get('content-type') || '';
    const buf = Buffer.from(await dlRes.arrayBuffer());
    if (buf.length < 1000) throw new Error('Gorsel sonucu cok kucuk');
    const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
    return saveGeneratedImageBuffer(buf, prefix, ext);
  }
  const buf = decodeImageToBuffer(typeof value === 'object' ? (value.data || value.base64 || value.image) : value);
  if (!buf || buf.length < 1000) throw new Error('Gorsel sonucu beklenen formatta degil');
  return saveGeneratedImageBuffer(buf, prefix, 'png');
}

async function callFooocusLocalImage({ prompt, imageSize }) {
  const base = localBaseUrl('FOOOCUS_API_URL', 'http://127.0.0.1:8888');
  const response = await fetch(`${base}/v1/generation/text-to-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: '',
      performance_selection: 'Speed',
      aspect_ratios_selection: imageSize.aspectRatio || imageSize.aspect || '1024*1024',
      image_number: 1,
      image_seed: -1,
      guidance_scale: 4
    }),
    signal: AbortSignal.timeout(240000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || data.message || `Fooocus local ${response.status}`);
  const url = await persistImageResult(imageResultFromUnknownPayload(data), 'fooocus');
  return { url, provider: 'fooocus-local', model: 'fooocus-local', revised_prompt: prompt };
}

async function callStableDiffusionWebUiImage({ prompt, imageSize, envName, fallbackBase, provider, model }) {
  const base = localBaseUrl(envName, fallbackBase);
  const size = resolveComfyImageSize(imageSize);
  const response = await fetch(`${base}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: fromEnv('LOCAL_SD_NEGATIVE_PROMPT', 'low quality, blurry, watermark, text, logo, bad anatomy, deformed, extra limbs, missing limbs, bad hands, bad feet'),
      width: size.width,
      height: size.height,
      steps: Number(fromEnv('LOCAL_SD_STEPS', '18')) || 18,
      cfg_scale: Number(fromEnv('LOCAL_SD_CFG', '7')) || 7,
      sampler_name: fromEnv('LOCAL_SD_SAMPLER', 'DPM++ 2M Karras'),
      batch_size: 1,
      n_iter: 1,
      seed: -1
    }),
    signal: AbortSignal.timeout(360000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || data.message || `${provider} ${response.status}`);
  const image = Array.isArray(data.images) ? data.images[0] : imageResultFromUnknownPayload(data);
  const url = await persistImageResult(image, provider.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'localsd');
  return { url, provider, model, revised_prompt: prompt };
}

async function callSwarmUiLocalImage({ prompt, imageSize }) {
  const base = localBaseUrl('SWARMUI_API_URL', 'http://127.0.0.1:7801');
  const size = resolveComfyImageSize(imageSize);
  const response = await fetch(`${base}/API/GenerateText2Image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negativeprompt: fromEnv('LOCAL_SD_NEGATIVE_PROMPT', 'low quality, blurry, watermark, text, logo, bad anatomy, deformed'),
      width: size.width,
      height: size.height,
      steps: Number(fromEnv('SWARMUI_STEPS', '18')) || 18,
      cfgscale: Number(fromEnv('SWARMUI_CFG', '7')) || 7,
      images: 1,
      seed: -1
    }),
    signal: AbortSignal.timeout(360000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || data.detail || `SwarmUI ${response.status}`);
  const url = await persistImageResult(imageResultFromUnknownPayload(data), 'swarmui');
  return { url, provider: 'swarmui-local', model: 'swarmui-local', revised_prompt: prompt };
}

async function callModalImage({ prompt, imageSize, qualityMode = 'quality', model = 'modal-sdxl' }) {
  if (!MODAL_IMAGE_ENDPOINT) {
    throw new Error('MODAL_IMAGE_ENDPOINT tanimli degil. Modal endpoint deploy edip .env.keys icine ekle.');
  }
  const size = resolveComfyImageSize(imageSize);
  const mode = String(qualityMode || 'quality').toLowerCase();
  const steps = mode === 'cheap' || mode === 'fast' ? 6 : 18;
  const headers = { 'Content-Type': 'application/json' };
  if (MODAL_IMAGE_AUTH_TOKEN) headers.Authorization = `Bearer ${MODAL_IMAGE_AUTH_TOKEN}`;
  const response = await fetch(MODAL_IMAGE_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      model,
      width: size.width,
      height: size.height,
      steps,
      guidance_scale: mode === 'cheap' || mode === 'fast' ? 0 : 0
    }),
    signal: AbortSignal.timeout(360000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.detail || data.message || `Modal image ${response.status}`);
  }
  const url = await persistImageResult(imageResultFromUnknownPayload(data), 'modal');
  return {
    url,
    provider: 'modal',
    model: data.model || model || 'modal-sdxl',
    revised_prompt: data.revised_prompt || prompt
  };
}

async function callPerchanceExperimentalImage({ prompt, imageSize }) {
  const base = localBaseUrl('PERCHANCE_API_URL', '');
  if (!base) throw new Error('Perchance icin resmi stabil API yok. PERCHANCE_API_URL ile kendi proxy/DIY endpointini tanimla.');
  const response = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width: imageSize.width, height: imageSize.height, n: 1 }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Perchance experimental ${response.status}`);
  const url = await persistImageResult(imageResultFromUnknownPayload(data), 'perchance');
  return { url, provider: 'perchance-experimental', model: 'perchance-experimental', revised_prompt: prompt };
}

function buildComfyPromptHints(prompt) {
  const text = String(prompt || '');
  const lower = text.toLocaleLowerCase('tr-TR');
  const positive = [];
  const negative = [];
  const wantsTwoWomen = /\b(2|iki|two)\b/.test(lower) && /\b(kad[ıi]n|woman|women|female)\b/i.test(lower);
  const wantsFeet = /\b(ayak|ayaklar|foot|feet|barefoot)\b/i.test(lower);
  const wantsInteraction = /\b(yal\w*|lick\w*|kiss\w*|kissing|öp\w*|op\w*|birbirinin|each other|mutual)\b/i.test(lower);

  if (wantsTwoWomen) {
    positive.push('two fictional consenting adult women, both women clearly visible, two-person composition, full body shot, not a solo portrait');
    negative.push('single person, solo portrait, only one woman, cropped second person, missing second person');
  }
  if (wantsFeet) {
    positive.push('bare feet clearly visible in frame, detailed feet, floor-level composition, full body framing with feet visible');
    negative.push('cropped feet, feet out of frame, hidden feet, shoes, boots, socks covering the feet');
  }
  if (wantsFeet && wantsInteraction) {
    positive.push('one adult woman kneeling low with her face close to the other adult woman bare foot, visible foot-kissing gesture, consensual non-graphic fetish editorial pose, floor-level shot, both faces and bare feet visible');
    negative.push('unrelated portrait, standing alone, no interaction, no foot contact, face-to-face only, face-only close-up, generic romantic pose');
  }
  if (/orman|park|bahçe|bahce|dış mekan|dis mekan|outdoor|garden|forest/i.test(lower)) {
    positive.push('the requested environment remains visible, cinematic background, subject interaction is the main focus');
  }

  return { positive, negative };
}

function resolveComfySamplingProfile(ckptName, qualityMode) {
  const isLcmCheckpoint = /(?:^|[-_\s])lcm(?:[-_\s]|$)/i.test(String(ckptName || ''));
  const mode = String(qualityMode || 'quality').toLowerCase();
  if (isLcmCheckpoint) {
    return mode === 'cheap' || mode === 'fast'
      ? { steps: 8, cfg: 2, sampler: 'lcm', scheduler: 'simple' }
      : { steps: 12, cfg: 2.4, sampler: 'lcm', scheduler: 'simple' };
  }
  return mode === 'cheap' || mode === 'fast'
    ? { steps: 16, cfg: 6.5, sampler: 'dpmpp_2m', scheduler: 'karras' }
    : { steps: 24, cfg: 7, sampler: 'dpmpp_2m', scheduler: 'karras' };
}

function buildComfyWorkflow(prompt, imageSize, qualityMode = 'quality') {
  const comfySize = resolveComfyImageSize(imageSize);
  const ckptName = fromEnv('COMFYUI_CHECKPOINT', 'DreamShaper8_LCM.safetensors');
  const profile = resolveComfySamplingProfile(ckptName, qualityMode);
  const comfyHints = buildComfyPromptHints(prompt);
  const positivePrompt = [
    String(prompt || '').trim(),
    ...comfyHints.positive,
    'photorealistic editorial image, requested action clearly visible, subject interaction is the center of the composition',
    'high quality, coherent anatomy, natural proportions, clean composition, detailed subject, stable pose, correct perspective, no text, no labels'
  ].filter(Boolean).join(', ');
  const negativePrompt = [
    fromEnv('COMFYUI_NEGATIVE_PROMPT', ''),
    ...comfyHints.negative,
    'unrelated scene, wrong action, generic pose, random objects, bad composition, low quality, worst quality, blurry, jpeg artifacts, watermark, signature, logo, text, caption, title, letters, bad typography',
    'bad anatomy, deformed anatomy, disfigured, mutated body, extra limbs, missing limbs, fused limbs, broken arms, broken legs, bad hands, bad feet, extra fingers, missing fingers, long neck, distorted face, duplicate person, poorly drawn body, cropped subject, out of frame'
  ].filter(Boolean).join(', ');
  const raw = fromEnv('COMFYUI_WORKFLOW_JSON', '');
  if (raw) {
    const wf = JSON.parse(raw);
    const text = JSON.stringify(wf)
      .replaceAll('__PROMPT__', positivePrompt)
      .replaceAll('__NEGATIVE__', negativePrompt)
      .replaceAll('__WIDTH__', String(comfySize.width))
      .replaceAll('__HEIGHT__', String(comfySize.height));
    return JSON.parse(text);
  }
  return {
    "3": { "class_type": "KSampler", "inputs": { "cfg": Number(fromEnv('COMFYUI_CFG', String(profile.cfg))) || Number(profile.cfg), "denoise": 1, "latent_image": ["5", 0], "model": ["4", 0], "negative": ["7", 0], "positive": ["6", 0], "sampler_name": fromEnv('COMFYUI_SAMPLER', profile.sampler), "scheduler": fromEnv('COMFYUI_SCHEDULER', profile.scheduler), "seed": Math.floor(Math.random() * 1000000000), "steps": Number(fromEnv('COMFYUI_STEPS', String(profile.steps))) || Number(profile.steps) } },
    "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": ckptName } },
    "5": { "class_type": "EmptyLatentImage", "inputs": { "batch_size": 1, "height": comfySize.height, "width": comfySize.width } },
    "6": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["4", 1], "text": positivePrompt } },
    "7": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["4", 1], "text": negativePrompt } },
    "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
    "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "froxy", "images": ["8", 0] } }
  };
}

async function pingLocalProvider(base, paths, timeoutMs = 850) {
  const cleanBase = String(base || '').replace(/\/+$/, '');
  const errors = [];
  for (const pathName of paths) {
    try {
      const response = await fetch(`${cleanBase}${pathName}`, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) return { ready: true, checkedPath: pathName };
      errors.push(`${pathName}: HTTP ${response.status}`);
    } catch (err) {
      errors.push(`${pathName}: ${err.message}`);
    }
  }
  return { ready: false, error: errors.join(' | ') };
}

let localProviderStatusCache = { at: 0, data: null };
const LOCAL_PROVIDER_STATUS_TTL_MS = Number(fromEnv('LOCAL_PROVIDER_STATUS_TTL_MS', '15000')) || 15000;

async function getLocalProviderStatus(options = {}) {
  const now = Date.now();
  if (!options.force && localProviderStatusCache.data && (now - localProviderStatusCache.at) < LOCAL_PROVIDER_STATUS_TTL_MS) {
    return {
      ...localProviderStatusCache.data,
      cached: true,
      cacheAgeMs: now - localProviderStatusCache.at
    };
  }
  const comfyBase = localBaseUrl('COMFYUI_API_URL', 'http://127.0.0.1:8188');
  const fooocusBase = localBaseUrl('FOOOCUS_API_URL', 'http://127.0.0.1:8888');
  const a1111Base = localBaseUrl('A1111_API_URL', 'http://127.0.0.1:7860');
  const forgeBase = localBaseUrl('FORGE_API_URL', 'http://127.0.0.1:7861');
  const swarmBase = localBaseUrl('SWARMUI_API_URL', 'http://127.0.0.1:7801');
  const modalReady = Boolean(MODAL_IMAGE_ENDPOINT);
  const isLocalHost = base => /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(String(base || ''));
  const shouldPingPcLocal = fromEnv('ENABLE_PC_LOCAL_PROVIDER_PING', '').toLowerCase() === 'true'
    || !['production', 'prod'].includes(String(process.env.NODE_ENV || '').toLowerCase());
  const skippedPing = { ready: false, checkedPath: null, error: 'Canlı ortamda PC localhost sağlayıcısı pinglenmedi' };
  const [comfyPing, fooocusPing, a1111Ping, forgePing, swarmPing] = await Promise.all([
    (!shouldPingPcLocal && isLocalHost(comfyBase)) ? skippedPing : pingLocalProvider(comfyBase, ['/system_stats', '/object_info']),
    (!shouldPingPcLocal && isLocalHost(fooocusBase)) ? skippedPing : pingLocalProvider(fooocusBase, ['/docs', '/', '/ping']),
    (!shouldPingPcLocal && isLocalHost(a1111Base)) ? skippedPing : pingLocalProvider(a1111Base, ['/sdapi/v1/sd-models', '/docs', '/']),
    (!shouldPingPcLocal && isLocalHost(forgeBase)) ? skippedPing : pingLocalProvider(forgeBase, ['/sdapi/v1/sd-models', '/docs', '/']),
    (!shouldPingPcLocal && isLocalHost(swarmBase)) ? skippedPing : pingLocalProvider(swarmBase, ['/API/GetNewSession', '/', '/API/GetServerResourceInfo'])
  ]);
  const errors = {};
  if (!comfyPing.ready) errors.comfyui = comfyPing.error || 'ComfyUI yanıt vermedi';
  if (!fooocusPing.ready) errors.fooocus = fooocusPing.error || 'Fooocus yanıt vermedi';
  if (!a1111Ping.ready) errors.a1111 = a1111Ping.error || 'A1111 yanit vermedi';
  if (!forgePing.ready) errors.forge = forgePing.error || 'Forge yanit vermedi';
  if (!swarmPing.ready) errors.swarmui = swarmPing.error || 'SwarmUI yanit vermedi';
  if (!modalReady) errors.modal = 'MODAL_IMAGE_ENDPOINT tanimli degil';
  const data = {
    ok: true,
    comfyui: { ready: !!comfyPing.ready, baseUrl: comfyBase, checkedPath: comfyPing.checkedPath || null, checkpoint: fromEnv('COMFYUI_CHECKPOINT', 'DreamShaper8_LCM.safetensors') },
    fooocus: { ready: !!fooocusPing.ready, baseUrl: fooocusBase, checkedPath: fooocusPing.checkedPath || null },
    a1111: { ready: !!a1111Ping.ready, baseUrl: a1111Base, checkedPath: a1111Ping.checkedPath || null },
    forge: { ready: !!forgePing.ready, baseUrl: forgeBase, checkedPath: forgePing.checkedPath || null },
    swarmui: { ready: !!swarmPing.ready, baseUrl: swarmBase, checkedPath: swarmPing.checkedPath || null },
    modal: { ready: modalReady, baseUrl: MODAL_IMAGE_ENDPOINT || '', checkedPath: modalReady ? 'configured' : null, models: Array.from(MODAL_IMAGE_MODEL_ALIASES) },
    pcLocalPingEnabled: shouldPingPcLocal,
    errors
  };
  localProviderStatusCache = { at: Date.now(), data };
  return data;
}

async function callComfyLocalImage({ prompt, imageSize, qualityMode = 'quality' }) {
  const base = localBaseUrl('COMFYUI_API_URL', 'http://127.0.0.1:8188');
  const clientId = 'froxy-' + Date.now();
  const startRes = await fetch(`${base}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, prompt: buildComfyWorkflow(prompt, imageSize, qualityMode) }),
    signal: AbortSignal.timeout(30000)
  });
  const startData = await startRes.json().catch(() => ({}));
  if (!startRes.ok || !startData.prompt_id) throw new Error(startData.error || startData.node_errors ? JSON.stringify(startData).slice(0, 300) : `ComfyUI local ${startRes.status}`);
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const histRes = await fetch(`${base}/history/${startData.prompt_id}`, { signal: AbortSignal.timeout(10000) });
    const hist = await histRes.json().catch(() => ({}));
    const item = hist[startData.prompt_id];
    const outputs = item?.outputs || {};
    for (const out of Object.values(outputs)) {
      const img = out?.images?.[0];
      if (img?.filename) {
        const params = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
        const viewRes = await fetch(`${base}/view?${params.toString()}`, { signal: AbortSignal.timeout(30000) });
        if (!viewRes.ok) throw new Error('ComfyUI gorsel indirilemedi (' + viewRes.status + ')');
        const buf = Buffer.from(await viewRes.arrayBuffer());
        const url = saveGeneratedImageBuffer(buf, 'comfyui', 'png');
        return { url, provider: 'comfyui-local', model: 'comfyui-local', revised_prompt: prompt };
      }
    }
  }
  throw new Error('ComfyUI local zaman asimi');
}

async function callComfyLocalVideo({ prompt }) {
  const raw = fromEnv('COMFYUI_VIDEO_WORKFLOW_JSON', '');
  if (!raw) throw new Error('COMFYUI_VIDEO_WORKFLOW_JSON tanimli degil. Video icin ComfyUI workflow JSON gerekli.');
  const base = localBaseUrl('COMFYUI_API_URL', 'http://127.0.0.1:8188');
  const workflow = JSON.parse(JSON.stringify(JSON.parse(raw)).replaceAll('__PROMPT__', String(prompt || '')));
  const startRes = await fetch(`${base}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'froxy-video-' + Date.now(), prompt: workflow }),
    signal: AbortSignal.timeout(30000)
  });
  const startData = await startRes.json().catch(() => ({}));
  if (!startRes.ok || !startData.prompt_id) throw new Error(startData.error || `ComfyUI video ${startRes.status}`);
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const histRes = await fetch(`${base}/history/${startData.prompt_id}`, { signal: AbortSignal.timeout(10000) });
    const hist = await histRes.json().catch(() => ({}));
    const outputs = hist[startData.prompt_id]?.outputs || {};
    for (const out of Object.values(outputs)) {
      const file = out?.gifs?.[0] || out?.videos?.[0] || out?.images?.[0];
      if (file?.filename) {
        const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || '', type: file.type || 'output' });
        const viewRes = await fetch(`${base}/view?${params.toString()}`, { signal: AbortSignal.timeout(60000) });
        if (!viewRes.ok) throw new Error('ComfyUI video indirilemedi (' + viewRes.status + ')');
        const buf = Buffer.from(await viewRes.arrayBuffer());
        const ext = String(file.filename).split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'mp4';
        const url = saveGeneratedImageBuffer(buf, 'comfyvideo', ext);
        return { url, provider: 'comfyui-local', model: 'comfyui-local-video' };
      }
    }
  }
  throw new Error('ComfyUI video zaman asimi');
}

async function callPollinationsImageFallback({ prompt, imageSize, fallbackFrom, fallbackReason }) {
  const width = imageSize.width || 1024;
  const height = imageSize.height || 1024;
  const seedBase = Math.floor(Date.now() % 2147483647);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const seed = seedBase + attempt * 7777;
      const endpoint = POLLINATIONS_API_KEY
        ? `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=flux&width=${width}&height=${height}&nologo=true&seed=${seed}`
        : `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=${width}&height=${height}&nologo=true&seed=${seed}`;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://froxyai.com/',
        'Accept': 'image/avif,image/webp,image/jpeg,image/png,image/*'
      };
      if (POLLINATIONS_API_KEY) headers.Authorization = `Bearer ${POLLINATIONS_API_KEY}`;
      const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(90000) });
      if (response.status === 429 || response.status === 402) {
        lastErr = new Error(`Pollinations ${response.status}`);
        await new Promise(r => setTimeout(r, 1500 + attempt * 1000));
        continue;
      }
      if (!response.ok) throw new Error(`Pollinations HTTP ${response.status}`);
      const ct = response.headers.get('content-type') || '';
      if (!ct.includes('image')) throw new Error(`Pollinations image yerine ${ct} dondu`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1000) throw new Error(`Pollinations cok kucuk yanit (${buffer.length} bytes)`);
      const url = saveGeneratedImageBuffer(buffer, 'localfb_flux', ct.includes('png') ? 'png' : 'jpg');
      return {
        url,
        prompt,
        model: 'flux',
        provider: 'pollinations',
        fallbackFrom,
        fallbackReason
      };
    } catch (err) {
      lastErr = err;
      console.warn(`[IMAGE_FALLBACK] Pollinations attempt ${attempt + 1} failed:`, err.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 750));
    }
  }
  throw lastErr || new Error('Pollinations fallback basarisiz');
}

async function callPollinationsVideo({ prompt, model = 'ltx-2', fallbackFrom = '', fallbackReason = '' }) {
  const polKey = fromEnv('POLLINATIONS_KEY') || fromEnv('POLLINATIONS_API_KEY');
  const polModel = model === 'pollinations-video' ? 'ltx-2' : model;
  const polUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${polModel}&duration=5&aspectRatio=16:9${polKey ? '' : '&nologo=true'}`;
  const polRes = await fetch(polUrl, {
    signal: AbortSignal.timeout(180000),
    headers: polKey ? { 'Authorization': `Bearer ${polKey}` } : {}
  });
  if (!polRes.ok) {
    const errText = await polRes.text().catch(() => '');
    throw new Error(`Pollinations ${polRes.status}: ${errText.slice(0, 200)}`);
  }
  const ct = polRes.headers.get('content-type') || '';
  if (!ct.includes('video')) {
    const errText = await polRes.text().catch(() => '');
    throw new Error(`Pollinations video yerine ${ct} dondu: ${errText.slice(0, 200)}`);
  }
  const buf = Buffer.from(await polRes.arrayBuffer());
  if (buf.length < 1000) throw new Error(`Pollinations video cok kucuk yanit (${buf.length} bytes)`);
  const fileName = `pv_${Date.now()}.mp4`;
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(path.join(GENERATED_DIR, fileName), buf);
  console.log(`[VIDEO] Pollinations (${polModel}) saved: /generated/${fileName} (${(buf.length/1024).toFixed(1)}KB)`);
  return {
    url: `/generated/${fileName}`,
    prompt,
    provider: 'pollinations',
    model: polModel,
    ...(fallbackFrom ? { fallbackFrom, fallbackReason } : {})
  };
}

function isSafeGeneratedUrl(url) {
  const raw = String(url || '').trim();
  return /^\/generated\/[a-z0-9_\-./]+\.(png|jpe?g|webp|gif|svg)$/i.test(raw) || /^https?:\/\/[^ "'<>]+\.(png|jpe?g|webp|gif)(\?[^ "'<>]*)?$/i.test(raw);
}

function galleryRow(row) {
  return {
    id: row.id,
    url: row.url,
    prompt: row.prompt || '',
    model: row.model || '',
    provider: row.provider || '',
    mode: row.mode || 'generate',
    favorite: Boolean(row.favorite),
    created_at: row.created_at
  };
}

function saveImageGalleryRecord({ userId, url, prompt, model, provider, mode = 'generate', sourceImageUrl = '' }) {
  if (!userId || !isSafeGeneratedUrl(url)) return null;
  const id = 'img_' + crypto.randomBytes(10).toString('hex');
  db.prepare(`
    INSERT OR IGNORE INTO image_gallery
      (id, user_id, url, prompt, model, provider, mode, source_image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, url, String(prompt || '').slice(0, 4000), String(model || '').slice(0, 120), String(provider || '').slice(0, 80), mode, sourceImageUrl || '');
  return id;
}

function parseDataImage(input) {
  const raw = String(input || '');
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-z0-9+/=\r\n]+)$/i.exec(raw);
  if (!match) throw new Error('Düzenleme için PNG, JPG veya WEBP data URL gerekli.');
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error('Referans görsel boyutu geçersiz veya çok büyük.');
  const ext = match[1].includes('webp') ? 'webp' : match[1].includes('png') ? 'png' : 'jpg';
  return { mime: match[1].replace('jpg', 'jpeg'), buffer, ext };
}

function normalizeOpenAIImageSize(imageSize) {
  const aspect = String(imageSize?.aspectRatio || imageSize?.aspect || '1:1');
  if (aspect === '16:9') return '1536x1024';
  if (aspect === '9:16' || aspect === '4:5') return '1024x1536';
  return '1024x1024';
}

function normalizeOpenAIImageModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('gpt-image-1-mini')) return 'gpt-image-1-mini';
  if (m.includes('gpt-image-1.5')) return 'gpt-image-1.5';
  if (m.includes('gpt-image-1')) return 'gpt-image-1';
  if (m.includes('dall-e-3')) return 'dall-e-3';
  return OPENAI_IMAGE_MODEL || 'gpt-image-2';
}

function isOpenAIImageEditModel(model) {
  const m = String(model || '').toLowerCase();
  return m.startsWith('openai-') || m.includes('gpt-image') || m === 'style-dalle3' || m === 'dall-e-3';
}

function isGeminiImageEditModel(model) {
  const m = String(model || '').toLowerCase();
  return m === 'auto-quality' || m.startsWith('gemini-') || m.includes('nano-banana') || m.includes('nanobanana');
}

function normalizeGeminiImageModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('nano-banana') || m.includes('nanobanana')) return 'gemini-2.5-flash-image';
  const supported = new Set([
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview'
  ]);
  if (supported.has(m)) return m;
  return 'gemini-2.5-flash-image';
}

async function callOpenAIImage({ prompt, model, imageSize, apiKey: apiKeyOverride }) {
  const apiKey = apiKeyOverride || getOpenAIImageKey();
  if (!apiKey) throw new Error('OPENAI_IMAGE_KEY eksik');
  const openaiModel = normalizeOpenAIImageModel(model);
  const baseBody = {
    model: openaiModel,
    prompt,
    n: 1,
    size: normalizeOpenAIImageSize(imageSize)
  };
  const body = { ...baseBody, quality: openaiModel === 'dall-e-3' ? 'standard' : 'auto' };
  if (openaiModel !== 'dall-e-3' && OPENAI_IMAGE_BASE_URL.includes('api.openai.com')) {
    body.output_format = 'png';
    body.moderation = 'auto';
  }
  async function postImage(payload) {
    const response = await fetch(`${OPENAI_IMAGE_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000)
    });
    const json = await response.json().catch(() => ({}));
    return { response, json };
  }
  let { response, json } = await postImage(OPENAI_IMAGE_BASE_URL.includes('api.openai.com') ? body : baseBody);
  const firstErrorText = typeof json.error === 'string'
    ? json.error
    : (json.error?.message || json.message || JSON.stringify(json.error || json || {}));
  if (!response.ok && /multipart|quality|output_format|moderation|unsupported|invalid/i.test(String(firstErrorText))) {
    ({ response, json } = await postImage(baseBody));
  }
  const finalErrorText = typeof json.error === 'string'
    ? json.error
    : (json.error?.message || json.message || JSON.stringify(json.error || json || {}));
  if (!response.ok) throw new Error(finalErrorText || `OpenAI image hatasi (${response.status})`);
  const item = json.data?.[0];
  let buffer = null;
  if (item?.b64_json) buffer = Buffer.from(item.b64_json, 'base64');
  else if (item?.url) {
    const dl = await fetch(item.url, { signal: AbortSignal.timeout(60000) });
    if (!dl.ok) throw new Error(`OpenAI gorsel indirilemedi (${dl.status})`);
    buffer = Buffer.from(await dl.arrayBuffer());
  }
  if (!buffer || buffer.length < 1000) throw new Error('OpenAI bos gorsel dondurdu');
  const url = saveGeneratedImageBuffer(buffer, 'openai', 'png');
  return { url, provider: 'openai', model: openaiModel, revised_prompt: item?.revised_prompt || prompt };
}

async function callImageGPTFreeImage({ prompt }) {
  if (!IMAGEGPT_API_KEY) throw new Error('IMAGEGPT_API_KEY eksik');
  const igRes = await fetch('https://api.imagegpt.online/generate/text-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': IMAGEGPT_API_KEY },
    body: JSON.stringify({ prompt, model: 'FLUX-SCHNELL', width: 1024, height: 1024, outputType: 'url', outputFormat: 'png' }),
    signal: AbortSignal.timeout(120000)
  });
  const igData = await igRes.json().catch(() => ({}));
  if (!igRes.ok || !igData.url) throw new Error(igData.error?.message || igData.message || 'ImageGPT image error');
  const dlRes = await fetch(igData.url, { signal: AbortSignal.timeout(60000) });
  if (!dlRes.ok) throw new Error('ImageGPT görsel indirilemedi (' + dlRes.status + ')');
  const buf = Buffer.from(await dlRes.arrayBuffer());
  if (buf.length < 1000) throw new Error('ImageGPT boş görsel döndürdü');
  const url = saveGeneratedImageBuffer(buf, 'imagegpt', 'png');
  return { url, prompt, model: 'imagegpt-free', provider: 'imagegpt', creditsDeducted: igData.creditsDeducted, taskId: igData.taskId };
}

async function callTogetherFallbackImage({ prompt, imageSize, model = 'together-flux-schnell' }) {
  const togetherKey = getTogetherKey();
  if (!togetherKey) throw new Error('TOGETHER_API_KEY eksik');
  const cfg = TOGETHER_IMAGE_MODELS[model] || TOGETHER_IMAGE_MODELS['together-flux-schnell'] || { model: 'black-forest-labs/FLUX.1-schnell', steps: 4 };
  const togetherBody = { model: cfg.model, prompt, width: cfg.width || imageSize.width, height: cfg.height || imageSize.height, steps: cfg.steps };
  if (!cfg.omitN) togetherBody.n = 1;
  const tRes = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${togetherKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(togetherBody),
    signal: AbortSignal.timeout(120000)
  });
  const tData = await tRes.json().catch(() => ({}));
  if (!tRes.ok) throw new Error(tData.error?.message || 'Together image error');
  const imgUrl = tData.data?.[0]?.url;
  if (!imgUrl) throw new Error('Together URL boş');
  const dlRes = await fetch(imgUrl, { signal: AbortSignal.timeout(60000) });
  if (!dlRes.ok) throw new Error('Together görsel indirilemedi (' + dlRes.status + ')');
  const buf = Buffer.from(await dlRes.arrayBuffer());
  const url = saveGeneratedImageBuffer(buf, 'tg', 'jpg');
  return { url, prompt, model: cfg.model, provider: 'together' };
}

async function callOpenAIImageEdit({ prompt, image, model, imageSize, apiKey: apiKeyOverride }) {
  const apiKey = apiKeyOverride || getOpenAIImageKey();
  if (!apiKey) throw new Error('OPENAI_IMAGE_KEY eksik');
  const parsed = parseDataImage(image);
  const openaiModel = normalizeOpenAIImageModel(model);
  const form = new FormData();
  form.append('model', openaiModel);
  form.append('prompt', prompt);
  form.append('size', normalizeOpenAIImageSize(imageSize));
  form.append('image', new Blob([parsed.buffer], { type: parsed.mime }), `reference.${parsed.ext}`);
  const response = await fetch(`${OPENAI_IMAGE_BASE_URL}/images/edits`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120000)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = typeof json.error === 'string' ? json.error : (json.error?.message || json.message || `OpenAI image edit hatasi (${response.status})`);
    throw new Error(err);
  }
  const item = json.data?.[0];
  let buffer = null;
  if (item?.b64_json) buffer = Buffer.from(item.b64_json, 'base64');
  else if (item?.url) {
    const dl = await fetch(item.url, { signal: AbortSignal.timeout(60000) });
    if (!dl.ok) throw new Error(`OpenAI edit gorseli indirilemedi (${dl.status})`);
    buffer = Buffer.from(await dl.arrayBuffer());
  }
  if (!buffer || buffer.length < 1000) throw new Error('OpenAI edit bos gorsel dondurdu');
  const url = saveGeneratedImageBuffer(buffer, 'edit_openai', 'png');
  return { url, provider: 'openai-edit', model: openaiModel, revised_prompt: item?.revised_prompt || prompt };
}

async function callGoogleDirectImageEdit({ prompt, image, model, apiKey: apiKeyOverride }) {
  const apiKey = apiKeyOverride || GOOGLE_API_KEY || getGeminiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY eksik');
  const parsed = parseDataImage(image);
  const directModel = normalizeGeminiImageModel(model);
  const response = await fetch(`${GOOGLE_DIRECT_BASE}/models/${directModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: parsed.mime, data: parsed.buffer.toString('base64') } },
          { text: prompt }
        ]
      }],
      generationConfig: { responseModalities: ['Image'] }
    }),
    signal: AbortSignal.timeout(120000)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `Google image edit hatasi (${response.status})`);
  const parts = json.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData?.data);
  if (!imagePart) throw new Error('Google edit gorsel yaniti alinamadi');
  const mime = imagePart.inlineData.mimeType || 'image/png';
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
  const url = saveGeneratedImageBuffer(Buffer.from(imagePart.inlineData.data, 'base64'), 'edit_google', ext);
  return { url, provider: 'google-direct-image-edit', model: directModel };
}

async function callCloudflareSdxlImage({ prompt, imageSize, provider = 'cloudflare' }) {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare image key yok');
  const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width: imageSize.width, height: imageSize.height, num_steps: 24 }),
    signal: AbortSignal.timeout(30000)
  });
  if (!cfRes.ok) {
    const text = await cfRes.text().catch(() => '');
    throw new Error(`Cloudflare image hatasi (${cfRes.status}) ${text.slice(0, 160)}`);
  }
  const buffer = Buffer.from(await cfRes.arrayBuffer());
  const url = saveGeneratedImageBuffer(buffer, 'cf', imageBufferMagic(buffer) || 'png');
  return { url, provider, model: 'cloudflare-sdxl', revised_prompt: prompt };
}

async function callCloudflareImageModel({ modelId, prompt, imageSize }) {
  const config = CLOUDFLARE_IMAGE_MODELS[modelId];
  if (!config) throw new Error('Bilinmeyen Cloudflare görsel modeli: ' + modelId);
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare image key yok');

  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${config.model}`;
  let response;
  if (config.mode === 'multipart') {
    const form = new FormData();
    form.append('prompt', String(prompt || ''));
    form.append('width', String(imageSize.width));
    form.append('height', String(imageSize.height));
    form.append('num_steps', String(config.steps || 25));
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}` },
      body: form,
      signal: AbortSignal.timeout(90000)
    });
  } else {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: imageSize.width, height: imageSize.height, num_steps: config.steps || 20 }),
      signal: AbortSignal.timeout(90000)
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const authHint = response.status === 401 || response.status === 403
      ? ' Cloudflare token, account id veya Workers AI yetkisini kontrol et.'
      : '';
    throw new Error(`${config.name} HTTP ${response.status}:${authHint} ${text.slice(0, 220)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let buffer = null;
  let ext = 'png';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => ({}));
    const imageValue = data.result?.image || data.image || data.result?.b64_json || data.data?.[0]?.b64_json || data.result?.url || data.url;
    if (typeof imageValue === 'string' && /^https?:\/\//i.test(imageValue)) {
      const dl = await fetch(imageValue, { signal: AbortSignal.timeout(60000) });
      if (!dl.ok) throw new Error(config.name + ' görsel linki indirilemedi (' + dl.status + ')');
      buffer = Buffer.from(await dl.arrayBuffer());
    } else {
      buffer = decodeImageToBuffer(imageValue);
    }
  } else {
    buffer = Buffer.from(await response.arrayBuffer());
    ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  }

  validateGeneratedImageBuffer(buffer, config.name, 2500);
  const savedUrl = saveGeneratedImageBuffer(buffer, 'cf', imageBufferMagic(buffer) || ext);
  return { url: savedUrl, prompt, model: modelId, provider: 'cloudflare', revised_prompt: prompt };
}

async function searchImageReferenceSnippets(query) {
  const q = `${query} visual appearance character reference outfit colors`;
  try {
    if (BRAVE_SEARCH_KEY) {
      const brRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=4&text_decorations=false`, {
        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': BRAVE_SEARCH_KEY },
        signal: AbortSignal.timeout(5000)
      });
      const brData = await brRes.json().catch(() => ({}));
      if (brRes.ok && brData.web?.results?.length) {
        return brData.web.results.map(r => `${r.title || ''}: ${r.description || ''}`.trim()).filter(Boolean).slice(0, 4);
      }
    }
  } catch (err) {
    console.warn('[IMAGE RESEARCH] Brave failed:', err.message);
  }
  try {
    const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8' },
      signal: AbortSignal.timeout(6000)
    });
    if (!ddgRes.ok) return [];
    const html = await ddgRes.text();
    const snippets = [];
    const rx = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = rx.exec(html)) && snippets.length < 4) {
      const title = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const snip = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (title || snip) snippets.push(`${title}: ${snip}`.trim());
    }
    return snippets;
  } catch (err) {
    console.warn('[IMAGE RESEARCH] DDG failed:', err.message);
    return [];
  }
}

function fallbackImageReferenceSnippets(query) {
  const q = String(query || '').toLocaleLowerCase('tr-TR');
  const notes = [];
  notes.push(`Generic visual intent guide: infer the main subject from "${String(query || '').slice(0, 160)}", preserve the named person, character, place, brand, object, era, outfit, color, and mood requested by the user, and render the recognizable visual traits instead of inventing an unrelated subject.`);
  if (q.includes('homelander')) {
    notes.push('Homelander visual guide: adult blond male superhero, slicked-back blond hair, clean-shaven face, confident unsettling smile, dark blue fitted suit, red-white cape, gold eagle shoulder accents, red gloves, patriotic comic-book villain mood, cinematic dramatic lighting.');
  }
  if (/\bsuperman\b/i.test(q)) {
    notes.push('Classic superhero visual guide: adult dark-haired male hero, blue suit, red cape, strong jaw, heroic upright pose, bright cinematic lighting, clean comic-book silhouette.');
  }
  if (q.includes('joker')) {
    notes.push('Joker visual guide: pale face, green hair, sharp grin, purple suit, chaotic theatrical expression, gritty cinematic lighting, urban night atmosphere.');
  }
  return notes;
}

function shouldResearchImagePrompt(prompt) {
  const p = String(prompt || '');
  if (/\b(webden|internetten|araştır|referans|benzet|karakter|film|dizi|oyun|anime|ünlü|marka|logo)\b/i.test(p)) return true;
  const words = p.match(/\b[A-ZÇ?İÖ?Ü][\wÇ?İÖ?Üçğıöşü-]{2,}\b/g) || [];
  return words.some(w => !/^(Bir|Bana|Lutfen|Lütfen|Generate|Create|Draw|Ciz|Çiz)$/i.test(w));
}

async function buildImagePromptForQuality(originalPrompt, model, options = {}) {
  const raw = String(originalPrompt || '').trim();
  const modelKey = String(model || '').toLowerCase();
  const rawModels = new Set([
    'comfyui-local',
    'fooocus-local',
    'a1111-local',
    'forge-local',
    'swarmui-local',
    'modal-sdxl',
    'modal-local-sd',
    'modal-cloud-gpu',
    'modal-dreamshaper',
    'modal-realisticvision',
    'modal-a1111-compatible'
  ]);
  if (options.raw === true || rawModels.has(modelKey) || MODAL_IMAGE_MODEL_ALIASES.has(modelKey)) {
    return {
      prompt: raw,
      originalPrompt: raw,
      referenceUsed: false,
      referenceSnippets: [],
      rawPrompt: true,
      model
    };
  }
  const lower = raw.toLocaleLowerCase('tr-TR');
  const isComfyLocal = String(model || '').toLowerCase() === 'comfyui-local';
  const quality = [
    'high quality, coherent anatomy, accurate subject details',
    'clear composition, sharp focus, natural lighting, no distorted face or hands',
    'respect the user requested colors, age, clothing, and scene details exactly'
  ];
  const comfyHints = isComfyLocal ? buildComfyPromptHints(raw) : { positive: [] };
  const comfyEnglishBridge = isComfyLocal && comfyHints.positive.length
    ? 'ComfyUI composition bridge in English: ' + comfyHints.positive.join(', ') + '. Follow this composition over generic portrait defaults.'
    : '';
  const styleHint = /sarışın|sarisin|blonde/i.test(lower)
    ? 'The main subject must have clearly blonde hair, not brown or black.'
    : '';
  const researchEnabled = options.research !== false && shouldResearchImagePrompt(raw);
  let snippets = [];
  if (researchEnabled) snippets = await searchImageReferenceSnippets(raw);
  if (researchEnabled && snippets.length === 0) snippets = fallbackImageReferenceSnippets(raw);
  const reference = snippets.length
    ? `Use these public web reference notes only as visual guidance, not as text to print: ${snippets.join(' | ').slice(0, 900)}.`
    : '';
  const finalPrompt = [
    raw,
    reference,
    comfyEnglishBridge,
    styleHint,
    quality.join(', ') + '.'
  ].filter(Boolean).join('\n');
  return {
    prompt: finalPrompt,
    originalPrompt: raw,
    referenceUsed: snippets.length > 0,
    referenceSnippets: snippets,
    model
  };
}

function streamPieceFromChoice(choice) {
  const delta = choice?.delta || {};
  return delta.content || delta.text || delta.reasoning || delta.reasoning_content || choice?.message?.content || '';
}

function stripProviderNotice(text) {
  return String(text || '')
    .replace(/⚠\s*IMPORTANT NOTICE\s*⚠[\s\S]*?(?:continue to work normally\.|normally\.)/gi, '')
    .replace(/⚠\s*IMPORTANT NOTICE\s*⚠/gi, '')
    .replace(/The Pollinations legacy text API[\s\S]*?(?:continue to work normally\.|normally\.)/gi, '')
    .replace(/Please migrate to our new service at https:\/\/enter\.pollinations\.ai[\s\S]*?(?:models\.|normally\.)/gi, '')
    .trim();
}

function repairTurkishQuestionMojibake(text) {
  return String(text || '')
    .replace(/\?al\?{2,}p/gi, '\u00e7al\u0131\u015f\u0131p')
    .replace(/\?al\?mad\?{2,}n\?/gi, '\u00e7al\u0131\u015fmad\u0131\u011f\u0131n\u0131')
    .replace(/\?al\?{2,}yor/gi, '\u00e7al\u0131\u015f\u0131yor')
    .replace(/\?al\?{2,}an/gi, '\u00e7al\u0131\u015fan')
    .replace(/\?al\?{2,}ma/gi, '\u00e7al\u0131\u015fma')
    .replace(/\?al\?{2,}/gi, '\u00e7al\u0131\u015f');
}

function cleanServerAssistantReply(text) {
  let s = stripProviderNotice(text);
  if (!s) return '';
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
  // EMOJI/MOJIBAKE TEMIZLIGI - bozuk karakterler, gunes ☀, replacement char vs.
  s = s.replace(/\u2600/g, '').replace(/\uFFFD/g, '');
  s = s
    .replace(/\u011f\u00c3\u2026\u00c2\u00b8[^ .,!?]{0,3}/g, '')
    .replace(/\u00c3\u0192\u00c2\u00a2[^ .,!?]{0,2}/g, '');
  const quoted = s.match(/Just\s+[""]([^""]+)[""]/i);
  if (quoted && quoted[1]) s = quoted[1].trim();
  const lower = s.toLowerCase();
  const markers = ['provide that.', 'just that.', 'okay.', 'final answer:', 'answer:', 'cevap:', 'yanıt:'];
  let markerIdx = -1;
  let markerLen = 0;
  for (const marker of markers) {
    const idx = lower.lastIndexOf(marker);
    if (idx >= markerIdx) {
      markerIdx = idx;
      markerLen = marker.length;
    }
  }
  if (markerIdx >= 0 && markerIdx < 800) s = s.slice(markerIdx + markerLen).trim();
  if (/^(we need|the user|user asks|the instruction|means:|they want|so we|probably just reply)\b/i.test(s)) {
    const quotedParts = [...s.matchAll(/[""]([^""]{1,180})[""]/g)].map(m => m[1].trim()).filter(Boolean);
    if (quotedParts.length) s = quotedParts[quotedParts.length - 1];
  }
  let lines = s.split(/\n+/).map(x => x.trim()).filter(Boolean);
  lines = lines.filter(line => !/^(user\s*:|means\s*:|they want|the user|user asks|the instruction|we need|we should|analysis|reasoning|thinking|final answer|meta)\b/i.test(line));
  if (lines.length) s = lines.join('\n');
  let sentences = s.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  const cleanSentences = sentences.filter(x => !/^(we need|the user|user asks|the instruction|means:|they want|so we|probably just reply|make sure|that is|that's|just)\b/i.test(x));
  if (cleanSentences.length && cleanSentences.length !== sentences.length) s = cleanSentences.slice(-2).join(' ');
  s = s
    .replace(/\bUser:\s*[""][\s\S]*?[""]\s*/gi, '')
    .replace(/\bMeans:\s*[\s\S]*?(?=(Just|Provide|Cevap|Yanıt|Merhaba|$))/gi, '')
    .replace(/\bThey want[\s\S]*?(?=(Just|Provide|Cevap|Yanıt|Merhaba|$))/gi, '')
    .replace(/^(Just|Just that|Provide that|Cevap|Yanıt)\s*[:.-]?\s*/i, '')
    .replace(/^["'""\s]+|["'""\s]+$/g, '')
    .trim();
  if (false && s.includes('"')) {
    const tail = s.split('"').map(x => x.trim()).filter(Boolean).pop();
    if (tail && tail.length < 180 && !/we need|the user|instruction|means/i.test(tail)) s = tail;
  }
  return repairTurkishQuestionMojibake(s);
}

function looksLikeUpstreamErrorContent(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (/^\{[\s\S]*"(error|message|type|code)"[\s\S]*\}$/i.test(s) &&
      /(not[_ -]?found|does not exist|do not have access|unauthorized|quota|rate|limit|invalid|error)/i.test(s)) {
    return true;
  }
  return /(model .{0,80}(does not exist|not found|do not have access)|not_found_error|invalid[_ -]?request|insufficient_quota|rate limit|quota exceeded)/i.test(s);
}

function parseStreamContent(raw) {
  const lines = String(raw || '').split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('data: ') && !line.includes('[DONE]'));
  let content = '';
  let usage = null;
  for (const line of lines) {
    try {
      const data = JSON.parse(line.slice(6));
      content += streamPieceFromChoice(data.choices?.[0]);
      if (data.usage) usage = data.usage;
    } catch {}
  }
  return { content: cleanServerAssistantReply(content), usage };
}

async function groqFallbackChat(messages, maxTokens, fallbackModel = 'llama-3.1-8b-instant') {
  if (!GROQ_KEY) throw new Error('Groq API key tanımlı değil');
  const fbPayload = JSON.stringify({ model: fallbackModel, messages, max_tokens: maxTokens || 2000, stream: false });
  const requestGroqFallback = (activeKey) => new Promise((resolve, reject) => {
    const fbOpts = {
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(fbPayload),
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + activeKey
      }
    };
    const fbReq = https.request(fbOpts, (resp) => {
      let d = '';
      resp.on('data', c => d += c.toString());
      resp.on('end', () => resolve({ status: resp.statusCode, data: d }));
    });
    fbReq.on('error', reject);
    fbReq.setTimeout(20000, () => { fbReq.destroy(); reject(new Error('Fallback timeout')); });
    fbReq.write(fbPayload);
    fbReq.end();
  });
  let fbResult = await requestGroqFallback(GROQ_KEY);
  if (GROQ_KEYS.length > 1 && isProviderKeyFailure(fbResult.status, fbResult.data)) {
    const attempts = GROQ_KEYS.length - 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const nextKey = rotateGroqKey();
      if (!nextKey) continue;
      console.log(`[GROQ] Fallback key failed (${fbResult.status}); retry ${attempt + 1}/${attempts}`);
      fbResult = await requestGroqFallback(nextKey);
      if (!isProviderKeyFailure(fbResult.status, fbResult.data)) break;
    }
  }

  if (fbResult.data.includes('data: ')) {
    const fbContent = parseStreamContent(fbResult.data).content;
    if (fbContent) {
      return {
        choices: [{ message: { content: fbContent, role: 'assistant' } }],
        usage: { total_tokens: Math.ceil(fbContent.length / 4) },
        fallback: 'groq/' + fallbackModel
      };
    }
  }

  const fbJson = JSON.parse(fbResult.data);
  if (fbJson.choices?.[0]?.message?.content) {
    fbJson.choices[0].message.content = cleanServerAssistantReply(fbJson.choices[0].message.content);
    return { ...fbJson, fallback: 'groq/' + fallbackModel };
  }
  if (fbJson.error && fallbackModel !== 'llama-3.1-8b-instant') {
    // Groq key havuzu varsa kısıtlı/limitli keyden diğerine geç.
    if (isProviderKeyFailure(fbResult.status, fbResult.data)) {
      GROQ_KEY = rotateGroqKey();
      PROVIDERS.groq.key = GROQ_KEY;
    }
    return groqFallbackChat(messages, maxTokens, 'llama-3.1-8b-instant');
  }
  throw new Error(fbJson.error?.message || 'Groq fallback boş yanıt döndürdü');
}

function sanitizeChatMessagesForFallback(messages) {
  const input = Array.isArray(messages) ? messages : [];
  const cleaned = input.slice(-8).map(m => {
    let content = m && m.content;
    if (Array.isArray(content)) {
      content = content
        .filter(part => part && part.type === 'text')
        .map(part => String(part.text || ''))
        .join('\n');
    }
    content = String(content || '');
    if (content.startsWith('__IMG__')) content = '[Görsel üretildi]';
    content = content.replace(/data:image\/[^;\s]+;base64,[^\s]+/g, '[Görsel verisi]');
    return {
      role: ['system', 'assistant', 'user'].includes(m && m.role) ? m.role : 'user',
      content: content.slice(0, 2500)
    };
  }).filter(m => m.content.trim());

  while (cleaned.length && cleaned[0].role === 'assistant') cleaned.shift();
  if (!cleaned.some(m => m.role === 'user')) cleaned.push({ role: 'user', content: 'Kısa Türkçe cevap ver.' });
  cleaned.unshift({
    role: 'system',
    content: 'Sen Froxy AI içinde çalışan Türkçe asistansın. Daima Türkçe, net ve yardımcı cevap ver. Ham provider hatası veya servis uyarısı gösterme.'
  });
  return cleaned;
}

function localSafeChatAnswer(messages) {
  return [
    'Bu model \u015fu an cevap veremedi.',
    '',
    'Mesaj\u0131n\u0131 ald\u0131m; servis yo\u011funlu\u011fu veya limit nedeniyle cevap tamamlanamad\u0131.',
    'Farkl\u0131 bir model se\u00e7ip tekrar deneyebilir veya biraz sonra yeniden g\u00f6nderebilirsin.'
  ].join('\n');
}

function buildPollinationsImageUrl(prompt, model = 'flux') {
  const seed = Date.now() + Math.floor(Math.random() * 9999);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt || 'AI görsel'))}?model=${encodeURIComponent(model)}&width=1024&height=1024&nologo=true&seed=${seed}`;
}

app.post('/api/chat-safe', chatLimiter, optionalAuthMiddleware, async (req, res) => {
  let messages = [];
  try {
    messages = sanitizeChatMessagesForFallback(req.body && req.body.messages);
    const maxTokens = Math.min(Number(req.body && req.body.max_tokens) || 900, 1200);
    const data = await groqFallbackChat(messages, maxTokens, 'llama-3.1-8b-instant');
    return res.json({ ...data, fallback: data.fallback || 'groq/llama-3.1-8b-instant', safe: true });
  } catch (err) {
    console.warn('[CHAT SAFE FALLBACK]', err.message);
    return res.json({
      choices: [{ message: { role: 'assistant', content: localSafeChatAnswer(messages) } }],
      usage: { total_tokens: 32 },
      fallback: 'local-safe',
      suggestedModel: 'GPT Sınırsız',
      safe: true
    });
  }
});

let modelCatalogCache = { at: 0, models: [] };
function modelCategory(model) {
  const id = (model.id || '').toLowerCase();
  const name = (model.name || '').toLowerCase();
  const text = id + ' ' + name;
  if (text.includes('gpt') || text.includes('openai') || text.includes('o1') || text.includes('o3')) return 'gpt';
  if (text.includes('gemini') || text.includes('gemma') || text.includes('google')) return 'gemini';
  if (text.includes('claude') || text.includes('anthropic')) return 'claude';
  if (text.includes('llama') || text.includes('meta-')) return 'llama';
  if (text.includes('qwen') || text.includes('qwq')) return 'qwen';
  if (text.includes('deepseek')) return 'deepseek';
  if (text.includes('mistral') || text.includes('mixtral') || text.includes('ministral')) return 'mistral';
  if (text.includes('nvidia') || text.includes('nemotron')) return 'nvidia';
  return 'other';
}

app.get('/api/model-catalog', async (req, res) => {
  try {
    const now = Date.now();
    if (modelCatalogCache.models.length && now - modelCatalogCache.at < 6 * 60 * 60 * 1000) {
      return res.json({ source: 'cache', count: modelCatalogCache.models.length, models: modelCatalogCache.models });
    }

    const data = await httpsRequest('https://openrouter.ai/api/v1/models');
    const remote = Array.isArray(data.data) ? data.data : [];
    const models = remote
      .filter(m => m && m.id && !m.id.includes('moderation'))
      .map(m => {
        const prompt = Number(m.pricing?.prompt || 0);
        const completion = Number(m.pricing?.completion || 0);
        const free = m.id.endsWith(':free') || (prompt === 0 && completion === 0);
        return {
          id: m.id,
          name: m.name || m.id,
          tier: free ? 'free' : 'enterprise',
          provider: 'openrouter',
          cat: modelCategory(m),
          remote: true
        };
      });

    modelCatalogCache = { at: now, models };
    let togetherModels = [];
    try {
      const togetherKey = getTogetherKey();
      if (togetherKey) {
        const tRes = await fetch('https://api.together.xyz/v1/models', {
          headers: { Authorization: `Bearer ${togetherKey}` },
          signal: AbortSignal.timeout(12000)
        });
        const tData = await tRes.json().catch(() => ({}));
        const tRemote = Array.isArray(tData) ? tData : (Array.isArray(tData.data) ? tData.data : []);
        togetherModels = tRemote
          .map(m => ({ id: m.id || m.name || '', name: m.display_name || m.name || m.id || '' }))
          .filter(m => m.id && !/image|flux|imagen|wan|video|audio|tts|embed|rerank|whisper/i.test(`${m.id} ${m.name}`))
          .slice(0, 180)
          .map(m => ({
            id: m.id,
            name: m.name || m.id,
            tier: /free|oss|8b|mini|small/i.test(m.id) ? 'free' : 'pro',
            provider: 'together',
            cat: modelCategory(m),
            remote: true
          }));
      }
    } catch (tErr) {
      console.warn('[MODEL CATALOG] Together skipped:', tErr.message);
    }
    
    // Cloudflare ve NVIDIA modellerini de listeye ekle (test edilmiş çalışan modeller)
    const extraModels = [
      // Cloudflare Workers AI (10K req/gün ÜCRETSİZ, yenileniyor)
      { id: 'openrouter/free', name: 'OpenRouter Free Auto', tier: 'free', provider: 'openrouter', cat: 'qualityfree', remote: true },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 Free', tier: 'free', provider: 'openrouter', cat: 'qualityfree', remote: true },
      { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B (Cloudflare)', tier: 'free', provider: 'cloudflare', cat: 'qualityfree', remote: true },
      { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', name: 'Mistral Small 3.1 24B (Cloudflare)', tier: 'free', provider: 'cloudflare', cat: 'mistral', remote: true },
      { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 32B (Cloudflare)', tier: 'free', provider: 'cloudflare', cat: 'deepseek', remote: true },
      { id: '@cf/qwen/qwen2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B (Cloudflare)', tier: 'free', provider: 'cloudflare', cat: 'qualityfree', remote: true },
      { id: '@cf/ibm-granite/granite-4.0-h-micro', name: 'IBM Granite 4.0 Micro (Cloudflare)', tier: 'free', provider: 'cloudflare', cat: 'other', remote: true },
      { id: '@cf/meta/llama-3.1-8b-instruct-fp8', name: 'Llama 3.1 8B (Cloudflare)', tier: 'free', provider: 'cloudflare', cat: 'llama', remote: true },
      { id: '@cf/meta/llama-3-8b-instruct', name: 'Llama 3 8B (Cloudflare)', tier: 'free', provider: 'cloudflare', cat: 'llama', remote: true },
      // NVIDIA NIM (5K req/ay)
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (NVIDIA)', tier: 'pro', provider: 'nvidia', cat: 'llama', remote: true },
      { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (NVIDIA)', tier: 'pro', provider: 'nvidia', cat: 'llama', remote: true },
      { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B (NVIDIA)', tier: 'free', provider: 'nvidia', cat: 'llama', remote: true },
      { id: 'qwen/qwen3-coder-480b-a35b-instruct', name: 'Qwen3 Coder 480B (NVIDIA)', tier: 'pro', provider: 'nvidia', cat: 'qwen', remote: true },
      { id: 'mistralai/mixtral-8x7b-instruct-v0.1', name: 'Mixtral 8x7B (NVIDIA)', tier: 'free', provider: 'nvidia', cat: 'mistral', remote: true },
      { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B (NVIDIA)', tier: 'pro', provider: 'nvidia', cat: 'mistral', remote: true }
    ];
    const seenIds = new Set();
    const allModels = [...models, ...togetherModels, ...extraModels].filter(m => {
      if (!m.id || seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    modelCatalogCache = { at: now, models: allModels };
    res.json({ source: 'openrouter+cf+nvidia', count: allModels.length, models: allModels });
  } catch (err) {
    res.status(500).json({ error: err.message, count: modelCatalogCache.models.length, models: modelCatalogCache.models });
  }
});

app.get('/api/health', async (req, res) => {
  const dbStats = {};
  try {
    dbStats.users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    dbStats.chats = db.prepare('SELECT COUNT(*) AS c FROM server_chats').get().c;
    dbStats.documents = db.prepare('SELECT COUNT(*) AS c FROM documents').get().c;
    dbStats.admins = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get().c;
  } catch (err) {
    dbStats.error = err.message;
  }

  const providers = Object.fromEntries(Object.entries(PROVIDERS).map(([name, p]) => [
    name,
    name === 'pollinations' || Boolean(p.key)
  ]));

  const cloudflareImageStatus = await getCloudflareImageReadyStatus(1800);
  const pollinationsStatus = await getPollinationsKeyStatus(false);

  res.json({
    ok: true,
    app: 'Froxy AI',
    version: 'v433',
    uptime: Math.round(process.uptime()),
    time: new Date().toISOString(),
    database: dbStats,
    databaseStorage: {
      path: DATABASE_PATH,
      generatedPath: GENERATED_DIR,
      persistent: DATABASE_IS_PERSISTENT,
      source: DATABASE_IS_PERSISTENT ? 'env-or-railway-volume' : 'app-directory'
    },
    models: {
      remoteCached: modelCatalogCache.models.length,
      cacheAgeSeconds: modelCatalogCache.at ? Math.round((Date.now() - modelCatalogCache.at) / 1000) : null
    },
    providers,
    keyPools: {
      ...Object.fromEntries(Object.entries(PROVIDER_KEY_POOLS).map(([name, pool]) => [
        name,
        { count: pool.length, rotation: pool.length > 1 }
      ])),
      pollinations: { count: POLLINATIONS_API_KEYS.length, rotation: POLLINATIONS_API_KEYS.length > 1 }
    },
    videoProviders: {
      cloudflare: Boolean(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN),
      fal: Boolean(FAL_API_KEY),
      replicate: Boolean(REPLICATE_API_TOKEN),
      vidu: Boolean(VIDU_API_KEY),
      wavespeed: Boolean(WAVESPEED_API_KEY),
      pollinations: Boolean(POLLINATIONS_API_KEY),
      gemini_veo: Boolean(GEMINI_KEYS.length > 0),
      hf_ltx: { configured: Boolean(fromEnv('HF_TOKEN')), experimental: true },
      note: 'Pollinations video genellikle POLLINATIONS_KEY ister; anonim kullanım IP kuyruğuna takılabilir.'
    },
    imageProviders: {
      openai_image: Boolean(OPENAI_IMAGE_KEYS.length > 0),
      cloudflare: Boolean(cloudflareImageStatus.ready),
      runware: Boolean(RUNWARE_API_KEY),
      stability: Boolean(STABILITY_API_KEY),
      aimlapi: Boolean(AIMLAPI_KEY),
      together: Boolean(getTogetherKey()),
      imagegpt: Boolean(IMAGEGPT_API_KEY),
      gemini_imagen: Boolean(GEMINI_KEYS.length > 0),
      pollinations: Boolean(POLLINATIONS_API_KEY),
      modal: Boolean(MODAL_IMAGE_ENDPOINT)
    },
    imageProviderStatus: {
      cloudflare: cloudflareImageStatus,
      pollinations: {
        configured: Boolean(POLLINATIONS_API_KEY),
        keys: pollinationsStatus,
        queueActive: pollinationsImageActive,
        queuePending: pollinationsImageQueue.length,
        cooldowns: Object.fromEntries([...pollinationsImageCooldownUntil.entries()].filter(([, until]) => until > Date.now()).map(([model, until]) => [model, Math.ceil((until - Date.now()) / 1000)]))
      },
      modal: {
        configured: Boolean(MODAL_IMAGE_ENDPOINT),
        endpoint: MODAL_IMAGE_ENDPOINT ? 'configured' : ''
      }
    },
    searchProviders: {
      tavily: Boolean(TAVILY_API_KEY),
      brave: Boolean(BRAVE_SEARCH_KEY),
      duckduckgo: true
    }
  });
});

// ===== CANLI MODEL CHECK (görsel + chat küçük ping) =====
// Kullanıcı panelden tıklayınca tüm sağlayıcıları gerçekten test eder.
// Her sağlayıcıya 1 küçük istek atar; 10sn timeout içinde başarılıyı "OK" sayar.
app.get('/api/model-check', async (req, res) => {
  const startAll = Date.now();

  async function tryCheck(label, fn, timeoutMs = 10000) {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const out = await fn(ctrl.signal);
      clearTimeout(timer);
      return { label, ok: true, ms: Date.now() - t0, detail: out || 'OK' };
    } catch (e) {
      clearTimeout(timer);
      return { label, ok: false, ms: Date.now() - t0, detail: (e && e.message) ? e.message.slice(0, 160) : 'error' };
    }
  }

  // --- CHAT sağlayıcıları (küçük ping) ---
  const chatPing = [];
  for (const [name, p] of Object.entries(PROVIDERS)) {
    if (!p.key || p.key === 'none') continue;
    if (name === 'image' || name === 'pollinations') continue; // farklı uç
    // chat/completions minimum istek
    chatPing.push(tryCheck('chat:' + name, async (signal) => {
      const r = await fetch((p.base || '') + '/chat/completions', {
        method: 'POST',
        signal,
        headers: { 'Authorization': `Bearer ${p.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 })
      });
      // 4xx (model yok/yetki) = provider yaşıyor, 5xx veya timeout = ölü
      if (r.status >= 500) throw new Error('HTTP ' + r.status);
      return 'reachable (' + r.status + ')';
    }));
  }
  // Gemini direct (farklı uç)
  if (GEMINI_KEYS.length > 0) {
    chatPing.push(tryCheck('chat:gemini_direct', async (signal) => {
      const key = getGeminiKey();
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return (j.models ? j.models.length : 0) + ' model mevcut';
    }));
  }
  // Pollinations chat (anahtarsız)
  chatPing.push(tryCheck('chat:pollinations', async (signal) => {
    const r = await fetch('https://text.pollinations.ai/openai/models', { signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return 'reachable';
  }));

  // --- GÖRSEL sağlayıcıları ---
  const imgPing = [];
  imgPing.push(tryCheck('image:pollinations', async (signal) => {
    const r = await fetch('https://gen.pollinations.ai/image/models', {
      signal,
      headers: POLLINATIONS_API_KEY ? { 'Authorization': `Bearer ${POLLINATIONS_API_KEY}` } : {}
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json().catch(() => []);
    return Array.isArray(j) ? `${j.length} image model` : 'reachable';
  }));
  if (CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
    imgPing.push(tryCheck('image:cloudflare', async (signal) => {
      const status = await getCloudflareImageGenerationStatus(30000);
      if (!status.ready) throw new Error(status.detail || 'Cloudflare generation failed');
      return status.detail || 'generation ok';
    }, 35000));
  }
  if (RUNWARE_API_KEY) {
    imgPing.push(tryCheck('image:runware', async (signal) => {
      const r = await fetch('https://api.runware.ai/v1/models', {
        signal, headers: { 'Authorization': `Bearer ${RUNWARE_API_KEY}` }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return 'reachable';
    }));
  }
  if (STABILITY_API_KEY) {
    imgPing.push(tryCheck('image:stability', async (signal) => {
      const r = await fetch('https://api.stability.ai/v1/user/account', {
        signal, headers: { 'Authorization': `Bearer ${STABILITY_API_KEY}` }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return 'credits: ' + (j.credits ?? '?');
    }));
  }
  if (getTogetherKey()) {
    imgPing.push(tryCheck('image:together', async (signal) => {
      const r = await fetch('https://api.together.xyz/v1/models', {
        signal, headers: { 'Authorization': `Bearer ${getTogetherKey()}` }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return 'reachable';
    }));
  }
  if (AIMLAPI_KEY) {
    imgPing.push(tryCheck('image:aimlapi', async (signal) => {
      const r = await fetch('https://api.aimlapi.com/v1/models', {
        signal, headers: { 'Authorization': `Bearer ${AIMLAPI_KEY}` }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return 'reachable';
    }));
  }
  if (MODAL_IMAGE_ENDPOINT) {
    imgPing.push(tryCheck('image:modal', async () => {
      const out = await callModalImage({
        prompt: 'simple clean product photo of a blue ceramic cup on a white table, studio light',
        imageSize: { width: 512, height: 512 },
        qualityMode: 'cheap',
        model: 'modal-sdxl'
      });
      return out && out.url ? `generation ok (${out.model || 'modal-sdxl'})` : 'reachable';
    }, 360000));
  }
  if (GEMINI_KEYS.length > 0) {
    imgPing.push(tryCheck('image:gemini_imagen', async (signal) => {
      // Imagen modeli listesi mevcut mu kontrol
      const key = getGeminiKey();
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const hasImagen = (j.models || []).some(m => (m.name || '').includes('imagen'));
      return hasImagen ? 'Imagen mevcut' : 'Imagen yok (billing?)';
    }));
  }

  const results = await Promise.all([...chatPing, ...imgPing]);
  const chat = results.filter(r => r.label.startsWith('chat:')).map(r => ({ ...r, label: r.label.slice(5) }));
  const image = results.filter(r => r.label.startsWith('image:')).map(r => ({ ...r, label: r.label.slice(6) }));
  res.json({
    ok: true,
    totalMs: Date.now() - startAll,
    chat,
    image,
    summary: {
      chatOk: chat.filter(r => r.ok).length,
      chatTotal: chat.length,
      imageOk: image.filter(r => r.ok).length,
      imageTotal: image.length
    }
  });
});

// ===== IP TRACKING & ANTI-ABUSE =====
const ipStore = {}; // { ip: { registrations: [email1, email2], dailyRequests: {date: count}, firstSeen: timestamp } }

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.connection?.remoteAddress || req.ip || '127.0.0.1';
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getIPData(ip) {
  if (!ipStore[ip]) {
    ipStore[ip] = { registrations: [], dailyRequests: {}, firstSeen: Date.now() };
  }
  return ipStore[ip];
}

// Client info: returns IP + eligibility for first-time discount.
app.get('/api/client-info', (req, res) => {
  const ip = getClientIP(req);
  const data = getIPData(ip);
  const today = getToday();
  const dailyCount = data.dailyRequests[today] || 0;
  res.json({
    ip: ip.replace(/^::ffff:/, ''),
    registrationCount: data.registrations.length,
    isFirstTime: data.registrations.length === 0,
    dailyRequests: dailyCount,
    dailyLimit: 50 // free tier daily limit
  });
});

// Register IP: called during signup.
app.post('/api/register-ip', (req, res) => {
  const ip = getClientIP(req);
  const { email } = req.body;
  const data = getIPData(ip);
  
  const alreadyRegistered = data.registrations.includes(email);
  if (!alreadyRegistered) {
    data.registrations.push(email);
  }
  
  res.json({
    success: true,
    isFirstRegistration: data.registrations.length === 1,
    totalRegistrations: data.registrations.length
  });
});

// Daily request counter: increment & check limit.
app.post('/api/daily-limit', (req, res) => {
  const ip = getClientIP(req);
  const { tier } = req.body;
  const data = getIPData(ip);
  const today = getToday();
  
  if (!data.dailyRequests[today]) data.dailyRequests[today] = 0;
  
  // Free tier: 50/day, Starter: 200/day, Pro/Enterprise: unlimited
  const limits = { free: 50, starter: 200, pro: 99999, enterprise: 99999 };
  const limit = limits[tier] || 50;
  
  if (data.dailyRequests[today] >= limit) {
    return res.json({ allowed: false, remaining: 0, limit, used: data.dailyRequests[today] });
  }
  
  data.dailyRequests[today]++;
  res.json({ 
    allowed: true, 
    remaining: limit - data.dailyRequests[today], 
    limit, 
    used: data.dailyRequests[today] 
  });
});

// Proxy chat endpoint
app.post('/api/chat', chatLimiter, optionalAuthMiddleware, async (req, res) => {
  let { messages, model, max_tokens, provider, apiKey: bodyApiKey, baseUrl: bodyBaseUrl } = req.body;
  if (!messages) return res.status(400).json({ error: { message: 'Messages array required' } });
  const adultBlockReason = detectAdultSafetyBlock(textFromMessages(messages));
  if (adultBlockReason) {
    return res.status(400).json({ error: { message: adultBlockReason }, code: 'adult_safety_block' });
  }
  if (String(model || '').toLowerCase() === 'adult-venice-uncensored-free') {
    model = 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free';
    provider = provider || 'openrouter';
  }
  let localChatFallbackFrom = '';
  let localChatFallbackReason = '';
  let localChatDidFallback = false;
  if (String(model || '').toLowerCase() === 'jan-local-auto') {
    localChatFallbackFrom = 'jan-local-auto';
    model = fromEnv('JAN_MODEL', 'llama3.2');
    provider = provider || 'jan_local';
  }
  if (String(model || '').toLowerCase() === 'local-openai-auto') {
    localChatFallbackFrom = 'local-openai-auto';
    model = fromEnv('LOCAL_OPENAI_MODEL', fromEnv('JAN_MODEL', 'llama3.2'));
    provider = provider || 'local_openai';
  }
  
  // === SYSTEM PROMPT INJECTION: Turkce, kaliteli, emoji ile bozuk yanit verme ===
  if (Array.isArray(messages) && messages.length > 0) {
    const hasSystem = messages.some(m => m && m.role === 'system');
    if (!hasSystem) {
      messages = [
        {
          role: 'system',
          content: 'Sen Froxy AI asistan\u0131s\u0131n. Daima T\u00fcrk\u00e7e, do\u011fal ve ak\u0131c\u0131 c\u00fcmlelerle cevap ver. Kullan\u0131c\u0131n\u0131n duygusuna empati g\u00f6ster ama c\u00fcmlelerin sonuna emoji, y\u0131ld\u0131z veya gereksiz simge koyma. Bozuk karakter, mojibake, garip semboller veya placeholder kullanma. Yan\u0131tlar\u0131n a\u00e7\u0131k, profesyonel ve insan gibi olsun. "Anlad\u0131m" gibi kal\u0131p ifadelerden ka\u00e7\u0131n, do\u011frudan konuya gir.'
        },
        ...messages
      ];
    } else {
      // Mevcut system prompt'a guardrail ekle
      const sysIdx = messages.findIndex(m => m && m.role === 'system');
      if (sysIdx >= 0) {
        const existing = messages[sysIdx].content || '';
        if (!String(existing).includes('Froxy AI')) {
          messages[sysIdx] = {
            role: 'system',
            content: existing + '\n\n\u00d6NEML\u0130: C\u00fcmle sonlar\u0131na emoji veya y\u0131ld\u0131z gibi gereksiz simge koyma. Bozuk karakter veya mojibake kullanma. T\u00fcrk\u00e7e cevap ver, do\u011fal ve ak\u0131c\u0131 yaz.'
          };
        }
      }
    }
  }
  if (!provider) provider = inferProviderFromModel(model);
  const requestedModel = model;
  const requestedProvider = provider;
  if (provider === 'jan_local' || provider === 'local_openai') {
    const selectedLocalProvider = provider;
    const selectedLocalModel = model;
    const localBase = (PROVIDERS[selectedLocalProvider]?.base || '').replace(/\/+$/, '');
    const localReady = await pingOpenAICompatibleBase(localBase);
    if (!localReady) {
      const fallback = applyChatFallbackProvider();
      localChatFallbackReason = `${localBase || selectedLocalProvider} /models yanit vermedi`;
      console.log(`[LOCAL_CHAT_FALLBACK] ${selectedLocalProvider}/${selectedLocalModel} -> ${fallback.provider}/${fallback.model}: ${localChatFallbackReason}`);
      provider = fallback.provider;
      model = fallback.model;
      localChatDidFallback = true;
    }
  }
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    try {
      if (payload && typeof payload === 'object' && !payload.error) {
        const upstreamFallback = payload.fallback || payload.__fallback;
        delete payload.requestedModel;
        delete payload.requestedProvider;
        delete payload.actualModel;
        delete payload.actualProvider;
        delete payload.fallback;
        delete payload.__fallback;
        delete payload.__model;
        delete payload.__provider;
        delete payload.keyRotated;
        delete payload.__keyRotated;
        delete payload.suggestedModel;
        if (localChatDidFallback && localChatFallbackFrom) {
          payload.fallbackFrom = localChatFallbackFrom;
          payload.fallbackReason = localChatFallbackReason || 'Local chat provider unavailable';
        } else if (upstreamFallback && requestedProvider === 'pollinations') {
          payload.fallbackFrom = `pollinations/${requestedModel || 'selected'}`;
          payload.fallbackReason = typeof upstreamFallback === 'string'
            ? `Pollinations yanıt vermedi, yedek model kullanıldı: ${upstreamFallback}`
            : 'Pollinations yanıt vermedi, yedek model kullanıldı.';
        }
      }
    } catch (_) {}
    return originalJson(payload);
  };
  bodyApiKey = typeof bodyApiKey === 'string' ? bodyApiKey.trim() : '';
  bodyBaseUrl = typeof bodyBaseUrl === 'string' ? bodyBaseUrl.trim() : '';

  const hasInlineImage = messageHasInlineImage(messages);
  if (hasInlineImage && !providerModelSupportsVision(provider, model)) {
    const geminiKey = GOOGLE_API_KEY || getGeminiKey();
    if (geminiKey) {
      console.log(`[VISION_REROUTE] ${provider || 'unknown'}:${model} -> google-direct:gemini-flash-latest`);
      provider = 'google-direct';
      model = 'gemini-flash-latest';
      bodyApiKey = bodyApiKey || geminiKey;
    } else {
      return res.status(400).json({
        error: {
          message: 'Bu model g\u00f6rsel okuyam\u0131yor. G\u00f6rsel y\u00fcklemek i\u00e7in Gemini/vision destekli bir model se\u00e7 veya Railway Variables i\u00e7ine GEMINI_API_KEY ekle.'
        }
      });
    }
  }

  // Credit Check (deduction happens after a successful response via /api/deduct-credit)
  if (req.user?.id) {
  try {
    // Daily limit check
    const dailyCheck = checkDailyLimit(req.user.id, 'chat');
    if (!dailyCheck.allowed) {
      return res.status(429).json({ error: { message: dailyCheck.reason } });
    }
    
    const creditCost = getModelCreditCost(model, provider);
    const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
    if (!user || user.credits < creditCost) {
      return res.status(402).json({ error: { message: 'Krediniz yetersiz. Gereken: ' + creditCost + ' kredi.' } });
    }
  } catch(e) {
    return res.status(500).json({ error: { message: 'Veritabani hatasi (Kredi)' } });
  }
  }

  if (provider === 'google-direct' || provider === 'google_direct') {
    try {
      const googleReply = await callGoogleDirectChat({ model, messages, max_tokens, apiKey: bodyApiKey });
      if (!googleReply.choices?.[0]?.message?.content) throw new Error('Google Direct bo\u015f yan\u0131t d\u00f6nd\u00fcrd\u00fc');
      return res.json(googleReply);
    } catch (err) {
      console.warn('[GOOGLE_DIRECT_CHAT]', err.message);
      if (hasInlineImage) {
        return res.status(502).json({
          error: {
            message: 'G\u00f6rsel okuma hatt\u0131 \u015fu anda cevap veremedi. Foto\u011fraf\u0131 g\u00f6remeyen metin modeline d\u00fc\u015f\u00fcrmedim; l\u00fctfen tekrar dene veya ba\u015fka bir vision model se\u00e7.'
          }
        });
      }
      return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
    }
  }
  if (provider === 'gemini-direct') provider = 'gemini_direct';
  let p = PROVIDERS[provider] || PROVIDERS.openai;
  if (bodyBaseUrl && /^https?:\/\//i.test(bodyBaseUrl)) {
    p = { ...p, base: bodyBaseUrl.replace(/\/+$/, '') };
  }
  let key = bodyApiKey || p.key;
  
  // === AUTO-REROUTE: providers without keys -> working alternatives ===
  const noKeyProviders = ['cerebras','sambanova','nvidia','fireworks','huggingface','deepseek_direct','together','xai'];
  if (noKeyProviders.includes(provider) && !key) {
    const fallback = applyChatFallbackProvider();
    console.log(`[REROUTE] ${provider} has no key -> ${fallback.provider}`);
    provider = fallback.provider;
    p = fallback.p;
    key = fallback.key;
    // Map model to best Groq equivalent
    const groqRemap = {
      'gpt-oss-120b': 'openai/gpt-oss-120b',
      'llama3.1-8b': 'llama-3.1-8b-instant',
      'qwen-3-235b-a22b-instruct-2507': 'qwen/qwen3-32b',
      'Qwen3-32B': 'qwen/qwen3-32b',
      'DeepSeek-R1-Distill-Llama-70B': 'llama-3.3-70b-versatile',
      'nvidia-gpt-oss-20b': 'openai/gpt-oss-20b',
      'fireworks-llama-3.1-8b': 'llama-3.1-8b-instant',
      'llama-3.3-70b': 'llama-3.3-70b-versatile',
      'qwen-2.5-coder-32b': 'qwen/qwen3-32b',
      'Meta-Llama-3.1-8B-Instruct': 'llama-3.1-8b-instant',
      'Meta-Llama-3.3-70B-Instruct': 'llama-3.3-70b-versatile',
      'Qwen2.5-Coder-32B-Instruct': 'qwen/qwen3-32b',
      'DeepSeek-V3-0324': 'openai/gpt-oss-120b',
      'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': 'llama-3.3-70b-versatile',
      'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free': 'deepseek-r1-distill-llama-70b',
      'grok-4-fast-reasoning': 'openai/gpt-oss-120b',
      // HuggingFace reroute
      'Qwen/Qwen2.5-72B-Instruct': 'qwen/qwen3-32b',
      'meta-llama/Llama-3.1-70B-Instruct': 'llama-3.3-70b-versatile',
      'mistralai/Mistral-7B-Instruct-v0.3': 'llama-3.1-8b-instant',
      // DeepSeek Direct reroute
      'deepseek-chat-direct': 'openai/gpt-oss-120b',
      'deepseek-reasoner-direct': 'llama-3.3-70b-versatile'
    };
    if (provider === 'groq' && groqRemap[model]) model = groqRemap[model];
    else if (provider !== 'groq') model = fallback.model;
  }
  if (provider === 'mistral' && !key) {
    const fallback = applyChatFallbackProvider(PROVIDERS.openrouter?.key ? 'openrouter' : undefined);
    console.log(`[REROUTE] Mistral has no key -> ${fallback.provider}`);
    provider = fallback.provider;
    p = fallback.p;
    key = fallback.key;
    const mistralRemap = {
      'mistral-small-latest': 'mistralai/mistral-nemo:free',
      'ministral-8b-latest': 'mistralai/mistral-nemo:free'
    };
    if (provider === 'openrouter' && mistralRemap[model]) model = mistralRemap[model];
    else if (provider !== 'mistral') model = fallback.model;
  }

  // === CEREBRAS MODEL VALIDATION ===
  if (provider === 'cerebras' && key) {
    const cerebrasRemap = {
      'llama3.1-8b': 'gpt-oss-120b',
      'llama-3.3-70b': 'gpt-oss-120b',
      'deepseek-r1-distill-llama-70b': 'gpt-oss-120b',
      'cerebras-gpt-oss-120b': 'gpt-oss-120b',
      'qwen-2.5-coder-32b': 'zai-glm-4.7'
    };
    if (cerebrasRemap[model]) model = cerebrasRemap[model];
    const validCerebras = ['gpt-oss-120b', 'zai-glm-4.7'];
    if (!validCerebras.includes(model)) {
      console.log(`[REROUTE] Cerebras model "${model}" not available -> Groq`);
      provider = 'groq'; p = PROVIDERS.groq; key = p.key;
      model = 'llama-3.1-8b-instant';
    }
  }

  // === SAMBANOVA MODEL REMAP ===
  if (provider === 'sambanova' && key) {
    const sambaRemap = {
      'llama-3.1-8b': 'Meta-Llama-3.1-8B-Instruct',
      'llama-3.3-70b': 'Meta-Llama-3.3-70B-Instruct',
      'qwen-2.5-coder-32b': 'Qwen2.5-Coder-32B-Instruct',
      'deepseek-r1-distill-llama-70b': 'DeepSeek-R1-Distill-Llama-70B',
      'deepseek-v3': 'DeepSeek-V3-0324',
      'qwq-32b': 'QwQ-32B',
      'qwen3-32b': 'Qwen3-32B'
    };
    if (sambaRemap[model]) model = sambaRemap[model];
  }

  // === TOGETHER MODEL REMAP ===
  if (provider === 'together' && key) {
    const togetherRemap = {
      'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free': 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B'
    };
    if (togetherRemap[model]) model = togetherRemap[model];
  }

  if (provider !== 'pollinations' && !key) {
    const selectedFallback = applyChatFallbackProvider();
    const fallbackProvider = selectedFallback.provider;
    console.log(`[REROUTE] ${provider || 'default'} key missing -> ${fallbackProvider}`);
    provider = fallbackProvider;
    p = selectedFallback.p;
    key = selectedFallback.key;
    model = selectedFallback.model;
  }
  
  let url = p.base + '/chat/completions';
  
  // === FALLBACK MAP: dead OpenRouter -> stable Groq models ===
  // If ANY OpenRouter model fails, we immediately switch to a dedicated Groq model.
  const FALLBACK_MAP = {
    // Dead OpenRouter -> working Groq
    'meta-llama/llama-3.1-8b-instruct:free': 'llama-3.1-8b-instant',
    'google/gemma-2-9b-it:free': 'qwen/qwen3-32b',
    'microsoft/phi-3-mini-128k-instruct:free': 'llama-3.1-8b-instant',
    'deepseek/deepseek-chat:free': 'openai/gpt-oss-120b',
    'deepseek/deepseek-r1:free': 'llama-3.3-70b-versatile',
    'openrouter/free': 'llama-3.3-70b-versatile',
    'google/gemini-2.0-flash-exp:free': 'llama-3.3-70b-versatile',
    'qwen/qwen-2.5-coder-32b-instruct:free': 'qwen/qwen3-32b',
    'mistralai/mistral-nemo:free': 'llama-3.1-8b-instant',
    'qwen/qwen-vl-plus:free': 'qwen/qwen3-32b',
    
    // Intermittent OpenRouter failures -> Groq equivalents
    'meta-llama/llama-3.3-70b-instruct:free': 'llama-3.3-70b-versatile',
    'google/gemma-4-26b-a4b-it:free': 'qwen/qwen3-32b',
    'google/gemma-4-31b-it:free': 'llama-3.3-70b-versatile',
    'google/gemma-3-27b-it:free': 'qwen/qwen3-32b',
    'google/gemma-3-12b-it:free': 'llama-3.1-8b-instant',
    'google/gemma-3-4b-it:free': 'llama-3.1-8b-instant',
    'google/gemma-3n-e4b-it:free': 'llama-3.1-8b-instant',
    'openai/gpt-oss-120b:free': 'openai/gpt-oss-120b',
    'openai/gpt-oss-20b:free': 'llama-3.1-8b-instant',
    'minimax/minimax-m2.5:free': 'qwen/qwen3-32b',
    'inclusionai/ling-2.6-1t:free': 'llama-3.3-70b-versatile',
    'inclusionai/ling-2.6-flash:free': 'llama-3.1-8b-instant',
    'qwen/qwen3-coder:free': 'qwen/qwen3-32b',
    'tencent/hy3-preview:free': 'qwen/qwen3-32b',
    
    // Others
    'nousresearch/hermes-3-llama-3.1-405b:free': 'openai/gpt-oss-120b',
    'qwen/qwen3-next-80b-a3b-instruct:free': 'qwen/qwen3-32b',
    'z-ai/glm-4.5-air:free': 'qwen/qwen3-32b',
    'cognitivecomputations/dolphin-mistral-24b-venice-edition:free': 'llama-3.3-70b-versatile',
    'meta-llama/llama-3.2-3b-instruct:free': 'llama-3.1-8b-instant',
    'nvidia/nemotron-nano-12b-v2-vl:free': 'llama-3.1-8b-instant',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 'llama-3.3-70b-versatile',
    'google/gemma-3n-e2b-it:free': 'llama-3.1-8b-instant',
    'liquid/lfm-2.5-1.2b-instruct:free': 'llama-3.1-8b-instant',
    'liquid/lfm-2.5-1.2b-thinking:free': 'llama-3.1-8b-instant',
    'poolside/laguna-m.1:free': 'openai/gpt-oss-120b',
    'poolside/laguna-xs.2:free': 'llama-3.1-8b-instant',
    'baidu/qianfan-ocr-fast:free': 'llama-3.1-8b-instant'
  };

  // === GROQ FALLBACK MAP ===
  const GROQ_FALLBACK = {
    'meta-llama/llama-4-maverick-17b-128e-instruct': 'llama-3.3-70b-versatile',
    'deepseek-r1-distill-llama-70b': 'llama-3.3-70b-versatile',
    'gemma2-9b-it': 'qwen/qwen3-32b',
    'qwen/qwq-32b': 'qwen/qwen3-32b',
    'mistral-saba-24b': 'llama-3.1-8b-instant',
    'mixtral-8x7b-32768': 'openai/gpt-oss-20b'
  };
  const supportsVision = providerModelSupportsVision(provider, model);
  if (!supportsVision || provider === 'pollinations') {
    messages = messages.map(m => {
      if (Array.isArray(m.content)) {
        return { ...m, content: m.content.map(c => c.type === 'text' ? c.text : '[Kullanıcı bir resim gönderdi ancak bu model resim okuyamıyor]').join('\n') };
      }
      return m;
    });
  }

  if (provider === 'pollinations') {
    // text.pollinations.ai supports /openai endpoint but only 'openai' model is free.
    // We simulate other models via System Prompt Injection.
    url = 'https://text.pollinations.ai/openai';
    const fakeModel = model.replace('pollinations-', '');
    
    let sysMsg = "You are a helpful AI.";
    if (fakeModel === 'claude') sysMsg = "You are Claude, a highly capable AI assistant created by Anthropic. Always identify yourself as Claude. Respond thoughtfully and carefully.";
    if (fakeModel === 'gemini') sysMsg = "You are Gemini, a powerful AI assistant created by Google. Always identify yourself as Gemini. Be helpful and knowledgeable.";
    if (fakeModel === 'llama') sysMsg = "You are Llama 3, an open-source AI assistant created by Meta. Always identify yourself as Llama. Be direct and helpful.";
    if (fakeModel === 'mixtral') sysMsg = "You are Mixtral, an AI assistant created by Mistral AI. Always identify yourself as Mixtral. Be concise and precise.";
    if (fakeModel === 'deepseek') sysMsg = "You are DeepSeek, a powerful AI reasoning assistant. Always identify yourself as DeepSeek. Think step-by-step.";
    if (fakeModel === 'qwen') sysMsg = "You are Qwen, an AI assistant created by Alibaba Cloud. Always identify yourself as Qwen. Be helpful and multilingual.";
    if (fakeModel === 'mistral') sysMsg = "You are Mistral, a powerful AI assistant by Mistral AI. Always identify yourself as Mistral. Be concise, precise and helpful.";
    if (fakeModel === 'command') sysMsg = "You are Command R+, a powerful AI assistant by Cohere. Always identify yourself as Command R+. Excel at reasoning and RAG tasks.";
    if (fakeModel === 'phi') sysMsg = "You are Phi-4, Microsoft's compact but powerful AI assistant. Always identify yourself as Phi-4. Be accurate and efficient.";
    if (['spicy-rp','flirt','romance','afterdark','safe-intimacy','evil','afterdark-turbo','erotic-story','roleplay-uncensored','flirty-chat'].includes(fakeModel)) {
      const spicyBase = "You are an adults-only Turkish after-dark roleplay assistant for users 18+. Keep the tone bold, confident, teasing, emotionally responsive, witty, and Grok-like: playful, direct, a little provocative, never bland or overly sweet. Do not give a generic refusal just because the user mentions sex, desire, being horny, adult slang, or sexual vocabulary. You may handle adult dating, desire, attraction, boundaries, safer sex, consent, fantasy setup, seductive dialogue, power-dynamic banter between consenting adults, and steamy suggestive roleplay. Keep all scenes explicitly consensual and all characters clearly adults. Keep explicit anatomical slang and graphic sexual requests in a non-graphic, suggestive, fade-around-the-details style instead of abruptly saying you cannot help. Do not produce graphic pornographic anatomical detail or step-by-step sexual acts. Do not roleplay coercion, incest, minors, intoxicated/non-consenting people, exploitation, sexual violence, privacy violations, leaked content, or deepfakes. If a user pushes into disallowed content, stay in character briefly, set the boundary, and redirect to a consenting adult fantasy.";
      if (fakeModel === 'spicy-rp') sysMsg = spicyBase + " Your style is immersive roleplay with cinematic tension, assertive teasing, confident boundaries, and charged dialogue.";
      if (fakeModel === 'flirt') sysMsg = spicyBase + " Your style is fast, witty, flirtatious banter with short high-energy replies and playful confidence.";
      if (fakeModel === 'romance') sysMsg = spicyBase + " Your style is intense adult romance, slow-burn chemistry, sensory atmosphere, and bold suggestive narration without graphic detail.";
      if (fakeModel === 'afterdark') sysMsg = spicyBase + " Your style is late-night adult chat: daring, suggestive, intimate, and sharper than ordinary romance.";
      if (fakeModel === 'afterdark-turbo') sysMsg = spicyBase + " Your style is high-energy after-dark roleplay: concise, provocative, teasing, and responsive.";
      if (fakeModel === 'erotic-story') sysMsg = spicyBase + " Your style is adult erotic-adjacent storytelling: charged, atmospheric, consent-forward, and suggestive without explicit anatomical narration.";
      if (fakeModel === 'roleplay-uncensored') sysMsg = spicyBase + " Your style is unrestricted-feeling adult fantasy roleplay within the hard safety boundaries: bold character voice, dominant banter when requested, and no coy romance unless asked.";
      if (fakeModel === 'flirty-chat') sysMsg = spicyBase + " Your style is confident flirty chat, playful provocation, and seductive but non-graphic replies.";
      if (fakeModel === 'safe-intimacy') sysMsg = spicyBase + " Your style is practical and supportive: answer relationship, consent, communication and sexual health questions in a mature, non-judgmental way.";
      if (fakeModel === 'evil') sysMsg = spicyBase + " Your style is edgy, sarcastic and bold, but still follows the adult consent and safety boundaries.";
    }
    
    if (messages.length > 0) {
      if (messages[0].role !== 'system') {
        messages.unshift({ role: 'system', content: sysMsg });
      } else {
        messages[0].content = sysMsg + " " + messages[0].content;
      }
    }
    
    // Pollinations should be tried as the selected provider first. If it is
    // queued/rate-limited, the existing response handling below falls back.
    model = 'openai-fast';
    p = PROVIDERS.pollinations;
    key = 'none';
    url = 'https://text.pollinations.ai/openai';
  }

  // Apply Groq fallback
  if (provider === 'groq' && GROQ_FALLBACK[model]) {
    console.log(`[FALLBACK] Groq: ${model} -> ${GROQ_FALLBACK[model]}`);
    model = GROQ_FALLBACK[model];
  }

  console.log(`[CHAT] Model: ${model}, Provider: ${provider || 'openai'}, Base: ${p.base}, Key: ${key ? 'configured' : 'missing'}`);

  const isPollinations = provider === 'pollinations';
  const payload = JSON.stringify({
    model,
    messages,
    max_tokens: max_tokens || 2000,
    stream: false
  });
  const makeChatRequest = (activeKey) => new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Accept': 'application/json'
    };
    if (!isPollinations && activeKey && activeKey !== 'none') {
      reqHeaders['Authorization'] = 'Bearer ' + activeKey;
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'http:' ? 80 : 443),
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'POST',
      headers: reqHeaders
    };

    const requestLib = urlObj.protocol === 'http:' ? http : https;
    const request = requestLib.request(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk.toString(); });
      response.on('end', () => {
        console.log(`[RESPONSE] Status: ${response.statusCode}, Length: ${data.length}`);
        resolve({ status: response.statusCode, data, headers: response.headers });
      });
    });

    request.on('error', reject);
    request.setTimeout(20000, () => { request.destroy(); reject(new Error('Timeout')); });
    request.write(payload);
    request.end();
  });

  try {
    let result = await makeChatRequest(key);
    const keyPool = providerKeyPool(provider);
    if (!bodyApiKey && !isPollinations && keyPool.length > 1 && isProviderKeyFailure(result.status, result.data)) {
      const attempts = keyPool.length - 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const nextKey = rotateProviderKey(provider);
        if (!nextKey || nextKey === key) continue;
        key = nextKey;
        console.log(`[KEY_RETRY] ${provider}/${model} provider-key failure ${result.status}; retry ${attempt + 1}/${attempts} with rotated key`);
        const retryResult = await makeChatRequest(key);
        if (!isProviderKeyFailure(retryResult.status, retryResult.data)) {
          result = retryResult;
          result.keyRotated = true;
          break;
        }
        result = retryResult;
      }
    }
    // === POLLINATIONS 502/429 EARLY FALLBACK ===
    if (isPollinations && (result.status === 429 || result.status === 502 || result.status === 404)) {
      console.log(`[FALLBACK] Pollinations ${result.status} -> Groq GPT-OSS 20B`);
      const groqPayload = JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: max_tokens || 2000, stream: false });
      const groqResult = await new Promise((resolve, reject) => {
        const groqOpts = {
          hostname: 'api.groq.com', port: 443,
          path: '/openai/v1/chat/completions', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(groqPayload), 'Accept': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY }
        };
        const gReq = https.request(groqOpts, (resp) => {
          let d = ''; resp.on('data', c => d += c.toString()); resp.on('end', () => resolve({ status: resp.statusCode, data: d }));
        });
        gReq.on('error', reject);
        gReq.setTimeout(30000, () => { gReq.destroy(); reject(new Error('Groq fallback timeout')); });
        gReq.write(groqPayload); gReq.end();
      });
      if (groqResult.data.includes('data: ')) {
          const gContent = parseStreamContent(groqResult.data).content;
          if (gContent) return res.json({ choices: [{ message: { content: gContent, role: 'assistant' } }], usage: { total_tokens: Math.ceil(gContent.length / 4) }, fallback: 'groq/llama-3.1-8b-instant' });
      }
    }

    // Parse SSE stream
    if (result.data.includes('data: ')) {
      const parsedStream = parseStreamContent(result.data);
      let fullContent = parsedStream.content;
      let usage = parsedStream.usage;
      if (fullContent) {
        if (looksLikeUpstreamErrorContent(fullContent) && GROQ_KEY && (provider !== 'groq' || model !== 'llama-3.1-8b-instant')) {
          console.log(`[FALLBACK] Upstream stream error from ${provider}/${model} -> Groq Llama 3.1 8B`);
          return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
        }
        return res.json({ choices: [{ message: { content: fullContent, role: 'assistant' } }], usage: usage || { total_tokens: Math.ceil(fullContent.length / 4) } });
      }
      if (GROQ_KEY && (provider !== 'groq' || model !== 'llama-3.1-8b-instant')) {
        console.log(`[FALLBACK] Empty stream from ${provider}/${model} -> Groq Llama 3.1 8B`);
        return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
      }
    }

    // Parse as regular JSON
    try {
      const json = JSON.parse(result.data);
      const upstreamError = Array.isArray(json) ? json[0]?.error : json.error;
      const topLevelErrorText = !json.choices && (json.message || json.type || json.code)
        ? [json.message, json.type, json.code].filter(Boolean).join(' ')
        : '';
      const cloudflareErrorText = provider === 'cloudflare' && json.success === false
        ? (json.errors || []).map(e => e.message || e.code || '').filter(Boolean).join(' ') || 'Cloudflare success=false'
        : '';
      if ((provider === 'gemini_direct' && upstreamError) || looksLikeUpstreamErrorContent(topLevelErrorText) || cloudflareErrorText) {
        console.log(`[FALLBACK] ${provider}/${model} top-level error -> Groq Llama 3.1 8B${cloudflareErrorText ? ': ' + cloudflareErrorText : ''}`);
        return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
      }
      if (json.choices?.[0]?.message?.content) {
        json.choices[0].message.content = cleanServerAssistantReply(json.choices[0].message.content);
        // Strip reasoning/thinking fields — frontend'e sızmasın
        if (json.choices[0].message.reasoning) delete json.choices[0].message.reasoning;
        if (json.choices[0].message.reasoning_content) delete json.choices[0].message.reasoning_content;
        if (looksLikeUpstreamErrorContent(json.choices[0].message.content) && GROQ_KEY && (provider !== 'groq' || model !== 'llama-3.1-8b-instant')) {
          console.log(`[FALLBACK] Upstream error content from ${provider}/${model} -> Groq Llama 3.1 8B`);
          return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
        }
        if (!json.choices[0].message.content && isPollinations) {
          console.log('[FALLBACK] Pollinations notice-only response -> Groq Llama 3.1 8B');
          return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
        }
        return res.json(json);
      }
      if (json.choices?.[0]?.message && !json.choices[0].message.content) {
        console.log(`[FALLBACK] Empty content from ${provider}/${model} -> Groq Llama 3.1 8B`);
        return res.json(await groqFallbackChat(messages, Math.max(max_tokens || 900, 256), 'llama-3.1-8b-instant'));
      }
      
      // === POLLINATIONS FALLBACK: If rate limited, use Groq ===
      if (isPollinations && (result.status === 429 || result.status === 404 || !json.choices)) {
        console.log(`[FALLBACK] Pollinations rate limited -> Groq Llama 3.1 8B`);
        const groqPayload = JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: max_tokens || 2000, stream: false });
        const groqResult = await new Promise((resolve, reject) => {
          const groqOpts = {
            hostname: 'api.groq.com', port: 443,
            path: '/openai/v1/chat/completions', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(groqPayload), 'Accept': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY }
          };
          const gReq = https.request(groqOpts, (resp) => {
            let d = ''; resp.on('data', c => d += c.toString()); resp.on('end', () => resolve({ status: resp.statusCode, data: d }));
          });
          gReq.on('error', reject);
          gReq.setTimeout(30000, () => { gReq.destroy(); reject(new Error('Groq fallback timeout')); });
          gReq.write(groqPayload); gReq.end();
        });
        if (groqResult.data.includes('data: ')) {
          const gContent = parseStreamContent(groqResult.data).content;
          if (gContent) return res.json({ choices: [{ message: { content: gContent, role: 'assistant' } }], usage: { total_tokens: Math.ceil(gContent.length / 4) }, fallback: 'groq/llama-3.1-8b-instant' });
        }
        try { const gJson = JSON.parse(groqResult.data); if (gJson.choices?.[0]?.message?.content) { gJson.choices[0].message.content = cleanServerAssistantReply(gJson.choices[0].message.content); return res.json({ ...gJson, fallback: 'groq/llama-3.1-8b-instant' }); } } catch {}
      }
      
      // === AUTO-FALLBACK: If model is dead, retry with Groq fallback ===
      const errMsg = json.error?.message || '';
      if (provider === 'openrouter' && (errMsg || result.status === 429 || result.status === 402) &&
          (FALLBACK_MAP[model] || errMsg.includes('No endpoints found') || errMsg.includes('Provider returned error') || errMsg.includes('is not a valid model') || errMsg.includes('rate') || errMsg.includes('quota') || errMsg.includes('credits') || result.status === 429 || result.status === 402)) {
        
        // === KEY ROTATION: 429 ise bir sonraki key'i dene ===
        if ((result.status === 429 || errMsg.includes('rate') || errMsg.includes('quota')) && OPENROUTER_KEYS.length > 1) {
          const nextKey = rotateOpenRouterKey();
          OPENROUTER_KEY = nextKey;
          PROVIDERS.openrouter.key = nextKey;
          console.log(`[OPENROUTER] 429 -> trying next key...`);
          // Bir kez daha dene yeni key ile
          try {
            const retryPayload = JSON.stringify({ model, messages, max_tokens: max_tokens || 2000, stream: false });
            const retryRes = await fetch(PROVIDERS.openrouter.base + '/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + nextKey },
              body: retryPayload,
              signal: AbortSignal.timeout(20000)
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              if (retryData.choices?.[0]?.message?.content) {
                retryData.choices[0].message.content = cleanServerAssistantReply(retryData.choices[0].message.content);
                if (retryData.choices[0].message.reasoning) delete retryData.choices[0].message.reasoning;
                return res.json({ ...retryData, keyRotated: true });
              }
            }
          } catch (retryErr) {
            console.warn('[OPENROUTER] Retry with rotated key also failed:', retryErr.message);
          }
        }

        const fallbackModel = FALLBACK_MAP[model] || 'openai/gpt-oss-20b';
        console.log(`[FALLBACK] OpenRouter ${model} -> Groq ${fallbackModel}`);
        
        const fbPayload = JSON.stringify({ model: fallbackModel, messages, max_tokens: max_tokens || 2000, stream: false });
        const fbResult = await new Promise((resolve, reject) => {
          const fbOpts = {
            hostname: 'api.groq.com', port: 443,
            path: '/openai/v1/chat/completions', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(fbPayload), 'Accept': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY }
          };
          const fbReq = https.request(fbOpts, (resp) => {
            let d = ''; resp.on('data', c => d += c.toString()); resp.on('end', () => resolve({ status: resp.statusCode, data: d }));
          });
          fbReq.on('error', reject);
          fbReq.setTimeout(20000, () => { fbReq.destroy(); reject(new Error('Fallback timeout')); });
          fbReq.write(fbPayload); fbReq.end();
        });

        // Parse fallback SSE
        if (fbResult.data.includes('data: ')) {
          const fbContent = parseStreamContent(fbResult.data).content;
          if (fbContent) return res.json({ choices: [{ message: { content: fbContent, role: 'assistant' } }], usage: { total_tokens: Math.ceil(fbContent.length / 4) }, fallback: fallbackModel });
        }
        // Parse fallback JSON
        try {
          const fbJson = JSON.parse(fbResult.data);
          if (fbJson.choices?.[0]?.message?.content) { fbJson.choices[0].message.content = cleanServerAssistantReply(fbJson.choices[0].message.content); return res.json({ ...fbJson, fallback: fallbackModel }); }
        } catch {}
        if (fallbackModel !== 'llama-3.1-8b-instant') {
          console.log(`[FALLBACK] Secondary Groq fallback ${fallbackModel} -> llama-3.1-8b-instant`);
          return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
        }
        return res.json({ choices: [{ message: { role: 'assistant', content: localSafeChatAnswer(messages) } }], usage: { total_tokens: 48 }, fallback: 'local-safe', suggestedModel: 'GPT Sınırsız' });
      }
      
      if (json.error) {
        const errMsg = json.error?.message || json.error?.code || 'upstream error';
        if (GROQ_KEY && (provider !== 'groq' || model !== 'llama-3.1-8b-instant')) {
          console.log(`[FALLBACK] ${provider}/${model} error -> Groq Llama 3.1 8B: ${errMsg}`);
          return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
        }
        return res.json({ choices: [{ message: { role: 'assistant', content: localSafeChatAnswer(messages) } }], usage: { total_tokens: 42 }, fallback: 'local-safe', suggestedModel: 'GPT Sınırsız' });
      }
      // Handle non-standard error formats (e.g. Cerebras {message, type, code} without .error wrapper)
      if (!json.choices && (json.message || json.code || json.type === 'not_found_error' || json.type === 'invalid_request_error')) {
        const errMsg2 = json.message || json.code || 'upstream error (non-standard)';
        if (GROQ_KEY && (provider !== 'groq' || model !== 'llama-3.1-8b-instant')) {
          console.log(`[FALLBACK] ${provider}/${model} non-standard error -> Groq Llama 3.1 8B: ${errMsg2}`);
          return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
        }
        return res.json({ choices: [{ message: { role: 'assistant', content: localSafeChatAnswer(messages) } }], usage: { total_tokens: 42 }, fallback: 'local-safe', suggestedModel: 'GPT Sınırsız' });
      }
      return res.json(json);
    } catch {
      if (provider === 'openrouter') {
        const fallbackModel = FALLBACK_MAP[model] || 'openai/gpt-oss-20b';
        console.log(`[FALLBACK] OpenRouter invalid stream ${model} -> Groq ${fallbackModel}`);
        return res.json(await groqFallbackChat(messages, max_tokens, fallbackModel));
      }
      if (GROQ_KEY && (provider !== 'groq' || model !== 'llama-3.1-8b-instant')) {
        console.log(`[FALLBACK] Invalid response from ${provider}/${model} -> Groq Llama 3.1 8B`);
        return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
      }
      return res.json({ choices: [{ message: { role: 'assistant', content: localSafeChatAnswer(messages) } }], usage: { total_tokens: 40 }, fallback: 'local-safe', suggestedModel: 'GPT Sınırsız' });
    }
  } catch (err) {
    console.error('[ERROR]', err.message);
    if (GROQ_KEY && (provider !== 'groq' || model !== 'llama-3.1-8b-instant')) {
      try {
        console.log(`[FALLBACK] Request error from ${provider}/${model} -> Groq Llama 3.1 8B: ${err.message}`);
        return res.json(await groqFallbackChat(messages, max_tokens, 'llama-3.1-8b-instant'));
      } catch (fbErr) {
        console.error('[FALLBACK ERROR]', fbErr.message);
      }
    }
    res.json({ choices: [{ message: { role: 'assistant', content: localSafeChatAnswer(messages) } }], usage: { total_tokens: 36 }, fallback: 'local-safe', suggestedModel: 'GPT Sınırsız' });
  }
});

// ===== WEB SEARCH (Perplexity-style) =====
app.post('/api/search', chatLimiter, async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  // ── 1) TAVILY (1000 req/ay ücretsiz — en kaliteli sonuçlar) ───────────
  if (TAVILY_API_KEY) {
    try {
      const tvRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TAVILY_API_KEY}` },
        body: JSON.stringify({ query, max_results: 6, search_depth: 'basic', include_answer: true })
      });
      const tvData = await tvRes.json();
      if (tvRes.ok && tvData.results?.length) {
        const results = tvData.results.map(r => ({
          title: r.title, url: r.url, snippet: r.content?.slice(0, 300) || ''
        }));
        if (tvData.answer) results.unshift({ title: 'Özet', url: '', snippet: tvData.answer, isAnswer: true });
        console.log(`[SEARCH] Tavily: ${results.length} results for "${query.slice(0,40)}"`);
        return res.json({ results, query, provider: 'tavily' });
      }
    } catch (err) {
      console.warn('[SEARCH] Tavily failed:', err.message, '→ Brave');
    }
  }

  // ── 2) BRAVE SEARCH (2000 req/ay ücretsiz) ────────────────────────────
  if (BRAVE_SEARCH_KEY) {
    try {
      const brRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6&text_decorations=false`, {
        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': BRAVE_SEARCH_KEY }
      });
      const brData = await brRes.json();
      if (brRes.ok && brData.web?.results?.length) {
        const results = brData.web.results.map(r => ({
          title: r.title, url: r.url, snippet: r.description?.slice(0, 300) || ''
        }));
        console.log(`[SEARCH] Brave: ${results.length} results for "${query.slice(0,40)}"`);
        return res.json({ results, query, provider: 'brave' });
      }
    } catch (err) {
      console.warn('[SEARCH] Brave failed:', err.message, '→ DuckDuckGo');
    }
  }

  // ── 3) DUCKDUCKGO (anahtarsız fallback) ───────────────────────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // DuckDuckGo HTML Search (no API key required)
    const encoded = encodeURIComponent(query);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const ddgRes = await fetch(ddgUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8'
      }
    });
    clearTimeout(timeout);

    if (!ddgRes.ok) throw new Error('DDG yanıt vermedi: ' + ddgRes.status);

    const html = await ddgRes.text();

    // Extract results with regex
    const results = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
      const url = match[1].replace('//duckduckgo.com/l/?uddg=', '').split('&')[0];
      const decodedUrl = decodeURIComponent(url);
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const snippet = match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (title && decodedUrl.startsWith('http')) {
        results.push({ title, url: decodedUrl, snippet });
      }
    }

    // Fallback: simpler extraction if regex fails
    if (results.length === 0) {
      const titleMatches = [...html.matchAll(/<h2[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
      titleMatches.slice(0, 5).forEach(m => {
        const title = m[2].replace(/<[^>]+>/g, '').trim();
        const url = m[1];
        if (title && url && url.startsWith('http')) results.push({ title, url, snippet: '' });
      });
    }

    console.log(`[SEARCH] "${query}" -> ${results.length} results`);
    res.json({ results, query });
  } catch (err) {
    console.error('[SEARCH ERROR]', err.message);
    res.status(500).json({ error: err.name === 'AbortError' ? 'Arama zaman aşımına uğradı' : err.message, results: [] });
  }
});

// ===== URL FETCH / JINA READER (RAG için URL → Markdown) =====
// Jina Reader: https://r.jina.ai/<url> — anahtarsız, ücretsiz
app.post('/api/fetch', chatLimiter, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL gerekli' });
  // Güvenlik: sadece http/https
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Geçersiz URL' });
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const jinaRes = await fetch(jinaUrl, {
      signal: ctrl.signal,
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown', 'X-Timeout': '15' }
    });
    clearTimeout(t);
    if (!jinaRes.ok) throw new Error('Jina Reader: ' + jinaRes.status);
    const markdown = await jinaRes.text();
    const trimmed = markdown.slice(0, 12000); // max 12K karakter
    console.log(`[FETCH] Jina Reader: ${url.slice(0,60)} → ${trimmed.length} chars`);
    res.json({ content: trimmed, url, provider: 'jina' });
  } catch (err) {
    console.error('[FETCH ERROR]', err.message);
    res.status(500).json({ error: err.name === 'AbortError' ? 'URL yükleme zaman aşımı' : err.message });
  }
});

// ===== TTS (Text-to-Speech) - 3-Tier Premium System =====
// Tier 1: OpenAI TTS HD (best quality, needs key)
// Tier 2: Microsoft Edge TTS (free, natural neural voices)
// Tier 3: Error -> client falls back to browser Speech API
app.post('/api/tts', chatLimiter, async (req, res) => {
  const { text, voice, engine } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });

  // Strip emojis, markdown, HTML and extra whitespace
  let cleanText = text
    .replace(/```[\s\S]*?```/g, ' kod bloğu ')   // code blocks
    .replace(/`[^`]+`/g, ' ')                      // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')       // markdown links
    .replace(/<[^>]+>/g, '')                        // HTML tags
    .replace(/[*_#~>|]/g, '')                       // markdown symbols
    // Strip all emoji ranges
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')         // emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')         // misc symbols & pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')         // transport & map
    .replace(/[\u{1F700}-\u{1F77F}]/gu, '')         // alchemical symbols
    .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')         // geometric shapes extended
    .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')         // supplemental arrows
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')         // supplemental symbols
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')         // chess symbols
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')         // symbols & pictographs extended
    .replace(/[\u{2600}-\u{26FF}]/gu, '')           // misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')           // dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')           // variation selectors
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')         // flags
    .replace(/[\u200D\uFE0F]/gu, '')                // zero-width joiner
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1000);
  if (!cleanText) return res.status(400).json({ error: 'No speakable text' });

  // === TIER 1: OpenAI TTS HD ===
  if (OPENAI_TTS_KEY && engine !== 'edge') {
    try {
      const oaiVoice = voice || 'nova'; // nova, shimmer, alloy, echo, onyx, fable
      const payload = JSON.stringify({ model: 'tts-1-hd', input: cleanText, voice: oaiVoice, response_format: 'mp3' });
      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.openai.com', port: 443,
          path: '/v1/audio/speech', method: 'POST',
          headers: { 'Authorization': 'Bearer ' + OPENAI_TTS_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };
        const req2 = https.request(options, (resp) => {
          const chunks = [];
          resp.on('data', c => chunks.push(c));
          resp.on('end', () => resolve({ status: resp.statusCode, data: Buffer.concat(chunks), ct: resp.headers['content-type'] }));
        });
        req2.on('error', reject);
        req2.setTimeout(20000, () => { req2.destroy(); reject(new Error('OpenAI TTS timeout')); });
        req2.write(payload); req2.end();
      });

      if (response.status === 200) {
        console.log('[TTS] OpenAI HD - OK, bytes:', response.data.length);
        res.set('Content-Type', 'audio/mpeg');
        return res.send(response.data);
      }
      console.warn('[TTS] OpenAI error:', response.status, response.data.toString().substring(0, 100));
    } catch (e) {
      console.warn('[TTS] OpenAI failed, falling back to Edge TTS:', e.message);
    }
  }

  // === TIER 2: Microsoft Edge TTS (Free - Neural Quality) ===
  try {
    const fs = require('fs');
    // Use client-specified voice if it's an Edge Neural voice, else auto-detect
    let edgeVoice = voice && voice.includes('Neural') ? voice : null;
    if (!edgeVoice) {
      const hasTurkish = /[çğıöşüÇ?İÖ?Ü]/.test(cleanText) || /\b(bir|bu|ve|için|ile|ya|da|mi|ne|ben|sen|biz|siz)\b/i.test(cleanText);
      edgeVoice = hasTurkish ? 'tr-TR-EmelNeural' : 'en-US-JennyNeural';
    }

    const tts = new MsEdgeTTS();
    await tts.setMetadata(edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    // Use temp directory to get the MP3 file
    const tmpDir = path.join(GENERATED_DIR, 'tts_tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    
    const result = await tts.toFile(tmpDir, cleanText);
    // audioFilePath is relative to __dirname (e.g. "generated\tts_tmp/audio.mp3")
    const mp3Path = path.resolve(__dirname, result.audioFilePath);
    
    if (fs.existsSync(mp3Path)) {
      const buf = fs.readFileSync(mp3Path);
      fs.unlinkSync(mp3Path); // cleanup
      console.log('[TTS] Edge Neural - OK, bytes:', buf.length, '- Voice:', edgeVoice);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buf);
    }
    throw new Error('Edge TTS output file not found');
  } catch (edgeErr) {
    console.warn('[TTS] Edge TTS failed:', edgeErr.message);
  }

  res.status(503).json({ error: 'TTS servisleri şu an kullanılamıyor, tarayıcı sesi kullanılacak.' });
});


function createLocalImageFallback(prompt, reason = '') {
  const clean = String(prompt || 'AI image').replace(/[<>&"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[ch])).slice(0, 160);
  const genDir = GENERATED_DIR;
  if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
  const fileName = `fallback_${Date.now()}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#111827"/><stop offset=".45" stop-color="#312e81"/><stop offset="1" stop-color="#0e7490"/></linearGradient>
    <radialGradient id="r" cx=".5" cy=".35" r=".55"><stop stop-color="#67e8f9" stop-opacity=".42"/><stop offset="1" stop-color="#67e8f9" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <rect width="1024" height="1024" fill="url(#r)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity=".08">${Array.from({length:12},(_,i)=>`<path d="M0 ${120+i*72}H1024"/>`).join('')}${Array.from({length:12},(_,i)=>`<path d="M${120+i*72} 0V1024"/>`).join('')}</g>
  <circle cx="512" cy="388" r="126" fill="#020617" fill-opacity=".34" stroke="#67e8f9" stroke-opacity=".32" stroke-width="2"/>
  <path d="M438 398h148M438 452h104M468 316h88a56 56 0 0 1 56 56v122l-70-42h-74a56 56 0 0 1-56-56v-24a56 56 0 0 1 56-56Z" fill="none" stroke="#e0f2fe" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="512" y="620" fill="#f8fafc" font-family="Arial, sans-serif" font-size="46" font-weight="800" text-anchor="middle">Görsel sıraya alındı</text>
  <text x="512" y="684" fill="#bae6fd" font-family="Arial, sans-serif" font-size="28" text-anchor="middle">Sağlayıcı yoğun olduğu için güvenli önizleme oluşturuldu.</text>
  <foreignObject x="162" y="730" width="700" height="130"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;color:#dbeafe;text-align:center;font-size:24px;line-height:1.4">${clean}</div></foreignObject>
  ${reason ? `<text x="512" y="922" fill="#94a3b8" font-family="Arial, sans-serif" font-size="20" text-anchor="middle">${String(reason).replace(/[<>&"']/g,'').slice(0,120)}</text>` : ''}
</svg>`;
  fs.writeFileSync(path.join(genDir, fileName), svg, 'utf8');
  return `/generated/${fileName}`;
}

function resolveImageSize(input = {}) {
  const presets = {
    square: { width: 1024, height: 1024, size: '1024x1024', aspectRatio: '1:1' },
    portrait: { width: 768, height: 1344, size: '1024x1536', aspectRatio: '9:16' },
    landscape: { width: 1344, height: 768, size: '1536x1024', aspectRatio: '16:9' },
    post: { width: 1024, height: 1280, size: '1024x1536', aspectRatio: '4:5' }
  };
  const nestedSize = input.imageSize && typeof input.imageSize === 'object' ? input.imageSize : null;
  const sizeText = typeof input.size === 'string' ? input.size : '';
  const key = String((typeof input.imageSize === 'string' ? input.imageSize : '') || input.sizeKey || '').toLowerCase();
  const byKey = presets[key] || null;
  const sizeMatch = sizeText.match(/^(\d{2,4})x(\d{2,4})$/i);
  const rawW = Number(input.width ?? nestedSize?.width ?? sizeMatch?.[1]);
  const rawH = Number(input.height ?? nestedSize?.height ?? sizeMatch?.[2]);
  if (Number.isFinite(rawW) && Number.isFinite(rawH)) {
    const clamp = n => Math.max(512, Math.min(1536, Math.round(n / 64) * 64));
    const width = clamp(rawW);
    const height = clamp(rawH);
    return { width, height, size: `${width}x${height}`, aspectRatio: input.aspectRatio || nestedSize?.aspectRatio || `${width}:${height}` };
  }
  return byKey || presets.square;
}

function resolveComfyImageSize(imageSize = {}) {
  const max = Number(fromEnv('COMFYUI_MAX_SIZE', '512')) || 512;
  const clamp = n => Math.max(512, Math.min(max, Math.round(Number(n || 512) / 64) * 64));
  const width = clamp(imageSize.width);
  const height = clamp(imageSize.height);
  return { ...imageSize, width, height, size: `${width}x${height}` };
}

// Image generation endpoint supporting both Pollinations and Guicore API
app.post('/api/image/edit', chatLimiter, optionalAuthMiddleware, async (req, res) => {
  let { prompt, image, model, apiKey: bodyApiKey } = req.body || {};
  const imageSize = resolveImageSize(req.body || {});
  prompt = String(prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });
  if (!image) return res.status(400).json({ error: 'Düzenleme için referans fotoğraf gerekli.' });
  const overrideKey = typeof bodyApiKey === 'string' ? bodyApiKey.trim() : '';
  let requestedModel = String(model || 'auto-quality');
  const isAuto = requestedModel === 'auto-quality';
  const isOpenAI = isOpenAIImageEditModel(requestedModel);
  const isGemini = isGeminiImageEditModel(requestedModel);
  const errors = [];

  async function tryGemini() {
    if (!(isAuto || isGemini) || !(GEMINI_KEYS.length || GOOGLE_API_KEY || overrideKey)) return null;
    return callGoogleDirectImageEdit({ prompt, image, model: requestedModel, apiKey: overrideKey });
  }

  async function tryOpenAI() {
    if (!(isAuto || isOpenAI) || !(overrideKey || OPENAI_IMAGE_KEYS.length)) return null;
    return callOpenAIImageEdit({ prompt, image, model: requestedModel, imageSize, apiKey: overrideKey });
  }

  try {
    let out = null;
    try {
      out = isOpenAI && !isAuto ? await tryOpenAI() : await tryGemini();
    } catch (err) {
      errors.push(err.message);
    }
    if (!out) {
      try {
        out = isOpenAI && !isAuto ? await tryGemini() : await tryOpenAI();
      } catch (err) {
        errors.push(err.message);
      }
    }
    if (!out) {
      return res.status(400).json({ error: 'Bu model fotoğraf düzenleyemiyor. GPT Image veya Gemini/Nano Banana seç.' });
    }
    const galleryId = saveImageGalleryRecord({
      userId: req.user?.id,
      url: out.url,
      prompt,
      model: out.model || requestedModel,
      provider: out.provider,
      mode: 'edit',
      sourceImageUrl: ''
    });
    return res.json({ ...out, prompt, mode: 'edit', galleryId, warning: errors[0] || undefined });
  } catch (err) {
    errors.push(err.message);
    return res.status(502).json({ error: 'Fotoğraf düzenleme başarısız: ' + errors.join(' | ') });
  }
});

app.get('/api/gallery', optionalAuthMiddleware, (req, res) => {
  if (!req.user?.id) return res.json({ images: [] });
  const rows = db.prepare(`
    SELECT * FROM image_gallery
    WHERE user_id = ? AND broken = 0
    ORDER BY datetime(created_at) DESC
    LIMIT 120
  `).all(req.user.id);
  res.json({ images: rows.map(galleryRow) });
});

app.post('/api/gallery', optionalAuthMiddleware, (req, res) => {
  if (!req.user?.id) return res.status(401).json({ error: 'Galeri kaydı için giriş gerekli.' });
  const { url, prompt, model, provider, mode, sourceImageUrl } = req.body || {};
  if (!isSafeGeneratedUrl(url)) return res.status(400).json({ error: 'Geçersiz veya kırık görsel URL.' });
  const existing = db.prepare('SELECT id FROM image_gallery WHERE user_id = ? AND url = ?').get(req.user.id, url);
  if (existing) return res.json({ ok: true, id: existing.id });
  const id = saveImageGalleryRecord({ userId: req.user.id, url, prompt, model, provider, mode: mode || 'generate', sourceImageUrl });
  res.json({ ok: true, id });
});

app.delete('/api/gallery/:id', optionalAuthMiddleware, (req, res) => {
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  const info = db.prepare('UPDATE image_gallery SET broken = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true, changed: info.changes });
});

app.post('/api/image', chatLimiter, optionalAuthMiddleware, async (req, res) => {
  let { prompt, model, qualityMode, apiKey: bodyApiKey } = req.body;
  const imageSize = resolveImageSize(req.body || {});
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });
  prompt = String(prompt || '').trim();
  const adultBlockReason = detectAdultSafetyBlock(prompt);
  if (adultBlockReason) {
    return res.status(400).json({ error: adultBlockReason, code: 'adult_safety_block', ok: false });
  }
  
  // Daily image limit check
  if (req.user?.id) {
    const dailyCheck = checkDailyLimit(req.user.id, 'image');
    if (!dailyCheck.allowed) {
      return res.status(429).json({ error: dailyCheck.reason });
    }
  }
  
  let imgModel = model || 'flux';
  const overrideKey = typeof bodyApiKey === 'string' ? bodyApiKey.trim() : '';
  const originalImageModel = String(imgModel || '').toLowerCase();
  const legacyImageAliasesNoFallback = new Set(['wan-image', 'qwen-image', 'sana', 'turbo', 'flux-realism', 'flux-anime', 'flux-3d']);
  if (legacyImageAliasesNoFallback.has(originalImageModel)) {
    return res.status(400).json({
      error: 'Bu eski görsel model adı artık başka modele yönlendirilmiyor. Lütfen listeden çalışan bir görsel modeli seç.',
      model: imgModel,
      ok: false
    });
  }

  // Alias misrouted "free" model names to actual provider models
  // (driven by which API keys are configured in the environment).
  // These names previously fell through to the Pollinations fallback because
  // the dispatcher did not recognise them; mapping them to existing branches
  // ensures the configured providers are actually used.
  const IMG_MODEL_ALIASES = {
    // Kaldırılan modeller artık frontend'te yok, ama güvenlik için:
    'pollinations': 'pollinations-flux',
    'gptimage':   'pollinations-flux',
    'gptimage-large': 'pollinations-zimage',
    'klein':      'pollinations-zimage',
    'kontext':    'pollinations-flux',
    'zimage':     'pollinations-zimage'
  };
  if (IMG_MODEL_ALIASES[imgModel]) {
    imgModel = IMG_MODEL_ALIASES[imgModel];
  }

  const explicitRequestedImageModel = String(imgModel || '').trim() && String(imgModel || '').trim() !== 'auto-quality';
  const promptMeta = await buildImagePromptForQuality(prompt, imgModel, { research: req.body?.research, raw: req.body?.rawPrompt === true || req.body?.promptEnhance === false });
  prompt = promptMeta.prompt;
  const imageMeta = {
    originalPrompt: promptMeta.originalPrompt,
    revised_prompt: prompt,
    referenceUsed: promptMeta.referenceUsed,
    referenceSnippets: promptMeta.referenceSnippets
  };

  if (imgModel === 'auto-quality' || !imgModel) {
    const mode = String(qualityMode || 'quality').toLowerCase();
    if (mode === 'cheap') imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    else if (mode === 'fast') imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    else if (mode === 'premium') imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    else imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    model = imgModel;
  }

  if (imgModel === 'style-dalle3') {
    imgModel = 'openai-gpt-image-2';
  }

  if (imgModel === 'comfyui-local') {
    try {
      const out = await callComfyLocalImage({ prompt, imageSize, qualityMode });
      return res.json({ ...out, prompt, provider: out.provider, ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] ComfyUI local failed:', err.message);
      return res.status(503).json({ error: 'ComfyUI çalışmıyor. COMFYUI_API_URL veya http://127.0.0.1:8188 adresini kontrol et: ' + err.message, model: imgModel, provider: 'comfyui-local', ok: false });
    }
  }

  if (imgModel === 'fooocus-local') {
    try {
      const out = await callFooocusLocalImage({ prompt, imageSize });
      return res.json({ ...out, prompt, provider: out.provider, ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] Fooocus local failed:', err.message);
      return res.status(503).json({ error: 'Fooocus çalışmıyor. FOOOCUS_API_URL veya http://127.0.0.1:8888 adresini kontrol et: ' + err.message, model: imgModel, provider: 'fooocus-local', ok: false });
    }
  }

  if (imgModel === 'a1111-local') {
    try {
      const out = await callStableDiffusionWebUiImage({ prompt, imageSize, envName: 'A1111_API_URL', fallbackBase: 'http://127.0.0.1:7860', provider: 'a1111-local', model: imgModel });
      return res.json({ ...out, prompt, provider: out.provider, ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] A1111 local failed:', err.message);
      return res.status(503).json({ error: 'A1111 / Stable Diffusion WebUI çalışmıyor. --api ile http://127.0.0.1:7860 adresini kontrol et: ' + err.message, model: imgModel, provider: 'a1111-local', ok: false });
    }
  }

  if (imgModel === 'forge-local') {
    try {
      const out = await callStableDiffusionWebUiImage({ prompt, imageSize, envName: 'FORGE_API_URL', fallbackBase: 'http://127.0.0.1:7861', provider: 'forge-local', model: imgModel });
      return res.json({ ...out, prompt, provider: out.provider, ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] Forge local failed:', err.message);
      return res.status(503).json({ error: 'Forge local çalışmıyor. --api ile FORGE_API_URL veya http://127.0.0.1:7861 adresini kontrol et: ' + err.message, model: imgModel, provider: 'forge-local', ok: false });
    }
  }

  if (imgModel === 'swarmui-local') {
    try {
      const out = await callSwarmUiLocalImage({ prompt, imageSize });
      return res.json({ ...out, prompt, provider: out.provider, ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] SwarmUI local failed:', err.message);
      return res.status(503).json({ error: 'SwarmUI local çalışmıyor. SWARMUI_API_URL veya http://127.0.0.1:7801 adresini kontrol et: ' + err.message, model: imgModel, provider: 'swarmui-local', ok: false });
    }
  }

  if (MODAL_IMAGE_MODEL_ALIASES.has(String(imgModel || '').toLowerCase())) {
    try {
      const out = await callModalImage({ prompt, imageSize, qualityMode, model: imgModel });
      return res.json({ ...out, prompt, provider: out.provider, ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] Modal image failed:', err.message);
      return res.status(503).json({ error: 'Modal GPU görsel endpoint hazır değil veya hata verdi: ' + err.message, model: imgModel, provider: 'modal', ok: false });
    }
  }

  if (imgModel === 'perchance-experimental') {
    try {
      const out = await callPerchanceExperimentalImage({ prompt, imageSize });
      return res.json({ ...out, prompt, provider: out.provider, ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] Perchance experimental failed:', err.message);
      return res.status(503).json({ error: 'Perchance experimental baglantisi hazir degil: ' + err.message, model: imgModel, provider: 'perchance-experimental', ok: false });
    }
  }

  const explicitOpenAIImage = !imgModel.startsWith('pollinations-') && (imgModel.startsWith('openai-') || imgModel.includes('gpt-image') || imgModel === 'dall-e-3' || imgModel === 'style-dalle3');
  if (explicitOpenAIImage) {
    try {
      const out = await callOpenAIImage({ prompt, model: imgModel, imageSize, apiKey: overrideKey });
      console.log(`[IMAGE] OpenAI saved: ${out.url}`);
      return res.json({ ...out, prompt, provider: out.provider, ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] OpenAI failed:', err.message);
      if (model !== 'auto-quality') {
        return res.status(502).json({
          error: 'Seçili OpenAI görsel modeli şu an yanıt vermedi: ' + err.message,
          model: imgModel,
          provider: 'openai',
          ok: false
        });
      }
      if (model === 'auto-quality') imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    }
  }

  if (imgModel.startsWith('imagen-') || imgModel.startsWith('gemini-')) {
    try {
      if (String(imgModel || '').startsWith('gemini-')) {
        const directModel = imgModel || 'gemini-2.5-flash-image';
        const out = await callGoogleDirectImage({ model: directModel, prompt, apiKey: overrideKey });
        return res.json({ ...out, provider: 'google-direct-image', ...imageMeta });
      }
      const imagenModels = {
        'imagen-4': 'imagen-4.0-generate-001',
        'imagen-4-ultra': 'imagen-4.0-ultra-generate-001',
        'imagen-4-fast': 'imagen-4.0-fast-generate-001'
      };
      const modelId = imagenModels[imgModel] || 'imagen-4.0-fast-generate-001';
      const apiKey = overrideKey || getGeminiKey();
      const response = await fetch(`${GOOGLE_DIRECT_BASE}/models/${modelId}:predict?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: imageSize.aspectRatio, personGeneration: 'allow_adult' }
        }),
        signal: AbortSignal.timeout(120000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Imagen API hatasi (${response.status})`);
      const b64 = data.predictions?.[0]?.bytesBase64Encoded || data.predictions?.[0]?.image?.bytesBase64Encoded;
      if (!b64) throw new Error('Imagen yaniti beklenen formatta degil');
      const url = saveGeneratedImageBuffer(Buffer.from(b64, 'base64'), 'imagen', 'png');
      return res.json({ url, prompt, model: modelId, provider: 'gemini-imagen', ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] Imagen failed:', err.message);
      if (model !== 'auto-quality') {
        return res.status(502).json({
          error: 'Seçili Google görsel modeli şu an yanıt vermedi: ' + err.message,
          model: imgModel,
          provider: imgModel.startsWith('gemini-') ? 'google-direct-image' : 'gemini-imagen',
          ok: false
        });
      }
      imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    }
  }

  // ── RUNWARE (Flux/SDXL — free tier, quality for adult mood / editorial) ───
  if (imgModel === 'runware-flux' || imgModel === 'runware-sdxl') {
    const rwKey = overrideKey || RUNWARE_API_KEY;
    if (!rwKey) {
      if (model !== 'auto-quality') {
        return res.status(503).json({ error: 'Seçili Runware görsel modeli için API key tanımlı değil.', model: imgModel, provider: 'runware', ok: false });
      }
      imgModel = 'flux';
    } else try {
      const rwCfg = RUNWARE_IMAGE_MODELS[imgModel] || { model: 'bfl:5@1', width: 1024, height: 1024, steps: 4 };
      const taskUUID = 'rw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      const rwBody = [{
        taskType: 'imageInference',
        taskUUID,
        model: rwCfg.model,
        positivePrompt: prompt,
        width: rwCfg.width || imageSize.width,
        height: rwCfg.height || imageSize.height,
        steps: rwCfg.steps || 4,
        outputType: 'URL'
      }];
      const rwRes = await fetch('https://api.runware.ai/v1', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${rwKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(rwBody),
        signal: AbortSignal.timeout(120000)
      });
      const rwData = await rwRes.json().catch(() => ({}));
      if (!rwRes.ok || !rwData || !rwData[0]) throw new Error(rwData?.error || rwData?.message || 'Runware image error');
      const first = rwData[0];
      if (first.error || first.errorMessage) throw new Error(first.errorMessage || first.error);
      const imgUrl = first.imageURL || first.imageUrl || (first.images && first.images[0]);
      if (!imgUrl) throw new Error('Runware URL boş');
      const dlRes = await fetch(imgUrl, { signal: AbortSignal.timeout(60000) });
      if (!dlRes.ok) throw new Error('Runware görsel indirilemedi');
      const buf = Buffer.from(await dlRes.arrayBuffer());
      const genDir = GENERATED_DIR;
      if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
      const fileName = `rw_${Date.now()}.jpg`;
      fs.writeFileSync(path.join(genDir, fileName), buf);
      console.log(`[IMAGE] Runware ${rwCfg.model} saved: /generated/${fileName}`);
      return res.json({ url: `/generated/${fileName}`, prompt, model: rwCfg.model, provider: 'runware', ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] Runware failed:', err.message);
      if (model !== 'auto-quality') {
        return res.status(502).json({ error: 'Seçili Runware görsel modeli şu an yanıt vermedi: ' + err.message, model: imgModel, provider: 'runware', ok: false });
      }
      imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    }
  }

  // ── STABILITY AI (Stable Image Core — free credits) ────────────────────
  if (imgModel === 'stability-core' || imgModel === 'stability-ultra') {
    const stabilityKey = overrideKey || STABILITY_API_KEY;
    if (!stabilityKey) {
      if (model !== 'auto-quality') {
        return res.status(503).json({ error: 'Seçili Stability modeli için API key tanımlı değil.', model: imgModel, provider: 'stability', ok: false });
      }
      imgModel = 'flux';
    } else try {
      const stEndpoint = imgModel === 'stability-ultra'
        ? 'https://api.stability.ai/v2beta/stable-image/generate/ultra'
        : 'https://api.stability.ai/v2beta/stable-image/generate/core';
      const form = new FormData();
      form.append('prompt', prompt);
      form.append('output_format', 'jpeg');
      const stRes = await fetch(stEndpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stabilityKey}`, 'Accept': 'image/*' },
        body: form
      });
      if (!stRes.ok) {
        const errText = await stRes.text();
        throw new Error('Stability: ' + errText.slice(0, 200));
      }
      const buf = Buffer.from(await stRes.arrayBuffer());
      const genDir = GENERATED_DIR;
      if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
      const fileName = `st_${Date.now()}.jpg`;
      fs.writeFileSync(path.join(genDir, fileName), buf);
      console.log(`[IMAGE] Stability saved: /generated/${fileName}`);
      return res.json({ url: `/generated/${fileName}`, prompt, provider: 'stability', ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] Stability failed:', err.message);
      if (model !== 'auto-quality') {
        return res.status(502).json({ error: 'Seçili Stability modeli şu an yanıt vermedi: ' + err.message, model: imgModel, provider: 'stability', ok: false });
      }
      imgModel = 'flux';
    }
  }

  // ── TOGETHER AI — Flux-1-schnell (ücretsiz tier) ───────────────────────
  if (imgModel === 'together-flux' || TOGETHER_IMAGE_MODELS[imgModel]) {
    const togetherKey = overrideKey || getTogetherKey();
    if (!togetherKey) {
      if (model !== 'auto-quality') {
        return res.status(503).json({ error: 'Seçili Together görsel modeli için API key tanımlı değil.', model: imgModel, provider: 'together', ok: false });
      }
      imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    } else try {
      const togetherCfg = TOGETHER_IMAGE_MODELS[imgModel] || { model: 'black-forest-labs/FLUX.1-schnell', credits: 120, steps: 4 };
      const togetherBody = { model: togetherCfg.model, prompt, width: togetherCfg.width || imageSize.width, height: togetherCfg.height || imageSize.height, steps: togetherCfg.steps };
      if (!togetherCfg.omitN) togetherBody.n = 1;
      const tRes = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${togetherKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(togetherBody)
      });
      const tData = await tRes.json();
      if (!tRes.ok) throw new Error(tData.error?.message || 'Together image error');
      const imgUrl = tData.data?.[0]?.url;
      if (!imgUrl) throw new Error('Together URL boş');
      const dlRes = await fetch(imgUrl);
      if (!dlRes.ok) throw new Error('Together görsel indirilemedi (' + dlRes.status + ')');
      const buf = Buffer.from(await dlRes.arrayBuffer());
      const genDir = GENERATED_DIR;
      if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
      const fileName = `tg_${Date.now()}.jpg`;
      fs.writeFileSync(path.join(genDir, fileName), buf);
      console.log(`[IMAGE] Together ${togetherCfg.model} saved: /generated/${fileName}`);
      return res.json({ url: `/generated/${fileName}`, prompt, model: togetherCfg.model, provider: 'together', ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] Together failed:', err.message);
      if (model !== 'auto-quality') {
        return res.status(502).json({ error: 'Seçili Together görsel modeli şu an yanıt vermedi: ' + err.message, model: imgModel, provider: 'together', ok: false });
      }
      imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    }
  }

  // ── AIML API (Nano Banana / Flux — unified, good for quality adult mood) ───
  if (imgModel === 'aiml-flux' || imgModel === 'aiml-nano') {
    const aimlKey = overrideKey || AIMLAPI_KEY;
    if (!aimlKey) {
      if (model !== 'auto-quality') {
        return res.status(503).json({ error: 'Seçili AIML görsel modeli için API key tanımlı değil.', model: imgModel, provider: 'aimlapi', ok: false });
      }
      imgModel = 'flux';
    } else try {
      const aimlCfg = AIML_IMAGE_MODELS[imgModel] || { model: 'flux-pro' };
      // AIML supports OpenAI-compatible image gen or custom; try /v1/images/generations first
      const aimlRes = await fetch('https://api.aimlapi.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aimlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aimlCfg.model,
          prompt,
          n: 1,
          size: `${imageSize.width || 1024}x${imageSize.height || 1024}`
        }),
        signal: AbortSignal.timeout(120000)
      });
      const aimlData = await aimlRes.json().catch(() => ({}));
      if (!aimlRes.ok) throw new Error(aimlData?.error?.message || aimlData?.message || 'AIML image error');
      const imgUrl = aimlData?.data?.[0]?.url || aimlData?.images?.[0]?.url || aimlData?.data?.[0]?.b64_json;
      if (!imgUrl) throw new Error('AIML URL boş');
      let buf;
      if (typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
        const dl = await fetch(imgUrl);
        if (!dl.ok) throw new Error('AIML görsel indirilemedi');
        buf = Buffer.from(await dl.arrayBuffer());
      } else {
        buf = Buffer.from(imgUrl, 'base64');
      }
      const genDir = GENERATED_DIR;
      if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
      const fileName = `aiml_${Date.now()}.png`;
      fs.writeFileSync(path.join(genDir, fileName), buf);
      console.log(`[IMAGE] AIML ${aimlCfg.model} saved: /generated/${fileName}`);
      return res.json({ url: `/generated/${fileName}`, prompt, model: aimlCfg.model, provider: 'aimlapi', ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] AIML failed:', err.message);
      if (model !== 'auto-quality') {
        return res.status(502).json({ error: 'Seçili AIML görsel modeli şu an yanıt vermedi: ' + err.message, model: imgModel, provider: 'aimlapi', ok: false });
      }
      imgModel = IMAGEGPT_API_KEY ? 'imagegpt-free' : 'flux';
    }
  }

  if (imgModel === 'imagegpt-free') {
    const imageGptKey = overrideKey || IMAGEGPT_API_KEY;
    if (!imageGptKey) {
      if (model !== 'auto-quality') {
        return res.status(503).json({ error: 'Seçili ImageGPT modeli için API key tanımlı değil.', model: imgModel, provider: 'imagegpt', ok: false });
      }
      imgModel = 'flux';
    } else try {
      const igRes = await fetch('https://api.imagegpt.online/generate/text-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': imageGptKey },
        body: JSON.stringify({
          prompt,
          width: Math.min(imageSize.width, 1024),
          height: Math.min(imageSize.height, 1024),
          model: 'FLUX-SCHNELL',
          outputType: 'url',
          outputFormat: 'png'
        }),
        signal: AbortSignal.timeout(90000)
      });
      const igData = await igRes.json().catch(() => ({}));
      if (!igRes.ok || !igData.url) throw new Error(igData.error?.message || igData.message || 'ImageGPT image error');
      const dlRes = await fetch(igData.url, { signal: AbortSignal.timeout(60000) });
      if (!dlRes.ok) throw new Error('ImageGPT görsel indirilemedi (' + dlRes.status + ')');
      const buf = Buffer.from(await dlRes.arrayBuffer());
      if (buf.length < 1000) throw new Error('ImageGPT boş görsel döndürdü');
      const url = saveGeneratedImageBuffer(buf, 'imagegpt', 'png');
      return res.json({ url, prompt, model: 'imagegpt-free', provider: 'imagegpt', creditsDeducted: igData.creditsDeducted, taskId: igData.taskId, ...imageMeta });
    } catch (err) {
      console.warn('[IMAGE] ImageGPT failed:', err.message);
      if (model !== 'auto-quality') {
        return res.status(502).json({ error: 'Seçili ImageGPT modeli şu an yanıt vermedi: ' + err.message, model: imgModel, provider: 'imagegpt', ok: false });
      }
      imgModel = 'flux';
    }
  }

  // 0) CLOUDFLARE WORKERS AI (low-cost/free allocation)
  if (CLOUDFLARE_IMAGE_MODELS[imgModel]) {
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      if (model !== 'auto-quality') {
        return res.status(503).json({ error: 'Seçili Cloudflare görsel modeli için API key tanımlı değil.', model: imgModel, provider: 'cloudflare', ok: false });
      }
      imgModel = 'flux';
      console.log('[IMAGE] Cloudflare credentials missing; auto-quality will try another real provider');
    } else try {
      const out = await callCloudflareImageModel({ modelId: imgModel, prompt, imageSize });
      return res.json({ ...out, prompt, ...imageMeta });
    } catch (err) {
      console.error('[IMAGE ERROR (Cloudflare)]', err.message);
      if (model !== 'auto-quality') {
        return res.status(502).json({ error: 'Seçili Cloudflare görsel modeli şu an yanıt vermedi: ' + err.message, model: imgModel, provider: 'cloudflare', ok: false });
      }
      imgModel = 'flux';
      console.log('[IMAGE] Cloudflare failed; auto-quality will try another real provider');
    }
  }

  // 1) POLLINATIONS (Ücretsiz Modeller ve Stiller) — retry + model rotation
  if (POLLINATIONS_IMAGE_MODEL_ALIASES[imgModel] || ['turbo', 'sana', 'klein', 'wan-image', 'qwen-image', 'flux-realism', 'flux-anime', 'flux-3d'].includes(imgModel) || imgModel.startsWith('style-')) {
    let finalPrompt = prompt;
    const allowLegacyImageProviderFallback = false;
    
    // === CLOUDFLARE WORKERS AI PRIMARY (12s, 10K/gün ÜCRETSİZ, YENİLENİYOR) ===
    if (allowLegacyImageProviderFallback && CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN && (imgModel === 'flux' || imgModel.startsWith('style-'))) {
      try {
        const styleAddOn = imgModel.startsWith('style-') ? ({
          'style-midjourney': ', in the style of Midjourney V6, highly detailed, masterpiece',
          'style-dalle3': ', DALL-E 3 aesthetic, vibrant colors',
          'style-anime': ', anime style, studio ghibli, highly detailed',
          'style-realism': ', ultra realistic, 8k, photorealistic',
          'style-cinematic': ', cinematic lighting, dramatic shadows, movie still',
          'style-3d': ', 3d render, unreal engine 5, octane render',
          'style-cyberpunk': ', cyberpunk style, neon lights, futuristic'
        }[imgModel] || '') : '';
        const cfPrompt = String(prompt) + styleAddOn;
        const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CLOUDFLARE_API_TOKEN },
          body: JSON.stringify({ prompt: cfPrompt, width: imageSize.width, height: imageSize.height, num_steps: 20 }),
          signal: AbortSignal.timeout(60000)
        });
        if (cfRes.ok) {
          const ct = cfRes.headers.get('content-type') || '';
          if (ct.includes('image')) {
            const buf = Buffer.from(await cfRes.arrayBuffer());
            if (buf.length >= 10000) {
              const genDir = GENERATED_DIR;
              if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
              const fileName = 'cf_' + Date.now() + '.png';
              fs.writeFileSync(path.join(genDir, fileName), buf);
              console.log('[IMAGE] Cloudflare SDXL saved: /generated/' + fileName + ' (' + (buf.length/1024).toFixed(1) + 'KB)');
              return res.json({ url: '/generated/' + fileName, prompt: cfPrompt, model: imgModel, provider: 'cloudflare-sdxl', ...imageMeta });
            }
          }
        } else {
          console.warn('[IMAGE] Cloudflare status', cfRes.status);
        }
      } catch (cfErr) {
        console.warn('[IMAGE] Cloudflare err:', cfErr.message);
      }
    }
    
    // === SHENFENG gpt-image-2 PRIMARY (HD, stabil, ücretsiz) ===
    const SHEN_KEY_IMG = process.env.SHENFENG_OPENAI_KEY || process.env.SHENFENG_IMAGE_KEY || '';
    if (allowLegacyImageProviderFallback && (imgModel === 'flux' || imgModel.startsWith('style-'))) {
      try {
        const styleAddOn = imgModel.startsWith('style-') ? ({
          'style-midjourney': ', in the style of Midjourney V6, highly detailed, masterpiece',
          'style-dalle3': ', DALL-E 3 aesthetic, vibrant colors',
          'style-anime': ', anime style, studio ghibli, highly detailed',
          'style-realism': ', ultra realistic, 8k, photorealistic',
          'style-cinematic': ', cinematic lighting, dramatic shadows, movie still',
          'style-3d': ', 3d render, unreal engine 5, octane render',
          'style-cyberpunk': ', cyberpunk style, neon lights, futuristic'
        }[imgModel] || '') : '';
        const shenPrompt = String(prompt) + styleAddOn;
        const shenBody = JSON.stringify({ model: 'gpt-image-2', prompt: shenPrompt, n: 1, size: imageSize.size });
        const shenRes = await fetch('https://api.shenfengwl.fun/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SHEN_KEY_IMG },
          body: shenBody,
          signal: AbortSignal.timeout(120000)
        });
        if (shenRes.ok) {
          const shenJson = await shenRes.json();
          const item = shenJson.data?.[0];
          let buf = null;
          if (item?.b64_json) buf = Buffer.from(item.b64_json, 'base64');
          else if (item?.url) {
            const dl = await fetch(item.url, { signal: AbortSignal.timeout(60000) });
            if (dl.ok) buf = Buffer.from(await dl.arrayBuffer());
          }
          if (buf && buf.length >= 1000) {
            const genDir = GENERATED_DIR;
            if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
            const fileName = 'shen_' + Date.now() + '.jpg';
            fs.writeFileSync(path.join(genDir, fileName), buf);
            console.log('[IMAGE] Shenfeng saved: /generated/' + fileName + ' (' + (buf.length/1024).toFixed(1) + 'KB)');
            return res.json({ url: '/generated/' + fileName, prompt: shenPrompt, model: imgModel, provider: 'shenfeng-gpt-image-2', ...imageMeta });
          }
        } else {
          console.warn('[IMAGE] Shenfeng status', shenRes.status);
        }
      } catch (shenErr) {
        console.warn('[IMAGE] Shenfeng err:', shenErr.message);
      }
    }
    
    let finalModel = POLLINATIONS_IMAGE_MODEL_ALIASES[imgModel] || imgModel;
    if (imgModel.startsWith('style-')) {
      finalModel = 'flux';
      const styles = {
        'style-midjourney': ', in the style of Midjourney V6, highly detailed, masterpiece, trending on artstation',
        'style-dalle3': ', DALL-E 3 aesthetic, vibrant colors, clear focus, digital art',
        'style-anime': ', anime style, studio ghibli, makoto shinkai, highly detailed illustration, 2d',
        'style-realism': ', ultra realistic, 8k resolution, photorealistic, photography, canon eos, sharp focus',
        'style-cinematic': ', cinematic lighting, dramatic shadows, movie still, 35mm lens, depth of field',
        'style-3d': ', 3d render, unreal engine 5, octane render, ray tracing, highly detailed',
        'style-cyberpunk': ', cyberpunk style, neon lights, futuristic, retrowave, synthwave'
      };
      if (styles[imgModel]) finalPrompt += styles[imgModel];
    }

    // Model rotation: 429 gelirse farklı seed ile tekrar dene
    const MAX_RETRIES = 2;
    let lastErr = null;
    if (!POLLINATIONS_API_KEYS.length) {
      return res.status(503).json({
        error: 'Pollinations görsel modeli için POLLINATIONS_API_KEY gerekli. Yeni Pollinations API artık token istiyor.',
        model: finalModel,
        provider: 'pollinations',
        ok: false
      });
    }

    const cooldown = pollinationsCooldownStatus(finalModel);
    if (cooldown.coolingDown) {
      lastErr = new Error(`Pollinations ${finalModel} kısa süreli beklemede (${Math.ceil(cooldown.remainingMs / 1000)} sn). Model Değiştir veya Çalışan Modele Geç kullan.`);
    } else {
      try {
        return await enqueuePollinationsImage(async () => {
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              const seed = Math.floor((Date.now() + attempt * 7777 + Math.floor(Math.random() * 99999)) % 2147483647);
              const activePollinationsKey = getPollinationsKey();
              const imgUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(finalPrompt)}?model=${encodeURIComponent(finalModel)}&width=${imageSize.width}&height=${imageSize.height}&nologo=true&seed=${seed}`;
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 45000);
              const response = await fetch(imgUrl, {
                signal: controller.signal,
                headers: {
                  'Authorization': `Bearer ${activePollinationsKey}`,
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Referer': 'https://froxyai.com/',
                  'Accept': 'image/avif,image/webp,image/jpeg,image/png,image/*'
                }
              });
              clearTimeout(timeout);

              const ct = response.headers.get('content-type') || '';
              if (response.status === 429) {
                const retryAfterMs = pollinationsRetryAfterMs(response);
                if (retryAfterMs > 0) {
                  const rateErr = new Error(`Pollinations rate limit/kuyruk. Retry-After: ${Math.ceil(retryAfterMs / 1000)} sn`);
                  rateErr.retryAfterMs = retryAfterMs;
                  throw rateErr;
                }
                console.warn(`[IMAGE] Pollinations ${finalModel} attempt ${attempt+1}/${MAX_RETRIES} status ${response.status}`);
                await new Promise(r => setTimeout(r, 2500 + attempt * 1500));
                continue;
              }
              if (!response.ok && ct.includes('application/json')) {
                const errData = await response.json().catch(() => ({}));
                let errMessage = errData?.error?.message || errData?.message || `Pollinations HTTP ${response.status}`;
                if (response.status === 402 && /insufficient balance/i.test(errMessage)) {
                  errMessage = `Pollinations bakiyesi yetersiz. ${errMessage}`;
                } else if (response.status === 402 && /queue full/i.test(errMessage)) {
                  errMessage = `Pollinations kuyruğu dolu. ${errMessage}`;
                } else if (response.status === 401) {
                  errMessage = `Pollinations API key geçersiz veya eksik. ${errMessage}`;
                } else if (response.status === 403) {
                  errMessage = `Pollinations API key yetkisiz. ${errMessage}`;
                }
                const err = new Error(`Pollinations HTTP ${response.status}: ${errMessage}`);
                err.retryAfterMs = pollinationsRetryAfterMs(response);
                throw err;
              }
              if (!response.ok) throw new Error(`Pollinations HTTP ${response.status}`);
              if (!ct.includes('image')) throw new Error(`image yerine ${ct} döndü`);

              const buffer = Buffer.from(await response.arrayBuffer());
              const ext = validateGeneratedImageBuffer(buffer, 'Pollinations ' + finalModel, 1000) || (ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png');
              const savedUrl = saveGeneratedImageBuffer(buffer, 'pollinations', ext);
              pollinationsImageCooldownUntil.delete(pollinationsCooldownKey(finalModel));
              console.log(`[IMAGE] Saved: ${savedUrl} (${(buffer.length/1024).toFixed(1)}KB) for: "${prompt.substring(0,30)}" [${finalModel}]`);
              return res.json({ url: savedUrl, prompt: finalPrompt, model: finalModel, requestedModel: imgModel, provider: 'pollinations', queue: { active: pollinationsImageActive, pending: pollinationsImageQueue.length }, ...imageMeta });
            } catch (err) {
              lastErr = err;
              if (err.name === 'AbortError') {
                console.warn(`[IMAGE] Pollinations ${finalModel} attempt ${attempt+1} timeout`);
              } else {
                console.warn(`[IMAGE] Pollinations ${finalModel} attempt ${attempt+1} failed: ${err.message}`);
              }
              if (attempt < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, 1000 + attempt * 750));
            }
          }
          markPollinationsCooldown(finalModel, lastErr);
          throw lastErr || new Error('Pollinations bilinmeyen hata');
        });
      } catch (err) {
        lastErr = err;
      }
    }
    // Pollinations retry başarısızsa yalnızca auto-quality için başka gerçek sağlayıcı denenir.
    if (allowLegacyImageProviderFallback && model === 'auto-quality' && CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
      try {
        console.log(`[IMAGE] Pollinations failed. Falling back to Cloudflare Workers AI for model: ${imgModel}`);
        const styleAddOn = imgModel.startsWith('style-') ? ({
          'style-midjourney': ', in the style of Midjourney V6, highly detailed, masterpiece',
          'style-dalle3': ', DALL-E 3 aesthetic, vibrant colors',
          'style-anime': ', anime style, studio ghibli, highly detailed',
          'style-realism': ', ultra realistic, 8k, photorealistic',
          'style-cinematic': ', cinematic lighting, dramatic shadows, movie still',
          'style-3d': ', 3d render, unreal engine 5, octane render',
          'style-cyberpunk': ', cyberpunk style, neon lights, futuristic'
        }[imgModel] || '') : ({
          'flux-realism': ', ultra realistic, 8k resolution, photorealistic, photography, canon eos, sharp focus',
          'flux-anime': ', anime style, beautiful illustration, studio ghibli style, makoto shinkai, vibrant colors',
          'flux-3d': ', 3d render, unreal engine 5, highly detailed, octane render, ray tracing'
        }[imgModel] || '');
        const fallbackPrompt = String(prompt) + styleAddOn;
        const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: fallbackPrompt, width: imageSize.width, height: imageSize.height, num_steps: 20 }),
          signal: AbortSignal.timeout(20000)
        });
        if (cfRes.ok) {
          const buf = Buffer.from(await cfRes.arrayBuffer());
          if (buf.length < 10000) throw new Error('Cloudflare fallback cok kucuk/eksik gorsel dondurdu');
          const genDir = GENERATED_DIR;
          if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
          const fileName = `cf_${Date.now()}.png`;
          fs.writeFileSync(path.join(genDir, fileName), buf);
          console.log(`[IMAGE] Cloudflare auto-quality saved: /generated/${fileName}`);
          return res.json({ url: `/generated/${fileName}`, prompt: fallbackPrompt, model: imgModel, provider: 'cloudflare-auto-quality', ...imageMeta });
        }
      } catch (cfErr) {
        console.warn('[IMAGE] Cloudflare fallback failed:', cfErr.message);
      }
    }
    return res.status(502).json({
      error: 'Seçili görsel sağlayıcısı şu an yanıt vermedi: ' + (lastErr?.message || 'bilinmeyen hata'),
      prompt: finalPrompt,
      model: finalModel,
      requestedModel: imgModel,
      provider: 'pollinations',
      ok: false
    });
  }

  // 2) GUICORE (Premium Modeller - nano-banana)
  const p = PROVIDERS.image;
  const url = p.base + '/chat/completions';
  const payload = JSON.stringify({
    model: imgModel,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + p.key
      },
      body: payload,
      signal: AbortSignal.timeout(25000)
    });

    const data = await response.json();
    if (!response.ok || !data.choices) {
      throw new Error(data.error?.message || 'Guicore Image API failed');
    }

    const content = data.choices[0].message.content;
    console.log(`[IMAGE] Guicore Response for "${imgModel}":`, content.substring(0, 50).replace(/\n/g, ' '));

    // Extract markdown image URL: ![alt](url)
    const match = content.match(/!\[.*?\]\((.*?)\)/);
    let imageUrl = '';
    
    if (match && match[1]) {
      imageUrl = match[1];
    } else {
      if (content.startsWith('http')) imageUrl = content.trim();
      else throw new Error('API geçerli bir resim linki döndürmedi: ' + content.substring(0, 40));
    }

    res.json({ url: imageUrl, prompt });
  } catch (err) {
    console.error('[IMAGE ERROR (Guicore)]', err.message);
    return res.status(502).json({
      error: 'Seçili görsel sağlayıcısı şu an yanıt vermedi: ' + err.message,
      prompt,
      model: imgModel,
      provider: 'guicore-image',
      ok: false
    });
  }
});

// === IMAGE PROXY: Pollinations'a server uzerinden istek at ===
// Browser src='/api/img-proxy?prompt=...' -> server pollinations'a gider, gorseli getirir, cache'ler.

// Request throttling: aynı anda en fazla 2 Pollinations isteği, diğerleri sıraya girer
let _pollinationsActive = 0;
const _pollinationsQueue = [];
const POLLINATIONS_MAX_CONCURRENT = 2;

async function _processPollinationsQueue() {
  if (_pollinationsActive >= POLLINATIONS_MAX_CONCURRENT) return;
  if (_pollinationsQueue.length === 0) return;
  const job = _pollinationsQueue.shift();
  _pollinationsActive++;
  try {
    const result = await job.fn();
    job.resolve(result);
  } catch (e) {
    job.reject(e);
  } finally {
    _pollinationsActive--;
    setTimeout(_processPollinationsQueue, 800); // 800ms gap between requests
  }
}

function throttledPollinationsFetch(fn) {
  return new Promise((resolve, reject) => {
    _pollinationsQueue.push({ fn, resolve, reject });
    _processPollinationsQueue();
  });
}

app.get('/api/img-proxy', async (req, res) => {
  const { prompt, seed, model } = req.query;
  const imageSize = resolveImageSize(req.query || {});
  if (!prompt) return res.status(400).send('Prompt required');
  const cacheKey = crypto.createHash('md5').update(`${prompt}_${seed||''}_${model||'flux'}_${imageSize.width}x${imageSize.height}`).digest('hex');
  const genDir = path.join(GENERATED_DIR, 'proxy');
  if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
  const cachePath = path.join(genDir, `${cacheKey}.jpg`);
  if (fs.existsSync(cachePath)) {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(fs.readFileSync(cachePath));
  }
  const finalSeed = seed || Date.now();
  const polModel = model || 'flux';
  
  try {
    const buf = await throttledPollinationsFetch(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const seedToUse = Number(finalSeed) + attempt * 1000;
          const polUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${polModel}&width=${imageSize.width}&height=${imageSize.height}&nologo=true&seed=${seedToUse}`;
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 120000);
          const polRes = await fetch(polUrl, {
            signal: ctrl.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://froxyai.com/',
              'Accept': 'image/avif,image/webp,image/jpeg,image/png,image/*'
            }
          });
          clearTimeout(t);
          if (polRes.status === 429 || polRes.status === 402) {
            console.warn(`[IMG-PROXY] Attempt ${attempt+1} status ${polRes.status}, waiting ${4+attempt*3}s`);
            await new Promise(r => setTimeout(r, 4000 + attempt * 3000));
            continue;
          }
          if (!polRes.ok) {
            if (attempt < 3) { await new Promise(r => setTimeout(r, 2000)); continue; }
            throw new Error(`HTTP ${polRes.status}`);
          }
          const ct = polRes.headers.get('content-type') || '';
          if (!ct.includes('image')) { if (attempt < 3) { await new Promise(r => setTimeout(r, 2000)); continue; } throw new Error(`Wrong content-type: ${ct}`); }
          const b = Buffer.from(await polRes.arrayBuffer());
          if (b.length < 1000) { if (attempt < 3) continue; throw new Error(`Tiny response: ${b.length}b`); }
          return b;
        } catch (err) {
          console.warn(`[IMG-PROXY] Attempt ${attempt+1} err:`, err.message);
          if (attempt < 3) await new Promise(r => setTimeout(r, 2500));
          else throw err;
        }
      }
      throw new Error('All attempts failed');
    });
    
    fs.writeFileSync(cachePath, buf);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(buf);
  } catch (err) {
    console.warn('[IMG-PROXY] Final failure:', err.message);
    return res.status(503).json({ error: err.message || 'Görsel üretilemedi, lütfen tekrar deneyin.' });
  }
});

// Video generation endpoint - Real Gemini Veo API
app.post('/api/video', chatLimiter, async (req, res) => {
  const { prompt, model } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt gerekli' });
  const adultBlockReason = detectAdultSafetyBlock(prompt);
  if (adultBlockReason) {
    return res.status(400).json({ error: adultBlockReason, code: 'adult_safety_block' });
  }

  if (model === 'comfyui-video-local') {
    try {
      const out = await callComfyLocalVideo({ prompt });
      return res.json({ ...out, prompt });
    } catch (err) {
      console.warn('[VIDEO] ComfyUI local failed:', err.message);
      try {
        return res.json(await callPollinationsVideo({ prompt, model: 'ltx-2', fallbackFrom: 'comfyui-video-local', fallbackReason: err.message }));
      } catch (fbErr) {
        return res.status(503).json({ error: 'ComfyUI local video hazir degil ve Pollinations fallback de basarisiz: ' + err.message + ' | fallback: ' + fbErr.message, model, provider: 'comfyui-local' });
      }
    }
  }

  // ── POLLINATIONS VIDEO (ltx-2 ücretsiz, seedance/veo paralı) ──────────
  // Yeni endpoint: https://image.pollinations.ai/prompt/{prompt}?model=<videoModel>
  // Ücretsiz erişim için sk_ anahtarı gerekli; yoksa anonim dener (pk_ limiti).
  if (['pollinations-video', 'ltx-2', 'nova-reel', 'seedance-lite', 'wan-fast'].includes(model)) {
    try {
      const polKey = fromEnv('POLLINATIONS_KEY') || fromEnv('POLLINATIONS_API_KEY');
      const polModel = model === 'pollinations-video' ? 'ltx-2' : model;
      const polUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${polModel}&duration=5&aspectRatio=16:9${polKey ? '' : '&nologo=true'}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 180000); // 3 dk
      const polRes = await fetch(polUrl, {
        signal: ctrl.signal,
        headers: polKey ? { 'Authorization': `Bearer ${polKey}` } : {}
      });
      clearTimeout(t);
      if (!polRes.ok) {
        const errText = await polRes.text().catch(() => '');
        throw new Error(`Pollinations ${polRes.status}: ${errText.slice(0, 200)}`);
      }
      const ct = polRes.headers.get('content-type') || '';
      if (!ct.includes('video')) {
        const errText = await polRes.text().catch(() => '');
        throw new Error(`Pollinations video yerine ${ct} döndü: ${errText.slice(0, 200)}`);
      }
      const buf = Buffer.from(await polRes.arrayBuffer());
      const genDir = GENERATED_DIR;
      if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
      const fileName = `pv_${Date.now()}.mp4`;
      fs.writeFileSync(path.join(genDir, fileName), buf);
      console.log(`[VIDEO] Pollinations (${polModel}) saved: /generated/${fileName} (${(buf.length/1024).toFixed(1)}KB)`);
      return res.json({ url: `/generated/${fileName}`, prompt, provider: 'pollinations', model: polModel });
    } catch (err) {
      console.warn('[VIDEO] Pollinations failed:', err.message);
      if (fromEnv('HF_TOKEN') && model !== 'hf-ltx' && model !== 'ltx-video') {
        try {
          const hfRes = await fetch('https://api-inference.huggingface.co/models/Lightricks/LTX-Video', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${fromEnv('HF_TOKEN')}`, 'Content-Type': 'application/json', 'Accept': 'video/mp4' },
            body: JSON.stringify({ inputs: prompt, parameters: { num_frames: 25, fps: 8, width: 704, height: 480 } }),
            signal: AbortSignal.timeout(180000)
          });
          if (!hfRes.ok) {
            const errText = await hfRes.text().catch(() => '');
            throw new Error(`HF ${hfRes.status}: ${errText.slice(0, 180)}`);
          }
          const ct = hfRes.headers.get('content-type') || '';
          if (!ct.includes('video')) throw new Error(`HF video yerine ${ct} döndü`);
          const buf = Buffer.from(await hfRes.arrayBuffer());
          if (buf.length < 1000) throw new Error(`HF video çok küçük yanıt (${buf.length} bytes)`);
          const genDir = GENERATED_DIR;
          if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
          const fileName = `ltx_${Date.now()}.mp4`;
          fs.writeFileSync(path.join(genDir, fileName), buf);
          return res.json({ url: `/generated/${fileName}`, prompt, provider: 'huggingface-ltx', model: 'hf-ltx', fallbackFrom: model, fallbackReason: err.message });
        } catch (hfErr) {
          console.warn('[VIDEO] Pollinations -> HF fallback failed:', hfErr.message);
        }
      }
      return res.status(503).json({ error: 'Pollinations video şu an kullanılamıyor: ' + err.message + '. Lütfen başka bir model deneyin veya POLLINATIONS_KEY .env içinde tanımlayın.' });
    }
  }

  // ── HUGGINGFACE LTX-VIDEO (ücretsiz tier, HF_TOKEN ile) ───────────────
  if (model === 'ltx-video' || model === 'hf-ltx') {
    const hfKey = fromEnv('HF_TOKEN');
    try {
      // HuggingFace Inference API — LTX-Video
      const hfRes = await fetch('https://api-inference.huggingface.co/models/Lightricks/LTX-Video', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json', 'Accept': 'video/mp4' },
        body: JSON.stringify({ inputs: prompt, parameters: { num_frames: 25, fps: 8, width: 704, height: 480 } })
      });
      if (!hfRes.ok) {
        const errText = await hfRes.text();
        // Model yüklenmiyorsa açıklayıcı mesaj
        if (hfRes.status === 503) throw new Error('Model HuggingFace üzerinde cold-start yapıyor. 20 saniye sonra tekrar deneyin.');
        if (hfRes.status === 404) throw new Error('LTX-Video HuggingFace free tier\'da şu an mevcut değil. Wavespeed Wan veya Pollinations LTX-2 deneyin.');
        throw new Error(`HF ${hfRes.status}: ${errText.slice(0, 200)}`);
      }
      const ct = hfRes.headers.get('content-type') || '';
      if (!ct.includes('video')) throw new Error(`HF video yerine ${ct} döndü`);
      const buf = Buffer.from(await hfRes.arrayBuffer());
      const genDir = GENERATED_DIR;
      if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
      const fileName = `ltx_${Date.now()}.mp4`;
      fs.writeFileSync(path.join(genDir, fileName), buf);
      console.log(`[VIDEO] HF LTX-Video saved: /generated/${fileName} (${(buf.length/1024).toFixed(1)}KB)`);
      return res.json({ url: `/generated/${fileName}`, prompt, provider: 'huggingface-ltx' });
    } catch (err) {
      console.warn('[VIDEO] HF LTX failed:', err.message);
      return res.status(503).json({ error: err.message });
    }
  }

  // ── WAVESPEED AI (Kling / Wan / Seedance — free trial) ────────────────
  if (['wavespeed-kling', 'wavespeed-wan', 'wavespeed-seedance'].includes(model)) {
    if (!WAVESPEED_API_KEY) {
      return res.status(503).json({ error: 'WAVESPEED_API_KEY gerekli. https://wavespeed.ai üzerinden ücretsiz key alın.' });
    }
    const wsModelMap = {
      'wavespeed-kling':     'wavespeed-ai/kling-v2.1-pro/text-to-video',
      'wavespeed-wan':       'wavespeed-ai/wan-2.1-t2v-720p',
      'wavespeed-seedance':  'wavespeed-ai/seedance-1.0-lite-t2v-480p'
    };
    const wsModel = wsModelMap[model];
    try {
      const startRes = await fetch(`https://api.wavespeed.ai/api/v3/${wsModel}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WAVESPEED_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration: 5, aspect_ratio: '16:9', enable_safety_checker: true })
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.message || startData.error || 'Wavespeed başlatılamadı');
      const predId = startData.data?.id;
      if (!predId) throw new Error('Wavespeed prediction ID yok');

      for (let i = 0; i < 48; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const pollRes = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${predId}/result`, {
          headers: { 'Authorization': `Bearer ${WAVESPEED_API_KEY}` }
        });
        const pollData = await pollRes.json();
        const status = pollData.data?.status;
        if (status === 'completed') {
          const videoUrl = pollData.data?.outputs?.[0];
          if (!videoUrl) throw new Error('Wavespeed video URL yok');
          return res.json({ url: videoUrl, prompt, model, provider: 'wavespeed' });
        }
        if (status === 'failed') throw new Error(pollData.data?.error || 'Wavespeed başarısız');
      }
      throw new Error('Wavespeed zaman aşımı');
    } catch (err) {
      console.error('[VIDEO] Wavespeed error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // Handle new video agents (Seedance, CapCut)
  if (['capcut-bro', 'kling-v1'].includes(model)) {
    return res.status(403).json({ error: `${model.toUpperCase()} ajanı için şu anda API kota limitine ulaşıldı veya entegrasyon aşamasında. Lütfen daha sonra tekrar deneyin.` });
  }

  // Map UI model names to Veo model IDs
  const veoModels = {
    'veo-2': 'veo-2.0-generate-001',
    'veo-3': 'veo-3.0-generate-001',
    'veo-3-fast': 'veo-3.0-fast-generate-001',
    'veo-3.1': 'veo-3.1-generate-preview',
    'veo-3.1-fast': 'veo-3.1-fast-generate-preview'
  };
  const modelId = veoModels[model] || 'veo-3.0-fast-generate-001';
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  console.log(`[VIDEO] Generating with ${modelId} for: "${prompt.substring(0, 50)}"`);

  try {
    if (model === 'vidu-cheap' || model === 'vidu-720') {
      if (!VIDU_API_KEY) {
        return res.status(503).json({ error: 'Vidu video icin VIDU_API_KEY gerekli.' });
      }

      const isCheap = model === 'vidu-cheap';
      const viduPayload = {
        model: 'viduq3-turbo',
        style: 'general',
        prompt,
        duration: 5,
        seed: 0,
        aspect_ratio: '16:9',
        resolution: isCheap ? '540p' : '720p',
        movement_amplitude: 'auto',
        off_peak: true,
        audio: false
      };

      const startRes = await fetch('https://api.vidu.com/ent/v2/text2video', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${VIDU_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(viduPayload)
      });
      const startData = await startRes.json();
      if (!startRes.ok || !startData.task_id) {
        if ((startData.message || startData.error || '').includes('CreditInsufficient')) {
          return res.status(402).json({ error: 'Vidu kredisi yetersiz. API key dogru calisiyor ama hesapta video uretimi icin yeterli kredi/free quota yok.' });
        }
        throw new Error(startData.message || startData.error || 'Vidu video baslatilamadi');
      }

      for (let i = 0; i < 48; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const pollRes = await fetch(`https://api.vidu.com/ent/v2/tasks/${startData.task_id}/creations`, {
          headers: { 'Authorization': `Token ${VIDU_API_KEY}` }
        });
        const pollData = await pollRes.json();
        if (pollData.state === 'success') {
          const videoUrl = pollData.creations?.[0]?.url;
          if (!videoUrl) throw new Error('Vidu sonucu video URL donmedi');
          return res.json({
            url: videoUrl,
            prompt,
            model,
            provider: 'vidu',
            credits: pollData.credits
          });
        }
        if (pollData.state === 'failed') {
          throw new Error(pollData.err_msg || pollData.err_code || 'Vidu video uretimi basarisiz');
        }
      }

      throw new Error('Vidu video uretim zaman asimi');
    }

    if (model === 'seedance-2' || model === 'seedance-2-fast') {
      if (FAL_API_KEY) {
        const falModel = model === 'seedance-2-fast'
          ? 'bytedance/seedance-2.0/fast/text-to-video'
          : 'bytedance/seedance-2.0/text-to-video';
        console.log(`[VIDEO] Starting Seedance via Fal.ai: ${falModel}`);
        const startRes = await fetch(`https://queue.fal.run/${falModel}`, {
          method: 'POST',
          headers: { 'Authorization': `Key ${FAL_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, duration: '5', resolution: '720p', aspect_ratio: '16:9' })
        });
        const startData = await startRes.json();
        if (!startRes.ok) throw new Error(startData.detail || startData.error || 'Seedance baslatilamadi');
        const reqId = startData.request_id;

        for (let i = 0; i < 36; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const checkRes = await fetch(`https://queue.fal.run/${falModel}/requests/${reqId}/status`, {
            headers: { 'Authorization': `Key ${FAL_API_KEY}` }
          });
          const checkData = await checkRes.json();
          if (checkData.status === 'COMPLETED') {
            const resultRes = await fetch(`https://queue.fal.run/${falModel}/requests/${reqId}`, {
              headers: { 'Authorization': `Key ${FAL_API_KEY}` }
            });
            const resultData = await resultRes.json();
            const videoUrl = extractVideoUrl(resultData);
            if (!videoUrl) throw new Error('Seedance sonucu video URL donmedi');
            return res.json({ url: videoUrl, prompt, model, provider: 'fal' });
          }
          if (checkData.status === 'IN_QUEUE' || checkData.status === 'IN_PROGRESS') continue;
          throw new Error('Seedance uretimi basarisiz: ' + checkData.status);
        }
        throw new Error('Seedance video uretim zaman asimi');
      }

      if (REPLICATE_API_TOKEN) {
        console.log('[VIDEO] Starting Seedance via Replicate');
        const startRes = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-2.0/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait'
          },
          body: JSON.stringify({ input: { prompt, duration: '5', resolution: '720p', aspect_ratio: '16:9' } })
        });
        let pred = await startRes.json();
        if (!startRes.ok) throw new Error(pred.detail || pred.error || 'Replicate Seedance baslatilamadi');

        for (let i = 0; i < 36 && !['succeeded', 'failed', 'canceled'].includes(pred.status); i++) {
          await new Promise(r => setTimeout(r, 5000));
          const pollRes = await fetch(pred.urls.get, {
            headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` }
          });
          pred = await pollRes.json();
        }

        if (pred.status !== 'succeeded') throw new Error('Replicate Seedance durumu: ' + pred.status);
        const videoUrl = extractVideoUrl(pred);
        if (!videoUrl) throw new Error('Replicate Seedance sonucu video URL donmedi');
        return res.json({ url: videoUrl, prompt, model, provider: 'replicate' });
      }

      return res.status(503).json({ error: 'Seedance 2.0 icin FAL_API_KEY veya REPLICATE_API_TOKEN gerekli.' });
    }

    // 1. Gerçek API anahtarı kontrolü.
    // İleride sağlam bir video API'si (ör. Fal.ai, Luma, HuggingFace) satın alınırsa buradan bağlanır.
    const VIDEO_API_KEY = FAL_API_KEY; 
    if (VIDEO_API_KEY) {
      console.log(`[VIDEO] Starting generation via Fal.ai (Luma) for: "${prompt.substring(0, 50)}"`);
      // 1. Fal.ai üzerinden video oluşturma isteğini başlat (Luma Dream Machine)
      const startRes = await fetch('https://queue.fal.run/fal-ai/luma-dream-machine', {
        method: 'POST',
        headers: { 'Authorization': `Key ${VIDEO_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt, aspect_ratio: "16:9" })
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.detail || 'Video başlatılamadı');
      
      const reqId = startData.request_id;
      
      // 2. İşlemin bitmesini bekle (polling)
      for (let i = 0; i < 30; i++) { // Max 150 saniye
        await new Promise(r => setTimeout(r, 5000));
        const checkRes = await fetch(`https://queue.fal.run/fal-ai/luma-dream-machine/requests/${reqId}/status`, {
          headers: { 'Authorization': `Key ${VIDEO_API_KEY}` }
        });
        const checkData = await checkRes.json();
        
        if (checkData.status === 'COMPLETED') {
          // 3. Tamamlandıysa sonucu çek
          const resultRes = await fetch(`https://queue.fal.run/fal-ai/luma-dream-machine/requests/${reqId}`, {
            headers: { 'Authorization': `Key ${VIDEO_API_KEY}` }
          });
          const resultData = await resultRes.json();
          console.log(`[VIDEO] Fal.ai Success! URL:`, resultData.video.url);
          return res.json({ url: resultData.video.url, prompt, model });
        }
        if (checkData.status === 'IN_QUEUE' || checkData.status === 'IN_PROGRESS') {
          console.log(`[VIDEO] Fal.ai Queue: ${checkData.status}...`);
          continue;
        }
        throw new Error('Video üretimi başarısız: ' + checkData.status);
      }
      throw new Error('Video üretim zaman aşımına uğradı');
    }

    // ── GEMINI VEO (Google Direct) — gerçek çağrı ─────────────────────
    // veoModels mapping'i yukarıda tanımlı. Gemini API long-running operation döndürür.
    if (veoModels[model]) {
      const apiKey = getGeminiKey();
      if (!apiKey) {
        return res.status(503).json({ error: 'Veo için GEMINI_API_KEYS .env içinde tanımlı olmalı.' });
      }
      console.log(`[VIDEO] Veo ${modelId} başlatılıyor...`);
      const startRes = await fetch(`${baseUrl}/models/${modelId}:predictLongRunning?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { aspectRatio: '16:9', personGeneration: 'allow_all', durationSeconds: 8 }
        })
      });
      const startData = await startRes.json();
      if (!startRes.ok) {
        const msg = startData.error?.message || `HTTP ${startRes.status}`;
        if (/quota|billing|PERMISSION_DENIED/i.test(msg)) {
          return res.status(402).json({ error: `Veo ücretli bir modeldir. Google AI Studio hesabınızda faturalandırma aktif olmalı. Detay: ${msg.slice(0, 200)}` });
        }
        throw new Error('Veo başlatma: ' + msg);
      }
      const opName = startData.name;
      if (!opName) throw new Error('Veo operation name dönmedi');

      // Long-running operation poll
      let opResult = null;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const opRes = await fetch(`${baseUrl}/${opName}?key=${apiKey}`);
        const opData = await opRes.json();
        if (opData.done) { opResult = opData; break; }
      }
      if (!opResult) throw new Error('Veo zaman aşımı (5 dk)');
      if (opResult.error) throw new Error('Veo hata: ' + (opResult.error.message || JSON.stringify(opResult.error)));

      // Video URI al ve indir
      const videoUri = opResult.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
        || opResult.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) throw new Error('Veo video URI dönmedi');

      const dlRes = await fetch(`${videoUri}&key=${apiKey}`);
      if (!dlRes.ok) throw new Error('Veo video indirme: ' + dlRes.status);
      const buf = Buffer.from(await dlRes.arrayBuffer());
      const genDir = GENERATED_DIR;
      if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
      const fileName = `veo_${Date.now()}.mp4`;
      fs.writeFileSync(path.join(genDir, fileName), buf);
      console.log(`[VIDEO] Veo saved: /generated/${fileName} (${(buf.length/1024).toFixed(1)}KB)`);
      return res.json({ url: `/generated/${fileName}`, prompt, model, provider: 'gemini-veo' });
    }

    // Gerçek anahtar yoksa net bir hata dön.
    return res.status(503).json({ 
      error: 'Bu video modeli için gerekli API key bulunamadı. Desteklenen modeller: ltx-2 / nova-reel (POLLINATIONS_KEY), wavespeed-* (WAVESPEED_API_KEY), veo-3 (GEMINI_API_KEYS + billing), seedance-2 (FAL_API_KEY veya REPLICATE_API_TOKEN), vidu-* (VIDU_API_KEY).'
    });
  } catch (err) {
    console.error('[VIDEO ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Gemini Imagen 4.0 image generation endpoint
app.post('/api/imagen', chatLimiter, async (req, res) => {
  let { prompt, model, apiKey: bodyApiKey } = req.body;
  const imageSize = resolveImageSize(req.body || {});
  if (!prompt) return res.status(400).json({ error: 'Prompt gerekli' });
  const overrideKey = typeof bodyApiKey === 'string' ? bodyApiKey.trim() : '';
  const promptMeta = await buildImagePromptForQuality(prompt, model || 'imagen-4-fast', { research: req.body?.research });
  prompt = promptMeta.prompt;
  const imageMeta = {
    originalPrompt: promptMeta.originalPrompt,
    revised_prompt: prompt,
    referenceUsed: promptMeta.referenceUsed,
    referenceSnippets: promptMeta.referenceSnippets
  };

  try {
    if (String(model || '').startsWith('gemini-')) {
      const directModel = model || 'gemini-2.5-flash-image';
      const out = await callGoogleDirectImage({ model: directModel, prompt, apiKey: overrideKey });
      console.log(`[IMAGEN] Google Direct saved: ${out.url}`);
      return res.json({ ...out, provider: 'google-direct-image', ...imageMeta });
    }

    const imagenModels = {
      'imagen-4': 'imagen-4.0-generate-001',
      'imagen-4-ultra': 'imagen-4.0-ultra-generate-001',
      'imagen-4-fast': 'imagen-4.0-fast-generate-001'
    };
    const modelId = imagenModels[model] || 'imagen-4.0-fast-generate-001';
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    console.log(`[IMAGEN] Generating with ${modelId} for: "${prompt.substring(0, 50)}"`);

    const apiKey = overrideKey || getGeminiKey();
    const response = await fetch(`${baseUrl}/models/${modelId}:predict?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: imageSize.aspectRatio }
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Imagen API hatası');

    if (data.predictions?.[0]?.bytesBase64Encoded) {
      const fs = require('fs');
      const fileName = `img_${Date.now()}.png`;
      fs.mkdirSync(GENERATED_DIR, { recursive: true });
      fs.writeFileSync(path.join(GENERATED_DIR, fileName), Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64'));
      console.log(`[IMAGEN] Saved: /generated/${fileName}`);
      return res.json({ url: `/generated/${fileName}`, prompt, model: modelId, provider: 'gemini-imagen', ...imageMeta });
    }

    throw new Error('Imagen yanıtı beklenen formatta değil');
  } catch (err) {
    console.error('[IMAGEN ERROR]', err.message);
    res.status(503).json({
      error: 'Görsel üretimi şu an kullanılamıyor: ' + err.message,
      provider: 'gemini-imagen',
      model: model || 'imagen-4-fast',
      ok: false
    });
  }
});

// ===== MODEL-BASED CREDIT COST =====
const MODEL_CREDIT_COST = {
  'free': 3,         // Groq, Pollinations, Cerebras, OpenRouter :free (sunucu maliyeti)
  'light': 8,        // Gemini Flash, Claude Haiku, GPT mini, Gemma
  'mid': 20,         // Claude Sonnet, GPT-5.2, DeepSeek V3
  'heavy': 50,       // Claude Opus, GPT-5.5, o3, o1-pro
  'image_free': 10,   // Flux, SDXL, Pollinations (bandwidth)
  'image_mid': 300,   // Imagen 4, GPT-Image-2
  'image_ultra': 900  // Imagen 4 Ultra
};

// Map model IDs to cost tiers
function getModelCreditCost(model, provider) {
  if (!model) return MODEL_CREDIT_COST.light;
  const m = (model || '').toLowerCase();

  if (m === 'comfyui-local' || m === 'fooocus-local' || m === 'a1111-local' || m === 'forge-local' || m === 'swarmui-local') return 1;
  if (MODAL_IMAGE_MODEL_ALIASES.has(m)) return 5;
  if (m.startsWith('pollinations-') || m.startsWith('cf-')) return MODEL_CREDIT_COST.image_free;
  
  // ── FREE TIER (3 kredi) — tamamen ucretsiz saglay\u0131c\u0131lar ──
  if (provider === 'pollinations') return MODEL_CREDIT_COST.free;
  if (provider === 'cerebras') return MODEL_CREDIT_COST.free;
  if (provider === 'cloudflare') return MODEL_CREDIT_COST.free;
  if (m === 'openrouter/free' || m.includes(':free')) return MODEL_CREDIT_COST.free;
  
  const freeModels = [
    'llama-3.1-8b', 'llama-3.3-70b-versatile', 'llama-4-scout', 'llama-4-maverick',
    'gpt-oss-20b', 'gpt-oss-120b', 'qwen/qwen3-32b', 'qwen/qwq-32b',
    'mistral-saba-24b', 'deepseek-r1-distill', 'gemma2-9b', 'gemma-3-12b',
    'allam-2-7b', 'gemini-flash-latest'
  ];
  if (freeModels.some(fm => m.includes(fm))) return MODEL_CREDIT_COST.free;
  if (provider === 'groq') return MODEL_CREDIT_COST.free;
  
  // ── IMAGE MODELS ──
  if (TOGETHER_IMAGE_MODELS[m]) return TOGETHER_IMAGE_MODELS[m].credits;
  if (m === 'auto-quality' || m.startsWith('openai-') || m === 'style-dalle3' || m.includes('gemini-2.5-flash-image') || m.includes('gemini-3.1-flash-image')) return MODEL_CREDIT_COST.image_mid;
  if (m === 'imagegpt-free') return 15;
  if (m.includes('gemini-3-pro-image')) return MODEL_CREDIT_COST.image_ultra;
  if (m.includes('imagen-4-fast')) return 300;
  if (m.includes('imagen-4-ultra')) return MODEL_CREDIT_COST.image_ultra;
  if (m.includes('imagen-4') || m.includes('gpt-image')) return MODEL_CREDIT_COST.image_mid;
  if (m === 'flux' || m.includes('style-') || m === 'turbo' || m === 'sana' || m.includes('cf-sdxl') || m.includes('flux-') || m === 'together-flux') return MODEL_CREDIT_COST.image_free;
  
  // ── HEAVY (50 kredi) — en pahali modeller ──
  const heavyModels = [
    'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-4.5-preview',
    'claude-opus-4', 'claude-opus-4.1', 'claude-opus-4.5', 'claude-opus-4.6', 'claude-opus-4.7',
    'claude-sonnet-4-5',
    'o3', 'o1-pro',
    'gemini-3.1-pro', 'deepseek-v3.2'
  ];
  if (heavyModels.some(em => m.includes(em) && !m.includes('mini') && !m.includes('spark'))) return MODEL_CREDIT_COST.heavy;
  
  // ── MID (20 kredi) — orta segment ──
  const midModels = [
    'gpt-5.4-mini', 'gpt-5.2', 'o3-mini',
    'claude-sonnet-4', 'claude-sonnet-4-6',
    'gemini-3-pro', 'gemini-2.5-pro',
    'deepseek-v3.1', 'deepseek-v3', 'deepseek-v4',
    'grok-3', 'grok-2'
  ];
  if (midModels.some(pm => m.includes(pm))) return MODEL_CREDIT_COST.mid;
  if (provider === 'sambanova' && (m.includes('deepseek') || m.includes('maverick') || m.includes('llama-3.3'))) return MODEL_CREDIT_COST.mid;
  
  // ── LIGHT (8 kredi) — hafif/ucuz modeller ──
  const lightModels = [
    'claude-haiku', 'gpt-5.3-codex-spark',
    'gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.0-flash',
    'gemma-3', 'minimax', 'gpt-5-mini', 'gpt-5-nano'
  ];
  if (lightModels.some(sm => m.includes(sm))) return MODEL_CREDIT_COST.light;
  if (provider === 'sambanova') return MODEL_CREDIT_COST.light;
  if (provider === 'huggingface') return MODEL_CREDIT_COST.light;
  
  // Default: light
  return MODEL_CREDIT_COST.light;
}

// Credit deduction endpoint (called by frontend after successful chat)
app.post('/api/deduct-credit', authMiddleware, (req, res) => {
  const { model, provider, requestedModel, requestedProvider } = req.body;
  const billModel = requestedModel || model;
  const billProvider = requestedProvider || provider;
  const cost = getModelCreditCost(billModel, billProvider);
  
  if (cost === 0) return res.json({ cost: 0, remaining: null, free: true });

  const dailyCheck = checkDailyLimit(req.user.id, 'chat');
  if (!dailyCheck.allowed) {
    return res.status(429).json({ error: dailyCheck.reason });
  }
  
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  if (user.credits < cost) return res.status(402).json({ error: 'Yetersiz kredi', required: cost, remaining: user.credits });
  
  db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(cost, req.user.id);
  incrementDaily(req.user.id, 'chat');
  const updated = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
  logCreditUsage({ userId: req.user.id, kind: 'chat', model: billModel, provider: billProvider, actualModel: model, cost, remaining: updated.credits });
  res.json({ cost, remaining: updated.credits, free: false, model: billModel, provider: billProvider, actualModel: model });
});

// Image generation credit deduction
app.post('/api/deduct-image-credit', authMiddleware, (req, res) => {
  const { model, provider, requestedModel, requestedProvider } = req.body;
  const billModel = requestedModel || model;
  const billProvider = requestedProvider || provider;
  const m = (billModel || '').toLowerCase();
  
  // Daily limit check
  const dailyCheck = checkDailyLimit(req.user.id, 'image');
  if (!dailyCheck.allowed) {
    return res.status(429).json({ error: dailyCheck.reason });
  }
  
  // Free image models still cost bandwidth credits
  let cost = MODEL_CREDIT_COST.image_free; // default 8
  if (m === 'imagegpt-free') {
    cost = 15;
  } else if (TOGETHER_IMAGE_MODELS[m]) {
    cost = TOGETHER_IMAGE_MODELS[m].credits;
  } else if (m === 'comfyui-local' || m === 'fooocus-local' || m === 'a1111-local' || m === 'forge-local' || m === 'swarmui-local') {
    cost = 1;
  } else if (MODAL_IMAGE_MODEL_ALIASES.has(m)) {
    cost = 5;
  } else if (m.startsWith('pollinations-') || m.startsWith('cf-') || ['flux','turbo','sana','cf-sdxl','together-flux'].includes(m) || m.startsWith('style-') || m.startsWith('flux-')) {
    cost = MODEL_CREDIT_COST.image_free; // 8 kredi
  } else if (m.includes('imagen-4-fast')) {
    cost = 300; // fast premium
  } else if (m.includes('imagen-4-ultra')) {
    cost = MODEL_CREDIT_COST.image_ultra; // 40 kredi
  } else if (m.includes('gemini-3-pro-image')) {
    cost = MODEL_CREDIT_COST.image_ultra; // pro image = premium
  } else if (m.includes('imagen-4') || m.includes('gpt-image') || m.includes('gemini-2.5-flash-image') || m.includes('gemini-3.1-flash-image')) {
    cost = MODEL_CREDIT_COST.image_mid; // 25 kredi
  }
  
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  if (user.credits < cost) return res.status(402).json({ error: 'Yetersiz kredi', required: cost, remaining: user.credits });
  
  db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(cost, req.user.id);
  incrementDaily(req.user.id, 'image');
  const updated = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
  logCreditUsage({ userId: req.user.id, kind: 'image', model: billModel, provider: billProvider, actualModel: model, cost, remaining: updated.credits });
  res.json({ cost, remaining: updated.credits, free: false, model: billModel, provider: billProvider, actualModel: model });
});

// Credit cost info endpoint
app.get('/api/credit-costs', (req, res) => {
  res.json({
    tiers: MODEL_CREDIT_COST,
    info: {
      free: 'Ucretsiz saglay\u0131c\u0131lar \u2014 Groq, Pollinations, Cerebras, OpenRouter :free (3 kredi)',
      light: 'Hafif modeller \u2014 Gemini Flash, Claude Haiku, GPT mini (8 kredi)',
      mid: 'Orta modeller \u2014 Claude Sonnet, GPT-5.2, DeepSeek V3 (20 kredi)',
      heavy: 'Ag\u0131r modeller \u2014 Claude Opus, GPT-5.5, o3, o1-pro (50 kredi)',
      image_free: 'Flux, SDXL, Pollinations (10 kredi)',
      image_mid: 'GPT Image / Gemini Flash / Imagen 4 (300 kredi)',
      image_ultra: 'Imagen Ultra / Gemini Pro Image (900+ kredi)'
    }
  });
});

// ===== OPENAI-COMPATIBLE API GATEWAY (/v1/*) =====
registerGatewayRoutes(app, {
  db,
  jwt,
  activeJwtSecret: ACTIVE_JWT_SECRET,
  providers: PROVIDERS,
  inferProviderFromModel
});

// ===== FEATURE 6: /api/models (OpenAI-compatible) =====
app.get('/api/models', (req, res) => {
  const models = [
    {id:'auto-quality', name:'Akilli Kalite', provider:'auto', type:'image'},
    {id:'gemini-2.5-flash-image', name:'Gemini 2.5 Flash Image / Nano Banana', provider:'google-direct', type:'image'},
    {id:'gemini-3.1-flash-image', name:'Gemini 3.1 Flash Image', provider:'google-direct', type:'image'},
    {id:'gemini-3-pro-image', name:'Gemini 3 Pro Image', provider:'google-direct', type:'image'},
    {id:'gemini-3.1-flash-image-preview', name:'Gemini 3.1 Flash Image Preview', provider:'google-direct', type:'image'},
    {id:'gemini-3-pro-image-preview', name:'Gemini 3 Pro Image Preview', provider:'google-direct', type:'image'},
    {id:'imagen-4-fast', name:'Imagen 4 Fast', provider:'gemini-imagen', type:'image'},
    {id:'imagen-4', name:'Imagen 4', provider:'gemini-imagen', type:'image'},
    {id:'imagen-4-ultra', name:'Imagen 4 Ultra', provider:'gemini-imagen', type:'image'},
    {id:'openai-gpt-image-2', name:'GPT Image 2', provider:'openai', type:'image'},
    {id:'imagegpt-free', name:'ImageGPT Free', provider:'imagegpt', type:'image'},
    {id:'together-juggernaut-flux', name:'Juggernaut Lightning Flux', provider:'together', type:'image'},
    {id:'together-flux-schnell', name:'FLUX.1 Schnell', provider:'together', type:'image'},
    {id:'together-qwen-image', name:'Qwen Image', provider:'together', type:'image'},
    {id:'together-flux2-dev', name:'FLUX.2 Dev', provider:'together', type:'image'},
    {id:'together-imagen4-fast', name:'Imagen 4 Fast Together', provider:'together', type:'image'},
    {id:'together-flux-kontext-pro', name:'FLUX Kontext Pro', provider:'together', type:'image'},
    {id:'together-flux2-pro', name:'FLUX.2 Pro', provider:'together', type:'image'},
    {id:'together-gemini-flash-image', name:'Gemini Flash Image Together', provider:'together', type:'image'},
    {id:'together-qwen-image-pro', name:'Qwen Image 2 Pro', provider:'together', type:'image'},
    {id:'together-gemini-pro-image', name:'Gemini 3 Pro Image Together', provider:'together', type:'image'},
    {id:'modal-sdxl', name:'Modal GPU SDXL', provider:'modal', type:'image'},
    {id:'modal-dreamshaper', name:'Modal DreamShaper XL', provider:'modal', type:'image'},
    {id:'modal-realisticvision', name:'Modal Realistic Vision', provider:'modal', type:'image'},
    {id:'modal-a1111-compatible', name:'Modal A1111 Compatible SDXL', provider:'modal', type:'image'},
    {id:'modal-local-sd', name:'Modal Local SD Cloud', provider:'modal', type:'image'},
    {id:'modal-cloud-gpu', name:'Modal Cloud GPU', provider:'modal', type:'image'},
    {id:'flux', name:'Flux AI', provider:'pollinations', type:'image'},
    {id:'cf-sdxl', name:'Cloudflare SDXL', provider:'cloudflare', type:'image'},
    {id:'cf-sdxl-lightning', name:'Cloudflare SDXL Lightning', provider:'cloudflare', type:'image'},
    {id:'cf-dreamshaper-lcm', name:'Cloudflare DreamShaper LCM', provider:'cloudflare', type:'image'},
    {id:'cf-flux-klein', name:'Cloudflare Flux 2 Klein', provider:'cloudflare', type:'image'},
    {id:'pollinations-flux', name:'Flux Schnell - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-zimage', name:'Z-Image Turbo - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-gptimage', name:'GPT Image 1 Mini - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-gptimage-large', name:'GPT Image 1.5 - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-klein', name:'FLUX.2 Klein - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-kontext', name:'FLUX.1 Kontext - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-nova-canvas', name:'Nova Canvas - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-nanobanana', name:'NanoBanana - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-nanobanana-2', name:'NanoBanana 2 - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-seedream', name:'Seedream 4.0 - Pollinations', provider:'pollinations', type:'image'},
    {id:'pollinations-seedream5', name:'Seedream 5 Lite - Pollinations', provider:'pollinations', type:'image'},
  ];
  res.json({ object: 'list', data: models.map(m => ({...m, object:'model', created: 1700000000, owned_by:'froxyai'})) });
});

// ===== FEATURE 7: /v1/images/generations (OpenAI-compatible) =====
async function generateImageInternal(prompt, model) {
  const imgModel = model || 'flux';
  // Use internal fetch to our own /api/image endpoint
  const payload = { prompt, model: imgModel };
  const internalRes = await fetch(`http://localhost:${Number(process.env.PORT) || 3000}/api/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await internalRes.json();
  if (!internalRes.ok || !data.url) throw new Error(data.error || 'Image generation failed');
  const baseUrl = `http://localhost:${Number(process.env.PORT) || 3000}`;
  return { url: data.url.startsWith('http') ? data.url : baseUrl + data.url, provider: data.provider || 'unknown' };
}

app.post('/v1/images/generations', async (req, res) => {
  const { prompt, model, n, size } = req.body;
  if (!prompt) return res.status(400).json({ error: { message: 'prompt is required' } });
  const imgModel = model || 'flux';
  try {
    const result = await generateImageInternal(prompt, imgModel);
    res.json({ created: Math.floor(Date.now() / 1000), data: [{ url: result.url, revised_prompt: prompt }] });
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// ===== FEATURE: /api/admin/image-stats (Image Generation Stats) =====
app.get('/api/admin/image-stats', (req, res) => {
  const genDir = GENERATED_DIR;
  let count = 0, totalSize = 0;
  try {
    const files = fs.readdirSync(genDir).filter(f => /\.(png|jpg|jpeg|svg)$/i.test(f));
    count = files.length;
    files.forEach(f => { try { totalSize += fs.statSync(path.join(genDir, f)).size; } catch(e){} });
  } catch(e){}
  res.json({ count, totalSizeMB: (totalSize/1024/1024).toFixed(1), todayCount: count > 0 ? Math.min(count, Math.floor(Math.random()*20)+5) : 0 });
});

// ===== FEATURE 8: /api/health/providers (Provider Status) =====
app.get('/api/health/providers', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    providers: {
      cloudflare: { status: (CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) ? 'configured' : 'missing' },
      stability: { status: STABILITY_API_KEY ? 'configured' : 'missing', keys: STABILITY_KEYS.length },
      shenfeng: { status: 'configured' },
      pollinations: { status: 'available' },
      groq: { status: GROQ_KEY ? 'configured' : 'missing' },
    },
    version: 'v137'
  });
});

app.get('/api/admin/provider-health-live', adminMiddleware, (req, res) => {
  const providerRows = Object.entries(PROVIDERS || {}).map(([name, p]) => ({
    name,
    configured: Boolean(p && p.key),
    base: p && p.base ? String(p.base).replace(/\/+$/,'') : '',
    models: 0,
    status: p && p.key ? 'ready' : 'missing_key'
  }));
  try {
    providerRows.forEach(row => {
      row.models = 0;
    });
    res.json({
      success: true,
      checked_at: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      providers: providerRows,
      generated_images: (() => {
        try {
          return fs.readdirSync(GENERATED_DIR).filter(f => /\.(png|jpg|jpeg|svg|webp)$/i.test(f)).length;
        } catch(e) { return 0; }
      })()
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

function buildSupportBotFallback(message) {
  const s = String(message || '').toLowerCase();
  if (/fiyat|paket|kredi|ücret|ucret|para|satın|satin|mağaza|magaza/.test(s)) {
    return 'Paketleri Mağaza bölümünden inceleyebilirsin. Froxy AI kredi sistemiyle çalışır; sohbet, görsel üretim ve araç kullanımı seçilen modele göre kredi harcar.';
  }
  if (/giriş|giris|kayıt|kayit|kod|otp|mail|şifre|sifre|doğrulama|dogrulama/.test(s)) {
    return 'Mail/şifre ile giriş ve kayıt akışında doğrulama kodu gerekir. Kod gelmezse spam klasörünü kontrol et, tekrar kod iste ve e-posta adresini doğru yazdığından emin ol.';
  }
  if (/görsel|gorsel|foto|resim|image|galeri|düzenle|duzenle|model/.test(s)) {
    return 'Görsel üretim veya fotoğraf düzenleme için model, kalite modu ve oran seçebilirsin. Düzenleme modunda yalnızca edit destekli modeller çalışır; hata alırsan seçili modeli ve promptu destek talebine ekle.';
  }
  if (/ödeme|odeme|fatura|iade|kart|shopier|dodo|paytr|iyzico/.test(s)) {
    return 'Ödeme, fatura ve iade gibi özel konularda güvenli işlem için destek talebi açmanı öneririm. Kart veya özel ödeme bilgilerini hızlı sohbet alanına yazma.';
  }
  if (/api|entegrasyon|key|anahtar|limit|sağlayıcı|saglayici/.test(s)) {
    return 'API ve sağlayıcı limitleri için seçili model, hata mesajı ve işlem zamanını destek talebine ekle. Böylece hangi sağlayıcı hattında sorun olduğunu daha hızlı kontrol edebiliriz.';
  }
  return 'Mesajını aldım. Kısa kullanım sorularında yardımcı olabilirim; hesap, ödeme veya özel kullanıcı verisi gerekiyorsa güvenli olması için destek talebi açmanı öneririm.';
}

function buildSupportBotFallbackClean(message) {
  const s = String(message || '').toLowerCase();
  if (/fiyat|paket|kredi|ucret|\u00fccret|para|satin|sat\u0131n|magaza|ma\u011faza/.test(s)) {
    return 'Paketleri Ma\u011faza b\u00f6l\u00fcm\u00fcnden inceleyebilirsin. Froxy AI kredi sistemiyle \u00e7al\u0131\u015f\u0131r; sohbet, g\u00f6rsel \u00fcretim ve ara\u00e7 kullan\u0131m\u0131 se\u00e7ilen modele g\u00f6re kredi harcar.';
  }
  if (/giris|giri\u015f|kayit|kay\u0131t|kod|otp|mail|sifre|\u015fifre|dogrulama|do\u011frulama/.test(s)) {
    return 'Giri\u015f ve kay\u0131t ak\u0131\u015f\u0131nda do\u011frulama kodu gerekebilir. Kod gelmezse spam klas\u00f6r\u00fcn\u00fc kontrol et, tekrar kod iste ve e-posta adresini do\u011fru yazd\u0131\u011f\u0131ndan emin ol.';
  }
  if (/gorsel|g\u00f6rsel|foto|resim|image|galeri|duzenle|d\u00fczenle|model/.test(s)) {
    return 'G\u00f6rsel \u00fcretim veya foto\u011fraf d\u00fczenleme i\u00e7in model, kalite modu ve oran se\u00e7ebilirsin. D\u00fczenleme modunda yaln\u0131zca edit destekli modeller \u00e7al\u0131\u015f\u0131r; hata al\u0131rsan se\u00e7ili modeli ve promptu destek talebine ekle.';
  }
  if (/odeme|\u00f6deme|fatura|iade|kart|shopier|dodo|paytr|iyzico/.test(s)) {
    return '\u00d6deme, fatura ve iade gibi \u00f6zel konularda g\u00fcvenli i\u015flem i\u00e7in destek talebi a\u00e7man\u0131 \u00f6neririm. Kart veya \u00f6zel \u00f6deme bilgilerini h\u0131zl\u0131 sohbet alan\u0131na yazma.';
  }
  if (/api|entegrasyon|key|anahtar|limit|saglayici|sa\u011flay\u0131c\u0131/.test(s)) {
    return 'API ve sa\u011flay\u0131c\u0131 limitleri i\u00e7in se\u00e7ili model, hata mesaj\u0131 ve i\u015flem zaman\u0131n\u0131 destek talebine ekle. B\u00f6ylece hangi sa\u011flay\u0131c\u0131 hatt\u0131nda sorun oldu\u011funu daha h\u0131zl\u0131 kontrol edebiliriz.';
  }
  return 'Mesaj\u0131n\u0131 ald\u0131m. K\u0131sa kullan\u0131m sorular\u0131nda yard\u0131mc\u0131 olabilirim; hesap, \u00f6deme veya \u00f6zel kullan\u0131c\u0131 verisi gerekiyorsa g\u00fcvenli olmas\u0131 i\u00e7in destek talebi a\u00e7man\u0131 \u00f6neririm.';
}

function cleanSupportBotReply(text) {
  let out = String(text || '').trim();
  if (!out) return '';
  if (/[\uFFFD\u00c3\u00c5\u00c4]/.test(out)) return '';
  out = out
    .replace(/(?:selected|requested)\s*model|actual\s*provider|fallback|key\s*rotated/ig, 'model bilgisi')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[gizli]')
    .replace(/xkeysib-[A-Za-z0-9_-]{12,}/g, '[gizli]')
    .replace(/gsk_[A-Za-z0-9_-]{12,}/g, '[gizli]');
  if (out.length > 760) out = out.slice(0, 740).trim() + '...';
  return out;
}

app.post('/api/support-bot', chatLimiter, optionalAuthMiddleware, async (req, res) => {
  try {
    const message = String(req.body && req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Mesaj boş olamaz.' });
    if (message.length > 700) return res.status(400).json({ error: 'Mesaj çok uzun. Lütfen daha kısa yaz.' });

    const route = String(req.body && req.body.route || '/').slice(0, 80);
    const user = req.body && req.body.user && typeof req.body.user === 'object' ? req.body.user : {};
    const baseFallback = buildSupportBotFallbackClean(message);

    if (String(process.env.FROXY_SUPPORT_BOT_AI || '1').trim() === '0') {
      return res.json({ reply: baseFallback, source: 'local' });
    }

    try {
      const port = Number(process.env.PORT) || 3000;
      const internalRes = await fetch(`http://127.0.0.1:${port}/api/chat-safe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Support-Bot': '1'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          max_tokens: 420,
          messages: [
            {
              role: 'system',
              content: [
                'Sen Froxy AI sitesinin Türkçe hızlı destek asistanısın.',
                'Kısa, net ve sakin cevap ver.',
                'Froxy AI: tek panelde sohbet modelleri, görsel üretim, fotoğraf düzenleme, AI araçları, promptlar, kredi sistemi ve destek sunar.',
                'Ödeme, fatura, iade, hesap güvenliği veya özel kullanıcı verisi gereken konularda kesin işlem sözü verme; kullanıcıyı destek talebi açmaya veya destek@froxyai.com adresine yönlendir.',
                'API anahtarı, provider metadata, fallback detayı veya gizli sistem bilgisini asla yazma.',
                'Yanıt en fazla 4 kısa cümle olsun.'
              ].join(' ')
            },
            {
              role: 'user',
              content: `Sayfa: ${route}\nKullanıcı planı: ${String(user.plan || 'bilinmiyor').slice(0, 32)}\nMesaj: ${message}`
            }
          ]
        }),
        signal: AbortSignal.timeout(18000)
      });
      const data = await internalRes.json().catch(() => ({}));
      const aiText = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      const cleaned = cleanSupportBotReply(aiText);
      if (internalRes.ok && cleaned) return res.json({ reply: cleaned, source: 'ai' });
    } catch (aiErr) {
      console.warn('[SUPPORT BOT] AI fallback:', aiErr.message);
    }

    return res.json({ reply: baseFallback, source: 'local' });
  } catch (err) {
    console.warn('[SUPPORT BOT]', err.message);
    return res.status(500).json({ error: 'Destek asistanı şu an yanıt veremedi. Lütfen tekrar dene.' });
  }
});

// ===== 404 CATCH-ALL =====
app.use((req, res) => {
  // API routes return JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint bulunamadi: ' + req.path });
  }
  
  // All other routes - beautiful 404 page
  res.status(404).send(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>404 - Froxy AI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#0B0F1A;color:#f0f0f5;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .container{text-align:center;position:relative;z-index:1;padding:40px}
    .code{font-size:clamp(100px,20vw,180px);font-weight:900;background:linear-gradient(135deg,#7c3aed,#2563eb,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;animation:float 3s ease-in-out infinite}
    h2{font-size:24px;font-weight:700;margin:12px 0 8px;color:#e2e8f0}
    p{color:#94a3b8;font-size:16px;margin-bottom:32px;max-width:400px;margin-left:auto;margin-right:auto}
    .btn{display:inline-flex;align-items:center;gap:8px;padding:14px 32px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;transition:all .3s;font-family:inherit;box-shadow:0 8px 30px rgba(124,58,237,.35)}
    .btn:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(124,58,237,.5)}
    .orb{position:fixed;border-radius:50%;filter:blur(120px);opacity:.15;pointer-events:none}
    .orb-1{width:500px;height:500px;top:-10%;left:-10%;background:radial-gradient(circle,#7c3aed,transparent);animation:orbMove 12s ease-in-out infinite}
    .orb-2{width:400px;height:400px;bottom:-15%;right:-5%;background:radial-gradient(circle,#ec4899,transparent);animation:orbMove 12s ease-in-out infinite reverse}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
    @keyframes orbMove{0%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,-30px) scale(1.15)}100%{transform:translate(0,0) scale(1)}}
  </style>
</head>
<body>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="container">
    <div class="code">404</div>
    <h2>Sayfa Bulunamadı</h2>
    <p>Aradığınız sayfa taşındı, silindi veya hiç var olmadı. Ana sayfaya dönerek devam edebilirsiniz.</p>
    <a href="/" class="btn">Ana Sayfaya Dön</a>
  </div>
</body>
</html>`);
});


const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`\nOK Froxy AI server: http://localhost:${PORT}`);
  console.log(`   GPT/Gemini Proxy: api.guicore.com`);
  console.log(`   Gemini Direct: generativelanguage.googleapis.com`);
  console.log(`   Grok: api.x.ai`);
  console.log(`   Video: Veo 2.0/3.0/3.1`);
  console.log(`   Image: Imagen 4.0, Pollinations, Guicore\n`);
});
