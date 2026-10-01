# 10. Warband / astraspacegameweb: reinforcement practice

Bridge React query state and server operations by reasoning about notifications arriving during an already-running refresh.

## What this adds

The existing pack covers live-stack bring-up, SLOs, and multi-tab incidents. This supplement explains the small client coordination problem underneath those systems: coalescing hints without losing the last update, cleanup on unmount, and separating a stale browser from a delayed backend.

This pack complements the existing material below. Start after its basic orientation or on-ramp, before the advanced incidents. Source references describe files inspected on 2026-09-26; record your current commit and working-tree differences before transferring an exercise into the app. New lab contracts are explicitly simplified teaching contracts, not claims about existing product behavior.

- [learn/README.md](<../learn/README.md>)
- [learn/00-onramp.md](<../learn/00-onramp.md>)
- [training/README.md](<../training/README.md>)

## Four sessions, about 4–6 hours

| Session | Work | Evidence to keep |
|---|---|---|
| 1 · 45–60 min | [Foundations](01-foundations.md): read the named files and make predictions | Your annotated data flow and prediction table |
| 2 · 60–90 min | [Isolated lab](02-lab.md): implement the starter and add a boundary test | Failing result, passing result, and your explanation |
| 3 · 60–90 min | [Transfer and review](03-transfer.md): plan and, in your own practice branch, implement one small app change | A focused diff and the relevant app-level evidence |
| 4 · 45–60 min | [Checkpoint](CHECKPOINT.md): retrieval practice and a short defense | Score, limits of evidence, and one repeat date |

If setup blocks app work, finish the dependency-free lab and source-reading tasks. Mark the app transfer pending; lab success does not verify a React component, database, or deployed service.

## Source map

- [apps/web/src/queryRefresh.ts](<../apps/web/src/queryRefresh.ts>)
- [apps/web/src/api.ts](<../apps/web/src/api.ts>)
- [apps/web/src/App.tsx](<../apps/web/src/App.tsx>)
- [apps/server/src/metrics.ts](<../apps/server/src/metrics.ts>)
- [training/README.md](<../training/README.md>)
- [learn/README.md](<../learn/README.md>)

## Concepts to revisit when stuck

- [08-realtime-fanout.md](<../../opusorganize/apprenticeship/curriculum/08-realtime-fanout.md>)
- [09-telemetry-correctness.md](<../../opusorganize/apprenticeship/curriculum/09-telemetry-correctness.md>)
- [04-characterization-tests.md](<../../opusorganize/apprenticeship/curriculum/04-characterization-tests.md>)

The [shared practice protocol](../../opusorganize/junior-reinforcement/PRACTICE_PROTOCOL.md) explains evidence, Git hygiene, and when to use an agent. Keep answers closed until your own attempt is written. Your personal learning status starts **not assessed**.
