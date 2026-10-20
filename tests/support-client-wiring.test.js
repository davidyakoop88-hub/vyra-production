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

test('felfangsten aktiveras nar filen laddas', () => {
  // Den sitter pa modulnivan med flit: den ska fanga fel aven innan nagon oppnar supportvyn, sa
  // att det finns nagot att bifoga nar anvandaren val skriver ett arende. Fangsten SKICKAR inget
  // - se testerna nedan.
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

test('samma fel samlas inte om och om igen', () => {
  // En trasig render kan kasta i varje bildruta. Utan avduplicering och tak blir det tusentals
  // rader i client_error_reports for ett enda fel nar de val bifogas.
  assert.match(KLIENT, /seen\.has\(key\)/, 'ingen kontroll mot det som redan fangats');
  assert.match(KLIENT, /MAX_CAPTURED=\d+/, 'inget tak for hur manga fel som samlas');
});

// ---- 4b. integriteten: inget skickas utan anvandarens val (fynd 2026-10-20) ----------------------
//
// Supportvyn lovar "Tekniska detaljer fran appen skickas bara om du kryssar i rutan". Fore
// 2026-10-20 postade filen varje fangat fel till /api/client-errors direkt, for varje inloggad
// anvandare, utan att nagon valt det - medan texten sa motsatsen. Testerna korer filen pa riktigt i
// en minimal sandlada och raknar natanropen.

const vm = require('vm');

function sandlada() {
  const lyssnare = {}, anrop = [], element = {};
  const el = sel => element[sel] || (element[sel] = {
    textContent: '', innerHTML: '', classList: { toggle() {} }, dataset: {},
    querySelector: s => el(s), reset() {}, set onclick(f) { this._click = f; }, get onclick() { return this._click; },
  });
  const document = {
    documentElement: {}, head: { append() {} }, body: { append() {} },
    querySelector: el, querySelectorAll: () => [],
  };
  const window = {
    addEventListener: (typ, f) => { (lyssnare[typ] = lyssnare[typ] || []).push(f); },
    VyraAuth: {
      currentUser: () => ({ id: 'u1', email: 'a@exempel.se' }),
      api: async (url, opt = {}) => {
        anrop.push({ url, method: opt.method || 'GET', body: opt.body });
        if (url === '/api/support/tickets' && opt.method === 'POST') return { ok: true, ticket: { id: 't-1' } };
        if (url === '/api/support/tickets') return { ok: true, tickets: [] };
        return { ok: true };
      },
    },
    toast() {},
  };
  const ctx = {
    window, document, sessionStorage: { getItem: () => null, setItem() {} },
    MutationObserver: class { observe() {} }, FormData: class {}, console,
  };
  vm.runInNewContext(KLIENT, ctx);
  const kasta = (meddelande) => (lyssnare.error || []).forEach(f => f({
    message: meddelande, filename: 'https://vyra.example/studio.js', error: { stack: 'Error: ' + meddelande },
  }));
  return { ctx, window, element, lyssnare, anrop, kasta, el };
}

const felrapporter = anrop => anrop.filter(a => a.url === '/api/client-errors');

test('ett fangat fel skickas INTE automatiskt till servern', async () => {
  const s = sandlada();
  s.kasta('trasig render');
  (s.lyssnare.unhandledrejection || []).forEach(f => f({ reason: new Error('avvisat lofte') }));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(felrapporter(s.anrop), [],
    'klientfel postades till /api/client-errors utan att anvandaren valt att bifoga tekniska detaljer');
});

function skickaArende(s, faltdata) {
  s.ctx.FormData = class { constructor() { return Object.entries(faltdata); } };
  s.el('[data-extra="support"]').onclick();
  const form = s.el('.support-form form');
  return form.onsubmit({ preventDefault() {} });
}

test('ett arende utan ikryssad ruta skickar inga tekniska detaljer', async () => {
  const s = sandlada();
  s.kasta('trasig render');
  await skickaArende(s, { category: 'technical', subject: 'Det krasar', message: 'Beskrivning av felet' });
  const arende = s.anrop.find(a => a.url === '/api/support/tickets' && a.method === 'POST');
  assert.ok(arende, 'arendet skickades inte');
  assert.equal(JSON.parse(arende.body).attachTech, undefined, 'kryssrutans falt ska inte till arendet');
  assert.deepEqual(felrapporter(s.anrop), [], 'tekniska detaljer skickades utan anvandarens val');
});

test('ett arende med ikryssad ruta bifogar de fangade felen, kopplade till arendet', async () => {
  const s = sandlada();
  s.kasta('trasig render');
  s.kasta('trasig render');
  s.kasta('annat fel');
  await skickaArende(s, { category: 'technical', subject: 'Det krasar', message: 'Beskrivning av felet', attachTech: 'on' });
  const skickat = felrapporter(s.anrop).map(a => JSON.parse(a.body));
  assert.deepEqual(skickat.map(r => r.message), ['trasig render', 'annat fel'], 'fel ska avdupliceras');
  for (const r of skickat) {
    assert.match(r.context, /\|arende:t-1$/, 'felet gick inte att koppla till arendet');
    assert.equal(r.owner, undefined, 'den interna kontomarkeringen ska inte skickas');
    assert.deepEqual(Object.keys(r).sort(), ['context', 'message', 'source', 'stack'],
      'bara de falt servern redan tar emot');
  }
});

test('fel fangade under ett annat konto bifogas aldrig', async () => {
  const s = sandlada();
  s.kasta('fel hos konto A');
  s.window.VyraAuth.currentUser = () => ({ id: 'u2' });
  await skickaArende(s, { category: 'technical', subject: 'Det krasar', message: 'Beskrivning av felet', attachTech: 'on' });
  assert.deepEqual(felrapporter(s.anrop), [], 'konto A:s fel skickades i konto B:s arende');
});

test('supportvyn beskriver rutan, och den ar av som standard', () => {
  assert.match(KLIENT, /<input type="checkbox" name="attachTech">/, 'ingen kryssruta, eller ikryssad som standard');
  assert.match(KLIENT, /Bifoga tekniska detaljer/);
  assert.match(KLIENT, /skickas bara om du kryssar i rutan/);
  assert.doesNotMatch(KLIENT, /bifogas inte utan ditt val/, 'den gamla texten lovade nagot koden inte holl');
});

test('inget skickas for en utloggad besokare', () => {
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

// ---- 6. wishlist ar pensionerad -----------------------------------------------------------------

test('wishlist ar borta, men dess data torkas fortfarande', () => {
  // Nar den har PR:en skrevs var wishlist.js kvar med flit — bara knappen bytte agare. Filen ar
  // sedan dess pensionerad, och nyckeln vyra-wishlist lever kvar i session-state.js RETIRED_KEYS
  // enbart for att fortfarande torkas vid kontobyte. Se tests/wishlist-retired.test.js.
  assert.equal(fs.existsSync(path.join(ROOT, 'wishlist.js')), false, 'wishlist.js ligger kvar');
  assert.match(las('session-state.js'), /RETIRED_KEYS[\s\S]{0,200}vyra-wishlist/,
    'gammal onskelistedata torkas inte langre nar ett konto lamnas');
});
