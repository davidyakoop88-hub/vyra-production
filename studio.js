document.addEventListener("error",event=>{const image=event.target;if(!(image instanceof HTMLImageElement)||image.dataset.vyraFallback)return;image.dataset.vyraFallback="1";image.src=image.src.includes("/assets/gifts/")?"assets/gifts/gift-placeholder.svg":"assets/images/test-profile.svg"},true);
const $=s=>document.querySelector(s);
function safeParseStorage(key,fallback){try{let raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch(e){console.warn('[VYRA] Ogiltig localStorage för',key,e);return fallback}}
function getEditorCanvasScale(){
  let canvas=document.querySelector('.canvas');
  if(!canvas)return 1;
  let transform=canvas.style.transform||getComputedStyle(canvas).transform||'';
  let match=transform.match(/scale\(([\d.]+)\)/);
  let scale=match?parseFloat(match[1]):1;
  return Number.isFinite(scale)&&scale>0?scale:1;
}
const state=safeParseStorage('vyra-state',{});
state.user??='Streamer';state.tiktok??='';state.brandKit??={background:'#1c1028',highlight:'#ff58d6',text:'#f7f2ff',secondaryText:'#b9a6dd',fontFamily:''};state.widgets??=[{id:'goal',type:'goal',x:55,y:80,title:'KVÄLLENS MÅL',value:'74 320 / 100K'},{id:'alert',type:'alert',x:65,y:300,title:'@alex skickade Galaxy',value:'×5'},{id:'leader',type:'leader',x:50,y:480,title:'TOP GIFTERS',value:'1. Alex · 15.5K'}];state.flows??=[{trigger:'Gåva mottagen',action:'Visa gift alert',on:true},{trigger:'Ny följare',action:'Spela ljud + TTS',on:true}];
const save=()=>localStorage.setItem('vyra-state',JSON.stringify(state));let view=new URLSearchParams(location.search).has('overlay')?'editor':'home',selected=null,timer;
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
function props(){let w=state.widgets.find(x=>x.id===selected);return w?`<h3>${w.type}</h3><label>Rubrik<input id="pt" value="${w.title??''}"></label><label>Värde<input id="pv" value="${w.value??''}"></label><button class="delete" id="del">Ta bort</button>`:'<div class="properties-empty"><strong>Välj en widget</strong><span>Klicka på en widget i vänsterlistan eller direkt på scenen för att redigera layout, färg och animation.</span></div>'}
function editor(){let currentWidget=state.widgets.find(x=>x.id===selected);return `<div class="editor-shell"><div class="elements"><div class="elements-panel"><div class="elements-head"><div><small class="panel-kicker">Overlay</small><div class="panel-title">Live-lager</div></div><button class="elements-add" data-open-overlay title="Öppna overlay">＋</button></div><div class="catalog-notice elements-note"><b>Enkel byggyta</b><span>Välj en widget, justera till höger och håll scenen ren i mitten.</span></div><input class="widget-search" placeholder="Filter"><div class="editor-layer-list">${layerList()}</div><div class="elements-actions"><button data-open-overlay>＋ Add item</button></div><div class="widget-catalog"></div></div></div><div class="workarea"><div class="stage-topbar"><div class="stage-topbar-format"></div><div class="stage-topbar-center"></div><div class="stage-topbar-actions"></div></div><div class="stage-shell"><div class="stage-rail stage-rail-left"></div><div class="canvas-wrap"><div class="stage-caption"><span>Mobilskärm</span><b>1080 × 1920</b></div><div class="canvas-frame"><div class="canvas">${vyraRenderWidgets()}</div></div></div><div class="stage-rail stage-rail-right"></div></div></div><div class="properties"><div class="properties-head"><small class="panel-kicker">Inspector</small><div class="panel-title">${currentWidget?formatWidgetLabel(currentWidget):'Välj widget'}</div><p>${currentWidget?'Redigera vald widget med en egen panel som använder hela ytan för just den här widgeten.':'Välj en widget på scenen för att öppna dess egna inställningar.'}</p></div><div class="properties-body">${props()}</div></div></div>`}
function flows(){return `<div class="flow-head"><h2>Automationer</h2><button class="primary" id="newFlow">＋ Ny automation</button></div><div class="flows">${state.flows.map((f,i)=>`<article class="card flow-row"><div class="node"><b>◇ ${f.trigger}</b><small>TRIGGER</small></div><div class="arrow">→</div><div class="node"><b>▶ ${f.action}</b><small>ACTION</small></div><button data-toggle="${i}">${f.on?'Aktiv':'Pausad'}</button></article>`).join('')}</div>`}
function events(){return `<article class="card" style="padding:20px"><h2>Eventhistorik</h2><p>Händelser visas här när TikTok LIVE är anslutet.</p></article>`}
function analytics(){return `<div class="analytics-grid"><article class="card big-chart"><h2>Tillväxt senaste 30 dagarna</h2><p>Analys visas efter din första riktiga livesändning.</p></article><article class="card rank"><h2>Top supporters</h2><p>Ingen livedata ännu.</p></article></div>`}
function settings(){return `<article class="card settings-page"><h2>Kontoinställningar</h2><label>Visningsnamn<input id="dn" value="${state.user}"></label><label>TikTok<input value="${state.tiktok||'Inte anslutet'}" disabled></label><button class="primary" id="ss">Spara</button></article>`}
function render(){let m={home,editor,flows,events,analytics,settings};if(!m[view])view='home';let viewRoot=$('#view'),titleRoot=$('#title');if(!viewRoot||!titleRoot)return;viewRoot.innerHTML=m[view]();titleRoot.textContent=view==='home'?`God kväll, ${state.user}`:view[0].toUpperCase()+view.slice(1);bind()}
function go(v){if(!v)return;view=v;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));render()}
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
    let w=state.widgets.find(x=>x.id===selected);
    if(w){
      $('#pt')&&($('#pt').onchange=e=>{w.title=e.target.value;save();render()});
      $('#pv')&&($('#pv').onchange=e=>{w.value=e.target.value;save();render()});
      $('#del')&&($('#del').onclick=()=>{state.widgets=state.widgets.filter(x=>x.id!==selected);if(!state.widgets.length)window.__vyraUserEmptiedWidgets=true;selected=null;save();render()});
    }
    $('#testEvent')&&($('#testEvent').onclick=send);
    $('#saveProject')&&($('#saveProject').onclick=()=>{save();toast('Projekt sparat')});
  }
  if(view==='flows'){
    document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{state.flows[+b.dataset.toggle].on=!state.flows[+b.dataset.toggle].on;save();render()});
    $('#newFlow').onclick=()=>{state.flows.push({trigger:'Chatt !hype',action:'Visa animation',on:true});save();render()};
  }
  if(view==='settings')$('#ss').onclick=()=>{state.user=$('#dn').value;save();$('#userName').textContent=state.user;render();toast('Sparat')};
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>go(b.dataset.view));
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
