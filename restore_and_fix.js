const fs = require('fs');

// Restore from backup and apply only safe improvements
const backup = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/backup_before_checkup_v2_2026-05-03T02-29-03/index.html', 'utf8');
console.log('Backup size:', backup.length);

let h = backup;

// FIX 1: Turkish encoding (same as before)
const charMap = {
  'Ã¼': 'ü', 'Ã§': 'ç', 'Ã¶': 'ö', 'Ã¢': 'â', 'Ã®': 'î', 'Ã»': 'û',
  'Ãœ': 'Ü', 'Ã‡': 'Ç', 'Ã–': 'Ö', 'Ã‚': 'Â', 'ÃŽ': 'Î', 'Ã›': 'Û',
  'Ä±': 'ı', 'Ä°': 'İ', 'ÄŸ': 'ğ', 'Äž': 'Ğ', 'ÅŸ': 'ş', 'Åž': 'Ş',
};
for (const [bad, good] of Object.entries(charMap)) {
  h = h.split(bad).join(good);
}
console.log('Encoding fixed');

// FIX 2: Fix legal modal - add inline styles to ensure visibility
h = h.replace(
  '<div id="legal-modal" class="modal"',
  '<div id="legal-modal" class="modal" style="z-index:99999"'
);
// Ensure legal-container has proper background
h = h.replace(
  '<div class="legal-container">',
  '<div class="legal-container" style="background:#1a1a2e;border:1px solid rgba(124,58,237,.2);border-radius:16px;max-width:600px;width:92%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,.6)">'
);
h = h.replace(
  '<div class="legal-body" id="legal-body">',
  '<div class="legal-body" id="legal-body" style="padding:22px;overflow-y:auto;color:rgba(255,255,255,.75);line-height:1.8;font-size:13px;flex:1">'
);
console.log('Legal modal fixed');

// FIX 3: Update "Nasıl Çalışır" 
h = h.replace(/>API Anahtarı Alın</g, '>Paketinizi Seçin<');
h = h.replace(/Kullanıcı panelinizden API anahtarınızı \(API Key\) tek tıkla kopyalayın\./g,
  'Size en uygun esnek paketi seçerek Shopier güvencesiyle anında ödeme yapın.');
h = h.replace(/>Koda Ekleyin</g, '>Anında Başlayın<');
h = h.replace(/Mevcut OpenAI kodunuzda sadece "Base URL" ve "API Key" değerlerini değiştirin\./g,
  'Ödeme sonrası saniyeler içinde kredileriniz yüklenir. Hemen yapay zekayı kullanmaya başlayın!');
console.log('Nasıl Çalışır updated');

