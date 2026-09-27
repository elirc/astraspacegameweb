# Study guide: Warband ("The Crownlands"), the operations lab

## What this app is and why it's in the portfolio

Warband is a browser strategy game. It has one TypeScript server image that runs as several roles: api, resolver, relay and sidejobs
(`apps/server/src/index.ts`). Postgres is the source of truth (`packages/db/`), Redis carries hints and rate limits (`apps/server/src/redis.ts`),
and a React client polls and listens on a WebSocket (`apps/web/src/App.tsx`). It's in the portfolio because it's the only project with a full
**operations** stack: Prometheus alerts (`infra/alerts.yaml`), a Grafana dashboard (`infra/grafana/dashboards/world.json`), Tempo traces and
chaos drills (`tools/sim/`). Here you learn to *run* software, not just write it. The mid/senior material lives in `training/` (B03). This folder
is the junior on-ramp to that material.

> **Machine status (2026-09-26):**
> - **Docker is broken on this laptop** (the WSL distro is gone). Every step that needs Postgres, Redis, Prometheus, Grafana, Tempo or `promtool`
>   is marked **requires Docker, currently down**. Each of those steps has a no-Docker substitute in `training/ops/NO-DOCKER-ROUTE.md`.
> - **`node_modules` was removed to free disk space.** Run `pnpm install --frozen-lockfile` before anything that uses `pnpm`/`npx tsx`/vitest
>   (it took about 7 min in B03). Plain `node` scripts that you write yourself need no install.

## Prerequisites (do these first)

| # | Fundamental | Where to learn it |
|---|---|---|
| 1 | Counters, gauges and histograms, and what `histogram_quantile` can and can't tell you | [curriculum 09: Telemetry you can trust](../../opusorganize/apprenticeship/curriculum/09-telemetry-correctness.md), then read `apps/server/src/metrics.ts` top to bottom (140 lines) |
| 2 | A transaction, a rollback, and why an advisory lock blocks another process | `packages/db/index.ts` `transaction()` (lines 42–89) and `worldLock()` (lines 92–99); [curriculum 10](../../opusorganize/apprenticeship/curriculum/10-query-plans-and-indexes.md) for the partial index `events_due` |
| 3 | Pub/sub and WebSockets as *hints*, not as state | [curriculum 08: Realtime fan-out](../../opusorganize/apprenticeship/curriculum/08-realtime-fanout.md); `apps/server/src/transport/app.ts` lines 116–145 |
| 4 | Liveness vs readiness, and why migrations must never change once applied | [curriculum 13: Release safety](../../opusorganize/apprenticeship/curriculum/13-release-safety.md) and [07: Zero-downtime migrations](../../opusorganize/apprenticeship/curriculum/07-zero-downtime-migrations.md) |
| 5 | Load, back-pressure and why "no errors" doesn't mean "no contention" | [curriculum 14](../../opusorganize/apprenticeship/curriculum/14-load-backpressure-timeouts.md) |
| 6 | Checking code you didn't write, whether an AI or a human wrote it | [curriculum 05: Verify before trust](../../opusorganize/apprenticeship/curriculum/05-verify-before-trust.md) |

You don't need to know PromQL beforehand. Session 3 teaches you the four queries you need.

## Study route (12 sessions, about 14 hours)

Rule for every session: **write your answer down before you open anything in `_answers/`.** The sealed files are for checking your work, not for learning from.

