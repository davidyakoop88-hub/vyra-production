# VYRA production runtime

## Production-safe path

Use `docker-compose.production.yml`, not the local development compose file. Production requires
immutable API/web images, managed PostgreSQL, managed Redis over `rediss://`, external object
storage, malware scanning, live Stripe credentials and complete signed desktop-release metadata.

Copy `.env.production.example` into the hosting platform's secret manager. Do not commit the
filled file. `NODE_ENV=production` makes the API run `production-config.js` before it opens a
network port; any placeholder, weak/reused secret, HTTP endpoint, test Stripe key, disabled media
scanner or incomplete installer metadata blocks startup.

The production web image copies only browser assets. Server source, scripts, documentation,
Electron code, connector code, tests and repository metadata are absent from `/srv`.

Deployment order:

1. Run `node scripts/production-preflight.js`.
2. Create and checksum a PostgreSQL backup.
3. Pull immutable images and run the migration as a one-shot job.
4. Start at least two API instances, then the HTTPS web proxy.
5. Require `/health/ready` to pass within 60 seconds.
6. If health fails, run `scripts/rollback-production.sh` with the recorded previous images.

This checkpoint packages the web app, API and PostgreSQL database as separate
services. Caddy is the public entry point and distributes API traffic between
the API containers.

## Start locally

```powershell
$env:POSTGRES_PASSWORD = "replace-with-a-long-random-secret"
$env:APP_ORIGIN = "http://localhost:8088"
$env:TIKTOK_INGEST_TOKEN = "another-long-random-secret"
docker compose up --build
```

Open `http://localhost:8088`. The schema is installed before the API starts and
application data is retained in the `vyra_pgdata` volume.

## Health checks

- `GET /health/live` proves that the API process can answer HTTP requests.
- `GET /health/ready` proves that the API can also reach PostgreSQL.

The reverse proxy only sends traffic to ready API instances. A failed database
connection removes an instance from rotation instead of serving partial work.

## Production requirements

- Terminate TLS at Caddy or at the cloud load balancer.
- Keep `POSTGRES_PASSWORD` and `DATABASE_URL` in a secret manager, never Git.
- Use managed PostgreSQL with automated backups and point-in-time recovery.
- Set `DATABASE_SSL=require` when the provider supplies a trusted TLS chain.
- Put uploaded media in object storage and serve it through a CDN.
- Collect JSON logs and alert on readiness failures, 5xx rates and latency.
- Back up the database before schema deployments and rehearse restores.
- Set `BACKUP_DIR` to encrypted, access-controlled storage before using the deploy script.
- Never deploy `:latest`; use an immutable version tag or image digest.

## Scaling

The API contains no in-memory login state, so it can run in parallel. Sessions,
workspaces and overlays remain in PostgreSQL. If a Docker Compose implementation
does not honor `deploy.replicas`, scale explicitly:

```powershell
docker compose up --build --scale api=2
```

Before public launch, move rate limits to a shared store such as Redis so the
limit is enforced across every API instance. This checkpoint uses Redis for
that shared limit and retains a local fallback if Redis becomes unavailable.

## TikTok event delivery

