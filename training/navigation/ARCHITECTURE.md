# Architecture reconstruction (with evidence)

Written from the code at `3ef7432`. Where the repo docs say the same thing, they're cited as agreeing. Where they differ, the code wins and the difference is noted.

## System context

```
browser (React SPA + service worker)  ──HTTPS──►  Caddy edge (infra/Caddyfile)  ──►  api ×2  (ROLE=api)
     ▲  WebSocket /api/ws (hints only)                                               │
     └──────────────────────────────────────────── Redis pub/sub "warband:events" ◄── relay ×1 (outbox → Redis)
                                                    Postgres 16 (authority) ◄──────── resolver ×3 (scheduled events)
                                                    Redis 7 (limits, BullMQ, caches) ◄ sidejobs ×1 (email, push, rankings, maintenance, NPCs)
Prometheus (dns_sd scrape of all roles) · Grafana · Tempo (OTLP/HTTP 4318)            SMTP · Web Push services
```

Evidence: `compose.production.yaml` (roles, replicas, edge, observability), `apps/server/src/index.ts` (what each `ROLE` runs), `infra/prometheus.yaml` (dns_sd names).
Every role is the **same image and entrypoint** (`Dockerfile` CMD → `bootstrap.ts` → `index.ts`). `ROLE` only gates which `setInterval` loops do work. Every role
still builds the full Fastify app, listens on 3001 and serves `/metrics` and `/api/*`.

## Components

| Component | Code | Owns |
|---|---|---|
| HTTP transport | `apps/server/src/transport/*.ts` | route registration, schemas (`contracts.ts` → OpenAPI), auth hook, CSRF-ish origin check, rate-limit hook, WS endpoint |
| Application | `apps/server/src/application/*.ts` | use cases: `game.ts` (state, commands, social), `auth.ts`, `admin.ts`, `npcs.ts`, `replay.ts`, `spawning.ts` |
| Engine | `application/engine.ts` | `command()`, `drain()`, `resolveEvent()`, `resolveDue()`, `replayEvent()` |
| Event domain | `apps/server/src/domain/events/{registry,types}.ts`, `handlers/*.ts` | pure handlers per event kind returning effects |
| DB kernel | `packages/db/index.ts`, `causality.ts`, `schema.ts`, `migrations/*.sql` | pool, `transaction()` with retry, advisory locks, migrations-at-boot, causal lock planner |
| Shared rules | `packages/shared/game.ts`, `npc.ts`, `spawning.ts` | formulas, Zod schemas, config catalog. Imported by both web and server |
| Web client | `apps/web/src/App.tsx` (2.6k lines), `TileMap.tsx`, `queryRefresh.ts`, `api.ts` | React Query server state, WS hint → coalesced refetch |
| Ops tooling | `tools/sim/*.ts` (chaos, load, recovery, redis-outage, replay), `infra/*` | drills and deploy config |

Dependency boundaries are **enforced**: `eslint.config.js` `boundaries/dependencies` (transport → application only; domain → nothing infrastructural) and
`tools/check-boundaries.mjs`, which asserts the linter *rejects* three forbidden imports.

## Flow 1: a player sends an attack (`POST /api/villages/:id/command`)
1. `transport/app.ts` `onRequest`: origin check for non-GET, then `authenticate(req)` (`application/auth.ts`: JWT cookie + `session_families` row + ban check).
2. `transport/contracts.ts` `preHandler`: `takeLimit('player:<id>:movement', 30/min)` (Redis `INCR`, Postgres `rate_buckets` fallback in `redis.ts`).
3. `application/game.ts` `post_api_villages_id_command` → `engine.ts` `command(owner, id, raw, Idempotency-Key)`.
4. `transaction()` (`packages/db/index.ts`: `BEGIN; SET LOCAL lock_timeout='5s'`; retries on 40001/40P01/55P03/WB_BUSY up to 5×) →
   `pg_advisory_xact_lock(7141, owner)` → `idempotency_keys` lookup (replay or 409).
