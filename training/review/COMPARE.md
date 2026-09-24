# Compare: my review vs the model review

Fill this in **after** writing `MY_FINDINGS.md`, with `_answers/review.md` open.

| Model finding # | Did I find it? (yes / partly / no) | If partly or no: what did I look at instead? |
|---|---|---|
| 1 | | |
| 2 | | |
| … | | |

## Findings I had that the model review doesn't

| My finding | Is it real? (verify now) | Why the model might have skipped it |
|---|---|---|

## The pattern behind my misses

Tick what applies and write one sentence of evidence for each tick:

- [ ] I reviewed code but not **config** (`infra/`, compose, CI).
- [ ] I trusted docs/runbooks without checking the code does what they say.
- [ ] I didn't ask "what does this metric/alert do when the system is *down* or *saturated*?"
- [ ] I didn't think about **N processes** (replicas, roles) running the same loop.
- [ ] I didn't check the deploy/rollback path end to end.
- [ ] I didn't run anything.
- [ ] Other:

## One habit I'll change in my next review

(Concrete. Example: "For every alert, write the input that makes it fire and check that the input is representable.")
