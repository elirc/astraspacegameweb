# Warband — The Crownlands

Persistent browser strategy game with construction, recruitment, scouting, battles, support, conquest, resource caravans, tribes, diplomacy, forums, private messages and rankings. The local world runs at 180× speed.

## Run

Requires Node 22 and Docker Desktop with Linux containers. The workspace uses pnpm 10.15.1.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm configure:local
docker compose up -d postgres redis mailpit
pnpm dev
```

Open http://127.0.0.1:4178. Guest accounts can be saved by registering in Settings; registration preserves the village. Access cookies expire after 15 minutes and refresh families after 30 days. Refresh tokens rotate, and reuse revokes the family. Logout, password recovery and moderation revoke sessions.

`configure:local` generates local JWT, metrics and Web Push keys without printing them. The bootstrap loads `.env`; existing values are preserved. Mailpit captures development email at http://127.0.0.1:58025. PostgreSQL data persists in Docker volumes; stopping containers does not erase it.

## Game and administration

The village overview, building queues, per-unit recruitment, map and command confirmation are usable on desktop and mobile. Reports and messages support cursor pagination, read status, archive and restore. The map streams bounded tiles into culled Pixi particle containers and provides a Canvas fallback, keyboard controls and a searchable village list. `?renderer=canvas&page=map` explicitly selects the fallback.

World rules live in `packages/config/worlds/w1.json`. The database retains immutable versions for scheduled events. Administrators can validate and preview changes, apply a new version, inspect players and events, replay individual events or a village time range without changing the world, review audit records, moderate accounts, cancel movements and review suspicious command patterns. Existing population costs cannot be changed without an explicit reservation migration.

Register the operator's account, then grant access from the host:

```sh
pnpm admin grant exact-account-email
```

For an offline investigation, export and verify a village timeline in a disposable database:

```sh
pnpm replay --village 123 --from 2026-09-01T00:00:00Z --to 2026-09-02T00:00:00Z --out artifacts/replay.json
```

The source history is read in a consistent read-only transaction. The command creates and drops its own scratch database and returns state/ownership diffs, missing history and effect verification. See [replay evidence](docs/adr/003-replay-evidence.md) for checkpoint semantics and database privileges.

No account is automatically granted administrative access. The OpenAPI document is at `/api/openapi.json` and its interactive viewer at `/api/docs` after signing in.

The PWA caches the application shell for offline viewing. Game commands require a connection. Web Push requires generated VAPID keys and browser permission; email and push delivery are durable PostgreSQL side effects retried through BullMQ. Redis carries notifications and caches, never authoritative game events.

## Verification

See the [final improvements report](docs/final-improvements.md) for the latest application changes, verification status and prioritized suggestions.

```sh
pnpm config:validate
pnpm lint
pnpm build
pnpm test:containers
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

Database tests use separate databases ending in `_test`; they preserve the playable world. `TEST_DATABASE_URL` and `API_TEST_DATABASE_URL` override their connections. Browser tests create test accounts and villages in the running local game. Screenshots, traces and the HTML report are saved under `artifacts/`, `test-results/` and `playwright-report/`.

Operational drills run against a separate Docker project and ports:

```sh
docker compose -f infra/chaos/compose.yaml up -d --wait postgres redis
pnpm test:chaos
pnpm test:recovery
pnpm test:load
```

The default load test seeds 2,000 players and 50,000 villages, then injects 1,000 arrivals each second for ten minutes. It fails when the required completion count, event p99 or API p95 is missed. A short probe is diagnostic and cannot certify the sustained target. Do not run benchmarks alongside builds or recovery drills. See [verification evidence](docs/verification.md) and the [completion ledger](docs/production-work.md) for measured results and outstanding acceptance gates.

## Deployment and architecture

`pnpm build && pnpm start` serves the built application on port 3001. The Dockerfile builds the workspace and runs as the non-root `node` user. `compose.production.yaml` separates API, resolver, relay and side-job processes and supplies HTTPS ingress, Prometheus, Grafana and Tempo. The deployment requires operator-provided private database/Redis connections, a domain, production secrets and SMTP settings. No public deployment has been performed.

PostgreSQL transactions own simulation state, scheduled events, reports and outbox records. Events resolve in `(due_at, id)` order. Causal component locks include affected players and villages so morale, stationed troops and return redirection remain consistent while unrelated components can proceed. Configuration changes use an exclusive world gate. Every game write is idempotent; authentication uses explicit session and single-use token semantics.

See [architecture](docs/architecture.md), [component locking](docs/adr/001-causal-components.md), and [operational runbooks](docs/runbooks/deployment.md). Sharding into additional worlds, read replicas and historical table partitioning are the specification's later scaling path.

```text
apps/web/src/       React screens, illustration, map, UI state and styles
apps/server/src/    Transport routes, application use cases, pure event handlers and services
packages/shared/   Pure rules and validated commands
packages/config/   Versioned world catalogs
packages/db/       Migrations, typed schema, transactions and locks
tools/sim/         Replay, sustained load, crash and recovery drills
tests/             Property, integration and browser regressions
infra/             Production deployment, observability and backup configuration
```

## Developer NPC residents

Administrators can create and manage persistent NPC players from **World administration ? npcs**. Choose randomized action intervals, automatic building, play style and raid targets; edit a selected group or pause all NPCs. See [NPC controls and operations](docs/npcs.md).

## World frontier and castle map

New accounts settle on a spaced, expanding frontier shared with developer NPCs. Sparse starts receive nearby ruined keeps; existing coordinates are preserved. The map uses dark stone fortresses and a shared Pixi/Canvas art atlas. See [placement research and behavior](docs/spawning.md).
