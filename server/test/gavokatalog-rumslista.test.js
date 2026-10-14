'use strict';
// NYA TIKTOK-GÅVOR AUTOMATISKT — rumslistan och den publika katalogen.
//
// Molnbryggan postar TikToks egen gåvolista (fetchAvailableGifts) vid varje anslutning, och
// hemsidans väljare läser katalogen via /api/gavor. Proven mäter de tre löftena:
//
//   1. En gåva som dyker upp EFTER den första listan blir `ny` — men den första listan själv gör
//      det inte, annars hade hela importen lyst NY.
//   2. Rumslistan rör aldrig seedningens tabeller (gavoobservation, gavoseedning).
//   3. Den publika läsningen släpper bara igenom TikToks egna bildvärdar, och NY-flaggan kan
//      aldrig sättas av ett event.
//
// SYNTETISKA VÄRDEN ÖVERALLT. Inga riktiga gåvo-id.
const test = require('node:test'), assert = require('node:assert/strict');
const { Pool } = require('pg');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Baslinjen och upserten går inte att prova mot en attrapp.';

process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 11).toString('base64url');
const K = require('../gavokatalog');

const CDN = id => 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/' + id + '~tplv-obj.webp';
const rumsgava = (id, namn, over = {}) => Object.assign({
  id, name: namn, diamond_count: 5, image: { url_list: [CDN(id)] }
}, over);

// ---- rena funktioner, ingen databas -------------------------------------------------------------

test('rumslista: normaliseringen tar alla tre svarsformerna', () => {
  const g = [rumsgava('rl-1', 'Rose')];
  for (const svar of [g, { gifts: g }, { data: { gifts: g } }]) {
    assert.deepEqual(K.normaliseraRumslista(svar),
      [{ giftId: 'rl-1', namn: 'Rose', bild: CDN('rl-1'), diamanter: 5 }]);
  }
});

test('rumslista: poster utan id eller namn, och dubbletter, släpps', () => {
  const ut = K.normaliseraRumslista([
    rumsgava('rl-1', 'Rose'), { name: 'utan id' }, rumsgava('rl-2', ''), rumsgava('rl-1', 'Rose igen'),
    { id: 'rl-3', name: 'Camel', image: { urlList: [CDN('rl-3')] }, diamondCount: 7 }
  ]);
  assert.deepEqual(ut.map(p => p.giftId), ['rl-1', 'rl-3']);
  assert.equal(ut[1].bild, CDN('rl-3'), 'urlList (v2-formen) läses också');
  assert.equal(ut[1].diamanter, 7);
});

test('rumslista: skräp ger tom lista, inte ett kast', () => {
  for (const svar of [null, undefined, 'x', 42, {}, { gifts: 'nej' }]) assert.deepEqual(K.normaliseraRumslista(svar), []);
});

test('publik katalog: bara TikToks bildvärdar över https', () => {
  assert.equal(K.tillatenBild(CDN('a')), true);
  assert.equal(K.tillatenBild('https://p19-webcast.tiktokcdn-us.com/a.png'), true);
  assert.equal(K.tillatenBild('https://lf16-webcast.ibyteimg.com/a.png'), true);
  assert.equal(K.tillatenBild('http://p16-webcast.tiktokcdn.com/a.png'), false, 'http släpps inte');
  assert.equal(K.tillatenBild('https://tiktokcdn.com.evil.example/a.png'), false, 'suffixet måste vara värdens slut');
  assert.equal(K.tillatenBild('https://eviltiktokcdn.com/a.png'), false, 'ett längre namn som slutar likadant släpps inte');
  assert.equal(K.tillatenBild('javascript:alert(1)'), false);
  assert.equal(K.tillatenBild(''), false);
});

// ---- mot Postgres -------------------------------------------------------------------------------

