'use strict';
// UTKORGSWORKERN — röda prov före implementation (fas 1 i PR #270, design godkänd med
// korrigeringar 2026-08-25).
//
// Workern är en PULSGIVARE: allt ägarskap (claim med SKIP LOCKED, per-workspace-ordning, lease,
// retry/park) bor i den redan mutationsbevisade publiceraUtkorg i stream-sessions.js, och
// publiceringen går genom publiceraTillBuss → eventBus.publishInternal. Proven här bevisar
// PULSEN: ingen överlappande loop, fler instanser utan dubbelpublicering, bounded shutdown,
// fel som backoff i stället för krasch, och metrics som gör parked till en synlig
// driftindikering — id:n i logg och metrics, aldrig payload eller token.
//
// Designens tal (docs/worker-och-klient-design.md §Del A): poll 1000 ms, batch 20,
// stoppväntan max 5 s (halva serverns hårda 10 s), lease 30 s ägs av stream-sessions.
const test = require('node:test'), assert = require('node:assert/strict');
const { Pool } = require('pg');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Claim-/leasepulsen går inte att prova mot en attrapp.';

let W = null;
try { W = require('../stream-worker'); } catch {}
const finns = () => assert.ok(W && typeof W.startStreamWorker === 'function',
  'server/stream-worker.js finns inte än — pulsgivaren som äger polltakten');

const AGARE = 'cccccccc-0000-4000-8000-000000000001';
const WS_A = 'cccccccc-1111-4000-8000-000000000001';
const WS_B = 'cccccccc-2222-4000-8000-000000000002';

