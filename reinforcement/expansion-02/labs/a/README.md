# Lab A: Select a bounded event batch

Practice deterministic selection with an explicit per-world ceiling, while keeping claiming and fairness guarantees separate.

## Exact teaching contract

Export `planDue(events,now,limit,perWorld)`. Events are a validated array of unique `{id,worldId,dueAt}` records with string IDs and finite dueAt. now must be finite; limit and perWorld must be positive safe integers, otherwise throw RangeError. Select only dueAt <= now. Order by dueAt ascending, breaking ties by string code-unit ID order. Walk that order and select at most limit IDs, and at most perWorld IDs for each world. Return an array of selected IDs; leave input unchanged. Underfilled batches are allowed. This is not a claim, lock, or long-term fairness guarantee.

## Work the examples before the implementation

At now100, list A1 due90, A2 due91, B1 due92, and C1 due101. Predict the batch for limit3/perWorld1, then limit3/perWorld2. Reorder the input and predict again.

Read `check.mjs`, write expected results for two cases, and then run it. The starter deliberately throws `Not implemented`. Implement `exercise.mjs` yourself and keep the supplied assertions unchanged. Add one test for an edge that is not already asserted, then demonstrate a plausible wrong implementation fails it.

From this lab directory:

```powershell
node --test check.mjs
```

The file is explicitly named `check.mjs` rather than a test/spec filename so conventional app test discovery does not collect an unfinished teaching exercise. There is no npm install, database, network, paid model, or payment call. These are small JavaScript models; types and application integration are separate practice tasks.

## Connect the model to the application

Find the real event selector and transaction boundary. Compare the existing ordering and ownership guarantees before proposing any scheduling change.

Record what is simplified: input validation already assumed, event ordering promised by the caller, a missing persistence layer, or an injected clock. A passing model is useful only when you can name the guarantee the real app still needs.

After your own attempt, read [the reasoning guide](../../_answers/GUIDE.md). The separate reference is checked with:

```powershell
node check.mjs --reference
```

This second command verifies the author's answer, not your solution. If your solution differs but meets every stated contract, compare invariants and failure cases instead of matching lines. Save the failing output, corrected output, your extra assertion, and a short explanation of why the correction is sufficient for this model.
