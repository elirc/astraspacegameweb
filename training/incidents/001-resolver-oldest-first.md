# INC-001: the world falls behind at a load it used to handle

**Branch:** `training/incidents/001-resolver-oldest-first` · **Severity:** SEV-2 (battles land late for everyone) · **Timebox:** 90 min

## Page

> **EventLagHigh (critical)** `histogram_quantile(0.99, …warband_event_lag_seconds…) > 5 or max(warband_oldest_event_seconds) > 5` for 2m.
> Runbook: docs/runbooks/stuck-event.md

Players on the tribe forum: "My nobles landed 40 seconds after the timer hit zero." Evening peak is ~120 arrivals/s. Last week the
same peak drained without paging anyone. Yesterday's release contained one resolver change (the diff is below).

## What on-call has collected

Staging replay of the same backlog (6,000 arrivals due at once, 20,000 villages, same laptop-class DB). The times include about 15 s of process start:

| Build | Resolvers | Time until `duePending = 0` (two runs) | `warband_resolver_errors_total` | `warband_lock_retries_total` |
|---|---|---|---|---|
| previous release | 1 | 127 s, 115 s | 0 | 0 |
| this release | 1 | 104 s, 252 s (the 252 s looked like laptop noise; see the note) | 0 | 0 |
| previous release | 3 | 115 s, 91 s | 0 | 0 |
| this release | 3 | 151 s, 154 s | 0 | 0 |

Note: a direct in-process profile of **one** resolver draining the same backlog took 78.4 s (previous) vs 78.7 s (this release).

Live Prometheus at peak, sampled every 10 s (from the running release):

```
t         resolved/s  by resolver (3002/3003/3004)  duePending  oldest_s  lag_p99
05:32:24  77.0        21.3 / 26.8 / 28.9            6086        39.6      58.7
05:32:57  84.0         4.9 /  7.1 / 72.0            9659        63.4      60.0
05:33:49  96.0         0.0 / 96.0 /  0.0            7500        98.6      60.0
```

Resolver logs contain no errors, only the startup banner and `incoming request`/`request completed` pairs for `/metrics` scrapes.

## Suspect PR (merged yesterday, approved with "nice simplification")

```diff
--- a/apps/server/src/application/engine.ts
+++ b/apps/server/src/application/engine.ts
@@ export async function resolveDue() {
-  const candidates = (
+  // Oldest-first: a random window lets newer events overtake the oldest overdue
+  // ones, which is exactly what inflates p99 lag. Always take the head of the queue
+  // (and read 8x fewer candidate rows per tick).
+  const selected = (
     await pool.query(
       "SELECT village_id,due_at FROM scheduled_events WHERE world_id=1 AND status='pending' AND due_at<=statement_timestamp() ORDER BY due_at,id LIMIT $1",
-      [batchSize * 8],
+      [batchSize],
     )
   ).rows;
-  if (!candidates.length) return 0;
-  const start = Math.floor(Math.random() * Math.max(1, candidates.length - batchSize + 1));
-  const selected = candidates.slice(start, start + batchSize);
+  if (!selected.length) return 0;
```

## Your job

1. Reproduce it: check out the branch in a worktree, then follow `ops/LAB0-BRING-UP.md` (3 resolvers, `INJECT_RATE=150`). Compare with `main`.
2. Explain why **one** resolver is unaffected but **three** got ~40% slower, by tracing `resolveDue` → `lockCausalComponent` → `drain`.
3. Explain why the dashboards show **no errors and no retries**. Name the signal that would have shown the problem in the first 5 minutes.
4. Propose the fix plus the instrumentation you'd add so the next contention regression pages someone. Include the regression test or benchmark.
5. Write a 1-page postmortem.

Sealed answer: `_answers/incidents/001-resolver-oldest-first.md`
