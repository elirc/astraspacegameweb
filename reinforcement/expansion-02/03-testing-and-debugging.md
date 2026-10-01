# Tests that reject a plausible wrong implementation

Scenario one: two workers both log that they selected event E, and a resource balance changes twice. A deterministic selector is not the repair. Find the transaction or claim boundary and establish whether event identity and state transitions are protected there. Build a competing-worker integration plan whose assertion observes committed state, not just function call count.

Scenario two: dashboard requests return 200 while a player's completed action never appears. Compare the last client refresh, last engine progress, and oldest pending due event. A request-duration improvement would not explain the missing domain transition. Write hypotheses for an inactive worker, a stuck event, and a stale read path, with one distinguishing observation for each.

Scenario three: lag looks excellent immediately after a worker stops. Ask whether the metric reports completed work only. Test the monitoring policy with a missing heartbeat and an increasing backlog age. Do not fabricate production metric names: label proposed signals as proposals until their writer and exporter are located.

## Investigation method

Start with two competing hypotheses. For each, predict an observation that would be different if it were true. Inspect the smallest relevant boundary before editing. Preserve the original failing input and record whether you observed a symptom, reproduced a mechanism, or merely reasoned about it.

Build three layers of evidence: a pure contract case; the real module or adapter with controlled dependencies; and one user-visible or database-visible outcome. State explicitly which layers you ran. Avoid replacing the boundary under investigation with a mock that already assumes the desired answer.

For timing cases, control a clock or promise rather than sleeping. For data cases, include at least two organizations or two independent entities where relevant. For mutation cases, assert both the returned outcome and unchanged unrelated state. Include a negative test that would reject the tempting shortcut named in the scenario.

After the first passing fix, introduce one small wrong variation in your own lab solution, run the relevant check, and revert only that variation. Keep the failing assertion as evidence that the test can detect the mechanism. Do not seed defects in the application's main working tree.

Write a short handoff: symptom; reproduction input; confirmed cause or remaining hypotheses; smallest change; tests actually run; remaining integration risk. A reviewer should be able to resume without reading your entire chat history.
