const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(`PAGE: ${err.message}`));
  
  await page.goto('https://froxyai.com/?v=v174', { waitUntil: 'networkidle', timeout: 60000 });
  
  // 1. Open auth modal
  await page.evaluate(() => { if (typeof modal === 'function') modal('login'); });
  await page.waitForTimeout(500);
  await page.mouse.move(800, 400);
  await page.waitForTimeout(300);
  
  // Check robot head transform was reset
  const robotHeadTransform = await page.evaluate(() => {
    const head = document.querySelector('.auth-robot.r1 .robot-head');
    if (!head) return 'no head';
    return getComputedStyle(head).transform;
  });
  console.log('1. Robot head transform (should be none):', robotHeadTransform);
  
  await page.screenshot({ path: 'tests/v174-auth.png', fullPage: false });
  console.log('   → Screenshot: tests/v174-auth.png');
  
  // 2. Test password mode
  await page.evaluate(() => {
    document.querySelector('input[type="password"]')?.focus();
  });
  await page.waitForTimeout(600);
  const shyActive = await page.evaluate(() => document.querySelector('.auth-robots')?.classList.contains('shy-mode'));
  console.log('2. Shy mode active on password focus:', shyActive);
  await page.screenshot({ path: 'tests/v174-auth-shy.png', fullPage: false });
  console.log('   → Screenshot: tests/v174-auth-shy.png');
  
  // 3. Close modal, navigate to chat (need login)
  await page.evaluate(() => {
    if (typeof closeM === 'function') closeM();
    document.getElementById('auth-modal')?.classList.remove('open');
    // Mock login
    localStorage.setItem('saas_token', 'test-token');
    localStorage.setItem('saas_user', JSON.stringify({id:999, username:'test', email:'test@test.com', credits:50000, plan:'pro'}));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  await page.evaluate(() => {
    if (typeof go === 'function') go('chat');
  });
  await page.waitForTimeout(1500);
  
  // Check chat-canvas-fx exists
  const fxState = await page.evaluate(() => {
    const fx = document.querySelector('.chat-canvas-fx');
    const orb = document.querySelector('.chat-fx-orb');
    const particles = document.querySelectorAll('.chat-fx-particle');
    return {
      fxExists: !!fx,
      orbAnimation: orb ? getComputedStyle(orb).animationName : 'no orb',
      particleCount: particles.length,
      firstParticleAnim: particles[0] ? getComputedStyle(particles[0]).animationName : 'no particle'
    };
  });
  console.log('3. Chat FX state:', JSON.stringify(fxState));
  
  await page.screenshot({ path: 'tests/v174-chat.png', fullPage: false });
  console.log('   → Screenshot: tests/v174-chat.png');
  
  // 4. Navigate to support
  await page.evaluate(() => {
    if (typeof panelTab === 'function') panelTab('support');
  });
  await page.waitForTimeout(1500);
  
  const supportState = await page.evaluate(() => {
    const orb = document.querySelector('#ptab-support .sp4-orbit-svg');
    const ringSlow = document.querySelector('.sp4-ring-spin-slow');
    const sat1 = document.querySelector('.sp4-sat-orbit-1');
    return {
      orbExists: !!orb,
      orbAnim: orb ? getComputedStyle(orb).animationName : 'none',
      ringAnim: ringSlow ? getComputedStyle(ringSlow).animationName : 'none',
      satAnim: sat1 ? getComputedStyle(sat1).animationName : 'none'
    };
  });
  console.log('4. Support orbit animations:', JSON.stringify(supportState));
  
  await page.screenshot({ path: 'tests/v174-support.png', fullPage: false });
  console.log('   → Screenshot: tests/v174-support.png');
  
  console.log('\nErrors:', errors.length === 0 ? 'YOK' : errors.join('\n  '));
  
  await browser.close();
})();
