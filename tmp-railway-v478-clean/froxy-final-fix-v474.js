(function(){
  if(window.__froxyFinalFixV474)return;
  window.__froxyFinalFixV474=true;
  var VERSION='v474';
  function safe(fn){try{return fn&&fn()}catch(e){}}
  function textMap(s){
    if(!s)return s;
    return String(s)
      .replace(/Satğn Al|SatÄ±n Al|SatÄŸn Al|SatÄƒn Al/g,'Satın Al')
      .replace(/GiriÅŸ|Giriş/g,'Giriş')
      .replace(/Ã‡Ä±kÄ±ÅŸ|Çıkış/g,'Çıkış')
      .replace(/Ãœcretsiz|Ãœcretsiz|Ücretsiz/g,'Ücretsiz')
      .replace(/Ã–zellikler|Özellikler/g,'Özellikler')
      .replace(/FiyatlandÄ±rma|Fiyatlandırma/g,'Fiyatlandırma')
      .replace(/GÃ¼ven|Güven/g,'Güven')
      .replace(/TÃ¼rkiye|Türkiye/g,'Türkiye')
      .replace(/Ã§alÄ±ÅŸma|çalışma/g,'çalışma')
      .replace(/Ã§alÄ±ÅŸma alanÄ±|çalışma alanı/g,'çalışma alanı')
      .replace(/GÃ¶rsel|Görsel/g,'Görsel')
      .replace(/Ã¼retim|üretim/g,'üretim')
      .replace(/Ã¼ret|üret/g,'üret')
      .replace(/Ã¼yeler|üyeler/g,'üyeler')
      .replace(/baÅŸlangÄ±Ã§|başlangıç/g,'başlangıç')
      .replace(/baÅŸlangıç|başlangıç/g,'başlangıç')
      .replace(/baÅŸlar|başlar/g,'başlar')
      .replace(/BaÅŸlangÄ±Ã§|Başlangıç/g,'Başlangıç')
      .replace(/BaÅŸla|Başla/g,'Başla')
      .replace(/BaÅŸlat|Başlat/g,'Başlat')
      .replace(/hazÄ±r|hazır/g,'hazır')
      .replace(/HazÄ±r|Hazır/g,'Hazır')
      .replace(/ArayÃ¼z|Arayüz/g,'Arayüz')
      .replace(/kredisi|kredisi/g,'kredisi')
      .replace(/Kredi bazlÄ± kullanÄ±m|Kredi bazlı kullanım/g,'Kredi bazlı kullanım')
      .replace(/GÃ¼venli Ã¶deme|Güvenli ödeme/g,'Güvenli ödeme')
      .replace(/Ä°htiyacÄ±na gÃ¶re seÃ§|İhtiyacına göre seç/g,'İhtiyacına göre seç')
      .replace(/BaÅŸlangÄ±Ã§/g,'Başlangıç')
      .replace(/PopÃ¼ler/g,'Popüler')
      .replace(/GeliÅŸtirici/g,'Geliştirici')
      .replace(/Ä°ÅŸletme/g,'İşletme')
      .replace(/Ãœretici/g,'Üretici')
      .replace(/KiÅŸisel|Bireysel/g,'Bireysel')
      .replace(/Her paket/g,'Her paket')
      .replace(/Ã§alÄ±ÅŸtÄ±r/g,'çalıştır')
      .replace(/Ã‡alÄ±ÅŸtÄ±r/g,'Çalıştır')
      .replace(/Ã‡alÄ±ÅŸ/g,'Çalış')
      .replace(/Ã‡evirmen/g,'Çevirmen')
      .replace(/Ã–zetleyici/g,'Özetleyici')
      .replace(/Ä°Ã§erik/g,'İçerik')
      .replace(/Ä°ÅŸ/g,'İş')
      .replace(/Ä°leti/g,'İleti')
      .replace(/KullanÄ±cÄ±/g,'Kullanıcı')
      .replace(/AyarlarÄ±/g,'Ayarları')
      .replace(/Ä°ÅŸlem/g,'İşlem')
      .replace(/Ä°Ã§erik/g,'İçerik')
      .replace(/DÃ¼zenle/g,'Düzenle')
      .replace(/Ã–rn/g,'Örn')
      .replace(/Ä°ptal/g,'İptal')
      .replace(/Ã—/g,'×')
      .replace(/ĞĞ+/g,'')
      .replace(/â˜…/g,'★')
      .replace(/â˜†/g,'☆')
      .replace(/â€¢|Â·/g,'·')
      .replace(/â€”/g,'—')
      .replace(/â–¶/g,'▶')
      .replace(/ğŸ[\s\S]?/g,'');
  }
  function repairTextNode(node){
    var next=textMap(node.nodeValue);
    if(next!==node.nodeValue)node.nodeValue=next;
  }
  function repairVisibleText(root){
    root=root||document.body;
    if(!root)return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
      if(!n.nodeValue||!/Satğ|Ã|Ä|Å|â|Â|ğŸ|Görsel Üret|görsel Üret|Üretim|Üretildi|ĞĞ/.test(n.nodeValue))return NodeFilter.FILTER_REJECT;
      var p=n.parentElement;
      if(!p||/^(SCRIPT|STYLE|TEXTAREA|INPUT)$/i.test(p.tagName))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    var nodes=[];
    while(walker.nextNode()&&nodes.length<900)nodes.push(walker.currentNode);
    nodes.forEach(repairTextNode);
    document.querySelectorAll('input[placeholder],textarea[placeholder],[title],[aria-label]').forEach(function(el){
      ['placeholder','title','aria-label'].forEach(function(a){var v=el.getAttribute(a);var n=textMap(v);if(v&&n!==v)el.setAttribute(a,n)});
    });
  }
  function repairHomeBlackScreen(){
    if(!/^\/$/.test(location.pathname||'/')&&!/[?&](view|screen)=home\b/i.test(location.search||''))return;
    document.documentElement.classList.remove('app-route-prepaint','prepaint-admin','prepaint-chat','prepaint-img','app-route-load-failed');
    document.body&&document.body.classList.remove('admin-route-v434','image-perf-route-v434','model-picker-open','sidebar-open');
    document.querySelectorAll('.v').forEach(function(v){v.classList.remove('on')});
    var home=document.getElementById('v-home');
    if(home)home.classList.add('on');
    var nav=document.getElementById('nav');
    if(nav)nav.style.display='none';
    var sk=document.getElementById('app-route-skeleton');
    if(sk)sk.style.display='none';
    var splash=document.getElementById('froxy-splash');
    if(splash){splash.classList.add('is-hidden');splash.style.display='none'}
    document.documentElement.classList.add('app-ready');
  }
  function goHomeV474(){
    try{history.pushState(null,'','/')}catch(e){}
    repairHomeBlackScreen();
    repairVisibleText(document.body);
    window.scrollTo({top:0,behavior:'instant'});
    return false;
  }
  var previousGo=window.go;
  window.go=function(view){
    var v=String(view||'').toLowerCase();
    if(v==='home'||v==='landing'||v==='anasayfa'||v==='/')return goHomeV474();
    if(typeof previousGo==='function')return previousGo.apply(this,arguments);
  };
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a[href="/"],a[href="?view=home"],.ah-brand');
    if(a){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();goHomeV474();return false}
  },true);
  function normalizeDisplayText(s){
    return textMap(String(s||''))
      .replace(/ĞĞ+/g,'')
      .replace(/Görsel Üret/g,'Görsel üret')
      .replace(/görsel Üret/g,'görsel üret')
      .replace(/Görsel Üretim/g,'Görsel üretim')
      .replace(/görsel Üretim/g,'görsel üretim')
      .replace(/Görsel Üretildi/g,'Görsel üretildi')
      .replace(/görsel Üretildi/g,'görsel üretildi')
      .replace(/Sohbet \+ görsel Üretim/g,'Sohbet + görsel üretim');
  }
  function cleanPromptText(s){return normalizeDisplayText(s).replace(/[\uFFFD]/g,'').replace(/\s+\n/g,'\n').trim()}
  function putChatCleanV474(prompt){
    prompt=cleanPromptText(prompt);
    var input=document.getElementById('chat-in')||document.getElementById('msg')||document.getElementById('chat-input')||document.querySelector('textarea.chat-input,textarea[placeholder*="mesaj" i],textarea[placeholder*="Mesaj" i]');
    if(input){input.value=prompt;input.dispatchEvent(new Event('input',{bubbles:true}));try{panelTab&&panelTab('chat')}catch(e){} input.focus();return true}
    try{if(typeof putChat==='function'){putChat(prompt);return true}}catch(e){}
    return false;
  }
  var oldUseAITool=window.useAITool;
  window.useAITool=function(id){
    if(typeof oldUseAITool==='function'){
      var before=document.querySelector('#chat-in,#msg,#chat-input,textarea.chat-input');
      var out=oldUseAITool.apply(this,arguments);
      setTimeout(function(){var inp=document.querySelector('#chat-in,#msg,#chat-input,textarea.chat-input');if(inp&&inp.value)inp.value=cleanPromptText(inp.value)},80);
      return out;
    }
  };
  var oldUsePrompt=window.usePrompt;
  window.usePrompt=function(p){return putChatCleanV474(p)};
  ['useProPrompt','usePromptFromLibraryV396','usePromptFromHeroV396'].forEach(function(name){
    var old=window[name];
    if(typeof old==='function')window[name]=function(){var out=old.apply(this,arguments);setTimeout(function(){var inp=document.querySelector('#chat-in,#msg,#chat-input,textarea.chat-input');if(inp&&inp.value)inp.value=cleanPromptText(inp.value)},80);return out};
  });
  function providerFor(id,label,group){
    var t=[id,label,group].join(' ').toLowerCase();
    if(/gpt|openai|oss/.test(t))return 'openai';
    if(/claude|anthropic/.test(t))return 'claude';
    if(/gemini|google/.test(t))return 'gemini';
    if(/llama|meta/.test(t))return 'llama';
    if(/deepseek/.test(t))return 'deepseek';
    if(/openrouter|venice/.test(t))return 'openrouter';
    if(/pollinations/.test(t))return 'pollinations';
    if(/groq/.test(t))return 'groq';
    return 'generic';
  }
  function logo(provider){
    var p=provider==='llama'?'meta':provider;
    var svg='';
    try{svg=providerBrandIconSvg&&providerBrandIconSvg(p)}catch(e){}
    if(provider==='llama'&&!svg)svg='<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" d="M4 15.5c1.2-5 3.25-7.5 5.65-7.5 1.68 0 3.08 1.46 4.48 3.35C15.42 13.1 16.7 15 18.6 15c1.48 0 2.4-1.08 2.4-2.58C21 10.7 19.75 9 18.1 9c-2.55 0-4.98 4.05-6.2 5.7C10.58 12.9 8.72 9 5.95 9 4.25 9 3 10.62 3 12.5c0 1.78 1.1 3 2.62 3 2.05 0 3.28-2.05 4.35-3.66"/></svg>';
    if(!svg)svg='<span class="mp-provider-logo-text">'+(provider||'AI').slice(0,2).toUpperCase()+'</span>';
    return '<span class="chat-model-stable-logo img-provider-logo-v354 mp-logo-'+(p||'generic')+'" data-provider="'+p+'" aria-hidden="true">'+svg+'</span>';
  }
  function modelRows(){
    var sel=document.getElementById('model-sel'); if(!sel)return [];
    var rows=[];
    Array.from(sel.children||[]).forEach(function(ch){
      if(ch.tagName==='OPTGROUP'){var g=ch.label||'Modeller';Array.from(ch.querySelectorAll('option')).forEach(function(o){rows.push({group:g,value:o.value,label:textMap(o.textContent||o.value),disabled:o.disabled,selected:o.selected})})}
      else if(ch.tagName==='OPTION')rows.push({group:'Modeller',value:ch.value,label:textMap(ch.textContent||ch.value),disabled:ch.disabled,selected:ch.selected});
    });
    return rows;
  }
  function closeMenus(){document.querySelectorAll('.chat-model-stable-menu-v474,.chat-model-stable-menu-v463').forEach(function(el){el.remove()});document.body.classList.remove('chat-model-stable-open-v474','chat-model-stable-open-v463')}
  function selectModelV474(value,label){
    var sel=document.getElementById('model-sel'); if(!sel||!value)return false;
    sel.value=value; localStorage.setItem('ap_selected_model',value); sel.dispatchEvent(new Event('change',{bubbles:true}));
    var clean=textMap(label||value).replace(/^(Ücretsiz|Pro)\s*-\s*/i,'');
    document.querySelectorAll('#mpb-name,.model-picker-chip .dock-label').forEach(function(el){el.textContent=clean;el.title=clean});
    closeMenus(); return true;
  }
  function openModelMenuV474(ev,trigger){
    if(ev){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation&&ev.stopImmediatePropagation()}
    trigger=trigger||document.querySelector('.ai-top-chip,.model-picker-chip,[data-open-model-picker]');
    if(!trigger)return false;
    closeMenus();
    var rows=modelRows();
    var cats=[
      {id:'fav',label:'Favoriler',match:function(r){try{return (JSON.parse(localStorage.getItem('ap_model_favorites')||'[]')||[]).includes(r.value)}catch(e){return false}}},
      {id:'openai',label:'ChatGPT',match:function(r){return providerFor(r.value,r.label,r.group)==='openai'}},
      {id:'quality',label:'Ücretsiz Kaliteli',match:function(r){return /ücretsiz kaliteli|qualityfree|gpt-oss|llama 3\.3|deepseek/i.test([r.group,r.value,r.label].join(' '))}},
      {id:'llama',label:'Llama',match:function(r){return providerFor(r.value,r.label,r.group)==='llama'}},
      {id:'free',label:'Ücretsiz',match:function(r){return /ücretsiz|free/i.test([r.group,r.value,r.label].join(' '))}},
      {id:'all',label:'Tümü',match:function(){return true}}
    ];
    var active=window.__froxyPickerCatV474||'quality';
    function renderList(){
      var cat=cats.find(function(c){return c.id===active})||cats[0];
      var filtered=rows.filter(cat.match); if(!filtered.length)filtered=rows;
      var grouped={}; var order=[]; filtered.forEach(function(r){if(!grouped[r.group]){grouped[r.group]=[];order.push(r.group)}grouped[r.group].push(r)});
      var body=order.map(function(g){return '<div class="chat-model-stable-group">'+textMap(g)+'</div>'+grouped[g].map(function(r){var pr=providerFor(r.value,r.label,g);return '<button type="button" class="chat-model-stable-option '+(r.selected?'selected':'')+'" data-value="'+r.value.replace(/"/g,'&quot;')+'" '+(r.disabled?'disabled aria-disabled="true"':'')+'>'+logo(pr)+'<span class="chat-model-stable-option-body"><strong>'+textMap(r.label).replace(/^(Ücretsiz|Pro)\s*-\s*/i,'')+'</strong><small>'+textMap(g)+'</small></span></button>'}).join('')}).join('');
      menu.querySelector('.chat-model-stable-list').innerHTML=body;
    }
    var rect=trigger.getBoundingClientRect(), vw=innerWidth, vh=innerHeight, margin=10, mobile=vw<720;
    var width=mobile?vw-margin*2:Math.min(Math.max(rect.width,390),vw-margin*2);
    var height=mobile?Math.min(vh-margin*2,620):Math.min(620,Math.max(320,vh-rect.bottom-margin,rect.top-margin));
    var left=mobile?margin:Math.max(margin,Math.min(rect.left,vw-width-margin));
    var top=mobile?margin:Math.max(margin,Math.min(rect.bottom+8,vh-height-margin));
    var menu=document.createElement('div');
    menu.className='chat-model-stable-menu-v474 chat-model-stable-menu-v463';
    menu.style.cssText='position:fixed;z-index:2147483700;left:'+left+'px;top:'+top+'px;width:'+width+'px;height:'+height+'px;max-height:'+height+'px;display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;touch-action:pan-y;border:1px solid rgba(148,163,184,.24);border-radius:14px;background:rgba(8,13,25,.98);box-shadow:0 24px 80px rgba(0,0,0,.52);color:#f8fafc';
    menu.innerHTML='<div class="chat-model-stable-head"><strong>Model Seçimi</strong><button type="button" aria-label="Kapat">×</button></div><div class="chat-model-tabs-v474">'+cats.map(function(c){return '<button type="button" data-cat="'+c.id+'" class="'+(c.id===active?'active':'')+'">'+c.label+'</button>'}).join('')+'</div><div class="chat-model-stable-list" style="flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:8px"></div>';
    document.body.appendChild(menu);document.body.classList.add('chat-model-stable-open-v474');renderList();
    menu.addEventListener('click',function(e){var c=e.target.closest('[data-cat]');if(c){active=c.dataset.cat;window.__froxyPickerCatV474=active;menu.querySelectorAll('[data-cat]').forEach(function(b){b.classList.toggle('active',b.dataset.cat===active)});renderList();return}var b=e.target.closest('.chat-model-stable-option[data-value]');if(b&&!b.disabled)selectModelV474(b.dataset.value,(b.querySelector('strong')||{}).textContent||b.dataset.value)});
    menu.querySelector('.chat-model-stable-head button').onclick=closeMenus;
    return true;
  }
  window.__froxyOpenModelMenuV474=openModelMenuV474;
  window.__froxyUseFinalChatPickerV474=true;
  window.openModelPicker=function(ev){return openModelMenuV474(ev)};
  window.toggleModelPicker=function(ev){return openModelMenuV474(ev)};
  window.closeModelPicker=closeMenus;
  window.selectModel=function(id){var opt=Array.from(document.getElementById('model-sel')?.options||[]).find(function(o){return o.value===id});return selectModelV474(id,opt&&opt.textContent)};
  function isChatTriggerTarget(e){
    return e&&e.target&&e.target.closest&&e.target.closest('.ai-top-chip,.model-picker-chip,[data-open-model-picker],#mpb-name,#model-picker-button,.ai-chat-top-actions [title*="Model" i]');
  }
  function handleChatPickerPress(e){
    var t=isChatTriggerTarget(e);
    if(t&&!t.closest('.chat-model-stable-menu-v474')){
      openModelMenuV474(e,t);
      return false;
    }
    if(e.type==='click'&&!(e.target&&e.target.closest&&e.target.closest('.chat-model-stable-menu-v474')))closeMenus();
  }
  document.addEventListener('pointerdown',handleChatPickerPress,true);
  document.addEventListener('touchstart',handleChatPickerPress,{capture:true,passive:false});
  document.addEventListener('click',handleChatPickerPress,true);
  window.addEventListener('pointerdown',handleChatPickerPress,true);
  window.addEventListener('touchstart',handleChatPickerPress,{capture:true,passive:false});
  window.addEventListener('click',handleChatPickerPress,true);
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMenus()},true);
  function injectFinalStyleV474(){
    if(document.getElementById('froxy-final-fix-v474-style'))return;
    var st=document.createElement('style');
    st.id='froxy-final-fix-v474-style';
    st.textContent='.chat-model-stable-menu-v474,.chat-model-stable-menu-v463,.img-model-stable-menu-v463,.img-model-stable-menu-v462,.img-model-stable-menu-v461,.img-model-stable-menu-v434{touch-action:pan-y!important;overscroll-behavior:contain!important}.chat-model-stable-menu-v474 .chat-model-stable-list,.chat-model-stable-menu-v463 .chat-model-stable-list,.img-model-stable-menu-v463 .img-model-stable-list,.img-model-stable-menu-v462 .img-model-stable-list,.img-model-stable-menu-v461 .img-model-stable-list,.img-model-stable-menu-v434 .img-model-stable-list{overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important}.chat-model-tabs-v474{display:flex;gap:6px;padding:8px;overflow-x:auto;flex:0 0 auto;border-bottom:1px solid rgba(148,163,184,.14)}.chat-model-tabs-v474 button{border:1px solid rgba(148,163,184,.18);border-radius:999px;background:rgba(15,23,42,.8);color:#cbd5e1;height:30px;padding:0 10px;font-size:11px;font-weight:900;white-space:nowrap}.chat-model-tabs-v474 button.active{background:linear-gradient(135deg,#2563eb,#7c3aed);border-color:transparent;color:#fff}.chat-model-stable-logo.mp-logo-meta,.chat-model-stable-logo[data-provider="meta"]{background:linear-gradient(135deg,#2563eb,#22d3ee)!important;color:#fff!important}.chat-model-stable-logo svg,.img-model-stable-logo svg{width:19px;height:19px;display:block}.img-provider-logo-v354 .mp-provider-logo-text{display:grid!important;place-items:center!important;width:100%!important;height:100%!important;color:inherit!important;font-size:11px!important;font-weight:950!important;letter-spacing:0!important;line-height:1!important}.chat-model-stable-head button,.img-model-stable-head button{text-transform:none!important}';
    document.head.appendChild(st);
  }
  function repairCommonVisibleLabels(){
    document.querySelectorAll('.ah-hero-copy p,.ah-hero-meta span,.ah-msg p,.ah-image-card p,.ah-trust-grid span,.ah-card-grid b,.ah-card-grid small,.ah-input').forEach(function(el){
      var next=normalizeDisplayText(el.textContent);
      if(next!==el.textContent)el.textContent=next;
    });
    var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
      if(!n.nodeValue||!/Görsel Üret|görsel Üret|Üretim|Üretildi|ĞĞ/.test(n.nodeValue))return NodeFilter.FILTER_REJECT;
      var p=n.parentElement;
      if(!p||/^(SCRIPT|STYLE|TEXTAREA|INPUT)$/i.test(p.tagName))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    var nodes=[];
    while(walker.nextNode()&&nodes.length<300)nodes.push(walker.currentNode);
    nodes.forEach(function(n){var next=normalizeDisplayText(n.nodeValue);if(next!==n.nodeValue)n.nodeValue=next;});
  }
  function tick(){injectFinalStyleV474();repairHomeBlackScreen();repairVisibleText(document.body);repairCommonVisibleLabels()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick,{once:true}); else tick();
  [200,700,1500,3500,7000].forEach(function(ms){setTimeout(tick,ms)});
  var mo=new MutationObserver(function(){clearTimeout(window.__froxyRepairTextTimer);window.__froxyRepairTextTimer=setTimeout(function(){repairVisibleText(document.body);repairCommonVisibleLabels&&repairCommonVisibleLabels()},80)});
  safe(function(){mo.observe(document.body,{childList:true,subtree:true,characterData:true})});
})();
