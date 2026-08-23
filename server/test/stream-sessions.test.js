'use strict';
// SÄNDNINGSIDENTITET v3 — en auktoritativ sessionsmodell på servern.
//
// EMPIRIN, uppmätt 2026-08-22 med en skrivskyddad sond (inga lyssnare, inga sparade händelser):
//   LIVE 1  15:33:10–15:44:44 CEST   roomId 7676848357138664214
//   LIVE 2  16:26:37                 roomId 7676861956443147030
// Samma konto, dag och deployment. Två sändningar gav TVÅ roomId. n = 2, en anslutning per
// sändning — roomId:s stabilitet GENOM en återanslutning är fortfarande omätt.
//
// MÄTNINGAR SOM STYR DEN HÄR FILEN (2026-08-22, mot koden på main):
//   · tiktok_connections har workspace_id som PRIMARY KEY och INGEN unik nyckel på
//     tiktok_username → samma TikTok-konto kan vara anslutet i FLERA workspaces. Ett statusbesked
//     måste därför fan-outas, och fan-out får inte öppna fler TikTok-anslutningar.
//   · ingest autentiseras med en global maskintoken: POST /api/events/tiktok/:workspaceId med
//     Authorization: Bearer $TIKTOK_INGEST_TOKEN, konstanttidsjämförd, minst 32 tecken
//     (server/index.js). Ingen workspace-membership är inblandad — bryggan HAR ingen användare.
//   · goal_runtime bär baseline, progress, target, epoch, revision. Den visade siffran är
//     baseline + progress, så en nollställning får aldrig röra baseline eller target.
//   · `vyra-session-ended` betyder UTLOGGNING/kontobyte (session-state.js:449), inte slutet på en
//     sändning. Ordet "session" är redan upptaget två gånger i kodbasen. Sändningsbegreppet heter
//     därför stream_session och signalen `vyra-live-session` — att återanvända det gamla namnet
//     hade rivit SSE-strömmen vid varje ny sändning.
//
// VARFÖR POSTGRES OCH INTE EN ATTRAPP: hela poängen är ATOMICITET. Två statusbesked som kommer
// samtidigt ska ge exakt EN session, och det är en garanti databasen ger — inte koden.
const test = require('node:test'), assert = require('node:assert/strict');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Sessionsmodellen är oprövad tills TEST_DATABASE_URL '
    + 'pekar på en engångsdatabas — och atomiciteten går inte att prova mot en attrapp.';
const prov = (namn, fn) => test(`session: ${namn}`, { timeout: 30000, skip: BLOCKED }, fn);
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;

// Modulen finns ännu inte. Proven är röda tills den byggs — det är avsikten.
let skapaStreamSessions = null;
try { ({ skapaStreamSessions } = require('../stream-sessions.js')) } catch (_) {}

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';   // samma TikTok-konto, annat workspace
const KONTO = 'jokero060';
const AGARE = '33333333-3333-4333-8333-333333333333';
const KOR_1 = 'kornings-id-1', KOR_2 = 'kornings-id-2';
const RUM_1 = '7676848357138664214';
const RUM_2 = '7676861956443147030';

async function rigg() {
  assert.ok(skapaStreamSessions,
    'server/stream-sessions.js finns inte än — modulen som äger sessionsbeslutet');
  const { pool } = require('../db.js');
  const sessioner = skapaStreamSessions({ pool });
  // Förutsättningarna måste FINNAS, inte antas. tiktok_connections och stream_sessions har båda
  // främmande nyckel mot workspaces, som i sin tur kräver en ägare — utan de här raderna faller
  // varje prov på en FK-överträdelse i riggen i stället för på sin egen assertion. Uppmätt i CI
  // 2026-08-22: 34 av 39 föll på tiktok_connections_workspace_id_fkey.
  await pool.query(
    "INSERT INTO users(id,email,password_hash,display_name) "
    + "VALUES($1,'sessionsprov@exempel.invalid','x','Provägare') ON CONFLICT (id) DO NOTHING",
    [AGARE]);
  for (const ws of [WS_A, WS_B]) {
    await pool.query(
      "INSERT INTO workspaces(id,name,owner_user_id) VALUES($1,'sessionsprov',$2) "
      + 'ON CONFLICT (id) DO NOTHING', [ws, AGARE]);
  }
  // Skyddsnat: ett avbrutet V1 skulle annars lamna en trigger som faller varje senare auditinsert.
  await pool.query('DROP TRIGGER IF EXISTS prov_poison_rollback_trg ON audit_log');
  await pool.query('DROP FUNCTION IF EXISTS prov_poison_rollback_fn()');
  await pool.query("INSERT INTO bridge_accounts(account_key) VALUES($1) ON CONFLICT DO NOTHING",
    [KONTO]);
  await pool.query('DELETE FROM bridge_runs WHERE account_key=$1', [KONTO]);
  for (const ws of [WS_A, WS_B]) {
    // ORDNINGSOBEROENDE. tiktok_connections rensades inte tidigare, så ett prov som kopplade WS_B
    // lämnade kopplingen kvar åt nästa. Uppmätt i CI 2026-08-23: O2 föll på "2 !== 1" — inte för
    // att generationskontrollen var fel, utan för att K1 och B1-B3 hade kopplat WS_B till samma
    // konto tidigare i filen. Varje prov ska deklarera sina EGNA anslutningar.
    await pool.query('DELETE FROM goal_runtime WHERE overlay_id IN (SELECT id FROM overlays WHERE workspace_id=$1)', [ws]);
    await pool.query('DELETE FROM overlays WHERE workspace_id=$1', [ws]);
    await pool.query('DELETE FROM stream_room_reopen WHERE workspace_id=$1', [ws]);
    await pool.query('DELETE FROM tiktok_connections WHERE workspace_id=$1', [ws]);
    await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [ws]);
    await pool.query('DELETE FROM stream_event_outbox WHERE workspace_id=$1', [ws]);
    await pool.query("DELETE FROM audit_log WHERE action='stream_outbox_poison'");
    await pool.query('DELETE FROM stream_session_reset WHERE session_id IN '
      + '(SELECT id FROM stream_sessions WHERE workspace_id=$1)', [ws]);
    await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [ws]);
  }
  return { sessioner, pool };
}

const anslut = (pool, ws) => pool.query(
  'INSERT INTO tiktok_connections(workspace_id,tiktok_username,active) VALUES($1,$2,true) '
  + 'ON CONFLICT (workspace_id) DO UPDATE SET tiktok_username=EXCLUDED.tiktok_username,active=true',
  [ws, KONTO]);

const pekaren = (pool, ws) => pool.query(
  'SELECT session_id FROM stream_session_pointer WHERE workspace_id=$1', [ws])
  .then(r => r.rows[0] ? r.rows[0].session_id : null);

const rader = (pool, ws) => pool.query(
  'SELECT id, room_id, ended_at, end_reason FROM stream_sessions WHERE workspace_id=$1 '
  + 'ORDER BY started_at', [ws]).then(r => r.rows);

// ================================================================================================
// A · IDENTITET OCH PEKARE
// ================================================================================================

prov('A1 · första roomId skapar en session och sätter pekaren', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const min = ut.workspaces.find(w => w.workspaceId === WS_A);
  assert.equal(min.created, true);
  assert.equal(await pekaren(pool, WS_A), min.session.id,
    'pekaren ska peka på den nya sessionen — annars vet ingen vad som är live nu');
});

prov('A2 · samma AKTIVA roomId är alltid återanslutning, aldrig ny session', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const forsta = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const id = forsta.workspaces[0].session.id;
  // Bryggan postar vid VARJE lyckad anslutning. Fem återanslutningar är fem besked.
  for (let i = 0; i < 5; i++) {
    const igen = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
    assert.equal(igen.workspaces[0].created, false, 'återanslutning ' + (i + 1) + ' skapade ny session');
    assert.equal(igen.workspaces[0].session.id, id, 'sessions-id bytte vid återanslutning');
  }
  assert.equal((await rader(pool, WS_A)).length, 1);
});

prov('A3 · nytt roomId skapar nästa session, stänger den förra och flyttar pekaren', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  const tva = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_2 })).workspaces[0];
  assert.equal(tva.created, true);
  const alla = await rader(pool, WS_A);
  const gammal = alla.find(r => r.id === ett.session.id);
  assert.ok(gammal.ended_at, 'två öppna sändningar samtidigt');
  assert.equal(gammal.end_reason, 'ersatt');
  assert.equal(await pekaren(pool, WS_A), tva.session.id);
});

prov('A4 · samtidiga besked om SAMMA rum ger exakt en session', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const svar = await Promise.all([1, 2, 3].map(() =>
    sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })));
  const ider = [...new Set(svar.map(s => s.workspaces[0].session.id))];
  assert.equal(ider.length, 1, 'samtidiga besked gav ' + ider.length + ' sessioner');
  assert.equal(svar.filter(s => s.workspaces[0].created).length, 1,
    'mer än ett svar påstod sig ha skapat sessionen');
});

prov('A5 · samtidiga besked om OLIKA rum ger en enda öppen session och en enda pekare', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await Promise.all([
    sessioner.startaLive({ konto: KONTO, roomId: RUM_1 }),
    sessioner.startaLive({ konto: KONTO, roomId: RUM_2 }),
  ]);
  const oppna = (await rader(pool, WS_A)).filter(r => !r.ended_at);
  assert.equal(oppna.length, 1, 'sessionsbytet var inte låst: ' + oppna.length + ' öppna');
  assert.equal(await pekaren(pool, WS_A), oppna[0].id);
});

// ================================================================================================
// B · FAN-OUT ÖVER DELAD KONTOANSLUTNING
// tiktok_connections har ingen unik nyckel på tiktok_username. Samma konto i två workspaces är
// alltså tillåtet idag, och ETT statusbesked måste nå båda.
// ================================================================================================

prov('B1 · ett statusbesked ger en session per prenumererande workspace, samma room_id', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A); await anslut(pool, WS_B);
  const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  assert.equal(ut.workspaces.length, 2, 'fan-out nådde ' + ut.workspaces.length + ' workspaces');
  for (const ws of [WS_A, WS_B]) {
    const r = await rader(pool, ws);
    assert.equal(r.length, 1, 'workspace ' + ws + ' fick ingen session');
    assert.equal(r[0].room_id, RUM_1);
    assert.equal(await pekaren(pool, ws), r[0].id);
  }
  // Sessionerna är SEPARATA rader: nollställning och mål är per workspace.
  assert.notEqual(ut.workspaces[0].session.id, ut.workspaces[1].session.id);
});

prov('B2 · fan-out begär ingen ytterligare TikTok-anslutning', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A); await anslut(pool, WS_B);
  const begarda = [];
  const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1,
    onAnslutningBegard: n => begarda.push(n) });
  // Positiv halva FÖRST: utan den går provet grönt mot en modul som inte gör någonting alls —
  // noll fan-out begär förvisso noll anslutningar. Samma fälla som C3 föll i.
  assert.equal(ut.workspaces.length, 2,
    'fan-out nådde ' + ut.workspaces.length + ' workspaces — då säger anslutningsräkningen inget');
  assert.deepEqual(begarda, [],
    'fan-out öppnade ' + begarda.length + ' extra TikTok-anslutningar — kapacitetsporten '
    + '(capacity-gate.js) räknar anslutningar, och en per workspace skalar inte');
});

prov('B3 · en inaktiv anslutning får inget statusbesked', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A); await anslut(pool, WS_B);
  await pool.query('UPDATE tiktok_connections SET active=false WHERE workspace_id=$1', [WS_B]);
  const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  assert.deepEqual(ut.workspaces.map(w => w.workspaceId), [WS_A]);
  assert.equal(await pekaren(pool, WS_B), null);
});

// ================================================================================================
// C · BEHÖRIGHET — MASKIN, INTE MEDLEMSKAP
// Bryggan har ingen användare och kan inte vara owner/admin. Den bär maskintoken.
// ================================================================================================

prov('C1 · statusbeskedet kräver maskintoken — en inloggad sessionscookie räcker inte', async () => {
  const { sessioner } = await rigg();
  await assert.rejects(
    () => sessioner.startaLiveViaHttp({ konto: KONTO, roomId: RUM_1, maskintoken: null,
      anvandarSession: { user_id: 'nagon' } }),
    e => e.status === 401,
    'en användarsession accepterades som maskinautentisering');
});

prov('C2 · fel maskintoken ger 401 utan att avslöja längd eller innehåll', async () => {
  const { sessioner } = await rigg();
  await assert.rejects(
    () => sessioner.startaLiveViaHttp({ konto: KONTO, roomId: RUM_1, maskintoken: 'fel'.repeat(20) }),
    e => e.status === 401 && !/token=|längd|[0-9]{2,}/.test(String(e.message)));
});

prov('C3 · ett okänt konto skapar inget — men ett känt gör det', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  // BÅDA halvorna i samma prov, med flit. Uppmätt i CI 2026-08-22: med bara den negativa halvan
  // gick provet GRÖNT mot en modulstomme som alltid returnerar en tom lista — det kunde inte
  // skilja "avvisade det okända kontot" från "gör ingenting alls". Ett prov som passerar när
  // funktionen saknas är värre än inget prov: det ser ut som täckning.
  const okant = await sessioner.startaLive({ konto: 'ett-konto-ingen-prenumererar-pa', roomId: RUM_1 });
  assert.deepEqual(okant.workspaces, [], 'ett okänt konto skapade sessioner');
  const kant = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  assert.equal(kant.workspaces.length, 1,
    'det KÄNDA kontot gav ' + kant.workspaces.length + ' workspaces — provet kan inte skilja '
    + 'en korrekt avvisning från en modul som inte gör någonting');
});

// ================================================================================================
// D · AVSLUT
// ================================================================================================

prov('D1 · live:end med sessionId avslutar sessionen och nollar pekaren', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  const ut = await sessioner.avslutaLive({ sessionId: ett.session.id, reason: 'bridge' });
  assert.equal(ut.ended, true);
  assert.ok((await rader(pool, WS_A))[0].ended_at);
  assert.equal(await pekaren(pool, WS_A), null, 'pekaren pekar på en avslutad sändning');
});

prov('D2 · ett FÖRSENAT slutbesked för föregående session rör inte den aktuella', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  const tva = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_2 })).workspaces[0];
  // Bryggans "slut" för RUM_1 kommer EFTER att RUM_2 redan börjat.
  const ut = await sessioner.avslutaLive({ sessionId: ett.session.id, reason: 'bridge' });
  assert.equal(ut.ended, false, 'ett redan stängt sessions-id rapporterades som nyss avslutat');
  const aktuell = (await rader(pool, WS_A)).find(r => r.id === tva.session.id);
  assert.equal(aktuell.ended_at, null, 'det försenade slutbeskedet dödade den PÅGÅENDE sändningen');
  assert.equal(await pekaren(pool, WS_A), tva.session.id, 'pekaren rycktes bort från den aktuella');
});

