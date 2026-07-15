const { chromium } = require('@playwright/test');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4314';
for (const file of ['.env.keys', '.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('='); const k = t.slice(0,i).trim(); let v = t.slice(i+1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1);
    if (!process.env[k]) process.env[k]=v;
  }
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
(async()=>{
  const secret = process.env.JWT_SECRET || 'froxy_ai_fallback_secret_2026_replace_me_in_production';
  const db = new Database('Froxy AI.db');
  let row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE lower(username)=? OR lower(email)=? ORDER BY id LIMIT 1').get('habilrencber@gmail.com','habilrencber@gmail.com');
  if(!row) row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE is_admin=1 ORDER BY id LIMIT 1').get();
  if(!row) throw new Error('admin row not found');
  db.prepare("UPDATE users SET is_admin=1, plan='enterprise' WHERE id=?").run(row.id);
  row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE id=?').get(row.id);
  const token = jwt.sign({id:row.id, username:row.username, email:row.email, plan:row.plan||'enterprise'}, secret, {expiresIn:'30d'});
  const user = {id:row.id, username:row.username, email:row.email, plan:'enterprise', is_admin:1, credits:999999};
  const browser = await chromium.launch({headless:true});
  const ctx = await browser.newContext({viewport:{width:1365,height:768}});
  const page = await ctx.newPage();
  await page.goto(BASE + '/admin?cb=v473-refresh', {waitUntil:'domcontentloaded', timeout:25000});
  await page.evaluate(({token,user})=>{localStorage.setItem('saas_token',token); localStorage.setItem('saas_user',JSON.stringify(user)); localStorage.setItem('ap_user',JSON.stringify({...user,isAdmin:true,backend:true}));}, {token,user});
  await page.reload({waitUntil:'domcontentloaded'});
  await sleep(3500);
  const first = await page.evaluate(()=>({
    token: !!localStorage.getItem('saas_token'),
    user: JSON.parse(localStorage.getItem('saas_user')||'null'),
    adminOverlay: !!document.querySelector('#admin-auth-clean-v434'),
    adminText: document.querySelector('#admin-auth-clean-v434')?.innerText || '',
    state: document.querySelector('#admin-api-state')?.textContent || '',
    body: document.body.innerText.slice(0,1200),
    errors: window.__smokeErrors || []
  }));
  await page.reload({waitUntil:'domcontentloaded'});
  await sleep(3500);
  const second = await page.evaluate(()=>({
    token: !!localStorage.getItem('saas_token'),
    user: JSON.parse(localStorage.getItem('saas_user')||'null'),
    adminOverlay: !!document.querySelector('#admin-auth-clean-v434'),
    adminText: document.querySelector('#admin-auth-clean-v434')?.innerText || '',
    state: document.querySelector('#admin-api-state')?.textContent || '',
    body: document.body.innerText.slice(0,1200),
    errors: window.__smokeErrors || []
  }));
  await page.screenshot({path:'tests/v473-admin-refresh.png', fullPage:false});
  await browser.close();
  const report={at:new Date().toISOString(),base:BASE,first,second};
  fs.writeFileSync('tests/v473-admin-refresh.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!first.token || !second.token || first.adminOverlay || second.adminOverlay) process.exit(1);
})();