let pool;
const prov = (namn, fn) => test('rumslista: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);
async function rensa() {
  await pool.query("DELETE FROM gavokatalog WHERE gift_id LIKE 'rl-%'");
  await pool.query('DELETE FROM gavokatalog_rumslista');
}
test.before(async () => { if (!BLOCKED) pool = new Pool({ connectionString: DB_URL }); });
test.beforeEach(async () => { if (!BLOCKED) await rensa(); });
test.after(async () => { if (BLOCKED) return; await rensa(); await pool.end(); });
const rad = async id => (await pool.query(
  'SELECT gift_name,gift_image,diamanter,kalla,ny FROM gavokatalog WHERE gift_id=$1', [id])).rows[0] || null;

prov('första listan är baslinjen — ingen gåva blir NY', async () => {
  const ut = await K.noteraRumslista(pool, [rumsgava('rl-1', 'Rose'), rumsgava('rl-2', 'Camel')]);
  assert.deepEqual({ ok: ut.ok, poster: ut.poster, nya: ut.nya, baslinje: ut.baslinje },
    { ok: true, poster: 2, nya: 2, baslinje: true });
  assert.equal((await rad('rl-1')).ny, false);
  assert.equal((await rad('rl-1')).kalla, 'katalog');
});

prov('en gåva som dyker upp i en senare lista blir NY, de gamla gör det inte', async () => {
  await K.noteraRumslista(pool, [rumsgava('rl-1', 'Rose')]);
  const ut = await K.noteraRumslista(pool, [rumsgava('rl-1', 'Rose'), rumsgava('rl-9', 'Ny Drake')]);
  assert.equal(ut.nya, 1);
  assert.equal((await rad('rl-9')).ny, true);
  assert.equal((await rad('rl-1')).ny, false);
  const publik = await K.publikKatalog(pool);
  const drake = publik.find(g => g.giftId === 'rl-9');
  assert.equal(drake.ny, true);
  assert.equal(drake.image, CDN('rl-9'));
  assert.equal(publik.find(g => g.giftId === 'rl-1').ny, false);
});

prov('NY slocknar efter 30 dagar', async () => {
  await K.noteraRumslista(pool, [rumsgava('rl-1', 'Rose')]);
  await K.noteraRumslista(pool, [rumsgava('rl-9', 'Ny Drake')]);
  const om31 = () => Date.now() + 31 * 86400000;
  assert.equal((await K.publikKatalog(pool, { nu: om31 })).find(g => g.giftId === 'rl-9').ny, false);
});

prov('en gåva som redan setts i ett event blir inte NY av listan', async () => {
  await K.noteraRumslista(pool, [rumsgava('rl-1', 'Rose')]);
  await K.noteraFranEvent(pool, { type: 'gift', giftId: 'rl-5', giftName: 'Sedd', giftImage: CDN('rl-5') });
  await K.noteraRumslista(pool, [rumsgava('rl-5', 'Sedd')]);
  assert.equal((await rad('rl-5')).ny, false);
  assert.equal((await rad('rl-5')).kalla, 'katalog', 'listan uppgraderar händelseraden till katalog');
});

prov('ett event kan aldrig skapa en NY-gåva', async () => {
  await K.noteraRumslista(pool, [rumsgava('rl-1', 'Rose')]);
  await K.noteraFranEvent(pool, { type: 'gift', giftId: 'rl-6', giftName: 'Påhittad', giftImage: CDN('rl-6') });
  assert.equal((await rad('rl-6')).ny, false);
  assert.equal((await K.publikKatalog(pool)).find(g => g.giftId === 'rl-6').ny, false);
});

prov('listan uppdaterar namn, bild och styckpris men tömmer inget', async () => {
  await K.noteraRumslista(pool, [rumsgava('rl-1', 'Rose')]);
  await K.noteraRumslista(pool, [rumsgava('rl-1', 'Ros', { diamond_count: 0, image: { url_list: [] } })]);
  const r = await rad('rl-1');
  assert.equal(r.gift_name, 'Ros');
  assert.equal(r.gift_image, CDN('rl-1'), 'tom bild skriver inte över');
  assert.equal(r.diamanter, 5, 'noll skriver inte över ett känt styckpris');
});

prov('rumslistan rör aldrig seedningens tabeller', async () => {
  const fore = (await pool.query('SELECT (SELECT count(*) FROM gavoobservation)::int o, (SELECT count(*) FROM gavoseedning)::int s')).rows[0];
  await K.noteraRumslista(pool, [rumsgava('rl-1', 'Rose'), rumsgava('rl-2', 'Camel')]);
  const efter = (await pool.query('SELECT (SELECT count(*) FROM gavoobservation)::int o, (SELECT count(*) FROM gavoseedning)::int s')).rows[0];
  assert.deepEqual(efter, fore);
});

prov('publik läsning släpper inte bilder från andra värdar', async () => {
  await K.noteraRumslista(pool, [rumsgava('rl-1', 'Rose')]);
  await K.noteraFranEvent(pool, { type: 'gift', giftId: 'rl-7', giftName: 'Fel värd', giftImage: 'https://evil.example/x.png' });
  const publik = await K.publikKatalog(pool);
  assert.ok(publik.some(g => g.giftId === 'rl-1'));
  assert.ok(!publik.some(g => g.giftId === 'rl-7'));
});

prov('tom lista skriver ingen baslinje', async () => {
  const ut = await K.noteraRumslista(pool, []);
  assert.equal(ut.ok, false);
  assert.equal((await pool.query('SELECT count(*)::int n FROM gavokatalog_rumslista')).rows[0].n, 0);
});
