INSERT INTO config_versions(world_id,version,config,effective_at)
SELECT DISTINCT ON (e.world_id,e.config_version) e.world_id,e.config_version,coalesce(e.payload->'config',w.config),e.created_at
FROM scheduled_events e JOIN worlds w ON w.id=e.world_id
ORDER BY e.world_id,e.config_version,e.id
ON CONFLICT DO NOTHING;
ALTER TABLE scheduled_events ADD CONSTRAINT event_config_version FOREIGN KEY(world_id,config_version) REFERENCES config_versions(world_id,version) NOT VALID;
ALTER TABLE scheduled_events VALIDATE CONSTRAINT event_config_version;
