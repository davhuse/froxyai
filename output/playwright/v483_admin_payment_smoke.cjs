const fs = require('fs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

(async()=>{
  const db = new Database('Froxy AI.db');
  let row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE lower(email)=? OR lower(username)=? ORDER BY id LIMIT 1').get('habilrencber@gmail.com','habilrencber@gmail.com');
  if(!row) row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE is_admin=1 ORDER BY id LIMIT 1').get();
  if(!row) throw new Error('admin row not found');
  db.prepare("UPDATE users SET is_admin=1, plan='enterprise' WHERE id=?").run(row.id);
  row = db.prepare('SELECT id,username,email,plan,is_admin FROM users WHERE id=?').get(row.id);
  const secret = process.env.JWT_SECRET || 'froxy_ai_fallback_secret_2026_replace_me_in_production';
  const token = jwt.sign({id:row.id,username:row.username,email:row.email,plan:row.plan||'enterprise'}, secret, {expiresIn:'30d'});
  const headers = {Authorization:'Bearer '+token};
  const api = async (path)=>{
    const res = await fetch('http://127.0.0.1:3000'+path,{headers});
    let data; try{data=await res.json()}catch(e){data={raw:await res.text()}}
    return {path,status:res.status,ok:res.ok,keys:data&&typeof data==='object'?Object.keys(data).slice(0,12):[], user:data.user?{id:data.user.id,email:data.user.email,plan:data.user.plan,is_admin:data.user.is_admin}:undefined, error:data.error||undefined};
  };
  const adminApi = [await api('/api/me'), await api('/api/admin/stats'), await api('/api/admin/users?limit=3'), await api('/api/admin/guest-sessions'), await api('/api/admin/credit-usage?limit=3')];

  const out='output/playwright'; fs.mkdirSync(out,{recursive:true});
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1365,height:768}, locale:'tr-TR'});
  await page.goto('http://127.0.0.1:3000/?cb=v483',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForTimeout(1400);
  const paymentModal = await page.evaluate(async()=>{
    if(typeof window.buyTokensById==='function') window.buyTokensById('starter');
    await new Promise(r=>setTimeout(r,350));
    const modal=document.getElementById('froxy-checkout-modal');
    const text=modal?modal.innerText:'';
    const checkbox=modal&&modal.querySelector('#checkout-contract-accepted');
    if(checkbox) checkbox.checked=true;
    const hrefBefore=location.href;
    let intended='';
    if(typeof window.getShopierPlanUrl==='function') intended=window.getShopierPlanUrl('starter');
    return {
      exists:!!modal,
      visible:!!modal&&getComputedStyle(modal).display!=='none',
      hasDodo:/Dodo|Dodo Payments/i.test(text),
      hasAboutBlank:/about:blank/i.test(document.documentElement.innerHTML),
      hasShopier:/Shopier/i.test(text),
      hasPayButton:!!(modal&&modal.querySelector('.froxy-checkout-primary')),
      intended,
      hrefBefore,
      text:text.slice(0,500)
    };
  });
  await page.screenshot({path:`${out}/v483-payment-modal.png`,fullPage:false});
  await browser.close();
  const result = {adminApi, paymentModal};
  fs.writeFileSync('output/playwright/v483-admin-payment-smoke.json', JSON.stringify(result,null,2),'utf8');
  console.log(JSON.stringify(result,null,2));
})();