Configure the bridge with `VYRA_CLOUD_URL`, `VYRA_WORKSPACE_ID` and
`VYRA_INGEST_TOKEN`. Each event is deduplicated, appended to a bounded Redis
stream and published to connected overlays. The authenticated browser endpoint
`/api/workspaces/:workspaceId/events/stream` uses Server-Sent Events, replays
missed events from `Last-Event-ID` (only when the client actually sends one — a fresh connection
starts live-only, it isn't handed the whole event history), and sends a heartbeat every 30 seconds.

The `tiktok-connection-manager` service (`tiktok-bridge/connection-manager.js`, built from
`tiktok-bridge/Dockerfile`) runs one bridge child process per row in the `tiktok_connections`
table (`workspace_id`, `tiktok_username`, `active`) instead of someone manually starting
`bridge.js` per account. It reads `DATABASE_URL` to list active connections on startup, and
forwards `VYRA_CLOUD_URL`/`VYRA_INGEST_TOKEN`/`DISCORD_ALERT_WEBHOOK_URL`/`PROXY_LIST` from its own
environment to every bridge it forks. Deploys as its own image (`VYRA_TIKTOK_BRIDGE_IMAGE`,
required by `scripts/deploy-production.sh` alongside the API/web images) so a crash or restart of
the fleet manager re-establishes every active workspace's bridge from Postgres with no manual
step. It depends on `migrate` (for the `tiktok_connections` table) and a healthy `api` (bridges
forward events to it) before starting.

### Registering a connection

Nothing wrote to `tiktok_connections` until `PUT /api/workspaces/:workspaceId/tiktok-connection`
existed — the table was read by the manager but never populated, so the cloud path could not be
used at all. The endpoint (owner/admin/editor only) upserts one row per workspace:

- `GET` returns the current row or `null`
- `PUT {"username":"streamer"}` activates it — the username is normalised by
  `normalizeTikTokUsername` (strips `@`, lowercases, and accepts only 2-24 chars of `a-z 0-9 . _`)
  because the value becomes both a primary-key row and an argv entry for a forked bridge process
- `DELETE` sets `active=false` rather than deleting, so the history of who connected survives

In the browser, `live-client.js` calls these when there is no VYRA Desktop runtime, so
**Anslut TikTok** in Studio now works on the web instead of throwing "Öppna VYRA Desktop".

### Running the manager on Railway

The API and the manager must be **two separate Railway services**. They share nothing but the
database: the API writes rows to `tiktok_connections`, the manager polls them and forks one bridge
child process per active row. Putting them in one service means bridge memory pressure can OOM-kill
the API, taking login and every widget down with it — the bridges are the part that scales with
users, so they need their own memory budget.

The manager service points at `tiktok-bridge/Dockerfile`, whose `CMD` is `npm run manager`
(the same command you use locally).

**Environment**

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | same Postgres as the API | how it discovers active connections |
| `VYRA_CLOUD_URL` | the API origin, e.g. `https://vyralive.app` | where bridges post events |
| `VYRA_INGEST_TOKEN` | must equal the API's `TIKTOK_INGEST_TOKEN` | |
| `MAX_BRIDGES` | start at `5` | see the capacity note below |
| `PORT` | supplied by Railway | the health/status listener binds to it |
| `SYNC_INTERVAL_MS` | optional, default `15000` | how fast connect/disconnect takes effect |
| `PROXY_LIST` | optional, disabled when empty | only once TikTok actually rate-limits the shared IP |

**Leave `VYRA_SERVER_URL` unset in the cloud.** It points at the desktop build's local server
(`server.ps1` on `127.0.0.1:4173`), which does not exist on Railway. It used to default to that
address regardless, so every event, heartbeat, connect and disconnect fired a doomed POST and logged
an error — one error line per event during a live stream, drowning the messages that matter. The
bridge now skips the local post entirely when `VYRA_CLOUD_URL` is set and `VYRA_SERVER_URL` is not.
Only set it if you deliberately want a bridge to also feed a local server.

### Service root directories — railway.json is only read from the service's own root

Railway reads `railway.json` from the **root directory configured on the service**, not from the
repository root. The two files in this repo are therefore only picked up with these settings:

| Service | Root directory | Config file that applies |
|---|---|---|
| API | `server` | `server/railway.json` |
| TikTok manager | `tiktok-bridge` | `tiktok-bridge/railway.json` |

`server` is the correct root for the API: it does not serve any HTML — Caddy is the public entry
point for static files and only proxies API traffic here — so nothing outside `server/` needs to be
in that image.

**Verify detection in the dashboard; do not assume it from the file existing in Git.** After the
first deploy, the service's Settings should show the values below already filled in. If they are
blank, the root directory is wrong and the file was never read — set them by hand:

| Setting | API | Manager |
|---|---|---|
| Root directory | `server` | `tiktok-bridge` |
| Pre-deploy command | `npm run migrate` | *(none)* |
| Start command | *(default `npm start`)* | `npm run manager` |
| Health check path | `/health/ready` | `/health` |
| Health check timeout | `300` | `60` |
| Restart policy | on failure, max 10 | on failure, max 10 |

The pre-deploy command is the one that must not be skipped. `/health/ready` now probes a write
against `health_probe`; a build that starts serving before the migration created that table answers
503 with `probe-table-missing-run-migrate` and Railway stops routing to it. A failed migration fails
the deploy and leaves the previous version serving, which is the outcome you want.

If the API service's root directory is the repository root rather than `server` for some other
reason, `server/railway.json` will be ignored entirely — set every value in the table above by hand
and point the pre-deploy command at `npm --prefix server run migrate`.

**Migration runs before the deploy takes traffic**

`server/railway.json` sets `preDeployCommand: npm run migrate`, so the schema is applied by the
deployment itself rather than by someone remembering to open a console. This matters now that
`/health/ready` probes a write against `health_probe`: a build that starts serving readiness before
that table exists answers 503 and the platform stops routing to it. If the migration fails the
deploy fails and the previous version keeps serving, which is the outcome you want.

The migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`), and CI proves it by running it twice, so re-running it
on every deploy is safe.

**Health check**

Point Railway's health check at `/health` (returns `{"ok":true,"status":"live"}`).

It deliberately reports 200 even while Postgres is unreachable. The manager process is alive and the
bridges it already started keep streaming, so failing the check on a transient database blip would
have Railway restart a healthy fleet. The database state is in the body of `/status` instead
(`lastSyncError`), not in the health verdict.

`/status` is the operational view:

```json
{"ok":true,"activeBridges":3,"maxBridges":5,"atCapacity":false,"waitingCount":0,
 "waiting":[],"restarts":0,"lastEventTime":1785691939627,"lastSyncAt":1785691939000,
 "lastSyncError":null,"syncIntervalMs":15000,"bridges":[...]}
```

Watch `atCapacity` and `waitingCount`: a non-zero `waitingCount` means real users are being refused
and `MAX_BRIDGES` (or the plan) needs raising. A climbing `restarts` means a bridge is crash-looping.

**Capacity — measure, do not guess**

Each bridge is a full Node process, roughly 40–60 MB resident. `MAX_BRIDGES` is a hard ceiling on
how many run at once; the manager refuses beyond it and reports the workspace as waiting rather than
letting the container run out of memory. Refusal is controlled: already-running bridges are never
touched, and a waiting workspace starts automatically on the next sync once a slot frees.

Start at `MAX_BRIDGES=5`, run a load test with real streams, and read actual RSS per bridge before
raising it. Leave the manager service clear headroom — the ceiling should be reached by the refusal
path, never by the OOM killer.

The manager polls `tiktok_connections` every `SYNC_INTERVAL_MS` and reconciles: it starts a bridge
for any active row that has none, stops one whose row went inactive, and restarts one whose username
changed. A bridge that exits unexpectedly frees its slot immediately and is retried with exponential
backoff (5 s doubling to a 5 minute cap), so a permanently broken connection cannot spin in a restart
loop. A bridge that stayed up for more than a minute has its backoff counter reset, so an ordinary
reconnect carries no penalty. A stop we asked for is not treated as a crash.

The same TikTok account is never given two processes, even if two different workspaces both
configure it — the second is reported as waiting with reason `duplicate-account`. Two readers on one
stream would duplicate every event downstream and give TikTok two connections to rate-limit.

Note that a bridge stays up as long as its row is active, reconnecting even while the account is
offline, so a workspace that has stopped streaming still holds a process and a capacity slot. Fine
for a handful of workspaces; before a large fleet the bridges should be tied to whether the account
is actually live, since ~100 idle Node processes is several GB of RAM.

## OBS overlay links

Create a dedicated link with **Säker OBS-länk** in Studio. Only a SHA-256 hash
of its 256-bit token is stored. Owners and administrators can assign an expiry,
inspect last use, and revoke a link. Revocation blocks new requests immediately
and closes an already connected event stream at the next 30-second heartbeat.
Tokens are redacted from structured HTTP logs and are shown only once when
created. Use a separate link for every streaming computer.

## Monitoring and recovery

`GET /api/internal/metrics` returns Prometheus text metrics and requires the
separate `METRICS_TOKEN` bearer token. It reports request volume, status codes,
latency, live-event throughput, SSE connections, process uptime and memory.
Runtime guards alert when memory or event-loop delay crosses configured limits.
Redis uses a circuit breaker and local rate-limit fallback during outages.
Unhandled failures are emitted as structured fatal logs, optionally sent to
`ALERT_WEBHOOK_URL`, and shut down cleanly so the container restarts the API.

## Media storage

Studio calculates SHA-256 in the browser and requests a ten-minute signed
upload URL. The browser uploads directly to S3-compatible object storage; API
memory and bandwidth are not used for the file body. Completion verifies size,
MIME type and checksum metadata before the asset can be read. Executable and
HTML types are rejected, filenames are normalized, objects are isolated under
the workspace id, downloads expire after five minutes, and stale pending
uploads are removed after one hour. Set `CDN_ORIGIN` for immutable CDN delivery.

For public production, set `MEDIA_SCAN_REQUIRED=true` and connect the object
provider's malware-scanning workflow. Assets remain quarantined until that
scanner promotes them to `ready`; never disable this requirement for untrusted
customer uploads.

## Billing

VYRA has one offer: **VYRA Premium for USD 15 per month with a three-day free
trial**. Create that recurring monthly Price in Stripe and set its id as
`STRIPE_PRICE_MONTHLY`. Checkout receives `trial_period_days: 3`; a database
lock ensures each workspace can consume the trial only once. Subscription
webhooks are verified against the untouched raw request body and processed in
an idempotent database transaction. Quotas are checked by the server, not by
hidden buttons in the browser. The customer portal handles cancellation and
payment-method changes.

The offer renews automatically every month unless the owner cancels it. Studio
shows this next to the price and provides a direct **Säg upp abonnemang** button.
Cancellation sets `cancel_at_period_end=true`, so access remains until the end
of the trial or paid month and no later monthly renewal is collected. The owner
can undo the cancellation before that date. Stripe Checkout also validates at
runtime that the configured Price is exactly USD 15 with a one-month interval.

Billing emails are written to a transactional outbox in the same database
transaction as each Stripe event. A background worker sends them through
Resend with an idempotency key and exponential retry. Messages cover trial
start/end, successful and failed payment, scheduled cancellation, resumed
renewal and final termination. Set `RESEND_API_KEY` and a verified `EMAIL_FROM`
domain before launch.
