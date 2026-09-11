// Six independently animated MVP celebrations. Session and trigger ownership stays in media/session.
(function(root){
  'use strict';
  const designs=VyraWidgets.variants('battlemvp.celebration');
  const finite=(v,fallback,min,max)=>Number.isFinite(+v)?Math.min(max,Math.max(min,+v)):fallback;
  const previous=battleMvpHtml;
  battleMvpHtml=function(w){
    const design=Object.prototype.hasOwnProperty.call(designs,w.mvpStyle)?designs[w.mvpStyle]:null;
    if(!design)return previous(w);
    const key=w.mvpStyle, safe=VyraSafe;
    const art='assets/mvp-celebrations/'+key+'.svg';
    const photo=design.photo||{left:29,top:24,width:42,height:42};
    const duration=finite(w.mvpDuration||10,10,2,15);
    const particles=Array.from({length:20},(_,i)=>'<i style="--i:'+i+';--x:'+((i*37)%100)+'%;--drift:'+((i%2?1:-1)*(12+i*2))+'px"></i>').join('');
    return `<div class="widget battle-mvp mvp-celebration mvc-${key}${selected===w.id?' selected':''}" data-id="${safe.text(w.id)}" style="left:${finite(w.x,0,-10000,10000)}px;top:${finite(w.y,0,-10000,10000)}px;width:${finite(w.width||400,400,100,2000)}px;zoom:${finite(w.widgetScale||1,1,.1,5)};--mvc-duration:${duration}s;--mvc-accent:${design.accent};--mvc-photo-left:${photo.left}%;--mvc-photo-top:${photo.top}%;--mvc-photo-width:${photo.width}%;--mvc-photo-height:${photo.height}%">
      <div class="mvc-stage"><div class="mvc-charge" aria-hidden="true"></div>
      <div class="mvc-portrait"><img src="${safe.url(w.profileImage,'assets/images/test-profile.svg')}" alt=""></div>
      <img class="mvc-art mvc-art-left" src="${art}" alt=""><img class="mvc-art mvc-art-right" src="${art}" alt="">
      <div class="mvc-copy"><small style="display:${w.mvpShowLabel===false?'none':'block'}">${safe.text(battleMvpLabel(w),'MVP')}</small><h2 style="display:${w.mvpShowName===false?'none':'block'}">${safe.text(w.mvpName,'TestAlpha')}</h2></div>
      <div class="mvc-finale" aria-hidden="true">${particles}</div></div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
  };
  const oldProps=props;
  props=function(){
    const html=oldProps(),w=liveWidget(selected);
    if(!w||w.type!=='templateBattleMvp')return html;
    return html.replace(/(<select id="mvpStyle">[\s\S]*?)<\/select>/,`$1<optgroup label="Firande · fyra steg">${Object.entries(designs).map(([key,d])=>`<option value="${key}">${d.label}</option>`).join('')}</optgroup></select>`);
  };
  const oldBind=bind;
  bind=function(){
    oldBind();
    const w=liveWidget(selected),select=document.querySelector('#mvpStyle');
    if(w?.type==='templateBattleMvp'&&select){
      // Choosing a style explicitly leaves an old bitmap-frame selection behind.
      const change=select.onchange;
      select.onchange=function(e){delete w.mvpFrame;if(change)change.call(this,e)};
      select.value=w.mvpStyle||'inferno';
    }
    const grid=document.querySelector('[data-battle-mvp] .mvp-style-grid');
    if(!grid||grid.querySelector('[data-mvp-celebration]'))return;
    grid.insertAdjacentHTML('beforeend',Object.entries(designs).map(([key,d])=>`<button type="button" data-mvp-celebration="${key}" data-catalog-key="catalog:battlemvp:celebration:${key}"><i><img src="assets/mvp-celebrations/${key}.svg" alt="" style="width:100%;height:100%;object-fit:contain"></i><b>${d.label}</b></button>`).join(''));
    const heading=grid.parentElement.querySelector('h4');if(heading)heading.textContent='BATTLE MVP · 23 DESIGNER';
    grid.querySelectorAll('[data-mvp-celebration]').forEach(button=>button.onclick=()=>{
      const created=VyraWidgets.create(button.dataset.catalogKey);
      state.widgets=state.widgets.filter(w=>VyraWidgets.isStandalone(w)||w.type!=='templateBattleMvp');
      state.widgets.push(created);selected=created.id;save();render();toast(created.title+' skapad');
    });
  };
  if(!document.querySelector('link[data-mvp-celebrations]')){
    const css=document.createElement('link');css.rel='stylesheet';css.href='battle-mvp-celebrations.css?v=20260911-1';css.dataset.mvpCelebrations='1';document.head.append(css);
  }
  root.VyraMvpCelebrations={designs};
  // The sibling arrives after the first render; refresh existing widgets and catalog once.
  if(typeof render==='function')render();
})(window);
