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
  await pool.query("INSERT INTO bridge_accounts(account_key) VALUES($1) ON CONFLICT DO NOTHING",
    [KONTO]);
  await pool.query('DELETE FROM bridge_runs WHERE account_key=$1', [KONTO]);
  for (const ws of [WS_A, WS_B]) {
    // ORDNINGSOBEROENDE. tiktok_connections rensades inte tidigare, så ett prov som kopplade WS_B
    // lämnade kopplingen kvar åt nästa. Uppmätt i CI 2026-08-23: O2 föll på "2 !== 1" — inte för
    // att generationskontrollen var fel, utan för att K1 och B1-B3 hade kopplat WS_B till samma
    // konto tidigare i filen. Varje prov ska deklarera sina EGNA anslutningar.
    await pool.query('DELETE FROM stream_room_reopen WHERE workspace_id=$1', [ws]);
    await pool.query('DELETE FROM tiktok_connections WHERE workspace_id=$1', [ws]);
    await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [ws]);
    await pool.query('DELETE FROM stream_event_outbox WHERE workspace_id=$1', [ws]);
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
  await assert.rejects(() => sessioner.nollstall({
    sessionId: ett.session.id, scope: 'goals',
    utfor: async () => { throw new Error('avsiktligt fel mitt i nollställningen') },
  }));
  const kvitton = await pool.query(
    'SELECT count(*)::int AS n FROM stream_session_reset WHERE session_id=$1', [ett.session.id]);
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
  const ett = (await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 })).workspaces[0];
  await sessioner.nollstallMal({ sessionId: ett.session.id, workspaceId: WS_A });
  const r = (await pool.query(
    'SELECT baseline,progress,target,epoch,revision FROM goal_runtime WHERE overlay_id=$1', [overlay])).rows[0];
  // Den visade siffran är baseline + progress. Nollställs baseline försvinner startvärdet
  // streamern skrev in — det är en annan sak än att nolla sändningens framsteg.
  assert.equal(Number(r.baseline), 250, 'baseline nollställdes — startvärdet gick förlorat');
  assert.equal(Number(r.target), 5000, 'målet skrevs över');
  assert.equal(Number(r.progress), 0);
  assert.equal(Number(r.epoch), 4, 'epoch stegades inte — klienter kan inte se att en ny omgång börjat');
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

prov('G3 · krasch EFTER publicering men före published_at ger en ofarlig dubblett', async () => {
  const { sessioner, pool } = await rigg();
  await anslut(pool, WS_A);
  await sessioner.startaLive({ konto: KONTO, roomId: RUM_1 });
  // Skickad, men processen dog innan published_at hann skrivas.
  const skickade = [];
  await assert.rejects(() => sessioner.publiceraUtkorg({
    sand: async e => { skickade.push(e); throw Object.assign(new Error('krasch'), { efterSand: true }) } }));
  // Omstart: samma händelse skickas igen — at-least-once.
  await sessioner.publiceraUtkorg({ sand: async e => { skickade.push(e) } });
  assert.equal(skickade.length, 2, 'dubbletten uteblev — då är provet inte det scenario det påstår');
  assert.equal(skickade[0].event_id, skickade[1].event_id, 'event_id ändrades mellan försöken');
  // Konsumenten gör den ofarlig.
  assert.equal(await sessioner.tillampaEnGang({ workspaceId: WS_A, eventId: skickade[0].event_id }), true);
  assert.equal(await sessioner.tillampaEnGang({ workspaceId: WS_A, eventId: skickade[1].event_id }), false);
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

prov('H1 · live-händelsen bär sessionId genom cleanEvent', async () => {
  const { cleanEvent } = require('../event-bus.js');
  const ut = cleanEvent({ id: 'e1', type: 'gift', userId: 'u1', username: 'a',
    sessionId: '33333333-3333-4333-8333-333333333333' });
  assert.equal(ut.sessionId, '33333333-3333-4333-8333-333333333333',
    'cleanEvent släpper inte igenom sessionId — då kan ingen konsument veta vilken sändning '
    + 'ett event tillhör, vilket är hela poängen med modellen');
});

prov('H2 · sändningsbeskedet använder bussens egen ram, inte ett parallellt kontrakt', async () => {
  const { sseChunk } = require('../goal-sse.js');
  const ram = sseChunk({ typ: 'livesession', sessionId: '33333333-3333-4333-8333-333333333333',
    workspaceId: WS_A, roomId: RUM_1, startedAt: '2026-08-22T13:33:10.000Z', streamId: '1-0' }, null);
  assert.match(ram, /^id: 1-0\n/, 'ingen id:-rad — då kan Last-Event-ID inte spela upp beskedet');
  assert.match(ram, /\nevent: live\n/,
    'beskedet fick en egen event-typ i stället för bussens `live` — en ny typ kräver en ny '
    + 'lyssnare i varje klient, och de som inte uppdateras missar sändningsbytet tyst');
  const data = JSON.parse(ram.split('\ndata: ')[1]);
  assert.equal(data.type, 'livesession');
  assert.equal(data.sessionId, '33333333-3333-4333-8333-333333333333');
});

// ================================================================================================
// I · BRYGGKÖRNINGAR (generation + seq)
// `seq` ordnar bara INOM en körning. Generationen äger servern: en ny bryggprocess registrerar sig,
// blir aktuell generation för kontot, och allt från äldre körningar avvisas. Ingen UUID-sortering
// och ingen klientklocka — båda är oordnade eller opålitliga.
// ================================================================================================

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
  assert.equal(igen.workspaces.length, 1, 'det idempotenta svaret tappade fan-outen');
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
  assert.equal(igen.idempotent, true, 'svaret markerades inte som idempotent');
  assert.equal(igen.workspaces[0].created, false, 'en session skapades för det nya rummet');

  const alla = await pool.query(
    'SELECT room_id, ended_at FROM stream_sessions WHERE workspace_id=$1', [WS_A]);
  assert.equal(alla.rowCount, 1, 'en B-session skapades: ' + JSON.stringify(alla.rows));
  assert.equal(alla.rows[0].room_id, RUM_1);
  assert.equal(alla.rows[0].ended_at, null, 'A-sessionen stängdes av ett idempotent besked');
  const aktiv = await aktivSession(pool, WS_A);
  assert.equal(aktiv.room_id, RUM_1, 'pekaren flyttades av ett idempotent besked');
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

prov('R5 · en misslyckad sessionsinsert lämnar biljetten OANVÄND', async () => {
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
