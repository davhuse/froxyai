const { chromium } = require('@playwright/test');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  const results = [];
  async function pageCheck(name, url, viewport){
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', msg => { if(['error','warning'].includes(msg.type())) errors.push(msg.type()+': '+msg.text()); });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const data = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const links = [...document.querySelectorAll('link[rel="stylesheet"],script[src]')].map(x=>x.href||x.src).filter(Boolean);
      const modelConsole = document.querySelector('.ah-model-console');
      const demoGrid = document.querySelector('.ah-demo-grid-v301');
      const trust = document.querySelector('.ah-trust-console-v301');
      return {
        url: location.href,
        width: innerWidth,
        scrollWidth: Math.max(html.scrollWidth, body.scrollWidth),
        overflow: Math.max(html.scrollWidth, body.scrollWidth) - innerWidth,
        hasV301Assets: links.some(x=>x.includes('v=v301')),
        hasModelConsole: !!modelConsole,
        modelConsoleDisplay: modelConsole ? getComputedStyle(modelConsole).display : null,
        hasDemoGrid: !!demoGrid,
        hasTrust: !!trust,
        bodyText: body.innerText.slice(0,5000)
      };
    });
    await page.screenshot({ path: `tests/v301-${name}.png`, fullPage: false });
    results.push({ name, ...data, errors: errors.slice(0,5) });
    await page.close();
  }
  await pageCheck('home-desktop','http://localhost:3010/?fresh=v301-home',{width:1440,height:1000});
  await pageCheck('home-mobile','http://localhost:3010/?fresh=v301-home-mobile',{width:390,height:844});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs=[]; page.on('console', msg=>{ if(['error','warning'].includes(msg.type())) errs.push(msg.type()+': '+msg.text()); });
  await page.goto('http://localhost:3010/sohbet?fresh=v301-picker',{waitUntil:'networkidle', timeout:30000});
  await page.click('[data-open-model-picker], .ai-top-chip, .model-picker-chip');
  await page.waitForSelector('#model-picker.open', { timeout: 10000 });
  await page.fill('#mp-search','gemini');
  await page.waitForTimeout(500);
  const picker = await page.evaluate(() => {
    const html = document.documentElement, body = document.body;
    const picker = document.querySelector('#model-picker');
    const items = [...document.querySelectorAll('#mp-list .mp-item')];
    const first = items[0];
    const star = first?.querySelector('.mp-star');
    return {
      overflow: Math.max(html.scrollWidth, body.scrollWidth) - innerWidth,
      count: document.querySelector('#mp-count')?.textContent,
      itemCount: items.length,
      searchShell: !!document.querySelector('.mp-search-shell'),
      firstGrid: first ? getComputedStyle(first).gridTemplateColumns : null,
      starText: star?.innerText || '',
      starOpacity: star ? getComputedStyle(star).opacity : null,
      firstText: first?.innerText || '',
      pickerDisplay: picker ? getComputedStyle(picker).display : null
    };
  });
  await page.screenshot({ path:'tests/v301-picker-mobile.png', fullPage:false });
  results.push({ name:'picker-mobile', ...picker, errors: errs.slice(0,5) });
  await page.close();
  await browser.close();
  console.log(JSON.stringify(results,null,2));
})();
