'use strict';
// Historiken som bygger "All time" — och varför den maste bo pa servern.
//
// Framsidan ska vara vard nagot MELLAN sandningarna: totala givare, diamanter, trend per dag,
// sovande givare, basta tid att sanda. I dag rakans allt det i webblasaren (live-leaderboard.js,
// localStorage), vilket betyder att en sandning utan Studio-fliken uppe inte finns i statistiken,
// att ett datorbyte nollstaller den, och att en rensad webblasare raderar den.
//
// Uppmatt hos David 2026-08-07: 5 dagar och 10 givare i localStorage, mot TikControls 472 givare
// sedan juni. Skillnaden ar inte raknandet — det ar att de spelar in pa servern.
//
// HISTORIK GAR INTE ATT BYGGA I EFTERHAND. Varje dag utan inspelning saknas permanent. Darfor
// skrivvagen forst och vyn sedan.
//
// DEN HAR FILEN PROVAR DEN RENA REGELN, inte SQL:en — samma uppdelning som viewer-levels.js:
// beslutet om VAD ett event bidrar med gar att prova uttommande utan databas, och det ar dar
// felen bor.
//
// ROTT NU: modulen finns inte.
const test = require('node:test'), assert = require('node:assert/strict');
const { bidragFranEvent } = require('../stream-stats');

// ---- gavor: bada talen, och de ar inte samma ---------------------------------------------------

test('en gåva bidrar med både antal och diamanter', () => {
  const b = bidragFranEvent({ type: 'gift', username: 'anna', count: 3, coins: 1500 });
  assert.equal(b.gifts, 3, 'antalet gåvor ska komma från count');
  assert.equal(b.diamonds, 1500, 'diamanterna ska komma från coins');
  assert.equal(b.likes, 0);
});

test('en combo bär redan hela sitt värde', () => {
  // Bryggan skickar bara sista ramen, med coins = coinsEach x repeatCount. Att multiplicera med
  // count igen hade kvadrerat varje combo.
  const b = bidragFranEvent({ type: 'gift', username: 'anna', count: 10, coins: 1000 });
  assert.equal(b.diamonds, 1000, 'coins får aldrig multipliceras med count');
  assert.equal(b.gifts, 10);
});

test('bästa gåva följer det enskilda eventets värde', () => {
  const b = bidragFranEvent({ type: 'gift', username: 'anna', count: 1, coins: 4999, giftName: 'Universe' });
  assert.deepEqual(b.bestaGava, { namn: 'Universe', diamanter: 4999 });
});

// ---- likes: count, ALDRIG points ---------------------------------------------------------------

test('likes ackumuleras från count, inte från points', () => {
  // points ar TikToks lopande rumstotal. Den visas rakt av pa ett kort, men att ADDERA den en gang
  // per event multiplicerar summan med antalet event. normalizer.js dokumenterar samma regel.
  const b = bidragFranEvent({ type: 'likes', username: 'mia', count: 15, points: 154300 });
  assert.equal(b.likes, 15, 'points får aldrig summeras');
  assert.equal(b.gifts, 0);
  assert.equal(b.diamonds, 0);
});

test('båda stavningarna räknas', () => {
  assert.equal(bidragFranEvent({ type: 'like', username: 'mia', count: 4 }).likes, 4);
  assert.equal(bidragFranEvent({ type: 'likes', username: 'mia', count: 4 }).likes, 4);
});

// ---- events som inte ar summor ------------------------------------------------------------------

test('follow, share och subscribe räknas inte som gåvor eller likes', () => {
  for (const typ of ['follow', 'share', 'subscribe']) {
    const b = bidragFranEvent({ type: typ, username: 'ny' });
    assert.ok(b, `${typ} ska ge ett bidrag (den uppdaterar senast sedd)`);
    assert.equal(b.gifts, 0, typ);
    assert.equal(b.diamonds, 0, typ);
    assert.equal(b.likes, 0, typ);
  }
});

test('rumshändelser utan avsändare ger inget gifter-bidrag', () => {
  // viewer och battle beskriver RUMMET, inte en person — server/index.js undantar dem redan fran
  // username-kravet i ingesten.
  assert.equal(bidragFranEvent({ type: 'viewer', count: 1284 }), null);
  assert.equal(bidragFranEvent({ type: 'battle', scoreUs: 10 }), null);
});

test('chat räknas inte alls', () => {
  assert.equal(bidragFranEvent({ type: 'chat', username: 'pratkvarn', comment: 'hej' }), null,
    'chatt är inget mått och skulle dominera skrivningarna');
});

