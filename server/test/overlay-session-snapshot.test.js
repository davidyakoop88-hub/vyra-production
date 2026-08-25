'use strict';
// UPPSTARTSLUCKAN — det auktoritativa sessionssnapshotet i overlayns bootstrapsvar.
//
// PROBLEMET, uppmatt: `live:start` ar en HANDELSE. En OBS-kalla som oppnas mitt i en sandning har
// missat den, och den kommer aldrig igen — vare sig via replay (SSE-replayen kraver ett
// Last-Event-ID kallan aldrig haft) eller via nagon annan rutt. Utan ett snapshot star en nyoppnad
// kalla darfor kvar i "ingen sandning" tills nasta sandning borjar.
//
// LOSNINGEN: `GET /api/overlay-access/<token>` — samma enda konfigurationskalla klienten redan
// hamtar fran vid start och vid varje ateranslutning — bar ett `session`-falt.
//
// FLAGGMEDVETET (Davids punkt 2). Tre lagen, inte tva:
//   faltet SAKNAS         funktionen ar av        (byteidentiskt svar med dagens, ingen fraga kord)
//   session: null         funktionen ar pa, ingen LIVE pagar   (auktoritativt)
//   session: {...}        funktionen ar pa, den har sandningen pagar
// En dormant klient kan darmed skilja "av" fran "pa men tyst" — och en klient som far `null` vet
// att det ar ett SVAR, inte en avsaknad.
//
// MINIMALT INNEHALL: sessionId och startedAt, aldrig workspaceId, accountKey, bridgeRunId, roomId
// eller nagon token. En OBS-lank ar en publik URL som star oppen i en sandning; allt som ligger i
// svaret ar allt en tittare kan lasa ur den.
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Bootstrapsvaret gar inte att prova mot en attrapp.';
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;
// FORE require('../index'): flaggan osatt, precis som produktionen ser ut i dag. Rutten laser
// flaggan per anrop, sa bada lagen provas i samma process — men uppstarten sker med den av.
delete process.env.VYRA_SANDNINGSIDENTITET;

let S, pool, server, base, sessioner;

const OWNER = 'dddddddd-0000-4000-8000-000000000001';
const WS = 'dddddddd-1111-4000-8000-000000000001';
const OVERLAY = 'dddddddd-2222-4000-8000-000000000001';
const KONTO = 'snapshotprov';
// ETT NYTT RUM PER START. Ett rum som redan avslutats slapps inte in igen utan en administrativ
// aterppningsbiljett (stream_room_reopen) — det ar sessionsmodellens egen regel, och riggen ska
// prova snapshotet, inte den. Uppmatt: aterbruk av samma rum gav noll ny session och ett
// snapshot som last null mitt i en "pagaende" sandning.
let rumRaknare = 0;
const nyttRum = () => '761000000000000' + String(++rumRaknare).padStart(4, '0');
let sisteRum = null;
let sisteKorning = null;
let rawToken = null;

