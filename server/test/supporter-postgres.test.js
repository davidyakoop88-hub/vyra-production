'use strict';
// Supporterkortets och statistikens SQL mot en riktig Postgres (2026-11-01).
//
// stats-read.test.js och supporter-profile.test.js kör mot falska pooler och prövar därför aldrig
// själva uttalandena: fönsteraggregaten före LIMIT, gifter_daily-upserten med sitt skydd mot
// sena skrivningar, och anteckningens INSERT … SELECT … WHERE EXISTS. Här körs de på riktigt.
//
// Tabellerna är TEMP-kopior av de migrerade (LIKE … INCLUDING DEFAULTS INCLUDING CONSTRAINTS
// INCLUDING INDEXES): samma kolumner och primärnycklar, men utan arbetsytans främmande nyckel, så
// provet slipper skapa användare och arbetsytor. pg_temp ligger först i search_path, så modulernas
// okvalificerade tabellnamn träffar kopiorna. Kräver att migrate.js körts (CI-steget före).
const test = require('node:test'), assert = require('node:assert/strict');
const { createStreamStats } = require('../stream-stats');
const { createStatsReader } = require('../stats-read');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Uttalandena är oprövade tills TEST_DATABASE_URL pekar på en '
    + 'migrerad engångsdatabas.';
const db = (name, fn) => test(`db: ${name}`, { timeout: 60000, skip: BLOCKED }, fn);

const WS = '00000000-0000-4000-8000-0000000000a1';
const ANNAN = '00000000-0000-4000-8000-0000000000a2';
const TABELLER = ['tiktok_connections', 'gifter_totals', 'daily_totals', 'slot_totals', 'gifter_daily', 'supporter_notes'];

async function rigg() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  for (const t of TABELLER)
    await client.query(`CREATE TEMP TABLE ${t} (LIKE public.${t} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
  const kolumner = (await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tiktok_connections'`)).rows.map(r => r.column_name);
  // Bara de kolumner provet behöver; övriga får sina standardvärden eller NULL.
  const anslut = async (ws, konto) => {
    const falt = { workspace_id: ws, tiktok_username: konto, active: true };
    if (kolumner.includes('id')) falt.id = require('crypto').randomUUID();
    const namn = Object.keys(falt).filter(k => kolumner.includes(k));
    await client.query(`INSERT INTO tiktok_connections (${namn.join(',')}) VALUES (${namn.map((_, i) => '$' + (i + 1)).join(',')})`,
      namn.map(k => falt[k]));
  };
  const pool = { query: (sql, params) => client.query(sql, params) };
  const fel = [];
  return { client, anslut, stats: createStreamStats(pool, { log: (...a) => fel.push(a.join(' ')) }), reader: createStatsReader(pool), fel };
}

const gava = (username, coins, giftName = 'Rose') => ({ type: 'gift', username, count: 1, coins, giftName });

db('en gåva skrivs till gifter_daily, och supporterkortet läser livstid, dagar och senaste gåva', async () => {
  const { client, anslut, stats, reader, fel } = await rigg();
  try {
    await anslut(WS, 'streamern');
    await stats.record(WS, gava('anna', 100, 'Rose'), new Date('2026-10-30T20:00:00Z'));
    await stats.record(WS, gava('anna', 500, 'Lion'), new Date('2026-10-31T21:00:00Z'));
    await stats.record(WS, gava('anna', 50, 'Heart'), new Date('2026-10-31T22:00:00Z'));
    assert.deepEqual(fel, [], 'en upsert avvisades av databasen');
    const s = await reader.supporter(WS, 'anna');
    assert.equal(s.diamonds, 650);
    assert.equal(s.gifts, 3);
    assert.deepEqual(s.dagar.map(d => [d.dag, d.diamonds, d.gifts]), [['2026-10-30', 100, 1], ['2026-10-31', 550, 2]],
      'dagarna ska stå i tidsordning med varje dags summa');
    assert.equal(s.senasteGava.namn, 'Heart', 'senaste gåvan är den sist registrerade, inte den största');
    assert.equal(s.boosters, null, 'boosterinventariet är inte implementerat och ska vara okänt, aldrig noll');
  } finally { await client.end(); }
});

db('en sen skrivning för samma dag skriver inte över den senaste gåvan', async () => {
  const { client, anslut, stats, reader } = await rigg();
  try {
    await anslut(WS, 'streamern');
    await stats.record(WS, gava('bo', 200, 'Ny'), new Date('2026-10-31T22:00:00Z'));
    await stats.record(WS, gava('bo', 10, 'Gammal'), new Date('2026-10-31T21:00:00Z'));
    const r = (await client.query('SELECT gifts, diamonds, last_gift_name, last_gift_at FROM gifter_daily WHERE viewer_id=$1', ['bo'])).rows[0];
    assert.equal(Number(r.gifts), 2, 'summan ska ändå räkna med den sena skrivningen');
    assert.equal(Number(r.diamonds), 210);
    assert.equal(r.last_gift_name, 'Ny');
    assert.equal(new Date(r.last_gift_at).toISOString(), '2026-10-31T22:00:00.000Z');
  } finally { await client.end(); }
});

