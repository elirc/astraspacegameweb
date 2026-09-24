-- NPC players are administrator-created accounts driven by the sidejobs NPC loop
-- (apps/server/src/application/npcs.ts). One row per NPC; the player row owns villages.
CREATE TABLE npc_players (
 player_id bigint PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true,
 style text NOT NULL DEFAULT 'balanced' CHECK(style IN ('builder','balanced','raider')),
 auto_build boolean NOT NULL DEFAULT true,
 min_delay_seconds integer NOT NULL DEFAULT 30 CHECK(min_delay_seconds BETWEEN 5 AND 86400),
 max_delay_seconds integer NOT NULL DEFAULT 120 CHECK(max_delay_seconds BETWEEN min_delay_seconds AND 86400),
 target_mode text NOT NULL DEFAULT 'abandoned' CHECK(target_mode IN ('abandoned','rivals')),
 seed integer NOT NULL,
 turn bigint NOT NULL DEFAULT 0 CHECK(turn>=0),
 next_action_at timestamptz NOT NULL,
 last_action_at timestamptz,
 last_action jsonb,
 created_by bigint REFERENCES players(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX npc_due ON npc_players(next_action_at,player_id) WHERE enabled;
