'use strict';
// Battle MVP ska tändas EXAKT en gång per match — och TikToks officiella lista har företräde.
//
// EFTER #312 FINNS TVÅ KÄLLOR som båda kan tända widgeten:
//
//   1. battle-mvp-session.js räknar själv: summerar coins ur gift-event under matchen och tänder
//      MVP när battleStatus läses som 'slut'. Fungerar sedan #312 gav den en riktig slutsignal.
//   2. TikToks EGNA lista i LINK_MIC_ARMIES vid battle-slut, som bryggan nu skickar som
//      `battle_mvp`. media.js routeLiveBattleEvent tänder redan på `type.includes('battle_mvp')`.
//
// UTAN DEDUPLICERING TÄNDS WIDGETEN TVÅ GÅNGER per match — en gång per källa. Och de kan ge OLIKA
// svar: klientens summa är råa coins, TikToks siffra är battle-poäng med Boosting Glove inräknad.
//
// TIKTOKS LISTA VINNER. Den är auktoritativ, komplett även om overlayen öppnades mitt i matchen,
// och den siffra tittarna faktiskt såg på skärmen. Klientens egen räkning är kvar som reserv för
// desktopvägen och för matcher där ingen officiell lista kommer.
//
// DEDUPEN NYCKLAS PÅ battleId, inte på tid. Två matcher i rad kan ligga sekunder isär, och en
// tidsbaserad spärr hade tystat den andra. battleId kommer från cloudEvent.
//
// FÄLTNAMNEN: triggerBattleMvp läser `event.name` och `event.score`. Molnet levererar `username`
// och `coins` (cloudEvent kallar det `value`, live-client.js döper om till `coins`). Triggern
// läser därför BÅDA — annars är namnet och poängen tomma på molnvägen.
//
// RÖTT NU: ingen dedup finns, och triggern läser bara name/score.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');

test.after(closeAll);

const mvpWidget = (id = 'm1') => ({
  id, type: 'templateBattleMvp', x: 10, y: 10, width: 360,
  title: 'Battle MVP', mvpName: 'ingen', mvpScore: 0, mvpDuration: 7
});

