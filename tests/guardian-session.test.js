'use strict';
// Guardian Emblem ska tändas när en Guardian kommer in.
//
// VARFÖR PROVET SER UT SÅ HÄR. tests/guardian-emblem-fas.test.js och browsertestet var båda gröna
// medan widgeten var död i drift, för att de anropar `triggerGuardianEmblem` DIREKT. Det bevisar
// att grafiken fungerar när någon tänder den — inte att någon tänder den. Exakt samma blinda fläck
// som gömde Fan Level Up, Gifter Level Up, Battle MVP och Gift Fireworks.
//
// Det här provet rör därför aldrig triggern. Det skickar ett LIVEEVENT genom
// `routeLiveBattleEvent` — samma väg live-client.js:138 använder för varje event från molnet — och
// mäter att triggern blev anropad. Fejkar man triggern och kallar den själv mäter man ingenting.
//
// GRÄNSEN MOT BRYGGAN. Del A (bryggan skickar typen 'guardian') är blockerad på en uppmätt payload
// från en skarp sändning; se "GUARDIAN — FORBEREDD" i tiktok-bridge/bridge.js. Det här är del B:
// klienten, som kan byggas och bevisas mot ett event vi konstruerar själva. Provet påstår därför
// INGENTING om vilket TikTok-fält som bär statusen — bara att när typen kommer, tänds emblemet.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.after(closeAll);

const guardianWidget = (id = 'ge1', over = {}) => Object.assign({
  id, type: 'templateGuardianEmblem', x: 10, y: 10, width: 400, height: 480,
  title: 'Guardian Emblem', guardianStep: 3, guardianUsername: '@Guardian'
}, over);

