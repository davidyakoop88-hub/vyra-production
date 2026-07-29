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
  status text NOT NULL DEFAULT 'inactive', current_period_end timestamptz,
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
