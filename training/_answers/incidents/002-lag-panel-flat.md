# ANSWER: INC-002 lag panel flat at 2.0, no page

**Verification:** RUN-VERIFIED. Branch roles plus the branch's `infra/alerts.yaml` loaded into the training Prometheus. 150 arrivals/s → `lag_p99 = lag_p50 = 2.0`
for the whole run, oldest pending event up to 136.9 s, `/api/v1/alerts` empty (`_answers/evidence/inc002-150rps-3resolvers.jsonl`).

## Root cause (two changes that are only dangerous together)

1. `warband_event_lag_seconds` lost every bucket above 2 s. `histogram_quantile(φ, …)` interpolates *inside* the bucket that contains the
   target rank. When that rank falls in the `+Inf` bucket, Prometheus returns the **upper bound of the highest finite bucket**, here `2`.
   The dump proves it: 26,998 of 27,000 observations are in `(2, +Inf]`. p50 and p99 are both "2.0". So the quantile's maximum possible
   value became 2, and the rule `… > 5` became **unreachable**. This is the same class as pulse's severity-inversion incident: a condition that can never be true.
2. The `or max(warband_oldest_event_seconds) > 5` clause was the only signal that doesn't depend on events *completing*. A histogram
   observed at commit (`committedResolutions` via `afterCommit`) cannot see events that are late and still pending. Removing it removed the
   independent safety net.

## Was `main` safe?

Only partly. Lab 0 on `main` shows the same saturation at the old top bucket: `lag_p99 = lag_p50 = 60.0` while the oldest event was 111 s, and
`resolver_transaction_seconds` p99 pinned at `30.0`. On `main` the alert still fires, because 60 > 5 and because of the oldest-event clause. But the
dashboard under-reports every lag above 60 s, and nobody reading "60" knows it means "≥ 60". Treat any quantile that equals a bucket bound for
several minutes as "clipped".

## Fix

- Buckets: keep the resolution near the SLO and extend far past every threshold that reads them:
  `[0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10, 30, 60, 120, 300, 900]`. (Changing buckets resets the series; note it in the release.)
- Restore the oldest-event clause, or split it into its own alert `EventBacklogStale: max(warband_oldest_event_seconds) > 30 for 2m`,
  so each page says which symptom fired.
- Base the SLO on a **bucket ratio** instead of a quantile:
  `sum(rate(warband_event_lag_seconds_bucket{le="2"}[5m])) / sum(rate(warband_event_lag_seconds_count[5m]))`. It's exact at a bucket
  boundary, can't be clipped, and is what burn-rate alerts need (ladder M1).

## Catch it before merge

- `promtool test rules` unit test for `infra/alerts.yaml` (a `tests/alerts.test.yaml`) with a synthetic series where every observation is 90 s.
  It asserts that EventLagHigh fires. The test fails on this PR, because nothing in the new histogram can express 90 s.
- A vitest test that parses `infra/alerts.yaml`, extracts every numeric threshold compared against `warband_event_lag_seconds`, and asserts
  `max(finite buckets) ≥ 2 × threshold`. It's cheap, and it ties code to config.
- A dashboard "clipping" helper panel: `histogram_quantile(0.99, …) == on() group_left max(…bucket bound)` or simply a stat on
  `sum(rate(…_bucket{le="+Inf"}[5m])) - sum(rate(…_bucket{le="<top>"}[5m]))`, the rate of observations above the top bucket.
- Review rule: PRs touching `metrics.ts` buckets or `infra/alerts.yaml` need an ops reviewer (CODEOWNERS). The PR description must show
  the alert firing in a drill.

## Model postmortem (short)

**Impact:** about 25 min of 1–2 min battle delays, detected by players.
**Trigger:** the "observability cleanup" PR truncated lag buckets at 2 s and removed the oldest-event alert clause.
**Why it hid:** the quantile is clipped at the top finite bucket, so the panel showed exactly the SLO value and looked like "at the edge, not critical".
**Why a human had to notice:** the only remaining alert expression could not exceed 2 while its threshold was 5. Nothing tested alert rules against synthetic data.
**Actions:** restore buckets through 900 s + oldest-event alert; SLO as a bucket ratio with burn-rate alerts; `promtool test rules` in CI; bucket-vs-threshold unit test;
CODEOWNERS on `infra/`; runbook note "a flat quantile at a bucket bound means clipped".
Concept: curriculum 09 ("unreachable alert branch", "claimed but not wired").