// FIX 4: Add hero visual panel animations via CSS
const heroAnimCSS = `
<style id="lp-premium">
/* Hero gradient shift */
@keyframes heroShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
.hero.hero-pro{background-size:200% 200%;animation:heroShift 10s ease infinite;position:relative;overflow:hidden}

/* Floating orbs */
@keyframes orbFloat{0%{transform:translate(0,0) scale(1)}33%{transform:translate(25px,-35px) scale(1.04)}66%{transform:translate(-18px,18px) scale(.96)}100%{transform:translate(0,0) scale(1)}}
.lp-orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.22;pointer-events:none;z-index:0;will-change:transform}
.lp-orb-1{width:280px;height:280px;background:radial-gradient(circle,#7c3aed,transparent 70%);top:8%;left:8%;animation:orbFloat 14s ease-in-out infinite}
.lp-orb-2{width:220px;height:220px;background:radial-gradient(circle,#06b6d4,transparent 70%);top:25%;right:12%;animation:orbFloat 17s ease-in-out infinite reverse}

/* Hero chart bars animate */
@keyframes barGrow{0%{transform:scaleY(0)}100%{transform:scaleY(1)}}
.hero-chart span{transform-origin:bottom;animation:barGrow .8s ease forwards;animation-delay:calc(var(--i,0) * .12s)}

/* Hero flow track scroll */
@keyframes flowScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.hero-flow-track{animation:flowScroll 12s linear infinite}

/* Hero ops counter pulse */
@keyframes numPulse{0%,100%{color:#a78bfa}50%{color:#c4b5fd}}
.hero-ops b{animation:numPulse 3s ease infinite}

/* Hero visual glow */
.hero-visual{position:relative;overflow:hidden}
.hero-visual::before{content:'';position:absolute;top:-40%;right:-40%;width:250px;height:250px;background:radial-gradient(circle,rgba(124,58,237,.12),transparent 70%);border-radius:50%;filter:blur(40px);pointer-events:none;animation:orbFloat 10s ease-in-out infinite}

/* Navbar glass */
#nav{backdrop-filter:blur(14px) saturate(180%);-webkit-backdrop-filter:blur(14px) saturate(180%);background:rgba(10,10,20,.75)!important;border-bottom:1px solid rgba(124,58,237,.1);transition:box-shadow .3s ease}

/* Step pulse */
@keyframes stepPulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,.3)}50%{box-shadow:0 0 0 10px rgba(124,58,237,0)}}
.step-num{animation:stepPulse 2.5s ease infinite}

/* Card hover */
.m-card,.card,.step-card,.pc,.testim-card{transition:transform .3s ease,box-shadow .3s ease!important}
.m-card:hover,.card:hover,.step-card:hover{transform:translateY(-4px)!important;box-shadow:0 12px 35px rgba(124,58,237,.12)!important}

/* Button shimmer */
@keyframes shimmer{0%{left:-100%}100%{left:200%}}
.btn-primary{position:relative;overflow:hidden}
.btn-primary::after{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent);pointer-events:none}
.btn-primary:hover::after{animation:shimmer .7s ease forwards}

/* Model marquee */
@keyframes mScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.model-marquee{overflow:hidden;mask-image:linear-gradient(to right,transparent,#000 5%,#000 95%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,#000 5%,#000 95%,transparent)}
.model-track{display:flex;gap:16px;width:max-content;will-change:transform;animation:mScroll 40s linear infinite}
.model-marquee:hover .model-track{animation-play-state:paused}

/* Testimonial marquee */
.testim-marquee{overflow:hidden;mask-image:linear-gradient(to right,transparent,#000 5%,#000 95%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,#000 5%,#000 95%,transparent)}
.testim-track{display:flex;gap:20px;width:max-content;will-change:transform;animation:mScroll 50s linear infinite}
.testim-marquee:hover .testim-track{animation-play-state:paused}

/* Status dot */
@keyframes statusBlink{0%,100%{opacity:1}50%{opacity:.4}}
.bot-demo-status::before{content:'';display:inline-block;width:6px;height:6px;background:#22c55e;border-radius:50%;margin-right:5px;animation:statusBlink 1.5s ease infinite}

/* Typing dots */
@keyframes blink{0%,100%{opacity:.2}50%{opacity:1}}
.typing-indicator span:nth-child(1){animation:blink 1.4s infinite 0s}
.typing-indicator span:nth-child(2){animation:blink 1.4s infinite .2s}
.typing-indicator span:nth-child(3){animation:blink 1.4s infinite .4s}

/* Footer hover */
.footer-col a:hover,.footer-col button:hover{color:#a78bfa!important}

/* Pricing glow */
.pc.pop{box-shadow:0 0 25px rgba(124,58,237,.15)}

/* CTA glow */
.cta-box{position:relative;overflow:hidden}
.cta-box::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(124,58,237,.06),transparent 60%);animation:heroShift 8s ease infinite;pointer-events:none}
</style>`;

h = h.replace('</head>', heroAnimCSS + '\n</head>');
console.log('Premium CSS injected');

// FIX 5: Add orbs to hero
const heroTag = '<section class="hero hero-pro">';
if (!h.includes('lp-orb')) {
  h = h.replace(heroTag, heroTag + '\n      <div class="lp-orb lp-orb-1"></div><div class="lp-orb lp-orb-2"></div>');
  console.log('Orbs added');
}

// FIX 6: Add bar animation delays to hero chart
const chartSpans = h.match(/<span style="height:\d+%"><\/span>/g);
if (chartSpans) {
  chartSpans.forEach((s, i) => {
    const newS = s.replace('style="', 'style="--i:' + i + ';');
    h = h.replace(s, newS);
  });
  console.log('Chart bar delays added');
}

// Bump CSS version
h = h.replace(/style\.css\?v=\d+/, 'style.css?v=31');

fs.writeFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', h);
console.log('Done! Size:', h.length);
