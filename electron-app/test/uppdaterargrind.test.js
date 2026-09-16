'use strict';
// UPPDATERAREN MOT NEDLADDNINGSGRINDEN — med den RIKTIGA klienten, inte ett objektliteral.
//
// Grinden på /api/downloads/windows släpper igenom den som inte ser ut som en webbläsare, så att
// uppdateraren i den installerade appen slipper 401. Vilka huvuden en webbläsare "alltid" skickar
// är dock inte vår kod: det är undici, Node:s fetch. Den mängden ändrades två gånger, och båda
// gångerna gick uppdateraren sönder i produktion — #419 och #421.
//
// #421 lade till ett prov, men det pinnade den uppmätta huvuduppsättningen som ett HANDSKRIVET
// OBJEKTLITERAL. Provet använde alltså ingen klient alls. Ändrar undici sina huvuden igen förblir
// det grönt medan produktionen går sönder på exakt samma sätt. PR #421 skrev själv ner läxan —
// "Provet använde en annan klient än den som ska fungera" — och den läxan är inte färdigdragen
// förrän provet kör en riktig fetch och mäter vad servern FAKTISKT tog emot.
//
// Det gör den här filen. Den startar en http.createServer, låter downloadRelease() anropa den med
// samma fetch som körs i appen, och fäller grinden mot huvudena servern tog emot på riktigt.
//
// ADRESSEN SKRIVS OM, INTE KLIENTEN. validateOrigin() kräver https, och en provserver med riktigt
// certifikat vore ett eget litet projekt utan att mäta något mer. Därför får downloadRelease() en
// https-adress och en fetchImpl som bara byter ut värdnamnet mot provservern — SJÄLVA ANROPET görs
// av samma globala fetch som körs i appen, med samma undici under sig. Det är huvudena som ska vara
// äkta, och de är det.
//
// VARFÖR ANROPET FÅR MISSLYCKAS EFTERÅT: downloadRelease() kontrollerar också att svaret kom över
// https ("Osäker omdirigering blockerades"). Det spelar ingen roll — begäran har då redan nått
// servern, och det är begäran provet mäter.
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const { downloadRelease } = require('../updater.js');
const grind = require(path.join(__dirname, '..', '..', 'server', 'desktop-release.js'));

const METADATA = { version: '1.2.3', sha256: 'a'.repeat(64), sizeBytes: 2048, url: 'https://x.test/a.exe' };

