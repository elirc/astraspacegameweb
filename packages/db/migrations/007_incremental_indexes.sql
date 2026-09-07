CREATE OR REPLACE FUNCTION sync_village_indexes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'UPDATE' OR OLD.player_id IS DISTINCT FROM NEW.player_id OR OLD.points IS DISTINCT FROM NEW.points THEN
  IF TG_OP <> 'INSERT' AND OLD.player_id IS NOT NULL THEN
   INSERT INTO player_scores(player_id,points) VALUES(OLD.player_id,-OLD.points) ON CONFLICT(player_id) DO UPDATE SET points=player_scores.points-OLD.points;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.player_id IS NOT NULL THEN
   INSERT INTO player_scores(player_id,points) VALUES(NEW.player_id,NEW.points) ON CONFLICT(player_id) DO UPDATE SET points=player_scores.points+NEW.points;
  END IF;
 END IF;
 IF TG_OP <> 'UPDATE' OR (OLD.state->'garrison') IS DISTINCT FROM (NEW.state->'garrison') THEN
  IF TG_OP <> 'INSERT' THEN DELETE FROM support_links WHERE station_id=OLD.id; END IF;
  IF TG_OP <> 'DELETE' THEN INSERT INTO support_links SELECT g.key::bigint,NEW.id,(g.value->>'owner')::bigint FROM jsonb_each(NEW.state->'garrison') g; END IF;
 END IF;
 RETURN NULL;
END $$;
