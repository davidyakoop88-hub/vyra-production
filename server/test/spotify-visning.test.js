'use strict';
// SPOTIFY-LÅTÖNSKNINGAR I OBS: studion skickar låtdata via servern till overlayn. Vaktar att ramen är ett
// EGET meddelandeslag utan `id:`-rad, att bara vitlistade fält når webbläsaren (aldrig token eller uri),
// att bara Spotifys bild-CDN släpps igenom, och att rutten kräver redigeringsbehörighet och aldrig går via ingest.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const GoalSse = require('../goal-sse');

const BILD = 'https://i.scdn.co/image/ab67616d0000b273abcdef12';

test('spotify: ramen bär bara vitlistade fält och ingen id-rad', () => {
  const chunk = GoalSse.sseChunk({ spotify: { at: 5, playing: true, accessToken: 'hemligt', refreshToken: 'hemligt', workspaceId: 'ws',
    current: { title: 'Låt', artist: 'Artist', image: BILD, seconds: 200, uri: 'spotify:track:1', requester: 'Sara' },
    queue: [{ title: 'Nästa', artist: 'B', image: 'https://evil.example/x.png', seconds: 'x', requester: 'Leo', uri: 'spotify:track:2' }] } }, 'OV-1');
  assert.ok(chunk.startsWith('event: spotify\n'));
  assert.doesNotMatch(chunk, /^id:/m);
  assert.doesNotMatch(chunk, /hemligt|spotify:track|evil|workspaceId/);
  const data = JSON.parse(chunk.split('\n').find(r => r.startsWith('data: ')).slice(6));
  assert.deepEqual(data, { at: 5, playing: true, error: '',
    current: { title: 'Låt', artist: 'Artist', image: BILD, seconds: 200, requester: 'Sara' },
    queue: [{ title: 'Nästa', artist: 'B', image: '', seconds: 0, requester: 'Leo' }] });
});

test('spotify: kön kapas vid tio, tomma låtar och kontrolltecken faller bort, okänt fel blir ett fast fel', () => {
  const ram = GoalSse.spotifyRam({ at: 1, queue: Array.from({ length: 30 }, (_, i) => ({ title: 'L' + i })).concat([{ title: '' }]),
    current: { title: 'A\u0000B\u001b', requester: 'x'.repeat(200) }, error: '<b>vad som helst</b>' });
  assert.equal(ram.queue.length, 10);
  assert.equal(ram.current.title, 'AB');
  assert.equal(ram.current.requester.length, 60);
  assert.equal(ram.error, 'Spotify kunde inte uppdateras');
  assert.equal(ram.playing, false);
});

test('spotify: ogiltiga besked blir tystnad', () => {
  for (const d of [null, {}, { at: 0 }, { at: 'nu' }, { at: -5 }]) assert.equal(GoalSse.sseChunk({ spotify: d }, 'OV-1'), null, JSON.stringify(d));
});

test('spotify: publiceras på kanalen, aldrig i streamen', async () => {
  const publicerat = [];
  const bus = { connect: async () => ({ publish: async (kanal, rad) => publicerat.push([kanal, rad]), xAdd: async () => { throw new Error('xAdd får aldrig anropas'); } }),
    channel: id => 'kanal:' + id };
  assert.equal(await GoalSse.publishSpotify(bus, 'ws1', { at: 9, accessToken: 'hemligt' }), true);
  assert.equal(await GoalSse.publishSpotify(bus, 'ws1', {}), false);
  assert.equal(publicerat.length, 1);
  assert.equal(publicerat[0][0], 'kanal:ws1');
  assert.doesNotMatch(publicerat[0][1], /hemligt/);
});

test('spotify: rutten kräver redigeringsbehörighet, har rate limit och går aldrig via ingest', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const rad = src.split('\n').find(r => r.includes('const spotifyVisningRoute=')) || '';
  assert.ok(rad, 'rutten saknas');
  assert.match(rad, /membership\(s\.user_id,workspaceId,\['owner','admin','editor'\]\)/);
  assert.match(rad, /rateLimiter\.exceeded\(`spotify-visning:\$\{workspaceId\}`/);
  assert.match(rad, /GoalSse\.publishSpotify\(eventBus,workspaceId,d\)/);
  assert.doesNotMatch(rad, /ingestEvent|eventBus\.publish\(|publishInternal/);
});
