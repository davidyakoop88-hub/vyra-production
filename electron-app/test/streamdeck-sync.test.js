'use strict';
// SYNKNINGEN AV STREAM DECK-PLUGINET (#428).
//
// Provet kör mot RIKTIGA kataloger i temp, inte mot ett stubbat fs. Skälet är att felen som
// spelar roll här är filsystemsfel — halvkopierade mappar, saknade kataloger, versioner som inte
// skrivs över — och ett stubbat fs bevisar bara att koden anropar de funktioner provet väntar sig.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { synkaPlugin, elgatoKatalogWindows, nyareAn, MAPP } = require('../streamdeck-sync.js');

const tempar = [];
test.after(() => { for (const d of tempar) try { fs.rmSync(d, { recursive: true, force: true }) } catch (_) {} });

function rigg({ version = '0.2.0', installerad = null, skapaMal = true } = {}) {
  const rot = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-sync-'));
  tempar.push(rot);

  const kalla = path.join(rot, 'app', 'streamdeck-plugin', MAPP);
  fs.mkdirSync(kalla, { recursive: true });
  fs.writeFileSync(path.join(kalla, 'manifest.json'),
    JSON.stringify({ Name: 'VYRA Live', Version: version, CodePath: 'plugin.js' }));
  fs.writeFileSync(path.join(kalla, 'plugin.js'), '// ny version\n');

  const mal = path.join(rot, 'Plugins');
  if (skapaMal) fs.mkdirSync(mal, { recursive: true });
  if (installerad) {
    const d = path.join(mal, MAPP);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({ Version: installerad }));
    fs.writeFileSync(path.join(d, 'plugin.js'), '// gammal version\n');
  }
  return { kalla, mal, installeradVag: path.join(mal, MAPP) };
}

test('utan Stream Deck händer ingenting — tyst, inte ett fel', () => {
  // De flesta användare har ingen Stream Deck. Ett fel för det vore brus i en logg där riktiga
  // fel ska synas, och det anropas vid VARJE appstart.
  const { kalla, mal } = rigg({ skapaMal: false });
  const r = synkaPlugin(kalla, mal);
  assert.equal(r.status, 'ingen-streamdeck');
  assert.equal(r.fel, undefined, 'saknad katalog rapporterades som ett fel');
  assert.equal(fs.existsSync(mal), false, 'synkningen skapade Elgatos katalog åt den som inte har Stream Deck');
});

test('finns Elgatos katalog men inget plugin — då installeras det', () => {
  const { kalla, mal, installeradVag } = rigg({ version: '0.2.0' });
  const r = synkaPlugin(kalla, mal);
  assert.equal(r.status, 'installerad');
  assert.equal(r.version, '0.2.0');
  assert.equal(fs.readFileSync(path.join(installeradVag, 'plugin.js'), 'utf8').trim(), '// ny version');
});

test('en ÄLDRE installerad version skrivs över', () => {
  const { kalla, mal, installeradVag } = rigg({ version: '0.2.0', installerad: '0.1.0' });
  const r = synkaPlugin(kalla, mal);
  assert.equal(r.status, 'uppdaterad');
  assert.equal(r.installerad, '0.1.0');
  assert.equal(fs.readFileSync(path.join(installeradVag, 'plugin.js'), 'utf8').trim(), '// ny version',
    'den gamla filen låg kvar — en halvuppdaterad plugin är värre än en gammal');
});

test('en LIKA NY installerad version rörs inte', () => {
  const { kalla, mal, installeradVag } = rigg({ version: '0.2.0', installerad: '0.2.0' });
  const r = synkaPlugin(kalla, mal);
  assert.equal(r.status, 'aktuell');
  assert.equal(fs.readFileSync(path.join(installeradVag, 'plugin.js'), 'utf8').trim(), '// gammal version',
    'synkningen skrev över en redan aktuell plugin — onödig I/O vid varje appstart');
});

test('en NYARE installerad version rörs inte heller', () => {
  // Skyddar den som provar en förhandsversion: appen ska inte nedgradera den vid varje start.
  const { kalla, mal } = rigg({ version: '0.2.0', installerad: '0.3.0' });
  assert.equal(synkaPlugin(kalla, mal).status, 'aktuell');
});

