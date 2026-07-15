const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(`PAGE: ${err.message}`));
  
  await page.goto('https://froxyai.com/?v=v175', { waitUntil: 'networkidle', timeout: 60000 });
  
  // 1. Auth modal — robotların arkasında kare yok + logo rail var
  await page.evaluate(() => { if (typeof modal === 'function') modal('login'); });
  await page.waitForTimeout(800);
  
  const robotCheck = await page.evaluate(() => {
    const head = document.querySelector('.auth-robot.r1 .robot-head');
    const body = document.querySelector('.auth-robot.r1 .robot-body');
    const logoRail = document.querySelector('.auth-hero-logo-rail');
    const tracks = document.querySelectorAll('.auth-hero-logo-track');
    const cs = head ? getComputedStyle(head) : null;
    const csBody = body ? getComputedStyle(body) : null;
    return {
      headBg: cs?.backgroundImage?.substring(0, 80),
      headBorder: cs?.border,
      headBoxShadow: cs?.boxShadow?.substring(0, 80),
      bodyBg: csBody?.backgroundImage?.substring(0, 80),
      logoRailExists: !!logoRail,
      trackCount: tracks.length,
      firstTrackAnim: tracks[0] ? getComputedStyle(tracks[0]).animationName : 'none'
    };
  });
  console.log('1. Robot/Logo rail check:', JSON.stringify(robotCheck, null, 2));
  
  await page.screenshot({ path: 'tests/v175-auth.png', fullPage: false });
  
  // 2. Support page — yeni hero
  await page.evaluate(() => {
    if (typeof closeM === 'function') closeM();
    document.getElementById('auth-modal')?.classList.remove('open');
    localStorage.setItem('saas_token', 'test-token');
    localStorage.setItem('saas_user', JSON.stringify({id:999,username:'test',email:'t@t.com',credits:50000,plan:'pro'}));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    if (typeof go === 'function') go('chat');
    if (typeof panelTab === 'function') setTimeout(()=>panelTab('support'), 200);
  });
  await page.waitForTimeout(2500);
  
  const supportCheck = await page.evaluate(() => {
    const newHero = document.querySelector('#ptab-support .sup-pro-hero');
    const oldHero = document.querySelector('#ptab-support .sp4-hero');
    const radar = document.querySelector('#ptab-support .sup-radar');
    const oldHeroVisible = oldHero ? getComputedStyle(oldHero).display !== 'none' : false;
    return {
      newHeroExists: !!newHero,
      oldHeroHidden: !oldHeroVisible,
      radarExists: !!radar,
      radarRingAnim: document.querySelector('#ptab-support .sup-radar-ring') ? getComputedStyle(document.querySelector('#ptab-support .sup-radar-ring')).animationName : 'none'
    };
  });
  console.log('2. Support hero check:', JSON.stringify(supportCheck));
  
  await page.screenshot({ path: 'tests/v175-support.png', fullPage: false });
  
  // 3. Image model picker
  await page.evaluate(() => {
    if (typeof panelTab === 'function') panelTab('img');
  });
  await page.waitForTimeout(2000);
  
  const pickerCheck = await page.evaluate(() => {
    const picker = document.getElementById('img-model-picker');
    const trigger = document.querySelector('.img-model-picker-trigger');
    const sel = document.getElementById('img-model');
    return {
      pickerExists: !!picker,
      triggerExists: !!trigger,
      triggerHTML: trigger?.innerHTML?.substring(0, 200),
      selectHidden: sel ? getComputedStyle(sel).opacity === '0' : false,
      currentValue: sel?.value
    };
  });
  console.log('3. Image model picker:', JSON.stringify(pickerCheck, null, 2));
  
  await page.screenshot({ path: 'tests/v175-img.png', fullPage: false });
  
  // Click on picker to open dropdown
  const opened = await page.evaluate(() => {
    const trigger = document.querySelector('.img-model-picker-trigger');
    if (trigger) {
      trigger.click();
      return document.querySelector('.img-model-picker.open') !== null;
    }
    return false;
  });
  await page.waitForTimeout(500);
  console.log('4. Picker dropdown opened:', opened);
  await page.screenshot({ path: 'tests/v175-img-open.png', fullPage: false });
  
  console.log('\nErrors:', errors.length === 0 ? 'YOK' : errors.join('\n  '));
  
  await browser.close();
})();
