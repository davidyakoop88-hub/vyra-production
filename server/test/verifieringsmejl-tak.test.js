'use strict';
// TAKET FÖR VERIFIERINGSMEJL — och att det inte delar hink med inloggningen.
//
// `/api/auth/email/send-verification` fick ett eget tak nycklat på user_id när verifieringstoken
// slutade radera varandra (#338). Utan taket hade den ändringen bytt en irriterande bugg mot en väg
// att skicka obegränsat med mejl i någon annans namn: registrera med offrets adress, tryck
// "skicka igen" hur många gånger som helst.
//
// SPÄRREN HADE INGET PROV. Mutationsprövat 2026-09-05: raden kan tas bort och hela sviten förblir
// grön. Det är #346.
//
// DET VÄRDEFULLA ÄR INTE ATT SPÄRREN FINNS — DET ÄR ATT HINKARNA ÄR ÅTSKILDA.
//
// Den delade auth-hinken nycklas på `req.socket.remoteAddress` (index.js:314), vilket bakom en
// proxy är PROXYNS adress och alltså samma sträng för varje besökare. Hade verifieringsmejlen
// lagts i den hinken — vilket var första försöket — skulle en otålig kund som trycker sex gånger
// ha låst ute ALLA andra från inloggning, registrering och lösenordsåterställning under resten av
// fönstret. Värre: användarens eget klick på verifieringslänken går mot samma hink, så felet hade
// dykt upp som "Länken fungerar inte" — exakt det symtom #338 fanns till för att ta bort.
//
// Därför mäter provet i två steg. Steg ett visar att taket biter. Steg två visar att inloggningen
// FORTFARANDE fungerar efter att taket slagit i. Faller den delade hinken tillbaka in märks det i
// steg två, inte av en kund.
//
// BLOCKERAT utan isolerad Postgres och Redis: taket räknas i Redis och sessionen lever i Postgres.
// En attrapp för endera hade bevisat att koden anropar det provet väntar sig — inte att spärren
// håller. Filen måste stå i den EXPLICITA fillistan i .github/workflows/goal-runtime-postgres.yml,
// annars körs den aldrig (samma fälla som #352: sex provfiler ingen körde).
const test = require('node:test'), assert = require('node:assert/strict');
const net = require('node:net');
const crypto = require('node:crypto');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
if (DB_URL) process.env.DATABASE_URL = DB_URL;
process.env.TIKTOK_INGEST_TOKEN = process.env.TIKTOK_INGEST_TOKEN || 'prov-ingest-token-0123456789';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 13).toString('base64url');

let BLOCKED = DB_URL ? null : 'BLOCKERAT: ingen isolerad Postgres.';
async function blockerad() {
  if (BLOCKED !== null) return BLOCKED;
  const url = new URL(REDIS_URL);
  BLOCKED = await new Promise(klar => {
    const s = net.connect({ host: url.hostname, port: Number(url.port) || 6379 });
    const av = svar => { s.destroy(); klar(svar); };
    s.once('connect', () => av(''));
    s.once('error', () => av('BLOCKERAT: ingen Redis.'));
    s.setTimeout(1500, () => av('BLOCKERAT: Redis svarade inte.'));
  });
  return BLOCKED;
}

let server = null, eventBus = null, pool = null, S = null, bas = '';

// FÄRSKT ANVÄNDAR-ID VID VARJE KÖRNING. Taket räknas i Redis på `verifieringsmejl:<user_id>` och
// lever en timme. Med ett fast id hade en andra körning inom samma timme börjat med hinken redan
// full och fått 429 på FÖRSTA anropet — provet hade då fallit utan att något var fel, och den
// sortens flackning lär en att sluta lita på rött.
const ANV = crypto.randomUUID();
const LOSEN = 'Prov-Losenord-9134!';

async function session() {
  const ra = S.token(), csrf = S.token();
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)' +
    " VALUES ($1,$2,$3, now() + interval '1 hour', now())",
    [ANV, S.digest(ra), S.digest(csrf)]);
  return { cookie: 'vyra_session=' + ra, csrf };
}

async function anrop(vag, kropp, vem) {
  const res = await fetch(bas + vag, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' },
      vem ? { cookie: vem.cookie, 'x-vyra-csrf': vem.csrf } : {}),
    body: JSON.stringify(kropp || {})
  });
  const text = await res.text();
  let d = null; try { d = JSON.parse(text) } catch { /* inte json */ }
  return { status: res.status, body: d };
}

const prov = (namn, fn) => test('verifieringsmejl-tak: ' + namn, { timeout: 30000 }, async t => {
  const skal = await blockerad();
  if (skal) { t.skip(skal); return; }
  await fn();
});

