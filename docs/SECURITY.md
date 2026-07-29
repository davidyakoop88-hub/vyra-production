# VYRA security incident response

Updated: 2026-07-30

For the general security posture (auth, sessions, MFA, rate limits, privacy lifecycle), see
`SECURITY_HARDENING.md`. This document covers **incident response** — concrete steps for when
something has already gone wrong, starting with the one procedure that exists as a tool today:
revoking a leaked overlay access token.

## Leaked or compromised "Säker OBS-länk" access token

Every overlay access token ("Säker OBS-länk", created in Studio under the overlay's access-token
manager) is a bearer credential — anyone holding the raw URL can read that overlay's state and its
live event stream (see `PRODUCTION_DEPLOYMENT.md` → **OBS overlay links**). If a token URL is
accidentally shared publicly, treat it as compromised immediately and revoke it.

Only a SHA-256 hash of each token is stored (`overlay_access_tokens.token_hash`, same algorithm as
`server/security.js`'s `digest()`) — the raw value is shown once at creation and never persisted or
logged again. This means Studio's own token list can only show you *labels*, not raw values, so
there was previously no way to go from "I have this leaked raw token" straight to "revoke it"
without already knowing which labeled row it was. `scripts/revoke-token.js` closes that gap.

### `scripts/revoke-token.js`

A break-glass CLI that revokes a token directly against the database by its raw value, without
needing a logged-in Studio session — for exactly the situation where speed matters and the person
responding may not have (or want to use) an authenticated browser session.

**Requires `DATABASE_URL` in the environment.** It never discovers or ships production credentials
itself — run it via Railway CLI, which injects the environment for you:

```sh
railway link
railway run --service <api-service-name> -- node scripts/revoke-token.js <raw-token>
```

`railway link` connects the CLI to the right project/environment interactively if it isn't already
linked. `<api-service-name>` is whatever your API service is named in the Railway dashboard.

**What it does, in order:**

1. Hashes `<raw-token>` with the exact same SHA-256 algorithm as `server/security.js`'s `digest()`
   (imported directly from that module, not reimplemented, so the two can never drift apart).
2. Looks up `overlay_access_tokens` by `token_hash`, joined through to the owning overlay and
   workspace, for reporting.
3. **Found and still active:** sets `revoked_at = now()`, prints which overlay/workspace/label it
   belonged to, and writes a best-effort row to `audit_log` (`action:
   'overlay_token_revoked_cli'`, distinct from the in-app `'overlay_token_revoked'` action so the
   two are never confused when reading the log later). The audit write can never block or fail the
   actual revoke — it's a courtesy record, not the source of truth.
4. **Not found, or already revoked:** prints `Token finns inte eller är redan revokerad.` — the
   same message either way, since from an incident-response point of view both mean the same
   thing: this token can no longer be used.
5. **More than one row matches the same hash** (should be structurally impossible —
   `token_hash` is `UNIQUE` in the schema — kept as a defensive safety rail only): lists every
   match and refuses to act unless re-run with `--confirm`.

**Flags:**

- `--dry-run` — reports exactly what would be revoked without changing anything. Always safe to
  run first.
- `--all <workspaceId>` — revokes **every** currently-active token across every overlay in that
  workspace, instead of one specific token. Use this when you aren't sure which of several links
  leaked, or want to rotate all of them as a precaution. Takes a workspace id instead of a raw
  token: `node scripts/revoke-token.js --all <workspaceId>`.
- `--operator "Name"` — human-readable name recorded in the audit log for this run. Defaults to
  the OS username the script is running as (plus hostname) if omitted.

**Example commands:**

```sh
# See what would happen, without changing anything
railway run --service api -- node scripts/revoke-token.js <raw-token> --dry-run

# Revoke one specific leaked token
railway run --service api -- node scripts/revoke-token.js <raw-token> --operator "David"

# Not sure which link leaked — nuke every active OBS link in the workspace and reissue fresh ones
railway run --service api -- node scripts/revoke-token.js --all <workspaceId> --operator "David"
```

After revoking, issue a replacement link the normal way (Studio → overlay's access-token manager →
**Skapa länk**) and update the OBS Browser Source URL on every affected streaming computer — the
old URL stops working the instant `revoked_at` is set; there is no grace period.

### Verifying the script without production access

`scripts/revoke-token.js` was built and verified without ever touching production: its exported
functions (`parseArgs`, `revokeSingle`, `revokeAll`, `main`) are driven directly against a real
`pg-mem` in-memory Postgres-compatible engine (actual SQL execution — JOINs, parameterized
`UPDATE ... RETURNING`, not mocked query results), covering a successful revoke, an
already-revoked token, an unknown token, `--dry-run` making zero mutations, `--all`, and audit-log
writes. This is the same "test the real thing before pushing without prod access" approach used
for the Redis-dependent server tests (see `vyra_backend_scaling_session` project notes) and for
`tiktok-connection-manager`'s deploy wiring.
