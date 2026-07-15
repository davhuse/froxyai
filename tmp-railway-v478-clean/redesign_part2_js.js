// Part 2: Add orbs to hero + animation engine JS
const fs = require('fs');
let h = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', 'utf8');

// Remove old mega-animations style block (we moved to style.css)
const megaStart = h.indexOf('<style id="mega-animations">');
if (megaStart > -1) {
  const megaEnd = h.indexOf('</style>', megaStart) + 8;
  h = h.substring(0, megaStart) + h.substring(megaEnd);
  console.log('Removed old mega-animations block');
}

// Remove old mega JS blocks
const oldJS1 = h.indexOf('// === MEGA ANIMATIONS ENGINE ===');
if (oldJS1 > -1) {
  const scriptStart = h.lastIndexOf('<script>', oldJS1);
  const scriptEnd = h.indexOf('</script>', oldJS1) + 9;
  h = h.substring(0, scriptStart) + h.substring(scriptEnd);
  console.log('Removed old mega JS');
}

// Add floating orbs to hero section
const heroTag = '<section class="hero hero-pro">';
if (h.includes(heroTag) && !h.includes('lp-orb')) {
  h = h.replace(heroTag, heroTag + '\n      <div class="lp-orb lp-orb-1"></div><div class="lp-orb lp-orb-2"></div><div class="lp-orb lp-orb-3"></div>');
  console.log('Added floating orbs to hero');
}

// Inject animation engine before </body>
const animJS = `<script>
(function(){
  function init(){
    var lp=document.getElementById('v-landing');
    if(!lp||lp.offsetHeight===0){setTimeout(init,300);return;}

    // Scroll reveal
    lp.querySelectorAll('.sec-head,.card,.step-card,.m-card,.pc,.testim-card,.faq-item,.code-block,.cta-box,.bot-demo-window,.bot-demo-copy').forEach(function(el){el.classList.add('scroll-reveal')});
    var obs=new IntersectionObserver(function(e){e.forEach(function(en){if(en.isIntersecting){en.target.classList.add('revealed');obs.unobserve(en.target)}})},{threshold:.08,rootMargin:'0px 0px -40px 0px'});
    document.querySelectorAll('.scroll-reveal').forEach(function(el){obs.observe(el)});

    // Navbar scroll
    var nav=document.getElementById('nav');
    if(nav)window.addEventListener('scroll',function(){nav.classList.toggle('nav-scrolled',window.scrollY>50)},{passive:true});

    // Hero chart bar delays
    lp.querySelectorAll('.hero-chart span').forEach(function(s,i){s.style.setProperty('--i',i)});

    // Counter animation
    lp.querySelectorAll('.hero-stats strong').forEach(function(el){
      var txt=el.textContent,num=parseFloat(txt.replace(/[^0-9.]/g,'')),suffix=txt.replace(/[0-9.]/g,'').trim();
      if(isNaN(num))return;
      var done=false;
      var co=new IntersectionObserver(function(e){e.forEach(function(en){
        if(en.isIntersecting&&!done){done=true;var cur=0,step=Math.max(1,Math.ceil(num/45));
        var t=setInterval(function(){cur+=step;if(cur>=num){cur=num;clearInterval(t)}
        el.textContent=(num%1===0?Math.round(cur):cur.toFixed(1))+suffix},28);co.unobserve(el)}
      })},{threshold:.5});
      co.observe(el);
    });

    console.log('[Premium] Landing animations active');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(init,600)});
  else setTimeout(init,600);
})();
</script>`;

h = h.replace('</body>', animJS + '\n</body>');

// Bump style.css version
h = h.replace(/style\.css\?v=\d+/, 'style.css?v=30');

fs.writeFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', h);
console.log('Part 2 done. Size:', h.length);
