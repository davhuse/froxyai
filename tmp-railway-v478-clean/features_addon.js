
// ═══════════════════════════════════════════════════════
// 🎯 GÜNLÜK GÖREVLER SİSTEMİ
// ═══════════════════════════════════════════════════════
const DAILY_TASKS = [
  { id:'chat3',    label:'3 Sohbet Başlat',          icon:'💬', reward:100, target:3,  type:'chats'    },
  { id:'msg10',    label:'10 Mesaj Gönder',           icon:'✉️', reward:150, target:10, type:'messages' },
  { id:'img1',     label:'1 Görsel Üret',             icon:'🎨', reward:150, target:1,  type:'images'   },
  { id:'model3',   label:'3 Farklı Model Kullan',     icon:'🤖', reward:100, target:3,  type:'models'   },
  { id:'login',    label:'Günlük Giriş',              icon:'🔥', reward:50,  target:1,  type:'login'    },
];

function getTodayKey() { return 'tasks_' + new Date().toISOString().slice(0,10); }

function initTasks() {
  const key = getTodayKey();
  const state = LS.get(key, { progress:{}, claimed:{} });
  // Auto-progress login task
  if (!state.progress['login']) { state.progress['login'] = 1; LS.set(key, state); }
  renderTasks();
  updateTasksBadge();
}

function renderTasks() {
  const list = document.getElementById('tasks-list');
  if (!list) return;
  const key = getTodayKey();
  const state = LS.get(key, { progress:{}, claimed:{} });
  let totalEarned = 0;
  const totalMax = 550;
  DAILY_TASKS.forEach(t => { if (state.claimed[t.id]) totalEarned += t.reward; });
  const pct = Math.min(100, Math.round(totalEarned / totalMax * 100));
  const bar = document.getElementById('tasks-progress-bar');
  const earned = document.getElementById('tasks-earned-today');
  if (bar) bar.style.width = pct + '%';
  if (earned) earned.textContent = totalEarned + ' / ' + totalMax + ' kredi';

  list.innerHTML = DAILY_TASKS.map(t => {
    const prog = state.progress[t.id] || 0;
    const done = prog >= t.target;
    const claimed = state.claimed[t.id];
    const pctBar = Math.min(100, Math.round(prog / t.target * 100));
    return `<div class="task-card ${claimed ? 'task-done' : ''}">
      <div class="task-icon">${t.icon}</div>
      <div class="task-body">
        <div class="task-title">${t.label}</div>
        <div class="task-bar-wrap"><div class="task-bar-fill" style="width:${pctBar}%"></div></div>
        <div class="task-meta">${prog}/${t.target} tamamlandı &nbsp;·&nbsp; <span style="color:#fbbf24;font-weight:600">+${t.reward} kredi</span></div>
      </div>
      <div class="task-action">
        ${claimed
          ? '<span class="task-claimed">✅ Alındı</span>'
          : done
            ? `<button class="btn btn-primary btn-sm" onclick="claimTask('${t.id}')">Talep Et</button>`
            : `<span class="task-pct">${pctBar}%</span>`
        }
      </div>
    </div>`;
  }).join('');

  // Streak dots
  const dotsEl = document.getElementById('tasks-streak-dots');
  const infoEl = document.getElementById('tasks-streak-info');
  const streak = LS.get('login_streak', { count:0, lastDate:'' });
  if (dotsEl) {
    dotsEl.innerHTML = [1,2,3,4,5,6,7].map(d => {
      const active = d <= (streak.count % 7 || (streak.count >= 7 ? 7 : 0));
      return `<div style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;${active ? 'background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;box-shadow:0 0 10px rgba(245,158,11,.4);' : 'background:var(--bg);color:var(--text3);border:1px solid var(--border);'}">${d}</div>`;
    }).join('');
  }
  if (infoEl) infoEl.textContent = '🔥 Seri: ' + streak.count + ' gün  |  Toplam kazanılan: ' + LS.get('streak_total', 0) + ' kredi';

  // Update dashboard quick action
  const dr = document.getElementById('dash-tasks-remaining');
  const unclaimed = DAILY_TASKS.filter(t => !state.claimed[t.id] && (state.progress[t.id]||0) >= t.target).length;
  if (dr) dr.textContent = unclaimed > 0 ? unclaimed + ' görev seni bekliyor!' : totalEarned + ' kredi kazanıldı bugün';
}

function claimTask(taskId) {
  const key = getTodayKey();
  const state = LS.get(key, { progress:{}, claimed:{} });
  const task = DAILY_TASKS.find(t => t.id === taskId);
  if (!task || state.claimed[taskId]) return;
  if ((state.progress[taskId]||0) < task.target) return;
  state.claimed[taskId] = true;
  LS.set(key, state);
  if (user) { user.tokens = (user.tokens||0) + task.reward; LS.set('ap_user', user); if(typeof updateDash==='function') updateDash(); }
  if(typeof msg==='function') msg('🎉 +' + task.reward + ' kredi kazandın! ' + task.label, 'ok');
  renderTasks();
  updateTasksBadge();
}

