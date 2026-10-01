# Lab B: Classify engine freshness with an injected clock

Practice truthful missing-data states, threshold boundaries, and independent progress signals.

## Exact teaching contract

Export `freshness({now,heartbeatAt,oldestDueAt,maxHeartbeatAgeMs,maxBacklogAgeMs})`. now and both budgets must be finite numbers; budgets must be nonnegative. Both timestamps must be null or finite numbers; invalid inputs throw RangeError. Return `{state,heartbeatAgeMs,backlogAgeMs}`. Heartbeat age is null for null heartbeat, otherwise now-heartbeatAt. Backlog age is null for null oldestDueAt, otherwise max(0,now-oldestDueAt). State precedence: null heartbeat => unknown; negative heartbeat age => clock-skew; heartbeat age > its budget => stalled; non-null backlog age > its budget => backlogged; otherwise healthy. Equality with either budget is allowed. Inputs and thresholds are synthetic teaching policy.

## Work the examples before the implementation

At now100 and budgets20/30, compare heartbeatAt80 with79, oldestDueAt70 with69, and a null heartbeat. Predict both ages as well as the state.

Read `check.mjs`, write expected results for two cases, and then run it. The starter deliberately throws `Not implemented`. Implement `exercise.mjs` yourself and keep the supplied assertions unchanged. Add one test for an edge that is not already asserted, then demonstrate a plausible wrong implementation fails it.

From this lab directory:

```powershell
node --test check.mjs
```

The file is explicitly named `check.mjs` rather than a test/spec filename so conventional app test discovery does not collect an unfinished teaching exercise. There is no npm install, database, network, paid model, or payment call. These are small JavaScript models; types and application integration are separate practice tasks.

## Connect the model to the application

Identify where actual progress and pending-work age can be observed. Define missing-telemetry behavior separately from an empty queue before connecting a UI or alert.

Record what is simplified: input validation already assumed, event ordering promised by the caller, a missing persistence layer, or an injected clock. A passing model is useful only when you can name the guarantee the real app still needs.

After your own attempt, read [the reasoning guide](../../_answers/GUIDE.md). The separate reference is checked with:

```powershell
node check.mjs --reference
```

This second command verifies the author's answer, not your solution. If your solution differs but meets every stated contract, compare invariants and failure cases instead of matching lines. Save the failing output, corrected output, your extra assertion, and a short explanation of why the correction is sufficient for this model.
