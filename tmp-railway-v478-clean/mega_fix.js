const fs = require('fs');

// Read current index.html
let h = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', 'utf8');
console.log('Original size:', h.length);

// ============================================================
// FIX 1: Turkish character encoding corruption (351 places)
// ============================================================
const charMap = {
  'Ã¼': 'ü', 'Ã§': 'ç', 'Ã¶': 'ö', 'Ã¢': 'â', 'Ã®': 'î', 'Ã»': 'û',
  'Ãœ': 'Ü', 'Ã‡': 'Ç', 'Ã–': 'Ö', 'Ã‚': 'Â', 'ÃŽ': 'Î', 'Ã›': 'Û',
  'Ä±': 'ı', 'Ä°': 'İ', 'ÄŸ': 'ğ', 'Äž': 'Ğ',
  'ÅŸ': 'ş', 'Åž': 'Ş',
};

for (const [bad, good] of Object.entries(charMap)) {
  const count = (h.split(bad).length - 1);
  if (count > 0) {
    h = h.split(bad).join(good);
    console.log(`Fixed "${bad}" -> "${good}" (${count} times)`);
  }
}
console.log('Encoding fix done.');

// ============================================================
// FIX 2: Update "Nasıl Çalışır" section
// ============================================================
h = h.replace(/>API Anahtarı Alın</g, '>Paketinizi Seçin<');
h = h.replace(/Kullanıcı panelinizden API anahtarınızı \(API Key\) tek tıkla kopyalayın\./g, 
  'Size en uygun esnek paketi seçerek Shopier güvencesiyle anında ödeme yapın.');
h = h.replace(/>Koda Ekleyin</g, '>Anında Başlayın<');
h = h.replace(/Mevcut OpenAI kodunuzda sadece "Base URL" ve "API Key" değerlerini değiştirin\./g,
  'Ödeme sonrası saniyeler içinde kredileriniz yüklenir. Hemen yapay zekayı kullanmaya başlayın!');
console.log('Nasıl Çalışır updated.');

// ============================================================
// FIX 3: Add lazy loading to images
// ============================================================
h = h.replace(/<img(?!.*loading=)/g, '<img loading="lazy"');
console.log('Lazy loading added.');

