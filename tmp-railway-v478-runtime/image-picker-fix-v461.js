(function(){
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function closeMenu(){
    document.querySelectorAll('.img-model-stable-menu-v461').forEach(function(el){ el.remove(); });
    document.body.classList.remove('img-model-stable-open-v461');
  }


  function imageProviderKey(value){
    var id=String(value||'').toLowerCase();
    try{ if(typeof imageProviderForModel==='function') return imageProviderForModel(value)||'generic'; }catch(e){}
    if(id.indexOf('pollinations-')===0||id==='flux'||id==='sana'||id==='turbo'||id.indexOf('style-')===0||id.indexOf('flux-')===0)return 'pollinations';
    if(id.indexOf('cf-')===0||id.indexOf('cloudflare')>-1)return 'cloudflare';
    if(id.indexOf('modal-')===0)return 'modal';
    if(id.indexOf('together-')===0||id.indexOf('juggernaut')>-1)return 'together';
    if(id.indexOf('openai-')===0||id.indexOf('gpt-image')>-1||id.indexOf('dall')>-1)return 'openai';
    if(id.indexOf('gemini-')===0||id.indexOf('imagen')>-1||id.indexOf('nano')>-1)return 'gemini';
    if(id.indexOf('runware-')===0)return 'runware';
    if(id.indexOf('stability-')===0)return 'stability';
    if(id.indexOf('aiml-')===0)return 'aimlapi';
    if(id.indexOf('imagegpt-')===0)return 'imagegpt';
    if(id.indexOf('comfy')>-1||id.indexOf('fooocus')>-1||id.indexOf('a1111')>-1||id.indexOf('forge')>-1||id.indexOf('swarm')>-1)return 'local';
    return 'generic';
  }
  function imageLogo(value){
    var provider=imageProviderKey(value);
    var key=provider;
    if(provider==='local'||provider==='imagegpt')key='generic';
    var icon='';
    try{ if(typeof providerBrandIconSvg==='function') icon=providerBrandIconSvg(key); }catch(e){}
    if(!icon)icon=esc(String(provider||'FX').slice(0,2).toUpperCase());
    return '<span class="img-model-stable-logo img-provider-logo-v354" data-provider="'+esc(provider)+'" title="'+esc(provider)+'" aria-hidden="true">'+icon+'</span>';
  }

  function costText(opt){
    var value=(opt&&opt.value)||'';
    try{
      var provider=typeof imageProviderForModel==='function'?imageProviderForModel(value):'';
      var cost=typeof getClientModelCreditCost==='function'?getClientModelCreditCost(value,provider,'image'):0;
      return cost?cost+' kredi':'G\u00f6rsel modeli';
    }catch(e){
      return 'G\u00f6rsel modeli';
    }
  }
  function fitPanel(trigger,preferredWidth){
    var margin=10;
    var viewportW=Math.max(260,window.innerWidth||360);
    var viewportH=Math.max(360,window.innerHeight||720);
    var rect=trigger.getBoundingClientRect();
    var width=Math.min(Math.max(rect.width||0,preferredWidth||340),Math.max(240,viewportW-margin*2));
    var left=Math.max(margin,Math.min(rect.left,Math.max(margin,viewportW-width-margin)));
    var below=Math.max(0,viewportH-rect.bottom-margin);
    var above=Math.max(0,rect.top-margin);
    var down=below>=Math.min(320,above);
    var availableHeight=Math.max(260,(down?below:above)||viewportH-margin*2);
    var height=Math.min(680,availableHeight,viewportH-margin*2);
    var top=down?Math.min(rect.bottom+8,viewportH-margin-height):Math.max(margin,rect.top-height-8);
    return {left:left,top:Math.max(margin,top),width:width,height:height};
  }
  function applyStableLayout(menu,list,frame){
    menu.style.position='fixed';
    menu.style.zIndex='2147483400';
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
    menu.style.boxShadow='0 22px 70px rgba(0,0,0,.48)';
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

  function render(trigger){
    var sel=document.getElementById('img-model');
    if(!sel||!trigger)return false;
    closeMenu();
    var rect=trigger.getBoundingClientRect();
    var margin=12;
    var width=Math.min(Math.max(rect.width,320),Math.max(320,window.innerWidth-margin*2));
    var left=Math.min(Math.max(margin,rect.left),window.innerWidth-width-margin);
    var below=Math.max(0,window.innerHeight-rect.bottom-margin);
    var above=Math.max(0,rect.top-margin);
    var down=below>=Math.min(320,above);
    var available=down?below:above;
    var maxHeight=Math.max(220,Math.min(460,available||window.innerHeight-margin*2));
    var top=down?Math.min(rect.bottom+8,window.innerHeight-margin-maxHeight):Math.max(margin,rect.top-maxHeight-8);
    var groups=Array.from(sel.querySelectorAll('optgroup'));
    function optionHtml(opt){
      if(opt.hidden)return '';
      var value=opt.value||'';
      var selected=sel.value===value;
      var disabled=!!opt.disabled;
      return '<button type="button" class="img-model-stable-option '+(selected?'selected':'')+'" data-value="'+esc(value)+'" '+(disabled?'disabled aria-disabled="true"':'')+'>'+imageLogo(value)+'<span class="img-model-stable-option-body"><strong>'+esc(opt.textContent||value)+'</strong><small>'+esc(costText(opt))+'</small></span></button>';
    }
    var body=(groups.length?groups.map(function(group){
      var options=Array.from(group.querySelectorAll('option')).map(optionHtml).join('');
      return options?'<div class="img-model-stable-group">'+esc(group.label||'Modeller')+'</div>'+options:'';
    }):Array.from(sel.options||[]).map(optionHtml)).join('');
    var menu=document.createElement('div');
    menu.className='img-model-stable-menu-v432 img-model-stable-menu-v434 img-model-stable-menu-v461';
    menu.style.left=left+'px';
    menu.style.top=top+'px';
    menu.style.width=width+'px';
    menu.style.maxHeight=maxHeight+'px';
    menu.innerHTML='<div class="img-model-stable-head"><strong>Model Se\u00e7imi</strong><button type="button" aria-label="Kapat">x</button></div><div class="img-model-stable-list">'+body+'</div>';
    applyStableLayout(menu,menu.querySelector('.img-model-stable-list'),fitPanel(trigger,340));
    menu.querySelector('.img-model-stable-head button')?.addEventListener('click',closeMenu);
    menu.addEventListener('click',function(e){
      var btn=e.target&&e.target.closest&&e.target.closest('.img-model-stable-option[data-value]');
      if(!btn||btn.disabled||btn.getAttribute('aria-disabled')==='true')return;
      var value=btn.getAttribute('data-value')||'';
      if(!value)return;
      sel.value=value;
      try{window.__froxyImageModelLock=value;}catch(_){}
      try{typeof rememberImageModelChoice==='function'&&rememberImageModelChoice(value,'picker-fix-v461');}catch(_){}
      sel.dispatchEvent(new Event('change',{bubbles:true}));
      var opt=Array.from(sel.options||[]).find(function(o){return o.value===value;});
      var title=document.querySelector('.img-model-picker-trigger .img-model-picker-info strong');
      var sub=document.querySelector('.img-model-picker-trigger .img-model-picker-info span');
      if(title)title.textContent=(opt&&opt.textContent)||value;
      if(sub)sub.textContent='Se\u00e7ili model kilitli: '+value;
      closeMenu();
    });
    document.body.appendChild(menu);
    document.body.classList.add('img-model-stable-open-v461');
    return true;
  }

  function install(){
    window.__froxyImagePickerFixV461=true;
    window.openImageModelPickerTrigger=function(ev){
      if(ev){
        ev.preventDefault&&ev.preventDefault();
        ev.stopPropagation&&ev.stopPropagation();
        ev.stopImmediatePropagation&&ev.stopImmediatePropagation();
      }
      return render(document.querySelector('.img-model-picker-trigger'));
    };
    if(!window.__froxyImagePickerFixV461ClickBound){
      window.__froxyImagePickerFixV461ClickBound=true;
      document.addEventListener('click',function(e){
        var trigger=e.target&&e.target.closest&&e.target.closest('.img-model-picker-trigger');
        if(trigger){
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation&&e.stopImmediatePropagation();
          render(trigger);
          return false;
        }
        if(!e.target.closest?.('.img-model-stable-menu-v461'))closeMenu();
      },true);
      document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMenu();},true);
    }
    return true;
  }

  window.__loadImagePickerFixV461=install;
  install();
  [250,900,1800,3600].forEach(function(ms){ setTimeout(install,ms); });
})();
