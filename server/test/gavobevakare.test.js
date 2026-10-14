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
  // speglaBilder arbetar på HELA katalogen, så bilderna rensas helt — annars märker ett prov som
  // simulerar ett fel andra provfilers rader som misslyckade.
  await pool.query('DELETE FROM gavobild');
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


// ---- BILDERNA HOS OSS ---------------------------------------------------------------------------
// Minsta giltiga WEBP-huvud: RIFF....WEBP. Innehållet avgör typen, aldrig serverns huvud.
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20, 7)]);
const bildsvar = (buf, { status = 200 } = {}) => async () => ({ ok: status < 300, status, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });

test('bilder: typen läses ur innehållet', () => {
  assert.equal(B.bildtyp(WEBP), 'image/webp');
  assert.equal(B.bildtyp(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])), 'image/png');
  assert.equal(B.bildtyp(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(B.bildtyp(Buffer.from('<html><script>alert(1)</script>')), null);
});

test('bilder: bara TikToks bildvärdar, bara riktiga bilder, inga jättefiler', async () => {
  await assert.rejects(B.hamtaBild('https://evil.example/x.webp', { hamta: bildsvar(WEBP) }), /otillåten/);
  await assert.rejects(B.hamtaBild(CDN('x'), { hamta: bildsvar(Buffer.from('<html>inte en bild</html>')) }), /inte en bild/);
  await assert.rejects(B.hamtaBild(CDN('x'), { hamta: bildsvar(Buffer.alloc(3 * 1024 * 1024)) }), /storlek/);
  await assert.rejects(B.hamtaBild(CDN('x'), { hamta: bildsvar(WEBP, { status: 404 }) }), /404/);
  const ok = await B.hamtaBild(CDN('x'), { hamta: bildsvar(WEBP) });
  assert.equal(ok.typ, 'image/webp');
  assert.match(ok.sha256, /^[a-f0-9]{64}$/);
});

prov('speglingen sparar bilden och katalogen pekar på vår adress', async () => {
  await B.korEnGang(pool, { hamta: async (url) => url.includes('gift/list')
    ? svar({ data: { gifts: [tiktokgava('bv-1', 'Rose')] } })()
    : bildsvar(WEBP)(), logg: tyst });
  const b = await B.lasBild(pool, 'bv-1');
  assert.equal(b.typ, 'image/webp');
  assert.deepEqual(Buffer.from(b.data), WEBP);
  const K = require('../gavokatalog');
  K.tomCache();
  const rose = (await K.publikKatalog(pool)).find(g => g.giftId === 'bv-1');
  assert.match(rose.image, /^\/api\/gavor\/bild\/bv-1\?v=[a-f0-9]{12}$/);
});

prov('en händelsegåva (exklusiv, ingen lista) speglas också', async () => {
  const K = require('../gavokatalog');
  await K.noteraFranEvent(pool, { type: 'gift', giftId: 'bv-ex', giftName: 'Exklusiv', giftImage: CDN('bv-ex') });
  const ut = await B.speglaBilder(pool, { hamta: bildsvar(WEBP) });
  assert.ok(ut.sparade >= 1);
  assert.ok(await B.lasBild(pool, 'bv-ex'));
});

prov('ett misslyckat försök behåller en fungerande kopia och hamrar inte', async () => {
  await B.korEnGang(pool, { hamta: async (u) => u.includes('gift/list') ? svar({ data: { gifts: [tiktokgava('bv-1', 'Rose')] } })() : bildsvar(WEBP)(), logg: tyst });
  // Tvinga ett nytt försök på SAMMA adress och låt det misslyckas: kopian ska stå kvar.
  await pool.query("UPDATE gavobild SET data = NULL WHERE gift_id = 'bv-1'");
  await pool.query("UPDATE gavobild SET forsok_at = now() - interval '2 days' WHERE gift_id = 'bv-1'");
  let anrop = 0;
  await B.speglaBilder(pool, { hamta: async u => { if (u.includes('/bv-1.')) anrop++; throw new Error('borta') } });
  assert.equal(anrop, 1, 'ett dygn gammalt försök ska göras om');
  anrop = 0;
  await B.speglaBilder(pool, { hamta: async u => { if (u.includes('/bv-1.')) anrop++; throw new Error('borta') } });
  assert.equal(anrop, 0, 'ett nytt misslyckande ska inte försökas igen direkt');
});

prov('när TikTok byter bildadress laddas bilden ner igen', async () => {
  const lista = img => async u => u.includes('gift/list') ? svar({ data: { gifts: [tiktokgava('bv-1', 'Rose', 1)].map(g => ({ ...g, image: { url_list: [img] } })) } })() : bildsvar(WEBP)();
  await B.korEnGang(pool, { hamta: lista(CDN('gammal')), logg: tyst });
  await B.korEnGang(pool, { hamta: lista(CDN('ny')), logg: tyst });
  const rad = (await pool.query("SELECT kalla_url FROM gavobild WHERE gift_id='bv-1'")).rows[0];
  assert.equal(rad.kalla_url, CDN('ny'));
});
