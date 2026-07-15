const { chromium } = require('@playwright/test');
(async()=>{
 const browser = await chromium.launch({headless:true});
 const results=[];
 async function check(name,url,viewport){
  const page=await browser.newPage({viewport});
  const errors=[]; page.on('console',m=>{ if(['error','warning'].includes(m.type())) errors.push(m.text()) });
  await page.goto(url,{waitUntil:'networkidle',timeout:45000});
  const data=await page.evaluate(()=>({
   href:location.href,
   overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
   v301:[...document.querySelectorAll('link[rel="stylesheet"],script[src]')].some(x=>(x.href||x.src).includes('v=v301')),
   modelPanel:!!document.querySelector('.ah-model-console'),
   demo:!!document.querySelector('.ah-demo-grid-v301'),
   trust:!!document.querySelector('.ah-trust-console-v301'),
   text:document.body.innerText.slice(0,1000)
  }));
  results.push({name,...data,errors:errors.slice(0,3)});
  await page.close();
 }
 await check('live-home-desktop','https://froxyai.com/?fresh=v301-live',{width:1440,height:1000});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[]; page.on('console',m=>{ if(['error','warning'].includes(m.type())) errors.push(m.text()) });
 await page.goto('https://froxyai.com/sohbet?fresh=v301-live',{waitUntil:'networkidle',timeout:45000});
 await page.click('[data-open-model-picker], .ai-top-chip, .model-picker-chip');
 await page.waitForSelector('#model-picker.open',{timeout:15000});
 await page.fill('#mp-search','gemini');
 await page.waitForTimeout(700);
 const picker=await page.evaluate(()=>({
  overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
  count:document.querySelector('#mp-count')?.textContent,
  searchShell:!!document.querySelector('.mp-search-shell'),
  items:document.querySelectorAll('#mp-list .mp-item').length,
  first:document.querySelector('#mp-list .mp-item')?.innerText || '',
  v301:[...document.querySelectorAll('link[rel="stylesheet"],script[src]')].some(x=>(x.href||x.src).includes('v=v301'))
 }));
 results.push({name:'live-picker-mobile',...picker,errors:errors.slice(0,3)});
 await page.close();
 await browser.close();
 console.log(JSON.stringify(results,null,2));
})();
