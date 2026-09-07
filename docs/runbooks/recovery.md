# Local operations and recovery

## Start and stop

Use `npm run db:up` and `npm run dev`. Stop the development process with Ctrl+C. Use `docker compose stop` to stop storage services without deleting data. Never run `docker compose down -v` on a world you want to keep.

## Delayed events

Check `/api/health`, API/resolver logs, PostgreSQL health and Redis connectivity. Inspect pending events with `SELECT id,village_id,kind,due_at FROM scheduled_events WHERE status='pending' ORDER BY due_at,id LIMIT 100;`. Restart a resolver only after identifying any repeatedly failing handler. Do not mark an event done manually: that can discard game outcomes. The resolver will catch up from persisted timestamps after recovery.

## Resolver interruption

Transaction-scoped locks release automatically on connection loss, and unfinished events remain pending after rollback. Start a replacement resolver with the same `DATABASE_URL` and `ROLE=resolver`. The integration suite verifies this with a terminated PostgreSQL backend connection, not just a mocked exception.

## Redis interruption

PostgreSQL retains state and unsent outbox rows. Restore Redis, then allow the relay to catch up. Duplicate notifications are safe. The HTTP state endpoint remains authoritative and clients periodically refetch. Do not clear game tables to repair a notification problem.

## Backups

For local development, make a logical backup with `pg_dump` against the world database using a PostgreSQL client and a destination you control. Restore to a **new database** first and verify player/village counts, event backlog and recent reports. This repository does not set up WAL archiving, managed backups or point-in-time recovery. Those must be configured and drilled before a public world is launched.

## Schema and rules changes

The initial schema migration is idempotent and runs at startup. Future schema changes should be added as ordered migrations with explicit version tracking before operating multiple release versions. Do not edit past event payloads or change an in-flight event ID. World config snapshots are pinned to existing events; the typed building/unit catalog is tied to the application release.
