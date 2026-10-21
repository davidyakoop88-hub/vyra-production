'use strict';
// ▶ TESTA WIDGET I OBS: testbeskedet ar ett EGET meddelandeslag, aldrig en livehandelse.
// Vaktar formen som nar webblasaren (overlay-testspel.js) och att den aldrig far en `id:`-rad
// (da hade den hamnat i Last-Event-ID-historiken och spelats upp igen vid ateranslutning).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const GoalSse = require('../goal-sse');

test('testspel: ramen bar exakt fyra falt och ingen id-rad', () => {
  const chunk = GoalSse.sseChunk({ testspel: { atgard: 'spela', widgetId: 'templateTopGift-abc_1', typ: 'rose',
    spelId: 'tx1', username: 'Lacka', workspaceId: 'ws', state: { hemligt: 1 } } }, 'OV-1');
  assert.ok(chunk.startsWith('event: testspel\n'));
  assert.doesNotMatch(chunk, /^id:/m);
  const data = JSON.parse(chunk.split('\n').find(r => r.startsWith('data: ')).slice(6));
  assert.deepEqual(data, { atgard: 'spela', widgetId: 'templateTopGift-abc_1', typ: 'rose', spelId: 'tx1' });
});

test('testspel: ogiltiga besked blir tystnad', () => {
  for (const d of [{}, { atgard: 'spela' }, { atgard: 'radera', widgetId: 'a' }, { atgard: 'spela', widgetId: '<script>' },
    { atgard: 'stoppa', widgetId: 'x'.repeat(200) }]) {
    assert.equal(GoalSse.sseChunk({ testspel: d }, 'OV-1'), null, JSON.stringify(d));
  }
  assert.deepEqual(GoalSse.testspelRam({ atgard: 'stoppa', widgetId: 'w1', typ: '<b>' }), { atgard: 'stoppa', widgetId: 'w1', typ: null, spelId: null });
});

test('testspel: publiceras pa kanalen, aldrig i streamen', async () => {
  const publicerat = [];
  const bus = { connect: async () => ({ publish: async (kanal, rad) => publicerat.push([kanal, rad]), xAdd: async () => { throw new Error('xAdd far aldrig anropas') } }),
    channel: id => 'kanal:' + id };
  assert.equal(await GoalSse.publishTestspel(bus, 'ws1', { atgard: 'spela', widgetId: 'w1' }), true);
  assert.equal(await GoalSse.publishTestspel(bus, 'ws1', { atgard: 'spela' }), false);
  assert.equal(publicerat.length, 1);
  assert.equal(publicerat[0][0], 'kanal:ws1');
  assert.deepEqual(JSON.parse(publicerat[0][1]), { testspel: { atgard: 'spela', widgetId: 'w1', typ: null, spelId: null } });
});

test('testspel: rutten avvisar under sandning och gar aldrig via ingest eller eventBus.publish', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const rad = src.split('\n').find(r => r.includes("const testspelRoute=")) || '';
  assert.ok(rad, 'rutten saknas');
  assert.match(rad, /membership\(s\.user_id,workspaceId,\['owner','admin','editor'\]\)/);
  assert.match(rad, /d\.atgard!=='stoppa'&&lage!=='inte-live'\)return send\(res,409/);
  assert.match(rad, /GoalSse\.publishTestspel\(eventBus,workspaceId,d\)/);
  assert.doesNotMatch(rad, /ingestEvent|eventBus\.publish\(|publishInternal/);
});
