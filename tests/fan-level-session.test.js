'use strict';
// Fan Level Up ska tändas när en tittare faktiskt höjer sin fan-nivå.
//
// Före det här: `media.js` tände widgeten på `type.includes('fan_level')`, och bryggan publicerar
// aldrig något sådant — bara gift, like, share, subscribe, member, chat, viewer, battle, follow.
// Widgeten var alltså färdig grafik utan trigger, precis som Battle MVP.
//
// Och nivån överlevde inte molnet: server/event-bus.js cleanEvent bar varken fanClubLevel eller
// teamLevel, så på molnvägen blev nivån 0 och gatet `(w.fanLevel||0) < (w.minLevel||1)` gjorde att
// widgeten aldrig visades ens om den triggades.
//
// Modellen: TikTok rapporterar en fan-nivå på varje event från en användare. Stiger den jämfört med
// den senast sedda nivån för samma användare är det en level-up. Ingen egen nivåberäkning — bara en
// jämförelse. Första gången en användare syns lär vi oss bara nivån; utan en tidigare nivå finns
// ingen höjning att visa.
//
// Ingenting sparas: kartan över senast sedda nivåer lever i minnet och försvinner med sidan.
//
// RÖTT NU: fan-level-session.js finns inte.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const fanWidget = (id = 'fan1', over = {}) => Object.assign({
  id, type: 'templateFanLevel', x: 10, y: 10, width: 260, title: 'Fan Level Up',
  fanLevel: 12, fanName: 'HeartRiser', fanDuration: 6, minLevel: 1
}, over);

function boot(widgets = [fanWidget()]) {
  const h = createDom({ state: { widgets, projectName: 'fan' } });
  h.load('overlay-sanitize.js');
  h.load('fan-level-session.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};`);
  // Fånga varje trigger i stället för att rita — det som bevisas är UPPTÄCKTEN och kön.
  run(`window.__fan=[];window.triggerFanLevelUp=e=>{window.__fan.push(e);return true};`);
  const skicka = e => h.window.routeLiveBattleEvent(e);
  const traffar = () => h.window.__fan;
  return { h, run, skicka, traffar };
}

// Ett vanligt chattevent från en tittare, med sin rapporterade fan-nivå.
const chatt = (username, teamLevel, over = {}) => ({ type: 'chat', username, teamLevel, ...over });

// ---- 1. höjningen ------------------------------------------------------------------------------

test('nivå 3 → 4 triggar widgeten', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 3));
  skicka(chatt('lisa', 4));
  assert.equal(traffar().length, 1, 'höjningen upptäcktes inte');
  assert.equal(traffar()[0].fromLevel, 3, 'från-nivån saknas');
  assert.equal(traffar()[0].level, 4, 'till-nivån saknas');
  assert.equal(traffar()[0].name, 'lisa');
});

test('första gången en tittare syns lärs nivån bara in', () => {
  // Utan en tidigare nivå finns ingen höjning att visa. Hade vi triggat här skulle varje ny tittare
  // i chatten ge en level-up-alert direkt.
  const { skicka, traffar } = boot();
  skicka(chatt('nykomling', 7));
  assert.equal(traffar().length, 0);
});

test('oförändrad nivå triggar inte', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 5));
  skicka(chatt('lisa', 5));
  skicka(chatt('lisa', 5));
  assert.equal(traffar().length, 0);
});

test('sänkt nivå triggar inte', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 9));
  skicka(chatt('lisa', 4));
  assert.equal(traffar().length, 0, 'en sänkning är inte en level-up');
});

test('konstiga nivåvärden triggar inte', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 3));
  for (const skräp of [0, -2, NaN, null, undefined, 'fyra', Infinity, 999]) {
    skicka(chatt('lisa', skräp));
  }
  assert.equal(traffar().length, 0, `ett ogiltigt värde slank igenom: ${JSON.stringify(traffar()[0])}`);
});

test('ett hopp över flera nivåer visar hela spannet', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 3));
  skicka(chatt('lisa', 8));
  assert.equal(traffar()[0].fromLevel, 3);
  assert.equal(traffar()[0].level, 8);
});

test('varje tittare räknas för sig', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 3));
  skicka(chatt('omar', 20));
  skicka(chatt('lisa', 4));
  assert.equal(traffar().length, 1);
  assert.equal(traffar()[0].name, 'lisa', 'omars nivå påverkade lisas jämförelse');
});

test('nivån läses även när den kommer som fanClubLevel', () => {
  // Bryggan skickar fanClubLevel; live-client normaliserar till teamLevel. Triggern ska inte vara
  // beroende av att just den normaliseringen hunnit köra.
  const { skicka, traffar } = boot();
  skicka({ type: 'chat', username: 'lisa', fanClubLevel: 3 });
  skicka({ type: 'chat', username: 'lisa', fanClubLevel: 4 });
  assert.equal(traffar().length, 1);
  assert.equal(traffar()[0].level, 4);
});

