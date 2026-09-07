-- Backward-compatible admission: omitted shared flags keep exclusive semantics.
CREATE OR REPLACE FUNCTION try_component_locks(locks jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE item record; acquired boolean := true;
BEGIN
 PERFORM pg_advisory_lock(7142,1);
 FOR item IN SELECT * FROM jsonb_to_recordset(locks) AS x(space int,id int,shared boolean) LOOP
  IF coalesce(item.shared,false) THEN
   acquired := pg_try_advisory_xact_lock_shared(item.space,item.id);
  ELSE
   acquired := pg_try_advisory_xact_lock(item.space,item.id);
  END IF;
  IF NOT acquired THEN EXIT; END IF;
 END LOOP;
 PERFORM pg_advisory_unlock(7142,1);
 RETURN acquired;
EXCEPTION WHEN query_canceled OR OTHERS THEN
 PERFORM pg_advisory_unlock(7142,1);
 RAISE;
END $$;