// ============================================================
// FIX 4: Inject mega CSS animation pack into <head>
// ============================================================
const megaCSS = `
<style id="mega-animations">
/* === SCROLL REVEAL === */
.scroll-reveal {
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 0.7s cubic-bezier(.4,0,.2,1), transform 0.7s cubic-bezier(.4,0,.2,1);
}
.scroll-reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}
.scroll-reveal:nth-child(2) { transition-delay: 0.1s; }
.scroll-reveal:nth-child(3) { transition-delay: 0.2s; }
.scroll-reveal:nth-child(4) { transition-delay: 0.3s; }

/* === HERO GRADIENT ANIMATION === */
@keyframes heroGradientShift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.hero-gradient-anim {
  background-size: 200% 200% !important;
  animation: heroGradientShift 8s ease infinite;
}

/* === FLOATING ORBS === */
@keyframes floatOrb {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(30px, -40px) scale(1.05); }
  66%  { transform: translate(-20px, 20px) scale(0.95); }
  100% { transform: translate(0, 0) scale(1); }
}
.floating-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.3;
  pointer-events: none;
  z-index: 0;
  will-change: transform;
}
.floating-orb-1 {
  width: 300px; height: 300px;
  background: radial-gradient(circle, #7c3aed 0%, transparent 70%);
  top: 10%; left: 10%;
  animation: floatOrb 12s ease-in-out infinite;
}
.floating-orb-2 {
  width: 250px; height: 250px;
  background: radial-gradient(circle, #06b6d4 0%, transparent 70%);
  top: 30%; right: 15%;
  animation: floatOrb 15s ease-in-out infinite reverse;
}
.floating-orb-3 {
  width: 200px; height: 200px;
  background: radial-gradient(circle, #f59e0b 0%, transparent 70%);
  bottom: 20%; left: 30%;
  animation: floatOrb 10s ease-in-out infinite 2s;
}

/* === NAVBAR GLASSMORPHISM === */
@keyframes navSlideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
.nav-glass {
  backdrop-filter: blur(16px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
  background: rgba(10, 10, 20, 0.7) !important;
  border-bottom: 1px solid rgba(124, 58, 237, 0.15) !important;
  transition: all 0.3s ease !important;
}
.nav-scrolled {
  box-shadow: 0 4px 30px rgba(124, 58, 237, 0.1) !important;
}

/* === MODEL TICKER (MARQUEE) === */
@keyframes marqueeScroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(calc(-50% - 10px)); }
}
.marquee-wrap {
  position: relative;
  display: flex;
  overflow: hidden;
  width: 100%;
  padding: 20px 0;
  mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
}
.marquee-group {
  display: flex;
  gap: 20px;
  flex-shrink: 0;
  min-width: max-content;
  padding-right: 20px;
  will-change: transform;
  animation: marqueeScroll 35s linear infinite;
}
.marquee-wrap:hover .marquee-group {
  animation-play-state: paused;
}

/* === REVIEW TICKER === */
@keyframes reviewScroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(calc(-50% - 10px)); }
}
.review-marquee-wrap {
  position: relative;
  display: flex;
  overflow: hidden;
  width: 100%;
  padding: 20px 0;
  mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
}
.review-marquee-group {
  display: flex;
  gap: 20px;
  flex-shrink: 0;
  min-width: max-content;
  padding-right: 20px;
  will-change: transform;
  animation: reviewScroll 45s linear infinite;
}
.review-marquee-wrap:hover .review-marquee-group {
  animation-play-state: paused;
}

/* === BUTTON SHIMMER === */
@keyframes btnShimmer {
  0%   { left: -100%; }
  100% { left: 200%; }
}
.btn-shimmer {
  position: relative;
  overflow: hidden;
}
.btn-shimmer::after {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 50%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  transition: none;
}
.btn-shimmer:hover::after {
  animation: btnShimmer 0.6s ease forwards;
}

/* === CARD HOVER GLOW === */
.card-glow {
  transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease !important;
}
.card-glow:hover {
  transform: translateY(-4px) !important;
  box-shadow: 0 12px 40px rgba(124, 58, 237, 0.15) !important;
  border-color: rgba(124, 58, 237, 0.3) !important;
}

/* === COUNTER ANIMATION === */
@keyframes countUp {
  from { opacity: 0; transform: scale(0.5); }
  to   { opacity: 1; transform: scale(1); }
}
.count-anim {
  animation: countUp 0.5s ease-out forwards;
}

/* === FOOTER LINK HOVER === */
.footer-link-anim {
  position: relative;
  transition: color 0.3s ease;
}
.footer-link-anim::after {
  content: '';
  position: absolute;
  bottom: -2px; left: 0;
  width: 0; height: 2px;
  background: linear-gradient(90deg, #7c3aed, #06b6d4);
  transition: width 0.3s ease;
}
.footer-link-anim:hover::after {
  width: 100%;
}
.footer-link-anim:hover {
  color: #a78bfa !important;
}

/* === FAQ ACCORDION SMOOTH === */
.faq-answer {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.4s cubic-bezier(.4,0,.2,1), padding 0.3s ease;
}
.faq-answer.open {
  max-height: 500px;
}

/* === PRICING POPULAR CARD === */
.pricing-popular {
  transform: scale(1.05);
  border: 2px solid #7c3aed !important;
  box-shadow: 0 0 30px rgba(124, 58, 237, 0.2);
}
</style>
`;

// Inject before </head>
h = h.replace('</head>', megaCSS + '\n</head>');
console.log('Mega CSS animations injected.');

