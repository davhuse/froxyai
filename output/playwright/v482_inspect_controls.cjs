const fs=require('fs'); const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true}); const p=await b.newPage({viewport:{width:1365,height:768}});
for(const route of ['/sohbet','/gorsel']){
 await p.goto('http://127.0.0.1:3000'+route+'?cb=v482',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2000);
 const data=await p.evaluate(()=>{
  const nodes=[...document.querySelectorAll('button,select,[role="button"],.model-select,.model-trigger,.img-model-picker-trigger,#model-picker,#img-model')].map((el,idx)=>{const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return {idx,tag:el.tagName,id:el.id,cls:el.className,role:el.getAttribute('role'),text:(el.textContent||el.value||el.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,140),visible:cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>3&&r.height>3,x:r.x,y:r.y,w:r.width,h:r.height,onclick:el.getAttribute('onclick')}});
  return {route:location.pathname,title:document.title,active:[...document.querySelectorAll('.v.on,.ptab.on')].map(x=>x.id||x.className),nodes:nodes.slice(0,120)};
 });
 console.log('\n### '+route); console.log(JSON.stringify(data,null,2));
}
await b.close();})();
