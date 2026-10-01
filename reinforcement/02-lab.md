# Isolated lab: A refresh coordinator as a small state machine

This is a small executable model, deliberately separate from the application. It uses Node's built-in test runner and has no package install, service, database, network call, or paid API dependency. It is JavaScript so you can focus on behavior first; the transfer task connects it back to this repository's JS/TS code.

## Contract

Implement `initialRefresh()` and `stepRefresh(state, event)` for one logical query.

- Initial state is `{inFlight:false, dirty:false, disposed:false, starts:0}`. starts counts requested fetch starts; the model performs no fetch.
- `hint`: if idle, start one fetch (`inFlight=true`, increment starts). If already in flight, mark dirty without increasing starts.
- `settled`: represents either success or failure of the current fetch. If none is in flight, ignore it. If dirty, start exactly one follow-up (increment starts, keep inFlight, clear dirty); otherwise become idle.
- `dispose`: set disposed, clear inFlight/dirty, preserve starts. This is logical teardown, not a claim that the underlying transport was canceled.
- After disposal ignore every event. Ignore unknown event types. Ignored events return the same state object. Never mutate input.

The model covers one coordinator. It does not implement Query observers, account isolation, HTTP error display, or websocket delivery.

## Work sequence

1. Read `lab/contract-check.mjs`. Predict the output of two cases on paper before editing anything.
2. Run the command below. The checked-in starter throws `Not implemented`; this first failure is intentional.
3. Implement only `lab/exercise.mjs`. Keep the tests unchanged until the supplied contract passes.
4. Add one test from your own boundary case. Explain which plausible wrong implementation it rejects.
5. Change one line of your implementation to a plausible mistake and show a test turns red. Undo only that experimental change.
6. Write down the distinction between this pure model and the real app boundary. Continue to [transfer](03-transfer.md).

From this pack's directory:

```powershell
node --test lab/contract-check.mjs
```

Or from the repository root, use `reinforcement/lab/contract-check.mjs` in that command.
Node 22.16.0 was available during authoring; no dependencies are needed for these `.mjs` files.

## Debugging prompts

- Does each hint start another fetch while one is already in flight?
- Does settling clear dirty before arranging the necessary follow-up?
- Can a failure strand the coordinator as permanently busy?
- Can an unmounted consumer start more work when an old promise settles?

## Completion evidence

Record the input, expected result, actual result, and the first place they diverge. A passing test with an assertion deleted does not count. Leave the app's source untouched while solving this lab.

After your attempt, compare [the reasoning guide](_answers/GUIDE.md). The separate reference implementation is checked with:

```powershell
node lab/contract-check.mjs --reference
```

That command exercises the answer, not your solution. It is for comparison after the attempt and for validating the teaching material.
