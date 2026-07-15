const fs = require('fs');
let css = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/style.css', 'utf8');

// Make scroll-reveal safer - don't hide elements by default, only apply when JS has initialized
css = css.replace(
  '.scroll-reveal{opacity:0;transform:translateY(30px);transition:opacity .6s ease,transform .6s ease}',
  '.lp-ready .scroll-reveal{opacity:0;transform:translateY(30px);transition:opacity .6s ease,transform .6s ease}'
);

fs.writeFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/style.css', css);

// Also update JS to add lp-ready class
let h = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', 'utf8');

// Fix the JS init to add lp-ready class
h = h.replace(
  "lp.querySelectorAll('.sec-head,.card,.step-card,.m-card,.pc,.testim-card,.faq-item,.code-block,.cta-box,.bot-demo-window,.bot-demo-copy').forEach(function(el){el.classList.add('scroll-reveal')});",
  "lp.querySelectorAll('.sec-head,.card,.step-card,.m-card,.pc,.testim-card,.faq-item,.code-block,.cta-box,.bot-demo-window,.bot-demo-copy').forEach(function(el){el.classList.add('scroll-reveal')});lp.classList.add('lp-ready');"
);

fs.writeFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', h);
console.log('Fixed scroll-reveal safety. Deploying...');
