'use strict';
// LAGER 2 — kontraktstest for eventschemat.
//
// Specen bad om "validera att webb och desktop anvander samma schema". I VYRA ar det inte den
// axeln som kan glida isar: desktop kor SAMMA studio-kod, hamtad live fran vyralive.app
// (electron-app/local-server.js). Ett schema kan darfor inte skilja sig mellan dem.
//
// Axeln som FAKTISKT har gatt sonder ar producent -> konsument:
//
//   tiktok-bridge/bridge.js   skickar raa typer och falt
//   server/event-bus.js       cleanEvent() slappar igenom, byter namn och kastar resten
//   live-client.js            normalizeCloudFields() byter tillbaka namnen
//   widgetarna                laser de slutliga namnen
//
// Det har gatt fel tidigare pa exakt det stallet: molnet skickar `profileUrl` och `value`, medan
// widgetarna laser `profileImage` och `coins`. Chattexten foll bort helt eftersom bryggan lade den
// pa `name`, som cleanEvent inte bar. Testet nedan later inte det ske tyst igen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const BRIDGE = read('tiktok-bridge/bridge.js');
const BUS = read('server/event-bus.js');
const CLIENT = read('live-client.js');

// ---- typerna maste mota varandra -------------------------------------------------------------------
function bridgeTypes() {
  // Bryggan skickar bade literaler och en ternar for chat/chatcommand — bada raknas.
  const out = new Set();
  for (const [, t] of BRIDGE.matchAll(/sendEvent\('([a-z_]+)'/g)) out.add(t);
  for (const [, t] of BRIDGE.matchAll(/\?\s*'([a-z]+)'\s*:\s*'([a-z]+)'/g)) out.add(t);
  for (const [, , t] of BRIDGE.matchAll(/\?\s*'([a-z]+)'\s*:\s*'([a-z]+)'/g)) out.add(t);
  return out;
}
function cloudAllowed() {
  const m = BUS.match(/ALLOWED\s*=\s*new Set\(\[([^\]]*)\]/);
  assert.ok(m, 'hittade ingen ALLOWED-lista i server/event-bus.js');
  // [a-z_] OCH INTE [a-z]: typen 'battle_mvp' innehaller ett understreck och foll ur listan
  // helt. Provet rapporterade da att molnet KASTAR en typ som stod i ALLOWED tio rader bort —
  // ett fel i vaktens egen parser som ser ut som ett fel i koden.
  return new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]));
}
function aliases() {
  const m = BUS.match(/TYPE_ALIASES\s*=\s*\{([^}]*)\}/);
  assert.ok(m, 'hittade ingen TYPE_ALIASES i server/event-bus.js');
  return Object.fromEntries([...m[1].matchAll(/([a-z]+)\s*:\s*'([a-z]+)'/g)].map(x => [x[1], x[2]]));
}

test('varje typ bryggan skickar tas emot av molnet', () => {
  const allowed = cloudAllowed(), alias = aliases();
  const orphans = [...bridgeTypes()].filter(t => !allowed.has(alias[t] || t));
  assert.deepEqual(orphans, [],
    `bryggan skickar typer molnet kastar: ${orphans.join(', ')} — de nar aldrig en widget`);
});

test('varje typ molnet slapper igenom har en producent', () => {
  const produced = new Set([...bridgeTypes()].map(t => aliases()[t] || t));
  const stranded = [...cloudAllowed()].filter(t => !produced.has(t));
  assert.deepEqual(stranded, [],
    `molnet slapper igenom typer ingen skickar: ${stranded.join(', ')} — dod kod eller tappad producent`);
});

// ---- faltnamnen maste overleva hela vagen ------------------------------------------------------------
// Molnets namn -> namnet widgetarna faktiskt laser. Varje par har brustit i produktion en gang.
const RENAMES = [
  ['profileUrl', 'profileImage'],
  ['value', 'coins']
];

function cleanEventShape() {
  // EXAKT objektlitteralen `const event={...}` — klammermatchad, inte ett teckenfonster.
  //
  // Bada de naiva varianterna ar fel, och bada har provats har:
  //   FOR SMALT  ett fast fonster pa 1600 tecken. Funktionen ar 8298 tecken pa main, sa vakten
  //              last en femtedel och lat resten ograskad. Faltet `at` foll ut ur fonstret sa
  //              fort en kommentar pa sex rader lades till ovanfor det.
  //   FOR BRETT  fram till nasta toppnivadeklaration. Nasta `function` ligger langt efter
  //              cleanEvent, sa fonstret svalde en redis-felhanterare — och en borttagen falt-
  //              rad kunde da 'hittas' i orelaterad kod. Mutationen overlevde.
  //
  // Klammermatchning har ingen sadan glidning: den slutar dar litteralen slutar.
  const start = BUS.indexOf('const event={', BUS.indexOf('function cleanEvent'));
  assert.ok(start > -1, 'hittade ingen cleanEvent-litteral i server/event-bus.js');
  let djup = 0;
  for (let k = BUS.indexOf('{', start); k < BUS.length; k++) {
    if (BUS[k] === '{') djup++;
    else if (BUS[k] === '}' && --djup === 0) return BUS.slice(start, k + 1);
  }
  assert.fail('cleanEvent-litteralen ar inte balanserad');
}

test('cleanEvent bar de falt widgetarna behover', () => {
  const shape = cleanEventShape();
  for (const field of ['id', 'type', 'username', 'comment', 'profileUrl', 'giftName', 'giftImage',
                       'count', 'value', 'diamonds', 'at']) {
    assert.match(shape, new RegExp(`\\b${field}\\s*:`), `cleanEvent tappar faltet ${field}`);
  }
});

