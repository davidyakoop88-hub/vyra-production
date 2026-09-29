'use strict';
// Throwaway seed script for verifying the top-points catalog widget against a real Postgres.
// Run with DATABASE_URL pointing at the throwaway test DB.
const { Pool } = require('../server/node_modules/pg');
const crypto = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function digest(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function token(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }

async function main() {
  const email = 'seed-points-' + Date.now() + '@example.com';
  const userQ = await pool.query(
    `INSERT INTO users(email,password_hash,display_name,email_verified_at) VALUES($1,'x','Seed User',now()) RETURNING id`,
    [email]);
  const userId = userQ.rows[0].id;

  const wsQ = await pool.query(
    `INSERT INTO workspaces(name,owner_user_id) VALUES('Seed Workspace',$1) RETURNING id`,
    [userId]);
  const workspaceId = wsQ.rows[0].id;

  await pool.query(
    `INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')`,
    [workspaceId, userId]);

  // Active premium subscription so Billing.overlayPlan() returns 'premium'.
  await pool.query(
    `INSERT INTO subscriptions(workspace_id,plan,status,current_period_end)
     VALUES($1,'premium','active',now()+interval '30 days')`,
    [workspaceId]);

  const overlayQ = await pool.query(
    `INSERT INTO overlays(workspace_id,name,state) VALUES($1,'Seed Overlay','{}'::jsonb) RETURNING id`,
    [workspaceId]);
  const overlayId = overlayQ.rows[0].id;

  const raw = token(32);
  await pool.query(
    `INSERT INTO overlay_access_tokens(overlay_id,token_hash,label,created_by) VALUES($1,$2,'Seed OBS',$3)`,
    [overlayId, digest(raw), userId]);

  // A few viewers with points_ledger rows + matching gifter_totals rows for display name/avatar.
  const viewers = [
    { id: 'viewer-1', name: 'StjärnGivare', avatar: 'https://p16-sign.tiktokcdn.com/seed/avatar1.jpeg', points: 18420, earned: 18420 },
    { id: 'viewer-2', name: 'DiamantDrottning', avatar: 'https://p16-sign.tiktokcdn.com/seed/avatar2.jpeg', points: 14310, earned: 14310 },
    { id: 'viewer-3', name: 'GullGivaren', avatar: '', points: 9875, earned: 9875 },
    { id: 'viewer-4', name: 'Poängjägaren', avatar: 'https://p16-sign.tiktokcdn.com/seed/avatar4.jpeg', points: 6420, earned: 6420 },
    { id: 'viewer-5', name: 'Nykomling88', avatar: '', points: 3110, earned: 3110 },
    { id: 'viewer-6', name: 'Silvertitt', avatar: '', points: 980, earned: 980 },
    { id: 'viewer-7', name: 'Bronsbesök', avatar: '', points: 410, earned: 410 },
    { id: 'viewer-8', name: 'Sistaplats', avatar: '', points: 120, earned: 120 },
    { id: 'viewer-9', name: 'Nio', avatar: '', points: 90, earned: 90 },
    { id: 'viewer-10', name: 'Tio', avatar: '', points: 40, earned: 40 },
  ];

  for (const v of viewers) {
    await pool.query(
      `INSERT INTO points_ledger(workspace_id,viewer_id,points,earned) VALUES($1,$2,$3,$4)`,
      [workspaceId, v.id, v.points, v.earned]);
    await pool.query(
      `INSERT INTO gifter_totals(workspace_id,tiktok_username,viewer_id,display_name,avatar_url,diamonds)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [workspaceId, v.id, v.id, v.name, v.avatar || null, Math.round(v.points * 3)]);
  }

  console.log(JSON.stringify({ workspaceId, overlayId, accessToken: raw }, null, 2));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
