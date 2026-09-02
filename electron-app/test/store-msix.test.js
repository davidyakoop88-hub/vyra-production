'use strict';
// MICROSOFT STORE-PAKETET — identiteten är versionshanterad, och uppdateraren är av.
//
// Två saker skiljer Store-versionen från .exe-versionen, och båda kan gå fel tyst:
//
//   1. IDENTITETEN binder paketet till Store-posten. Fel `publisher` avvisas i certifieringen; fel
//      `identityName` kan i värsta fall gå igenom som en ANNAN produkt. Ett rimligt påhittat värde
//      är därför farligare än ett tomt — det ser rätt ut ända tills någon annan drabbas.
//
//   2. UPPDATERAREN måste vara av. Microsoft Store äger uppdateringarna för ett MSIX/AppX-paket, och
//      en app som laddar ner och kör en .exe förbi butiken bryter mot certifieringskraven.
//      Installationskatalogen är dessutom skrivskyddad, så försöket hade fallit ändå — bara senare.
//
// Värdena ligger INCHECKADE i store-identitet.json. De är offentliga och stabila, och poängen är
// reproducerbarhet: samma commit ska ge samma identitet, utan att någon behöver komma ihåg att sätta
// tre miljövariabler rätt.
//
// Proven kräver ingen Windows-SDK och bygger inget paket. Det faktiska AppX-bygget och
// manifestkontrollen körs som ett eget steg i VYRA Windows release; det som kräver en INSTALLERAD
// app står i docs/store-msix.md som en mätlista för människa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Identitet = require('../store-identitet');

// Syntetiska värden i Partner Centers form — inga riktiga konto- eller organisationsuppgifter.
// Proven matar `fil` och `env` INJICERAT: den riktiga store-identitet.json ligger numera incheckad,
// och utan injektion hade dess värden smugit in i prov som tror sig mäta något annat.
const GILTIG_FIL = {
  identityName: '55555ProvUtgivare.VYRA',
  publisher: 'CN=00000000-1111-2222-3333-444444444444',
  publisherDisplayName: 'Provutgivaren'
};
const TOM_ENV = {};
const bara = fil => ({ env: TOM_ENV, fil });

// ---- IDENTITETEN --------------------------------------------------------------------------------

test('en komplett identitet accepteras', () => {
  const o = bara(GILTIG_FIL);
  assert.deepEqual(Identitet.brister(Identitet.las(o), o), []);
  assert.equal(Identitet.las(o).identityName, '55555ProvUtgivare.VYRA');
});

test('varje saknat fält nekas, och felet säger var värdet hämtas', () => {
  for (const utelamnad of Object.keys(GILTIG_FIL)) {
    const fil = { ...GILTIG_FIL };
    delete fil[utelamnad];
    const o = bara(fil);
    const fel = Identitet.brister(Identitet.las(o), o);
    assert.equal(fel.length, 1, utelamnad + ' skulle ha gett exakt en brist');
    assert.match(fel[0], /Partner Center/, 'felet måste peka ut var värdet finns');
    assert.match(fel[0], /9PPKZN2SCJM2/, 'och vilken Store-post det gäller');
  }
});

test('platshållare räknas som saknade — inte som ifyllda', () => {
  // Det farliga fallet: ett kvarglömt exempelvärde bygger och skickas in, och först certifieringen
  // säger ifrån.
  for (const platshallare of ['<ange>', 'TODO', 'xxxx', 'placeholder', 'ANGE']) {
    const o = bara({ ...GILTIG_FIL, publisherDisplayName: platshallare });
    assert.equal(Identitet.arGiltig(Identitet.las(o), o), false, platshallare + ' släpptes igenom');
  }
  const ex = bara({ ...GILTIG_FIL, publisher: 'CN=Example' });
  assert.equal(Identitet.arGiltig(Identitet.las(ex), ex), false);
});

test('publisher måste vara hela X.500-strängen', () => {
  const o = bara({ ...GILTIG_FIL, publisher: 'Provutgivaren AB' });
  const fel = Identitet.brister(Identitet.las(o), o);
  assert.equal(fel.length, 1);
  assert.match(fel[0], /CN=/, 'felet ska säga vilken form som krävs');
});

test('identityName med fel tecken nekas', () => {
  for (const fel of ['har mellanslag', 'har/snedstreck', '', 'a']) {
    const o = bara({ ...GILTIG_FIL, identityName: fel });
    assert.equal(Identitet.arGiltig(Identitet.las(o), o), false, fel + ' släpptes igenom');
  }
});

