(() => {
  const KEY = 'vyra-action-event-v2';
  const getState = () => JSON.parse(localStorage.getItem(KEY) || '{"actions":[],"events":[]}');
  const sceneUrl = number => `${location.origin}${location.pathname}?overlay=1&scene=${number}`;
  // Per-scene max queue length — read by action-runtime.js's execute() to drop new actions once
  // a scene's queue is already full, instead of letting e.g. a gift storm queue up dozens of
  // alerts that keep playing long after the storm ends. 0/empty = unlimited (today's behavior).
  const SETTINGS_KEY = 'vyra-scene-settings-v1';
  const getSceneSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch { return {} } };
  const setSceneMaxQueue = (number, value) => { const s = getSceneSettings(); s[number] = { ...(s[number] || {}), maxQueue: Math.max(0, Number(value) || 0) }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) };

  function addSceneSettings() {
    const modal = document.querySelector('.ae-modal');
    const grid = modal?.querySelector('.ae-grid');
    if (!grid || modal.querySelector('.ae-scene-settings')) return;
    const box = document.createElement('div');
    box.className = 'ae-scene-settings';
    box.innerHTML = `<h4>OVERLAY-SCEN & PLACERING</h4><div class="ae-scene-row"><label>Scen<select id="aeScene">${Array.from({length:10},(_,i)=>`<option value="${i+1}">Scen ${i+1}</option>`).join('')}</select></label><label>Placering<select id="aePlacement"><option value="custom">Egen placering</option><option value="top">Överst</option><option value="center">Mitten</option><option value="bottom" selected>Längst ner</option><option value="fullscreen">Helskärm</option></select></label></div><div class="ae-position-grid"><label>X<input id="aePosX" type="number" value="160"></label><label>Y<input id="aePosY" type="number" value="1450"></label><label>Bredd<input id="aePosWidth" type="number" min="80" max="1080" value="760"></label><label>Lager<input id="aeLayer" type="number" min="1" max="99" value="10"></label></div><small>Varje scen har egen länk och sparar egen placering. Actions på samma scen spelas i kö.</small>`;
    grid.before(box);
    const presets = {top:[160,80,760],center:[160,690,760],bottom:[160,1450,760],fullscreen:[0,0,1080]};
    box.querySelector('#aePlacement').onchange = event => {
      const value = presets[event.target.value];
      if (!value) return;
      box.querySelector('#aePosX').value=value[0]; box.querySelector('#aePosY').value=value[1]; box.querySelector('#aePosWidth').value=value[2];
    };
    modal.querySelector('#saveAeAction').addEventListener('click', () => {
      const before = getState().actions.length;
      const scene = {number:+box.querySelector('#aeScene').value,placement:box.querySelector('#aePlacement').value,x:+box.querySelector('#aePosX').value,y:+box.querySelector('#aePosY').value,width:+box.querySelector('#aePosWidth').value,layer:+box.querySelector('#aeLayer').value};
      let attempts=0, timer=setInterval(()=>{const state=getState();if(state.actions.length>before){state.actions.at(-1).scene=scene;window.VyraSessionState.writeActive(KEY,JSON.stringify(state));clearInterval(timer)}else if(++attempts>40)clearInterval(timer)},100);
    }, true);
  }

  function renderScenes() {
    const steps = document.querySelector('.ae-steps');
    if (!steps || document.querySelector('.ae-scenes-overview')) return;
    const state = getState();
    const section = document.createElement('section');
    section.className = 'ae-scenes-overview';
    const sceneSettings = getSceneSettings();
    section.innerHTML = `<header><b>10 OVERLAY-SCENER</b><span>Varje scen har en egen OBS/TikTok-länk</span></header><div class="ae-scene-cards">${Array.from({length:10},(_,i)=>{const n=i+1,count=state.actions.filter(a=>(a.scene?.number||1)===n).length;return `<button type="button" data-show-scene="${n}" class="${count?'used':''}"><b>${n}</b><span>Scen ${n}</span><small>${count} actions</small></button>`}).join('')}</div><div class="ae-scene-links">${Array.from({length:10},(_,i)=>{const n=i+1,url=sceneUrl(n),maxQueue=sceneSettings[n]?.maxQueue||0;return `<article data-scene-link="${n}"><b>Scen ${n}</b><span class="ae-scene-status offline" data-scene-status="${n}"><i></i> Offline</span><input readonly value="${url}"><label class="ae-scene-max-queue">Max kö<input type="number" min="0" placeholder="Obegränsad" value="${maxQueue||''}" data-scene-max-queue="${n}"></label><button type="button" data-copy-scene="${n}">Kopiera</button><button type="button" data-open-scene="${n}">Öppna ↗</button></article>`}).join('')}</div>`;
    steps.after(section);
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
    if (event.target.closest('#newAeAction')) setTimeout(addSceneSettings,70);
    if (event.target.closest('[data-extra=actions]')) setTimeout(renderScenes,120);
    const show = event.target.closest('[data-show-scene]');
    if (show) document.querySelector(`[data-scene-link="${show.dataset.showScene}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
    const copy = event.target.closest('[data-copy-scene]');
    if (copy) {
      const url=sceneUrl(copy.dataset.copyScene);
      try { await navigator.clipboard.writeText(url); window.toast?.(`Länk för Scen ${copy.dataset.copyScene} kopierad`); }
      catch { const input=document.querySelector(`[data-scene-link="${copy.dataset.copyScene}"] input`);input.select();document.execCommand('copy');window.toast?.('Scenlänken kopierad'); }
    }
    const open = event.target.closest('[data-open-scene]');
    if (open) window.open(sceneUrl(open.dataset.openScene),'_blank','noopener');
  }, true);

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
