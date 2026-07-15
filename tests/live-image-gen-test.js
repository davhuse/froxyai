const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  
  console.log('1. Site yukleniyor...');
  await page.goto('https://froxyai.com/?v=v169', { waitUntil: 'networkidle', timeout: 60000 });
  
  // Inject mock auth token
  await page.evaluate(() => {
    localStorage.setItem('saas_token', 'test-token-mock');
    localStorage.setItem('saas_user', JSON.stringify({id: 999, username: 'test', email: 'test@test.com', credits: 10000, plan: 'pro'}));
  });
  
  console.log('2. compareImageModels test (network call gozlemi):');
  
  // Set up network listener for /api/image
  const apiCalls = [];
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('/api/image')) {
      apiCalls.push({ url, status: resp.status() });
      try {
        const ct = resp.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const body = await resp.json();
          console.log('   API response:', JSON.stringify(body).substring(0, 200));
        }
      } catch(e) {}
    }
  });
  
  // Inject prompt + call compareImageModels
  const result = await page.evaluate(async () => {
    try {
      // Create img-prompt and img-result if they don't exist (simulate image tab)
      let promptEl = document.getElementById('img-prompt');
      let resEl = document.getElementById('img-result');
      
      if (!promptEl) {
        promptEl = document.createElement('textarea');
        promptEl.id = 'img-prompt';
        document.body.appendChild(promptEl);
      }
      if (!resEl) {
        resEl = document.createElement('div');
        resEl.id = 'img-result';
        document.body.appendChild(resEl);
      }
      
      promptEl.value = 'a beautiful sunset';
      
      // Set authToken & user globals
      window.authToken = localStorage.getItem('saas_token');
      window.user = JSON.parse(localStorage.getItem('saas_user'));
      
      // Call function
      await window.compareImageModels();
      
      // Wait a bit for images
      await new Promise(r => setTimeout(r, 35000));
      
      // Check result
      const cards = resEl.querySelectorAll('.img-compare-card');
      const images = resEl.querySelectorAll('.img-compare-preview');
      
      return {
        ok: true,
        cardsCount: cards.length,
        imagesCount: images.length,
        firstImageSrc: images[0]?.src?.substring(0, 100) || 'no image',
        resultHTML: resEl.innerHTML.substring(0, 500)
      };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });
  
  console.log('3. compareImageModels sonucu:');
  console.log(JSON.stringify(result, null, 2));
  
  console.log('\n4. Network cagrilari:');
  apiCalls.forEach(c => console.log(`   ${c.status} ${c.url}`));
  
  console.log('\n5. Hatalar:');
  if (errors.length === 0) {
    console.log('   YOK');
  } else {
    errors.forEach(err => console.log('   ❌ ' + err));
  }
  
  await browser.close();
})();
