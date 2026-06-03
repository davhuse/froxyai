(function () {
  'use strict';

  if (window.__froxyRobotWidgetLoaded) return;
  window.__froxyRobotWidgetLoaded = true;

  var STORE_KEY = 'froxy_robot_widget_hidden_v1';
  var CHAT_KEY = 'froxy_robot_widget_chat_v1';
  var WELCOME = 'Merhaba, ben Froxy destek asistanı. Fiyat, kredi, giriş, görsel üretim veya teknik sorunlarda hızlıca yardımcı olurum.';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function nowLabel() {
    try {
      return new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Şimdi';
    }
  }

  function isHidden() {
    try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; }
  }

  function setHidden(next) {
    try { localStorage.setItem(STORE_KEY, next ? '1' : '0'); } catch (e) {}
  }

  function readStoredMessages() {
    try {
      var arr = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
      return Array.isArray(arr) ? arr.slice(-12) : [];
    } catch (e) {
      return [];
    }
  }

  function saveStoredMessages(messages) {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-16))); } catch (e) {}
  }

  function token() {
    try { return localStorage.getItem('saas_token') || localStorage.getItem('ap_token') || ''; } catch (e) { return ''; }
  }

  function userSummary() {
    try {
      var raw = localStorage.getItem('saas_user') || localStorage.getItem('ap_user') || '';
      if (!raw) return null;
      var u = JSON.parse(raw);
      return {
        name: u && (u.username || u.name || u.full_name || ''),
        plan: u && (u.plan || ''),
        credits: u && (u.credits || u.tokens || 0)
      };
    } catch (e) {
      return null;
    }
  }

  function mount() {
    if (document.getElementById('froxy-robot-root')) return;

    var root = document.createElement('div');
    root.id = 'froxy-robot-root';
    root.className = isHidden() ? 'fr-hidden' : '';
    root.innerHTML = [
      '<div class="fr-speech" id="fr-speech"><p id="fr-speech-text">' + escapeHtml(WELCOME) + '</p></div>',
      '<button class="fr-close-mini" id="fr-hide" type="button" aria-label="Maskotu gizle" title="Maskotu gizle">×</button>',
      '<div class="fr-widget" id="fr-widget" role="button" tabindex="0" aria-label="Froxy destek asistanını aç">',
      '  <div class="fr-stage">',
      '    <div class="fr-robot" id="fr-robot">',
      '      <div class="fr-part fr-head" id="fr-head"><span class="fr-ear fr-ear-left"></span><span class="fr-ear fr-ear-right"></span><div class="fr-visor"><span class="fr-eye fr-eye-left"><i class="fr-pupil"></i></span><span class="fr-eye fr-eye-right"><i class="fr-pupil"></i></span></div><span class="fr-mouth"></span></div>',
      '      <div class="fr-part fr-body"><span class="fr-core"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><span class="fr-body-tag">FROXY</span></div>',
      '      <div class="fr-part fr-arm fr-arm-left"><span class="fr-hand"></span></div>',
      '      <div class="fr-part fr-arm fr-arm-right"><span class="fr-hand"></span></div>',
      '      <div class="fr-part fr-leg fr-leg-left"><span class="fr-foot"></span></div>',
      '      <div class="fr-part fr-leg fr-leg-right"><span class="fr-foot"></span></div>',
      '    </div>',
      '    <div class="fr-shadow"></div>',
      '  </div>',
      '</div>',
      '<div class="fr-support-overlay" id="fr-support" aria-hidden="true">',
      '  <section class="fr-support-panel" role="dialog" aria-modal="true" aria-label="Froxy AI destek">',
      '    <header class="fr-support-head">',
      '      <div class="fr-support-brand"><span class="fr-support-avatar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><div><b>Froxy AI Destek</b><small>Hızlı yardım aktif</small></div></div>',
      '      <button class="fr-support-close" id="fr-close" type="button" aria-label="Destek panelini kapat">×</button>',
      '    </header>',
      '    <div class="fr-support-messages" id="fr-messages"><div class="fr-day">Bugün</div></div>',
      '    <footer class="fr-support-input">',
      '      <div class="fr-input-shell"><input id="fr-input" type="text" autocomplete="off" maxlength="700" placeholder="Sorunu kısaca yaz..."><button class="fr-send" id="fr-send" type="button" aria-label="Mesaj gönder"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg></button></div>',
      '      <div class="fr-powered"><span>Yanıtlar otomatik destek asistanıyla hazırlanır.</span><button type="button" id="fr-ticket">Ticket aç</button></div>',
      '    </footer>',
      '  </section>',
      '</div>'
    ].join('');

    var launcher = document.createElement('button');
    launcher.className = 'fr-launcher' + (isHidden() ? ' is-on' : '');
    launcher.id = 'fr-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Froxy destek asistanını göster');
    launcher.innerHTML = '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    document.body.appendChild(root);
    document.body.appendChild(launcher);

    bind(root, launcher);
    restoreMessages(root);
    showSpeech(WELCOME, 4800);
    play(root, 'fr-wave');
  }

  function bind(root, launcher) {
    var widget = $('#fr-widget', root);
    var support = $('#fr-support', root);
    var input = $('#fr-input', root);
    var robot = $('#fr-robot', root);
    var hide = $('#fr-hide', root);
    var close = $('#fr-close', root);
    var send = $('#fr-send', root);
    var ticket = $('#fr-ticket', root);
    var dragging = false;
    var moved = false;
    var start = { x: 0, y: 0 };
    var current = { x: 0, y: 0 };

    function openSupport() {
      root.classList.remove('fr-hidden');
      launcher.classList.remove('is-on');
      setHidden(false);
      support.classList.add('is-open');
      support.setAttribute('aria-hidden', 'false');
      setTimeout(function () { input && input.focus(); }, 60);
      play(root, 'fr-wave');
    }

    function closeSupport() {
      support.classList.remove('is-open');
      support.setAttribute('aria-hidden', 'true');
    }

    function hideWidget(ev) {
      if (ev) ev.stopPropagation();
      closeSupport();
      root.classList.add('fr-hidden');
      launcher.classList.add('is-on');
      setHidden(true);
    }

    widget.addEventListener('click', function () {
      if (moved) {
        moved = false;
        return;
      }
      openSupport();
    });

    widget.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openSupport();
      }
    });

    widget.addEventListener('pointerdown', function (ev) {
      dragging = true;
      moved = false;
      start.x = ev.clientX;
      start.y = ev.clientY;
      current.x = parseFloat(root.style.right || '24') || 24;
      current.y = parseFloat(root.style.bottom || '24') || 24;
      widget.classList.add('fr-dragging');
      try { widget.setPointerCapture(ev.pointerId); } catch (e) {}
    });

    widget.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      var dx = ev.clientX - start.x;
      var dy = ev.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
      var nextRight = Math.max(8, Math.min(window.innerWidth - 96, current.x - dx));
      var nextBottom = Math.max(8, Math.min(window.innerHeight - 110, current.y - dy));
      root.style.right = nextRight + 'px';
      root.style.bottom = nextBottom + 'px';
      if (Math.abs(dx) + Math.abs(dy) > 120) play(root, 'fr-shake');
    });

    widget.addEventListener('pointerup', function () {
      dragging = false;
      widget.classList.remove('fr-dragging');
    });

    widget.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var old = parseFloat(robot.style.getPropertyValue('--fr-ry') || '-18') || -18;
      robot.style.setProperty('--fr-ry', (old + (ev.deltaY > 0 ? 18 : -18)) + 'deg');
    }, { passive: false });

    document.addEventListener('mousemove', function (ev) {
      var rect = widget.getBoundingClientRect();
      if (!rect.width) return;
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var px = Math.max(-3, Math.min(3, (ev.clientX - cx) / 58));
      var py = Math.max(-2, Math.min(2, (ev.clientY - cy) / 66));
      root.style.setProperty('--fr-px', px.toFixed(1) + 'px');
      root.style.setProperty('--fr-py', py.toFixed(1) + 'px');
    }, { passive: true });

    hide.addEventListener('click', hideWidget);
    launcher.addEventListener('click', function () {
      root.classList.remove('fr-hidden');
      launcher.classList.remove('is-on');
      setHidden(false);
      showSpeech('Geri geldim. Yardım istersen buradayım.', 3600);
      play(root, 'fr-jump');
    });
    close.addEventListener('click', closeSupport);
    support.addEventListener('click', function (ev) {
      if (ev.target === support) closeSupport();
    });
    send.addEventListener('click', function () { sendMessage(root); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') sendMessage(root);
    });
    ticket.addEventListener('click', function () {
      closeSupport();
      if (typeof window.go === 'function') window.go('support');
      else window.location.href = '/destek';
    });

    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest && ev.target.closest('[data-fr-quick]');
      if (!btn) return;
      var msg = btn.getAttribute('data-fr-quick') || '';
      if (input) input.value = msg;
      sendMessage(root);
    });

    window.FroxyRobot = {
      openSupport: openSupport,
      closeSupport: closeSupport,
      showMessage: showSpeech,
      playAnimation: function (name) { play(root, 'fr-' + String(name || 'wave').replace(/^fr-/, '')); },
      hide: hideWidget,
      show: function () {
        root.classList.remove('fr-hidden');
        launcher.classList.remove('is-on');
        setHidden(false);
      }
    };
  }

  function restoreMessages(root) {
    var messages = readStoredMessages();
    if (!messages.length) {
      addMessage(root, 'bot', WELCOME, true);
      renderQuick(root);
      return;
    }
    messages.forEach(function (m) { addMessage(root, m.role === 'user' ? 'user' : 'bot', m.text, true); });
    renderQuick(root);
  }

  function renderQuick(root) {
    var box = $('#fr-messages', root);
    if (!box || $('#fr-quick', root)) return;
    var quick = document.createElement('div');
    quick.className = 'fr-quick';
    quick.id = 'fr-quick';
    [
      'Fiyatlandırma ve kredi paketleri',
      'Giriş veya kayıt sorunu',
      'Görsel üretim hatası',
      'Ödeme ve fatura yardımı'
    ].forEach(function (label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-fr-quick', label);
      b.textContent = label;
      quick.appendChild(b);
    });
    box.appendChild(quick);
  }

  function addMessage(root, role, text, silent) {
    var box = $('#fr-messages', root);
    if (!box) return;
    var quick = $('#fr-quick', root);
    if (quick) quick.remove();
    var row = document.createElement('div');
    row.className = 'fr-msg ' + (role === 'user' ? 'user' : 'bot');
    row.innerHTML = '<div class="fr-msg-bubble">' + linkify(escapeHtml(text)) + '<small>' + nowLabel() + '</small></div>';
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    if (!silent) {
      var stored = readStoredMessages();
      stored.push({ role: role === 'user' ? 'user' : 'bot', text: String(text || '').slice(0, 1200) });
      saveStoredMessages(stored);
    }
  }

  function linkify(html) {
    return html.replace(/(destek@froxyai\.com)/g, '<a href="mailto:$1" class="fr-ticket-link">$1</a>');
  }

  function localReply(message) {
    var s = String(message || '').toLowerCase();
    if (/fiyat|paket|kredi|ücret|ucret|para|satın|satin/.test(s)) {
      return 'Paketleri Mağaza bölümünden görebilirsin. Kredi sistemi kullanım başına çalışır; yeni üyeler ücretsiz başlangıç kredisiyle paneli deneyebilir.';
    }
    if (/giriş|giris|kayıt|kayit|kod|otp|mail|şifre|sifre/.test(s)) {
      return 'Mail/şifre girişinde doğrulama kodu gerekir. Kod gelmezse spam klasörünü kontrol et, birkaç dakika bekle ve tekrar kod iste. Devam ederse destek@froxyai.com adresine yaz.';
    }
    if (/görsel|gorsel|foto|resim|image|galeri|düzenle|duzenle/.test(s)) {
      return 'Görsel üretimde model, oran ve kalite modu seçebilirsin. Fotoğraf düzenleme için yalnızca edit destekli modeller kullanılır. Hata alırsan promptu ve seçili modeli ticket ile gönder.';
    }
    if (/ödeme|odeme|fatura|shopier|dodo|iade|kart/.test(s)) {
      return 'Ödeme ve fatura konularında güvenli işlem için destek talebi açmanı öneririm. Özel ödeme bilgilerini bu hızlı sohbet alanına yazma.';
    }
    return 'Anladım. Bu konuda hızlıca yönlendirebilirim; hesap, ödeme veya özel veri gerekiyorsa güvenli olması için destek talebi açmanı öneririm.';
  }

  async function sendMessage(root) {
    var input = $('#fr-input', root);
    var text = input ? input.value.trim() : '';
    if (!text) return;
    input.value = '';
    addMessage(root, 'user', text);
    play(root, 'fr-jump');

    var typingId = 'fr-typing-' + Date.now();
    var box = $('#fr-messages', root);
    var typing = document.createElement('div');
    typing.className = 'fr-msg bot';
    typing.id = typingId;
    typing.innerHTML = '<div class="fr-msg-bubble">Yanıt hazırlanıyor...<small>Şimdi</small></div>';
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;

    var reply = '';
    try {
      var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      var t = token();
      if (t) headers.Authorization = 'Bearer ' + t;
      var res = await fetch('/api/support-bot', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: headers,
        body: JSON.stringify({
          message: text,
          route: location.pathname,
          user: userSummary()
        })
      });
      var data = await res.json().catch(function () { return {}; });
      reply = data && data.reply ? String(data.reply) : '';
      if (!res.ok && !reply) reply = data.error || '';
    } catch (e) {}

    var oldTyping = document.getElementById(typingId);
    if (oldTyping) oldTyping.remove();
    reply = reply || localReply(text);
    addMessage(root, 'bot', reply);
    if (/ticket|destek talebi|ödeme|fatura|hesap/i.test(reply)) {
      addTicketCta(root);
    } else {
      renderQuick(root);
    }
    showSpeech('Cevabı destek paneline bıraktım.', 2800);
    play(root, 'fr-wave');
  }

  function addTicketCta(root) {
    var box = $('#fr-messages', root);
    if (!box) return;
    var link = document.createElement('a');
    link.className = 'fr-ticket-link';
    link.href = '/destek';
    link.textContent = 'Destek talebi aç';
    link.addEventListener('click', function (ev) {
      if (typeof window.go === 'function') {
        ev.preventDefault();
        window.go('support');
        var overlay = $('#fr-support', root);
        if (overlay) overlay.classList.remove('is-open');
      }
    });
    box.appendChild(link);
    box.scrollTop = box.scrollHeight;
  }

  function showSpeech(text, ms) {
    var speech = document.getElementById('fr-speech');
    var speechText = document.getElementById('fr-speech-text');
    if (!speech || !speechText) return;
    speechText.textContent = text || WELCOME;
    speech.classList.add('is-on');
    clearTimeout(showSpeech.timer);
    showSpeech.timer = setTimeout(function () {
      speech.classList.remove('is-on');
    }, ms || 3500);
  }

  function play(root, cls) {
    var widget = $('#fr-widget', root);
    if (!widget) return;
    widget.classList.remove('fr-wave', 'fr-jump', 'fr-shake', 'fr-dance');
    void widget.offsetWidth;
    widget.classList.add(cls);
    clearTimeout(play.timer);
    play.timer = setTimeout(function () { widget.classList.remove(cls); }, 1200);
  }

  function boot() {
    var delay = window.matchMedia && window.matchMedia('(max-width: 720px)').matches ? 1400 : 900;
    setTimeout(mount, delay);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
