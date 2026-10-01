# Foundations: Realtime hints, authoritative reads, and lifecycle cleanup

## A notification is not necessarily the data

Read `createQueryRefresher` in `queryRefresh.ts`. Identify the map of jobs, dirty flag, handling of a query already fetching, active versus inactive queries, and dispose. Explain what an event hint tells the client and why an authoritative HTTP read may still be required.

Draw a timeline: read A starts; server state changes; hint arrives; A completes with a snapshot from before the change. If the client simply ignores the hint because a request is in flight, what triggers the newer read? If it cancels and restarts for every hint, what happens during a burst?

## Coalesce without dropping the final obligation

The teaching reducer below represents “another read is needed” with one dirty bit. Ten hints during one fetch should not require ten independent fetches, but they should leave one follow-up obligation. A hint during that follow-up can create another obligation. Explain why this is a coordination contract, not debounce by elapsed time.

## Session and lifecycle boundaries

Read `resetAccountQueries` and the caller in `App.tsx`. Why is changing account identity different from a routine freshness hint? What happens to a pending response when the consumer unmounts? Disposing the coordinator can prevent follow-up work without proving the network request was aborted.

In `api.ts`, inspect the warning for timed-out mutations and the server-time estimate. Neither a refresh hint nor a client clock establishes that an action committed. A real operation may require reconciliation through server state.

## First operations hypothesis

For “the village view is stale,” name three hypotheses at different layers: no notification, refresh coordinator lost an obligation, and backend state has not advanced. Name the observation that would distinguish each. Do not open five dashboards without a question.

## Before you code

Write one prediction you are least sure of and name the smallest observation that would settle it. Distinguish a fact you read in source from behavior you actually ran. Use the source map in [README](README.md) to check the exact files.
