'use strict';
// TOP GIFT GENOM HELA MOLNVAGEN, med de former bryggan och servern faktiskt skickar.
//
// Inspelningen fran sandningen 2026-10-21 (OBS-utgangen): Mela ("Popular") -> 11:15 Jan Erik
// (katten) -> 12:12 Mela igen -> 19:15 Jan Erik igen. Fragan provet besvarar: kan en combo av
// billiga gavor rankas pa sin SUMMA nagonstans mellan TikTok och widgeten? David har ingen VYRA
// Desktop, sa vagen ar molnbryggan -> /api/events/tiktok -> server cleanEvent -> SSE -> overlay.
//
// Varje steg ar den riktiga koden: bryggans streakfilter (isStreakable/isFinalFrame) och
// giftFields, N.cloudEvent (bodyn livscykel.moln postar), serverns cleanEvent, klientens
// normalizeCloudFields och sist bada Top Gift-skrivarna i jsdom. Ra-formen ar
// tiktok-live-connector 2.4 (WebcastGiftMessage, nycklarna uppmatta i
// tiktok-bridge/test/hjalp/uppmatta-payloadfalt.json): `gift.diamondCount`, `gift.type`,
// `repeatCount`, `repeatEnd` som TAL.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const N = require('../tiktok-bridge/normalizer.js');
const { normalizeCloudFields } = require('../cloud-fields.js');

// server/event-bus.js kraver `redis` vid laddning, och rotsviten far inte require:a kod ur ett
// paket med egna beroenden (tests/rotsvitens-beroenden.test.js). Filens TEXT lases i stallet och
// kors med attrapper for de tva beroendena — cleanEvent ror ingen av dem.
function laddaCleanEvent() {
  const kalla = fs.readFileSync(path.join(ROOT, 'server', 'event-bus.js'), 'utf8');
  const mod = { exports: {} };
  const attrapp = namn => {
    if (namn === 'redis') return { createClient: () => ({}) };
    if (namn === './observability') return { CircuitBreaker: class {} };
    return require(namn);
  };
  vm.runInThisContext(`(function (require, module, exports) {${kalla}\n})`)(attrapp, mod, mod.exports);
  assert.equal(typeof mod.exports.cleanEvent, 'function', 'cleanEvent hittades inte i server/event-bus.js');
  return mod.exports.cleanEvent;
}
const cleanEvent = laddaCleanEvent();

let lopnummer = 0;
// Bryggan (bridge.js WebcastEvent.GIFT) -> molnet -> SSE -> live-client ingest. null = filtrerad.
function genomMolnet(ra) {
  if (N.isStreakable(ra) && !N.isFinalFrame(ra)) return null;
  const falt = N.giftFields(ra, '');
  const body = N.cloudEvent('k' + (++lopnummer), 'gift', falt);
  const ram = JSON.parse(JSON.stringify(cleanEvent({ ...body, id: '1-' + lopnummer })));
  return normalizeCloudFields(ram);
}

const anvandare = (uniqueId, nickname) => ({ userId: uniqueId + '-id', uniqueId, nickname });
const POPULAR = { id: 7001, name: 'Popular', diamondCount: 1, type: 1, image: { urlList: ['https://example.invalid/popular.png'] } };
const KATT = { id: 7002, name: 'Cool Cat', diamondCount: 99, type: 1, image: { urlList: ['https://example.invalid/katt.png'] } };
const DYR = { id: 7003, name: 'Lion', diamondCount: 29999, type: 2, image: { urlList: ['https://example.invalid/lion.png'] } };

// En streak: TikTok skickar en ram per tryck med KUMULATIVT repeatCount, repeatEnd 0, och sist en
// ram med repeatEnd 1.
function streak(user, gift, antal) {
  const ramar = [];
  for (let i = 1; i <= antal; i++) {
    ramar.push({ common: { msgId: `${user.uniqueId}-${gift.id}-${antal}-${i}` }, giftId: gift.id, gift,
      repeatCount: i, repeatEnd: i === antal ? 1 : 0, groupCount: 1, comboCount: i, user });
  }
  return ramar;
}

