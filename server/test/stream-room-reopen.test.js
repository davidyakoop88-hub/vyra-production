'use strict';
// ADMINISTRATIV ÅTERÖPPNING AV ETT STÄNGT RUM — rutten, transaktionen och workspacelåset.
//
// Rummet är FAIL-CLOSED: ett stängt room_id öppnas aldrig automatiskt (J1). Den enda vägen tillbaka
// är en biljett som en inloggad owner/admin utfärdar här — och biljetten öppnar inte rummet själv,
// den konsumeras först av nästa giltiga, nyare startbesked (R3/R4/R6 äger den logiken).
//
// HUSETS SKYDD, uppmätta i server/index.js och ÄRVDA av rutten — inte återuppfunna:
//   · global sameOrigin-spärr (rad 238): främmande Origin ger 403 'Origin nekad' före allt annat
//   · gemensam sessionsrad (rad 287): session(req,{csrf:req.method!=='GET'}) — en POST utan giltig
//     x-vyra-csrf får null-session och därmed 401 'Inte inloggad'. DET är husets CSRF-kontrakt:
//     fel/saknad token är omöjlig att skilja från utloggad, med flit.
const test = require('node:test'), assert = require('node:assert/strict');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Rutten, transaktionen och låsbeviset går inte att prova '
    + 'mot en attrapp.';
if (!BLOCKED) process.env.DATABASE_URL = DB_URL;
// Sätts FÖRE require('../index'): ORIGIN läses vid laddning, och proven behöver ett känt värde
// för att kunna skicka både rätt och fel Origin.
process.env.APP_ORIGIN = 'http://vyra-prov.local';
process.env.VYRA_SANDNINGSIDENTITET = '1';

let S, pool, server, base, sessioner;

const OWNER = 'cccccccc-0000-4000-8000-000000000001';
const ADMIN = 'cccccccc-0000-4000-8000-000000000002';
const VIEWER = 'cccccccc-0000-4000-8000-000000000003';
const OUTSIDER = 'cccccccc-0000-4000-8000-000000000004';
const WS1 = 'cccccccc-1111-4000-8000-000000000001';
const WS2 = 'cccccccc-1111-4000-8000-000000000002';
const KONTO = 'reopenprov';
const auth = {};

const prov = (namn, fn) => test('reopen: ' + namn, { timeout: 30000, skip: BLOCKED }, fn);