function trackTask(type, amount) {
  amount = amount || 1;
  const key = getTodayKey();
  const state = LS.get(key, { progress:{}, claimed:{} });
  DAILY_TASKS.forEach(t => {
    if (t.type === type && !state.claimed[t.id]) {
      state.progress[t.id] = (state.progress[t.id]||0) + amount;
    }
  });
  LS.set(key, state);
  updateTasksBadge();
  // Re-render tasks tab if visible
  if (document.getElementById('ptab-tasks')?.classList.contains('on')) renderTasks();
}

function updateTasksBadge() {
  const key = getTodayKey();
  const state = LS.get(key, { progress:{}, claimed:{} });
  const badge = document.getElementById('tasks-badge');
  const unclaimed = DAILY_TASKS.filter(t => !state.claimed[t.id] && (state.progress[t.id]||0) >= t.target).length;
  if (badge) { badge.style.display = unclaimed > 0 ? 'inline' : 'none'; badge.textContent = unclaimed; }
}

// ═══════════════════════════════════════════════════════
// 🧠 AI HAFIZA SİSTEMİ
// ═══════════════════════════════════════════════════════
function initMemory() { renderMemory(); }

function addMemory() {
  const inp = document.getElementById('mem-input');
  if (!inp || !inp.value.trim()) { if(typeof msg==='function') msg('Lütfen bir şeyler yazın!', 'error'); return; }
  const mems = LS.get('ap_memory', []);
  mems.push({ id: Date.now(), text: inp.value.trim(), created: new Date().toLocaleDateString('tr-TR') });
  LS.set('ap_memory', mems);
  inp.value = '';
  renderMemory();
  if(typeof msg==='function') msg('🧠 Hafıza eklendi! AI artık bunu hatırlayacak.', 'ok');
}

function deleteMemory(id) {
  const mems = LS.get('ap_memory', []).filter(m => m.id !== id);
  LS.set('ap_memory', mems);
  renderMemory();
}

function clearAllMemory() {
  if (!confirm('Tüm hafızaları silmek istediğine emin misin?')) return;
  LS.del('ap_memory');
  renderMemory();
  if(typeof msg==='function') msg('🗑️ Tüm hafızalar silindi.', 'info');
}

function renderMemory() {
  const list = document.getElementById('mem-list');
  const count = document.getElementById('mem-count');
  if (!list) return;
  const mems = LS.get('ap_memory', []);
  if (count) count.textContent = mems.length;
  if (mems.length === 0) {
    list.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center;padding:20px 0">Henüz hafıza yok. AI seni tanımıyor! 🤷<br><small style="display:block;margin-top:6px">Yukarıdan bilgi ekle, AI her sohbette hatırlasın.</small></p>';
    return;
  }
  const e = typeof esc === 'function' ? esc : (t => t.replace(/</g,'&lt;').replace(/>/g,'&gt;'));
  list.innerHTML = mems.map(m => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:var(--bg);border:1px solid var(--border);border-radius:10px;transition:.2s" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="font-size:20px;margin-top:2px;flex-shrink:0">🧠</div>
      <div style="flex:1">
        <div style="font-size:13px;color:var(--text);line-height:1.6">${e(m.text)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">📅 ${m.created}</div>
      </div>
      <button onclick="deleteMemory(${m.id})" style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:16px;transition:0.2s;padding:2px 4px;border-radius:4px;flex-shrink:0" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text3)'">✕</button>
    </div>`).join('');
}

function getMemoryContext() {
  const mems = LS.get('ap_memory', []);
  if (mems.length === 0) return '';
  return '\n\n[KULLANICI HAKKINDA HAFIZA]:\n' + mems.map((m,i) => (i+1)+'. '+m.text).join('\n') + '\n[/HAFIZA]\nBu bilgileri kullanarak kullanıcıya kişiselleştirilmiş yanıtlar ver.';
}

// ═══════════════════════════════════════════════════════
// 🎬 VİDEO ÜRETİCİ
// ═══════════════════════════════════════════════════════
async function generateVideo() {
  const promptEl = document.getElementById('vid-prompt');
  const modelEl  = document.getElementById('vid-model');
  const btn      = document.getElementById('vid-btn');
  const result   = document.getElementById('vid-result');
  const player   = document.getElementById('vid-player');
  const dlBtn    = document.getElementById('vid-download');

  if (!promptEl || !promptEl.value.trim()) {
    if(typeof msg==='function') msg('Lütfen bir video açıklaması girin!', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Video üretiliyor... (30-90 sn)';
  if (result) result.style.display = 'none';

  const prompt = promptEl.value.trim();
  const model  = modelEl?.value || 'animatediff';
  const vidUrl = `https://video.pollinations.ai/${encodeURIComponent(prompt)}?model=${model}&nologo=true`;

  try {
    if (player) { player.src = vidUrl; player.load(); }
    if (dlBtn)  dlBtn.href = vidUrl;
    if (result) result.style.display = 'block';
    if (typeof trackTask === 'function') trackTask('images', 1);
    if(typeof msg==='function') msg('🎬 Video yükleniyor, lütfen bekleyin...', 'info');
  } catch(e) {
    if(typeof msg==='function') msg('Video yüklenirken hata oluştu: ' + e.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = '🎬 Video Üret';
}
