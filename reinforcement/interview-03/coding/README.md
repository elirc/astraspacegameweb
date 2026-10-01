# Timed coding challenge: Apply only the next event in a world projection

Timebox: 35 minutes, followed by a 10-minute explanation. This is a new standalone interview exercise for Warband / astraspacegameweb. No package installation, server, database, account, or paid service is required. Inputs and behavior are synthetic; the function is not a production patch.

## Exact contract

Export `applyWorldEvent(snapshot, event)` from `exercise.mjs`.

Snapshot is validated {worldId,sequence,value}; event is validated {worldId,sequence,delta}; IDs are strings, sequences nonnegative safe integers, values/deltas integers with safe aggregate arithmetic assumed. Return {status,snapshot}. Wrong world returns wrong-scope; event sequence <= current returns ignored; event sequence > current+1 returns gap; otherwise return applied with a new snapshot whose sequence is event.sequence and value adds delta. Non-applied results preserve snapshot identity. Check scope before sequence. Never mutate. This model assumes sequential dependent events, not independent commutative messages.

## Candidate workflow

Use minutes 0–5 to clarify the contract and write two concrete examples. Use minutes 5–25 for a baseline implementation. Use minutes 25–35 for edge cases, mutation checks, and a complexity explanation. Read `check.mjs` without editing its assertions. The starter deliberately throws `Not implemented`.

From this directory:

```powershell
node --test check.mjs
```

Add one discriminating test of your own. Explain which plausible wrong implementation it rejects before running it. The supplied seven tests are a contract sample, not an exhaustive proof of all possible inputs. Validation preconditions are part of the contract; do not silently claim to handle arbitrary untrusted JSON unless you add and test that boundary.

## Interview follow-ups

1. Trace a duplicate or boundary input through each branch.
2. Identify which input determines time and working-space growth.
3. Explain whether ordering is a requirement or an implementation accident.
4. Show an unchanged input or unrelated record after the operation.
5. State what changes if another process performs the same work concurrently.
6. Sketch a TypeScript signature or the project's JSDoc equivalent without changing the runtime contract.
7. Name the real repository boundary that would need integration verification before adopting the model.

After your own attempt, use the [separate reasoning guide](../_interviewer/coding.md). The reference command checks the author's answer, not your solution:

```powershell
node check.mjs --reference
```

Keep your first failing result, added assertion, corrected result, and an honest note about help used. The filename `check.mjs` avoids conventional test/spec discovery patterns in application runners; invoke it explicitly as shown. This challenge has no React or TypeScript build step, so passing it does not validate a component or a type sketch.