prov('D3 · live:end är idempotent', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  assert.equal((await sessioner.avslutaLive({ sessionId: ett.session.id, reason: 'bridge' })).ended, true);
  assert.equal((await sessioner.avslutaLive({ sessionId: ett.session.id, reason: 'bridge' })).ended, false);
  assert.equal((await sessioner.avslutaLive({ sessionId: ett.session.id, reason: 'timeout' })).ended, false);
});

prov('D4 · live:end utan sessionId eller roomId avvisas — workspace ensamt räcker inte', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  await assert.rejects(() => sessioner.avslutaLive({ workspaceId: WS_A, reason: 'bridge' }),
    e => e.status === 400,
    'ett slutbesked utan identitet fick avsluta "det som råkar vara igång"');
});

// ================================================================================================
// E · FÖRSENADE STARTBESKED
// Karensgränsen är ETT ÖPPET BESLUT (se rapporten). Provet nedan låser den INTE till ett värde —
// det läser policyn ur modulen, så gränsen kan bytas utan att provet blir en spegel.
// ================================================================================================

prov('E1 · ett försenat startbesked för ett AVSLUTAT rum återaktiverar det aldrig', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  const tva = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_2 })).workspaces[0];
  const sent = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  assert.equal(sent.workspaces[0].stale, true, 'det försenade beskedet märktes inte som föråldrat');
  assert.ok((await rader(pool, WS_A)).find(r => r.id === ett.session.id).ended_at,
    'den avslutade sessionen öppnades igen');
  assert.equal(await pekaren(pool, WS_A), tva.session.id);
});

// ================================================================================================
// F · NOLLSTÄLLNING — ATOMÄR OCH IDEMPOTENT
// ================================================================================================

prov('F1 · kvitto och nollställning sker i SAMMA transaktion', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  // Nollställningen tvingas misslyckas EFTER att kvittot skrivits. Rullar transaktionen tillbaka
  // ska VARKEN kvitto ELLER nollställning finnas kvar.
  // EGET scope. Sessionsskapandet tar redan kvitton för gift_campaign och goal_runtime, så ett
  // prov som räknar ALLA kvitton för sessionen mäter dem i stället för sitt eget fall.
  await assert.rejects(() => sessioner.nollstall({
    sessionId: ett.session.id, scope: 'provscope-f1',
    utfor: async () => { throw new Error('avsiktligt fel mitt i nollställningen') },
  }));
  const kvitton = await pool.query(
    'SELECT count(*)::int AS n FROM stream_session_reset WHERE session_id=$1 AND scope=$2',
    [ett.session.id, 'provscope-f1']);
  assert.equal(kvitton.rows[0].n, 0,
    'ett kvitto överlevde en misslyckad nollställning — nästa försök hoppar över den för alltid');
});

prov('F2 · nollställning är idempotent per session_id och scope', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  let korningar = 0;
  const utfor = async () => { korningar++ };
  assert.equal(await sessioner.nollstall({ sessionId: ett.session.id, scope: 'goals', utfor }), true);
  assert.equal(await sessioner.nollstall({ sessionId: ett.session.id, scope: 'goals', utfor }), false);
  assert.equal(korningar, 1, 'nollställningen kördes ' + korningar + ' gånger mitt i en sändning');
  // Ett annat område för SAMMA session är en egen nollställning, inte en dubblett.
  assert.equal(await sessioner.nollstall({ sessionId: ett.session.id, scope: 'leaderboard', utfor }), true);
});

prov('F3 · goal_runtime behåller baseline och target, nollar progress och stegar epoch', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const overlay = (await pool.query(
    "INSERT INTO overlays(workspace_id,name,state) VALUES($1,'prov','{}'::jsonb) RETURNING id",
    [WS_A])).rows[0].id;
  await pool.query(
    'INSERT INTO goal_runtime(overlay_id,widget_id,metric,baseline,progress,target,epoch,revision) '
    + "VALUES($1,'w1','likes',250,900,5000,3,77)", [overlay]);
  // Sessionsskapandet nollställer redan en gång (epoch 3 -> 4). Den explicita anropet är den
  // ANDRA (4 -> 5). Provet mäter att baseline/target överlever BÅDA.
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  const efterSession = await pool.query(
    'SELECT epoch, progress FROM goal_runtime WHERE overlay_id=$1', [overlay]);
  assert.equal(Number(efterSession.rows[0].epoch), 4,
    'sessionsskapandet nollställde inte målen');
  assert.equal(Number(efterSession.rows[0].progress), 0);
  await sessioner.nollstallMal({ sessionId: ett.session.id, workspaceId: WS_A });
  const r = (await pool.query(
    'SELECT baseline,progress,target,epoch,revision FROM goal_runtime WHERE overlay_id=$1', [overlay])).rows[0];
  // Den visade siffran är baseline + progress. Nollställs baseline försvinner startvärdet
  // streamern skrev in — det är en annan sak än att nolla sändningens framsteg.
  assert.equal(Number(r.baseline), 250, 'baseline nollställdes — startvärdet gick förlorat');
  assert.equal(Number(r.target), 5000, 'målet skrevs över');
  assert.equal(Number(r.progress), 0);
  assert.equal(Number(r.epoch), 5, 'epoch stegades inte — klienter kan inte se att en ny omgång börjat');
  assert.ok(Number(r.revision) > 77, 'revision stegades inte — SSE-ordningen bryts');
});

// ================================================================================================
// G · OUTBOX
// ================================================================================================

prov('G1 · outbox-raden skrivs i samma transaktion och är opublicerad', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  const ut = await pool.query(
    'SELECT event_id,topic,payload,published_at FROM stream_event_outbox WHERE workspace_id=$1', [WS_A]);
  assert.equal(ut.rowCount, 1);
  assert.equal(ut.rows[0].topic, 'live:start');
  assert.equal(ut.rows[0].payload.sessionId, ett.session.id);
  assert.equal(ut.rows[0].published_at, null,
    'raden markerades publicerad inne i transaktionen — då kan en rollback ljuga bort en händelse');
});

prov('G2 · krasch FÖRE publicering: händelsen skickas vid omstart, sedan aldrig igen', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const skickade = [];
  assert.equal(await sessioner.publiceraUtkorg({ sand: async e => { skickade.push(e) } }), 1);
  assert.equal(await sessioner.publiceraUtkorg({ sand: async () => {} }), 0);
  assert.equal(skickade.length, 1);
});

prov('G3 · krasch EFTER leverans men före kvittens ger en ofarlig dubblett', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  // Klockan injiceras, men den maste ligga EFTER att raden skapades: next_attempt_at far
  // DEFAULT now(), och ett fast datum i det forflutna gor att claim-predikatet
  // `next_attempt_at <= $nu` aldrig blir sant. Uppmatt i CI 2026-08-23: sex prov foll pa det.
  const T0 = new Date(Date.now() + 60000);
  const skickade = [];
  // Provet krävde tidigare att publiceraUtkorg KASTAR vid leveransfel. Det är fel beteende för en
  // utkorgsworker: en enskild misslyckad leverans ska registreras och omgången fortsätta, annars
  // stoppar en trasig mottagare hela kön. Scenariot "levererad men inte kvitterad" mäts i stället
  // genom att leasen tas över mitt i — samma sak som att processen dör före published_at.
  await sessioner.publiceraUtkorg({ workerId: 'gammal', nu: () => T0, sand: async r => {
    skickade.push(r.event_id);
    await pool.query("UPDATE stream_event_outbox SET lease_owner='spoke', lease_until=$1",
      [new Date(T0.getTime() + 30000)]);
  } });
  const senare = new Date(T0.getTime() + 31000);
  await sessioner.publiceraUtkorg({ workerId: 'ny', nu: () => senare,
    sand: async r => skickade.push(r.event_id) });
  assert.equal(skickade.length, 2, 'dubbletten uteblev');
  assert.equal(skickade[0], skickade[1], 'event_id ändrades mellan försöken');
});

prov('G4 · två serverinstanser publicerar aldrig samma rad', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A); await anslut(pool, WS_B);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });   // två rader, en per workspace
  const a = [], b = [];
  // FOR UPDATE SKIP LOCKED, samma mönster som goal-runtime.js:224 redan använder.
  await Promise.all([
    sessioner.publiceraUtkorg({ sand: async e => { a.push(e.event_id); await new Promise(r => setTimeout(r, 40)) } }),
    sessioner.publiceraUtkorg({ sand: async e => { b.push(e.event_id); await new Promise(r => setTimeout(r, 40)) } }),
  ]);
  const alla = [...a, ...b];
  // Positiv halva FÖRST, av samma skäl som B2 och C3: noll publicerade rader innehåller inga
  // dubbletter. Båda raderna — en per workspace — ska ut, och exakt en gång var.
  assert.equal(alla.length, 2,
    'instanserna publicerade ' + alla.length + ' rader av 2 — provet kan inte se dubbletter '
    + 'i en tom lista');
  assert.equal(new Set(alla).size, alla.length, 'samma rad publicerades av båda instanserna');
});

prov('G5 · en händelse som alltid misslyckas backar av och parkeras', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  for (let i = 0; i < 8; i++) {
    await sessioner.publiceraUtkorg({ sand: async () => { throw new Error('mottagaren är nere') },
      nu: () => new Date(Date.now() + i * 3600e3) });
  }
  const r = (await pool.query(
    'SELECT attempts,next_attempt_at,last_error,published_at FROM stream_event_outbox '
    + 'WHERE workspace_id=$1', [WS_A])).rows[0];
  assert.equal(r.published_at, null);
  assert.ok(r.attempts >= 5, 'försöken räknades inte — då syns aldrig en giftig händelse');
  assert.ok(r.last_error, 'felet sparades inte, så ingen kan felsöka den');
  assert.ok(new Date(r.next_attempt_at) > new Date(Date.now() + 60e3),
    'ingen backoff — en trasig händelse skulle snurra i en tight loop');
  assert.equal((await sessioner.giftigaHandelser()).length, 1,
    'den parkerade händelsen syns inte någonstans');
});

// ================================================================================================
// H · EVENTKONTRAKT MOT BEFINTLIG BUSS
// ================================================================================================

prov('H1 · sessionId är SERVERÄGT — ett externt event kan inte sätta det', async () => {
  const { cleanEvent } = require('../event-bus.js');
  // Provet krävde tidigare MOTSATSEN: att cleanEvent skulle bevara ett inskickat sessionId. Det
  // var fel kontrakt. Fältet är serverägt; kan en ingest-klient sätta det kan vem som helst påstå
  // vilken sändning ett event tillhör, och hela modellen blir en gissning.
  const ut = cleanEvent({ id: 'e1', type: 'gift', userId: 'u1', username: 'a',
    sessionId: '33333333-3333-4333-8333-333333333333' });
  assert.equal(ut.sessionId, undefined, 'ett externt event fick sätta sessionId');
  // Kontrollmätning: eventet ska i övrigt komma igenom oförändrat.
  assert.equal(ut.type, 'gift');
  assert.equal(ut.username, 'a');
});

prov('H2 · sändningsbeskedet använder bussens egen ram, inte ett parallellt kontrakt', async () => {
  const { sseChunk } = require('../goal-sse.js');
  const { cleanInternalEvent } = require('../event-bus.js');
  // Bussens riktiga form är {streamId, event} — provet anropade tidigare sseChunk med ett platt
  // objekt och krävde fält som inte ska nå klienten.
  const ram = sseChunk({ streamId: '1-0', event: cleanInternalEvent({
    type: 'livesession', event: 'live:start',
    eventId: 'live:start:33333333-3333-4333-8333-333333333333',
    sessionId: '33333333-3333-4333-8333-333333333333',
    startedAt: '2026-08-22T13:33:10.000Z' }) }, null);
  assert.match(ram, /^id: 1-0\n/, 'ingen id:-rad — då kan Last-Event-ID inte spela upp beskedet');
  assert.match(ram, /\nevent: live\n/,
    'beskedet fick en egen event-typ i stället för bussens `live` — en ny typ kräver en ny '
    + 'lyssnare i varje klient, och de som inte uppdateras missar sändningsbytet tyst');
  const data = JSON.parse(ram.split('\ndata: ')[1]);
  assert.equal(data.type, 'livesession');
  assert.equal(data.sessionId, '33333333-3333-4333-8333-333333333333');
});

prov('I1 · en ny bryggkörning blir aktuell generation för kontot', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const a = await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const b = await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_2 });
  assert.ok(b.generation > a.generation, 'generationen stegade inte vid ny bryggkörning');
  const rad = (await pool.query(
    'SELECT bridge_run_id FROM bridge_runs WHERE account_key=$1 AND current', [KONTO])).rows;
  assert.equal(rad.length, 1, 'fler än en aktuell körning för samma konto');
  assert.equal(rad[0].bridge_run_id, KOR_2);
});

prov('I2 · status från en GAMMAL bridgeRunId avvisas efter generationsbytet', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_2 });
  const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 1 });
  assert.equal(ut.stale, true, 'ett besked från den avlösta körningen släpptes igenom');
  assert.deepEqual(ut.workspaces, [], 'den gamla körningen skapade sessioner');
  assert.equal((await rader(pool, WS_A)).length, 0);
});

prov('I3 · ett försenat SLUTbesked från föregående körning avslutar ingenting', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 1 }))
    .workspaces[0];
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_2 });
  const ut = await sessioner.avslutaLive({ sessionId: ett.session.id, bridgeRunId: KOR_1, seq: 2,
    reason: 'bridge' });
  assert.equal(ut.ended, false, 'den avlösta körningen fick avsluta en session');
  assert.equal((await rader(pool, WS_A))[0].ended_at, null, 'sändningen dödades av ett gammalt besked');
});

prov('I4 · samma seq två gånger är idempotent', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const a = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 7 });
  const b = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 7 });
  assert.equal(a.workspaces[0].created, true);
  assert.equal(b.workspaces[0].created, false, 'samma seq skapade en andra session');
  assert.equal(b.workspaces[0].session.id, a.workspaces[0].session.id);
  assert.equal((await rader(pool, WS_A)).length, 1);
});

prov('I5 · ett LÄGRE seq än det högsta sedda är stale', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_2, bridgeRunId: KOR_1, seq: 12 });
  const sent = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 5 });
  assert.equal(sent.stale, true, 'ett äldre seq släpptes igenom och kunde byta sändning');
  const oppna = (await rader(pool, WS_A)).filter(r => !r.ended_at);
  assert.equal(oppna.length, 1);
  assert.equal(oppna[0].room_id, RUM_2, 'det äldre beskedet bytte tillbaka till fel rum');
});

