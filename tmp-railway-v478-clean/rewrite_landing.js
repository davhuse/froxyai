const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Replace style.css with premium_style.css
html = html.replace('<link rel="stylesheet" href="style.css', '<link rel="stylesheet" href="premium_style.css');

// Build the NEW Landing Page HTML
const newLanding = `
  <div class="v on" id="v-landing">
    <!-- Hero Section -->
    <section class="hero hero-pro">
      <div class="hero-content fu">
        <div class="hero-badge"><span>AI</span> Türkiye'nin premium AI platformu</div>
        <h1>Tüm modeller tek bir <br><span class="grad-text">panelde elinizin altında.</span></h1>
        <p>GPT-5.5, Claude Opus, Gemini Pro ve daha fazlası. Uygulamalarınızı saniyeler içinde zenginleştirin veya doğrudan arayüzümüzden kullanın.</p>
        
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" onclick="modal('reg')">Ücretsiz Başlayın</button>
          <button class="btn btn-ghost btn-lg" onclick="document.querySelector('#pricing').scrollIntoView({behavior:'smooth'})">Paketleri İncele</button>
        </div>
      </div>
      
      <!-- Interactive Demo Panel -->
      <div class="demo-panel-wrapper">
        <div class="demo-panel" id="hero-demo-panel">
          <div class="demo-panel-header">
            <div class="demo-dots"><span></span><span></span><span></span></div>
            <div style="font-size: 13px; color: var(--text-muted); margin-left: 10px;">aipaketim.com/chat</div>
            <div style="margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 4px 10px; border-radius: 20px;">
              <span style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%;"></span> Canlı
            </div>
          </div>
          <div class="demo-panel-body">
            <div class="demo-msg user">Sitem için e-ticaret sepet sayfası yaz. React ve Tailwind kullan.</div>
            <div class="demo-msg ai">
              Elbette, React ve Tailwind CSS kullanarak modern, responsive bir sepet sayfası bileşeni hazırlıyorum.
              <br><br>
              <div style="background: var(--bg-main); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; font-family: var(--font-mono); font-size: 12px; color: #a78bfa; margin-top: 8px;">
                import React, { useState } from 'react';<br>
                export default function Cart() {<br>
                &nbsp;&nbsp;return (<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&lt;div className="max-w-4xl mx-auto p-4"&gt;...&lt;/div&gt;<br>
                &nbsp;&nbsp;);<br>
                }
              </div>
            </div>
          </div>
          <div style="padding: 16px 24px; border-top: 1px solid var(--border-color); display: flex; gap: 12px;">
             <input id="landing-bot-input" type="text" placeholder="AI'a bir şeyler yazın..." style="flex:1; background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px 16px; color: white;" onkeydown="if(event.key==='Enter')landingBotSend()">
             <button onclick="landingBotSend()" class="btn btn-primary">Gönder</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section id="features" class="sec">
      <div class="sec-head fu">
        <h2 class="grad-text">Geleceği İnşa Edin</h2>
        <p>Geliştiriciler ve içerik üreticileri için tasarlandı.</p>
      </div>
      <div class="grid fu">
        <div class="card">
          <div class="card-icon">⚡</div>
          <h3>Ultra Düşük Gecikme</h3>
          <p>Tüm istekler optimize edilmiş global CDN ve load balancer üzerinden saniyeler içinde işlenir.</p>
        </div>
        <div class="card">
          <div class="card-icon">🔒</div>
          <h3>Kurumsal Güvenlik</h3>
          <p>Uçtan uca şifrelenmiş veri aktarımı ve katı gizlilik politikaları ile verileriniz güvende.</p>
        </div>
        <div class="card">
          <div class="card-icon">🔑</div>
          <h3>Tek API Anahtarı</h3>
          <p>Tüm modeller (OpenAI, Anthropic, Google) için birden fazla üyelik açmaya son. Tek key, sınırsız güç.</p>
        </div>
      </div>
    </section>

    <!-- Marquee Showcase -->
    <section id="models-showcase" class="sec" style="padding-top: 0;">
      <div class="sec-head fu" style="margin-bottom: 40px;">
        <h3>Desteklenen Modeller</h3>
      </div>
      <div class="model-ticker-wrap">
        <div class="model-track">
          <div class="m-card"><div class="m-head"><div class="m-logo">AI</div><div class="m-info"><h4>GPT-5.5 Turbo</h4><span>OpenAI</span></div></div></div>
          <div class="m-card"><div class="m-head"><div class="m-logo" style="color:#f97316;">CL</div><div class="m-info"><h4>Claude Opus</h4><span>Anthropic</span></div></div></div>
          <div class="m-card"><div class="m-head"><div class="m-logo" style="color:#3b82f6;">GM</div><div class="m-info"><h4>Gemini Pro</h4><span>Google</span></div></div></div>
          <div class="m-card"><div class="m-head"><div class="m-logo" style="color:#ec4899;">DS</div><div class="m-info"><h4>DeepSeek V4</h4><span>DeepSeek</span></div></div></div>
          <div class="m-card"><div class="m-head"><div class="m-logo" style="color:#eab308;">MJ</div><div class="m-info"><h4>Midjourney V6</h4><span>Görsel</span></div></div></div>
          
          <div class="m-card"><div class="m-head"><div class="m-logo">AI</div><div class="m-info"><h4>GPT-5.5 Turbo</h4><span>OpenAI</span></div></div></div>
          <div class="m-card"><div class="m-head"><div class="m-logo" style="color:#f97316;">CL</div><div class="m-info"><h4>Claude Opus</h4><span>Anthropic</span></div></div></div>
          <div class="m-card"><div class="m-head"><div class="m-logo" style="color:#3b82f6;">GM</div><div class="m-info"><h4>Gemini Pro</h4><span>Google</span></div></div></div>
          <div class="m-card"><div class="m-head"><div class="m-logo" style="color:#ec4899;">DS</div><div class="m-info"><h4>DeepSeek V4</h4><span>DeepSeek</span></div></div></div>
          <div class="m-card"><div class="m-head"><div class="m-logo" style="color:#eab308;">MJ</div><div class="m-info"><h4>Midjourney V6</h4><span>Görsel</span></div></div></div>
        </div>
      </div>
    </section>

    <!-- Pricing -->
    <section id="pricing" class="sec">
      <div class="sec-head fu">
        <h2 class="grad-text">Adil Fiyatlandırma</h2>
        <p>Gizli ücret yok, sürpriz yok. Sadece kullandığınız kadar ödeyin.</p>
      </div>
      <div class="pricing-grid fu">
        <div class="pc">
          <h3>Başlangıç</h3>
          <div class="pr">₺149<span>/ay</span></div>
          <ul>
            <li><span class="ck">✓</span> 100,000 Kredi</li>
            <li><span class="ck">✓</span> GPT-4, Claude Sonnet</li>
            <li><span class="ck">✓</span> Standart Destek</li>
          </ul>
          <button class="btn btn-ghost" onclick="modal('reg')">Seç</button>
        </div>
        <div class="pc pop">
          <div class="pop-badge">EN POPÜLER</div>
          <h3>Geliştirici</h3>
          <div class="pr">₺499<span>/ay</span></div>
          <ul>
            <li><span class="ck">✓</span> 500,000 Kredi</li>
            <li><span class="ck">✓</span> GPT-5, Claude Opus, Gemini</li>
            <li><span class="ck">✓</span> Görsel & Video Modelleri</li>
            <li><span class="ck">✓</span> Öncelikli API Erişimi</li>
          </ul>
          <button class="btn btn-primary" onclick="modal('reg')">Seç</button>
        </div>
        <div class="pc">
          <h3>Kurumsal</h3>
          <div class="pr">₺2499<span>/ay</span></div>
          <ul>
            <li><span class="ck">✓</span> 3,000,000 Kredi</li>
            <li><span class="ck">✓</span> Tüm Modeller (Limitsiz Araçlar)</li>
            <li><span class="ck">✓</span> Özel Sunucu Tahsisi</li>
            <li><span class="ck">✓</span> 7/24 Slack Desteği</li>
          </ul>
          <button class="btn btn-ghost" onclick="modal('reg')">Bize Ulaşın</button>
        </div>
      </div>
    </section>
    
    <!-- Footer -->
    <footer class="footer">
      <div class="footer-grid fu">
        <div class="f-col">
          <div class="f-logo"><img src="logo.jpg" alt="AiPaketim"> AiPaketim</div>
          <p style="font-size: 13px; max-width: 250px;">Türkiye'nin öncü yapay zeka API platformu. Uygulamalarınızı güçlendirin.</p>
        </div>
        <div class="f-col">
          <h4>Platform</h4>
          <div class="f-links">
            <a onclick="modal('reg')">Kayıt Ol</a>
            <a onclick="modal('login')">Giriş Yap</a>
            <a href="#pricing">Paketler</a>
          </div>
        </div>
        <div class="f-col">
          <h4>Kaynaklar</h4>
          <div class="f-links">
            <a href="#docs" id="docs">API Dokümantasyonu</a>
            <a href="#faq" id="faq">SSS</a>
          </div>
        </div>
        <div class="f-col">
          <h4>Yasal</h4>
          <div class="f-links">
            <button onclick="showLegal('kvkk')">KVKK Aydınlatma Metni</button>
            <button onclick="showLegal('privacy')">Gizlilik Politikası</button>
            <button onclick="showLegal('terms')">Kullanım Şartları</button>
          </div>
        </div>
      </div>
      <div class="footer-bottom fu">
        © 2026 AiPaketim. Tüm hakları saklıdır.
      </div>
    </footer>
    
    <!-- Legal Modal (Fixed) -->
    <div id="legal-modal" class="modal" onclick="if(event.target===this)this.classList.remove('open')">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="legal-title" style="margin:0; color:white;">Yasal</h3>
          <span class="close-btn" onclick="document.getElementById('legal-modal').classList.remove('open')">×</span>
        </div>
        <div class="modal-body" id="legal-body"></div>
      </div>
    </div>
  </div><!-- end v-landing -->
`;