let pool;
const prov = (namn, fn) => test('worker: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

let radNr = 0;
async function rad(ws, over = {}) {
  const eventId = over.eventId || `wprov:${++radNr}:${Date.now()}`;
  const q = await pool.query(
    `INSERT INTO stream_event_outbox (workspace_id, event_id, topic, payload, attempts, next_attempt_at, lease_owner, lease_until)
     VALUES ($1,$2,'livesession',$3, $4, coalesce($5::timestamptz, now()), $6, $7::timestamptz)
     RETURNING id, event_id`,
    [ws, eventId, JSON.stringify(over.payload || { type: 'livesession', event: 'live:start', eventId, sessionId: eventId }),
     over.attempts || 0, over.nextAttemptAt || null, over.leaseOwner || null, over.leaseUntil || null]);
  return q.rows[0];
}

function fejkBuss() {
  const publicerade = [];   // {workspaceId, eventId, at}
  let fall = null;          // eventId-prefix som ska kasta, eller 'alla'
  const slappta = new Map();// eventId -> resolvefn för långsamma publiceringar
  return {
    publicerade, slappta,
    fallFor: v => { fall = v; },
    langsam: new Set(),
    publishInternal(workspaceId, payload) {
      const eventId = payload && payload.eventId;
      if (fall === 'alla' || (fall && String(eventId).startsWith(fall))) {
        return Promise.reject(new Error('Redis är nere (prov)'));
      }
      if (this.langsam.has(eventId)) {
        return new Promise(resolve => { slappta.set(eventId, () => { publicerade.push({ workspaceId, eventId }); resolve(); }); });
      }
      publicerade.push({ workspaceId, eventId });
      return Promise.resolve();
    },
  };
}

async function tills(villkor, beskrivning, varv = 4000) {
  for (let i = 0; i < varv; i++) {
    if (await villkor()) return;
    await new Promise(r => setTimeout(r, 5));
  }
  assert.fail('villkoret uppfylldes aldrig: ' + beskrivning);
}

function fangare() {
  const rader = [];
  return { rader, log: (...a) => rader.push(a.join(' ')), error: (...a) => rader.push('ERROR ' + a.join(' ')) };
}

// VARJE startad worker registreras och stoppas i afterEach — ett prov som faller mitt i far
// annars kvar en ZOMBIE som polla vidare och forgiftar nasta provs rader (CI-laxan fran forsta
// grona forsoket: en ostoppad fallFor('alla')-worker at upp nasta provs rad med vaxande backoff).
const startade = [];
function starta(opts) {
  finns();
  const w = W.startStreamWorker(opts);
  startade.push(w);
  return w;
}

function rigg(over = {}) {
  const buss = fejkBuss(), logg = fangare(), metrics = {};
  const w = starta({
    pool, eventBus: buss, metrics, logg,
    intervallMs: 10, antal: 20, workerId: over.workerId || 'provworker-1',
    stoppVantanMs: over.stoppVantanMs || 5000,
    ...over,
  });
  return { w, buss, logg, metrics };
}

test.afterEach(async () => {
  if (BLOCKED || !pool) return;
  while (startade.length) { try { await startade.pop().stop(); } catch (_) {} }
  // Rent utkorgslage per prov: en oclaimad rad fran ett fallet prov blockerar annars hela
  // workspacet via den fail-closed NOT EXISTS-ordningen.
  await pool.query('DELETE FROM stream_event_outbox');
});

test.before(async () => {
  if (BLOCKED) return;
  pool = new Pool({ connectionString: DB_URL });
  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','worker-agare',now()) ON CONFLICT (id) DO NOTHING`, [AGARE, AGARE + '@t.invalid']);
  for (const [ws, namn] of [[WS_A, 'worker-a'], [WS_B, 'worker-b']]) {
    await pool.query(`INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,$2,$3)
      ON CONFLICT (id) DO NOTHING`, [ws, namn, AGARE]);
  }
  // Filerna delar databas i CI-jobbet och workern claimar VILKEN pending rad som helst —
  // börja från ett tomt utkorgsläge (föregående filers after-hookar har redan städat sitt).
  await pool.query('DELETE FROM stream_event_outbox');
});

test.after(async () => {
  if (BLOCKED) return;
  await pool.query('DELETE FROM stream_event_outbox WHERE workspace_id IN ($1,$2)', [WS_A, WS_B]);
  await pool.end();
});

// ---- Flaggan och startvägen ---------------------------------------------------------------------

prov('flaggan av: index.js startar workern ENDAST bakom VYRA_SANDNINGSIDENTITET === \'1\'', () => {
  finns();
  const fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.ok(src.includes("require('./stream-worker')"), 'index.js kräver inte stream-worker än');
  const anrop = src.indexOf('startStreamWorker(');
  assert.ok(anrop > 0, 'index.js anropar aldrig startStreamWorker');
  const fore = src.slice(Math.max(0, anrop - 300), anrop);
  assert.ok(/VYRA_SANDNINGSIDENTITET['"]?\s*(===|==)\s*['"]1['"]/.test(fore),
    'workerstarten är inte grindad på exakt flaggvillkoret strax före anropet');
  const mainVakt = src.indexOf('require.main===module');
  assert.ok(anrop > mainVakt, 'workerstarten ligger inte i require.main-blocket');
});

prov('stop() utan att något hänt är ofarligt och idempotent', async () => {
  const { w, buss } = rigg();
  await w.stop();
  await w.stop();
  assert.equal(buss.publicerade.length, 0);
});

// ---- Pulsens kärna ------------------------------------------------------------------------------

prov('en rad publiceras via adaptern och markeras publicerad', async () => {
  const r = await rad(WS_A);
  const { w, buss, metrics } = rigg();
  await tills(() => buss.publicerade.length >= 1, 'publiceringen');
  await w.stop();
  assert.deepEqual(buss.publicerade[0], { workspaceId: WS_A, eventId: r.event_id });
  const kvar = await pool.query('SELECT published_at FROM stream_event_outbox WHERE id=$1', [r.id]);
  assert.ok(kvar.rows[0].published_at, 'raden markerades inte publicerad');
  assert.equal(metrics.utkorg.publicerade, 1);
});

// AT-LEAST-ONCE, INTE EXAKT EN GANG. Det har provet visar att tva SAMTIDIGA workers inte trampar
// pa varandra: claimen (FOR UPDATE SKIP LOCKED + lease) ger raden till exakt en av dem, sa ingen
// rad publiceras tva ganger PARALLELLT. Det ar inte samma sak som exakt-en-gang-leverans: Redis-
// publiceringen och databaskvittensen ar tva steg, och en krasch eller deployvaxling daremellan
// ger en publicering utan kvittens som nasta varv gor om. Se provet om leasen nedan, och
// klientens dedupe pa stabilt eventId — det ar dar dubbletten blir ofarlig.
prov('tva samtidiga workers publicerar aldrig samma rad parallellt', async () => {
  const rader = [];
  for (let i = 0; i < 12; i++) rader.push(await rad(i % 2 ? WS_A : WS_B));
  const buss = fejkBuss(), logg = fangare();
  const w1 = starta({ pool, eventBus: buss, metrics: {}, logg, intervallMs: 5, antal: 3, workerId: 'w1' });
  const w2 = starta({ pool, eventBus: buss, metrics: {}, logg, intervallMs: 5, antal: 3, workerId: 'w2' });
  await tills(() => buss.publicerade.length >= rader.length, 'alla tolv publicerade');
  await w1.stop(); await w2.stop();
  const perEvent = new Map();
  for (const p of buss.publicerade) perEvent.set(p.eventId, (perEvent.get(p.eventId) || 0) + 1);
  for (const r of rader) assert.equal(perEvent.get(r.event_id), 1, `raden ${r.event_id} publicerades ${perEvent.get(r.event_id)} gånger`);
});

prov('shutdown mitt i publicering: varvet görs klart, inga nya claims, stop löser inom budgeten', async () => {
  const r1 = await rad(WS_A);
  const { w, buss } = rigg();
  buss.langsam.add(r1.event_id);
  await tills(() => buss.slappta.has(r1.event_id), 'publiceringen påbörjad');
  const stoppet = w.stop();
  let lost = false; stoppet.then(() => { lost = true; });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(lost, false, 'stop() löste innan pågående publicering avgjorts');
  buss.slappta.get(r1.event_id)();
  await stoppet;
  const r2 = await rad(WS_A);
  await new Promise(r => setTimeout(r, 80));
  const kvar = await pool.query('SELECT published_at, lease_owner FROM stream_event_outbox WHERE id=$1', [r2.id]);
  assert.equal(kvar.rows[0].published_at, null, 'en stoppad worker claimade en ny rad');
  assert.equal(kvar.rows[0].lease_owner, null);
  await pool.query('DELETE FROM stream_event_outbox WHERE id=$1', [r2.id]);
});

prov('hängd publicering: stop ger upp inom stoppVantanMs och raden återtas efter lease-utgång', async () => {
  // KLOCKFALLAN (O1/X5-laxan): DB:ns now() kan ligga fore en frusen injicerad klocka och gora
  // raden aldrig due. Rader i klockstyrda prov far darfor explicit next_attempt_at i det
  // forflutna i stallet for DB-default.
  let klocka = Date.now();
  const r1 = await rad(WS_A, { nextAttemptAt: new Date(0).toISOString() });
  const buss = fejkBuss(), logg = fangare();
  const w = starta({ pool, eventBus: buss, metrics: {}, logg,
    intervallMs: 10, antal: 20, workerId: 'hangd', stoppVantanMs: 150, nu: () => klocka });
  buss.langsam.add(r1.event_id);
  await tills(() => buss.slappta.has(r1.event_id), 'publiceringen påbörjad');
  const t0 = Date.now();
  await w.stop();                       // publiceringen släpps ALDRIG — budgeten ska rädda oss
  assert.ok(Date.now() - t0 < 2000, 'stop() väntade långt över budgeten');
  // Raden står kvar leasad av den övergivna publiceringen — och återtas när leasen gått ut.
  klocka += 31_000;
  const buss2 = fejkBuss(), w2 = starta({ pool, eventBus: buss2, metrics: {}, logg,
    intervallMs: 10, antal: 20, workerId: 'levande', nu: () => klocka });
  await tills(() => buss2.publicerade.length >= 1, 'återtag efter lease-utgång');
  await w2.stop();
  assert.equal(buss2.publicerade[0].eventId, r1.event_id);
});

// LANGSAM BATCH SOM PASSERAR LEASEN. Batchen ar 20 rader och leasen 30 s. Tar den samlade
// behandlingen langre tid an sa loper leasen ut MEDAN raden fortfarande behandlas, och nasta
// instans tar tillbaka den och publicerar igen. Det ar utkorgens at-least-once i sin renaste form.
//
// Det som gor det ofarligt ar att `event_id` byggs ur radens EGEN data (`live:start:<sessionId>`)
// och darfor ar identiskt over ompubliceringar. Provet mater just det: samma eventId, samma
// payload — och da ar klientens dedupe (tests/live-session-client.test.js) en no-op.
prov('langsam batch passerar leasen: ompubliceringen bar SAMMA eventId och payload', async () => {
  let klocka = Date.now();
  const r1 = await rad(WS_A, { nextAttemptAt: new Date(0).toISOString() });
  const buss = fejkBuss(), logg = fangare();
  const w = starta({ pool, eventBus: buss, metrics: {}, logg,
    intervallMs: 10, antal: 20, workerId: 'langsam', stoppVantanMs: 100, nu: () => klocka });
  buss.langsam.add(r1.event_id);
  await tills(() => buss.slappta.has(r1.event_id), 'forsta publiceringen paborjad');
  await w.stop();                       // varvet overges mitt i — kvittensen skrivs aldrig

  const forePublicerad = await pool.query(
    'SELECT published_at FROM stream_event_outbox WHERE id=$1', [r1.id]);
  assert.equal(forePublicerad.rows[0].published_at, null,
    'riggen kvitterade anda — da mater provet inte det den ska');

  klocka += 31_000;                     // leasen har lopt ut
  const buss2 = fejkBuss();
  const w2 = starta({ pool, eventBus: buss2, metrics: {}, logg,
    intervallMs: 10, antal: 20, workerId: 'nasta', nu: () => klocka });
  await tills(() => buss2.publicerade.length >= 1, 'ompublicering efter lease-utgang');
  await w2.stop();

  assert.equal(buss2.publicerade[0].eventId, r1.event_id,
    'ompubliceringen bar ett ANNAT eventId — da hade klientens dedupe inte kunnat fanga den');
  assert.equal(buss2.publicerade[0].workspaceId, WS_A);
});

// ---- Driftindikeringen larmar en gång, inte vid varje omstart ---------------------------------

prov('en GAMMAL parkerad rad larmar inte om igen vid omstart eller deployoverlapp', async () => {
  const gammal = await rad(WS_B);
  await pool.query(
    "UPDATE stream_event_outbox SET parked_at=now() - interval '1 hour', attempts=8 WHERE id=$1",
    [gammal.id]);
  const logg1 = fangare(), logg2 = fangare();
  // Tva processer samtidigt = deployoverlapp. Ingen av dem far larma om den gamla raden.
  const w1 = starta({ pool, eventBus: fejkBuss(), metrics: {}, logg: logg1, intervallMs: 10, workerId: 'omstart-1' });
  const w2 = starta({ pool, eventBus: fejkBuss(), metrics: {}, logg: logg2, intervallMs: 10, workerId: 'omstart-2' });
  await new Promise(r => setTimeout(r, 150));
  const larm = [...logg1.rader, ...logg2.rader].filter(t => t.includes('rad parkerad'));
  assert.deepEqual(larm, [], 'gamla parkerade rader larmade om vid uppstart');

  // En NY parkering ska daremot synas — indikeringen far inte tystas helt.
  const ny = await rad(WS_B);
  await pool.query('UPDATE stream_event_outbox SET parked_at=now(), attempts=8 WHERE id=$1', [ny.id]);
  await tills(() => [...logg1.rader, ...logg2.rader].some(t => t.includes(ny.event_id)),
    'en nyparkerad rad larmade aldrig');
  await w1.stop(); await w2.stop();
  await pool.query('DELETE FROM stream_event_outbox WHERE id=ANY($1)', [[gammal.id, ny.id]]);
});

// ---- Felloggen far aldrig bara hemligheten ----------------------------------------------------

prov('uppkopplingsstrangen i ett felmeddelande saneras fore loggning', async () => {
  await rad(WS_A);
  const buss = fejkBuss(), logg = fangare();
  const HEMLIS = 'sup3rhemligt';
  // VARV-niva, inte radniva: ett fel i sand() fangas av publiceraUtkorg och blir backoff pa raden.
  // Det som nar varvets catch — och alltsa driftloggen — ar ett trasigt POOL-anrop, precis som nar
  // Postgres eller Redis inte gar att na alls. Poolen lanas ut med ett kast och lamnas tillbaka.
  const riktig = pool.query.bind(pool);
  pool.query = async () => {
    throw new Error(`connect ECONNREFUSED redis://default:${HEMLIS}@redis.internal:6379 token=${HEMLIS}`);
  };
  const w = starta({ pool, eventBus: buss, metrics: {}, logg, intervallMs: 10, workerId: 'sanering' });
  try {
    await tills(() => logg.rader.some(t => t.includes('[utkorg-worker][error]')), 'ingen felrad loggades');
  } finally { pool.query = riktig; await w.stop() }
  const text = logg.rader.join(' ');
  assert.equal(text.includes(HEMLIS), false, 'losenordet skrevs rakt ut i driftloggen');
  assert.ok(text.includes('<uppkoppling>@') || text.includes('<dolt>'), 'saneringen syns inte i texten');
});

// ---- Fel är backoff, aldrig krasch --------------------------------------------------------------

prov('Redis nere: retry med backoff, loopen lever, och publicering när bussen friskförklaras', async () => {
  const r1 = await rad(WS_A);
  const { w, buss, logg } = rigg();
  buss.fallFor('alla');
  await tills(async () => {
    const q = await pool.query('SELECT attempts FROM stream_event_outbox WHERE id=$1', [r1.id]);
    return q.rows[0] && q.rows[0].attempts >= 1;
  }, 'första misslyckade försöket bokfört');
  const attemptsQ = await pool.query('SELECT attempts, next_attempt_at > now() AS backoff FROM stream_event_outbox WHERE id=$1', [r1.id]);
  assert.ok(attemptsQ.rows[0].backoff, 'misslyckandet fick ingen backoff');
  buss.fallFor(null);
  // Snabba fram backoffen: sätt next_attempt_at till nu så pulsen tar raden direkt.
  await pool.query('UPDATE stream_event_outbox SET next_attempt_at = now() WHERE id=$1', [r1.id]);
  await tills(() => buss.publicerade.length >= 1, 'publicering efter återhämtning');
  await w.stop();
  assert.ok(!logg.rader.join(' ').includes('"sessionId"'), 'payload läckte i loggen');
});

prov('trasig claim-fråga (Postgres-fel) kraschar inte loopen', async () => {
  // Claimen gar via pool.connect() — det ar den som falls. Ovriga fragor delegeras till den
  // riktiga poolen sa matare/parkeringslasning fungerar.
  const trasig = { connect: () => { trasig.anrop++; return trasig.anrop <= 2 ? Promise.reject(new Error('PG borta (prov)')) : pool.connect(); }, query: (...a) => pool.query(...a), anrop: 0 };
  const r1 = await rad(WS_A);
  const buss = fejkBuss(), logg = fangare();
  const w = starta({ pool: trasig, eventBus: buss, metrics: {}, logg, intervallMs: 10, antal: 20, workerId: 'pg-fel' });
  await tills(() => buss.publicerade.length >= 1, 'publicering trots två PG-fel');
  await w.stop();
  assert.ok(logg.rader.some(r => r.includes('ERROR')), 'PG-felen loggades inte');
});

// ---- Ordning och poison genom pulsen ------------------------------------------------------------

prov('end(old) publiceras före start(new) genom workerns puls', async () => {
  const slut = await rad(WS_A, { eventId: `wprov:end:${Date.now()}` });
  const start = await rad(WS_A, { eventId: `wprov:start:${Date.now()}` });
  const { w, buss } = rigg();
  await tills(() => buss.publicerade.length >= 2, 'båda publicerade');
  await w.stop();
  const ordning = buss.publicerade.map(p => p.eventId);
  assert.deepEqual(ordning, [slut.event_id, start.event_id], 'ordningen bröts genom pulsen');
});

prov('parkerad rad blockerar ENDAST sitt workspace, syns i metrics och driftloggen', async () => {
  const gift = await rad(WS_A, { attempts: 7, eventId: `wprov:gift:${Date.now()}` });
  const bakom = await rad(WS_A);
  const annan = await rad(WS_B);
  const { w, buss, logg, metrics } = rigg();
  buss.fallFor('wprov:gift');
  await tills(() => buss.publicerade.some(p => p.eventId === annan.event_id), 'andra workspacet publicerade');
  await tills(async () => {
    const q = await pool.query('SELECT parked_at FROM stream_event_outbox WHERE id=$1', [gift.id]);
    return q.rows[0] && q.rows[0].parked_at;
  }, 'giftraden parkerades (försök 8)');
  await new Promise(r => setTimeout(r, 60));
  const bakomQ = await pool.query('SELECT published_at FROM stream_event_outbox WHERE id=$1', [bakom.id]);
  assert.equal(bakomQ.rows[0].published_at, null, 'raden bakom giftet publicerades trots parkering');
  await w.stop();
  assert.ok(metrics.utkorg.parked >= 1, 'parked-mätaren visar inte parkeringen: ' + JSON.stringify(metrics.utkorg));
  // Tva rader innehaller 'parkerad': stream-sessions egen ('handelse parkerad efter 8 forsok,
  // rad N' — utan id:n) och workerns driftrad. Indikeringen som provas ar WORKERNS.
  const driftRad = logg.rader.find(r => r.includes('[utkorg-worker]') && r.includes('parkerad'));
  assert.ok(driftRad, 'ingen synlig driftindikering för parkeringen');
  assert.ok(driftRad.includes(WS_A) && driftRad.includes(gift.event_id), 'driftraden pekar inte ut workspace+eventId');
  assert.ok(!driftRad.includes('sessionId'), 'driftraden bär payload');
  // Stada: en kvarlamnad parkerad rad blockerar ALLA senare WS_A-rader (fail-closed-ordningen),
  // vilket hade fallt nasta prov av fel skal.
  await pool.query('DELETE FROM stream_event_outbox WHERE id IN ($1,$2)', [gift.id, bakom.id]);
});

prov('metrics bär pending, leased och parked som mätare', async () => {
  await rad(WS_B);
  const { w, buss, metrics } = rigg();
  await tills(() => buss.publicerade.length >= 1, 'publicerad');
  await tills(() => metrics.utkorg && metrics.utkorg.pending !== undefined, 'mätarna satta');
  await w.stop();
  for (const falt of ['pending', 'leased', 'parked', 'publicerade']) {
    assert.equal(typeof metrics.utkorg[falt], 'number', `metrics.utkorg.${falt} saknas eller är inte ett tal`);
  }
});
