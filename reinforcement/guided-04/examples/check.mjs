import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorldEvent as subject } from '../../interview-03/_interviewer/reference.mjs';
const examples=[
  {
    "label": "A gap preserves the snapshot",
    "args": [
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
    ],
    "expected": {
      "status": "gap",
      "snapshot": {
        "worldId": "A",
        "sequence": 4,
        "value": 10
      }
    }
  },
  {
    "label": "The next event applies",
    "args": [
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
    ],
    "expected": {
      "status": "applied",
      "snapshot": {
        "worldId": "A",
        "sequence": 5,
        "value": 12
      }
    }
  },
  {
    "label": "Scope check precedes sequence classification",
    "args": [
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
    ],
    "expected": {
      "status": "wrong-scope",
      "snapshot": {
        "worldId": "A",
        "sequence": 4,
        "value": 10
      }
    }
  }
];
function freeze(value) {
  if(value && typeof value==='object') {
    for(const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
for(const example of examples) {
  test(example.label,()=>{
    const args=structuredClone(example.args);
    const before=structuredClone(args);
    freeze(args);
    assert.deepEqual(subject(...args),example.expected);
    assert.deepEqual(args,before);
  });
}