// MUTATIONSFÄLLAN som #428 beställde.
test('versionen läses ur pluginets manifest.json — ALDRIG ur package.json', () => {
  // De två versionerna råkar vara lika i dag. Det gör inte valet oviktigt — det gör felet
  // OSYNLIGT tills den dagen de glider isär, och då är det Stream Deck som läser manifestet.
  //
  // Riggen sätter dem AVSIKTLIGT olika: manifestet säger 9.9.9, package.json säger 0.0.1. Läser
  // koden fel fil blir utfallet 'aktuell' i stället för 'uppdaterad', och provet faller.
  const { kalla, mal } = rigg({ version: '9.9.9', installerad: '1.0.0' });
  fs.writeFileSync(path.join(kalla, 'package.json'), JSON.stringify({ version: '0.0.1' }));

  const r = synkaPlugin(kalla, mal);
  assert.equal(r.status, 'uppdaterad',
    'versionen lästes inte ur manifest.json — med package.json som källa hade 0.0.1 sett äldre ut '
    + 'än den installerade 1.0.0, och pluginet hade aldrig uppdaterats');
  assert.equal(r.version, '9.9.9', 'fel fil gav versionen');
});

test('en trasig manifest.json i källan fäller inte appstarten', () => {
  const { kalla, mal } = rigg();
  fs.writeFileSync(path.join(kalla, 'manifest.json'), '{ trasig');
  assert.equal(synkaPlugin(kalla, mal).status, 'kalla-saknas');
});

test('versionsjämförelsen är numerisk, inte alfabetisk', () => {
  // "0.10.0" > "0.9.0" numeriskt, men "0.10.0" < "0.9.0" som strängar. Med en stränjämförelse
  // hade pluginet fastnat på 0.9 för alltid utan att något sade ifrån.
  assert.equal(nyareAn('0.10.0', '0.9.0'), true, 'stränjämförelse: 0.10 sågs som äldre än 0.9');
  assert.equal(nyareAn('0.2.0', '0.2.0'), false);
  assert.equal(nyareAn('1.0.0', '0.9.9'), true);
  assert.equal(nyareAn('0.1.0', '0.2.0'), false);
});

test('Elgatos Windows-katalog byggs ur APPDATA, och saknas den ges tom sträng', () => {
  assert.equal(elgatoKatalogWindows({ APPDATA: 'C:\\A' }),
    path.join('C:\\A', 'Elgato', 'StreamDeck', 'Plugins'));
  assert.equal(elgatoKatalogWindows({}), '', 'utan APPDATA ska den ge tomt, inte kasta');
});

// ---- PAKETERINGEN: mappen måste faktiskt följa med i bygget ------------------------------------
//
// Synkningen kopierar från <appRoot>/streamdeck-plugin/. Ligger mappen inte i paketet kopierar
// koden något som inte finns, och `status` blir 'kalla-saknas' på varje användares dator — utan
// att någonting säger ifrån förrän någon undrar var VYRA tog vägen i Stream Deck.
//
// UNDERSÖKNINGEN RÄTTADE ETT ANTAGANDE HÄR (#428). Det låg nära till hands att lägga mappen i
// `build.files`. Det hade varit fel: den listan styr vad som hamnar i ASAR-ARKIVET, och ett
// arkiv går inte att kopiera en mapp ur. `extraResources` sveper i stället hela repotroten med
// `**/*` och en EXKLUDERINGSLISTA — mappen följer alltså med av sig själv, och det som kan gå
// fel är att någon lägger till en exkludering. Det är precis det provet nedan vaktar.
test('streamdeck-plugin är inte utesluten ur paketeringen', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const res = (pkg.build.extraResources || [])[0];
  assert.ok(res, 'extraResources saknas helt — ingenting ur repotroten följer med');
  assert.equal(res.from, '..', 'extraResources sveper inte längre repotroten');

  const uteslutna = (res.filter || []).filter(m => m.startsWith('!')).map(m => m.slice(1));
  for (const m of uteslutna) {
    assert.ok(!/^streamdeck-plugin(\/|$|\*)/.test(m),
      `"${m}" utesluter pluginet ur paketet — synkningen hittar då ingen källa på användarens dator`);
  }
});

test('pluginmappen som synkningen letar efter finns på den plats paketeringen lägger den', () => {
  // Två sanningar som måste mötas: koden bygger sökvägen <appRoot>/streamdeck-plugin/<MAPP>, och
  // extraResources kopierar repotroten till resources/app. Provet knyter ihop dem mot disken, så
  // att ett namnbyte på mappen fäller här i stället för i en installerad release.
  const vag = path.join(__dirname, '..', '..', 'streamdeck-plugin', MAPP, 'manifest.json');
  assert.ok(fs.existsSync(vag), `hittade inget manifest på ${vag}`);
  const m = JSON.parse(fs.readFileSync(vag, 'utf8'));
  assert.ok(m.Version, 'manifestet saknar Version — synkningen kan då aldrig jämföra');
  assert.equal(m.CodePath, 'plugin.js', 'manifestets CodePath pekar inte på plugin.js');
});