prov('I6 · två SAMTIDIGA körningsregistreringar ger exakt en aktuell generation', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await Promise.all([
    sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 }),
    sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_2 }),
  ]);
  const aktuella = (await pool.query(
    'SELECT bridge_run_id FROM bridge_runs WHERE account_key=$1 AND current', [KONTO])).rows;
  assert.equal(aktuella.length, 1,
    'kapplöpning gav ' + aktuella.length + ' aktuella körningar — då avgör slumpen vems status som gäller');
});

// ================================================================================================
// J · ADMINISTRATIV ÅTERSTÄLLNING AV ETT STÄNGT RUM
// Fail-closed: ett stängt room_id öppnas ALDRIG automatiskt. Skulle TikTok en dag återanvända ett
// rum finns en manuell, auditerad väg — inte en tyst karenstid.
// ================================================================================================

prov('J1 · ett stängt rum förblir stängt utan administrativ åtgärd', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 1 }))
    .workspaces[0];
  await sessioner.avslutaLive({ sessionId: ett.session.id, bridgeRunId: KOR_1, seq: 2, reason: 'bridge' });
  const igen = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 3 });
  // PER WORKSPACE, inte på hela beskedet: statusbeskedet är giltigt för kontot, men historiken
  // ägs av varje workspace för sig. Ett blockerat workspace får inte tysta ett annat.
  assert.equal(igen.stale, false, 'hela beskedet avvisades i stället för det enskilda workspacet');
  assert.equal(igen.workspaces[0].stale, true, 'ett stängt rum öppnades automatiskt igen');
  assert.equal(igen.workspaces[0].skal, 'stangt-rum');
  assert.equal((await rader(pool, WS_A)).filter(r => r.room_id === RUM_1).length, 1);
});

prov('J2 · administrativ återställning tillåter rummet igen och skrivs i audit_log', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 1 }))
    .workspaces[0];
  await sessioner.avslutaLive({ sessionId: ett.session.id, bridgeRunId: KOR_1, seq: 2, reason: 'bridge' });
  await sessioner.tillatRumIgen({ workspaceId: WS_A, roomId: RUM_1, actorUserId: null, skal: 'prov' });
  const igen = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 4 });
  assert.equal(igen.workspaces[0].created, true, 'återställningen släppte inte igenom rummet');
  const audit = await pool.query(
    "SELECT action FROM audit_log WHERE workspace_id=$1 AND action='stream_room_reopened'", [WS_A]);
  assert.equal(audit.rowCount, 1, 'återställningen lämnade inget spårbart avtryck');
});

prov('J3 · återställningen gäller EN gång, inte som permanent undantag', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 1 }))
    .workspaces[0];
  await sessioner.avslutaLive({ sessionId: ett.session.id, bridgeRunId: KOR_1, seq: 2, reason: 'bridge' });
  await sessioner.tillatRumIgen({ workspaceId: WS_A, roomId: RUM_1, actorUserId: null, skal: 'prov' });
  const tva = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 4 }))
    .workspaces[0];
  await sessioner.avslutaLive({ sessionId: tva.session.id, bridgeRunId: KOR_1, seq: 5, reason: 'bridge' });
  const tredje = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 6 });
  assert.equal(tredje.stale, true, 'återställningen blev ett permanent undantag');
});

// ================================================================================================
// K · NORMALISERING AV KONTONAMN
// Husregeln finns redan i capacity-gate.js:24 —
//   regexp_replace(lower(btrim(tiktok_username)), '^@+', '')
// Den återanvänds. En andra normaliseringsregel hade delat kontot i två och halverat fan-outen.
// ================================================================================================

prov('K1 · @, versaler och blanksteg pekar på samma konto', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await pool.query(
    'INSERT INTO tiktok_connections(workspace_id,tiktok_username,active) VALUES($1,$2,true) '
    + 'ON CONFLICT (workspace_id) DO UPDATE SET tiktok_username=EXCLUDED.tiktok_username,active=true',
    [WS_B, '  @JoKeRo060 ']);
  await sessioner.registreraKorning({ konto: '@JOKERO060', bridgeRunId: KOR_1 });
  const ut = await sessioner.startaLive({ konto: ' jokero060 ', bridgeRunId: KOR_1, seq: 1, roomId: RUM_1 });
  assert.equal(ut.workspaces.length, 2,
    'normaliseringen delade kontot: fan-out nådde ' + ut.workspaces.length + ' av 2 workspaces');
});

prov('K2 · registrering och status måste normalisera LIKA', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: '@Jokero060', bridgeRunId: KOR_1 });
  const ut = await sessioner.startaLive({ konto: 'jokero060', bridgeRunId: KOR_1, seq: 1, roomId: RUM_1 });
  assert.notEqual(ut.stale, true,
    'körningen registrerades under en annan kontonyckel än statusbeskedet slog upp');
});

// ================================================================================================
// L · GIFT CAMPAIGN ÄR EN RÄKNARE, INTE BARA KONFIGURATION
// Uppmätt 2026-08-22: gift-event-images.js:236–237 räknar upp widget['giftCurrent'+i] vid VARJE
// inkommande gåva, och media.js:362 läser tillbaka det som `current`. Fältet bor i overlay-state.
// ================================================================================================

prov('L1 · giftCurrent* nollställs centralt, övriga campaign-fält bevaras', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const state = { widgets: [{ id: 'c1', type: 'templateGiftCampaign', campaignTheme: 'neon',
    campaignSubtitle: 'PUSH THE EVENT', giftTarget0: 50, giftCurrent0: 37, giftCurrent1: 9 }] };
  const overlay = (await pool.query(
    "INSERT INTO overlays(workspace_id,name,state) VALUES($1,'prov',$2::jsonb) RETURNING id",
    [WS_A, JSON.stringify(state)])).rows[0].id;
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 1 }))
    .workspaces[0];
  await sessioner.nollstallKampanjer({ sessionId: ett.session.id, workspaceId: WS_A });
  const w = (await pool.query('SELECT state FROM overlays WHERE id=$1', [overlay]))
    .rows[0].state.widgets[0];
  assert.equal(w.giftCurrent0, 0, 'förra sändningens gåvoantal följde med in i nästa');
  assert.equal(w.giftCurrent1, 0);
  assert.equal(w.giftTarget0, 50, 'målet nollställdes — det är konfiguration');
  assert.equal(w.campaignSubtitle, 'PUSH THE EVENT', 'rubriken nollställdes');
  assert.equal(w.campaignTheme, 'neon');
});

// ================================================================================================
// M · POISON SIGNALERAS
// ================================================================================================

prov('M1 · en parkerad händelse ger logg, metric OCH audit — den försvinner inte tyst', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 1 });
  const loggar = [], metrics = [];
  for (let i = 0; i < 8; i++) {
    await sessioner.publiceraUtkorg({
      sand: async () => { throw new Error('mottagaren är nere') },
      logg: m => loggar.push(m), metric: m => metrics.push(m),
      nu: () => new Date(Date.now() + i * 3600e3),
    });
  }
  assert.ok(loggar.some(m => /parkerad|poison/i.test(String(m))), 'ingen logg vid parkering');
  assert.ok(metrics.some(m => /outbox_poison/.test(String(m))), 'ingen metric vid parkering');
  const audit = await pool.query(
    "SELECT action FROM audit_log WHERE workspace_id=$1 AND action='stream_outbox_poison'", [WS_A]);
  assert.equal(audit.rowCount, 1, 'parkeringen syns inte i audit_log');
});

// ================================================================================================
// N · INTEGRITET I SCHEMAT SJÄLVT
// De här proven kräver ingen sessionslogik — de mäter vad databasen tillåter. De är därför gröna
// redan innan modulen finns, och det är meningen: de vaktar constraints, inte funktioner.
// ================================================================================================

prov('N1 · pekaren kan INTE peka på en session i ett annat workspace', async () => {
  const { pool } = await rigg();
  // En session i workspace B.
  const sessionIB = (await pool.query(
    "INSERT INTO stream_sessions(workspace_id,room_id,account_key) VALUES($1,$2,$3) RETURNING id",
    [WS_B, RUM_1, KONTO])).rows[0].id;
  // Pekaren för workspace A försöker peka på den. En enkel FK på session_id hade sagt ja: sessionen
  // FINNS. Följden vore att nollställningen tittar på fel sändning — ena kontots mål nollställs när
  // det andra går live.
  await assert.rejects(
    () => pool.query(
      'INSERT INTO stream_session_pointer(workspace_id,session_id) VALUES($1,$2)',
      [WS_A, sessionIB]),
    e => e.code === '23503',
    'den korsade pekaren accepterades — den sammansatta främmande nyckeln saknas eller pekar fel');
});

prov('N2 · pekaren FÅR peka på en session i sitt EGET workspace', async () => {
  const { pool } = await rigg();
  const egen = (await pool.query(
    "INSERT INTO stream_sessions(workspace_id,room_id,account_key) VALUES($1,$2,$3) RETURNING id",
    [WS_A, RUM_1, KONTO])).rows[0].id;
  // Kontrollmätning: utan den bevisar N1 bara att INSERT misslyckas, inte att den misslyckas av
  // rätt skäl. En FK som avvisar allt hade också fått N1 grönt.
  await pool.query('INSERT INTO stream_session_pointer(workspace_id,session_id) VALUES($1,$2)',
    [WS_A, egen]);
  const r = await pool.query(
    'SELECT session_id FROM stream_session_pointer WHERE workspace_id=$1', [WS_A]);
  assert.equal(r.rows[0].session_id, egen);
});

prov('N3 · en tom pekare är tillåten', async () => {
  const { pool } = await rigg();
  // MATCH SIMPLE: FK:n är uppfylld så fort någon kolumn är NULL. Utan det hade en workspace utan
  // pågående sändning inte kunnat ha någon rad alls.
  await pool.query('INSERT INTO stream_session_pointer(workspace_id,session_id) VALUES($1,NULL)',
    [WS_A]);
  const r = await pool.query(
    'SELECT session_id FROM stream_session_pointer WHERE workspace_id=$1', [WS_A]);
  assert.equal(r.rows[0].session_id, null);
});

prov('N4 · en raderad session nollar pekaren utan att radera raden', async () => {
  const { pool } = await rigg();
  const egen = (await pool.query(
    "INSERT INTO stream_sessions(workspace_id,room_id,account_key) VALUES($1,$2,$3) RETURNING id",
    [WS_A, RUM_1, KONTO])).rows[0].id;
  await pool.query('INSERT INTO stream_session_pointer(workspace_id,session_id) VALUES($1,$2)',
    [WS_A, egen]);
  await pool.query('DELETE FROM stream_sessions WHERE id=$1', [egen]);
  const r = await pool.query(
    'SELECT session_id FROM stream_session_pointer WHERE workspace_id=$1', [WS_A]);
  // ON DELETE SET NULL (session_id) — kolumnlistan. Utan den hade Postgres försökt nolla även
  // workspace_id, som är primärnyckel och NOT NULL, och raderingen hade fallit.
  assert.equal(r.rowCount, 1, 'pekarraden försvann i stället för att nollas');
  assert.equal(r.rows[0].session_id, null);
});

prov('N5 · historiska sessioner får dela room_id — det partiella indexet är INTE globalt', async () => {
  const { pool } = await rigg();
  const ett = (await pool.query(
    "INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
    + "VALUES($1,$2,$3,now(),'bridge') RETURNING id", [WS_A, RUM_1, KONTO])).rows[0].id;
  const tva = (await pool.query(
    "INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
    + "VALUES($1,$2,$3,now(),'bridge') RETURNING id", [WS_A, RUM_1, KONTO])).rows[0].id;
  assert.notEqual(ett, tva, 'två avslutade sessioner på samma rum tilläts inte — indexet är globalt');
  // Men bara EN får vara öppen.
  await pool.query(
    "INSERT INTO stream_sessions(workspace_id,room_id,account_key) VALUES($1,$2,$3)",
    [WS_A, RUM_1, KONTO]);
  await assert.rejects(
    () => pool.query("INSERT INTO stream_sessions(workspace_id,room_id,account_key) VALUES($1,$2,$3)",
      [WS_A, RUM_1, KONTO]),
    e => e.code === '23505',
    'två SAMTIDIGT ÖPPNA sessioner på samma rum tilläts');
});

prov('N6 · bridge_runs kräver en föräldrarad i bridge_accounts', async () => {
  const { pool } = await rigg();
  // Utan FK:n vore bridge_accounts bara en tabell som råkar finnas — och låset på en rad som inte
  // måste existera är inget lås alls. FK:n gör föräldraraden till databasens permanenta
  // serialiseringspunkt: en körning kan inte registreras förbi den.
  await assert.rejects(
    () => pool.query(
      'INSERT INTO bridge_runs(account_key,bridge_run_id,generation,current) '
      + "VALUES('ett-konto-utan-foralderrad','k1',1,true)"),
    e => e.code === '23503',
    'en bryggkörning kunde skapas utan föräldrarad — serialiseringspunkten går att kringgå');
  // Kontrollmätning: med föräldraraden på plats MÅSTE insättningen gå igenom, annars bevisar
  // provet bara att tabellen avvisar allt.
  await pool.query("INSERT INTO bridge_accounts(account_key) VALUES('ett-konto-utan-foralderrad') "
    + 'ON CONFLICT DO NOTHING');
  await pool.query('INSERT INTO bridge_runs(account_key,bridge_run_id,generation,current) '
    + "VALUES('ett-konto-utan-foralderrad','k1',1,true)");
  const n = await pool.query('SELECT count(*)::int AS n FROM bridge_runs WHERE account_key=$1',
    ['ett-konto-utan-foralderrad']);
  assert.equal(n.rows[0].n, 1);
  await pool.query('DELETE FROM bridge_accounts WHERE account_key=$1', ['ett-konto-utan-foralderrad']);
});

// ================================================================================================
// O · GENERATIONEN UNDER SAMTIDIGHET
// UNIQUE(account_key, generation) hindrar dubbletter men skapar inte ordning: utan serialisering
// läser två samtidiga registreringar samma MAX och den ena kraschar på unikhetsfelet. Det är en
// LEGITIM registrering som förloras — bryggan har inte gjort något fel.
// ================================================================================================

