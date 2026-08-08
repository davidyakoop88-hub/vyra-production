'use strict';
// Läsvägen bakom "All time" på framsidan.
//
// #136 gav servern tre aggregattabeller, #137 gav den något att skriva i dem. Ingen vy har läst dem
// — framsidans Command Center visar fortfarande bara sessionens siffror ur minnet, som försvinner
// vid en omladdning. Det här är det som gör historiken synlig.
//
// SAMMA UPPDELNING SOM stream-stats.js: den rena regeln (`periodFonster`) avgör VILKET fönster som
// menas och går att pröva uttömmande utan databas. Läsaren (`createStatsReader`) gör bara SELECT.
//
// ROTT NU: modulen finns inte.
const test = require('node:test'), assert = require('node:assert/strict');
const { periodFonster, createStatsReader, PERIODER } = require('../stats-read');

// ---- den rena regeln -----------------------------------------------------------------------------

const NU = new Date('2026-08-08T12:00:00Z');

test('all time har ingen undre gräns', () => {
  const f = periodFonster('all', NU);
  assert.equal(f.fran, null, 'all time filtrerade på ett datum — då är det inte all time');
  assert.equal(f.period, 'all');
});

// Fönstret INKLUDERAR idag: "7 dagar" är 2–8 augusti, inte 1–8. Annars visar en veckovy åtta dagar
// och siffran stämmer aldrig med vad användaren räknar i huvudet.
test('rullande fönster räknas bakåt från idag och inkluderar idag', () => {
  assert.equal(periodFonster('7d', NU).fran, '2026-08-02');
  assert.equal(periodFonster('30d', NU).fran, '2026-07-10');
  assert.equal(periodFonster('90d', NU).fran, '2026-05-11');
});

// En periodväljare är en URL-parameter, och en URL-parameter kommer utifrån. Ett okänt värde ska ge
// ett vettigt svar, inte ett 500 — och absolut inte tolkas som SQL.
test('en okänd period faller tillbaka på all time', () => {
  for (const skrap of ['', null, undefined, 'evigt', '7', "1'; DROP TABLE daily_totals;--", 999, {}]) {
    const f = periodFonster(skrap, NU);
    assert.equal(f.period, 'all', `"${String(skrap)}" gav perioden "${f.period}"`);
    assert.equal(f.fran, null);
  }
});

test('perioderna är en känd, uppräknad mängd', () => {
  assert.deepEqual([...PERIODER].sort(), ['30d', '7d', '90d', 'all']);
});

// ---- läsaren -------------------------------------------------------------------------------------