| # | Time | What you do | Files / branches | Exit criterion (check it before moving on) |
|---|---|---|---|---|
| 1 | 60 min | **Read the map.** Read the architecture pack and the "before your first change" page, then do on-ramp exercises 1–3. | `training/navigation/ARCHITECTURE.md`, `training/navigation/FIRST_CHANGE.md`, `apps/server/src/index.ts`, `learn/00-onramp.md` #1–3 | Without notes, you can draw the 4 roles and say which `setInterval` loop does work in each (`index.ts` lines 42–116). Your #1–3 answers match `learn/_answers/00-onramp.md`. |
| 2 | 60 min | **Read the numbers.** On-ramp exercises 4–6: histogram math, the retry counter that never moves, the migration checksum. | `apps/server/src/metrics.ts`, `packages/db/index.ts`, `learn/00-onramp.md` #4–6 | You can explain in 2 sentences why a lag panel can't show more than 60 s on `main`. |
| 3 | 75 min | **Health, Redis, schema, first test.** On-ramp exercises 7–10. #10 writes your first characterization test. | `apps/server/src/application/game.ts:62`, `infra/Caddyfile`, `apps/server/src/redis.ts`, `packages/db/migrations/001_initial.sql`, `learn/00-onramp.md` #7–10 | Your test for `committedResolutions` fails when you delete `Math.max(0, …)` in `metrics.ts` and passes when you put it back. Needs `pnpm install` first. If you can't install, the exit is a written test that a reviewer accepts. |
| 4 | 90 min | **Lab 0: operate the stack.** Bring up Postgres/Redis + Prometheus/Grafana/Tempo + 5 roles, inject load, answer 8 questions from the dashboards. **Requires Docker, currently down:** do §6 of the lab (the recorded-evidence fallback) plus part A of the no-Docker route instead. | `training/ops/LAB0-BRING-UP.md`, `training/ops/evidence/baseline-150rps-3resolvers.jsonl`, `training/ops/NO-DOCKER-ROUTE.md` part A | `training/ops/LAB0-NOTES.md` has answers to questions 1–6 (marked `FALLBACK` if you used the evidence file). Compare with `training/_answers/lab0.md`. |
| 5 | 60 min | **INC-002: the flat lag panel** (telemetry correctness). Read the brief, then work out from the bucket dump why the quantile is stuck at 2.0. | Branch `training/incidents/002-lag-panel-flat`, `training/incidents/002-lag-panel-flat.md`, no-Docker route part B | You can compute `histogram_quantile(0.99)` by hand from the bucket dump, and you've written a `promtool test rules` case that would fail on the branch. Compare with `training/_answers/incidents/002-lag-panel-flat.md`. |
| 6 | 60 min | **INC-003: the silent second tab** (realtime). Replay the connect/close sequence by hand, then in a 20-line plain `node` script. | Branch `training/incidents/003-second-tab-silent`, `training/incidents/003-second-tab-silent.md`, no-Docker route part C | Your script prints "tab B registered: false" for the branch logic and "true" for the `main` logic. You can say which `Set` object each close handler holds. |
| 7 | 90 min | **INC-004 + INC-005: release safety.** The crash loop from an edited migration, then the Redis blip that took down every request. | Branches `training/incidents/004-deploy-crashloop`, `training/incidents/005-redis-blip-outage`, `docs/runbooks/deployment.md`, no-Docker route parts D and E | You can reproduce the checksum mismatch with plain `node` (LF vs CRLF). You can list the three callers of `/api/health` and what each does with a 500. |
| 8 | 90 min | **Blind review** (60 min timed), then compare. | `training/review/EXERCISE.md`, `training/review/COMPARE.md` | `training/review/MY_FINDINGS.md` has 12+ findings, 5+ in operability/deployment. The "3 findings backed by something you ran" rule can use `git`, `grep` and plain-`node` output while Docker is down. |
| 9 | 120 min | **Agentic drill 1: M1 SLOs via an implementer agent + adversarial review.** | `learn/01-agentic-practice.md` drill 1, `training/ladder/M1-slos-and-burn-rate-alerts.md`, `training/agentic/WORKFLOW.md` | Your `VERIFY.md` shows you checked every `le="…"` in the agent's rules against the real bucket bounds. The live `promtool`/drill boxes stay marked **requires Docker, currently down**. |
| 10 | 90 min | **INC-001: three resolvers slower than one** (throughput under contention). Work from the brief's tables. The live re-run requires Docker, currently down. | Branch `training/incidents/001-resolver-oldest-first`, `apps/server/src/application/engine.ts:782-810`, `packages/db/causality.ts` | You can explain why 1 resolver is unaffected but 3 get ~40% slower, and name the signal that would have shown it (rollbacks per commit). |
| 11 | 75 min | **Agentic drills 2–3** (INC-003 fix, INC-005 health split), then the trade-off drills. | `learn/01-agentic-practice.md` drills 2–3, `training/navigation/TRADEOFFS.md` (W1–W5) | Each drill's review sheet names at least one thing the agent got wrong or skipped. You can answer W4 and W5 aloud in 2 minutes each. |
| 12 | 60 min | **Interview kit.** Fill in 2 STAR stories from what you actually did, then run the mock defense with a friend or a model as the interviewer. | `training/interview/PROJECT_STORIES.md`, `training/interview/MOCK_DEFENSE.md`, `training/interview/FLASHCARDS.md` | You score 3+ of 5 on each of the mock-defense rubric rows. Or: you answer 18 of the 24 flashcards without looking. |

After session 12, go on to the ladder tickets in `training/README.md` (J1–J3, then M2–M4, then S1–S3) once Docker works again. They need the live stack.

## Do vs. delegate (the agentic-era core)

The rule: **you own diagnosis, specs, review and verification. An agent may type the code, but only after you've written down what "correct" means.**

| Session | Do BY HAND (no agent) | Delegate to an agent, then verify |
|---|---|---|
| 1–3 on-ramp | All reading, predictions and traces. Write the test's *assertion* yourself. | Only the test boilerplate (imports, `vi.useFakeTimers()` setup) in #10. Then check it actually fails when you break the code. |
| 4 Lab 0 | Every answer. The whole point is that *you* read the dashboard. | Nothing. At most, ask an agent to explain a PromQL function after you've formed your own guess. |
| 5–7 incidents | Diagnosis, the mechanism, the postmortem. | The fix diff and the regression test, once your written diagnosis exists (see `learn/01-agentic-practice.md`). Verify against the sealed answer. |
| 8 review | 100%. Don't let an agent review first. It anchors you. | Afterwards only: ask an agent for a second review and compare which findings it missed or made up. |
| 9 M1 | SPEC.md, DESIGN_NOTE.md, the verification checklist, EXPLANATION.md. | The rule YAML and the promtool test YAML (the implementer), and a first-pass critique (the reviewer). |
| 10 INC-001 | The contention explanation. | A throughput benchmark script *after* you've specified what it measures (drain time, commits, rollbacks). |
| 11 drills | The specs and the adversarial review. | The implementation. |
| 12 interview | Everything. You're the one being interviewed. | A model can play the interviewer. |

## How you know you're done here

- You can explain, without notes, why each of the 5 incidents produced **no error log** and which signal *would* have caught it.
- You caught at least one real mistake in agent output (an `le` label, a `clamp_min`, a captured `Set`) and can show the evidence.
- You have a written postmortem for INC-002 and INC-004 that a senior would accept.
- On-ramp: 8+ of 10 correct on first try. Agentic drills: every checklist item ticked or honestly marked "requires Docker, currently down".

**Where to go next** (from `opusorganize/apprenticeship/COMPETENCY_GRAPH.md`):
- **buildevent** for measured load and back-pressure (curriculum 14). It's the natural sequel to INC-001 and S2.
- **gitjira-app** for release safety that ends in a real cloud deploy (curriculum 13, the "cloud deploy: thin" row).
- Come back to this repo's ladder (J1–S3) when Docker works again.
