'use strict';
// Decides whether a workspace may take a live TikTok slot. Extracted from index.js's PUT route so
// the decision can be exercised directly — it has three failure modes that are all invisible until
// production if they are only reachable through an HTTP handler:
//
//   1. It must be ATOMIC. As separate queries this was a textbook check-then-act race: two requests
//      arriving together both read "4 of 5 in use", both passed, and both inserted. The advisory
//      lock below serializes every capacity decision against every other one.
//   2. It must count the SAME THING the fleet manager counts. The manager runs one bridge per
//      TikTok ACCOUNT and refuses a second workspace pointing at the same one, so counting rows
//      would reserve capacity the fleet never uses and refuse users while slots stood empty.
//   3. It must never lock out a workspace that is already streaming. Being at capacity has to stay
//      invisible to the people who are the reason capacity is full.
//
// Fixed key for the advisory lock. Any constant works as long as nothing else in this database uses
// the same one; it is held for the transaction only and never touches rows, so it cannot deadlock
// against ordinary work.
const TIKTOK_CAPACITY_LOCK = 8324771;

// The SQL twin of tiktok-bridge/connection-manager.js's accountKey(): trim, lowercase, strip every
// leading @. Both sides must reduce a stored username to the same key or "one bridge per account"
// means two different things in the two services. Kept as one constant so the two cannot drift
// apart silently the way they already had.
const ACCOUNT_KEY_SQL = "regexp_replace(lower(btrim(tiktok_username)), '^@+', '')";

// c: a transaction client (must be inside BEGIN — the lock is released at COMMIT/ROLLBACK).
// Returns { refused: 'duplicate' | 'capacity', ... } or { connection } on success.
async function decideTikTokCapacity(c, { workspaceId, username, limit }) {
  await c.query('SELECT pg_advisory_xact_lock($1)', [TIKTOK_CAPACITY_LOCK]);

  const already = await c.query(
    'SELECT 1 FROM tiktok_connections WHERE workspace_id=$1 AND active=true', [workspaceId]);

  if (!already.rowCount) {
    // Refuse a duplicate account here rather than letting the manager queue it forever with reason
    // 'duplicate-account'. The two must agree, or the user is told "connected" and nothing happens.
    // Normalize the STORED value in SQL, not just the incoming one. Comparing tiktok_username=$1
    // raw only agrees with the manager for rows the API itself wrote: the manager applies
    // accountKey() (trim, lowercase, strip leading @) to whatever is in the column, so a row that
    // arrived any other way — legacy data, a manual fix, a migration — reads as 'Alice' or
    // '@alice' to this check and 'alice' to the manager. The API would then admit a connection the
    // fleet refuses, which is exactly the divergence the limit cannot survive.
    const dup = await c.query(
      `SELECT 1 FROM tiktok_connections
        WHERE active=true AND workspace_id<>$2
          AND ${ACCOUNT_KEY_SQL} = $1 AND ${ACCOUNT_KEY_SQL} <> ''`,
      [username, workspaceId]);
    if (dup.rowCount) {
      return { refused: 'duplicate',
        error: `@${username} är redan ansluten i ett annat workspace. Koppla från den först — samma TikTok-konto kan bara läsas av en sändning i taget.` };
    }
    const inUse = await c.query(
      `SELECT count(DISTINCT ${ACCOUNT_KEY_SQL})::int AS n
         FROM tiktok_connections WHERE active=true AND ${ACCOUNT_KEY_SQL} <> ''`);
    if (inUse.rows[0].n >= limit) {
      return { refused: 'capacity', inUse: inUse.rows[0].n,
        error: `Alla ${limit} live-platser är upptagna just nu. Prova igen om en stund — en plats frigörs så fort en annan sändning avslutas.` };
    }
  }

  const q = await c.query(
    'INSERT INTO tiktok_connections(workspace_id,tiktok_username,active) VALUES($1,$2,true) ' +
    'ON CONFLICT (workspace_id) DO UPDATE SET tiktok_username=$2,active=true,updated_at=now() ' +
    'RETURNING tiktok_username,active,updated_at', [workspaceId, username]);
  return { connection: q.rows[0] };
}

module.exports = { decideTikTokCapacity, TIKTOK_CAPACITY_LOCK, ACCOUNT_KEY_SQL };
