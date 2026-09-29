'use strict';
// PANELEN SOM AVGÖR OM FRITEXTVÄGEN FÅR STÄNGAS.
//
// `VYRA_TIKTOK_VERIFIERING_KRAVS=1` stänger den enda väg in i tiktok_connections som inte kräver en
// verifierad TikTok-inloggning. Sätts den för tidigt låses varenda kund ute samtidigt — och det
// syns inte i något prov, för servern svarar precis som den ska.
//
// Beslutet vilar på EN observation: har något annat konto än sandboxens testanvändare verifierats?
// Sandbox-nycklarna släpper in exakt ett konto, så en lista där bara det kontot står är förenlig
// både med "produktionsnycklarna sitter" och med "bytet tog aldrig". Panelen finns för att göra den
// skillnaden synlig, och de tre proven nedan vaktar just det som gör den läsbar.
//
// KÄLLVAKT, inte ett ruttprov: rutten kräver Postgres, och utan databas hade filen hoppat över sig
// själv och blivit grön av tomhet. Den läser källan i stället, och körs därför i CI:s test-client.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('rutten ligger INNANFÖR adminspärren, inte bredvid den', () => {
  const server = read('server/index.js');
  const spärr = server.indexOf("if(p.startsWith('/api/admin/')){if(!s.is_platform_admin)");
  const rutten = server.indexOf("p==='/api/admin/tiktok-verifieringar'");
  assert.ok(spärr !== -1, 'adminspärren ska finnas kvar');
  assert.ok(rutten !== -1, 'rutten /api/admin/tiktok-verifieringar ska finnas');
  // Ordningen ÄR spärren. En rutt som råkar hamna före kontrollen är öppen för vem som helst som
  // är inloggad, och svarar med varje verifierad kunds TikTok-handtag. Prefixet i sökvägen ser
  // likadant ut i båda fallen, så bara positionen kan skilja dem åt.
  assert.ok(spärr < rutten,
    'rutten måste ligga efter is_platform_admin-kontrollen — annars läcker den kundernas handtag');
});

test('bara verifierade rader läses, och antalet räknas separat', () => {
  const server = read('server/index.js');
  // Utan WHERE-villkoret listas även OVERIFIERADE handtag. Panelen hade då visat fritextskrivna
  // namn som om de vore bevisade, vilket är exakt det beslut den ska skydda mot.
  assert.match(server,
    /SELECT tiktok_username,visningsnamn,verifierad_at,active FROM tiktok_connections WHERE verifierad_at IS NOT NULL/,
    'listan ska bara innehålla rader med verifierad_at');
  assert.match(server,
    /SELECT count\(\*\)::int n FROM tiktok_connections WHERE verifierad_at IS NOT NULL/,
    'antalet ska räknas i en egen fråga');
  // LIMIT och summa i samma fråga ger ett tak som ser ut som en summa. Två frågor är hela poängen.
  const lista = server.indexOf('ORDER BY verifierad_at DESC LIMIT 200');
  const summa = server.indexOf('SELECT count(*)::int n FROM tiktok_connections');
  assert.ok(lista !== -1 && summa !== -1 && lista < summa,
    'listan hämtas med LIMIT och summan räknas separat efteråt');
});

test('panelen räknar UNIKA handtag och säger vad antalet betyder', () => {
  const js = read('operations.js');
  const html = read('operations.html');
  assert.match(html, /id="verifieringar"/, 'panelen behöver sitt fäste i operations.html');
  assert.match(js, /laddaVerifieringar/, 'hämtningen ska finnas');
  assert.match(js, /vyra-auth-ready',laddaVerifieringar/, 'den ska köras när inloggningen är klar');
  // DET HÄR ÄR PROVETS KÄRNA. Ett antal ensamt svarar inte på frågan: fem verifieringar av SAMMA
  // konto är fortfarande noll bevis. Bara antalet unika handtag skiljer sandbox från produktion,
  // och panelen måste räkna dem — inte raderna.
  assert.match(js, /new Set\(rader\.map\(nyckel\)\)\.size/,
    'unika handtag måste räknas, inte antalet rader');
  // MÄTT, INTE ANTAGET: första versionen jämförde bara gemener, och @JokerO060 räknades då som ett
  // annat konto än jokero060. Panelen sa "produktionsnycklarna bär" med ETT verifierat konto —
  // det falska klartecken som hade låst ute varenda kund. Båda stegen måste stå kvar.
  assert.match(js, /String\(rad\.tiktok_username\|\|''\)\.replace\(\/\^@\/,''\)\.toLowerCase\(\)/,
    'snedstrecket måste bort INNAN jämförelsen, inte bara versalerna');
  assert.match(js, /unika>1/, 'beskedet ska hänga på om FLER ÄN ETT handtag verifierats');
  assert.match(js, /vänta med att stänga fritextvägen/i,
    'ett ensamt konto ska säga åt läsaren att vänta, inte bara visa en siffra');
});
