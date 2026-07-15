(function(){
  if(window.__froxyInteractionFixV463)return;
  window.__froxyInteractionFixV463=true;

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function closeChatMenu(){
    document.querySelectorAll('.chat-model-stable-menu-v463').forEach(function(el){el.remove();});
    document.body.classList.remove('chat-model-stable-open-v463');
  }
  function closeHiddenModalPicker(){
    var p=document.getElementById('model-picker');
    var o=document.getElementById('model-picker-overlay');
    document.body.classList.remove('model-picker-open');
    if(p){
      p.classList.remove('open');
      p.setAttribute('aria-hidden','true');
      p.style.display='none';
      p.style.pointerEvents='none';
      p.style.visibility='hidden';
      p.style.opacity='0';
    }
    if(o){
      o.classList.remove('open');
      o.setAttribute('aria-hidden','true');
      o.style.display='none';
      o.style.pointerEvents='none';
      o.style.visibility='hidden';
      o.style.opacity='0';
    }
  }
  function modelOptions(){
    var sel=document.getElementById('model-sel');
    if(!sel)return [];
    var rows=[];
    Array.from(sel.children||[]).forEach(function(child){
      if(child.tagName==='OPTGROUP'){
        var group=child.label||'Modeller';
        Array.from(child.querySelectorAll('option')).forEach(function(opt){rows.push({group:group,value:opt.value,label:opt.textContent||opt.value,disabled:opt.disabled,selected:opt.selected});});
      }else if(child.tagName==='OPTION'){
        rows.push({group:'Modeller',value:child.value,label:child.textContent||child.value,disabled:child.disabled,selected:child.selected});
      }
    });
    return rows;
  }
  function paintChatTrigger(value,label){
    var clean=(label||value||'Model').replace(/^(Ücretsiz|Pro)\\s*-\\s*/i,'');
    document.querySelectorAll('#mpb-name,.model-picker-chip .dock-label').forEach(function(el){el.textContent=clean;el.title=clean;});
    document.querySelectorAll('.ai-top-chip,.model-picker-chip').forEach(function(el){el.title='Model seç: '+clean;el.setAttribute('aria-label','Model seç: '+clean);});
  }
  function selectChatModel(value,label){
    var sel=document.getElementById('model-sel');
    if(!sel||!value)return false;
    sel.value=value;
    try{localStorage.setItem('ap_selected_model',value);}catch(e){}
    try{if(window.LS&&typeof window.LS.set==='function')window.LS.set('ap_selected_model',value);}catch(e){}
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    paintChatTrigger(value,label);
    try{typeof window.updateChatCreditEstimate==='function'&&window.updateChatCreditEstimate();}catch(e){}
    try{typeof window.updateModelBadge==='function'&&window.updateModelBadge();}catch(e){}
    closeChatMenu();
    closeHiddenModalPicker();
    return true;
  }
  function fitPanel(trigger,preferredWidth){
    var margin=12;
    var viewportW=Math.max(260,window.innerWidth||360);
    var viewportH=Math.max(360,window.innerHeight||720);
    var rect=trigger.getBoundingClientRect();
    var width=Math.min(Math.max(rect.width||0,preferredWidth||360),Math.max(240,viewportW-margin*2));
    var left=Math.max(margin,Math.min(rect.left,Math.max(margin,viewportW-width-margin)));
    var below=Math.max(0,viewportH-rect.bottom-margin);
    var above=Math.max(0,rect.top-margin);
    var down=below>=Math.min(330,above);
    var availableHeight=Math.max(260,(down?below:above)||viewportH-margin*2);
    var height=Math.min(560,availableHeight,viewportH-margin*2);
    var top=down?Math.min(rect.bottom+8,viewportH-margin-height):Math.max(margin,rect.top-height-8);
    return {left:left,top:Math.max(margin,top),width:width,height:height};
  }
  function applyStableLayout(menu,list,frame){
    menu.style.position='fixed';
    menu.style.zIndex='2147483500';
    menu.style.left=frame.left+'px';
    menu.style.top=frame.top+'px';
    menu.style.width=frame.width+'px';
    menu.style.height=frame.height+'px';
    menu.style.maxHeight=frame.height+'px';
    menu.style.display='flex';
    menu.style.flexDirection='column';
    menu.style.overflow='hidden';
    menu.style.boxSizing='border-box';
    menu.style.border='1px solid rgba(148,163,184,.22)';
    menu.style.borderRadius='12px';
    menu.style.background='rgba(8,13,25,.98)';
    menu.style.boxShadow='0 22px 70px rgba(0,0,0,.5)';
    menu.style.color='#f8fafc';
    menu.style.pointerEvents='auto';
    menu.style.touchAction='none';
    if(list){
      list.style.flex='1 1 auto';
      list.style.minHeight='0';
      list.style.overflowY='auto';
      list.style.overscrollBehavior='contain';
      list.style.webkitOverflowScrolling='touch';
      list.style.touchAction='pan-y';
      list.style.padding='8px';
      list.style.boxSizing='border-box';
    }
  }
  function renderChatMenu(trigger){
    var sel=document.getElementById('model-sel');
    if(!sel||!trigger)return false;
    closeChatMenu();
    closeHiddenModalPicker();
    var rect=trigger.getBoundingClientRect();
    var margin=12;
    var width=Math.min(Math.max(rect.width,360),Math.max(320,window.innerWidth-margin*2));
    var left=Math.min(Math.max(margin,rect.left),window.innerWidth-width-margin);
    var below=Math.max(0,window.innerHeight-rect.bottom-margin);
    var above=Math.max(0,rect.top-margin);
    var down=below>=Math.min(330,above);
    var maxHeight=Math.max(260,Math.min(560,(down?below:above)||window.innerHeight-margin*2));
    var top=down?Math.min(rect.bottom+8,window.innerHeight-margin-maxHeight):Math.max(margin,rect.top-maxHeight-8);
    var rows=modelOptions();
    var groups=[];
    var seen={};
    rows.forEach(function(row){if(!seen[row.group]){seen[row.group]=[];groups.push(row.group)}seen[row.group].push(row);});
    var body=groups.map(function(group){
      var options=(seen[group]||[]).filter(function(row){return row.value;}).map(function(row){
        return '<button type="button" class="chat-model-stable-option '+(row.value===sel.value?'selected':'')+'" data-value="'+esc(row.value)+'" '+(row.disabled?'disabled aria-disabled="true"':'')+'><span class="chat-model-stable-logo" aria-hidden="true">AI</span><span class="chat-model-stable-option-body"><strong>'+esc(row.label.replace(/^(Ücretsiz|Pro)\\s*-\\s*/i,''))+'</strong><small>'+esc(group)+'</small></span></button>';
      }).join('');
      return options?'<div class="chat-model-stable-group">'+esc(group)+'</div>'+options:'';
    }).join('');
    var menu=document.createElement('div');
    menu.className='chat-model-stable-menu-v463';
    menu.style.left=left+'px';
    menu.style.top=top+'px';
    menu.style.width=width+'px';
    menu.style.maxHeight=maxHeight+'px';
    menu.innerHTML='<div class="chat-model-stable-head"><strong>Model Seçimi</strong><button type="button" aria-label="Kapat">x</button></div><div class="chat-model-stable-list">'+body+'</div>';
    applyStableLayout(menu,menu.querySelector('.chat-model-stable-list'),fitPanel(trigger,360));
    menu.querySelector('.chat-model-stable-head button').addEventListener('click',closeChatMenu);
    menu.addEventListener('click',function(e){
      var btn=e.target&&e.target.closest&&e.target.closest('.chat-model-stable-option[data-value]');
      if(!btn||btn.disabled||btn.getAttribute('aria-disabled')==='true')return;
      var value=btn.getAttribute('data-value')||'';
      selectChatModel(value,(btn.querySelector('strong')||{}).textContent||value);
    });
    document.body.appendChild(menu);
    document.body.classList.add('chat-model-stable-open-v463');
    return true;
  }
  function openFromTrigger(ev,trigger){
    if(ev){
      ev.preventDefault&&ev.preventDefault();
      ev.stopPropagation&&ev.stopPropagation();
      ev.stopImmediatePropagation&&ev.stopImmediatePropagation();
    }
    trigger=trigger||document.querySelector('.ai-top-chip,.model-picker-chip,[data-open-model-picker]');
    return renderChatMenu(trigger);
  }
  function install(){
    closeHiddenModalPicker();
    window.openModelPicker=function(ev){return openFromTrigger(ev)};
    window.toggleModelPicker=function(ev){return openFromTrigger(ev)};
    window.closeModelPicker=function(){closeChatMenu();closeHiddenModalPicker();};
    window.selectModel=function(id){
      var opt=Array.from(document.getElementById('model-sel')?.options||[]).find(function(o){return o.value===id;});
      return selectChatModel(id,opt&&opt.textContent);
    };
    return true;
  }
  if(!window.__froxyInteractionFixV463Bound){
    window.__froxyInteractionFixV463Bound=true;
    document.addEventListener('click',function(e){
      var trigger=e.target&&e.target.closest&&e.target.closest('.ai-top-chip,.model-picker-chip,[data-open-model-picker]');
      if(trigger&&!trigger.closest('.chat-model-stable-menu-v463')){
        openFromTrigger(e,trigger);
        return false;
      }
      if(e.target&&e.target.closest&&e.target.closest('#model-picker-overlay,.mp-close-btn')){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation&&e.stopImmediatePropagation();
        closeHiddenModalPicker();
        return false;
      }
      if(!(e.target&&e.target.closest&&e.target.closest('.chat-model-stable-menu-v463')))closeChatMenu();
    },true);
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'){
        closeChatMenu();
        closeHiddenModalPicker();
      }
    },true);
    window.addEventListener('resize',function(){closeChatMenu();closeHiddenModalPicker();},{passive:true});
  }
  window.__froxyInstallInteractionFixV463=install;
  install();
  [180,650,1500,3200,6500].forEach(function(ms){setTimeout(install,ms);});
})();
