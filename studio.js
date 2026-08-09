document.addEventListener("error",event=>{const image=event.target;if(!(image instanceof HTMLImageElement)||image.dataset.vyraFallback)return;image.dataset.vyraFallback="1";image.src=image.src.includes("/assets/gifts/")?"assets/gifts/gift-placeholder.svg":"assets/images/test-profile.svg"},true);
const $=s=>document.querySelector(s);
function safeParseStorage(key,fallback){try{let raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch(e){console.warn('[VYRA] Ogiltig localStorage för',key,e);return fallback}}
// Skalan pa editorduken. ALLT som raknar om en pekarrorelse till dukpixlar maste ga via den har
// - draget (rad 163), alla fyra storlekshandtagen och kommande zoom.
//
// Fallbacken pa getComputedStyle var lange dod: den returnerar ALLTID matrix(...), aldrig
// scale(...), sa en zoom satt via CSS-klass gav tyst 1 och varje drag landade dubbelt fel.
// Uppmatt 2026-08-09: scale(0.5) -> 0.5, matrix(0.5,0,0,0.5,0,0) -> 1. Bada laser nu.
function getEditorCanvasScale(){
  let canvas=document.querySelector('.canvas');
  if(!canvas)return 1;
  return vyraScaleUrTransform(canvas.style.transform)
    ??vyraScaleUrTransform(getComputedStyle(canvas).transform)
    ??1;
}
// null nar strangen inte bar nagon skala, sa anroparen kan ga vidare till nasta kalla.
// matrix(a,b,c,d,tx,ty): a ar x-skalan. matrix3d har den forst av sina sexton.
function vyraScaleUrTransform(transform){
  if(!transform||transform==='none')return null;
  let m=transform.match(/scale\(\s*([\d.]+)/)
    ||transform.match(/matrix(?:3d)?\(\s*(-?[\d.e+-]+)/);
  if(!m)return null;
  let scale=Math.abs(parseFloat(m[1]));
  return Number.isFinite(scale)&&scale>0?scale:null;
}
// Aldrig localStorage direkt: agaren avgor vad som ar sakert att visa, och returnerar samma
// objektreferens hela sidans livstid - allt har muterar den in-place.
const state=window.VyraSessionState.activeState();
// En handler binds nar egenskapspanelen ritas och SKRIVER nar anvandaren klickar, kanske sekunder
// senare. Emellan hinner en sparning projicera, och session-state.js:94 byter da ut varje
// widgetobjekt mot en klon:
//
//   Object.keys(activeStateObject).forEach(k=>{delete activeStateObject[k]});
//   Object.assign(activeStateObject, clone(next));
//
// `state` behaller sin identitet - det ar hela poangen med den permanenta referensen - men
// state.widgets och varje widget i den ersatts. En fangad referens pekar darefter pa nagot som
// inte langre ligger i layouten: skrivningen ser ut att lyckas och ar borta utan felmeddelande.
// Cloud-syncs tickare sparar varje sekund, sa fonstret ar alltid oppet.
//
// Uppmatt i produktion pa gavovaljaren: modalen stangdes, giftImage5 blev aldrig satt.
//
// Proxyn slar upp widgeten pa id vid VARJE atkomst, sa bade lasning och skrivning traffar det
// objekt som faktiskt ligger i state.widgets just da.
//
// null nar den saknas, inte en proxy: en proxy ar alltid sann, och varje `if(!w||w.type!==...)
// return` i klienten skulle sluta skydda.
// type ar valfri: flera binds letade `id===selected && type===X` och ska ge falskt nar typen inte
// stammer, precis som find() gjorde.
function liveWidget(id,type){
  const traff=state.widgets.find(w=>w&&w.id===id);
  if(!traff||(type&&traff.type!==type))return null;
  const at=()=>state.widgets.find(w=>w&&w.id===id)||{};
  return new Proxy({},{
    get:(_,k)=>at()[k],
    set:(_,k,v)=>{at()[k]=v;return true},
    has:(_,k)=>k in at(),
    deleteProperty:(_,k)=>{delete at()[k];return true},
    ownKeys:()=>Reflect.ownKeys(at()),
    // Malet ar tomt och utsträckbart, sa rapporterade nycklar maste vara configurable - annars
    // kastar bade spread och JSON.stringify pa en invariant.
    getOwnPropertyDescriptor:(_,k)=>{const d=Object.getOwnPropertyDescriptor(at(),k);return d?{...d,configurable:true}:undefined}
  })
}
window.liveWidget=liveWidget;

// Defaults ags av session-state.js (neutralState/onboardingState). Kvar har star bara flows,
// som ingen projektion fyller i.
state.flows??=[{trigger:'Gava mottagen',action:'Visa gift alert',on:true},{trigger:'Ny foljare',action:'Spela ljud + TTS',on:true}];
// Asynkron sedan skrivmonopolet: agaren tar ett origin-gemensamt las, sa tva flikar aldrig
// skriver samtidigt. Kastar aldrig - utfallet lases ur resultatet, och saveThenRender() nedan ar
// vagen for allt som ritar om efterat.
// notera() fore skrivningen: historiken diffar layoutprojektionen och pushar laget FORE
// mutationen (fran forra renderns baslinje). Ingen ny skrivvag — writeActive ager fortsatt
// varje beständig skrivning ensam.
const save=()=>{window.VyraHistorik?.notera?.();return window.VyraSessionState.writeActive('vyra-state',JSON.stringify(state))};
// Ett anrop i taget. Drag-slut, egenskapsfalt och radera kan alla utlosas tva ganger innan den
// forsta skrivningen slappt laset, och utan detta koar de bakom varandra och renderar var sin gang.
let saveInFlight=null;
async function saveThenRender(){if(saveInFlight)return saveInFlight;saveInFlight=(async()=>{const out=await save();if(!out.ok)toast(out.reason==='lost-ownership'?'Layouten andrades i en annan flik':'Kunde inte spara');render();return out})();try{return await saveInFlight}finally{saveInFlight=null}}
let view=new URLSearchParams(location.search).has('overlay')?'editor':'home',selected=null,timer;
function toast(t){$('.toast').textContent=t;$('.toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('.toast').classList.remove('show'),1700)}
function chart(){return `<svg viewBox="0 0 700 220" preserveAspectRatio="none"><path d="M0 190 C80 185 100 120 170 145 S260 80 320 110 S410 140 470 68 S570 90 700 25" fill="none" stroke="#876bff" stroke-width="3"/></svg>`}
function rows(){return ''}
function home(){return `<div class="stats">${[['TITTARE','—'],['LIKES','—'],['GÅVOR','—'],['INTÄKT','—']].map(x=>`<article class="card stat"><small>${x[0]}</small><strong>${x[1]}</strong><em>Visas när TikTok LIVE är anslutet</em></article>`).join('')}</div><div class="home-grid"><article class="card chart-card"><div class="card-head"><h2>Live-engagemang</h2><span>Ingen livedata ännu</span></div>${chart()}</article><article class="card activity"><div class="card-head"><h2>Senaste events</h2></div><p>Händelser visas här under din riktiga TikTok LIVE.</p></article><article class="card quick"><button data-go="editor"><b>◫ Skapa overlay</b><span>Öppna editorn →</span></button><button data-go="flows"><b>⌁ Ny automation</b><span>Koppla event →</span></button><button id="testGift"><b>◇ Skicka testgåva</b><span>Visa i overlay →</span></button></article></div>`}
function wh(w){if(!w.title&&!w.type)console.warn('[VYRA] Widget saknar både title och type - se widgetobjektet och stacken nedan för att hitta var den skapades:',JSON.parse(JSON.stringify(w)),new Error().stack);return `<div class="widget ${w.type}${selected===w.id?' selected':''}" data-id="${w.id}" style="left:${w.x}px;top:${w.y}px"><b>${w.title??w.type??'Widget'}</b><span>${w.value??''}</span>${w.type==='goal'?'<div class="bar"><i></i></div>':''}</div>`}
function formatWidgetLabel(w){return (w.title||w.templateTitle||w.group||w.type||'Widget').toString()}
function formatWidgetMeta(w){return (w.group||w.type||'Widget').toString().replace(/([a-z])([A-Z])/g,'$1 $2')}
function layerItemMarkup(w,i){return `<div class="layer-item${selected===w.id?' active':''}${w.hidden?' is-hidden':''}"><button class="layer-item-main" type="button" data-select-widget="${w.id}"><i>${i+1}</i><span><b>${formatWidgetLabel(w)}</b><small>${formatWidgetMeta(w)}</small></span><em>${w.hidden?'Dold':'Live'}</em></button><div class="layer-item-actions"><button class="layer-action icon-only" type="button" data-toggle-widget="${w.id}" title="${w.hidden?'Visa widget':'Dölj widget'}" aria-label="${w.hidden?'Visa widget':'Dölj widget'}">${w.hidden?'◌':'◐'}</button><button class="layer-action icon-only delete" type="button" data-delete-widget="${w.id}" title="Ta bort widget" aria-label="Ta bort widget">×</button></div></div>`}
// The canvas draws the selection, not the whole array. A ?widget= link renders exactly the instance
// it names — layout or standalone — and nothing else; without it, only layout widgets are drawn, so a
// standalone instance never appears in the Layout the streamer is editing or in the full overlay.
//
// When the named widget is gone the canvas shows one plain message and stops. No other widget, no
// demo data, no widget id and no token in the markup, no animation started, and no write to state:
// a dead link is a dead link, not a blank stage the streamer has to diagnose.
function vyraRenderWidgets(){
  const params=new URLSearchParams(location.search);
  const wanted=params.get('widget')||'';
  const picked=window.VyraWidgets
    ? window.VyraWidgets.selectForRender(state.widgets,{widgetId:wanted})
    : {widgets:state.widgets,error:null};
  if(picked.error==='missing-widget')return '<div class="widget-link-gone"><b>Widgetlänken finns inte längre</b><span>Widgeten har tagits bort. Skapa en ny länk i Studio.</span></div>';
  return picked.widgets.map(wh).join('');
}
function layerList(){const layoutWidgets=window.VyraWidgets?window.VyraWidgets.layoutOnly(state.widgets):state.widgets;return layoutWidgets.length?layoutWidgets.slice().sort((a,b)=>(b.layer||1)-(a.layer||1)).map((w,i)=>layerItemMarkup(w,i)).join(''):'<div class="editor-layer-empty">Inga widgets på scenen ännu. Lägg till första objektet för att börja.</div>'}
function props(){let w=liveWidget(selected);return w?`<h3>${w.type}</h3><label>Rubrik<input id="pt" value="${w.title??''}"></label><label>Värde<input id="pv" value="${w.value??''}"></label><button class="delete" id="del">Ta bort</button>`:'<div class="properties-empty"><strong>Välj en widget</strong><span>Klicka på en widget i vänsterlistan eller direkt på scenen för att redigera layout, färg och animation.</span></div>'}
function editor(){let currentWidget=liveWidget(selected);return `<div class="editor-shell"><div class="elements"><div class="elements-panel"><div class="elements-head"><div><small class="panel-kicker">Overlay</small><div class="panel-title">Live-lager</div></div><button class="elements-add" data-open-overlay title="Öppna overlay">＋</button></div><div class="catalog-notice elements-note"><b>Enkel byggyta</b><span>Välj en widget, justera till höger och håll scenen ren i mitten.</span></div><input class="widget-search" placeholder="Filter"><div class="editor-layer-list">${layerList()}</div><div class="elements-actions"><button data-open-overlay>＋ Add item</button></div><div class="widget-catalog"></div></div></div><div class="workarea"><div class="stage-topbar"><div class="stage-topbar-format"></div><div class="stage-topbar-center"></div><div class="stage-topbar-actions"></div></div><div class="stage-shell"><div class="stage-rail stage-rail-left"></div><div class="canvas-wrap"><div class="stage-caption"><span>Mobilskärm</span><b>1080 × 1920</b></div><div class="canvas-frame"><div class="canvas">${vyraRenderWidgets()}</div></div></div><div class="stage-rail stage-rail-right"></div></div></div><div class="properties"><div class="properties-head"><small class="panel-kicker">Inspector</small><div class="panel-title">${currentWidget?formatWidgetLabel(currentWidget):'Välj widget'}</div><p>${currentWidget?'Redigera vald widget med en egen panel som använder hela ytan för just den här widgeten.':'Välj en widget på scenen för att öppna dess egna inställningar.'}</p></div><div class="properties-body">${props()}</div></div></div>`}
function flows(){return `<div class="flow-head"><h2>Automationer</h2><button class="primary" id="newFlow">＋ Ny automation</button></div><div class="flows">${state.flows.map((f,i)=>`<article class="card flow-row"><div class="node"><b>◇ ${f.trigger}</b><small>TRIGGER</small></div><div class="arrow">→</div><div class="node"><b>▶ ${f.action}</b><small>ACTION</small></div><button data-toggle="${i}">${f.on?'Aktiv':'Pausad'}</button></article>`).join('')}</div>`}
function events(){return `<article class="card" style="padding:20px"><h2>Eventhistorik</h2><p data-tom="handelser-tom">Inga händelser ännu. Anslut TikTok LIVE så fylls historiken på här i realtid.</p><div class="tom-lista" aria-hidden="true"><i></i><i></i><i></i><i></i></div></article>`}
function analytics(){return `<div class="analytics-grid"><article class="card big-chart"><h2>Tillväxt senaste 30 dagarna</h2><p data-tom="statistik-tillvaxt">Ingen livedata ännu. Gå live med VYRA Desktop så ritas din tillväxt här dag för dag.</p><div class="tom-diagram" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></article><article class="card rank"><h2>Toppsupportrar</h2><p data-tom="statistik-topp">Inga supportrar att visa ännu. Efter din första livesändning listas dina största gåvogivare här.</p><div class="tom-lista" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></article></div>`}
function settings(){return `<article class="card settings-page"><h2>Kontoinställningar</h2><label>Visningsnamn<input id="dn" value="${state.user}"></label><div class="settings-status" data-rad="tiktok">TikTok<b class="settings-status-value${state.tiktok?' online':''}"><i></i>${state.tiktok||'Inte anslutet'}</b></div><button class="primary" id="ss">Spara</button></article>`}
// EDITOR-VYN: layout-safe.js ager #view och returnerar utan render-kedja.
// Nya moduler som behover reagera pa editor-rendering maste anvanda
// MutationObserver pa #view (se layout-format.js, vyra-historik.js).
function render(){let m={home,editor,flows,events,analytics,settings};if(!m[view])view='home';let viewRoot=$('#view'),titleRoot=$('#title');if(!viewRoot||!titleRoot)return;viewRoot.innerHTML=m[view]();titleRoot.textContent=view==='home'?`God kväll, ${state.user}`:vyraNavEtikett(view)||view[0].toUpperCase()+view.slice(1);bind()}
// Titeln togs forut ur VYNYCKELN med versal — darfor stod det "Settings" pa en sida vars navval
// heter "Installningar". Navetiketten ar den enda kalla som stammer, och den ar samma kalla som
// brodsmulan anvander. Faller tillbaka pa gamla beteendet for vyer utan eget navval (t.ex. editor).
function vyraNavEtikett(v){
  const b=document.querySelector(`[data-view="${v}"]`);
  if(!b)return'';
  return (b.querySelector('span')||b).textContent.trim();
}
// Selektorn tar BADA sorterna med flit. Ett vy-byte maste slacka aven extra-knapparna (Guide,
// Spotify, Chatbot ...), annars ligger de kvar tanda: extras.js:11 rensar hela `aside button`,
// men den har rensade bara [data-view] — och den asymmetrin gav tva tanda val samtidigt.
function go(v){if(!v)return;view=v;document.querySelectorAll('[data-view],[data-extra]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));render()}
function send(){window.VyraLive?.ingest?.({type:'gift',username:'TestGifter',name:'TestGifter',giftName:'Testgåva',coins:1,count:1});toast('Testgåva skickad')}
function bind(){
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
  $('#testGift')&&($('#testGift').onclick=send);
  if(view==='editor'){
    document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
      let t=b.dataset.add,id=t+Date.now();
      state.widgets.push({id,type:t,x:100,y:200,title:'NYTT '+t.toUpperCase(),value:'Testvärde'});
      selected=id;
      save();
      render();
    });
    document.querySelectorAll('[data-select-widget]').forEach(b=>b.onclick=()=>{
      selected=b.dataset.selectWidget;
      render();
    });
    document.querySelectorAll('[data-toggle-widget]').forEach(b=>b.onclick=e=>{
      e.stopPropagation();
      let w=state.widgets.find(x=>x.id===b.dataset.toggleWidget);
      if(!w)return;
      w.hidden=!w.hidden;
      save();
      toast(w.hidden?'Widget dold':'Widget synlig');
      render();
    });
    document.querySelectorAll('[data-delete-widget]').forEach(b=>b.onclick=e=>{
      e.stopPropagation();
      let id=b.dataset.deleteWidget;
      state.widgets=state.widgets.filter(x=>x.id!==id);
      if(selected===id)selected=null;
      save();
      toast('Widget borttagen');
      render();
    });
    document.querySelectorAll('[data-open-overlay]').forEach(b=>b.onclick=()=>window.open('overlay.html'));
    document.querySelectorAll('.widget').forEach(el=>{
      let suppressClick=false;
      el.onclick=()=>{
        if(suppressClick){
          suppressClick=false;
          return;
        }
        selected=el.dataset.id;
        render();
      };
      let s;
      el.onpointerdown=e=>{
        e.preventDefault();
        s={pointerId:e.pointerId,x:e.clientX,y:e.clientY,l:parseInt(el.style.left),t:parseInt(el.style.top),scale:getEditorCanvasScale(),moved:false};
        el.setPointerCapture(e.pointerId);
      };
      el.onpointermove=e=>{
        if(s&&e.pointerId===s.pointerId){
          let nextLeft=s.l+(e.clientX-s.x)/s.scale;
          let nextTop=s.t+(e.clientY-s.y)/s.scale;
          if(Math.abs(nextLeft-s.l)>.5||Math.abs(nextTop-s.t)>.5)s.moved=true;
          el.style.left=Math.round(nextLeft)+'px';
          el.style.top=Math.round(nextTop)+'px';
        }
      };
      let finishDrag=e=>{
        if(s&&(!e||e.pointerId===s.pointerId)){
          let w=state.widgets.find(x=>x.id===el.dataset.id);
          if(!w){
            s=null;
            return;
          }
          suppressClick=s.moved;
          w.x=parseInt(el.style.left);
          w.y=parseInt(el.style.top);
          save();
          if(e&&el.hasPointerCapture?.(e.pointerId))el.releasePointerCapture(e.pointerId);
          s=null;
        }
      };
      el.onpointerup=finishDrag;
      el.onpointercancel=finishDrag;
    });
    let w=liveWidget(selected);
    if(w){
      $('#pt')&&($('#pt').onchange=e=>{w.title=e.target.value;saveThenRender()});
      $('#pv')&&($('#pv').onchange=e=>{w.value=e.target.value;saveThenRender()});
      $('#del')&&($('#del').onclick=()=>{state.widgets=state.widgets.filter(x=>x.id!==selected);if(!state.widgets.length)window.__vyraUserEmptiedWidgets=true;selected=null;saveThenRender()});
    }
    $('#testEvent')&&($('#testEvent').onclick=send);
    // #saveProject-hanteraren ar borttagen: autosparet skriver redan vid varje andring, och
    // .cloud-status visar klockslaget. Stubben i overlay-preview.js far sta kvar tom — den
    // finns for att den har raden en gang band den ovillkorligt.
  }
  if(view==='flows'){
    document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{state.flows[+b.dataset.toggle].on=!state.flows[+b.dataset.toggle].on;saveThenRender()});
    $('#newFlow').onclick=()=>{state.flows.push({trigger:'Chatt !hype',action:'Visa animation',on:true});saveThenRender()};
  }
  if(view==='settings')$('#ss').onclick=()=>{state.user=$('#dn').value;save();$('#userName').textContent=state.user;render();toast('Sparat')};
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>go(b.dataset.view));
// Brodsmulan foljde aldrig med. #crumb skrevs pa ETT stalle i hela kodbasen (live-control.js:42)
// och stod darfor kvar pa "VYRA / OVERSIKT" i varje vy. Den harleds nu ur navetiketten — inte ur
// #title, eftersom Oversikt medvetet visar en halsning i stallet for sidnamnet.
//
// En capture-lyssnare pa dokumentet i stallet for en hake per knapp: navknapparna binds om av
// flera moduler (studio.js, extras.js, media.js), och capture kor fore dem alla. Da spelar det
// ingen roll vem som ager klicket eller i vilken ordning skripten laddades.
function vyraSyncCrumb(button){
  const crumb=$('#crumb');
  if(!crumb||!button)return;
  const etikett=(button.querySelector('span')||button).textContent.trim();
  if(etikett)crumb.textContent='VYRA / '+etikett.toLocaleUpperCase('sv-SE');
}
document.addEventListener('click',e=>{
  const b=e.target?.closest?.('[data-view],[data-extra]');
  if(b)vyraSyncCrumb(b);
},true);
vyraSyncCrumb(document.querySelector('[data-view].active,[data-extra].active')
  ||document.querySelector('[data-view="home"]'));
$('.connect')&&($('.connect').onclick=()=>$('#connectModal')?.showModal());
$('.x')&&($('.x').onclick=()=>$('#connectModal')?.close());
$('#connectNow')&&($('#connectNow').onclick=()=>toast('TikTok-anslutningen förbereds…'));
$('#openOverlay')&&($('#openOverlay').onclick=()=>window.open('overlay.html'));
$('#userName')&&($('#userName').textContent=state.user);
function openBrandKitDialog(){
  let kit=state.brandKit;
  $('#bkBackground').value=kit.background||'#1c1028';
  $('#bkHighlight').value=kit.highlight;
  $('#bkText').value=kit.text;
  $('#bkSecondaryText').value=kit.secondaryText;
  $('#bkFontFamily').value=kit.fontFamily||'';
  $('#brandKitModal')?.showModal();
}
$('#openBrandKit')&&($('#openBrandKit').onclick=openBrandKitDialog);
$('#brandKitClose')&&($('#brandKitClose').onclick=()=>$('#brandKitModal')?.close());
$('#brandKitSave')&&($('#brandKitSave').onclick=()=>{
  state.brandKit={
    background:$('#bkBackground').value,
    highlight:$('#bkHighlight').value,
    text:$('#bkText').value,
    secondaryText:$('#bkSecondaryText').value,
    fontFamily:$('#bkFontFamily').value
  };
  save();
  render();
  $('#brandKitModal')?.close();
  toast('Färgschema sparat');
});
render();
