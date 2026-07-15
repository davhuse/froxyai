const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(`PAGE: ${err.message}`));
  
  await page.goto('https://froxyai.com/?v=v173', { waitUntil: 'networkidle', timeout: 60000 });
  
  // 1. Open auth modal
  const modalOpened = await page.evaluate(() => {
    if (typeof modal === 'function') { modal('login'); return true; }
    return false;
  });
  console.log('1. Auth modal opened:', modalOpened);
  await page.waitForTimeout(800);
  
  // 2. Check robot 3D head transform exists (after mouse move)
  await page.mouse.move(800, 400);
  await page.waitForTimeout(200);
  await page.mouse.move(900, 500);
  await page.waitForTimeout(200);
  
  const robotState = await page.evaluate(() => {
    const head = document.querySelector('.auth-robot.r1 .robot-head');
    if (!head) return { found: false };
    const cs = getComputedStyle(head);
    return {
      found: true,
      transform: head.style.transform || cs.transform,
      hasShadowsAndGradient: cs.background.includes('gradient') || cs.backgroundImage.includes('gradient'),
      boxShadow: cs.boxShadow.substring(0, 100)
    };
  });
  console.log('2. Robot head 3D:', JSON.stringify(robotState, null, 2));
  
  // 3. Focus password input -> shy mode
  await page.evaluate(() => {
    const pw = document.getElementById('l-pass') || document.getElementById('r-pass') || document.querySelector('input[type="password"]');
    if (pw) pw.focus();
  });
  await page.waitForTimeout(500);
  
  const shyMode = await page.evaluate(() => {
    const wrap = document.querySelector('.auth-robots');
    return {
      hasShyClass: wrap?.classList.contains('shy-mode'),
      eyeFirstHeight: getComputedStyle(document.querySelector('.auth-robot.r1 .robot-eye'))?.transform
    };
  });
  console.log('3. Şifre modu (shy):', JSON.stringify(shyMode));
  
  // 4. Blur password
  await page.evaluate(() => {
    document.querySelectorAll('input[type="password"]').forEach(el => el.blur());
  });
  await page.waitForTimeout(300);
  const shyOff = await page.evaluate(() => {
    return document.querySelector('.auth-robots')?.classList.contains('shy-mode');
  });
  console.log('4. Şifre blur sonrası shy:', shyOff);
  
  // Close modal
  await page.evaluate(() => {
    if (typeof closeM === 'function') closeM();
    document.getElementById('auth-modal')?.classList?.remove('open');
  });
  await page.waitForTimeout(300);
  
  // 5. Chat mouse glow (need login first - skip, just check element creation logic)
  // Inject test in chat area
  const glowExists = await page.evaluate(() => {
    // Find chat element and simulate mouse move
    const chatEl = document.getElementById('v-chat') || document.querySelector('#ptab-chat');
    if (!chatEl) return { found: false };
    
    // Simulate mousemove inside chat
    const evt = new MouseEvent('mousemove', { 
      clientX: 800, 
      clientY: 500,
      bubbles: true 
    });
    chatEl.dispatchEvent(evt);
    
    return {
      found: true,
      glowEl: document.querySelector('.chat-mouse-glow') ? 'created' : 'not created'
    };
  });
  console.log('5. Chat mouse glow:', JSON.stringify(glowExists));
  
  // 6. Take screenshot
  await page.evaluate(() => {
    if (typeof modal === 'function') modal('login');
  });
  await page.waitForTimeout(800);
  await page.mouse.move(700, 400);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/auth-3d-v173.png', fullPage: false });
  console.log('6. Screenshot: tests/auth-3d-v173.png');
  
  console.log('\nErrors:', errors.length === 0 ? 'YOK' : errors.join('\n  '));
  
  await browser.close();
})();