test.before(async () => {
  if (await blockerad()) return;
  S = require('../security');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  // email_verified_at MÅSTE vara NULL. Rutten svarar 200 {verified:true} direkt för ett redan
  // verifierat konto och når aldrig taket — provet hade då mätt genvägen i stället för spärren.
  await pool.query(
    'INSERT INTO users (id,email,password_hash,display_name)' +
    " VALUES ($1,$2,$3,'takprov')",
    [ANV, ANV + '@t.invalid', S.hashPassword(LOSEN)]);

  await new Promise(klar => server.listen(0, '127.0.0.1', klar));
  bas = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
  if (await blockerad()) return;
  await pool.query('DELETE FROM sessions WHERE user_id=$1', [ANV]);
  await pool.query('DELETE FROM auth_tokens WHERE user_id=$1', [ANV]);
  await pool.query('DELETE FROM notification_outbox WHERE recipient=$1', [ANV + '@t.invalid']);
  await pool.query('DELETE FROM users WHERE id=$1', [ANV]);
  // TEARDOWN I TRE DELAR, och alla tre behovs. Utan closeAllConnections haller keep-alive-
  // anslutningarna fran filens egna fetch-anrop servern oppen, sa server.close() loser aldrig ut och
  // HELA CI-jobbet hanger i stallet for att falla. Redis-prenumerationen och Postgres-poolen haller
  // handelseloopen vid liv efter sista provet. Vaktat av tests/goal-postgres-flode.test.js, som
  // fangade precis det har i den har filen innan den ens korts en gang.
  await new Promise(klar => {
    server.close(klar);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.end();
});

prov('femte utskicket går igenom, sjätte nekas', async () => {
  const vem = await session();
  const svar = [];
  for (let i = 0; i < 6; i++) svar.push((await anrop('/api/auth/email/send-verification', {}, vem)).status);

  assert.deepEqual(svar.slice(0, 5), [202, 202, 202, 202, 202],
    `de fem första utskicken skulle accepteras, fick ${svar.slice(0, 5).join(', ')}`);
  assert.equal(svar[5], 429,
    'det SJÄTTE utskicket gick igenom — taket på fem per timme finns inte längre, och rutten kan '
    + 'skicka obegränsat med mejl i någon annans namn (registrera med offrets adress, tryck igen)');
});

prov('inloggningen fungerar ÄNDÅ — hinkarna är åtskilda', async () => {
  // Hela poängen. Taket ovan är redan fullt för det här kontot. Skulle verifieringsmejlen dela
  // hink med inloggningen vore den nu stängd — för alla, eftersom den hinken nycklas på proxyns
  // adress och därmed är gemensam för hela sajten.
  const svar = await anrop('/api/auth/login', { email: ANV + '@t.invalid', password: LOSEN });

  // TVA OLIKA FEL DELAR STATUSKOD 429 pa den har rutten: den delade hinken svarar
  // "For manga forsok", och kontosparren efter flera misslyckade inloggningar svarar "Kontot ar
  // tillfalligt sparrat". Bara det forsta ar det har provet handlar om. Att bara kolla 429 hade
  // gett ett vilseledande felmeddelande den dagen kontosparren av nagon anledning trippar.
  const fel = String((svar.body && svar.body.error) || '');
  assert.ok(!(svar.status === 429 && fel.includes('många försök')),
    'inloggningen nekades av den DELADE auth-hinken efter att verifieringsmejlen slagit i taket — '
    + 'hinkarna har slagits ihop igen. Den hinken nycklas på proxyns adress, så det här låser inte '
    + 'bara det här kontot utan ALLA besökare ute från login, register och lösenordsåterställning.');
  assert.equal(svar.status, 200,
    `inloggningen svarade ${svar.status} (${svar.body && svar.body.error}) — förväntade 200`);
});

prov('ett redan verifierat konto tar genvägen och rör inte hinken', async () => {
  // Skyddar taket från att räknas ner av anrop som ändå inte skickar något mejl. Kontot är kvar
  // på fullt tak sedan första provet; svarar rutten 200 här har genvägen körts FÖRE spärren, vilket
  // är rätt ordning.
  await pool.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [ANV]);
  const vem = await session();
  const svar = await anrop('/api/auth/email/send-verification', {}, vem);

  assert.equal(svar.status, 200,
    `ett verifierat konto fick ${svar.status} i stället för genvägen 200 — spärren ligger före `
    + 'kontrollen av email_verified_at, och en kund som redan är verifierad möts av ett fel');
  assert.equal(svar.body && svar.body.verified, true, 'svaret sade inte verified:true');
});
