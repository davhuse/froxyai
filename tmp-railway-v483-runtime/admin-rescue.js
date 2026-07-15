(function(){
  if(window.__froxyAdminRescueV367)return;
  window.__froxyAdminRescueV367=true;

  var ADMIN_VERSION='v367';
  var ADMIN_ROUTE=/^\/admin\/?$/i.test(location.pathname||'')||/[?&](view|screen)=admin\b/i.test(location.search||'');
  var PLAN_FALLBACK={
    free:{name:'Ücretsiz',tokens:100},
    starter:{name:'Başlangıç',tokens:5000},
    popular:{name:'Popüler',tokens:15000},
    pro:{name:'Pro',tokens:50000},
    creator:{name:'Creator',tokens:90000},
    developer:{name:'Developer',tokens:120000},
    power:{name:'Power',tokens:180000},
    agency_start:{name:'Ajans Başlangıç',tokens:250000},
    business:{name:'Kurumsal',tokens:320000},
    enterprise:{name:'Enterprise',tokens:500000}
  };
  var state={ page:1, users:[], statsLoaded:false, activeTab:'dashboard' };

  function root(){ return document.getElementById('v-admin'); }
  function byId(id){ return document.getElementById(id); }
  function q(sel, scope){ return (scope||document).querySelector(sel); }
  function qa(sel, scope){ return Array.from((scope||document).querySelectorAll(sel)); }
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function jsStr(v){
    return String(v==null?'':v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r/g,'').replace(/\n/g,'\\n');
  }
  function fmtDate(v){
    if(!v)return '—';
    try{
      var d=new Date(v);
      if(Number.isNaN(d.getTime()))return String(v);
      return d.toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    }catch(e){ return String(v); }
  }
  function plans(){ return window.PLANS || PLAN_FALLBACK; }
  function normalizePlanId(plan){
    var id=String(plan||'free').trim().toLowerCase();
    if(id==='kurumsal')id='business';
    if(id==='enterprise_plus')id='enterprise';
    return plans()[id]?id:'free';
  }
  function planName(plan){
    var id=normalizePlanId(plan);
    return plans()[id] && plans()[id].name ? plans()[id].name : (plan || 'Ücretsiz');
  }
  function planOptions(selected){
    var current=normalizePlanId(selected);
    return Object.keys(plans()).map(function(id){
      return '<option value="'+esc(id)+'" '+(id===current?'selected':'')+'>'+esc(planName(id))+'</option>';
    }).join('');
  }
  function storeGet(key,fallback){
    try{
      if(window.LS&&typeof window.LS.get==='function')return window.LS.get(key,fallback);
      var raw=localStorage.getItem(key);
      return raw?JSON.parse(raw):fallback;
    }catch(e){ return fallback; }
  }
  function storeSet(key,value){
    try{
      if(window.LS&&typeof window.LS.set==='function'){ window.LS.set(key,value); return; }
      localStorage.setItem(key,JSON.stringify(value));
    }catch(e){}
  }
  function toast(text,type){
    if(typeof window.msg==='function'){ window.msg(text,type||'ok'); return; }
    console[(type==='err'?'error':'log')]('[admin-rescue]',text);
  }
  function currentToken(){
    try{
      return window.authToken || localStorage.getItem('saas_token') || '';
    }catch(e){
      return window.authToken || '';
    }
  }
  function authUser(){
    try{
      return window.authUser || JSON.parse(localStorage.getItem('saas_user')||'null') || null;
    }catch(e){ return window.authUser || null; }
  }
  function apiPath(url){
    if(typeof window.apiUrl==='function')return window.apiUrl(url);
    return url;
  }
  function apiErrorText(data,fallback){
    return (data&&(
      data.error ||
      (data.message&&typeof data.message==='string'&&data.message) ||
      (data.details&&typeof data.details==='string'&&data.details)
    )) || fallback || 'İşlem tamamlanamadı';
  }
  function adminHeaders(json){
    var headers={
      'Accept':'application/json',
      'X-Requested-With':'XMLHttpRequest'
    };
    if(json)headers['Content-Type']='application/json';
    var token=currentToken();
    if(token)headers['Authorization']='Bearer '+token;
    return headers;
  }
  async function adminApiJson(url, options){
    options=options||{};
    var method=options.method||'GET';
    var config={
      method:method,
      headers:adminHeaders(method!=='GET'),
      cache:'no-store',
      credentials:'same-origin'
    };
    if(options.body!=null)config.body=typeof options.body==='string'?options.body:JSON.stringify(options.body);
    try{
      var res=await fetch(apiPath(url),config);
      var text=await res.text();
      var data={};
      try{ data=text?JSON.parse(text):{}; }catch(e){ data=text?{ message:text } : {}; }
      if(res.ok){
        adminSetApiState('api');
      }else if(res.status===401 || res.status===403){
        adminSetApiState('auth', apiErrorText(data,'Admin oturumu gerekli'));
      }
      return { ok:res.ok, status:res.status, data:data };
    }catch(err){
      adminSetApiState('offline','Bağlantı hatası');
      return { ok:false, status:0, data:{ error: err && err.message ? err.message : 'Bağlantı hatası' } };
    }
  }
  function adminSetApiState(mode,detail){
    var strong=byId('admin-api-state');
    var text=mode==='api' ? 'Backend bağlı - admin token doğrulandı' : (detail || 'Backend oturumu gerekli');
    if(strong)strong.textContent=text;
    var card=strong&&strong.closest('.admin-status-card');
    if(card)card.classList.toggle('is-offline',mode!=='api');
    var authMode=byId('st-auth-mode');
    if(authMode)authMode.textContent=mode==='api' ? 'JWT backend doğrulandı' : text;
  }
  function adminTableSkeleton(rows,cols){
    var widths=['w3','w4','w1','w2'];
    var html='';
    for(var r=0;r<rows;r++){
      html+='<tr class="admin-skeleton-row" aria-hidden="true">';
      for(var c=0;c<cols;c++)html+='<td><span class="admin-skeleton-line '+widths[(r+c)%widths.length]+'"></span></td>';
      html+='</tr>';
    }
    return html;
  }
  function adminBlockSkeleton(rows){
    var widths=['w4','w3','w2','w3'];
    var html='<div class="admin-skeleton-block" aria-hidden="true">';
    for(var i=0;i<rows;i++)html+='<span class="admin-skeleton-line '+widths[i%widths.length]+'"></span>';
    return html+'</div>';
  }
  function setTableSkeleton(id,cols,rows){
    var el=byId(id);
    if(el)el.innerHTML=adminTableSkeleton(rows||4,cols||4);
  }
  function setBlockSkeleton(id,rows){
    var el=byId(id);
    if(el)el.innerHTML=adminBlockSkeleton(rows||4);
  }
  function ensureAdminView(){
    var v=root();
    if(!v)return;
    if(ADMIN_ROUTE){
      qa('.v').forEach(function(el){ el.classList.remove('on'); });
      v.classList.add('on');
      document.documentElement.classList.remove('home-mode');
      document.body.classList.remove('home-mode');
      var nav=byId('nav');
      if(nav)nav.style.display='none';
    }
    ensureAdminModals();
  }
  function ensureModal(id,title,bodyHtml){
    var existing=byId(id);
    if(existing)existing.remove();
    var wrapper=document.createElement('div');
    wrapper.id=id;
    wrapper.className='admin-modal';
    wrapper.style.display='none';
    wrapper.innerHTML='<div class="admin-modal-box">'+
      '<h3>'+title+'</h3>'+
      bodyHtml+
    '</div>';
    wrapper.addEventListener('click',function(ev){
      if(ev.target===wrapper)wrapper.style.display='none';
    });
    document.body.appendChild(wrapper);
    return wrapper;
  }
  function ensureAdminModals(){
    ensureModal('credit-modal','Kredi Düzenle',
      '<p id="cm-user-name" class="admin-help"></p>'+
      '<input type="hidden" id="cm-user-id">'+
      '<div class="admin-form-group"><label>Miktar (+ ekle, - çıkar)</label><input type="number" id="cm-amount" class="admin-input" value="500" placeholder="Örn: 500 veya -100"></div>'+
      '<div class="admin-modal-actions"><button class="admin-btn-primary" onclick="applyCredit()">Uygula</button><button class="admin-cancel-btn" onclick="document.getElementById(\'credit-modal\').style.display=\'none\'">İptal</button></div>'
    );
    ensureModal('ban-modal','Yasaklama İşlemi',
      '<p id="bm-user-name" class="admin-help"></p>'+
      '<input type="hidden" id="bm-user-id">'+
      '<div class="admin-form-group"><label>Yasak türü</label><select id="bm-type" class="admin-input"><option value="temp">Süreli yasak</option><option value="permanent">Kalıcı yasak</option></select></div>'+
      '<div class="admin-form-group"><label>Süre (saat)</label><input type="number" id="bm-hours" class="admin-input" value="24"></div>'+
      '<div class="admin-form-group"><label>Sebep</label><textarea id="bm-reason" class="admin-input admin-textarea" rows="3" placeholder="Kısa sebep..."></textarea></div>'+
      '<div class="admin-modal-actions"><button class="admin-btn-primary" onclick="applyBan()">Uygula</button><button class="admin-cancel-btn" onclick="document.getElementById(\'ban-modal\').style.display=\'none\'">İptal</button></div>'
    );
    if(!byId('admin-user-detail-modal')){
      var detail=document.createElement('div');
      detail.id='admin-user-detail-modal';
      detail.className='admin-modal';
      detail.style.display='none';
      detail.addEventListener('click',function(ev){
        if(ev.target===detail)detail.style.display='none';
      });
      document.body.appendChild(detail);
    }
  }
  function renderAdminPagination(pages,current){
    var el=byId('au-pagination');
    if(!el)return;
    pages=Math.max(1,Number(pages||1));
    current=Math.max(1,Number(current||1));
    if(pages<=1){ el.innerHTML=''; return; }
    var html='';
    if(current>1)html+='<button class="admin-page-btn" onclick="loadAdminUsers('+(current-1)+')">Önceki</button>';
    for(var i=1;i<=pages;i++){
      if(i===current)html+='<button class="admin-page-btn active">'+i+'</button>';
      else if(i===1||i===pages||Math.abs(i-current)<=1)html+='<button class="admin-page-btn" onclick="loadAdminUsers('+i+')">'+i+'</button>';
      else if(Math.abs(i-current)===2)html+='<span class="admin-muted">...</span>';
    }
    if(current<pages)html+='<button class="admin-page-btn" onclick="loadAdminUsers('+(current+1)+')">Sonraki</button>';
    el.innerHTML=html;
  }
  function renderRecentUsers(users){
    var tbody=byId('at-recent-tbody');
    if(!tbody)return;
    if(!users || !users.length){
      tbody.innerHTML='<tr><td colspan="5" class="admin-empty">Henüz kullanıcı yok</td></tr>';
      return;
    }
    tbody.innerHTML=users.map(function(u){
      var name=u.username||u.email||'Kullanıcı';
      return '<tr>'+
        '<td><div class="admin-user-cell"><div class="admin-user-ava">'+esc(name.charAt(0).toUpperCase())+'</div><strong>'+esc(name)+'</strong></div></td>'+
        '<td class="admin-muted">'+esc(u.email||'')+'</td>'+
        '<td><strong>'+Number(u.credits||0).toLocaleString('tr-TR')+'</strong></td>'+
        '<td class="admin-muted">'+fmtDate(u.created_at)+'</td>'+
        '<td><button class="admin-action-btn admin-btn-credit" onclick="openCreditModal('+Number(u.id)+',\''+jsStr(name)+'\')">Kredi</button></td>'+
      '</tr>';
    }).join('');
  }
  function updateDbStatusCard(data){
    var grid=q('#at-dashboard .admin-stats-grid');
    if(!grid)return;
    var card=byId('admin-db-status-card');
    if(!card){
      card=document.createElement('div');
      card.id='admin-db-status-card';
      card.className='admin-stat-card admin-db-status-card';
      grid.appendChild(card);
    }
    var db=data&&data.databaseStorage?data.databaseStorage:{};
    var latest=data&&data.latestUser?data.latestUser:null;
    var login=data&&data.latestLogin?data.latestLogin:null;
    card.innerHTML='<div class="admin-stat-value">'+(db.persistent?'Kalıcı DB aktif':'DB kalıcı değil')+'</div>'+
      '<div class="admin-stat-label">'+Number(data&&data.totalUsers||0).toLocaleString('tr-TR')+' kullanıcı</div>'+
      '<div class="admin-stat-sub">'+(db.path?esc(db.path):'DB yolu alınamadı')+'</div>'+
      '<div class="admin-stat-sub">'+(latest?'Son kayıt: '+esc(latest.username||latest.email||'-')+' · '+fmtDate(latest.created_at):'Son kayıt yok')+'</div>'+
      '<div class="admin-stat-sub">'+(login?'Son giriş: '+esc(login.username||login.email||'-')+' · '+fmtDate(login.last_login):'Son giriş yok')+'</div>';
  }
  function renderProviderSummary(){
    var host=byId('admin-provider-list');
    if(!host)return;
    var models=Array.isArray(window.ALL_MODELS)?window.ALL_MODELS:[];
    if(!models.length){
      host.innerHTML='<div class="admin-empty">Model verisi yüklenemedi</div>';
      return;
    }
    var counts={};
    models.forEach(function(model){
      var provider=model.provider||'other';
      counts[provider]=(counts[provider]||0)+1;
    });
    host.innerHTML=Object.keys(counts).sort(function(a,b){ return counts[b]-counts[a]; }).slice(0,8).map(function(provider){
      var label=typeof window.providerLabel==='function' ? window.providerLabel(provider) : provider;
      return '<div class="admin-provider-row"><span>'+esc(label)+'</span><strong>'+Number(counts[provider]||0).toLocaleString('tr-TR')+'</strong></div>';
    }).join('');
    var modelCount=byId('st-model-count');
    if(modelCount){
      var total=typeof window.visibleModelCount==='function' ? window.visibleModelCount() : models.length;
      modelCount.textContent=Number(total||0).toLocaleString('tr-TR')+' model';
    }
  }
  async function loadAdminImageStats(){
    var host=byId('admin-img-stats');
    if(!host)return;
    try{
      var res=await fetch(apiPath('/api/admin/image-stats'),{headers:adminHeaders(false),cache:'no-store',credentials:'same-origin'});
      var data=await res.json().catch(function(){ return {}; });
      if(!res.ok)throw new Error(apiErrorText(data,'Veri alınamadı'));
      host.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:center">'+
        '<div><strong style="font-size:24px;color:#fff">'+Number(data.count||0).toLocaleString('tr-TR')+'</strong><br><small style="color:var(--text3)">Toplam görsel</small></div>'+
        '<div><strong style="font-size:24px;color:#fff">'+esc(String(data.totalSizeMB||0))+' MB</strong><br><small style="color:var(--text3)">Disk</small></div>'+
      '</div>';
    }catch(e){
      host.innerHTML='<div class="admin-empty">Veri alınamadı</div>';
    }
  }
  async function loadAdminSecurityStatus(){
    var host=byId('admin-security-status-card');
    var parent=q('#at-settings .admin-two-col') || byId('at-settings');
    if(!parent)return;
    if(!host){
      host=document.createElement('div');
      host.id='admin-security-status-card';
      host.className='admin-card';
      host.innerHTML='<div class="admin-card-header"><h3>Güvenlik ve Ödeme Durumu</h3></div><div class="admin-card-body" id="admin-security-status-body"><div class="admin-empty">Yükleniyor...</div></div>';
      parent.appendChild(host);
    }
    var body=byId('admin-security-status-body');
    try{
      var api=await adminApiJson('/api/admin/security-status');
      if(!api.ok)throw new Error(apiErrorText(api.data,'Güvenlik durumu alınamadı'));
      var d=api.data||{};
      function row(label,val,ok){
        return '<div class="admin-info-row"><span>'+esc(label)+'</span><strong style="color:'+(ok?'#22c55e':'#f59e0b')+'">'+esc(val)+'</strong></div>';
      }
      body.innerHTML=[
        row('Turnstile',d.turnstile&&d.turnstile.secretConfigured?'Aktif':((d.turnstile&&d.turnstile.required)?'Eksik':'Opsiyonel'), !!(d.turnstile&&d.turnstile.secretConfigured) || !(d.turnstile&&d.turnstile.required)),
        row('OTP',d.otp&&d.otp.enabled?'Aktif':'Kapalı', !!(d.otp&&d.otp.enabled)),
        row('Consent versiyon',d.consent&&d.consent.version?d.consent.version:'-', true),
        row('Dodo API',d.dodo&&d.dodo.apiConfigured?'Hazır':'Env eksik', !!(d.dodo&&d.dodo.apiConfigured)),
        row('Dodo webhook',d.dodo&&d.dodo.webhookConfigured?'İmza aktif':'Secret eksik', !!(d.dodo&&d.dodo.webhookConfigured)),
        row('Shopier yedek',d.shopier&&d.shopier.fallback?'Korunuyor':'Kapalı', !!(d.shopier&&d.shopier.fallback)),
        row('Kalıcı DB',d.database&&d.database.persistent?'Aktif':'Local/ephemeral', !!(d.database&&d.database.persistent))
      ].join('');
    }catch(e){
      body.innerHTML='<div class="admin-empty">'+esc(e.message||'Güvenlik durumu alınamadı')+'</div>';
    }
  }
  async function loadAdminStats(){
    setTableSkeleton('at-recent-tbody',5,4);
    setBlockSkeleton('admin-provider-list',4);
    setBlockSkeleton('admin-health-providers',4);
    setBlockSkeleton('admin-img-stats',2);
    var api=await adminApiJson('/api/admin/stats');
    if(!api.ok){
      var detail=apiErrorText(api.data,'Admin oturumu veya yetkisi doğrulanamadı.');
      ['as-users','as-credits','as-chats','as-docs','as-blocked','as-admins','an-user-count'].forEach(function(id){
        var el=byId(id);
        if(el)el.textContent='—';
      });
      var tbody=byId('at-recent-tbody');
      if(tbody)tbody.innerHTML='<tr><td colspan="5" class="admin-empty admin-error-box">'+esc(detail)+'</td></tr>';
      var provider=byId('admin-provider-list');
      if(provider)provider.innerHTML='<div class="admin-empty admin-error-box">'+esc(detail)+'</div>';
      var health=byId('admin-health-providers');
      if(health)health.innerHTML='<div class="admin-empty admin-error-box">'+esc(detail)+'</div>';
      var img=byId('admin-img-stats');
      if(img)img.innerHTML='<div class="admin-empty admin-error-box">Admin verisi için backend oturumu gerekli.</div>';
      return;
    }
    var d=api.data||{};
    state.statsLoaded=true;
    if(byId('as-users'))byId('as-users').textContent=Number(d.totalUsers||0).toLocaleString('tr-TR');
    if(byId('as-users-today'))byId('as-users-today').textContent='+'+Number(d.newToday||0).toLocaleString('tr-TR')+' bugün';
    if(byId('as-credits'))byId('as-credits').textContent=Number(d.totalCredits||0).toLocaleString('tr-TR');
    if(byId('as-chats'))byId('as-chats').textContent=Number(d.totalChats||0).toLocaleString('tr-TR');
    if(byId('as-docs'))byId('as-docs').textContent=Number(d.totalDocs||0).toLocaleString('tr-TR')+' belge';
    if(byId('as-blocked'))byId('as-blocked').textContent=Number(d.blockedUsers||0).toLocaleString('tr-TR');
    if(byId('as-admins'))byId('as-admins').textContent=Number(d.adminCount||0).toLocaleString('tr-TR')+' admin';
    if(byId('an-user-count'))byId('an-user-count').textContent=Number(d.totalUsers||0).toLocaleString('tr-TR');
    renderRecentUsers(d.recentUsers||[]);
    updateDbStatusCard(d);
    renderProviderSummary();
    loadAdminImageStats();
    var healthProviders=byId('admin-health-providers');
    if(healthProviders && byId('admin-provider-list'))healthProviders.innerHTML=byId('admin-provider-list').innerHTML;
  }
  function userCacheFind(userId){
    return (state.users||[]).find(function(u){ return String(u.id)===String(userId); }) || null;
  }
  function statusBadge(u){
    if(u.is_blocked)return '<span class="admin-badge badge-blocked">Yasaklı</span>';
    if(u.is_admin)return '<span class="admin-badge badge-admin">Admin</span>';
    return '<span class="admin-badge badge-active">Aktif</span>';
  }
  async function loadAdminUsers(page){
    state.page=Number(page||1);
    setTableSkeleton('au-tbody',8,5);
    var search=(byId('au-search') && byId('au-search').value) || '';
    var filter=(byId('au-filter') && byId('au-filter').value) || 'all';
    var params=new URLSearchParams({ search:search, filter:filter, page:String(state.page), limit:'20' });
    var api=await adminApiJson('/api/admin/users?'+params.toString());
    var tbody=byId('au-tbody');
    if(!tbody)return;
    if(!api.ok){
      var detail=apiErrorText(api.data,'Admin oturumu veya yetkisi doğrulanamadı.');
      if(byId('au-total-badge'))byId('au-total-badge').textContent='Backend yetkisi gerekli';
      if(byId('an-user-count'))byId('an-user-count').textContent='!';
      tbody.innerHTML='<tr><td colspan="8" class="admin-empty admin-error-box">'+esc(detail)+'</td></tr>';
      renderAdminPagination(1,1);
      return;
    }
    var d=api.data||{};
    state.users=d.users||[];
    if(byId('au-total-badge'))byId('au-total-badge').textContent=Number(d.total||0).toLocaleString('tr-TR')+' kullanıcı';
    if(byId('an-user-count'))byId('an-user-count').textContent=Number(d.total||0).toLocaleString('tr-TR');
    if(!state.users.length){
      tbody.innerHTML='<tr><td colspan="8" class="admin-empty">Kullanıcı bulunamadı</td></tr>';
      renderAdminPagination(1,1);
      return;
    }
    tbody.innerHTML=state.users.map(function(u){
      var name=u.username||u.email||'Kullanıcı';
      var banNote=u.is_blocked?(u.block_until?'<small class="admin-muted">Süreli: '+esc(fmtDate(u.block_until))+'</small>':'<small class="admin-muted">Kalıcı yasak</small>'):'';
      return '<tr>'+
        '<td><div class="admin-user-cell"><div class="admin-user-ava">'+esc(name.charAt(0).toUpperCase())+'</div><div><strong>'+esc(name)+'</strong><br><span class="admin-muted">ID: '+esc(String(u.id))+'</span></div></div></td>'+
        '<td class="admin-muted">'+esc(u.email||'')+'</td>'+
        '<td><select class="admin-mini-select" onchange="adminChangePlan('+Number(u.id)+',this.value)">'+planOptions(u.plan||'free')+'</select></td>'+
        '<td><strong>'+Number(u.credits||0).toLocaleString('tr-TR')+'</strong></td>'+
        '<td>'+statusBadge(u)+banNote+'</td>'+
        '<td class="admin-muted">'+fmtDate(u.created_at)+'</td>'+
        '<td class="admin-muted">'+fmtDate(u.last_login)+'</td>'+
        '<td><div class="admin-actions">'+
          '<button class="admin-action-btn admin-btn-detail" onclick="openAdminUserDetail('+Number(u.id)+')">Detay</button>'+
          '<button class="admin-action-btn admin-btn-credit" onclick="openCreditModal('+Number(u.id)+',\''+jsStr(name)+'\')">Kredi</button>'+
          (u.is_blocked?
            '<button class="admin-action-btn admin-btn-unblock" onclick="adminBlockUser('+Number(u.id)+',false)">Yasağı aç</button>' :
            '<button class="admin-action-btn admin-btn-block" onclick="openBanModal('+Number(u.id)+',\''+jsStr(name)+'\')">Yasakla</button>'
          )+
          '<button class="admin-action-btn admin-btn-admin" onclick="adminToggleRole('+Number(u.id)+','+(u.is_admin?0:1)+')">'+(u.is_admin?'Yetki al':'Admin yap')+'</button>'+
          '<button class="admin-action-btn admin-btn-delete" onclick="adminDeleteUser('+Number(u.id)+',\''+jsStr(name)+'\')">Sil</button>'+
        '</div></td>'+
      '</tr>';
    }).join('');
    renderAdminPagination(d.pages||1,d.page||1);
  }
  function openCreditModal(userId,username){
    ensureAdminModals();
    byId('cm-user-id').value=String(userId);
    byId('cm-user-name').textContent=(username||'Kullanıcı')+' için kredi düzenle';
    byId('cm-amount').value='500';
    byId('credit-modal').style.display='flex';
  }
  async function applyCredit(){
    var userId=byId('cm-user-id').value;
    var amount=parseInt(byId('cm-amount').value,10);
    if(!userId || Number.isNaN(amount)){
      toast('Geçerli miktar girin','err');
      return;
    }
    var api=await adminApiJson('/api/admin/users/'+encodeURIComponent(userId)+'/credits',{ method:'PUT', body:{ amount:amount } });
    if(!api.ok){
      toast(apiErrorText(api.data,'Kredi güncellenemedi'),'err');
      return;
    }
    byId('credit-modal').style.display='none';
    toast('Kredi güncellendi','ok');
    loadAdminUsers(state.page);
    loadAdminStats();
  }
  async function adminChangePlan(userId,plan){
    plan=normalizePlanId(plan);
    var api=await adminApiJson('/api/admin/users/'+encodeURIComponent(userId)+'/plan',{ method:'PUT', body:{ plan:plan } });
    if(!api.ok){
      toast(apiErrorText(api.data,'Üyelik paketi güncellenemedi'),'err');
      loadAdminUsers(state.page);
      return;
    }
    toast('Üyelik paketi güncellendi: '+planName(plan),'ok');
    loadAdminUsers(state.page);
    loadAdminStats();
  }
  function openBanModal(userId,username){
    ensureAdminModals();
    byId('bm-user-id').value=String(userId);
    byId('bm-user-name').textContent=(username||'Kullanıcı')+' için yasaklama ayarı';
    byId('bm-type').value='temp';
    byId('bm-hours').value='24';
    byId('bm-reason').value='';
    byId('ban-modal').style.display='flex';
  }
  async function applyBan(){
    var userId=byId('bm-user-id').value;
    var type=byId('bm-type').value;
    var hours=Math.max(1,parseInt(byId('bm-hours').value||'24',10));
    var reason=(byId('bm-reason').value||'').trim();
    var permanent=type==='permanent';
    var until=permanent?null:new Date(Date.now()+hours*3600000).toISOString();
    if(!window.confirm(permanent?'Bu kullanıcı kalıcı yasaklanacak. Onaylıyor musunuz?':'Bu kullanıcı süreli yasaklanacak. Onaylıyor musunuz?'))return;
    var api=await adminApiJson('/api/admin/users/'+encodeURIComponent(userId)+'/block',{ method:'PUT', body:{ block:true, permanent:permanent, until:until, reason:reason } });
    if(!api.ok){
      toast(apiErrorText(api.data,'Yasak uygulanamadı'),'err');
      return;
    }
    byId('ban-modal').style.display='none';
    toast(permanent?'Kullanıcı kalıcı yasaklandı':'Kullanıcı süreli yasaklandı','ok');
    loadAdminUsers(state.page);
    loadAdminStats();
  }
  async function adminBlockUser(userId,block){
    if(!window.confirm(block?'Bu kullanıcıyı yasaklamak istiyor musunuz?':'Kullanıcının yasağını kaldırmak istiyor musunuz?'))return;
    var api=await adminApiJson('/api/admin/users/'+encodeURIComponent(userId)+'/block',{ method:'PUT', body:{ block:!!block } });
    if(!api.ok){
      toast(apiErrorText(api.data,block?'Kullanıcı yasaklanamadı':'Yasak kaldırılamadı'),'err');
      return;
    }
    toast(block?'Kullanıcı yasaklandı':'Yasak kaldırıldı','ok');
    loadAdminUsers(state.page);
    loadAdminStats();
  }
  async function adminToggleRole(userId,isAdmin){
    if(!window.confirm(isAdmin?'Bu kullanıcıya admin yetkisi vermek istiyor musunuz?':'Admin yetkisini geri almak istiyor musunuz?'))return;
    var api=await adminApiJson('/api/admin/users/'+encodeURIComponent(userId)+'/role',{ method:'PUT', body:{ is_admin:!!isAdmin } });
    if(!api.ok){
      toast(apiErrorText(api.data,'Rol güncellenemedi'),'err');
      return;
    }
    toast(isAdmin?'Admin yetkisi verildi':'Admin yetkisi alındı','ok');
    loadAdminUsers(state.page);
    loadAdminStats();
  }
  async function adminDeleteUser(userId,username){
    if(!window.confirm('"'+(username||'Kullanıcı')+'" kullanıcısını kalıcı olarak silmek istiyor musunuz?'))return;
    var api=await adminApiJson('/api/admin/users/'+encodeURIComponent(userId),{ method:'DELETE' });
    if(!api.ok){
      toast(apiErrorText(api.data,'Kullanıcı silinemedi'),'err');
      return;
    }
    toast('Kullanıcı silindi','ok');
    loadAdminUsers(state.page);
    loadAdminStats();
  }
  function renderMetric(label,value,accent){
    return '<div class="admin-detail-metric'+(accent?' hot':'')+'"><span>'+esc(label)+'</span><strong>'+esc(String(value))+'</strong></div>';
  }
  function openAdminUserDetail(userId){
    var user=userCacheFind(userId);
    if(!user){
      toast('Kullanıcı bulunamadı','err');
      return;
    }
    var modal=byId('admin-user-detail-modal');
    if(!modal)return;
    var name=user.username||user.email||'Kullanıcı';
    var plan=normalizePlanId(user.plan||'free');
    var status=user.is_blocked?'Yasaklı':(user.is_admin?'Admin':'Aktif');
    var banText=user.is_blocked?(user.block_until?'Süreli yasak: '+fmtDate(user.block_until):'Kalıcı yasak'):'Kısıtlama yok';
    modal.innerHTML='<div class="admin-modal-box admin-user-detail-box">'+
      '<div class="admin-detail-head">'+
        '<div class="admin-user-ava big">'+esc(name.charAt(0).toUpperCase())+'</div>'+
        '<div><h3>'+esc(name)+'</h3><p>'+esc(user.email||'E-posta yok')+'</p></div>'+
        '<button class="admin-icon-close" onclick="document.getElementById(\'admin-user-detail-modal\').style.display=\'none\'">×</button>'+
      '</div>'+
      '<div class="admin-detail-grid">'+
        renderMetric('Üyelik',planName(plan),plan!=='free')+
        renderMetric('Kredi',Number(user.credits||0).toLocaleString('tr-TR'),true)+
        renderMetric('Durum',status,!!user.is_admin)+
        renderMetric('Kayıt',fmtDate(user.created_at))+
      '</div>'+
      '<div class="admin-detail-note"><strong>Ban durumu:</strong> '+esc(banText)+(user.block_reason?'<br><span>'+esc(user.block_reason)+'</span>':'')+'</div>'+
      '<div class="admin-detail-actions">'+
        '<select class="admin-mini-select" onchange="adminChangePlan('+Number(user.id)+',this.value)">'+planOptions(plan)+'</select>'+
        '<button class="admin-action-btn admin-btn-credit" onclick="openCreditModal('+Number(user.id)+',\''+jsStr(name)+'\')">Kredi ekle</button>'+
        (user.is_blocked?
          '<button class="admin-action-btn admin-btn-unblock" onclick="adminBlockUser('+Number(user.id)+',false);document.getElementById(\'admin-user-detail-modal\').style.display=\'none\'">Yasağı aç</button>' :
          '<button class="admin-action-btn admin-btn-block" onclick="openBanModal('+Number(user.id)+',\''+jsStr(name)+'\')">Yasakla</button>'
        )+
        '<button class="admin-action-btn admin-btn-admin" onclick="adminToggleRole('+Number(user.id)+','+(user.is_admin?0:1)+')">'+(user.is_admin?'Yetki al':'Admin yap')+'</button>'+
      '</div>'+
    '</div>';
    modal.style.display='flex';
  }
  async function loadAdminLogs(){
    setTableSkeleton('logs-tbody',4,4);
    var api=await adminApiJson('/api/admin/logs');
    var tbody=byId('logs-tbody');
    if(!tbody)return;
    if(!api.ok){
      tbody.innerHTML='<tr><td colspan="4" class="admin-empty admin-error-box">'+esc(apiErrorText(api.data,'Loglar alınamadı'))+'</td></tr>';
      return;
    }
    var rows=(api.data&&api.data.logs)||[];
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="4" class="admin-empty">Henüz log yok</td></tr>';
      return;
    }
    tbody.innerHTML=rows.map(function(row){
      return '<tr><td class="admin-muted">'+fmtDate(row.created_at)+'</td><td><strong>'+esc(row.username||'Admin')+'</strong></td><td><span class="log-action">'+esc(row.action||'')+'</span></td><td class="admin-muted">'+esc(row.detail||'')+'</td></tr>';
    }).join('');
  }
  async function loadAdminAnnouncements(){
    setBlockSkeleton('ann-list',4);
    var api=await adminApiJson('/api/admin/announce');
    var host=byId('ann-list');
    if(!host)return;
    if(!api.ok){
      host.innerHTML='<div class="admin-empty admin-error-box">'+esc(apiErrorText(api.data,'Duyurular alınamadı'))+'</div>';
      return;
    }
    var rows=(api.data&&api.data.announcements)||[];
    if(!rows.length){
      host.innerHTML='<div class="admin-empty">Henüz duyuru yok</div>';
      return;
    }
    host.innerHTML=rows.map(function(a){
      return '<div class="ann-item type-'+esc(a.type||'info')+'"><div><div class="ann-title">'+esc(a.title||'Duyuru')+'</div><div class="ann-body">'+esc(a.body||'')+'</div><div class="admin-muted" style="margin-top:6px">'+fmtDate(a.created_at)+'</div></div><button class="ann-del-btn" onclick="deleteAnnouncement('+Number(a.id)+')">Sil</button></div>';
    }).join('');
  }
  async function publishAnnouncement(){
    var title=(byId('ann-title')&&byId('ann-title').value||'').trim();
    var body=(byId('ann-body')&&byId('ann-body').value||'').trim();
    var type=(byId('ann-type')&&byId('ann-type').value)||'info';
    if(!title || !body){
      toast('Başlık ve içerik gerekli','err');
      return;
    }
    var api=await adminApiJson('/api/admin/announce',{ method:'POST', body:{ title:title, body:body, type:type } });
    if(!api.ok){
      toast(apiErrorText(api.data,'Duyuru yayınlanamadı'),'err');
      return;
    }
    byId('ann-title').value='';
    byId('ann-body').value='';
    toast('Duyuru yayınlandı','ok');
    loadAdminAnnouncements();
  }
  async function deleteAnnouncement(id){
    var api=await adminApiJson('/api/admin/announce/'+encodeURIComponent(id),{ method:'DELETE' });
    if(!api.ok){
      toast(apiErrorText(api.data,'Duyuru silinemedi'),'err');
      return;
    }
    toast('Duyuru silindi','ok');
    loadAdminAnnouncements();
  }
  function codeStatus(code){
    var expired=code.expires_at && new Date(code.expires_at).getTime()<Date.now();
    var used=Number(code.used_count||0) >= Number(code.max_uses||1);
    var passive=code.is_active===0 || code.is_active===false;
    if(passive)return { label:'Pasif', cls:'passive' };
    if(expired)return { label:'Süresi doldu', cls:'expired' };
    if(used)return { label:'Limit doldu', cls:'used' };
    return { label:'Aktif', cls:'active' };
  }
  async function loadMembershipCodes(){
    setBlockSkeleton('mc-list',4);
    var api=await adminApiJson('/api/admin/membership-codes');
    var host=byId('mc-list');
    if(!host)return;
    if(!api.ok){
      host.innerHTML='<div class="admin-empty admin-error-box">'+esc(apiErrorText(api.data,'Üyelik kodları backend üzerinden alınamadı.'))+'</div>';
      return;
    }
    var rows=(api.data&&api.data.codes)||[];
    if(!rows.length){
      host.innerHTML='<div class="admin-empty">Henüz üyelik kodu yok</div>';
      return;
    }
    host.innerHTML=rows.map(function(code){
      var st=codeStatus(code);
      return '<article class="membership-code-item '+(st.cls==='active'?'':'passive')+'">'+
        '<div class="membership-code-main">'+
          '<div class="membership-code-top"><strong>'+esc(code.code)+'</strong><span class="code-status '+st.cls+'">'+st.label+'</span></div>'+
          '<span>'+esc(planName(code.plan))+' · '+Number(code.credits||0).toLocaleString('tr-TR')+' kredi · '+Number(code.used_count||0)+'/'+Number(code.max_uses||1)+' kullanım</span>'+
          '<small>'+(code.expires_at?'Bitiş: '+fmtDate(code.expires_at):'Süresiz')+'</small>'+
        '</div>'+
        '<div class="membership-code-actions">'+
          '<button class="admin-action-btn admin-btn-detail" onclick="copyMembershipCode(\''+jsStr(String(code.code))+'\')">Kopyala</button>'+
          '<button class="admin-action-btn admin-btn-delete" onclick="disableMembershipCode('+Number(code.id)+')">Pasifleştir</button>'+
        '</div>'+
      '</article>';
    }).join('');
  }
  function createMembershipCode(){
    var plan=normalizePlanId((byId('mc-plan')&&byId('mc-plan').value)||'starter');
    var code=((byId('mc-code')&&byId('mc-code').value)||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'');
    var credits=Math.max(0,parseInt((byId('mc-credits')&&byId('mc-credits').value)||'0',10)||0);
    var maxUses=Math.max(1,parseInt((byId('mc-uses')&&byId('mc-uses').value)||'1',10)||1);
    var expiresDays=Math.max(1,parseInt((byId('mc-days')&&byId('mc-days').value)||'30',10)||30);
    adminApiJson('/api/admin/membership-codes',{ method:'POST', body:{ code:code, plan:plan, credits:credits, max_uses:maxUses, expires_days:expiresDays } }).then(function(api){
      if(!api.ok){
        toast(apiErrorText(api.data,'Kod oluşturulamadı'),'err');
        return;
      }
      if(byId('mc-code'))byId('mc-code').value='';
      toast('Üyelik kodu oluşturuldu: '+((api.data&&api.data.code&&api.data.code.code)||code),'ok');
      loadMembershipCodes();
    });
  }
  function disableMembershipCode(id){
    adminApiJson('/api/admin/membership-codes/'+encodeURIComponent(id),{ method:'DELETE' }).then(function(api){
      if(!api.ok){
        toast(apiErrorText(api.data,'Kod pasifleştirilemedi'),'err');
        return;
      }
      toast('Kod pasifleştirildi','ok');
      loadMembershipCodes();
    });
  }
  function readTickets(){
    var tickets=storeGet('ap_tickets',[]);
    return Array.isArray(tickets)?tickets:[];
  }
  function writeTickets(tickets){
    storeSet('ap_tickets',tickets);
  }
  function renderAdminTickets(){
    var host=byId('admin-tickets-list');
    if(!host)return;
    var filter=(byId('ticket-filter')&&byId('ticket-filter').value)||'all';
    var all=readTickets();
    var badge=byId('admin-ticket-count');
    if(badge)badge.textContent=all.filter(function(ticket){
      var status=String(ticket&&ticket.status||'open');
      return status==='open' || status==='waiting_support';
    }).length;
    var tickets=filter==='all'?all:all.filter(function(ticket){
      return String(ticket&&ticket.status||'open')===filter;
    });
    if(!tickets.length){
      host.innerHTML='<div class="admin-empty">Bilet yok</div>';
      return;
    }
    var labels={ open:'Açık', waiting_support:'Yanıt bekliyor', answered:'Yanıtlandı', closed:'Kapalı' };
    var priorities={ low:'Düşük', medium:'Orta', high:'Yüksek' };
    host.innerHTML=tickets.map(function(ticket){
      ticket=ticket||{};
      var index=all.findIndex(function(row){ return String(row&&row.id)===String(ticket.id); });
      var responses=(ticket.responses||[]).filter(function(resp){ return resp && resp.text; });
      return '<article class="admin-ticket-card">'+
        '<div class="admin-ticket-head"><div><strong>'+esc(ticket.title||'Destek talebi')+'</strong><span>'+esc(ticket.userName||ticket.userEmail||'Kullanıcı')+' · '+esc(priorities[ticket.priority]||'Düşük')+'</span></div><em class="tk-badge '+(ticket.status==='closed'?'tk-closed':ticket.status==='answered'?'tk-answered':'tk-open')+'">'+esc(labels[ticket.status]||'Açık')+'</em></div>'+
        '<p>'+esc(ticket.description||'')+'</p>'+
        (responses.length?'<div class="admin-ticket-thread">'+responses.map(function(resp){ return '<div class="'+(resp.by==='user'?'user':'support')+'"><b>'+(resp.by==='user'?'Kullanıcı':'Destek')+'</b><span>'+esc(resp.text)+'</span></div>'; }).join('')+'</div>':'')+
        '<div class="admin-ticket-reply"><input id="reply-'+esc(ticket.id)+'" type="text" placeholder="Kullanıcıya yanıt yaz..."><button class="admin-action-btn admin-btn-unblock" onclick="replyTicket('+index+')">Yanıtla</button><button class="admin-action-btn admin-btn-admin" onclick="closeTicket('+index+')">Kapat</button><button class="admin-action-btn admin-btn-delete" onclick="deleteTicket('+index+')">Sil</button></div>'+
      '</article>';
    }).join('');
  }
  function replyTicket(index){
    var tickets=readTickets();
    if(!tickets[index])return;
    var input=byId('reply-'+tickets[index].id);
    var text=(input&&input.value||'').trim();
    if(!text){
      toast('Yanıt yazın','err');
      return;
    }
    if(!Array.isArray(tickets[index].responses))tickets[index].responses=[];
    tickets[index].responses.push({ by:'support', text:text, date:new Date().toISOString() });
    tickets[index].status='answered';
    writeTickets(tickets);
    renderAdminTickets();
    toast('Yanıt gönderildi','ok');
  }
  function closeTicket(index){
    var tickets=readTickets();
    if(!tickets[index])return;
    tickets[index].status='closed';
    writeTickets(tickets);
    renderAdminTickets();
    toast('Bilet kapatıldı','ok');
  }
  function deleteTicket(index){
    var tickets=readTickets();
    if(!tickets[index])return;
    tickets.splice(index,1);
    writeTickets(tickets);
    renderAdminTickets();
    toast('Bilet silindi','ok');
  }
  function allModels(){
    return Array.isArray(window.ALL_MODELS)?window.ALL_MODELS:[];
  }
  function enabledModels(){
    var list=window.enabledModels;
    if(Array.isArray(list) && list.length)return list.slice();
    var stored=storeGet('ap_models',[]);
    return Array.isArray(stored)?stored.slice():allModels().map(function(m){ return m.id; });
  }
  function saveEnabledModels(next){
    window.enabledModels=next.slice();
    storeSet('ap_models',next);
    if(typeof window.renderModelSelect==='function'){
      try{ window.renderModelSelect(); }catch(e){}
    }
  }
  function renderAdminModels(){
    var grid=byId('admin-model-grid');
    if(!grid)return;
    var models=allModels();
    if(!models.length){
      grid.innerHTML='<div class="admin-empty">Model kataloğu yüklenemedi</div>';
      return;
    }
    var search=((byId('adm-model-search')&&byId('adm-model-search').value)||'').toLowerCase();
    var filter=(byId('adm-model-filter')&&byId('adm-model-filter').value)||'all';
    var rows=models.filter(function(model){
      if(search){
        var hay=(model.name||'')+' '+(model.id||'')+' '+(model.provider||'');
        if(hay.toLowerCase().indexOf(search)===-1)return false;
      }
      if(filter!=='all' && String(model.tier||'enterprise')!==filter)return false;
      return true;
    });
    var providers=new Set(models.map(function(model){ return model.provider||'other'; }));
    if(byId('adm-model-total'))byId('adm-model-total').textContent=Number(models.length).toLocaleString('tr-TR');
    if(byId('adm-model-enabled'))byId('adm-model-enabled').textContent=Number(enabledModels().length).toLocaleString('tr-TR');
    if(byId('adm-model-free'))byId('adm-model-free').textContent=Number(models.filter(function(model){ return model.tier==='free'; }).length).toLocaleString('tr-TR');
    if(byId('adm-model-providers'))byId('adm-model-providers').textContent=Number(providers.size).toLocaleString('tr-TR');
    var enabledSet=new Set(enabledModels());
    grid.innerHTML=rows.slice(0,500).map(function(model){
      var provider=typeof window.providerLabel==='function'?window.providerLabel(model.provider||'openrouter'):(model.provider||'other');
      return '<button class="admin-model-card '+(enabledSet.has(model.id)?'on':'')+'" onclick="toggleAdminModel(\''+jsStr(String(model.id))+'\')"><strong>'+esc(model.name||model.id)+'</strong><span>'+esc(provider)+' · '+esc(model.tier||'enterprise')+'</span></button>';
    }).join('');
  }
  function toggleAdminModel(id){
    var list=enabledModels();
    var next=list.indexOf(id)>=0 ? list.filter(function(item){ return item!==id; }) : list.concat([id]);
    saveEnabledModels(next);
    renderAdminModels();
    toast('Model listesi güncellendi','ok');
  }
  function adminEnableAllModels(){
    saveEnabledModels(allModels().map(function(model){ return model.id; }));
    renderAdminModels();
    toast('Tüm modeller aktif edildi','ok');
  }
  async function makeAdminByEmail(){
    var email=(byId('st-admin-email')&&byId('st-admin-email').value||'').trim();
    var secret=(byId('st-admin-secret')&&byId('st-admin-secret').value||'').trim();
    var msgEl=byId('st-admin-msg');
    if(!email || !secret){
      toast('E-posta ve secret gerekli','err');
      return;
    }
    var api=await adminApiJson('/api/admin/make-admin-by-email',{ method:'POST', body:{ email:email, secret:secret } });
    var text=api.ok ? (email+' admin yapıldı') : apiErrorText(api.data,'Kullanıcı bulunamadı veya backend bağlı değil');
    if(msgEl){
      msgEl.style.display='block';
      msgEl.textContent=text;
      msgEl.style.color=api.ok?'#22c55e':'#ef4444';
    }
    toast(text, api.ok?'ok':'err');
    if(api.ok){
      loadAdminUsers(state.page);
      loadAdminStats();
    }
  }
  function activeTabName(){
    var active=q('#v-admin .admin-tab.active');
    return active ? String(active.id||'at-dashboard').replace(/^at-/,'') : (state.activeTab||'dashboard');
  }
  function activateTab(tab){
    state.activeTab=tab||'dashboard';
    qa('#v-admin .admin-tab').forEach(function(el){ el.classList.remove('active'); });
    qa('#v-admin .admin-nav-item').forEach(function(el){ el.classList.remove('active'); });
    var tabEl=byId('at-'+state.activeTab);
    var navEl=byId('an-'+state.activeTab);
    if(tabEl)tabEl.classList.add('active');
    if(navEl)navEl.classList.add('active');
  }
  function loadForTab(tab){
    if(tab==='dashboard')loadAdminStats();
    else if(tab==='users')loadAdminUsers(1);
    else if(tab==='codes')loadMembershipCodes();
    else if(tab==='support')renderAdminTickets();
    else if(tab==='models')renderAdminModels();
    else if(tab==='announce')loadAdminAnnouncements();
    else if(tab==='logs')loadAdminLogs();
    else if(tab==='settings'){
      renderProviderSummary();
      loadAdminSecurityStatus();
    }
  }
  function adminTab(tab){
    ensureAdminView();
    activateTab(tab||'dashboard');
    loadForTab(state.activeTab);
  }
  function hydrateCurrentTab(){
    adminTab(activeTabName());
  }
  function expose(){
    window.ensureAdminShell=ensureAdminView;
    window.adminTab=adminTab;
    window.updAdmin=function(){ adminTab('dashboard'); };
    window.loadAdminStats=loadAdminStats;
    window.loadAdminUsers=loadAdminUsers;
    window.openCreditModal=openCreditModal;
    window.applyCredit=applyCredit;
    window.openBanModal=openBanModal;
    window.applyBan=applyBan;
    window.adminChangePlan=adminChangePlan;
    window.adminBlockUser=adminBlockUser;
    window.adminToggleRole=adminToggleRole;
    window.adminDeleteUser=adminDeleteUser;
    window.openAdminUserDetail=openAdminUserDetail;
    window.loadAdminLogs=loadAdminLogs;
    window.loadAdminAnnouncements=loadAdminAnnouncements;
    window.publishAnnouncement=publishAnnouncement;
    window.deleteAnnouncement=deleteAnnouncement;
    window.loadMembershipCodes=loadMembershipCodes;
    window.createMembershipCode=createMembershipCode;
    window.disableMembershipCode=disableMembershipCode;
    window.copyMembershipCode=function(code){
      navigator.clipboard&&navigator.clipboard.writeText(String(code||'')).then(function(){
        toast('Kod kopyalandı','ok');
      }).catch(function(){ toast('Kopyalanamadı','err'); });
    };
    window.renderAdminTickets=renderAdminTickets;
    window.replyTicket=replyTicket;
    window.closeTicket=closeTicket;
    window.deleteTicket=deleteTicket;
    window.renderAdminModels=renderAdminModels;
    window.toggleAdminModel=toggleAdminModel;
    window.adminEnableAllModels=adminEnableAllModels;
    window.makeAdminByEmail=makeAdminByEmail;
  }
  function boot(){
    expose();
    ensureAdminView();
    if(!root())return;
    if(!root().dataset.rescueBooted){
      root().dataset.rescueBooted=ADMIN_VERSION;
      hydrateCurrentTab();
    }else if(ADMIN_ROUTE){
      ensureAdminView();
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else setTimeout(boot,0);
  setTimeout(boot,300);
  setTimeout(boot,1200);
  setTimeout(hydrateCurrentTab,1800);
  setInterval(function(){
    expose();
    if(ADMIN_ROUTE || (root() && root().classList.contains('on'))){
      ensureAdminView();
    }
  },1200);
})();
