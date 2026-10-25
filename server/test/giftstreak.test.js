'use strict';
// GÅVAN SYNS VID FÖRSTA TAPPET (2026-10-26). Bryggan skickar en gåvostreaks första frame som
// `giftstreak` — ett rent visningsbesked. Molnet ska släppa igenom det till overlayn med streakId,
// men aldrig räkna det: ingestTikTokEvent publicerar det direkt, förbi goal-ingest.js (nivåer, mål,
// poäng) och statistiken. Slutframens `gift` räknas precis som förut och bär samma streakId.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { cleanEvent, ALLOWED } = require('../event-bus');
const { validateTikTokIngestPayload, TIKTOK_INGEST_TYPES } = require('../index');

test('giftstreak är en tillåten persontyp, och cleanEvent behåller streakId', () => {
  assert.ok(ALLOWED.has('giftstreak'));
  assert.ok(TIKTOK_INGEST_TYPES.has('giftstreak'));
  assert.doesNotThrow(() => validateTikTokIngestPayload({ type: 'giftstreak', username: 'tittare' }));
  assert.throws(() => validateTikTokIngestPayload({ type: 'giftstreak' }), /username/, 'en gåvostart utan avsändare ska avvisas');
  const e = cleanEvent({ id: 'giftstreak:1', type: 'giftstreak', username: 'tittare', giftName: 'Rose', streakId: 'u1:5655:g1', count: 1 });
  assert.equal(e.type, 'giftstreak');
  assert.equal(e.streakId, 'u1:5655:g1');
  assert.equal(cleanEvent({ id: 'gift:2', type: 'gift', username: 'tittare', streakId: 'u1:5655:g1' }).streakId, 'u1:5655:g1',
    'slutframens gift ska bära samma streakId');
});

test('giftstreak publiceras rakt till overlayn — förbi mål, poäng, nivåer och statistik', () => {
  const kod = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const start = kod.indexOf('async function ingestTikTokEvent');
  const gren = kod.slice(start, kod.indexOf("if(String(payload?.type||'').toLowerCase()==='chatcommand')", start));
  assert.match(gren, /==='giftstreak'/, 'ingestTikTokEvent har ingen egen gren för giftstreak');
  assert.match(gren, /eventBus\.publish\(workspaceId,payload\)/, 'giftstreak ska publiceras direkt');
  assert.match(gren, /return raw;/, 'grenen ska returnera innan den vanliga vägen');
  for (const raknare of ['ingestEvent(', 'streamStats', 'Gavoidentitet', 'Gavokatalog', 'HeartMeGoal', 'metrics.event'])
    assert.ok(!gren.includes(raknare), `giftstreak-grenen rör ${raknare} — då räknas streaken två gånger`);
  assert.match(gren, /tiktok-ingest-streak:/, 'giftstreak ska ha en egen takthink, skild från gåvornas');
});