// ---- skrapdata far aldrig na en summa ----------------------------------------------------------

test('trasiga tal ignoreras i stället för att förgifta summan', () => {
  const b = bidragFranEvent({ type: 'gift', username: 'anna', count: 'inte-ett-tal', coins: -5 });
  assert.equal(b.gifts, 0, 'en ogiltig count får inte bli NaN i databasen');
  assert.equal(b.diamonds, 0, 'negativa diamanter får inte minska summan');
});

test('en gåva utan avsändare räknas inte per givare', () => {
  assert.equal(bidragFranEvent({ type: 'gift', count: 1, coins: 10 }), null,
    'utan identitet finns ingen rad att skriva till');
});

test('avsändaren normaliseras så samma person inte blir två rader', () => {
  const a = bidragFranEvent({ type: 'gift', username: '@Anna', count: 1, coins: 1 });
  const b = bidragFranEvent({ type: 'gift', username: 'anna', count: 1, coins: 1 });
  assert.equal(a.viewerId, b.viewerId, '@ och versaler får inte skapa en andra givare');
});

// ---- tidsluckan: UTC lagras, lokal tid raknas i klienten ---------------------------------------

test('tidsluckan lagras i UTC', () => {
  const b = bidragFranEvent({ type: 'gift', username: 'anna', count: 1, coins: 1 },
    new Date('2026-08-07T22:30:00Z'));
  assert.equal(b.dag, '2026-08-07', 'dagen ska vara UTC-dagen');
  assert.equal(b.timme, 22);
  assert.equal(b.veckodag, 5, 'fredag = 5 enligt getUTCDay');
});

// ---- skrivaren ---------------------------------------------------------------------------------
//
// SQL:en sjalv provas mot riktig Postgres i CI. Har provas det som gar att prova utan databas och
// dar felen faktiskt bor: att kontot slas upp och cachas, och att en trasig databas inte kan falla
// en ingest.
const { createStreamStats } = require('../stream-stats');

function falskPool(svar = { rowCount: 1, rows: [{ tiktok_username: 'piiikabom' }] }) {
  const anrop = [];
  return {
    anrop,
    query: async (sql, params) => {
      anrop.push({ sql: sql.trim().split('\n')[0].trim(), params });
      if (/FROM tiktok_connections/.test(sql)) return svar;
      return { rowCount: 1, rows: [] };
    }
  };
}

const GAVA = { type: 'gift', username: 'anna', count: 2, coins: 300, giftName: 'Rose' };

test('en gåva skriver till alla tre tabellerna', async () => {
  const pool = falskPool();
  const stats = createStreamStats(pool);
  const ut = await stats.record('ws-1', GAVA);
  assert.equal(ut.skrivet, true);
  const sqls = pool.anrop.map(a => a.sql).join(' | ');
  assert.match(sqls, /gifter_totals/);
  assert.match(sqls, /daily_totals/);
  assert.match(sqls, /slot_totals/);
});

test('kontot slås upp en gång och cachas', async () => {
  const pool = falskPool();
  const stats = createStreamStats(pool);
  await stats.record('ws-1', GAVA);
  await stats.record('ws-1', GAVA);
  await stats.record('ws-1', GAVA);
  const uppslag = pool.anrop.filter(a => /FROM tiktok_connections/.test(a.sql)).length;
  assert.equal(uppslag, 1, `slog upp kontot ${uppslag} gånger — vid 100 event/s blir det dyrt`);
});

test('utan aktiv TikTok-anslutning skrivs ingenting', async () => {
  const pool = falskPool({ rowCount: 0, rows: [] });
  const stats = createStreamStats(pool);
  const ut = await stats.record('ws-1', GAVA);
  assert.equal(ut.skrivet, false);
  assert.equal(pool.anrop.filter(a => /gifter_totals/.test(a.sql)).length, 0,
    'en rad utan konto hade blivit omöjlig att hitta igen');
});

