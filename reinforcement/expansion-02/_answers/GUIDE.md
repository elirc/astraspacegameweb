# Sealed reasoning guide

Attempt both labs and write the investigation hypotheses before reading. These answers concern only this expansion, not the existing Opus incidents.

## Lab A reasoning

Filter at dueAt <= now, sort a new array by due time and then opaque ID, and walk the sorted candidates once. Track counts per world in a Map so special property names are ordinary IDs. Select only while the global limit and the world's ceiling permit it. Skipped candidates remain outside this returned plan; the input snapshot is never changed.

The quota can leave unused capacity. Filling that capacity from an already saturated world would violate this contract even if it appeared more efficient. A different product policy could allow borrowing unused capacity, but that requires a new contract and new examples.

These checks establish snapshot selection only. They neither claim rows nor prevent two workers from applying the same effect. A useful review rejects a proposed production fix that substitutes this helper for the real concurrency boundary.

## Lab B reasoning

Validate finite timestamps and nonnegative finite budgets before classification. Compute heartbeat age only when a heartbeat exists. Compute backlog age as max(0, now - oldestDueAt) when that timestamp exists; a future scheduled event therefore has zero overdue age in this teaching model.

Precedence is explicit: unknown heartbeat first, future heartbeat next, stalled heartbeat next, old backlog next, otherwise healthy. Equality with a budget is allowed; the state changes only when the age is greater. Keep the ages in the result even when another condition controls the state, so an observer can inspect both pieces of evidence.

Null backlog means no pending event was supplied, not a measured zero-duration event. The lab trusts the caller's snapshot and cannot establish whether the query supplying that snapshot was complete. If a production adapter drops failed reads and substitutes null, it could falsely report healthy. Preserve missing telemetry distinctly at that adapter.

## Transfer judgment

For both labs, the strongest answer names what the model cannot prove. Determinism does not imply ownership, a batch ceiling does not imply long-term fairness, and a fresh heartbeat does not imply correct domain results. Each stronger claim needs its own observation and boundary.

## Compare mechanisms, not spelling

For each difference from the reference, classify it as another valid implementation, a violated contract, or an assumption absent from the exercise. Show a concrete input for the second category. If you cannot produce one, do not call a stylistic preference a correctness defect.

Return to the application source before adopting a model. The reference deliberately omits infrastructure guarantees that would require browser, database, or provider evidence. It is an executable explanation, not a production patch.
