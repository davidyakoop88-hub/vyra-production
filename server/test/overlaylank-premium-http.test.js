'use strict';
// HELA VÄGEN: en OBS-länk mot en arbetsyta vars abonnemang tagit slut.
//
// Regelproven i overlaylank-premium.test.js mäter `overlayPlan()`. Det räcker inte: ett grönt
// modulprov säger ingenting om RUTTEN, och det var just i rutten hålet satt — token kontrollerades,
// planen aldrig. Det här provet går över HTTP, mot en riktig databas, precis som OBS gör.
//
// Tre lägen, en rad i `subscriptions` skiljer dem åt:
//   aktiv          -> 200, overlayen levereras
//   uppsagd, kvar  -> 200, kunden har betalat för de dagarna
//   uppsagd, slut  -> 402, och inte 401: länken ÄR giltig, abonnemanget är slut
//
// BLOCKERAT utan TEST_DATABASE_URL. Körs i "Goal runtime · Postgres 18" — som har en EXPLICIT
// filnamnslista, så filen måste stå där för att köras alls.
const test = require('node:test'), assert = require('node:assert/strict');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false : 'BLOCKERAT: ingen isolerad Postgres. Sätt TEST_DATABASE_URL.';
const prov = (namn, fn) => test(`obs-länk: ${namn}`, { timeout: 30000, skip: BLOCKED }, fn);

if (!BLOCKED) process.env.DATABASE_URL = DB_URL;

let server = null, eventBus = null, pool = null, Billing = null, S = null, base = '';
const OWNER = 'cccccccc-0000-0000-0000-000000000001';
const WS = 'cccccccc-1111-0000-0000-000000000001';
const OVERLAY = 'cccccccc-2222-0000-0000-000000000001';
let RATOKEN = '';

test.before(async () => {
  if (BLOCKED) return;
  S = require('../security');
  Billing = require('../billing');
  ({ pool } = require('../db'));
  ({ server, eventBus } = require('../index'));

  await pool.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,$2,'x','obs-lank',now()) ON CONFLICT (id) DO NOTHING`,
    [OWNER, `${OWNER}@test.invalid`]);
  await pool.query(
    `INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'obs-lank',$2)
     ON CONFLICT (id) DO NOTHING`, [WS, OWNER]);
  await pool.query(
    `INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,'owner')
     ON CONFLICT (workspace_id,user_id) DO NOTHING`, [WS, OWNER]);
  await pool.query(
    `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$2,'obs-lank',$3)
     ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state`,
    [OVERLAY, WS, { widgets: [] }]);

  RATOKEN = S.token();
  await pool.query(
    `INSERT INTO overlay_access_tokens (overlay_id,token_hash,label,created_by)
     VALUES ($1,$2,'prov',$3)`,
    [OVERLAY, S.digest(RATOKEN), OWNER]);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (BLOCKED) return;
  await new Promise(resolve => {
    server.close(resolve);
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  });
  await eventBus.close().catch(() => {});
  await pool.query('DELETE FROM overlay_access_tokens WHERE overlay_id = $1', [OVERLAY]);
  await pool.query('DELETE FROM subscriptions WHERE workspace_id = $1', [WS]);
  await pool.end();
});

// Skriver abonnemangsraden och tömmer plancachen, precis som produktionskoden gör vid en ändring.
async function abonnemang({ status, cancel, slutar }) {
  if (!status) await pool.query('DELETE FROM subscriptions WHERE workspace_id=$1', [WS]);
  else await pool.query(
    `INSERT INTO subscriptions (workspace_id,provider,stripe_subscription_id,plan,status,current_period_end,cancel_at_period_end)
     VALUES ($1,'paypal',$2,'premium',$3,$4,$5)
     ON CONFLICT (workspace_id) DO UPDATE SET plan='premium',status=EXCLUDED.status,
       current_period_end=EXCLUDED.current_period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end`,
    [WS, `I-OBS-${WS}`, status, slutar, !!cancel]);
  Billing.glomOverlayPlan(WS);
}

const hamta = async (rest = '') => {
  const res = await fetch(`${base}/api/overlay-access/${RATOKEN}${rest ? '/' + rest : ''}`);
  const text = await res.text();
  let body = null; try { body = JSON.parse(text) } catch {}
  return { status: res.status, body };
};

prov('aktivt abonnemang: overlayen levereras', async () => {
  await abonnemang({ status: 'active', slutar: new Date(Date.now() + 86400000) });
  const svar = await hamta();
  assert.equal(svar.status, 200, JSON.stringify(svar.body));
  assert.equal(svar.body.overlay.id, OVERLAY);
});

prov('uppsagd men perioden kvar: overlayen levereras — de dagarna är betalda', async () => {
  await abonnemang({ status: 'active', cancel: true, slutar: new Date(Date.now() + 3600000) });
  assert.equal((await hamta()).status, 200);
});

prov('uppsagd och perioden slut: 402, inte 401', async () => {
  await abonnemang({ status: 'active', cancel: true, slutar: new Date(Date.now() - 1000) });
  const svar = await hamta();
  assert.equal(svar.status, 402,
    'en utgången kund behöll sin overlay i sändningen — det var precis hålet');
  assert.equal(svar.body.entitlementRequired, true);
});

prov('ingen prenumeration alls: 402', async () => {
  await abonnemang({});
  assert.equal((await hamta()).status, 402);
});

prov('grinden gäller ALLA delvägar, inte bara tillståndet', async () => {
  await abonnemang({ status: 'active', cancel: true, slutar: new Date(Date.now() - 1000) });
  for (const rest of ['', 'goals', 'events/stream']) {
    const svar = await hamta(rest);
    assert.equal(svar.status, 402, `${rest || '(roten)'} släppte igenom en utgången kund`);
  }
});

prov('en ogiltig token är fortfarande 401 — de två felen ska gå att skilja åt', async () => {
  await abonnemang({ status: 'active', slutar: new Date(Date.now() + 86400000) });
  const res = await fetch(`${base}/api/overlay-access/${S.token()}`);
  assert.equal(res.status, 401);
});
