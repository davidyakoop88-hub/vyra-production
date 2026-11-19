'use strict';
// STREAKFÄLTEN GENOM HELA MOLNVÄGEN (2026-11-19).
//
// Bryggan sätter `streakId` på streakens första frame (`streakstart`) och på slutframens `gift`, och
// giftFields sätter `repeatEnd`. N.cloudEvent() är det som bygger bodyn som postas till molnet, och den
// listade sina fält uttryckligen — så båda föll bort där. Följder, mätta mot den riktiga kedjan:
//   - live-client.js:362 kräver streakId, så streaken visades aldrig tidigt på molnvägen,
//   - playground-widgets.js conv() ser inte att en gåva är avslutad (repeatEnd === true), så två avslutade
//     gåvor från samma tittare inom 12 s räknades 2 + 1 i stället för 2 + 3 i Goal Pro och Podium.
// Provet kör samma steg som tests/top-gift-molnvagen.test.js: bryggans streakbeslut, N.giftFields,
// N.cloudEvent, serverns cleanEvent och klientens normalizeCloudFields.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const N = require('../tiktok-bridge/normalizer.js');
const { normalizeCloudFields } = require('../cloud-fields.js');

// Samma läsning av server/event-bus.js som i top-gift-molnvagen.test.js (redis får inte require:as här).
function laddaCleanEvent() {
  const kalla = fs.readFileSync(path.join(ROOT, 'server', 'event-bus.js'), 'utf8');
  const mod = { exports: {} };
  const attrapp = namn => {
    if (namn === 'redis') return { createClient: () => ({}) };
    if (namn === './observability') return { CircuitBreaker: class {} };
    return require(namn);
  };
  vm.runInThisContext(`(function (require, module, exports) {${kalla}\n})`)(attrapp, mod, mod.exports);
  return mod.exports.cleanEvent;
}
const cleanEvent = laddaCleanEvent();

const ROSE = { id: 5655, name: 'Rose', diamondCount: 1, type: 1, image: { urlList: ['https://example.invalid/rose.png'] } };
const user = { userId: 'u1-id', uniqueId: 'u1', nickname: 'U1' };
let lopnummer = 0;

// Bryggans GIFT-hanterare (bridge.js) -> molnet -> SSE -> klienten. null = ingen händelse.
function genomMolnet(oppna, ra) {
  const beslut = N.streakBeslut(oppna, ra);
  if (!beslut.typ) return null;
  const falt = N.giftFields(ra, '');
  const skickat = beslut.typ === 'streakstart'
    ? { ...falt, streakId: beslut.streakId }
    : (beslut.streakId ? { ...falt, streakId: beslut.streakId } : falt);
  const body = N.cloudEvent('k' + (++lopnummer), beslut.typ, skickat);
  const ram = JSON.parse(JSON.stringify(cleanEvent({ ...body, id: '1-' + lopnummer })));
  return normalizeCloudFields(ram);
}
const ram = (antal, slut, grupp = 'g1') => ({ common: { msgId: `m-${grupp}-${antal}-${slut}` }, giftId: ROSE.id, gift: ROSE,
  repeatCount: antal, repeatEnd: slut ? 1 : 0, groupId: grupp, user });

test('streakens första frame bär streakId hela vägen till klienten', () => {
  const start = genomMolnet(new Map(), ram(1, false));
  assert.equal(start.type, 'streakstart');
  assert.equal(start.streakId, N.streakNyckel(ram(1, false)), 'streakId föll bort mellan bryggan och klienten');
});

test('slutframen bär samma streakId och repeatEnd true', () => {
  const oppna = new Map();
  const start = genomMolnet(oppna, ram(1, false));
  assert.equal(genomMolnet(oppna, ram(3, false)), null, 'mellanframes ska inte bli händelser');
  const slut = genomMolnet(oppna, ram(5, true));
  assert.equal(slut.type, 'gift');
  assert.equal(slut.streakId, start.streakId, 'slutframen ska höra till samma streak som starten');
  assert.equal(slut.repeatEnd, true, 'repeatEnd föll bort — Goal Pro/Podium vet inte att gåvan är avslutad');
  assert.equal(slut.count, 5);
});

test('en gåva utan streak får inget streakId, men repeatEnd följer med', () => {
  const ensam = genomMolnet(new Map(), { common: { msgId: 'enkel' }, giftId: 9, gift: { id: 9, name: 'Heart', diamondCount: 1, type: 0 }, repeatCount: 1, user });
  assert.equal(ensam.type, 'gift');
  assert.equal(ensam.streakId, '', 'ingen streak har visats, så inget streakId ska finnas');
  assert.equal(ensam.repeatEnd, true);
});

test('ett event utan fälten ser ut som förut (äldre brygga)', () => {
  const body = N.cloudEvent('x', 'like', { username: 'a', count: 3 });
  assert.equal('streakId' in body, false);
  assert.equal('repeatEnd' in body, false);
  const ut = cleanEvent({ ...body, id: '1-1' });
  assert.equal('repeatEnd' in ut, false, 'cleanEvent får inte hitta på repeatEnd');
  assert.equal(ut.streakId, '');
});

test('repeatEnd false bevaras (inte samma sak som saknat)', () => {
  const body = N.cloudEvent('x', 'gift', { username: 'a', count: 2, repeatEnd: false });
  assert.equal(body.repeatEnd, false);
  assert.equal(cleanEvent({ ...body, id: '1-2' }).repeatEnd, false);
});
