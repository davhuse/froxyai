(function () {
  'use strict';

  if (window.__froxyRobotWidgetLoaded) return;
  window.__froxyRobotWidgetLoaded = true;

  var STORE_KEY = 'froxy_robot_widget_hidden_v1';
  var CHAT_KEY = 'froxy_robot_widget_chat_v2';
  var CSS_VERSION = 'v383';
  var WELCOME = 'Merhaba, ben Froxy destek asistanı. Fiyat, kredi, giriş, görsel üretim ve teknik sorunlarda hızlıca yardımcı olurum.';

  function setPublicApi(api) {
    window.FroxyRobot = Object.assign(window.FroxyRobot || {}, api || {});
  }

  setPublicApi({
    openSupport: function () {
      var root = document.getElementById('froxy-robot-root');
      if (!root || !root.shadowRoot) return false;
      root.classList.remove('fr-hidden');
      var launcher = root.shadowRoot.getElementById('frLauncher');
      var backdrop = root.shadowRoot.getElementById('sovBackdrop');
      var panel = root.shadowRoot.getElementById('sov');
      if (launcher) launcher.classList.remove('on');
      if (backdrop) backdrop.classList.add('on');
      if (panel) {
        panel.classList.add('on');
        panel.setAttribute('aria-hidden', 'false');
      }
      try { localStorage.setItem(STORE_KEY, '0'); } catch (e) {}
      return !!panel;
    },
    closeSupport: function () {
      var root = document.getElementById('froxy-robot-root');
      if (!root || !root.shadowRoot) return false;
      var backdrop = root.shadowRoot.getElementById('sovBackdrop');
      var panel = root.shadowRoot.getElementById('sov');
      if (backdrop) backdrop.classList.remove('on');
      if (panel) {
        panel.classList.remove('on');
        panel.setAttribute('aria-hidden', 'true');
      }
      return !!panel;
    },
    show: function () {
      var root = document.getElementById('froxy-robot-root');
      if (!root) return false;
      root.classList.remove('fr-hidden');
      try { localStorage.setItem(STORE_KEY, '0'); } catch (e) {}
      return true;
    }
  });

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

  function cubeFaces(innerFront, backInner) {
    return [
      '<div class="f fr">' + (innerFront || '') + '</div>',
      '<div class="f bk">' + (backInner || '') + '</div>',
      '<div class="f lt"></div>',
      '<div class="f rt"></div>',
      '<div class="f tp"></div>',
      '<div class="f bt"></div>'
    ].join('');
  }

  function robotMarkup() {
    return [
      '<div class="sov-backdrop" id="sovBackdrop" aria-hidden="true"></div>',
      '<div class="rw" id="rw">',
      '  <div class="speech" id="speech"><p id="stxt">' + escapeHtml(WELCOME) + '</p><div class="sarrow"></div></div>',
      '  <button class="fr-hide" id="frHide" type="button" aria-label="Maskotu gizle" title="Maskotu gizle">×</button>',
      '  <div class="dstars" id="dstars"><span>*</span><span>+</span><span>*</span><span>+</span></div>',
      '  <div class="scene" id="scene" role="button" tabindex="0" aria-label="Froxy 3D destek asistanını aç">',
      '    <div class="r3" id="r3">',
      '      <div class="p-ant" id="antH"><div class="ant-rod"></div><div class="ant-ball"></div></div>',
      '      <div class="p-head" id="headH">',
      '        <div class="cube c-head">' + cubeFaces('<div class="visor"><div class="eye" id="eL"><div class="pup" id="pL"></div><div class="gli"></div></div><div class="eye" id="eR"><div class="pup" id="pR"></div><div class="gli"></div></div></div><div class="mth" id="mth"></div><div class="hled"></div>') + '</div>',
      '        <div class="ear el"></div><div class="ear er"></div>',
      '      </div>',
      '      <div class="p-body" id="bodyH">',
      '        <div class="cube c-body">' + cubeFaces('<div class="core"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><div class="bstr s1"></div><div class="bstr s2"></div><div class="btag">FROXY</div>', '<div class="back-panel"></div>') + '</div>',
      '      </div>',
      '      <div class="p-arm al" id="alH"><div class="cube c-arm">' + cubeFaces('') + '</div><div class="hnd"><i></i><i></i><i></i></div></div>',
      '      <div class="p-arm ar" id="arH"><div class="cube c-arm">' + cubeFaces('') + '</div><div class="hnd"><i></i><i></i><i></i></div></div>',
      '      <div class="p-leg ll" id="llH"><div class="cube c-leg">' + cubeFaces('') + '</div><div class="foot"></div></div>',
      '      <div class="p-leg rl" id="rlH"><div class="cube c-leg">' + cubeFaces('') + '</div><div class="foot"></div></div>',
      '    </div>',
      '  </div>',
      '  <div class="rshad" id="rshad"></div>',
      '  <div class="rotate-hint" id="rhint">Scroll ile çevir</div>',
      '</div>',
      '<div class="sov" id="sov" aria-hidden="true">',
      '  <div class="sp" role="dialog" aria-modal="true" aria-label="Froxy AI destek">',
      '    <div class="sph"><div class="spl"><div class="spa"><img src="/froxy-logo-192-v260.png" alt="" width="30" height="30"><i></i></div><div><b>Froxy AI De\u0073tek</b><small>Çevrim içi</small></div></div><button class="spx" id="spx" type="button" aria-label="Destek panelini kapat"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>',
      '    <div class="spm" id="spm"><div class="spd">Bugün</div></div>',
      '    <div class="spi"><div class="siw"><input type="text" id="sinp" placeholder="Mesaj yazın..." autocomplete="off" maxlength="700"><button class="ssnd" id="ssnd" type="button" aria-label="Mesaj gönder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2 15 22 11 13M22 2 2 9 11 13"/></svg></button></div><small class="spw">Powered by <b>FroxyAI</b></small></div>',
      '  </div>',
      '</div>',
      '<button class="fr-launcher" id="frLauncher" type="button" aria-label="Froxy destek asistanını göster"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>',
      '<canvas id="pc"></canvas>'
    ].join('');
  }

  function mount() {
    // Admin route'unda robot widget'ı mount etme
    if (/^\/admin/i.test(location.pathname || '')) return;
    if (document.getElementById('froxy-robot-root')) return;

    var host = document.createElement('div');
    host.id = 'froxy-robot-root';
    if (/^\/(sohbet|chat)$/i.test(location.pathname || '')) host.classList.add('chat-route');
    if (/^\/?$/i.test((location.pathname || '/').replace(/^\/+/, ''))) host.classList.add('home-route');
    if (isHidden()) host.classList.add('fr-hidden');
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<link rel="stylesheet" href="/froxy-robot.css?v=' + CSS_VERSION + '">' + robotMarkup();
    document.body.appendChild(host);

    var $ = function (id) { return shadow.getElementById(id); };
    var rw = $('rw'), r3 = $('r3'), scene = $('scene'), speech = $('speech'), stxt = $('stxt');
    var stars = $('dstars'), canvas = $('pc'), ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var pL = $('pL'), pR = $('pR'), headH = $('headH'), bodyH = $('bodyH'), alH = $('alH'), arH = $('arH'), antH = $('antH'), llH = $('llH'), rlH = $('rlH');
    var sov = $('sov'), spx = $('spx'), spm = $('spm'), sinp = $('sinp'), ssnd = $('ssnd'), frHide = $('frHide'), launcher = $('frLauncher'), rhint = $('rhint'), sovBackdrop = $('sovBackdrop');

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var drag = false, dox = 0, doy = 0, dsx = 0, dsy = 0, wasDrag = false;
    var supOpen = false, spTO = null, anTO = null, isAn = false;
    var hHits = 0, hHitTO = null, particles = [], dragHist = [];
    var userRotY = -20, baseRx = -8;

    function clampHostPosition(resetIfDefault) {
      if (!host || !rw) return;
      var usingDefault = host.style.left === '' && host.style.top === '';
      var margin = window.innerWidth <= 640 ? 12 : 18;
      var rect = rw.getBoundingClientRect();
      var width = rect.width || rw.offsetWidth || 120;
      var height = rect.height || rw.offsetHeight || 180;
      var chatOffset = /^\/(sohbet|chat)$/i.test(location.pathname || '') ? 132 : 18;
      if (resetIfDefault && usingDefault) {
        host.style.left = 'auto';
        host.style.top = 'auto';
        host.style.right = margin + 'px';
        host.style.bottom = 'calc(' + chatOffset + 'px + env(safe-area-inset-bottom))';
        return;
      }
      if (host.style.left === '' || host.style.top === '') return;
      var left = parseFloat(host.style.left) || 0;
      var top = parseFloat(host.style.top) || 0;
      var maxLeft = Math.max(margin, window.innerWidth - width - margin);
      var maxTop = Math.max(margin, window.innerHeight - height - margin);
      host.style.left = Math.max(margin, Math.min(left, maxLeft)) + 'px';
      host.style.top = Math.max(margin, Math.min(top, maxTop)) + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    }

    function resizeCanvas() {
      if (!canvas || !ctx) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      clampHostPosition(true);
    }

    function applyTransform(extraRx, extraRy, extraTy, extraRz, extraScale) {
      if (!r3) return;
      var rx = (extraRx || 0) + baseRx;
      var ry = (extraRy || 0) + userRotY;
      var ty = extraTy || 0;
      var rz = extraRz || 0;
      var sc = extraScale || 1;
      r3.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(' + ty + 'px) rotateZ(' + rz + 'deg) scale(' + sc + ')';
      r3.style.setProperty('--ury', userRotY + 'deg');
    }

    function updatePupils() {
      var eL = $('eL'), eR = $('eR');
      [[eL, pL], [eR, pR]].forEach(function (pair) {
        var e = pair[0], p = pair[1];
        if (!e || !p) return;
        var r = e.getBoundingClientRect();
        var ecx = r.left + r.width / 2, ecy = r.top + r.height / 2;
        var a = Math.atan2(my - ecy, mx - ecx);
        var d = Math.min(Math.hypot(mx - ecx, my - ecy) / 100, 1);
        p.style.transform = 'translate(calc(-50% + ' + (Math.cos(a) * 3.5 * d).toFixed(2) + 'px), calc(-50% + ' + (Math.sin(a) * 3.5 * d).toFixed(2) + 'px))';
      });
    }

    function update3D() {
      if (!document.body.contains(host)) return;
      if (!r3 || drag || isAn || host.classList.contains('fr-hidden')) {
        window.requestAnimationFrame(update3D);
        return;
      }
      var rect = rw.getBoundingClientRect();
      var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      var dx = mx - cx, dy = my - cy;
      var inf = Math.min(Math.hypot(dx, dy) / 250, 1);
      var mry = (dx / window.innerWidth) * 25 * inf;
      var mrx = -(dy / window.innerHeight) * 12 * inf;
      var bob = Math.sin(((Date.now() % 4000) / 4000) * Math.PI * 2) * -7;
      applyTransform(mrx, mry, bob);
      updatePupils();
      window.requestAnimationFrame(update3D);
    }

    function spawnP(x, y, col, n, type) {
      for (var i = 0; i < (n || 10); i++) {
        var big = type === 'star' || Math.random() > 0.6;
        particles.push({
          x: x, y: y,
          vx: (Math.random() - 0.5) * (type === 'explode' ? 14 : 8),
          vy: -2 - Math.random() * (type === 'explode' ? 10 : 6),
          sz: 2 + Math.random() * (big ? 7 : 4),
          c: col || '#7c3aed', life: 1, dec: 0.015 + Math.random() * 0.025,
          g: type === 'explode' ? 0.2 : 0.12, rot: Math.random() * 360,
          rs: (Math.random() - 0.5) * 10, star: big
        });
      }
    }

    function renderP() {
      if (!ctx || !canvas || !document.body.contains(host)) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99; p.life -= p.dec; p.rot += p.rs;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.life; ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180); ctx.fillStyle = p.c;
        if (p.star) {
          ctx.beginPath();
          for (var j = 0; j < 4; j++) {
            var a = j * Math.PI / 2 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * p.sz, Math.sin(a) * p.sz);
            ctx.lineTo(Math.cos(a + Math.PI / 4) * p.sz * 0.4, Math.sin(a + Math.PI / 4) * p.sz * 0.4);
          }
          ctx.closePath(); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(0, 0, p.sz, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      window.requestAnimationFrame(renderP);
    }

    var anDur = { flip: 800, spin: 800, jump: 700, dance: 1400, explode: 1000, jelly: 600, wave: 1600, faint: 1200, shake: 500 };
    function playAn(name) {
      if (!r3 || drag || host.classList.contains('fr-hidden')) return;
      isAn = true;
      ['a-flip', 'a-spin', 'a-jump', 'a-dance', 'a-explode', 'a-jelly', 'a-wave', 'a-faint', 'a-shake', 'hit-al', 'hit-ar', 'st-hurt', 'st-angry', 'st-happy'].forEach(function (c) { r3.classList.remove(c); });
      void r3.offsetWidth;
      r3.classList.add('a-' + name);
      var rect = rw.getBoundingClientRect();
      var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 3;
      if (name === 'flip' || name === 'spin') spawnP(cx, cy, '#7c3aed', 12, 'star');
      else if (name === 'jump') window.setTimeout(function () { spawnP(cx, rect.top + rect.height, '#22d3ee', 10); }, 100);
      else if (name === 'dance') { spawnP(cx - 20, cy, '#ec4899', 6, 'star'); spawnP(cx + 20, cy, '#f59e0b', 6, 'star'); }
      else if (name === 'jelly') spawnP(cx, cy, '#3b82f6', 8);
      window.clearTimeout(anTO);
      anTO = window.setTimeout(function () { r3.classList.remove('a-' + name); isAn = false; }, anDur[name] || 800);
    }

    var speechMap = {
      idle: ['Yardım istersen buradayım.', 'Scroll ile beni çevirebilirsin.', 'Destek panelini açmak için gövdeme dokun.'],
      headHit: ['Kafam hassas, dikkat.', 'Tamam tamam, buradayım.'],
      armHit: ['Koluma dikkat.', 'Bu biraz gıdıklıyor.'],
      antHit: ['Sinyal tamam, anten çalışıyor.', 'Anten bağlantısı aktif.'],
      bodyClick: ['Destek panelini açıyorum.', 'Hemen yardımcı olayım.'],
      legHit: ['Hop, ayaklar çalışıyor.', 'Zıplama modu aktif.'],
      multiHit: ['Tamam, biraz sakinleşelim.', 'Kısa bir mola iyi gelir.'],
      faint: ['Bir saniye toparlanıyorum.', 'Dünya biraz döndü.'],
      welcome: [WELCOME]
    };

    function say(cat, dur) {
      if (!speech || !stxt) return;
      var arr = speechMap[cat] || speechMap.idle;
      stxt.textContent = arr[Math.floor(Math.random() * arr.length)];
      speech.classList.add('on');
      window.clearTimeout(spTO);
      spTO = window.setTimeout(function () { speech.classList.remove('on'); }, dur || 3500);
    }

    var hitTO = null;
    function markHit(name, dur) {
      if (!host || !r3) return;
      window.clearTimeout(hitTO);
      host.setAttribute('data-last-hit', name);
      ['is-hit-head', 'is-hit-left-arm', 'is-hit-right-arm', 'is-hit-antenna', 'is-hit-left-leg', 'is-hit-right-leg', 'is-hit-body'].forEach(function (c) { r3.classList.remove(c); });
      r3.classList.add('is-hit-' + name);
      hitTO = window.setTimeout(function () {
        r3.classList.remove('is-hit-' + name);
      }, dur || 1200);
    }

    function clearStates() {
      ['st-hurt', 'st-angry', 'st-happy', 'st-faint', 'a-shake', 'a-jump', 'a-jelly', 'a-wave', 'a-spin', 'a-flip', 'a-dance', 'a-faint', 'hit-al', 'hit-ar'].forEach(function (c) { r3.classList.remove(c); });
      stars.classList.remove('on');
    }

    function openSupport() {
      supOpen = true;
      host.classList.remove('fr-hidden');
      launcher.classList.remove('on');
      setHidden(false);
      if (sovBackdrop) sovBackdrop.classList.add('on');
      sov.classList.add('on');
      sov.setAttribute('aria-hidden', 'false');
      speech.classList.remove('on');
      window.setTimeout(function () { if (sinp) sinp.focus(); }, 260);
    }

    function closeSupport() {
      supOpen = false;
      if (sovBackdrop) sovBackdrop.classList.remove('on');
      sov.classList.remove('on');
      sov.setAttribute('aria-hidden', 'true');
    }

    function hideWidget(ev) {
      if (ev) ev.stopPropagation();
      closeSupport();
      host.classList.add('fr-hidden');
      launcher.classList.add('on');
      setHidden(true);
    }

    function showWidget() {
      host.classList.remove('fr-hidden');
      launcher.classList.remove('on');
      setHidden(false);
      say('welcome', 3600);
      playAn('jump');
    }

    function doFaint() {
      playAn('faint');
      say('faint', 2000);
      stars.classList.add('on');
      r3.classList.add('st-faint');
      var rect = rw.getBoundingClientRect();
      spawnP(rect.left + rect.width / 2, rect.top + 30, '#f59e0b', 15, 'star');
      window.setTimeout(function () { stars.classList.remove('on'); r3.classList.remove('st-faint'); }, 1300);
    }

    function dragStart(e) {
      var c = e.touches ? e.touches[0] : e;
      if (!c) return;
      e.preventDefault();
      var rect = rw.getBoundingClientRect();
      dox = c.clientX - rect.left; doy = c.clientY - rect.top; dsx = c.clientX; dsy = c.clientY;
      drag = true; wasDrag = false; rw.classList.add('drag'); rw.style.transition = 'none';
      dragHist = [{ x: c.clientX, y: c.clientY, t: Date.now() }];
    }

    function dragMove(e) {
      if (!drag) return;
      var c = e.touches ? e.touches[0] : e;
      if (!c) return;
      e.preventDefault();
      if (Math.abs(c.clientX - dsx) > 5 || Math.abs(c.clientY - dsy) > 5) wasDrag = true;
      var x = c.clientX - dox, y = c.clientY - doy;
      var margin = window.innerWidth <= 640 ? 12 : 18;
      host.style.left = Math.max(margin, Math.min(x, window.innerWidth - rw.offsetWidth - margin)) + 'px';
      host.style.top = Math.max(margin, Math.min(y, window.innerHeight - rw.offsetHeight - margin)) + 'px';
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      var now = Date.now();
      dragHist.push({ x: c.clientX, y: c.clientY, t: now });
      dragHist = dragHist.filter(function (p) { return now - p.t < 500; });
      if (dragHist.length >= 2) {
        var last = dragHist[dragHist.length - 1], prev = dragHist[Math.max(0, dragHist.length - 4)];
        var vx = (last.x - prev.x) / Math.max(1, last.t - prev.t) * 16;
        r3.style.transform = 'rotateX(' + baseRx + 'deg) rotateY(' + (userRotY + vx * 0.5) + 'deg) rotateZ(' + (vx * 0.3) + 'deg)';
      }
    }

    function dragEnd() {
      if (!drag) return;
      drag = false; rw.classList.remove('drag'); rw.style.transition = '';
      if (dragHist.length >= 4) {
        var total = 0;
        for (var i = 1; i < dragHist.length; i++) total += Math.hypot(dragHist[i].x - dragHist[i - 1].x, dragHist[i].y - dragHist[i - 1].y);
        if (total > 250) doFaint();
      }
      dragHist = [];
    }

    function addMessage(role, text, silent) {
      if (!spm) return;
      var quick = shadow.getElementById('sq');
      if (quick) quick.remove();
      var row = document.createElement('div');
      row.className = 'sm ' + (role === 'user' ? 'su' : 'sb');
      row.innerHTML = role === 'user'
        ? '<div class="smb"><p>' + linkify(escapeHtml(text)) + '</p><small>' + nowLabel() + '</small></div>'
        : '<div class="sma"><img src="/froxy-logo-192-v260.png" alt="" width="26" height="26"></div><div class="smb"><p>' + linkify(escapeHtml(text)) + '</p><small>' + nowLabel() + '</small></div>';
      spm.appendChild(row);
      spm.scrollTop = spm.scrollHeight;
      if (!silent) {
        var stored = readStoredMessages();
        stored.push({ role: role === 'user' ? 'user' : 'bot', text: String(text || '').slice(0, 1200) });
        saveStoredMessages(stored);
      }
    }

    function renderQuick() {
      if (!spm || shadow.getElementById('sq')) return;
      var quick = document.createElement('div');
      quick.className = 'sq';
      quick.id = 'sq';
      ['Fiyatlandırma ve kredi paketleri', 'Giriş veya kayıt sorunu', 'Görsel üretim hatası', 'Ödeme ve fatura yardımı'].forEach(function (label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-m', label);
        b.textContent = label;
        quick.appendChild(b);
      });
      spm.appendChild(quick);
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
        return 'Mail ve şifre girişinde doğrulama kodu gerekir. Kod gelmezse spam klasörünü kontrol et, birkaç dakika bekle ve tekrar kod iste.';
      }
      if (/görsel|gorsel|foto|resim|image|galeri|düzenle|duzenle/.test(s)) {
        return 'Görsel üretimde model, oran ve kalite modu seçebilirsin. Fotoğraf düzenleme için yalnızca edit destekli modeller kullanılır.';
      }
      if (/ödeme|odeme|fatura|shopier|dodo|iade|kart/.test(s)) {
        return 'Ödeme ve fatura konularında güvenli işlem için destek talebi açmanı öneririm. Özel ödeme bilgilerini hızlı sohbet alanına yazma.';
      }
      return 'Anladım. Hesap, ödeme veya özel veri gerekiyorsa güvenli olması için destek talebi açmanı öneririm.';
    }

    function showTyping() {
      var d = document.createElement('div');
      d.className = 'sm sb';
      d.id = 'typing';
      d.innerHTML = '<div class="sma"><img src="/froxy-logo-192-v260.png" alt="" width="26" height="26"></div><div class="smb"><div class="spt"><span></span><span></span><span></span></div></div>';
      spm.appendChild(d);
      spm.scrollTop = spm.scrollHeight;
      return d;
    }

    async function sendMessage(text) {
      var msg = String(text || (sinp && sinp.value) || '').trim();
      if (!msg) return;
      if (sinp) sinp.value = '';
      addMessage('user', msg);
      playAn('jump');
      var typing = showTyping();
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
          body: JSON.stringify({ message: msg, route: location.pathname, user: userSummary() })
        });
        var data = await res.json().catch(function () { return {}; });
        reply = data && data.reply ? String(data.reply) : '';
        if (!res.ok && !reply) reply = data.error || '';
      } catch (e) {}
      if (typing) typing.remove();
      addMessage('bot', reply || localReply(msg));
      renderQuick();
      say('idle', 2600);
      playAn('wave');
    }

    function restoreMessages() {
      var messages = readStoredMessages();
      if (!messages.length) addMessage('bot', WELCOME, true);
      else messages.forEach(function (m) { addMessage(m.role === 'user' ? 'user' : 'bot', m.text, true); });
      renderQuick();
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', function(){ window.setTimeout(function(){ resizeCanvas(); clampHostPosition(true); }, 160); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function(){ resizeCanvas(); clampHostPosition(true); }, { passive: true });
    }
    document.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length) { mx = e.touches[0].clientX; my = e.touches[0].clientY; }
    }, { passive: true });

    rw.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);
    rw.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('touchend', dragEnd);
    scene.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); say('idle', 2200); playAn('wave'); }
    });
    scene.addEventListener('click', function (e) {
      if (wasDrag) { wasDrag = false; return; }
      if (e.target && e.target.closest && e.target.closest('.p-head,.p-arm,.p-leg,.p-ant,.p-body')) return;
      say('idle', 2200);
      playAn('wave');
      window.setTimeout(openSupport, 360);
    });
    rw.addEventListener('wheel', function (e) {
      e.preventDefault();
      userRotY += e.deltaY > 0 ? 12 : -12;
      if (rhint) rhint.style.opacity = '0';
    }, { passive: false });

    headH.addEventListener('click', function (e) {
      e.stopPropagation(); if (wasDrag) return;
      markHit('head', 1300);
      hHits++; window.clearTimeout(hHitTO);
      var rect = rw.getBoundingClientRect();
      if (hHits >= 5) {
        clearStates(); r3.classList.add('st-faint', 'a-shake'); stars.classList.add('on'); say('multiHit', 3000); spawnP(rect.left + rect.width / 2, rect.top + 20, '#f59e0b', 16, 'star'); hHits = 0; window.setTimeout(clearStates, 1500);
      } else {
        clearStates(); r3.classList.add(hHits >= 3 ? 'st-angry' : 'st-hurt', 'a-shake'); say('headHit', 2200); spawnP(rect.left + rect.width / 2, rect.top + 20, hHits >= 3 ? '#ef4444' : '#f59e0b', 9); window.setTimeout(clearStates, 700);
      }
      hHitTO = window.setTimeout(function () { hHits = 0; }, 2000);
    });
    alH.addEventListener('click', function (e) { e.stopPropagation(); if (wasDrag) return; markHit('left-arm', 1200); clearStates(); r3.classList.add('hit-al'); say('armHit', 2200); var r = rw.getBoundingClientRect(); spawnP(r.left + 15, r.top + r.height / 2, '#3b82f6', 10); window.setTimeout(clearStates, 760); });
    arH.addEventListener('click', function (e) { e.stopPropagation(); if (wasDrag) return; markHit('right-arm', 1200); clearStates(); r3.classList.add('hit-ar'); say('armHit', 2200); var r = rw.getBoundingClientRect(); spawnP(r.left + r.width - 15, r.top + r.height / 2, '#3b82f6', 10); window.setTimeout(clearStates, 760); });
    antH.addEventListener('click', function (e) { e.stopPropagation(); if (wasDrag) return; markHit('antenna', 1200); clearStates(); r3.classList.add('a-shake'); say('antHit', 2200); var r = antH.getBoundingClientRect(); spawnP(r.left + r.width / 2, r.top, '#22d3ee', 14, 'star'); window.setTimeout(clearStates, 760); });
    [llH, rlH].forEach(function (leg, idx) {
      if (!leg) return;
      leg.addEventListener('click', function (e) {
        e.stopPropagation();
        if (wasDrag) return;
        markHit(idx === 0 ? 'left-leg' : 'right-leg', 1200);
        clearStates();
        say('legHit', 2200);
        playAn(idx === 0 ? 'jump' : 'jelly');
        var r = leg.getBoundingClientRect();
        spawnP(r.left + r.width / 2, r.bottom, '#22d3ee', 9, 'star');
      });
    });
    bodyH.addEventListener('click', function (e) { e.stopPropagation(); if (wasDrag) return; markHit('body', 1000); clearStates(); r3.classList.add('st-happy'); say('bodyClick', 1400); var r = rw.getBoundingClientRect(); spawnP(r.left + r.width / 2, r.top + r.height / 2, '#7c3aed', 12, 'star'); window.setTimeout(function () { clearStates(); openSupport(); }, 420); });

    frHide.addEventListener('click', hideWidget);
    launcher.addEventListener('click', showWidget);
    if (sovBackdrop) sovBackdrop.addEventListener('click', closeSupport);
    spx.addEventListener('click', closeSupport);
    sov.addEventListener('click', function (e) { if (e.target === sov) closeSupport(); });
    ssnd.addEventListener('click', function () { sendMessage(); });
    sinp.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendMessage(); });
    spm.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button[data-m]') : null;
      if (b) sendMessage(b.getAttribute('data-m'));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && supOpen) closeSupport(); });

    function blink() {
      [shadow.querySelector('#eL'), shadow.querySelector('#eR')].forEach(function (e) { if (e) e.style.transform = 'scaleY(0.1)'; });
      window.setTimeout(function () {
        [shadow.querySelector('#eL'), shadow.querySelector('#eR')].forEach(function (e) { if (e) e.style.transform = ''; });
      }, 110);
    }

    function scheduleBlink() {
      window.setTimeout(function () { blink(); scheduleBlink(); }, 2200 + Math.random() * 4500);
    }

    restoreMessages();
    if (isHidden()) launcher.classList.add('on');
    if (!/^\/(sohbet|chat)$/i.test(location.pathname || '')) {
      window.setTimeout(function () { say('welcome', 3600); }, 1600);
    }
    window.setInterval(function () {
      if (!supOpen && !drag && !isAn && !host.classList.contains('fr-hidden')) {
        playAn(Math.random() > 0.5 ? 'wave' : 'jelly');
      }
    }, 18000);
    window.requestAnimationFrame(update3D);
    renderP();
    scheduleBlink();

    setPublicApi({
      openSupport: openSupport,
      closeSupport: closeSupport,
      playAnimation: playAn,
      triggerFaint: doFaint,
      rotateY: function (deg) { userRotY = Number(deg) || userRotY; },
      showMessage: function (msg, dur) {
        stxt.textContent = String(msg || WELCOME);
        speech.classList.add('on');
        window.clearTimeout(spTO);
        spTO = window.setTimeout(function () { speech.classList.remove('on'); }, dur || 4000);
      },
      hide: hideWidget,
      show: showWidget
    });
  }

  function boot() {
    if (/^\/admin/i.test(location.pathname || '')) return;
    var delay = window.matchMedia && window.matchMedia('(max-width: 720px)').matches ? 1100 : 700;
    window.setTimeout(mount, delay);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();






