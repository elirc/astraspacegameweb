# A bounded application change

Propose one focused operational improvement: either characterize batch ordering at the actual event selection boundary or add a small, clearly specified freshness projection using signals the application can actually provide. Start by reading the current engine and metrics callers. If the necessary progress signal is absent, make that an explicit prerequisite instead of substituting HTTP request time.

For ordering, acceptance examples include equal due times, two worlds, a future event, and a saturated world. Keep any proposed scheduling policy separate from ownership and transactional resolution. A regression test may be the complete useful change if the current scheduler already has the intended behavior.

For freshness, require a truthful unknown state before the first observation, exact threshold behavior, an explanation of clock skew, and a healthy-to-stalled transition with controlled time. Do not attach a polling interval or alert threshold merely because it appears in the lab. Write down the product requirement that makes a proposed value reasonable.

Deliver an operational note showing what an on-call teammate should inspect next for each state. Include one case where the signal remains healthy while a domain error exists; this prevents the health indicator from being presented as proof of overall game correctness.

## Delivery contract

Produce a one-page proposal, an acceptance table, a focused practice diff, and a verification note. If the relevant code already behaves correctly, deliver the missing regression or characterization evidence instead of rewriting it. If setup is blocked, deliver the proposed diff and precise reproduction plan with runtime status pending; do not mark the capstone implemented.

Before accepting an agent's patch, explain the smallest failing example yourself. Limit its allowed files, name an excluded adjacent feature, and ask it to list assumptions. Review the whole diff, including removed assertions and changed defaults. Your final explanation must distinguish the application's existing guarantees from the new teaching model's choices.

Completion requires a before/after example visible at the right boundary, one unrelated behavior preserved, and one limitation stated plainly. “All tests pass” is not sufficient if the relevant case was never in the suite. End with a 90-second explanation aimed at a teammate who did not see these exercises.
