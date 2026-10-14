'use strict';
// GÅVOBEVAKAREN — TikToks gåvolista var sjätte timme.
//
// Hämtningen provas mot en attrapp av fetch med TikToks svarsform ({ data: { gifts: [...] } },
// uppmätt 2026-10-14: 770 poster, bilder på p16-webcast.tiktokcdn.com). Inget prov rör nätet.
// Skrivningen provas mot riktig Postgres och hoppas över utan den.
//
// Löftet som mäts: bevakaren hittar nya gåvor, och den kan ALDRIG fälla servern — varje fel blir en
// loggrad och ett { ok:false }, aldrig ett kast.
const test = require('node:test'), assert = require('node:assert/strict');
const { Pool } = require('pg');

process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || Buffer.alloc(32, 11).toString('base64url');
const B = require('../gavobevakare');

const CDN = id => 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/resource/' + id + '.png~tplv-obj.webp';
const tiktokgava = (id, namn, dc = 1) => ({ id, name: namn, diamond_count: dc, image: { url_list: [CDN(id)] } });
const svar = (kropp, { status = 200, langd = null } = {}) => async () => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: k => (k === 'content-length' && langd !== null ? String(langd) : null) },
  text: async () => (typeof kropp === 'string' ? kropp : JSON.stringify(kropp))
});
const tyst = { lines: [], log(l) { this.lines.push(l) } };

test('bevakare: frågar TikToks egen lista med en webbläsar-UA', async () => {
  let url = '', huvuden = null;
  const hamta = async (u, o) => { url = u; huvuden = o.headers; return svar({ data: { gifts: [] } })(); };
  await B.hamtaLista({ hamta });
  assert.equal(url, 'https://webcast.tiktok.com/webcast/gift/list/?aid=1988');
  assert.match(huvuden['user-agent'], /Mozilla/);
});

test('bevakare: läser data.gifts ur svaret', async () => {
  const lista = await B.hamtaLista({ hamta: svar({ data: { gifts: [tiktokgava(1, 'Rose'), tiktokgava(2, 'Super Car', 19000)] } }) });
  assert.deepEqual(lista.map(g => g.name), ['Rose', 'Super Car']);
});

test('bevakare: fel status, fel form och för stort svar kastar i hämtningen', async () => {
  await assert.rejects(B.hamtaLista({ hamta: svar({}, { status: 403 }) }), /403/);
  await assert.rejects(B.hamtaLista({ hamta: svar({ status_code: 1 }) }), /data\.gifts/);
  await assert.rejects(B.hamtaLista({ hamta: svar('<html>inte json</html>') }));
  await assert.rejects(B.hamtaLista({ hamta: svar({ data: { gifts: [] } }, { langd: 50 * 1024 * 1024 }) }), /för stort/);
});

test('bevakare: korEnGang kastar aldrig — ett fel blir en loggrad', async () => {
  const logg = { lines: [], log(l) { this.lines.push(l) } };
  const ut = await B.korEnGang(null, { hamta: async () => { throw new Error('nätet borta') }, logg });
  assert.deepEqual(ut, { ok: false, skal: 'fel' });
  assert.equal(JSON.parse(logg.lines[0]).event, 'gavobevakning_misslyckades');
});

test('bevakare: GAVOBEVAKNING=0 startar ingen timer', () => {
  const fore = process.env.GAVOBEVAKNING;
  process.env.GAVOBEVAKNING = '0';
  let anrop = 0;
  const stopp = B.startaGavobevakning({ pool: null, hamta: async () => { anrop++ }, logg: tyst, forstaMs: 1 });
  assert.equal(typeof stopp, 'function');
  if (fore === undefined) delete process.env.GAVOBEVAKNING; else process.env.GAVOBEVAKNING = fore;
  return new Promise(klar => setTimeout(() => { assert.equal(anrop, 0); klar(); }, 30));
});

test('bevakare: timrarna håller inte processen vid liv och går att stoppa', async () => {
  let anrop = 0;
  const stopp = B.startaGavobevakning({ pool: null, hamta: async () => { anrop++; throw new Error('x') }, logg: tyst, forstaMs: 5, intervallMs: 60000 });
  await new Promise(r => setTimeout(r, 40));
  stopp();
  assert.equal(anrop, 1, 'första körningen kom inte efter forstaMs');
});

// ---- mot Postgres -------------------------------------------------------------------------------
const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false : 'BLOCKERAT: ingen isolerad Postgres.';
let pool;
const prov = (namn, fn) => test('bevakare: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);
async function rensa() {
  await pool.query("DELETE FROM gavokatalog WHERE gift_id LIKE 'bv-%'");
  await pool.query('DELETE FROM gavokatalog_rumslista');
}
test.before(async () => { if (!BLOCKED) pool = new Pool({ connectionString: DB_URL }); });
test.beforeEach(async () => { if (!BLOCKED) await rensa(); });
test.after(async () => { if (BLOCKED) return; await rensa(); await pool.end(); });

prov('två körningar: den andra hittar gåvan TikTok släppt däremellan', async () => {
  const logg = { lines: [], log(l) { this.lines.push(l) } };
  const forsta = await B.korEnGang(pool, { hamta: svar({ data: { gifts: [tiktokgava('bv-1', 'Rose')] } }), logg });
  assert.equal(forsta.baslinje, true);
  const andra = await B.korEnGang(pool, {
    hamta: svar({ data: { gifts: [tiktokgava('bv-1', 'Rose'), tiktokgava('bv-2', 'Rin the Snowborn', 25999)] } }), logg });
  assert.equal(andra.nya, 1);
  const rad = (await pool.query("SELECT ny, diamanter, gift_image FROM gavokatalog WHERE gift_id='bv-2'")).rows[0];
  assert.deepEqual(rad, { ny: true, diamanter: 25999, gift_image: CDN('bv-2') });
  assert.equal(JSON.parse(logg.lines[1]).nya, 1, 'loggraden ska säga hur många som var nya');
});
