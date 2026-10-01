# Project defense mock: Warband / astraspacegameweb

Run this as one 60-minute session focused on review judgment, honest ownership, and a design tradeoff. Keep interviewer notes closed. Use the selected cases below as material; you are not expected to complete three full standalone timeboxes inside this mock.

- Round 7, case 5: [Code-review and take-home defense](../rounds/07-review.md) — Request health hides stalled event work.
- Round 8, case 6: [Project explanation and behavioral interview](../rounds/08-behavioral.md) — The user switches worlds during a request.
- Round 6, case 2: [Junior system-design and data-model interview](../rounds/06-design.md) — A sequence gap is hidden.

## Script and timing

**Minutes 0–5: project introduction.** Explain the user and one workflow in ninety seconds. The interviewer asks what you personally did and which claim is supported by a source trace, a teaching test, or application evidence. Clarify the role of world identity, event sequence, and active client request without starting with a list of technologies.

**Minutes 5–20: first case.** Read the fixture aloud, ask at most three useful contract questions, and predict the result. Produce the smallest artifact needed for this case: a function, transition table, or boundary diagram. The interviewer asks you to point to the invariant before adding a new abstraction.

**Minutes 20–35: second case.** Work from this setup: Active worldB; returning payload belongs to worldA.. Explain two hypotheses or implementation choices and the input that distinguishes them. The interviewer introduces a reordered input, a scope change, or an unavailable dependency; choose the variation relevant to your explanation. Preserve what remains true rather than restarting the entire design.

**Minutes 35–48: third case and tradeoff.** Discuss the selected review, design, or contract question. State one alternative that could be correct under a different requirement. Explain what you would measure or verify before making the more complicated choice. Label all scale numbers as assumptions unless you have actual recorded measurements.

**Minutes 48–55: evidence challenge.** The interviewer asks which test could pass while the bug remained. Identify a mock, happy-path fixture, or observation at the wrong layer that would create false confidence. Propose a replacement assertion and name whether you have run it.

**Minutes 55–60: self-review.** Summarize the strongest answer and the first unsupported assumption. Use the [scorecard](../SCORECARD.md). Schedule one changed-fixture retry and stop; do not extend the session until every answer feels polished.

## Rules for a useful mock

The candidate may inspect the source map when the interviewer explicitly switches to an open-book segment. Record that help. During a coding segment, preserve the provided assertions and explain any new test before running it. During a design segment, do not claim implementation completion. During a behavioral segment, do not borrow authorship from existing project history.

If you are practicing alone, write your initial answer before revealing notes and use a timer. A transcript can be short: decision, reason, example, uncertainty. The goal is to expose reasoning gaps, not produce a word-for-word script to memorize. After your attempt, use the [interviewer script](../_interviewer/mocks/project-defense.md).
