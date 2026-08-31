'use strict';
// STORE-LEVERANSFLÖDET — vad det får göra, och framför allt vad det inte får.
//
// Flödet bygger ett Store-paket och lämnar det som en privat Actions-artefakt. Det publicerar
// ingenting. Fyra egenskaper skiljer det från en release, och alla fyra kan gå förlorade i en
// ovarsam redigering utan att något ser fel ut:
//
//   1. ENDAST manuell start. En push- eller PR-trigger hade lagt en ~314 MB artefakt på varje
//      körning — precis det som 2026-08-06 fyllde artefaktkvoten och började fälla PR:er som inte
//      hade med desktop-appen att göra.
//   2. ENDAST FRÅN MAIN. Manuell start låter den som kör välja gren, och ett paket byggt ur en
//      feature-gren ser identiskt ut men innehåller kod ingen granskat.
//   3. RETENTION HÖGST ETT DYGN. Artefakten finns för en manuell uppladdning samma dag.
//   4. INGEN PUBLICERING. Ingen tagg, ingen GitHub-release, inget SignPath-anrop — Store-paket
//      signeras av Microsoft efter godkänd certifiering.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOKVAG = path.join(__dirname, '..', '..', '.github/workflows/store-leverans.yml');
const RATEXT = fs.readFileSync(SOKVAG, 'utf8');

// KOMMENTARERNA STRIPPAS FÖRST. Huset har gått på den här minan flera gånger: en vakt som söker
// efter en förbjuden trigger faller på sin EGEN förklarande kommentar om varför triggern är
// förbjuden. Lösningen är att mäta koden, inte prosan — inte att skriva ett listigare mönster.
const FLODE = RATEXT.split(/\r?\n/).map(rad => rad.replace(/(^|\s)#.*$/, '')).join('\n');

// Ett steg = från ett "- " med samma indrag till nästa. Samma delning som ci-artifact-budget.
function steg(kalla) {
  const ut = [];
  let nu = null;
  for (const rad of kalla.split('\n')) {
    if (/^      - /.test(rad)) { if (nu) ut.push(nu.join('\n')); nu = [rad]; }
    else if (nu) nu.push(rad);
  }
  if (nu) ut.push(nu.join('\n'));
  return ut;
}
const STEG = steg(FLODE);

test('flödet triggas ENDAST manuellt', () => {
  const huvud = FLODE.slice(0, FLODE.indexOf('jobs:'));
  assert.match(huvud, /^on:\s*\n\s+workflow_dispatch:\s*$/m, 'on-blocket har fel form');
  for (const forbjuden of ['push:', 'pull_request:', 'schedule:', 'release:']) {
    assert.ok(!huvud.includes(forbjuden),
      forbjuden + ' skulle lägga en ~314 MB artefakt på varje körning');
  }

  // KONTROLLMÄTNING: strippningen får inte ha ätit upp hela filen.
  assert.ok(huvud.includes('workflow_dispatch'), 'huvudet blev tomt — strippningen är för girig');
});

test('flödet får bara köras från main', () => {
  const vakt = STEG.find(s => /Kräv main/.test(s));
  assert.ok(vakt, 'main-vakten saknas');
  assert.match(vakt, /github\.ref.*refs\/heads\/main/s, 'vakten jämför inte mot main');
  assert.match(vakt, /throw/, 'vakten kastar inte — då är den bara en kommentar');

  // Den måste ligga FÖRST. Efter checkout eller npm ci har körningen redan hunnit göra arbete på
  // fel gren, och efter bygget hade paketet redan funnits på disken.
  assert.equal(STEG.indexOf(vakt), 0, 'main-vakten ska vara flödets första steg');
});

test('versionen läses ur package.json — flödet sätter den aldrig själv', () => {
  const las = STEG.find(s => /Läs version/.test(s));
  assert.ok(las, 'versionssteget saknas');
  assert.match(las, /package\.json/);
  assert.ok(!/npm version/.test(FLODE),
    'ett flöde som sätter versionen kan leverera ett paket vars version inte finns i historiken');
});

test('manifestet verifieras FÖRE uppladdningen', () => {
  const verifiera = STEG.findIndex(s => /Verifiera AppX-manifestet/.test(s));
  const ladda = STEG.findIndex(s => /upload-artifact/.test(s));
  assert.ok(verifiera >= 0, 'manifestkontrollen saknas');
  assert.ok(ladda >= 0, 'uppladdningen saknas');
  assert.ok(verifiera < ladda,
    'en felaktig artefakt får aldrig hinna bli hämtbar — kontrollen måste komma först');

  const steget = STEG[verifiera];
  assert.match(steget, /AppxManifest\.xml/, 'manifestet läses inte ur paketet');
  assert.match(steget, /store-identitet\.json/, 'det jämförs inte mot den incheckade identiteten');
  assert.match(steget, /identity\.Version/, 'versionen i manifestet kontrolleras inte');
});

test('SHA256SUMS.txt skapas och följer med', () => {
  const steget = STEG.find(s => /SHA256SUMS/.test(s) && /Get-FileHash/.test(s));
  assert.ok(steget, 'checksummesteget saknas');
  // Utan checksumma är nedladdning genom webbläsare och vidare uppladdning ett steg utan kvitto.
  const ladda = STEG.find(s => /upload-artifact/.test(s));
  assert.match(ladda, /SHA256SUMS\.txt/, 'checksumman följer inte med artefakten');
});

test('artefakten är privat och lever högst ett dygn', () => {
  const ladda = STEG.find(s => /upload-artifact/.test(s));
  const dagar = Number((ladda.match(/retention-days:\s*(\d+)/) || [, NaN])[1]);
  assert.ok(Number.isInteger(dagar) && dagar >= 1 && dagar <= 1,
    'retention-days är ' + dagar + ' — kravet är högst 1');
  assert.match(ladda, /if-no-files-found:\s*error/,
    'en tom uppladdning ska falla, inte tyst ge en artefakt utan paket');
});

test('flödet publicerar INGENTING', () => {
  assert.ok(!/uses:\s*signpath\//.test(FLODE), 'SignPath anropas — Store signeras av Microsoft');
  assert.ok(!/gh release create/.test(FLODE), 'flödet skapar en GitHub-release');
  assert.ok(!/refs\/tags/.test(FLODE), 'flödet rör taggar');
  assert.match(FLODE, /permissions:\s*\n\s+contents:\s*read/,
    'flödet ska bara ha läsrättighet — då kan det inte skapa en release ens av misstag');
});

test('paketet byggs genom samma väg som CI redan provar', () => {
  assert.match(FLODE, /npm run build:store/,
    'en egen byggväg hade kunnat driva isär från den som provas på varje PR');
  assert.match(FLODE, /npm test/, 'proven ska köras innan ett paket lämnas ifrån sig');
});
