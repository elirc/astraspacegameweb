# Explain Warband / astraspacegameweb under follow-up questions

## The opening answer

Use this factual project description as a starting point, then replace generalities with source you inspected: A browser game consumes server-owned world state while events resolve asynchronously. Explain why a successful refresh does not prove engine progress, how stale responses are rejected, and where event ownership differs from event selection.

Structure a ninety-second answer around the user, one operation, one difficult boundary, and your actual contribution. The user is a player or game operator. The operation is to resolve a due event and publish refreshed state. The boundary to investigate is event transaction, refresh coordinator, and progress metrics. Your contribution must come from your own evidence log; this file does not assign authorship of existing code to you.

Say whether you studied an existing implementation, solved a standalone exercise, wrote a regression, or changed the application. If you worked with an assistant, describe the requirement you set, the suggestion you rejected or refined, and the test or source inspection you personally used to judge the result. Avoid implying sole ownership of work you did not perform.

## Five-minute technical explanation

Draw five boxes: user action, frontend state, API/adapter, domain decision, stored or returned result. Annotate which boxes exist in the real path; do not force a pure local interaction through a fictional server. Trace one supplied fixture through those boxes and identify the first place an untrusted value is accepted or rejected.

Then describe failure at one boundary. Explain what the user sees, what remains unchanged, and which identity connects a retry or later response to its original operation. If there is no durable guarantee in the inspected path, state that limitation and propose the evidence needed to evaluate a change.

## Follow-up questions to rehearse

1. Why does this state live here rather than in the nearest component?
2. Which input is untrusted, and what changes after validation?
3. What happens if the same operation arrives twice?
4. What changes when the selected scope changes during a request?
5. Which assertion catches the most plausible wrong fix?
6. How do you know an unrelated entity or organization remains unchanged?
7. What does the current implementation do differently from the teaching model?
8. Which code or result did you personally produce?
9. Which performance statement is measured and which is hypothetical?
10. What would you simplify if you had only one day to ship a small slice?
11. Which proposed improvement is already present in the repository?
12. What evidence would make you change your current recommendation?

For every answer, prepare one input and one observable result. A filename alone does not explain a mechanism. A framework name alone does not justify a tradeoff. A passed teaching check alone does not demonstrate a browser interaction or a transaction.

## Ownership and evidence ledger

| Claim | My role | Supporting artifact | Status | Limitation |
|---|---|---|---|---|
| Example studied | Read/traced | Source symbol and revision | Pending entry | Not my original implementation |
| Model solved | Implemented exercise | Own diff and check output | Pending entry | Synthetic contract only |
| Application behavior | Tested or changed | Actual integration evidence | Pending entry | Name the environment |
| Future improvement | Proposed | Design and acceptance examples | Proposed only | Not implemented |

These rows are templates, not completed evidence. Do not fill them with the author's reference-test run. When discussing results, prefer a precise observation such as a stale response was ignored in a controlled test over a broad claim such as all races were fixed.

## A truthful behavioral answer

Choose a real moment when your prediction changed. Explain the initial assumption, the counterexample, the revised mechanism, and how you checked it. A learning exercise is a valid setting when named honestly. If you have no real disagreement story, answer a hypothetical collaboration question as hypothetical; do not invent a teammate or outage.

End by naming the next boundary you would verify. This gives the interviewer a concrete follow-up and shows that you understand the limit of your current evidence. Keep proposed features, historical tests, and current runtime observations separate, especially when an older document describes a completed checkpoint.