test('profilbilden följer med', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 3));
  skicka(chatt('lisa', 4, { profileImage: 'https://bild/lisa.png' }));
  assert.equal(traffar()[0].profileImage, 'https://bild/lisa.png');
});

// ---- 2. nivåspannet 1–50 -----------------------------------------------------------------------

test('nivåer över 50 räknas inte', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 49));
  skicka(chatt('lisa', 51));
  assert.equal(traffar().length, 0, '51 ligger utanför spannet 1–50');
});

test('nivå 50 är fortfarande giltig', () => {
  const { skicka, traffar } = boot();
  skicka(chatt('lisa', 49));
  skicka(chatt('lisa', 50));
  assert.equal(traffar().length, 1);
  assert.equal(traffar()[0].level, 50);
});

test('panelens nivåfält håller 1–50', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'media.js'), 'utf8');
  const fält = src.match(/id="fanLevel"[^>]*/);
  assert.ok(fält, 'nivåfältet hittades inte i panelen');
  assert.match(fält[0], /min="1"/, 'nivåfältet börjar inte på 1');
  assert.match(fält[0], /max="50"/, `nivåfältet tillåter mer än 50: ${fält[0]}`);
});

// ---- 3. kön ------------------------------------------------------------------------------------

test('flera level-ups köas och visas i ordning, ingen tappas', () => {
  const { skicka, traffar, h } = boot();
  for (const namn of ['a', 'b', 'c', 'd', 'e']) skicka(chatt(namn, 3));
  for (const namn of ['a', 'b', 'c', 'd', 'e']) skicka(chatt(namn, 4));
  // Bara den första har spelats upp — resten väntar på sin tur i den lokala kön.
  assert.equal(traffar().length, 1, 'alla spelades samtidigt i stället för efter varandra');
  assert.equal(h.window.VyraFanLevel.koLangd(), 4, 'de fyra övriga köades inte');
  assert.equal(traffar()[0].name, 'a', 'ordningen är inte den de kom in i');
});

test('kön töms i ordning när varje visning är klar', () => {
  const { skicka, traffar, h } = boot();
  for (const namn of ['a', 'b', 'c']) skicka(chatt(namn, 3));
  for (const namn of ['a', 'b', 'c']) skicka(chatt(namn, 4));
  h.window.VyraFanLevel.nastaNu();
  h.window.VyraFanLevel.nastaNu();
  assert.deepEqual([...traffar()].map(t => t.name), ['a', 'b', 'c']);
  assert.equal(h.window.VyraFanLevel.koLangd(), 0);
});

test('en skur på tjugo tappar ingenting', () => {
  // Den delade alertkön trimmar vid tio väntande. Därför håller Fan Level Up sin egen kö och
  // släpper EN i taget dit — den delade kön ser aldrig mer än en, och kan inte trimma bort något.
  const { skicka, h } = boot();
  const namn = Array.from({ length: 20 }, (_, i) => 'u' + i);
  for (const n of namn) skicka(chatt(n, 3));
  for (const n of namn) skicka(chatt(n, 4));
  assert.equal(h.window.VyraFanLevel.koLangd(), 19, 'något tappades i en helt normal skur');
});

test('nödbromsen ligger högt och loggar', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'fan-level-session.js'), 'utf8');
  const tak = src.match(/NODBROMS\s*=\s*(\d+)/);
  assert.ok(tak, 'ingen nödbroms alls — en trasig ström kan svälla kön i all oändlighet');
  assert.ok(Number(tak[1]) >= 100, `nödbromsen ligger på ${tak[1]}, den slår i vid normal användning`);
  assert.match(src, /console\.warn/, 'en kastad alert måste synas i loggen');
});

test('global köpolicy är orörd', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'runtime-controls.js'), 'utf8');
  assert.match(src, /MAX_VANTANDE\s*=\s*10/, 'det delade taket ändrades — det gäller alla alerttyper');
  assert.match(src, /MAX_ALDER\s*=\s*30000/, 'den delade maxåldern ändrades');
});

// ---- 4. inget skrivs till layouten -------------------------------------------------------------

test('en level-up skriver inte live-data till sparad layout', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'media.js'), 'utf8');
  const rad = src.split('\n').find(l => /function triggerFanLevelUp/.test(l)) || '';
  assert.ok(rad, 'triggerFanLevelUp hittades inte');
  assert.doesNotMatch(rad, /\bsave\(\)/,
    'live-data sparas i layouten och blir persistent mellan sändningar');
  assert.doesNotMatch(rad, /\brender\(\)/,
    'hela canvasen byggs om per alert i stället för riktad DOM-patchning');
});

