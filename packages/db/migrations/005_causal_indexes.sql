CREATE TABLE player_scores(player_id bigint PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,points bigint NOT NULL DEFAULT 0);
INSERT INTO player_scores SELECT player_id,sum(points) FROM villages WHERE player_id IS NOT NULL GROUP BY player_id;
CREATE TABLE support_links(home_id bigint NOT NULL REFERENCES villages(id),station_id bigint NOT NULL REFERENCES villages(id),player_id bigint NOT NULL REFERENCES players(id),PRIMARY KEY(home_id,station_id));
INSERT INTO support_links SELECT g.key::bigint,v.id,(g.value->>'owner')::bigint FROM villages v CROSS JOIN LATERAL jsonb_each(v.state->'garrison') g;
CREATE INDEX support_player ON support_links(player_id);
CREATE INDEX support_station ON support_links(station_id);
CREATE OR REPLACE FUNCTION sync_village_indexes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' AND OLD.player_id IS NOT NULL THEN
  INSERT INTO player_scores(player_id,points) VALUES(OLD.player_id,-OLD.points) ON CONFLICT(player_id) DO UPDATE SET points=player_scores.points-OLD.points;
 END IF;
 IF TG_OP <> 'DELETE' AND NEW.player_id IS NOT NULL THEN
  INSERT INTO player_scores(player_id,points) VALUES(NEW.player_id,NEW.points) ON CONFLICT(player_id) DO UPDATE SET points=player_scores.points+NEW.points;
 END IF;
 IF TG_OP <> 'INSERT' THEN DELETE FROM support_links WHERE station_id=OLD.id; END IF;
 IF TG_OP <> 'DELETE' THEN
  INSERT INTO support_links SELECT g.key::bigint,NEW.id,(g.value->>'owner')::bigint FROM jsonb_each(NEW.state->'garrison') g;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER village_indexes AFTER INSERT OR UPDATE OR DELETE ON villages FOR EACH ROW EXECUTE FUNCTION sync_village_indexes();
CREATE INDEX events_pending_owner ON scheduled_events(((payload->>'owner')::bigint),due_at,id) WHERE status='pending';
CREATE INDEX events_pending_origin ON scheduled_events(((payload->>'origin')::bigint),due_at,id) WHERE status='pending';
CREATE OR REPLACE FUNCTION nonnegative_integers(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT nonnegative_numbers(value) AND NOT EXISTS(SELECT 1 FROM jsonb_each(value) e WHERE (e.value::text)::numeric <> trunc((e.value::text)::numeric))
$$;
ALTER TABLE villages ADD CONSTRAINT village_integer_counts CHECK(nonnegative_integers(state->'units') AND nonnegative_integers(state->'buildings'));
