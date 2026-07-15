const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4314';
const OUT = path.join(process.cwd(),'tests');
fs.mkdirSync(OUT,{recursive:true});
const badTextRe = /Gorsel|Secili|Model Secimi|Model sec|Kullanici|AiPaketim Chat|Ã|Å|Ä/;
async function waitApp(page){
  await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(2200);
}
async function evalState(page){
  return await page.evaluate((badSource)=>{
    const badRe = new RegExp(badSource);
    const text=document.body?.innerText||'';
    return {
      url:location.href,
      title:document.title,
      ready:document.documentElement.classList.contains('app-ready'),
      prepaint:document.documentElement.classList.contains('app-route-prepaint'),
      badVisibleText:badRe.test(text),
      visibleTextSample:text.slice(0,800),
      consoleErrors:window.__froxySmokeConsoleErrors||[]
    };
  }, badTextRe.source);
}
async function homeSmoke(page){
  await page.goto(BASE+'/?cb=v470',{waitUntil:'domcontentloaded',timeout:20000});
  await waitApp(page);
  const before=await evalState(page);
  const primary=page.locator('.ah-hero-actions .ah-btn-primary');
  const secondary=page.locator('.ah-hero-actions .ah-btn-ghost');
  const primaryCount=await primary.count();
  const secondaryCount=await secondary.count();
  let primaryClick='not-tested';
  if(primaryCount===1){
    await primary.click({timeout:5000});
    await page.waitForTimeout(700);
    primaryClick=await page.evaluate(()=>!!document.querySelector('#auth-modal[style*="flex"],#auth-modal.open,.auth-modal-v2[style*="flex"]') || document.body.innerText.includes('Kayıt') || document.body.innerText.includes('Giriş'));
    await page.keyboard.press('Escape').catch(()=>{});
    await page.evaluate(()=>{try{closeM&&closeM()}catch(e){}}).catch(()=>{});
  }
  let secondaryClick='not-tested';
  if(secondaryCount===1){
    await Promise.allSettled([secondary.click({timeout:5000}), page.waitForTimeout(1100)]);
    secondaryClick=page.url().includes('/sohbet') || await page.evaluate(()=>!!document.querySelector('#v-chat.on,#ptab-chat.on')).catch(()=>false);
  }
  await page.screenshot({path:path.join(OUT,'v470-home-smoke.png'),fullPage:false});
  return {before, primaryCount, secondaryCount, primaryClick, secondaryClick, afterUrl:page.url()};
}
async function chatPickerSmoke(page, mobile=false){
  await page.goto(BASE+'/sohbet?cb=v470'+(mobile?'&mobile=1':''),{waitUntil:'domcontentloaded',timeout:20000});
  await waitApp(page);
  const before=await evalState(page);
  const trigger=page.locator('.ai-top-chip,.model-picker-chip,[data-open-model-picker]').first();
  const triggerCount=await page.locator('.ai-top-chip,.model-picker-chip,[data-open-model-picker]').count();
  let result={triggerCount};
  if(triggerCount>0){
    await trigger.click({timeout:5000});
    await page.waitForTimeout(700);
    result.menu=await page.evaluate(()=>{
      const menu=document.querySelector('.chat-model-stable-menu-v463,#model-picker.open');
      const list=document.querySelector('.chat-model-stable-menu-v463 .chat-model-stable-list,#model-picker #mp-list');
      if(list){ list.scrollTop=320; }
      return {visible:!!menu, menuClass:menu?.className||'', scrollTop:list?.scrollTop||0, options:document.querySelectorAll('.chat-model-stable-option,#model-picker .mp-item[data-model-id]').length, bad:/Gorsel|Secili|Model Secimi|Model sec|Kullanici|AiPaketim Chat|Ã|Å|Ä/.test(menu?.innerText||'')};
    });
    const optionCount=await page.locator('.chat-model-stable-option[data-value]').count().catch(()=>0);
    result.optionCount=optionCount;
    if(optionCount>1){
      await page.locator('.chat-model-stable-option[data-value]').nth(1).click({timeout:5000});
      await page.waitForTimeout(400);
      result.afterSelect=await page.evaluate(()=>({menuOpen:!!document.querySelector('.chat-model-stable-menu-v463'), selected:document.querySelector('#model-sel')?.value||'', label:document.querySelector('#mpb-name,.model-picker-chip .dock-label')?.textContent?.trim()||''}));
    }
  }
  await page.screenshot({path:path.join(OUT,mobile?'v470-chat-mobile-picker.png':'v470-chat-picker.png'),fullPage:false});
  return {before,...result};
}
async function imagePickerSmoke(page, mobile=false){
  await page.goto(BASE+'/gorsel?cb=v470'+(mobile?'&mobile=1':''),{waitUntil:'domcontentloaded',timeout:20000});
  await waitApp(page);
  const before=await evalState(page);
  const trigger=page.locator('.img-model-picker-trigger');
  const triggerCount=await trigger.count();
  let result={triggerCount};
  if(triggerCount===1){
    const initial=await page.locator('#img-model').evaluate(el=>el.value).catch(()=>null);
    await trigger.click({timeout:5000});
    await page.waitForTimeout(700);
    result.menu=await page.evaluate(()=>{
      const menu=document.querySelector('.img-model-stable-menu-v461,.img-model-stable-menu-v463,.img-model-stable-menu-v434,.img-model-stable-menu-v462');
      const list=menu?.querySelector('.img-model-stable-list');
      if(list) list.scrollTop=380;
      return {visible:!!menu, menuClass:menu?.className||'', scrollTop:list?.scrollTop||0, options:menu?.querySelectorAll('.img-model-stable-option[data-value]').length||0, bad:/Gorsel|Secili|Model Secimi|Model sec|Kullanici|AiPaketim Chat|Ã|Å|Ä/.test(menu?.innerText||'')};
    });
    const options=page.locator('.img-model-stable-menu-v461 .img-model-stable-option[data-value]:not([disabled]),.img-model-stable-menu-v463 .img-model-stable-option[data-value]:not([disabled]),.img-model-stable-menu-v434 .img-model-stable-option[data-value]:not([disabled])');
    const optionCount=await options.count().catch(()=>0);
    result.optionCount=optionCount;
    if(optionCount>1){
      await options.nth(1).click({timeout:5000});
      await page.waitForTimeout(400);
      result.afterSelect=await page.evaluate((initial)=>({menuOpen:!!document.querySelector('.img-model-stable-menu-v461,.img-model-stable-menu-v463,.img-model-stable-menu-v434,.img-model-stable-menu-v462'), selected:document.querySelector('#img-model')?.value||'', changed:(document.querySelector('#img-model')?.value||'')!==initial, triggerText:document.querySelector('.img-model-picker-trigger')?.innerText||''}), initial);
    }
  }
  await page.screenshot({path:path.join(OUT,mobile?'v470-gorsel-mobile-picker.png':'v470-gorsel-picker.png'),fullPage:false});
  return {before,...result};
}
async function adminSmoke(page){
  await page.goto(BASE+'/admin?cb=v470',{waitUntil:'domcontentloaded',timeout:20000});
  await waitApp(page);
  await page.evaluate(async()=>{try{await repairAdminSessionV433?.()}catch(e){}}).catch(()=>{});
  await page.waitForTimeout(600);
  const state=await page.evaluate(()=>({
    url:location.href,
    hasToken:!!localStorage.getItem('saas_token'),
    saasUser:JSON.parse(localStorage.getItem('saas_user')||'null'),
    apUser:JSON.parse(localStorage.getItem('ap_user')||'null'),
    adminState:document.querySelector('.admin-api-state')?.innerText||'',
    authCard:document.querySelector('#admin-auth-clean-v434')?.innerText||'',
    adminVisible:!!document.querySelector('#v-admin.on'),
    bad:/Gorsel|Secili|Model Secimi|Model sec|Kullanici|AiPaketim Chat|Ã|Å|Ä/.test(document.body.innerText||'')
  }));
  await page.screenshot({path:path.join(OUT,'v470-admin-smoke.png'),fullPage:false});
  return state;
}
(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1365,height:768}});
  const page=await context.newPage();
  page.on('console',msg=>{ if(msg.type()==='error') page.evaluate(m=>{window.__froxySmokeConsoleErrors=(window.__froxySmokeConsoleErrors||[]).concat(String(m)).slice(-20)}, msg.text()).catch(()=>{}); });
  const report={at:new Date().toISOString(), base:BASE};
  report.home=await homeSmoke(page);
  report.chat=await chatPickerSmoke(page,false);
  report.gorsel=await imagePickerSmoke(page,false);
  report.admin=await adminSmoke(page);
  await context.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mp=await mobile.newPage();
  report.chatMobile=await chatPickerSmoke(mp,true);
  report.gorselMobile=await imagePickerSmoke(mp,true);
  await mobile.close();
  await browser.close();
  fs.writeFileSync(path.join(OUT,'v470-ui-smoke.json'),JSON.stringify(report,null,2),'utf8');
  console.log(JSON.stringify({ok:true, report:path.join(OUT,'v470-ui-smoke.json'), summary:{home:report.home, chat:report.chat?.menu, gorsel:report.gorsel?.menu, chatMobile:report.chatMobile?.menu, gorselMobile:report.gorselMobile?.menu, admin:report.admin}},null,2));
})().catch(err=>{console.error(err); process.exit(1);});

