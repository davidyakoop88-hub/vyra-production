'use strict';
// Molnets kontrakt för TikToks egen nivåhöjning.
//
// VARFÖR PROVET LIGGER HÄR OCH INTE I tiktok-bridge/test/. Det anropar cleanEvent, som drar in
// redis. Jobbet `test-tiktok-bridge` i CI kör `npm ci` BARA i tiktok-bridge/ — där finns inga
// server-beroenden, och ett prov som laddade event-bus.js därifrån föll i CI även när logiken var
// rätt. Lokalt gick det, eftersom beroendena låg på plats. Exakt samma fälla som
// electron-app/tiktok-service.js i #308: ett prov får bara ladda det dess EGET jobb installerar.
//
// Fältlogiken provas i tiktok-bridge/test/fans-upgrade.test.js (inga beroenden). Molnkontraktet
// provas här. Tillsammans täcker de hela vägen, och var och en kan köras av sitt eget CI-jobb.
//
// KEDJAN SOM PROVAS: bryggans fansUppgradering -> cloudEvent -> molnets cleanEvent.
// normalizer.js är beroendefri och går att ladda härifrån utan att installera något extra.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { cleanEvent } = require('../event-bus.js');
const N = require(path.join(__dirname, '..', '..', 'tiktok-bridge', 'normalizer.js'));

// De fem verkliga nivåerna ur inspelningen 2026-09-01.
const UPPMATTA_NIVAER = [32, 18, 10, 19, 11];

const uppgradering = niva => ({
  subType: 'fans_upgrade',
  content: { key: 'pm_mt_fan_live_upgrade_bullet', pieces: [{ type: 1, stringValue: String(niva) }] },
  user: { id: 'id#162497c2', displayId: 'lisa', nickname: 'Lisa' }
});

const molnkropp = niva => N.cloudEvent('e' + niva, 'fanlevelup', N.fansUppgradering(uppgradering(niva)));

test('varje uppmätt höjning överlever hela vägen till cleanEvent', () => {
  for (const niva of UPPMATTA_NIVAER) {
    const ut = cleanEvent(molnkropp(niva));
    assert.deepEqual(ut.fanLevelUp, { from: niva - 1, to: niva },
      `molnet kastade stämpeln för nivå ${niva}`);
    assert.equal(ut.fanClubLevel, niva,
      'fanClubLevel tappades — fan-level-session.js lämnar då direkt och läser aldrig stämpeln');
    assert.equal(ut.type, 'fanlevelup', 'typen överlevde inte cleanEvent');
    assert.equal(ut.username, 'lisa', 'avsändaren tappades');
  }
});

test('en stämpel som inte är en äkta höjning kastas', () => {
  // Vakten at andra hallet: skickar bryggan nagon gang skrap ska molnet slanga det, inte
  // vidarebefordra en falsk hojning till widgeten.
  const kropp = molnkropp(32);
  for (const trasig of [{ from: 5, to: 5 }, { from: 9, to: 3 }, { from: 0, to: 1 },
    { from: 1, to: 51 }, { from: 'a', to: 'b' }, null, undefined]) {
    const ut = cleanEvent({ ...kropp, fanLevelUp: trasig });
    assert.equal(ut.fanLevelUp, undefined, `molnet slapp igenom ${JSON.stringify(trasig)}`);
  }
});

test('ett event utan höjning bär ingen fanLevelUp-nyckel alls', () => {
  // cloudEvent utelamnar nyckeln helt nar ingen hojning finns, precis som cleanEvent gor med
  // `if(fanUpp)`. En nyckel med vardet undefined hade smutsat den kanoniska formen for VARJE event
  // och tvingat formvakten i tiktok-bridge/test/normalizer.test.js att bara den.
  const vanligt = cleanEvent(N.cloudEvent('c1', 'chat', { username: 'lisa', comment: 'hej' }));
  assert.equal('fanLevelUp' in vanligt, false, 'nyckeln finns på ett event utan höjning');
});

test('fanlevelup är en tillåten typ i event-bussen', () => {
  const { ALLOWED } = require('../event-bus.js');
  assert.equal(ALLOWED.has('fanlevelup'), true,
    'ALLOWED saknar fanlevelup — event-bussen kastar hela eventet');
});

test('molnets ingest accepterar fanlevelup och kräver avsändare', () => {
  // Typen bar en PERSON och far darfor inte ligga i TIKTOK_ROOM_TYPES — hamnar den dar slutar
  // molnet krava username, och en hojning utan avsandare hade natt widgeten med tom text.
  const { validateTikTokIngestPayload } = require('../index.js');
  assert.doesNotThrow(() => validateTikTokIngestPayload({ type: 'fanlevelup', username: 'lisa' }));
  assert.throws(() => validateTikTokIngestPayload({ type: 'fanlevelup' }), /username/);
});
