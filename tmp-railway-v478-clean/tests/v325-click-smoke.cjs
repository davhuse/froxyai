const { chromium } = require('@playwright/test');
(async()=>{
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const routes = [
    {route:'ai-araclar', selector:'#ptab-tools .ai-tool-card'},
    {route:'promptlar', selector:'#ptab-prompts .prompt-card'}
  ];
  const results=[];
  for (const item of routes) {
    await page.goto(`http://localhost:3010/${item.route}?fresh=v325-click`, {waitUntil:'domcontentloaded', timeout:20000});
    await page.waitForTimeout(4500);
    const before = await page.$eval(item.selector, el => getComputedStyle(el).transform);
    await page.hover(item.selector);
    await page.waitForTimeout(250);
    const hover = await page.$eval(item.selector, el => ({transform:getComputedStyle(el).transform, box:getComputedStyle(el).boxShadow, bg:getComputedStyle(el).backgroundImage}));
    await page.click(item.selector);
    await page.waitForTimeout(250);
    const after = await page.$eval(item.selector, el => ({transform:getComputedStyle(el).transform, classes:el.className, overflow:Math.max(0, document.documentElement.scrollWidth-document.documentElement.clientWidth), mojibake:/Ã|Ä|Å|�|D\?|Foto\?/.test(document.body.innerText)}));
    await page.screenshot({path:`tests/v325-click-${item.route}.png`, fullPage:false});
    results.push({route:item.route,before,hover,after});
  }
  await browser.close();
  console.log(JSON.stringify(results,null,2));
})();
