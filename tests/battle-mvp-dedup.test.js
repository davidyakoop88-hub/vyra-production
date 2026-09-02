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

test('utan officiell lista tänder den egna räkningen som förut', () => {
  // Desktopvagen skickar ingen battle_mvp, och en match kan sakna officiell lista. Reserven far
  // inte forsvinna bara for att den auktoritativa kallan finns.
  const { skicka, traffar } = boot();
  skicka(battleStart('b1'));
  skicka(gava('lisa', 900));
  skicka(battleSlut('b1'));
  assert.equal(traffar().length, 1, 'reserven slutade fungera');
  assert.equal(traffar()[0].name, 'lisa');
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
