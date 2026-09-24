# INC-002: players say battles are late, but the lag dashboard is flat and nothing paged

**Branch:** `training/incidents/002-lag-panel-flat` · **Severity:** SEV-2, found by players rather than by alerting · **Timebox:** 60 min

## Report

Support ticket, Saturday 21:40: "Attacks resolving 1–2 minutes late for our whole tribe since about 21:15." On-call opens
**Warband world health** and sees:

- **Event lag p50 / p99**: both lines perfectly flat at **2.00 s** since 21:15. Before that, p99 hovered around 0.3 s.
- **Committed events per second**: normal to high.
- **Alerts**: nothing firing, nothing pending.

On-call's first reaction in the channel: "p99 at 2 s is at the SLO line but under the 5 s page threshold. Probably a client clock issue."

## What was collected

Prometheus, sampled every 10 s during the same kind of peak in staging (150 arrivals/s against 3 resolvers):

```
t         resolved/s  duePending  oldest_s  lag_p99  lag_p50  ALERTS
05:59:09  167.2       5925        99.99     2.0      2.0      []
05:59:53  118.1       2685        110.14    2.0      2.0      []
06:00:25  121.7        651        136.86    2.0      2.0      []
```

`GET /api/v1/alerts` → `{"alerts":[]}`.

The raw bucket counters on one scrape, summed over instances (`sum(warband_event_lag_seconds_bucket) by (le)`):

```
le=0.01: 0   0.025: 0   0.05: 0   0.1: 0   0.25: 0   0.5: 0   0.75: 0   1.0: 0   1.5: 0   2.0: 2   +Inf: 27000
```

## Suspect PR (merged Friday, "observability cleanup")

```diff
--- a/apps/server/src/metrics.ts
+++ b/apps/server/src/metrics.ts
   name: 'warband_event_lag_seconds',
   help: 'Delay between event due time and committed resolution',
-  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
+  // The lag SLO is 2 s (docs/verification.md). Spend the buckets where the SLO is
+  // decided instead of on 10/30/60 s buckets nobody reads.
+  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2],
--- a/infra/alerts.yaml
+++ b/infra/alerts.yaml
       - alert: EventLagHigh
-        expr: histogram_quantile(0.99, sum(rate(warband_event_lag_seconds_bucket[2m])) by (le)) > 5 or max(warband_oldest_event_seconds) > 5
+        expr: histogram_quantile(0.99, sum(rate(warband_event_lag_seconds_bucket[2m])) by (le)) > 5
```

## Your job

1. Reproduce it: point the observe stack at the branch (`WARBAND_INFRA=<worktree>/infra …compose.observe.yaml up -d --force-recreate`), run the
   branch's roles and inject 150/s. Screenshot the lag panel next to **Oldest pending event**.
2. Explain precisely what `histogram_quantile` returns here and why it can **never** exceed 2.0 on this branch.
3. Was the old `main` safe? Check what the same panel does on `main` when lag passes 60 s (look at Lab 0).
4. Fix it so this class of mistake is caught **before merge**. More buckets alone is not a complete answer.
5. Write the postmortem. Include the question "why did a human have to notice?"

Concept page: [09 Telemetry you can trust](../../../opusorganize/apprenticeship/curriculum/09-telemetry-correctness.md) (read it *after* step 2).
Sealed answer: `_answers/incidents/002-lag-panel-flat.md`
