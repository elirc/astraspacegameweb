CREATE FUNCTION try_component_locks(locks jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE item record; acquired boolean := true;
BEGIN
 -- Serialize only lock admission, not game resolution. This prevents partial try-lock
 -- acquisition from causing livelock between overlapping batches.
 PERFORM pg_advisory_lock(7142,1);
 FOR item IN SELECT * FROM jsonb_to_recordset(locks) AS x(space int,id int) LOOP
  IF NOT pg_try_advisory_xact_lock(item.space,item.id) THEN acquired := false; EXIT; END IF;
 END LOOP;
 PERFORM pg_advisory_unlock(7142,1);
 RETURN acquired;
EXCEPTION WHEN query_canceled OR OTHERS THEN
 PERFORM pg_advisory_unlock(7142,1);
 RAISE;
END $$;
