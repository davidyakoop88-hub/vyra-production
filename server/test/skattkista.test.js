'use strict';
// SKATTKISTAN i molnet: typen envelope tas emot och kistans fält överlever cleanEvent.
// Bryggans sida: tiktok-bridge/test/skattkista.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const { ALLOWED, cleanEvent } = require('../event-bus.js');

test('envelope är en tillåten typ och bär kistaId, oppnasAt och kistaDold', () => {
  assert.equal(ALLOWED.has('envelope'), true);
  const e = cleanEvent({ id: 'k1', type: 'envelope', username: 'Lina', diamonds: 100, count: 12,
    kistaId: '7546541354546545455', oppnasAt: 1759000060000, kistaDold: false });
  assert.equal(e.type, 'envelope');
  assert.equal(e.kistaId, '7546541354546545455');
  assert.equal(e.oppnasAt, 1759000060000);
  assert.equal(e.kistaDold, false);
  assert.equal(e.diamonds, 100);
  assert.equal(e.count, 12);
});

test('andra typer får inga kistfält', () => {
  const g = cleanEvent({ id: 'g1', type: 'gift', kistaId: 'x', oppnasAt: 5 });
  assert.equal('kistaId' in g, false);
  assert.equal('oppnasAt' in g, false);
});
