# S2: A path to 1,000 arrivals/s with p99 lag under 2 s (senior)

## Situation
The open acceptance gate (`docs/production-work.md`) is 1,000 arrivals/s for ten minutes with p99 committed lag < 2 s and API p95 < 150 ms.
Every recorded attempt failed. The best short probe reached 8,706/10,000 arrivals with p99 31.6 s (`docs/verification.md`). Your M2 curve shows where one
machine tops out. A publisher wants to launch a 50,000-player world. War nights concentrate arrivals: 40% of a night's battles land in the first minute after
the hour ("noble trains").

## The problem to solve
Write a capacity design (≤ 3 pages) and prove its first step with a measurement. It must cover:
1. **Work partitioning:** how N resolvers split the backlog without colliding (INC-001) *and* without breaking the causal-component rules
   (`docs/adr/001-causal-components.md`: morale reads player-wide points; supports link villages; conquest redirects returns).
2. **Per-transaction cost:** what `drain` writes per event (`event_journal` with full before/after state and read traces, `reports`, `scheduled_events`,
   `villages`, `outbox`) and which of it could be smaller, deferred or batched differently. Keep replay working (`docs/adr/003-replay-evidence.md`).
3. **Database:** where the write volume goes (WAL, autovacuum, HOT updates. See the fillfactor note in `docs/architecture.md`), indexes that are paying for
   themselves, and when partitioning `scheduled_events`/`event_journal` by time pays off.
4. **Backpressure and the hour-mark spike:** what the system does at 5× the average for 60 s. Is a 30 s backlog acceptable if it drains in 90 s? Put that in SLO terms.
5. **The measurement plan:** which harness (`tools/sim/load.ts` on dedicated hardware, or `training/ops/inject.ts` for shape), which signals decide
   pass/fail, and how you avoid fooling yourself (committed-lag vs applied-lag, noisy laptop, warm vs cold cache).

## Constraints
- The engine's determinism and crash-safety guarantees must hold (`tools/sim/chaos.ts` must still pass).
- No "rewrite in Go". A queue in front of Postgres is allowed only if you explain what it does to the "Postgres is the authority" rule (`docs/architecture.md`).
- The first step must be implemented on a branch and measured with M2's method: before/after, ≥ 2 runs each.

## Pressure points
- "Just shard by village id". Then what about a support army stationed across shards, or morale that reads the attacker's *total* points?
- If you move journal writes out of the transaction, what does the replay tool (`application/replay.ts`) lose?
- Your partitioning uses advisory-lock leases per shard. What happens when a resolver holding a lease is SIGKILLed mid-drain?

Sealed answer: `_answers/ladder/S2.md`