test('ingen debug-toast vid trigger', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'media.js'), 'utf8');
  const rad = src.split('\n').find(l => /function triggerFanLevelUp/.test(l)) || '';
  assert.doesNotMatch(rad, /toast\(/, 'en Studio-notis per level-up i skarp drift');
});

// ---- 5. från → till i renderingen --------------------------------------------------------------

// KRAVET ANDRAT 2026-08-13 pa Davids begaran: referensbilden visar en ENKEL "LV. 12"-pill,
// utan pil och utan foregaende niva. Fran-nivan raknas fortfarande ut av fanNivaer() och anvands
// pa fem stallen i media.js — den ar alltsa inte borttagen, den RENDERAS bara inte langre i pillen.
test('renderaren visar mal-nivan i pillen, utan hojningspil', () => {
  const h = createDom({ state: { widgets: [fanWidget('fan1', { fanLevel: 12, fanFromLevel: 11 })], projectName: 'fan' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([fanWidget('fan1', { fanLevel: 12, fanFromLevel: 11 })]);
  const pill = box.querySelector('.fan-level-pill');
  assert.ok(pill, 'nivåpillen saknas');
  assert.match(pill.textContent.replace(/\s+/g, ' ').trim(), /^LV\.? ?12$/i,
    `pillen visar "${pill.textContent.trim()}" — referensen visar "LV. 12"`);
});

// Samma andring: pillen visar mal-nivan oavsett om en fran-niva ar satt eller inte.
test('pillen visar mal-nivan aven utan en satt fran-niva', () => {
  const w = fanWidget('fan1', { fanLevel: 12 });
  const h = createDom({ state: { widgets: [w], projectName: 'fan' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]);
  assert.match(box.querySelector('.fan-level-pill').textContent.replace(/\s+/g, ' ').trim(), /^LV\.? ?12$/i,
    'förhandsvisningen i editorn ska visa samma form som en riktig level-up');
});

// ---- serverns stämpel äger jämförelsen -------------------------------------------------------
// Kartan ovan lever i RAM och dör med sidan, så den kan bara se en höjning om SAMMA tittare syns
// TVÅ gånger i SAMMA sändning. Fanklubbsnivå rör sig på veckor — därför var widgeten tyst i
// praktiken. viewer-levels.js på servern minns mellan sändningar och stämplar eventet med
// {from,to}; klienten renderar den slutsatsen i stället för att försöka dra den själv.
test('en stämplad höjning fyrar direkt, utan att tittaren setts förut', () => {
  const env = boot();
  env.skicka({ type: 'gift', username: 'aterkommande', teamLevel: 9,
    fanLevelUp: { from: 7, to: 9 } });
  assert.equal(env.traffar().length, 1, 'stämpeln ignorerades — det är hela poängen med den');
  assert.equal(env.traffar()[0].fromLevel, 7);
  assert.equal(env.traffar()[0].level, 9);
});

test('stämpeln fyrar en gång per höjning, inte två', () => {
  // Reserven får inte lägga på en egen alert ovanpå serverns. Kön släpper EN i taget, så den andra
  // måste släppas fram med nastaNu() — annars mäter testet köpolicyn i stället för dubbelfyrning.
  const env = boot();
  env.skicka({ type: 'gift', username: 'en', teamLevel: 4, fanLevelUp: { from: 2, to: 4 } });
  env.skicka({ type: 'gift', username: 'en', teamLevel: 6, fanLevelUp: { from: 4, to: 6 } });
  assert.equal(env.traffar().length, 1, 'kön släppte fler än en åt gången');
  env.run('VyraFanLevel.nastaNu()');
  assert.equal(env.traffar().length, 2, 'den andra höjningen kom aldrig fram');
  env.run('VyraFanLevel.nastaNu()');
  assert.equal(env.traffar().length, 2,
    'en tredje alert dök upp — reserven fyrade ovanpå serverns stämpel');
  // Spridningen drar in arrayen i Nodes realm — jsdom:s Array har en annan prototyp, och strikt
  // deepEqual jämför den.
  assert.deepEqual([...env.traffar()].map(x => Number(x.level)), [4, 6]);
});

test('en trasig stämpel ignoreras och reserven tar över', () => {
  const env = boot();
  // to <= from är ingen höjning. Utan spärren hade en felaktig stämpel gett en falsk alert.
  env.skicka({ type: 'gift', username: 'lugn', teamLevel: 5, fanLevelUp: { from: 5, to: 5 } });
  assert.equal(env.traffar().length, 0, 'en icke-höjning stämplades fram som en höjning');
  env.skicka({ type: 'gift', username: 'lugn', teamLevel: 8 });
  assert.equal(env.traffar().length, 1, 'reserven slutade fungera för event utan stämpel');
  assert.equal(env.traffar()[0].fromLevel, 5);
});
