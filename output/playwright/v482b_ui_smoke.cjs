const fs = require('fs');
const { chromium } = require('playwright');
(async()=>{
  const outDir='output/playwright'; fs.mkdirSync(outDir,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:1365,height:768}, locale:'tr-TR'});
  const page=await ctx.newPage();
  const routes=['/','/sohbet','/gorsel','/promptlar','/ai-araclar','/galeri','/destek','/admin'];
  const results=[];
  for(const r of routes){
    const started=Date.now(); let err='';
    try{ await page.goto('http://127.0.0.1:3000'+r+'?cb=v482',{waitUntil:'domcontentloaded',timeout:20000}); await page.waitForTimeout(1500);}catch(e){err=e.message}
    const data=await page.evaluate(()=>{
      const text=document.body?.innerText||'';
      const bad=[...text.matchAll(/Ã|Ä|Å|Â|�|Kullan\?c\?|azal\?yor|G\?rsel|\?ret|D\?zenleme|Arac\?|D\?k|Turkce|Is Asistani|paketi Üret/g)].slice(0,12).map(m=>m[0]);
      return {title:document.title,h1:document.querySelector('h1')?.textContent?.trim()||'',bodyLen:text.trim().length,activeViews:[...document.querySelectorAll('.v.on')].map(x=>x.id),bad,black:text.trim().length<40};
    });
    await page.screenshot({path:`${outDir}/v482b-${r==='/'?'home':r.slice(1)}.png`,fullPage:false});
    results.push({route:r,status:err?'ERR':'OK',ms:Date.now()-started,error:err,...data});
  }
  // Chat model picker interaction
  await page.goto('http://127.0.0.1:3000/sohbet?cb=v482',{waitUntil:'domcontentloaded',timeout:20000}); await page.waitForTimeout(1600);
  const chatPicker=await page.evaluate(async()=>{
    const pickTrigger=[...document.querySelectorAll('button,.model-select,.model-trigger,[onclick*="Model"],[onclick*="model"],#model-select-btn')].find(el=>/model|gpt|claude|seç/i.test(el.textContent||el.getAttribute('aria-label')||''));
    if(!pickTrigger)return {ok:false,error:'trigger not found'};
    pickTrigger.click(); await new Promise(r=>setTimeout(r,500));
    const picker=document.querySelector('#model-picker,.model-picker,.model-menu');
    const opened=!!picker && (picker.classList.contains('open')||getComputedStyle(picker).display!=='none');
    const before=picker?picker.scrollTop:0;
    if(picker){picker.scrollTop=200; picker.dispatchEvent(new Event('scroll',{bubbles:true}));}
    await new Promise(r=>setTimeout(r,120));
    const after=picker?picker.scrollTop:0;
    pickTrigger.click(); await new Promise(r=>setTimeout(r,300));
    const closed=picker?(!picker.classList.contains('open')||getComputedStyle(picker).display==='none'):false;
    return {ok:opened&&after>=before&&closed,opened,before,after,closed,text:(picker?.innerText||'').slice(0,300)};
  });
  // Image picker interaction
  await page.goto('http://127.0.0.1:3000/gorsel?cb=v482',{waitUntil:'domcontentloaded',timeout:20000}); await page.waitForTimeout(2200);
  const imgPicker=await page.evaluate(async()=>{
    const trigger=document.querySelector('.img-model-picker-trigger') || [...document.querySelectorAll('button,select,.model-select')].find(el=>/model|görsel|flux|cloudflare|pollinations/i.test(el.textContent||''));
    const sel=document.getElementById('img-model');
    if(!trigger)return {ok:false,error:'image trigger not found', hasSelect:!!sel};
    const old=sel?.value||'';
    trigger.click(); await new Promise(r=>setTimeout(r,500));
    const menu=document.querySelector('.img-model-stable-menu-v462,.img-model-stable-menu-v461,.img-model-picker-menu,.img-model-picker-panel');
    const opened=!!menu && getComputedStyle(menu).display!=='none';
    const before=menu?menu.scrollTop:0; if(menu){menu.scrollTop=240; menu.dispatchEvent(new Event('scroll',{bubbles:true}));}
    await new Promise(r=>setTimeout(r,120)); const after=menu?menu.scrollTop:0;
    const opts=menu?[...menu.querySelectorAll('[data-value]')].filter(x=>!x.disabled&&x.getAttribute('aria-disabled')!=='true'):[];
    const target=opts.find(x=>x.getAttribute('data-value')!==old);
    if(target){target.click(); await new Promise(r=>setTimeout(r,350));}
    const changed=sel?sel.value!==old:!!target;
    const locked=window.__froxyImageModelLock||window.__froxyLastManualImageModel||'';
    return {ok:opened&&after>=before&&changed,opened,before,after,old,newValue:sel?.value||'',locked,optionCount:opts.length,changed,menuText:(menu?.innerText||'').slice(0,400)};
  });
  await page.screenshot({path:`${outDir}/v482b-gorsel-picker-after.png`,fullPage:false});
  await browser.close();
  const final={routes:results,chatPicker,imgPicker};
  fs.writeFileSync(`${outDir}/v482b-ui-smoke.json`,JSON.stringify(final,null,2),'utf8');
  console.log(JSON.stringify(final,null,2));
})();
