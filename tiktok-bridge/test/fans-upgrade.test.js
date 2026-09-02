'use strict';
// Fan Level Up ska tändas av TikToks EGEN nivåhöjning, inte av en jämförelse vi gör själva.
//
// PROBLEMET MED DEN NUVARANDE VÄGEN. server/viewer-levels.js stämplar `fanLevelUp` genom att
// jämföra mot senast sedda nivå för samma tittare, sparad i Postgres. Den kräver alltså att
// personen setts MINST TVÅ gånger: en gång på sin gamla nivå och en gång på den nya. Ses någon för
// första gången på sin nya nivå lärs den bara in, och höjningen försvinner tyst.
//
// Uppmätt 2026-09-01: fem `fans_upgrade` inträffade under två sändningar, men Fan Level Up ritades
// aldrig. Nivåfälten kom fram (mätt i live-event: fanClubLevel 4, gifterLevel 14) — det var
// jämförelsen som inte hade något att jämföra mot, eftersom baslinjerna började lagras samma kväll.
//
// TIKTOK SKICKAR HÖJNINGEN SJÄLV. `BARRAGE` med `subType: 'fans_upgrade'`:
//
//   key      pm_mt_fan_live_upgrade_bullet
//   pattern  "reached member Lv.{0:string}"
//   pieces[0].stringValue = NYA nivån
//   user     riktig användare med nickname och displayId
//
// Fem exemplar, identisk struktur, nivåer 32 / 18 / 10 / 19 / 11. Den behöver ingen baslinje, kan
// inte missa en tittare som setts en gång, och fyrar exakt en gång per höjning.
//
// DEN MINSTA MÖJLIGA ÄNDRINGEN. Molnet har REDAN ett kontrakt för stämpeln — `hojning()` i
// server/event-bus.js validerar `{from,to}` — och klienten läser den redan
// (fan-level-session.js:93). Ingen ny fältform behövs, bara att `cloudEvent` bär den befintliga
// stämpeln och att typen släpps fram. Klienten rörs inte alls.
//
// RÖTT NU: normalizer.js har ingen fansUppgradering, och cloudEvent bär ingen fanLevelUp.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const N = require('../normalizer.js');

const ROT = path.join(__dirname, '..', '..');
const BRIDGE = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');

// ---- de fem verkliga payloaderna ur inspelningen 2026-09-01 --------------------------------------

const uppgradering = (niva, over = {}) => Object.assign({
  subType: 'fans_upgrade',
  scene: 'fans_upgrade',
  common: { method: 'WebcastBarrageMessage', msgId: '768065', roomId: '768065' },
  content: {
    key: 'pm_mt_fan_live_upgrade_bullet',
    defaultPattern: 'reached member Lv.{0:string}',
    pieces: [{ type: 1, stringValue: String(niva) }]
  },
  user: { id: 'id#162497c2', displayId: 'lisa', nickname: 'Lisa',
    avatarThumb: { urlList: ['https://cdn/a.jpg'] } }
}, over);

const UPPMATTA_NIVAER = [32, 18, 10, 19, 11];

// ---- 1. nivån plockas ut --------------------------------------------------------------------------

test('alla fem uppmätta höjningar läses rätt', () => {
  assert.equal(typeof N.fansUppgradering, 'function',
    'normalizer.js exporterar ingen fansUppgradering');
  for (const niva of UPPMATTA_NIVAER) {
    const f = N.fansUppgradering(uppgradering(niva));
    assert.ok(f, `nivå ${niva} gav inget event`);
    assert.equal(f.fanLevelUp.to, niva, `nivån lästes fel för ${niva}`);
    assert.equal(f.fanLevelUp.from, niva - 1, 'från-nivån är inte till-nivån minus ett');
  }
});

test('användaren följer med', () => {
  const f = N.fansUppgradering(uppgradering(32));
  assert.equal(f.username, 'lisa', 'utan username avvisar molnets ingest eventet med 400');
  assert.equal(f.name, 'Lisa');
});

test('fanClubLevel sätts också — annars ignorerar klienten stämpeln', () => {
  // KRITISKT OCH LATT ATT MISSA. fan-level-session.js hantera() borjar med `const niva = nivaAv(e);
  // if (!niva) return;` — den lamnar direkt om eventet saknar teamLevel/fanClubLevel, OCH DA LASES
  // STAMPELN ALDRIG. Ett event med bara fanLevelUp hade darfor varit helt tyst.
  const f = N.fansUppgradering(uppgradering(32));
  assert.equal(f.fanClubLevel, 32, 'utan fanClubLevel läser klienten aldrig stämpeln');
});

// ---- 2. bara äkta höjningar ------------------------------------------------------------------------

test('en annan BARRAGE-subtyp ger ingenting', () => {
  for (const st of ['guardian_entrance', 'fans_entrance', 'user_level_entrance',
    'guardian_shield_card_used']) {
    assert.equal(N.fansUppgradering(uppgradering(32, { subType: st, scene: st })), null,
      `${st} tolkades som en nivåhöjning`);
  }
});

test('nivå 1 ger ingen stämpel — molnet kräver from >= 1', () => {
  // hojning() i server/event-bus.js kraver fran >= 1. For niva 1 blir fran 0 och stampeln kastas
  // dar. Battre att inte skicka den alls an att skicka nagot molnet tyst slanger.
  assert.equal(N.fansUppgradering(uppgradering(1)), null);
});

