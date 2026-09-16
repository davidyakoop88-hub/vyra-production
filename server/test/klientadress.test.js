'use strict';
// KLIENTENS ADRESS BAKOM EN PROXY — härledningen, och tillitsgränsen runt den.
//
// `req.socket.remoteAddress` är adressen på den som pratar med oss. Bakom en proxy är det PROXYNS
// adress, samma sträng för varje besökare i världen. Det gjorde AUTH_RATE_LIMIT=10 till ett GLOBALT
// tak: elva misslyckade försök från vem som helst låste ute alla andra från login, register och
// lösenordsåterställning under resten av fönstret. Samma rot gjorde `ip_hash` identisk för alla
// sessioner. Det är #346, del 2.
//
// DET HÄR PROVET HANDLAR INTE OM ATT LÄSA EN HEADER RÄTT. Det handlar om att inte öppna ett hål i
// samma andetag. X-Forwarded-For sätts av klienten lika gärna som av en proxy: litar man på den utan
// att veta att en proxy står framför, kan vem som helst skriva en ny adress vid varje försök och få
// en färsk hink — alltså INGET tak alls, vilket är sämre än ett för grovt.
//
// Därför tre påståenden, och det andra är det som betyder något:
//
//   1. Utan BETRODD_PROXY ignoreras headern helt — dagens beteende, ingen ny väg in.
//   2. En KLIENTSTYRD post längst fram plockas aldrig. Det är det vanliga misstaget.
//   3. Med BETRODD_PROXY används sista posten — den enda en betrodd proxy själv har skrivit.
//
// Ingen databas behövs: härledningen är ren. HTTP-provet som mäter att hinken faktiskt följer med
// ligger i verifieringsmejl-tak.test.js grannskap och kräver Redis.
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../security');

const req = (xff, sock = '10.0.0.1') => ({
  headers: xff === null ? {} : { 'x-forwarded-for': xff },
  socket: { remoteAddress: sock }
});

test('utan BETRODD_PROXY ignoreras X-Forwarded-For helt', () => {
  // Dagens beteende, oförändrat. En uppsättning där servern går att nå direkt får INTE bli sämre av
  // den här ändringen: där är headern helt klientstyrd och att läsa den vore att ta bort taket.
  assert.equal(S.klientadress(req('1.2.3.4'), {}), '10.0.0.1');
  assert.equal(S.klientadress(req('1.2.3.4, 5.6.7.8'), { BETRODD_PROXY: '0' }), '10.0.0.1');
  assert.equal(S.klientadress(req('1.2.3.4'), { BETRODD_PROXY: 'true' }), '10.0.0.1',
    'bara strängen "1" duger — "true" är inte ett ja, och en halvsatt variabel ska inte öppna något');
});

test('SÄKERHETEN: en påhittad post längst fram plockas aldrig', () => {
  // Angriparen skickar sin egen kedja. Proxyn lägger sin observation SIST. Läser vi den första
  // posten — det vanliga misstaget — får angriparen en färsk hink vid varje försök genom att bara
  // byta siffra, och taket finns inte längre.
  const hittepa = '66.66.66.66, 203.0.113.9';
  const ut = S.klientadress(req(hittepa), { BETRODD_PROXY: '1' });

  assert.notEqual(ut, '66.66.66.66',
    'FÖRSTA posten användes — den är helt klientstyrd, så vem som helst kan skriva en ny adress vid '
    + 'varje försök och få en färsk hink. Det tar bort taket i stället för att göra det per klient.');
  assert.equal(ut, '203.0.113.9', 'sista posten skulle användas');
});

test('med BETRODD_PROXY används sista posten i kedjan', () => {
  // Gäller oavsett om proxyn ERSÄTTER headern eller LÄGGER TILL sist i den: i båda fallen är sista
  // posten den adress proxyn faktiskt såg.
  assert.equal(S.klientadress(req('203.0.113.9'), { BETRODD_PROXY: '1' }), '203.0.113.9');
  assert.equal(S.klientadress(req('a, b, 203.0.113.9'), { BETRODD_PROXY: '1' }), '203.0.113.9');
  assert.equal(S.klientadress(req('  203.0.113.9  '), { BETRODD_PROXY: '1' }), '203.0.113.9',
    'blanksteg runt posterna ska inte bli en egen hink');
});

test('saknas headern faller den tillbaka på socket-adressen', () => {
  // Gäller anrop inom Railways privata nät, lokala körningar och proven själva. Ett tomt värde får
  // aldrig bli en egen delad hink som alla hamnar i.
  assert.equal(S.klientadress(req(null), { BETRODD_PROXY: '1' }), '10.0.0.1');
  assert.equal(S.klientadress(req(''), { BETRODD_PROXY: '1' }), '10.0.0.1');
  assert.equal(S.klientadress(req(' , , '), { BETRODD_PROXY: '1' }), '10.0.0.1',
    'en kedja med bara separatorer är ingen adress');
});

test('en trasig request kastar inte', () => {
  // Härledningen körs på VARJE anrop, före allt annat. Kastar den är hela API:t nere.
  assert.equal(S.klientadress(undefined, { BETRODD_PROXY: '1' }), '');
  assert.equal(S.klientadress({}, { BETRODD_PROXY: '1' }), '');
  assert.equal(S.klientadress({ headers: {} }, {}), '');
});

// ---- KÄLLVAKT: ingen får gå runt härledningen ---------------------------------------------------
//
// Poängen med EN härledning är att rate-limit-hinken och ip_hash aldrig kan glida isär. Skriver
// någon `req.socket.remoteAddress` direkt igen är den ena tillbaka på proxyns adress medan den andra
// inte är det, och ingen märker något förrän taket beter sig konstigt i drift.
test('index.js läser aldrig req.socket.remoteAddress direkt', () => {
  const fs = require('fs'), path = require('path');
  const kalla = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
    .split('\n')
    .map(rad => (/^\s*\/\//.test(rad) ? '' : rad))   // hel kommentarrad, även indragen
    .join('\n');

  const traffar = [...kalla.matchAll(/req\.socket\.remoteAddress/g)];
  assert.equal(traffar.length, 0,
    `${traffar.length} ställe(n) i index.js läser req.socket.remoteAddress direkt i stället för `
    + 'S.klientadress(req). Bakom en proxy är den adressen proxyns egen, samma för alla besökare.');
});

test('produktionen kan inte starta utan BETRODD_PROXY', () => {
  // Utan kravet blir hela fixen en tyst no-op i drift den dag någon glömmer variabeln — och det
  // syns inte på något annat sätt än att taket beter sig som förut.
  const kalla = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'production-config.js'), 'utf8');
  assert.match(kalla, /BETRODD_PROXY/,
    'production-config.js kräver inte BETRODD_PROXY — fixen kan då glömmas bort tyst i produktion');
});
