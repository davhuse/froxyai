const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data).toString('utf8')));
    }).on('error', reject);
  });
}

(async () => {
  // Check index.html
  const html = await fetch('https://darkseagreen-elephant-580796.hostingersite.com/?t=v30');
  console.log('HTML size:', html.length);
  console.log('Has lp-orb:', html.includes('lp-orb'));
  console.log('Has Premium JS:', html.includes('[Premium]'));
  console.log('style.css version:', html.match(/style\.css\?v=\d+/)?.[0]);
  
  // Check style.css
  const css = await fetch('https://darkseagreen-elephant-580796.hostingersite.com/style.css?v=30');
  console.log('\nCSS size:', css.length);
  console.log('Has PREMIUM REDESIGN:', css.includes('PREMIUM REDESIGN'));
  console.log('Has orbFloat:', css.includes('orbFloat'));
  console.log('Has mScroll:', css.includes('mScroll'));
  console.log('Has shimmer:', css.includes('shimmer'));
  console.log('Has scroll-reveal:', css.includes('scroll-reveal'));
  console.log('Has heroShift:', css.includes('heroShift'));
  
  // Check last 200 chars of CSS
  console.log('\nCSS tail:', css.substring(css.length - 200));
})();
