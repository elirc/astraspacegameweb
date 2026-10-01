# Warband / astraspacegameweb: Code-review and take-home defense

Work one case at a time in approximately 30 minutes. These are six distinct scenarios viewed through this interview round. Select a case you have not recently rehearsed. The [source map](../README.md), [scorecard](../SCORECARD.md), and [project defense](../PROJECT-DEFENSE.md) support your attempt. Afterward use the [separate interviewer notes](../_interviewer/rounds/07-review.md).

## How to run this round

Imagine a pull request claims to solve this case. Write a small deliberately flawed snippet in your practice notes using the tempting shortcut, then review it. Keep deliberate defects outside application code. The review must identify an input that fails, the user consequence, and the smallest contract-preserving change.

Separate correctness, compatibility, security or scope, test coverage, and style. Label a blocking issue with the violated invariant. Label an optional preference as a suggestion rather than presenting it as a defect. Check whether the patch changes a default, removes an assertion, or broadens access while apparently simplifying the code.

The interviewer will defend the patch with a passing happy-path test. Supply a counterexample and explain which layer should catch it. Then reverse roles: defend your own proposed change against a reviewer who prefers another valid implementation. Compare behavior and evidence rather than arguing that your code resembles a familiar pattern.

Deliver three review comments and a short PR description. Each comment should be actionable without rewriting the entire project. The description should lead with the concrete behavior change, identify focused validation, and leave unrun checks explicit.

## 10.7.1 — A stale snapshot arrives after a newer one

**Scenario.** Two refreshes complete out of order. The later-arriving response represents an older world revision.

**Starting fixture.** Applied revision12; delayed response revision11 arrives.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.7.2 — A sequence gap is hidden

**Scenario.** A client receives event sequence8 after applying6. Applying it directly could skip a required intermediate transition.

**Starting fixture.** Current6; incoming8; event7 absent.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.7.3 — A busy world consumes every batch

**Scenario.** A due-event selector repeatedly chooses the earliest events from one busy world. Another world remains due.

**Starting fixture.** Global batch2; worldA has100 early events; worldB has1 later due event.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.7.4 — Two workers select one event

**Scenario.** Independent workers both select the same due event before either commits an effect.

**Starting fixture.** WorkerA andB selectE; both intend resource increment.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.7.5 — Request health hides stalled event work

**Scenario.** The metrics endpoint responds quickly while no due event is being resolved. Completed-event lag samples are old.

**Starting fixture.** HTTP200 recent; last completion old; pending oldest age increasing.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.7.6 — The user switches worlds during a request

**Scenario.** A refresh for worldA starts; the player switches to worldB; A’s response finishes afterward.

**Starting fixture.** Active worldB; returning payload belongs to worldA.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.