prov('O1 · samtidiga registreringar ger stigande generationer och EN aktuell', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  // KONTROLLERAD BARRIÄR, inte tur. Uppmätt 2026-08-23: med kontolåset bortmuterat föll O2 första
  // gången och O1 andra gången — vem som hinner först varierar, och ett probabilistiskt
  // mutationsbevis är inget bevis.
  //
  // Grinden: en TREDJE anslutning skriver kontoraden i en ÖPPEN transaktion. Båda registreringarna
  // börjar med `INSERT INTO bridge_accounts ... ON CONFLICT DO NOTHING` och blockerar därför båda
  // på det unika indexet. När grinden committar släpps de i samma ögonblick — och först DÅ når de
  // generationsläsningen.
  //   MED låset:   den ena tar radlåset, den andra väntar → serialiserat, N och N+1.
  //   UTAN låset:  båda läser MAX samtidigt → båda skriver N+1 → unikhetsfel.
  // Sex omgångar ovanpå barriären, så ett enstaka gynnsamt utfall inte kan bära beviset.
  const RUNDOR = 6;
  let hogsta = 0;
  for (let i = 0; i < RUNDOR; i++) {
    // Kontoraden bort, så grinden är den som skapar den. CASCADE tar bridge_runs med sig.
    await pool.query('DELETE FROM bridge_accounts WHERE account_key=$1', [KONTO]);

    const grind = await pool.connect();
    await grind.query('BEGIN');
    await grind.query('INSERT INTO bridge_accounts(account_key) VALUES($1)', [KONTO]);

    const lopp = Promise.all([
      sessioner.registreraKorning({ konto: KONTO, bridgeRunId: 'race-' + i + '-a' }),
      sessioner.registreraKorning({ konto: KONTO, bridgeRunId: 'race-' + i + '-b' }),
    ]);
    // Båda hinner fram till grinden och blockerar där.
    await new Promise(r => setTimeout(r, 200));
    await grind.query('COMMIT');
    grind.release();

    const svar = await lopp;
    // 1. BÅDA ska lyckas. Ett unikhetsfel som når anroparen är ett tappat besked, inte ett skydd.
    assert.equal(svar.filter(x => x && x.generation).length, 2,
      'omgång ' + i + ': en legitim registrering kraschade i stället för att serialiseras');
    const gen = svar.map(x => Number(x.generation)).sort((x, y) => x - y);
    // 2. Två DISTINKTA generationer. 3. Strikt stigande utan hål.
    assert.equal(new Set(gen).size, 2, 'omgång ' + i + ': samma generation två gånger');
    assert.equal(gen[1], gen[0] + 1, 'omgång ' + i + ': generationerna hoppar: ' + gen.join(', '));
    assert.equal(gen[0], 1, 'omgång ' + i + ': räkningen börjar inte om efter att kontoraden nollats');
    hogsta = gen[1];
    // 4. Exakt EN aktuell. 5. Och det är den nyare.
    const aktuella = await pool.query(
      'SELECT bridge_run_id, generation FROM bridge_runs WHERE account_key=$1 AND current', [KONTO]);
    assert.equal(aktuella.rowCount, 1,
      'omgång ' + i + ': ' + aktuella.rowCount + ' aktuella körningar — då avgör slumpen vems status som gäller');
    assert.equal(Number(aktuella.rows[0].generation), gen[1],
      'omgång ' + i + ': den äldre körningen blev aktuell');
  }
  assert.equal(hogsta, 2, 'barriären körde inte som avsett');
});

prov('O2 · status från den äldre generationen avvisas efter kapplöpningen', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const svar = await Promise.all([
    sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 }),
    sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_2 }),
  ]);
  const aldre = svar.reduce((a, b) => (Number(a.generation) < Number(b.generation) ? a : b));
  const nyare = svar.reduce((a, b) => (Number(a.generation) > Number(b.generation) ? a : b));
  const gammalt = await sessioner.startaLive({
    konto: KONTO, roomId: RUM_1, bridgeRunId: aldre.bridgeRunId, seq: 1 });
  assert.equal(gammalt.stale, true, 'den äldre generationen fick tala');
  assert.deepEqual(gammalt.workspaces, [], 'den äldre generationen skapade sessioner');
  // Kontrollmätning: den NYARE måste släppas igenom, annars bevisar provet bara att allt avvisas.
  const nytt = await sessioner.startaLive({
    konto: KONTO, roomId: RUM_1, bridgeRunId: nyare.bridgeRunId, seq: 1 });
  assert.notEqual(nytt.stale, true, 'den aktuella generationen avvisades också');
  assert.equal(nytt.workspaces.length, 1);
});

prov('O3 · en AVLÖST körning kan inte återregistrera sig till aktuell', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const a = await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const b = await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_2 });

  // A säger till igen — en brygga som tappade nätet, hängde sig eller startade om utan att mynta
  // ett nytt körnings-id. Släpps den igenom rycker en död process tillbaka sändningen från den
  // som faktiskt kör.
  await assert.rejects(
    () => sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 }),
    e => e.status === 409,
    'den avlösta körningen fick registrera sig igen');

  // INGENTING fick ändras av försöket.
  const rader = await pool.query(
    'SELECT bridge_run_id, generation, current FROM bridge_runs WHERE account_key=$1 '
    + 'ORDER BY generation', [KONTO]);
  assert.equal(rader.rowCount, 2, 'försöket skapade eller tog bort rader');
  assert.deepEqual(rader.rows.map(r => Number(r.generation)),
    [Number(a.generation), Number(b.generation)], 'generationerna ändrades');
  const aktuella = rader.rows.filter(r => r.current);
  assert.equal(aktuella.length, 1, aktuella.length + ' aktuella körningar efter försöket');
  assert.equal(aktuella[0].bridge_run_id, KOR_2, 'den avlösta körningen blev aktuell igen');
});

prov('O4 · den AKTUELLA körningen får registrera om sig idempotent', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const b = await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_2 });

  // Samma aktuella brygga säger till igen — en återanslutning, inte en ny körning. Den ska INTE
  // få en ny generation: då hade varje nätverksglapp stegat räknaren och gjort "vilken är nyare"
  // till en fråga om hur ostabilt nätet är.
  const igen = await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_2 });
  assert.equal(Number(igen.generation), Number(b.generation),
    'omregistreringen gav en ny generation: ' + igen.generation + ' mot ' + b.generation);
  assert.equal(igen.redanRegistrerad, true, 'svaret markerade inte att körningen redan fanns');

  const rader = await pool.query(
    'SELECT bridge_run_id, current FROM bridge_runs WHERE account_key=$1', [KONTO]);
  assert.equal(rader.rowCount, 2, 'omregistreringen skapade en ny rad');
  const aktuella = rader.rows.filter(r => r.current);
  assert.equal(aktuella.length, 1, aktuella.length + ' aktuella körningar');
  assert.equal(aktuella[0].bridge_run_id, KOR_2);

  // Kontrollmätning: den aktuella körningen ska fortfarande få tala efter omregistreringen.
  const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_2, seq: 1 });
  assert.notEqual(ut.stale, true, 'omregistreringen gjorde den aktuella körningen stale');
});

// ================================================================================================
// P · SEKVENSVAKTEN UNDER SAMTIDIGHET
// En SELECT följd av ett ovillkorligt UPDATE räcker inte: två samtidiga besked läser båda samma
// max_seq, båda tycker sig vara nyare, och ett försenat LÄGRE seq kan accepteras efter ett högre.
// Beslutet och skrivningen måste ske i EN sats.
// ================================================================================================

const maxSeq = (pool, kornId) => pool.query(
  'SELECT max_seq FROM bridge_runs WHERE account_key=$1 AND bridge_run_id=$2', [KONTO, kornId])
  .then(r => Number(r.rows[0].max_seq));

prov('P1 · samtidiga seq=2 och seq=3 från max_seq=1 landar på 3 och backar aldrig', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 1 });
  assert.equal(await maxSeq(pool, KOR_1), 1, 'utgångsläget är inte max_seq=1');

  // Grinden: en tredje anslutning håller radlåset, så båda UPDATE:erna hinner fram och köar.
  const grind = await pool.connect();
  await grind.query('BEGIN');
  await grind.query('SELECT 1 FROM bridge_runs WHERE account_key=$1 AND bridge_run_id=$2 FOR UPDATE',
    [KONTO, KOR_1]);

  const lopp = Promise.all([
    sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 2 }),
    sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 3 }),
  ]);
  await new Promise(r => setTimeout(r, 200));
  await grind.query('COMMIT');
  grind.release();
  const [tva, tre] = await lopp;

  // 1. Slutligt värde MÅSTE vara 3, oavsett vem som hann först.
  assert.equal(await maxSeq(pool, KOR_1), 3, 'max_seq landade inte på 3');
  // 2. seq=3 är alltid nyare än utgångsläget och får aldrig avvisas.
  assert.notEqual(tre.stale, true, 'det högsta seq:t avvisades');
  // 3. Dokumenterad semantik för seq=2: antingen hann den före 3 och accepterades, eller så kom
  //    den efter och är då aldre-seq. Vad den ALDRIG får vara är accepterad EFTER att 3 landat.
  if (tva.stale) assert.equal(tva.skal, 'aldre-seq', 'fel skäl: ' + tva.skal);
});

prov('P2 · ett försenat LÄGRE seq avvisas och sänker inte max_seq', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const tre = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 3 });
  assert.notEqual(tre.stale, true, 'seq=3 accepterades inte ens som första besked');
  assert.equal(await maxSeq(pool, KOR_1), 3);

  const sent = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 2 });
  assert.equal(sent.stale, true, 'ett försenat lägre seq accepterades efter ett högre');
  assert.equal(sent.skal, 'aldre-seq', 'fel skäl: ' + sent.skal);
  assert.equal(await maxSeq(pool, KOR_1), 3, 'max_seq BACKADE till ' + (await maxSeq(pool, KOR_1)));
});

prov('P3 · samma seq igen är idempotent och rör inte max_seq', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 3 });

  const igen = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 3 });
  // Ett upprepat besked är inte föråldrat — bryggan säger samma sak igen, och svaret ska vara
  // detsamma som första gången. Att avvisa det hade gjort varje omsändning till ett tappat besked.
  assert.notEqual(igen.stale, true, 'samma seq igen behandlades som föråldrat: ' + igen.skal);
  assert.deepEqual(igen.workspaces, [], 'ett idempotent besked svarade om sessioner');
  assert.equal(await maxSeq(pool, KOR_1), 3, 'max_seq ändrades av ett upprepat besked');
});

prov('P4 · seq mot en AVLÖST körning avvisas utan att röra dess max_seq', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 5 });
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_2 });

  // Villkoret `AND current` i samma UPDATE gör att en avlöst körning varken kan tala eller
  // flytta sin egen räknare. Utan det hade den kunnat skriva i tabellen efter sin död.
  const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 99 });
  assert.equal(ut.stale, true, 'den avlösta körningen fick tala');
  assert.equal(ut.skal, 'avlost-korning', 'fel skäl: ' + ut.skal);
  assert.equal(await maxSeq(pool, KOR_1), 5, 'den avlösta körningen flyttade sin egen max_seq');
});

// ================================================================================================
// Q · SLUTRESULTATET FÖLJER HÖGSTA ACCEPTERADE SEQ — inte låsordning, inte väggklocka
// ================================================================================================

const aktivSession = (pool, ws) => pool.query(
  'SELECT s.id, s.room_id FROM stream_session_pointer p '
  + 'LEFT JOIN stream_sessions s ON s.id=p.session_id AND s.ended_at IS NULL '
  + 'WHERE p.workspace_id=$1', [ws]).then(r => (r.rows[0] && r.rows[0].id ? r.rows[0] : null));

prov('Q1 · två olika roomId i omvänd slutförandeordning — högsta seq vinner', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 1 });

  // Grinden håller kontoraden, som är transaktionens FÖRSTA lås. Båda beskeden köar där, och
  // Postgres delar ut låset i ankomstordning — så slutförandeordningen är styrd, inte gissad.
  const grind = await pool.connect();
  await grind.query('BEGIN');
  await grind.query('SELECT account_key FROM bridge_accounts WHERE account_key=$1 FOR NO KEY UPDATE',
    [KONTO]);

  // HÖGSTA seq ställer sig i kön FÖRST och slutförs alltså först. Det LÄGRE beskedet slutförs sist
  // — den ordning som är farlig: det vaknar efter att pekaren redan flyttats.
  const hogst = sessioner.startaLive({ konto: KONTO, roomId: RUM_2, bridgeRunId: KOR_1, seq: 9 });
  await new Promise(r => setTimeout(r, 150));
  const lagst = sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 4 });
  await new Promise(r => setTimeout(r, 150));
  await grind.query('COMMIT');
  grind.release();

  const [nio, fyra] = await Promise.all([hogst, lagst]);
  assert.notEqual(nio.stale, true, 'det högsta seq:t avvisades');
  assert.equal(fyra.stale, true, 'det lägre seq:t fick flytta pekaren efter det högre');
  assert.equal(fyra.skal, 'aldre-seq', 'fel skäl: ' + fyra.skal);

  const aktiv = await aktivSession(pool, WS_A);
  assert.ok(aktiv, 'ingen aktiv session kvar');
  assert.equal(aktiv.room_id, RUM_2,
    'pekaren följde slutförandeordningen i stället för sekvensen — den pekar på ' + aktiv.room_id);
  const oppna = await pool.query(
    'SELECT count(*)::int AS n FROM stream_sessions WHERE workspace_id=$1 AND ended_at IS NULL',
    [WS_A]);
  assert.equal(oppna.rows[0].n, 1, oppna.rows[0].n + ' öppna sessioner');
});

// ================================================================================================
// R · IDEMPOTENS, BILJETTER OCH PER-WORKSPACE-RESULTAT
// ================================================================================================

prov('R1 · samma seq med ETT ANNAT roomId är en fullständig no-op', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const forst = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 5 });
  assert.equal(forst.workspaces[0].created, true);

  // Samma seq, annat rum. Går beslutet vidare till rumsbeslutet kan vem som helst flytta pekaren
  // genom att skicka om en sekvens som redan är förbrukad.
  const igen = await sessioner.startaLive({ konto: KONTO, roomId: RUM_2, bridgeRunId: KOR_1, seq: 5 });

  // SKADAN FÖRST, flaggan sist. Uppmätt 2026-08-23: med seq-kontrollen utanför transaktionen föll
  // provet på flaggan innan det hann mäta att pekaren faktiskt flyttats — ett mutationsbevis som
  // pekar på fel sak. Det som gör ont är att en B-session skapas och pekaren rycks; att svaret
  // saknar en etikett är bara symtomet.
  const aktiv = await aktivSession(pool, WS_A);
  assert.equal(aktiv && aktiv.room_id, RUM_1, 'PEKAREN FLYTTADES av ett besked med förbrukad seq');
  const alla = await pool.query(
    'SELECT room_id, ended_at FROM stream_sessions WHERE workspace_id=$1', [WS_A]);
  assert.equal(alla.rowCount, 1, 'en B-session skapades: ' + JSON.stringify(alla.rows));
  assert.equal(alla.rows[0].room_id, RUM_1);
  assert.equal(alla.rows[0].ended_at, null, 'A-sessionen stängdes av ett idempotent besked');
  // REN NO-OP: inga workspaces i svaret. Tidigare last ett "nulage" har, men det lastes UTAN
  // pekarlasen och kunde vara inaktuellt redan nar det returnerades - och ett svar som beskriver
  // sessioner inbjuder anroparen att tro att beskedet gjorde nagot.
  assert.deepEqual(igen.workspaces, [], 'ett idempotent besked svarade om sessioner');
  assert.equal(igen.idempotent, true, 'svaret markerades inte som idempotent');
});

