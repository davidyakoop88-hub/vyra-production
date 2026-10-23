(function(root){
  'use strict';
  const MAX_EVENTS=200, events=[];
  const stats={online:false,connected:false,connectionState:'idle',username:'',received:0,errors:0,reconnects:0,lastEventAt:0,lastPollAt:0,pollLatency:0,queueDepth:0,maxQueue:2000,dropped:0,processed:0};
  const battle={active:false,scoreUs:0,scoreThem:0,winsUs:0,winsThem:0,lastKind:'—',lastAt:0,multiplier:1,mvp:'—',events:0,liga:'',ligaPoang:null,ligaFarg:'',ligaBakgrund:'',ligaIkon:'',ligaVisa:true};
  let opened=false, filter='all', query='';
  // TESTGÅVANS ÅTERKOPPLING (F03). Klicket gav tidigare ingenting synligt: send() kastade i
  // webbläget och felet hamnade bara i konsolen. Nu skrivs utfallet i en aria-live-region intill
  // knappen. Tillståndet ligger utanför DOM:en, för render() bygger om hela vyn när eventet
  // kommer tillbaka — annars skulle beskedet suddas ut av just det event det handlar om.
  let testStatus={text:'',state:''};
  function testStatusHtml(){return `<p id="lcTestStatus" class="lc-test-status" role="status" aria-live="polite" data-state="${safe(testStatus.state)}">${safe(testStatus.text)}</p>`}
  function visaTestStatus(text,state){testStatus={text,state};const el=document.querySelector('#lcTestStatus');if(el){el.textContent=text;el.dataset.state=state}}
  async function skickaTestgava(){
    const live=root.VyraLive;
    if(!live||typeof live.send!=='function'){visaTestStatus('Live-klienten är inte laddad. Ladda om sidan och försök igen.','error');return}
    visaTestStatus('Skickar testgåva…','pending');
    try{await live.send({type:'gift',username:'TestViewer',name:'TestViewer',giftName:'Rose',coins:1,count:1});visaTestStatus('Testgåvan skickades.','ok')}
    catch(err){visaTestStatus((err&&err.message)||'Testgåvan kunde inte skickas.','error')}
  }

  function safe(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  // LIGABRICKANS VARDEN KOMMER FRAN TIKTOK och gar in i ett style-attribut respektive ett src.
  // Bada ar injektionsytor, sa de valideras pa FORM i stallet for att escapas: en farg som inte
  // ar en hexkod och en ikon som inte ar http(s) ritas inte alls. safe() racker inte for ett
  // style-attribut — `#fff;background:url(javascript:…)` innehaller inga tecken safe() ror.
  function hexFarg(v){return /^#[0-9a-fA-F]{3,8}$/.test(String(v||''))?String(v):''}
  function bildUrl(v){return /^https?:\/\/[^\s"'<>]+$/.test(String(v||''))?String(v):''}
  function actionMatches(event){
    try{
      const state=JSON.parse(localStorage.getItem('vyra-action-event-v2')||'{"actions":[],"events":[]}');
      const mapped=mapTrigger(event), value=String(mapped.payload.value??mapped.payload.gift??mapped.payload.command??'').toLowerCase();
      return state.events.filter(e=>e.enabled&&(e.advancedTrigger||e.trigger)===mapped.trigger&&(!String(e.triggerValue||e.condition||'')||value.includes(String(e.triggerValue||e.condition).toLowerCase()))).map(e=>state.actions.find(a=>a.id===(e.actionId||(e.allActionIds||[])[0]))?.name||'Automation');
    }catch{return []}
  }
  // `state` ar en const i studio.js och hamnar aldrig pa window — `root.state` var alltid undefined,
  // sa panelen sag aldrig en widget (2026-10-18). Las den delade bindningen; reserven ar samma objekt.
  function studioWidgets(){const st=typeof state!=='undefined'?state:root.VyraSessionState?.activeState?.();return Array.isArray(st?.widgets)?st.widgets:[]}
  function widgetMatches(event){
    const type=String(event.type||'').toLowerCase(), all=studioWidgets();
    return all.filter(w=>{const kind=String(w.type||w.group||'').toLowerCase();return !w.hidden&&((type.includes('gift')&&(String(w.group||'').includes('Gift')||kind.includes('gift')))||(type.includes('like')&&kind.includes('like'))||(type.includes('follow')&&kind.includes('follow'))||(type.includes('battle')&&(kind.includes('battle')||kind.includes('glovesnipe'))))}).map(w=>w.title||w.type).slice(0,5);
  }
  function mapTrigger(e){const t=String(e.type||'').toLowerCase(),p={username:e.username,name:e.name||e.username,gift:e.giftName,giftname:e.giftName,profileImage:e.profileImage,coins:e.diamonds??e.coins,diamonds:e.diamonds??e.coins,count:e.count,repeatcount:e.count,combo:e.count,value:e.name||e.giftName||e.username};if(t==='gift')return{trigger:e.count>1?'giftCombo':'gift',payload:p};if(t==='follow')return{trigger:'follow',payload:p};if(t==='member'||t==='subscribe')return{trigger:'member',payload:p};if(t==='share')return{trigger:'share',payload:p};if(t==='likes'||t==='like')return{trigger:'likes',payload:{...p,value:e.count}};if(t==='chatcommand')return{trigger:'chatCommand',payload:{...p,command:e.name,value:e.name}};return{trigger:t,payload:p}}
  function record(raw){
    const event={...raw,_receivedAt:Date.now(),_actions:actionMatches(raw),_widgets:widgetMatches(raw)};
    event._status=event._actions.length||event._widgets.length?'triggad':'ej matchad';
    events.unshift(event);if(events.length>MAX_EVENTS)events.length=MAX_EVENTS;
    stats.received++;stats.lastEventAt=event._receivedAt;
    raknaLike(raw);
    updateBattle(raw);
    if(opened)render();
  }
  function battleKind(event){const type=String(event.type||event.event||'').toLowerCase(),mult=+(event.multiplier||event.x||event.combo||0);if(type.includes('battle_start'))return'start';if(type.includes('battle_end'))return'end';if(type.includes('battle_mvp')||type==='mvp')return'mvp';if(type.includes('snipe'))return'snipe';if(type.includes('glove'))return'glove';if(type.includes('tap'))return'tap';if(type.includes('x3')||mult===3)return'x3';if(type.includes('x2')||mult===2)return'x2';if(type.includes('battle')||event.scoreUs!=null||event.scoreThem!=null)return'score';return''}
  function updateBattle(event){const kind=battleKind(event);if(!kind)return;battle.events++;battle.lastKind=kind.toUpperCase();battle.lastAt=Date.now();if(kind==='start')battle.active=true;if(kind==='end')battle.active=false;if(kind==='x2')battle.multiplier=2;if(kind==='x3')battle.multiplier=3;if(kind==='mvp')battle.mvp=event.username||event.name||'Okänd';if(event.winsUs!=null)battle.winsUs=+event.winsUs||0;if(event.winsThem!=null)battle.winsThem=+event.winsThem||0;if(event.scoreUs!=null)battle.scoreUs=+event.scoreUs||0;if(event.scoreThem!=null)battle.scoreThem=+event.scoreThem||0;if(event.ourScore!=null)battle.scoreUs=+event.ourScore||0;if(event.opponentScore!=null)battle.scoreThem=+event.opponentScore||0;/* LIGABRICKAN: bars bara i battle-payloaden, uppmatt 60 ganger over nio sandningar. Darfor VILLKORLIGT — varje annan handelse hade annars raderat en korrekt visad bricka. Vardet star kvar mellan matcher, precis som vinstsviten och poangen. #367 */if(event.ligaText){battle.liga=String(event.ligaText).slice(0,32);battle.ligaFarg=hexFarg(event.ligaFarg);battle.ligaBakgrund=hexFarg(event.ligaBakgrund);battle.ligaIkon=bildUrl(event.ligaIkon);battle.ligaVisa=event.ligaVisa!==false}if(event.ligaPoang!=null)battle.ligaPoang=+event.ligaPoang||0}
  // VAR KLIPPEN FAKTISKT KOMMER IFRAN (2026-10-23, "Tap Tap saknas"). Raden raknade bara de gamla
  // enklippswidgetarna (battleEventKind boost/tap/glove/snipe), som katalogen inte langre kan skapa.
  // Sedan 2026-10-09 ar ett paket EN widget med battleEventKind 'pack' — den matchade ingen av de
  // fyra, sa med Pink Princess i layouten stod alla fyra pa "saknas" (uppmatt i studion). Och
  // battle-fx-motorn spelar paketet som valts under Vip-widget aven utan widget — det raknades inte
  // heller. Nu raknas alla tre kallorna, klipp for klipp: ett MP4-paket har inget Snipe-klipp.
  const KLIPP_AV={boost:['boost-x2','boost-x3'],tap:['tap'],glove:['glove'],snipe:['snipe']};
  const KLIPP_NAMN={'boost-x2':'X2','boost-x3':'X3',tap:'Tap Tap',glove:'Glove',snipe:'Snipe'};
  function paketKlipp(packId,nyckel){const pkg=(root.VYRA_OVERLAY_PACKAGES||{})[packId],f=pkg&&(pkg.files||[]).find(x=>x.key===nyckel);return f?{path:f.path,namn:pkg.name}:null}
  function battleKallor(){
    const ut={boost:[],tap:[],glove:[],snipe:[]};
    const synliga=studioWidgets().filter(w=>w&&w.type==='templateGloveSnipe'&&!w.hidden);
    for(const w of synliga){
      if(w.battleEventKind==='pack'){
        for(const kind of Object.keys(KLIPP_AV))for(const nyckel of KLIPP_AV[kind]){
          let fil=null;try{fil=root.VyraBattlePaket?.fil?.(w,nyckel)||null}catch{}
          const pk=paketKlipp(w.boostPack,nyckel);if(!fil&&pk)fil=pk.path;
          if(fil){ut[kind].push({namn:pk?.namn||w.title||'Battle-paket',packId:w.boostPack,widget:w,nyckel,path:fil});break}
        }
      }else{
        const kind=String(w.battleEventKind||'boost');if(!ut[kind])continue;
        const nyckel=kind==='boost'?(Number(w.gloveMultiplier)===3?'boost-x3':'boost-x2'):kind,pk=paketKlipp(w.boostPack,nyckel);
        ut[kind].push({namn:w.title||pk?.namn||'Battle-widget',packId:w.boostPack,nyckel,path:pk?.path||''});
      }
    }
    // Motorn (battle-fx-auto.js) spelar i OBS nar inget paket ligger i layouten.
    let motor='';try{motor=root.VyraBattleFx?.installning?.().pack||''}catch{}
    if(motor&&!synliga.some(w=>w.battleEventKind==='pack'))for(const kind of Object.keys(KLIPP_AV))for(const nyckel of KLIPP_AV[kind]){const pk=paketKlipp(motor,nyckel);if(pk){ut[kind].push({namn:pk.namn,packId:motor,nyckel,path:pk.path,motor:true});break}}
    return ut;
  }
  function klippFil(k,nyckel){let f=null;try{f=k.widget?root.VyraBattlePaket?.fil?.(k.widget,nyckel):null}catch{}return f||paketKlipp(k.packId,nyckel)?.path||(k.nyckel===nyckel?k.path:'')||''}
  function configuredBattle(){const k=battleKallor();return Object.fromEntries(Object.keys(k).map(x=>[x,k[x].length]))}
  // LIKES ÄR TIKTOKS "TAP TAP": varje tryck pa skarmen ar en like. Raknas bara pa riktiga event —
  // testknappar, simulatorn och serverns testevent (id test-...) far aldrig se ut som publik.
  const likes={tider:[],senaste:0};
  function arTesthandelse(e){return !!(e&&(e.__test||e.__simulerad||e.__replay||/^test-/.test(String(e.id||''))))}
  function raknaLike(e){const t=String(e?.type||'').toLowerCase();if((t!=='like'&&t!=='likes')||arTesthandelse(e))return;const nu=Date.now(),antal=Math.max(1,Math.floor(Number(e.count)||1));likes.senaste=nu;likes.tider.push([nu,antal]);const grans=nu-60000;while(likes.tider.length&&likes.tider[0][0]<grans)likes.tider.shift()}
  function likesStatus(tiktokAnsluten){
    const nu=Date.now(),perMin=likes.tider.filter(x=>x[0]>=nu-60000).reduce((s,x)=>s+x[1],0);
    if(perMin>0)return{ok:true,text:`Likes ${perMin.toLocaleString('sv-SE')} / min`,title:'Riktiga likes kommer in från TikTok just nu.'};
    if(likes.senaste)return{ok:false,text:`Likes: senaste för ${Math.max(1,Math.round((nu-likes.senaste)/60000))} min sedan`,title:'Inga likes den senaste minuten. Be tittarna trycka på skärmen.'};
    if(tiktokAnsluten)return{ok:false,text:'Likes: inga ännu',title:'TikTok är anslutet men inga likes har kommit. Be tittarna trycka på skärmen — varje tryck är en like.'};
    return{ok:false,text:'Likes: väntar på TikTok',title:'Anslut TikTok LIVE först — likes kommer via anslutningen.'};
  }
  function likesHtml(tiktokAnsluten){const s=likesStatus(tiktokAnsluten);return `<span data-lc-likes class="${s.ok?'ok':''}" title="${safe(s.title)}">${safe(s.text)}</span>`}
  // Talet "/ min" sjunker utan nya event. Bara chipet patchas — ingen omritning av hela vyn.
  let likesUr=null;
  // Uret gar bara medan chipet syns i en synlig flik: lamnar man vyn stangs det av sig sjalvt.
  function startaLikesUr(){if(likesUr||typeof setInterval!=='function'||document.hidden)return;likesUr=setInterval(()=>{const el=document.querySelector('[data-lc-likes]');if(!el||document.hidden){clearInterval(likesUr);likesUr=null;return}const s=likesStatus(!!(root.VyraLive?.tillstand?.()?.gron??stats.connected));if(el.textContent!==s.text)el.textContent=s.text;el.title=s.title;el.classList.toggle("ok",s.ok)},15000)}
  // KLIPPKNAPPARNA FORHANDSVISAR (2026-10-23). De skickade forr ett pahittat battle_tap genom
  // widgetkedjan och record(): MOTTAGNA, "Matchhändelser" och "Senaste" visade da en match som
  // aldrig hant. I LIVE-kontroll syns ingen duk, sa kedjan visade heller ingenting. Nu spelas
  // paketets riktiga klipp har i panelen — ingenting skickas till OBS, ingenting raknas.
  const FORHANDS={x2:['boost','boost-x2'],x3:['boost','boost-x3'],tap:['tap','tap'],glove:['glove','glove'],snipe:['snipe','snipe']};
  // Rutan ligger UTANFOR #view: render() bygger om hela vyn vid varje event, och under en LIVE
  // kommer likes flera ganger i sekunden — en ruta i vyn hade borjat om klippet vid varje like.
  function forhandsRuta(){
    let ruta=document.querySelector('[data-lc-forhands]');if(ruta)return ruta;
    ruta=document.createElement('div');ruta.className='lc-battle-preview';ruta.dataset.lcForhands='';ruta.hidden=true;
    ruta.innerHTML='<video muted playsinline preload="metadata"></video><span><b></b><small>Förhandsvisning här i studion — ingenting skickas till OBS eller räknas i statistiken.</small></span><button type="button" data-lc-forhands-stang>Stäng</button>';
    ruta.querySelector('video').onended=stangForhands;ruta.querySelector('[data-lc-forhands-stang]').onclick=stangForhands;
    document.body.append(ruta);return ruta;
  }
  function stangForhands(){const ruta=document.querySelector('[data-lc-forhands]');if(!ruta)return;ruta.hidden=true;const v=ruta.querySelector('video');try{v.pause?.()}catch{}v.removeAttribute('src')}
  function forhandsvisa(knapp){
    const [kind,nyckel]=FORHANDS[knapp],kallor=battleKallor()[kind],etikett=KLIPP_NAMN[nyckel];
    let kalla=null,fil='';
    for(const k of kallor){const f=klippFil(k,nyckel);if(f){kalla=k;fil=f;break}}
    if(!kalla){stangForhands();root.toast?.(`Inget ${etikett}-klipp: lägg till ett battle-paket i layouten`);return false}
    const ruta=forhandsRuta(),v=ruta.querySelector('video');
    ruta.querySelector('b').textContent=kalla.namn+' · '+etikett;
    v.src=fil;try{v.currentTime=0}catch{}const p=v.play?.();p?.catch?.(()=>{});ruta.hidden=false;
    root.toast?.(`Förhandsvisning: ${kalla.namn} · ${etikett} — skickas inte till OBS`);
    return true;
  }
  function testBattle(kind){if(FORHANDS[kind])return forhandsvisa(kind);const map={x2:{type:'battle_x2',multiplier:2},x3:{type:'battle_x3',multiplier:3},tap:{type:'battle_tap',multiplier:2},glove:{type:'battle_glove',multiplier:2},snipe:{type:'battle_snipe',multiplier:2},mvp:{type:'battle_mvp',name:'Test MVP',username:'Test MVP',score:15000},start:{type:'battle_start'},end:{type:'battle_end'}};const event={id:Date.now(),timestamp:Date.now(),__test:true,...map[kind]};root.routeLiveBattleEvent?.(event);record(event);root.toast?.('Battle-test: '+kind.toUpperCase())}
  function replay(id){const e=events.find(x=>String(x.id)===String(id));if(!e)return;const copy={...e,id:Date.now(),timestamp:Date.now(),__replay:true};delete copy._actions;delete copy._widgets;delete copy._status;delete copy._receivedAt;root.routeLiveBattleEvent?.(copy);const m=mapTrigger(copy);root.VyraActionEvent?.handleEvent?.(m.trigger,{...m.payload,__test:true});root.toast?.('Eventet kördes igen lokalt')}
  function rate(){const cutoff=Date.now()-60000;return events.filter(e=>e._receivedAt>=cutoff).length}
  function filtered(){return events.filter(e=>(filter==='all'||String(e.type).toLowerCase()===filter)&&(!query||JSON.stringify(e).toLowerCase().includes(query))).slice(0,80)}
  function row(e){const hits=[...e._actions.map(x=>'⚡ '+x),...e._widgets.map(x=>'◇ '+x)];return `<tr><td><time>${new Date(e._receivedAt).toLocaleTimeString('sv-SE')}</time><b>${safe(e.type||'okänd')}</b></td><td><b>${safe(e.username||e.name||'—')}</b><small>${safe(e.giftName||e.name||'')}</small></td><td><span class="lc-status ${e._status==='triggad'?'ok':'idle'}">${e._status}</span><small>${hits.length?safe(hits.join(' · ')):'Ingen aktiv regel/widget matchade'}</small></td><td><button data-replay="${safe(e.id)}">Kör igen</button></td></tr>`}
  function mountPerformance(){const health=document.querySelector('.lc-health');if(!health)return;const load=Math.min(100,Math.round((stats.queueDepth/Math.max(1,stats.maxQueue))*100)),section=document.createElement('section');section.className='lc-performance';/* F23 (granskning 2026-10-17): varje mått är ett eget kort med etikett, värde och enhet — samma struktur som statuskorten ovanför. Förut låg allt inline och lästes som "Stabil0% köbelastning". */const matt=(id,etikett,varde,enhet)=>`<article data-lc-matt="${id}"><span><small>${etikett}</small><b>${varde}${enhet?` <em>${enhet}</em>`:''}</b></span></article>`;section.innerHTML=`<header><span><small>PRESTANDA & KRASCHSKYDD</small><b data-lc-belastning-status>${load<50?'Stabil':load<80?'Hög belastning':'Kritisk kö'}</b></span><em data-lc-belastning>${load} % köbelastning</em></header><div class="lc-load"><i style="width:${load}%"></i></div><div class="lc-perf-grid">${matt('ko','KÖ',`${stats.queueDepth} / ${stats.maxQueue}`,'event')}${matt('bearbetade','BEARBETADE',stats.processed,'event')}${matt('fordrojning','FÖRDRÖJNING',stats.pollLatency,'ms')}${matt('droppade','SKYDDADE / DROPPADE',stats.dropped,'event')}</div>`;health.after(section)}
  function mountBattle(tiktokAnsluten){const panel=document.querySelector('.lc-panel');if(!panel)return;const kallor=battleKallor(),configured=configuredBattle(),chip=(kind,etikett)=>`<span class="${configured[kind]?'ok':''}" data-lc-klipp="${kind}"${configured[kind]?` title="${safe('Spelas från: '+[...new Set(kallor[kind].map(k=>k.namn))].join(', '))}"`:''}>${etikett} ${configured[kind]||'saknas'}</span>`,saknas=['boost','tap','glove','snipe'].filter(k=>!configured[k]),ready=configured.boost+configured.tap+configured.glove+configured.snipe,section=document.createElement('section');section.className='lc-battle';section.innerHTML=`<header><div><small>LIVE MATCH</small><h3>Matchövervakning</h3></div><div class="lc-battle-status"><span class="lc-match-state ${battle.active?'active':''}">${battle.active?'MATCH AKTIV':'VÄNTAR'}</span>${battle.liga&&battle.ligaVisa?`<span class="lc-liga"${battle.ligaBakgrund?` style="background:${battle.ligaBakgrund}${battle.ligaFarg?`;color:${battle.ligaFarg}`:''}"`:''}>${battle.ligaIkon?`<img src="${battle.ligaIkon}" alt="" width="32" height="14">`:''}<b>${safe(battle.liga)}</b>${battle.ligaPoang!=null?`<em>${battle.ligaPoang}</em>`:''}</span>`:''}</div></header><div class="lc-score"><div><small>DITT LAG</small><strong>${battle.scoreUs.toLocaleString('sv-SE')}</strong><em class="lc-wins">${battle.winsUs} vinster</em></div><b>×${battle.multiplier}</b><div><small>MOTSTÅNDARE</small><strong>${battle.scoreThem.toLocaleString('sv-SE')}</strong><em class="lc-wins">${battle.winsThem} vinster</em></div></div><div class="lc-battle-meta"><span>Senaste: <b>${safe(battle.lastKind)}</b></span><span>MVP: <b>${safe(battle.mvp)}</b></span><span>Matchhändelser: <b>${battle.events}</b></span><span>Aktiva effekter: <b>${ready}</b></span></div><div class="lc-battle-ready">${chip('boost','X2/X3')}${chip('tap','Tap Tap')}${chip('glove','Glove')}${chip('snipe','Snipe')}${likesHtml(tiktokAnsluten)}</div>${saknas.length?`<p class="lc-battle-hint" data-lc-klipp-hint>${saknas.length===4?'Inga battle-klipp: lägg till ett helt battle-paket (VIDEO FX) i layouten, eller välj paket under Vip-widget → Automatisk battle-FX.':saknas.length===1&&saknas[0]==='snipe'?'Paketet har inget Snipe-klipp. Pink Princess, Royal Ruby och Cloud Fox har det.':'Klipp saknas: lägg till ett helt battle-paket (VIDEO FX) i layouten.'}</p>`:''}<div class="lc-battle-tests"><button data-battle-test="start">Start</button><button data-battle-test="x2">X2</button><button data-battle-test="x3">X3</button><button data-battle-test="tap">Tap Tap</button><button data-battle-test="glove">Glove</button><button data-battle-test="snipe">Snipe</button><button data-battle-test="mvp">MVP</button><button data-battle-test="end">Avsluta</button></div>`;panel.before(section);section.querySelectorAll('[data-battle-test]').forEach(b=>b.onclick=()=>testBattle(b.dataset.battleTest))}
  function render(){
    opened=true;document.querySelectorAll('aside button').forEach(b=>b.classList.toggle('active',b.dataset.extra==='liveControl'));
    // #crumb skrivs INTE har langre. Den harleds ur navetiketten av capture-lyssnaren i
    // studio.js (vyraSyncCrumb); den har filen var den gamla enda skrivaren, och en sen
    // setTimeout-render harifran skrev over den harledda brodsmulan med fel ord.
    const title=document.querySelector('#title'),view=document.querySelector('#view');if(!view)return;
    // Rubriken maste vara SAMMA ORD som navetiketten — husets navkontrakt (nav-state.browser).
    // Vyns egna H2 far garna heta "LIVE Control Center"; #title far inte.
    if(title)title.textContent='LIVE-kontroll';
    const types=[...new Set(events.map(e=>String(e.type||'okänd').toLowerCase()))];
    // F04: SERVER- och TIKTOK-korten läser samma tillståndsmodell som toppraden (live-client.js,
    // VyraLive.tillstand). Förut drevs de av vyra-server-status, som bara den lokala servern
    // skickar — i webbläget stod de därför kvar på "Offline" och "Väntar på connector" medan
    // toppraden sa "TikTok ansluten". Saknas modellen (gammal cachad live-client) gäller det gamla.
    const lt=root.VyraLive?.tillstand?.()||{server:{namn:'SERVER',text:stats.online?'Online':'Offline',varning:!stats.online},
      konto:stats.username||null,connector:stats.connected?'ansluten':'väntar',gron:stats.connected,
      connectorText:stats.connected?'Ansluten':stats.connectionState==='reconnecting'?'Återansluter':stats.connectionState==='stale'?'Signal saknas':'Väntar på anslutning'};
    const tikStatus=safe(lt.connectorText);
    const kontoRad=lt.konto?'@'+safe(String(lt.konto).replace(/^@/,'')):'Inget TikTok-konto sparat';
    view.innerHTML=`<div class="lc-page"><div class="lc-head"><div><h2>LIVE-kontroll</h2><p>Se varje TikTok-event, vad som matchade och varför inget hände.</p></div><div class="lc-test"><button id="lcTest" class="primary" aria-describedby="lcTestStatus">Skicka testgåva</button>${testStatusHtml()}</div></div><div class="lc-health"><article data-lc-kort="server"><i class="${lt.server.varning?'warn':''}"></i><span><small>${safe(lt.server.namn)}</small><b>${safe(lt.server.text)}</b></span></article><article data-lc-kort="tiktok" data-connector="${safe(lt.connector)}"><i class="${lt.gron?'ok':'warn'}"></i><span><small>TIKTOK</small><b>${tikStatus}</b><small class="lc-konto">${kontoRad}</small></span></article><article><span><small>HÄNDELSER / MIN</small><b>${rate()}</b></span></article><article><span><small>MOTTAGNA</small><b>${stats.received}</b></span></article><article><span><small>FEL</small><b>${stats.errors}</b></span></article></div><section class="lc-panel"><header><div><h3>Händelselogg</h3><span>${events.length} händelser i lokal historik</span></div><div><input id="lcSearch" value="${safe(query)}" placeholder="Sök namn, gift eller event"><select id="lcFilter"><option value="all">Alla händelser</option>${types.map(t=>`<option value="${safe(t)}" ${filter===t?'selected':''}>${safe(t)}</option>`).join('')}</select><button id="lcClear">Rensa</button></div></header><div class="lc-table"><table><thead><tr><th>Tid / event</th><th>Person / data</th><th>Resultat</th><th>Test</th></tr></thead><tbody>${filtered().length?filtered().map(row).join(''):'<tr><td colspan="4" class="lc-empty">Inga händelser ännu. Anslut TikTok LIVE eller skicka en testgåva.</td></tr>'}</tbody></table></div></section></div>`;
    mountPerformance();mountBattle(!!lt.gron);startaLikesUr();document.querySelector('#lcSearch').oninput=e=>{query=e.target.value.toLowerCase();render()};document.querySelector('#lcFilter').onchange=e=>{filter=e.target.value;render()};document.querySelector('#lcClear').onclick=()=>{events.length=0;render()};document.querySelector('#lcTest').onclick=skickaTestgava;document.querySelectorAll('[data-replay]').forEach(b=>b.onclick=()=>replay(b.dataset.replay));
  }
  addEventListener('vyra-server-status',e=>{const wasConnected=stats.connected,c=e.detail?.connection||{},client=e.detail?.client||root.VyraLive?.metrics?.()||{};stats.online=true;stats.connected=!!c.connected;stats.connectionState=c.state||'idle';stats.username=c.username||'';stats.reconnects=Math.max(stats.reconnects,Number(c.reconnectAttempt||0));stats.queueDepth=Number(client.queueDepth||0);stats.maxQueue=Number(client.maxQueue||2000);stats.dropped=Number(client.dropped||0);stats.processed=Number(client.processed||0);stats.pollLatency=Number(client.pollLatency||0);if(!wasConnected&&stats.connected&&stats.received)stats.reconnects++;if(opened)render()});
  addEventListener('vyra-live-tillstand',()=>{if(opened)render()});
  addEventListener('vyra-server-offline',()=>{stats.online=false;stats.connected=false;stats.errors++;if(opened)render()});
  addEventListener('vyra-live-event',e=>record(e.detail||{}));
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-extra="liveControl"]');if(b){e.preventDefault();setTimeout(render)}});
  root.VyraLiveControl={render,record,replay,testBattle,skickaTestgava,getSnapshot:()=>({stats:{...stats,eventRate:rate()},battle:{...battle},likes:likesStatus(!!(root.VyraLive?.tillstand?.()?.gron??stats.connected)),battleKallor:configuredBattle(),events:events.map(e=>({...e}))})};
})(typeof window!=='undefined'?window:globalThis);
