# Interviewer notes: Warband / astraspacegameweb / React component and interaction interview

Keep this file closed during a first attempt. Accept behaviorally correct alternatives that satisfy the declared contract. Source-grounded explanations and honest limitations matter more than matching these words. Return to the [candidate round](../../rounds/02-react.md) to run a new attempt.

## How to evaluate this round

Evaluate the state model before styling or hook count. A good answer places authoritative facts at their real owner and keeps a draft distinguishable from a fetched record. Derived values can be calculated from their inputs rather than maintained as an additional independent copy. When the candidate proposes an effect, ask which external synchronization it performs and how cleanup mirrors setup.

Use this case's fixture to walk a complete render/event/response sequence. Ask what the handler captured when it was created and what identity is checked before applying a later result. A ref can retain mutable information, but using one is not a substitute for deciding whether the operation belongs to an earlier submission or the current selection.

Require an observable interaction: choose an item, submit, receive a controlled response, and inspect both the visible result and an unrelated value that must remain unchanged. Avoid a test that replaces the state owner with a mock whose return value already guarantees the expected behavior. A pure helper test and a component test support different claims.

For accessibility, prefer the existing semantic element and describe its native behavior before adding custom keyboard handling. Check a meaningful label, disabled/pending behavior, error association, and focus recovery. Do not award a claim of full accessibility from one role query. Junior success is a coherent small interaction with clear evidence limits; additional memoization or a new state library needs a demonstrated reason.

## 10.2.1 — A stale snapshot arrives after a newer one

### Expected project reasoning

**Invariant:** Applying a response must not move the client backward in the chosen revision model.

Reject the stale snapshot and retain revision12. Validate world identity as well as revision. This synthetic sequence contract should be mapped to the actual API before assuming a revision field exists.

**Plausible wrong approach:** Treat arrival time as proof of freshness.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.2.2 — A sequence gap is hidden

### Expected project reasoning

**Invariant:** A sequential event projection must distinguish the next event from a gap.

Return a gap/reload outcome under the lab contract and fetch an authoritative snapshot. Whether events are independently commutative is a different contract that must be stated before relaxing this rule.

**Plausible wrong approach:** Accept every larger sequence number as the immediate next event.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.2.3 — A busy world consumes every batch

### Expected project reasoning

**Invariant:** A per-batch quota and long-term fairness are different properties.

Show how a per-world ceiling changes one batch, then give a repeated-batch starvation example when the global limit is too small. A persistent rotation or age policy is a separate design decision.

**Plausible wrong approach:** Claim that one batch limit proves all worlds make progress.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.2.4 — Two workers select one event

### Expected project reasoning

**Invariant:** Selection alone does not establish exclusive or idempotent application ownership.

Locate the transactional claim or conditional transition and observe committed effects in a competing-worker test. A deterministic sort changes order but cannot supply this concurrency guarantee.

**Plausible wrong approach:** Fix duplicate effects by adding an ID tie breaker to the selector.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.2.5 — Request health hides stalled event work

### Expected project reasoning

**Invariant:** Operational signals must distinguish request availability from engine progress.

Inspect the existing pending-event and oldest-event gauges as well as completion metrics. Choose an observation tied to actual progress. Do not invent a claim that the current application lacks signals without reading them.

**Plausible wrong approach:** Use a successful metrics request as proof that domain work is advancing.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 10.2.6 — The user switches worlds during a request

### Expected project reasoning

**Invariant:** Query scope must be checked when a response is applied, not only when launched.

Keep results associated with world identity and reject a response for an inactive scope. Aborting can save work, but the ownership check still makes the state transition explicit and testable.

**Plausible wrong approach:** Write every response into one unscoped global game-state object.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to event transaction, refresh coordinator, and progress metrics and which belongs to the game state and refresh status. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.
