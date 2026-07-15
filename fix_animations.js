const fs = require('fs');
let h = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', 'utf8');

// Remove old mega JS block and replace with correctly targeted version
const oldJSStart = h.indexOf('<script>\n// === SCROLL REVEAL ===');
const oldJSEnd = h.indexOf('</script>', oldJSStart) + 9;

if (oldJSStart > -1) {
  h = h.substring(0, oldJSStart) + h.substring(oldJSEnd);
  console.log('Removed old mega JS block');
}

const newMegaJS = `<script>
// === MEGA ANIMATIONS ENGINE ===
(function() {
  function initAnimations() {
    var landing = document.getElementById('v-landing');
    if (!landing || landing.offsetHeight === 0) {
      setTimeout(initAnimations, 300);
      return;
    }

    // 1. SCROLL REVEAL - add to all major sections
    var revealTargets = landing.querySelectorAll(
      '.sec-head, .step-card, .m-card, .card, .testim-card, .faq-item, .code-panel, .cta-box, .hero-stats .stat, .pricing-panel'
    );
    revealTargets.forEach(function(el) {
      el.classList.add('scroll-reveal');
    });

    // Also feature cards get glow
    var glowTargets = landing.querySelectorAll('.card, .step-card, .m-card, .pricing-panel');
    glowTargets.forEach(function(el) {
      el.classList.add('card-glow');
    });

    // 2. BUTTON SHIMMER - all primary buttons in landing
    var btns = landing.querySelectorAll('.btn-primary, .btn-lg');
    btns.forEach(function(el) {
      el.classList.add('btn-shimmer');
    });

    // 3. INTERSECTION OBSERVER for scroll reveal
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

    document.querySelectorAll('.scroll-reveal').forEach(function(el) {
      observer.observe(el);
    });

    // 4. NAVBAR GLASSMORPHISM
    var nav = document.getElementById('nav');
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

    // 5. HERO FLOATING ORBS
    var heroEl = landing.querySelector('.hero');
    if (heroEl) {
      heroEl.style.position = 'relative';
      heroEl.style.overflow = 'hidden';
      for (var i = 1; i <= 3; i++) {
        var orb = document.createElement('div');
        orb.className = 'floating-orb floating-orb-' + i;
        heroEl.insertBefore(orb, heroEl.firstChild);
      }
      heroEl.classList.add('hero-gradient-anim');
    }

    // 6. FOOTER LINK ANIMATIONS
    var footerLinks = document.querySelectorAll('.footer-link, .footer a');
    footerLinks.forEach(function(el) {
      el.classList.add('footer-link-anim');
    });

    // 7. MODEL MARQUEE - make model-track auto-scroll
    var modelTrack = landing.querySelector('.model-track');
    if (modelTrack) {
      modelTrack.classList.add('marquee-group');
      var parent = modelTrack.parentElement;
      if (parent) {
        parent.classList.add('marquee-wrap');
        // Clone cards for seamless loop
        var cards = modelTrack.innerHTML;
        modelTrack.innerHTML = cards + cards;
      }
    }

    // 8. TESTIMONIAL MARQUEE
    var testimTrack = landing.querySelector('.testim-track');
    if (testimTrack) {
      testimTrack.classList.add('review-marquee-group');
      var tParent = testimTrack.parentElement;
      if (tParent) {
        tParent.classList.add('review-marquee-wrap');
        var tCards = testimTrack.innerHTML;
        testimTrack.innerHTML = tCards + tCards;
      }
    }

    // 9. COUNTER ANIMATION for stats
    var stats = landing.querySelectorAll('.stat .v');
    stats.forEach(function(el) {
      var text = el.textContent;
      var num = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(num) || num === 0) return;
      var suffix = text.replace(/[0-9.,]/g, '').trim();
      var counted = false;
      
      var cObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting && !counted) {
            counted = true;
            var current = 0;
            var step = Math.max(1, Math.ceil(num / 50));
            var timer = setInterval(function() {
              current += step;
              if (current >= num) {
                current = num;
                clearInterval(timer);
              }
              el.textContent = current.toLocaleString('tr-TR') + (suffix ? ' ' + suffix : '');
            }, 25);
            cObserver.unobserve(el);
          }
        });
      }, { threshold: 0.5 });
      cObserver.observe(el);
    });

    console.log('[MegaFix] Animations initialized:', revealTargets.length, 'reveal targets');
  }

  // Wait for DOM + app.js rendering
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(initAnimations, 800); });
  } else {
    setTimeout(initAnimations, 800);
  }
})();
</script>`;

h = h.replace('</body>', newMegaJS + '\n</body>');

fs.writeFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', h);
console.log('Updated with correct selectors. Size:', h.length);
