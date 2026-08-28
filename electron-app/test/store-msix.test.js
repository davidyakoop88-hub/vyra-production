'use strict';
// MICROSOFT STORE-PAKETET — identiteten gissas aldrig, och uppdateraren är av.
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
// Proven kräver ingen Windows-SDK och bygger inget paket. Det som faktiskt kräver en installerad
// app står i docs/store-msix.md som en mätlista för människa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Identitet = require('../store-identitet');

// Syntetiska värden i Partner Centers form — inga riktiga konto- eller organisationsuppgifter.
const GILTIG = {
  VYRA_STORE_IDENTITY_NAME: '55555ProvUtgivare.VYRA',
  VYRA_STORE_PUBLISHER: 'CN=00000000-1111-2222-3333-444444444444',
  VYRA_STORE_PUBLISHER_DISPLAY_NAME: 'Provutgivaren'
};

// ---- IDENTITETEN --------------------------------------------------------------------------------

test('en komplett identitet accepteras', () => {
  const i = Identitet.las(GILTIG);
  assert.deepEqual(Identitet.brister(i), []);
  assert.equal(i.identityName, '55555ProvUtgivare.VYRA');
  assert.equal(i.publisher, 'CN=00000000-1111-2222-3333-444444444444');
});

test('varje saknat fält nekas, och felet säger var värdet hämtas', () => {
  for (const utelamnad of Object.keys(GILTIG)) {
    const env = { ...GILTIG };
    delete env[utelamnad];
    const fel = Identitet.brister(Identitet.las(env));
    assert.equal(fel.length, 1, `${utelamnad} skulle ha gett exakt en brist`);
    assert.match(fel[0], /Partner Center/, 'felet måste peka ut var värdet finns');
    assert.match(fel[0], new RegExp(utelamnad), 'och namnge miljövariabeln');
  }
});

test('platshållare räknas som saknade — inte som ifyllda', () => {
  // Det farliga fallet: ett kvarglömt exempelvärde bygger, signeras och skickas in, och först
  // certifieringen säger ifrån.
  for (const platshallare of ['<ange>', 'TODO', 'xxxx', 'placeholder', 'ANGE']) {
    const env = { ...GILTIG, VYRA_STORE_PUBLISHER_DISPLAY_NAME: platshallare };
    assert.equal(Identitet.arGiltig(Identitet.las(env)), false, `"${platshallare}" släpptes igenom`);
  }
  // Och exempelutgivare i X.500-form.
  assert.equal(Identitet.arGiltig(Identitet.las({ ...GILTIG, VYRA_STORE_PUBLISHER: 'CN=Example' })), false);
});

test('publisher måste vara hela X.500-strängen', () => {
  const env = { ...GILTIG, VYRA_STORE_PUBLISHER: 'Provutgivaren AB' };
  const fel = Identitet.brister(Identitet.las(env));
  assert.equal(fel.length, 1);
  assert.match(fel[0], /CN=/, 'felet ska säga vilken form som krävs');
});

test('identityName med fel tecken nekas', () => {
  for (const fel of ['har mellanslag', 'har/snedstreck', '', 'a']) {
    assert.equal(Identitet.arGiltig(Identitet.las({ ...GILTIG, VYRA_STORE_IDENTITY_NAME: fel })), false,
      `"${fel}" släpptes igenom`);
  }
});

test('krav() kastar med instruktion i stället för att gissa', () => {
  assert.throws(() => Identitet.krav({}), fel => {
    assert.match(fel.message, /får inte gissas/);
    for (const f of Identitet.FALT) {
      assert.match(fel.message, new RegExp(f.partnerCenter.replace(/[/]/g, '.')),
        `${f.partnerCenter} ska namnges i felet`);
    }
    return true;
  });
  // KONTROLLMÄTNING: med värden kastar den inte.
  assert.ok(Identitet.krav(GILTIG).identityName);
});

test('env vinner över filen, så CI slipper committa värdena', () => {
  const i = Identitet.las(GILTIG);
  assert.equal(i.publisherDisplayName, 'Provutgivaren');
});

test('identiteten finns INTE committad — den ska hämtas, inte ärvas', () => {
  // Skulle någon checka in en riktig identitet blir den svår att skilja från en gissning senare.
  assert.equal(fs.existsSync(Identitet.FIL), false,
    'store-identitet.json ska inte ligga i repot — mata in värdena via miljön');
});

// ---- BYGGKONFIGURATIONEN ------------------------------------------------------------------------

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('appx-blocket bär allt UTOM identiteten', () => {
  const appx = pkg.build.appx;
  assert.ok(appx, 'appx-konfigurationen saknas');
  assert.equal(appx.electronUpdaterAware, false, 'Store äger uppdateringarna');
  assert.ok(Array.isArray(appx.languages) && appx.languages.includes('sv-SE'));

  // Identiteten får ALDRIG stå här — den matas in vid bygget, från Partner Center.
  for (const falt of ['identityName', 'publisher', 'publisherDisplayName']) {
    assert.equal(appx[falt], undefined, `${falt} ligger hårdkodad i package.json`);
  }
});

test('NSIS-vägen är orörd — Store-arbetet får inte ta med sig .exe-bygget', () => {
  assert.equal(pkg.build.win.target, 'nsis', 'det befintliga .exe-målet ska stå kvar');
  assert.deepEqual(pkg.build.files,
    ['main.js', 'local-server.js', 'tiktok-service.js', 'obs-service.js', 'updater.js',
     'update-config.json', 'splash.html', 'icon.ico'],
    'paketlistan för appen ska vara oförändrad');
});

test('byggverktygen följer INTE med in i appen', () => {
  // bygg-store.js och store-identitet.js kör på byggmaskinen. Hamnar de i `files` skickas de med i
  // varje installation utan att göra nytta där.
  for (const verktyg of ['bygg-store.js', 'store-identitet.js']) {
    assert.ok(!pkg.build.files.includes(verktyg), `${verktyg} ska inte paketeras`);
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