function overlay() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://vyralive.app/studio.html?overlay=1&access=tok-abcdefghijklmnopqrstuvwxyz0123456789', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = () => Promise.reject(new Error('ingen server i provet'));
  w.VyraLiveSession = { runtime: () => ({ aktivSession: () => '44444444-4444-4444-8444-444444444444' }) };
  w.eval(`var VYRA_OVERLAY = true;
    var state = { widgets: [{ id: 'tg1', type: 'templateTopGift', dataName: '', dataValue: '' }] };
    var selected = null; var view = 'overlay'; window.VYRA_GIFTS = [];`);
  for (const fil of ['overlay-sanitize.js', 'gift-event-images.js', 'live-leaderboard.js']) {
    w.eval(fs.readFileSync(path.join(ROOT, fil), 'utf8'));
  }
  const skicka = ramar => ramar.map(genomMolnet).filter(Boolean)
    .forEach(e => w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: e })));
  const visad = () => JSON.parse(JSON.stringify(w.eval('state.widgets[0]')));
  return { dom, w, skicka, visad };
}

test('molnvagen bar styckpriset: en combo pa 150 billiga gavor ar vard 1, inte 150', () => {
  const ramar = streak(anvandare('mela', 'MELA'), POPULAR, 150).map(genomMolnet).filter(Boolean);
  assert.equal(ramar.length, 1, 'bryggan ska bara skicka streakens sista ram');
  const [e] = ramar;
  assert.equal(e.count, 150, 'antalet tappades mellan bryggan och klienten');
  assert.equal(e.diamonds, 150, 'diamonds ska vara combons summa — det ar kontraktet for Top Coins');
});

test('inspelningens ordning: Melas langa Popular-combo slar inte Jan Eriks katt', () => {
  const { dom, w, skicka, visad } = overlay();
  try {
    const mela = anvandare('mela', 'MELA'), jan = anvandare('janerik', 'JaN EriKno');
    skicka(streak(mela, POPULAR, 12));                     // 00:45
    assert.equal(visad(w).dataName, 'MELA');
    skicka(streak(jan, KATT, 1));                          // 11:15
    assert.equal(visad(w).dataName, 'JaN EriKno', 'en dyrare gava tog inte over');
    skicka(streak(mela, POPULAR, 150));                    // 12:12: 150 x 1 = 150 > 99 i SUMMA
    assert.equal(visad(w).dataName, 'JaN EriKno',
      'en combo av billiga gavor rankades pa sin summa och tog Top Gift');
    assert.equal(Number(visad(w).dataValue), 99);
    assert.equal(w.VyraGiftRecords.giftCoins, 99);
  } finally { dom.window.close() }
});

test('en gava som inte ar streakbar raknas pa varje ram men fortfarande per styck', () => {
  const { dom, w, skicka, visad } = overlay();
  try {
    const mela = anvandare('mela', 'MELA'), jan = anvandare('janerik', 'JaN EriKno');
    skicka(streak(jan, KATT, 1));
    // gift.type saknas: bryggan kan inte bevisa att det ar en streak och skickar varje ram.
    const ostreakad = streak(mela, { ...POPULAR, type: undefined }, 150);
    assert.equal(ostreakad.map(genomMolnet).filter(Boolean).length, 150, 'forutsattningen: varje ram skickas');
    skicka(ostreakad);
    assert.equal(visad(w).dataName, 'JaN EriKno', 'kumulativa ramar rankades pa sin summa');
  } finally { dom.window.close() }
});

test('en riktigt dyrare enskild gava tar fortfarande over', () => {
  const { dom, w, skicka, visad } = overlay();
  try {
    skicka(streak(anvandare('janerik', 'JaN EriKno'), KATT, 3));
    skicka(streak(anvandare('mela', 'MELA'), DYR, 1));
    assert.equal(visad(w).dataName, 'MELA');
    assert.equal(Number(visad(w).dataValue), 29999);
  } finally { dom.window.close() }
});
