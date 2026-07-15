const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const newDash = `
  <div class="v" id="v-dash">
    <div class="dash-layout">
      <div class="dash-header">
        <div>
          <h2 style="margin-bottom:8px">Hoş Geldin, <span id="d-name" style="color:var(--brand)">Kullanıcı</span> 👋</h2>
          <p>API kullanımınızı ve kredi durumunuzu buradan takip edebilirsiniz.</p>
        </div>
        <div style="text-align: right;">
          <div id="d-plan-badge" style="background: rgba(124,58,237,0.1); color: var(--brand); padding: 6px 12px; border-radius: var(--radius-full); font-size: 13px; font-weight: 600; display: inline-block; border: 1px solid rgba(124,58,237,0.3); margin-bottom: 8px;">Starter</div>
          <div style="font-size: 12px; color: var(--text-muted);"><span id="d-plan">Starter</span> Plan Aktif</div>
        </div>
      </div>

      <div class="dash-stats-grid">
        <div class="stat-card">
          <div class="stat-title">Kalan Kredi</div>
          <div class="stat-value" id="d-tok">0</div>
          <div class="stat-bar">
            <div class="stat-fill" id="d-bar" style="width: 0%"></div>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:12px; color:var(--text-muted)">
            <span id="d-pct">0%</span>
            <span><span id="d-used">0</span> Harcandı</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-title">Toplam İstek</div>
          <div class="stat-value" id="d-reqs">0</div>
          <div style="margin-top:20px; font-size:12px; color:var(--text-muted);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px; margin-right:4px;"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            Son 30 günlük API metrikleri
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <h3 style="margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">Hızlı İşlemler</h3>
      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 40px;">
        <div class="card" style="padding: 20px; cursor: pointer; text-align: center;" onclick="go('keys')">
          <div style="font-size: 24px; margin-bottom: 12px;">🔑</div>
          <div style="font-weight: 600;">API Anahtarları</div>
        </div>
        <div class="card" style="padding: 20px; cursor: pointer; text-align: center;" onclick="go('chat')">
          <div style="font-size: 24px; margin-bottom: 12px;">💬</div>
          <div style="font-weight: 600;">Chat Arayüzü</div>
        </div>
        <div class="card" style="padding: 20px; cursor: pointer; text-align: center;" onclick="go('img')">
          <div style="font-size: 24px; margin-bottom: 12px;">🎨</div>
          <div style="font-weight: 600;">Görsel Üret</div>
        </div>
        <div class="card" style="padding: 20px; cursor: pointer; text-align: center;" onclick="document.getElementById('pricing').scrollIntoView()">
          <div style="font-size: 24px; margin-bottom: 12px;">💎</div>
          <div style="font-weight: 600;">Kredi Yükle</div>
        </div>
      </div>
    </div>
  </div><!-- end v-dash -->

  <!-- Make sure we keep the other required sections but hide them properly for now -->
  <div class="v" id="v-keys">... (Anahtar Sayfası) ...</div>
  <div class="v" id="v-img">
    <div class="dash-layout">
      <h2>Görsel Üretim</h2>
      <div style="display:flex; gap:16px; margin-top:24px;">
        <select id="img-model" class="model-selector" style="min-width:200px; padding:12px;">
          <option value="flux">Pollinations Flux</option>
          <option value="turbo">Pollinations Turbo</option>
          <option value="style-realism">Gerçekçi (Realism)</option>
          <option value="style-dalle3">DALL-E 3 Tarzı</option>
        </select>
        <input type="text" id="img-prompt" class="chat-textarea" placeholder="Neyin resmini çizmek istersin?" style="flex:1; background:var(--bg-sec); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0 16px;">
        <button id="btn-gen-img" class="btn btn-primary btn-lg" onclick="genImage()">Üret</button>
      </div>
      <div id="img-result" style="margin-top:40px; min-height:400px; border:1px dashed var(--border-color); border-radius:var(--radius-lg); display:flex; align-items:center; justify-content:center;">
        <div style="color:var(--text-muted)">Sonuç burada görünecek</div>
      </div>
    </div>
  </div>
`;

const dashStart = html.indexOf('<div class="v" id="v-dash">');
// Since v-dash is followed by v-admin, let's find where v-admin starts
const adminStart = html.indexOf('<div class="v" id="v-admin">');

if (dashStart > -1 && adminStart > -1) {
  html = html.substring(0, dashStart) + newDash + '\n' + html.substring(adminStart);
  fs.writeFileSync('index.html', html);
  console.log('Dashboard and Image Gen rewritten.');
} else {
  console.log('Could not find dash/admin boundaries.');
}
