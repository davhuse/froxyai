const fs = require('fs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4314';
for (const file of ['.env.keys', '.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
async function api(path, token) {
  const res = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
  let data = null;
  try { data = await res.json(); } catch { data = await res.text(); }
  return { ok: res.ok, status: res.status, data };
}
(async () => {
  const secret = process.env.JWT_SECRET || 'froxy_ai_fallback_secret_2026_replace_me_in_production';
  const db = new Database('Froxy AI.db');
  let row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE lower(username)=? OR lower(email)=? ORDER BY id LIMIT 1').get('habilrencber@gmail.com','habilrencber@gmail.com');
  if (!row) row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE is_admin=1 ORDER BY id LIMIT 1').get();
  if (!row) throw new Error('admin row not found');
  db.prepare("UPDATE users SET is_admin=1, plan='enterprise' WHERE id=?").run(row.id);
  row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE id=?').get(row.id);
  const token = jwt.sign({ id: row.id, username: row.username, email: row.email, plan: row.plan || 'enterprise' }, secret, { expiresIn: '30d' });
  const me = await api('/api/me', token);
  const stats = await api('/api/admin/stats', token);
  const users = await api('/api/admin/users?limit=3', token);
  const report = {
    at: new Date().toISOString(),
    base: BASE,
    admin: { id: row.id, username: row.username, email: row.email, is_admin: row.is_admin, plan: row.plan },
    me: { ok: me.ok, status: me.status, user: me.data && me.data.user ? { id: me.data.user.id, email: me.data.user.email, username: me.data.user.username, is_admin: me.data.user.is_admin, plan: me.data.user.plan } : me.data },
    stats: { ok: stats.ok, status: stats.status, keys: stats.data && typeof stats.data === 'object' ? Object.keys(stats.data).slice(0, 12) : [], error: stats.data && stats.data.error },
    users: { ok: users.ok, status: users.status, count: users.data && users.data.users ? users.data.users.length : null, error: users.data && users.data.error }
  };
  fs.writeFileSync('tests/v470-admin-api-smoke.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
})().catch(err => { console.error(err); process.exit(1); });
