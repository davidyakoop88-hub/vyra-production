(() => {
  // MEDIA SOM FÄLTLEVERANTÖR, INTE SOM KAPAD SPARA-KNAPP.
  //
  // Den här filen satte förr `#saveAeAction.onclick = async ...` och skrev därmed ÖVER den
  // hanterare action-event.js redan hade satt. Vilken av de två som vann berodde på laddningsordning
  // — och samtidigt pollade action-options.js och action-scenes.js localStorage var 100:e ms i två
  // sekunder för att i efterhand klistra sina fält på `state.actions.at(-1)`. Tre filer, tre olika
  // sätt att smyga in data i samma skrivning.
  //
  // Nu registrerar filen sig i stället i action-event.js:s fältregister: den ritar sina luckor,
  // säger ifrån i `validate` och lämnar sina fält i `collect`. Det finns en spara-väg.
  function db(){return new Promise((ok,no)=>{const r=indexedDB.open('vyra-action-media',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('files'))r.result.createObjectStore('files')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
  async function store(file){if(!file)return null;const database=await db(),id='media-'+Date.now()+'-'+Math.random().toString(36).slice(2);await new Promise((ok,no)=>{const tx=database.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});database.close();return{id,name:file.name,type:file.type,size:file.size}}

  const inputId={picture:'aePictureFile',audio:'aoAudio',video:'aeVideoFile'};
  const mediaFalt={picture:'pictureMedia',audio:'audioMedia',video:'videoMedia'};
  const accept={picture:'image/*,.gif',audio:'audio/*,.mp3,.wav,.ogg',video:'video/*,.mp4,.webm,.mov'};
  const saknasText={picture:'Välj en bild eller GIF',audio:'Välj en ljudfil',video:'Välj en videofil eller ett paket'};
  // Ett valt paketklipp per modal. Nollställs när en riktig fil väljs i stället.
  let valtPaketklipp=null;

  function paketknappar(){
    const packages=window.VYRA_OVERLAY_PACKAGES||{};
    return Object.values(packages).flatMap(pkg=>pkg.files.map(f=>`<button type="button" class="ae-package-video" data-path="${f.path}" data-label="${pkg.name} · ${f.label}"><span>${pkg.icon}</span><b>${f.label}</b><small>${pkg.name}</small></button>`)).join('');
  }

  // LJUDBIBLIOTEKET (facit §4: "Open Sound Library").
  //
  // Klippen ägs av sound-alerts.js, som redan har tretton royaltyfria ljud och en väg att lägga
  // dem i IndexedDB. Vi bygger alltså inget nytt bibliotek — vi öppnar det som finns. `soundAlerts`
  // är en top-level `const` i ett klassiskt script och därmed läsbar härifrån; vakten finns för att
  // sound-alerts.js laddas av en annan lista än action-filerna och kan saknas i en overlay-flik.
  const ljudbibliotek=()=>{try{return typeof soundAlerts==='object'&&soundAlerts?Object.values(soundAlerts):[]}catch{return[]}};
  // Ett valt biblioteksljud per modal, samma form som paketklippet: hämtas inte förrän det sparas.
  let valtLjud=null;
  function bibliotekspanel(slot,preview){
    const klipp=ljudbibliotek();
    if(!klipp.length)return '';
    return `<button type="button" class="ae-sound-open">♪ Öppna ljudbiblioteket</button>
      <div class="ae-sound-library" hidden>${klipp.map(s=>`<button type="button" class="ae-sound-choice" data-path="${s.path}" data-namn="${s.name}"><i>♪</i><b>${s.name}</b><span class="ae-sound-play" data-prova="${s.path}">▶</span></button>`).join('')}</div>`;
  }

  function render(slot,namn,befintlig){
    const id=inputId[namn],paket=namn==='video'?paketknappar():'';
    // Facit §3–5: filväljare OCH drop-yta på samma rad, plus konverteringstipset för video.
    slot.innerHTML=`<div class="ae-media-fal" data-kind="${namn}">
      ${namn==='audio'?bibliotekspanel():''}
      <div class="ae-file-row"><label class="ae-file-btn">Välj fil<input id="${id}" type="file" accept="${accept[namn]}"></label><span class="ae-file-drop">eller släpp filen här</span></div>
      ${namn==='video'?'<small class="ae-file-tip">Om filen inte stöds, är för stor eller inte spelas upp: konvertera den till MP4 med H264-codec (streambar).</small>':''}
      <div class="ae-file-preview"></div>
      ${paket?`<small>Eller välj ur ditt Overlay-paket:</small><div class="ae-package-videos">${paket}</div>`:''}
    </div>`;
    const input=slot.querySelector('input[type=file]'),preview=slot.querySelector('.ae-file-preview'),drop=slot.querySelector('.ae-media-fal');
    // Redigering: visa vilken fil som redan är sparad, så att ett tomt filfält inte ser ut som att
    // mediet försvunnit. Sparas utan att välja ny fil behålls den gamla (se collect).
    const sparat=befintlig?.[mediaFalt[namn]];
    if(sparat?.name)preview.innerHTML=`<b class="ae-file-sparad">Sparad: ${sparat.name}</b>`;
    const visa=file=>{
      preview.innerHTML='';if(!file)return;
      valtPaketklipp=null;valtLjud=null;
      slot.querySelectorAll('.ae-sound-choice').forEach(b=>b.classList.remove('selected'));
      slot.querySelectorAll('.ae-package-video').forEach(b=>b.classList.remove('selected'));
      const url=URL.createObjectURL(file);
      preview.innerHTML=file.type.startsWith('video/')?`<video src="${url}" controls muted></video><b>${file.name}</b>`
        :file.type.startsWith('audio/')?`<audio src="${url}" controls></audio><b>${file.name}</b>`
        :`<img src="${url}"><b>${file.name}</b>`;
    };
    input.onchange=()=>visa(input.files[0]);
    // Drop-ytan är hela raden, inte bara texten — annars måste man träffa fem ord på pixeln.
    drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging')});
    drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
    drop.addEventListener('drop',e=>{
      e.preventDefault();drop.classList.remove('dragging');
      const file=e.dataTransfer?.files?.[0];if(!file)return;
      // DataTransfer går att lägga rakt i input.files, så filen hamnar i samma fält som
      // filväljaren skriver till och collect() behöver inte veta varifrån den kom.
      const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;visa(file);
    });
    const oppna=slot.querySelector('.ae-sound-open'),lista=slot.querySelector('.ae-sound-library');
    if(oppna&&lista)oppna.onclick=()=>lista.toggleAttribute('hidden');
    slot.querySelectorAll('.ae-sound-choice').forEach(btn=>{
      // Provlyssningen får INTE också välja klippet. Ett klick på ▶ bubblar annars upp till kortet
      // och markerar det — då räcker det att lyssna på ett ljud för att av misstag byta val.
      btn.querySelector('.ae-sound-play').onclick=e=>{
        e.stopPropagation();
        const ljud=new Audio(btn.dataset.path);
        ljud.volume=.7;ljud.play().catch(()=>window.toast?.('Webbläsaren blockerade ljudet'));
      };
      btn.onclick=()=>{
        valtLjud={path:btn.dataset.path,name:btn.dataset.namn};
        slot.querySelectorAll('.ae-sound-choice').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        input.value='';
        preview.innerHTML=`<b class="ae-file-sparad">Ur biblioteket: ${btn.dataset.namn}</b>`;
      };
    });
    slot.querySelectorAll('.ae-package-video').forEach(btn=>btn.onclick=()=>{
      valtPaketklipp={path:btn.dataset.path,label:btn.dataset.label};
      slot.querySelectorAll('.ae-package-video').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      input.value='';
      preview.innerHTML=`<video src="${btn.dataset.path}" controls muted></video><b>${btn.dataset.label}</b>`;
    });
  }

  const fil=(modal,namn)=>modal.querySelector(`#${inputId[namn]}`)?.files?.[0]||null;

  (window.VyraActionFields=window.VyraActionFields||{_providers:[],register(p){if(p)this._providers.push(p)}}).register({
    slots:['picture','audio','video'],
    render(slot,namn,befintlig){if(namn==='video')valtPaketklipp=null;if(namn==='audio')valtLjud=null;render(slot,namn,befintlig)},
    validate(modal,types,befintlig){
      for(const namn of ['picture','audio','video']){
        if(!types.includes(namn))continue;
        if(fil(modal,namn))continue;
        if(befintlig?.[mediaFalt[namn]])continue;          // redigering utan nytt filval
        if(namn==='video'&&valtPaketklipp)continue;
        if(namn==='audio'&&valtLjud)continue;
        return saknasText[namn];
      }
      return null;
    },
    async collect(modal,types,befintlig){
      const ut={};
      for(const namn of ['picture','audio','video']){
        if(!types.includes(namn)){ut[mediaFalt[namn]]=null;continue}
        const vald=fil(modal,namn);
        if(vald)ut[mediaFalt[namn]]=await store(vald);
        else if(namn==='video'&&valtPaketklipp)ut[mediaFalt[namn]]={packagePath:valtPaketklipp.path,name:valtPaketklipp.label};
        else if(namn==='audio'&&valtLjud)ut[mediaFalt[namn]]={packagePath:valtLjud.path,name:valtLjud.name};
        else ut[mediaFalt[namn]]=befintlig?.[mediaFalt[namn]]||null;
      }
      return ut;
    }
  });
})();
