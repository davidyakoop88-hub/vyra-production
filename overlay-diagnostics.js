// OVERLAY-KONTROLL — knappen "Kontrollera för OBS" i studions Overlay-vy.
//
// Öppnar den riktiga OBS-länken i en ram med exakt OBS-upplösning och läser av vad OBS skulle få:
// genomskinlig bakgrund, rätt storlek, att ingen studio-chrome syns, att bilder och videor laddar
// och hur många widgetar som faktiskt renderas.
//
// Filen låg i repot sedan första releasen men laddades aldrig (inkopplad 2026-11-26). Tre av sex
// kontroller gav då falsklarm mot en riktig overlay, uppmätt i studion:
//   * Upplösning 1078×1918 i stället för 1080×1920 — ramens 1px kant åt två pixlar på varje led.
//     Kanten är nu en outline, som inte tar plats.
//   * "244 element blockerar klick" — räknade varje element utan pointer-events:none. OBS klickar
//     inte i källan, så kontrollen sa ingenting. Ersatt av den invariant som faktiskt gäller:
//     ingenting utanför .canvas får synas i overlayn (ingen sidomeny, rubrik eller knapp).
//   * Ramen läste en egen adress (studio.html?overlay=1&obs=1) i stället för länken användaren
//     kopierar. Nu används overlayShareUrl(), samma länk som "Kopiera länk" ger.
(function(root){
  'use strict';
  const PRESETS={portrait:[1080,1920],landscape:[1920,1080],square:[1080,1080]};
  let preset='portrait',lastReport=null;
  function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function overlayUrl(){
    if(typeof overlayShareUrl==='function'){try{return new URL(overlayShareUrl(),location.href).href}catch(_){}}
    const url=new URL('overlay.html',location.href);return url.href;
  }
  function alpha(color){const value=String(color||'').trim();if(value==='transparent')return 0;const m=value.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);return m?Number(m[1]):1}
  // Synligt = har yta och ingen förfader är dold. Opacitet 0 räknas som dold.
  function synlig(win,e){
    const r=e.getBoundingClientRect();if(r.width<1||r.height<1)return false;
    for(let p=e;p&&p.nodeType===1;p=p.parentElement){const s=win.getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false}
    return true;
  }
  function inspect(win){
    const doc=win.document,html=doc.documentElement,body=doc.body,canvas=doc.querySelector('.canvas');
    const widgets=canvas?[...canvas.querySelectorAll('.widget')].filter(e=>synlig(win,e)):[];
    // Varför syns de andra inte? En widget i overlayn är dold med avsikt tills den fått sin första
    // riktiga händelse i sändningen (overlay-aktivering.js) — före live är det alltså rätt att inget
    // syns. `state` är ett skriptomfång i ramen, inte en window-egenskap, därav eval.
    let lista=[];try{lista=win.eval('typeof state!=="undefined"&&state&&Array.isArray(state.widgets)?state.widgets:[]')||[]}catch(_){}
    const akt=win.VyraAktivering,doldaAvAnvandaren=lista.filter(w=>w&&w.hidden).length;
    const vantande=akt&&typeof akt.vantar==='function'?lista.filter(w=>w&&!w.hidden&&akt.vantar(w)).length:0;
    const brokenImages=[...doc.images].filter(i=>i.complete&&i.naturalWidth===0&&(i.currentSrc||i.src)).map(i=>i.currentSrc||i.src);
    const brokenVideos=[...doc.querySelectorAll('video')].filter(v=>v.error).map(v=>v.currentSrc||v.src);
    const htmlBg=win.getComputedStyle(html).backgroundColor,bodyBg=win.getComputedStyle(body).backgroundColor;
    // Studio-chrome: allt synligt som varken ligger i .canvas eller omsluter den.
    const chrome=canvas?[...body.querySelectorAll('*')].filter(e=>!canvas.contains(e)&&!e.contains(canvas)&&e.tagName!=='SCRIPT'&&e.tagName!=='STYLE'&&synlig(win,e)):[];
    return {width:win.innerWidth,height:win.innerHeight,dpr:win.devicePixelRatio||1,transparent:alpha(htmlBg)===0&&alpha(bodyBg)===0,htmlBg,bodyBg,canvas:!!canvas,
      canvasWidth:canvas?.getBoundingClientRect().width||0,canvasHeight:canvas?.getBoundingClientRect().height||0,widgets:widgets.length,vantande,doldaAvAnvandaren,iLayouten:lista.length,brokenImages,brokenVideos,
      chrome:chrome.length,chromeExempel:chrome.slice(0,3).map(e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\s+/)[0]:'')),timestamp:Date.now()};
  }
  function badge(ok,label,detail){return `<article class="od-check ${ok?'ok':'bad'}"><i>${ok?'✓':'!'}</i><span><b>${label}</b><small>${safe(detail)}</small></span></article>`}
  function reportHtml(r){
    if(!r)return '<div class="od-wait">Laddar overlay och kör kontroll…</div>';
    if(r.fel)return `<div class="od-checks">${badge(false,'Overlayn gick inte att läsa',r.fel)}</div>`;
    const expected=PRESETS[preset],sizeOk=r.width===expected[0]&&r.height===expected[1],mediaFel=r.brokenImages.length+r.brokenVideos.length;
    return `<div class="od-checks">`
      +badge(r.transparent,'Transparent bakgrund',r.transparent?'Godkänd':'Bakgrund: '+r.bodyBg)
      +badge(sizeOk,'Upplösning',`${r.width}×${r.height} · ${sizeOk?'godkänd':'förväntat '+expected.join('×')}`)
      +badge(r.canvas,'Canvas',r.canvas?`${Math.round(r.canvasWidth)}×${Math.round(r.canvasHeight)} renderad`:'Canvas saknas')
      +badge(!r.chrome,'Ingen studio-chrome',r.chrome?`${r.chrome} studio-element syns: ${r.chromeExempel.join(', ')}`:'Bara widgetar syns')
      +badge(!mediaFel,'Media',mediaFel?`${r.brokenImages.length} bilder och ${r.brokenVideos.length} videor laddar inte`:'Alla laddade bilder och videor är hela')
      +widgetRad(r)
      +`</div>`;
  }
  // Widgetraden: rött bara när det verkligen är fel. Väntande widgetar före första händelsen är regeln.
  function widgetRad(r){
    const n=r.widgets,v=r.vantande||0,d=r.doldaAvAnvandaren||0,ord=k=>k===1?'widget':'widgetar';
    const extra=[v?`${v} ${ord(v)} väntar på första riktiga händelsen i sändningen`:'',d?`${d} dold${d===1?'':'a'} av dig`:''].filter(Boolean).join(', ');
    if(n)return badge(true,'Synliga widgetar',`${n} ${n===1?'widget renderas':'widgetar renderas'}${extra?' · '+extra:''}`);
    if(v)return badge(true,'Widgetar',`Inga syns ännu – ${extra}. Så ska det vara före live: de visas när händelserna kommer.`);
    if(d)return badge(false,'Synliga widgetar',`Inga syns – ${extra}. Visa en widget i Layout.`);
    return badge(false,'Synliga widgetar','Inga widgetar i layouten – lägg till en här i Overlay.');
  }
  function updateReport(){const host=document.querySelector('#odReport');if(host)host.innerHTML=reportHtml(lastReport)}
  function resizeFrame(){const frame=document.querySelector('#odFrame'),stage=document.querySelector('.od-stage');if(!frame||!stage)return;const [w,h]=PRESETS[preset],scale=Math.min((stage.clientWidth-20)/w,(stage.clientHeight-20)/h);frame.style.width=w+'px';frame.style.height=h+'px';frame.style.transform=`translate(-50%,-50%) scale(${scale})`;document.querySelectorAll('[data-od-preset]').forEach(b=>b.classList.toggle('active',b.dataset.odPreset===preset));lastReport=null;updateReport();const u=new URL(overlayUrl());u.searchParams.set('diagnostic',Date.now());frame.src=u.href}
  function runCheck(){const frame=document.querySelector('#odFrame');if(!frame)return;try{lastReport=inspect(frame.contentWindow)}catch(e){lastReport={fel:'Ramen kunde inte läsas ('+(e&&e.message||e)+').'}}updateReport()}
  function copyUrl(){navigator.clipboard?.writeText(overlayUrl()).then(()=>root.toast?.('OBS-länken kopierad')).catch(()=>root.toast?.('Kunde inte kopiera länken'))}
  function open(){document.querySelector('.od-modal')?.remove();const modal=document.createElement('div');modal.className='od-modal';modal.innerHTML=`<section class="od-panel"><header><div><small>OBS & LIVE STREAMING</small><h2>Overlay-kontroll</h2></div><button id="odClose" aria-label="Stäng">×</button></header><div class="od-presets">${Object.entries(PRESETS).map(([k,v])=>`<button data-od-preset="${k}">${k==='portrait'?'9:16':k==='landscape'?'16:9':'1:1'} <small>${v.join('×')}</small></button>`).join('')}</div><div id="odReport">${reportHtml(lastReport)}</div><div class="od-actions"><button id="odRun" class="primary">Kör kontroll igen</button><button id="odCopy">Kopiera OBS-länk</button><button id="odOpen">Öppna overlay ↗</button></div><p class="od-help">I OBS: lägg till en webbläsarkälla, klistra in länken och använd samma bredd och höjd som du valt här. Bakgrunden ska vara transparent.</p></section><div class="od-stage"><iframe id="odFrame" title="Förhandsvisning av overlayn"></iframe></div>`;document.body.append(modal);modal.querySelector('#odClose').onclick=()=>modal.remove();modal.querySelectorAll('[data-od-preset]').forEach(b=>b.onclick=()=>{preset=b.dataset.odPreset;resizeFrame()});modal.querySelector('#odRun').onclick=runCheck;modal.querySelector('#odCopy').onclick=copyUrl;modal.querySelector('#odOpen').onclick=()=>root.open(overlayUrl(),'_blank');modal.querySelector('#odFrame').onload=()=>setTimeout(runCheck,1500);resizeFrame()}
  function injectButton(){if(typeof view==='undefined'||view!=='overlay')return;const head=document.querySelector('#view .page-header');if(!head||head.querySelector('#openOverlayDiagnostics'))return;const b=document.createElement('button');b.id='openOverlayDiagnostics';b.className='primary';b.textContent='Kontrollera för OBS';b.onclick=open;head.append(b)}
  // Knappen läggs till efter varje bind(), som studion kör efter varje omritning. Tidigare gjordes det
  // med en setInterval som körde varje sekund så länge studion var öppen.
  if(typeof bind==='function'){const tidigareBind=bind;bind=function(){const ut=tidigareBind.apply(this,arguments);try{injectButton()}catch(_){}return ut};}
  injectButton();
  root.VyraOverlayDiagnostics={open,inspect,overlayUrl,getLastReport:()=>lastReport,PRESETS};
})(typeof window!=='undefined'?window:globalThis);