async function makeSession(userId) {
  const raw = S.token(), csrf = S.token();
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, mfa_verified_at)
     VALUES ($1,$2,$3,now() + interval '1 hour', now())`,
    [userId, S.digest(raw), S.digest(csrf)]);
  return { cookie: `vyra_session=${raw}`, csrf };
}

let rumNr = 100;
const nyttRum = () => String(700000000000000000 + (rumNr++));

// Ett stängt rum i historiken — förutsättningen för att en biljett alls ska kunna utfärdas.
async function stangtRum(ws = WS1) {
  const rum = nyttRum();
  await pool.query(
    "INSERT INTO stream_sessions(workspace_id,room_id,account_key,ended_at,end_reason) "
    + "VALUES($1,$2,$3,now(),'bridge')", [ws, rum, KONTO]);
  return rum;
}

async function call(method, path, { as = null, body = null, csrf, origin, headers = {} } = {}) {
  const who = as ? auth[as] : null;
  const token = who ? (csrf === undefined ? who.csrf : csrf) : null;
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(who ? { cookie: who.cookie } : {}),
      ...(token ? { 'x-vyra-csrf': token } : {}),
      ...(origin ? { origin } : {}),
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const biljetter = (rum) => pool.query(
  'SELECT actor_user_id, reason, consumed_at FROM stream_room_reopen WHERE workspace_id=$1 AND room_id=$2',
  [WS1, rum]).then(r => r.rows);
const auditRader = (rum) => pool.query(
  "SELECT actor_user_id, metadata FROM audit_log WHERE action='stream_room_reopened' "
  + "AND workspace_id=$1 AND metadata->>'roomId'=$2", [WS1, rum]).then(r => r.rows);

test.before(async () => {
  if (BLOCKED) return;
  S = require('../security');
  ({ pool } = require('../db'));
  ({ server } = require('../index'));
  ({ skapaStreamSessions: (f => { sessioner = f({ pool }); }) })
    .skapaStreamSessions(require('../stream-sessions').skapaStreamSessions);

  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at) VALUES
       ($1,$5,'x','ro-owner',now()),($2,$6,'x','ro-admin',now()),
       ($3,$7,'x','ro-viewer',now()),($4,$8,'x','ro-out',now())
     ON CONFLICT (id) DO NOTHING`,
    [OWNER, ADMIN, VIEWER, OUTSIDER,
     OWNER + '@t.invalid', ADMIN + '@t.invalid', VIEWER + '@t.invalid', OUTSIDER + '@t.invalid']);
  await pool.query(
    `INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'ro-1',$3),($2,'ro-2',$4)
     ON CONFLICT (id) DO NOTHING`, [WS1, WS2, OWNER, OUTSIDER]);
  await pool.query(
    `INSERT INTO workspace_members (workspace_id,user_id,role) VALUES
       ($1,$2,'owner'),($1,$3,'admin'),($1,$4,'viewer'),($5,$6,'owner')
     ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role`,
    [WS1, OWNER, ADMIN, VIEWER, WS2, OUTSIDER]);
  await pool.query('INSERT INTO bridge_accounts(account_key) VALUES($1) ON CONFLICT DO NOTHING', [KONTO]);
  await pool.query(
    'INSERT INTO tiktok_connections(workspace_id,tiktok_username,active) VALUES($1,$2,true) '
    + 'ON CONFLICT (workspace_id) DO UPDATE SET tiktok_username=EXCLUDED.tiktok_username,active=true',
    [WS1, KONTO]);
  for (const t of ['stream_room_reopen', 'stream_event_outbox', 'stream_session_pointer']) {
    await pool.query(`DELETE FROM ${t} WHERE workspace_id = ANY($1::uuid[])`, [[WS1, WS2]]);
  }
  await pool.query('DELETE FROM stream_session_reset WHERE session_id IN '
    + '(SELECT id FROM stream_sessions WHERE workspace_id = ANY($1::uuid[]))', [[WS1, WS2]]);
  await pool.query('DELETE FROM stream_sessions WHERE workspace_id = ANY($1::uuid[])', [[WS1, WS2]]);
  await pool.query("DELETE FROM audit_log WHERE action='stream_room_reopened'");

  auth.owner = await makeSession(OWNER);
  auth.admin = await makeSession(ADMIN);
  auth.viewer = await makeSession(VIEWER);
  auth.outsider = await makeSession(OUTSIDER);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (BLOCKED) return;
  // HELA goal-api-monstret, inte halva. server.close() ensamt racker inte: poolen och eventBus
  // haller nodeprocessen vid liv, och steget hanger tills jobbet timear ut. Uppmatt 2026-08-24:
  // 90 minuter lasta pa exakt det - andra gangen samma resursklass (Redis-prenumeranterna var
  // forsta). Regeln: den som harmar en rigg harmar aven dess stadning.
  await new Promise(resolve => {
    server.close(resolve);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  const { eventBus } = require('../index');
  if (eventBus) await eventBus.close().catch(() => {});
  await pool.query('DELETE FROM sessions WHERE user_id = ANY($1::uuid[])',
    [[OWNER, ADMIN, VIEWER, OUTSIDER]]);
  await pool.end();
});

const vagen = (rum, ws = WS1) => `/api/workspaces/${ws}/stream-rooms/${rum}/reopen`;

// ---- Säkerhet -----------------------------------------------------------------------------------

prov('oinloggad får 401', async () => {
  const rum = await stangtRum();
  const r = await call('POST', vagen(rum), { body: { reason: 'prov' } });
  assert.equal(r.status, 401);
  assert.equal((await biljetter(rum)).length, 0);
});

prov('viewer och utomstående får SAMMA 403 — inget avslöjar om workspacet finns', async () => {
  const rum = await stangtRum();
  const medlem = await call('POST', vagen(rum), { as: 'viewer', body: { reason: 'prov' } });
  const utanfor = await call('POST', vagen(rum), { as: 'outsider', body: { reason: 'prov' } });
  assert.equal(medlem.status, 403);
  assert.equal(utanfor.status, 403);
  // Identiska svar: en utomstående kan inte skilja "finns men inte min" från "fel roll" — och
  // därmed inte enumerera workspacets rum.
  assert.deepEqual(utanfor.body, medlem.body,
    'svaren skiljer sig: ' + JSON.stringify([medlem.body, utanfor.body]));
  assert.equal((await biljetter(rum)).length, 0);
});