prov('R2 · ett blockerat workspace hindrar inte ett berättigat', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A); await anslut(pool, WS_B);
  // WS_A har RUM_1 i stängd historik och INGEN biljett. WS_B har aldrig sett rummet.
  await pool.query("INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
    + "VALUES($1,$2,$3,now(),'bridge')", [WS_A, RUM_1, KONTO]);

  const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const a = ut.workspaces.find(w => w.workspaceId === WS_A);
  const b = ut.workspaces.find(w => w.workspaceId === WS_B);
  // Statusbeskedet är giltigt för KONTOT; historiken är per workspace. Att rulla tillbaka allt
  // hade låtit ett workspaces historik tysta ett annats sändning.
  assert.equal(a.stale, true, 'det blockerade workspacet öppnade rummet ändå');
  assert.equal(a.skal, 'stangt-rum');
  assert.equal(a.session, null);
  assert.equal(b.created, true, 'det berättigade workspacet blockerades av det andra');
  assert.ok(b.session && b.session.id);
  assert.equal((await aktivSession(pool, WS_A)), null, 'WS_A fick en aktiv session');
  assert.equal((await aktivSession(pool, WS_B)).room_id, RUM_1);
});

const laggBiljett = (pool, ws, rum) => pool.query(
  "INSERT INTO stream_room_reopen(workspace_id,room_id,reason) VALUES($1,$2,'prov')", [ws, rum]);

const obrukade = (pool, ws, rum) => pool.query(
  'SELECT count(*)::int AS n FROM stream_room_reopen '
  + 'WHERE workspace_id=$1 AND room_id=$2 AND consumed_at IS NULL', [ws, rum])
  .then(r => r.rows[0].n);

prov('R3 · en biljett öppnar rummet och konsumeras exakt en gång', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await pool.query("INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
    + "VALUES($1,$2,$3,now(),'bridge')", [WS_A, RUM_1, KONTO]);
  await laggBiljett(pool, WS_A, RUM_1);
  assert.equal(await obrukade(pool, WS_A, RUM_1), 1, 'biljetten lades inte in');

  const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  assert.equal(ut.workspaces[0].created, true, 'biljetten släppte inte igenom rummet');
  assert.equal(ut.workspaces[0].biljettAnvand, true, 'svaret sa inte att biljetten användes');
  assert.equal(await obrukade(pool, WS_A, RUM_1), 0, 'biljetten konsumerades inte');
  const kvitton = await pool.query(
    'SELECT count(*)::int AS n FROM stream_room_reopen WHERE workspace_id=$1 AND room_id=$2 '
    + 'AND consumed_at IS NOT NULL', [WS_A, RUM_1]);
  assert.equal(kvitton.rows[0].n, 1, 'fel antal konsumerade biljetter');
});

prov('R4 · samma biljett kan inte öppna rummet en andra gång', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await pool.query("INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
    + "VALUES($1,$2,$3,now(),'bridge')", [WS_A, RUM_1, KONTO]);
  await laggBiljett(pool, WS_A, RUM_1);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });          // biljetten förbrukas
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_2 });          // RUM_1 stängs som ersatt

  // Tredje besked om RUM_1: historiken finns, biljetten är förbrukad. Fail-closed igen.
  const igen = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  assert.equal(igen.workspaces[0].stale, true, 'den förbrukade biljetten öppnade rummet igen');
  assert.equal(igen.workspaces[0].skal, 'stangt-rum');
  assert.equal((await aktivSession(pool, WS_A)).room_id, RUM_2, 'pekaren rycktes tillbaka');
});

// OBS om R5:s räckvidd: här faller insättningen INNAN `UPDATE ... SET consumed_at`, så provet visar
// att konsumtionen aldrig påbörjades. Att en rollback tar tillbaka en REDAN skriven konsumtion
// bevisas av R7, där felet inträffar i ett annat workspace efter att det första hunnit konsumera.
prov('R5 · ett fel FÖRE konsumtionen lämnar biljetten OANVÄND', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  // Stängd historik för RUM_1 ...
  await pool.query("INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
    + "VALUES($1,$2,$3,now(),'bridge')", [WS_A, RUM_1, KONTO]);
  // ... OCH en öppen session för samma rum som pekaren inte känner till. Beslutet ser därför
  // "stängd historik + biljett" och försöker skapa — men det partiella unika indexet på ÖPPNA
  // sessioner avvisar insättningen. Det är en riktig constraint, inte en attrapp.
  await pool.query('INSERT INTO stream_sessions(workspace_id,room_id,account_key) VALUES($1,$2,$3)',
    [WS_A, RUM_1, KONTO]);
  await laggBiljett(pool, WS_A, RUM_1);

  await assert.rejects(() => sessioner.startaLive({ konto: KONTO, roomId: RUM_1 }),
    e => e.code === '23505', 'insättningen avvisades inte av det partiella unika indexet');
  assert.equal(await obrukade(pool, WS_A, RUM_1), 1,
    'biljetten konsumerades trots att sessionen aldrig blev till');
});

prov('R6 · en återanslutning konsumerar aldrig en biljett', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });          // aktiv session på RUM_1
  await laggBiljett(pool, WS_A, RUM_1);                                 // en biljett som ligger kvar

  const igen = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  assert.equal(igen.workspaces[0].created, false, 'återanslutningen skapade en ny session');
  assert.equal(await obrukade(pool, WS_A, RUM_1), 1,
    'återanslutningen åt upp en biljett som ingen bett den använda');
});

prov('R7 · en rollback ÅTERSTÄLLER en biljett som redan hunnit konsumeras', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A); await anslut(pool, WS_B);

  // R5 visar att biljetten är orörd när insättningen faller FÖRE konsumtionen. Det bevisar bara att
  // konsumtionen aldrig påbörjades — inte att transaktionen tar tillbaka en konsumtion som redan
  // skrivits. För det måste felet inträffa EFTER `UPDATE ... SET consumed_at`.
  //
  // Konstruktionen: fan-out till två workspaces. De behandlas i sorterad id-ordning, så WS_A
  // (1111…) hinner konsumera sin biljett och skapa sin session INNAN WS_B (2222…) faller. Då är
  // consumed_at redan satt när felet kommer, och bara en rollback kan ta tillbaka det.
  for (const ws of [WS_A, WS_B]) {
    await pool.query("INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
      + "VALUES($1,$2,$3,now(),'bridge')", [ws, RUM_1, KONTO]);
    await laggBiljett(pool, ws, RUM_1);
  }
  // WS_B får dessutom en ÖPPEN session för samma rum, utanför pekaren. Dess INSERT faller därför
  // på det partiella unika indexet — en riktig constraint, ingen injicerad krasch.
  await pool.query('INSERT INTO stream_sessions(workspace_id,room_id,account_key) VALUES($1,$2,$3)',
    [WS_B, RUM_1, KONTO]);

  assert.equal(await obrukade(pool, WS_A, RUM_1), 1);
  assert.equal(await obrukade(pool, WS_B, RUM_1), 1);

  await assert.rejects(() => sessioner.startaLive({ konto: KONTO, roomId: RUM_1 }),
    e => e.code === '23505', 'WS_B:s insättning avvisades inte av det partiella unika indexet');

  // BÅDA biljetterna ska vara oanvända. WS_A:s consumed_at var satt när felet kom — att den är
  // NULL igen är beviset på att hela beskedet rullades tillbaka, inte bara den del som föll.
  assert.equal(await obrukade(pool, WS_A, RUM_1), 1,
    'WS_A:s biljett förblev konsumerad efter rollback — konsumtionen och sessionen ligger inte i '
    + 'samma transaktion');
  assert.equal(await obrukade(pool, WS_B, RUM_1), 1);
  // Och ingen session ska ha överlevt.
  const skapade = await pool.query(
    'SELECT count(*)::int AS n FROM stream_sessions WHERE workspace_id=$1 AND ended_at IS NULL',
    [WS_A]);
  assert.equal(skapade.rows[0].n, 0, 'WS_A:s session överlevde rollbacken');
  assert.equal(await aktivSession(pool, WS_A), null, 'WS_A:s pekare flyttades trots rollback');
});

prov('R8 · kontrollmätning: utan WS_B:s krock går samma besked igenom och konsumerar biljetten',
  async () => {
    const { sessioner, pool } = await rigg();
    await anslut(pool, WS_A); await anslut(pool, WS_B);
    // Identiskt upplägg som R7 MINUS den öppna sessionen som får WS_B att falla. Utan den här
    // mätningen kunde R7 vara grönt för att beskedet aldrig gjorde något alls.
    for (const ws of [WS_A, WS_B]) {
      await pool.query("INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
        + "VALUES($1,$2,$3,now(),'bridge')", [ws, RUM_1, KONTO]);
      await laggBiljett(pool, ws, RUM_1);
    }
    const ut = await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
    assert.equal(ut.workspaces.length, 2);
    assert.ok(ut.workspaces.every(w => w.created && w.biljettAnvand),
      'båda workspacen skulle ha öppnat rummet med sin biljett');
    assert.equal(await obrukade(pool, WS_A, RUM_1), 0, 'WS_A:s biljett konsumerades inte');
    assert.equal(await obrukade(pool, WS_B, RUM_1), 0, 'WS_B:s biljett konsumerades inte');
  });

// ================================================================================================
// S · NOLLSTÄLLNINGEN
// ================================================================================================

const skapaOverlay = (pool, ws, state) => pool.query(
  "INSERT INTO overlays(workspace_id,name,state) VALUES($1,'prov',$2::jsonb) RETURNING id, version",
  [ws, JSON.stringify(state)]).then(r => r.rows[0]);

const overlayRad = (pool, id) => pool.query(
  'SELECT state, version FROM overlays WHERE id=$1', [id]).then(r => r.rows[0]);

const kvitton = (pool, sessionId) => pool.query(
  'SELECT scope FROM stream_session_reset WHERE session_id=$1 ORDER BY scope', [sessionId])
  .then(r => r.rows.map(x => x.scope));

const KAMPANJ = () => ({ widgets: [{
  id: 'c1', type: 'templateGiftCampaign',
  giftCurrent0: 37, giftCurrent1: 9, giftTarget0: 50, giftName0: 'Rose',
  campaignTheme: 'neon', campaignSubtitle: 'PUSH THE EVENT',
}] });

prov('S1 · två samtidiga nollställningar av samma session — bara en kör', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  let korningar = 0;
  const utfor = async () => { korningar++; await new Promise(r => setTimeout(r, 60)); };
  // Kvittot ÄR låset: primärnyckeln (session_id, scope) avgör tävlingen, inte koden.
  const svar = await Promise.all([
    sessioner.nollstall({ sessionId: ett.session.id, scope: 'egen-scope', utfor }),
    sessioner.nollstall({ sessionId: ett.session.id, scope: 'egen-scope', utfor }),
  ]);
  assert.equal(svar.filter(Boolean).length, 1, 'båda transaktionerna trodde sig ha vunnit kvittot');
  assert.equal(korningar, 1, 'nollställningen kördes ' + korningar + ' gånger');
});

prov('S2 · ett fel EFTER kvittot och en verklig skrivning rullar tillbaka båda', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const overlay = await skapaOverlay(pool, WS_A, {});
  await pool.query('INSERT INTO goal_runtime(overlay_id,widget_id,metric,baseline,progress,target) '
    + "VALUES($1,'w1','likes',250,900,5000)", [overlay.id]);
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  // Sessionsskapandet har redan nollat progress. Sätt tillbaka ett värde så provet har något att
  // se försvinna — och komma tillbaka.
  await pool.query('UPDATE goal_runtime SET progress=900 WHERE overlay_id=$1', [overlay.id]);

  // Kvitto tas, en RIKTIG nollställning skrivs, och sedan kastas felet. Utan gemensam transaktion
  // hade progress stått på 0 medan kvittot sa "gjort" — och nästa försök hade hoppat över den.
  // EGET scope, av samma skäl som F1: sessionsskapandet har redan tagit goal_runtime-kvittot,
  // och då hade nollstall() returnerat false utan att ens köra utfor.
  await assert.rejects(() => sessioner.nollstall({
    sessionId: ett.session.id, scope: 'provscope-s2',
    utfor: async c => {
      await c.query('UPDATE goal_runtime SET progress=0 WHERE overlay_id=$1', [overlay.id]);
      throw new Error('avsiktligt fel efter en verklig resetskrivning');
    },
  }));
  const g = await pool.query('SELECT progress FROM goal_runtime WHERE overlay_id=$1', [overlay.id]);
  assert.equal(Number(g.rows[0].progress), 900, 'resetskrivningen överlevde felet');
  assert.deepEqual(await kvitton(pool, ett.session.id), ['gift_campaign', 'goal_runtime'],
    'det misslyckade försökets kvitto överlevde, eller sessionens egna försvann');
});

prov('S3 · en okänd framtida konfigurationsnyckel överlever nollställningen', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const state = KAMPANJ();
  // En nyckel som inte fanns när resetkoden skrevs. En generell JSON-rensning hade tagit den.
  state.widgets[0].nyFramtidaInstallning = { lage: 'oktober', ton: 42 };
  state.widgets[0].giftCurrent7 = 12;
  const overlay = await skapaOverlay(pool, WS_A, state);

  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const w = (await overlayRad(pool, overlay.id)).state.widgets[0];
  assert.equal(w.giftCurrent0, 0);
  assert.equal(w.giftCurrent7, 0, 'högre index nollställdes inte');
  assert.deepEqual(w.nyFramtidaInstallning, { lage: 'oktober', ton: 42 },
    'en okänd konfigurationsnyckel försvann i nollställningen');
  assert.equal(w.giftTarget0, 50);
  assert.equal(w.campaignSubtitle, 'PUSH THE EVENT');
  assert.equal(w.giftName0, 'Rose');
});