function falskPool(svar = {}) {
  const anrop = [];
  return {
    anrop,
    query: async (sql, params) => {
      anrop.push({ sql, params });
      if (/FROM tiktok_connections/.test(sql)) return svar.konto || { rowCount: 1, rows: [{ tiktok_username: 'piiikabom' }] };
      if (/FROM daily_totals/.test(sql)) return svar.dagar || { rowCount: 0, rows: [] };
      if (/FROM gifter_totals/.test(sql)) return svar.givare || { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    }
  };
}

test('utan aktiv TikTok-anslutning svarar läsaren tomt, inte med ett fel', async () => {
  const pool = falskPool({ konto: { rowCount: 0, rows: [] } });
  const ut = await createStatsReader(pool).sammanfattning('ws-1', 'all', NU);
  assert.equal(ut.konto, null);
  assert.deepEqual(ut.totalt, { gifts: 0, diamonds: 0, likes: 0 },
    'en ny användare utan sändning ska se nollor, inte en kraschad sida');
  assert.deepEqual(ut.dagar, []);
});

test('summorna räknas ur dagraderna', async () => {
  const pool = falskPool({ dagar: { rowCount: 3, rows: [
    { day: '2026-08-06', gifts: '2', diamonds: '300', likes: '40' },
    { day: '2026-08-07', gifts: '5', diamonds: '1200', likes: '90' },
    { day: '2026-08-08', gifts: '1', diamonds: '50', likes: '10' }
  ] } });
  const ut = await createStatsReader(pool).sammanfattning('ws-1', 'all', NU);
  assert.deepEqual(ut.totalt, { gifts: 8, diamonds: 1550, likes: 140 });
});

// Postgres returnerar bigint som STRÄNG i node-postgres — annars tappas precision över 2^53.
// Summeras de som strängar blir "2" + "5" = "25" och siffran på framsidan blir nonsens.
test('bigint-strängar summeras som tal, inte som text', async () => {
  const pool = falskPool({ dagar: { rowCount: 2, rows: [
    { day: '2026-08-07', gifts: '2', diamonds: '10', likes: '1' },
    { day: '2026-08-08', gifts: '5', diamonds: '20', likes: '2' }
  ] } });
  const ut = await createStatsReader(pool).sammanfattning('ws-1', 'all', NU);
  assert.equal(ut.totalt.gifts, 7, `fick ${JSON.stringify(ut.totalt.gifts)} — strängkonkatenering`);
  assert.equal(typeof ut.totalt.gifts, 'number');
});

test('all time frågar utan datumgräns, en rullande period med', async () => {
  const alla = falskPool();
  await createStatsReader(alla).sammanfattning('ws-1', 'all', NU);
  const dagfraga = alla.anrop.find(a => /FROM daily_totals/.test(a.sql));
  assert.equal(/day\s*>=/.test(dagfraga.sql), false, 'all time filtrerade ändå på datum');

  const rullande = falskPool();
  await createStatsReader(rullande).sammanfattning('ws-1', '30d', NU);
  const dagfraga2 = rullande.anrop.find(a => /FROM daily_totals/.test(a.sql));
  assert.match(dagfraga2.sql, /day\s*>=/, '30d hämtade hela historiken');
  assert.ok(dagfraga2.params.includes('2026-07-10'), `parametrarna var ${JSON.stringify(dagfraga2.params)}`);
});

// Statistiken hör till KONTOT, inte bara till arbetsytan: byter någon TikTok-konto ska den gamla
// historiken inte blandas in i den nya. Skrivaren nycklar på båda, så läsaren måste också göra det.
test('frågorna är bundna till både arbetsytan och TikTok-kontot', async () => {
  const pool = falskPool();
  await createStatsReader(pool).sammanfattning('ws-1', 'all', NU);
  for (const anrop of pool.anrop.filter(a => /daily_totals|gifter_totals/.test(a.sql))) {
    assert.match(anrop.sql, /workspace_id\s*=\s*\$1/, 'frågan är inte bunden till arbetsytan');
    assert.match(anrop.sql, /tiktok_username\s*=\s*\$2/, 'frågan är inte bunden till kontot');
  }
});

test('topplistan är avgränsad så en stor publik inte blir ett jättesvar', async () => {
  const pool = falskPool();
  await createStatsReader(pool).sammanfattning('ws-1', 'all', NU);
  const givarfraga = pool.anrop.find(a => /FROM gifter_totals/.test(a.sql));
  assert.match(givarfraga.sql, /LIMIT/, 'topplistan saknar gräns — 472 givare i ett svar');
  assert.match(givarfraga.sql, /ORDER BY/, 'topplistan är osorterad och därför ingen topplista');
});

// Ingen sträng från användaren får nå SQL:en. Perioden är uppräknad, resten är parametrar.
test('inget användarvärde interpoleras in i SQL', async () => {
  const pool = falskPool();
  await createStatsReader(pool).sammanfattning("ws-1'; DROP TABLE users;--", "1'; DROP--", NU);
  for (const anrop of pool.anrop) {
    assert.equal(/DROP/i.test(anrop.sql), false, `SQL:en innehöll indata: ${anrop.sql.slice(0, 120)}`);
  }
});

test('första dagen rapporteras så framsidan kan säga "sedan"', async () => {
  const pool = falskPool({ dagar: { rowCount: 2, rows: [
    { day: '2026-06-01', gifts: '1', diamonds: '5', likes: '0' },
    { day: '2026-08-08', gifts: '1', diamonds: '5', likes: '0' }
  ] } });
  const ut = await createStatsReader(pool).sammanfattning('ws-1', 'all', NU);
  assert.equal(ut.forstaDagen, '2026-06-01');
});

test('en trasig databas fäller inte sidan', async () => {
  const trasig = {
    query: async sql => {
      if (/FROM tiktok_connections/.test(sql)) return { rowCount: 1, rows: [{ tiktok_username: 'p' }] };
      throw new Error('connection terminated');
    }
  };
  const ut = await createStatsReader(trasig).sammanfattning('ws-1', 'all', NU);
  assert.equal(ut.fel, true, 'läsaren ska rapportera att den misslyckades');
  assert.deepEqual(ut.totalt, { gifts: 0, diamonds: 0, likes: 0 });
});

// ---- kopplingen till servern ---------------------------------------------------------------------
//
// KALLKODSKONTROLL, av samma skäl som stream-stats.test.js: rutten går bara att köra med Postgres
// och Redis. Den vaktar det som gick sönder senast — modulen fanns, testerna var gröna, men filen
// saknades i Dockerfilens COPY-lista och hade gett MODULE_NOT_FOUND i Railway.
const fs = require('fs'), path = require('path');
const serverKod = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const dockerfil = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');

test('läsaren är inkopplad i servern', () => {
  assert.match(serverKod, /require\('\.\/stats-read'\)/, 'modulen krävs aldrig in');
  assert.match(serverKod, /const statsReader=createStatsReader\(/, 'läsaren instansieras aldrig');
  assert.match(serverKod, /statsReader\.sammanfattning\(/, 'sammanfattning() anropas aldrig');
});

test('rutten kräver medlemskap', () => {
  const rad = serverKod.split(/\r?\n/).find(l => /statsReader\.sammanfattning\(/.test(l));
  assert.ok(rad, 'hittade inget anrop');
  const block = serverKod.slice(serverKod.indexOf('const statsRoute=p.match('), serverKod.indexOf('const ttsVoicesRoute'));
  assert.match(block, /membership\(s\.user_id,workspaceId,/,
    'ingen behörighetskontroll — vem som helst med en session kunde läsa en annans historik');
});

// Filen måste med i imagen. server/test/docker-image-files.test.js fångar det också, men den här
// säger VARFÖR om den faller.
test('stats-read.js finns i Dockerfilens COPY-lista', () => {
  assert.match(dockerfil, /stats-read\.js/,
    'filen kopieras inte in i imagen — servern hade kraschat med MODULE_NOT_FOUND i Railway');
});

// ---- topplistan ska bara innehålla folk som faktiskt gett något ----------------------------------
//
// gifter_totals får en rad även för ren NÄRVARO — en följare, en delning, en prenumeration skriver
// en rad med bara nollor (server/stream-stats.js: bidragFranEvent ger presence utan gifts/diamonds/
// likes). En "topplista" som listar folk med noll gåvor och noll diamanter är inte en topplista.
//
// Upptäckt i produktion 2026-08-08: ett follow-event under kedjetestet lade "vyra-kedjetest" överst
// i toppGivare, eftersom listan var det enda som fanns.
test('topplistan utesluter rader utan bidrag', async () => {
  const pool = falskPool();
  await createStatsReader(pool).sammanfattning('ws-1', 'all', NU);
  const givarfraga = pool.anrop.find(a => /FROM gifter_totals/.test(a.sql));
  assert.match(givarfraga.sql, /gifts\s*>\s*0|diamonds\s*>\s*0|likes\s*>\s*0/,
    'listan tar med rader som bara är närvaro — en följare hamnar överst på en tom topplista');
});

test('den som gett något finns kvar', async () => {
  const pool = falskPool({ givare: { rowCount: 1, rows: [
    { viewer_id: 'anna', display_name: 'Anna', avatar_url: '', gifts: '3', diamonds: '900',
      likes: '0', best_gift_name: 'Rose', best_gift_diamonds: '300' }
  ] } });
  const ut = await createStatsReader(pool).sammanfattning('ws-1', 'all', NU);
  assert.equal(ut.toppGivare.length, 1);
  assert.equal(ut.toppGivare[0].diamonds, 900);
});
