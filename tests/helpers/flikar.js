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
// Samma lista som session-state.js:EXTRA_KEYS — de nycklar en projektion äger och därmed rensar.
const EXTRA_KEYS = ['vyra-extras', 'vyra-action-event-v2', 'vyra-favorite-widgets',
  'vyra-scene-settings-v1'];

// Filerna en flik behöver för att ta emot ett live-event och spela en action.
const FILER = ['session-state.js', 'vyra-masterval.js', 'action-master.js', 'vyra-tal.js',
               'action-runtime.js', 'action-event.js', 'action-event-advanced.js'];

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

// jsdom har varken SpeechSynthesis eller en Audio som kan spela. Stubbarna nedan mäter det som
// faktiskt är intressant: VEM som talar, NÄR, och vilken volym ett ljud fick — inte att en riktig
// ljudkort-buffert fylldes. `__tal` och `__ljud` är fönstrets logg.
function talstubbe(window) {
  window.__tal = [];
  window.speechSynthesis = {
    speak(u) {
      const post = { text: String(u.text), vid: Date.now(), flik: window.__namn, slut: 0 };
      window.__tal.push(post);
      // Uppläsningen tar tid — annars kan inget prov se skillnad på "efter" och "samtidigt".
      // Längden följer texten, så ett prov kan konstruera ett yttrande som är LÄNGRE än actionens
      // visningstid: det är då actionkön släpper nästa action medan den förra fortfarande talar,
      // och bara talutrymmet kan hålla isär dem.
      setTimeout(() => { post.slut = Date.now(); try { u.onend && u.onend() } catch (_) {} },
        Math.max(80, String(u.text).length * 10));
    },
    getVoices: () => [],
    cancel() {},
  };
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.onend = null; this.onerror = null };
}
function ljudstubbe(window) {
  window.__ljud = [];
  window.Audio = function (src) {
    const lyssnare = {};
    const el = {
      src, volume: 1, paused: true,
      play() { this.paused = false; return Promise.resolve() },
      addEventListener(n, fn) { (lyssnare[n] = lyssnare[n] || []).push(fn) },
      removeEventListener(n, fn) { lyssnare[n] = (lyssnare[n] || []).filter(x => x !== fn) },
      // Provet får avsluta ljudet när det vill, så avregistreringen går att bevisa.
      __avsluta() { (lyssnare.ended || []).slice().forEach(fn => fn()); if (this.onended) this.onended() },
    };
    window.__ljud.push(el);
    return el;
  };
}

async function fonster({ namn = 'flik', scen = null, lager, skrivbar = false, extraFiler = [],
                         tal = false, ljud = false, actions = [], events = [] } = {}) {
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
  if (tal) talstubbe(window);
  if (ljud) ljudstubbe(window);

  for (const f of [...FILER, ...extraFiler]) {
    const s = window.document.createElement('script');
    s.textContent = las(f);
    window.document.body.append(s);
  }

  if (skrivbar) {
    // EN PROJEKTION ÄR EN ERSÄTTNING, INTE ETT TILLÄGG. projectActive skriver de EXTRA_KEYS den
    // får och rensar resten — så ett prov som seedar t.ex. vyra-scene-settings-v1 (per-scen
    // maxQueue) i lagret och sedan startar en skrivbar studioflik tappar nyckeln i samma stund,
    // tyst. Det kostade en felsökning: overlayn såg maxQueue som null och köade obegränsat, och
    // provet såg ut som ett fel i koden det mätte. Allt lagret redan bär följer därför med in.
    const extras = {};
    for (const nyckel of EXTRA_KEYS) {
      const varde = lager.getItem(nyckel);
      if (varde != null) extras[nyckel] = varde;
    }
    extras[KEY] = JSON.stringify({ actions, events });
    const token = window.VyraSessionState.beginProjection();
    const r = await window.VyraSessionState.projectActive(token, { mode: 'studio-committed',
      workspaceId: 'ws-prov', overlayId: 'ov-prov', state: { widgets: [], user: 'Streamer' }, extras });
    if (!r.ok) throw new Error(`${namn} blev inte skrivbar: ${JSON.stringify(r)}`);
  }

  window.__spelningar = 0;
  window.triggerGiftFireworks = () => { window.__spelningar++; return true };
  window.__toaster = [];
  window.toast = m => { window.__toaster.push(String(m)) };
  return window;
}

module.exports = { delatLager, fonster, KEY, EXTRA_KEYS, FILER };
