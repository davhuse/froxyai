const fs = require('fs');
let h = fs.readFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', 'utf8');

// ============================================================
// FIX 1: Replace chatbot demo section with animated live panel
// ============================================================
const oldChatbot = h.substring(
  h.indexOf('<section class="landing-chatbot sec">'),
  h.indexOf('</section>', h.indexOf('<section class="landing-chatbot sec">')) + 10
);

const newChatbot = `<section class="landing-chatbot sec">
      <div class="bot-demo-grid fu">
        <div class="bot-demo-copy">
          <span class="section-kicker">🔥 Canlı Demo</span>
          <h2>Tüm AI modelleri <span class="grad-text">tek panelde</span></h2>
          <p>Sohbet, görsel üretim, video oluşturma, kod yazma ve analiz — hepsi tek bir ekranda. Model değiştir, ajan seç, dosya ekle.</p>
          <div class="hero-actions" style="margin-top:20px">
            <button class="btn btn-primary btn-lg" onclick="go('chat')">Hemen Dene 🚀</button>
            <button class="btn btn-ghost" onclick="go('chat');panelTab('agents')">Ajanları Keşfet</button>
          </div>
          <div class="bot-mini-stack" aria-label="Aktif özellikler">
            <span>🤖 300+ AI Model</span>
            <span>🎨 Görsel Üretim</span>
            <span>🎬 Video Üretim</span>
            <span>📄 Dosya Analizi</span>
          </div>
        </div>
        <div class="bot-demo-window" aria-label="Chatbot önizleme" style="position:relative;overflow:hidden">
          <div style="position:absolute;top:-30%;right:-30%;width:200px;height:200px;background:radial-gradient(circle,rgba(124,58,237,.15),transparent 70%);border-radius:50%;filter:blur(40px);pointer-events:none;animation:orbFloat 8s ease-in-out infinite"></div>
          <div class="bot-demo-head">
            <div>
              <b>AiPaketim Chat</b>
              <span style="opacity:.6;font-size:12px">GPT-5.5 Turbo</span>
            </div>
            <div class="bot-demo-status" style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;animation:statusPulse 2s ease infinite">● Canlı</div>
          </div>
          <div class="bot-agent-strip">
            <button type="button" class="active" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none">🧠 Kanka AI</button>
            <button type="button">💻 Kod Ajanı</button>
            <button type="button">🎨 Görsel Uzmanı</button>
            <button type="button">📊 Analist</button>
          </div>
          <div class="bot-demo-msgs" style="min-height:180px">
            <div class="bot-msg user" style="animation:msgSlideIn .5s ease .2s both">E-ticaret sitem için ürün açıklaması yaz ve bir hero görseli üret.</div>
            <div class="bot-msg ai" style="animation:msgSlideIn .5s ease .6s both">Tabii! Hedef kitleyi analiz edip SEO uyumlu açıklama + DALL-E ile profesyonel hero görseli hazırlıyorum. 🎨</div>
            <div class="bot-msg user short" style="animation:msgSlideIn .5s ease 1s both">Türkçe olsun ve mobil uyumlu düşün.</div>
            <div class="bot-msg ai" style="animation:msgSlideIn .5s ease 1.4s both">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <div style="width:8px;height:8px;background:#22c55e;border-radius:50%;animation:statusPulse 1.5s ease infinite"></div>
                <span style="font-size:12px;opacity:.7">Üretiliyor...</span>
              </div>
              <div style="background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.2);border-radius:8px;padding:10px;font-size:13px">
                📝 <strong>Açıklama:</strong> Trend ürünleri keşfedin...<br>
                🖼️ <strong>Görsel:</strong> 1024x1024 hero banner üretiliyor...
              </div>
            </div>
          </div>
          <div class="bot-demo-input">
            <input id="landing-bot-input" type="text" placeholder="Mesajınızı yazın... (AI gerçekten cevaplar!)" onkeydown="if(event.key==='Enter')landingBotSend()">
            <button type="button" onclick="landingBotSend()" style="background:linear-gradient(135deg,#7c3aed,#a855f7);border:none;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer">Gönder</button>
          </div>
        </div>
      </div>
    </section>`;

h = h.replace(oldChatbot, newChatbot);
console.log('Chatbot demo section replaced');

// ============================================================
// FIX 2: Fix legal modal - was showing black screen
// ============================================================
const oldLegalModal = h.substring(
  h.indexOf('<div id="legal-modal"'),
  h.indexOf('</div>\n  </div><!-- end v-landing -->')
);

const newLegalModal = `<div id="legal-modal" class="modal" onclick="if(event.target===this)this.classList.remove('open')" style="z-index:99999">
      <div class="legal-container" style="background:var(--bg2,#1a1a2e);border:1px solid rgba(124,58,237,.2);border-radius:16px;max-width:600px;width:92%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.5)">
        <div class="legal-head" style="padding:18px 22px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center">
          <h3 id="legal-title" style="margin:0;color:#fff;font-size:18px">Yasal</h3>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('legal-modal').classList.remove('open')" style="font-size:20px;padding:4px 10px">✕</button>
        </div>
        <div class="legal-body" id="legal-body" style="padding:22px;overflow-y:auto;color:rgba(255,255,255,.7);line-height:1.8;font-size:13px;flex:1"></div>
      </div>
    </div>`;

// Replace the legal modal
const legalStart = h.indexOf('<div id="legal-modal"');
const legalEnd = h.indexOf('</div>\n  </div><!-- end v-landing -->');
if (legalStart > -1 && legalEnd > -1) {
  h = h.substring(0, legalStart) + newLegalModal + '\n    ' + h.substring(legalEnd);
  console.log('Legal modal fixed');
}

// ============================================================
// FIX 3: Add animation keyframes for chat demo
// ============================================================
const chatAnimCSS = `
<style id="chat-demo-anims">
@keyframes msgSlideIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes statusPulse{0%,100%{opacity:1}50%{opacity:.6}}
@keyframes typeWrite{from{width:0}to{width:100%}}
</style>`;

if (!h.includes('chat-demo-anims')) {
  h = h.replace('</head>', chatAnimCSS + '\n</head>');
  console.log('Chat demo animations added');
}

// ============================================================
// FIX 4: Update hero visual panel text
// ============================================================
h = h.replace(
  '<span>Canlı model trafiği</span>',
  '<span style="font-size:13px;opacity:.8">📊 Canlı Model Trafiği</span>'
);

fs.writeFileSync('C:/Users/habil/.gemini/antigravity/scratch/ApiMarket/index.html', h);
console.log('All fixes applied. Size:', h.length);
