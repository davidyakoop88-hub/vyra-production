/* Gift Bubbles — gåvoeffekt, systerwidget till Gift Fireworks.
   Egen per-värd canvas+DOM-partikelmotor (samma motor/kvalitet som den godkända prototypen
   2026-09-28). Monteras i .gift-bubbles-fx[data-id], triggas av window.triggerGiftBubbles.
   Livevägen ligger i gift-bubbles-session.js (fångar routeLiveBattleEvent) — samma recept
   som gift-fireworks-session.js. Coins/värde är avstängt i grafiken (Davids regel).
   Motorn degraderar tyst utan canvas/WAAPI (jsdom): DOM byggs ändå, så livevägen är testbar. */
(()=>{
  'use strict';
  const rnd=(a,b)=>a+Math.random()*(b-a), lerp=(a,b,t)=>a+(b-a)*t;
  const SIZE={s:0.7,m:1.0,l:1.45};
  // Riktig standardgåva — samma fil och samma reservkedja som Gift Fireworks (FW_GIFT), så en
  // gåva UTAN förresolvad bild (editor-test, eller ett live-event som saknar bild) ändå visar en
  // riktig gåva i stället för en tecknad platshållare. Kedja: skickad bild → widgetens reservbild
  // → 0001_Rose.png. SVG:n är sista utväg om VyraSafe kastar allt (aldrig i praktiken).
  const GB_GIFT='assets/gifts/events/0001_Rose.png';
  const GB_GIFT_SVG=`<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="9.2" width="18" height="12" rx="1.6" fill="#ff9ecb" stroke="#d15c95" stroke-width="1"/><rect x="2" y="6.4" width="20" height="4.1" rx="1.1" fill="#ffc2df" stroke="#d15c95" stroke-width="1"/><rect x="10.5" y="6.4" width="3" height="14.8" fill="#ffe066"/><path d="M12 6.4c-1.1-3.3-5.4-3.6-5.4-1 0 1.9 3.5 1.8 5.4 1zM12 6.4c1.1-3.3 5.4-3.6 5.4-1 0 1.9-3.5 1.8-5.4 1z" fill="#ffe066" stroke="#e0a83a" stroke-width=".7"/></svg>`;
  const giftHtml=(url,fallback)=>{const src=window.VyraSafe?VyraSafe.src(url,VyraSafe.src(fallback,GB_GIFT)):(url||fallback||GB_GIFT);return src?`<img alt="" src="${src}">`:GB_GIFT_SVG;};
  // WAAPI when available, graceful final-frame fallback otherwise (jsdom har ingen Element.animate).
  function anim(el,frames,opts){
    if(typeof el.animate==='function'){return el.animate(frames,opts);}
    const last=frames[frames.length-1]||{};
    if(last.transform!=null)el.style.transform=last.transform;
    if(last.opacity!=null)el.style.opacity=last.opacity;
    const o={onfinish:null};setTimeout(()=>{try{o.onfinish&&o.onfinish();}catch(_){}}, (opts&&opts.delay||0));return o;
  }

  // ---------- per-host engine ----------
  function gbCtrl(host){
    const cv=document.createElement('canvas');cv.className='gb-canvas';host.appendChild(cv);
    const ctx=cv.getContext&&cv.getContext('2d');
    let W=0,H=0,dpr=1,parts=[],raf=false,timers=[],cf=0;
    const COL=['#ffffff','#ffd9f2','#c9a9ff','#8fe3ff','#ffe9b0','#ff9ed6'];
    function resize(){const r=host.getBoundingClientRect();W=r.width||host.clientWidth||0;H=r.height||host.clientHeight||0;if(!ctx)return;dpr=Math.min(2,window.devicePixelRatio||1);cv.width=Math.max(1,W*dpr);cv.height=Math.max(1,H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
    const later=(fn,ms)=>{const t=setTimeout(fn,ms);timers.push(t);return t;};
    // canvas particles (additive glow) — skipped entirely without a 2d context
    function spark(x,y,vx,vy,c,s,life,g){parts.push({x,y,vx,vy,c,s,life,max:life,g:g==null?.05:g,drag:.985});}
    function on(){if(ctx&&!raf&&typeof requestAnimationFrame==='function'){raf=true;requestAnimationFrame(frame);}}
    function boom(x,y,n){if(!ctx)return;for(let i=0;i<n;i++){const a=rnd(0,6.283),sp=rnd(1.2,7)*(Math.random()<.3?1.6:1);spark(x,y,Math.cos(a)*sp,Math.sin(a)*sp,COL[Math.random()*COL.length|0],rnd(1.3,3.4),rnd(46,100),.05);}for(let i=0;i<n*.22;i++){const a=rnd(0,6.283),sp=rnd(.4,2.4);spark(x,y,Math.cos(a)*sp,Math.sin(a)*sp,'#fff',rnd(1.6,3),rnd(16,32),.02);}on();}
    function converge(x,y,reach,n){if(!ctx)return;for(let i=0;i<n;i++){const a=rnd(0,6.283),R=reach*rnd(.8,1.25),px=x+Math.cos(a)*R,py=y+Math.sin(a)*R,k=1/rnd(16,26);spark(px,py,(x-px)*k,(y-py)*k,COL[Math.random()*COL.length|0],rnd(1.2,2.8),rnd(18,28),0);}on();}
    function frame(){if(!ctx){raf=false;return;}ctx.clearRect(0,0,W,H);ctx.globalCompositeOperation='lighter';for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.vx*=p.drag;p.vy=p.vy*p.drag+p.g;p.x+=p.vx;p.y+=p.vy;p.life--;if(p.life<=0){parts.splice(i,1);continue;}const a=Math.max(0,p.life/p.max);ctx.globalAlpha=a;ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.s,0,7);ctx.fill();}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';if(parts.length)requestAnimationFrame(frame);else raf=false;}
    // DOM pop fx
    function ring(cx,cy,size){const r=document.createElement('div');r.className='gb-ring';const s=size*0.6;r.style.cssText=`width:${s}px;height:${s}px;left:${cx-s/2}px;top:${cy-s/2}px`;host.appendChild(r);anim(r,[{transform:'scale(.3)',opacity:.85},{transform:'scale(2.6)',opacity:0}],{duration:560,easing:'cubic-bezier(.2,.6,.2,1)'}).onfinish=()=>r.remove();}
    function flash(cx,cy,size){const f=document.createElement('div');f.className='gb-flash';const s=size*1.5;f.style.cssText=`width:${s}px;height:${s}px;left:${cx-s/2}px;top:${cy-s/2}px`;host.appendChild(f);anim(f,[{transform:'scale(.4)',opacity:.9},{transform:'scale(1.1)',opacity:0}],{duration:300,easing:'ease-out'}).onfinish=()=>f.remove();}
    function shards(cx,cy,reach,count){for(let i=0;i<count;i++){const r=Math.random(),shape=r<0.44?'gb-h':(r<0.82?'gb-s':'gb-r');const s=shape==='gb-r'?rnd(4,9):rnd(reach*0.12,reach*0.24);const el=document.createElement('div');el.className='gb-shard '+shape;el.style.cssText=`width:${s}px;height:${s}px;left:${cx-s/2}px;top:${cy-s/2}px`;host.appendChild(el);const ang=rnd(0,6.283),dist=rnd(reach*0.4,reach*1.15),dx=Math.cos(ang)*dist,dy=Math.sin(ang)*dist,rot=rnd(-160,160);anim(el,[{transform:'translate(0,0) scale(.3) rotate(0deg)',opacity:0,offset:0},{transform:`translate(${dx*.5}px,${dy*.5}px) scale(1) rotate(${rot*.5}deg)`,opacity:1,offset:.22},{transform:`translate(${dx}px,${dy+reach*0.28}px) scale(.85) rotate(${rot}deg)`,opacity:0,offset:1}],{duration:rnd(820,1300),easing:'cubic-bezier(.12,.6,.25,1)'}).onfinish=()=>el.remove();}}
    function pop(el,cx,cy,size){ring(cx,cy,size);flash(cx,cy,size);boom(cx,cy,Math.round(34*(1+cf*1.3)));shards(cx,cy,size*0.95,Math.round(10+cf*10));const t=el._t||'';anim(el,[{transform:t+' scale(1,1)',opacity:1,offset:0},{transform:t+' scale(1.12,.9)',opacity:1,offset:.3},{transform:t+' scale(1.3)',opacity:0,offset:1}],{duration:380,easing:'cubic-bezier(.2,.5,.2,1)'}).onfinish=()=>el.remove();}
    function comboBadge(cx,cy,n,S){const el=document.createElement('div');el.className='gb-combo';el.style.fontSize=Math.round(S*(0.14+cf*0.12))+'px';el.style.left=cx+'px';el.style.top=cy+'px';el.textContent='×1';host.appendChild(el);anim(el,[{transform:'translate(-50%,-50%) scale(.3)',opacity:0},{transform:'translate(-50%,-50%) scale(1.15)',opacity:1,offset:.5},{transform:'translate(-50%,-50%) scale(1)',opacity:1}],{duration:420,easing:'cubic-bezier(.16,.9,.3,1)',fill:'forwards'});if(typeof requestAnimationFrame==='function'&&typeof performance!=='undefined'){const t0=performance.now(),dur=700;(function tick(){const p=Math.min(1,(performance.now()-t0)/dur);el.textContent='×'+Math.max(1,Math.round(p*n));if(p<1)requestAnimationFrame(tick);else el.textContent='×'+n;})();}else el.textContent='×'+n;later(()=>anim(el,[{opacity:1},{opacity:0}],{duration:500,easing:'ease-out',fill:'forwards'}).onfinish=()=>el.remove(),2600);}
    function riseOne(delay,o){
      const d=Math.random();
      const heart=o.hearts&&Math.random()<0.3;
      const gift=!heart&&o.giftIn;
      const base=(heart?lerp(0.08,0.15,d):(gift?lerp(0.09,0.16,d):lerp(0.05,0.15,d)));
      const size=H*base*o.mult*lerp(1.5,0.9,cf);
      const el=document.createElement('div');el.className=heart?'gb-heart':'gb-orb';el.style.width=size+'px';el.style.height=size+'px';
      if(gift){const g=document.createElement('div');g.className='gb-gift';g.innerHTML=o.giftEl;el.appendChild(g);}
      const x=rnd(size*0.4,Math.max(size,W-size*1.4)),startY=H+size*0.4,topY=rnd(H*0.15,H*0.44);
      el.style.left='0';el.style.top='0';el.style.opacity='0';el.style.filter=d<0.8?`blur(${(1-d)*2.4}px)`:'none';
      el.style.transform=`translate(${x}px, ${startY}px) rotate(0deg)`;
      const peakOp=lerp(.45,1,d),dur=lerp(4000,2600,d),sway=rnd(14,44)*(Math.random()<.5?-1:1),spin=heart?0:rnd(-8,8);
      host.appendChild(el);
      anim(el,[
        {transform:`translate(${x}px, ${startY}px) rotate(0deg)`,opacity:0},
        {transform:`translate(${x+sway*.5}px, ${lerp(startY,topY,.28)}px) rotate(${spin*.3}deg)`,opacity:peakOp,offset:.18},
        {transform:`translate(${x-sway*.5}px, ${lerp(startY,topY,.62)}px) rotate(${spin*.7}deg)`,opacity:peakOp,offset:.6},
        {transform:`translate(${x+sway*.3}px, ${topY}px) rotate(${spin}deg)`,opacity:peakOp}
      ],{duration:dur,delay,easing:'cubic-bezier(.32,.5,.35,1)',fill:'forwards'}).onfinish=()=>{el._t=`translate(${x+sway*.3}px, ${topY}px) rotate(${spin}deg)`;pop(el,x+size/2,topY+size/2,size);};
    }
    function fire(o){
      resize(); if(!W||!H){W=W||320;H=H||569;}
      host.classList.add('gb-play');
      const c=Math.max(1,Math.min(100,o.combo||1)); cf=(c-1)/99;
      const S=Math.min(W,H), mult=SIZE[o.size]||1;
      const gEl=giftHtml(o.gift,o.fallback);
      const total=Math.min(24, Math.round(3+cf*30));
      const gap=200-cf*150;
      for(let i=0;i<total;i++) riseOne(i*rnd(gap*0.5,gap), {hearts:o.hearts,giftIn:o.giftIn,giftEl:gEl,mult});
      if(o.showCombo&&c>1) comboBadge(W*0.5,H*0.13,c,S);
    }
    function previewStill(o){ // static snapshot for catalog cards — synchronous canvas so it shows
      // in the shadow-DOM thumbnail regardless of stylesheet reach or animation timing.
      resize(); const w=Math.max(60,W||160), h=Math.max(100,H||284);
      cv.style.width=w+'px';cv.style.height=h+'px';cv.width=w;cv.height=h;
      if(!ctx)return; ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,w,h);
      const bubble=(bx,by,r)=>{const g=ctx.createRadialGradient(bx-r*0.35,by-r*0.35,r*0.1,bx,by,r);
        g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.45,'rgba(190,150,255,.5)');g.addColorStop(1,'rgba(120,90,200,.12)');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(bx,by,r,0,7);ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=Math.max(1,r*0.06);ctx.stroke();};
      bubble(w*0.34,h*0.58,h*0.14);bubble(w*0.62,h*0.46,h*0.17);bubble(w*0.48,h*0.74,h*0.1);
    }
    function clear(){timers.forEach(clearTimeout);timers=[];parts=[];host.classList.remove('gb-play');if(ctx)ctx.clearRect(0,0,W,H);host.querySelectorAll('.gb-orb,.gb-heart,.gb-shard,.gb-ring,.gb-flash,.gb-hero,.gb-giftback,.gb-combo').forEach(n=>n.remove());}
    return {fire,previewStill,clear,resize};
  }
  function hostCtrl(host){return host._gb||(host._gb=gbCtrl(host));}

  // ---------- widget shell (wh) ----------
  const oldWh=wh;wh=function(w){if(w.type!=='templateGiftBubbles')return oldWh(w);
    const width=w.width||320,height=Math.round(width*16/9);
    return `<div class="widget templateGiftBubbles${selected===w.id?' selected':''}" data-id="${w.id}" style="left:${w.x||0}px;top:${w.y||0}px;width:${width}px;height:${height}px"><div class="gift-bubbles-fx" data-gb-size="${w.gbSize||'m'}"></div><span class="resize-handle">↘</span></div>`;
  };

  // ---------- panel (props) ----------
  const oldProps=props;props=function(){let w=liveWidget(selected);if(!w||w.type!=='templateGiftBubbles')return oldProps();
    const sizeOpt=(v,l)=>`<option value="${v}" ${((w.gbSize||'m')===v)?'selected':''}>${l}</option>`;
    return `<h3>GIFT BUBBLES</h3><div class="template-badge">GÅVOR · TRANSPARENT</div><div hidden><input id="pt" value="Gift Bubbles"><input id="pv" value=""></div>`+
    `<div class="property-group"><h4>TRIGGER</h4><label>Minsta gåvovärde (mynt)<input id="gbMin" type="number" min="1" value="${w.gbMin||1}"></label><small>Gåvor under gränsen tänder inga bubblor.</small><label><input id="gbExcludeAnon" type="checkbox" ${w.gbExcludeAnon?'checked':''}> Exkludera anonyma tittare</label></div>`+
    `<div class="property-group"><h4>DESIGN</h4><label>Grundstorlek<select id="gbSize">${sizeOpt('s','Liten')}${sizeOpt('m','Mellan')}${sizeOpt('l','Stor')}</select></label><label><input id="gbGiftIn" type="checkbox" ${w.gbGiftIn===false?'':'checked'}> Gåva i bubblorna</label><label><input id="gbHearts" type="checkbox" ${w.gbHearts===false?'':'checked'}> Hjärtbubblor</label><label><input id="gbShowCombo" type="checkbox" ${w.gbShowCombo===false?'':'checked'}> Combo-räknare (×N)</label></div>`+
    `<div class="property-group"><h4>BILDER</h4><label>Reservbild för gåva<input id="gbGiftImage" value="${(window.VyraSafe?VyraSafe.text(w.gbGiftImage||''):(w.gbGiftImage||''))}"></label><small>Används vid test och när gåvan saknar bild. Vid live visas den skickade gåvan.</small></div>`+
    `<div class="property-group fw-premium-motion"><h4>TEST</h4><label class="fw-combo-control">Antal testgåvor (combo)<input id="gbCombo" type="number" min="1" max="100" value="${w.gbCombo||1}"></label><button type="button" id="testGb">▶ Testa Gift Bubbles</button></div>`+
    `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x||0}"></label><label>Y<input id="propY" type="number" value="${w.y||0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width||320}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer||1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- catalog + bindings ----------
  const oldBind=bind;bind=function(){oldBind();if(view!=='editor'&&view!=='overlay')return;
    let cat=document.querySelector('.widget-catalog');
    if(cat&&!cat.querySelector('[data-gb]')){let s=document.createElement('section');s.dataset.gb='1';
      s.innerHTML=`<h4>GIFT BUBBLES · 1 DESIGN</h4><button data-gb-create="1" data-catalog-key="catalog:giftbubbles"><i class="vyra-pro-icon">${(window.vyraCatalogIcon?vyraCatalogIcon('bolt'):'✦')}</i><span><b>Gift Bubbles</b><small>Bubblor stiger & poppar · storlek följer combo</small></span></button>`;
      cat.prepend(s);
      s.querySelector('[data-gb-create]').onclick=()=>{const created=VyraWidgets.create('catalog:giftbubbles');state.widgets.push(created);selected=created.id;save();render();if(window.toast)toast('Gift Bubbles skapad');};
    }
    let w=liveWidget(selected);if(!w||w.type!=='templateGiftBubbles')return;
    const set=(id,key,bool=false)=>{let e=document.querySelector(id);if(e)e.onchange=x=>{w[key]=bool?x.target.checked:(x.target.type==='number'?+x.target.value:x.target.value);save();render();};};
    set('#gbMin','gbMin');set('#gbSize','gbSize');set('#gbGiftImage','gbGiftImage');
    set('#gbGiftIn','gbGiftIn',true);set('#gbHearts','gbHearts',true);set('#gbShowCombo','gbShowCombo',true);set('#gbExcludeAnon','gbExcludeAnon',true);
    let gc=document.querySelector('#gbCombo');if(gc)gc.onchange=e=>{w.gbCombo=Math.max(1,Math.min(100,+e.target.value||1));save();};
  };
  // Test button goes through the PUBLIC trigger (queue + dup-guard), never a shortcut.
  document.addEventListener('click',ev=>{if(!ev.target.closest('#testGb'))return;ev.preventDefault();let w=liveWidget(selected,'templateGiftBubbles');if(!w)return window.toast&&toast('Välj Gift Bubbles på canvasen först');const combo=Math.max(1,Math.min(100,+document.querySelector('#gbCombo')?.value||w.gbCombo||1));window.triggerGiftBubbles({combo,giftName:'Rose',__test:true});},true);

  // ---------- catalog preview ----------
  function gbRenderPreview(host,w){if(!host)return;const ctrl=hostCtrl(host);ctrl.clear();host.style.setProperty('opacity','1','important');ctrl.previewStill({size:w.gbSize||'m',giftIn:w.gbGiftIn!==false,fallback:w.gbGiftImage});}
  window.VyraGiftBubblesFx={renderPreview:gbRenderPreview};

  // ---------- live trigger ----------
  const gbAntal=d=>Math.max(1,Math.floor(Number(d.combo??d.repeatcount??d.count)||1));
  const gbComboOf=d=>Math.min(100,gbAntal(d));
  const gbBelopp=d=>[d.coins,d.value,d.diamondCount].map(Number).find(n=>Number.isFinite(n)&&n>0);
  function gbSlapper(w,d){if(d.__test)return true;if(w.gbExcludeAnon&&d.isAnonymous)return false;const b=gbBelopp(d);return b===undefined||b>=(w.gbMin||1);}
  const gbSedda=new Map(),GB_SPARR=1500;
  function gbRedan(d){const id=d&&d.id;if(!id)return false;const nu=Date.now();for(const[k,t]of gbSedda)if(nu-t>GB_SPARR)gbSedda.delete(k);const key=String(id);if(gbSedda.has(key))return true;gbSedda.set(key,nu);return false;}
  function gbTrigger(input){const d=(input&&typeof input==='object')?input:{combo:input};
    if(gbRedan(d))return false;
    const hits=state.widgets.filter(x=>x.type==='templateGiftBubbles'&&!x.hidden&&gbSlapper(x,d));
    if(!hits.length)return false;
    let fired=false;
    hits.forEach(w=>{const host=document.querySelector(`[data-id="${w.id}"] .gift-bubbles-fx`);if(!host)return;
      hostCtrl(host).fire({combo:gbComboOf(d),gift:d.giftImage,size:w.gbSize||'m',hearts:w.gbHearts!==false,giftIn:w.gbGiftIn!==false,showCombo:w.gbShowCombo!==false,fallback:w.gbGiftImage});fired=true;});
    return fired;
  }
  window.triggerGiftBubbles=gbTrigger;

  window.addEventListener('vyra-session-ended',()=>{gbSedda.clear();document.querySelectorAll('.gift-bubbles-fx').forEach(h=>{if(h._gb)h._gb.clear();});});
  render();
})();
