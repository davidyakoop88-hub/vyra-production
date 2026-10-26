'use strict';
// GÅVAN SYNS VID FÖRSTA TAPPET (2026-10-26). Bryggan skickar en gåvostreaks första frame som
// `streakstart` — ett rent visningsbesked. Molnet ska släppa igenom det till overlayn med streakId,
// men aldrig räkna det: ingestTikTokEvent publicerar det direkt, förbi goal-ingest.js (nivåer, mål,
// poäng) och statistiken. Slutframens `gift` räknas precis som förut och bär samma streakId.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { cleanEvent, ALLOWED } = require('../event-bus');
const { validateTikTokIngestPayload, TIKTOK_INGEST_TYPES } = require('../index');

test('streakstart är en tillåten persontyp, och cleanEvent behåller streakId', () => {
  assert.ok(ALLOWED.has('streakstart'));
  assert.ok(TIKTOK_INGEST_TYPES.has('streakstart'));
  assert.doesNotThrow(() => validateTikTokIngestPayload({ type: 'streakstart', username: 'tittare' }));
  assert.throws(() => validateTikTokIngestPayload({ type: 'streakstart' }), /username/, 'en gåvostart utan avsändare ska avvisas');
  const e = cleanEvent({ id: 'streakstart:1', type: 'streakstart', username: 'tittare', giftName: 'Rose', streakId: 'u1:5655:g1', count: 1 });
  assert.equal(e.type, 'streakstart');
  assert.equal(e.streakId, 'u1:5655:g1');
  assert.equal(cleanEvent({ id: 'gift:2', type: 'gift', username: 'tittare', streakId: 'u1:5655:g1' }).streakId, 'u1:5655:g1',
    'slutframens gift ska bära samma streakId');
});

test('streakstart publiceras rakt till overlayn — förbi mål, poäng, nivåer och statistik', () => {
  const kod = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const start = kod.indexOf('async function ingestTikTokEvent');
  const gren = kod.slice(start, kod.indexOf("if(String(payload?.type||'').toLowerCase()==='chatcommand')", start));
  assert.match(gren, /==='streakstart'/, 'ingestTikTokEvent har ingen egen gren för streakstart');
  assert.match(gren, /eventBus\.publish\(workspaceId,payload\)/, 'streakstart ska publiceras direkt');
  assert.match(gren, /return raw;/, 'grenen ska returnera innan den vanliga vägen');
  for (const raknare of ['ingestEvent(', 'streamStats', 'Gavoidentitet', 'Gavokatalog', 'HeartMeGoal', 'metrics.event'])
    assert.ok(!gren.includes(raknare), `streakstart-grenen rör ${raknare} — då räknas streaken två gånger`);
  assert.match(gren, /tiktok-ingest-streak:/, 'streakstart ska ha en egen takthink, skild från gåvornas');
});
