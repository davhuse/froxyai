const fs = require('fs');
(async()=>{
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch(e){ console.error('PLAYWRIGHT_MISSING', e.message); process.exit(2); }
  const outDir='output/playwright'; fs.mkdirSync(outDir,{recursive:true});
  const browser = await chromium.launch({headless:true});
  const ctx = await browser.newContext({viewport:{width:1365,height:768}, locale:'tr-TR'});
  const page = await ctx.newPage();
  const routes=['/','/sohbet','/gorsel','/promptlar','/ai-araclar','/galeri','/destek','/admin'];
  const results=[];
  for(const r of routes){
    const url='http://127.0.0.1:3000'+r+'?cb=v482';
    const started=Date.now();
    let err='';
    try{
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
      await page.waitForTimeout(1200);
    }catch(e){ err=e.message; }
    const data=await page.evaluate(()=>{
      const text=document.body?.innerText||'';
      const bad=[...text.matchAll(/Ã|Ä|Å|Â|�|Kullan\?c\?|azal\?yor|G\?rsel|\?ret|D\?zenleme|Arac\?|D\?k/g)].slice(0,10).map(m=>m[0]);
      const buttons=[...document.querySelectorAll('button,a')].filter(el=>{
        const s=getComputedStyle(el); const r=el.getBoundingClientRect();
        return s.visibility!=='hidden'&&s.display!=='none'&&r.width>4&&r.height>4;
      }).slice(0,20).map(el=>(el.textContent||el.getAttribute('aria-label')||el.href||'').trim().replace(/\s+/g,' '));
      return {
        title:document.title,
        h1:document.querySelector('h1')?.textContent?.trim()||'',
        bodyLen:text.trim().length,
        activeViews:[...document.querySelectorAll('.v.on')].map(x=>x.id),
        bad,
        buttons,
        hasBlackScreen:text.trim().length<40,
        navDisplay:getComputedStyle(document.getElementById('nav')||document.body).display,
      };
    });
    const shot=`${outDir}/v482-${r==='/'?'home':r.slice(1)}.png`;
    await page.screenshot({path:shot, fullPage:false});
    results.push({route:r,status:err?'ERR':'OK',ms:Date.now()-started,error:err,...data,screenshot:shot});
  }
  await browser.close();
  fs.writeFileSync('output/playwright/v482-route-smoke.json', JSON.stringify(results,null,2),'utf8');
  console.log(JSON.stringify(results,null,2));
})();
