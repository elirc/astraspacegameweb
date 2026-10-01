# Transfer workbook: Warband / astraspacegameweb

Complete one variation per short session. Write your first answer without an agent or answer key, then revise it after checking source or running a small experiment. For each variation, supply a concrete input, predicted result, invariant, and test boundary. A paragraph repeating a general principle does not complete the exercise.

## Variation 1: Batch quota versus fairness

Construct six due events across worlds A and B. Use a batch limit of two and a per-world limit of one, then reduce the global limit to one. Show which events are selected and a repeated-batch scenario where B could still starve. State the additional scheduling memory that would be needed to address it.

## Variation 2: Equal timestamps

Write two differently ordered arrays containing the same three events with identical due times. Predict the selected IDs when the limit is two. Explain why a tie breaker is part of the contract, and whether a locale-sensitive comparator would be appropriate for these opaque IDs.

## Variation 3: Crash after selection

Draw select, claim, apply, commit, and acknowledge as separate steps. Place a crash after each step and identify what another worker can observe. Mark which answers require reading the real transaction implementation and which follow from the pure lab. Do not assume retry means exactly once.

## Variation 4: Missing is not zero

Compare a null heartbeat with heartbeatAt equal to zero at now equal to zero. Give the freshness result for both. Then set a heartbeat in the future and show why clamping its age to zero would hide an important diagnostic.

## Variation 5: Healthy writer, stuck work

Imagine a timer updates a heartbeat while the event resolver is stuck. Give values that make the heartbeat fresh and the backlog stale. Explain why the chosen precedence reports backlogged and what additional observation would distinguish low throughput from a single poison event.

## Variation 6: Client evidence

A player refreshes twice and receives two successful responses with identical state. List three explanations that do not require a broken browser request. Choose one and specify a server observation plus a user-visible assertion that would confirm or reject it.

## Review without an answer key

Choose two variations and exchange them with a reviewer, or ask an agent to challenge only your assumptions. Require a counterexample, not a rewritten solution. Record the strongest objection, whether you accepted it, and the evidence that settled it. Keep disagreements about product policy separate from disagreements about code behavior.

## Retrieval schedule and score

Tomorrow, reproduce one transition or boundary table from memory. In seven days, write an edge test without reading the reference. In three weeks, transfer the idea to a different project and identify the assumption that changes.

Score 0–2 each for source tracing, lab A, lab B, application evidence, and explanation. A 2 requires your own counterexample and supporting observation; a 1 means a correct explanation without independent evidence; a 0 means missing or incorrect. Target 8/10, but leave application work pending if you did not run it. Scores describe this exercise, not a professional seniority level.

Record: date; commit/worktree context; original prediction; observation; revised rule; verification still pending; next repetition date. Human mastery is **not assessed** until you provide this evidence.