test('krav() kastar med instruktion i stället för att gissa', () => {
  assert.throws(() => Identitet.krav({ env: TOM_ENV, fil: {} }), fel => {
    assert.match(fel.message, /får inte gissas/);
    assert.match(fel.message, /9PPKZN2SCJM2/, 'felet ska namnge Store-posten');
    return true;
  });
  // KONTROLLMÄTNING: med värden kastar den inte.
  assert.ok(Identitet.krav(bara(GILTIG_FIL)).identityName);
});

// ---- REPRODUCERBARHETEN -------------------------------------------------------------------------

test('FILEN vinner över env — annars vore bygget inte reproducerbart', () => {
  const o = { fil: GILTIG_FIL, env: { VYRA_STORE_PUBLISHER_DISPLAY_NAME: 'nagot-annat' } };
  assert.equal(Identitet.las(o).publisherDisplayName, 'Provutgivaren');
});

test('en miljövariabel som SÄGER EMOT filen är ett fel, inte en override', () => {
  // Ett bygge som kan byta identitet genom en kvarglömd variabel är inte reproducerbart, och fel
  // identitet kan i värsta fall gå igenom certifieringen som en ANNAN produkt.
  const o = { fil: GILTIG_FIL, env: { VYRA_STORE_PUBLISHER: 'CN=11111111-1111-1111-1111-111111111111' } };
  const fel = Identitet.brister(Identitet.las(o), o);
  assert.equal(fel.length, 1);
  assert.match(fel[0], /säger något annat än den incheckade filen/);

  // KONTROLLMÄTNING: samma värde i båda är inget fel.
  const lika = { fil: GILTIG_FIL, env: { VYRA_STORE_PUBLISHER: GILTIG_FIL.publisher } };
  assert.deepEqual(Identitet.brister(Identitet.las(lika), lika), []);
});

test('env får fylla i det filen SAKNAR', () => {
  const o = { fil: { identityName: GILTIG_FIL.identityName, publisher: GILTIG_FIL.publisher },
              env: { VYRA_STORE_PUBLISHER_DISPLAY_NAME: 'Provutgivaren' } };
  assert.deepEqual(Identitet.brister(Identitet.las(o), o), []);
});

test('DEN INCHECKADE identiteten är komplett och giltig', () => {
  // Kärnpåståendet efter beslutet att versionshantera värdena: repot ensamt ska räcka för att bygga
  // ett paket med rätt identitet. Faller det här provet går bygget inte att reproducera.
  assert.ok(fs.existsSync(Identitet.FIL), 'store-identitet.json ska ligga i repot');
  const fil = Identitet.franFil();
  const o = { env: TOM_ENV, fil };
  assert.deepEqual(Identitet.brister(Identitet.las(o), o), [],
    'den incheckade identiteten validerar inte');

  assert.equal(fil.identityName, 'vyralive.app.VYRAStudio');
  assert.equal(fil.publisher, 'CN=A1F38F6A-C85F-42A3-AFCE-019E5D6FF4B7');
  assert.equal(fil.publisherDisplayName, 'vyralive.app');
  assert.match(fil._kalla, /9PPKZN2SCJM2/, 'filen ska peka ut Store-posten den kommer från');
});

// ---- BYGGKONFIGURATIONEN ------------------------------------------------------------------------

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('appx-blocket bär allt UTOM identiteten', () => {
  const appx = pkg.build.appx;
  assert.ok(appx, 'appx-konfigurationen saknas');
  assert.equal(appx.electronUpdaterAware, false, 'Store äger uppdateringarna');
  assert.ok(Array.isArray(appx.languages) && appx.languages.includes('sv-SE'));
  assert.equal(appx.artifactName, 'VYRA-Store-${version}.appx',
    'standardnamnet innehöll ett mellanslag — en onödig fotängel för automation');

  // Identiteten hör hemma i store-identitet.json, inte här — ett värde på två ställen driver isär.
  for (const falt of ['identityName', 'publisher', 'publisherDisplayName']) {
    assert.equal(appx[falt], undefined, falt + ' ligger hårdkodad i package.json');
  }
});