test('orimliga och trasiga nivåer ger ingenting', () => {
  for (const v of ['', 'abc', '0', '-3', '51', '999', null, undefined]) {
    const p = uppgradering(32);
    p.content.pieces = [{ type: 1, stringValue: v }];
    assert.equal(N.fansUppgradering(p), null, `${JSON.stringify(v)} slapp igenom`);
  }
  assert.equal(N.fansUppgradering({ subType: 'fans_upgrade', content: {} }), null);
  assert.equal(N.fansUppgradering(undefined), null);
});

test('nivå 50 släpps igenom, 51 gör det inte', () => {
  assert.equal(N.fansUppgradering(uppgradering(50)).fanLevelUp.to, 50);
  assert.equal(N.fansUppgradering(uppgradering(51)), null);
});

// ---- 3. molnets befintliga kontrakt --------------------------------------------------------------

test('stämpeln passerar molnets RIKTIGA cleanEvent, inte en kopia av reglerna', () => {
  // Provet anropar molnets egen cleanEvent i stallet for att kopiera dess regler eller eval:a
  // utbruten kallkod. Andras kontraktet i server/event-bus.js faller det har direkt, och det ar
  // hela poangen: bryggan och molnet maste vara oense om ingenting.
  const { cleanEvent } = require(path.join(ROT, 'server/event-bus.js'));
  for (const niva of UPPMATTA_NIVAER) {
    const kropp = N.cloudEvent('e' + niva, 'fanlevelup', N.fansUppgradering(uppgradering(niva)));
    const ut = cleanEvent(kropp);
    assert.deepEqual(ut.fanLevelUp, { from: niva - 1, to: niva },
      `molnet kastade stämpeln för nivå ${niva}`);
    assert.equal(ut.fanClubLevel, niva, 'molnet tappade fanClubLevel — klienten läser aldrig stämpeln');
    assert.equal(ut.type, 'fanlevelup', 'typen överlevde inte cleanEvent');
  }
});

test('molnet kastar en stämpel som inte är en höjning', () => {
  // Vakten at andra hallet: skickar bryggan nagon gang skrap ska molnet slanga det, inte vidare-
  // befordra en falsk hojning till widgeten.
  const { cleanEvent } = require(path.join(ROT, 'server/event-bus.js'));
  const kropp = N.cloudEvent('e0', 'fanlevelup', N.fansUppgradering(uppgradering(32)));
  for (const trasig of [{ from: 5, to: 5 }, { from: 9, to: 3 }, { from: 0, to: 1 }, null]) {
    const ut = cleanEvent({ ...kropp, fanLevelUp: trasig });
    assert.equal(ut.fanLevelUp, undefined, `molnet slapp igenom ${JSON.stringify(trasig)}`);
  }
});

test('fanLevelUp överlever cloudEvent', () => {
  // Samma bugg som fanClubLevel och emote: faltet raknas fram, ser ratt ut, och stryks i molnbodyn.
  const moln = N.cloudEvent('e1', 'fanlevelup', N.fansUppgradering(uppgradering(32)));
  assert.deepEqual(moln.fanLevelUp, { from: 31, to: 32 }, 'cloudEvent strök stämpeln');
  assert.equal(moln.fanClubLevel, 32);
});

// ---- 4. bryggan och listorna -----------------------------------------------------------------------

test('bryggan skickar fanlevelup från BARRAGE-lyssnaren', () => {
  assert.match(BRIDGE, /sendEvent\('fanlevelup'/,
    "bryggan skickar inget 'fanlevelup' — typen skrivs som literal med flit");
  // EN lyssnare pa BARRAGE, inte tva: #304 la redan till en for guardian_entrance. Tva lyssnare pa
  // samma typ dubblerar arbetet och gor det latt att missa att bada finns.
  const antal = (BRIDGE.match(/connection\.on\(WebcastEvent\.BARRAGE/g) || []).length;
  assert.equal(antal, 1, `${antal} BARRAGE-lyssnare — de ska vara EN som grenar på subType`);
});

test('fanlevelup finns i alla tre listorna', () => {
  assert.equal(N.tillMolnet('fanlevelup'), true, 'TILL_MOLNET saknar fanlevelup');
  const index = fs.readFileSync(path.join(ROT, 'server/index.js'), 'utf8');
  const bus = fs.readFileSync(path.join(ROT, 'server/event-bus.js'), 'utf8');
  assert.match(index.match(/TIKTOK_INGEST_TYPES\s*=\s*new Set\(\[([^\]]*)\]/)[1], /'fanlevelup'/,
    'TIKTOK_INGEST_TYPES saknar fanlevelup — molnet svarar 400');
  assert.match(bus.match(/ALLOWED\s*=\s*new Set\(\[([^\]]*)\]/)[1], /'fanlevelup'/,
    'ALLOWED saknar fanlevelup — event-bussen kastar eventet');
  assert.doesNotMatch(index.match(/TIKTOK_ROOM_TYPES\s*=\s*new Set\(\[([^\]]*)\]/)[1], /'fanlevelup'/,
    'fanlevelup ligger i ROOM_TYPES — då slutar molnet kräva username');
});

// ---- 5. klienten rörs inte -------------------------------------------------------------------------

test('klientens befintliga stämpelväg är orörd', () => {
  // Hela poangen med den har losningen: klienten behover ingen ny kod. Faller det har provet har
  // nagon andrat vagen och stampeln nar inte fram langre.
  const klient = fs.readFileSync(path.join(ROT, 'fan-level-session.js'), 'utf8');
  assert.match(klient, /const stampel = e\.fanLevelUp;/, 'klienten läser inte längre e.fanLevelUp');
  assert.match(klient, /Number\(stampel\.to\) > Number\(stampel\.from\)/,
    'klientens stämpelvillkor har ändrats');
});