5. `lockCausalComponent(tx, [village, target], undefined, owner)` (`causality.ts`): shared world lock, `plan()`, `try_component_locks`, re-plan.
6. `drain(tx, plan.until)`: resolve anything already due in this component *first*, so costs and units are checked against the present.
7. `execute()`: `withVillageLock`, validate, `pay`, `event(tx, target, 'movement', now + travel, …)` → `scheduled_events` row; `notify(target owner, 'incoming_attack')` → `outbox`; `audit_log`.
8. Insert `idempotency_keys`, `COMMIT`. `afterCommit` callbacks → `committedResolutions` → `warband_event_lag_seconds`.

## Flow 2: the attack lands (resolver)
1. `index.ts` resolver interval (50 ms, `resolving` guard) → `resolveDue()`: read `batchSize*8` due candidates, **random 300-row window**, `transaction(…, 1)`.
2. `lockCausalComponent(tx, villages, cutoff)`. On busy: `WB_BUSY` → rollback → `return 0` (no metric; see INC-001).
3. `drain`: `SELECT … FOR UPDATE` due events of the component, ordered `(due_at,id)`; `withVillageLocks`; per event `resolveEvent` →
   `applyEvent` → `handlers[kind]` (pure) → effects (new events, reports, notifications). A proxy records every query's rows for replay.
4. Bulk writes: `scheduled_events` (new), `event_journal`, `villages` (+ trigger `sync_village_indexes` → `player_scores`, `support_links`), `reports`, `outbox`,
   and status `done`. `COMMIT` → the lag histogram.

## Flow 3: the defender's browser hears about it
1. Relay (`index.ts`, every 100 ms): `SELECT * FROM outbox WHERE sent_at IS NULL … FOR UPDATE SKIP LOCKED` → `redis.publish('warband:events')` per row →
   `incoming_attack` rows also insert a `push` `side_effects` row → `UPDATE outbox SET sent_at`.
2. Every api instance's subscriber (`index.ts`) parses the event and sends it to `sockets.get(player_id)` (`transport/app.ts` map), adding `server_now`.
3. `App.tsx` socket `onmessage` → `refreshRef.current.request()` (`queryRefresh.ts` coalesces) → `GET /api/state` re-reads the truth.
4. Sidejobs (`sidejobs.ts`): the dispatch timer enqueues BullMQ `deliver` jobs → worker: `side_effects … FOR UPDATE` → `webpush.sendNotification` → `delivered_at`.

## Data model (authority in Postgres)
- `worlds`/`config_versions`: immutable rule versions. Events pin `config_version` (`drain` loads the `configCache`).
- `villages` (JSONB `state` + relational owner/x/y/points; CHECKs in `008_scalar_integrity.sql`), derived `player_scores` and `support_links` maintained by trigger (`007`, `010`).
- `scheduled_events` (pending/done/cancelled; partial indexes `events_due`, `events_village`, `events_pending_owner/origin/point_writer`).
- `event_journal` (before/after state + read trace: replay), `village_snapshots`, `reports`, `outbox`, `side_effects`, `idempotency_keys`, `audit_log`, `abuse_flags`.
- Sessions: `session_families` + `session_tokens` (hashed, single-use; reuse revokes the family).

## Test strategy (what exists)
- `tests/engine.integration.test.ts` (1.5k lines) and `tests/api.integration.test.ts` against real Postgres `*_test` DBs; `tools/testcontainers.ts` runs them in containers.
- `tests/rules.test.ts` property tests (fast-check). Client unit tests `client-api`, `client-refresh`, `map-canvas`. [RUN] 63/63 non-DB tests pass.
- Playwright e2e (`tests/e2e/*.spec.ts`, 4 browser projects). Drills: `tools/sim/chaos.ts` [RUN: passed], `redis-outage.ts` [RUN: passed after one cold failure], `recovery.ts`, `load.ts`.
- **Gaps:** no test of alert rules, no upgrade-from-previous-schema test, no multi-socket WS test, no multi-resolver throughput gate.

## Build and deploy
`Dockerfile` (pnpm install frozen → `pnpm run build` → run with `tsx` as the `node` user) → `compose.production.yaml` (`build: .`, **no image tag**) → Caddy TLS edge.
Migrations run inside every process at boot (`initialize()`). CI (`.github/workflows/ci.yml`): `check` (lint, build, containers, redis-outage, e2e), `chaos` (chaos + recovery),
manual `sustained-load`. Docs vs code: `docs/runbooks/deployment.md` describes a separate migrate step and immutable digests. The compose file implements neither.
