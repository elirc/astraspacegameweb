# Interviewer notes: Warband / astraspacegameweb / Project explanation and behavioral interview

Keep this file closed during a first attempt. Accept behaviorally correct alternatives that satisfy the declared contract. Source-grounded explanations and honest limitations matter more than matching these words. Return to the [candidate round](../../rounds/08-behavioral.md) to run a new attempt.

## How to evaluate this round

Evaluate ownership and reasoning, not polish alone. The candidate should distinguish reading existing code, completing a teaching lab, writing a proposed test, and verifying an application change. Those are all useful activities, but they support different claims. Ask which exact artifact demonstrates the candidate's own work.

A good explanation connects the technical choice to a user consequence. It names one invariant, one rejected alternative, and one observation that supports the decision. It does not spend most of the time listing libraries. When discussing a mistake, the candidate can describe an incorrect prediction from a real practice exercise and how a counterexample changed it; an invented production incident is unnecessary.

For disagreement, ask how the candidate would separate a product-policy question from a code-correctness question. The response should invite a concrete example or acceptance criterion rather than appeal to seniority or a tool's output. For uncertainty, a bounded verification plan is better than pretending an unrun integration check passed.

Score the answer on specificity, ownership accuracy, tradeoff reasoning, evidence, and reflection. Do not award a strong score merely for using a familiar story framework. Junior success is an honest, understandable explanation that survives two follow-up questions. End by asking what assumption would make the chosen approach wrong; the candidate should be able to revise the plan without abandoning the invariant or inflating the evidence.

## 10.8.1 — A stale snapshot arrives after a newer one

### Expected project reasoning

**Invariant:** Applying a response must not move the client backward in the chosen revision model.

Reject the stale snapshot and retain revision12. Validate world identity as well as revision. This synthetic sequence contract should be mapped to the actual API before assuming a revision field exists.

**Plausible wrong approach:** Treat arrival time as proof of freshness.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.8.2 — A sequence gap is hidden

### Expected project reasoning

**Invariant:** A sequential event projection must distinguish the next event from a gap.

Return a gap/reload outcome under the lab contract and fetch an authoritative snapshot. Whether events are independently commutative is a different contract that must be stated before relaxing this rule.

**Plausible wrong approach:** Accept every larger sequence number as the immediate next event.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.8.3 — A busy world consumes every batch

### Expected project reasoning

**Invariant:** A per-batch quota and long-term fairness are different properties.

Show how a per-world ceiling changes one batch, then give a repeated-batch starvation example when the global limit is too small. A persistent rotation or age policy is a separate design decision.

**Plausible wrong approach:** Claim that one batch limit proves all worlds make progress.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.8.4 — Two workers select one event

### Expected project reasoning

**Invariant:** Selection alone does not establish exclusive or idempotent application ownership.

Locate the transactional claim or conditional transition and observe committed effects in a competing-worker test. A deterministic sort changes order but cannot supply this concurrency guarantee.

**Plausible wrong approach:** Fix duplicate effects by adding an ID tie breaker to the selector.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.8.5 — Request health hides stalled event work

### Expected project reasoning

**Invariant:** Operational signals must distinguish request availability from engine progress.

Inspect the existing pending-event and oldest-event gauges as well as completion metrics. Choose an observation tied to actual progress. Do not invent a claim that the current application lacks signals without reading them.

**Plausible wrong approach:** Use a successful metrics request as proof that domain work is advancing.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.8.6 — The user switches worlds during a request

### Expected project reasoning

**Invariant:** Query scope must be checked when a response is applied, not only when launched.

Keep results associated with world identity and reject a response for an inactive scope. Aborting can save work, but the ownership check still makes the state transition explicit and testable.

**Plausible wrong approach:** Write every response into one unscoped global game-state object.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.