test('NSIS-vägen är orörd — Store-arbetet får inte ta med sig .exe-bygget', () => {
  assert.equal(pkg.build.win.target, 'nsis', 'det befintliga .exe-målet ska stå kvar');
  // tiktok-fields.js tillkom 2026-09-02 (#308): faltlogiken bruten ur tiktok-service.js for att
  // kunna provas utan tiktok-live-connector. Den MASTE sta i build.files — en require till en fil
  // som inte packas in kraschar appen vid START, inte i ett prov.
  //
  // Listan ar hardkodad MED FLIT har: vakten finns for att fanga att Store-arbetet av misstag rors
  // vid NSIS-vagen, och da ar en handskriven forvantan hela poangen. Priset ar att den maste
  // uppdateras nar paketlistan avsiktligt andras — som nu.
  assert.deepEqual(pkg.build.files,
    ['main.js', 'local-server.js', 'tiktok-service.js', 'tiktok-fields.js', 'obs-service.js',
     'updater.js', 'update-config.json', 'splash.html', 'icon.ico'],
    'paketlistan för appen ska vara oförändrad');
});

test('byggverktygen följer INTE med in i appen', () => {
  // bygg-store.js och store-identitet.js kör på byggmaskinen. Hamnar de i `files` skickas de med i
  // varje installation utan att göra nytta där.
  for (const verktyg of ['bygg-store.js', 'store-identitet.js', 'store-identitet.json']) {
    assert.ok(!pkg.build.files.includes(verktyg), verktyg + ' ska inte paketeras');
  }
});

test('build:store finns och går genom identitetskontrollen', () => {
  assert.equal(pkg.scripts['build:store'], 'node bygg-store.js');
  const kalla = fs.readFileSync(path.join(__dirname, '..', 'bygg-store.js'), 'utf8');
  assert.match(kalla, /Identitet\.krav\(\)/, 'bygget måste gå genom kravet');
  assert.match(kalla, /-c\.appx\.identityName=/, 'identiteten matas som overrides, inte i filen');
  // Overrides i stället för en egen configfil: en electron-builder.config.js hade TAGIT ÖVER helt
  // och tyst slagit ut NSIS-uppsättningen.
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'electron-builder.config.js')), false);
});

test('bygget skriver aldrig ut identiteten', () => {
  const kalla = fs.readFileSync(path.join(__dirname, '..', 'bygg-store.js'), 'utf8');
  assert.ok(!/console\.log\([^)]*identitet\.(identityName|publisher)/.test(kalla),
    'publisher bär organisationens namn och GUID och hör inte hemma i en byggloggg');
});

// ---- UPPDATERAREN ÄR AV I STORE-VERSIONEN -------------------------------------------------------

test('checkForUpdates avbryts när appen kör ur Store-paketet', () => {
  const kalla = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

  assert.match(kalla, /process\.windowsStore\s*===\s*true/,
    'Store-läget ska läsas av process.windowsStore, inte av en byggflagga');

  // Villkoret måste ligga FÖRST i checkForUpdates — efter isPackaged hade updateCheckRunning redan
  // hunnit sättas, och en senare omstart av kontrollen hade blockerats av fel skäl.
  const kropp = kalla.slice(kalla.indexOf('async function checkForUpdates()'));
  const forstaRad = kropp.split('\n')[1];
  assert.match(forstaRad, /arStoreversion\(\)/,
    'avbrottet ska vara det första som händer i checkForUpdates');
});

test('avstängningen gäller BARA Store-versionen', () => {
  // .exe-versionen ska fortsätta uppdatera sig själv — annars fastnar varje befintlig installation.
  const kalla = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(kalla, /if\(!app\.isPackaged\|\|updateCheckRunning\)return;/,
    'de befintliga villkoren ska stå kvar oförändrade');
  assert.match(kalla, /Updater\.fetchRelease/, 'uppdateringsvägen finns kvar för .exe-versionen');
});

// ---- CI BYGGER FAKTISKT PAKETET -----------------------------------------------------------------

test('CI bygger AppX och kontrollerar manifestet — utan att distribuera det', () => {
  const flode = fs.readFileSync(
    path.join(__dirname, '..', '..', '.github/workflows/desktop-release.yml'), 'utf8');

  assert.match(flode, /npm run build:store/, 'AppX-bygget saknas i CI');
  assert.match(flode, /AppxManifest\.xml/, 'manifestet kontrolleras inte');

  // Paketet får ALDRIG laddas upp på en PR. Det är dels ~314 MB mot artefaktkvoten
  // (se tests/ci-artifact-budget.test.js), dels ska en testartefakt inte kunna distribueras.
  const steg = flode.split(/\n(?=      - )/);
  const uppladdning = steg.filter(s => /upload-artifact/.test(s) && /appx/i.test(s));
  assert.deepEqual(uppladdning, [],
    'Store-paketet laddas upp — det ska stanna på körningen, inte bli hämtbart');
});