function boot() {
  const h = createDom({ state: { widgets: [mvpWidget()], projectName: 'b' } });
  h.load('overlay-sanitize.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  // ORDNINGEN SPEGLAR PRODUKTIONEN. media.js definierar triggern och routeLiveBattleEvent, och
  // laddar SEDAN battle-mvp-session.js (media.js:~880). Sessionen lindar alltsa en trigger som
  // redan finns. Stubbas triggern EFTERAT skrivs lindningen over och provet mater ingenting —
  // forsta versionen av det har provet gjorde precis det och var gront pa kod utan dedup.
  run(`window.__mvp=[];window.triggerBattleMvp=e=>{window.__mvp.push(e);return true};`);
  // media.js egen routing: den tander triggern pa battle_mvp innan sessionen ser eventet.
  run(`window.routeLiveBattleEvent=function(e){const t=String(e&&e.type||'').toLowerCase();
       if(t.includes('battle_mvp')||t==='mvp')window.triggerBattleMvp(e)};`);
  h.load('battle-mvp-session.js');
  run(`state.widgets.length=0;state.widgets.push(${JSON.stringify(mvpWidget())});`);
  return { h, skicka: e => h.window.routeLiveBattleEvent(e), traffar: () => h.window.__mvp };
}

const officiell = (battleId, name, score) => ({
  type: 'battle_mvp', battleId, name, username: name, score, coins: score,
  profileImage: 'https://cdn/a.jpg'
});
const battleStart = battleId => ({ type: 'battle', battleId, battleStatus: 'battle_started' });
const battleSlut = battleId => ({ type: 'battle', battleId, battleStatus: 'battle_finished' });
const gava = (username, coins) => ({ type: 'gift', username, coins });

// ---- 1. den officiella listan vinner ---------------------------------------------------------------

test('en match med både officiell MVP och egen räkning tänder EN gång', () => {
  const { skicka, traffar } = boot();
  skicka(battleStart('b1'));
  skicka(gava('lisa', 900));
  skicka(gava('omar', 100));
  skicka(officiell('b1', 'namn#topp', 4258));
  skicka(battleSlut('b1'));
  assert.equal(traffar().length, 1, `widgeten tändes ${traffar().length} gånger — dedupen håller inte`);
});

test('och det är TikToks siffra som visas, inte vår summa', () => {
  const { skicka, traffar } = boot();
  skicka(battleStart('b1'));
  skicka(gava('lisa', 900));
  skicka(officiell('b1', 'namn#topp', 4258));
  skicka(battleSlut('b1'));
  const t = traffar()[0];
  assert.equal(t.name || t.username, 'namn#topp', 'vår egen räkning vann över TikToks lista');
  assert.equal(Number(t.score ?? t.coins), 4258, 'råa coins visades i stället för battle-poängen');
});

test('ordningen spelar ingen roll — officiell MVP efter slutsignalen dedupas också', () => {
  // LINK_MIC_ARMIES och LINK_MIC_BATTLE FINISH kom inom samma sekund i den uppmatta sandningen.
  // Vilken som nar klienten forst ar inte garanterat.
  const { skicka, traffar } = boot();
  skicka(battleStart('b1'));
  skicka(gava('lisa', 900));
  skicka(battleSlut('b1'));
  skicka(officiell('b1', 'namn#topp', 4258));
  assert.equal(traffar().length, 1, `widgeten tändes ${traffar().length} gånger`);
});

// ---- 2. reserven finns kvar --------------------------------------------------------------------------

test('utan officiell lista tänder den egna räkningen som förut', async () => {
  // Desktopvagen skickar ingen battle_mvp, och en match kan sakna officiell lista. Reserven far
  // inte forsvinna bara for att den auktoritativa kallan finns.
  //
  // Den VANTAR numera FACIT_NADTID_MS pa facit innan den tands — se racet nedan. Provet maste
  // darfor vanta ut nadtiden; en synkron kontroll hade sett noll traffar och sett ut som en
  // regression.
  const { skicka, traffar } = boot();
  skicka(battleStart('b1'));
  skicka(gava('lisa', 900));
  skicka(battleSlut('b1'));
  assert.equal(traffar().length, 0, 'den harledda tande direkt — da hinner facit aldrig fore');
  await new Promise(r => setTimeout(r, 1400));
  assert.equal(traffar().length, 1, 'reserven slutade fungera');
  assert.equal(traffar()[0].name, 'lisa');
});

test('FACIT VINNER aven nar det kommer EFTER den egna rakningen', async () => {
  // KAPPLOPNINGEN. Uppmatt over 13 matcher i en skarp sandning 2026-09-06: TikToks battle_mvp kom
  // mellan 809 ms FORE och 3 ms EFTER klientens egen stang(), median 1 ms fore. Vem som vann
  // avgjordes alltsa av slumpen — och i 2 av 13 matcher pekade kallorna pa OLIKA person, med
  // TikToks MVP pa plats 2 hos oss. Det ar #368.
  //
  // Orsaken till att de skiljer sig: TikTok viktar gavor i boost-fonstret. Uppmatta kvoter mellan
  // var summa och deras poang lag mellan 1,17 och 5,00 — ingen konstant vi kan rakna oss till.
  const { skicka, traffar } = boot();
  skicka(battleStart('b1'));
  skicka(gava('lisa', 900));      // var rakning skulle valja lisa
  skicka(battleSlut('b1'));       // ... och kor nu i vanteläge
  skicka(officiell('b1', 'mira', 4200));   // facit sager mira
  assert.equal(traffar().length, 1, 'facit tande inte direkt');
  assert.equal(traffar()[0].name, 'mira', 'den egna rakningen vann over facit');
  await new Promise(r => setTimeout(r, 1400));
  assert.equal(traffar().length, 1, 'den harledda tande efterat — widgeten blinkar tva ganger');
  assert.equal(traffar()[0].name, 'mira');
});

// ---- 3. dedupen nycklas på battleId ------------------------------------------------------------------

test('två matcher i rad ger två alerts', () => {
  // En tidsbaserad sparr hade tystat den andra matchen: de tva uppmatta lag sex minuter isar, men
  // ingenting hindrar tva i snabb foljd.
  const { skicka, traffar } = boot();
  skicka(battleStart('b1'));
  skicka(officiell('b1', 'namn#ett', 100));
  skicka(battleSlut('b1'));
  skicka(battleStart('b2'));
  skicka(officiell('b2', 'namn#tva', 200));
  skicka(battleSlut('b2'));
  assert.equal(traffar().length, 2, `${traffar().length} alerts för två matcher`);
  assert.deepEqual([...traffar()].map(t => t.name || t.username), ['namn#ett', 'namn#tva']);
});

test('samma battleId två gånger tänder bara en gång', () => {
  const { skicka, traffar } = boot();
  skicka(officiell('b1', 'namn#topp', 4258));
  skicka(officiell('b1', 'namn#topp', 4258));
  assert.equal(traffar().length, 1, 'ett upprepat event tände widgeten igen');
});

test('en officiell MVP utan battleId tänder ändå — men dedupas inte bort', () => {
  // Hellre en alert for mycket an ingen alls om battleId nagon gang saknas.
  const { skicka, traffar } = boot();
  skicka({ type: 'battle_mvp', name: 'namn#x', score: 5, username: 'namn#x', coins: 5 });
  assert.equal(traffar().length, 1);
});

// ---- 4. fältnamnen från molnvägen ---------------------------------------------------------------------

test('triggern läser molnets fältnamn lika väl som sina egna', () => {
  // Molnet levererar username och coins; triggern var skriven for name och score. Utan bada blir
  // namnet och poangen TOMMA pa molnvagen — widgeten tands men visar forra matchens varden.
  const kalla = las('media.js');
  const rad = kalla.split('\n').find(l => l.includes('function triggerBattleMvp'));
  assert.ok(rad, 'hittade inte triggerBattleMvp');
  assert.match(rad, /event\.name\s*\|\|\s*event\.username/,
    'triggern läser inte event.username — namnet blir tomt på molnvägen');
  assert.match(rad, /event\.score\s*\?\?\s*event\.coins/,
    'triggern läser inte event.coins — poängen blir tom på molnvägen');
});

test('teardown: dedupen glöms vid sessionsslut', () => {
  // Annars arver nasta konto forra kontots battleId:n, och en match med samma id hade tystats.
  const { h, skicka, traffar } = boot();
  skicka(officiell('b1', 'namn#topp', 100));
  assert.equal(traffar().length, 1);
  h.window.dispatchEvent(new h.window.Event('vyra-session-ended'));
  skicka(officiell('b1', 'namn#topp', 100));
  assert.equal(traffar().length, 2, 'dedupen överlevde sessionens slut');
});

// ---- 4. Like Fountain: pulsen och nivan far inte dela timer -------------------------------------
// Inte samma widget, men samma sandning och samma slags fel: en tidsgrans satt sa nara verkligheten
// att den slog om hela tiden. Provet bor har for att bada fynden kommer ur samma inspelning och ska
// hittas tillsammans om nagon backar ut dem.
//
// UPPMATT 2026-09-06, 4 651 likes over 109 minuter:
//   avstand mellan likes-handelser  p25 805 ms   median 857 ms   p75 1 672 ms   p90 2 491 ms
//   timern var 900 ms  ->  2 198 av 4 650 luckor (47,3 %) var LANGRE an timern
// Widgeten slocknade och tandes igen nastan varannan like. #369
test('Like Fountain: nivans halltid ligger over det uppmatta p90-avstandet', () => {
  const src = las('media.js');
  const m = src.match(/const LF_PULS_MS=(\d+),LF_HALL_MS=(\d+);/);
  assert.ok(m, 'LF_PULS_MS/LF_HALL_MS hittades inte i media.js — har wrappern skrivits om?');
  const puls = Number(m[1]), hall = Number(m[2]);

  const P90_UPPMATT_MS = 2491;
  assert.ok(hall > P90_UPPMATT_MS,
    `halltiden ${hall} ms ligger inte over uppmatt p90 (${P90_UPPMATT_MS} ms) — nivan slocknar ` +
    'mellan normala likes och widgeten glappar igen');
  assert.ok(hall > puls * 2,
    `halltiden ${hall} ms ar inte mycket langre an pulsen ${puls} ms — da gor de samma jobb igen`);
});

test('Like Fountain: pulsen river bara react-klassen, inte nivaklasserna', () => {
  // Den tvingade reflowen (`void root.offsetWidth`) behovs for att starta om CSS-animationen, men
  // den ska galla ETT tillstand. Rivs nivaklasserna med varje like ar man tillbaka i glappet aven
  // med ratt halltid.
  const src = las('media.js');
  const i = src.indexOf('triggerLikeFountainPop=function');
  assert.ok(i > -1, 'wrappern hittades inte');
  const fn = src.slice(i, i + 1600);
  assert.match(fn, /classList\.remove\('lf-live-react'\)/,
    'pulsen river inte react-klassen — animationen startar inte om');
  assert.doesNotMatch(fn, /classList\.remove\('lf-live-low','lf-live-mid','lf-live-high','lf-live-react'\)/,
    'pulsen river fortfarande nivaklasserna tillsammans med react — det var buggen');
});