const prov = (namn, fn) => test('snapshot: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

// Dagens svarsform, ordagrant ur index.js innan den har andringen: exakt de har nycklarna, varken
// fler eller farre. Provet nedan jamfor mot listan i stallet for att bara leta efter `session` —
// ett falt som SMYGER med nar flaggan ar av ar precis lika allvarligt.
const DAGENS_NYCKLAR = ['ok', 'overlay'];
const OVERLAY_NYCKLAR = ['id', 'name', 'state', 'version', 'updated_at'];

async function hamta() {
  const res = await fetch(`${base}/api/overlay-access/${rawToken}`);
  return { status: res.status, body: await res.json() };
}

// Ingen sessionsfraga far kora med flaggan av. Det bevisas genom att RAKNA fragorna, inte genom
// att titta pa svaret: ett falt som utelamnas efter att fragan redan kort ar fortfarande en extra
// databastur per OBS-kalla vid varje ateranslutning.
function sondera() {
  const original = pool.query.bind(pool);
  const sedda = [];
  pool.query = (text, ...rest) => {
    sedda.push(typeof text === 'string' ? text : (text && text.text) || '');
    return original(text, ...rest);
  };
  return { sedda, aterstall: () => { pool.query = original } };
}

test.before(async () => {
  if (BLOCKED) return;
  S = require('../security');
  ({ pool } = require('../db'));
  ({ server } = require('../index'));
  const { skapaStreamSessions } = require('../stream-sessions.js');
  sessioner = skapaStreamSessions({ pool });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  await pool.query(
    "INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,'x','Snapshotagare') "
    + 'ON CONFLICT (id) DO NOTHING', [OWNER, OWNER + '@t.invalid']);
  await pool.query("INSERT INTO workspaces(id,name,owner_user_id) VALUES($1,'snapshotprov',$2) "
    + 'ON CONFLICT (id) DO NOTHING', [WS, OWNER]);
  await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner') "
    + 'ON CONFLICT (workspace_id,user_id) DO NOTHING', [WS, OWNER]);
  await pool.query("INSERT INTO overlays(id,workspace_id,name,state,version) "
    + "VALUES($1,$2,'Snapshot','{\"widgets\":[]}'::jsonb,7) ON CONFLICT (id) DO NOTHING",
    [OVERLAY, WS]);
  rawToken = S.token();
  await pool.query('INSERT INTO overlay_access_tokens(overlay_id,token_hash,label,created_by) '
    + "VALUES($1,$2,'snapshotprov',$3) ON CONFLICT (token_hash) DO NOTHING",
    [OVERLAY, S.digest(rawToken), OWNER]);
  await pool.query("INSERT INTO bridge_accounts(account_key) VALUES($1) ON CONFLICT DO NOTHING",
    [KONTO]);
  await pool.query("INSERT INTO tiktok_connections(workspace_id,tiktok_username,active) "
    + 'VALUES($1,$2,true) ON CONFLICT (workspace_id) DO UPDATE SET tiktok_username=EXCLUDED.tiktok_username,active=true',
    [WS, KONTO]);
});

