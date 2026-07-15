const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The new v-chat layout
const newChat = `
  <!-- Panel (Chat / Dashboard / Keys / Image / Admin) -->
  <div class="v" id="v-chat">
    <div class="chat-layout">
      <!-- Sidebar -->
      <aside class="chat-sidebar" id="panel-sidebar">
        <div class="cs-header">
          <button class="new-chat-btn" onclick="clearChat()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Yeni Sohbet
          </button>
        </div>
        <div class="cs-list" id="chat-list">
          <!-- Chat history will be injected here -->
        </div>
        
        <!-- User Settings Area -->
        <div style="padding: 16px; border-top: 1px solid var(--border-color); display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="go('dash')">
          <div id="ps-ava" style="width: 36px; height: 36px; border-radius: 50%; background: var(--brand-gradient); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">U</div>
          <div style="flex: 1; overflow: hidden;">
            <div id="ps-name" style="font-size: 14px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis;">Kullanıcı</div>
            <div id="ps-plan" style="font-size: 12px; color: var(--text-muted);">Starter Plan</div>
          </div>
        </div>
      </aside>

      <!-- Main Chat Area -->
      <main class="chat-main" id="chat-main-col">
        <!-- Chat Header -->
        <header class="chat-header">
          <button style="position: absolute; left: 16px; display: none;" class="mobile-menu-btn">☰</button>
          
          <select id="model-sel" class="model-selector" onchange="changeModel(this.value)">
            <optgroup label="Sohbet Modelleri">
              <option value="gpt-5.5-turbo">GPT-5.5 Turbo</option>
              <option value="claude-3-opus">Claude 3 Opus</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
              <option value="deepseek-coder">DeepSeek Coder</option>
            </optgroup>
          </select>
        </header>

        <!-- Messages -->
        <div class="chat-messages" id="chat-msgs">
          <!-- Empty State -->
          <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.5;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            <h2>Nasıl yardımcı olabilirim?</h2>
          </div>
        </div>

        <!-- Input Area -->
        <div class="chat-input-area">
          <div class="chat-input-box">
            
            <button class="chat-btn" title="Dosya Ekle" onclick="document.getElementById('chat-file').click()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <input type="file" id="chat-file" style="display:none" onchange="handleFileSelect(event)">
            
            <textarea id="chat-in" class="chat-textarea" placeholder="Mesajınızı yazın..." rows="1" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px';" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat();}"></textarea>
            
            <div class="chat-tools">
              <button class="chat-btn" id="mic-btn" title="Sesli Giriş" onclick="toggleVoiceInput()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>
              </button>
              <button class="chat-btn send" id="chat-send" onclick="sendChat()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div><!-- end v-chat -->
`;

const chatStart = html.indexOf('<div class="v" id="v-chat">');
const dashStart = html.indexOf('<div class="v" id="v-dash">');

if (chatStart > -1 && dashStart > -1) {
  html = html.substring(0, chatStart) + newChat + '\n' + html.substring(dashStart);
  fs.writeFileSync('index.html', html);
  console.log('Chat interface rewritten.');
} else {
  console.log('Could not find chat boundaries.');
}
