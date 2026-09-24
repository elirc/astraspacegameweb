# STAR stories to complete after doing the work

Fill each one in **after** you've done the linked exercise, with your own numbers. Keep each to about 90 seconds spoken. The skeletons say what the story
has to prove. Delete the prompts when you finish.

## 1. Debugging: "the dashboard said 2 seconds, players said 2 minutes" (INC-002)
- **S:** a persistent strategy game. Lag SLO 2 s. Players reported late battles while the p99 panel sat flat at 2.00 and nothing paged.
- **T:** find out why the telemetry lied, and make that class of mistake impossible to merge.
- **A:** (yours) how you proved the clipping: bucket dump, `+Inf` count, oldest-event gauge. The fix. The `promtool test rules` case.
- **R:** (yours) the numbers from your drill. What CI now catches.
- *Proves:* you know how `histogram_quantile` works, not just that it exists.

## 2. Trade-off: "why three resolvers were slower than three resolvers" (INC-001 + M2)
- **S:** a "fairness" refactor made every resolver take the oldest batch.
- **T:** explain a ~40% throughput drop with zero errors and zero retries on the dashboard.
- **A:** the A/B with 1 vs 3 resolvers, `pg_stat_database` rollbacks, Tempo ROLLBACK spans, and the realisation that the random window was load-bearing.
- **R:** your measured before/after, plus the metric you added so contention pages someone.
- *Proves:* concurrency reasoning with measurements instead of intuition.

## 3. Incident: "a 40-second Redis restart took the whole game down" (INC-005)
- Tell it as the incident commander: timeline, mitigation, why the alert pointed at health probes, the health-model redesign, and the "merged over a red chaos test" culture fix.
- *Proves:* liveness vs readiness vs dependency health, and that you can change a process, not just code.

## 4. Deployment: "a comment in a migration crash-looped production" (INC-004 + S1)
- Include the line-ending twist (a CRLF checkout breaks the checksum). Then the release process you built and rehearsed: tagged images, a migrate gate, canary, rollback in N seconds.
- *Proves:* you've thought about rollback *before* you needed it.

## 5. Agent-caught bug / bug the agent introduced (agentic M1)
- What you specified, what the agent produced, the bug you caught (the selector that matches nothing, or the alert that fires at zero traffic), and how: live `le`
  label values, an idle drill. What you now always check in agent-written config.
- *Proves:* you verify AI output against the running system, not against its own tests.
