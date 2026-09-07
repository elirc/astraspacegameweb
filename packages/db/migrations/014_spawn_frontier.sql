CREATE TABLE spawn_frontiers (
 world_id bigint PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
 cursor bigint NOT NULL DEFAULT 0 CHECK(cursor >= 0)
);
