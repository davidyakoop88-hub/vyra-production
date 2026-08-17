'use strict';
// En rigg för flera flikar mot ETT localStorage — det enda sättet att falsifiera ett påstående om
// vad som händer när streamern har studion och två scenlänkar uppe samtidigt.
//
// jsdom ger varje JSDOM-instans sitt EGNA localStorage och skickar inga storage-event mellan dem.
// Två fönster som tror att de är ensamma kan därför aldrig visa ett dubbelavdrag, och ett prov som
// inte kan falla bevisar ingenting. Riggen lägger till de två sakerna webbläsaren gör själv:
//
//   1. ETT delat lager bakom alla fönster (samma origin, samma maskin).
//   2. Korsflik-storage-event: en setItem i flik A ger ett 'storage'-event i B och C — men INTE
//      i A. Skribentens eget fönster ska aldrig höra sitt eget eko. Missas den detaljen tar varje
//      flik emot sitt eget utskick och riggen mäter fel åt andra hållet.
//
// Att fasaden är per fönster är alltså inte en detalj: den är hela mekanismen för "vem skrev".
//
// VARFÖR SKRIVBARHET ÄR EN FLAGGA. `VyraSessionState.writeActive` vägrar utan låshanterare och utan
// committad projektion, så ett fönster riggat som overlay (`skrivbar: false`) kan inte röra någon
// skyddad nyckel — det är verkligheten i en OBS-flik, inte en brist i riggen. Studion riggas med en
// committad projektion och kan därför skriva.
//
// Cooldownen hänger sedan §15b INTE på den flaggan: körningstidsstämplarna bor i
// `vyra-action-cooldowns`, som skrivs med rå localStorage och fungerar i vilken flik som helst.
// Flaggan avgör alltså vem som får skriva LAYOUTEN, inte vem som kan hålla en cooldown — och just
// därför är den fortfarande värd att kunna sätta åt båda hållen.
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const H = require('./session-harness.js');

const ROOT = path.join(__dirname, '..', '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KEY = 'vyra-action-event-v2';

// Filerna en flik behöver för att ta emot ett live-event och spela en action.
const FILER = ['session-state.js', 'action-master.js', 'action-runtime.js', 'action-event.js',
               'action-event-advanced.js'];

// Ett delat lager OCH en delad låshanterare — båda hör till maskinen, inte till fliken.
// navigator.locks är per origin i en webbläsare, så en låshanterare per fönster hade gjort varje
// flik ensam i sitt eget lås och tystat den serialisering master-valet vilar på.
function delatLager() {
  const store = new Map();
  const lyssnare = [];                       // { window, fasad }
  const lasHanterare = H.createLockManager();
  const bas = {
    getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
    removeItem: k => store.delete(String(k)),
    clear: () => store.clear(),
    key: i => [...store.keys()][i] ?? null,
    get length() { return store.size },
    // Testet får läsa och skriva utan att räknas som någon flik.
    raa: () => store,
    lasHanterare,
  };
  function skriv(fasad, k, v) {
    const nyckel = String(k), varde = String(v);
    store.set(nyckel, varde);
    for (const l of lyssnare) {
      if (l.fasad === fasad) continue;        // aldrig till skribenten själv
      try {
        l.window.dispatchEvent(new l.window.StorageEvent('storage', { key: nyckel, newValue: varde }));
      } catch (_) { /* fönstret kan vara stängt */ }
    }
  }
  bas.setItem = (k, v) => skriv(null, k, v); // riggens egna skrivningar: alla fönster hör dem
  bas.fasadFor = fonster => {
    const fasad = Object.create(bas);
    fasad.setItem = (k, v) => skriv(fasad, k, v);
    lyssnare.push({ window: fonster, fasad });
    return fasad;
  };
  return bas;
}

async function fonster({ namn = 'flik', scen = null, lager, skrivbar = false,
                         actions = [], events = [] } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="title"></div>' +
    '<div id="view"><div class="ae-steps"></div></div></body></html>',
    { url: 'https://vyralive.app/studio.html', pretendToBeVisual: false, runScripts: 'dangerously' });
  const { window } = dom;
  Object.defineProperty(window, 'localStorage', { value: lager.fasadFor(window), configurable: true });
  // navigator.locks finns i VARJE flik i en riktig webbläsare — det är session-states `mode`, inte
  // låshanteraren, som avgör skrivrätten. Master-valet får därför använda lås även i en overlay.
  // Hanteraren kommer från lagret: den delas mellan flikarna, precis som i webbläsaren.
  Object.defineProperty(window.navigator, 'locks', { value: lager.lasHanterare, configurable: true });
  if (scen != null) window.VYRA_OVERLAY_SCENE = scen;

  window.__namn = namn;
  window.__utskick = 0;
  window.document.addEventListener('vyra:action', () => { window.__utskick++ });

  for (const f of FILER) {
    const s = window.document.createElement('script');
    s.textContent = las(f);
    window.document.body.append(s);
  }

  if (skrivbar) {
    const token = window.VyraSessionState.beginProjection();
    const r = await window.VyraSessionState.projectActive(token, { mode: 'studio-committed',
      workspaceId: 'ws-prov', overlayId: 'ov-prov', state: { widgets: [], user: 'Streamer' },
      extras: { [KEY]: JSON.stringify({ actions, events }) } });
    if (!r.ok) throw new Error(`${namn} blev inte skrivbar: ${JSON.stringify(r)}`);
  }

  window.__spelningar = 0;
  window.triggerGiftFireworks = () => { window.__spelningar++; return true };
  window.__toaster = [];
  window.toast = m => { window.__toaster.push(String(m)) };
  return window;
}

module.exports = { delatLager, fonster, KEY, FILER };
