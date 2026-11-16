// BACKUP AV AUTOMATIKEN — export och import i Action & Event (2026-11-16).
//
// Inställningar har redan "Exportera JSON" (state-backup.js). Den sparar HELA layouten och
// automatiken följer med — men den ersätter allt på en gång och tar inte med streamerns egna
// ljud, bilder och videor: de ligger i IndexedDB (`vyra-action-media`), inte i localStorage, och
// en återställd action pekar då på en fil som inte finns. Den här backupen gäller bara
// automatiken, bär mediefilerna i samma fil och kan LÄGGA TILL i stället för att ersätta.
//
// TVÅ SÄTT ATT LÄSA IN:
//  - Lägg till: posterna får nya id, och eventens/timrarnas pekare skrivs om så att de pekar på
//    de nya actionsen. Inget befintligt rörs. Samma fil två gånger ger två uppsättningar — det är
//    vad "lägg till" betyder, och dialogen säger det.
//  - Ersätt allt: actions, events och timers byts ut. Det gamla hålls i minnet så att importen
//    går att ångra tills sidan laddas om. Minnet, inte localStorage, med flit: en sparad kopia
//    skulle överleva ett kontobyte och kunna skriva ett annat kontos regler över det nya.
//
// SKRIVNINGEN går samma väg som spara-knapparna: VyraSessionState.writeActive, och inget kallas
// klart förrän svaret är `ok`.
(function(){
  'use strict';
  const KEY='vyra-action-event-v2',FORMAT='vyra-automatik',VERSION=1;
  // Tak för mediefiler i en export. En backup på flera hundra MB fryser fliken vid base64 och
  // kan inte öppnas igen; filer över taket utelämnas och exporten säger hur många.
  const MEDIA_MAX=80*1024*1024;
  const MEDIAFALT=['pictureMedia','audioMedia','videoMedia'];
  if(window.VYRA_OVERLAY_SCENE||/[?&]overlay=1/.test(location.search))return;

  // ── Mediefilerna (IndexedDB). Utbytbart i prov: jsdom har ingen IndexedDB. ──
  const idb={
    oppna(){return new Promise((ok,no)=>{const r=indexedDB.open('vyra-action-media',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('files'))r.result.createObjectStore('files')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})},
    async las(id){if(typeof indexedDB==='undefined')return null;const db=await this.oppna();try{return await new Promise((ok,no)=>{const r=db.transaction('files').objectStore('files').get(id);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>no(r.error)})}finally{db.close()}},
    async skriv(id,blob){if(typeof indexedDB==='undefined')return false;const db=await this.oppna();try{await new Promise((ok,no)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(blob,id);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});return true}finally{db.close()}}
  };
  const api={media:idb};

  const tillBase64=async blob=>{const b=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)};
  const franBase64=(data,type)=>{const s=atob(data),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return new Blob([b],{type:type||''})};
  const lista=v=>Array.isArray(v)?v:[];
  const las=()=>{try{const o=JSON.parse(localStorage.getItem(KEY)||'{}')||{};return{...o,actions:lista(o.actions),events:lista(o.events),timers:lista(o.timers)}}catch{return{actions:[],events:[],timers:[]}}};
  const mediaId=a=>MEDIAFALT.map(f=>a?.[f]?.id).filter(Boolean);
  const filer=n=>n===1?'1 egen fil':n+' egna filer';

  // ── Export ──
  async function bygg(nu=Date.now()){
    const s=las();
    const media={};let utelamnade=0,storlek=0;
    for(const id of [...new Set(s.actions.flatMap(mediaId))]){
      let blob=null;
      try{blob=await api.media.las(id)}catch(err){console.warn('[VYRA] mediefil kunde inte läsas',id,err)}
      if(!blob)continue;
      if(storlek+blob.size>MEDIA_MAX){utelamnade++;continue}
      storlek+=blob.size;
      media[id]={name:blob.name||'',type:blob.type||'',data:await tillBase64(blob)};
    }
    return{format:FORMAT,version:VERSION,skapad:new Date(nu).toISOString(),
      actions:s.actions,events:s.events,timers:s.timers,media,mediaUtelamnade:utelamnade};
  }
  async function exportera(){
    const fil=await bygg();
    const blob=new Blob([JSON.stringify(fil)],{type:'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='VYRA-automatik-'+fil.skapad.slice(0,10)+'.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    const antalMedia=Object.keys(fil.media).length;
    window.toast?.(`Backup sparad: ${fil.actions.length} actions, ${fil.events.length} events`+(antalMedia?` och ${filer(antalMedia)}`:'')
      +(fil.mediaUtelamnade?` — ${fil.mediaUtelamnade} filer var för stora och följde inte med`:''));
    return fil;
  }

  // ── Läsa en fil ──
  // Tar både den här backupen och layoutfilen från Inställningar (state-backup.js), där
  // automatiken ligger som en sträng under __vyraBackup.storage. Kastar med en mening som kan
  // visas för användaren.
  function tolka(text){
    let data;
    try{data=JSON.parse(text)}catch{throw new Error('Filen är inte en VYRA-backup')}
    if(data?.format===FORMAT){
      if(Number(data.version)>VERSION)throw new Error('Backupen är gjord i en nyare version av VYRA');
      return{actions:lista(data.actions),events:lista(data.events),timers:lista(data.timers),media:data.media&&typeof data.media==='object'?data.media:{},skapad:data.skapad||'',kalla:'automatik'};
    }
    const inbaddad=data?.__vyraBackup?.storage?.[KEY];
    if(typeof inbaddad==='string'){
      let s;try{s=JSON.parse(inbaddad)}catch{throw new Error('Automatiken i layoutfilen är skadad')}
      return{actions:lista(s.actions),events:lista(s.events),timers:lista(s.timers),media:{},skapad:data.__vyraBackup.createdAt?new Date(data.__vyraBackup.createdAt).toISOString():'',kalla:'layout'};
    }
    if(Array.isArray(data?.widgets))throw new Error('Layoutfilen innehåller ingen automatik');
    throw new Error('Filen är inte en VYRA-backup');
  }

  // ── Slå samman ── (ren funktion, provas utan DOM)
  function slaSamman(nu,fil,lage,tid=Date.now()){
    if(lage==='ersatt')return{...nu,actions:fil.actions,events:fil.events,timers:fil.timers};
    const nyttId=new Map();
    const actions=fil.actions.map((a,i)=>{const id=`a${tid}i${i}`;nyttId.set(a.id,id);return{...a,id}});
    const peka=id=>nyttId.get(id)||'';
    const events=fil.events.map((e,i)=>({...e,id:`e${tid}i${i}`,actionId:peka(e.actionId),
      allActionIds:lista(e.allActionIds).map(peka).filter(Boolean),randomActionIds:lista(e.randomActionIds).map(peka).filter(Boolean)}))
      .map(e=>({...e,actionId:e.actionId||e.allActionIds[0]||e.randomActionIds[0]||''}))
      .filter(e=>e.actionId);
    const timers=fil.timers.map((t,i)=>({...t,id:`t${tid}i${i}`,actionId:peka(t.actionId)})).filter(t=>t.actionId);
    return{...nu,actions:[...nu.actions,...actions],events:[...nu.events,...events],timers:[...lista(nu.timers),...timers]};
  }

  let angra=null;
  async function lasIn(fil,lage){
    const fore=las();
    // Mediefilerna först: en action som pekar på en fil som inte hunnit skrivas spelar ingenting.
    let skrivna=0;
    for(const [id,m] of Object.entries(fil.media||{})){
      try{if(m?.data&&await api.media.skriv(id,franBase64(m.data,m.type)))skrivna++}catch(err){console.warn('[VYRA] mediefil kunde inte sparas',id,err)}
    }
    const nytt=slaSamman(fore,fil,lage);
    let ut;
    try{ut=await window.VyraSessionState.writeActive(KEY,JSON.stringify(nytt))}catch(err){console.warn('[VYRA] backupen kunde inte läsas in',err)}
    if(!ut?.ok)return{ok:false,reason:ut?.reason||'write-failed'};
    angra={state:fore,lage};
    return{ok:true,lage,actions:nytt.actions.length-(lage==='ersatt'?0:fore.actions.length),events:nytt.events.length-(lage==='ersatt'?0:fore.events.length),media:skrivna};
  }
  async function angraSenaste(){
    if(!angra)return{ok:false,reason:'inget-att-angra'};
    let ut;
    try{ut=await window.VyraSessionState.writeActive(KEY,JSON.stringify(angra.state))}catch{}
    if(!ut?.ok)return{ok:false,reason:ut?.reason||'write-failed'};
    angra=null;
    return{ok:true};
  }

  // ── Gränssnitt ──
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const rita=()=>window.VyraActionEvent?.refresh?.();
  function fraga(fil){
    const vard=document.querySelector('#aeModal');
    if(!vard)return;
    const nu=las(),antalMedia=Object.keys(fil.media).length;
    const delar=[`${fil.actions.length} actions`,`${fil.events.length} events`];
    if(fil.timers.length)delar.push(`${fil.timers.length} timers`);
    if(antalMedia)delar.push(filer(antalMedia));
    const datum=fil.skapad?` Sparad ${esc(fil.skapad.slice(0,10))}.`:'';
    vard.innerHTML=`<div class="ae-modal ae-modal-backup"><div>
      <header><h3>Importera automatik</h3><button type="button" class="ae-ik ae-ik--stang" data-backup-stang title="Stäng" aria-label="Stäng"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
      <p class="ae-backup-sammanfattning">Filen innehåller ${esc(delar.join(', '))}.${datum}</p>
      ${fil.kalla==='layout'?'<p class="ae-backup-not">Det här är en layoutfil från Inställningar. Bara automatiken läses in; egna ljud, bilder och videor finns inte i den filen.</p>':''}
      <ul class="ae-backup-val">
        <li><div><b>Lägg till</b><p>Läggs till bredvid det du redan har. Inget befintligt ändras.</p></div><button type="button" data-backup-lage="lagg-till">Lägg till</button></li>
        <li><div><b>Ersätt allt</b><p>Dina nuvarande ${nu.actions.length} actions och ${nu.events.length} events tas bort. Du kan ångra tills du laddar om sidan.</p></div><button type="button" data-backup-lage="ersatt">Ersätt allt</button></li>
      </ul>
      <footer><button type="button" class="ae-avbryt" data-backup-stang>Avbryt</button></footer>
    </div></div>`;
    const stang=()=>{vard.innerHTML=''};
    vard.querySelectorAll('[data-backup-stang]').forEach(b=>b.onclick=stang);
    vard.querySelector('.ae-modal-backup').onclick=e=>{if(e.target.classList.contains('ae-modal-backup'))stang()};
    vard.querySelectorAll('[data-backup-lage]').forEach(b=>b.onclick=async()=>{
      vard.querySelectorAll('[data-backup-lage]').forEach(x=>x.disabled=true);
      b.textContent='Läser in…';
      const svar=await lasIn(fil,b.dataset.backupLage);
      if(!svar.ok){window.toast?.('Backupen kunde inte läsas in');stang();return}
      stang();rita();
      window.toast?.(svar.lage==='ersatt'
        ?`Automatiken ersattes: ${svar.actions} actions och ${svar.events} events`
        :`${svar.actions} actions och ${svar.events} events lades till`);
    });
  }
  function valjFil(input){
    const fil=input.files?.[0];
    input.value='';
    if(!fil)return;
    const r=new FileReader();
    r.onload=()=>{try{fraga(tolka(String(r.result)))}catch(err){window.toast?.(err.message)}};
    r.onerror=()=>window.toast?.('Filen kunde inte läsas');
    r.readAsText(fil);
  }
  function render(){
    const ankare=document.querySelector('[data-ae-advanced-body]');
    if(!ankare||ankare.querySelector('.ae-backup'))return;
    const sektion=document.createElement('section');
    sektion.className='ae-backup card';
    sektion.innerHTML=`<header><h3>Backup</h3></header>
      <p class="ae-backup-text">Spara alla Actions, Events och timers — med dina egna ljud, bilder och videor — i en fil. Läs in den igen på en annan dator eller efter ett misstag.</p>
      <div class="ae-backup-knappar"><button type="button" data-backup-export>Exportera</button>
        <label class="ae-backup-import"><span>Importera</span><input type="file" accept=".json,application/json" data-backup-fil></label>
        <button type="button" data-backup-angra${angra?'':' hidden'}>Ångra senaste import</button></div>`;
    ankare.append(sektion);
    sektion.querySelector('[data-backup-export]').onclick=async e=>{
      const b=e.currentTarget;b.disabled=true;
      try{await exportera()}catch(err){console.warn('[VYRA] export misslyckades',err);window.toast?.('Backupen kunde inte sparas')}
      b.disabled=false;
    };
    sektion.querySelector('[data-backup-fil]').onchange=e=>valjFil(e.target);
    sektion.querySelector('[data-backup-angra]').onclick=async()=>{
      const svar=await angraSenaste();
      window.toast?.(svar.ok?'Importen är ångrad':'Importen kunde inte ångras');
      if(svar.ok)rita();
    };
  }

  window.VyraActionBackup=Object.assign(api,{FORMAT,bygg,exportera,tolka,slaSamman,lasIn,angraSenaste,fraga});
  (window.VyraActionsExtras=window.VyraActionsExtras||[]).push(render);
})();
