'use strict';
// Kartjobbets VAG TILL MAIN — inte kartans innehall (det vaktas av katalogkarta-proveniens).
//
// Nar main far obligatoriska statuskontroller kan GITHUB_TOKEN inte langre pusha dit. Kartjobbet
// pushar EFTER att kontrollerna redan kort, sa det hade dott tyst den dagen kravet slogs pa.
// Valet blev en deploy key som bypass-aktor i rulesetet: en credential bunden till DET HAR repot,
// utan koppling till nagon anvandares konto — inte rollen Write, sa agaren bypassar inte sitt
// eget krav.
//
// Var och en av delarna nedan kan tas bort i en ovarsam redigering utan att nagot ser fel ut
// forran kartan tyst slutar uppdateras. Darfor ett prov per del.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const CI = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8');

// Jobbets egen text, klippt fran 'katalogkarta:' till nasta jobb pa samma indrag. Att lasa hela
// filen hade gjort proven blinda for VAR en rad star — en ssh-key i ett annat jobb ar inte samma
// sak som en ssh-key har.
function jobbet() {
  const start = CI.indexOf('\n  katalogkarta:');
  assert.ok(start > -1, 'jobbet katalogkarta finns inte langre i ci.yml');
  const efter = CI.slice(start + 1);
  const nasta = efter.search(/\n {2}[a-z0-9_-]+:\n/);
  return nasta > -1 ? efter.slice(0, nasta) : efter;
}

// KOMMENTARSFRI KOPIA for de prov som letar efter FORBJUDNA monster.
//
// Ett prov som soker efter nagot som inte far finnas maste strippa kommentarerna forst, annars
// faller det pa sin egen forklaring om varfor monstret ar forbjudet. Huset har gatt pa den minan
// flera ganger — electron-app/test/store-leverans.test.js bar samma strippning av samma skal, och
// den har filen foll pa den direkt: kommentaren i ci.yml visar det ogiltiga `if:`-villkoret som
// exempel, och provet last exemplet som en overtradelse.
//
// Bara for FRANVAROPASTAENDEN. Provet som kraver att nagot FINNS ska las den riktiga texten, sa
// att en rad som rakat hamna i en kommentar inte kan passera som en riktig instruktion.
const NYRAD = String.fromCharCode(10);
// Radslutets CR maste bort FORE strippningen: punkt i ett JavaScript-regex matchar inte en
// radbrytning, och CR raknas som en sadan. Med CRLF-radslut traffade darfor kommentarsregexen
// aldrig till radens slut, kommentarerna blev kvar, och vakten last husets egen exempeltext
// som om den vore kod.
const CR = String.fromCharCode(13);
const utanKommentarer = text => text.split(NYRAD)
  .map(rad => rad.split(CR).join('').replace(/(^|\s)#.*$/, '')).join(NYRAD);

test('kartjobbet pushar med deploy key, inte med GITHUB_TOKEN', () => {
  assert.match(jobbet(), /ssh-key:\s*\$\{\{\s*secrets\.KATALOGKARTA_DEPLOY_KEY\s*\}\}/,
    'checkout-steget konfigurerar ingen deploy key — pushen gar via GITHUB_TOKEN och dor den dag '
    + 'main far obligatoriska kontroller');
});

test('token har inte kvar skrivratt den inte anvander', () => {
  const j = jobbet();
  assert.match(j, /permissions:\s*\n\s*contents:\s*read/,
    'jobbet har fortfarande contents: write — en behorighet som inte anvands');
  assert.doesNotMatch(j, /contents:\s*write/, 'contents: write star kvar nagonstans i jobbet');
});

test('persist-credentials stangs inte av', () => {
  // Default ar true. Satts den till false finns ingen credential kvar nar `git push` ska ske,
  // och jobbet faller forst i sista steget — langt fran orsaken.
  assert.doesNotMatch(jobbet(), /persist-credentials:\s*false/,
    'persist-credentials: false tar bort credentialen som pushen behover');
});

test('[skip ci] finns kvar i commitmeddelandet', () => {
  // BARANDE, inte barsele. En GITHUB_TOKEN-push triggar inga workflows; en DEPLOY KEY-push gor
  // det. Utan [skip ci] startar alltsa varje kartpush ett nytt CI-varv. Inget kretslopp — andra
  // varvet ser "kartan ar oforandrad" — men ett helt varv slosat per push.
  assert.match(jobbet(), /git commit -m '[^']*\[skip ci\][^']*'/,
    '[skip ci] ar borta ur kartans commitmeddelande; varje kartpush startar nu ett CI-varv');
});

test('en saknad deploy key namnger sig sjalv i stallet for att ge ett SSH-fel', () => {
  const j = jobbet();
  // Kontrollen gors i SKALET. `secrets` gar inte att lasa i ett steg-`if:` — forsta forsoket
  // gjorde det, och GitHub kunde da inte tolka filen alls: hela workflowen foll bort och alla fem
  // jobb slutade rapportera. Ett trasigt villkor i en vakt tog bort vakterna.
  assert.match(j, /NYCKEL: \$\{\{ secrets\.KATALOGKARTA_DEPLOY_KEY \}\}/,
    'forhandsgrinden nar inte secreten via env');
  assert.match(j, /if \[ -n "\$NYCKEL" \]/, 'grinden kontrollerar inte att nyckeln finns');
  assert.doesNotMatch(utanKommentarer(j), /if:\s*\$\{\{\s*secrets\./,
    'ett steg-villkor laser `secrets` — det gar inte, och GitHub slutar da tolka hela filen');
  assert.ok(j.indexOf('KATALOGKARTA_DEPLOY_KEY saknas') < j.indexOf('actions/checkout'),
    'grinden maste ligga FORE checkout, annars hinner det obegripliga SSH-felet forst');
});

test('jobbet kors fortfarande bara pa push till main', () => {
  // En deploy key med skrivratt i ett jobb som kan startas fran en gren-push vore en helt annan
  // sak an den har ar. Villkoret ar en del av sakerhetsegenskapen, inte bara en optimering.
  assert.match(jobbet(), /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/,
    'kartjobbets korvillkor har andrats — deploy key:n far inte bli natbar fran en gren');
});
