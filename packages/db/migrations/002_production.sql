ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE players ADD COLUMN IF NOT EXISTS ban_reason text;
CREATE TABLE IF NOT EXISTS session_families (
  id uuid PRIMARY KEY, player_id bigint NOT NULL REFERENCES players(id), user_id bigint REFERENCES users(id),
  expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS session_tokens (
  token_hash text PRIMARY KEY, family_id uuid NOT NULL REFERENCES session_families(id) ON DELETE CASCADE,
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_player ON session_families(player_id);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash text PRIMARY KEY,user_id bigint NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL,consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS side_effects (
  id bigserial PRIMARY KEY,kind text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS side_effects_pending ON side_effects(id) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint text PRIMARY KEY,player_id bigint NOT NULL REFERENCES players(id),subscription jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS config_versions (
  world_id integer NOT NULL REFERENCES worlds(id),version integer NOT NULL,config jsonb NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),actor bigint REFERENCES players(id),PRIMARY KEY(world_id,version)
);
INSERT INTO config_versions(world_id,version,config,effective_at) SELECT id,(config->>'version')::integer,config,created_at FROM worlds ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS village_snapshots (
  id bigserial PRIMARY KEY,village_id bigint NOT NULL REFERENCES villages(id),event_id bigint REFERENCES scheduled_events(id),
  at timestamptz NOT NULL,state jsonb NOT NULL,player_id bigint REFERENCES players(id),name text NOT NULL,config jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_village ON village_snapshots(village_id,at,id);
CREATE TABLE IF NOT EXISTS event_journal (
  event_id bigint PRIMARY KEY REFERENCES scheduled_events(id),village_id bigint NOT NULL REFERENCES villages(id),
  before_state jsonb NOT NULL,after_state jsonb NOT NULL,before_owner bigint,after_owner bigint,
  context jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS abuse_flags (
  id bigserial PRIMARY KEY,player_id bigint NOT NULL REFERENCES players(id),kind text NOT NULL,window_start timestamptz NOT NULL,
  evidence jsonb NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','actioned')),
  UNIQUE(player_id,kind,window_start)
);
CREATE TABLE IF NOT EXISTS tribe_invitations (
  tribe_id bigint NOT NULL REFERENCES tribes(id),player_id bigint NOT NULL REFERENCES players(id),invited_by bigint NOT NULL REFERENCES players(id),
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tribe_id,player_id)
);
ALTER TABLE tribes ADD COLUMN IF NOT EXISTS open_join boolean NOT NULL DEFAULT true;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS message_archive (player_id bigint NOT NULL REFERENCES players(id),message_id bigint NOT NULL REFERENCES messages(id),PRIMARY KEY(player_id,message_id));
CREATE INDEX IF NOT EXISTS messages_received ON messages(recipient_id,id DESC);
CREATE INDEX IF NOT EXISTS messages_sent ON messages(sender_id,id DESC);
CREATE INDEX IF NOT EXISTS audit_actor ON audit_log(actor,id DESC);
CREATE OR REPLACE FUNCTION nonnegative_numbers(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_typeof(value) = 'object' AND NOT EXISTS (
   SELECT 1 FROM jsonb_each(value) e WHERE jsonb_typeof(e.value) <> 'number' OR (e.value::text)::numeric < 0
 )
$$;
ALTER TABLE villages DROP CONSTRAINT IF EXISTS village_state_integrity;
ALTER TABLE villages ADD CONSTRAINT village_state_integrity CHECK (
 nonnegative_numbers(state->'resources') AND nonnegative_numbers(state->'units') AND nonnegative_numbers(state->'buildings')
 AND (state->>'reservedPopulation')::numeric >= 0 AND (state->>'loyalty')::numeric BETWEEN 0 AND 100
);