function boot(widgets = [guardianWidget()]) {
  const h = createDom({ state: { widgets, projectName: 'g' } });
  h.load('overlay-sanitize.js');
  h.load('guardian-session.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};`);
  run(`window.__g=[];window.triggerGuardianEmblem=e=>{window.__g.push(e);return true};`);
  return { h, skicka: e => h.window.routeLiveBattleEvent(e), traffar: () => h.window.__g };
}

const guardian = (username, over = {}) => ({ type: 'guardian', username, ...over });

// ---- 1. livevägen ------------------------------------------------------------------------------

test('ett guardian-event genom routeLiveBattleEvent tänder emblemet', () => {
  const { skicka, traffar } = boot();
  skicka(guardian('lisa'));
  assert.equal(traffar().length, 1, 'livevägen tände inte emblemet — triggern är fortfarande död');
  assert.equal(traffar()[0].username, 'lisa');
});

test('avsändarens profilbild följer med', () => {
  const { skicka, traffar } = boot();
  skicka(guardian('lisa', { profileImage: 'https://cdn/x.jpg' }));
  assert.equal(traffar()[0].profileImage, 'https://cdn/x.jpg');
});

test('praktsteget sätts INTE av eventet — det är ett studioval', () => {
  // Bryggan skickar med flit inget steg: streamern väljer sin praktnivå i panelen, och ett steg
  // utifrån hade tyst skrivit över den. Sessionen får inte smuggla in ett heller.
  const { skicka, traffar } = boot();
  skicka(guardian('lisa', { guardianStep: 1, step: 1, level: 4 }));
  assert.equal(traffar()[0].guardianStep, undefined, 'eventet skrev över streamerns praktsteg');
  assert.equal(traffar()[0].step, undefined);
});

// ---- 2. vad som INTE får tända den --------------------------------------------------------------

test('en gåva som heter Guardian Wings tänder INTE emblemet', () => {
  // TikTok har gåvan "Guardian Wings" (assets/gifts/events/0006_Guardian_Wings.png). En
  // delsträngsmatchning som blandar in gåvonamnet hade tänt emblemet för varje såld gåva.
  const { skicka, traffar } = boot();
  skicka({ type: 'gift', username: 'lisa', giftName: 'Guardian Wings', count: 1 });
  assert.equal(traffar().length, 0, 'gåvonamnet läckte in i typmatchningen');
});

test('vanliga eventtyper tänder inte emblemet', () => {
  const { skicka, traffar } = boot();
  for (const type of ['chat', 'gift', 'like', 'follow', 'share', 'subscribe', 'member', 'viewer', 'battle']) {
    skicka({ type, username: 'lisa' });
  }
  assert.equal(traffar().length, 0);
});

test('ett guardian-event utan avsändare tänder inte emblemet', () => {
  const { skicka, traffar } = boot();
  skicka({ type: 'guardian' });
  assert.equal(traffar().length, 0, 'en alert utan namn har ingenting att visa');
});

// ---- 3. spärren ---------------------------------------------------------------------------------

test('en skur av samma guardian ger EN alert — det är dubblettleverans, inte återkomst', () => {
  // KÖN MÅSTE MÄTAS, INTE BARA SPELNINGARNA. Ett första utkast av det här provet läste bara
  // traffar().length — och det är 1 även utan spärr, eftersom de trettionio andra då ligger och
  // väntar i kön i stället för att ha spelats. Mutationsprovet (spärren borttagen) förblev grönt.
  // Summan spelade + köade är det enda tal som faktiskt räknar hur många alerts som skapades.
  const { skicka, traffar, h } = boot();
  for (let i = 0; i < 40; i++) skicka(guardian('lisa'));
  assert.equal(traffar().length, 1, 'fler än en alert spelades för samma guardian');
  assert.equal(h.window.VyraGuardian.koLangd(), 0,
    'spärren släppte igenom upprepningar — de ligger i kön och spelas efter varandra');
});

test('samma Guardian som kommer TILLBAKA senare firas igen', () => {
  // DET HÄR ÄR BUGGEN DAVID SÅG I SKARP SÄNDNING 2026-09-05.
  //
  // Spärren var tidigare evig — en Set med "redan firad denna sändning". Den byggdes som en
  // gardering: om Guardian-statusen bars av VARJE event från tittaren hade fyrtio chattrader gett
  // fyrtio alerts. Filens egen kommentar sa att spärren "kostar ingenting" om det i stället visade
  // sig vara en engångshändelse.
  //
  // Den kostade något. Inspelning 2026-09-05T2111 (28 minuter, 176 chattrader, 373 member-event)
  // bar exakt TVÅ guardian-händelser: samma person, 19:14:28 och 19:23:50, nio minuter isär, båda
  // med scene='guardian_entrance'. Vore statusen ett rollfält hade vi sett hundratals. Den andra
  // entrén tändes aldrig.
  const { skicka, traffar, h } = boot();
  let nu = 1_000_000;
  h.window.Date.now = () => nu;

  skicka(guardian('lisa'));
  assert.equal(traffar().length, 1, 'första entrén ska tända');

  nu += 9 * 60 * 1000;                 // nio minuter, som i den uppmätta sändningen
  skicka(guardian('lisa'));
  assert.equal(traffar().length + h.window.VyraGuardian.koLangd(), 2,
    'återkomsten svaldes — det är exakt buggen: en Guardian som kommer in igen ska firas igen');
});

test('olika Guardians firas var för sig', () => {
  const { skicka, traffar, h } = boot();
  skicka(guardian('lisa'));
  skicka(guardian('omar'));
  assert.equal(traffar().length, 1, 'båda spelades samtidigt');
  assert.equal(h.window.VyraGuardian.koLangd(), 1);
  h.window.VyraGuardian.nastaNu();
  assert.deepEqual([...traffar()].map(t => t.username), ['lisa', 'omar']);
});

// ---- 4. kön -------------------------------------------------------------------------------------

test('kön töms i ankomstordning', () => {
  const { skicka, traffar, h } = boot();
  for (const n of ['a', 'b', 'c']) skicka(guardian(n));
  h.window.VyraGuardian.nastaNu();
  h.window.VyraGuardian.nastaNu();
  assert.deepEqual([...traffar()].map(t => t.username), ['a', 'b', 'c']);
});

test('en skur på tjugo tappar ingenting', () => {
  const { skicka, h } = boot();
  for (let i = 0; i < 20; i++) skicka(guardian('u' + i));
  assert.equal(h.window.VyraGuardian.koLangd(), 19);
  assert.equal(h.window.VyraGuardian.kastade(), 0);
});

test('nödbromsen är lokal, hög och loggad', () => {
  const src = las('guardian-session.js');
  const tak = src.match(/NODBROMS\s*=\s*(\d+)/);
  assert.ok(tak && Number(tak[1]) >= 100, 'nödbromsen saknas eller ligger för lågt');
  assert.match(src, /console\.warn/);
});

test('global köpolicy är orörd', () => {
  const src = las('runtime-controls.js');
  assert.match(src, /MAX_VANTANDE\s*=\s*10/);
  assert.match(src, /MAX_ALDER\s*=\s*30000/);
});

test('visningstiden speglar koreografins längd', () => {
  // Triggern i media.js tar ned alerten efter max(VyraGuardianEmblemFas.total(), 6500). Släpper kön
  // tidigare spelar två emblem ovanpå varandra.
  const { h } = boot();
  const src = las('guardian-session.js');
  assert.match(src, /VyraGuardianEmblemFas/, 'visningstiden frågar inte koreografin');
  assert.match(src, /6500/, 'golvet på 6500 ms saknas — samma tal som triggern använder');
  assert.ok(h.window.VyraGuardian, 'sessionen exponerar inget API');
});

// ---- 5. teardown --------------------------------------------------------------------------------

test('vyra-session-ended glömmer spärren och tömmer kön — nästa konto ärver ingenting', () => {
  const { skicka, traffar, h } = boot();
  for (const n of ['a', 'b', 'c']) skicka(guardian(n));
  assert.ok(h.window.VyraGuardian.koLangd() > 0, 'riggen fyllde ingen kö — provet mäter inget');
  h.window.dispatchEvent(new h.window.Event('vyra-session-ended'));
  assert.equal(h.window.VyraGuardian.koLangd(), 0, 'kön överlevde sessionens slut');
  assert.equal(h.window.VyraGuardian.spelar(), false, 'spelar-flaggan överlevde sessionens slut');
  // Och spärren är glömd: 'a' får firas igen i den nya sessionen.
  const fore = traffar().length;
  skicka(guardian('a'));
  assert.equal(traffar().length, fore + 1,
    'spärren överlevde sessionens slut — a kunde inte firas i det nya kontot');
});

// ---- 6. monteringen -----------------------------------------------------------------------------

test('filen laddas av media.js med cachebust', () => {
  // En fil som ingen laddar är lika död som en trigger ingen anropar. Syskonfilerna monteras
  // samma väg, och utan ?v= serverar Caddy en cachad gammal kopia.
  const src = las('media.js');
  const rad = src.split('\n').find(l => l.includes('guardian-session.js'));
  assert.ok(rad, 'media.js laddar inte guardian-session.js — filen når aldrig sidan');
  assert.match(rad, /guardian-session\.js\?v=/, 'cachebust saknas på guardian-session.js');
});

test('sessionen är registrerad i domankartan', () => {
  const dom = JSON.parse(las('.claude/domaner.json'));
  const alla = JSON.stringify(dom);
  assert.match(alla, /guardian-session\.js/, 'filen saknas i .claude/domaner.json');
  assert.match(alla, /tests\/guardian-session\.test\.js/, 'provet saknas i .claude/domaner.json');
});