prov('S4 · en samtidig Studio-skrivning tappas inte av nollställningen', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const overlay = await skapaOverlay(pool, WS_A, KAMPANJ());

  // Grinden håller overlayraden. Nollställningen blockerar på FOR UPDATE och kan alltså inte
  // läsa state förrän Studio committat — det är hela poängen med att låsa FÖRE läsningen.
  const grind = await pool.connect();
  await grind.query('BEGIN');
  await grind.query('SELECT id FROM overlays WHERE id=$1 FOR UPDATE', [overlay.id]);

  const reset = sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  await new Promise(r => setTimeout(r, 200));
  // Studio lägger till en ny konfigurationsnyckel medan nollställningen väntar.
  await grind.query(
    "UPDATE overlays SET state = jsonb_set(state,'{widgets,0,studioNyckel}','\"skrevs-under-tiden\"'), "
    + 'version=version+1 WHERE id=$1', [overlay.id]);
  await grind.query('COMMIT');
  grind.release();
  await reset;

  const w = (await overlayRad(pool, overlay.id)).state.widgets[0];
  assert.equal(w.studioNyckel, 'skrevs-under-tiden',
    'nollställningen skrev tillbaka en gammal kopia och åt upp Studios ändring');
  assert.equal(w.giftCurrent0, 0, 'nollställningen utfördes inte');
  assert.equal(w.campaignSubtitle, 'PUSH THE EVENT');
});

prov('S5 · overlayns version höjs exakt en gång när campaign-state ändras', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const overlay = await skapaOverlay(pool, WS_A, KAMPANJ());
  const fore = Number(overlay.version);

  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const efter = await overlayRad(pool, overlay.id);
  assert.equal(Number(efter.version), fore + 1,
    'versionen gick från ' + fore + ' till ' + efter.version + ' — förväntat exakt +1');
  assert.equal(efter.state.widgets[0].giftCurrent0, 0);
});

prov('S6 · versionen ändras inte när det inte finns något att nollställa', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  // Redan nollade räknare, plus en overlay helt utan campaign-widget.
  const nollad = KAMPANJ();
  nollad.widgets[0].giftCurrent0 = 0; nollad.widgets[0].giftCurrent1 = 0;
  const a = await skapaOverlay(pool, WS_A, nollad);
  const b = await skapaOverlay(pool, WS_A, { widgets: [{ id: 'x', type: 'templateTopLike' }] });

  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  assert.equal(Number((await overlayRad(pool, a.id)).version), Number(a.version),
    'versionen bumpades trots att inget värde ändrades');
  assert.equal(Number((await overlayRad(pool, b.id)).version), Number(b.version),
    'en overlay utan campaign-widget fick sin version bumpad');
});

prov('S7 · fel i det ANDRA scopet rullar tillbaka det förstas kvitto OCH skrivningar', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const overlay = await skapaOverlay(pool, WS_A, KAMPANJ());
  // epoch är integer. Sätts den till maxvärdet spränger epoch+1 kolumnen — ett riktigt fel i
  // goal_runtime-scopet, som körs EFTER gift_campaign. Ingen injicerad krasch.
  await pool.query('INSERT INTO goal_runtime(overlay_id,widget_id,metric,baseline,progress,target,epoch) '
    + "VALUES($1,'w1','likes',250,900,5000,2147483647)", [overlay.id]);

  await assert.rejects(() => sessioner.startaLive({ konto: KONTO, roomId: RUM_1 }),
    e => /out of range|overflow/i.test(String(e.message)),
    'goal_runtime-scopet föll inte som avsett');

  // Det FÖRSTA scopet hann både ta sitt kvitto och skriva. Båda ska vara borta.
  const w = (await overlayRad(pool, overlay.id)).state.widgets[0];
  assert.equal(w.giftCurrent0, 37, 'gift_campaign-skrivningen överlevde felet i nästa scope');
  assert.equal(Number((await overlayRad(pool, overlay.id)).version), Number(overlay.version),
    'versionen bumpades trots rollback');
  const kvar = await pool.query('SELECT count(*)::int AS n FROM stream_session_reset');
  assert.equal(kvar.rows[0].n, 0, 'ett kvitto överlevde rollbacken');
  const sessioner_kvar = await pool.query(
    'SELECT count(*)::int AS n FROM stream_sessions WHERE workspace_id=$1', [WS_A]);
  assert.equal(sessioner_kvar.rows[0].n, 0, 'sessionen överlevde rollbacken');
});

prov('S8 · återanslutning ger inget nytt kvitto; en NY session får sitt eget', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  const overlay = await skapaOverlay(pool, WS_A, KAMPANJ());

  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  assert.deepEqual(await kvitton(pool, ett.session.id), ['gift_campaign', 'goal_runtime']);
  const versionEfterForsta = Number((await overlayRad(pool, overlay.id)).version);

  // Räknaren tickar upp igen under sändningen.
  await pool.query("UPDATE overlays SET state=jsonb_set(state,'{widgets,0,giftCurrent0}','5') "
    + 'WHERE id=$1', [overlay.id]);

  // ÅTERANSLUTNING: samma aktiva rum. Inget nytt kvitto, ingen ny nollställning — annars hade
  // varje nätverksglapp raderat siffrorna mitt i sändningen.
  const igen = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  assert.equal(igen.created, false);
  assert.deepEqual(await kvitton(pool, ett.session.id), ['gift_campaign', 'goal_runtime'],
    'återanslutningen skapade fler kvitton');
  assert.equal((await overlayRad(pool, overlay.id)).state.widgets[0].giftCurrent0, 5,
    'återanslutningen nollställde mitt i sändningen');

  // NY session: eget kvitto, nollställd exakt en gång.
  const tva = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_2 })).workspaces[0];
  assert.notEqual(tva.session.id, ett.session.id);
  assert.deepEqual(await kvitton(pool, tva.session.id), ['gift_campaign', 'goal_runtime']);
  assert.equal((await overlayRad(pool, overlay.id)).state.widgets[0].giftCurrent0, 0,
    'den nya sessionen nollställde inte');
  assert.ok(Number((await overlayRad(pool, overlay.id)).version) > versionEfterForsta);
});

// ================================================================================================
// T · UTKORGEN
// ================================================================================================

const utkorg = (pool, ws) => pool.query(
  // workspace_id MASTE med: adaptern routar pa kolumnen och vagrar publicera utan den.
  'SELECT id, workspace_id, event_id, topic, payload, attempts, next_attempt_at, published_at, parked_at, '
  + 'lease_owner, lease_until, last_error FROM stream_event_outbox '
  + (ws ? 'WHERE workspace_id=$1 ' : '') + 'ORDER BY id', ws ? [ws] : []).then(r => r.rows);

const poisonAudit = pool => pool.query(
  "SELECT count(*)::int AS n FROM audit_log WHERE action='stream_outbox_poison'")
  .then(r => r.rows[0].n);

prov('T1 · en rollback lämnar INGEN outboxrad', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A); await anslut(pool, WS_B);
  // WS_A går igenom helt — inklusive outboxraden. WS_B faller sedan på det partiella unika
  // indexet. Raden skrivs alltså och rullas tillbaka, den uteblir inte.
  await pool.query('INSERT INTO stream_sessions(workspace_id,room_id,account_key) VALUES($1,$2,$3)',
    [WS_B, RUM_1, KONTO]);
  await pool.query("INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
    + "VALUES($1,$2,$3,now(),'bridge')", [WS_B, RUM_1, KONTO]);
  await laggBiljett(pool, WS_B, RUM_1);

  await assert.rejects(() => sessioner.startaLive({ konto: KONTO, roomId: RUM_1 }),
    e => e.code === '23505');
  assert.equal((await utkorg(pool)).length, 0, 'en outboxrad överlevde rollbacken');
});

prov('T2 · exakt EN rad; reconnect och duplicerad seq lämnar den på en', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId: KOR_1 });
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 5 }))
    .workspaces[0];
  const forsta = await utkorg(pool, WS_A);
  assert.equal(forsta.length, 1, 'sessionsskapandet gav ' + forsta.length + ' rader');
  assert.equal(forsta[0].event_id, 'live:start:' + ett.session.id, 'event_id är inte härlett ur session_id');
  assert.equal(forsta[0].payload.eventId, forsta[0].event_id, 'eventId saknas i payloaden');
  assert.equal(forsta[0].payload.sessionId, ett.session.id);
  assert.equal(forsta[0].payload.workspaceId, WS_A);
  assert.equal(forsta[0].payload.type, 'livesession');
  assert.equal(forsta[0].payload.previousSessionId, null);
  // Minimal payload: inget kontonamn, inget körnings-id, inget rum.
  assert.equal(forsta[0].payload.accountKey, undefined, 'accountKey läcker till bussen');
  assert.equal(forsta[0].payload.bridgeRunId, undefined, 'bridgeRunId läcker till bussen');
  assert.equal(forsta[0].payload.roomId, undefined, 'roomId skickas utan känd mottagare');

  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 6 }); // reconnect
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1, bridgeRunId: KOR_1, seq: 6 }); // samma seq
  assert.equal((await utkorg(pool, WS_A)).length, 1, 'reconnect eller duplicerad seq gav en extra rad');
});

prov('T3 · två workers claimar olika rader, aldrig samma', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A); await anslut(pool, WS_B);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });      // en rad per workspace
  assert.equal((await utkorg(pool)).length, 2);

  const a = [], b = [];
  const langsam = lista => async rad => { lista.push(rad.event_id); await new Promise(r => setTimeout(r, 80)); };
  await Promise.all([
    sessioner.publiceraUtkorg({ workerId: 'w-a', sand: langsam(a) }),
    sessioner.publiceraUtkorg({ workerId: 'w-b', sand: langsam(b) }),
  ]);
  const alla = [...a, ...b];
  assert.equal(alla.length, 2, 'instanserna publicerade ' + alla.length + ' av 2');
  assert.equal(new Set(alla).size, 2, 'samma rad togs av båda workers');
  assert.ok((await utkorg(pool)).every(r => r.published_at), 'alla rader markerades inte');
});

prov('T4 · en utgången lease återtas, en levande gör det inte', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const T0 = new Date(Date.now() + 60000);
  // En krashad worker släpper aldrig sin lease. Den ligger kvar tills den LÖPER UT.
  await pool.query("UPDATE stream_event_outbox SET lease_owner='krashad', lease_until=$1",
    [new Date(T0.getTime() + 30000)]);

  const skickat = [];
  const n1 = await sessioner.publiceraUtkorg({ workerId: 'ny', nu: () => T0,
    sand: async r => skickat.push(r.event_id) });
  assert.equal(n1, 0, 'en LEVANDE lease togs över');
  assert.equal(skickat.length, 0);

  // 31 sekunder senare har den löpt ut. Ingen städare behövs — claim-frågans egen predikat tar den.
  const senare = new Date(T0.getTime() + 31000);
  const n2 = await sessioner.publiceraUtkorg({ workerId: 'ny', nu: () => senare,
    sand: async r => skickat.push(r.event_id) });
  assert.equal(n2, 1, 'en UTGÅNGEN lease återtogs inte');
  assert.equal(skickat.length, 1);
});

prov('T5 · en gammal worker kan inte kvittera efter att leasen tagits över', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const T0 = new Date(Date.now() + 60000);

  // Mitt i publiceringen tar en annan worker över raden. Den gamla har levererat, men äger inte
  // längre raden — och får därför inte skriva published_at.
  const n = await sessioner.publiceraUtkorg({ workerId: 'gammal', nu: () => T0, sand: async () => {
    await pool.query("UPDATE stream_event_outbox SET lease_owner='ny', lease_until=$1",
      [new Date(T0.getTime() + 30000)]);
  } });
  assert.equal(n, 0, 'den gamla workern kvitterade en rad den inte längre ägde');
  const rad = (await utkorg(pool))[0];
  assert.equal(rad.published_at, null, 'raden markerades publicerad av fel ägare');
  assert.equal(rad.lease_owner, 'ny', 'den nya ägaren skrevs över');
});

prov('T6 · ett misslyckande ökar attempts och skjuter fram nästa försök EXAKT', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const T0 = new Date(Date.now() + 60000);
  const id = (await utkorg(pool))[0].id;

  await sessioner.publiceraUtkorg({ workerId: 'w', nu: () => T0,
    sand: async () => { throw new Error('mottagaren är nere'); } });
  const rad = (await utkorg(pool))[0];
  assert.equal(Number(rad.attempts), 1, 'attempts räknades inte upp');
  assert.match(String(rad.last_error), /mottagaren är nere/, 'felet sparades inte');
  assert.equal(rad.lease_owner, null, 'leasen släpptes inte');
  assert.equal(rad.published_at, null);
  // Deterministiskt jitter: exakt värde, inte ett intervall. Ett flackande prov går inte att
  // skilja från en trasig backoff.
  const vantat = sessioner.backoffSekunder(id, 0);
  assert.equal(new Date(rad.next_attempt_at).getTime(), T0.getTime() + vantat * 1000,
    'backoffen är inte deterministisk: väntade +' + vantat + 's');
  assert.ok(vantat >= 5 && vantat <= 7, 'första backoffen ska ligga runt basvärdet, fick ' + vantat);
});

prov('T7 · poison parkeras exakt en gång och auditeras', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const T0 = new Date(Date.now() + 60000);
  const trasig = async () => { throw new Error('mottagaren är nere'); };

  for (let i = 0; i < 10; i++) {
    await sessioner.publiceraUtkorg({ workerId: 'w', sand: trasig,
      nu: () => new Date(T0.getTime() + i * 3600e3) });
  }
  const rad = (await utkorg(pool))[0];
  assert.ok(rad.parked_at, 'raden parkerades aldrig');
  assert.equal(Number(rad.attempts), 8, 'parkerades vid fel antal försök: ' + rad.attempts);
  assert.equal(rad.published_at, null);
  assert.equal(await poisonAudit(pool), 1, 'fel antal poison-auditrader: ' + await poisonAudit(pool));
  const giftiga = await sessioner.giftigaHandelser();
  assert.equal(giftiga.length, 1, 'den parkerade händelsen syns inte');
  // En parkerad rad faller ur claim-predikatet och kan aldrig auditeras en andra gång.
  await sessioner.publiceraUtkorg({ workerId: 'w', sand: trasig,
    nu: () => new Date(T0.getTime() + 99 * 3600e3) });
  assert.equal(await poisonAudit(pool), 1, 'en andra poison-auditrad skapades');
});

prov('T8 · en lyckad publicering markerar EXAKT rätt rad', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A); await anslut(pool, WS_B);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const fore = await utkorg(pool);
  assert.equal(fore.length, 2);

  const n = await sessioner.publiceraUtkorg({ workerId: 'w', antal: 1, sand: async () => {} });
  assert.equal(n, 1);
  const efter = await utkorg(pool);
  assert.ok(efter[0].published_at, 'den första raden markerades inte');
  assert.equal(efter[1].published_at, null, 'en rad som aldrig publicerades markerades');
  assert.equal(efter[0].lease_owner, null, 'leasen städades inte vid kvittens');
});

