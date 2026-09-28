/* Heart Fireworks — gåvoeffekt (modell 2). Fyrverkeri där skotten formar hjärtan i olika färger
   runt ett stort guldskott. Egen ren canvas-partikelmotor (samma som den godkända prototypen
   2026-09-28), transparent-vänliga svansar (linje förra->nu, aldrig fade-fill av hela duken).
   Högt combo blir ALDRIG brus: max ~12 tydliga hjärtan + en x N-räknare. Monteras i
   .heart-fireworks-fx[data-id], triggas av window.triggerHeartFireworks; livevägen i
   heart-fireworks-session.js. Degraderar tyst utan canvas/WAAPI (jsdom) — hf-play + räknare
   byggs ändå så livevägen är testbar. */
(()=>{
  'use strict';
  const rnd=(a,b)=>a+Math.random()*(b-a), lerp=(a,b,t)=>a+(b-a)*t;
  const HEART_COLORS=['#4aa3ff','#49e06a','#ff4d4d','#ff7ab8','#ffd24a','#9a7bff'];
  const pick=()=>HEART_COLORS[(Math.random()*HEART_COLORS.length)|0];
  function anim(el,frames,opts){
    if(typeof el.animate==='function')return el.animate(frames,opts);
    const last=frames[frames.length-1]||{};if(last.transform!=null)el.style.transform=last.transform;if(last.opacity!=null)el.style.opacity=last.opacity;
    const o={onfinish:null};setTimeout(()=>{try{o.onfinish&&o.onfinish();}catch(_){}},(opts&&opts.delay||0));return o;
  }

  function hfCtrl(host){
    const cv=document.createElement('canvas');cv.className='hf-canvas';host.appendChild(cv);
    const ctx=cv.getContext&&cv.getContext('2d');
    let W=0,H=0,dpr=1,parts=[],rockets=[],flashes=[],rings=[],raf=false,timers=[],cf=0;
    function resize(){const r=host.getBoundingClientRect();W=r.width||host.clientWidth||0;H=r.height||host.clientHeight||0;if(!ctx)return;dpr=Math.min(2,window.devicePixelRatio||1);cv.width=Math.max(1,W*dpr);cv.height=Math.max(1,H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
    const later=(fn,ms)=>{const t=setTimeout(fn,ms);timers.push(t);return t;};
    function spark(x,y,vx,vy,c,s,life,g){parts.push({x,y,px:x,py:y,vx,vy,c,s,life,max:life,g:g==null?.028:g,drag:.986});}
    function flash(x,y,r,color){flashes.push({x,y,r,life:18,max:18,color:color||'#ffffff'});on();}
    function ring(x,y,r,color){rings.push({x,y,r,life:26,max:26,color:color||'#ffffff'});on();}
    function on(){if(ctx&&!raf&&typeof requestAnimationFrame==='function'){raf=true;requestAnimationFrame(frame);}}
    function heartBurst(cx,cy,scale,color,n){
      if(!ctx)return;
      flash(cx,cy,scale*4.2,color);flash(cx,cy,scale*2.0,'#ffffff');ring(cx,cy,scale*5.5,color);
      const light=n<80;
      for(let i=0;i<n;i++){const t=(i/n)*Math.PI*2;const hx=16*Math.pow(Math.sin(t),3);const hy=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);const sp=scale*rnd(0.9,1.08);const vx=(hx/16)*sp,vy=-(hy/16)*sp;spark(cx,cy,vx,vy,color,rnd(1.5,2.8),rnd(66,110),0.03);if(!light)spark(cx,cy,vx*rnd(.92,1.05),vy*rnd(.92,1.05),'#ffffff',rnd(.8,1.5),rnd(24,46),0.02);if(!light&&Math.random()<0.5)spark(cx,cy,vx*0.7,vy*0.7,color,rnd(1,1.9),rnd(30,62),0.028);}
      const core=light?14:44;for(let i=0;i<core;i++){const a=rnd(0,Math.PI*2),s=rnd(.5,3.4);spark(cx,cy,Math.cos(a)*s,Math.sin(a)*s,color,rnd(1.8,3.2),rnd(18,38),0.02);}
      if(!light)for(let k=0;k<4;k++){later(()=>{const ox=cx+rnd(-scale*7,scale*7),oy=cy+rnd(-scale*6,scale*6);flash(ox,oy,scale*1.3,'#ffffff');for(let i=0;i<16;i++){const a=rnd(0,Math.PI*2),s=rnd(.5,2.4);spark(ox,oy,Math.cos(a)*s,Math.sin(a)*s,color,rnd(1,2),rnd(12,24),0.02);}},rnd(130,360));}
      on();
    }
    function chrysanthemum(cx,cy,scale,color){
      if(!ctx)return;
      flash(cx,cy,scale*6.5,'#fff6d8');flash(cx,cy,scale*3,'#ffffff');ring(cx,cy,scale*8,'#ffe6a6');
      const n=260;for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2+rnd(-0.03,0.03);const sp=scale*rnd(0.6,1.05);spark(cx,cy,Math.cos(a)*sp,Math.sin(a)*sp,color,rnd(1.7,3),rnd(80,128),0.028);}
      for(let i=0;i<n*0.5;i++){const a=rnd(0,Math.PI*2),sp=scale*rnd(0.2,0.6);spark(cx,cy,Math.cos(a)*sp,Math.sin(a)*sp,'#fff6d8',rnd(1.5,2.6),rnd(45,90),0.022);}
      for(let i=0;i<66;i++){const a=rnd(0,Math.PI*2),sp=scale*rnd(0.35,0.8);spark(cx,cy,Math.cos(a)*sp,Math.sin(a)*sp*0.7,'#ffe6a6',rnd(1.6,2.4),rnd(120,175),0.06);}
      on();
    }
    function rocket(tx,ty,onBurst){if(!ctx||typeof requestAnimationFrame!=='function'){onBurst&&onBurst();return;}rockets.push({x:tx,y:H+6,ty,onBurst});on();}
    function frame(){
      if(!ctx){raf=false;return;}
      ctx.clearRect(0,0,W,H);ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
      for(let i=flashes.length-1;i>=0;i--){const f=flashes[i];f.life--;if(f.life<=0){flashes.splice(i,1);continue;}const a=f.life/f.max,rr=f.r*(1.7-a*0.7);const g=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,rr);g.addColorStop(0,f.color);g.addColorStop(0.5,f.color+'00');g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalAlpha=a*0.92;ctx.fillStyle=g;ctx.beginPath();ctx.arc(f.x,f.y,rr,0,7);ctx.fill();}
      for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.life--;if(r.life<=0){rings.splice(i,1);continue;}const pr=1-r.life/r.max,rad=r.r*(0.15+pr*1.0),a=r.life/r.max;ctx.globalAlpha=a*0.88;ctx.strokeStyle=r.color;ctx.lineWidth=Math.max(1,4*a);ctx.beginPath();ctx.arc(r.x,r.y,rad,0,7);ctx.stroke();}
      for(let i=rockets.length-1;i>=0;i--){const r=rockets[i];r.py=r.y;r.y-=Math.max(6,H/70);ctx.strokeStyle='#ffe9b0';ctx.globalAlpha=.9;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(r.x,r.py);ctx.lineTo(r.x,r.y);ctx.stroke();if(Math.random()<.6)spark(r.x+rnd(-1,1),r.y+rnd(2,8),rnd(-.3,.3),rnd(.4,1.2),'#ffd88a',rnd(1,1.8),rnd(10,20),0.02);if(r.y<=r.ty){rockets.splice(i,1);r.onBurst&&r.onBurst();}}
      for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.px=p.x;p.py=p.y;p.vx*=p.drag;p.vy=p.vy*p.drag+p.g;p.x+=p.vx;p.y+=p.vy;p.life--;if(p.life<=0){parts.splice(i,1);continue;}let a=Math.max(0,p.life/p.max);if(p.life<26)a*=(0.5+0.5*Math.random());ctx.strokeStyle=p.c;ctx.globalAlpha=a*0.30;ctx.lineWidth=p.s*3.6;ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.globalAlpha=a*0.7;ctx.lineWidth=p.s*1.9;ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.globalAlpha=Math.min(1,a*1.15);ctx.lineWidth=Math.max(0.8,p.s*0.8);ctx.strokeStyle='#fffbe8';ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(p.x,p.y);ctx.stroke();}
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
      if(parts.length||rockets.length||flashes.length||rings.length)requestAnimationFrame(frame);else raf=false;
    }
    function comboBadge(cx,cy,n,S){const el=document.createElement('div');el.className='hf-combo';el.style.fontSize=Math.round(S*(0.085+cf*0.06))+'px';el.style.left=cx+'px';el.style.top=cy+'px';el.textContent='×1';host.appendChild(el);anim(el,[{transform:'translate(-50%,-50%) scale(.3)',opacity:0},{transform:'translate(-50%,-50%) scale(1.15)',opacity:1,offset:.5},{transform:'translate(-50%,-50%) scale(1)',opacity:1}],{duration:440,easing:'cubic-bezier(.16,.9,.3,1)',fill:'forwards'});if(typeof requestAnimationFrame==='function'&&typeof performance!=='undefined'){const t0=performance.now(),dur=760;(function tick(){const p=Math.min(1,(performance.now()-t0)/dur);el.textContent='×'+Math.max(1,Math.round(p*n));if(p<1)requestAnimationFrame(tick);else el.textContent='×'+n;})();}else el.textContent='×'+n;later(()=>anim(el,[{opacity:1},{opacity:0}],{duration:600,easing:'ease-out',fill:'forwards'}).onfinish=()=>el.remove(),2700);}
    function fire(o){
      resize();if(!W||!H){W=W||320;H=H||569;}
      host.classList.add('hf-play');
      const c=Math.max(1,Math.min(100,o.combo||1));cf=(c-1)/99;
      const S=Math.min(W,H);
      if(c===1){rocket(W*0.5,H*0.44,()=>heartBurst(W*0.5,H*0.44,S*0.017*1.4,pick(),170));return;}
      const hearts=Math.min(c,12),perN=110;
      if(o.gold&&c>=15)rocket(W*0.5,H*0.5,()=>chrysanthemum(W*0.5,H*0.5,S*(0.02+cf*0.006),'#ffe6a6'));
      const spots=[[.26,.26],[.74,.24],[.16,.5],[.84,.52],[.36,.7],[.66,.7],[.5,.34],[.5,.82],[.22,.66],[.8,.66],[.4,.5],[.6,.46]];
      for(let i=0;i<hearts;i++){const p=spots[i%spots.length];later(()=>rocket(W*p[0],H*p[1],()=>heartBurst(W*p[0],H*p[1],S*0.017*lerp(1.15,0.95,cf)*rnd(0.9,1.1),pick(),perN)),(i/hearts)*1900+rnd(0,60));}
      if(o.showCombo&&c>1)comboBadge(W*0.5,H*0.13,c,S);
    }
    function previewStill(){resize();if(!W||!H){W=W||160;H=H||284;}heartBurst(W*0.5,H*0.5,Math.min(W,H)*0.02,pick(),90);}
    function clear(){timers.forEach(clearTimeout);timers=[];parts=[];rockets=[];flashes=[];rings=[];host.classList.remove('hf-play');if(ctx)ctx.clearRect(0,0,W,H);host.querySelectorAll('.hf-combo').forEach(n=>n.remove());}
    return {fire,previewStill,clear,resize};
  }
  function hostCtrl(host){return host._hf||(host._hf=hfCtrl(host));}

  // ---------- widget shell ----------
  const oldWh=wh;wh=function(w){if(w.type!=='templateHeartFireworks')return oldWh(w);
    const width=w.width||320,height=Math.round(width*16/9);
    return `<div class="widget templateHeartFireworks${selected===w.id?' selected':''}" data-id="${w.id}" style="left:${w.x||0}px;top:${w.y||0}px;width:${width}px;height:${height}px"><div class="heart-fireworks-fx"></div><span class="resize-handle">↘</span></div>`;
  };

  // ---------- panel ----------
  const oldProps=props;props=function(){let w=liveWidget(selected);if(!w||w.type!=='templateHeartFireworks')return oldProps();
    return `<h3>HEART FIREWORKS</h3><div class="template-badge">GÅVOR · TRANSPARENT</div><div hidden><input id="pt" value="Heart Fireworks"><input id="pv" value=""></div>`+
    `<div class="property-group"><h4>TRIGGER</h4><label>Minsta gåvovärde (mynt)<input id="hfMin" type="number" min="1" value="${w.hfMin||1}"></label><small>Gåvor under gränsen tänder inga fyrverkerier.</small><label><input id="hfExcludeAnon" type="checkbox" ${w.hfExcludeAnon?'checked':''}> Exkludera anonyma tittare</label></div>`+
    `<div class="property-group"><h4>DESIGN</h4><label><input id="hfGold" type="checkbox" ${w.hfGold===false?'':'checked'}> Guldskott i mitten (från combo ×15)</label><label><input id="hfShowCombo" type="checkbox" ${w.hfShowCombo===false?'':'checked'}> Combo-räknare (×N)</label></div>`+
    `<div class="property-group fw-premium-motion"><h4>TEST</h4><label class="fw-combo-control">Antal testgåvor (combo)<input id="hfCombo" type="number" min="1" max="100" value="${w.hfCombo||1}"></label><button type="button" id="testHf">▶ Testa Heart Fireworks</button></div>`+
    `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x||0}"></label><label>Y<input id="propY" type="number" value="${w.y||0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width||320}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer||1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- catalog + bindings ----------
  const oldBind=bind;bind=function(){oldBind();if(view!=='editor'&&view!=='overlay')return;
    let cat=document.querySelector('.widget-catalog');
    if(cat&&!cat.querySelector('[data-hf]')){let s=document.createElement('section');s.dataset.hf='1';
      s.innerHTML=`<h4>HEART FIREWORKS · 1 DESIGN</h4><button data-hf-create="1"><i class="vyra-pro-icon">${(window.vyraCatalogIcon?vyraCatalogIcon('bolt'):'✦')}</i><span><b>Heart Fireworks</b><small>Skott formar hjärtan · guldskott i mitten</small></span></button>`;
      cat.prepend(s);
      s.querySelector('[data-hf-create]').onclick=()=>{const created=VyraWidgets.create('catalog:heartfireworks');state.widgets.push(created);selected=created.id;save();render();if(window.toast)toast('Heart Fireworks skapad');};
    }
    let w=liveWidget(selected);if(!w||w.type!=='templateHeartFireworks')return;
    const set=(id,key,bool=false)=>{let e=document.querySelector(id);if(e)e.onchange=x=>{w[key]=bool?x.target.checked:(x.target.type==='number'?+x.target.value:x.target.value);save();render();};};
    set('#hfMin','hfMin');set('#hfGold','hfGold',true);set('#hfShowCombo','hfShowCombo',true);set('#hfExcludeAnon','hfExcludeAnon',true);
    let hc=document.querySelector('#hfCombo');if(hc)hc.onchange=e=>{w.hfCombo=Math.max(1,Math.min(100,+e.target.value||1));save();};
  };
  document.addEventListener('click',ev=>{if(!ev.target.closest('#testHf'))return;ev.preventDefault();let w=liveWidget(selected,'templateHeartFireworks');if(!w)return window.toast&&toast('Välj Heart Fireworks på canvasen först');const combo=Math.max(1,Math.min(100,+document.querySelector('#hfCombo')?.value||w.hfCombo||1));window.triggerHeartFireworks({combo,giftName:'Rose',__test:true});},true);

  // ---------- catalog preview ----------
  function hfRenderPreview(host,w){if(!host)return;const ctrl=hostCtrl(host);ctrl.clear();host.style.setProperty('opacity','1','important');ctrl.previewStill();}
  window.VyraHeartFireworksFx={renderPreview:hfRenderPreview};

  // ---------- live trigger ----------
  const hfAntal=d=>Math.max(1,Math.floor(Number(d.combo??d.repeatcount??d.count)||1));
  const hfComboOf=d=>Math.min(100,hfAntal(d));
  const hfBelopp=d=>[d.coins,d.value,d.diamondCount].map(Number).find(n=>Number.isFinite(n)&&n>0);
  function hfSlapper(w,d){if(d.__test)return true;if(w.hfExcludeAnon&&d.isAnonymous)return false;const b=hfBelopp(d);return b===undefined||b>=(w.hfMin||1);}
  const hfSedda=new Map(),HF_SPARR=1500;
  function hfRedan(d){const id=d&&d.id;if(!id)return false;const nu=Date.now();for(const[k,t]of hfSedda)if(nu-t>HF_SPARR)hfSedda.delete(k);const key=String(id);if(hfSedda.has(key))return true;hfSedda.set(key,nu);return false;}
  function hfTrigger(input){const d=(input&&typeof input==='object')?input:{combo:input};
    if(hfRedan(d))return false;
    const hits=state.widgets.filter(x=>x.type==='templateHeartFireworks'&&!x.hidden&&hfSlapper(x,d));
    if(!hits.length)return false;
    let fired=false;
    hits.forEach(w=>{const host=document.querySelector(`[data-id="${w.id}"] .heart-fireworks-fx`);if(!host)return;
      hostCtrl(host).fire({combo:hfComboOf(d),gold:w.hfGold!==false,showCombo:w.hfShowCombo!==false});fired=true;});
    return fired;
  }
  window.triggerHeartFireworks=hfTrigger;

  window.addEventListener('vyra-session-ended',()=>{hfSedda.clear();document.querySelectorAll('.heart-fireworks-fx').forEach(h=>{if(h._hf)h._hf.clear();});});
  render();
})();
