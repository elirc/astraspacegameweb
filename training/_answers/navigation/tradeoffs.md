# Reference "Why?" answers

## W1: timers as Postgres rows, polled
- **Problem:** thousands of timers whose outcomes interact (battles change ownership, which changes later battles) must resolve in a deterministic order and survive crashes.
- **Naive:** one BullMQ delayed job per timer (v1 did this).
- **Where it fails:** job order ≠ game order under retries and parallel workers. A job can run while the DB transaction for its inputs is uncommitted. Redis
  becomes a second source of truth, and a Redis flush loses timers.
- **Options:** A) delayed jobs; B) rows + polling in `(due_at,id)` order inside DB transactions; C) an in-memory scheduler per shard with a WAL.
- **Choice: B.** Ordering, atomicity with the state change, and crash recovery all come from Postgres (`drain` commits the event status with its effects).
- **Failure modes:** polling cost (50 ms × roles), contention between pollers (INC-001), throughput bound by one DB (M2, S2).
- **Tested:** `tools/sim/chaos.ts` (kill, backend terminate, DB restart, Redis flush → identical state) [RUN: passed]; engine integration tests (500 tied attacks).
- **Monitored:** `warband_event_lag_seconds`, `warband_oldest_event_seconds`, `warband_pending_events`.
- **Revisit:** when one Postgres can't carry the write volume even after S2's per-event savings. Then shard worlds before sharding a world.

## W2: causal components
- Global lock: correct but serial, capped at one resolver's throughput. Per-village locks: fast but wrong, because morale reads player totals and support
  casualties touch the home village (the ADR lists these). Components lock exactly the transitive set that can interact, with shared vs exclusive player locks.
- **Cost:** planning is a graph query over *all* due events (`causality.ts` `sql`), run twice per transaction, and the try-lock design turns overlap into silent
  rollbacks (INC-001: 163–179 per drain on `main`, ~600 on the branch).
- **Tested:** engine integration tests for shared point readers vs exclusive writers, conquest redirects, and support casualties (`docs/verification.md` list).
- **Monitored:** badly. There's no busy/rollback metric (review #4).
- **Revisit:** when the plan query dominates (large backlogs), or when components become world-sized (a mega-tribe war) and the design degenerates to a global lock.

## W3: journal records reads
- **Problem:** "my attack resolved wrong" disputes and rule-bug forensics need proof of *what the handler saw*.
- **Options:** A) store nothing (re-simulate from snapshots, which is ambiguous when the inputs changed); B) store before/after state only (can't tell a wrong input
  from a wrong rule); C) store the read trace (exact replay, detects divergence at step N, the error in `replayEvent`).
- **Choice: C**, plus effect hashes (`hashEffects`) to keep the journal smaller.
- **Cost:** journal insert ≈ 19% of resolver time in the M2 profile, plus storage growth. **Revisit** when capacity (S2) matters more than byte-exact replay
  of every event. Keep C for conquests and sample the rest.

## W4: migrations at boot
- **Why chosen:** single-command local dev (`pnpm dev` just works), tests get fresh schemas automatically, and the checksum guard catches edited history.
- **Where it fails:** production with N processes. Every boot takes the exclusive world lock, a bad migration crash-loops every role *after* old containers are
  gone, and line-ending differences break the checksum (INC-004, review #1).
- **Better:** keep `initialize()` for dev and tests. In production, run a one-shot migrate job gated before the rollout, and have roles verify-only (compare
  checksums, never apply). Normalize line endings before hashing.
- **Monitored:** today nothing, not even an `up == 0` alert. **Revisit:** now.

## W5: one image, many roles
- **Why:** one build, one artifact to scan and pin, identical code paths for dev (`ROLE=all`) and prod. Scaling a role is a replica count.
- **Costs:** every role opens a 16-connection pool, runs migrations and exposes the full HTTP API (a resolver answers `/api/state` if routed to). Module-level
  timers and `collect()` gauges run everywhere (M3, M4).
- **Revisit:** when role-specific dependencies diverge (e.g. only sidejobs needs SMTP/VAPID, yet `compose.production.yaml` requires them for all roles through the
  shared anchor). A cheap middle ground: same image, but role-specific env and pool sizes, and don't listen on HTTP in non-HTTP roles except `/metrics`.
