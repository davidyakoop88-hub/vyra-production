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

// Sedan 2026-09-06 bor oversattningen i cloud-fields.js, inte i live-client.js. Vakten laser
// darfor DEN filen. Att ingen konsument har kvar en egen kopia bevakas i
// tests/molnfalt-en-kalla.test.js.
const FALT = read('cloud-fields.js');
for (const [cloudName, widgetName] of RENAMES) {
  test(`${cloudName} oversatts till ${widgetName} innan en widget ser eventet`, () => {
    const start = FALT.indexOf('function normalizeCloudFields');
    assert.ok(start > -1, 'cloud-fields.js har ingen normalizeCloudFields');
    // Klammermatchning i stallet for ett teckenfonster, av samma skal som cleanEventShape ovan.
    let djup = 0, slut = -1;
    for (let k = FALT.indexOf('{', start); k < FALT.length; k++) {
      if (FALT[k] === '{') djup++;
      else if (FALT[k] === '}' && --djup === 0) { slut = k + 1; break }
    }
    assert.ok(slut > -1, 'normalizeCloudFields ar inte balanserad');
    const fn = FALT.slice(start, slut);
    assert.match(fn, new RegExp(widgetName + '[^\n]*' + cloudName),
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

// ---- battleId måste överleva HELA vägen ---------------------------------------------------------
//
// DAVID I DRIFT 2026-09-05: två MVP-alerts per match.
//
// Dedupen fanns och var korrekt — battle-mvp-session.js håller en `annonserade`-mängd nycklad på
// battleId, provad i tests/battle-mvp-dedup.test.js med nio gröna prov. Men den fick aldrig någon
// nyckel från klientens egen räkning: `battleFields` i normalizer.js satte inte fältet, så
// `oppna(e.battleId)` fick undefined och sessionens id var alltid tomt. Dedupen släpper med flit
// igenom ett event utan id, så den egna fyrningen kom alltid fram.
//
// INGET PROV FÅNGADE DET, och det är hela skälet till att den här vakten finns. Klientprovets
// fixtur skickar `{ type: 'battle', battleId, ... }` — ett battle-event MED battleId, ett fält
// bryggan aldrig satte. Provet var grönt mot en payload som inte existerade i verkligheten.
//
// Vakten mäter därför inte en omdöpning som RENAMES ovan, utan att fältet finns i VARJE led.
// Försvinner det ur ett av dem faller provet här, i stället för att synas som en dubbel alert i en
// sändning tre veckor senare.
const NORMALIZER = read('tiktok-bridge/normalizer.js');
const MVP_SESSION = read('battle-mvp-session.js');

// KROPPEN, INTE ETT TECKENFONSTER. De tva forsta leden mattes med /{0,900}?/ och /{0,600}?/ fram
// till 2026-09-07 — och da foll vakten, inte for att battleId forsvunnit utan for att en ny
// KOMMENTAR ovanfor sköt faltet utanfor fonstret. Det ar samma fel som cleanEventShape() hogre upp
// i filen redan beskriver: "ett fast fonster ... foll ut sa fort en kommentar pa sex rader lades
// till ovanfor det". Losningen finns alltsa redan i filen; den var bara inte tillampad har.
//
// Klammermatchning har ingen sadan glidning: den slutar dar funktionen slutar, oavsett hur mycket
// text som star framfor faltet.
function funktionskropp(src, namn) {
  const start = src.indexOf('function ' + namn);
  if (start < 0) return '';
  let djup = 0;
  for (let k = src.indexOf('{', start); k < src.length; k++) {
    if (src[k] === '{') djup++;
    else if (src[k] === '}' && --djup === 0) return src.slice(start, k + 1);
  }
  return '';
}

test('battleId överlever bryggan, molnet och klienten', () => {
  const led = [
    ['tiktok-bridge/normalizer.js battleFields', /battleId:/, funktionskropp(NORMALIZER, 'battleFields')],
    ['tiktok-bridge/normalizer.js mvpFields', /battleId:/, funktionskropp(NORMALIZER, 'mvpFields')],
    ['server/event-bus.js cleanEvent', /battleId/, BUS],
    ['battle-mvp-session.js läser det', /oppna\(e\.battleId\)/, MVP_SESSION],
    ['battle-mvp-session.js dedupar på det', /annonserade\.(has|add)\(bid\)/, MVP_SESSION],
  ];
  const saknas = led.filter(([, m, kalla]) => !m.test(kalla)).map(([namn]) => namn);
  assert.deepEqual(saknas, [],
    'dessa led tappar battleId — MVP tänds då två gånger per match: ' + saknas.join(', '));
});

// ---- SOMVAKTEN: allt baseUser raknar fram maste NA molnet ------------------------------------
// Bakgrunden ar #349. Sex falt raknades fram vid kallan och stod inte i cloudEvent-litteralen, sa
// de fanns inte for nagon molnanvandare — medan desktopvagen har en EGEN vitlista och darfor bar
// nagra av dem. Samma widget betedde sig alltsa olika beroende pa hur streamern anslutit.
//
// De tidigare proven pa den har filen provar NAMNGIVNA falt: nagon maste komma pa att skriva ett
// prov for just det falt som glomts. Vakten nedan vander pa det och kraver att VARJE falt
// baseUser producerar antingen nar molnet, ar en dokumenterad omdopning, eller star uttryckligen
// uppraknat som medvetet tappat. Ett nytt falt i baseUser faller alltsa har tills nagon tagit
// stallning till det.
const OMDOPTA_TILL_MOLNET = { profileImage: 'profileUrl' };
// Medvetet tappade falt hor hemma har, MED SKAL. Listan ar tom i dag; det ar meningen.
const MEDVETET_TAPPADE = {};

test('SOMVAKT: varje falt baseUser raknar fram nar molneventet', () => {
  const normalizer = require(path.join(__dirname, '..', 'tiktok-bridge/normalizer.js'));
  // Alla flaggor sanna, alla nivaer satta: ett falt far inte "saknas" bara for att det ar falsigt.
  const bas = normalizer.baseUser({
    user: { userId: 'u1', uniqueId: 'mia', nickname: 'Mia',
            avatarLarger: { urlList: ['https://img/a.jpg'] },
            fansClub: { data: { level: 7 } }, payGrade: { level: 12 } },
    userIdentity: { isModeratorOfAnchor: true, isSubscriberOfAnchor: true, isFollowerOfAnchor: true },
  });
  const moln = normalizer.cloudEvent('e1', 'gift', bas);

  const saknade = Object.keys(bas).filter(f => {
    if (f in moln) return false;
    if (OMDOPTA_TILL_MOLNET[f] && OMDOPTA_TILL_MOLNET[f] in moln) return false;
    return !(f in MEDVETET_TAPPADE);
  });
  assert.deepEqual(saknade, [],
    `baseUser raknar fram falt som cloudEvent inte bar: ${saknade.join(', ')} — de finns inte for ` +
    'nagon molnanvandare. Lagg dem i litteralen, eller i MEDVETET_TAPPADE med ett skal.');

  // Omdopningarna maste dessutom BARA vardet, inte bara nyckeln.
  for (const [fran, till] of Object.entries(OMDOPTA_TILL_MOLNET)) {
    assert.equal(moln[till], bas[fran], `omdopningen ${fran} -> ${till} tappar vardet`);
  }
});

test('cleanEvent bar falten fran #349', () => {
  const shape = cleanEventShape();
  for (const field of ['name', 'diamonds', 'isAnonymous', 'isModerator', 'isFollower', 'isSubscriber']) {
    // Ingen regex har med flit: nyckeln ska sta som en EGEN rad i litteralen, inte som en
    // delstrang nagonstans. Det ar ocksa en skarpare vakt an ett ordgransmonster.
    assert.ok(shape.split(String.fromCharCode(10)).some(rad => rad.trim().startsWith(field + ':')),
      `cleanEvent tappar faltet ${field}`);
  }
});
