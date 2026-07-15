const fs=require('fs'); const {chromium}=require('playwright');
(async()=>{
 const out='output/playwright'; fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1365,height:768}, locale:'tr-TR'});
 const routes=['/','/sohbet','/gorsel','/promptlar','/ai-araclar','/galeri','/destek','/admin'];
 const routesOut=[];
 for(const r of routes){
  await page.goto('http://127.0.0.1:3000'+r+'?cb=v483',{waitUntil:'domcontentloaded',timeout:20000}); await page.waitForTimeout(1200);
  const data=await page.evaluate(()=>{const text=document.body?.innerText||''; return {title:document.title,h1:document.querySelector('h1')?.textContent?.trim()||'',active:[...document.querySelectorAll('.v.on,.ptab.on')].map(x=>x.id||x.className),bad:[...text.matchAll(/Ã|Ä|Å|Â|�|Kullan\?c\?|azal\?yor|G\?rsel|\?ret|D\?zenleme|Arac\?|D\?k|Turkce|Is Asistani|paketi Üret/g)].slice(0,10).map(m=>m[0]),black:text.trim().length<40,bodyLen:text.trim().length};});
  await page.screenshot({path:`${out}/v483-${r==='/'?'home':r.slice(1)}.png`,fullPage:false});
  routesOut.push({route:r,...data});
 }
 await page.goto('http://127.0.0.1:3000/sohbet?cb=v483',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1800);
 const chat=await page.evaluate(async()=>{
  const trig=[...document.querySelectorAll('.ai-top-chip,.model-picker-chip,[onclick*="toggleModelPicker"]')].find(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>5&&r.height>5;});
  if(!trig)return {ok:false,error:'trigger not found'};
  trig.click(); await new Promise(r=>setTimeout(r,450));
  const menu=document.querySelector('.chat-model-stable-menu-v474,.chat-model-stable-menu-v463');
  const opened=!!menu; const list=menu?.querySelector('.chat-model-stable-list'); const before=list?list.scrollTop:0; if(list){list.scrollTop=360; list.dispatchEvent(new Event('scroll',{bubbles:true}));}
  await new Promise(r=>setTimeout(r,150)); const after=list?list.scrollTop:0;
  trig.click(); await new Promise(r=>setTimeout(r,450));
  const closed=!document.querySelector('.chat-model-stable-menu-v474,.chat-model-stable-menu-v463');
  return {ok:opened&&after>=before&&closed,opened,before,after,closed,menuText:(menu?.innerText||'').slice(0,400),bodyClass:document.body.className};
 });
 await page.screenshot({path:`${out}/v483-chat-picker-after-toggle.png`,fullPage:false});
 await page.goto('http://127.0.0.1:3000/gorsel?cb=v483',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(2200);
 const img=await page.evaluate(async()=>{
  const trig=document.querySelector('.img-model-picker-trigger'); const sel=document.getElementById('img-model'); if(!trig)return {ok:false,error:'trigger not found',hasSelect:!!sel};
  const old=sel?.value||''; trig.click(); await new Promise(r=>setTimeout(r,450));
  const menu=document.querySelector('.img-model-stable-menu-v463,.img-model-stable-menu-v462,.img-model-stable-menu-v461,.img-model-stable-menu-v434,.img-model-picker-panel');
  const opened=!!menu; const list=menu?.querySelector('.img-model-stable-list')||menu; const before=list?list.scrollTop:0; if(list){list.scrollTop=400; list.dispatchEvent(new Event('scroll',{bubbles:true}));}
  await new Promise(r=>setTimeout(r,120)); const after=list?list.scrollTop:0;
  const opts=menu?[...menu.querySelectorAll('[data-value]')].filter(x=>!x.disabled&&x.getAttribute('aria-disabled')!=='true'):[];
  const target=opts.find(x=>x.getAttribute('data-value')!==old); if(target){target.click(); await new Promise(r=>setTimeout(r,350));}
  const visibleText=(document.body.innerText||'').slice(0,5000);
  return {ok:opened&&after>=before&&!!target&&sel?.value!==old,opened,before,after,old,newValue:sel?.value||'',locked:window.__froxyImageModelLock||'',optionCount:opts.length,badQuestion:/kredi \?/.test(visibleText),triggerText:document.querySelector('.img-model-picker-trigger')?.innerText||''};
 });
 await page.screenshot({path:`${out}/v483-gorsel-picker-after.png`,fullPage:false});
 // Payment modal smoke: no external submit, just modal opens and no Dodo/about blank in DOM
 await page.goto('http://127.0.0.1:3000/?cb=v483',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1400);
 const pay=await page.evaluate(async()=>{
   const btn=[...document.querySelectorAll('button,a')].find(el=>/100 Krediyle|Paketleri|Kredi paket|Hemen Başla|Satın Al/i.test(el.textContent||''));
   if(btn){btn.click(); await new Promise(r=>setTimeout(r,500));}
   const text=document.body.innerText||'';
   return {clicked:!!btn, url:location.href, hasDodo:/Dodo Payments|Dodo/i.test(text), hasAboutBlank:/about:blank/i.test(document.documentElement.innerHTML), modalOpen:[...document.querySelectorAll('.modal,.auth-modal,.pricing-modal')].some(el=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>10&&r.height>10;})};
 });
 await browser.close();
 const final={routes:routesOut,chat,img,pay};
 fs.writeFileSync(`${out}/v483-ui-smoke.json`,JSON.stringify(final,null,2),'utf8');
 console.log(JSON.stringify(final,null,2));
})();
