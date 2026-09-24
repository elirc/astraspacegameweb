# Lab 0 reference answers (from the 2026-09-24 run: `ops/evidence/baseline-150rps-3resolvers.jsonl`)

1. **Capacity:** ~110–120 events/s committed with 3 resolvers (e.g. `05:25:18 119.8`, `05:25:50 122.9`). At 150 arrivals/s the backlog never stops growing:
   `pending_due` 1,722 → 8,759 in 90 s, `oldest_s` 10.6 → 70.3. Remember that each battle also creates a `return` event, so arrivals/s ≠ events/s.
2. **The lag panel flattens at 60.0** (`05:26:02` onwards, p50 reaches 60.0 too at `05:26:48`) while the oldest event reaches 111 s. 60 is the top finite bucket
   in `metrics.ts:19`. `histogram_quantile` can't return more than that (see INC-002).
3. **EventLagHigh** went pending at ≈ 05:24:45 and was **firing by 05:27:00** (`for: 2m`), value `6e+01`. The value is the quantile clause pinned at 60,
   and the `oldest_event` clause was also true. Time from the start of injection to firing: ~2.5 min.
4. **Resolver transaction p99 = 30.0** from `05:26:48` onwards: the top bucket of `metrics.ts:39`. The same clipping, and the timer measures *ticks*, including no-op ones (review #15).
5. **Uneven:** per-instance rates swing (`3004: 5.8 / 3002: 0 / 3003: 0` at start, `58.6 / 33.3 / 31.0` later, `3002` at 0.0 at `05:26:25`). Resolvers compete
   for overlapping components.
6. **No.** `resolver_errors` and `lock_retries` stay 0 because busy outcomes are swallowed (`engine.ts` `resolveDue` returns 0 on WB_BUSY). A second source:
   `pg_stat_database.xact_rollback` (163–179 per 6,000-arrival drain on `main`) or Tempo `pg.query:ROLLBACK` root spans (25 in 2 min).
7. A resolver "trace" is one `pg-pool.connect` or a lone `pg.query:SELECT`. 850 of 1,000 sampled traces were exactly that. You can't follow a batch: BEGIN,
   the plan queries, the writes and COMMIT/ROLLBACK are separate traces, because the resolver loop runs with no active span. HTTP requests *are* proper trees,
   because the HTTP instrumentation creates the root. [RUN] A `GET /metrics` trace has 3 `pg-pool.connect` + 3 `pg.query:SELECT` children (the backlog gauges).
   Note the noise: 125 of 200 sampled `warband-api` traces were Prometheus **scrapes**. J3 fixes the resolver side. Excluding `/metrics` from tracing is a one-line follow-up.
8. (Not run by the reference author. This is the expected behaviour from the code.) Killing one resolver: throughput drops by roughly a third on this box. Not exactly a third, since the survivors pick up some slack and contention falls. You notice it on
   **Committed events per second** within ~30 s (the `rate` window). No alert says "a resolver died": `up{instance=…}` goes to 0, but no rule watches `up`.
   You'd only be paged later, through EventLagHigh if the remaining capacity is below the arrival rate. That's the gap `WarbandRoleDown` (INC-004 answer) closes.
