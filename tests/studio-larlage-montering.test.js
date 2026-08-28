'use strict';
// ÄR LÄRLÄGET FAKTISKT MONTERAT I STUDIO?
//
// Modulen `gift-identity-larlage.js` byggdes och provades i #280 — men laddades ALDRIG av
// studio.html, och ingenting anropade den. Den var komplett, paketerad i .exe:n, täckt av egna
// prov, och ändå helt otillgänglig för en användare. Felet upptäcktes först mitt i ett LIVE-prov,
// när knappen som designdokumentet beskrev visade sig inte finnas.
//
// Färdig kod utan monteringspunkt är husets återkommande fel. Det här provet är vakten mot att det
// upprepas: det faller om SKRIPTET, KNAPPEN eller ANROPET kopplas bort.
//
// Provet mäter tre lager, för alla tre kan brytas var för sig utan att de andra märker något:
//
//   1. studio.html laddar modulen          — utan detta finns window.VyraGiftIdentityLarlage inte
//   2. panelen har kontrollerna            — utan dessa finns inget att trycka på
//   3. media.js kopplar dem till modulen    — utan detta gör knapparna ingenting
//
// Ett fjärde lager mäts också: att gåvans TEKNISKA ID aldrig når DOM:en.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const ROT = path.join(__dirname, '..');
const las = fil => fs.readFileSync(path.join(ROT, fil), 'utf8');

// Kommentarer strippas före sökning. En vakt som söker efter en sträng faller annars på sin egen
// förklarande kommentar om varför strängen är viktig — en mina huset gått på flera gånger.
const utanKommentarer = kalla => kalla
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/).map(rad => rad.replace(/^\s*\/\/.*$/, '')).join('\n');

const STUDIO = las('studio.html');
const MEDIA = utanKommentarer(las('media.js'));
const MODUL = las('gift-identity-larlage.js');

// ---- 1 · SKRIPTET LADDAS -----------------------------------------------------------------------

test('studio.html laddar gift-identity-larlage.js', () => {
  assert.match(STUDIO, /<script src="gift-identity-larlage\.js/,
    'modulen laddas inte — då finns window.VyraGiftIdentityLarlage aldrig, och knappen är död');
});

test('modulen laddas FÖRE media.js som monterar den', () => {
  // SKRIPTTAGGARNA, inte första förekomsten av strängen: "media.js" står också i en kommentar
  // ovanför, och att mäta den hade gett fel svar utan att provet såg trasigt ut.
  const larlage = STUDIO.indexOf('<script src="gift-identity-larlage.js');
  const media = STUDIO.indexOf('<script src="media.js');
  assert.ok(larlage >= 0 && media >= 0, 'båda skripttaggarna måste finnas');
  assert.ok(larlage < media,
    'media.js monterar modulen och ska inte kunna köra före den är definierad');
});

test('skriptet är cachebustat', () => {
  // Utan versionsfråga serveras en gammal kopia ur webbläsarens cache efter varje ändring — huset
  // har blivit lurat av precis det förut.
  assert.match(STUDIO, /gift-identity-larlage\.js\?v=/, 'skripttaggen saknar ?v=');
});

// ---- 2 · KONTROLLERNA FINNS I PANELEN ----------------------------------------------------------

const KONTROLLER = [
  ['heartLarArmera', 'Lär in nästa gåva'],
  ['heartLarBekrafta', 'Bekräfta'],
  ['heartLarAvbryt', 'Avbryt'],
  ['heartLarStatus', 'nedräkning och läge'],
  ['heartLarForhands', 'förhandsvisningen'],
  ['heartLarBild', 'bilden'],
  ['heartLarNamn', 'namnet']
];

test('Heart Me Goals panel bär alla kontroller', () => {
  for (const [id, vad] of KONTROLLER) {
    assert.ok(MEDIA.includes('id="' + id + '"'), `${vad} (#${id}) saknas i panelen`);
  }
});

test('kontrollerna ligger i Heart Me Goal-panelen, inte någon annanstans', () => {
  // Panelen byggs av heartGoalProps. Hamnar gruppen i fel panel syns den för fel widget.
  const start = MEDIA.indexOf('const heartGoalProps=props');
  assert.ok(start > 0, 'heartGoalProps hittades inte — panelen har bytt form');
  const panel = MEDIA.slice(start, MEDIA.indexOf('const heartGoalBind'));
  assert.ok(panel.includes('id="heartLarArmera"'), 'knappen ligger utanför Heart Me Goal-panelen');
  assert.ok(panel.includes('heartLarGrupp'), 'gruppen ligger utanför panelen');
});

test('hjälptexten förklarar att figuren varierar', () => {
  // Utan den ser en avvikande bild ut som fel gåva, och användaren avbryter en korrekt fångst.
  // Det hände i det första LIVE-provet.
  assert.match(MEDIA, /nivå.*kläder.*tillbehör/s,
    'hjälptexten om medlemsnivå, kläder och tillbehör saknas');
  assert.match(MEDIA, /tekniska identitet/,
    'texten ska säga att matchningen sker på teknisk identitet, inte på bilden');
});

