'use strict';
// SEEDNINGSVÄGEN — de tre adminrutterna som faktiskt fyller katalogen.
//
// Modulen bakom dem är provad i gavokatalog.test.js, men RUTTERNA var helt obevisade när jag först
// skrev dem. Det är just den vägen som gör att katalogen alls hamnar i produktion: går den sönder
// postar David 783 gåvor och får ingenting, och felet upptäcks för hand.
//
// Fyra saker mäts här, och alla fyra kan gå fel var för sig:
//   1. behörigheten          — bara plattformsadministratör får seeda
//   2. bulkvägen             — hela listan i ett anrop, med sanering av utifrån kommande fält
//   3. verifieringen         — och att den vägrar ett id katalogen inte känner
//   4. statussvaret          — räknar, men avslöjar aldrig VILKA id som finns
//
// BLOCKERAT utan isolerad Postgres: behörighet och främmande nycklar går inte att prova mot en
// attrapp.
const test = require('node:test'), assert = require('node:assert/strict');
const net = require('node:net');

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
const K = require('../gavokatalog');
const ADMIN = 'cafe0000-0000-4000-8000-000000000001';
const VANLIG = 'cafe0000-0000-4000-8000-000000000002';
const auth = {};

const REGION = 'SE';   // observerad region — rutten vagrar utan
// Kontrolltal for ruttprovens sma listor. Deklarerade, inte harledda ur svaret.
const KT = (poster, unikaId, utanId = 0) => ({ poster, unikaId, utanId });

// ARRANGERA VIA MODULEN, ALDRIG VIA RUTTEN. Rutten kräver numera att listan möter det granskade
// SE-kontraktet (783/779/0), och det är precis vad flera prov nedan ska PROVA. Att låta riggen gå
// samma väg hade tvingat varje prov att bygga 783 poster för att komma åt något helt annat.
const rigga = async (...gifts) => {
  const unika = new Set(gifts.map(g => String(g.id)));
  const ut = await K.noteraKatalog(pool, gifts,
    { region: REGION, forvantat: { poster: gifts.length, unikaId: unika.size, utanId: 0 } });
  assert.equal(ut.ok, true, 'riggen kunde inte lägga in gåvorna');
  K.tomCache();
  return ut;
};
const G1 = 'httprov-9001', G2 = 'httprov-9002';
const post = (id, namn) => ({ id, name: namn, diamond_count: 1,
  image: { url_list: ['https://p16.example.invalid/' + id + '.png'] } });

