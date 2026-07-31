(() => {
  const KEY='vyra-action-event-v2';
  function db(){return new Promise((ok,no)=>{const r=indexedDB.open('vyra-action-media',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('files'))r.result.createObjectStore('files')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
  async function store(file){if(!file)return null;const database=await db(),id='media-'+Date.now()+'-'+Math.random().toString(36).slice(2);await new Promise((ok,no)=>{const tx=database.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});database.close();return{id,name:file.name,type:file.type,size:file.size}}
  function enhance(){
    const modal=document.querySelector('.ae-modal'),save=modal?.querySelector('#saveAeAction');if(!modal||!save||modal.querySelector('.ae-media-fields'))return;
    const packages=window.VYRA_OVERLAY_PACKAGES||{};
    const packageOptionsHtml=Object.values(packages).flatMap(pkg=>pkg.files.map(f=>`<button type="button" class="ae-package-video" data-path="${f.path}" data-label="${pkg.name} · ${f.label}"><span>${pkg.icon}</span><b>${f.label}</b><small>${pkg.name}</small></button>`)).join('');
    let selectedPackageVideo=null;
    const fields=document.createElement('div');fields.className='ae-media-fields';fields.innerHTML=`<div data-kind="picture" hidden><label>Lägg till bild eller GIF<input id="aePictureFile" type="file" accept="image/*,.gif"></label><div class="ae-file-preview"></div></div><div data-kind="video" hidden><label>Lägg till video<input id="aeVideoFile" type="file" accept="video/*,.mp4,.webm,.mov"></label><div class="ae-file-preview"></div>${packageOptionsHtml?`<small>Eller välj från ditt Overlay-paket:</small><div class="ae-package-videos">${packageOptionsHtml}</div>`:''}</div>`;modal.querySelector('.ae-grid').before(fields);
    const update=()=>{const chosen=[...modal.querySelectorAll('fieldset input:checked')].map(x=>x.value);fields.querySelector('[data-kind=picture]').hidden=!chosen.includes('picture');fields.querySelector('[data-kind=video]').hidden=!chosen.includes('video')};
    modal.querySelectorAll('fieldset input').forEach(x=>x.addEventListener('change',update));
    fields.querySelectorAll('input').forEach(input=>input.onchange=()=>{const f=input.files[0],preview=input.closest('[data-kind]').querySelector('.ae-file-preview');preview.innerHTML='';if(!f)return;selectedPackageVideo=null;fields.querySelectorAll('.ae-package-video').forEach(b=>b.classList.remove('selected'));const url=URL.createObjectURL(f);preview.innerHTML=f.type.startsWith('video/')?`<video src="${url}" controls muted></video><b>${f.name}</b>`:`<img src="${url}"><b>${f.name}</b>`});
    fields.querySelectorAll('.ae-package-video').forEach(btn=>btn.onclick=()=>{selectedPackageVideo={path:btn.dataset.path,label:btn.dataset.label};fields.querySelectorAll('.ae-package-video').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');const input=modal.querySelector('#aeVideoFile');input.value='';const preview=input.closest('[data-kind]').querySelector('.ae-file-preview');preview.innerHTML=`<video src="${btn.dataset.path}" controls muted></video><b>${btn.dataset.label}</b>`});
    save.onclick=async()=>{
      const name=modal.querySelector('#aeActionName').value.trim(),types=[...modal.querySelectorAll('fieldset input:checked')].map(x=>x.value),picture=modal.querySelector('#aePictureFile').files[0],video=modal.querySelector('#aeVideoFile').files[0],audio=modal.querySelector('#aoAudio')?.files?.[0];
      if(!name||!types.length)return window.toast?.('Ange namn och välj minst en funktion');
      if(types.includes('picture')&&!picture)return window.toast?.('Välj en bild eller GIF');if(types.includes('video')&&!video&&!selectedPackageVideo)return window.toast?.('Välj en videofil eller ett paket');if(types.includes('audio')&&!audio)return window.toast?.('Välj en ljudfil');
      save.disabled=true;save.textContent='Sparar media...';
      try{const state=JSON.parse(localStorage.getItem(KEY)||'{"actions":[],"events":[]}');state.actions.push({id:'a'+Date.now(),name,types,duration:+modal.querySelector('#aeDuration').value,cooldown:+modal.querySelector('#aeCooldown').value,userCooldown:+modal.querySelector('#aeUserCooldown').value,volume:+modal.querySelector('#aeVolume').value,fade:modal.querySelector('#aeFade').checked,repeatCombo:modal.querySelector('#aeRepeatCombo').checked,pictureMedia:await store(picture),videoMedia:video?await store(video):(selectedPackageVideo?{packagePath:selectedPackageVideo.path,name:selectedPackageVideo.label}:null),audioMedia:await store(audio)});localStorage.setItem(KEY,JSON.stringify(state));modal.remove();window.toast?.('Action och media sparades');document.querySelector('[data-extra=actions]')?.click()}
      catch(error){save.disabled=false;save.textContent='Spara Action';window.toast?.('Filen kunde inte sparas')}
    };
    update();
  }
  document.addEventListener('click',e=>{if(e.target.closest('#newAeAction'))setTimeout(enhance,20)},true);
})();
