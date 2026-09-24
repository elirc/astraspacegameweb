# Agentic exercise: reference outcome

The reference author (an AI model) did this exercise itself while preparing M1 and made **both** classic agent mistakes. This is what your adversarial
reviewer and your verification checklist should catch:

| Bug | Why it passes shallow checks | What caught it |
|---|---|---|
| `le="2"` in the lag SLI | `promtool check rules` passes; `promtool test rules` passes because the fixtures were written with the same wrong assumption | Live: the recording rule returned **no series** during a drill; `/api/v1/label/le/values` showed `"2.0"` (Prometheus 3 normalization) |
| `clamp_min(denominator, 1e-9)` | Reads as defensive coding ("avoid divide by zero"); no test had zero traffic | An idle promtool case: the fast-burn **page fired at zero traffic**. Removing the clamp fixes it (0/0 = NaN, and NaN comparisons are false) |

Also expect from a typical agent:
- Selectors on labels that don't exist in production (`role="resolver"` works in the training scrape config, but `infra/prometheus.yaml` has no `role` label).
- `for:` durations on burn-rate alerts. They defeat the short window's purpose. Multi-window burn rates don't need `for`.
- An "absent()" guard that fires during every deploy.

A good `EXPLANATION.md` names one of these with evidence (the command output), explains the mechanism in one or two sentences, and states the remaining limitation:
the SLI only sees committed events, and the guard depends on a scrape-time gauge that goes stale under DB stress (M3).

Reviewer grading anchors: 5 = mechanism + live evidence + a limitation; 3 = correct but evidence only from promtool fixtures; 1 = "tests pass".
