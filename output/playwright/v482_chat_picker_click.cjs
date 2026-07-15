const fs=require('fs'); const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true}); const p=await b.newPage({viewport:{width:1365,height:768}}); const out='output/playwright'; fs.mkdirSync(out,{recursive:true});
await p.goto('http://127.0.0.1:3000/sohbet?cb=v482',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2200);
const res=await p.evaluate(async()=>{
 const triggers=[...document.querySelectorAll('.ai-top-chip,.model-picker-chip,[onclick*="toggleModelPicker"]')].map(el=>{const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return {el, txt:(el.textContent||'').trim().replace(/\s+/g,' '), visible:cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>3&&r.height>3, x:r.x,y:r.y,w:r.width,h:r.height};});
 const t=triggers.find(x=>x.visible)||triggers[0]; if(!t)return {ok:false,error:'no trigger',triggers:[]};
 t.el.click(); await new Promise(r=>setTimeout(r,500));
 const picker=document.querySelector('#model-picker'); const cs=picker?getComputedStyle(picker):null; const r=picker?picker.getBoundingClientRect():null;
 const opened=!!picker&&(picker.classList.contains('open')||document.body.classList.contains('model-picker-open')||(cs.display!=='none'&&r.width>10&&r.height>10));
 const list=picker?.querySelector('.mp-list,.model-list,.mp-body')||picker;
 const before=list?list.scrollTop:0; if(list){list.scrollTop=300; list.dispatchEvent(new Event('scroll',{bubbles:true}));}
 await new Promise(r=>setTimeout(r,150)); const after=list?list.scrollTop:0;
 t.el.click(); await new Promise(r=>setTimeout(r,300));
 const closed=picker?(!picker.classList.contains('open')&&!document.body.classList.contains('model-picker-open')):false;
 return {ok:opened&&after>=before&&closed, trigger:{txt:t.txt,visible:t.visible,x:t.x,y:t.y,w:t.w,h:t.h}, opened, before, after, closed, pickerClass:picker?.className||'', bodyClass:document.body.className, pickerText:(picker?.innerText||'').slice(0,500)};
});
await p.screenshot({path:`${out}/v482-chat-picker-click.png`,fullPage:false});
console.log(JSON.stringify(res,null,2)); await b.close();})();