// Startar en server, kör anropet, och lämnar tillbaka huvudena servern SÅG. Anropet förväntas
// kasta — se filhuvudet — så felet sväljs med flit i stället för att döljas i en try i varje prov.
async function huvudenServernSag(anrop) {
  let sedda = null;
  const server = http.createServer((req, res) => {
    sedda = req.headers;
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise(klar => server.listen(0, '127.0.0.1', klar));
  const bas = 'http://127.0.0.1:' + server.address().port;

  // Den enda förfalskningen: adressen. Anropet görs av den globala fetch appen använder.
  const FALSK = 'https://uppdatering.test';
  const fetchImpl = (adress, init) => fetch(String(adress).replace(FALSK, bas), init);

  try { await anrop(FALSK, fetchImpl); } catch (_) { /* svaret är avsiktligt oanvändbart */ }
  await new Promise(klar => { server.close(klar); server.closeAllConnections && server.closeAllConnections(); });
  return sedda;
}

test('downloadRelease säger vem den är — x-vyra-updater: 1 når servern', async () => {
  const h = await huvudenServernSag((bas, fetchImpl) => downloadRelease(bas, METADATA, path.join(__dirname, 'ingen.exe'), fetchImpl));

  assert.ok(h, 'servern fick aldrig någon begäran');
  assert.equal(h['x-vyra-updater'], '1',
    'uppdateraren skickade inte sitt kännetecken. Utan det hänger grindens beslut åter på vilka '
    + 'Sec-Fetch-huvuden undici råkar skicka i användarens Node-version — det som gick sönder två '
    + 'gånger (#419, #421).');
});

test('GRINDEN släpper igenom de huvuden en RIKTIG fetch faktiskt skickade', async () => {
  // Hela poängen med filen. Påståendet mäts mot vad servern tog emot, inte mot en lista någon
  // skrivit av för hand. Byter undici huvuden i morgon faller det här provet — och det är precis
  // vad man vill att det gör.
  const h = await huvudenServernSag((bas, fetchImpl) => downloadRelease(bas, METADATA, path.join(__dirname, 'ingen.exe'), fetchImpl));

  assert.equal(grind.slapperForbi(h), true,
    'grinden stoppade den riktiga uppdateraren. Huvudena servern faktiskt tog emot var:\n  '
    + Object.keys(h).sort().join(', '));
});

test('uppdateraren klassas inte som webbläsare — inte ens om undici lägger till huvuden', async () => {
  // Skiljd från provet ovan med flit: det här mäter den GAMLA vägen (fromBrowser), som fortfarande
  // är kvar för alla andra icke-webbläsare. Skulle undici börja skicka t.ex. sec-fetch-dest faller
  // just det här provet medan det förra står kvar grönt — och då vet vi att kännetecknet är det
  // enda som bär, vilket är värdefull information och inte ett fel.
  const h = await huvudenServernSag((bas, fetchImpl) => downloadRelease(bas, METADATA, path.join(__dirname, 'ingen.exe'), fetchImpl));

  assert.equal(grind.fromBrowser(h), false,
    'undici skickar numera ett huvud ur BROWSER_HEADERS: ' + grind.BROWSER_HEADERS
      .filter(n => typeof h[n] === 'string' && h[n].trim() !== '').join(', ')
      + '. Uppdateraren räddas nu enbart av x-vyra-updater — kontrollera att kännetecknet finns '
      + 'kvar i BÅDA ändarna innan det här provet mjukas upp.');
});

test('KÄNNETECKNET BÄR ENSAMT — även den dag undici börjar skicka webbläsarhuvuden', async () => {
  // DET HÄR ÄR PROVET SOM FAKTISKT VAKTAR #424, och det första utkastet saknade det.
  //
  // De tre proven ovan är alla gröna även om allowlistan tas bort, eftersom uppdateraren i dag
  // släpps igenom på den GAMLA vägen också: den ser inte ut som en webbläsare. Allowlistan spelar
  // roll först den dag undici börjar skicka ett av BROWSER_HEADERS — vilket är exakt det som hände
  // två gånger (#419, #421) och hela skälet till att issuen finns.
  //
  // Så provet spelar upp den dagen: riktiga huvuden från ett riktigt anrop, plus det huvud en
  // framtida undici skulle kunna lägga till. Tas kännetecknet ur grinden faller det här — och bara
  // det här.
  const h = await huvudenServernSag((bas, fetchImpl) => downloadRelease(bas, METADATA, path.join(__dirname, 'ingen.exe'), fetchImpl));
  const framtida = { ...h, 'sec-fetch-dest': 'empty' };

  assert.equal(grind.fromBrowser(framtida), true,
    'kontrollmätning: den påhittade framtiden skulle klassas som webbläsare av den gamla vägen');
  assert.equal(grind.slapperForbi(framtida), true,
    'uppdateraren stoppades den dag undici lade till ett webbläsarhuvud. Kännetecknet '
    + 'x-vyra-updater bär inte ensamt, och då är grinden tillbaka där den var före #424: '
    + 'beroende av en tredje parts nycker mellan versioner.');
});

test('en webbläsare möter fortfarande grinden — kännetecknet öppnar inte för alla', async () => {
  // Grinden ska inte bli en öppen dörr av den här ändringen. Ett riktigt webbläsaranrop bär origin
  // och referer, och de ska fortfarande leda till betalväggen.
  const webblasare = {
    origin: 'https://vyralive.app', referer: 'https://vyralive.app/',
    'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document'
  };
  assert.equal(grind.slapperForbi(webblasare), false, 'en webbläsare slapp förbi betalväggen');
  assert.equal(grind.slapperForbi({ ...webblasare, 'x-vyra-updater': 'true' }), false,
    'ett kännetecken med fel värde öppnade grinden — bara exakt "1" duger');
});
