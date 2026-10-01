# A practical interview schedule for Warband / astraspacegameweb

This is a practice library, not a requirement to complete forty-eight interviews before applying. Choose the route that matches your time. Work from memory first, inspect code second, and read the interviewer notes last. Keep a small evidence log instead of marking every page read as mastered.

## Four-session baseline

1. **Session 1, 60–75 minutes:** read the project source map and write a ninety-second explanation. Choose case 1 in the JavaScript round. Spend the final fifteen minutes comparing your assumptions with the current source. Record one thing you initially predicted incorrectly.
2. **Session 2, 75–90 minutes:** attempt the runnable coding challenge. Preserve the supplied checks and add a case that catches a plausible shortcut. Then explain your time and space costs without reading the reference. If unfinished, name the branch still missing.
3. **Session 3, 60–75 minutes:** choose a different case in React and then sketch the corresponding public outcome type or JSDoc contract. Walk a user action all the way through event transaction, refresh coordinator, and progress metrics. Keep a draft value separate from an authoritative result.
4. **Session 4, 60–75 minutes:** run one timed mock and complete a scorecard. Select the two lowest-scoring dimensions for the next week. Do not repeat only the easiest scenario to improve the average.

## Two-week focused route

| Day | Work | Evidence |
|---|---|---|
| 1 | Source trace and project pitch | Caller-to-result path with unknown arrows marked |
| 2 | JavaScript case 1 or 2 | Function, trace, complexity, counterexample |
| 3 | Coding challenge first attempt | Original output and one added assertion |
| 4 | React case 3 or 4 | State ownership and interaction table |
| 5 | Type/contract case 5 | Valid, missing, null, wrong-type, old-client fixtures |
| 6 | Async case 2 or 6 | Controlled completion-order timeline |
| 7 | Retrieval day | Recreate a prior explanation without notes |
| 8 | Debugging case 1 or 4 | Two hypotheses and a distinguishing observation |
| 9 | Design case 3 | Small diagram, authoritative write, failure window |
| 10 | Code review case 5 | Blocking comment, suggestion, focused PR description |
| 11 | Behavioral case 6 | Honest ownership statement and evidence ledger |
| 12 | Frontend or full-stack mock | Scored recording or written transcript |
| 13 | Repair weakest dimension | New counterexample and revised explanation |
| 14 | Project-defense mock | Ninety-second and five-minute answers |

Each day is approximately 45–90 minutes. Dependency setup and real integration work are additional. If you have one week, choose alternate days and preserve the retrieval and mock sessions. If you have more time, rotate the case numbers instead of merely extending every answer.

## Productive use of an interview partner

Ask a partner or an assistant to show only the candidate prompt and withhold the notes. Have them give one changed-input follow-up and one evidence question. Request feedback on the first incorrect assumption rather than a replacement implementation. Record whether help was a hint, a code correction, or a complete solution.

After reading a reference, close it and reproduce the mechanism with a different fixture. A copied solution is studied; it is not an independent pass. The next session should test transfer to a different case or project. Keep a list of recurring misses: ambiguous identity, stale response, missing runtime validation, wrong test boundary, or unsupported performance claim.

## Stop and reassess

If a prompt requires an application dependency you cannot run, continue the code-reading and model work but mark the integration check pending. Do not spend the entire interview-prep session rebuilding unrelated infrastructure. Conversely, do not claim a database guarantee from a mocked test just to complete a checklist.

At the end of two weeks, choose one example you can explain precisely, one coding mechanism you can implement without help, and one limitation you can discuss honestly. A smaller set of defensible examples is more useful than memorized claims about every project in the collection.