// ---- 3 · ANROPET FINNS ------------------------------------------------------------------------

test('media.js skapar lärläget genom modulen — ingen parallell implementation', () => {
  assert.match(MEDIA, /window\.VyraGiftIdentityLarlage/,
    'modulen används inte');
  assert.match(MEDIA, /skapaLarlage\(/,
    'skapaLarlage anropas inte — då är modulen laddad men oanvänd');

  // En egen fetch mot gift-identity-rutten vore en andra, oprövad implementation.
  assert.ok(!/fetch\([^)]*gift-identity/.test(MEDIA),
    'media.js talar med rutten på egen hand i stället för genom modulen');
});

test('varje knapp är kopplad till sitt kommando', () => {
  // Id:t och kommandot ligger långt isär i källan — id:t i querySelector, kommandot i onclick.
  // Provet följer därför VARIABELN, som är det som faktiskt binder ihop dem.
  for (const [id, variabel, kommando] of [
    ['heartLarArmera', 'armeraKnapp', 'armera'],
    ['heartLarBekrafta', 'bekraftaKnapp', 'bekrafta'],
    ['heartLarAvbryt', 'avbrytKnapp', 'avbryt']
  ]) {
    assert.ok(MEDIA.includes("querySelector('#" + id + "')"), `#${id} hämtas aldrig ur panelen`);
    const monster = new RegExp(variabel + '\\.onclick[^;]*\\.' + kommando + '\\(');
    assert.match(MEDIA, monster, `#${id} är inte kopplad till ${kommando}()`);
  }
});

test('läget läses in när panelen öppnas', () => {
  assert.match(MEDIA, /\.hamta\(/,
    'utan hamta() visar panelen ingenting förrän man trycker på något');
});

test('regelnyckeln är serverns fasta heart_me', () => {
  assert.match(MEDIA, /const REGEL = 'heart_me'/,
    'nyckeln ska vara den fasta heart_me — servern validerar den och avvisar allt annat');
});

// ---- 4 · TEKNISKT ID NÅR ALDRIG DOM:EN ---------------------------------------------------------

test('giftId renderas aldrig i panelen', () => {
  const start = MEDIA.indexOf('function monteraHeartLarlage');
  assert.ok(start > 0, 'monteringen hittades inte');
  const montering = MEDIA.slice(start);

  assert.ok(!/giftId/.test(montering),
    'monteringen rör giftId — det får bära matchningen, aldrig gränssnittet');
  // Bara namn och bild får renderas.
  assert.match(montering, /fangst\.giftName/, 'namnet visas inte för kontrollen');
  assert.match(montering, /fangst\.giftImage/, 'bilden visas inte för kontrollen');

  // KONTROLLMÄTNING: mönstret kan träffa.
  assert.ok(/giftId/.test('const x = fangst.giftId;'));
});

test('ingen loggning i monteringen', () => {
  const montering = MEDIA.slice(MEDIA.indexOf('function monteraHeartLarlage'));
  assert.ok(!/console\./.test(montering),
    'en loggrad här skulle bära gåvans identitet eller läget till konsolen');
});

// ---- 5 · OFFLINE-BETEENDET FRÅN #284 BEHÅLLS ---------------------------------------------------

test('offline stänger av knappen och visar modulens skäl', () => {
  const montering = MEDIA.slice(MEDIA.indexOf('function monteraHeartLarlage'));
  assert.match(montering, /lage\.otillganglig/,
    'monteringen läser inte offline-läget — då visas knappar som inte kan göra något');
  assert.match(montering, /armeraKnapp\.disabled = true/,
    'knappen stängs inte av när anslutningen saknas');
  assert.match(montering, /lage\.meddelande/,
    'modulens skäl visas inte — användaren får ett tyst fel i stället');
});

test('modulens offline-meddelande är oförändrat', () => {
  require('../gift-identity-larlage.js');
  assert.equal(globalThis.VyraGiftIdentityLarlage.OFFLINE_MEDDELANDE,
    'Lär in gåva kräver anslutning till VYRA.');
});

// ---- 6 · TEARDOWN ------------------------------------------------------------------------------

test('instansen rivs när panelen lämnas', () => {
  const montering = MEDIA.slice(MEDIA.indexOf('const heartLarBind'));
  assert.match(montering, /heartLarInstans\.stang\(\)/,
    'en pollslinga som lever efter vybyte är samma fel huset redan lärt sig en gång');
});

// ---- 7 · MODULEN ÄR DEN FRÅN #280, INTE EN KOPIA ----------------------------------------------

test('den monterade modulen bär hela kontraktet media.js använder', () => {
  require('../gift-identity-larlage.js');
  const lar = globalThis.VyraGiftIdentityLarlage.skapaLarlage({
    workspaceId: 'prov', api: () => Promise.resolve({ ok: true }), rita: () => {}
  });
  for (const metod of ['armera', 'bekrafta', 'avbryt', 'hamta', 'stang', 'lage']) {
    assert.equal(typeof lar[metod], 'function', `modulen saknar ${metod}() som monteringen anropar`);
  }
});
