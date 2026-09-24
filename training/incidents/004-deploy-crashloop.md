# INC-004: release rollout, and every new container restarts in a loop

**Branch:** `training/incidents/004-deploy-crashloop` · **Severity:** SEV-1 (full outage once the old containers were replaced) · **Timebox:** 45 min + rollback drill

## Timeline (as the deployer typed it into the channel)

- 14:02 CI green on `main` (lint, build, `test:containers`, e2e). Built the image and started `docker compose -f compose.production.yaml up -d`.
- 14:03 `edge` (Caddy) serving 502 to everyone.
- 14:04 `docker compose ps`: `api`, `resolver`, `relay` and `sidejobs` show `Restarting (1)`. The old containers are already gone.
- 14:05 Prometheus `up{job="warband"}` = 0 for every target. Grafana panels say "No data". **No alert fired.**

## Logs (every role prints the same thing each restart)

```
/app/packages/db/index.ts:148
        if (prior.checksum !== checksum) throw new Error('Applied migration was modified: ' + name);
                                               ^
Error: Applied migration was modified: 013_npc_players.sql
Node.js v22.16.0
```

Reproduced on a laptop against a database migrated by the previous release: the process exits with code 1 after about 20 s.

## The release contained one DB-related PR

```diff
--- a/packages/db/migrations/013_npc_players.sql
+++ b/packages/db/migrations/013_npc_players.sql
@@ -1,2 +1,4 @@
+-- NPC players are administrator-created accounts driven by the sidejobs NPC loop
+-- (apps/server/src/application/npcs.ts). One row per NPC; the player row owns villages.
 CREATE TABLE npc_players (
--- /dev/null
+++ b/packages/db/migrations/015_npc_admin_index.sql
+-- Admin NPC list filters by creator and sorts by creation time.
+CREATE INDEX IF NOT EXISTS npc_created ON npc_players(created_by,created_at DESC);
```

## Your job

1. **Restore service first.** Write down the exact commands to roll back with what `compose.production.yaml` gives you today.
   What stops you from rolling back to "the previous image"? (Read the `x-app` anchor and the Dockerfile.)
2. Explain the mechanism: which code runs at startup in **every** role, and what it compares. Why did CI not catch this?
3. Does 015 ever run? Is the database now in a half-migrated state?
4. Fix forward properly. Then name a second way a byte-identical-looking checkout can trigger the same error.
   Check how git hands `.sql` files to a Windows checkout of this repo.
5. Why did no alert fire when every target was down? Write the missing rule.
6. Postmortem, including the deploy-process changes (not just the code change).

Runbook to compare against: `docs/runbooks/deployment.md` step 4.
Concept page: [07 Zero-downtime migrations](../../../opusorganize/apprenticeship/curriculum/07-zero-downtime-migrations.md).
Sealed answer: `_answers/incidents/004-deploy-crashloop.md`