// ============================================================
// FIX 5: Inject JavaScript for scroll-reveal, navbar glass, counters
// ============================================================
const megaJS = `
<script>
// === SCROLL REVEAL ===
document.addEventListener('DOMContentLoaded', function() {
  // Add scroll-reveal class to landing page sections
  setTimeout(function() {
    var landing = document.getElementById('v-landing');
    if (!landing) return;
    
    var sections = landing.querySelectorAll('[id^="sec-"], .sec-head, .step-card, .model-card, .m-card, .pkg-card, .review-card, .faq-item');
    sections.forEach(function(el) {
      el.classList.add('scroll-reveal');
    });
    
    // Also add to feature cards
    var featureCards = landing.querySelectorAll('.feat-card, .f-card');
    featureCards.forEach(function(el) {
      el.classList.add('scroll-reveal', 'card-glow');
    });
    
    // Add shimmer to CTA buttons
    var ctaBtns = landing.querySelectorAll('.btn-primary, .hero-btn, [onclick*="modal"]');
    ctaBtns.forEach(function(el) {
      el.classList.add('btn-shimmer');
    });
    
    // Intersection Observer for reveal
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    
    document.querySelectorAll('.scroll-reveal').forEach(function(el) {
      observer.observe(el);
    });
    
    console.log('[MegaFix] Scroll reveal initialized for', sections.length, 'elements');
  }, 500);
  
  // === NAVBAR GLASSMORPHISM ON SCROLL ===
  var nav = document.querySelector('nav, .navbar, #main-nav');
  if (nav) {
    nav.classList.add('nav-glass');
    window.addEventListener('scroll', function() {
      if (window.scrollY > 50) {
        nav.classList.add('nav-scrolled');
      } else {
        nav.classList.remove('nav-scrolled');
      }
    }, { passive: true });
  }
  
  // === HERO FLOATING ORBS ===
  setTimeout(function() {
    var hero = document.querySelector('.hero, #sec-hero, [class*="hero"]');
    if (hero) {
      hero.style.position = hero.style.position || 'relative';
      hero.style.overflow = 'hidden';
      for (var i = 1; i <= 3; i++) {
        var orb = document.createElement('div');
        orb.className = 'floating-orb floating-orb-' + i;
        hero.appendChild(orb);
      }
      hero.classList.add('hero-gradient-anim');
      console.log('[MegaFix] Hero orbs added');
    }
  }, 300);
  
  // === COUNTER ANIMATION ===
  setTimeout(function() {
    var counters = document.querySelectorAll('[data-count], .stat-num, .counter');
    counters.forEach(function(el) {
      var target = parseInt(el.textContent.replace(/[^0-9]/g, ''));
      if (isNaN(target) || target === 0) return;
      
      var suffix = el.textContent.replace(/[0-9.,]/g, '');
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            var current = 0;
            var step = Math.ceil(target / 40);
            var timer = setInterval(function() {
              current += step;
              if (current >= target) {
                current = target;
                clearInterval(timer);
              }
              el.textContent = current.toLocaleString('tr-TR') + suffix;
            }, 30);
            observer.unobserve(el);
          }
        });
      }, { threshold: 0.5 });
      observer.observe(el);
    });
  }, 600);
});
</script>
`;

// Inject before </body>
h = h.replace('</body>', megaJS + '\n</body>');
console.log('Mega JS injected.');

// ============================================================
// FIX 6: Add floating orbs container to hero if it has inline style
// ============================================================
// The hero section likely has position:relative already
// We just need the CSS classes which are already injected

// ============================================================
// SAVE
// ============================================================
fs.writeFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', h);
console.log('Final size:', h.length);
console.log('All fixes applied!');

// Verify
const verify = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', 'utf8');
console.log('\n=== Verification ===');
console.log('Has mega-animations style:', verify.includes('mega-animations'));
console.log('Has marqueeScroll:', verify.includes('marqueeScroll'));
console.log('Has scroll-reveal:', verify.includes('scroll-reveal'));
console.log('Has btn-shimmer:', verify.includes('btn-shimmer'));
console.log('Has floating-orb:', verify.includes('floating-orb'));
console.log('Has nav-glass:', verify.includes('nav-glass'));
console.log('Has Paketinizi Seçin:', verify.includes('Paketinizi'));
console.log('Has encoding corruption:', /Ã[§¼¶]/.test(verify));
