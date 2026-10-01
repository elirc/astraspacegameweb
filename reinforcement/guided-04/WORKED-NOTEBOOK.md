# Runnable worked notebook: Separate a next event, a gap, and another world

This notebook adds three solved examples around the existing `applyWorldEvent` teaching reference. It preserves the earlier unfinished starter. Reading or running these solved examples is study, not an independent completion of that exercise.

## Contract and owner

Snapshot is validated {worldId,sequence,value}; event is validated {worldId,sequence,delta}; IDs are strings, sequences nonnegative safe integers, values/deltas integers with safe aggregate arithmetic assumed. Return {status,snapshot}. Wrong world returns wrong-scope; event sequence <= current returns ignored; event sequence > current+1 returns gap; otherwise return applied with a new snapshot whose sequence is event.sequence and value adds delta. Non-applied results preserve snapshot identity. Check scope before sequence. Never mutate. This model assumes sequential dependent events, not independent commutative messages.

The [original coding exercise](../interview-03/coding/README.md) contains the complete practice workflow. The [reference source](../interview-03/_interviewer/reference.mjs) is deliberately separate from the starter. The new runner imports that reference and checks the literal expected values printed below; it does not call the live application.

## A slow walk through the main example

The snapshot is world A, sequence4, value10. An A event at sequence6 is not the next event; it produces gap and leaves the snapshot unchanged. An A event at5 with delta2 is the exact next event and produces sequence5,value12. A B event belongs to another scope, so it is rejected by scope before sequence is interpreted.

**The distinction to retain:** A larger sequence is not sufficient for a sequential projection: the exact-next relationship is the teaching contract.

Before looking at code, draw the state after each meaningful step. If the operation maintains an index or a set, write what enters it and what its key means. If it makes a transition decision, write the branch order and the first branch that accepts or rejects the input. These two ways of tracing make hidden assumptions more visible than jumping straight from input to final output.

Do not change the expected result merely to match an implementation. When there is a disagreement, return to the written contract. Decide whether the input violates a stated precondition, the expectation misreads a policy, or the implementation fails the rule. Each possibility leads to different corrective work.

## Example 1: A gap preserves the snapshot

Arguments, in parameter order:

```json
[
  {
    "worldId": "A",
    "sequence": 4,
    "value": 10
  },
  {
    "worldId": "A",
    "sequence": 6,
    "delta": 2
  }
]
```

Expected returned value:

```json
{
  "status": "gap",
  "snapshot": {
    "worldId": "A",
    "sequence": 4,
    "value": 10
  }
}
```

Read the arguments before the result. Identify the entity identity, meaningful order, and boundary values. Then compare every result field, including preserved values and empty collections. A partial assertion can miss the exact distinction the example was chosen to expose.


## Example 2: The next event applies

Arguments, in parameter order:

```json
[
  {
    "worldId": "A",
    "sequence": 4,
    "value": 10
  },
  {
    "worldId": "A",
    "sequence": 5,
    "delta": 2
  }
]
```

Expected returned value:

```json
{
  "status": "applied",
  "snapshot": {
    "worldId": "A",
    "sequence": 5,
    "value": 12
  }
}
```

Read the arguments before the result. Identify the entity identity, meaningful order, and boundary values. Then compare every result field, including preserved values and empty collections. A partial assertion can miss the exact distinction the example was chosen to expose.


## Example 3: Scope check precedes sequence classification

Arguments, in parameter order:

```json
[
  {
    "worldId": "A",
    "sequence": 4,
    "value": 10
  },
  {
    "worldId": "B",
    "sequence": 4,
    "delta": 9
  }
]
```

Expected returned value:

```json
{
  "status": "wrong-scope",
  "snapshot": {
    "worldId": "A",
    "sequence": 4,
    "value": 10
  }
}
```

Read the arguments before the result. Identify the entity identity, meaningful order, and boundary values. Then compare every result field, including preserved values and empty collections. A partial assertion can miss the exact distinction the example was chosen to expose.

## Run the worked examples

From this guided block's `examples` directory:

```powershell
node --test check.mjs
```

Three named checks compare complete returned values and confirm that the supplied argument values remain unchanged. The runner freezes input structures recursively, so accidental mutation is also exposed in these fixtures. It uses Node's built-in test and assertion modules and needs no install, server, database, account, or network call.

The reference function is imported from the preceding interview block. If you move this folder independently, preserve that relative relationship or update the import deliberately. The source link and import target are included in the local navigation checks. This runner does not alter or mark your earlier starter as solved.

## Read the implementation after the trace

Apply scope checks before ordering so an event for another world cannot be classified as an ordinary duplicate of this world. An exact-next check distinguishes safe sequential progress from a missing event. Runtime and extra state are O(1) for fixed-size records. A gap calls for a policy such as loading an authoritative snapshot; this helper does not fetch one, persist deduplication, or prove that the actual game API uses this synthetic sequence contract.

Now connect the explanation to actual lines in the reference. Mark input validation or assumed preconditions, identity construction, the main decision, output construction, and preservation of caller-owned state. Not every helper has every category. If a category is absent because the contract delegates it to the caller, write that rather than imagining hidden validation.

Compare the first example with each variation. Identify the changed dimension before looking at the new result. The empty or boundary case is not an afterthought: it reveals what the function means when ordinary work is absent or when a threshold is exactly reached. A deterministic tie or scope check can be decisive even when most fields look identical.

## From solved reading to independent practice

Close the reference and reconstruct the main decision in a separate practice file. Keep your first attempt, including its mistakes. Add a fourth fixture that rejects a plausible wrong implementation. Write the expected result before execution and explain why it follows from the contract.

If your code differs from the reference, compare behavior rather than spelling. Another loop, data structure, or decomposition can be valid. State its time and space costs and its effect on clarity. Do not add a framework or dependency merely to make the exercise look more advanced.

## Connect the model back to Warband / astraspacegameweb

The project boundary to inspect is event transaction, refresh coordinator, and progress metrics. The model can explain a policy while omitting authorization, persistence, browser interaction, or concurrent execution. Locate the real caller and name the missing guarantee before proposing an application change.

An accurate learning journal can say that the three solved examples ran and matched their expected values. It cannot turn that result into a claim that the application was built, deployed, browser-tested, or verified against an external provider. Record your own source trace and integration evidence separately when you perform them.

## Explain it without the code

Use this speaking sequence: the user wants __; the input identifies __; the function preserves __; the surprising branch is __; the result is __; the real application still needs __. Then have a listener change one input. If you can predict the changed result and identify the decisive step, you have evidence of understanding beyond recognizing the reference.