prov('främmande Origin nekas INNAN någonting skrivs', async () => {
  const rum = await stangtRum();
  const r = await call('POST', vagen(rum), { as: 'owner', body: { reason: 'prov' },
    origin: 'https://ond.example' });
  assert.equal(r.status, 403);
  assert.match(String(r.body && r.body.error), /Origin/i);
  assert.equal((await biljetter(rum)).length, 0, 'en biljett skrevs trots främmande Origin');
  assert.equal((await auditRader(rum)).length, 0);
});

prov('utan CSRF-token nekas enligt husets kontrakt', async () => {
  const rum = await stangtRum();
  // Husets kontrakt: session(req,{csrf:true}) returnerar null utan giltig x-vyra-csrf, så svaret
  // är 401 'Inte inloggad' — avsiktligt omöjligt att skilja från utloggad.
  const utan = await call('POST', vagen(rum), { as: 'owner', body: { reason: 'prov' }, csrf: null });
  const fel_ = await call('POST', vagen(rum), { as: 'owner', body: { reason: 'prov' }, csrf: 'fel-token' });
  assert.equal(utan.status, 401);
  assert.equal(fel_.status, 401);
  assert.equal((await biljetter(rum)).length, 0);
});

prov('korrekt same-origin-anrop från owner fungerar — och klientens aktör ignoreras', async () => {
  const rum = await stangtRum();
  const r = await call('POST', vagen(rum), { as: 'owner', origin: 'http://vyra-prov.local',
    // Klienten försöker peka ut någon annan som aktör. Fältet ska aldrig läsas.
    body: { reason: 'återöppning efter TikTok-återbruk', actor_user_id: VIEWER, actorUserId: VIEWER } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const b = await biljetter(rum);
  assert.equal(b.length, 1);
  assert.equal(b[0].actor_user_id, OWNER, 'aktören kom från bodyn i stället för sessionen');
  assert.equal(b[0].reason, 'återöppning efter TikTok-återbruk');
  const a = await auditRader(rum);
  assert.equal(a.length, 1, 'ingen auditrad skrevs');
  assert.equal(a[0].actor_user_id, OWNER);
  assert.equal(a[0].metadata.reason, 'återöppning efter TikTok-återbruk');
});

prov('admin-rollen får också utfärda', async () => {
  const rum = await stangtRum();
  const r = await call('POST', vagen(rum), { as: 'admin', body: { reason: 'prov' } });
  assert.equal(r.status, 201);
  assert.equal((await biljetter(rum))[0].actor_user_id, ADMIN);
});

prov('flagga av ger 503 och NOLL rader', async () => {
  const rum = await stangtRum();
  process.env.VYRA_SANDNINGSIDENTITET = '0';
  try {
    const r = await call('POST', vagen(rum), { as: 'owner', body: { reason: 'prov' } });
    assert.equal(r.status, 503);
  } finally {
    process.env.VYRA_SANDNINGSIDENTITET = '1';
  }
  assert.equal((await biljetter(rum)).length, 0);
  assert.equal((await auditRader(rum)).length, 0);
});

prov('ogiltig reason och ogiltigt roomId ger 400 utan skrivning', async () => {
  const rum = await stangtRum();
  for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(201) }]) {
    const r = await call('POST', vagen(rum), { as: 'owner', body });
    assert.equal(r.status, 400, 'reason ' + JSON.stringify(body) + ' gav ' + r.status);
  }
  for (const daligt of ['abc123', '1'.repeat(33), '12 34']) {
    const r = await call('POST', vagen(encodeURIComponent(daligt)), { as: 'owner', body: { reason: 'prov' } });
    assert.equal(r.status, 400, 'roomId ' + daligt + ' gav ' + r.status);
  }
  assert.equal((await biljetter(rum)).length, 0);
});

// ---- Tillstånd ----------------------------------------------------------------------------------

