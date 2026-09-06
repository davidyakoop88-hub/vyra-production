'use strict';
// En trasig widgetsession får inte tysta Actions & Events.
//
// STRUKTUREN. `ingest()` i live-client.js kör fyra saker i ordning för varje liveevent:
//
//   135  emit('vyra-live-event', e)                 <- TTS, LIVE PULSE, points-system, gift-jar
//   138  routeLiveBattleEvent(e)                    <- fem widgetsessioner lindar den här
//   139  VyraActionEvent.handleEvent(...)           <- Actions & Events
//
// Rad 138 saknade try/catch. Kastade NÅGON av de fem lindningarna gick undantaget rakt genom
// ingest, och rad 139 kördes aldrig — hela Actions & Events tystnade för det eventet, utan att
// någonting i panelen visade varför. Ju fler sessioner som lindar kedjan, desto större yta:
// battle-mvp, fan-level, gifter-level, gift-fireworks och numera guardian.
//
// Triggeranropen SJÄLVA är skyddade av VyraAlertQueue (`try{job.run()}catch{}`), men först efter
// att runtime-controls.js bytt ut funktionerna — 500 ms / 2200 ms / `load` efter start. Före det,
// och för allt en session gör UTANFÖR triggern, fanns inget skydd alls.
//
// TTS PÅVERKADES ALDRIG: den lyssnar på `vyra-live-event`, som sänds på rad 135 — tre rader före.
// Provet mäter det också, så att ordningen inte kan kastas om av misstag senare.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createBrowser } = require('./helpers/browser-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const WS = 'ws-A';
let n = 0;
const chatt = (over = {}) => Object.assign(
  { id: 'e' + (++n), type: 'chat', username: 'lisa', comment: 'hej' }, over);

// Bygger en riktig live-client och låter anroparen bestämma om den lindade kedjan ska kasta.
function boot({ kastar = false } = {}) {
  const browser = createBrowser({ hostname: 'vyralive.app' });
  browser.load('session-state.js');
  browser.sandbox.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: WS }] }) };
  // cloud-fields.js FORE live-client.js: normaliseringen bor dar sedan 2026-09-06, och
  // live-client.js kastar med flit om modulen saknas i stallet for att tyst gora halva jobbet.
  // Ordningen har speglar media.js injektionskedja.
  browser.load('cloud-fields.js');
  browser.load('live-client.js');

  const sett = { live: [], actions: [], route: 0 };

  // Actions & Events, rad 139.
  browser.sandbox.VyraActionEvent = { handleEvent: (t, p) => sett.actions.push([t, p]) };
  // TTS m.fl., rad 135.
  browser.sandbox.addEventListener('vyra-live-event', e => sett.live.push(e.detail || {}));

  // En widgetsession som lindar kedjan — precis som guardian-session.js gör.
  const tidigare = browser.sandbox.routeLiveBattleEvent;
  browser.sandbox.routeLiveBattleEvent = function (e) {
    sett.route++;
    if (typeof tidigare === 'function') tidigare(e);
    if (kastar) throw new Error('trasig widgetsession');
  };

  return { browser, sett, ingest: e => browser.sandbox.VyraLive.ingest(e) };
}

// ---- 1. den frisknormala vägen -------------------------------------------------------------------

test('ett vanligt event når både livelyssnarna, kedjan och Actions', () => {
  const { sett, ingest } = boot();
  ingest(chatt());
  assert.equal(sett.live.length, 1, 'vyra-live-event sändes inte — TTS hade varit tyst');
  assert.equal(sett.route, 1, 'routeLiveBattleEvent anropades inte — widgetsessionerna hade varit döda');
  assert.ok(sett.actions.length >= 1, 'Actions & Events fick inget event');
});

// ---- 2. isoleringen ------------------------------------------------------------------------------

test('en kastande widgetsession tystar INTE Actions & Events', () => {
  const { sett, ingest } = boot({ kastar: true });
  assert.doesNotThrow(() => ingest(chatt()),
    'undantaget gick rakt genom ingest — allt efter rad 138 hoppades över');
  assert.ok(sett.actions.length >= 1,
    'Actions & Events tystnade för att en widgetsession kastade — det är felet den här fixen stänger');
});

test('en kastande widgetsession påverkar inte TTS-vägen', () => {
  // vyra-live-event sänds FÖRE kedjan, så den kan inte drabbas. Provet finns för att ordningen
  // inte ska kunna kastas om senare utan att någon märker det.
  const { sett, ingest } = boot({ kastar: true });
  ingest(chatt());
  assert.equal(sett.live.length, 1, 'chatten nådde inte vyra-live-event — TTS blev tyst');
  assert.equal(sett.live[0].comment, 'hej', 'chattexten föll bort på vägen');
});

test('nästa event fungerar som vanligt efter att ett kastat', () => {
  // Ett undantag får inte lämna ingest i ett trasigt läge — nästa gåva ska gå hela vägen.
  const { sett, ingest } = boot({ kastar: true });
  ingest(chatt());
  const efter = sett.actions.length;
  ingest(chatt({ type: 'gift', giftName: 'Rose', coins: 500, count: 1 }));
  assert.ok(sett.actions.length > efter, 'kedjan återhämtade sig inte efter ett undantag');
});

// ---- 3. att felet inte försvinner tyst -----------------------------------------------------------

test('ett svalt undantag loggas, det tystas inte', () => {
  // En tyst catch är en ny sorts osynlig bugg: widgeten slutar fungera och ingenting säger varför.
  // Fångsten måste skrika i konsolen.
  const src = las('live-client.js');
  const rad = src.split('\n').find(l => l.includes('routeLiveBattleEvent(e)'));
  assert.ok(rad, 'anropet till routeLiveBattleEvent hittades inte');
  assert.match(rad, /try\s*\{/, 'anropet saknar try — en kastande session tystar Actions');
  assert.match(rad, /console\.(error|warn)/, 'undantaget sväljs utan att loggas');
});

test('ordningen i ingest är oförändrad: livelyssnarna före kedjan före Actions', () => {
  const src = las('live-client.js');
  const iLive = src.indexOf("emit('vyra-live-event'");
  const iRoute = src.indexOf('routeLiveBattleEvent(e)');
  const iAction = src.indexOf('VyraActionEvent');
  assert.ok(iLive > 0 && iRoute > 0 && iAction > 0, 'hittade inte alla tre stegen i ingest');
  assert.ok(iLive < iRoute, 'vyra-live-event sänds inte längre före widgetkedjan — TTS blir sårbar');
  assert.ok(iRoute < iAction, 'Actions ligger inte längre efter widgetkedjan — provets premiss gäller inte');
});