for (const [cloudName, widgetName] of RENAMES) {
  test(`${cloudName} oversatts till ${widgetName} innan en widget ser eventet`, () => {
    const fn = CLIENT.slice(CLIENT.indexOf('function normalizeCloudFields'),
                            CLIENT.indexOf('function normalizeCloudFields') + 400);
    assert.match(fn, new RegExp(`${widgetName}[^\\n]*${cloudName}`),
      `molnets ${cloudName} nar aldrig fram som ${widgetName} — faltet blir tomt i widgeten`);
  });
}

test('gaven bar bade summa och antal, och de blandas inte ihop', () => {
  // tiktok-bridge/normalizer.js: coins = varde per gava * repeatCount, count = repeatCount.
  // Blandas de ihop mater Top Gift och Top Streak samma sak — vilket ar precis bugg A2.
  const norm = read('tiktok-bridge/normalizer.js');
  assert.match(norm, /coins:\s*coinsEach\s*\*\s*repeatCount/, 'coins ar inte summan');
  assert.match(norm, /count:\s*repeatCount/, 'count ar inte combolangden');
});

test('inget falt tappas mellan bryggans gava och molnets event', () => {
  const norm = read('tiktok-bridge/normalizer.js');
  const giftFields = ['giftId', 'giftName', 'giftImage', 'coins', 'count'];
  for (const f of giftFields) {
    assert.match(norm, new RegExp(`\\b${f}\\s*:`), `bryggan skickar inte ${f}`);
  }
  // coins heter value i molnet — den oversattningen ar redan tackt av RENAMES ovan.
  for (const f of ['giftId', 'giftName', 'giftImage', 'count']) {
    assert.match(BUS, new RegExp(`\\b${f}\\s*:`), `molnet tappar ${f}`);
  }
});

// ---- fan-nivan maste overleva molnvagen --------------------------------------------------------
// tiktok-bridge/normalizer.js raknar fram fanClubLevel i baseUser, och live-client.js laser
// teamLevel||fanClubLevel. Daremellan strok cleanEvent faltet helt, sa pa molnvagen blev nivan 0 -
// och Fan Level Up-widgetens eget gate, (w.fanLevel||0) < (w.minLevel||1), gjorde da att den aldrig
// visades ens om den triggades. Samma sorts tyst falt-tapp som chattexten en gang hade.
test('cleanEvent bar fan-nivan', () => {
  const shape = cleanEventShape();
  assert.match(shape, /\bfanClubLevel\s*:/,
    'molnet tappar fanClubLevel — Fan Level Up blir dod for alla molnanvandare');
});

test('molnets fan-niva accepterar bade bryggans och klientens namn', () => {
  const shape = cleanEventShape();
  const rad = shape.split('\n').find(l => /fanClubLevel\s*:/.test(l)) || '';
  assert.match(rad, /teamLevel/,
    'teamLevel ar namnet klienten redan anvander och maste tas emot ocksa');
});

// BETEENDE, INTE STRANGSOKNING. Provet har lod tidigare sa har:
//
//   assert.match(read('tiktok-bridge/normalizer.js'), /fanClubLevel\s*:/)
//
// Den sokningen traffade baseUser() pa rad 42 och var gron medan cloudEvent() pa rad 144 slangde
// faltet hundra rader senare. En strangsokning kan inte se en kaskad — den vet att raden star
// skriven, inte att vardet overlever. Uppmatt 2026-09-01 pa oandrad kod:
//
//   baseUser   fanClubLevel = 7          gifterLevel = 12
//   cloudEvent fanClubLevel = undefined  gifterLevel = undefined
//
// Provet kor darfor hela kedjan bryggan faktiskt kor: raa payload -> baseUser -> cloudEvent.
test('nivaerna overlever hela vagen fran raa payload till molnevent', () => {
  const normalizer = require(path.join(__dirname, '..', 'tiktok-bridge/normalizer.js'));
  const ra = { user: { uniqueId: 'mia', nickname: 'Mia',
    fansClub: { data: { level: 7 } }, payGrade: { level: 12 } } };
  const moln = normalizer.cloudEvent('e1', 'member', normalizer.baseUser(ra));

  assert.equal(moln.fanClubLevel, 7,
    'fanClubLevel overlevde inte cloudEvent — Fan Level Up blir dod pa molnvagen');
  assert.equal(moln.gifterLevel, 12,
    'gifterLevel overlevde inte cloudEvent — Gifter Level Up blir dod pa molnvagen');
});

test('nivaerna klamps till 50 redan i molneventet', () => {
  const normalizer = require(path.join(__dirname, '..', 'tiktok-bridge/normalizer.js'));
  const moln = normalizer.cloudEvent('e2', 'member', { fanClubLevel: 9999, gifterLevel: 9999 });

  assert.equal(moln.fanClubLevel, 50, 'ingen ovre grans pa fan-nivan i cloudEvent');
  assert.equal(moln.gifterLevel, 50, 'ingen ovre grans pa gifter-nivan i cloudEvent');
});

test('fan-nivan klamps till spannet 1-50', () => {
  // Widgeten, panelen och triggern arbetar alla i 1-50. Slapper molnet igenom 9999 far widgeten ett
  // varde den inte kan visa, och en trasig strom kan skicka vad som helst.
  const shape = cleanEventShape();
  const rad = shape.split('\n').find(l => /fanClubLevel\s*:/.test(l)) || '';
  assert.match(rad, /50/, `ingen ovre grans pa fan-nivan: ${rad.trim()}`);
});
