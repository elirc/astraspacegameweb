# Warband / astraspacegameweb: Debugging and test-design interview

Work one case at a time in approximately 35 minutes. These are six distinct scenarios viewed through this interview round. Select a case you have not recently rehearsed. The [source map](../README.md), [scorecard](../SCORECARD.md), and [project defense](../PROJECT-DEFENSE.md) support your attempt. Afterward use the [separate interviewer notes](../_interviewer/rounds/05-debugging.md).

## How to run this round

Treat this case as a bug report whose mechanism has not yet been confirmed. Write two competing hypotheses and one observation that distinguishes them. Identify the first boundary you would inspect in the supplied source map. Avoid beginning with a broad rewrite or assuming the case describes a current production defect.

Build a minimal reproduction from the fixture. Preserve the exact input and the ordering of events. Record expected and observed behavior separately. If a necessary dependency is unavailable, specify the smallest integration setup and mark its runtime result pending; a proposed test is not a completed investigation.

The interviewer will offer a patch that makes the visible symptom disappear while leaving the invariant broken. Explain which assertion would reject that patch. Choose between a pure test, adapter test, component test, or database test based on the boundary under investigation, and identify one mock that would make the test uninformative.

Deliver a concise incident note: symptom, hypotheses, distinguishing observation, confirmed or unconfirmed cause, focused change, tests, and remaining risk. Include a before/after example and avoid claiming all adjacent behavior was verified by one focused check.

## 10.5.1 — A stale snapshot arrives after a newer one

**Scenario.** Two refreshes complete out of order. The later-arriving response represents an older world revision.

**Starting fixture.** Applied revision12; delayed response revision11 arrives.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.5.2 — A sequence gap is hidden

**Scenario.** A client receives event sequence8 after applying6. Applying it directly could skip a required intermediate transition.

**Starting fixture.** Current6; incoming8; event7 absent.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.5.3 — A busy world consumes every batch

**Scenario.** A due-event selector repeatedly chooses the earliest events from one busy world. Another world remains due.

**Starting fixture.** Global batch2; worldA has100 early events; worldB has1 later due event.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.5.4 — Two workers select one event

**Scenario.** Independent workers both select the same due event before either commits an effect.

**Starting fixture.** WorkerA andB selectE; both intend resource increment.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.5.5 — Request health hides stalled event work

**Scenario.** The metrics endpoint responds quickly while no due event is being resolved. Completed-event lag samples are old.

**Starting fixture.** HTTP200 recent; last completion old; pending oldest age increasing.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 10.5.6 — The user switches worlds during a request

**Scenario.** A refresh for worldA starts; the player switches to worldB; A’s response finishes afterward.

**Starting fixture.** Active worldB; returning payload belongs to worldA.

Your user is a player or game operator; the affected surface is the game state and refresh status. Keep world identity, event sequence, and active client request visible in the model. The user-facing operation is to resolve a due event and publish refreshed state.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace event transaction, refresh coordinator, and progress metrics. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.
