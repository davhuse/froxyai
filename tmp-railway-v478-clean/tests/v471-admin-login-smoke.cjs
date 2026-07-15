const fs = require('fs');
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
const password = process.env.ADMIN_PASSWORD || '';
const identities = Array.from(new Set([
  process.env.ADMIN_EMAIL,
  process.env.ADMIN_USERNAME,
  'habilrencber@gmail.com',
  'habilrencber'
].map(v => String(v || '').trim()).filter(Boolean)));
function safeIdentity(id) {
  if (!id) return '';
  if (!id.includes('@')) return id.slice(0, 3) + '***';
  const [a, b] = id.split('@');
  return a.slice(0, 3) + '***@' + b;
}
async function postLogin(identity) {
  const res = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: identity, password }),
    cache: 'no-store'
  });
  let data = null;
  try { data = await res.json(); } catch { data = await res.text(); }
  let me = null;
  if (res.ok && data && data.token && !data.requiresOtp) {
    const r2 = await fetch(BASE + '/api/me', { headers: { Authorization: 'Bearer ' + data.token }, cache: 'no-store' });
    try { me = { status: r2.status, data: await r2.json() }; } catch { me = { status: r2.status }; }
  }
  return {
    identity: safeIdentity(identity),
    status: res.status,
    ok: res.ok,
    requiresOtp: !!(data && data.requiresOtp),
    loginUser: data && data.user ? { username: data.user.username, email: safeIdentity(data.user.email), is_admin: data.user.is_admin, plan: data.user.plan } : null,
    me: me && me.data && me.data.user ? { status: me.status, username: me.data.user.username, email: safeIdentity(me.data.user.email), is_admin: me.data.user.is_admin, plan: me.data.user.plan } : (me ? { status: me.status } : null),
    error: data && data.error ? String(data.error).slice(0, 120) : null
  };
}
(async () => {
  const results = [];
  if (!password) results.push({ error: 'ADMIN_PASSWORD env missing' });
  for (const id of identities) {
    if (!password) break;
    results.push(await postLogin(id));
  }
  const report = { at: new Date().toISOString(), base: BASE, results };
  fs.writeFileSync('tests/v471-admin-login-smoke.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!results.some(r => r.ok && !r.requiresOtp && (r.me?.is_admin || r.loginUser?.is_admin))) process.exitCode = 1;
})();