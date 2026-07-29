#!/usr/bin/env node
// Break-glass tool for a leaked/compromised "Säker OBS-länk" access token — revokes it directly
// against the database by raw token value, without needing a logged-in Studio session. Built
// after an incident where a token was accidentally shared publicly and there was no way to go
// from "I have this raw leaked token" to "revoke it" without already knowing which row it was in
// Studio's token list (which only ever shows labels, never raw values — only a SHA-256 hash is
// stored, by design).
//
// Requires DATABASE_URL in the environment — this never ships with or discovers production
// credentials itself. Typical usage is via Railway CLI, which injects the environment for you:
//   railway run --service <api-service-name> -- node scripts/revoke-token.js <raw-token>
//
// Usage:
//   node scripts/revoke-token.js <raw-token> [--dry-run] [--operator "Name"]
//   node scripts/revoke-token.js --all <workspaceId> [--dry-run] [--operator "Name"]
//
// Flags:
//   --dry-run            Show exactly what would be revoked without changing anything.
//   --operator <name>    Human-readable name recorded in the audit log for this run. Defaults to
//                         the OS username running the script.
//   --confirm            Required to proceed if a lookup unexpectedly matches more than one row
//                         (token_hash is UNIQUE in the schema, so this should never happen — this
//                         flag exists as a safety rail in case that constraint is ever relaxed).
'use strict';

const { pool } = require('../server/db');
const { digest } = require('../server/security');
const os = require('os');

function parseArgs(argv) {
  const args = { flags: {}, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.flags.dryRun = true;
    else if (arg === '--confirm') args.flags.confirm = true;
    else if (arg === '--all') args.flags.all = true;
    else if (arg === '--operator') args.flags.operator = argv[++i];
    else args.positional.push(arg);
  }
  return args;
}

function operatorInfo(explicitOperator) {
  return {
    operator: explicitOperator || os.userInfo().username || 'okänd',
    hostname: os.hostname()
  };
}

// Best-effort audit trail — written to the same audit_log table the authenticated in-app revoke
// route uses, under a distinct action name so the two are never confused when reading the log.
// This must never block or fail the actual revoke: a script running via `railway run` has no
// authenticated app user (actor_user_id is left NULL), so this is a courtesy record, not the
// source of truth for whether the revoke happened.
async function recordAudit({ workspaceId, targetId, metadata }) {
  try {
    await pool.query(
      `INSERT INTO audit_log(workspace_id, actor_user_id, action, target_type, target_id, metadata)
       VALUES($1, NULL, 'overlay_token_revoked_cli', 'overlay_access_token', $2, $3)`,
      [workspaceId, targetId, metadata]
    );
  } catch (error) {
    console.warn(`[revoke-token] Kunde inte skriva audit-loggen (revoke:n gick ändå igenom): ${error.message}`);
  }
}

