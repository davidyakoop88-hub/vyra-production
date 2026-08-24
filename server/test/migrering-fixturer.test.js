'use strict';
// MIGRERINGEN MOT EN DATABAS MED BEFINTLIG AFFÄRSDATA — mätt, inte antagen.
//
// Jobbet bevisar redan tom-databas-fallet ("Migration från tom databas" + "Migrationen är
// idempotent"). Den här filen bevisar det farligare fallet: schema.sql körs MOT EN DATABAS SOM
// REDAN HAR workspace-, overlay-, goal- och tokenrader, två gånger, och ingen befintlig rad
// ändras. Provet körs i en EGEN databas (CREATE DATABASE) så att jobbets delade databas — som
// andra provfiler räknar globalt i — aldrig berörs.
//
// Schemat innehåller med flit en idempotent backfill (goal_runtime ur overlays.state) och ett
// dokumenterat indexbyte (DROP INDEX ... ; CREATE INDEX ... brin). Därför är kontraktet inte
// "schemat skriver aldrig" utan det David faktiskt kräver: BEFINTLIGA affärsrader är byteidentiska
// efteråt, och den ANDRA körningen ändrar ingenting alls. Fixturerna är riggade så att backfillen
// verkligen triggas: w1 HAR redan en runtime-rad (får inte skrivas över), w2 saknar en (får läggas
// till — additivt — i körning 3, och ingenting i körning 4).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const BLOCKED = DB_URL ? false
  : 'BLOCKERAT: ingen isolerad Postgres. Migreringsbeteende går inte att prova mot en attrapp.';

const { Client } = require('pg');
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
const PROVDB = 'vyra_migreringsfixtur';

const USER = 'ffffffff-0000-4000-8000-000000000001';
const WS = 'ffffffff-1111-4000-8000-000000000001';
const OVERLAY = 'ffffffff-2222-4000-8000-000000000001';

// Affärstabellerna som fixturerna bor i. Radtext sorterad i SQL — deterministiskt utan att provet
// behöver känna varje tabells nyckel.
const TABELLER = ['users', 'workspaces', 'workspace_members', 'overlays',
  'overlay_access_tokens', 'goal_runtime', 'tiktok_connections'];

let admin, db;

const prov = (namn, fn) => test('migrering-fixturer: ' + namn, { timeout: 60000, skip: BLOCKED }, fn);

async function rader(tab) {
  const r = await db.query(`SELECT t::text AS rad FROM ${tab} t ORDER BY t::text`);
  return r.rows.map(x => x.rad);
}
async function nulage() {
  const ut = {};
  for (const tab of TABELLER) ut[tab] = await rader(tab);
  return ut;
}

test.before(async () => {
  if (BLOCKED) return;
  admin = new Client({ connectionString: DB_URL });
  await admin.connect();
  // WITH (FORCE) kräver PG13+; jobbet kör 18 och bekräftar majorversionen i ett eget steg.
  await admin.query(`DROP DATABASE IF EXISTS ${PROVDB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${PROVDB}`);
  const url = new URL(DB_URL);
  url.pathname = '/' + PROVDB;
  db = new Client({ connectionString: url.href });
  await db.connect();
});

test.after(async () => {
  if (BLOCKED) return;
  if (db) await db.end().catch(() => {});
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${PROVDB} WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
  }
});

prov('körning 1 och 2 mot en tom databas lyckas och ger samma tabellmängd', async () => {
  await db.query(SCHEMA);
  const forsta = await db.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
  await db.query(SCHEMA);
  const andra = await db.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
  assert.ok(forsta.rows[0].n > 20, 'schemat skapade för få tabeller: ' + forsta.rows[0].n);
  assert.equal(andra.rows[0].n, forsta.rows[0].n, 'andra körningen ändrade tabellmängden');
});

prov('körning 3 mot fixturer: varje befintlig affärsrad är byteidentisk efteråt', async () => {
  // Fixturer: workspace, overlay (med två goalwidgetar i state), OBS-token, goal-rad, koppling.
  await db.query(
    `INSERT INTO users (id,email,password_hash,display_name,email_verified_at)
     VALUES ($1,'fixtur@t.invalid','x','fixtur',now())`, [USER]);
  await db.query(
    `INSERT INTO workspaces (id,name,owner_user_id) VALUES ($1,'fixtur-ws',$2)`, [WS, USER]);
  await db.query(
    `INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,'owner')`, [WS, USER]);
  await db.query(
    `INSERT INTO overlays (id,workspace_id,name,state) VALUES ($1,$2,'fixtur-overlay',$3)`,
    [OVERLAY, WS, JSON.stringify({ widgets: [
      { id: 'w1', type: 'templateSocialGoal', goalKind: 'follows', goalCurrent: '7', goalTarget: '100' },
      { id: 'w2', type: 'templateHeartGoal', heartCurrent: '3', heartTarget: '50' },
    ] })]);
  await db.query(
    `INSERT INTO overlay_access_tokens (overlay_id,token_hash,label,created_by)
     VALUES ($1,$2,'fixtur-obs',$3)`,
    [OVERLAY, crypto.createHash('sha256').update('fixturtoken').digest('hex'), USER]);
  // w1 HAR redan en runtime-rad med andra tal än widgetens. Backfillens ON CONFLICT DO NOTHING
  // får inte röra den — annars skrivs en streamers verkliga baseline om vid varje deploy.
  await db.query(
    `INSERT INTO goal_runtime (overlay_id,widget_id,metric,baseline,target)
     VALUES ($1,'w1','follows',42,500)`, [OVERLAY]);
  await db.query(
    `INSERT INTO tiktok_connections (workspace_id,tiktok_username) VALUES ($1,'fixturkonto')`, [WS]);

  const fore = await nulage();
  await db.query(SCHEMA); // körning 3 — mot befintlig data
  const efter = await nulage();

  for (const tab of TABELLER) {
    for (const rad of fore[tab]) {
      assert.ok(efter[tab].includes(rad),
        `körning 3 ändrade eller tappade en befintlig rad i ${tab}: ${rad.slice(0, 120)}`);
    }
  }
  // Backfillen är additiv och exakt: w2 fick sin rad (likes, baseline 3, target 50), w1 behöll 42/500.
  assert.equal(efter.goal_runtime.length, fore.goal_runtime.length + 1,
    'backfillen skulle lägga till exakt en goal_runtime-rad (w2)');
  const w1 = await db.query(
    `SELECT baseline::int AS b, target::int AS t FROM goal_runtime WHERE overlay_id=$1 AND widget_id='w1'`,
    [OVERLAY]);
  assert.deepEqual(w1.rows[0], { b: 42, t: 500 }, 'backfillen skrev över w1:s befintliga rad');
  const w2 = await db.query(
    `SELECT metric, baseline::int AS b, target::int AS t FROM goal_runtime WHERE overlay_id=$1 AND widget_id='w2'`,
    [OVERLAY]);
  assert.deepEqual(w2.rows[0], { metric: 'likes', b: 3, t: 50 }, 'backfillens w2-rad har fel innehåll');
});

prov('körning 4 är helt idempotent: inte en byte skiljer mot körning 3', async () => {
  const fore = await nulage();
  await db.query(SCHEMA); // körning 4
  const efter = await nulage();
  assert.deepEqual(efter, fore, 'andra körningen mot fixturdatabasen ändrade data');
});
