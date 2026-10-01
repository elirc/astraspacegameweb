# 10. Warband / astraspacegameweb: system design

**Design case:** Design a progressing event engine and reconnectable client state.

This track adds a focused system-design route to the [existing reinforcement pack](../README.md), [interview practice](../interview-03/README.md), and [worked learning material](../guided-04/README.md). It preserves them all. Start with one user journey, one hard invariant, and one failure timeline; then justify each component you add.

## Study route

| Step | Material | Artifact to produce |
|---|---|---|
| 1 | [Worked architecture](01-worked-design.md) | Explain authority and every arrow |
| 2 | [API and data contracts](02-contracts-data.md) | Request examples, keys, consistency rules |
| 3 | [Failure and recovery lab](03-failure-recovery.md) | Crash/race trace and proof plan |
| 4 | [Capacity and scaling](04-capacity.md) | Reproduce arithmetic and challenge assumptions |
| 5 | [Decision record and journal](05-design-decisions.md) | Defend one choice and a revisit trigger |
| 6 | [Timed interview](06-interview-lab.md) | A coherent forty-five-minute design |
| Review | [Separate reference notes](_answers/REFERENCE.md) | Compare guarantees, not diagram size |

The [shared design guide](<../../../opusorganize/junior-reinforcement/system-design-05/DESIGN-METHOD.md>) covers requirements, consistency, ownership, caches, queues, storage, recovery, and communication. The [all-project route](<../../../opusorganize/junior-reinforcement/system-design-05/README.md>) gives the progression across all ten cases.

## What the inspected source establishes

The query refresher waits for an existing fetch, tracks dirty work per query, and can refetch after an earlier snapshot completes; account reset cancels/removes or resets queries. Server metrics include pending due events, oldest overdue event age, completed-resolution lag, and outbox backlog. Read these together rather than claiming only request health is available.

- [apps/web/src/queryRefresh.ts](<../../apps/web/src/queryRefresh.ts>)
- [apps/web/src/api.ts](<../../apps/web/src/api.ts>)
- [apps/server/src/metrics.ts](<../../apps/server/src/metrics.ts>)
- [packages/db/causality.ts](<../../packages/db/causality.ts>)

Everything labeled proposed, design contract, target architecture, exercise load, or journal is teaching material. Diagrams show a worked design, not an assertion that every depicted component is deployed. API paths, fields, and storage keys below are illustrative contracts unless the source observation explicitly says otherwise. No migration or application implementation is performed by this track.

**Invariant to defend:** An eligible world event has one policy-consistent committed effect, and client refresh/reconnect cannot make another world or obsolete account own the current displayed state.

Human mastery remains unassessed. A correct capacity calculation or a source trace does not establish production throughput or complete a learner's design defense.
