# Warband ("The Crownlands"): operate-a-live-stack lab (B03, tier LAB)

This repo is the portfolio's **operations** lab. The game engine is crash-safe and well tested (the chaos drill passes live). What's missing is
evidence that anyone can *run* it: read its dashboards, trust its alerts, find a contention regression, roll back a bad release. Every exercise here
makes you **observe** a real running stack, not just read code.

Concept pages (shared, don't duplicate): [08 Realtime fan-out](../../opusorganize/apprenticeship/curriculum/08-realtime-fanout.md) ·
[09 Telemetry you can trust](../../opusorganize/apprenticeship/curriculum/09-telemetry-correctness.md) ·
[07 Zero-downtime migrations](../../opusorganize/apprenticeship/curriculum/07-zero-downtime-migrations.md) ·
[05 Verify before trust](../../opusorganize/apprenticeship/curriculum/05-verify-before-trust.md) ·
[10 Query plans](../../opusorganize/apprenticeship/curriculum/10-query-plans-and-indexes.md)

## Suggested order (≈ 38–48 h)

| # | Do | Where | Time |
|---|---|---|---|
| 1 | **Lab 0:** bring up Postgres/Redis + Prometheus/Grafana/Tempo + 5 roles, inject load, answer 8 questions from what you *see* | `ops/LAB0-BRING-UP.md` | 1.5 h |
| 2 | J1: side-effect backlog metric + admin endpoint | `ladder/J1-side-effect-backlog.md` | 3 h |
| 3 | Blind review (60 min), then compare | `review/EXERCISE.md`, `review/COMPARE.md` | 2 h |
| 4 | INC-002 lag panel flat (telemetry correctness) | `incidents/002-lag-panel-flat.md` | 1 h |
| 5 | INC-005 Redis blip → total outage (health model, flaky chaos test) | `incidents/005-redis-blip-outage.md` | 1 h |
| 6 | INC-004 deploy crash loop (migrations, rollback) | `incidents/004-deploy-crashloop.md` | 1 h |
| 7 | INC-003 second tab goes silent (realtime) | `incidents/003-second-tab-silent.md` | 1 h |
| 8 | INC-001 resolver throughput regression (backlog under load) | `incidents/001-resolver-oldest-first.md` | 1.5 h |
| 9 | J2 WS metrics, J3 resolver tick spans | `ladder/J2-*.md`, `ladder/J3-*.md` | 5 h |
| 10 | **M1 SLOs + burn-rate alerts, run as the agentic exercise** | `ladder/M1-*.md` + `agentic/WORKFLOW.md` | 3–4 h |
| 11 | M2 capacity curve, M3 scrape-safe gauges, M4 connection budget | `ladder/M2..M4` | 8 h |
| 12 | Navigation pack: architecture, first change, 5 "Why?" drills, change request | `navigation/` | 3 h |
| 13 | S1 deploy with rollback (rehearsed), S2 1,000 arrivals/s, S3 backlog catch-up | `ladder/S1..S3` | 10–14 h |
| 14 | Interview kit: stories (fill in after), 20 questions, system design, mock defense, flashcards | `interview/` | 3 h |

## Incident branches (check them out in a worktree; never on your main tree)

```
git worktree add ../warband-inc-001 training/incidents/001-resolver-oldest-first
```

| Branch | Symptom |
|---|---|
| `training/incidents/001-resolver-oldest-first` | The world falls behind at a load it handled last week. No errors, no retries. |
| `training/incidents/002-lag-panel-flat` | Players report late battles. The lag panel is flat and nothing pages. |
| `training/incidents/003-second-tab-silent` | Multi-tab and multi-device players stop getting live updates in one tab. |
| `training/incidents/004-deploy-crashloop` | A release makes every role restart in a loop. Full outage. |
| `training/incidents/005-redis-blip-outage` | A 40 s Redis restart makes every HTTP request return 502. |

To run a branch's code against the observability stack: start the roles from the worktree, and for branches that change `infra/`, start the stack with
`WARBAND_INFRA=<worktree>/infra` (see `ops/compose.observe.yaml`).

## Layout

```
ops/        compose.observe.yaml, prometheus.local.yaml, slo-rules.yaml (your M1 file), inject.ts, two-tabs.mjs, LAB0-BRING-UP.md, evidence/
ladder/     J1-J3, M1-M4, S1-S3 tickets
review/     EXERCISE.md, COMPARE.md
incidents/  001-005 briefs (symptoms only)
navigation/ ARCHITECTURE.md, FIRST_CHANGE.md, TRADEOFFS.md, CHANGE_REQUEST.md
agentic/    WORKFLOW.md (M1 via implementer + adversarial reviewer)
interview/  PROJECT_STORIES, TECHNICAL_QUESTIONS, SYSTEM_DESIGN, MOCK_DEFENSE, FLASHCARDS
_answers/   SEALED. One file per exercise, plus evidence/ with the raw numbers from live runs
```

**Don't open `_answers/` until you've written your own answer.** The existing `docs/` tree (architecture, ADRs, runbooks, verification) is the project's
own documentation. The exercises cite it. It isn't training material and is left untouched.

Machine notes: Docker Desktop can take minutes to start. Other workloads on this laptop make timings noisy, so run every measurement at least twice.
Tools in `tools/sim/` write into `artifacts/`, which holds the project's own evidence. Run drills from a worktree if you don't want to overwrite it.