prov('aktivt rum ger 409, aldrig stängt rum ger 404', async () => {
  const aktivt = nyttRum();
  await pool.query('INSERT INTO stream_sessions(workspace_id,room_id,account_key) VALUES($1,$2,$3)',
    [WS1, aktivt, KONTO]);
  const r1 = await call('POST', vagen(aktivt), { as: 'owner', body: { reason: 'prov' } });
  assert.equal(r1.status, 409, 'ett AKTIVT rum fick en biljett');
  const r2 = await call('POST', vagen(nyttRum()), { as: 'owner', body: { reason: 'prov' } });
  assert.equal(r2.status, 404, 'ett rum utan stängd historik fick en biljett');
});

prov('en obrukad biljett blockerar en andra — och två SAMTIDIGA ger exakt en', async () => {
  const rum = await stangtRum();
  const [a, b] = await Promise.allSettled([
    sessioner.tillatRumIgen({ workspaceId: WS1, roomId: rum, actorUserId: OWNER, skal: 'first' }),
    sessioner.tillatRumIgen({ workspaceId: WS1, roomId: rum, actorUserId: ADMIN, skal: 'second' }),
  ]);
  const lyckade = [a, b].filter(x => x.status === 'fulfilled');
  const nekade = [a, b].filter(x => x.status === 'rejected');
  assert.equal(lyckade.length, 1, 'båda samtidiga utfärdandena lyckades');
  assert.equal(nekade.length, 1);
  assert.equal(nekade[0].reason.status, 409, 'den andra föll inte med 409: ' + nekade[0].reason.message);
  assert.equal((await biljetter(rum)).length, 1, 'fel antal biljetter efter kapplöpningen');
  // Och sekventiellt: en tredje nekas också.
  const tredje = await call('POST', vagen(rum), { as: 'owner', body: { reason: 'prov' } });
  assert.equal(tredje.status, 409);
});

prov('en roll som återkallats FÖRE skrivningen stoppas av transaktionens egen kontroll', async () => {
  const rum = await stangtRum();
  // Ruttens yttre membership() kan ha svarat ja en gång — men behörigheten ska vara sann NÄR
  // skrivningen sker. Modulen ÄR den andra kontrollen: den läser workspace_members på samma
  // client som skriver, efter workspacelåset. Här anropas den direkt med en aktör vars roll just
  // tagits bort — motsvarande att rollen återkallades mellan ruttens kontroll och transaktionen.
  await pool.query("INSERT INTO users(id,email,password_hash,display_name) "
    + "VALUES($1,$2,'x','ro-fd') ON CONFLICT (id) DO NOTHING",
    ['cccccccc-0000-4000-8000-00000000000f', 'ro-fd@t.invalid']);
  const FD = 'cccccccc-0000-4000-8000-00000000000f';
  await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'admin') "
    + 'ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role', [WS1, FD]);
  await pool.query('DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [WS1, FD]);
  await assert.rejects(
    () => sessioner.tillatRumIgen({ workspaceId: WS1, roomId: rum, actorUserId: FD, skal: 'prov' }),
    e => e.status === 403,
    'en återkallad roll fick skriva');
  assert.equal((await biljetter(rum)).length, 0);
  assert.equal((await auditRader(rum)).length, 0);
});

// ---- Atomicitet ---------------------------------------------------------------------------------

const RB_FN = 'prov_reopen_rollback_fn', RB_TRG = 'prov_reopen_rollback_trg';

prov('faller auditinserten rullas biljetten tillbaka', async () => {
  const rum = await stangtRum();
  try {
    // Villkorad på BÅDE action och det här provets rum, så inga andra auditrader träffas.
    await pool.query(
      'CREATE OR REPLACE FUNCTION ' + RB_FN + '() RETURNS trigger AS $fn$ BEGIN '
      + "  IF NEW.action = 'stream_room_reopened' AND NEW.metadata->>'roomId' = '" + rum + "' THEN "
      + "    RAISE EXCEPTION 'provtrigger stoppar just den har ateroppningen'; "
      + '  END IF; RETURN NEW; END; $fn$ LANGUAGE plpgsql');
    await pool.query('CREATE TRIGGER ' + RB_TRG + ' BEFORE INSERT ON audit_log '
      + 'FOR EACH ROW EXECUTE FUNCTION ' + RB_FN + '()');
    await assert.rejects(
      () => sessioner.tillatRumIgen({ workspaceId: WS1, roomId: rum, actorUserId: OWNER, skal: 'prov' }),
      e => /provtrigger stoppar/.test(String(e.message)));
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS ' + RB_TRG + ' ON audit_log');
    await pool.query('DROP FUNCTION IF EXISTS ' + RB_FN + '()');
  }
  const kvar = await pool.query(
    'SELECT (SELECT count(*) FROM pg_trigger WHERE tgname=$1)::int AS trg, '
    + '(SELECT count(*) FROM pg_proc WHERE proname=$2)::int AS fn', [RB_TRG, RB_FN]);
  assert.equal(kvar.rows[0].trg, 0, 'triggern ligger kvar');
  assert.equal(kvar.rows[0].fn, 0, 'triggerfunktionen ligger kvar');
  assert.equal((await biljetter(rum)).length, 0, 'biljetten överlevde den misslyckade auditinserten');
  // Kontrollmätning: samma flöde utan triggern måste ge exakt en biljett och en auditrad.
  const ok = await sessioner.tillatRumIgen({ workspaceId: WS1, roomId: rum, actorUserId: OWNER, skal: 'prov' });
  assert.equal(ok.created, true);
  assert.equal((await biljetter(rum)).length, 1);
  assert.equal((await auditRader(rum)).length, 1);
});

