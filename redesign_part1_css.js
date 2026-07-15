// Part 1: Inject premium CSS into style.css
const fs = require('fs');
let css = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/style.css', 'utf8');

const newCSS = `
/* ====== LANDING PAGE PREMIUM REDESIGN ====== */

/* Scroll Reveal */
.scroll-reveal{opacity:0;transform:translateY(30px);transition:opacity .6s ease,transform .6s ease}
.scroll-reveal.revealed{opacity:1;transform:translateY(0)}
.scroll-reveal:nth-child(2){transition-delay:.08s}
.scroll-reveal:nth-child(3){transition-delay:.16s}
.scroll-reveal:nth-child(4){transition-delay:.24s}

/* Hero Gradient Shift */
@keyframes heroShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
.hero.hero-pro{background-size:200% 200%;animation:heroShift 10s ease infinite;position:relative;overflow:hidden}

/* Floating Orbs */
@keyframes orbFloat{0%{transform:translate(0,0) scale(1)}33%{transform:translate(25px,-35px) scale(1.04)}66%{transform:translate(-18px,18px) scale(.96)}100%{transform:translate(0,0) scale(1)}}
.lp-orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.25;pointer-events:none;z-index:0;will-change:transform}
.lp-orb-1{width:280px;height:280px;background:radial-gradient(circle,#7c3aed,transparent 70%);top:8%;left:8%;animation:orbFloat 14s ease-in-out infinite}
.lp-orb-2{width:220px;height:220px;background:radial-gradient(circle,#06b6d4,transparent 70%);top:25%;right:12%;animation:orbFloat 17s ease-in-out infinite reverse}
.lp-orb-3{width:180px;height:180px;background:radial-gradient(circle,#f59e0b,transparent 70%);bottom:15%;left:25%;animation:orbFloat 11s ease-in-out infinite 1.5s}

/* Navbar Glass */
#nav{backdrop-filter:blur(14px) saturate(180%);-webkit-backdrop-filter:blur(14px) saturate(180%);background:rgba(10,10,20,.72)!important;border-bottom:1px solid rgba(124,58,237,.12);transition:box-shadow .3s ease}
#nav.nav-scrolled{box-shadow:0 4px 24px rgba(124,58,237,.12)}

/* Model Marquee */
@keyframes mScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.model-marquee{overflow:hidden;mask-image:linear-gradient(to right,transparent,#000 6%,#000 94%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,#000 6%,#000 94%,transparent)}
.model-track{display:flex;gap:16px;width:max-content;will-change:transform;animation:mScroll 40s linear infinite}
.model-marquee:hover .model-track{animation-play-state:paused}

/* Testimonial Marquee */
@keyframes tScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.testim-marquee{overflow:hidden;mask-image:linear-gradient(to right,transparent,#000 6%,#000 94%,transparent);-webkit-mask-image:linear-gradient(to right,transparent,#000 6%,#000 94%,transparent)}
.testim-track{display:flex;gap:20px;width:max-content;will-change:transform;animation:tScroll 50s linear infinite}
.testim-marquee:hover .testim-track{animation-play-state:paused}

/* Card Hover Glow */
.m-card,.card,.step-card,.pc,.testim-card{transition:transform .3s ease,box-shadow .3s ease,border-color .3s ease!important}
.m-card:hover,.card:hover,.step-card:hover{transform:translateY(-5px)!important;box-shadow:0 14px 40px rgba(124,58,237,.14)!important;border-color:rgba(124,58,237,.3)!important}
.pc:hover{transform:translateY(-4px)!important;box-shadow:0 10px 30px rgba(124,58,237,.12)!important}

/* Button Shimmer */
@keyframes shimmer{0%{left:-100%}100%{left:200%}}
.btn-primary{position:relative;overflow:hidden}
.btn-primary::after{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);pointer-events:none}
.btn-primary:hover::after{animation:shimmer .7s ease forwards}

/* Hero Chart Bars Animation */
@keyframes barGrow{0%{transform:scaleY(0)}100%{transform:scaleY(1)}}
.hero-chart span{transform-origin:bottom;animation:barGrow .8s ease forwards;animation-delay:calc(var(--i,0) * .1s)}

/* Hero Flow Track */
@keyframes flowScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.hero-flow-track{animation:flowScroll 12s linear infinite}

/* Step Number Pulse */
@keyframes stepPulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,.3)}50%{box-shadow:0 0 0 12px rgba(124,58,237,0)}}
.step-num{animation:stepPulse 2.5s ease infinite}

/* FAQ Smooth */
.faq-a{max-height:0;overflow:hidden;transition:max-height .4s ease,padding .3s ease}
.faq-item.open .faq-a{max-height:300px}
.faq-item.open .faq-arr{transform:rotate(180deg)}
.faq-arr{transition:transform .3s ease;display:inline-block}

/* Footer Link Underline */
.footer-col a,.footer-col button{position:relative;transition:color .3s ease}
.footer-col a::after,.footer-col button::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:1.5px;background:linear-gradient(90deg,#7c3aed,#06b6d4);transition:width .3s ease}
.footer-col a:hover::after,.footer-col button:hover::after{width:100%}
.footer-col a:hover,.footer-col button:hover{color:#a78bfa!important}

/* CTA Glow */
.cta-box{position:relative;overflow:hidden}
.cta-box::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(124,58,237,.08) 0%,transparent 60%);animation:heroShift 8s ease infinite;pointer-events:none}

/* Typing Indicator */
@keyframes blink{0%,100%{opacity:.2}50%{opacity:1}}
.typing-indicator span{animation:blink 1.4s infinite;animation-delay:calc(var(--i,0) * .2s)}
.typing-indicator span:nth-child(1){--i:0}
.typing-indicator span:nth-child(2){--i:1}
.typing-indicator span:nth-child(3){--i:2}

/* Pricing Popular Glow */
.pc.pop{box-shadow:0 0 30px rgba(124,58,237,.15)}

/* ====== END PREMIUM REDESIGN ====== */
`;

if (!css.includes('PREMIUM REDESIGN')) {
  css += newCSS;
  fs.writeFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/style.css', css);
  console.log('Premium CSS injected. New size:', css.length);
} else {
  console.log('Premium CSS already exists, skipping.');
}
