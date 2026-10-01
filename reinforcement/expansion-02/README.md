# 10. Warband / astraspacegameweb: second practice block

Move from client refresh coordination to the server work that makes a refreshed view useful. Practice deterministic event selection, per-world limits, and an explicit freshness signal before proposing changes to the game engine.

This expansion follows the [original reinforcement pack](../README.md). Keep both: the first pack establishes a small mental model; this block asks you to combine boundaries, reject plausible mistakes, and explain evidence. All new contracts below are teaching contracts unless a paragraph explicitly describes inspected application source. They are not pre-approved production changes.

## Route through the new material

| Session | Work | Result |
|---|---|---|
| 1 · 60 min | [Boundary lessons](01-boundaries.md) | Annotated source trace and three predictions |
| 2 · 75–90 min | [Lab A](labs/a/README.md) | Own solution, edge test, caught mistake |
| 3 · 75–90 min | [Lab B](labs/b/README.md) | Second solution and comparison with A |
| 4 · 60 min | [Types and contracts](02-types-and-contracts.md) | Type sketch, runtime rules, compatibility examples |
| 5 · 75 min | [Testing and debugging](03-testing-and-debugging.md) | Hypotheses, minimal reproducer, evidence limits |
| 6–7 · 2–4 h | [Change capstone](04-capstone.md) | A reviewable practice change or explicit blocked plan |
| 8 · 60 min | [Workbook](WORKBOOK.md) | Six transfer answers and a short oral defense |

The estimate is 9–12 additional hours per project, excluding dependency setup and repeated attempts. Work on one project at a time. Reading a reference answer counts as study, not independent completion.

## Sources to inspect

- [apps/web/src/queryRefresh.ts](<../../apps/web/src/queryRefresh.ts>)
- [apps/web/src/api.ts](<../../apps/web/src/api.ts>)
- [apps/web/src/App.tsx](<../../apps/web/src/App.tsx>)
- [apps/server/src/metrics.ts](<../../apps/server/src/metrics.ts>)
- [training/README.md](<../../training/README.md>)
- [learn/README.md](<../../learn/README.md>)
- [apps/server/src/index.ts](<../../apps/server/src/index.ts>)
- [packages/db/causality.ts](<../../packages/db/causality.ts>)

Use current symbols, not old line numbers. Record the commit and any relevant uncommitted source before application work. A new worktree from HEAD does not contain those uncommitted changes. The [shared expansion route](<../../../opusorganize/junior-reinforcement/expansion-02/README.md>) connects all ten projects.

## Two separate levels of proof

The Node labs need no packages or services. Their passing tests establish only the small contract written beside them. Application tests, browser observations, PostgreSQL checks, or a live service drill must be recorded separately. The original application's build was not rerun merely because a teaching model passed. Your learning status begins **not assessed**.
