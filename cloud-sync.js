(function(root){
  'use strict';
  // Namespacade per workspace. Kon bar aldrig nagot konto-id (den ar {at,state}), sa en global ko
  // kan inte attribueras i efterhand - och det var precis sa A:s osparade layout kunde PUT:as till
  // B:s overlay vid ett kontobyte. Namespacet gor A:s ko oatkomlig for B utan att kasta bort den.
  const LEGACY_META='vyra-cloud-sync-meta',LEGACY_QUEUE='vyra-cloud-sync-queue',
    metaKey=id=>`vyra-cloud-sync-meta:${id}`,queueKey=id=>`vyra-cloud-sync-queue:${id}`,
    backupKey=id=>`vyra-session-backup:${id}`,EXTRA=['vyra-extras','vyra-action-event-v2','vyra-favorite-widgets','vyra-wishlist','vyra-overlay-resolution'];
  let workspace=null,overlay=null,lastLocal=localStorage.getItem('vyra-state'),timer=null,syncing=false,status='local',initialized=false;
  // Sessionsgeneration: varje async operation fangar den fore sitt await och avbryter tyst om den
  // hunnit bytas. Utan den kan en PUT som startade som A landa - och skriva state - som B.
  let session=0,pendingChoice=null,tickTimer=null;
  const META=()=>metaKey(workspace.id),QUEUE=()=>queueKey(workspace.id);
  function read(key,fallback=null){try{return JSON.parse(localStorage.getItem(key))}catch{return fallback}}
  function payload(){const state=read('vyra-state');if(!state||!Array.isArray(state.widgets))return null;const storage={};EXTRA.forEach(k=>{const v=localStorage.getItem(k);if(v!=null)storage[k]=v});return{...state,__vyraCloud:{schema:1,storage,savedAt:Date.now()}}}
  // Molnlayouten projiceras av agaren: den tar laset, skriver markoren, nycklarna och kor
  // cacherna, och mutera globala state-objektet in-place. Utan det kunde tva flikar committa
  // varsin layout och den forlorande rulla tillbaka ovanpa vinnaren.
  async function apply(remote){if(!remote||!Array.isArray(remote.widgets))throw new Error('Online-layouten ar ogiltig');const data={...remote},meta=data.__vyraCloud;delete data.__vyraCloud;const extras={};Object.entries(meta?.storage||{}).forEach(([k,v])=>{if(EXTRA.includes(k)&&typeof v==='string')extras[k]=v});const token=root.VyraSessionState.beginProjection();const out=await root.VyraSessionState.projectActive(token,{mode:'studio-committed',workspaceId:workspace&&workspace.id,overlayId:overlay&&overlay.id,state:data,extras});if(!out.ok)throw new Error('Sessionen kunde inte projiceras');lastLocal=localStorage.getItem('vyra-state');root.render?.()}
  function setStatus(next,text){status=next;document.querySelectorAll('.cloud-status').forEach(el=>{el.dataset.state=next;el.querySelector('span').textContent=text||({synced:'Sparad online',saving:'Sparar…',offline:'Offline · sparas senare',conflict:'Synkkonflikt',local:'Lokalt läge'}[next])})}
  function mountStatus(){}
  async function call(path,options){return root.VyraAuth.api(path,options)}
  async function list(){return call(`/api/workspaces/${workspace.id}/overlays`)}
  async function create(){const data=payload();const d=await call(`/api/workspaces/${workspace.id}/overlays`,{method:'POST',body:JSON.stringify({name:'Min VYRA-overlay',state:data})});overlay=d.overlay;saveMeta();return overlay}
  function saveMeta(){if(!overlay)return;localStorage.setItem(META(),JSON.stringify({workspaceId:workspace.id,overlayId:overlay.id,version:overlay.version,updatedAt:overlay.updated_at,lastLocal}))}
  async function getRemote(id){return(await call(`/api/workspaces/${workspace.id}/overlays/${id}`)).overlay}
  // Wipe-guard: allowEmptyWidgets följer med bara när användaren själv raderat sista widgeten
  // i den här sessionen (flaggas av layer-delete i media.js). En tom layout från t.ex. en
  // nyinloggad enhet utan lokal historik stoppas annars av serverns 409 emptyBlocked och
  // hamnar i den vanliga konfliktdialogen istället för att tyst nolla molnet.
  async function push(){if(!workspace||!overlay||syncing||!root.VyraSessionState.canPush())return{ok:false,status:0,reason:'busy'};const mine=session;const data=payload();if(!data)return{ok:false,status:0,reason:'no-state'};syncing=true;setStatus('saving');try{const emptied=root.__vyraUserEmptiedWidgets===true&&data.widgets.length===0;
      // Har anvandaren lagt tillbaka widgets ar avsikten "jag tomde layouten" inaktuell och
      // raderas direkt. Annars kunde en gammal avsikt ligga kvar och tillata en senare tomning
      // som ingen bett om.
      if(root.__vyraUserEmptiedWidgets===true&&data.widgets.length>0)delete root.__vyraUserEmptiedWidgets;let d;d=await call(`/api/workspaces/${workspace.id}/overlays/${overlay.id}`,{method:'PUT',body:JSON.stringify({name:overlay.name,state:data,version:overlay.version,allowEmptyWidgets:data.widgets.length===0&&emptied})});
      // Tillatelsen forbrukas nar skrivningen LYCKATS, inte nar den forsoktes. Lag raderingen i ett
      // finally forsvann anvandarens avsikt aven vid versionskonflikt eller natverksfel, och varje
      // retry blockerades da av serverns emptyBlocked — layouten kunde aldrig tommas.
      if(emptied)delete root.__vyraUserEmptiedWidgets;if(mine!==session)return{ok:false,status:0,reason:'superseded'};overlay=d.overlay;localStorage.removeItem(QUEUE());lastLocal=localStorage.getItem('vyra-state');saveMeta();setStatus('synced');return{ok:true}}catch(e){if(e.status===409){localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:data}));setStatus('conflict');showConflict();return{ok:false,status:409}}else{localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:data}));setStatus('offline');return{ok:false,status:e&&e.status?e.status:0}}}finally{syncing=false}}
  function schedule(){clearTimeout(timer);timer=setTimeout(push,1800)}
  function choice(remote){return new Promise(resolve=>{pendingChoice=resolve;const modal=document.createElement('div');modal.className='cs-modal';modal.innerHTML='<section><small>FÖRSTA CLOUD-SYNK</small><h2>Vilken layout vill du behålla?</h2><p>Det finns både en layout på den här datorn och en online. Ingenting skrivs över innan du väljer.</p><div><button data-choice="remote">Använd online-versionen</button><button class="primary" data-choice="local">Behåll den här datorns version</button></div></section>';document.body.append(modal);modal.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{modal.remove();pendingChoice=null;resolve(b.dataset.choice)})})}
  function showConflict(){if(document.querySelector('.cs-conflict'))return;const bar=document.createElement('div');bar.className='cs-conflict';bar.innerHTML='<span><b>Synkkonflikt</b><small>Layouten ändrades på en annan dator. Välj vilken version som ska behållas.</small></span><button data-cs-online>Online</button><button class="primary" data-cs-local>Den här datorn</button>';document.body.append(bar);bar.querySelector('[data-cs-online]').onclick=async()=>{try{overlay=await getRemote(overlay.id);await apply(overlay.state);saveMeta();localStorage.removeItem(QUEUE());setStatus('synced');bar.remove()}catch{setStatus('offline')}};bar.querySelector('[data-cs-local]').onclick=async()=>{try{overlay=await getRemote(overlay.id);await push();
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
      if(!items.length){await create();if(mine!==session)return;setStatus('synced');startTicker();return}
      const preferred=items.find(x=>x.id===meta?.overlayId)||items[0];
      overlay=await getRemote(preferred.id);if(mine!==session)return;

      // Ordningen ar sakerhetsegenskapen. Ett parkerat arbete for DETTA workspace lamnas tillbaka;
      // annars anvands molnets version. Den lokala layouten far bara vaga in nar den bevisligen
      // tillhor samma workspace - annars skulle konto B erbjudas konto A:s layout.
      const parked=read(backupKey(workspace.id));
      const local=payload();
      const ownsLocal=!!meta&&meta.workspaceId===workspace.id&&meta.overlayId===overlay.id;
      if(parked&&parked.state){
        // Aterlamningen ar en full projektion under DETTA workspace, inte en restore inuti en redan
        // committad session - vid aterkomst finns ingen committad session an. Backupen tas bort
        // forst nar projektionen faktiskt lyckats, annars vore arbetet borta vid ett skrivfel.
        const token=root.VyraSessionState.beginProjection();
        const out=await root.VyraSessionState.projectActive(token,{mode:'studio-committed',
          workspaceId:workspace.id,overlayId:overlay.id,state:parked.state,extras:parked.extras||{},
          reason:'backup-restored'});
        if(mine!==session)return;
        if(out.ok){localStorage.removeItem(backupKey(workspace.id));lastLocal=localStorage.getItem('vyra-state');saveMeta();setStatus('synced')}
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
        setStatus('conflict');showConflict()
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
        saveMeta();setStatus('synced');if(read(QUEUE()))schedule()
      }
      startTicker();
    }catch{setStatus('offline')}}
  // Ett uttryckligt {authRequired:false} - alltsa desktopappen, som inte har nagot kontosystem -
  // ger maskinens egen session. Ett misslyckat konfigsvar dispatchar inte det har eventet, sa ett
  // natverksfel kan aldrig oppna en skrivbar session utan verifierad identitet.
  // Logout river hela den sessionsbundna maskinen, inte tre id:n. Generationen hojs forst, sa varje
  // svar som redan ar i luften blir verkningslost innan nagot annat hinner kora.
  function resetSession(){session+=1;clearTimeout(timer);timer=null;if(tickTimer){clearInterval(tickTimer);tickTimer=null}
    if(pendingChoice){const resolve=pendingChoice;pendingChoice=null;resolve('aborted')}
    document.querySelector('.cs-modal')?.remove();document.querySelector('.cs-conflict')?.remove();
    workspace=null;overlay=null;lastLocal=null;syncing=false;initialized=false;setStatus('local')}
  root.VyraSessionState?.registerTeardown?.('cloud-sync',resetSession);
  addEventListener('vyra-session-ended',resetSession);
  addEventListener('vyra-auth-local',()=>{root.VyraSessionState.projectLocalSession()});
  addEventListener('vyra-auth-ready',e=>initialize(e.detail));addEventListener('online',()=>{if(workspace)schedule()});addEventListener('offline',()=>setStatus('offline'));
  function startTicker(){if(tickTimer)return;tickTimer=setInterval(()=>{mountStatus();if(!workspace||!initialized||!root.VyraSessionState.canQueue())return;const current=localStorage.getItem('vyra-state');if(current&&current!==lastLocal){lastLocal=current;localStorage.setItem(QUEUE(),JSON.stringify({at:Date.now(),state:payload()}));schedule()}},1000)}

  setTimeout(()=>initialize(root.VyraAuth?.lastDetail?.()),500);
  root.VyraCloudSync={initialize,push,status:()=>status,current:()=>({workspace,overlay})};
})(typeof window!=='undefined'?window:globalThis);