// Extract everything outside v-landing
const landingStart = html.indexOf('<div class="v on" id="v-landing">');
const landingEnd = html.indexOf('<!-- Panel (Chat / Dashboard / Keys / Image / Admin) -->');

if (landingStart > -1 && landingEnd > -1) {
  html = html.substring(0, landingStart) + newLanding + '\n\n' + html.substring(landingEnd);
  
  // Also clean up navigation styling
  html = html.replace(/<nav class="nav" id="nav">.*?<\/nav>/s, `
  <nav class="nav" id="nav">
    <a class="nav-logo" onclick="go('landing')"><img loading="lazy" src="logo.jpg" alt="AiPaketim"> AiPaketim</a>
    <ul class="nav-links" id="nl-land">
      <li><a onclick="go('chat')">Chat</a></li>
      <li><a href="#features">Özellikler</a></li>
      <li><a href="#pricing">Paketler</a></li>
    </ul>
    <div class="nav-right" id="nr-auth">
      <button class="btn btn-ghost" onclick="modal('login')">Giriş Yap</button>
      <button class="btn btn-primary" onclick="modal('reg')">Kayıt Ol</button>
    </div>
    <!-- Add other states as hidden initially -->
    <div class="nav-right" id="nr-user" style="display:none;">
      <button class="btn btn-ghost" onclick="go('dash')">Dashboard</button>
      <button class="btn btn-primary" onclick="logout()">Çıkış</button>
    </div>
  </nav>
  `);
  
  // Add in-view intersection observer script
  html = html.replace('</body>', `
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
          }
        });
      }, { threshold: 0.1 });
      const panel = document.getElementById('hero-demo-panel');
      if(panel) observer.observe(panel);
    });
  </script>
  </body>
  `);

  fs.writeFileSync('index.html', html);
  console.log('Landing page and Nav rewritten.');
} else {
  console.log('Could not find landing boundaries.');
}
