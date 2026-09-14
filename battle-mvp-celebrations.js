// Six independently animated MVP celebrations. Session and trigger ownership stays in media/session.
(function(root){
  'use strict';
  const designs=VyraWidgets.variants('battlemvp.celebration');
  const finite=(v,fallback,min,max)=>Number.isFinite(+v)?Math.min(max,Math.max(min,+v)):fallback;
  // Positions are relative to the square stage, not the viewport. Each family has
  // its own flight geometry; there is no ticker, random state or live-state write.
  const sprites={coronation:0,wings:1,portal:2,rosegold:3,pearl:4,moon:5};
  function field(key,kind){
    const total=kind==='launch'?24:kind==='hold'?16:36;
    return Array.from({length:total},(_,i)=>{
      const u=i/total,a=u*Math.PI*2,spread=12+(i*17%29),side=i%2?1:-1;
      let x0,y0,x1,y1,x2,y2;
      if(key==='coronation'){
        x0=-48+u*12;y0=43+u*8;x1=Math.cos(a)*43;y1=Math.sin(a)*18-8;
        x2=Math.cos(a)*spread;y2=-30-Math.sin(u*Math.PI)*20;
      }else if(key==='wings'){
        x0=side*4;y0=36;x1=side*(12+u*27);y1=20-u*55;
        x2=side*(24+u*25);y2=-12-u*34;
      }else if(key==='portal'){
        x0=Math.cos(a)*54;y0=Math.sin(a)*38;x1=Math.cos(a+2)*29;y1=Math.sin(a+2)*20;
        x2=Math.cos(a+4)*47;y2=Math.sin(a+4)*32;
      }else if(key==='rosegold'){
        x0=side*3;y0=38;x1=side*(12+u*25);y1=15-u*34;
        x2=side*(22+u*22);y2=-32+u*68;
      }else if(key==='pearl'){
        x0=side*(8+u*35);y0=44;x1=x0+Math.sin(a)*9;y1=12-u*36;
        x2=x0-Math.sin(a)*6;y2=-46-u*8;
      }else{
        x0=46-u*12;y0=-44+u*8;x1=Math.cos(a)*36;y1=Math.sin(a)*30-5;
        x2=-48+u*38;y2=20+u*24;
      }
      if(kind==='exit'){
        // Dissolve from the actual emblem rather than rain from the screen edge.
        x0=Math.cos(a)*spread;y0=Math.sin(a)*spread-6;
        if(key==='coronation'){x1=x0*1.12;y1=y0-15;x2=x0*1.4;y2=-55;}
        if(key==='wings'){x1=x0*1.25;y1=y0-9;x2=side*55;y2=y0-30;}
        if(key==='portal'){x1=x0*.5;y1=y0*.5;x2=0;y2=-6;}
        if(key==='rosegold'){x1=x0+side*8;y1=y0+8;x2=x0+side*18;y2=48;}
        if(key==='pearl'){x1=x0+Math.sin(a)*8;y1=y0-15;x2=x0;y2=-56;}
        if(key==='moon'){x1=x0-12;y1=y0+8;x2=x0-38;y2=y0+28;}
      }
      if(kind==='hold'){x1=Math.cos(a)*(38+i%5*2);y1=Math.sin(a)*(32+i%3*3)-4;}
      const n=v=>Number(v.toFixed(2));
      const sprite=kind==='hold'?0:sprites[key];
      const size=kind==='hold'?2.8:({coronation:3,wings:5.5,portal:4.5,rosegold:5,pearl:4,moon:4.5}[key]+(i%4)*.8);
      return `<i class="mvc-sprite" style="--sx:${(sprite%4)/3*100}%;--sy:${Math.floor(sprite/4)*100}%;--x0:${n(x0)}cqw;--y0:${n(y0)}cqw;--x1:${n(x1)}cqw;--y1:${n(y1)}cqw;--x2:${n(x2)}cqw;--y2:${n(y2)}cqw;--orbit:${n(u*100)}%;--spin:${side*(65+i*13)}deg;--lag:${n((i%6)*.006)};--size:${size}cqw"></i>`;
    }).join('');
  }
  const previous=battleMvpHtml;
  battleMvpHtml=function(w){
    const design=Object.prototype.hasOwnProperty.call(designs,w.mvpStyle)?designs[w.mvpStyle]:null;
    if(!design)return previous(w);
    const key=w.mvpStyle, safe=VyraSafe;
    const art='assets/mvp-celebrations/'+key+'.svg';
    const photo=design.photo||{left:29,top:24,width:42,height:42};
    const duration=finite(w.mvpDuration||10,10,2,15);
    return `<div class="widget battle-mvp mvp-celebration mvc-${key}${selected===w.id?' selected':''}" data-id="${safe.text(w.id)}" style="left:${finite(w.x,0,-10000,10000)}px;top:${finite(w.y,0,-10000,10000)}px;width:${finite(w.width||400,400,100,2000)}px;zoom:${finite(w.widgetScale||1,1,.1,5)};--mvc-duration:${duration}s;--mvc-accent:${design.accent};--mvc-photo-left:${photo.left}%;--mvc-photo-top:${photo.top}%;--mvc-photo-width:${photo.width}%;--mvc-photo-height:${photo.height}%">
      <div class="mvc-stage"><div class="mvc-charge" aria-hidden="true">${field(key,'launch')}</div>
      <div class="mvc-flare" aria-hidden="true"></div>
      <div class="mvc-portrait"><img src="${safe.url(w.profileImage,'assets/images/test-profile.svg')}" alt=""></div>
      <img class="mvc-art mvc-art-left" src="${art}" alt=""><img class="mvc-art mvc-art-right" src="${art}" alt="">
      <div class="mvc-copy"><small style="display:${w.mvpShowLabel===false?'none':'block'}">${safe.text(battleMvpLabel(w),'MVP')}</small><h2 style="display:${w.mvpShowName===false?'none':'block'}">${safe.text(w.mvpName,'TestAlpha')}</h2></div>
      <div class="mvc-hold" aria-hidden="true">${field(key,'hold')}</div>
      <div class="mvc-finale" aria-hidden="true">${field(key,'exit')}</div></div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
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
    const css=document.createElement('link');css.rel='stylesheet';css.href='battle-mvp-celebrations.css?v=20260913-motion';css.dataset.mvpCelebrations='1';document.head.append(css);
  }
  const previewRuns=new WeakMap();
  function preview(stage){
    // A preview owns only its detached draft DOM. Never invoke triggerBattleMvp:
    // that function updates winners, saves layouts and starts real overlay alerts.
    const box=stage?.matches('.overlay-live-preview-stage')&&stage.querySelector('.mvp-celebration');
    if(!box||document.documentElement.classList.contains('overlay-output')||document.querySelector('.overlay-mode'))return false;
    const run=(previewRuns.get(box)||0)+1;previewRuns.set(box,run);
    box.classList.add('mvc-preview','mvc-preview-loading');
    box.classList.remove('mvp-active');
    const ready=[...box.querySelectorAll('img')].map(img=>typeof img.decode==='function'?img.decode().catch(()=>{}):Promise.resolve());
    Promise.all(ready).then(()=>{
      if(!box.isConnected||previewRuns.get(box)!==run)return;
      box.classList.remove('mvc-preview-loading');
      void box.offsetWidth;
      box.classList.add('mvp-active');
    });
    return true;
  }
  root.VyraMvpCelebrations={designs,preview};
  // The sibling arrives after the first render; refresh existing widgets and catalog once.
  if(typeof render==='function')render();
})(window);