// Det viktigaste provet i filen: statistiken ar ett SIDORESULTAT. Faller den ska sandningen ga
// vidare — en lucka i historiken ar en olagenhet, ett stoppat event ar en trasig sandning.
// Forsta versionen av det har provet lat ALLA anrop kasta, aven kontouppslaget. Da returnerade
// record() 'okant konto' och nadde aldrig skriv-try:n — provet var gront utan att prova nagot, och
// mutationen "ta bort try/catch" gick rakt igenom. Kontot maste lyckas och SKRIVNINGEN faila.
test('en trasig databas fäller inte ingesten', async () => {
  const halvtTrasig = {
    query: async sql => {
      if (/FROM tiktok_connections/.test(sql)) return { rowCount: 1, rows: [{ tiktok_username: 'piiikabom' }] };
      throw new Error('connection terminated');
    }
  };
  const stats = createStreamStats(halvtTrasig);
  const ut = await stats.record('ws-1', GAVA);
  // 'fel', inte 'okant konto': skalet bevisar att provet tog sig anda fram till skrivningen.
  assert.equal(ut.skal, 'fel', `record() stannade tidigare än skrivningen (skäl: ${ut.skal})`);
  assert.equal(ut.skrivet, false, 'skrivningen ska rapportera att den misslyckades');
  // Att den inte kastade ar hela poangen — testet hade faltit pa ett kast fore den har raden.
});

// Aven kontouppslaget maste vara feltoligt, men av ett annat skal: dar finns ingen skrivning att
// tappa, utan hela eventet hade fallit pa en kort Postgres-glapp.
test('ett trasigt kontouppslag fäller inte heller ingesten', async () => {
  const trasig = { query: async () => { throw new Error('connection terminated') } };
  const stats = createStreamStats(trasig);
  const ut = await stats.record('ws-1', GAVA);
  assert.equal(ut.skrivet, false);
  assert.equal(ut.skal, 'okant konto');
});

test('en händelse utan bidrag rör aldrig databasen', async () => {
  const pool = falskPool();
  const stats = createStreamStats(pool);
  await stats.record('ws-1', { type: 'chat', username: 'pratkvarn', comment: 'hej' });
  assert.equal(pool.anrop.length, 0, 'chatt slog ändå upp kontot eller skrev en rad');
});

test('follow uppdaterar givaren men rör inte dag- och tidstabellerna', async () => {
  const pool = falskPool();
  const stats = createStreamStats(pool);
  await stats.record('ws-1', { type: 'follow', username: 'ny' });
  const sqls = pool.anrop.map(a => a.sql).join(' | ');
  assert.match(sqls, /gifter_totals/, 'senast sedd ska uppdateras');
  assert.equal(/daily_totals|slot_totals/.test(sqls), false,
    'en följare är ingen gåva och ska inte skapa en dagrad med nollor');
});

// ---- kopplingen till ingesten -------------------------------------------------------------------
//
// Det har ar en KALLKODSKONTROLL, inte en utfallsmatning, och det ar ett medvetet val: index.js gar
// inte att starta utan bade Postgres och Redis, sa ett utfallsprov hade behovt hela riggen for att
// bevisa tre rader. Samma val som docker-image-files.test.js gor for COPY-listan.
//
// Den bevisar en sak som gick sonder i just den har andringen: modulen fanns, testerna var grona,
// men filen saknades i Dockerfilens COPY-lista och hade gett MODULE_NOT_FOUND i Railway. Det provet
// finns redan (docker-image-files.test.js) och fangade det. Det har provet vaktar andra halvan:
// att skrivaren overhuvudtaget ar inkopplad.
const indexKod = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.js'), 'utf8');

test('ingesten är kopplad till statistikskrivaren', () => {
  assert.match(indexKod, /require\('\.\/stream-stats'\)/, 'server/index.js kräver inte in modulen');
  assert.match(indexKod, /createStreamStats\(/, 'skrivaren instansieras aldrig');
  assert.match(indexKod, /streamStats\.record\(/, 'record() anropas aldrig — inget skulle sparas');
});

// Dubbelrakning i en summa gar inte att upptacka i efterhand: ingen vet om 4 000 diamanter var
// 4 000 eller 2 000 raknade tva ganger. Darfor ar dubblettvakten ett kontrakt, inte en optimering.
test('skrivningen sker bara när eventet inte är en dubblett', () => {
  const rad = indexKod.split(/\r?\n/).find(l => /streamStats\.record\(/.test(l));
  assert.ok(rad, 'hittade ingen rad som anropar record()');
  assert.match(rad, /!raw\.duplicate/, `anropet saknar dubblettvakt: ${rad.trim()}`);
});

// En avvisad promise utan hanterare faller hela Node-processen. Att skrivningen inte ar await:ad ar
// avsiktligt — men da MASTE den ha ett .catch().
test('den obevakade skrivningen kan inte fälla processen', () => {
  const rad = indexKod.split(/\r?\n/).find(l => /streamStats\.record\(/.test(l));
  assert.match(rad, /\.catch\(/, `record() saknar .catch(): ${rad.trim()}`);
});