prov('T9 · krasch efter leverans ger ompublicering med SAMMA event_id', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const T0 = new Date(Date.now() + 60000);
  const levererat = [];

  // Första omgången: leveransen lyckas, men leasen tas över innan kvittensen hinner skrivas —
  // samma sak som att processen dör mellan publicering och published_at.
  await sessioner.publiceraUtkorg({ workerId: 'gammal', nu: () => T0, sand: async r => {
    levererat.push(r.event_id);
    await pool.query("UPDATE stream_event_outbox SET lease_owner='spöke', lease_until=$1",
      [new Date(T0.getTime() + 30000)]);
  } });
  assert.equal((await utkorg(pool))[0].published_at, null);

  // Spöket kommer aldrig tillbaka. Leasen löper ut och raden publiceras IGEN.
  const senare = new Date(T0.getTime() + 31000);
  const n = await sessioner.publiceraUtkorg({ workerId: 'ny', nu: () => senare,
    sand: async r => levererat.push(r.event_id) });
  assert.equal(n, 1);
  assert.equal(levererat.length, 2, 'dubbletten uteblev — då är provet inte det scenario det påstår');
  assert.equal(levererat[0], levererat[1],
    'event_id ändrades mellan leveranserna — då kan ingen mottagare deduplicera');
  // AT-LEAST-ONCE, uttryckligen. Serverresetten kördes FÖRE publiceringen och körs inte om av
  // dubbletten, så det är inte resetkvittot som gör ompubliceringen ofarlig. Skyddet måste ligga
  // hos mottagaren: dedup på stabilt eventId, eller idempotens per sessionId. Det kontraktet
  // provas i event-/klientblocket.
  assert.match(levererat[0], /^live:start:/);
});

prov('T10 · en gammal worker som MISSLYCKAS efter övertagandet rör inte raden', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const T0 = new Date(Date.now() + 60000);
  const fore = (await utkorg(pool))[0];

  // Leasen tas över mitt i, och DÄREFTER misslyckas leveransen. Utan ägarvillkoret på fel-vägen
  // skulle den gamla workern öka attempts, flytta backoffen och kunna parkera en rad som numera
  // tillhör någon annan — ett skydd som bara sitter på kvittensen räcker inte.
  await sessioner.publiceraUtkorg({ workerId: 'gammal', nu: () => T0, sand: async () => {
    await pool.query("UPDATE stream_event_outbox SET lease_owner='ny', lease_until=$1",
      [new Date(T0.getTime() + 30000)]);
    throw new Error('leveransen föll efter övertagandet');
  } });

  const efter = (await utkorg(pool))[0];
  assert.equal(Number(efter.attempts), Number(fore.attempts),
    'den gamla workern räknade upp attempts på någon annans rad');
  assert.equal(efter.last_error, fore.last_error, 'den gamla workern skrev sitt fel på annans rad');
  assert.equal(new Date(efter.next_attempt_at).getTime(),
    new Date(fore.next_attempt_at).getTime(), 'den gamla workern flyttade backoffen');
  assert.equal(efter.parked_at, null, 'den gamla workern parkerade någon annans rad');
  assert.equal(efter.lease_owner, 'ny', 'den nya ägaren skrevs över');
});

// ================================================================================================
// U · UTGÅNGEN LEASE — ett annat fall än övertagande
//
// T5 mäter ÖVERTAGANDE: lease_owner byter värde. Här står det GAMLA ägarnamnet kvar, men leasen är
// tidsmässigt ogiltig. `lease_owner=$2` är då fortfarande sant, och utan `lease_until > $nu` får en
// worker som vaknar långt efter sin lease ändå kvittera, flytta backoffen eller parkera raden.
//
// Klockan är injicerad och stegar EN gång: första anropet (claimet) ser T0, alla senare ser T0+31s.
// Samma injicerade tid används genom hela beslutet — ingen väggklocka och ingen SQL-now() blandas in.
// ================================================================================================

const stegandeKlocka = (...tider) => {
  let i = 0;
  return () => tider[Math.min(i++, tider.length - 1)];
};

// Bygger en rad, claimar den vid T0 och låter leasen löpa ut innan workerns resultat skrivs.
async function utgangenLease(sessioner, pool, { sand }) {
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const T0 = new Date(Date.now() + 60000);
  const efterUtgang = new Date(T0.getTime() + 31000);     // leasen är 30 s
  const fore = (await utkorg(pool))[0];
  const n = await sessioner.publiceraUtkorg({
    workerId: 'gammal', nu: stegandeKlocka(T0, efterUtgang), sand,
  });
  return { n, fore, T0, efterUtgang };
}

prov('U1 · kvittens efter att leasen gått ut skriver ingenting', async () => {
  const { sessioner, pool } = await rigg();
  const { n } = await utgangenLease(sessioner, pool, { sand: async () => {} });
  assert.equal(n, 0, 'en worker kvitterade med en utgången lease');
  const rad = (await utkorg(pool))[0];
  assert.equal(rad.published_at, null, 'raden markerades publicerad av en utgången lease');
  assert.equal(rad.lease_owner, 'gammal', 'lease_owner ändrades — provet mäter fel fall');
});

prov('U2 · fel efter att leasen gått ut rör inte attempts, last_error eller backoff', async () => {
  const { sessioner, pool } = await rigg();
  const { fore } = await utgangenLease(sessioner, pool, {
    sand: async () => { throw new Error('mottagaren är nere'); },
  });
  const efter = (await utkorg(pool))[0];
  assert.equal(Number(efter.attempts), Number(fore.attempts), 'attempts räknades upp trots utgången lease');
  assert.equal(efter.last_error, fore.last_error, 'last_error skrevs trots utgången lease');
  assert.equal(new Date(efter.next_attempt_at).getTime(), new Date(fore.next_attempt_at).getTime(),
    'backoffen flyttades trots utgången lease');
  assert.equal(efter.parked_at, null);
});

prov('U3 · parkering efter att leasen gått ut ger varken poison eller audit', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  // Ett försök kvar till gränsen: nästa misslyckande SKULLE parkera raden.
  await pool.query('UPDATE stream_event_outbox SET attempts=7');
  const T0 = new Date(Date.now() + 60000);
  const n = await sessioner.publiceraUtkorg({
    workerId: 'gammal', nu: stegandeKlocka(T0, new Date(T0.getTime() + 31000)),
    sand: async () => { throw new Error('mottagaren är nere'); },
  });
  assert.equal(n, 0);
  const rad = (await utkorg(pool))[0];
  assert.equal(rad.parked_at, null, 'raden parkerades av en worker med utgången lease');
  assert.equal(Number(rad.attempts), 7, 'attempts rördes trots utgången lease');
  assert.equal(await poisonAudit(pool), 0, 'en poison-auditrad skrevs utan giltig lease');
  assert.equal((await sessioner.giftigaHandelser()).length, 0);
});

prov('U4 · efter utgången lease kan en NY worker claima och behandla raden normalt', async () => {
  const { sessioner, pool } = await rigg();
  const { efterUtgang } = await utgangenLease(sessioner, pool, { sand: async () => {} });
  // Kontrollmätning: utan den här halvan bevisar U1–U3 bara att ingenting händer — inte att det
  // är leasen som stoppar dem. Raden ska vara fullt behandlingsbar för nästa ägare.
  const skickat = [];
  const n = await sessioner.publiceraUtkorg({ workerId: 'ny', nu: () => efterUtgang,
    sand: async r => skickat.push(r.event_id) });
  assert.equal(n, 1, 'den nya workern kunde inte behandla raden');
  assert.equal(skickat.length, 1);
  const rad = (await utkorg(pool))[0];
  assert.ok(rad.published_at, 'raden markerades inte av den nya ägaren');
  assert.equal(rad.lease_owner, null, 'leasen städades inte vid kvittens');
});

// ================================================================================================
// V · POISON OCH AUDIT I SAMMA TRANSAKTION
//
// Koden lovar att en misslyckad auditinsert rullar tillbaka parkeringen. Det var ett PÅSTÅENDE:
// konstruktionen ser rätt ut, men ingenting mätte den. En tyst parkerad rad utan auditspår är
// precis det som gör en giftig händelse osynlig, så löftet måste bevisas.
//
// Felet kommer från riktig Postgres-mekanik — en trigger — inte från en injicerad JS-krasch eller
// en produktionsseam. Triggern är villkorad på BÅDE action och det unika eventId:t i
// auditdetaljerna, så parallella eller framtida auditprov inte påverkas.
// ================================================================================================

const TRIGGERFUNKTION = 'prov_poison_rollback_fn';
const TRIGGERNAMN = 'prov_poison_rollback_trg';

const triggerFinns = pool => pool.query(
  'SELECT (SELECT count(*) FROM pg_trigger WHERE tgname=$1)::int AS trg, '
  + '(SELECT count(*) FROM pg_proc WHERE proname=$2)::int AS fn', [TRIGGERNAMN, TRIGGERFUNKTION])
  .then(r => r.rows[0]);

prov('V1 · en misslyckad auditinsert rullar tillbaka HELA parkeringen', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });

  // 1. Raden står ett försök från gränsen: nästa misslyckande SKA parkera den.
  await pool.query('UPDATE stream_event_outbox SET attempts=7');
  const fore = (await utkorg(pool))[0];
  assert.equal(Number(fore.attempts), 7, 'utgångsläget är inte attempts=7');
  assert.equal(fore.parked_at, null);
  const eventId = fore.event_id;

  const T0 = new Date(Date.now() + 60000);
  const trasig = async () => { throw new Error('mottagaren är nere'); };

  try {
    // Triggern kastar BARA för den här händelsen. Villkoret bär både action och eventId, så
    // ingen annan auditrad — nu eller senare — kan träffas av den.
    await pool.query(
      'CREATE OR REPLACE FUNCTION ' + TRIGGERFUNKTION + '() RETURNS trigger AS $fn$ '
      + 'BEGIN '
      + "  IF NEW.action = 'stream_outbox_poison' AND NEW.metadata->>'eventId' = "
      + "     " + "'" + eventId + "'" + ' THEN '
      + "    RAISE EXCEPTION 'provtrigger stoppar just den har poisonhandelsen'; "
      + '  END IF; '
      + '  RETURN NEW; '
      + 'END; $fn$ LANGUAGE plpgsql');
    await pool.query('CREATE TRIGGER ' + TRIGGERNAMN + ' BEFORE INSERT ON audit_log '
      + 'FOR EACH ROW EXECUTE FUNCTION ' + TRIGGERFUNKTION + '()');

    // 2-4. Poisonvägen sätter parked_at, auditinserten kastar EFTER den uppdateringen, och hela
    //      transaktionen rullas tillbaka. Felet propagerar ut ur publiceraUtkorg.
    await assert.rejects(
      () => sessioner.publiceraUtkorg({ workerId: 'w', nu: () => T0, sand: trasig }),
      e => /provtrigger stoppar/.test(String(e.message)),
      'poisonvägen kastade inte det fel triggern reste');
  } finally {
    // 8. Städningen sker oavsett utfall — ett prov som lämnar en trigger kvar förgiftar hela sviten.
    await pool.query('DROP TRIGGER IF EXISTS ' + TRIGGERNAMN + ' ON audit_log');
    await pool.query('DROP FUNCTION IF EXISTS ' + TRIGGERFUNKTION + '()');
  }

  // 9. Städningen KONTROLLERAS, inte antas.
  const kvar = await triggerFinns(pool);
  assert.equal(kvar.trg, 0, 'triggern ligger kvar efter provet');
  assert.equal(kvar.fn, 0, 'triggerfunktionen ligger kvar efter provet');

  // 5-7. Ingenting fick förändras delvis.
  const efter = (await utkorg(pool))[0];
  assert.equal(efter.parked_at, null, 'parkeringen överlevde den misslyckade auditinserten');
  assert.equal(Number(efter.attempts), 7, 'attempts ändrades trots rollback: ' + efter.attempts);
  assert.equal(efter.last_error, fore.last_error, 'last_error skrevs trots rollback');
  assert.equal(new Date(efter.next_attempt_at).getTime(),
    new Date(fore.next_attempt_at).getTime(), 'backoffen flyttades trots rollback');
  assert.equal(efter.published_at, null);
  assert.equal(efter.lease_owner, 'w', 'leasen städades trots rollback — då är UPDATE:n inte atomisk');
  assert.equal(await poisonAudit(pool), 0, 'en poison-auditrad överlevde rollbacken');

  // 10. Samma väg UTAN trigger måste lyckas — annars bevisar provet bara att någonting går fel.
  const T1 = new Date(T0.getTime() + 31000);          // leasen från förra försöket har löpt ut
  await sessioner.publiceraUtkorg({ workerId: 'w2', nu: () => T1, sand: trasig });
  const slutlig = (await utkorg(pool))[0];
  assert.ok(slutlig.parked_at, 'raden parkerades inte när auditen fick gå igenom');
  assert.equal(Number(slutlig.attempts), 8);
  assert.equal(await poisonAudit(pool), 1, 'fel antal auditrader efter lyckad parkering');
  assert.equal((await sessioner.giftigaHandelser()).length, 1);
});

// ================================================================================================
// W · EVENTKONTRAKTET MOT BUSSEN
//
// Två skilda id-begrepp som ALDRIG får ersätta varandra:
//   SSE `id:`  = bussens streamId från xAdd — ordning och Last-Event-ID-replay
//   eventId    = 'live:start:<sessionId>' i JSON — logisk dedup, stabil över ompublicering
// ================================================================================================

// LAT laddning: event-bus.js kraver 'redis', som inte finns i alla miljoer. Ett require pa
// toppnivan hade fallit hela provfilen dar — och en fil som inte ens laddas rapporterar noll prov,
// vilket ser ut som att allt ar bra.
const nyBuss = () => new (require('../event-bus.js').EventBus)(REDIS);
const REDIS = process.env.REDIS_URL || '';

const internProv = (over = {}) => Object.assign({
  type: 'livesession', event: 'live:start',
  eventId: 'live:start:33333333-3333-4333-8333-333333333333',
  sessionId: '33333333-3333-4333-8333-333333333333',
  startedAt: '2026-08-23T13:33:10.000Z',
}, over);

prov('W1 · interna vägen bevarar sessionId och släpper bara vitlistade fält', async () => {
  const { cleanInternalEvent } = require('../event-bus.js');
  const ut = cleanInternalEvent(internProv({ workspaceId: WS_B, roomId: RUM_1,
    accountKey: KONTO, bridgeRunId: KOR_1, previousSessionId: 'x' }));
  assert.equal(ut.sessionId, '33333333-3333-4333-8333-333333333333');
  assert.equal(ut.eventId, 'live:start:33333333-3333-4333-8333-333333333333');
  assert.equal(ut.type, 'livesession');
  assert.equal(ut.event, 'live:start');
  assert.ok(ut.startedAt);
  // Ingenting utanför vitlistan får följa med — inte ens fält som fanns i råpayloadet.
  assert.deepEqual(Object.keys(ut).sort(),
    ['event', 'eventId', 'sessionId', 'startedAt', 'type'],
    'interna vägen bar fält utanför vitlistan: ' + Object.keys(ut).join(', '));
});