test.after(async () => {
  if (BLOCKED) return;
  delete process.env.VYRA_SANDNINGSIDENTITET;
  await new Promise(resolve => {
    server.close(resolve);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  const { eventBus } = require('../index');
  if (eventBus) await eventBus.close().catch(() => {});
  await pool.query('DELETE FROM stream_event_outbox WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM stream_session_pointer WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id=$1', [WS]);
  await pool.query('DELETE FROM bridge_runs WHERE account_key=$1', [KONTO]);
  await pool.end();
});

async function nollstallSessioner() {
  await pool.query('UPDATE stream_session_pointer SET session_id=NULL WHERE workspace_id=$1', [WS]);
  await pool.query("UPDATE stream_sessions SET ended_at=now(), end_reason='manuell' "
    + 'WHERE workspace_id=$1 AND ended_at IS NULL', [WS]);
}

async function startaLive() {
  const bridgeRunId = crypto.randomUUID();
  await sessioner.registreraKorning({ konto: KONTO, bridgeRunId });
  sisteRum = nyttRum();
  const ut = await sessioner.startaLive({ konto: KONTO, roomId: sisteRum, bridgeRunId, seq: 1 });
  assert.equal(ut.stale, false, 'riggens startbesked avvisades');
  // Samma korning och nasta seq maste tillbaka till anroparen: ett end fran en OREGISTRERAD
  // korning avvisas som 'okand-korning', och riggen hade da provat ett avslut som aldrig skedde.
  sisteKorning = bridgeRunId;
  return ut;
}

prov('flaggan av: svaret ar byteidentiskt med dagens och ingen sessionsfraga kors', async () => {
  delete process.env.VYRA_SANDNINGSIDENTITET;
  await nollstallSessioner();
  const sond = sondera();
  let svar;
  try { svar = await hamta() } finally { sond.aterstall() }
  assert.equal(svar.status, 200);
  assert.deepEqual(Object.keys(svar.body).sort(), [...DAGENS_NYCKLAR].sort(),
    'bootstrapsvaret bar ett falt som inte fanns fore andringen');
  assert.equal('session' in svar.body, false, 'session-faltet lackte med flaggan av');
  assert.deepEqual(Object.keys(svar.body.overlay).sort(), [...OVERLAY_NYCKLAR].sort());
  const sessionsfragor = sond.sedda.filter(q => /stream_session/.test(q));
  assert.deepEqual(sessionsfragor, [], 'en sessionsfraga kordes trots att flaggan var av');
});

prov('flaggan av med en PAGAENDE sandning: faltet saknas anda', async () => {
  process.env.VYRA_SANDNINGSIDENTITET = '1';
  await nollstallSessioner();
  await startaLive();
  delete process.env.VYRA_SANDNINGSIDENTITET;              // sandningen pagar, funktionen ar av
  const svar = await hamta();
  assert.equal('session' in svar.body, false,
    'en pagaende sandning lackte ut genom bootstrapsvaret med flaggan av');
});

prov('flaggan pa utan aktiv sandning: session ar null — auktoritativt, inte frånvarande', async () => {
  process.env.VYRA_SANDNINGSIDENTITET = '1';
  await nollstallSessioner();
  const svar = await hamta();
  assert.equal(svar.status, 200);
  assert.equal('session' in svar.body, true, 'faltet saknades med flaggan pa');
  assert.equal(svar.body.session, null);
});

prov('flaggan pa med aktiv sandning: exakt sessionId och startedAt, ingenting mer', async () => {
  process.env.VYRA_SANDNINGSIDENTITET = '1';
  await nollstallSessioner();
  const start = await startaLive();
  const svar = await hamta();
  assert.deepEqual(Object.keys(svar.body.session).sort(), ['sessionId', 'startedAt']);
  const rad = (await pool.query(
    'SELECT id, started_at FROM stream_sessions WHERE workspace_id=$1 AND ended_at IS NULL', [WS])).rows[0];
  assert.equal(svar.body.session.sessionId, rad.id, 'snapshotet pekade pa fel session');
  assert.equal(svar.body.session.startedAt, new Date(rad.started_at).toISOString());
  // Klienten bygger sitt syntetiska eventId ur sessionId. Blir det inte identiskt med ramens
  // eventId gar snapshotet FORBI dedupen och sandningen behandlas tva ganger.
  const utkorg = (await pool.query(
    "SELECT event_id FROM stream_event_outbox WHERE workspace_id=$1 AND topic='live:start' "
    + 'ORDER BY created_at DESC LIMIT 1', [WS])).rows[0];
  assert.equal(utkorg.event_id, 'live:start:' + svar.body.session.sessionId);
  assert.ok(start);
});

prov('inga hemligheter i snapshotet — svaret innehaller varken konto, rum eller korning', async () => {
  process.env.VYRA_SANDNINGSIDENTITET = '1';
  await nollstallSessioner();
  await startaLive();
  const svar = await hamta();
  const text = JSON.stringify(svar.body);
  for (const hemlighet of [KONTO, sisteRum, WS, rawToken]) {
    assert.equal(text.includes(hemlighet), false, 'bootstrapsvaret bar ' + hemlighet.slice(0, 8));
  }
});

prov('efter avslutad sandning ar session null igen', async () => {
  process.env.VYRA_SANDNINGSIDENTITET = '1';
  await nollstallSessioner();
  await startaLive();
  assert.ok((await hamta()).body.session, 'sandningen syntes inte ens medan den pagick');
  const slut = await sessioner.avslutaLiveFranBrygga({ tiktokUsername: KONTO, roomId: sisteRum,
    bridgeRunId: sisteKorning, seq: 2 });
  assert.equal(slut.stale, false, 'riggens slutbesked avvisades: ' + JSON.stringify(slut));
  assert.equal((await hamta()).body.session, null, 'en avslutad sandning last fortfarande som aktiv');
});

prov('en sparrad lank far inget snapshot — 401 far inte bli en sessionsoraklet', async () => {
  process.env.VYRA_SANDNINGSIDENTITET = '1';
  await nollstallSessioner();
  await startaLive();
  const res = await fetch(`${base}/api/overlay-access/${'z'.repeat(48)}`);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal('session' in body, false);
});
