const { chromium } = require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[]; page.on('console',m=>{ if(['error','warning'].includes(m.type())) errors.push(m.type()+': '+m.text()) });
 await page.goto('https://froxyai.com/sohbet?fresh=v301-live2',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForTimeout(5000);
 await page.click('[data-open-model-picker], .ai-top-chip, .model-picker-chip');
 await page.waitForSelector('#model-picker.open',{timeout:15000});
 for(let i=0;i<20;i++){
   const c=await page.locator('#mp-count').textContent().catch(()=>null);
   if(c && !/yükleniyor/i.test(c)) break;
   await page.waitForTimeout(1000);
 }
 await page.fill('#mp-search','gemini');
 await page.waitForTimeout(1000);
 const data=await page.evaluate(()=>({
   count:document.querySelector('#mp-count')?.textContent,
   items:document.querySelectorAll('#mp-list .mp-item').length,
   first:document.querySelector('#mp-list .mp-item')?.innerText || '',
   loading:document.body.innerText.includes('Model kataloğu yükleniyor'),
   overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
   errors: window.__froxyErrors || []
 }));
 console.log(JSON.stringify({data, consoleErrors:errors.slice(0,10)},null,2));
 await browser.close();
})();
