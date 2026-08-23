CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
  password_hash text NOT NULL, display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), disabled_at timestamptz
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_enc text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_hashes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK(purpose IN ('verify_email','reset_password')),
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_active_idx ON auth_tokens(token_hash,expires_at) WHERE consumed_at IS NULL;
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, csrf_hash text NOT NULL, expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text, user_agent text
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS sessions_active_token_idx ON sessions(token_hash,expires_at);
CREATE TABLE IF NOT EXISTS overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL, state jsonb NOT NULL DEFAULT '{}'::jsonb, version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS overlays_workspace_idx ON overlays(workspace_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS overlay_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), overlay_id uuid NOT NULL REFERENCES overlays(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, label text NOT NULL DEFAULT 'OBS',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
  last_used_at timestamptz, revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS overlay_access_overlay_idx ON overlay_access_tokens(overlay_id,created_at DESC);
CREATE INDEX IF NOT EXISTS overlay_access_expiry_idx ON overlay_access_tokens(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS overlay_access_active_token_idx ON overlay_access_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE, original_name text NOT NULL, content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes>0), sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','quarantined','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(), ready_at timestamptz, deleted_at timestamptz
);
ALTER TABLE media_assets ALTER COLUMN uploaded_by DROP NOT NULL;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE conname='media_assets_uploaded_by_fkey' AND confdeltype<>'n') THEN
    ALTER TABLE media_assets DROP CONSTRAINT media_assets_uploaded_by_fkey;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='media_assets_uploaded_by_fkey') THEN
    ALTER TABLE media_assets ADD CONSTRAINT media_assets_uploaded_by_fkey FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS media_workspace_idx ON media_assets(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS media_pending_idx ON media_assets(created_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS billing_customers (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE, trial_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
CREATE TABLE IF NOT EXISTS subscriptions (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE, stripe_price_id text, plan text NOT NULL DEFAULT 'free'
    CHECK(plan IN ('free','premium')),
  status text NOT NULL DEFAULT 'inactive', current_period_end timestamptz, trial_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_events (
  stripe_event_id text PRIMARY KEY, event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_outbox (
  id bigserial PRIMARY KEY, workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  recipient text NOT NULL, template text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE, attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
  last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_pending_idx ON notification_outbox(next_attempt_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS notification_retry_idx ON notification_outbox(attempts,next_attempt_at) WHERE sent_at IS NULL;
CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY, workspace_id uuid, actor_user_id uuid, action text NOT NULL,
  target_type text, target_id text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_workspace_created_idx ON audit_log(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_actor_created_idx ON audit_log(actor_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  category text NOT NULL CHECK(category IN ('technical','billing','account','tiktok','feedback','other')),
  subject text NOT NULL, message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx ON support_tickets(status,priority,created_at);
CREATE TABLE IF NOT EXISTS support_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL, message text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS client_error_reports (
  id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  fingerprint text NOT NULL, message text NOT NULL, source text, stack text, context text,
  occurrences integer NOT NULL DEFAULT 1, first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,fingerprint)
);
CREATE INDEX IF NOT EXISTS client_errors_recent_idx ON client_error_reports(last_seen_at DESC);
CREATE TABLE IF NOT EXISTS platform_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
  status text NOT NULL CHECK(status IN ('investigating','identified','monitoring','resolved')),
  impact text NOT NULL CHECK(impact IN ('minor','major','critical')),
  message text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
-- One row per workspace that should have a live tiktok-bridge running against a TikTok account.
-- connection-manager.js's startAll() reads WHERE active=true on startup/restart to know which
-- bridges to spawn.
CREATE TABLE IF NOT EXISTS tiktok_connections (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  tiktok_username text NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tiktok_connections_active_idx ON tiktok_connections(workspace_id) WHERE active;

-- Live-driven goals. Progress is the server's, so a layout link and a widget link for the same
-- widget id read one row and cannot drift, and a reload or a Railway restart cannot reset a goal.
-- The displayed number is baseline + progress: "start value" and "reset" stay separate ideas, so a
-- reset never discards the number the streamer typed.
CREATE TABLE IF NOT EXISTS goal_runtime (
  overlay_id  uuid    NOT NULL REFERENCES overlays(id) ON DELETE CASCADE,
  widget_id   text    NOT NULL,
  metric      text    NOT NULL CHECK (metric IN ('follows','likes','shares','gifts','diamonds')),
  baseline    bigint  NOT NULL DEFAULT 0 CHECK (baseline >= 0),
  progress    bigint  NOT NULL DEFAULT 0 CHECK (progress >= 0),
  target      bigint  NOT NULL DEFAULT 1000 CHECK (target > 0),
  epoch       integer NOT NULL DEFAULT 1 CHECK (epoch >= 1),
  revision    bigint  NOT NULL DEFAULT 0 CHECK (revision >= 0),
  reset_at    timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (overlay_id, widget_id)
);
CREATE INDEX IF NOT EXISTS goal_runtime_metric_idx ON goal_runtime(overlay_id,metric);

-- revision is what the browser orders frames by, and it is the only field that can do the job.
-- updated_at cannot: now() is transaction_timestamp(), the transaction's START, so two overlapping
-- writes can commit in the opposite order to their timestamps. epoch says which run a number belongs
-- to, not which of two writes came last. So: one counter per row, bumped by every statement that
-- changes what a frame carries, in the same transaction as the change itself.
--
-- bigint rather than integer because it is never reset — a busy goal takes one step per event — and
-- it is carried as a string of digits all the way to the widget, because past 2^53 two distinct
-- revisions round to the same double and the newer one would look stale.
--
-- Separate ALTER because CREATE TABLE IF NOT EXISTS does nothing to a table that already exists,
-- and every production row predates this column. DEFAULT 0 starts them all at the same place; the
-- first write after the migration is 1 and every client sees it as newer.
ALTER TABLE goal_runtime ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
-- CREATE TABLE IF NOT EXISTS hoppas over for en tabell som redan finns, sa en ny kolumn nar
-- ALDRIG en befintlig databas utan den har raden. Utan den hade webhookens INSERT kraschat pa
-- "column trial_end does not exist" i produktion, och varje prenumerationshandelse gatt forlorad.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_end timestamptz;

-- One row per event that actually moved a goal. The FK matters more here than anywhere else in this
-- file: this is the highest-volume table in the system, and without ON DELETE CASCADE a deleted
-- workspace would leave millions of rows nothing could ever reference again. Rows are only written
-- when at least one goal matches the event's metrics, so an account with no like goal never grows a
-- row per like.
CREATE TABLE IF NOT EXISTS goal_event_apply (
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id     text        NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, event_id)
) WITH (fillfactor = 90);
CREATE INDEX IF NOT EXISTS goal_event_apply_sweep_idx ON goal_event_apply(applied_at);

-- Backfill: existing saved goals keep their number as baseline, progress starts at zero, so nobody
-- sees their figure jump. Idempotent, and only an optimisation — the read path upserts lazily, so a
-- goal without a runtime row can never break.
INSERT INTO goal_runtime (overlay_id, widget_id, metric, baseline, target)
SELECT o.id, w->>'id',
       CASE WHEN w->>'type' = 'templateHeartGoal' THEN 'likes'
            WHEN w->>'goalKind' = 'likes' THEN 'likes' ELSE 'follows' END,
       GREATEST(0, COALESCE((w->>'goalCurrent')::bigint, (w->>'heartCurrent')::bigint, 0)),
       GREATEST(1, COALESCE((w->>'goalTarget')::bigint, (w->>'heartTarget')::bigint, 1000))
  FROM overlays o, jsonb_array_elements(o.state->'widgets') w
 WHERE w->>'type' IN ('templateSocialGoal','templateHeartGoal')
   AND w->>'id' IS NOT NULL
ON CONFLICT (overlay_id, widget_id) DO NOTHING;

-- BRIN on applied_at instead of B-tree. Measured at 1 000 000 rows: 162,7 B/row against 175,4 with
-- the B-tree, a 7% saving, and the sweep's own selection is unaffected because the table is written
-- in applied_at order — exactly the shape BRIN is for. Replaces only this index; the primary key on
-- (workspace_id, event_id) is what enforces idempotency and is left alone.
DROP INDEX IF EXISTS goal_event_apply_sweep_idx;
CREATE INDEX IF NOT EXISTS goal_event_apply_sweep_brin
  ON goal_event_apply USING brin (applied_at);

-- Single-row target for /health/ready's write probe. The probe UPDATEs this row inside a
-- transaction it always rolls back, so the table never grows and no health check leaves data
-- behind — but the UPDATE still exercises the real write path (WAL, disk, read-only state), which
-- a temp table would not. `SELECT 1` alone reported a healthy database right through an outage
-- where reads worked and every write failed.
CREATE TABLE IF NOT EXISTS health_probe(
  id integer PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO health_probe(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

-- Senast sedda fanklubbs- och gifternivå per tittare och arbetsyta.
--
-- Fan Level Up och Gifter Level Up höll tidigare den här jämförelsen i en Map i webbläsarens RAM.
-- Den dog med sidan, så en höjning kunde bara upptäckas om samma tittare syntes TVÅ gånger i SAMMA
-- sändning — och fanklubbsnivå rör sig på veckor. Widgetarna var därför tysta i praktiken.
--
-- Den bor på servern och inte i localStorage för att session-state.js gör den flik som inte äger
-- låset skrivskyddad, och under en sändning kör överlägget i OBS ofta bredvid en öppen Studio. En
-- ledger som skrivs vid varje event kan inte ligga i den fliken.
--
-- Nivåerna är NULL tills TikTok faktiskt rapporterat en: 0 betyder "ingen nivå", inte nivå noll,
-- och en tittare som inte gått med i fanklubben har inget `fansClub` i payloaden alls.
CREATE TABLE IF NOT EXISTS viewer_levels (
  workspace_id uuid    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  viewer_id    text    NOT NULL,
  fan_level    integer CHECK (fan_level    BETWEEN 1 AND 50),
  gifter_level integer CHECK (gifter_level BETWEEN 1 AND 50),
  seen_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, viewer_id)
);

-- Gallringen väljer på ålder över hela tabellen och skrivs i seen_at-ordning — samma form som
-- goal_event_apply, och samma skäl att välja BRIN framför B-tree.
CREATE INDEX IF NOT EXISTS viewer_levels_sweep_brin
  ON viewer_levels USING brin (seen_at);

-- Strömningshistorik — underlaget för "All time" på framsidan.
--
-- Fram till nu räknades all statistik i webbläsaren (live-leaderboard.js -> localStorage). En
-- sändning utan Studio-fliken uppe hamnade därför aldrig i statistiken, ett datorbyte nollställde
-- den, och en rensad webbläsare raderade den. Uppmätt 2026-08-07: 5 dagar och 10 givare lokalt,
-- mot en konkurrents 472 givare sedan juni. Skillnaden är inte räknandet utan var det sker.
--
-- INGEN RÅ EVENTLOGG. Allt en analysvy visar är summor, och summor växer förutsägbart. En rå logg
-- hade vuxit med varje tapp i en likestorm; de tre tabellerna nedan har bunden tillväxt:
--
--   gifter_totals  en rad per givare           växer med publiken
--   daily_totals   en rad per dag              365 rader per år
--   slot_totals    en rad per veckodag+timme   FAST 168 rader, växer aldrig
--
-- Nyckeln bär tiktok_username för att statistiken följer TikTok-kontot. Byter streamern konto
-- blandas inte två publiker ihop — att slå ihop i efterhand går, att separera gör det inte.
--
-- Tiden lagras i UTC. Lagrades lokal tid låstes historiken till den tidszon användaren råkade ha
-- när raden skrevs, och veckodagsmönstret — hela poängen med "sänd torsdag–fredag 18–24" — blir
-- fel för den som flyttar. Klienten räknar om till lokal tid vid visning.
CREATE TABLE IF NOT EXISTS gifter_totals (
  workspace_id       uuid   NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tiktok_username    text   NOT NULL,
  viewer_id          text   NOT NULL,
  display_name       text,
  avatar_url         text,
  gifts              bigint NOT NULL DEFAULT 0,
  diamonds           bigint NOT NULL DEFAULT 0,
  likes              bigint NOT NULL DEFAULT 0,
  best_gift_name     text,
  best_gift_diamonds bigint NOT NULL DEFAULT 0,
  first_seen         timestamptz NOT NULL DEFAULT now(),
  last_seen          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, tiktok_username, viewer_id)
);

-- Topplistan sorterar på diamanter inom ett konto, och "sovande givare" på last_seen. Båda är
-- läsvägar som körs varje gång framsidan öppnas.
CREATE INDEX IF NOT EXISTS gifter_totals_topplista
  ON gifter_totals (workspace_id, tiktok_username, diamonds DESC);
CREATE INDEX IF NOT EXISTS gifter_totals_sovande_brin
  ON gifter_totals USING brin (last_seen);

CREATE TABLE IF NOT EXISTS daily_totals (
  workspace_id    uuid   NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tiktok_username text   NOT NULL,
  day             date   NOT NULL,
  gifts           bigint NOT NULL DEFAULT 0,
  diamonds        bigint NOT NULL DEFAULT 0,
  likes           bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, tiktok_username, day)
);

-- Fast storlek: 7 veckodagar x 24 timmar per konto. Den här är underlaget för "bästa tid att sända"
-- och kan därför aldrig bli den tabell som växer sig dyr.
CREATE TABLE IF NOT EXISTS slot_totals (
  workspace_id    uuid     NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tiktok_username text     NOT NULL,
  weekday         smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  hour            smallint NOT NULL CHECK (hour    BETWEEN 0 AND 23),
  gifts           bigint   NOT NULL DEFAULT 0,
  diamonds        bigint   NOT NULL DEFAULT 0,
  likes           bigint   NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, tiktok_username, weekday, hour)
);

-- ================================================================================================
-- SÄNDNINGSIDENTITET. Vilken LIVE ett event tillhör, och därmed vad som får nollställas.
--
-- Empirin (uppmätt 2026-08-22, skrivskyddad sond): två sändningar samma dag gav TVÅ roomId —
-- 7676848357138664214 och 7676861956443147030. n = 2, en anslutning per sändning, så roomId:s
-- stabilitet GENOM en återanslutning är omätt. Modellen lovar därför inte mer än mätningen bär.
--
-- All DDL här är IF NOT EXISTS och ingen sats beror på att en tidigare lyckats: migrate.js kör
-- HELA schema.sql som en batch vid varje deploy, så en halvkörd migrering ska läkas av nästa.
-- Ingenting nedan ändrar, flyttar eller raderar befintliga mål, overlays, tokens eller historik.
-- ================================================================================================

-- Serverägd generation per TikTok-konto. `seq` ordnar bara INOM en bryggkörning; generationen
-- avgör VILKEN körning som får tala. Varken UUID-sortering eller klientklocka duger: den ena är
-- oordnad, den andra är någon annans klocka.
-- SERIALISERINGSPUNKT för generationstilldelningen. En rad per konto som ALLTID finns, så att det
-- går att ta ett radlås även vid den allra första registreringen.
--
-- UNIQUE(account_key, generation) ensamt räcker inte: två samtidiga registreringar läser båda
-- MAX(generation)=N, båda skriver N+1, och den ena kraschar på unikhetsfelet. Det är en legitim
-- registrering som förloras — bryggan har inte gjort något fel. Låset gör att den andra i stället
-- VÄNTAR, läser om max och får N+2.
--
-- Varför inte pg_advisory_xact_lock: capacity-gate.js:29 använder redan ett advisory-lås på en
-- FAST konstant, med en kommentar om att det bara håller så länge inget annat i databasen
-- använder samma nyckel. En hashad nyckel bredvid den är precis den samordningsskuld den varnar
-- för. En riktig rad är dessutom läsbar, felsökbar och syns i pg_locks med namn.
--
-- FOR NO KEY UPDATE, inte FOR UPDATE: krockar med sig självt (två registreringar serialiseras)
-- men inte med FOR KEY SHARE, så bridge_runs-INSERTs som refererar raden inte blockeras i onödan.
CREATE TABLE IF NOT EXISTS bridge_accounts (
  account_key text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bridge_runs (
  id            bigserial PRIMARY KEY,
  account_key   text    NOT NULL REFERENCES bridge_accounts(account_key) ON DELETE CASCADE,
  bridge_run_id text    NOT NULL,
  -- Serverägd och strikt stigande per konto. Sätts som COALESCE(MAX(generation),0)+1 inne i
  -- transaktionen — ALDRIG härledd ur bridge_run_id (en sträng utan ordning), ur started_at
  -- (klockor går isär och kan gå bakåt) eller ur id/insättningsordning (bigserial delas ut före
  -- commit, så två samtidiga körningar kan committa i omvänd ordning mot sina id).
  generation    bigint  NOT NULL CHECK (generation > 0),
  current       boolean NOT NULL DEFAULT true,
  max_seq       bigint  NOT NULL DEFAULT 0 CHECK (max_seq >= 0),
  started_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_key, bridge_run_id),
  -- UTAN DEN HÄR kan två samtidiga registreringar båda läsa MAX(generation)=N och båda skriva
  -- N+1. Då är generationen inte längre strikt stigande, och "vilken körning är nyare" blir
  -- obesvarbart — precis den ordningsfråga hela modellen finns för att undvika. Unikheten gör
  -- att databasen avvisar den andra i stället för att koden hoppas slippa kapplöpningen.
  UNIQUE (account_key, generation)
);
-- Exakt EN aktuell körning per konto. Två samtidiga registreringar kan alltså inte båda vinna.
CREATE UNIQUE INDEX IF NOT EXISTS bridge_runs_aktuell_idx ON bridge_runs(account_key) WHERE current;

CREATE TABLE IF NOT EXISTS stream_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id         text NOT NULL,
  account_key     text NOT NULL,
  bridge_run_id   text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  end_reason      text CHECK (end_reason IN ('bridge','timeout','ersatt','manuell')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Refererbar för den sammansatta främmande nyckeln från pekaren nedan. Redundant mot PK i sig,
  -- men en sammansatt FK kräver en unik constraint över exakt de kolumner den pekar på.
  UNIQUE (id, workspace_id)
);
-- KRAV: samma AKTIVA rum är alltid samma session. Partiell — INTE en global
-- UNIQUE(workspace_id, room_id): två observationer räcker inte för att lova att TikTok aldrig
-- återanvänder ett roomId, och en global nyckel hade gjort bryggan omstartsoduglig den dagen.
CREATE UNIQUE INDEX IF NOT EXISTS stream_sessions_aktivt_rum_idx
  ON stream_sessions(workspace_id, room_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS stream_sessions_ws_idx
  ON stream_sessions(workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS stream_sessions_konto_idx
  ON stream_sessions(account_key, started_at DESC);

-- Vad är live NU. En rad per workspace: både låsobjekt och den enda plats som svarar på frågan.
-- SAMMANSATT FK, inte bara session_id. En enkel FK på session_id kontrollerar att sessionen
-- FINNS, inte att den tillhör samma workspace som pekaren — pekaren för workspace A hade kunnat
-- peka på en session i workspace B. Följden vore att nollställningen tittar på fel sändning:
-- ena kontots mål nollställs när det andra går live. Det är inte en teoretisk risk, det är den
-- enda sortens fel den här tabellen kan göra.
--
-- MATCH SIMPLE (standard) gör att FK:n är uppfylld så fort NÅGON kolumn är NULL, vilket är precis
-- vad vi vill när pekaren är tom: workspace_id är NOT NULL, session_id är det inte.
--
-- ON DELETE SET NULL (session_id) — kolumnlistan kräver PostgreSQL 15+. Railway kör 18.4 och
-- jobbet ovan avvisar allt som inte är major 18. Utan kolumnlistan hade Postgres försökt nolla
-- ÄVEN workspace_id, som är primärnyckel och NOT NULL, och raderingen hade fallit.
CREATE TABLE IF NOT EXISTS stream_session_pointer (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, workspace_id) REFERENCES stream_sessions(id, workspace_id)
    ON DELETE SET NULL (session_id)
);

-- Kvitto per (session, område). Skrivs i SAMMA transaktion som nollställningen: ett kvitto utan
-- reset gör att målen aldrig nollas för den sändningen, en reset utan kvitto kan köra om mitt i.
CREATE TABLE IF NOT EXISTS stream_session_reset (
  session_id uuid NOT NULL REFERENCES stream_sessions(id) ON DELETE CASCADE,
  scope      text NOT NULL,
  done_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, scope)
);

-- Transactional outbox. Raden skrivs i samma transaktion som sessionen och publiceras EFTER
-- commit. Aldrig inuti: en rollback hade då ljugit bort en händelse som redan skickats.
CREATE TABLE IF NOT EXISTS stream_event_outbox (
  id              bigserial PRIMARY KEY,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id        text NOT NULL UNIQUE,
  topic           text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,
  parked_at       timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- LEASE. FOR UPDATE SKIP LOCKED racker inte: radlaset slapps vid COMMIT, och publiceringen sker
  -- EFTER commit — annars gors ett natverksanrop inne i en oppen transaktion. Leasen ar det som
  -- ager raden under sjalva publiceringen, och den overlever att transaktionen stangs.
  -- En krashad worker slapper aldrig sin lease; den LOPER UT, och claim-fragan tar da tillbaka
  -- raden utan att nagon stadare behover finnas.
  lease_owner     text,
  lease_until     timestamptz
);
CREATE INDEX IF NOT EXISTS stream_outbox_pending_idx
  ON stream_event_outbox(next_attempt_at) WHERE published_at IS NULL AND parked_at IS NULL;
CREATE INDEX IF NOT EXISTS stream_outbox_parked_idx
  ON stream_event_outbox(parked_at) WHERE parked_at IS NOT NULL;

-- Engångsbiljett för administrativ återöppning av ett stängt rum. Fail-closed är regeln: ett
-- stängt room_id öppnas ALDRIG automatiskt och det finns ingen karenstid. Skulle TikTok en dag
-- återanvända ett rum är det ett medvetet, auditerat beslut av en människa — inte en tidsgräns
-- som ingen mätt.
--
-- actor_user_id är ON DELETE SET NULL med flit: raderas användaren ska raden finnas kvar. En
-- audithistorik som försvinner med sin upphovsperson är ingen audithistorik.
CREATE TABLE IF NOT EXISTS stream_room_reopen (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_id       text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  consumed_at   timestamptz,
  PRIMARY KEY (workspace_id, room_id, created_at)
);
-- HÖGST EN oanvänd biljett per (workspace, rum). Flera samtidiga hade varit osäkert på två sätt:
-- två administratörer som båda återöppnar samma rum ger två biljetter, varav den andra blir en
-- tyst extra öppning som ingen bad om — och konsumtionslogiken hade behövt välja vilken som
-- gäller, alltså en ordningsfråga till utan svar. Unikheten flyttar problemet dit det hör hemma:
-- den andra administratören får ett fel och ser att rummet redan är öppnat.
-- Partiell: FÖRBRUKADE biljetter får finnas hur många som helst, det är historiken.
CREATE UNIQUE INDEX IF NOT EXISTS stream_room_reopen_obrukad_idx
  ON stream_room_reopen(workspace_id, room_id) WHERE consumed_at IS NULL;
