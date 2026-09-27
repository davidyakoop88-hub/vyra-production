'use strict';
// SKATTKISTAN på skrivbordsvägen: samma fält som bryggan, och den lokala vitlistan stryker dem inte.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const F = require('../tiktok-fields.js');
const N = require('../../tiktok-bridge/normalizer.js');
const SERVICE = fs.readFileSync(path.join(__dirname, '..', 'tiktok-service.js'), 'utf8');
const LOKAL = fs.readFileSync(path.join(__dirname, '..', 'local-server.js'), 'utf8');

const KISTA = { envelopeInfo: { envelopeId: '75465', sendUserName: 'Lina', diamondCount: 100, peopleCount: 12,
  unpackAt: 1759000060, sendUserId: '68', sendUserAvatar: { urlList: ['https://cdn/lina.jpg'] } }, display: 1 };

test('skrivbordsappens envelopeFields ger exakt samma fält som bryggans', () => {
  assert.deepEqual(F.envelopeFields(KISTA), N.envelopeFields(KISTA));
  assert.deepEqual(F.envelopeFields({ ...KISTA, display: 2 }), N.envelopeFields({ ...KISTA, display: 2 }));
  assert.equal(F.envelopeFields({}), null);
});

test('tjänsten lyssnar på ENVELOPE och den lokala vitlistan bär kistans fält', () => {
  assert.match(SERVICE, /connection\.on\(WebcastEvent\.ENVELOPE,[\s\S]{0,160}emit\('envelope'/);
  assert.match(LOKAL, /kistaId: text\(d\.kistaId/);
  assert.match(LOKAL, /oppnasAt: number\(d\.oppnasAt/);
});
