(function(root){
  'use strict';
  // Namespacade per workspace. Kon bar aldrig nagot konto-id (den ar {at,state}), sa en global ko
  // kan inte attribueras i efterhand - och det var precis sa A:s osparade layout kunde PUT:as till
  // B:s overlay vid ett kontobyte. Namespacet gor A:s ko oatkomlig for B utan att kasta bort den.
  const LEGACY_META='vyra-cloud-sync-meta',LEGACY_QUEUE='vyra-cloud-sync-queue',
    metaKey=id=>`vyra-cloud-sync-meta:${id}`,queueKey=id=>`vyra-cloud-sync-queue:${id}`,
    backupKey=id=>`vyra-session-backup:${id}`,EXTRA=['vyra-extras','vyra-action-event-v2','vyra-favorite-widgets','vyra-overlay-resolution','vyra-scene-settings-v1'];
  let workspace=null,overlay=null,lastLocal=localStorage.getItem('vyra-state'),timer=null,syncing=false,status='local',initialized=false;
  /* koadLokal = den ögonblicksbild som ligger i kön eller är på väg upp. lastLocal = den servern
     BEKRÄFTAT. Tidigare fanns bara lastLocal, och tickern satte den när en ändring UPPTÄCKTES —
     alltså innan något skickats. Två fel följde av det:
       1. Ändrade användaren något medan en push var i luften läste success-grenen om localStorage
          och kallade den nya layouten "skickad", fast den aldrig skickats. Nästa tick såg ingen
          skillnad, och ändringen var borta utan ett ljud. En dragning sparar många gånger i följd,
          så det som svaldes var oftast SLUTPOSITIONEN — den enda som betyder något.
       2. Misslyckades pushen var lastLocal redan framflyttad, så tickern kunde aldrig hitta
          ändringen igen. Den låg kvar i kön och väntade på en räddning som bara kom vid nästa
          initialize().
     Uppmätt i produktion 2026-09-03: flytt av en widget gav version 1938 -> 1939 på under sex
     sekunder; nästa sparning en stund senare gav INGENTING på sju sekunder med status 'synced',
     och en explicit push() fick fram den direkt (1939 -> 1940). */
  let koadLokal=null;
  // Sessionsgeneration: varje async operation fangar den fore sitt await och avbryter tyst om den
  // hunnit bytas. Utan den kan en PUT som startade som A landa - och skriva state - som B.
  let session=0,pendingChoice=null,tickTimer=null;
  const META=()=>metaKey(workspace.id),QUEUE=()=>queueKey(workspace.id);
  function read(key,fallback=null){try{return JSON.parse(localStorage.getItem(key))}catch{return fallback}}
  // ---- F03: VAD SERVERN BEKRÄFTAT OCH VAD DEN INTE SETT ÄN (granskningen 2026-10-18) -----------
  //
  // Editorn visade X=100 medan serverutgången — den OBS läser — stod kvar på X=20, och raden sade
  // först "Sparat i molnet ✓ · sparat 17:18" fast klockslaget var den LOKALA sparningen. Tre saker
  // följer härifrån:
  //   bekraftadVid  när servern senast bekräftade att den har samma layout som den här datorn
  //                 (sätts av setStatus('synced'), det enda läget där det är sant)
  //   obekraftade   varje ögonblicksbild som skickats men inte fått svar. Kom PUT:en fram men
  //                 svaret inte (nätet föll, fliken somnade) bär nästa PUT den gamla versionen och
  //                 får 409 — en "synkkonflikt" mot sig själv med en enda flik. Se forklara().
  //   skrivningar   räknas upp vid varje PUT, så att följaren kan se att en egen skrivning hann
  //                 starta medan den väntade på listan.
  let bekraftadVid=null,obekraftade=[],skrivningar=0;
  // Postgres JSONB sorterar om nycklarna, så serverns kopia och den skickade är aldrig samma
  // sträng. Jämförelsen görs på innehållet: nycklarna sorterade, savedAt bortlämnad (den är olika
  // i varje skickning) och storage bara när den bär något.
  function kanon(v){if(Array.isArray(v))return'['+v.map(kanon).join(',')+']';if(v&&typeof v==='object')return'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+kanon(v[k])).join(',')+'}';return JSON.stringify(v===undefined?null:v)}
  function innehall(state){if(!state||typeof state!=='object')return null;const{__vyraCloud:m,...rest}=state;const s=m&&m.storage&&typeof m.storage==='object'&&Object.keys(m.storage).length?m.storage:null;return kanon(s?{...rest,__storage:s}:rest)}
  // Hur många widgetar (plus en för övriga inställningar) skiljer den här datorn från det servern
  // bekräftat. Det är talet användaren behöver: "2 ändringar syns inte i OBS än". Antalet
  // sparningar vore fel mått — en enda dragning sparar många gånger.
  let diffMinne={a:null,b:null,n:0};
  function skillnad(fore,efter){
    if(!efter||!Array.isArray(efter.widgets))return 1;
    if(!fore||!Array.isArray(fore.widgets))return Math.max(1,efter.widgets.length);
    const f=new Map(fore.widgets.map(w=>[w&&w.id,kanon(w)])),e=new Map(efter.widgets.map(w=>[w&&w.id,kanon(w)]));
    let n=0;e.forEach((v,id)=>{if(f.get(id)!==v)n++});f.forEach((_,id)=>{if(!e.has(id))n++});
    const{widgets:_f,...fr}=fore,{widgets:_e,...er}=efter;if(kanon(fr)!==kanon(er))n++;
    return n}
  function antalOsynkade(){
    if(!workspace||!initialized)return 0;
    const nu=localStorage.getItem('vyra-state');
    if(nu==null||nu===lastLocal)return 0;
    if(diffMinne.a===lastLocal&&diffMinne.b===nu)return diffMinne.n;
    let n;try{n=skillnad(lastLocal==null?null:JSON.parse(lastLocal),JSON.parse(nu))}catch{n=1}
    diffMinne={a:lastLocal,b:nu,n};return n}
  const andringar=n=>n===1?'1 ändring':`${n} ändringar`;
  function payload(){const state=read('vyra-state');if(!state||!Array.isArray(state.widgets))return null;const storage={};EXTRA.forEach(k=>{const v=localStorage.getItem(k);if(v!=null)storage[k]=v});return{...state,__vyraCloud:{schema:1,storage,savedAt:Date.now()}}}
  // Molnlayouten projiceras av agaren: den tar laset, skriver markoren, nycklarna och kor
  // cacherna, och mutera globala state-objektet in-place. Utan det kunde tva flikar committa
  // varsin layout och den forlorande rulla tillbaka ovanpa vinnaren.
  async function apply(remote){if(!remote||!Array.isArray(remote.widgets))throw new Error('Online-layouten ar ogiltig');const data={...remote},meta=data.__vyraCloud;delete data.__vyraCloud;const extras={};Object.entries(meta?.storage||{}).forEach(([k,v])=>{if(EXTRA.includes(k)&&typeof v==='string')extras[k]=v});const token=root.VyraSessionState.beginProjection();const out=await root.VyraSessionState.projectActive(token,{mode:'studio-committed',workspaceId:workspace&&workspace.id,overlayId:overlay&&overlay.id,state:data,extras});if(!out.ok)throw new Error('Sessionen kunde inte projiceras');lastLocal=localStorage.getItem('vyra-state');root.render?.()}
  const STATUS_TEXT={synced:'Sparat i molnet ✓',saving:'Sparar…',offline:'Ingen kontakt med molnet',verifiering:'Verifiera din e-post för att spara i molnet',conflict:'Synkkonflikt',utloggad:'Du är utloggad',local:'Lokalt läge'};
  // UTGÅNGEN SESSION ÄR INTE ETT AVBROTT. Servern svarar 401 på en skrivning när sessionen gått ut —
  // eller när CSRF-token roterats bort av ett annat /api/auth/me (en annan flik, skrivbordsappen).
  // Båda gick tidigare till offline-grenen: "Ingen kontakt med molnet" och en synk som aldrig kom
  // tillbaka av sig själv. Rotationen botas tyst (fornyaSession()); en riktigt utgången session
  // får en egen rad och en knapp, och ändringarna skickas när inloggningen är klar.
  const UTLOGGAD_NOTE='Sessionen har gått ut. Dina ändringar finns kvar på den här datorn, men OBS hämtar layouten från servern och ser dem inte förrän du loggat in igen. De skickas direkt efter inloggningen.';
  // Konsekvensen, inte tillstandet. "Offline" i sig forklarar inte varfor OBS ser gammalt ut, och
  // da felsoker man widgeten i stallet for anslutningen — precis det som hant.
  const OFFLINE_NOTE='Dina ändringar finns kvar på den här datorn, men OBS hämtar layouten från servern och ser dem inte förrän synken är tillbaka.';
  // Senaste laget sparas for att en SEN mount ska kunna rita det. Lankraden byggs av media.js
  // bind(), alltsa efter att cloud-sync redan bootat och satt sitt forsta lage; utan minnet hade
  // rutan statt tom anda tills nasta statusbyte.
  // E-POSTSPÄRREN ÄR INTE ETT NÄTVERKSFEL. server/index.js svarar 403 {emailVerificationRequired}
  // på varje skrivning från ett konto med overifierad e-post — också den första POST /overlays. Den
  // gick tidigare till samma catch som ett avbrott, och ett nytt konto fick "Ingen kontakt med
  // molnet" och en lovad synk som aldrig kom. Se tests/cloud-sync-epostkrav.test.js.
  const VERIFIERING_NOTE='Ändringarna sparas på den här datorn. OBS-länken skapas när du öppnat länken i verifieringsmejlet och laddat om sidan.';
  const epostkrav=e=>!!(e&&e.emailVerificationRequired);
  let statusText=STATUS_TEXT.local;
  function setStatus(next,text){status=next;statusText=text||STATUS_TEXT[next];if(next==='synced')bekraftadVid=Date.now();paint();offlineNote()}
  // Tidpunkten for senaste LYCKADE skrivning, satt av agarens egen signal nedan. Visas som
  // suffix pa statusen i stallet for som eget element: .cloud-status ager redan fragan
  // "ar det sparat?", och tva element for samma svar ar dubbelkontrollen Etapp 3 tog bort.
  let sparatVid=null;
  const klockan=ms=>new Date(ms).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'});
  // I molnläge är klockslaget SERVERNS bekräftelse, inte den lokala sparningen: "Sparat i molnet ✓ ·
  // sparat 17:18" när 17:18 bara var disken är exakt den optimism granskningen fångade (F03).
  // Lokalt läge har ingen server, och där är den lokala sparningen hela sanningen.
  // data-sparat-vid bär fortfarande den lokala sparningen (maskinläsbar, autospar-provet).
  function paint(){
    const moln=!!(workspace&&initialized),n=moln?antalOsynkade():0;
    // 'synced' med väntande ändringar är inte synkat: en ny ändring hann komma medan förra
    // skickningen var ute. Raden får inte säga "syns i OBS" då.
    const lage=status==='synced'&&n>0?'vantar':status;
    let text;
    if(!moln)text=sparatVid?`${statusText} · sparat ${klockan(sparatVid)}`:statusText;
    else if(n>0)text=`${lage==='vantar'?'Väntar på att skicka':statusText} · ${andringar(n)} syns inte i OBS än`;
    else if(status==='synced')text=`${statusText} · syns i OBS${bekraftadVid?' · '+klockan(bekraftadVid):''}`;
    else text=statusText;
    const titel=!moln?'':`OBS visar serverns version${overlay&&overlay.version!=null?' (v'+overlay.version+')':''}${bekraftadVid?', senast bekräftad kl. '+klockan(bekraftadVid):''}. `
      +(n>0?`Den här datorn har ${andringar(n)} som servern inte bekräftat än.`:'Den här datorn och servern är överens.');
    // Skriver bara det som ändrats: paint() körs varje sekund från tickern, och andra moduler
    // lyssnar på DOM-mutationer.
    const satt=(el,k,v)=>{if(v==null){if(k in el.dataset)delete el.dataset[k]}else if(el.dataset[k]!==v)el.dataset[k]=v};
    document.querySelectorAll('.cloud-status').forEach(el=>{satt(el,'state',lage);
      satt(el,'sparatVid',sparatVid?String(sparatVid):null);
      satt(el,'osynkade',moln?String(n):null);
      satt(el,'bekraftadVid',moln&&bekraftadVid?String(bekraftadVid):null);
      satt(el,'serverVersion',moln&&overlay&&overlay.version!=null?String(overlay.version):null);
      if(el.title!==titel)el.title=titel;
      const span=el.querySelector('span');if(span&&span.textContent!==text)span.textContent=text})}
  // Agaren annonserar varje lyckad skrivning (session-state.js). Autosparet syns darmed aven i
  // lokalt lage, dar molnstatusen aldrig nar 'synced' — det ar precis det laget en oinloggad
  // anvandare ser, och det som fick Spara-knappen att verka nodvandig.
  // Samma signal markerar en osynkad ändring DIREKT (F03), i stället för när tickern hunnit se den
  // och debouncen gått — fram till dess sade raden "Sparat i molnet ✓" om något servern inte sett.
  root.addEventListener('vyra-session-state-saved',e=>{sparatVid=e.detail&&e.detail.at||Date.now();paint();offlineNote()});
  let noteHtml=null;
  function offlineNote(){
    const bar=document.querySelector('.overlay-link-bar');
    let note=document.querySelector('.cs-offline-note');
    if(status!=='offline'&&status!=='verifiering'&&status!=='utloggad'){note?.remove();noteHtml=null;return}
    if(!bar)return;
    if(!note){note=document.createElement('div');note.className='cs-offline-note';document.body.append(note);noteHtml=null}
    const n=antalOsynkade(),tillagg=(n>0?` ${andringar(n)} syns inte i OBS än.`:'')+(bekraftadVid?` Senast bekräftat av servern kl. ${klockan(bekraftadVid)}.`:'');
    const html=status==='verifiering'?'<b>Verifiera din e-post</b><span>'+VERIFIERING_NOTE+'</span>'
      :status==='utloggad'?'<b>Du är utloggad</b><span>'+UTLOGGAD_NOTE+tillagg+'</span><button type="button" class="primary" data-cs-logga-in>Logga in igen</button>'
      :'<b>Ingen kontakt med molnet</b><span>'+OFFLINE_NOTE+tillagg+'</span>';
    // Skrivs bara om när texten faktiskt ändrats: anropas vid varje sparning, och en knapp som
    // byts ut mitt i ett klick tappar klicket.
    if(html===noteHtml&&note.innerHTML)return;
    noteHtml=html;note.innerHTML=html;if(note.dataset)note.dataset.lage=status;
    const knapp=note.querySelector&&note.querySelector('[data-cs-logga-in]');
    if(knapp)knapp.onclick=()=>{root.VyraAuth?.showGate?.('login')};
  }
  // Var en tom stubb. setStatus() skrev till document.querySelectorAll('.cloud-status') och det
  // fanns inget sadant element pa sidan — ingen skapade det. Hela statusmaskinen raknade ut ratt
  // lage och skickade det till noll element, och cloud-sync.css bar fardig styling for varje lage
  // som aldrig ritades. Anvandaren kunde alltsa inte se om en sparning natt molnet, och refreshade
  // OBS for tidigt.
  //
  // Anropas bade fran initialize() och fran tickern varje sekund, darfor idempotent: lankraden
  // finns annu inte nar cloud-sync bootar.
  function mountStatus(){
    const bar=document.querySelector('.overlay-link-bar');
    if(!bar)return false;
    if(bar.querySelector('.cloud-status'))return true;
    const host=bar.querySelector('div')||bar,el=document.createElement('div');
    el.className='cloud-status';el.innerHTML='<i></i><span></span>';
    host.append(el);paint();offlineNote();return true;
  }
  async function call(path,options){return root.VyraAuth.api(path,options)}
  async function list(){return call(`/api/workspaces/${workspace.id}/overlays`)}
  // EN NY WEBBLÄSARE HAR INGEN vyra-state (uppmätt i produktion 2026-10-11: kontot jrofficialswe
  // fick 400 "Ogiltig overlay" vid varje sidladdning och hade noll overlays efter en dag).
  // payload() ger då null, och `state: null` avvisas av serverns validOverlayState. Första
  // overlayn får därför en TOM men giltig layout; användarens första sparning fyller den sedan
  // via push() som vanligt. Se tests/cloud-sync-forsta-overlay.test.js.
  function tomLayout(){return{widgets:[],__vyraCloud:{schema:1,storage:{},savedAt:Date.now()}}}
  async function create(){const data=payload()||tomLayout();const d=await call(`/api/workspaces/${workspace.id}/overlays`,{method:'POST',body:JSON.stringify({name:'Min VYRA-overlay',state:data})});overlay=d.overlay;saveMeta();return overlay}
  function saveMeta(){if(!overlay)return;localStorage.setItem(META(),JSON.stringify({workspaceId:workspace.id,overlayId:overlay.id,version:overlay.version,updatedAt:overlay.updated_at,lastLocal}))}
  async function getRemote(id){return(await call(`/api/workspaces/${workspace.id}/overlays/${id}`)).overlay}
  // Wipe-guard: allowEmptyWidgets följer med bara när användaren själv raderat sista widgeten
  // i den här sessionen (flaggas av layer-delete i media.js). En tom layout från t.ex. en
  // nyinloggad enhet utan lokal historik stoppas annars av serverns 409 emptyBlocked och
  // hamnar i den vanliga konfliktdialogen istället för att tyst nolla molnet.
  async function skicka(){if(!workspace||!overlay||syncing||!root.VyraSessionState.canPush())return{ok:false,status:0,reason:'busy'};const mine=session;const skickad=localStorage.getItem('vyra-state');const data=payload();if(!data)return{ok:false,status:0,reason:'no-state'};syncing=true;skrivningar++;
    // Minns ögonblicksbilden tills servern svarat. Se forklara().
    const forsok={raw:skickad,innehall:innehall(data),version:overlay.version,emptied:false,tappade:false};obekraftade.push(forsok);if(obekraftade.length>20)obekraftade.shift();
    setStatus('saving');try{const emptied=root.__vyraUserEmptiedWidgets===true&&data.widgets.length===0;const tappade=root.__vyraUserRemovedWidget===true;forsok.emptied=emptied;forsok.tappade=tappade;
      // Har anvandaren lagt tillbaka widgets ar avsikten "jag tomde layouten" inaktuell och
      // raderas direkt. Annars kunde en gammal avsikt ligga kvar och tillata en senare tomning
      // som ingen bett om.
      if(root.__vyraUserEmptiedWidgets===true&&data.widgets.length>0)delete root.__vyraUserEmptiedWidgets;let d;d=await call(`/api/workspaces/${workspace.id}/overlays/${overlay.id}`,{method:'PUT',body:JSON.stringify({name:overlay.name,state:data,version:overlay.version,allowEmptyWidgets:data.widgets.length===0&&emptied,allowWidgetLoss:tappade})});
      // Tillatelsen forbrukas nar skrivningen LYCKATS, inte nar den forsoktes. Lag raderingen i ett
      // finally forsvann anvandarens avsikt aven vid versionskonflikt eller natverksfel, och varje
      // retry blockerades da av serverns emptyBlocked — layouten kunde aldrig tommas.
      if(emptied)delete root.__vyraUserEmptiedWidgets;if(tappade)delete root.__vyraUserRemovedWidget;if(mine!==session)return{ok:false,status:0,reason:'superseded'};overlay=d.overlay;obekraftade=[];localStorage.removeItem(QUEUE());lastLocal=skickad;const nuLokal=localStorage.getItem('vyra-state');/* Andrades layouten UNDER resan ar den an sa lange oskickad. Den skrivs till koadLokal och schemalaggs har, i stallet for att lamnas at tickern: dels gar den fram direkt i stallet for att vanta pa nasta sekund, dels ser tickern da att den redan ar koad och koar inte om den. Utan den detaljen skickas samma andring TVA ganger. */if(nuLokal!==lastLocal){koadLokal=nuLokal;localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:payload()}));saveMeta();setStatus('synced');schedule();return{ok:true}}koadLokal=null;saveMeta();setStatus('synced');return{ok:true}}catch(e){if(e&&e.status===409){/* F03: en 409 kan vara VÅR EGEN skrivning, vars svar aldrig kom fram. Den förklaras innan någon konflikt visas. */if(mine===session){let remote=null;try{remote=await getRemote(overlay.id)}catch{}if(mine===session&&forklara(remote))return{ok:true,reason:'egen-skrivning'}}if(mine!==session)return{ok:false,status:0,reason:'superseded'};localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:data}));koadLokal=null;setStatus('conflict');showConflict();return{ok:false,status:409}}else if(e&&e.status===401){/* Avgörs av push(): förnyad CSRF eller utgången session. Statusen lämnas åt den. */localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:data}));koadLokal=null;return{ok:false,status:401,reason:'auth'}}else if(epostkrav(e)){localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:data}));koadLokal=null;setStatus('verifiering');return{ok:false,status:403}}else{localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:data}));koadLokal=null;setStatus('offline');return{ok:false,status:e&&e.status?e.status:0}}}finally{syncing=false}}
  // push() är skicka() plus beslutet om en 401. Första 401:an försöker förnya CSRF-token: servern
  // svarar 401 'Inte inloggad' också när token roterats av ett annat GET /api/auth/me (en annan flik,
  // skrivbordsappen, "Jag har verifierat"-knappen), och då lever sessionen. Bara när /api/auth/me
  // självt nekar — eller den nya token också nekas — är sessionen verkligen ute.
  async function push(){
    const mine=session;let r=await skicka();
    if(!r||r.reason!=='auth')return r;
    if(mine!==session)return{ok:false,status:0,reason:'superseded'};
    if(await fornyaSession()&&mine===session){r=await skicka();if(!r||r.reason!=='auth')return r}
    if(mine!==session)return{ok:false,status:0,reason:'superseded'};
    hanteraUtloggad();return r}
  // auth-client.js sparar själv den nya CSRF-token när /api/auth/me svarar (den äger nyckeln).
  async function fornyaSession(){try{const me=await call('/api/auth/me');return!!(me&&me.user)}catch{return false}}
  function hanteraUtloggad(){clearTimeout(timer);timer=null;setStatus('utloggad')}
  // FÖRKLARA EN NYARE SERVERVERSION INNAN DEN KALLAS KONFLIKT. Konflikten i granskningen uppstod
  // med en enda Studio-flik. Två vägar dit utan någon annan skribent, båda reproducerade i
  // tests/cloud-sync-synkstatus.test.js:
  //   1. PUT:en kom fram men svaret inte. overlay.version stod kvar, nästa PUT fick 409, och
  //      banderollen sade "Layouten ändrades på en annan dator" — om vår egen skrivning.
  //   2. Följaren läste listan medan en egen PUT var ute; den såg version+1 innan PUT-svaret
  //      hunnit flytta fram overlay.version, och sin egen osparade ändring som "osynkad".
  // Har servern exakt det innehåll som den här datorn har nu — eller som den skickade och inte fick
  // svar på — är det ingen konflikt. Versionen tas över och det som återstår skickas. Allt annat
  // (en annan enhet, krympvakten, serverns kampanjnollställning) går till banderollen som förut.
  function forklara(remote){
    if(!remote||!remote.state||!overlay||(remote.id!=null&&remote.id!==overlay.id))return false;
    const k=innehall(remote.state),nu=localStorage.getItem('vyra-state');let raw,traff=null;
    if(k===innehall(payload()))raw=nu;
    else{traff=obekraftade.find(f=>f.innehall===k&&Number(remote.version)>Number(f.version));if(!traff)return false;raw=traff.raw}
    // Avsikten att radera förbrukades av skrivningen som faktiskt landade.
    if(traff&&traff.emptied)delete root.__vyraUserEmptiedWidgets;if(traff&&traff.tappade)delete root.__vyraUserRemovedWidget;
    overlay=remote;obekraftade=[];lastLocal=raw;
    if(nu!==lastLocal){koadLokal=nu;localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:payload()}));saveMeta();setStatus('synced');schedule()}
    else{koadLokal=null;localStorage.removeItem(QUEUE());saveMeta();setStatus('synced')}
    return true}
  function schedule(){clearTimeout(timer);timer=setTimeout(push,1800)}
  function choice(remote){return new Promise(resolve=>{pendingChoice=resolve;const modal=document.createElement('div');modal.className='cs-modal';modal.innerHTML='<section><small>FÖRSTA CLOUD-SYNK</small><h2>Vilken layout vill du behålla?</h2><p>Det finns både en layout på den här datorn och en online. Ingenting skrivs över innan du väljer.</p><div><button data-choice="remote">Använd online-versionen</button><button class="primary" data-choice="local">Behåll den här datorns version</button></div></section>';document.body.append(modal);modal.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{modal.remove();pendingChoice=null;resolve(b.dataset.choice)})})}
  function showConflict(){if(document.querySelector('.cs-conflict'))return;const bar=document.createElement('div');bar.className='cs-conflict';bar.innerHTML='<span><b>Synkkonflikt</b><small>Layouten ändrades på en annan dator. Välj vilken version som ska behållas.</small></span><button data-cs-online>Online</button><button class="primary" data-cs-local>Den här datorn</button>';document.body.append(bar);bar.querySelector('[data-cs-online]').onclick=async()=>{try{overlay=await getRemote(overlay.id);await apply(overlay.state);/* lastLocal maste folja med: utan det sag tickern den nyss hamtade layouten som en LOKAL andring och skickade molnets egen layout tillbaka till molnet (uppmatt 2026-10-10: PUT 200 sju sekunder efter varje Online-klick). */lastLocal=localStorage.getItem('vyra-state');saveMeta();localStorage.removeItem(QUEUE());setStatus('synced');bar.remove()}catch{setStatus('offline')}};bar.querySelector('[data-cs-local]').onclick=async()=>{try{overlay=await getRemote(overlay.id);/* VALET AR AVSIKTEN. Serverns 409-text sager "valj version i synkdialogen", och det har ar dialogen: den som trycker "Den har datorn" har sett att versionerna skiljer sig och valt sin egen. Utan flaggan skickade knappen samma sparning som nyss avvisats av krympvakten och fick 409 igen — banderollen stod kvar for evigt (uppmatt 2026-10-10: 44 st 409 pa tre minuter). Flaggan forbrukas av push() nar skrivningen lyckats. */root.__vyraUserRemovedWidget=true;const r=await push();
    // push() KASTAR inte vid 409 — den returnerar {ok:false} och satter sjalv conflict-status.
    // Utan avbrottet har fortsatte kedjan till bar.remove(), och den nya banderollen som
    // 409-vagen visar undertrycktes av vakten overst eftersom den gamla annu fanns i DOM:
    // tyst permanent konflikt, valet nadde aldrig servern. Banderollen far bara bort nar
    // skrivningen bevisligen lyckats; star den kvar kan anvandaren valja igen.
    if(!r.ok)return;
    // Online-knappen ovan projicerar via apply(). Den har gjorde det inte: push() skriver till
    // SERVERN, inte till sessionen, sa "behall den har datorn" lamnade sessionen okommitterad och
    // darmed oskrivbar - anvandaren fick sin layout kvar men kunde inte andra nagot i den.
    await apply(payload());bar.remove()}catch{setStatus('offline')}}}
  // Legacy: den globala metan namnger sin agare, kon gor det inte. Matchar metan aktuellt workspace
  // migreras bada till namespacet. Gor den det inte - eller saknas den helt - kan agarskapet inte
  // bevisas, och da far datan varken visas eller adopteras av nagon. Den karantaniseras under ett
  // eget orphan-id: sakerhetskarantan, inte aterstallning.
  function settleLegacy(){
    const legacyMeta=read(LEGACY_META),legacyQueue=localStorage.getItem(LEGACY_QUEUE);
    if(!legacyMeta&&legacyQueue==null)return;
    if(legacyMeta&&legacyMeta.workspaceId===workspace.id){
      if(!localStorage.getItem(META()))localStorage.setItem(META(),JSON.stringify(legacyMeta));
      if(legacyQueue!=null&&!localStorage.getItem(QUEUE()))localStorage.setItem(QUEUE(),legacyQueue);
    }else{
      localStorage.setItem('vyra-session-orphan:'+new Date().toISOString(),
        JSON.stringify({meta:legacyMeta,queue:legacyQueue?read(LEGACY_QUEUE):null,at:Date.now()}));
    }
    localStorage.removeItem(LEGACY_META);localStorage.removeItem(LEGACY_QUEUE);
  }

  async function initialize(detail){
    if(initialized||!detail?.workspaces?.length)return;
    initialized=true;workspace=detail.workspaces[0];const mine=++session;
    mountStatus();setStatus('saving','Ansluter cloud…');
    try{
      settleLegacy();
      const result=await list();if(mine!==session)return;
      const meta=read(META()),items=result.overlays||[];
      // FÖRSTA OVERLAYN MÅSTE OCKSÅ PROJICERAS (uppmätt 2026-10-11, jrofficialswe): apply() är det
      // som commitar sessionen (projectActive, mode studio-committed). Utan den var canPush()
      // falsk hela första sessionen — widgets lades till, raden sade "Sparat i molnet ✓", och
      // molnet stod kvar på version 1 med noll widgets. Se tests/cloud-sync-forsta-overlay-commit.test.js.
      // Overifierad e-post: ingen overlay kan skapas an. Sessionen projiceras anda — utan overlay-id —
      // sa att studion ar skrivbar pa den har datorn. Nasta inloggning efter verifieringen gar hit
      // igen, och create() laddar da upp det som byggts som forsta overlay (payload()).
      if(!items.length){try{await create()}catch(e){if(!epostkrav(e))throw e;if(mine!==session)return;await apply(payload()||tomLayout());if(mine!==session)return;setStatus('verifiering');return}if(mine!==session)return;await apply(overlay.state);if(mine!==session)return;saveMeta();setStatus('synced');startTicker();return}
      const preferred=items.find(x=>x.id===meta?.overlayId)||items[0];
      overlay=await getRemote(preferred.id);if(mine!==session)return;

      // Ordningen ar sakerhetsegenskapen. Ett parkerat arbete for DETTA workspace lamnas tillbaka;
      // annars anvands molnets version. Den lokala layouten far bara vaga in nar den bevisligen
      // tillhor samma workspace - annars skulle konto B erbjudas konto A:s layout.
      const parked=read(backupKey(workspace.id));
      const local=payload();
      const ownsLocal=!!meta&&meta.workspaceId===workspace.id&&meta.overlayId===overlay.id;
      // OSYNKAT ARBETE FRAN FORRA SIDAN. meta.lastLocal ar det servern senast BEKRAFTAT. Skiljer sig
      // vyra-state fran den ar det en andring som aldrig skickades: tickern (1 s) och debouncen
      // (1,8 s) dog med sidan. Lases FORE apply(), som annars flyttar fram lastLocal och — via
      // saveMeta() i sista grenen — stampla den osynkade staten som synkad for gott. Uppmatt i Edge
      // 2026-10-18: Anpassa -> "Klar" navigerar till layout.html direkt, och andringen forlorades
      // i 2 av 8 korningar medan statusraden sa 'synced'. Se tests/cloud-sync-omladdning.test.js.
      const osynkat=ownsLocal&&localStorage.getItem('vyra-state')!==meta.lastLocal;
      let skickaNu=false;
      if(parked&&parked.state){
        // Aterlamningen ar en full projektion under DETTA workspace, inte en restore inuti en redan
        // committad session - vid aterkomst finns ingen committad session an. Backupen tas bort
        // forst nar projektionen faktiskt lyckats, annars vore arbetet borta vid ett skrivfel.
        const token=root.VyraSessionState.beginProjection();
        const out=await root.VyraSessionState.projectActive(token,{mode:'studio-committed',
          workspaceId:workspace.id,overlayId:overlay.id,state:parked.state,extras:parked.extras||{},
          reason:'backup-restored'});
        if(mine!==session)return;
        if(out.ok){localStorage.removeItem(backupKey(workspace.id));
          // F03: ÅTERLÄMNAD ÄR INTE SAMMA SAK SOM SYNKAD. Grenen sade alltid 'synced' och stämplade det
          // parkerade arbetet som bekräftat — också när det var ändringar servern aldrig fått (en
          // utloggning medan synken låg nere, en session som gick ut). Editorn visade X=100,
          // serverutgången X=20, och raden "Sparat i molnet ✓". Nu jämförs innehållet:
          const nu=localStorage.getItem('vyra-state'),k=innehall(overlay.state);
          let bekraftat=null;try{bekraftat=ownsLocal&&meta.lastLocal!=null?innehall(JSON.parse(meta.lastLocal)):null}catch{}
          if(k===innehall(payload())){lastLocal=nu;saveMeta();setStatus('synced')}
          // Inget nytt sedan senaste bekräftelsen, men molnet har gått vidare (annan enhet): samma
          // beslut som grenen meta.version < molnets nedan — molnets version tas in.
          else if(bekraftat!=null&&bekraftat===innehall(parked.state)){await apply(overlay.state);if(mine!==session)return;saveMeta();setStatus('synced')}
          // Osynkat arbete och molnet står still sedan sist: det skickas, med meta-versionen, så att
          // servern svarar 409 om någon annan hunnit skriva.
          else if(ownsLocal&&Number(meta.version)>=Number(overlay.version)){lastLocal=meta.lastLocal??null;koadLokal=nu;
            localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:payload()}));saveMeta();setStatus('saving');skickaNu=true}
          // Osynkat arbete OCH ett moln som gått vidare: användaren väljer.
          else{lastLocal=nu;setStatus('conflict');showConflict()}}
        // Misslyckas aterlamningen behalls backupen och molnets layout skrivs INTE in. Tidigare
        // ersattes det parkerade arbetet tyst av molnet — anvandaren sag bara "synced" och att
        // widgetarna var borta. Nasta initialize forsoker igen, sa lange backupen ligger kvar.
        else{setStatus('offline','Kunde inte återställa din layout — försöker igen')}
      // "Lokalt har noll widgets" betydde tidigare alltid "den har enheten har inget — hamta
      // molnets". Grenen finns for en ny dator, och det ar ratt. Men den kunde inte skilja
      // "har ingen layout an" fran "anvandaren raderade precis allt" eller "utloggningen
      // neutraliserade staten" — alla tre ser ut som widgets.length === 0. Foljden var att en
      // tomd layout fylldes med molnets widgets, inklusive sadana anvandaren aldrig valt.
      //
      // Skillnaden ar durabel och fanns redan: meta.lastLocal ar den lokala state som senast
      // synkats. Skiljer sig nuvarande state fran den har enheten OSYNKAT arbete — aven nar det
      // arbetet bestar i att ha raderat allt. Da far molnet inte skriva over det tyst.
      }else if(ownsLocal&&!local?.widgets?.length&&localStorage.getItem('vyra-state')!==meta?.lastLocal){
        // Anvandarens tomhet ar sanningen som ska upp. Servern har sin egen wipe-guard och svarar
        // 409 emptyBlocked om den inte tror pa den — da hamnar vi i konfliktdialogen, som ar den
        // avsedda vagen. Det som INTE far hanta ar att molnet vinner utan att nagon fragat.
        // Samma sak som i gren 6 nedan, av samma skal: utan projektion ar sessionen inte skrivbar.
        // Har biter det extra hart - anvandaren har precis tomt sin layout, och utan den har raden
        // kan hen inte lagga tillbaka nagonting alls under resten av sessionen. Kon och pushen
        // skriver till servern, inte till sessionen, och gor alltsa inte det har at oss.
        await apply(local);if(mine!==session)return;
        localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:local}));
        saveMeta();setStatus('saving');schedule()
      }else if(!ownsLocal||!local?.widgets?.length){
        await apply(overlay.state);if(mine!==session)return;saveMeta();setStatus('synced')
      }else if(meta&&Number(meta.version)<Number(overlay.version)&&localStorage.getItem('vyra-state')!==meta.lastLocal){
        // F03: molnet är nyare och lokalt har osynkat — men är det NÅGON ANNANS skrivning? Har
        // molnet exakt den här datorns innehåll, eller det som låg i kön (skickat, svaret aldrig
        // framme, sidan omladdad), är det vår egen version. Då tas den över i stället för att
        // banderollen frågar användaren om hen vill behålla sin egen ändring mot sig själv.
        const ko=read(QUEUE()),k=innehall(overlay.state),lika=k===innehall(local);
        if(lika||(ko&&ko.state&&innehall(ko.state)===k)){
          await apply(local);if(mine!==session)return;
          if(lika){lastLocal=localStorage.getItem('vyra-state');koadLokal=null;localStorage.removeItem(QUEUE());saveMeta();setStatus('synced')}
          else{lastLocal=meta.lastLocal??null;koadLokal=localStorage.getItem('vyra-state');
            localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:payload()}));saveMeta();setStatus('saving');skickaNu=true}
        }else{setStatus('conflict');showConflict()}
      }else if(meta&&Number(meta.version)<Number(overlay.version)){
        await apply(overlay.state);if(mine!==session)return;saveMeta();setStatus('synced')
      }else{
        // Lokalt och moln ar overens. Tidigare stannade boot har utan att projicera - och det ar
        // projektionen som gor bada de sakerna som behovs: den laddar layouten fran disk in i det
        // aktiva stateobjektet, alltsa det canvasen ritar, OCH den satter laget till
        // studio-committed, som ar det enda skrivbara laget (session-state.js:123).
        //
        // Utan den sag anvandaren en tom canvas medan layouten lag kvar pa disk, och allt hen
        // gjorde darefter - ny widget, flytt, storleksandring - returnerade tyst not-writable och
        // nadde aldrig disken. Nasta inloggning sag likadan ut. Uppmatt i produktion: 1 widget pa
        // disk, 0 i minnet, 0 pa canvas, lage boot-neutral.
        //
        // Det ar dessutom NORMALLAGET, inte ett kantfall: hit gar varje inloggning dar ingenting
        // andrats sedan sist.
        //
        // Det som projiceras ar den LOKALA layouten, inte molnets. Innehallet ar detsamma har, men
        // lokalt ags redan av det har workspacet, och payload() bar med sig extras som annu kan
        // sakna sin motsvarighet i molnet.
        await apply(local);if(mine!==session)return;
        // Osynkat lokalt: apply() satte lastLocal till den nyss projicerade staten. Den far INTE bli
        // meta.lastLocal forran servern svarat, annars ar andringen "synkad" utan att ha lamnat
        // maskinen. Hit kommer vi bara nar meta.version >= molnets — ar molnet nyare tog grenen
        // ovan konfliktvagen — och PUT:en bar meta-versionen, sa servern avvisar den med 409 om
        // nagon annan hunnit skriva emellan. Den kan alltsa aldrig skriva over en nyare molnversion.
        if(osynkat){lastLocal=meta.lastLocal??null;koadLokal=localStorage.getItem('vyra-state');
          localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:payload()}));
          saveMeta();setStatus('saving');skickaNu=true}
        else{saveMeta();setStatus('synced');if(read(QUEUE()))schedule()}
      }
      startTicker();
      // Skickas direkt i stallet for efter debouncen: anvandaren har redan vantat en sidladdning.
      if(skickaNu){const r=await push();if(r&&r.reason==='busy'&&mine===session)schedule()}
    }catch{setStatus('offline')}}
  // Ett uttryckligt {authRequired:false} - alltsa desktopappen, som inte har nagot kontosystem -
  // ger maskinens egen session. Ett misslyckat konfigsvar dispatchar inte det har eventet, sa ett
  // natverksfel kan aldrig oppna en skrivbar session utan verifierad identitet.
  // Logout river hela den sessionsbundna maskinen, inte tre id:n. Generationen hojs forst, sa varje
  // svar som redan ar i luften blir verkningslost innan nagot annat hinner kora.
  function resetSession(){session+=1;clearTimeout(timer);timer=null;if(tickTimer){clearInterval(tickTimer);tickTimer=null}if(foljTimer){clearInterval(foljTimer);foljTimer=null}foljer=false;
    if(pendingChoice){const resolve=pendingChoice;pendingChoice=null;resolve('aborted')}
    document.querySelector('.cs-modal')?.remove();document.querySelector('.cs-conflict')?.remove();
    workspace=null;overlay=null;lastLocal=null;syncing=false;initialized=false;obekraftade=[];bekraftadVid=null;setStatus('local')}
  root.VyraSessionState?.registerTeardown?.('cloud-sync',resetSession);
  addEventListener('vyra-session-ended',resetSession);
  let authHanterad=false;
  addEventListener('vyra-auth-local',()=>{authHanterad=true;root.VyraSessionState.projectLocalSession()});
  addEventListener('vyra-auth-ready',e=>{authHanterad=true;if(initialized&&workspace){ateruppta(e.detail);return}initialize(e.detail)});
  // NY INLOGGNING MITT I EN SESSION (F03). auth-client.js visar inloggningsrutan ovanpå studion —
  // "Logga in igen" ovan, eller när /api/auth/me nekar — och avfyrar vyra-auth-ready när den är
  // klar. initialize() gör ingenting en andra gång, så tidigare låg den osynkade ändringen kvar
  // tills nästa omladdning. Nu skickas den direkt. Är det ett ANNAT konto som loggat in rivs den
  // gamla sessionen som vid en vanlig utloggning (parkerar arbetet under sitt eget workspace)
  // innan det nya kontot initieras — A:s layout får aldrig skickas till B:s overlay.
  function ateruppta(detail){
    const ws=detail&&detail.workspaces&&detail.workspaces[0];if(!ws)return;
    if(ws.id!==workspace.id){const ss=root.VyraSessionState;
      Promise.resolve(ss&&ss.beginLogout?ss.beginLogout():resetSession()).catch(()=>{}).then(()=>{if(initialized)resetSession();initialize(detail)});return}
    if(status==='utloggad'||status==='offline'||read(QUEUE())||localStorage.getItem('vyra-state')!==lastLocal){
      setStatus('saving');push().then(r=>{if(r&&r.reason==='busy')schedule()}).catch(()=>{})}}
  setTimeout(()=>{
    if(authHanterad)return;
    authHanterad=true;
    if(root.VyraAuth?.isLocalSession?.()){root.VyraSessionState.projectLocalSession();return}
    const d=root.VyraAuth?.lastDetail?.();
    if(d?.workspaces?.length)initialize(d);
  },400);addEventListener('online',()=>{if(workspace)schedule()});addEventListener('offline',()=>setStatus('offline'));
  // ---- REDIGERAREN FOLJER MOLNET (Davids beslut 2026-10-10) -----------------------------------
  //
  // Appen och webben delar redan molnets layout: appens lokala server proxar konto- och
  // layoutanropen med den bryggade sessionen, sa cloud-sync kor pa bada. Men tva OPPNA
  // redigerare foljde inte varandra: den som sparade sist vann versionen, och den andra fick
  // 409 pa sin nasta sparning och dialogen "valj version" — fast den inte hade nagot eget att
  // valja. Uppmatt: webbens Studio oppen dygnet runt, appen under sandningen.
  //
  // Foljaren fragar molnet var tionde sekund efter overlayens version (listan — ett litet svar,
  // inga widgets). Ar molnet nyare och den har enheten inte har nagot osparat (vyra-state ar
  // det senast synkade och ingen ko ligger), hamtas och projiceras molnets layout tyst. Har
  // enheten osparat arbete ar det en riktig konflikt, och da visas samma banderoll som forut —
  // nu redan nar den andra enheten sparat, inte forst nar den har enheten forsoker.
  //
  // Molnet ar INTE en ny sanning har: det ar samma overlay som OBS-lanken laser, och den har
  // enheten hade redan tagit emot den vid nasta omladdning. Foljaren tar bara bort vantan.
  const FOLJ_MS=10000;
  let foljTimer=null,foljer=false;
  async function foljMolnet(){
    if(foljer||!workspace||!overlay||!initialized||syncing||pendingChoice)return{ok:false,reason:'upptagen'};
    if(document.querySelector('.cs-conflict'))return{ok:false,reason:'konflikt-visas'};
    const mine=session,skrivFore=skrivningar;foljer=true;
    try{
      const items=(await list()).overlays||[];if(mine!==session)return{ok:false,reason:'superseded'};
      if(syncing||skrivningar!==skrivFore)return{ok:false,reason:'upptagen'};
      // Listan svarade: sessionen lever. Var raden 'utloggad' har någon loggat in igen (en annan flik) — skicka.
      if(status==='utloggad'){setStatus('saving');push().then(r=>{if(r&&r.reason==='busy')schedule()}).catch(()=>{});return{ok:true,reason:'inloggad-igen'}}
      const remote=items.find(x=>x.id===overlay.id);
      if(!remote||!(Number(remote.version)>Number(overlay.version)))return{ok:true,reason:'lika'};
      const osynkat=localStorage.getItem('vyra-state')!==lastLocal||!!read(QUEUE());
      if(osynkat){let hamtad=null;try{hamtad=await getRemote(overlay.id)}catch{}if(mine!==session)return{ok:false,reason:'superseded'};if(syncing||skrivningar!==skrivFore)return{ok:false,reason:'upptagen'};if(forklara(hamtad))return{ok:true,reason:'egen-skrivning'};setStatus('conflict');showConflict();return{ok:true,reason:'konflikt'}}
      const hamtad=await getRemote(overlay.id);if(mine!==session)return{ok:false,reason:'superseded'};
      overlay=hamtad;await apply(overlay.state);if(mine!==session)return{ok:false,reason:'superseded'};
      lastLocal=localStorage.getItem('vyra-state');koadLokal=null;localStorage.removeItem(QUEUE());saveMeta();setStatus('synced');
      root.toast?.('Layouten uppdaterades från en annan enhet');
      return{ok:true,reason:'hamtad',version:overlay.version};
    }catch(e){/* En GET kräver ingen CSRF: 401 här är en utgången session, inget annat. */if(e&&e.status===401&&mine===session&&status!=='utloggad')hanteraUtloggad();return{ok:false,reason:'fel',error:e&&e.message}}
    finally{foljer=false}
  }
  function startFoljare(){if(foljTimer)return;foljTimer=setInterval(()=>{if(document.hidden)return;foljMolnet()},FOLJ_MS)}
  function startTicker(){startFoljare();if(tickTimer)return;tickTimer=setInterval(()=>{mountStatus();if(!workspace||!initialized||!root.VyraSessionState.canQueue())return;if(status==='utloggad'||status==='conflict'){paint();return}const current=localStorage.getItem('vyra-state');if(current&&current!==lastLocal&&current!==koadLokal){koadLokal=current;localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:payload()}));schedule()}paint()},1000)}

  setTimeout(()=>initialize(root.VyraAuth?.lastDetail?.()),500);
  // Mountningen far INTE hanga pa initialize() eller startTicker(): bada kraver ett workspace, och
  // desktopappen har inget kontosystem alls (vyra-auth-local -> projectLocalSession). Uppmatt i
  // webblasaren: lankraden fanns, .cloud-status fanns inte, status='local'. Da ser den som kor
  // utan moln ingenting — och det ar den anvandaren som mest behover veta att OBS aldrig kommer
  // att hamta hens andringar. Egen intervall, inte sessionsbunden, sa den overlever bade utloggning
  // och att lankraden byggs om.
  // Slutar sa fort den lyckats. Lankraden byggs en gang (bind() vaktar mot dubbletter), och nar
  // man ar inloggad halls monteringen anda vid liv av tickern.
  const mountTimer=setInterval(()=>{if(mountStatus())clearInterval(mountTimer)},1000);
  root.VyraCloudSync={initialize,push,foljMolnet,status:()=>status,current:()=>({workspace,overlay})};
})(typeof window!=='undefined'?window:globalThis);
