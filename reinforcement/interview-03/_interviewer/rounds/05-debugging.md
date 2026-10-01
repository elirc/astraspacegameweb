# Interviewer notes: Warband / astraspacegameweb / Debugging and test-design interview

Keep this file closed during a first attempt. Accept behaviorally correct alternatives that satisfy the declared contract. Source-grounded explanations and honest limitations matter more than matching these words. Return to the [candidate round](../../rounds/05-debugging.md) to run a new attempt.

## How to evaluate this round

Reward a sequence of discriminating observations, not confidence or the number of tools mentioned. The candidate should preserve the failing fixture before changing implementation. Ask what result would falsify their preferred hypothesis; if no observation could change their mind, the investigation is not yet well specified.

Use the case's tempting shortcut as a mutation of the proposed solution. The regression should fail for that plausible wrong implementation. For data boundaries, compare both the intended entity and an unrelated entity or scope. For timing boundaries, control completion order. For transaction claims, observe persisted effects after the failure rather than only a thrown exception or mocked call count.

Ask whether the reproduction demonstrates the symptom, the mechanism, or the complete fix. Those are different levels of evidence. A component test may establish what a user sees without proving a server permission check. A pure reducer may establish transition policy without proving delivery or persistence. The handoff should use words that match the evidence actually collected.

Keep the patch narrow enough that a reviewer can connect it to the cause. Additional cleanup can be proposed separately when it is not necessary to reject the reproducer. Junior success is a reproducible case, a reasoned minimal change, and honest uncertainty. It is acceptable to stop with an exact remaining hypothesis when an integration dependency is unavailable; it is not acceptable to relabel that missing check as a pass.

## 10.5.1 — A stale snapshot arrives after a newer one

### Expected project reasoning

**Invariant:** Applying a response must not move the client backward in the chosen revision model.

Reject the stale snapshot and retain revision12. Validate world identity as well as revision. This synthetic sequence contract should be mapped to the actual API before assuming a revision field exists.

**Plausible wrong approach:** Treat arrival time as proof of freshness.

Use the exact starting fixture from [the candidate round](../../rounds/05-debugging.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.5.2 — A sequence gap is hidden

### Expected project reasoning

**Invariant:** A sequential event projection must distinguish the next event from a gap.

Return a gap/reload outcome under the lab contract and fetch an authoritative snapshot. Whether events are independently commutative is a different contract that must be stated before relaxing this rule.

**Plausible wrong approach:** Accept every larger sequence number as the immediate next event.

Use the exact starting fixture from [the candidate round](../../rounds/05-debugging.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.5.3 — A busy world consumes every batch

### Expected project reasoning

**Invariant:** A per-batch quota and long-term fairness are different properties.

Show how a per-world ceiling changes one batch, then give a repeated-batch starvation example when the global limit is too small. A persistent rotation or age policy is a separate design decision.

**Plausible wrong approach:** Claim that one batch limit proves all worlds make progress.

Use the exact starting fixture from [the candidate round](../../rounds/05-debugging.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.5.4 — Two workers select one event

### Expected project reasoning

**Invariant:** Selection alone does not establish exclusive or idempotent application ownership.

Locate the transactional claim or conditional transition and observe committed effects in a competing-worker test. A deterministic sort changes order but cannot supply this concurrency guarantee.

**Plausible wrong approach:** Fix duplicate effects by adding an ID tie breaker to the selector.

Use the exact starting fixture from [the candidate round](../../rounds/05-debugging.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.5.5 — Request health hides stalled event work

### Expected project reasoning

**Invariant:** Operational signals must distinguish request availability from engine progress.

Inspect the existing pending-event and oldest-event gauges as well as completion metrics. Choose an observation tied to actual progress. Do not invent a claim that the current application lacks signals without reading them.

**Plausible wrong approach:** Use a successful metrics request as proof that domain work is advancing.

Use the exact starting fixture from [the candidate round](../../rounds/05-debugging.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.5.6 — The user switches worlds during a request

### Expected project reasoning

**Invariant:** Query scope must be checked when a response is applied, not only when launched.

Keep results associated with world identity and reject a response for an inactive scope. Aborting can save work, but the ownership check still makes the state transition explicit and testable.

**Plausible wrong approach:** Write every response into one unscoped global game-state object.

Use the exact starting fixture from [the candidate round](../../rounds/05-debugging.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.
