# ANSWER: INC-001 resolver oldest-first

**Verification:** RUN-VERIFIED on this laptop (see `_answers/evidence/runs-2026-09-24.md`). Typecheck passes on the branch.

## Root cause

`resolveDue()` (`apps/server/src/application/engine.ts`) is called every 50 ms by every resolver process (`apps/server/src/index.ts`,
`RESOLVER_POLL_MS`). On `main` each process reads `batchSize*8` (2,400) due candidates and takes a **random** 300-row window. That random offset is
the only thing that spreads concurrent resolvers over different parts of the backlog. It is an implicit sharding mechanism with no comment
saying so.

The PR makes every resolver select **the same** 300 oldest rows. Then:

1. All three call `lockCausalComponent()` (`packages/db/causality.ts`) on the same village set. Only one `try_component_locks(...)` succeeds.
2. The losers `retry()` → throw `WB_BUSY`. `resolveDue` runs its transaction with `maxAttempts = 1`, so `transaction()` rolls back and rethrows
   **without** touching `dbCounters` (`packages/db/index.ts`: `exhausted` only counts WB_BUSY when `maxAttempts > 1`). `resolveDue` then catches
   `WB_BUSY` and **returns 0**.
3. 50 ms later the losers read the same head again. The winner is still inside a multi-second `drain`, so they fail again. The work is
   serialized behind whichever process got the lock, and every failed attempt still paid for `pg_advisory_xact_lock_shared` plus one
   `plan()` query, a join over **all** due pending events. That wasted planning runs on the same Postgres the winner is writing to. So three
   resolvers end up **slower** than the old three (151–154 s vs 91–115 s) and not much faster than one.

Why one resolver is unaffected: nobody to collide with. The in-process profile is 78.4 s vs 78.7 s. The oldest-first batches are smaller
(300 vs ~522 events per tick, because the cutoff `min(dbNow, last.due_at)` is earlier), but the per-event write cost (journal, reports,
events, villages, outbox) dominates.

## Why nothing looked broken

- `warband_resolver_errors_total` only counts thrown errors. WB_BUSY is swallowed and returns 0.
- `warband_lock_retries_total` and `warband_lock_retry_exhaustions_total` are fed by `dbCounters`. The `maxAttempts = 1` path increments neither.
- `warband_resolver_transaction_seconds` observes **every tick, including the no-op ones**. Losing ticks are fast, so they pull the histogram
  down. The panel title says "transaction", but it measures a tick.
- Logs: nothing is logged on the busy path.

The signals that *did* show it:
- `pg_stat_database.xact_rollback` (163–179 → 568–649 per drain, about 3.5×) and `xact_commit` (about 2× more, smaller transactions).
- Tempo: `pg.query:ROLLBACK` root spans from `warband-resolver`.
- Per-instance throughput alternating between 0 and everything (`05:33:49  0.0 / 96.0 / 0.0`), i.e. the resolvers take turns rather than working in parallel.

## Senior diagnostic path

1. Scope: did anything else change? The release diff has one resolver change, so start there.
2. Is it capacity or correctness? `oldest_s` climbs linearly and resolved/s is flat below the arrival rate, so it's capacity.
3. Where's the time going? Tick-level outcome counts, which don't exist. So go one layer down: `pg_stat_database` rollbacks and `pg_stat_statements`
   (the plan query's call count doubles), then Tempo ROLLBACK spans.
4. Controlled A/B: `training/ops/inject.ts` backlog with 1 vs 3 resolvers on both builds. The 1-resolver parity isolates the problem to *concurrency*.
5. Read the selection code with the question "what makes two processes pick different work?"

## Fix

1. Revert to the randomized window **and document why it exists** (a comment plus an ADR line in `docs/adr/001-causal-components.md`).
   If fairness (oldest-first) matters, get it without collisions:
   - Shard by `hash(village_id) % RESOLVER_SHARDS` with a lease per shard (advisory lock `pg_try_advisory_lock(7140, shard)`). Each resolver owns shards,
     so it is still oldest-first *within* a shard. Or:
   - Keep the random window but bias the offset toward the head (e.g. offset from the first 2× batch). This bounds starvation.
2. Make contention a first-class metric:
   `warband_resolver_ticks_total{outcome="committed|busy|empty|error"}` and `warband_resolver_batch_events` (histogram of events per committed tick),
   and move `resolverDuration.observe` to committed ticks only (rename it to `…_tick_seconds{outcome}`).
3. Alert: `sum(rate(warband_resolver_ticks_total{outcome="busy"}[5m])) / sum(rate(warband_resolver_ticks_total{outcome=~"busy|committed"}[5m])) > 0.5`
   **and** `max(warband_pending_events) > 0` for 10m (warning). "Resolvers mostly lose lock races while work is waiting."

## Regression protection

- Unit: extract `selectCandidates(candidates, batchSize, rng)` and test that two different RNG seeds yield different windows when
  `candidates.length > batchSize`. This documents the invariant.
- Benchmark gate (nightly, `sustained-load` style job in `.github/workflows/ci.yml`): a 6,000-arrival drain with 1 and 3 resolvers. Fail if the
  3-resolver time is not below the 1-resolver time, or if rollbacks/commits > 0.5. That catches this class without flaky absolute thresholds.

## Model postmortem (short)

**Impact:** peak-hour battles resolved up to ~2 min late for about 3 h. No data loss: events stayed pending and resolved in order of `(due_at,id)` within each batch.
**Trigger:** PR "resolve strictly oldest-first" removed the random candidate window that desynchronized concurrent resolvers.
**Detection:** EventLagHigh via the `oldest_event` clause. Contention itself was invisible: no metric counted swallowed `WB_BUSY` outcomes.
**Why review missed it:** the random window had no comment explaining its purpose. The PR's reasoning (fairness → lower p99) is true for one process
and false for N. No benchmark ran with more than one resolver.
**Actions:** revert (done); tick-outcome metric + busy-ratio alert; comment + ADR note on why selection is randomized; nightly multi-resolver drain benchmark;
review checklist item "does this change how concurrent workers pick work?".
