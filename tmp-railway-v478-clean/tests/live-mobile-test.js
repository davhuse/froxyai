const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  // iPhone 14 Pro viewport
  const ctx = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    locale: 'tr-TR'
  });
  const page = await ctx.newPage();
  
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(`PAGE: ${err.message}`));
  
  await page.goto('https://froxyai.com/?v=v176', { waitUntil: 'networkidle', timeout: 60000 });
  
  // Mock login & navigate to chat
  await page.evaluate(() => {
    localStorage.setItem('saas_token', 'mobile-test');
    localStorage.setItem('saas_user', JSON.stringify({id:888,username:'mobtest',email:'m@t.com',credits:50000,plan:'pro'}));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  
  await page.evaluate(() => { if (typeof go === 'function') go('chat'); });
  await page.waitForTimeout(1500);
  
  // 1. Chat composer (input + send) varlığı ve görünürlüğü
  const composerCheck = await page.evaluate(() => {
    const composer = document.querySelector('.ai-chat-composer, .chat-composer, .chat-input-wrap');
    const ta = document.getElementById('chat-in');
    const send = document.querySelector('#chat-send, .chat-send-btn, [onclick*="sendMsg"]');
    if (!composer || !ta) return { found: false };
    const cs = getComputedStyle(composer);
    const taCs = getComputedStyle(ta);
    return {
      found: true,
      composerPosition: cs.position,
      composerBottom: cs.bottom,
      composerZIndex: cs.zIndex,
      taFontSize: taCs.fontSize,
      taPointerEvents: taCs.pointerEvents,
      sendExists: !!send
    };
  });
  console.log('1. Chat composer:', JSON.stringify(composerCheck, null, 2));
  
  // 2. Chat input typable test
  await page.locator('#chat-in').click();
  await page.locator('#chat-in').fill('test mesaj');
  await page.waitForTimeout(300);
  const inputValue = await page.evaluate(() => document.getElementById('chat-in')?.value);
  console.log('2. Input value after typing:', inputValue);
  
  await page.screenshot({ path: 'tests/v176-mobile-chat.png', fullPage: false });
  
  // 3. Sidebar open test
  const sidebarOpened = await page.evaluate(() => {
    // Try multiple toggle methods
    if (typeof toggleChatSidebar === 'function') toggleChatSidebar(true);
    return document.body.classList.contains('sidebar-open') || 
           document.getElementById('v-chat')?.classList.contains('sidebar-open');
  });
  await page.waitForTimeout(500);
  console.log('3. Sidebar opened:', sidebarOpened);
  
  const sidebarVisibility = await page.evaluate(() => {
    const sb = document.getElementById('panel-sidebar') || document.querySelector('.ai-side');
    const backdrop = document.getElementById('ai-sidebar-backdrop');
    if (!sb) return { found: false };
    const cs = getComputedStyle(sb);
    const bcs = backdrop ? getComputedStyle(backdrop) : null;
    return {
      found: true,
      transform: cs.transform,
      zIndex: cs.zIndex,
      pointerEvents: cs.pointerEvents,
      backdropOpacity: bcs?.opacity,
      backdropPointerEvents: bcs?.pointerEvents
    };
  });
  console.log('4. Sidebar state:', JSON.stringify(sidebarVisibility, null, 2));
  
  await page.screenshot({ path: 'tests/v176-mobile-sidebar.png', fullPage: false });
  
  // 5. Backdrop click → sidebar kapatma
  await page.evaluate(() => {
    const backdrop = document.getElementById('ai-sidebar-backdrop');
    if (backdrop) backdrop.click();
  });
  await page.waitForTimeout(500);
  const closedAfterBackdrop = await page.evaluate(() => 
    !document.body.classList.contains('sidebar-open')
  );
  console.log('5. Sidebar closed after backdrop click:', closedAfterBackdrop);
  
  console.log('\nErrors:', errors.length === 0 ? 'YOK' : errors.slice(0,5).join('\n  '));
  
  await browser.close();
})();
