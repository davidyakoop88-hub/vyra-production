'use strict';
// VIEWER SHOWCASE I OBS: studion väljer en tittare, servern skickar beskedet till overlayn. Vaktar att ramen är
// ett EGET meddelandeslag utan `id:`-rad, att bara vitlistade fält når webbläsaren, att profilbilden bara får
// komma från TikToks bildvärdar, och att rutten kräver redigeringsrätt, har en gräns och aldrig går via ingest.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const GoalSse = require('../goal-sse');

test('showcase: ramen bär bara vitlistade fält och ingen id-rad', () => {
  const chunk = GoalSse.sseChunk({ showcase: { widgetId: 'templateViewerShowcase-ab_1', spelId: 'vs1', namn: 'Anna', avatar: 'https://p16-sign-va.tiktokcdn.com/obj/a.jpeg',
    rubrik: 'VÄLKOMMEN', meddelande: 'Kul att du är här!', workspaceId: 'ws', token: 'hemligt', userId: '123' } }, 'OV-1');
  assert.ok(chunk.startsWith('event: showcase\n'));
  assert.doesNotMatch(chunk, /^id:/m);
  assert.doesNotMatch(chunk, /hemligt|workspaceId|userId/);
  const data = JSON.parse(chunk.split('\n').find(r => r.startsWith('data: ')).slice(6));
  assert.deepEqual(data, { widgetId: 'templateViewerShowcase-ab_1', spelId: 'vs1', namn: 'Anna', avatar: 'https://p16-sign-va.tiktokcdn.com/obj/a.jpeg',
    rubrik: 'VÄLKOMMEN', meddelande: 'Kul att du är här!' });
});

test('showcase: profilbild bara från TikToks bildvärdar, text kapas och rensas', () => {
  for (const bad of ['https://evil.example/a.jpg', 'http://p16.tiktokcdn.com/a.jpg', 'javascript:alert(1)', 'https://tiktokcdn.com.evil.example/a.jpg'])
    assert.equal(GoalSse.showcaseRam({ widgetId: 'w1', namn: 'A', avatar: bad }).avatar, '', bad);
  assert.ok(GoalSse.showcaseRam({ widgetId: 'w1', namn: 'A', avatar: 'https://p77-sign.tiktokcdn-us.com/a.webp' }).avatar);
  const r = GoalSse.showcaseRam({ widgetId: 'w1', namn: 'A\u0000B'.padEnd(80, 'x'), rubrik: 'R'.repeat(50), meddelande: 'M'.repeat(300) });
  assert.equal(r.namn.length, 40); assert.ok(!r.namn.includes('\u0000'));
  assert.equal(r.rubrik.length, 30); assert.equal(r.meddelande.length, 100);
});

test('showcase: utan widget eller namn blir det tystnad', () => {
  for (const d of [null, {}, { widgetId: 'w1' }, { namn: 'A' }, { widgetId: '<script>', namn: 'A' }, { widgetId: 'w1', namn: '   ' }])
    assert.equal(GoalSse.sseChunk({ showcase: d }, 'OV-1'), null, JSON.stringify(d));
});

test('showcase: publiceras på kanalen, aldrig i streamen', async () => {
  const publicerat = [];
  const bus = { connect: async () => ({ publish: async (kanal, rad) => publicerat.push([kanal, rad]), xAdd: async () => { throw new Error('xAdd får aldrig anropas'); } }),
    channel: id => 'kanal:' + id };
  assert.equal(await GoalSse.publishShowcase(bus, 'ws1', { widgetId: 'w1', namn: 'Anna', token: 'hemligt' }), true);
  assert.equal(await GoalSse.publishShowcase(bus, 'ws1', { widgetId: 'w1' }), false);
  assert.equal(publicerat.length, 1);
  assert.equal(publicerat[0][0], 'kanal:ws1');
  assert.doesNotMatch(publicerat[0][1], /hemligt/);
});

test('showcase: rutten kräver redigeringsrätt, har en gräns och går aldrig via ingest', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const rad = src.split('\n').find(r => r.includes('const showcaseRoute=')) || '';
  assert.ok(rad, 'rutten saknas');
  assert.match(rad, /membership\(s\.user_id,workspaceId,\['owner','admin','editor'\]\)/);
  assert.match(rad, /rateLimiter\.exceeded\(`showcase:\$\{workspaceId\}`/);
  assert.match(rad, /GoalSse\.publishShowcase\(eventBus,workspaceId,d\)/);
  assert.doesNotMatch(rad, /ingestEvent|eventBus\.publish\(|publishInternal/);
});
