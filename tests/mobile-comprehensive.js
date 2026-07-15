const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    locale: 'tr-TR'
  });
  const page = await ctx.newPage();
  
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(`PAGE: ${err.message}`));
  
  await page.goto('https://froxyai.com/?v=v177', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem('saas_token', 'mob-test');
    localStorage.setItem('saas_user', JSON.stringify({id:777,username:'mob',email:'m@t.com',credits:50000,plan:'pro'}));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  
  await page.evaluate(() => { if (typeof go === 'function') go('chat'); });
  await page.waitForTimeout(1500);
  
  // 1. Bottom nav her zaman görünür mü?
  const navState = await page.evaluate(() => {
    const nav = document.querySelector('.mobile-app-nav');
    if (!nav) return { found: false };
    const cs = getComputedStyle(nav);
    const btns = nav.querySelectorAll('.mobile-app-nav-btn');
    return {
      found: true,
      position: cs.position,
      bottom: cs.bottom,
      zIndex: cs.zIndex,
      pointerEvents: cs.pointerEvents,
      visibility: cs.visibility,
      btnCount: btns.length,
      btnLabels: Array.from(btns).map(b => b.querySelector('span')?.textContent.trim())
    };
  });
  console.log('1. Bottom nav:', JSON.stringify(navState, null, 2));
  await page.screenshot({ path: 'tests/v177-mobile-1.png' });
  
  // 2. Destek butonuna tıkla
  const destekClicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('.mobile-app-nav-btn');
    let destekBtn = null;
    btns.forEach(b => {
      if (b.querySelector('span')?.textContent.trim() === 'Destek') destekBtn = b;
    });
    if (destekBtn) {
      destekBtn.click();
      return true;
    }
    return false;
  });
  await page.waitForTimeout(1500);
  
  const supportVisible = await page.evaluate(() => {
    const sup = document.getElementById('ptab-support');
    if (!sup) return { found: false };
    return {
      found: true,
      display: getComputedStyle(sup).display,
      hasActive: sup.classList.contains('active'),
      heroVisible: !!document.querySelector('#ptab-support .sup-pro-hero')
    };
  });
  console.log('2. Destek:', JSON.stringify(supportVisible));
  await page.screenshot({ path: 'tests/v177-mobile-support.png' });
  
  // 3. Chat'e geri dön, sidebar aç
  await page.evaluate(() => {
    if (typeof panelTab === 'function') panelTab('chat');
  });
  await page.waitForTimeout(800);
  
  await page.evaluate(() => {
    if (typeof toggleChatSidebar === 'function') toggleChatSidebar(true);
    else if (typeof __mobileMenuToggle === 'function') __mobileMenuToggle({preventDefault:()=>{}, stopPropagation:()=>{}});
  });
  await page.waitForTimeout(700);
  
  const sidebarState = await page.evaluate(() => {
    const sb = document.getElementById('panel-sidebar');
    const bd = document.getElementById('ai-sidebar-backdrop');
    return {
      sidebarTransform: sb ? getComputedStyle(sb).transform : 'none',
      bodyHasClass: document.body.classList.contains('sidebar-open'),
      backdropOpacity: bd ? getComputedStyle(bd).opacity : '0',
      // Check that sidebar items are visible
      firstLinkText: sb?.querySelector('.ps-link, a, button')?.textContent?.trim()?.substring(0, 30),
      sidebarBg: sb ? getComputedStyle(sb).backgroundImage.substring(0, 60) : 'none'
    };
  });
  console.log('3. Sidebar:', JSON.stringify(sidebarState, null, 2));
  await page.screenshot({ path: 'tests/v177-mobile-sidebar.png' });
  
  // 4. Composer test
  await page.evaluate(() => {
    if (typeof toggleChatSidebar === 'function') toggleChatSidebar(false);
  });
  await page.waitForTimeout(500);
  
  const composerCheck = await page.evaluate(() => {
    const cmp = document.querySelector('#v-chat .ai-chat-composer, #v-chat .chat-composer');
    const ta = document.getElementById('chat-in');
    if (!cmp) return { found: false };
    const cs = getComputedStyle(cmp);
    const taCs = ta ? getComputedStyle(ta) : null;
    const taRect = ta?.getBoundingClientRect();
    return {
      found: true,
      composerPos: cs.position,
      composerBottom: cs.bottom,
      composerZ: cs.zIndex,
      taFontSize: taCs?.fontSize,
      taVisibleRect: taRect ? {top: Math.round(taRect.top), height: Math.round(taRect.height)} : null
    };
  });
  console.log('4. Composer:', JSON.stringify(composerCheck));
  
  // Type test
  try {
    await page.locator('#chat-in').fill('mobil test mesaji');
    await page.waitForTimeout(300);
    const val = await page.evaluate(() => document.getElementById('chat-in')?.value);
    console.log('5. Yazı yazılabildi:', val === 'mobil test mesaji');
  } catch(e) {
    console.log('5. Yazı yazma hata:', e.message);
  }
  
  await page.screenshot({ path: 'tests/v177-mobile-composer.png' });
  
  console.log('\nErrors:', errors.length === 0 ? 'YOK' : errors.slice(0,3).join('\n  '));
  
  await browser.close();
})();