db('livstidsnämnaren räknas över alla givare, inte bara topplistans 50, och likes-givare räknas inte', async () => {
  const { client, anslut, stats, reader } = await rigg();
  try {
    await anslut(WS, 'streamern');
    const nu = new Date('2026-10-31T20:00:00Z');
    for (let i = 0; i < 60; i += 1) await stats.record(WS, gava('g' + i, 10), nu);
    await stats.record(WS, { type: 'like', username: 'bara-likes', count: 5 }, nu);
    const ut = await reader.sammanfattning(WS, 'all', nu);
    assert.ok(ut.toppGivare.length <= 50, 'topplistan ska vara begränsad');
    assert.equal(ut.givarUnderlag.diamonds, 600, 'nämnaren ska omfatta alla 60 givarna');
    assert.equal(ut.givarUnderlag.givare, 60, 'likes-givaren ska inte räknas som gåvogivare');
    const grupper = Object.fromEntries(ut.givarGrupper.map(g => [g.namn, g.givare]));
    assert.equal(grupper.Sporadiska, 60);
    assert.ok(Array.isArray(ut.timmar) && ut.timmar.some(t => t.hour === 20 && t.diamonds === 600), 'timmen ska räknas i UTC');
  } finally { await client.end(); }
});

db('anteckningen sparas per arbetsyta och konto, och avvisas för fel konto och okänd givare', async () => {
  const { client, anslut, stats, reader } = await rigg();
  try {
    await anslut(WS, 'streamern');
    await anslut(ANNAN, 'nagonannan');
    await stats.record(WS, gava('cia', 30), new Date('2026-10-31T20:00:00Z'));
    assert.deepEqual(await reader.saveSupporter(WS, 'cia', { note: 'Stammis', birthday: '02-29', konto: 'streamern' }), { ok: true });
    await reader.saveSupporter(WS, 'cia', { note: 'Stammis sedan juni', birthday: '', konto: 'streamern' });
    const s = await reader.supporter(WS, 'cia');
    assert.equal(s.note, 'Stammis sedan juni', 'en andra sparning ska uppdatera, inte dubblera');
    assert.equal(s.birthday, '');
    await assert.rejects(reader.saveSupporter(WS, 'cia', { note: 'x', birthday: '', konto: 'gammalt-konto' }), e => e.status === 409);
    await assert.rejects(reader.saveSupporter(WS, 'okand', { note: 'x', birthday: '', konto: 'streamern' }), e => e.status === 404);
    await assert.rejects(reader.saveSupporter(WS, 'cia', { note: 'x', birthday: '02-30', konto: 'streamern' }), e => e.status === 400);
    assert.equal(await reader.supporter(ANNAN, 'cia'), null, 'en annan arbetsyta ska inte se givaren');
    assert.equal(Number((await client.query('SELECT count(*) FROM supporter_notes')).rows[0].count), 1);
  } finally { await client.end(); }
});

db('supporterkortets dagshistorik läses via primärnyckeln, inte med en full genomsökning', async () => {
  const { client, anslut, stats } = await rigg();
  try {
    await anslut(WS, 'streamern');
    for (let d = 1; d <= 30; d += 1)
      for (const v of ['a', 'b', 'c', 'd']) await stats.record(WS, gava(v, d), new Date(`2026-10-${String(d).padStart(2, '0')}T20:00:00Z`));
    await client.query('ANALYZE gifter_daily');
    await client.query('SET enable_seqscan = off');
    const plan = (await client.query(`EXPLAIN SELECT day,gifts,diamonds,last_gift_name,last_gift_diamonds,last_gift_at FROM gifter_daily
      WHERE workspace_id=$1 AND tiktok_username=$2 AND viewer_id=$3 ORDER BY day DESC LIMIT 90`, [WS, 'streamern', 'a'])).rows
      .map(r => r['QUERY PLAN']).join('\n');
    // Uppmätt i CI 2026-11-01 (Postgres 18, 120 rader): planeraren väljer Bitmap Index Scan på
    // primärnyckeln och sorterar sedan högst 90 rader — billigare än en ordnad indexläsning vid så
    // liten tabell. Det som ska vaktas är att primärnyckeln används och att ingen tabell läses i sin
    // helhet; sorteringen av ≤ 90 rader är inte en kostnad värd att låsa.
    assert.match(plan, /(Bitmap Index Scan on|Index (Only )?Scan( Backward)? using) gifter_daily_pkey/, plan);
    assert.doesNotMatch(plan, /Seq Scan/, 'dagshistoriken lästes med en full genomsökning:\n' + plan);
  } finally { await client.end(); }
});