async function session(userId) {
  const ra = S.token(), csrf = S.token();
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)
     VALUES ($1,$2,$3, now() + interval '1 hour', now())`,
    [userId, S.digest(ra), S.digest(csrf)]);
  return { cookie: 'vyra_session=' + ra, csrf };
}

async function anrop(metod, vag, { som = null, kropp = null } = {}) {
  const vem = som ? auth[som] : null;
  // KONTROLLTAL FÖR PROV SOM INTE HANDLAR OM FULLSTÄNDIGHET. Räknas fram ur listan, vilket är
  // exakt det som är förbjudet i produktion — men de proven mäter något annat. Sätt
  // `utanForvantat: true` för att medvetet utelämna dem, eller ange egna literaler i kroppen.
  // KROPPEN BÄR ALDRIG KONTROLLTAL. Rutten hämtar dem ur det granskade seedningskontraktet och
  // avvisar uttryckligen en kropp som bär `forvantat`.
  const res = await fetch(bas + vag, {
    method: metod,
    headers: { ...(kropp ? { 'content-type': 'application/json' } : {}),
      ...(vem ? { cookie: vem.cookie, 'x-vyra-csrf': vem.csrf } : {}) },
    ...(kropp ? { body: JSON.stringify(kropp) } : {})
  });
  const text = await res.text();
  let d = null; try { d = JSON.parse(text) } catch { /* inte json */ }
  return { status: res.status, body: d };
}

// SKIP AVGORS INUTI KROPPEN, inte i optionsobjektet — och det ar inte en stilfraga.
//
// Uppmatt i Node: ett FALSKT varde som inte ar `false` — `null` eller tom strang — markerar provet
// som overhoppat MEN KOR KROPPEN ANDA, och kastar resultatet. (Sanna varden hoppar over korrekt;
// hela tabellen star i tests/goal-postgres-flode.test.js.) Med `skip: null` — vilket det blir har
// eftersom BLOCKED anvander null som "inte matt an" — kordes alla tolv proven i CI och
// rapporterades som SKIP. Ett fallande pastaende hade varit osynligt.
//
// Redis-kontrollen ar dessutom asynkron och kan inte hinna klart innan proven REGISTRERAS. Darfor
// samma monster som goal-ingest-http.test.js: vanta ut kontrollen i kroppen och anropa t.skip().
const prov = (namn, fn) => test('katalog-http: ' + namn, { timeout: 30000 }, async t => {
  const skal = await blockerad();
  if (skal) { t.skip(skal); return; }
  await fn();
});

test.before(async () => {
  if (await blockerad()) return;
  S = require('../security');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  for (const [id, admin] of [[ADMIN, true], [VANLIG, false]]) {
    await pool.query(
      `INSERT INTO users (id,email,password_hash,display_name,email_verified_at,is_platform_admin)
       VALUES ($1,$2,'x','katalogprov',now(),$3) ON CONFLICT (id) DO UPDATE SET is_platform_admin=$3`,
      [id, id + '@t.invalid', admin]);
  }
  auth.admin = await session(ADMIN);
  auth.vanlig = await session(VANLIG);

  await new Promise(klar => server.listen(0, '127.0.0.1', klar));
  bas = 'http://127.0.0.1:' + server.address().port;
});

async function rensa() {
  await pool.query("DELETE FROM gavoregel_kalla WHERE gift_id LIKE 'httprov-%'");
  await pool.query("DELETE FROM gavoregel WHERE gift_id LIKE 'httprov-%'");
  await pool.query("DELETE FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
  await pool.query('DELETE FROM gavoseedning');   // kaskaderar inte — annars lacker 'klar' mellan prov
}
// CACHEN TOMMS MELLAN PROV. rensa() raderar rader, men verifieradeId har en 30-sekunderscache i
// processen — och proven kor i SAMMA process som servern. Utan tomningen lever en verifiering fran
// ett tidigare prov vidare over rensningen, och nasta prov laser ett svar som inte langre stammer.
// Precis det fallet foll i CI.
test.beforeEach(async () => { if (!(await blockerad())) { await rensa(); K.tomCache(); } });
test.after(async () => {
  if (await blockerad()) return;
  await rensa();
  await pool.query('DELETE FROM sessions WHERE user_id = ANY($1::uuid[])', [[ADMIN, VANLIG]]);

  // TEARDOWN I TRE DELAR, och alla tre behovs. Forsta versionen gjorde bara server.close() och
  // HANGDE CI: keep-alive-anslutningarna fran fetch-anropen haller servern oppen, sa callbacken
  // loser aldrig ut. Redis-prenumerationen och Postgres-poolen haller dessutom handelseloopen vid
  // liv efter att provet ar klart.
  await new Promise(klar => {
    server.close(klar);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.end();
});

// ---- 1 · BEHÖRIGHETEN --------------------------------------------------------------------------

prov('utan inloggning går ingenting att seeda', async () => {
  const r = await anrop('POST', '/api/admin/gavokatalog', { kropp: { gifts: [post(G1, 'Rose')] , region: REGION } });
  assert.equal(r.status, 401);
  const q = await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
  assert.equal(q.rows[0].n, 0, 'något skrevs trots 401');
});

prov('en vanlig inloggad användare nekas', async () => {
  // Katalogen styr vad hela plattformen känner igen. En vanlig kund får aldrig skriva i den.
  const r = await anrop('POST', '/api/admin/gavokatalog', { som: 'vanlig', kropp: { gifts: [post(G1, 'Rose')] , region: REGION } });
  assert.equal(r.status, 403);
  const q = await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
  assert.equal(q.rows[0].n, 0);
});

prov('utan CSRF-huvud nekas även en administratör', async () => {
  const res = await fetch(bas + '/api/admin/gavokatalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: auth.admin.cookie },
    body: JSON.stringify({ gifts: [post(G1, 'Rose')] })
  });
  assert.equal(res.status, 401, 'en POST utan CSRF ska falla på sessionskontrollen');
});

// ---- 2 · BULKVÄGEN -----------------------------------------------------------------------------

prov('administratören seedar hela listan i ETT anrop', async () => {
  // "Hela listan" betyder numera bokstavligen hela: rutten kräver att den möter det granskade
  // SE-kontraktet. En liten lista är inte längre en giltig seedning, och det är hela poängen.
  const se = require('../seedningskontrakt').for(REGION);
  const gifts = [];
  for (let i = 0; i < se.unikaId; i++) gifts.push(post('httprov-' + (30000 + i), 'G' + i));
  for (let i = 0; i < se.poster - se.unikaId; i++) gifts.push(post('httprov-' + (30000 + i), 'G' + i));

  const r = await anrop('POST', '/api/admin/gavokatalog', { som: 'admin', kropp: { region: REGION, gifts } });
  assert.equal(r.status, 200);
  assert.equal(r.body.skrivna, se.poster);
  assert.equal(r.body.unikaId, se.unikaId, 'dubbletterna räknades som skilda id');
  await rigga(post(G2, 'Heart Me'));

  const q = await pool.query(
    "SELECT gift_name,kalla FROM gavokatalog WHERE gift_id=$1", [G2]);
  assert.equal(q.rows[0].gift_name, 'Heart Me');
  assert.equal(q.rows[0].kalla, 'katalog');
});

prov('en trasig post fäller inte hela bulken', async () => {
  // En enda dålig post bland 783 får inte kosta katalogen. Provas mot MODULEN: SE-kontraktet har
  // utanId: 0, så en lista med en post utan id kan per definition inte seedas via rutten — den
  // möter inte kontraktet, och ska inte göra det.
  const ut = await K.noteraKatalog(pool, [post(G1, 'Rose'), { name: 'utan id' }, post(G2, 'X')],
    { region: REGION, forvantat: { poster: 3, unikaId: 2, utanId: 1 } });
  assert.equal(ut.ok, true, 'en lista vars kontrolltal ERKÄNNER den trasiga posten avvisades');
  assert.equal(ut.skrivna, 2);
  assert.equal(ut.hoppade, 1);
});

prov('en tom eller felformad lista ger 422 och ok:false — inte 200 och ok:true', async () => {
  // Ett 200/ok:true på en tom lista är en tyst lögn: anroparen får "det gick bra" av något som
  // inte hände. Statuskoden är det enda de flesta klienter tittar på.
  for (const gifts of [undefined, null, 'inte en lista', []]) {
    const kropp = { region: REGION, ...(gifts === undefined ? {} : { gifts }) };
    const r = await anrop('POST', '/api/admin/gavokatalog', { som: 'admin', kropp });
    assert.equal(r.status, 422, JSON.stringify(gifts) + ' gav fel status');
    assert.equal(r.body.ok, false, JSON.stringify(gifts) + ' rapporterades som lyckat');
  }
});

prov('en trunkerad lista mot riktiga kontrolltal ger 422 och skriver ingenting', async () => {
  // Precis fallet granskningen fällde: en lista som ser komplett ut men inte är det.
  const r = await anrop('POST', '/api/admin/gavokatalog', {
    som: 'admin',
    kropp: { region: REGION, gifts: [post(G1, 'Rose')] }
  });
  assert.equal(r.status, 422, 'en trunkerad seedning accepterades');
  assert.equal(r.body.ok, false);
  const q = await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
  assert.equal(q.rows[0].n, 0, 'en avvisad seedning lämnade rader');
  const st = await anrop('GET', '/api/admin/gavokatalog/status', { som: 'admin' });
  assert.ok(!(st.body.seedningar || []).some(x => x.region === REGION && x.klar),
    'en trunkerad seedning markerades som färdig');
});

prov('utan observerad region skrivs ingenting — 400, inte ett tyst default', async () => {
  // webcast/gift/list/ bär inget regionfält. En seedning utan proveniens vore en global sanning vi
  // inte har täckning för, så rutten ska vägra hellre än att gissa.
  for (const region of [undefined, '', 'se', 'SWE', 'S', 'Sverige', 12, null]) {
    const kropp = { gifts: [post(G1, 'Rose')], ...(region === undefined ? {} : { region }) };
    const r = await anrop('POST', '/api/admin/gavokatalog', { som: 'admin', kropp });
    assert.equal(r.status, 400, JSON.stringify(region) + ' accepterades som region');
  }
  const q = await pool.query('SELECT count(*)::int n FROM gavokatalog WHERE gift_id=$1', [G1]);
  assert.equal(q.rows[0].n, 0, 'ett avvisat anrop hann ändå skriva');

  // KONTROLLMÄTNING: med en giltig region SKA det gå igenom — annars mäter provet bara att rutten
  // är trasig.
  const ok = await rigga(post(G1, 'Rose'));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.region, REGION, 'svaret sa inte vilken region som seedades');
});

prov('svaret skiljer på ANTAL POSTER och ANTAL ID', async () => {
  // TikToks egen lista bär samma id flera gånger — uppmätt 2026-08-29: 783 poster, 779 distinkta
  // id. Att bara rapportera det ena hade fått fyra rader att se ut som om de försvann.
  const ut = await K.noteraKatalog(pool, [post(G1, 'Rose'), post(G1, 'Rose'), post(G2, 'Heart Me')],
    { region: REGION, forvantat: { poster: 3, unikaId: 2, utanId: 0 } });
  assert.equal(ut.ok, true);
  assert.equal(ut.skrivna, 3, 'antalet poster stämmer inte');
  assert.equal(ut.unikaId, 2, 'antalet distinkta id stämmer inte');
  const q = await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
  assert.equal(q.rows[0].n, 2, 'dubbletten blev två rader');
});

prov('statussvaret bär regionen, men fortfarande inga id', async () => {
  await rigga(post(G1, 'Rose'));
  const r = await anrop('GET', '/api/admin/gavokatalog/status', { som: 'admin' });
  assert.equal(r.status, 200);
  const rad = (r.body.regioner || []).find(x => x.region === REGION);
  assert.ok(rad && rad.n >= 1, 'status visade ingen region');
  assert.ok(r.body.seedningar && r.body.seedningar.some(x => x.region === REGION && x.klar),
    'status sa inte att regionen faktiskt är färdigseedad');
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes(G1), 'statussvaret bär råa gåvo-id');
  assert.ok(!text.includes('Rose'), 'statussvaret bär gåvonamn');
});

prov('fält utifrån saneras — inget går orört in i databasen', async () => {
  const langt = 'A'.repeat(500);
  const langUrl = 'https://x.invalid/' + 'b'.repeat(2000);
  await anrop('POST', '/api/admin/gavokatalog', {
    som: 'admin',
    kropp: { region: REGION, gifts: [{ id: G1, name: langt, diamond_count: -5, image: { url_list: [langUrl] } }] }
  });
  const q = await pool.query(
    'SELECT gift_name,gift_image,diamanter FROM gavokatalog WHERE gift_id=$1', [G1]);
  assert.ok(q.rows[0].gift_name.length <= 160, 'namnet kapades inte');
  assert.equal(q.rows[0].diamanter, 0, 'ett negativt antal diamanter slapp igenom');
  // BILDEN ÄR DET ENDA FÄLTET SOM BÄR EN ANGRIPARSTYRD URL, och provet hette redan "fält utifrån
  // saneras" utan att röra den: `langUrl` byggdes på 2019 tecken och kastades sedan bort.
  // Mutationsmätt: ta bort `, 1200` ur text(...) i gavokatalog.js och provet var fortfarande grönt.
  assert.ok(q.rows[0].gift_image.length <= 1200, 'en 2019 tecken lång URL gick orörd in i databasen');
  assert.ok(q.rows[0].gift_image.startsWith('https://x.invalid/'), 'fel fält hamnade i gift_image');
});

// ---- 3 · VERIFIERINGEN -------------------------------------------------------------------------

prov('verifiering gör ett katalog-id matchbart', async () => {
  await rigga(post(G2, 'Heart Me'));

  const fore = await pool.query("SELECT count(*)::int n FROM gavoregel WHERE status='verifierad' AND gift_id=$1", [G2]);
  assert.equal(fore.rows[0].n, 0, 'ett katalog-id var matchbart innan någon verifierat det');

  const r = await anrop('POST', '/api/admin/gavoregel/heart_me/verifiera', { som: 'admin', kropp: { giftId: G2 } });
  assert.equal(r.status, 200);

  assert.ok((await K.verifieradeId(pool, 'heart_me')).includes(G2));
});

prov('ett id katalogen inte känner kan inte verifieras', async () => {
  const r = await anrop('POST', '/api/admin/gavoregel/heart_me/verifiera',
    { som: 'admin', kropp: { giftId: 'httprov-finns-ej' } });
  assert.equal(r.status, 409);
  assert.equal(r.body.skal, 'okand-gava');
});

prov('en påhittad regelnyckel avvisas', async () => {
  // Nyckeln valideras av servern (regelnycklar.js) — webbläsaren väljer aldrig vilken låda något
  // hamnar i.
  const r = await anrop('POST', '/api/admin/gavoregel/hittepa/verifiera', { som: 'admin', kropp: { giftId: G2 } });
  assert.equal(r.status, 400);
});

prov('en vanlig användare kan inte verifiera', async () => {
  await rigga(post(G2, 'Heart Me'));
  const r = await anrop('POST', '/api/admin/gavoregel/heart_me/verifiera', { som: 'vanlig', kropp: { giftId: G2 } });
  assert.equal(r.status, 403);
  assert.ok(!(await K.verifieradeId(pool, 'heart_me')).includes(G2));
});

// ---- 4 · STATUSSVARET AVSLÖJAR INGA ID ---------------------------------------------------------

prov('status räknar, men lämnar aldrig ut vilka id som finns', async () => {
  await rigga(post(G1, 'Rose'), post(G2, 'Heart Me'));
  await anrop('POST', '/api/admin/gavoregel/heart_me/verifiera', { som: 'admin', kropp: { giftId: G2 } });

  const r = await anrop('GET', '/api/admin/gavokatalog/status', { som: 'admin' });
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes(G1) && !text.includes(G2), 'svaret bär råa gåvo-id');
  assert.ok(!text.includes('Heart Me'), 'svaret bär gåvonamn');
  // KONTROLLMÄTNING: det ska ändå säga något — annars bevisar negationerna ingenting.
  assert.ok(Array.isArray(r.body.katalog) && r.body.katalog.length > 0, 'status svarade tomt');
});




// ---- KONTRAKTET, INTE KROPPEN ------------------------------------------------------------------

prov('kontrakt · en trunkerad lista med SNÄLLA egna kontrolltal avvisas ändå', async () => {
  // DET HÄR ÄR HELA POÄNGEN. Anroparen skickar en lista på en post OCH kontrolltal som matchar den
  // listan perfekt. Med tal ur payloaden hade det markerats `klar`. Rutten ska i stället använda
  // det granskade SE-kontraktet — 783/779/0 — och avvisa.
  const r = await anrop('POST', '/api/admin/gavokatalog', {
    som: 'admin',
    kropp: { region: REGION, gifts: [post(G1, 'Rose')], forvantat: { poster: 1, unikaId: 1, utanId: 0 } }
  });
  assert.notEqual(r.status, 200, 'egna kontrolltal i kroppen godkände en trunkerad seedning');
  assert.equal(r.body.ok, false);
  const q = await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
  assert.equal(q.rows[0].n, 0, 'en avvisad seedning lämnade rader');
});

prov('kontrakt · en kropp som bär forvantat avvisas med 400', async () => {
  // Gränsen ska vara uttrycklig. Att tyst ignorera fältet hade fått anroparen att tro att talen
  // gällde.
  const r = await anrop('POST', '/api/admin/gavokatalog', {
    som: 'admin',
    kropp: { region: REGION, gifts: [post(G1, 'Rose')], forvantat: { poster: 783, unikaId: 779, utanId: 0 } }
  });
  assert.equal(r.status, 400, 'kroppen fick bära kontrolltal');
  assert.equal(r.body.ok, false);
});

prov('kontrakt · en region utan granskat kontrakt ger 400 och skriver inget', async () => {
  const r = await anrop('POST', '/api/admin/gavokatalog', {
    som: 'admin', kropp: { region: 'JP', gifts: [post(G1, 'Rose')] }
  });
  assert.equal(r.status, 400, 'en region utan granskat kontrakt kunde seedas');
  assert.equal(r.body.ok, false);
  const q = await pool.query("SELECT count(*)::int n FROM gavokatalog WHERE gift_id LIKE 'httprov-%'");
  assert.equal(q.rows[0].n, 0);
});

prov('kontrakt · rutten läser kontrolltalen ur kontraktet — bevisat med SE:s egna tal', async () => {
  // En lista som möter SE-kontraktet exakt SKA gå igenom. Utan den här kontrollmätningen bevisar
  // avslagen ovan bara att rutten är trasig.
  const Kontrakt = require('../seedningskontrakt');
  const se = Kontrakt.for(REGION);
  const gifts = [];
  for (let i = 0; i < se.unikaId; i++) gifts.push(post('httprov-' + (20000 + i), 'G' + i));
  for (let i = 0; i < se.poster - se.unikaId; i++) gifts.push(post('httprov-' + (20000 + i), 'G' + i));

  const r = await anrop('POST', '/api/admin/gavokatalog', { som: 'admin', kropp: { region: REGION, gifts } });
  assert.equal(r.status, 200, 'en lista som möter kontraktet avvisades');
  assert.equal(r.body.ok, true);
  assert.equal(r.body.status, 'klar');
  assert.equal(r.body.forvantat.poster, 783, 'svaret visar inte vilket kontrakt som användes');
});


// ---- ADMINSPÄRREN PÅ ÅTERKALLNING, RADERING OCH KANDIDATLISTAN ---------------------------------
//
// Facitlistan avgör vad som får trigga Gift Campaign, Gift Fireworks och Goals hos ALLA kunder.
// Att godkänna, ändra och ta bort måste därför ligga bakom samma spärr — och alla tre rutterna är
// nya, alltså är detta första gången någon mäter dem.

const rustaVerifierad = async id => {
  await rigga(post(id, 'Heart Me'));
  await anrop('POST', '/api/admin/gavoregel/heart_me/verifiera', { som: 'admin', kropp: { giftId: id } });
  K.tomCache();
  assert.ok((await K.verifieradeId(pool, 'heart_me')).includes(id), 'riggen kunde inte godkänna');
};

prov('en vanlig användare kan inte INAKTIVERA en godkänd post', async () => {
  await rustaVerifierad(G1);
  const r = await anrop('POST', '/api/admin/gavoregel/heart_me/inaktivera',
    { som: 'vanlig', kropp: { giftId: G1 } });
  assert.equal(r.status, 403);
  K.tomCache();
  assert.ok((await K.verifieradeId(pool, 'heart_me')).includes(G1), 'en kund stängde av en godkänd gåva');
});

prov('en vanlig användare kan inte TA BORT en post', async () => {
  await rustaVerifierad(G1);
  const r = await anrop('DELETE', '/api/admin/gavoregel/heart_me/' + encodeURIComponent(G1),
    { som: 'vanlig' });
  assert.equal(r.status, 403);
  K.tomCache();
  assert.ok((await K.verifieradeId(pool, 'heart_me')).includes(G1), 'en kund raderade en godkänd gåva');
});

prov('en vanlig användare kan inte se kandidatlistan', async () => {
  const r = await anrop('GET', '/api/admin/gavoregel/heart_me/kandidater?region=' + REGION, { som: 'vanlig' });
  assert.equal(r.status, 403);
});

prov('utan inloggning nås ingen av de tre nya rutterna', async () => {
  for (const [metod, vag] of [
    ['POST', '/api/admin/gavoregel/heart_me/inaktivera'],
    ['DELETE', '/api/admin/gavoregel/heart_me/prov-1'],
    ['GET', '/api/admin/gavoregel/heart_me/kandidater?region=' + REGION]
  ]) {
    const r = await anrop(metod, vag, { kropp: metod === 'GET' ? null : { giftId: G1 } });
    assert.ok(r.status === 401 || r.status === 403, `${metod} ${vag} gav ${r.status}`);
  }
});

prov('administratören kan inaktivera, och gåvan slutar matcha', async () => {
  await rustaVerifierad(G1);
  const r = await anrop('POST', '/api/admin/gavoregel/heart_me/inaktivera',
    { som: 'admin', kropp: { giftId: G1 } });
  assert.equal(r.status, 200);
  K.tomCache();
  assert.deepEqual(await K.verifieradeId(pool, 'heart_me'), [], 'gåvan matchade efter återkallning');
});

prov('administratören kan ta bort, och rutten skiljer på saknad och lyckad', async () => {
  await rustaVerifierad(G1);
  const ok = await anrop('DELETE', '/api/admin/gavoregel/heart_me/' + encodeURIComponent(G1), { som: 'admin' });
  assert.equal(ok.status, 200);

  const igen = await anrop('DELETE', '/api/admin/gavoregel/heart_me/' + encodeURIComponent(G1), { som: 'admin' });
  assert.equal(igen.status, 404, 'en radering av något som inte finns rapporterades som lyckad');
});

prov('kandidatlistan lämnar ut id till administratören — men aldrig en källa', async () => {
  await rigga(post(G1, 'Heart Me'));
  await K.noteraKandidat(pool, 'heart_me', G1, 'kreator-a');

  const r = await anrop('GET', '/api/admin/gavoregel/heart_me/kandidater?region=' + REGION, { som: 'admin' });
  assert.equal(r.status, 200);
  assert.equal(r.body.kandidater[0].gift_id, G1);
  assert.equal(r.body.kandidater[0].status, 'kandidat');

  const text = JSON.stringify(r.body);
  assert.ok(!text.includes('kreator'), 'en källa läckte ut');
  assert.ok(!/[0-9a-f]{64}/.test(text), 'en hashad källnyckel läckte ut');
});

prov('en påhittad regelnyckel avvisas på alla tre rutterna', async () => {
  for (const [metod, vag] of [
    ['POST', '/api/admin/gavoregel/hittepa/inaktivera'],
    ['DELETE', '/api/admin/gavoregel/hittepa/prov-1'],
    ['GET', '/api/admin/gavoregel/hittepa/kandidater?region=SE']
  ]) {
    const r = await anrop(metod, vag, { som: 'admin', kropp: metod === 'GET' ? null : { giftId: G1 } });
    assert.equal(r.status, 400, `${metod} ${vag} accepterade en okänd regelnyckel`);
  }
});