// ---- Workspacelåset — den uppskjutna bevakningspunkten löses in ----------------------------------

prov('startbeskedet BLOCKERAR på workspacelåset tills adminbiljetten committats', async () => {
  const rum = await stangtRum();
  // Admintransaktionen, manuellt uppspelad så att commit kan HÅLLAS. Samma satser som
  // tillatRumIgen kör — modulens eget beteende är bevisat ovan; det här provet handlar om låset.
  const admin = await pool.connect();
  let startP = null;
  try {
    await admin.query('BEGIN');
    const pid = Number((await admin.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await admin.query('SELECT id FROM workspaces WHERE id=$1 FOR NO KEY UPDATE', [WS1]);
    await admin.query(
      'INSERT INTO stream_room_reopen(workspace_id,room_id,actor_user_id,reason) VALUES($1,$2,$3,$4)',
      [WS1, rum, OWNER, 'lasprov']);

    // Startbeskedet för samma stängda rum. Med workspacelåset på plats ska det BLOCKERA — inte
    // läsa förbi den ocommittade biljetten, se 'stangt-rum' och ge upp.
    startP = sessioner.startaLive({ konto: KONTO, roomId: rum })
      .then(r => ({ klar: true, r }), e => ({ klar: true, fel: e }));

    // DETERMINISTISKT BEVIS VIA POSTGRES, inte via en tidsgräns: pg_blocking_pids säger vem som
    // faktiskt väntar på admintransaktionen. Loopen är bara en felvakt — beviset är radträffen.
    // Racet mot startP avslöjar mutationen: utan låset BLIR starten klar i stället för att synas
    // som blockerad, och då faller provet på 'blockerade inte'.
    let blockerad = null;
    for (let i = 0; i < 300 && !blockerad; i++) {
      const hann = await Promise.race([startP, new Promise(r => setTimeout(() => r(null), 100))]);
      if (hann && hann.klar) {
        assert.fail('starten blockerade INTE på workspacelåset — den läste förbi den ocommittade '
          + 'biljetten: ' + JSON.stringify(hann.r && hann.r.workspaces));
      }
      const q = await pool.query(
        'SELECT pid FROM pg_stat_activity WHERE pg_blocking_pids(pid) @> ARRAY[$1::int]', [pid]);
      if (q.rowCount) blockerad = Number(q.rows[0].pid);
    }
    assert.ok(blockerad, 'ingen backend blockerades av admintransaktionen');
    await admin.query('COMMIT');
  } catch (e) {
    try { await admin.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    admin.release();
  }

  // Efter commit ska starten se biljetten, konsumera den och öppna rummet.
  const slut = await startP;
  assert.ok(!slut.fel, 'starten föll efter commit: ' + (slut.fel && slut.fel.message));
  const w = slut.r.workspaces.find(x => x.workspaceId === WS1);
  assert.equal(w.created, true, 'rummet öppnades inte: ' + JSON.stringify(w));
  assert.equal(w.biljettAnvand, true, 'biljetten konsumerades inte');
  const b = await biljetter(rum);
  assert.equal(b.length, 1);
  assert.ok(b[0].consumed_at, 'biljetten står obrukad trots att rummet öppnades');
});
