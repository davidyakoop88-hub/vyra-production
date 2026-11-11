// Independently animated MVP celebrations. Session and trigger ownership stays in media/session.
(function(root){
  'use strict';
  const designs=VyraWidgets.variants('battlemvp.celebration');
  const FX_TINTS=['auto','gold','violet','white'];
  // Rambilderna (bespoke:'rambild'): sju modeller med fyra malade ramar var. Mattet for varje ram ar uppmatt i
  // bilden (fotoluckans cirkel, namnlisten, MVP-listen) och anges i cqw = andel av ramens bredd.
  // Se "Rambilder" i battle-mvp-celebrations.css.
  const RAMVAL=['a','b','c','d'];
  const RAMMATT = {
    royal: {
      a: '--fx: 22.49cqw; --fy: 48.58cqw; --fd: 24.12cqw; --cx: 34.55%; --cy: 60.64%; --nx: 50.8cqw; --ny: 53.4cqw; --nw: 31.6cqw; --nh: 6.4cqw; --nf: #2a1a05; --nk: #fffdf5; --mk: #fffdf5; --mx: 49cqw; --my: 63.8cqw; --mw: 33cqw; --mh: 6.6cqw; --mf: #6a3fb0;',
      b: '--fx: 31.91cqw; --fy: 32.6cqw; --fd: 36.1cqw; --fk: 8.6%; --cx: 49.96%; --cy: 50.65%; --nx: 25.8cqw; --ny: 65.7cqw; --nw: 49.6cqw; --nh: 8.6cqw; --nf: #fffaf0; --nk: #1a0b3a; --mk: #fff1c0; --mx: 38.4cqw; --my: 77.7cqw; --mw: 23.2cqw; --mh: 6cqw; --mf: #3a1a66;',
      c: '--fx: 32.39cqw; --fy: 31.44cqw; --fd: 35.1cqw; --fk: 9.3%; --cx: 49.94%; --cy: 48.99%; --nx: 25cqw; --ny: 76.6cqw; --nw: 50cqw; --nh: 7.6cqw; --nf: #fffaf0; --nk: #1a0b3a; --mk: #fff1c0; --mx: 41.6cqw; --my: 66cqw; --mw: 16.8cqw; --mh: 6.6cqw; --ms: .46; --mf: #3a1a66;',
      d: '--fx: 15.04cqw; --fy: 35.03cqw; --fd: 27.4cqw; --cx: 28.74%; --cy: 48.73%; --nx: 49cqw; --ny: 43.2cqw; --nw: 38cqw; --nh: 10cqw; --nf: #2a1a05; --nk: #fffdf5; --mk: #1a0b3a; --mx: 47cqw; --my: 56.5cqw; --mw: 33.6cqw; --mh: 6cqw; --mf: #ffe9a8;'
    },
    inferno: {
      a: '--fx: 34.79cqw; --fy: 33.51cqw; --fd: 30.24cqw; --cx: 49.91%; --cy: 48.63%; --nx: 24.4cqw; --ny: 63.8cqw; --nw: 51.8cqw; --nh: 8.8cqw; --nf: #fff1dc; --nk: #1a0804; --mx: 36.6cqw; --my: 74.6cqw; --mw: 27.2cqw; --mh: 4.6cqw; --mf: #3a1404; --mk: #ffe6c8;',
      b: '--fx: 15.16cqw; --fy: 37.22cqw; --fd: 32.16cqw; --cx: 31.24%; --cy: 53.3%; --nx: 53.6cqw; --ny: 47cqw; --nw: 34cqw; --nh: 8.6cqw; --nf: #fff1dc; --nk: #1a0804; --mx: 53cqw; --my: 60.4cqw; --mw: 34.4cqw; --mh: 8.8cqw; --mf: #ffb066; --mk: #1a0804;',
      c: '--fx: 33.35cqw; --fy: 28.66cqw; --fd: 33.14cqw; --cx: 49.92%; --cy: 45.23%; --nx: 22.4cqw; --ny: 70.6cqw; --nw: 55.2cqw; --nh: 10.6cqw; --nf: #fff1dc; --nk: #1a0804; --mx: 40.4cqw; --my: 62.9cqw; --mw: 19.4cqw; --mh: 5.6cqw; --mf: #3a1404; --mk: #ffe6c8;',
      d: '--fx: 12.95cqw; --fy: 36.71cqw; --fd: 26.14cqw; --cx: 26.02%; --cy: 49.78%; --nx: 47cqw; --ny: 45.2cqw; --nw: 43.6cqw; --nh: 8.4cqw; --nf: #fff1dc; --nk: #1a0804; --mx: 43.6cqw; --my: 57.1cqw; --mw: 41cqw; --mh: 4.8cqw; --mf: #3a1404; --mk: #ffe6c8;'
    },
    ice: {
      a: '--fx: 34.41cqw; --fy: 33.3cqw; --fd: 31.04cqw; --fk: 9.3%; --cx: 49.93%; --cy: 48.82%; --nx: 24cqw; --ny: 62.2cqw; --nw: 54cqw; --nh: 9.4cqw; --nf: #f4fbff; --nk: #0a2038; --mx: 36.6cqw; --my: 75.3cqw; --mw: 27.2cqw; --mh: 6cqw; --mf: #12304e; --mk: #ffffff;',
      b: '--fx: 14.68cqw; --fy: 45.88cqw; --fd: 32.04cqw; --cx: 30.7%; --cy: 61.9%; --nx: 52.2cqw; --ny: 49.6cqw; --nw: 34cqw; --nh: 9.8cqw; --nf: #12304e; --nk: #ffffff; --mx: 51.2cqw; --my: 64.4cqw; --mw: 34.8cqw; --mh: 10cqw; --mf: #12304e; --mk: #ffffff;',
      c: '--fx: 33.03cqw; --fy: 29.13cqw; --fd: 33.6cqw; --fk: 12.1%; --cx: 49.83%; --cy: 45.93%; --nx: 21.8cqw; --ny: 69.2cqw; --nw: 56.4cqw; --nh: 10cqw; --nf: #f4fbff; --nk: #0a2038; --mx: 41.4cqw; --my: 62.8cqw; --mw: 17.4cqw; --mh: 5.6cqw; --mf: #12304e; --mk: #ffffff;',
      d: '--fx: 9.8cqw; --fy: 36.17cqw; --fd: 28.8cqw; --cx: 24.2%; --cy: 50.57%; --nx: 45.2cqw; --ny: 44.5cqw; --nw: 44.2cqw; --nh: 8.4cqw; --nf: #f4fbff; --nk: #0a2038; --mx: 43.6cqw; --my: 56.5cqw; --mw: 38.8cqw; --mh: 4.8cqw; --mf: #12304e; --mk: #ffffff;'
    },
    cyber: {
      a: '--fx: 35.95cqw; --fy: 35.72cqw; --fd: 28.08cqw; --fk: 9.4%; --cx: 49.99%; --cy: 49.76%; --nx: 22cqw; --ny: 63.8cqw; --nw: 56cqw; --nh: 9.2cqw; --nf: #eaffff; --nk: #041018; --mx: 35.8cqw; --my: 75.9cqw; --mw: 28.6cqw; --mh: 4.6cqw; --mf: #0a1830; --mk: #ffffff;',
      b: '--fx: 15.15cqw; --fy: 46.91cqw; --fd: 27.72cqw; --cx: 29.01%; --cy: 60.77%; --nx: 47.8cqw; --ny: 49.4cqw; --nw: 39.4cqw; --nh: 9.8cqw; --nf: #fff0ff; --nk: #14041a; --mx: 47.8cqw; --my: 63.4cqw; --mw: 39.4cqw; --mh: 9.6cqw; --mf: #7ff0ff; --mk: #041018;',
      c: '--fx: 35.89cqw; --fy: 30.21cqw; --fd: 28.08cqw; --cx: 49.93%; --cy: 44.25%; --nx: 18.6cqw; --ny: 70.4cqw; --nw: 62.8cqw; --nh: 11.4cqw; --nf: #eaffff; --nk: #041018; --mx: 40cqw; --my: 64.2cqw; --mw: 20.2cqw; --mh: 4.6cqw; --mf: #0a1830; --mk: #ffffff;',
      d: '--fx: 11.48cqw; --fy: 34.67cqw; --fd: 29.28cqw; --cx: 26.12%; --cy: 49.31%; --nx: 46.4cqw; --ny: 43.8cqw; --nw: 43.4cqw; --nh: 10cqw; --nf: #eaffff; --nk: #041018; --mx: 43.8cqw; --my: 57.4cqw; --mw: 38.8cqw; --mh: 4cqw; --mf: #0a1830; --mk: #ffffff;'
    },
    storm: {
      a: '--fx: 32.33cqw; --fy: 28.29cqw; --fd: 35.22cqw; --cx: 49.94%; --cy: 45.9%; --nx: 22.4cqw; --ny: 64.2cqw; --nw: 55.2cqw; --nh: 10.2cqw; --nf: #f4f8ff; --nk: #0a1024; --mx: 31.8cqw; --my: 77.2cqw; --mw: 36.4cqw; --mh: 5.4cqw; --mf: #0f1a3a; --mk: #f2f6ff;',
      b: '--fx: 14.36cqw; --fy: 42.81cqw; --fd: 30.84cqw; --cx: 29.78%; --cy: 58.23%; --nx: 49.8cqw; --ny: 48.4cqw; --nw: 37.4cqw; --nh: 8.6cqw; --nf: #0f1a3a; --nk: #f2f6ff; --mx: 49.2cqw; --my: 61.9cqw; --mw: 38cqw; --mh: 8.8cqw; --mf: #0f1a3a; --mk: #f2f6ff;',
      c: '--fx: 37.22cqw; --fy: 33.47cqw; --fd: 25.68cqw; --cx: 50.06%; --cy: 46.31%; --nx: 20.4cqw; --ny: 73.4cqw; --nw: 59.2cqw; --nh: 9.4cqw; --nf: #f4f8ff; --nk: #0a1024; --mx: 42.4cqw; --my: 66.5cqw; --mw: 15.4cqw; --mh: 4.2cqw; --mf: #0f1a3a; --mk: #f2f6ff;',
      d: '--fx: 10.73cqw; --fy: 34.64cqw; --fd: 30.58cqw; --cx: 26.02%; --cy: 49.93%; --nx: 47.8cqw; --ny: 45.6cqw; --nw: 40.6cqw; --nh: 9.2cqw; --nf: #f4f8ff; --nk: #0a1024; --mx: 46.4cqw; --my: 58.8cqw; --mw: 35.6cqw; --mh: 5.6cqw; --mf: #0f1a3a; --mk: #f2f6ff;'
    },
    aurora: {
      a: '--fx: 37.57cqw; --fy: 35.6cqw; --fd: 24.84cqw; --cx: 49.99%; --cy: 48.02%; --nx: 25.2cqw; --ny: 64.8cqw; --nw: 50cqw; --nh: 9.4cqw; --nf: #f4fbff; --nk: #0a1030; --mx: 37.2cqw; --my: 76.4cqw; --mw: 26cqw; --mh: 5cqw; --mf: #1a2050; --mk: #ffffff;',
      b: '--fx: 17.74cqw; --fy: 45.9cqw; --fd: 29.4cqw; --cx: 32.44%; --cy: 60.6%; --nx: 53.4cqw; --ny: 53.2cqw; --nw: 33.6cqw; --nh: 8.6cqw; --nf: #1a2050; --nk: #ffffff; --mx: 50.4cqw; --my: 66.4cqw; --mw: 34.6cqw; --mh: 8cqw; --mf: #1a2050; --mk: #ffffff;',
      c: '--fx: 32.33cqw; --fy: 31.77cqw; --fd: 35.3cqw; --cx: 49.98%; --cy: 49.42%; --nx: 21.8cqw; --ny: 70.6cqw; --nw: 56.4cqw; --nh: 9.6cqw; --nf: #f4fbff; --nk: #0a1030; --mx: 41.6cqw; --my: 21.7cqw; --mw: 16.8cqw; --mh: 4.6cqw; --mf: #1a2050; --mk: #ffffff;',
      d: '--fx: 14.4cqw; --fy: 35.98cqw; --fd: 28.94cqw; --cx: 28.87%; --cy: 50.45%; --nx: 49.8cqw; --ny: 45.6cqw; --nw: 37.8cqw; --nh: 8.8cqw; --nf: #f4fbff; --nk: #0a1030; --mx: 49.2cqw; --my: 57.2cqw; --mw: 31cqw; --mh: 4.4cqw; --mf: #1a2050; --mk: #ffffff;'
    },
    samurai: {
      a: '--fx: 34.76cqw; --fy: 31.67cqw; --fd: 30.36cqw; --cx: 49.94%; --cy: 46.85%; --nx: 24.4cqw; --ny: 63.8cqw; --nw: 51.6cqw; --nh: 8.8cqw; --nf: #fff3d6; --nk: #1a0606; --mx: 34.4cqw; --my: 76.9cqw; --mw: 31.6cqw; --mh: 5.8cqw; --mf: #ffe9a8; --mk: #3a0808;',
      b: '--fx: 14.11cqw; --fy: 36.48cqw; --fd: 31.6cqw; --cx: 29.91%; --cy: 52.28%; --nx: 51.6cqw; --ny: 45.6cqw; --nw: 36cqw; --nh: 7.8cqw; --nf: #fff3d6; --nk: #1a0606; --mx: 51.6cqw; --my: 58.8cqw; --mw: 36cqw; --mh: 7.8cqw; --mf: #ffd76a; --mk: #1a0606;',
      c: '--fx: 34.04cqw; --fy: 31.95cqw; --fd: 31.76cqw; --cx: 49.92%; --cy: 47.83%; --nx: 28.4cqw; --ny: 72.4cqw; --nw: 43.6cqw; --nh: 8.2cqw; --nf: #fff3d6; --nk: #3a0808; --mx: 42.6cqw; --my: 20.9cqw; --mw: 14.8cqw; --mh: 4.6cqw; --mf: #3a0808; --mk: #fff1c0;',
      d: '--fx: 8.89cqw; --fy: 35.14cqw; --fd: 30.86cqw; --cx: 24.32%; --cy: 50.57%; --nx: 43cqw; --ny: 43.6cqw; --nw: 40cqw; --nh: 9.6cqw; --nf: #fff3d6; --nk: #1a0606; --mx: 43cqw; --my: 57.7cqw; --mw: 39cqw; --mh: 4.8cqw; --mf: #ffe9a8; --mk: #3a0808;'
    }
  };
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
    if(design&&design.bespoke==='rambild'&&RAMMATT[design.modell]){
      // Egen DOM, som Lion Clash. Portrattet ar forsta <img> och namnet forsta <h2>: det ar vad
      // live-uppdateringen i media.js skriver till. --tecken later namnet krympa efter sin langd.
      const safe=VyraSafe, modell=design.modell, ram=RAMVAL.indexOf(w.mvpRam)>=0?w.mvpRam:'a';
      const bild='assets/mvp-celebrations/ram/'+modell+'-'+ram+'.webp';
      const dur=finite(w.mvpDuration||design.duration||10,design.duration||10,2,15);
      const tecken=Math.max(4,String(w.mvpName||'TestAlpha').length);
      return `<div class="widget battle-mvp mvp-celebration mvc-rambild mvc-ram-${modell}${selected===w.id?' selected':''}" data-id="${safe.text(w.id)}" data-mvc-particles="off" data-mvp-ram="${ram}" style="left:${finite(w.x,0,-10000,10000)}px;top:${finite(w.y,0,-10000,10000)}px;width:${finite(w.width||400,400,100,2000)}px;zoom:${finite(w.widgetScale||1,1,.1,5)};--ram-dur:${dur}s">`
        + `<div class="ramb" style="${RAMMATT[modell][ram]}--tecken:${tecken}"><i class="ramb-sken"></i>`
        + `<img class="ramb-foto" src="${safe.url((typeof window.vyraReservbild === 'function' ? window.vyraReservbild : v => v)(w.profileImage),'assets/images/test-profile.svg')}" alt="">`
        + `<img class="ramb-bild" src="${bild}" alt="">`
        + `<i class="ramb-vag"></i><i class="ramb-blixt"></i><i class="ramb-glitter"></i><i class="ramb-glitter ramb-glitter-2"></i>`
        + `<i class="ramb-glans" style="-webkit-mask-image:url('${bild}');mask-image:url('${bild}')"></i>`
        + `<small class="ramb-mvp" style="display:${w.mvpShowLabel===false?'none':'block'}">${safe.text(battleMvpLabel(w),'MVP')}</small>`
        + `<h2 class="ramb-namn" style="display:${w.mvpShowName===false?'none':'block'}">${safe.text(w.mvpName,'TestAlpha')}</h2>`
        + `</div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
    }
    if(design&&design.bespoke==='lion-clash'){
      // Lion Clash ar en egen animerad komposition (ogon, energibagar, kron-glimt, skylt-svep) och
      // ritar darfor sin egen DOM i stallet for firande-mallen. mvp-active driver hela sekvensen.
      const safe=VyraSafe;
      const art='assets/mvp-celebrations/'+(design.asset||'lion-clash.png');
      const dur=finite(w.mvpDuration||design.duration||10,design.duration||10,2,15);
      return `<div class="widget battle-mvp mvp-celebration mvc-lion-clash${selected===w.id?' selected':''}" data-id="${safe.text(w.id)}" data-mvp-lion="1" style="left:${finite(w.x,0,-10000,10000)}px;top:${finite(w.y,0,-10000,10000)}px;width:${finite(w.width||320,320,100,2000)}px;zoom:${finite(w.widgetScale||1,1,.1,5)};--lion-dur:${dur}s">`
        + `<div class="lion" role="img" aria-label="Lion Clash MVP"><div class="lion-body">`
        + `<img class="lion-photo" src="${safe.url((typeof window.vyraReservbild === 'function' ? window.vyraReservbild : v => v)(w.profileImage),'assets/images/test-profile.svg')}" alt="">`
        + `<img class="lion-art" src="${art}" alt="">`
        + `<span class="eye eye-blue"></span><span class="eye eye-orange"></span>`
        + `<svg class="energy" viewBox="0 0 1000 1000" aria-hidden="true"><path class="blue-path" pathLength="1" d="M276 517 A224 224 0 0 1 500 293"/><path class="orange-path" pathLength="1" d="M724 517 A224 224 0 0 0 500 293"/></svg>`
        + `<span class="crown-flash"></span><div class="plate-shine"></div>`
        + `<h2 class="lion-name" style="display:${w.mvpShowName===false?'none':'block'}">${safe.text(w.mvpName,'TestAlpha')}</h2>`
        + `</div></div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
    }
    if(!design){
      // Keep the established renderer and live contract, add only finite motion hooks.
      const family=w.mvpFrame?'battlemvp.frame':'battlemvp.style';
      const key=w.mvpFrame||w.mvpStyle||'inferno';
      if(!Object.prototype.hasOwnProperty.call(VyraWidgets.variants(family),key))return previous(w);
      const duration=finite(w.mvpDuration||7,7,2,15);
      let html=previous(w);
      // Live updates target the first image; artwork must never occupy that slot.
      if(w.mvpFrame)html=html.replace(/(<img class="mvpf-art"[^>]*>)(<div class="mvpf-photo"[\s\S]*?<\/div>)/,'$2$1');
      // LASBARHETSLAGET (2026-10-12) behover den valda namnstorleken som variabel: namnets egen
      // inline-storlek gar inte att golva med max() fran ett stilark. Samma reservvarde som
      // renderaren i media.js (w.mvpNameSize||17). Se "LASBARHETSLAGE" i battle-mvp-celebrations.css.
      const namnPx=w.mvpFrame?finite(w.mvpNameSize||17,17,1,200):0;
      return html.replace('class="widget battle-mvp','class="widget battle-mvp mvp-motion')
        .replace('data-id=', 'data-mvp-motion="'+key+'" data-id=')
        .replace('style="','style="--mvm-duration:'+duration+'s;'+(namnPx?'--mvpf-namn:'+namnPx+'px;':''));
    }
    const key=w.mvpStyle, safe=VyraSafe;
    const art='assets/mvp-celebrations/'+(design.asset||key+'.svg');
    const photo=design.photo||{left:29,top:24,width:42,height:42};
    const duration=finite(w.mvpDuration||design.duration||10,design.duration||10,2,15);
    const particles=Array.from({length:20},(_,i)=>'<i style="--i:'+i+';--x:'+((i*37)%100)+'%;--drift:'+((i%2?1:-1)*(12+i*2))+'px"></i>').join('');
    return `<div class="widget battle-mvp mvp-celebration mvc-${key}${selected===w.id?' selected':''}" data-id="${safe.text(w.id)}"${design.raster?' data-mvc-particles="off"':''} style="left:${finite(w.x,0,-10000,10000)}px;top:${finite(w.y,0,-10000,10000)}px;width:${finite(w.width||400,400,100,2000)}px;zoom:${finite(w.widgetScale||1,1,.1,5)};--mvc-duration:${duration}s;--mvc-accent:${design.accent};--mvc-photo-left:${photo.left}%;--mvc-photo-top:${photo.top}%;--mvc-photo-width:${photo.width}%;--mvc-photo-height:${photo.height}%;--mvc-fx-intensity:${finite(w.mvpFxIntensity,100,20,250)};--mvc-fx-speed:${finite(w.mvpFxSpeed,100,40,200)};--mvc-fx-size:${finite(w.mvpFxSize,100,50,220)};--mvc-fx-depth:${finite(w.mvpFxDepth,34,0,60)};--mvc-fx-hole:${finite(w.mvpFxHole,118,60,200)};--mvc-fx-tint:${FX_TINTS.indexOf(w.mvpFxTint)>0?w.mvpFxTint:'auto'}">
      <div class="mvc-stage">${design.raster?'':'<div class="mvc-charge" aria-hidden="true"></div>'}
      <div class="mvc-portrait"><img src="${safe.url((typeof window.vyraReservbild === 'function' ? window.vyraReservbild : v => v)(w.profileImage),'assets/images/test-profile.svg')}" alt=""></div>
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
        '<label class="range-label">Andel framför ramen <b>'+g('mvpFxDepth',34)+' %</b>'+
        '<input id="mvpFxDepth" type="range" min="0" max="60" step="1" value="'+g('mvpFxDepth',34)+'"></label>'+
        '<label class="range-label">Fri yta runt profilbilden <b>'+g('mvpFxHole',118)+' %</b>'+
        '<input id="mvpFxHole" type="range" min="60" max="200" step="2" value="'+g('mvpFxHole',118)+'"></label>'+
        '<label>Partikelfärg<select id="mvpFxTint">'+
          FX_TINTS.map(t=>'<option value="'+t+'"'+((w.mvpFxTint||'auto')===t?' selected':'')+'>'+
            ({auto:'Följer firandet',gold:'Guld',violet:'Violett',white:'Vitt'})[t]+'</option>').join('')+
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
    // 2026-11-11 (David: "de widget vi ska ta bort fran vyra och lagga de nya"): de sex aldre firandena och de sex
    // PNG-ramarna var redan borta ur katalogen (katalog-ordning.js) men gick att valja i stilvaljaren. Nu tas de
    // bort dar ocksa. Fabriksnycklar och renderare ar kvar, sa sparade layouter ser ut som forut.
    ['coronation','wings','portal','rosegold','pearl','moon'].forEach(key=>document.querySelectorAll('#mvpStyle option[value="'+key+'"]').forEach(el=>el.remove()));
    ['royal-ribbon','laurel-star','dark-wings','dragon-fire','nautical-helm','shadow-star'].forEach(key=>document.querySelectorAll('#mvpFrame option[value="'+key+'"], #mvpStyle option[value="'+key+'"]').forEach(el=>el.remove()));
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
    const css=document.createElement('link');css.rel='stylesheet';css.href='battle-mvp-celebrations.css?v=20261018-1';css.dataset.mvpCelebrations='1';document.head.append(css);
  }
  if(!document.querySelector('script[data-mvp-particles]')){
    const js=document.createElement('script');js.src='battle-mvp-particles.js?v=20260930-signature5';
    js.dataset.mvpParticles='1';document.body.append(js);
  }
  // Rambilderna: namnet skrivs live rakt in i <h2> (triggerBattleMvp/mvpSpelaPa i media.js), utan ny rendering.
  // Uppdatera --tecken efterat, sa att ett langt namn krymper i stallet for att kapas.
  if(typeof mvpSpelaPa==='function'){
    const spelaForut=mvpSpelaPa;
    mvpSpelaPa=function(nod){
      const svar=spelaForut.apply(this,arguments);
      try{const ram=nod&&nod.querySelector&&nod.querySelector('.ramb');if(ram){const h=ram.querySelector('h2');ram.style.setProperty('--tecken',Math.max(4,((h&&h.textContent)||'').length));}}catch(_){}
      return svar;
    };
  }
  root.VyraMvpCelebrations={designs};
  // The sibling arrives after the first render; refresh existing widgets and catalog once.
  if(typeof render==='function')render();
})(window);
