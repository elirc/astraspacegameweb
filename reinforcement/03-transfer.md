# Transfer the idea into Warband / astraspacegameweb

## Prove the actual asynchronous behavior

Use the real `createQueryRefresher` with the application's installed QueryClient in a practice test. Control fetch promises. Start a read, deliver several hints, resolve the old response, and prove a fresh read follows. Deliver a hint during the follow-up and prove exactly one more read is requested.

Add a failure case and a dispose case. Observe what the application does with query errors; do not claim a refresh error reverses a committed command. Add an inactive-query case only after reading its actual stale/reset behavior. The pure reducer tests cannot substitute for these library-level checks.

## Small operations handoff

After the existing LAB0 setup is working, investigate a local stale-view scenario with three timestamps: command acknowledgement, notification receipt, and authoritative read completion. Record which layer you actually observed. Compare with the relevant server metric in `metrics.ts` without assuming a healthy aggregate dashboard proves the individual action was delivered.

Deliver one controlled-promise regression, one cleanup assertion, and a one-page handoff with symptom, hypotheses, observations, next check, and recovery condition. If the stack is unavailable, finish the source/lab work and leave this runtime handoff pending.

## Review a proposed change

An agent replaces the refresher with “if loading, return,” claiming it prevents duplicate requests. Show the lost-hint timeline. Another starts a new fetch on every websocket event. Show the burst amplification. Ask for one in-flight operation plus a remembered follow-up obligation and an explicit teardown contract.

## Evidence boundary

Work in your own practice branch or isolated workspace and inspect existing changes first. Do not switch or reset the owner's working tree. Describe any uncommitted source your exercise depends on; a worktree from HEAD does not include it. Use the existing package scripts after reading their targets. Run one repository at a time, with disposable fixtures for data tests. The authoring pass supplied exercises, not these application changes.

For a TS repository, sketch the input/output types and one discriminated union before implementation. Name which invalid input still needs runtime validation. For GitJira's JS code, use its existing JSDoc/shared-schema conventions instead of converting the app to TypeScript.
