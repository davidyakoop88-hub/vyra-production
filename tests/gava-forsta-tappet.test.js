'use strict';
// GÅVAN SYNS VID FÖRSTA TAPPET (2026-10-26) — klientens halva.
//
// Bryggan skickar en gåvostreaks första frame som `giftstreak` och slutframen som `gift` med samma
// streakId (tiktok-bridge/test/gift-streak.test.js provar bryggans halva mot de uppmätta framen).
// Här provas att live-client.js håller isär de två:
//   · starten når BARA de visuella alerterna (`vyra-gava-tidig`) — aldrig `vyra-live-event`,
//     VyraLive.on-lyssnarna, widgetkedjan eller Actions, där gåvor räknas;
//   · slutframen räknas som vanligt och märks `streakVisad`, så en alert inte visar den igen;
//   · en gammal start (historik vid omladdning) visas inte;
//   · Last-X visar gifterkortet direkt på starten, och OBS-aktiveringen tänder bara de widgetar som
//     visar starten — inte topplistor som får sitt värde först med slutsumman.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const levande = [];
test.after(() => { while (levande.length) levande.pop().window.close() });

function fonster() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://vyralive.app/studio.html', runScripts: 'dangerously' });
  levande.push(dom);
  const w = dom.window;
  w.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: 'ws-A' }] }) };
  w.__kedja = []; w.__actions = [];
  w.routeLiveBattleEvent = e => w.__kedja.push(e);
  w.VyraActionEvent = { handleEvent: (t, p) => w.__actions.push([t, p]) };
  for (const f of ['cloud-fields.js', 'live-client.js']) {
    const s = w.document.createElement('script'); s.textContent = las(f); w.document.body.append(s);
  }
  w.__live = []; w.__tidig = []; w.__on = [];
  w.addEventListener('vyra-live-event', ev => w.__live.push(ev.detail));
  w.addEventListener('vyra-gava-tidig', ev => w.__tidig.push(ev.detail));
  w.VyraLive.on(e => w.__on.push(e));
  return w;
}
const start = (over = {}) => ({ id: 's1', type: 'giftstreak', username: 'lisa', giftName: 'Rose', giftId: '5655', count: 1, coins: 1,
  streakId: 'u1:5655:g1', at: Date.now(), ...over });
const slut = (over = {}) => ({ id: 'g1', type: 'gift', username: 'lisa', giftName: 'Rose', giftId: '5655', count: 10, coins: 10,
  streakId: 'u1:5655:g1', at: Date.now(), ...over });

test('streakstarten når bara de visuella alerterna — aldrig räknarna, kedjan eller Actions', () => {
  const w = fonster();
  w.VyraLive.ingest(start());
  assert.equal(w.__tidig.length, 1, 'starten nådde inte vyra-gava-tidig');
  assert.equal(w.__tidig[0].type, 'gift', 'alerterna ska få starten som en gåva');
  assert.equal(w.__tidig[0].streakTidig, true);
  assert.equal(w.__live.length, 0, 'starten nådde vyra-live-event — topplistor och mål hade räknat den');
  assert.equal(w.__on.length, 0, 'starten nådde VyraLive.on — där räknas gåvor');
  assert.equal(w.__kedja.length, 0, 'starten gick genom widgetkedjan — Battle MVP räknar gåvor där');
  assert.equal(w.__actions.length, 0, 'starten körde en Action — tröskeln på coin-värde hade fått första tappets värde');
});

test('slutframen räknas en gång och märks streakVisad', () => {
  const w = fonster();
  w.VyraLive.ingest(start());
  w.VyraLive.ingest(slut());
  assert.equal(w.__live.length, 1, 'slutsumman ska räknas exakt en gång');
  assert.equal(w.__live[0].count, 10);
  assert.equal(w.__live[0].streakVisad, true, 'slutframen är inte märkt — en alert hade visat streaken igen');
  assert.equal(w.__kedja.length, 1);
  assert.ok(w.__actions.some(([t]) => t === 'gift'), 'slutframen ska köra Actions som förut');
  assert.equal(w.__tidig.length, 1, 'slutframen ska inte ge en andra tidig visning');
});

test('en gåva utan visad start är orörd', () => {
  const w = fonster();
  w.VyraLive.ingest(slut({ streakId: '' }));
  assert.equal(w.__live.length, 1);
  assert.equal(w.__live[0].streakVisad, undefined);
});

test('en gammal start (historik vid omladdning) visas inte', () => {
  const w = fonster();
  w.VyraLive.ingest(start({ id: 'gammal', at: Date.now() - 60000 }));
  assert.equal(w.__tidig.length, 0, 'kvällens gåvostarter dök upp som alerts vid omladdningen');
});

test('Last-X visar gifterkortet på starten, och aktiveringen tänder bara de widgetar som visar den', () => {
  const lx = las('last-x-alerts.js');
  assert.match(lx, /addEventListener\('vyra-gava-tidig'[^\n]*showLastX\('gifter'/, 'Last-X lyssnar inte på gåvostarten');
  const akt = las('overlay-aktivering.js');
  assert.match(akt, /TIDIGA = new Set\(\['templateLastX', 'templateHeartCloud'\]\)/);
  assert.match(akt, /addEventListener\('vyra-gava-tidig', ev => taTidig\(/);
  assert.match(las('hjartmoln.js'), /addEventListener\('vyra-gava-tidig'/, 'Hjärtan & moln startar inte på gåvostarten');
  // Fyrverkerier och bubblor skalas efter gåvans TOTALA värde (fwMin/fwFinal) — de stannar på slutframen.
  for (const f of ['gift-fireworks-session.js', 'gift-bubbles-session.js'])
    assert.doesNotMatch(las(f), /vyra-gava-tidig/, `${f} ska vänta på slutsumman: storleken räknas på totalen`);
});
