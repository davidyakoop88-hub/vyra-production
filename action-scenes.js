(() => {
  const KEY = 'vyra-action-event-v2';
  const readExtra = key => {
    try { return window.VyraSessionState?.readExtra?.(key) ?? localStorage.getItem(key) }
    catch { return null }
  };
  // SAMMA NORMALISERING SOM action-event.js read(). Forvalet i `||` galler bara nar NYCKELN
  // saknas — ett tillstand som finns men saknar `actions` slapp forbi och fallde vyn med
  // "Cannot read properties of undefined". Formen garanteras har i stallet for att gissas
  // vid varje lasning.
  const getState = () => { const o = (() => { try { return JSON.parse(readExtra(KEY) || '{}') } catch { return {} } })(); return { ...o, actions: Array.isArray(o.actions) ? o.actions : [], events: Array.isArray(o.events) ? o.events : [], timers: Array.isArray(o.timers) ? o.timers : [] } };
  // Scenlanken byggdes tidigare ur `location` och bar darfor ingen access-token. Den fungerade i
  // David egen inloggade webblasare och gav inloggningssidan i OBS, som varken har session eller
  // kakor. Den enda giltiga basen ar overlayns egen token-lank — samma kalla som overlaylankraden
  // i media.js (overlayShareBase). Serverns raa token returneras bara en gang, vid skapandet, sa
  // finns den inte i sessionStorage finns det ingen lank att visa: da ar ratt svar att skicka
  // streamern till tokenhanteraren, inte att rendera en lank som ser giltig ut men inte ar det.
  const sceneUrl = number => {
    const base = sessionStorage.getItem('vyra-overlay-access-url');
    if (!base) return '';
    try {
      const url = new URL(base, location.href);
      if (!url.searchParams.get('access')) return '';
      url.searchParams.set('scene', String(number));
      return url.href;
    } catch { return '' }
  };
  // Per-scene max queue length — read by action-runtime.js's execute() to drop new actions once
  // a scene's queue is already full, instead of letting e.g. a gift storm queue up dozens of
  // alerts that keep playing long after the storm ends. 0/empty = unlimited (today's behavior).
  const SETTINGS_KEY = 'vyra-scene-settings-v1';
  const getSceneSettings = () => { try { return JSON.parse(readExtra(SETTINGS_KEY) || '{}') } catch { return {} } };
  // Nyckeln ar numera en EXTRA-nyckel (den foljer med ut i OBS), och da ager session-state.js
  // skrivningen — annars gar den forbi laset, markoren och generationsvakten.
  const setSceneMaxQueue = (number, value) => { const s = getSceneSettings(); s[number] = { ...(s[number] || {}), maxQueue: Math.max(0, Number(value) || 0) }; window.VyraSessionState.writeActive(SETTINGS_KEY, JSON.stringify(s)).catch(() => window.toast?.('Kunde inte spara koinstallningen')) };

  // SCENPANELEN SOM FÄLTLEVERANTÖR.
  //
  // Den sparade förr genom att räkna actions före klicket och sedan polla localStorage var 100:e ms
  // i fyra sekunder tills listan vuxit, för att skriva scenen på `state.actions.at(-1)`. Två fel i
  // ett: en långsam mediasparning tappade scenen tyst, och vid REDIGERING är "den sista i listan"
  // fel action. Nu lämnas scenen i `collect` som vilket annat fält som helst.
  const presets = {top:[160,80,760],center:[160,690,760],bottom:[160,1450,760],fullscreen:[0,0,1080]};
  function addSceneSettings(modal, befintlig) {
    const vard = modal?.querySelector('.ae-extra-slot');
    if (!vard || vard.querySelector('.ae-scene-settings')) return;
    const scene = befintlig?.scene || {};
    const nummer = Number(scene.number) || 1, placering = scene.placement || 'bottom';
    const box = document.createElement('div');
    box.className = 'ae-scene-settings';
    box.innerHTML = `<h4>OVERLAY-SCEN & PLACERING</h4><div class="ae-scene-row"><label>Scen<select id="aeScene">${Array.from({length:10},(_,i)=>`<option value="${i+1}"${i+1===nummer?' selected':''}>Scen ${i+1}</option>`).join('')}</select></label><label>Placering<select id="aePlacement">${[['custom','Egen placering'],['top','Överst'],['center','Mitten'],['bottom','Längst ner'],['fullscreen','Helskärm']].map(([v,l])=>`<option value="${v}"${v===placering?' selected':''}>${l}</option>`).join('')}</select></label></div><div class="ae-position-grid"><label>X<input id="aePosX" type="number" value="${Number(scene.x)||160}"></label><label>Y<input id="aePosY" type="number" value="${Number(scene.y)||1450}"></label><label>Bredd<input id="aePosWidth" type="number" min="80" max="1080" value="${Number(scene.width)||760}"></label><label>Lager<input id="aeLayer" type="number" min="1" max="99" value="${Number(scene.layer)||10}"></label></div><small>Varje scen har egen länk och sparar egen placering. Actions på samma scen spelas i kö.</small>`;
    vard.append(box);
    box.querySelector('#aePlacement').onchange = event => {
      const value = presets[event.target.value];
      if (!value) return;
      box.querySelector('#aePosX').value=value[0]; box.querySelector('#aePosY').value=value[1]; box.querySelector('#aePosWidth').value=value[2];
    };
  }
  (window.VyraActionFields=window.VyraActionFields||{_providers:[],register(p){if(p)this._providers.push(p)}}).register({
    mount: addSceneSettings,
    collect(modal) {
      const box = modal.querySelector('.ae-scene-settings');
      if (!box) return {};
      return { scene: {number:+box.querySelector('#aeScene').value,placement:box.querySelector('#aePlacement').value,x:+box.querySelector('#aePosX').value,y:+box.querySelector('#aePosY').value,width:+box.querySelector('#aePosWidth').value,layer:+box.querySelector('#aeLayer').value} };
    }
  });

  // PLACERINGEN ÄR FACITS (2026-09-16). Panelen låg efter `.ae-steps`, alltså FÖRE listorna, och
  // tio scenkort plus tio länkkort fyllde hela första skärmen — Action-tabellen hamnade under
  // vikningen och syntes inte utan att scrolla. I facit är "Overlay Screen Settings" en egen panel
  // längst ned, efter både Actions och Events. Den hänger därför på `.ae-columns` i stället.
  function renderScenes() {
    const ankare = document.querySelector('[data-ae-advanced-body]') || document.querySelector('.ae-columns') || document.querySelector('.ae-steps');
    if (!ankare || document.querySelector('.ae-scenes-overview')) return;
    const state = getState();
    const section = document.createElement('section');
    section.className = 'ae-scenes-overview';
    const sceneSettings = getSceneSettings();
    const link = n => {
      const url = sceneUrl(n);
      // Ingen token = ingen lank. Ett tomt falt dar det brukar sta en URL later som ett fel i
      // appen; texten sager i stallet vad som faktiskt saknas och knappen gar dit man loser det.
      if (!url) return `<small class="ae-scene-needs-token" data-tom="automatik-scenlank">Ingen säker OBS-länk ännu — scenen kan inte öppnas i OBS förrän du skapat en.</small><button type="button" data-create-scene-link>Skapa säker OBS-länk</button>`;
      return `<input readonly value="${url}"><button type="button" data-copy-scene="${n}">Kopiera</button><button type="button" data-open-scene="${n}">Öppna ↗</button>`;
    };
    // Bara skärmar som används visas. Tio tomma kort fick det att se ut som att streamern
    // måste konfigurera tio OBS-källor innan den första Actionen kan fungera.
    const usedScenes=[...new Set(state.actions.map(a=>Number(a.scene?.number)||1))];
    const scenes=usedScenes.length?usedScenes:[1];
    section.innerHTML = `<header><b>OBS-SKÄRMAR</b><span>Endast skärmar som används av dina Actions</span></header><p class="ae-scenes-intro">Varje Action har en egen knapp för sin OBS-länk. Skapa länken här första gången och lägg den sedan i OBS eller Live Studio.</p><div class="ae-scene-cards">${scenes.map(n=>{const count=state.actions.filter(a=>(a.scene?.number||1)===n).length;return `<button type="button" data-show-scene="${n}" class="used"><b>${n}</b><span>Scen ${n}</span><small>${count} actions</small></button>`}).join('')}</div><div class="ae-scene-links">${scenes.map(n=>{const maxQueue=sceneSettings[n]?.maxQueue||0;return `<article data-scene-link="${n}"><b>Scen ${n}</b><span class="ae-scene-status offline" data-scene-status="${n}"><i></i> Offline</span><label class="ae-scene-max-queue">Max kö<input type="number" min="0" placeholder="Obegränsad" value="${maxQueue||''}" data-scene-max-queue="${n}"></label>${link(n)}</article>`}).join('')}</div>`;
    if (ankare.matches('[data-ae-advanced-body]')) ankare.append(section);
    else ankare.after(section); // test- och äldre skal saknar den nya hopfällbara behållaren
    updateSceneStatuses();
    section.querySelectorAll('[data-scene-max-queue]').forEach(input => input.onchange = () => setSceneMaxQueue(input.dataset.sceneMaxQueue, input.value));
  }

  function updateSceneStatuses() {
    document.querySelectorAll('[data-scene-status]').forEach(status => {
      const lastSeen=Number(localStorage.getItem(`vyra-scene-heartbeat-${status.dataset.sceneStatus}`)||0);
      const online=Date.now()-lastSeen<6000;
      status.classList.toggle('online',online);status.classList.toggle('offline',!online);
      status.innerHTML=`<i></i> ${online?'Online':'Offline'}`;
    });
  }

  // Actions & Events' own renderPage() fully rebuilds #view.innerHTML on every save/delete/toggle
  // (not just on nav-tab click), which would otherwise wipe this panel since it's appended as a
  // sibling via anchor.after() rather than being part of the core shell() template — registering
  // here lets renderPage() rebuild it too instead of only the nav-click listener below.
  (window.VyraActionsExtras = window.VyraActionsExtras || []).push(renderScenes);

  document.addEventListener('click', async event => {
    // Panelen monteras numera av fältregistrets `mount`, inte av en tidsfördröjning efter klicket.
    // Den gamla raden här sköt 70 ms i blindo och fyrade dessutom bara på "Ny Action" — aldrig på
    // pennan, så en redigerad action hade ingen scenpanel alls.
    if (event.target.closest('[data-extra=actions]')) setTimeout(renderScenes,120);
    const show = event.target.closest('[data-show-scene]');
    if (show) document.querySelector(`[data-scene-link="${show.dataset.showScene}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
    const actionLink = event.target.closest('[data-open-action-screen]');
    if (actionLink) {
      document.querySelector('.ae-advanced').open=true;
      const article=document.querySelector(`[data-scene-link="${actionLink.dataset.openActionScreen}"]`);
      article?.scrollIntoView({behavior:'smooth',block:'center'});
      const open=article?.querySelector('[data-open-scene]');
      const create=article?.querySelector('[data-create-scene-link]');
      if(open) open.click(); else if(create) create.click();
    }
    // Samma vag som overlaylankraden i media.js tar nar token saknas: oppna tokenhanteraren
    // (.oa-open ar overlay-access.js dolda knapp) i stallet for att lamna streamern utan nasta steg.
    if (event.target.closest('[data-create-scene-link]')) {
      document.querySelector('.oa-open')?.click();
      window.toast?.('Skapa en säker OBS-länk först — sedan får varje scen sin länk');
    }
    const copy = event.target.closest('[data-copy-scene]');
    if (copy) {
      const url=sceneUrl(copy.dataset.copyScene);
      if (!url) { document.querySelector('.oa-open')?.click(); window.toast?.('Skapa en säker OBS-länk först'); return }
      try { await navigator.clipboard.writeText(url); window.toast?.(`Länk för Scen ${copy.dataset.copyScene} kopierad`); }
      // input[readonly] specifikt: artikelns forsta <input> ar numera Max ko-faltet, sa en
      // otypad selektor har skulle kopiera kolangden i stallet for lanken.
      catch { const input=document.querySelector(`[data-scene-link="${copy.dataset.copyScene}"] input[readonly]`);input.select();document.execCommand('copy');window.toast?.('Scenlänken kopierad'); }
    }
    const open = event.target.closest('[data-open-scene]');
    if (open) { const url=sceneUrl(open.dataset.openScene); if (url) window.open(url,'_blank','noopener') }
  }, true);

  // Skapas en token medan Actions-sidan ar oppen ligger scenpanelen kvar i sitt tomma lage tills
  // nagot annat rebuildar den. Samma handelse som overlaylankraden lyssnar pa (media.js).
  addEventListener('vyra-overlay-access-created', () => {
    document.querySelector('.ae-scenes-overview')?.remove();
    renderScenes();
  });

  const params = new URLSearchParams(location.search);
  if (params.has('overlay') && params.has('scene')) {
    document.documentElement.dataset.overlayScene = params.get('scene');
    window.VYRA_OVERLAY_SCENE = +params.get('scene');
    const heartbeatKey=`vyra-scene-heartbeat-${params.get('scene')}`;
    const heartbeat=()=>localStorage.setItem(heartbeatKey,String(Date.now()));
    heartbeat();setInterval(heartbeat,2000);
    addEventListener('beforeunload',()=>localStorage.removeItem(heartbeatKey));
  }
  setInterval(updateSceneStatuses,2000);
  addEventListener('storage',event=>{if(event.key?.startsWith('vyra-scene-heartbeat-'))updateSceneStatuses()});
})();
