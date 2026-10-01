# Types, runtime values, and compatibility

Sketch EventSnapshot, BatchPolicy, and a discriminated Freshness result. Keep event IDs and world IDs distinct in your examples even if both serialize as strings. Use explicit nullable timestamps rather than treating zero as missing: zero is a valid instant in these synthetic fixtures.

The selection lab assumes a validated snapshot with unique event IDs and finite due times. Its policy arguments are validated at runtime. The freshness lab validates every numeric input because it represents an adapter consuming telemetry. Explain why these two contracts put validation at different boundaries, and locate the boundary you would use in the actual server.

Model unknown, clock-skew, stalled, backlogged, and healthy outcomes so a UI cannot accidentally render an absent heartbeat as green. Decide whether a future API should expose ages, source timestamps, or both. Preserve an old-client fixture that receives an unfamiliar state and shows an explicit fallback rather than silently treating it as healthy.

## Contract worksheet

Write five concrete examples before coding: valid input, missing input, explicitly empty input, wrong primitive type, and a value valid yesterday but stale now. Record whether each is rejected, normalized, ignored, or accepted with a distinct outcome. “TypeScript catches it” is insufficient for JSON, browser storage, events, or a database row returned through an unchecked cast.

Use a discriminated union for outcomes that require different UI behavior. In a TypeScript practice file, make a consumer switch exhaustive and demonstrate which new variant should force a review. In GitJira, use its JSDoc and schema conventions rather than converting the project. Keep proposed type snippets in your practice work until you have verified the actual application contract.

Choose one backwards-compatibility risk: an old caller omits a new field, a saved object has an older shape, or an older client interprets a new outcome as success. Describe a migration or fallback and a test using an old fixture. A renamed property is a contract change even when all currently compiled callers are updated.
