# Interviewer script: Project defense / Warband / astraspacegameweb

Use the [candidate script](../../mocks/project-defense.md). Keep the session at sixty minutes so prioritization is part of the exercise. Before starting, choose whether source lookup is allowed during each segment and state that rule. Do not change the rules halfway through merely because the candidate is struggling.

## Opening calibration

Ask: what does a player or game operator need from the game state and refresh status? Then ask which part the candidate personally implemented, tested, or only studied. A precise limited answer is preferable to an inflated description of the entire repository. If the candidate says a test passed, ask which test, against what environment, and what assertion supports the claim.

## Follow-up ladder

Start with the supplied fixture and wait for a prediction. If the candidate stalls, offer a contract clarification before an implementation hint. If they succeed quickly, change one boundary: an old response returns late, a different scope uses the same local ID, or the first effect succeeds while its response is lost. Use only a variation that is meaningful for the selected case.

The central case invariant is: Query scope must be checked when a response is applied, not only when launched.

Expected direction: Keep results associated with world identity and reject a response for an inactive scope. Aborting can save work, but the ownership check still makes the state transition explicit and testable.

The tempting shortcut to challenge is: Write every response into one unscoped global game-state object.

Ask the candidate for the smallest failing input to that shortcut. If they provide only a slogan, require the actual values and an observable result. If they suggest a different valid policy, distinguish a product decision from a coding defect and ask them to update the acceptance examples.

## What to record

For each segment, record the first assumption, whether the candidate noticed its failure, and the quality of the correction. Separate a hint-assisted solution from an independent one. Preserve a useful partial implementation rather than converting every incomplete attempt into a failure with no diagnostic value.

Use contract, mechanism, verification, and communication as the common discussion dimensions. Add implementation only where code was actually required. Mark missing integration evidence as missing even when the pure reasoning is correct. A browser sketch cannot establish focus behavior; a mocked repository cannot establish transaction rollback; a projection cannot authorize an operation.

## Debrief

Give one concrete strength and one specific next exercise. Ask the candidate to restate the corrected rule without copying the notes. Then change the fixture once more to check that the correction is understood. A new example that preserves the invariant is better evidence than a polished repetition of the answer.

Do not promise hiring success based on this session. The educational aim is to make reasoning, coding, and evidence claims easier to assess. The next attempt should target the weakest dimension and use a different scenario from the same project or the corresponding round in another project.
