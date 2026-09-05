'use strict';
// VILKA AUTH-RUTTER SOM RÄKNAS SOM KÄNSLIGA.
//
// index.js har två hastighetstak: ett strängt för auth (10 försök) och ett vidlyftigt för resten
// (120). Vilket som gäller avgörs av EN regex, och `/api/auth/email/send-verification` saknades i
// den — bara `email/verify` stod där. Rutten SKICKAR MEJL, så den låg på det vidlyftiga taket.
//
// Det blev viktigt när verifieringstoken slutade radera varandra (server/auth-flow.js): utan den
// här spärren hade den ändringen bytt en irriterande bugg mot en väg att skicka obegränsat med mejl
// och fylla på rader i auth_tokens.
//
// MÖNSTRET LÄSES UR index.js och körs på riktigt. En kopia här hade glidit isär den dag någon
// ändrar listan — och då hade provet varit grönt medan verkligheten var en annan, vilket är värre
// än inget prov. Kan mönstret inte läsas faller provet hellre än att tiga.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

function kansligMonster() {
  const kalla = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  // Icke-girigt fram till `/.test` — mönstret innehåller escapade snedstreck (\/), så en
  // teckenklass som stannar vid första `/` plockar bara upp en trasig bit.
  const m = /sensitiveAuth\s*=\s*\/(.+?)\/\.test\(/.exec(kalla);
  return m ? new RegExp(m[1]) : null;
}

test('monstret gar att lasa ur index.js', () => {
  assert.ok(kansligMonster(), 'kunde inte hitta sensitiveAuth-regexen — provet kan inte veta vad '
    + 'som ar kansligt och far da inte pasta att allt ar bra');
});

test('varje rutt som provar hemligheter ligger pa det stranga taket', () => {
  const re = kansligMonster();
  const KANSLIGA = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/password/request',
    '/api/auth/password/reset',
    '/api/auth/email/verify',
    '/api/auth/mfa/challenge',
  ];
  const saknas = KANSLIGA.filter(p => !re.test(p));
  assert.deepEqual(saknas, [], 'dessa rutter far det VIDLYFTIGA taket (120 i stallet for 10): '
    + saknas.join(', '));
});

test('send-verification ligger MEDVETET utanfor den delade hinken', () => {
  // Den las forst hit, och det var fel. Hinken nycklas pa `req.socket.remoteAddress`, vilket bakom
  // Caddy ar PROXYNS adress — samma strang for varje besokare. Den ar alltsa GLOBAL, inte per
  // klient. En otalig kund som klickade "Skicka igen" elva ganger hade last ute alla andra fran
  // inloggning och verifiering under resten av fonstret.
  //
  // Varre for den bugg andringen skulle laga: anvandarens EGET klick pa verifieringslanken gar mot
  // samma hink (`email/verify` star kvar dar, med ratt), och klienten ritar varje fel som "Lanken
  // fungerar inte" — exakt symtomet, med en ny orsak.
  //
  // Rutten har i stallet ett EGET tak nycklat pa anvandar-id i index.js, sa ett konto kan bara
  // sparra sig sjalvt.
  assert.equal(kansligMonster().test('/api/auth/email/send-verification'), false,
    'send-verification hor inte i den DELADE hinken — den har ett eget tak per anvandare');
});

test('vanliga rutter dras INTE in i det stranga taket', () => {
  // En spärr som tar allt vore lika fel: 10 anrop per fonster hade gjort Studion oanvandbar.
  const re = kansligMonster();
  const VANLIGA = [
    '/api/auth/me',
    '/api/auth/logout',
    '/api/workspaces/abc/overlays',
    '/api/auth/email/verify/nagot',        // liknar men ar inte rutten — $ i monstret ska halla
    '/api/auth/login/extra',
  ];
  const felaktigt = VANLIGA.filter(p => re.test(p));
  assert.deepEqual(felaktigt, [], 'dessa ar inte kansliga men traffas anda: ' + felaktigt.join(', '));
});
