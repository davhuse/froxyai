const { chromium } = require('@playwright/test');
(async()=>{
 const b=await chromium.launch({headless:true}); const p=await b.newPage();
 await p.goto('http://localhost:3010/sohbet?fresh=inspect-cat',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3000);
 await p.evaluate(()=>{ if(window.renderModelPicker) window.renderModelPicker(''); document.querySelector('#model-picker')?.classList.add('open'); }); await p.waitForTimeout(300);
 const html=await p.evaluate(()=>[...document.querySelectorAll('#model-picker .mp-cat')].slice(0,3).map(x=>x.outerHTML));
 console.log(JSON.stringify(html,null,2)); await b.close();
})();
