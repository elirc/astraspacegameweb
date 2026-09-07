-- Reserve page space for frequently updated village aggregates. This enables
-- PostgreSQL HOT updates without weakening durability or integrity constraints.
ALTER TABLE villages SET (
 fillfactor=70,
 autovacuum_vacuum_scale_factor=0.02,
 autovacuum_vacuum_threshold=1000,
 autovacuum_analyze_scale_factor=0.02
);
