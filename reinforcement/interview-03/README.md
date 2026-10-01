# 10. Warband / astraspacegameweb: interview preparation

A browser game consumes server-owned world state while events resolve asynchronously. Explain why a successful refresh does not prove engine progress, how stale responses are rejected, and where event ownership differs from event selection.

This is an additive third block. Keep the [original foundations](../README.md) and [second practice block](../expansion-02/README.md). This block focuses on explaining, implementing, testing, and defending decisions under interview conditions. The scenarios are synthetic practice cases anchored to the source map, not claims of newly discovered application bugs.

## Start with one interview round

| Round | Practice | Timebox |
|---|---|---|
| 1 | [JavaScript reasoning and live coding](rounds/01-javascript.md) | 30 min per case |
| 2 | [React component and interaction interview](rounds/02-react.md) | 35 min per case |
| 3 | [TypeScript, schemas, and public contracts](rounds/03-typescript.md) | 25 min per case |
| 4 | [Asynchronous JavaScript and API boundaries](rounds/04-async-api.md) | 30 min per case |
| 5 | [Debugging and test-design interview](rounds/05-debugging.md) | 35 min per case |
| 6 | [Junior system-design and data-model interview](rounds/06-design.md) | 40 min per case |
| 7 | [Code-review and take-home defense](rounds/07-review.md) | 30 min per case |
| 8 | [Project explanation and behavioral interview](rounds/08-behavioral.md) | 25 min per case |

Each round has six project scenarios. That makes **48 scenario/round combinations**, not 48 unrelated production incidents. Revisit the same situation from different engineering roles: an algorithm can be correct while its UI ownership, API scope, or verification claim is wrong. Interviewer guidance is kept in a separate folder; close it until after your attempt.

Use the [coding challenge](coding/README.md), [study plan](STUDY-PLAN.md), [project defense](PROJECT-DEFENSE.md), and [scorecard](SCORECARD.md). The three complete mocks are [frontend](mocks/frontend.md), [full stack](mocks/full-stack.md), and [project defense](mocks/project-defense.md). The [all-project interview route](<../../../opusorganize/junior-reinforcement/interview-03/README.md>) explains how to choose projects without trying to finish everything in one sitting.

## Six scenarios

1. **A stale snapshot arrives after a newer one:** Two refreshes complete out of order. The later-arriving response represents an older world revision.
2. **A sequence gap is hidden:** A client receives event sequence8 after applying6. Applying it directly could skip a required intermediate transition.
3. **A busy world consumes every batch:** A due-event selector repeatedly chooses the earliest events from one busy world. Another world remains due.
4. **Two workers select one event:** Independent workers both select the same due event before either commits an effect.
5. **Request health hides stalled event work:** The metrics endpoint responds quickly while no due event is being resolved. Completed-event lag samples are old.
6. **The user switches worlds during a request:** A refresh for worldA starts; the player switches to worldB; A’s response finishes afterward.

## Actual source to inspect

- [apps/web/src/queryRefresh.ts](<../../apps/web/src/queryRefresh.ts>)
- [apps/web/src/api.ts](<../../apps/web/src/api.ts>)
- [apps/web/src/App.tsx](<../../apps/web/src/App.tsx>)
- [apps/server/src/metrics.ts](<../../apps/server/src/metrics.ts>)
- [training/README.md](<../../training/README.md>)
- [learn/README.md](<../../learn/README.md>)

Read current symbols and callers before attributing a guarantee to the application. A lab fixture may introduce an explicit version, policy, or field that the app does not have. The local Node challenge verifies its written teaching contract only. React sketches, TypeScript/JSDoc sketches, database plans, and browser claims require their own checks.

The intended audience is a junior software engineer practicing fundamentals and project explanations. Scoring is educational and is not an employer's hiring rubric or a guarantee of interview outcomes. Personal mastery starts **not assessed**.
