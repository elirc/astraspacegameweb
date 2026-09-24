-- Admin NPC list filters by creator and sorts by creation time.
CREATE INDEX IF NOT EXISTS npc_created ON npc_players(created_by,created_at DESC);
