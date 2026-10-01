# A forty-five-minute system-design interview

Prompt: **Design a progressing event engine and reconnectable client state**. Start from the existing repository context, then make one coherent proposed design. Keep the [reference notes](_answers/REFERENCE.md) closed until after your attempt.

## Timebox

| Minutes | Work | What the interviewer should be able to assess |
|---|---|---|
| 0–5 | Clarify one journey, scale assumptions, and non-goals | Which problem is actually being solved |
| 5–12 | State the invariant and sketch API/data ownership | Identity, authorization, and accepted outcomes |
| 12–22 | Draw the component and request flow | Why each boundary exists and where commit occurs |
| 22–32 | Walk the case's crash or race | Retry, ordering, reconciliation, and unchanged state |
| 32–38 | Reproduce one capacity calculation and challenge it | Units, skew, saturation, and measured versus assumed facts |
| 38–43 | Compare one alternative and recovery plan | Tradeoff, operational cost, revisit trigger |
| 43–45 | Summarize evidence and unresolved questions | Honest limits and a concrete next check |

## Follow-up questions for this project

1. Where exactly is this enforced: An eligible world event has one policy-consistent committed effect, and client refresh/reconnect cannot make another world or obsolete account own the current displayed state.
2. Which source observation supports your current-state diagram, and which component is only proposed?
3. What happens if a response is lost after the decisive commit?
4. What can a second client or worker do concurrently, and which predicate or identity stops an invalid second effect?
5. Which read may be stale, and which decision must consult authoritative state?
6. What remains true if the cache, queue delivery, browser, or external dependency fails?
7. Which capacity assumption is most likely to break for a hot tenant/entity?
8. What data is retained, deleted, or replayed after restoring an earlier backup?
9. Which test could pass while your claimed guarantee is still broken?
10. What would justify adopting the alternative you rejected?

## Evidence and scoring

Score requirements, data/API contracts, concurrency/failure reasoning, capacity/operations, and communication from 0 to 2 each. A score of 2 requires a concrete example or observation appropriate to that dimension; a score of 1 is a mostly correct explanation with a gap; a score of 0 is missing or incorrect. Report the individual dimensions, not only a total. This is a learning rubric, not an employer's hiring threshold.

Do a second attempt with one requirement changed and without reading the answer. If the new condition invalidates your architecture, revise the boundary rather than defending the original diagram at all costs. A strong junior answer can be small, precise, and explicit about what remains unverified.
