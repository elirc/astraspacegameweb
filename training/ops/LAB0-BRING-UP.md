# Lab 0: bring the stack up and read it (60–90 min)

Everything after this lab assumes you can do the steps below from memory. You will **observe** your own running
stack. Write your answers in `training/ops/LAB0-NOTES.md` (create it). The reference answers are in `_answers/lab0.md`.

## 0. What you are starting

| Piece | Where it comes from | Port |
|---|---|---|
| PostgreSQL 16, Redis 7 | `compose.yaml` (the dev services) | 55432, 56379 |
| Prometheus, Grafana, Tempo | `training/ops/compose.observe.yaml` (reuses `infra/alerts.yaml`, `infra/grafana/**`, `infra/tempo.yaml`) | 59090, 53300, 53200 / OTLP 54318 |
| Warband roles (api, 3× resolver, relay) | `apps/server/src/bootstrap.ts` started 5 times with different `ROLE` and `PORT` | 3001–3005 |
| Arrival generator | `training/ops/inject.ts` (a stripped-down `tools/sim/load.ts`) | — |

The production topology in `compose.production.yaml` runs the same roles as containers. Prometheus there finds them through
`dns_sd_configs` on the compose network (`infra/prometheus.yaml`). That is why the training copy uses static host ports.

## 1. Start storage and the observability stack

```bash
pnpm install --frozen-lockfile        # once
docker compose -f compose.yaml up -d postgres redis
docker compose -f training/ops/compose.observe.yaml up -d
curl -s http://127.0.0.1:59090/-/ready ; curl -s http://127.0.0.1:53200/ready   # Tempo needs ~15 s
```

Docker Desktop on this laptop can take several minutes to start and has hung before. Wrap commands in `timeout` and
don't debug the daemon for longer than 10 minutes. The fallback is in section 6.

## 2. Seed an isolated world and start five roles

```bash
export DATABASE_URL=postgres://warband:warband_local@127.0.0.1:55432/warband_ops_test
INJECT_SEED=1 INJECT_SECONDS=0 npx tsx training/ops/inject.ts         # 2,000 players, 20,000 villages
export REDIS_URL=redis://127.0.0.1:56379 NODE_ENV=development WORLD_SPEED=1 \
       OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:54318
ROLE=api      PORT=3001 npx tsx apps/server/src/bootstrap.ts > api.log 2>&1 &
ROLE=resolver PORT=3002 npx tsx apps/server/src/bootstrap.ts > r1.log  2>&1 &
ROLE=resolver PORT=3003 npx tsx apps/server/src/bootstrap.ts > r2.log  2>&1 &
ROLE=resolver PORT=3004 npx tsx apps/server/src/bootstrap.ts > r3.log  2>&1 &
ROLE=relay    PORT=3005 npx tsx apps/server/src/bootstrap.ts > relay.log 2>&1 &
```

(PowerShell: set `$env:ROLE='api'; $env:PORT='3001'` and use `Start-Process -NoNewWindow`.)
Open http://127.0.0.1:59090/targets. You should see 5 targets `up` and 1 `down` (3006, sidejobs, deliberately not started).

## 3. Generate load you can see

```bash
INJECT_RATE=150 INJECT_SECONDS=90 npx tsx training/ops/inject.ts
```

Open Grafana (http://127.0.0.1:53300, admin / training) → dashboard **Warband world health**.
Also keep http://127.0.0.1:59090/alerts open.

## 4. Questions to answer from what you see, not from the code

1. What is the highest arrival rate your three resolvers keep up with? Find it with `sum(rate(warband_events_resolved_total[30s]))`
   and `max(warband_oldest_event_seconds)`. Note: `events_resolved` also counts the `return` events that battles create.
2. The **Event lag p50 / p99** panel stops rising at some value while **Oldest pending event** keeps growing. At what value, and why?
3. Which alert fires first, and after how long? Which clause of its expression fired it (look at the value on /alerts)?
4. **Resolver transaction p99** reaches an exact round number too. What does that tell you about the panel?
5. Is the load evenly spread over the three resolvers? Use `sum by (instance)(rate(warband_events_resolved_total{role="resolver"}[30s]))`.
6. `warband_resolver_errors_total` and `warband_lock_retries_total` stay at 0 during the run. Does that mean the resolvers never collided?
   Find a second source of truth. Hint: `pg_stat_database.xact_rollback`, or Tempo.
7. In Grafana → Explore → Tempo, search for `{resource.service.name="warband-resolver"}`. What does one resolver "trace" contain? Could you
   follow one resolver batch from start to commit? Compare with a trace from `warband-api` for `POST /api/villages/:id/command`.
8. Stop one resolver (`kill` its PID). What changes on the dashboard, and how long until you notice? Which signal would page someone?

## 5. Clean up

```bash
kill %1 %2 %3 %4 %5                     # or Stop-Process on the node PIDs listening on 3001-3005
docker compose -f training/ops/compose.observe.yaml down -v
docker compose -f compose.yaml stop     # never `down -v` on a world you want to keep
```

## 6. Fallback when Docker won't start

Use the recorded evidence from a real run on this laptop (2026-09-24) in `ops/evidence/baseline-150rps-3resolvers.jsonl`: PromQL values sampled every
10 s during a 150 arrivals/s run (inject started 05:24:35, stopped 05:26:05). Answer questions 1–6 from those samples, and mark your notes `FALLBACK`.
