'use strict';
// SKATTKISTAN (ENVELOPE) — bryggans sida av kedjan.
//
// Mätt 2026-09-06: 14 ENVELOPE i en riktig sändning, 100 diamanter delades ut och ingen widget såg
// dem, för bryggan lyssnade inte. Fälten är lästa ur tiktok-live-proto v2 (WebcastEnvelopeMessage).
// Nyttolasten nedan har exakt den formen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');
const BRIDGE = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');

const KISTA = {
  common: { method: 'WebcastEnvelopeMessage', msgId: '7556000000000000001' },
  envelopeInfo: {
    envelopeId: '7546541354546545455', businessType: 1, sendUserName: 'Lina',
    diamondCount: 100, peopleCount: 12, unpackAt: 1759000060, sendUserId: '6805519295863489542',
    sendUserAvatar: { urlList: ['https://cdn/lina.jpg'] }
  },
  display: 1
};

test('envelopeFields bär avsändare, diamanter, personer, id och öppningstid i millisekunder', () => {
  const f = N.envelopeFields(KISTA);
  assert.deepEqual(f, {
    userId: '6805519295863489542', username: 'Lina', name: 'Lina', profileImage: 'https://cdn/lina.jpg',
    diamonds: 100, count: 12, kistaId: '7546541354546545455', oppnasAt: 1759000060000, kistaDold: false
  });
});

test('unpackAt i millisekunder tolkas inte om, och display 2 betyder att kistan döljs', () => {
  const f = N.envelopeFields({ ...KISTA, display: 2, envelopeInfo: { ...KISTA.envelopeInfo, unpackAt: 1759000060123 } });
  assert.equal(f.oppnasAt, 1759000060123, 'millisekunder blev tusen gånger för stora');
  assert.equal(f.kistaDold, true);
});

test('en ENVELOPE utan kista ger inget event', () => {
  assert.equal(N.envelopeFields({ common: {} }), null);
  assert.equal(N.envelopeFields({ envelopeInfo: { diamondCount: 5 } }), null, 'utan envelopeId kan widgeten inte hålla isär kistorna');
});

test('molnet får kistans fält, och bara på kistan', () => {
  assert.equal(N.tillMolnet('envelope'), true, 'envelope skickas inte till molnet');
  const moln = N.cloudEvent('k1', 'envelope', N.envelopeFields(KISTA));
  assert.equal(moln.kistaId, '7546541354546545455');
  assert.equal(moln.oppnasAt, 1759000060000);
  assert.equal(moln.diamonds, 100);
  assert.equal(moln.count, 12);
  assert.equal(moln.username, 'Lina');
  assert.equal('kistaId' in N.cloudEvent('g1', 'gift', { username: 'x', coins: 1 }), false, 'en gåva bär ett tomt kistaId');
});

test('bryggan lyssnar på ENVELOPE och skickar typen envelope', () => {
  assert.match(BRIDGE, /connection\.on\(WebcastEvent\.ENVELOPE,[\s\S]{0,160}sendEvent\('envelope'/);
  assert.match(BRIDGE, /redanLyssnade[\s\S]{0,600}'ENVELOPE'/, 'inspelaren lägger en andra lyssnare på ENVELOPE');
});