async function findByHash(tokenHash) {
  const { rows } = await pool.query(
    `SELECT t.id, t.overlay_id, t.label, t.created_at, t.expires_at, t.last_used_at,
            o.name AS overlay_name, o.workspace_id,
            w.name AS workspace_name,
            u.email AS created_by_email
     FROM overlay_access_tokens t
     JOIN overlays o ON o.id = t.overlay_id
     JOIN workspaces w ON w.id = o.workspace_id
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
    [tokenHash]
  );
  return rows;
}

function describeMatch(row) {
  return [
    `      id:          ${row.id}`,
    `      etikett:     ${row.label}`,
    `      overlay:     ${row.overlay_name} (${row.overlay_id})`,
    `      workspace:   ${row.workspace_name} (${row.workspace_id})`,
    `      skapad av:   ${row.created_by_email || 'okänd'}`,
    `      skapad:      ${row.created_at?.toISOString?.() || row.created_at}`,
    `      senast använd: ${row.last_used_at ? (row.last_used_at.toISOString?.() || row.last_used_at) : 'aldrig'}`
  ].join('\n');
}

async function revokeSingle(rawToken, flags) {
  const tokenHash = digest(rawToken);
  const matches = await findByHash(tokenHash);

  if (matches.length === 0) {
    console.log('Token finns inte eller är redan revokerad.');
    process.exitCode = 1;
    return;
  }

  if (matches.length > 1) {
    // Dead code under the current schema (token_hash is UNIQUE) — kept as a safety rail, per the
    // explicit requirement that multiple matches must be reported and confirmed, never silently
    // acted on.
    console.log(`⚠ Flera träffar (${matches.length}) för samma token-hash — detta ska inte kunna hända:`);
    matches.forEach((row, i) => console.log(`\n  Träff ${i + 1}:\n${describeMatch(row)}`));
    if (!flags.confirm) {
      console.log('\nKör igen med --confirm för att revokera samtliga ovan.');
      process.exitCode = 2;
      return;
    }
  } else {
    console.log('Hittade token:');
    console.log(describeMatch(matches[0]));
  }

  if (flags.dryRun) {
    console.log(`\n[--dry-run] Skulle revokera ${matches.length} token(er) ovan. Inget ändrades.`);
    return;
  }

  const { operator, hostname } = operatorInfo(flags.operator);
  for (const row of matches) {
    await pool.query('UPDATE overlay_access_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
    await recordAudit({
      workspaceId: row.workspace_id,
      targetId: row.id,
      metadata: { operator, hostname, source: 'scripts/revoke-token.js', mode: 'single', label: row.label, overlayId: row.overlay_id, overlayName: row.overlay_name }
    });
  }
  console.log(`\n✓ Revokerad. (${operator}@${hostname})`);
}

async function revokeAll(workspaceId, flags) {
  if (!/^[0-9a-f-]{8,}$/i.test(workspaceId)) {
    console.log(`"${workspaceId}" ser inte ut som ett workspace-id (uuid).`);
    process.exitCode = 1;
    return;
  }

  const { rows } = await pool.query(
    `SELECT t.id, t.overlay_id, t.label, o.name AS overlay_name, w.name AS workspace_name
     FROM overlay_access_tokens t
     JOIN overlays o ON o.id = t.overlay_id
     JOIN workspaces w ON w.id = o.workspace_id
     WHERE w.id = $1 AND t.revoked_at IS NULL
     ORDER BY t.created_at`,
    [workspaceId]
  );

  if (rows.length === 0) {
    console.log(`Inga aktiva OBS-länkar hittades för workspace ${workspaceId}.`);
    return;
  }

  console.log(`Hittade ${rows.length} aktiva OBS-länk(ar) i "${rows[0].workspace_name}":`);
  rows.forEach(row => console.log(`  - ${row.label} (overlay: ${row.overlay_name}, id: ${row.id})`));

  if (flags.dryRun) {
    console.log(`\n[--dry-run] Skulle revokera samtliga ${rows.length} länkar ovan. Inget ändrades.`);
    return;
  }

  const { operator, hostname } = operatorInfo(flags.operator);
  for (const row of rows) {
    await pool.query('UPDATE overlay_access_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
    await recordAudit({
      workspaceId,
      targetId: row.id,
      metadata: { operator, hostname, source: 'scripts/revoke-token.js', mode: 'all', label: row.label, overlayId: row.overlay_id, overlayName: row.overlay_name }
    });
  }
  console.log(`\n✓ ${rows.length} länk(ar) revokerade. (${operator}@${hostname})`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL saknas i miljön. Kör via t.ex. `railway run --service <api> -- node scripts/revoke-token.js ...`.');
    process.exitCode = 1;
    return;
  }

  const { flags, positional } = parseArgs(process.argv.slice(2));

  if (flags.all) {
    const workspaceId = positional[0];
    if (!workspaceId) {
      console.error('Usage: node scripts/revoke-token.js --all <workspaceId> [--dry-run] [--operator "Name"]');
      process.exitCode = 1;
      return;
    }
    await revokeAll(workspaceId, flags);
    return;
  }

  const rawToken = positional[0];
  if (!rawToken) {
    console.error('Usage: node scripts/revoke-token.js <raw-token> [--dry-run] [--operator "Name"]');
    process.exitCode = 1;
    return;
  }
  await revokeSingle(rawToken, flags);
}

module.exports = { parseArgs, revokeSingle, revokeAll, main };

// Guards the live run (which needs a real DATABASE_URL and closes the pool on exit) behind
// require.main, matching tiktok-bridge/bridge.js's and connection-manager.js's own pattern — so
// this script's functions can be required and driven directly by a test harness against a fake
// database, without it trying to connect to anything real.
if (require.main === module) {
  main()
    .catch(error => {
      console.error(`[revoke-token] Fel: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end().catch(() => {}));
}
