'use strict';
// Supportsystemet ska faktiskt ga att na.
//
// Hela kedjan fanns byggd och kopplades av ingen:
//
//   support-client.js   komplett arendeformular + "Mina arenden" + global felrapportering
//   support-client.css  stylar .support-grid/.support-form/.support-history/.support-list
//   server/index.js     /api/support/tickets (GET+POST), /api/client-errors (POST), adminvyer
//   schema.sql          support_tickets, support_replies, client_error_reports
//
// Ingen laddade de tva klientfilerna. support-client.js band mot [data-extra="wishlist"], och den
// knappen hade redan tagits over av wishlist.js.
//
// OCH WISHLIST-KNAPPEN AR TRASIG. wishlist.js sparar onskemalet i localStorage och oppnar sedan
// anvandarens e-postklient mot WISHLIST_EMAIL — som fortfarande ar 'TODO@exempel.se'. Varje
// onskemal nagon "skickat" har adresserats till en platshallare.
//
// Darfor tar Support over sjalva knappen i stallet for att fa en egen bredvid: det ar samma avsikt,
// samma plats i sidomenyn, och support-formularets kategori "Idé eller önskemål" tacker det
// wishlist skulle gora. wishlist.js sjalv ror vi INTE — dess lagringsnyckel ar inflatad i
// cloud-sync, session-state och state-backup, och alla de rakningarna galler nyckeln, aldrig knappen.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const STUDIO = las('studio.html');
const MEDIA = las('media.js');
const KLIENT = las('support-client.js');

// ---- 1. knappen ---------------------------------------------------------------------------------

test('sidomenyn har en support-knapp', () => {
  assert.match(STUDIO, /data-extra="support"/,
    'ingen ingang till supportsystemet — hela kedjan forblir onabar');
});

test('support-knappen ligger kvar i sidomenyns nedre block', () => {
  // Samma plats som forut: mellan navigationen och Installningar, dar en feedback-ingang hor hemma.
  const block = STUDIO.slice(STUDIO.indexOf('aside-bottom'), STUDIO.indexOf('class="user"'));
  assert.match(block, /data-extra="support"/, 'knappen hamnade utanfor aside-bottom');
  assert.match(block, /data-view="settings"/, 'blocket ser inte ut som forvantat langre');
});

test('knappen behaller sin egen stilklass', () => {
  const rad = STUDIO.split('\n').find(l => /data-extra="support"/.test(l)) || '';
  assert.match(rad, /sidebar-feedback-cta/,
    'utan klassen tappar knappen sin utformning i sidomenyn');
});

test('ingen knapp pekar langre pa wishlist', () => {
  assert.doesNotMatch(STUDIO, /data-extra="wishlist"/,
    'tva knappar for samma sak, och den ena skickar till TODO@exempel.se');
});

// ---- 2. laddningen ------------------------------------------------------------------------------

test('media.js laddar support-client.js', () => {
  assert.match(MEDIA, /support-client\.js/, 'filen laddas fortfarande av ingen');
});

test('media.js laddar support-client.css', () => {
  // Samma par-regel som tests/stylesheet-pairs.test.js vaktar: skriptet utan stilmallen ger en
  // ostylad vy, precis som sakerhetskopiedialogen hade.
  assert.match(MEDIA, /support-client\.css/, 'vyn skulle renderas ostylad');
});

// ---- 3. bindningen ------------------------------------------------------------------------------

test('support-client binder mot sin egen knapp, inte wishlists', () => {
  assert.match(KLIENT, /\[data-extra="support"\]/, 'binder fortfarande mot wishlist-knappen');
  assert.doesNotMatch(KLIENT, /data-extra="wishlist"/,
    'en kvarvarande wishlist-referens gor att knappen aldrig markeras aktiv');
});

// ---- 4. felrapporteringen -----------------------------------------------------------------------

test('felrapporteringen aktiveras nar filen laddas', () => {
  // Den sitter pa modulnivan med flit: den ska fanga fel aven for en anvandare som aldrig oppnar
  // supportvyn. Flyttas den in i show() rapporteras ingenting forran nagon klickar.
  for (const handelse of ['error', 'unhandledrejection']) {
    assert.match(KLIENT, new RegExp(`addEventListener\\('${handelse}'`),
      `${handelse} fangas inte upp`);
  }
});

test('felrapporten gar till endpointen servern faktiskt har', () => {
  assert.match(KLIENT, /'\/api\/client-errors'/);
  assert.match(las('server/index.js'), /p==='\/api\/client-errors'&&req\.method==='POST'/,
    'klienten postar till en rutt servern inte har');
});

test('samma fel rapporteras inte om och om igen', () => {
  // En trasig render kan kasta i varje bildruta. Utan avduplicering blir det tusentals rader i
  // client_error_reports for ett enda fel.
  assert.match(KLIENT, /sessionStorage/, 'ingen minnesbild av vad som redan rapporterats');
  assert.match(KLIENT, /sent\.has\(key\)/, 'ingen kontroll mot det som redan skickats');
});

test('inget rapporteras for en utloggad besokare', () => {
  assert.match(KLIENT, /VyraAuth\?\.currentUser\?\.\(\)/,
    'en utloggad besokare skulle posta fel till en endpoint som kraver session');
});

// ---- 5. arendena --------------------------------------------------------------------------------

test('formularet postar till den rutt servern har', () => {
  assert.match(KLIENT, /'\/api\/support\/tickets'[^)]*method:\s*'POST'/);
  const server = las('server/index.js');
  assert.match(server, /p==='\/api\/support\/tickets'&&req\.method==='POST'/);
  assert.match(server, /p==='\/api\/support\/tickets'&&req\.method==='GET'/);
});

test('tabellerna finns i schemat', () => {
  const schema = las('server/schema.sql');
  for (const tabell of ['support_tickets', 'client_error_reports']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${tabell}`), `${tabell} saknas`);
  }
});

test('anvandarens egna texter skrivs som text, inte som HTML', () => {
  // Amne och kategori kommer tillbaka fran servern och ritas i "Mina arenden".
  assert.match(KLIENT, /esc\(ticket\.subject\)/, 'arendets amne skrivs oescapat');
  assert.match(KLIENT, /esc\(ticket\.category\)/);
});

// ---- 6. wishlist ar orord -----------------------------------------------------------------------

test('wishlist.js och dess lagring ar ororda', () => {
  // Nyckeln vyra-wishlist ar inflatad i cloud-sync, session-state och state-backup. Bara knappen
  // byter agare; filen och dess data ror vi inte.
  assert.ok(fs.existsSync(path.join(ROOT, 'wishlist.js')), 'wishlist.js togs bort');
  assert.match(MEDIA, /wishlist\.js/, 'wishlist.js slutade laddas — dess sync-integration bryts');
  for (const fil of ['cloud-sync.js', 'session-state.js', 'state-backup.js']) {
    assert.match(las(fil), /vyra-wishlist/, `${fil} tappade lagringsnyckeln`);
  }
});

test('wishlist kraschar inte nar dess knapp ar borta', () => {
  // renderWishlist laser knappen med optional chaining. Utan den hade varje klick i sidomenyn
  // kastat sa fort knappen forsvann.
  assert.match(las('wishlist.js'), /querySelector\('\[data-extra="wishlist"\]'\)\?\./,
    'wishlist.js laser knappen utan optional chaining och kastar nu nar den inte finns');
});
