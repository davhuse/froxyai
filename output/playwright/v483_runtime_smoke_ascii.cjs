const fs = require('fs');
const { chromium } = require('playwright');
const badNeedles = ['\u00c3','\u00c4','\u00c5','\u00c2','\ufffd','Kullan?c?','azal?yor','G?rsel','?ret','D?zenleme','Arac?','D?k','Turkce','Is Asistani','paketi \u00dcret'];
function visible(el){ if(!el) return false; const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return s.display!=='none' && s.visibility!=='hidden' && r.width>5 && r.height>5; }
(async()=>{
 const out='output/playwright'; fs.mkdirSync(out,{recursive:true});
 const base=process.env.SMOKE_BASE || 'http://127.0.0.1:3107';
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1365,height:768}, locale:'tr-TR'});
 const routes=['/','/sohbet','/gorsel','/promptlar','/ai-araclar','/galeri','/destek','/admin'];
 const routesOut=[];
 for(const r of routes){
  await page.goto(base+r+'?cb=v483-runtime',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1900);
  const data=await page.evaluate((badNeedles)=>{
    const text=document.body?.innerText||'';
    return {
      title:document.title,
      h1:document.querySelector('h1')?.textContent?.trim()||'',
      active:[...document.querySelectorAll('.v.on,.ptab.on')].map(x=>x.id||x.className),
      bad:badNeedles.filter(x=>text.includes(x)).slice(0,12),
      black:text.trim().length<40,
      bodyLen:text.trim().length,
      appPrepaint:document.documentElement.classList.contains('app-route-prepaint'),
      appReady:document.documentElement.classList.contains('app-ready')
    };
  }, badNeedles);
  await page.screenshot({path:`${out}/v483-runtime-${r==='/'?'home':r.slice(1)}.png`,fullPage:false});
  routesOut.push({route:r,...data});
 }
 await page.goto(base+'/sohbet?cb=v483-runtime',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(2800);
 const chat=await page.evaluate(async()=>{ const visible=(el)=>{ if(!el) return false; const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return s.display!=='none' && s.visibility!=='hidden' && r.width>5 && r.height>5; };
  const candidates=[...document.querySelectorAll('.ai-top-chip,.model-picker-chip,[onclick*="toggleModelPicker"],button')];
  const trig=candidates.find(el=>/model|gpt|gemini|claude|seç|sec/i.test(el.textContent||'') && visible(el));
  if(!trig)return {ok:false,error:'trigger not found',visibleButtons:candidates.slice(0,30).map(x=>(x.textContent||'').trim()).filter(Boolean)};
  trig.click(); await new Promise(r=>setTimeout(r,650));
  const menu=document.querySelector('.chat-model-stable-menu-v474,.chat-model-stable-menu-v463,#model-picker,.model-picker-modal,.model-picker');
  const opened=!!menu; const list=menu?.querySelector('.chat-model-stable-list,.model-list,.model-grid')||menu; const before=list?list.scrollTop:0;
  if(list){list.scrollTop=360; list.dispatchEvent(new Event('scroll',{bubbles:true}));}
  await new Promise(r=>setTimeout(r,250)); const after=list?list.scrollTop:0;
  trig.click(); await new Promise(r=>setTimeout(r,600));
  const closed=!document.querySelector('.chat-model-stable-menu-v474,.chat-model-stable-menu-v463');
  return {ok:opened&&after>=before&&closed,opened,before,after,closed,triggerText:(trig.textContent||'').trim().slice(0,120),menuText:(menu?.innerText||'').slice(0,300)};
 });
 await page.screenshot({path:`${out}/v483-runtime-chat-picker.png`,fullPage:false});
 await page.goto(base+'/gorsel?cb=v483-runtime',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(2800);
 const img=await page.evaluate(async()=>{ const visible=(el)=>{ if(!el) return false; const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return s.display!=='none' && s.visibility!=='hidden' && r.width>5 && r.height>5; };
  const trig=document.querySelector('.img-model-picker-trigger') || [...document.querySelectorAll('button,.select,.picker')].find(el=>/model|seç|sec/i.test(el.textContent||'') && visible(el));
  const sel=document.getElementById('img-model');
  if(!trig)return {ok:false,error:'trigger not found',hasSelect:!!sel,body:(document.body.innerText||'').slice(0,500)};
  const old=sel?.value||'';
  trig.click(); await new Promise(r=>setTimeout(r,650));
  const menu=document.querySelector('.img-model-stable-menu-v463,.img-model-stable-menu-v462,.img-model-stable-menu-v461,.img-model-stable-menu-v434,.img-model-picker-panel');
  const opened=!!menu; const list=menu?.querySelector('.img-model-stable-list')||menu; const before=list?list.scrollTop:0;
  if(list){list.scrollTop=400; list.dispatchEvent(new Event('scroll',{bubbles:true}));}
  await new Promise(r=>setTimeout(r,250)); const after=list?list.scrollTop:0;
  const opts=menu?[...menu.querySelectorAll('[data-value]')].filter(x=>!x.disabled&&x.getAttribute('aria-disabled')!=='true'):[];
  const target=opts.find(x=>x.getAttribute('data-value')!==old); if(target){target.click(); await new Promise(r=>setTimeout(r,500));}
  const visibleText=(document.body.innerText||'').slice(0,7000);
  return {ok:opened&&after>=before&&!!target&&sel?.value!==old,opened,before,after,old,newValue:sel?.value||'',locked:window.__froxyImageModelLock||'',optionCount:opts.length,badQuestion:/kredi \?/.test(visibleText),triggerText:document.querySelector('.img-model-picker-trigger')?.innerText||''};
 });
 await page.screenshot({path:`${out}/v483-runtime-gorsel-picker.png`,fullPage:false});
 await page.goto(base+'/?cb=v483-runtime',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(1800);
 const pay=await page.evaluate(async()=>{ const visible=(el)=>{ if(!el) return false; const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return s.display!=='none' && s.visibility!=='hidden' && r.width>5 && r.height>5; };
   if(typeof window.buyTokensById==='function'){ window.buyTokensById('starter'); await new Promise(r=>setTimeout(r,900)); }
   const text=document.body.innerText||'';
   return {url:location.href, hasDodo:/Dodo Payments|Dodo/i.test(text), hasAboutBlank:/about:blank/i.test(document.documentElement.innerHTML), modalOpen:!!document.getElementById('froxy-checkout-modal') || [...document.querySelectorAll('.modal,.auth-modal,.pricing-modal')].some(el=>visible(el)), shopier:/Shopier|shopier/i.test(text)};
 });
 await page.screenshot({path:`${out}/v483-runtime-payment.png`,fullPage:false});
 await browser.close();
 const final={base,routes:routesOut,chat,img,pay};
 fs.writeFileSync(`${out}/v483-runtime-smoke.json`,JSON.stringify(final,null,2),'utf8');
 console.log(JSON.stringify(final,null,2));
 if(routesOut.some(r=>r.black || r.bad.length) || !chat.ok || !img.ok || pay.hasDodo || pay.hasAboutBlank) process.exit(2);
})().catch(e=>{console.error(e);process.exit(1)});

