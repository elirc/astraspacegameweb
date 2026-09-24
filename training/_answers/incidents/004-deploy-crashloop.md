# ANSWER: INC-004 deploy crash loop (edited applied migration)

**Verification:** RUN-VERIFIED. Branch roles against a DB migrated by `main` exit with `Applied migration was modified: 013_npc_players.sql`
after ~21 s. The line-ending variant was also verified on `main` (see below). BUILD: typecheck unaffected (SQL-only change).

## 1. Restore service

What exists today: `compose.production.yaml` uses `build: .` in the `x-app` anchor. There is **no `image:` name/tag**, so "the previous image"
is not an addressable artifact. Options, in order:

1. If the old image still exists locally: `docker image ls` → find the previous build ID, tag it, and pin it
   (`image: warband:rollback` in an override file), then `docker compose -f compose.production.yaml -f rollback.yaml up -d --no-build`.
2. Otherwise `git checkout <previous release sha>` and `docker compose … up -d --build`. This is slow and not reproducible (the base image and
   lockfile resolution may differ), but it works because the DB was **not** changed (see 3).
3. Fastest safe *forward* fix: restore `013_npc_players.sql` byte-for-byte (`git checkout <prev> -- packages/db/migrations/013_npc_players.sql`),
   rebuild and deploy.

The runbook (`docs/runbooks/deployment.md` step 1) says "use one immutable image digest for all roles". The compose file makes that impossible. Fix
that first: `image: ghcr.io/<owner>/warband:${RELEASE:?}` on the anchor, CI builds and pushes once per SHA, and rollback = `RELEASE=<prev> up -d`.

## 2. Mechanism

`apps/server/src/index.ts` → `await initialize()` runs in **every** role (api, resolver, relay, sidejobs). `packages/db/index.ts` `initialize()`
takes the exclusive world lock, then for each `migrations/*.sql` computes `sha256(raw file bytes)` and compares it with `schema_migrations.checksum`.
A comment is still bytes, so there is a mismatch and it throws. The top-level `await` rejects, the process exits 1, and with `restart: unless-stopped` it loops.
Caddy has no healthy upstream, so everyone gets 502.

**Why CI missed it:** every CI database is fresh (`tools/testcontainers.ts`, the GH service container). From an empty `schema_migrations`, every file
is "new". Nothing tests "upgrade from the previous release's database".

## 3. Is the DB half-migrated?

No. The loop is sorted and 013 throws before 015 is reached. And the whole `initialize()` is one `transaction()`, so it would roll back anyway.
015 never ran. (Running migrations inside app startup also means 7 processes race for `worldLock` on every deploy, and resolvers block behind
it. That's another reason to move migrations into a one-shot job.)

## 4. Fix forward + the second trigger

- Revert the comment. Document NPCs in `015` or in `docs/` instead. Applied migrations are immutable, and the code already enforces it.
- **Line endings (verified on `main`):** git here has `core.autocrlf=true` and the repo has no `.gitattributes`. The committed blobs are LF, so a
  fresh Windows checkout gets **CRLF** `.sql` files, and `sha256` differs. Starting the LF main tree against a DB first migrated from a CRLF
  worktree of the same commit fails with `Applied migration was modified: 001_initial.sql`. A deploy built from a Windows laptop checkout
  (`Dockerfile` does `COPY . .`) would crash-loop against a DB migrated by Linux CI, with **no code change at all**.
  Fix: add `.gitattributes` with `*.sql text eol=lf`, *and* hash normalized content (`sql.replace(/\r\n/g, '\n')`). For DBs already migrated from
  CRLF files, accept either the normalized or the legacy raw hash during a transition release.

## 5. Why no alert

`infra/alerts.yaml` has no availability rule. All four rules need the app to be scraped. When every target is down, the series disappear and every
rule is silent. Also, `infra/prometheus.yaml` has no `alerting:`/Alertmanager block, so even firing alerts reach no one (the deployment runbook says so).
Add:

```yaml
- alert: WarbandRoleDown
  expr: sum by (role) (up{job="warband"}) == 0 or absent(up{job="warband"})
  for: 1m
  labels: { severity: critical }
```

(In production, `role` must come from a relabel of the dns_sd name. Today only `instance` = IP:port exists.) Also add an external blackbox probe
of `https://$PUBLIC_HOST/api/health`: it's the only signal that sees Caddy's 502.

## 6. Postmortem (short)

**Impact:** full outage for ~N minutes until rollback.
**Trigger:** a comment added to an already-applied migration. The checksum guard worked as designed, but at the worst point: inside every
production process's startup, after the old containers had been replaced.
**Contributing:** no image tags (slow rollback); migrations run by app roles instead of a gated job; CI never tests an upgrade from the last release's
schema; no `up == 0` alert; no Alertmanager.
**Actions:** immutable tagged images + documented rollback command; a `migrate` one-shot service that must succeed before roles roll (compose
`depends_on: condition: service_completed_successfully`); roles verify-only in production; CI step "restore last release DB → migrate → boot"
plus a lint that fails if any migration file present at the last release tag changed (`git diff --name-only $LAST_TAG -- packages/db/migrations`
must only contain added files); `.gitattributes`; `WarbandRoleDown` + blackbox probe + Alertmanager route.
Concept: curriculum 07 (expand/contract; migrations are append-only).
