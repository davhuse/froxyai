const fs = require('fs');

const logoAnimCSS = `
/* v355 - Provider Logo Animations (GPU-only, no layout thrashing) */
@keyframes froxyLogoPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0); }
  50% { box-shadow: 0 0 18px rgba(34,211,238,.22); }
}

/* Provider grid logo hover animations */
#v-home .ah-provider-grid-v308 article {
  will-change: transform;
}
#v-home .ah-provider-grid-v308 article i {
  transition: transform .32s cubic-bezier(.2,.8,.2,1), box-shadow .32s ease, border-color .32s ease;
}
#v-home .ah-provider-grid-v308 article:hover i {
  transform: scale(1.12) rotate(-3deg);
  animation: froxyLogoPulse 2s ease-in-out infinite;
}

/* Brand-specific hover colors */
#v-home .ah-provider-grid-v308 article:nth-child(1):hover i { border-color: rgba(16,163,127,.5); box-shadow: 0 8px 24px rgba(16,163,127,.3); }
#v-home .ah-provider-grid-v308 article:nth-child(2):hover i { border-color: rgba(251,146,60,.5); box-shadow: 0 8px 24px rgba(251,146,60,.25); }
#v-home .ah-provider-grid-v308 article:nth-child(3):hover i { border-color: rgba(66,133,244,.5); box-shadow: 0 8px 24px rgba(66,133,244,.25); }
#v-home .ah-provider-grid-v308 article:nth-child(4):hover i { border-color: rgba(29,78,216,.5); box-shadow: 0 8px 24px rgba(29,78,216,.3); }
#v-home .ah-provider-grid-v308 article:nth-child(5):hover i { border-color: rgba(34,211,238,.5); box-shadow: 0 8px 24px rgba(34,211,238,.25); }
#v-home .ah-provider-grid-v308 article:nth-child(6):hover i { border-color: rgba(56,189,248,.5); box-shadow: 0 8px 24px rgba(56,189,248,.25); }

/* Model picker provider logos */
#model-picker .mp-item .mp-item-icon,
#model-picker .mp-provider-logo {
  transition: transform .22s ease, box-shadow .22s ease;
}
#model-picker .mp-item:hover .mp-item-icon,
#model-picker .mp-item:hover .mp-provider-logo {
  transform: scale(1.08);
  box-shadow: 0 6px 16px rgba(34,211,238,.15);
}

/* Image generation page provider logos */
.img-model-chip img,
.img-model-chip svg {
  transition: transform .22s ease;
}
.img-model-chip:hover img,
.img-model-chip:hover svg {
  transform: scale(1.1) rotate(-5deg);
}

/* Reduce motion for users who prefer it */
@media (prefers-reduced-motion: reduce) {
  #v-home .ah-provider-grid-v308 article:hover i,
  #model-picker .mp-item:hover .mp-item-icon,
  #model-picker .mp-item:hover .mp-provider-logo,
  .img-model-chip:hover img,
  .img-model-chip:hover svg {
    transform: none !important;
    animation: none !important;
  }
}
`;

let css = fs.readFileSync('style.css', 'utf8');
css += logoAnimCSS;
fs.writeFileSync('style.css', css);
console.log('Added logo animations to style.css');
console.log('New size:', (Buffer.byteLength(css)/1024).toFixed(1) + ' KB');

// Rebuild minified CSS
const minify = (src, dst) => {
  const raw = fs.readFileSync(src, 'utf8');
  const min = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
  fs.writeFileSync(dst, min);
  console.log(src + ' -> ' + dst + ': ' + (min.length/1024).toFixed(1) + 'KB');
};

minify('style.css', 'style.min.css');
minify('home-critical.css', 'home-critical.min.css');
minify('model-picker-v294.css', 'model-picker-v294.min.css');
