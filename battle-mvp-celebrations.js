// Independently animated MVP celebrations. Session and trigger ownership stays in media/session.
(function(root){
  'use strict';
  const designs=VyraWidgets.variants('battlemvp.celebration');
  const FX_TINTS=['auto','gold','violet','white'];
  // Empty decorative layers track details in the existing artwork. No images or winner text.
  const signatureAccents={
    coronation:'<i class="mvc-crown-glint"></i>',
    wings:'<i class="mvc-wing-wave mvc-wing-wave-left"></i><i class="mvc-wing-wave mvc-wing-wave-right"></i>',
    portal:'<i class="mvc-energy-arc mvc-energy-cyan"></i><i class="mvc-energy-arc mvc-energy-coral"></i><i class="mvc-energy-meeting"></i>',
    rosegold:'<i class="mvc-rose-trail"></i>',
    pearl:'<i class="mvc-pearl-glint mvc-pearl-top"></i><i class="mvc-pearl-glint mvc-pearl-left"></i><i class="mvc-pearl-glint mvc-pearl-right"></i><i class="mvc-pearl-glint mvc-pearl-bottom"></i>',
    moon:'<i class="mvc-moon-tip"></i>'
  };
  const finite=(v,fallback,min,max)=>Number.isFinite(+v)?Math.min(max,Math.max(min,+v)):fallback;
  const previous=battleMvpHtml;
  battleMvpHtml=function(w){
    const design=Object.prototype.hasOwnProperty.call(designs,w.mvpStyle)?designs[w.mvpStyle]:null;
    if(!design){
      // Keep the established renderer and live contract, add only finite motion hooks.
      const family=w.mvpFrame?'battlemvp.frame':'battlemvp.style';
      const key=w.mvpFrame||w.mvpStyle||'inferno';
      if(!Object.prototype.hasOwnProperty.call(VyraWidgets.variants(family),key))return previous(w);
      const duration=finite(w.mvpDuration||7,7,2,15);
      let html=previous(w);
      // Live updates target the first image; artwork must never occupy that slot.
      if(w.mvpFrame)html=html.replace(/(<img class="mvpf-art"[^>]*>)(<div class="mvpf-photo"[\s\S]*?<\/div>)/,'$2$1');
      return html.replace('class="widget battle-mvp','class="widget battle-mvp mvp-motion')
        .replace('data-id=', 'data-mvp-motion="'+key+'" data-id=')
        .replace('style="','style="--mvm-duration:'+duration+'s;');
    }
    const key=w.mvpStyle, safe=VyraSafe;
    const art='assets/mvp-celebrations/'+(design.asset||key+'.svg');
    const photo=design.photo||{left:29,top:24,width:42,height:42};
    const duration=finite(w.mvpDuration||design.duration||10,design.duration||10,2,15);
    const particles=Array.from({length:20},(_,i)=>'<i style="--i:'+i+';--x:'+((i*37)%100)+'%;--drift:'+((i%2?1:-1)*(12+i*2))+'px"></i>').join('');
    return `<div class="widget battle-mvp mvp-celebration mvc-${key}${selected===w.id?' selected':''}" data-id="${safe.text(w.id)}"${design.raster?' data-mvc-particles="off"':''} style="left:${finite(w.x,0,-10000,10000)}px;top:${finite(w.y,0,-10000,10000)}px;width:${finite(w.width||400,400,100,2000)}px;zoom:${finite(w.widgetScale||1,1,.1,5)};--mvc-duration:${duration}s;--mvc-accent:${design.accent};--mvc-photo-left:${photo.left}%;--mvc-photo-top:${photo.top}%;--mvc-photo-width:${photo.width}%;--mvc-photo-height:${photo.height}%;--mvc-fx-intensity:${finite(w.mvpFxIntensity,100,20,250)};--mvc-fx-speed:${finite(w.mvpFxSpeed,100,40,200)};--mvc-fx-size:${finite(w.mvpFxSize,100,50,220)};--mvc-fx-depth:${finite(w.mvpFxDepth,34,0,60)};--mvc-fx-hole:${finite(w.mvpFxHole,118,60,200)};--mvc-fx-tint:${FX_TINTS.indexOf(w.mvpFxTint)>0?w.mvpFxTint:'auto'}">
      <div class="mvc-stage">${design.raster?'':'<div class="mvc-charge" aria-hidden="true"></div>'}
      <div class="mvc-portrait"><img src="${safe.url(w.profileImage,'assets/images/test-profile.svg')}" alt=""></div>
      ${design.raster?'<img class="mvc-smoke" src="assets/mvp-celebrations/gold-ribbon-smoke.png" alt="" aria-hidden="true">':''}
      <img class="mvc-art mvc-art-left" src="${art}" alt=""><img class="mvc-art mvc-art-right" src="${art}" alt="">
      ${signatureAccents[key]?'<div class="mvc-signature mvc-signature-'+key+'" aria-hidden="true">'+signatureAccents[key]+'</div>':''}
      <div class="mvc-copy"><small style="display:${w.mvpShowLabel===false?'none':'block'}">${safe.text(battleMvpLabel(w),'MVP')}</small><h2 style="display:${w.mvpShowName===false?'none':'block'}">${safe.text(w.mvpName,'TestAlpha')}</h2></div>
      <div class="mvc-finale" aria-hidden="true">${particles}</div></div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
  };
  const oldProps=props;
  props=function(){
    let html=oldProps();const w=liveWidget(selected);
    if(!w||w.type!=='templateBattleMvp')return html;
    if(designs[w.mvpStyle]?.raster){
      html=html.replace(/<label>Rubrik<input id="mvpLabel"[^>]*><\/label>/,'<small>MVP är en fast del av guldbandet.</small>')
        .replace(/<small>I en battle med medvärdar[\s\S]*?<\/small>/,'<small>Visar battle-systemets MVP. I lagmatcher kan vinnaren tillhöra en medvärd.</small>')
        .replace(/<div class="color-grid"><label>Färg 1<input id="mvpColor"[\s\S]*?<\/div>/,'')
        .replace(/<div class="switch-row one"><label><input id="bkInherit"[\s\S]*?<\/div>/,'<small>Guldramens färger är fasta.</small>')
        .replace(/<label><input id="mvpShowLabelMain"[^>]*> MVP<\/label>/,'')
        .replace(/<label><input id="mvpShowCoins"[^>]*> Coins<\/label>/,'')
        .replace(/<label>Coin-symbol<input[^>]*><\/label>/,'')
        .replace(/<label>Coins<input[^>]*><\/label>/,'')
        .replace('id="mvpDuration" type="range"','id="mvpDuration" type="range" step="0.1"');
    }
    if(Object.prototype.hasOwnProperty.call(designs,w.mvpStyle)&&!designs[w.mvpStyle].raster){
      const g=(k,d)=>Number.isFinite(+w[k])?+w[k]:d;
      html=html.replace('<div class="property-group"><h4>POSITION',
        '<div class="property-group"><h4>FIRANDETS PARTIKLAR</h4>'+
        '<label class="range-label">Intensitet <b>'+g('mvpFxIntensity',100)+' %</b>'+
        '<input id="mvpFxIntensity" type="range" min="20" max="250" step="5" value="'+g('mvpFxIntensity',100)+'"></label>'+
        '<label class="range-label">Hastighet <b>'+g('mvpFxSpeed',100)+' %</b>'+
        '<input id="mvpFxSpeed" type="range" min="40" max="200" step="5" value="'+g('mvpFxSpeed',100)+'"></label>'+
        '<label class="range-label">Storlek <b>'+g('mvpFxSize',100)+' %</b>'+
        '<input id="mvpFxSize" type="range" min="50" max="220" step="5" value="'+g('mvpFxSize',100)+'"></label>'+
        '<label class="range-label">Andel framfor ramen <b>'+g('mvpFxDepth',34)+' %</b>'+
        '<input id="mvpFxDepth" type="range" min="0" max="60" step="1" value="'+g('mvpFxDepth',34)+'"></label>'+
        '<label class="range-label">Fri yta runt profilbilden <b>'+g('mvpFxHole',118)+' %</b>'+
        '<input id="mvpFxHole" type="range" min="60" max="200" step="2" value="'+g('mvpFxHole',118)+'"></label>'+
        '<label>Partikelfarg<select id="mvpFxTint">'+
          FX_TINTS.map(t=>'<option value="'+t+'"'+((w.mvpFxTint||'auto')===t?' selected':'')+'>'+
            ({auto:'Foljer firandet',gold:'Guld',violet:'Violett',white:'Vitt'})[t]+'</option>').join('')+
        '</select></label>'+
        '<div class="property-actions"><button id="testBattleMvp">Testa firandet</button></div>'+
        '</div><div class="property-group"><h4>POSITION');
    }
    return html.replace(/(<select id="mvpStyle">[\s\S]*?)<\/select>/,`$1<optgroup label="Firande · fyra steg">${Object.entries(designs).map(([key,d])=>`<option value="${key}">${d.label}</option>`).join('')}</optgroup></select>`);
  };
  // Retired from new selections only. Keep metadata/assets for saved layouts.
  function hideRetiredFrameChoices(){
    const retiredStyles=['royal-purple','ice','diamond-elite','neon-cyber'];
    retiredStyles.forEach(key=>document.querySelectorAll('[data-mvp-style="'+key+'"], [data-catalog-key="catalog:battlemvp:'+key+'"], #mvpStyle option[value="'+key+'"]').forEach(el=>el.remove()));
    document.querySelectorAll('[data-mvp-frame="gold-crown"], [data-catalog-key="catalog:battlemvp:frame:gold-crown"], #mvpFrame option[value="gold-crown"], #mvpStyle option[value="gold-crown"]').forEach(el=>el.remove());
    const basic=document.querySelector('[data-battle-mvp]');
    if(basic){
      const title=basic.querySelector('h4');
      if(title)title.textContent='BATTLE MVP · '+basic.querySelectorAll('button[data-mvp-style],button[data-mvp-frame]').length+' DESIGNER';
    }
  }
  const oldBind=bind;
  bind=function(){
    oldBind();
    hideRetiredFrameChoices();
    const w=liveWidget(selected),select=document.querySelector('#mvpStyle');
    if(w?.type==='templateBattleMvp'&&select){
      // Choosing a style explicitly leaves an old bitmap-frame selection behind.
      const change=select.onchange;
      select.onchange=function(e){delete w.mvpFrame;if(change)change.call(this,e)};
      select.value=w.mvpStyle||'inferno';
    }
    if(w?.type==='templateBattleMvp'){
      [['#mvpFxIntensity','mvpFxIntensity'],['#mvpFxSpeed','mvpFxSpeed'],['#mvpFxSize','mvpFxSize'],
       ['#mvpFxDepth','mvpFxDepth'],['#mvpFxHole','mvpFxHole']].forEach(([id,key])=>{
        const el=document.querySelector(id);if(!el)return;
        el.oninput=e=>{const b=el.parentElement.querySelector('b');if(b)b.textContent=e.target.value+' %';vyraLivePatch(w,el,key,+e.target.value)};
        el.onchange=e=>{w[key]=+e.target.value;save();vyraRenderKeepingPanel()};
      });
      const tintSel=document.querySelector('#mvpFxTint');
      if(tintSel)tintSel.onchange=e=>{w.mvpFxTint=FX_TINTS.indexOf(e.target.value)>0?e.target.value:'auto';save();render()};
      // Tander firandet pa begaran. triggerBattleMvp laser sjalv alla templateBattleMvp
      // ur state, sa den behover bara de falt en riktig battle skulle ha skickat.
      const test=document.querySelector('#testBattleMvp');
      if(test)test.onclick=()=>{
        if(typeof triggerBattleMvp!=='function')return toast('Firandet kunde inte startas');
        triggerBattleMvp({name:w.mvpName||'TestAlpha',score:w.mvpScore??1500,
          profileImage:w.profileImage});
      };
    }
    // Firanden remain separate from BASIC. Anchor in data attributes; the BASIC
    // heading above is counted from selectable buttons after retiring Gold Crown.
    const syskon=document.querySelector('[data-battle-mvp]');
    if(!syskon||document.querySelector('[data-battle-mvp-firande]'))return;
    const sektion=document.createElement('section');
    sektion.dataset.battleMvpFirande='1';
    sektion.className=syskon.className;          // samma utseende som grannen
    sektion.innerHTML='<h4>BATTLE MVP · FIRANDE · '+Object.keys(designs).length+' KOREOGRAFIER</h4>'+
      '<div class="mvp-style-grid"></div>';
    syskon.insertAdjacentElement('afterend',sektion);
    const grid=sektion.querySelector('.mvp-style-grid');
    grid.insertAdjacentHTML('beforeend',Object.entries(designs).map(([key,d])=>`<button type="button" data-mvp-celebration="${key}" data-catalog-key="catalog:battlemvp:celebration:${key}"><i><img src="assets/mvp-celebrations/${d.asset||key+'.svg'}" alt="" style="width:100%;height:100%;object-fit:contain"></i><b>${d.label}</b></button>`).join(''));
    grid.querySelectorAll('[data-mvp-celebration]').forEach(button=>button.onclick=()=>{
      const created=VyraWidgets.create(button.dataset.catalogKey);
      state.widgets=state.widgets.filter(w=>VyraWidgets.isStandalone(w)||w.type!=='templateBattleMvp');
      state.widgets.push(created);selected=created.id;save();render();toast(created.title+' skapad');
    });
  };
  if(!document.querySelector('link[data-mvp-celebrations]')){
    const css=document.createElement('link');css.rel='stylesheet';css.href='battle-mvp-celebrations.css?v=20260930-signature5';css.dataset.mvpCelebrations='1';document.head.append(css);
  }
  if(!document.querySelector('script[data-mvp-particles]')){
    const js=document.createElement('script');js.src='battle-mvp-particles.js?v=20260930-signature5';
    js.dataset.mvpParticles='1';document.body.append(js);
  }
  root.VyraMvpCelebrations={designs};
  // The sibling arrives after the first render; refresh existing widgets and catalog once.
  if(typeof render==='function')render();
})(window);
