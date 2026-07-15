const { chromium } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4314';
const patterns = ['Ã','Å','Ä','Â','â€','â€™','â€œ','Gorsel','Secili','Kullanici','Sifre','Uret','Calisma Alani','Bugun ne','Giris Yap'];
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1365,height:768}});
  await page.goto(BASE+'/gorsel?cb=badmatch',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(3000);
  const result=await page.evaluate((patterns)=>{
    const text=document.body.innerText||'';
    const matches=[];
    for(const p of patterns){
      const idx=text.indexOf(p);
      if(idx>=0)matches.push({pattern:p,index:idx,context:text.slice(Math.max(0,idx-120),idx+160)});
    }
    return {len:text.length,matches,tail:text.slice(-1200)};
  }, patterns);
  console.log(JSON.stringify(result,null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
