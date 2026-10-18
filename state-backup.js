(function(root){
  'use strict';
  // Backup is a Studio feature. The overlay authenticates with ?access=<token> and has no session
  // cookie, so every /api/state call it makes is a guaranteed 401 — and the 3s loop below retried
  // forever: two failed POSTs per tick, for the whole broadcast, on the machine that is streaming.
  // An overlay also has no layout of its own to protect, and must never write one back. So nothing
  // in this file may start in overlay mode: no fetch, no timer, no restore.
  const VYRA_PARAMS=new URLSearchParams(location.search);
  if(VYRA_PARAMS.has('overlay')||VYRA_PARAMS.has('access'))return;
  // VAR /api/state* FINNS. Rutterna finns bara i Desktop-processens lokala server
  // (electron-app/local-server.js), aldrig i molnet. Electron laddar Studion fran
  // http://127.0.0.1:<port>/studio.html?desktop=1 - samma vardnamnsregel som live-client.js,
  // obs-client.js och action-master.js anvander. VyraAuth.isLocalSession() duger INTE har: den
  // lokala servern vidarebefordrar /api/auth/config till molnet, sa Desktop svarar authRequired
  // och isLocalSession() ar false just dar backupen fungerar. I webben (vyralive.app) gav varje
  // anrop 404/401, och loopen nedan skickade dem tyst var tredje sekund.
  const DESKTOP=['127.0.0.1','localhost'].includes(location.hostname);
  const STATE_KEY='vyra-state', EXTRA_KEYS=['vyra-extras','vyra-action-event-v2','vyra-favorite-widgets','vyra-overlay-resolution','vyra-scene-settings-v1'], AUTO_VERSION_MS=5*60*1000;
  let lastSynced=localStorage.getItem(STATE_KEY),lastVersioned=lastSynced,lastVersionAt=0,busy=false;
  function parse(raw,fallback={}){try{return JSON.parse(raw)}catch{return fallback}}
  function sanitizeWidget(w){if(!w||typeof w!=='object'||!w.id)return null;return {...w,title:w.title||w.type||'Widget'}}
  function primary(){const value=parse(localStorage.getItem(STATE_KEY),'');return value&&Array.isArray(value.widgets)?value:null}
  function packageState(){const value=primary();if(!value)return null;const storage={};EXTRA_KEYS.forEach(k=>{const v=localStorage.getItem(k);if(v!=null)storage[k]=v});return {...value,__vyraBackup:{schema:1,createdAt:Date.now(),storage}}}
  function validate(data){return !!(data&&typeof data==='object'&&Array.isArray(data.widgets)&&data.widgets.every(w=>w&&typeof w==='object'&&w.id))}
  // Restore ar en ny projektion under den identitet som redan ar committad - moln eller lokal.
  // Den uppfinner aldrig en egen agare, och skriver aldrig nycklarna sjalv.
  async function apply(data){if(!validate(data))throw new Error('Backupen innehaller ingen giltig VYRA-layout');/* KRYMPVAKTEN. En aterstallning kan lagligen ha FARRE widgets an det som ligger online — det ar hela poangen med att ga tillbaka till en aldre kopia. Utan flaggan svarar servern 409 och anvandaren ser en synkkonflikt i stallet for sin backup. Samma avsiktsregel som raderingsknappen: den som ber om det far det. */root.__vyraUserRemovedWidget=true;const clean={...data,widgets:data.widgets.map(sanitizeWidget).filter(Boolean)};const meta=clean.__vyraBackup;delete clean.__vyraBackup;const extras={};Object.entries(meta?.storage||{}).forEach(([k,v])=>{if(EXTRA_KEYS.includes(k)&&typeof v==='string')extras[k]=v});const out=await root.VyraSessionState.projectRestore({state:clean,extras});if(!out.ok)throw new Error('Backupen kunde inte aterstallas i den har sessionen');root.render?.();return clean.widgets.length}
  // 401/404 = funktionen finns inte i den har miljon; ett nat-fel (fetch kastar) = Desktop-servern svarar inte.
  const UNAVAILABLE='Versionshistorik finns bara i VYRA Desktop.',OFFLINE='VYRA Desktop-servern svarar inte. Starta om VYRA Desktop och försök igen.';
  function httpError(r,fallback){return Object.assign(new Error(r.status===401||r.status===404?UNAVAILABLE:fallback),{status:r.status})}
  async function req(path,opts){try{return await fetch(path,opts)}catch{throw Object.assign(new Error(OFFLINE),{offline:true})}}
  async function post(path,data){const r=await req(path,{method:'POST',headers:{'Content-Type':'application/json'},body:typeof data==='string'?data:JSON.stringify(data)});if(!r.ok){const body=await r.json().catch(()=>null);throw httpError(r,body?.error||'Serverfel '+r.status)}return r.json()}
  async function syncLatest(){const data=packageState();if(!data)return;await post('/api/state',data)}
  async function createVersion(reason='Manuell'){if(busy)return;const data=packageState();if(!data)throw new Error('Ingen giltig layout att säkerhetskopiera');busy=true;try{const result=await post('/api/state/version',data);lastVersioned=localStorage.getItem(STATE_KEY);lastVersionAt=Date.now();root.toast?.(`${reason} backup skapad`);return result}finally{busy=false}}
  async function versions(){const r=await req('/api/state/versions',{cache:'no-store'});if(!r.ok)throw httpError(r,'Kunde inte läsa versioner (serverfel '+r.status+')');return (await r.json()).versions||[]}
  async function restore(id){await createVersion('Säkerhets');const r=await req('/api/state/version?id='+encodeURIComponent(id),{cache:'no-store'});if(!r.ok)throw httpError(r,'Versionen kunde inte läsas');const count=await apply(await r.json());root.toast?.(`${count} widgets återställdes`)}
  function download(){const data=packageState();if(!data)return;const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='VYRA-layout-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function importFile(file){const reader=new FileReader();reader.onload=async()=>{try{const data=JSON.parse(reader.result);if(!validate(data))throw new Error('Ogiltig VYRA-fil');if(DESKTOP)await createVersion('Före import');const count=await apply(data);if(DESKTOP)await syncLatest();root.toast?.(`${count} widgets importerades`);document.querySelector('.vb-modal')?.remove()}catch(e){root.toast?.(e.message)}};reader.readAsText(file)}
  function date(v){return new Date(v).toLocaleString('sv-SE',{dateStyle:'short',timeStyle:'short'})}
  async function openManager(){document.querySelector('.vb-modal')?.remove();const modal=document.createElement('div');modal.className='vb-modal';modal.innerHTML='<section><header><div><small>BACKUP & ÅTERSTÄLLNING</small><h2>Versionshistorik</h2></div><button data-vb-close>×</button></header><div class="vb-actions"><button id="vbCreate" class="primary">Skapa version nu</button><button id="vbExport">Exportera JSON</button><label>Importera JSON<input id="vbImport" type="file" accept="application/json,.json"></label></div><div id="vbVersions" class="vb-versions"><p>Laddar versioner…</p></div><footer>Automatisk backup körs efter ändringar och högst var femte minut. De 20 senaste versionerna sparas.</footer></section>';document.body.append(modal);modal.querySelector('[data-vb-close]').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()};modal.querySelector('#vbCreate').onclick=async()=>{try{await createVersion();await drawVersions(modal)}catch(e){root.toast?.(e.message)}};modal.querySelector('#vbExport').onclick=download;modal.querySelector('#vbImport').onchange=e=>e.target.files[0]&&importFile(e.target.files[0]);await drawVersions(modal)}
  async function drawVersions(modal){const host=modal.querySelector('#vbVersions');try{const list=await versions();host.innerHTML=list.length?list.map((v,i)=>`<article><span><b>${i===0?'Senaste version':'Tidigare version'}</b><small>${date(v.createdAt)} · ${Math.ceil(v.size/1024)} KB</small></span><button data-vb-restore="${v.id}">Återställ</button></article>`).join(''):'<p>Ingen versionshistorik ännu.</p>';host.querySelectorAll('[data-vb-restore]').forEach(b=>b.onclick=async()=>{if(!confirm('Återställa denna version? Nuvarande layout säkerhetskopieras först.'))return;try{await restore(b.dataset.vbRestore);modal.remove()}catch(e){root.toast?.(e.message)}})}catch(e){host.innerHTML='<p></p>';host.firstChild.textContent=e&&e.message||OFFLINE}}
  // I webben visas sanningen i stallet for en knapp som bara kan svara fel: versionerna bor i
  // Desktop. Export/import till JSON-fil ar rent lokala (download/apply) och far finnas kvar.
  function injectSettings(){if(typeof view==='undefined'||view!=='settings')return;const card=document.querySelector('#view .settings-page');if(!card||card.querySelector('.vb-settings'))return;const box=document.createElement('div');box.className='vb-settings';if(DESKTOP){box.innerHTML='<span><b>Backup och versionshistorik</b><small>Automatiskt skydd för layout, widgets och automationer.</small></span><button id="openBackupManager">Hantera backup</button>';card.append(box);box.querySelector('button').onclick=openManager;return}box.innerHTML='<span><b>Backup och versionshistorik</b><small>Automatisk backup och versionshistorik finns i VYRA Desktop. Här kan du spara och läsa in layouten som JSON-fil.</small></span><div class="vb-actions"><button id="vbExport">Exportera JSON</button><label>Importera JSON<input id="vbImport" type="file" accept="application/json,.json"></label></div>';card.append(box);box.querySelector('#vbExport').onclick=download;box.querySelector('#vbImport').onchange=e=>e.target.files[0]&&importFile(e.target.files[0])}
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="settings"]'))setTimeout(injectSettings,80)});
  // lastVersionAt used to advance only on SUCCESS, so a backend that was down left the five-minute
  // gate permanently open: every tick with a changed layout fired another version POST. Stamping
  // the attempt instead means a failing backend costs one try per five minutes, not one per three
  // seconds, while a healthy one behaves exactly as before.
  if(DESKTOP){setInterval(async()=>{const current=localStorage.getItem(STATE_KEY);if(!current||current===lastSynced)return;lastSynced=current;try{await syncLatest()}catch{}if(current!==lastVersioned&&Date.now()-lastVersionAt>=AUTO_VERSION_MS){lastVersionAt=Date.now();try{await createVersion('Automatisk')}catch{}}},3000);
  if(!primary())fetch('/api/state').then(r=>r.ok?r.json():null).then(async data=>{if(validate(data)){const count=await apply(data);console.log('[VYRA] Återställde '+count+' widgets från backup.')}}).catch(()=>{});else syncLatest().catch(()=>{})}
  root.VyraBackup={desktop:DESKTOP,createVersion,versions,restore,download,importFile,openManager,injectSettings,validate,packageState};
})(typeof window!=='undefined'?window:globalThis);