prov('W2 · interna vägen är FAIL-CLOSED och kastar namngivet fel', async () => {
  const { cleanInternalEvent } = require('../event-bus.js');
  const fall = [
    ['otillaten-intern-typ', { type: 'gift' }],
    ['otillaten-intern-typ', { type: '' }],
    ['ogiltig-intern-handelse', { event: 'live:end' }],
    ['ogiltigt-sessionid', { sessionId: 'inte-ett-uuid' }],
    ['eventid-matchar-inte', { eventId: 'live:start:nagot-annat' }],
    ['ogiltigt-startedat', { startedAt: 'i tisdags' }],
  ];
  for (const [kod, over] of fall) {
    // Namngivet fel, inte null. Ett korrumperat payload som tyst tappas ser ut som en sändning
    // som aldrig bytte session, och det går inte att felsöka i efterhand.
    assert.throws(() => cleanInternalEvent(internProv(over)), e => e.kod === kod,
      'fel eller inget kod-värde för ' + JSON.stringify(over));
  }
});

prov('W3 · ingestvägen kan varken bära sessionId eller publicera livesession', async () => {
  const { cleanEvent, ALLOWED } = require('../event-bus.js');
  // Externt event med PÅHITTAT sessionId: fältet finns inte i cleanEvents vitlista och försvinner.
  const ut = cleanEvent({ id: 'e1', type: 'gift', userId: 'u1', username: 'a',
    sessionId: '33333333-3333-4333-8333-333333333333' });
  assert.equal(ut.sessionId, undefined,
    'ett externt event fick sätta sessionId — då kan vem som helst påstå vilken sändning ett '
    + 'event tillhör, och sessionId är serverägt');
  assert.equal(ALLOWED.has('livesession'), false,
    'livesession finns i ALLOWED — då kan ingestvägen publicera ett sändningsbesked');
  assert.throws(() => cleanEvent({ id: 'e2', type: 'livesession' }),
    e => e.status === 400, 'ingestvägen accepterade typen livesession');
});

prov('W4 · SSE-ramen bär id: från streamId och minimal JSON', async () => {
  const { sseChunk } = require('../goal-sse.js');
  const { cleanInternalEvent } = require('../event-bus.js');
  // Bussens RIKTIGA form: {streamId, event}. Ingen ny gren i sseChunk behövs — livesession går
  // genom den befintliga live-grenen, och därmed genom samma replayhistorik som allt annat.
  const ram = sseChunk({ streamId: '1755950000000-0', event: cleanInternalEvent(internProv()) }, null);
  assert.match(ram, /^id: 1755950000000-0\n/, 'ingen id:-rad — då kan Last-Event-ID inte spela upp den');
  assert.match(ram, /\nevent: live\n/, 'egen event-typ i stället för bussens live');
  const data = JSON.parse(ram.split('\ndata: ')[1]);
  assert.equal(data.type, 'livesession');
  assert.equal(data.eventId, 'live:start:33333333-3333-4333-8333-333333333333');
  assert.equal(data.workspaceId, undefined, 'workspaceId nådde klienten — strömmen är redan avgränsad');
  assert.equal(data.roomId, undefined, 'roomId nådde klienten utan känd mottagare');
  assert.equal(data.accountKey, undefined, 'accountKey nådde klienten');
  assert.equal(data.bridgeRunId, undefined, 'bridgeRunId nådde klienten');
  assert.equal(data.previousSessionId, undefined, 'previousSessionId nådde klienten');
});

prov('W5 · befintliga eventkontrakt är oförändrade', async () => {
  const { sseChunk } = require('../goal-sse.js');
  // Konfigbeskedet: fortfarande UTAN id:-rad, annars hamnar det i replayhistoriken.
  const konfig = sseChunk({ konfig: { overlayId: 'OV-1', revision: 7 } }, 'OV-1');
  assert.match(konfig, /^event: konfig\n/, 'konfigbeskedet fick en id:-rad eller bytte form');
  assert.equal(/\bid: /.test(konfig), false, 'konfigbeskedet hamnar nu i Last-Event-ID-historiken');
  // Ratt TikTok-event: samma bytes som förut.
  const live = sseChunk({ streamId: '9-0', event: { id: 'e9', type: 'gift', count: 3 } }, null);
  assert.equal(live, 'id: 9-0\nevent: live\ndata: {"id":"e9","type":"gift","count":3}\n\n',
    'råeventets ram ändrades');
});

// ---- Redis-beroende prov: routing, replay och at-least-once ------------------------------------
const utanRedis = REDIS ? false : 'BLOCKERAT: ingen REDIS_URL — routing och replay går inte att '
  + 'prova mot en attrapp, det är bussens eget beteende som är frågan.';
const bussprov = (namn, fn) => test('session: ' + namn, { timeout: 30000, skip: BLOCKED || utanRedis }, fn);

bussprov('W6 · routingen kommer från databaskolumnen, inte från payloaden', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const rad = (await utkorg(pool))[0];
  // FALSKT workspaceId i råpayloadet. Läses routingen därifrån hamnar beskedet i fel overlay.
  await pool.query("UPDATE stream_event_outbox SET payload = payload || $1::jsonb WHERE id=$2",
    [JSON.stringify({ workspaceId: WS_B, roomId: RUM_1 }), rad.id]);
  const uppdaterad = (await utkorg(pool))[0];
  assert.equal(uppdaterad.payload.workspaceId, WS_B, 'provet lyckades inte plantera fältet');

  const buss = nyBuss();
  const mottaget = { [WS_A]: [], [WS_B]: [] };
  // subscribe() returnerar en avregistrering. Utan den lever prenumerantanslutningen kvar och
  // haller nodeprocessen igang — provfilen blir aldrig klar och CI-steget hanger tills jobbet
  // timear ut. Uppmatt 2026-08-23: korningen last i ~50 minuter av just detta.
  const stang = [];
  stang.push(await buss.subscribe(WS_A, m => mottaget[WS_A].push(m)));
  stang.push(await buss.subscribe(WS_B, m => mottaget[WS_B].push(m)));
  try {
    await sessioner.publiceraTillBuss(buss, uppdaterad);
    await new Promise(r => setTimeout(r, 400));
  } finally {
    for (const av of stang) { try { await av(); } catch (e) {} }
    await buss.close().catch(() => {});
  }

  assert.equal(mottaget[WS_A].length, 1, 'beskedet nådde inte kolumnens workspace');
  assert.equal(mottaget[WS_B].length, 0, 'beskedet läckte till workspacet i payloaden');
  assert.equal(mottaget[WS_A][0].event.workspaceId, undefined, 'workspaceId följde med till SSE');
  assert.equal(mottaget[WS_A][0].event.roomId, undefined, 'roomId följde med till SSE');
  assert.ok(mottaget[WS_A][0].streamId, 'ramen saknar streamId');
});

bussprov('W7 · två publiceringar ger olika SSE-id men SAMMA eventId', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const rad = (await utkorg(pool))[0];
  const buss = nyBuss();

  let ett, tva;
  try {
    ett = await sessioner.publiceraTillBuss(buss, rad);
    tva = await sessioner.publiceraTillBuss(buss, rad);
  } finally { await buss.close().catch(() => {}); }
  // AT-LEAST-ONCE, uttryckligen tillåtet: en ompublicering efter krasch mellan leverans och
  // kvittens ger en andra bussram. Transportens id skiljer sig; den logiska identiteten gör det
  // inte. Mottagaren måste dedupa på eventId eller vara idempotent per sessionId.
  assert.notEqual(ett.streamId, tva.streamId, 'ompubliceringen fick samma SSE-id');
  assert.equal(ett.event.eventId, tva.event.eventId, 'eventId ändrades vid ompublicering');
  assert.equal(ett.event.sessionId, tva.event.sessionId);
});

bussprov('W8 · reconnect med Last-Event-ID återspelar rätt ram', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  const rad = (await utkorg(pool))[0];
  const buss = nyBuss();

  let forsta, andra, efter;
  try {
    forsta = await sessioner.publiceraTillBuss(buss, rad);
    andra = await sessioner.publiceraTillBuss(buss, rad);
  // Klienten återansluter med sitt sista streamId. Replayen ska ge det som kom EFTER — inte om
  // det klienten redan sett, och inte tomt.
    efter = await buss.replay(WS_A, forsta.streamId);
  } finally { await buss.close().catch(() => {}); }
  const ider = efter.map(x => x.streamId);
  assert.ok(ider.includes(andra.streamId), 'den andra ramen spelades inte upp');
  assert.equal(ider.includes(forsta.streamId), false, 'klienten fick om ramen den redan sett');
  const aterspelad = efter.find(x => x.streamId === andra.streamId);
  assert.equal(aterspelad.event.eventId, rad.payload.eventId, 'fel ram återspelades');
});

// ================================================================================================
// X · ORDNING PER WORKSPACE I UTKORGEN
//
// Enbart ORDER BY id garanterar ingenting nar flera workers kor. Worker A kan claima den aldre
// raden och bli langsam medan worker B claimar den nyare och publicerar den forst — och da ser
// mottagaren en ny sandning borja innan den forra tog slut.
//
// Provfilen bygger raderna direkt i tabellen. Sessionsflodet skapar an sa lange bara live:start;
// ordningsvillkoret ar en egenskap hos UTKORGEN och ska bevisas som en sadan, inte via en
// avslutsvag som inte finns.
// ================================================================================================

const laggUtkorgsrad = (pool, ws, eventId, topic) => pool.query(
  'INSERT INTO stream_event_outbox(workspace_id, event_id, topic, payload) '
  + 'VALUES($1,$2,$3,$4) RETURNING id',
  [ws, eventId, topic, JSON.stringify({ type: 'livesession', event: topic, eventId })])
  .then(r => Number(r.rows[0].id));

prov('X1 · bara den ALDRE raden kan claimas nar tva workers kor mot samma workspace', async () => {
  const { sessioner, pool } = await rigg();
  await pool.query('DELETE FROM stream_event_outbox');
  const slutId = await laggUtkorgsrad(pool, WS_A, 'live:end:gammal', 'live:end');
  const startId = await laggUtkorgsrad(pool, WS_A, 'live:start:ny', 'live:start');
  assert.ok(startId > slutId, 'provet byggde raderna i fel ordning');

  const a = [], b = [];
  const langsam = lista => async rad => { lista.push(rad.event_id); await new Promise(r => setTimeout(r, 120)); };
  await Promise.all([
    sessioner.publiceraUtkorg({ workerId: 'w-a', sand: langsam(a) }),
    sessioner.publiceraUtkorg({ workerId: 'w-b', sand: langsam(b) }),
  ]);
  const alla = [...a, ...b];
  assert.deepEqual(alla, ['live:end:gammal'],
    'mer an den aldre raden publicerades: ' + JSON.stringify(alla));
});

prov('X2 · nar den aldre kvitterats kan den nyare claimas', async () => {
  const { sessioner, pool } = await rigg();
  await pool.query('DELETE FROM stream_event_outbox');
  await laggUtkorgsrad(pool, WS_A, 'live:end:gammal', 'live:end');
  await laggUtkorgsrad(pool, WS_A, 'live:start:ny', 'live:start');

  const skickat = [];
  await sessioner.publiceraUtkorg({ workerId: 'w', sand: async r => skickat.push(r.event_id) });
  await sessioner.publiceraUtkorg({ workerId: 'w', sand: async r => skickat.push(r.event_id) });
  assert.deepEqual(skickat, ['live:end:gammal', 'live:start:ny'],
    'ordningen holl inte over tva omgangar: ' + JSON.stringify(skickat));
});

prov('X3 · en UTGANGEN lease pa den aldre slapper anda inte fram den nyare', async () => {
  const { sessioner, pool } = await rigg();
  await pool.query('DELETE FROM stream_event_outbox');
  const slutId = await laggUtkorgsrad(pool, WS_A, 'live:end:gammal', 'live:end');
  await laggUtkorgsrad(pool, WS_A, 'live:start:ny', 'live:start');
  const T0 = new Date(Date.now() + 60000);
  // En krashad worker: leasen har lopt ut men raden ar fortfarande OPUBLICERAD.
  await pool.query("UPDATE stream_event_outbox SET lease_owner='krashad', lease_until=$1 WHERE id=$2",
    [new Date(T0.getTime() - 30000), slutId]);

  const skickat = [];
  await sessioner.publiceraUtkorg({ workerId: 'ny', nu: () => T0,
    sand: async r => skickat.push(r.event_id) });
  // Den utgangna leasen ska ateras av den ALDRE raden, inte lata den nyare passera.
  assert.deepEqual(skickat, ['live:end:gammal'],
    'den nyare raden passerade en opublicerad aldre: ' + JSON.stringify(skickat));
});

prov('X4 · en POISON-PARKERAD aldre rad blockerar den nyare (fail-closed)', async () => {
  const { sessioner, pool } = await rigg();
  await pool.query('DELETE FROM stream_event_outbox');
  const slutId = await laggUtkorgsrad(pool, WS_A, 'live:end:gammal', 'live:end');
  await laggUtkorgsrad(pool, WS_A, 'live:start:ny', 'live:start');
  await pool.query('UPDATE stream_event_outbox SET parked_at=now(), attempts=8 WHERE id=$1', [slutId]);

  const skickat = [];
  const n = await sessioner.publiceraUtkorg({ workerId: 'w', sand: async r => skickat.push(r.event_id) });
  // Alternativet vore att slappa forbi den parkerade och bryta ordningen tyst. Poisonlistan gor
  // blockeringen synlig i stallet.
  assert.equal(n, 0, 'nagot publicerades trots en parkerad aldre rad');
  assert.deepEqual(skickat, [], 'den nyare passerade en poison-parkerad aldre');
  assert.equal((await sessioner.giftigaHandelser()).length, 1, 'den parkerade raden syns inte');
});

prov('X5 · ett blockerat workspace hindrar inte ett annat', async () => {
  const { sessioner, pool } = await rigg();
  await pool.query('DELETE FROM stream_event_outbox');
  const slutId = await laggUtkorgsrad(pool, WS_A, 'live:end:a-gammal', 'live:end');
  await laggUtkorgsrad(pool, WS_A, 'live:start:a-ny', 'live:start');
  await pool.query('UPDATE stream_event_outbox SET parked_at=now(), attempts=8 WHERE id=$1', [slutId]);
  await laggUtkorgsrad(pool, WS_B, 'live:start:b', 'live:start');

  const skickat = [];
  await sessioner.publiceraUtkorg({ workerId: 'w', sand: async r => skickat.push(r.event_id) });
  assert.deepEqual(skickat, ['live:start:b'],
    'fel rader publicerades: ' + JSON.stringify(skickat) + ' — WS_A ska vara blockerat, WS_B fritt');
});
