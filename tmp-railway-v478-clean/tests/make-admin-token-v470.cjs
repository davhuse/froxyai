const fs = require('fs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
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
const secret = process.env.JWT_SECRET || 'froxy_ai_fallback_secret_2026_replace_me_in_production';
const db = new Database('Froxy AI.db');
let row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE lower(username)=? OR lower(email)=? ORDER BY id LIMIT 1').get('habilrencber@gmail.com','habilrencber@gmail.com');
if (!row) row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE is_admin=1 ORDER BY id LIMIT 1').get();
if (!row) throw new Error('admin row not found');
db.prepare("UPDATE users SET is_admin=1, plan='enterprise' WHERE id=?").run(row.id);
row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE id=?').get(row.id);
const token = jwt.sign({ id: row.id, username: row.username, email: row.email, plan: row.plan || 'enterprise' }, secret, { expiresIn: '30d' });
console.log(JSON.stringify({ admin: row, token }, null, 2));
