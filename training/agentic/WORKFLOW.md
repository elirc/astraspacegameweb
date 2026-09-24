# Agentic exercise: ship M1 (SLOs + burn-rate alerts) with an implementer agent and an adversarial reviewer

Ticket: `training/ladder/M1-slos-and-burn-rate-alerts.md`. Budget: about 3 h. The point isn't the YAML. It's to practise **directing** and **verifying** an agent on
work where plausible-looking output is easy to produce and hard to check. Alert rules are a perfect trap: they parse, they pass unit tests written by the same
author, and they're still wrong in the running system.

## Step 1: you, no agent (40 min)
Write `training/agentic/SPEC.md` (≤ 1 page):
- The two SLIs as exact PromQL (numerator, denominator, which label values, which routes excluded, and why).
- The alert matrix (page/ticket × windows × burn factors) and the guard alert for "nothing commits".
- The **acceptance evidence** you'll demand: `promtool check rules`, `promtool test rules` with named cases, a live drill (Lab 0 + `inject.ts`) where the page
  fires, a live idle period where **nothing** fires, and the stopped-resolver drill.
- Non-goals (no Alertmanager routing in this ticket).
Then write `DESIGN_NOTE.md`: 5 bullets on the risks you expect. Name at least two ways the rules could *look* right and be wrong.

## Step 2: implementer agent (30 min)
Prompt it with SPEC.md + the ticket + `apps/server/src/metrics.ts` + `infra/alerts.yaml` + `training/ops/prometheus.local.yaml`. Instruct it to write
`training/ops/slo-rules.yaml` and `training/ops/slo-tests.yaml`, and to **show the commands it ran and their output**. Save the transcript as `agentic/IMPLEMENTER_LOG.md`.

## Step 3: adversarial reviewer (a different model if you have one) (20 min)
Reviewer prompt (use as-is):
> You are reviewing Prometheus SLO rules for a production game server. Only report issues in: correctness of the PromQL against the *actual* exported series,
> behaviour at zero traffic, behaviour at counter/histogram resets, label matching, window/burn-factor math, test adequacy, and failure modes (target down,
> series absent). No style comments. For each issue give the input series that demonstrates it and the exact expected vs actual result.
> The metrics are produced by prom-client 15 (`apps/server/src/metrics.ts`) and scraped by Prometheus **3.5**.

## Step 4: revision + verification (you run everything) (60 min)
Checklist. Tick each with evidence pasted into `agentic/VERIFY.md`:
- [ ] `promtool check rules` and `promtool test rules` pass (command + output).
- [ ] **The live series match the rule selectors.** Run `curl -s localhost:59090/api/v1/label/le/values` and check every `le="…"` in the rules against it.
      Don't trust test fixtures written by the same author as the rules.
- [ ] Idle for 6+ minutes with roles running and no injection: `/api/v1/alerts` shows **no** SLO alert. Paste the recording-rule values.
- [ ] `INJECT_RATE=150`: the page fires. Record the seconds from injection start to `firing`.
- [ ] All resolvers stopped + backlog: the guard fires within 3 min.
- [ ] Read the diff line by line: any `clamp_min`, `or vector(0)`, `absent()` or `unless`. For each, what does it do at zero traffic?
- [ ] Fake or placeholder behaviour: rules referencing metrics that don't exist (`curl localhost:3001/metrics | grep <name>` for every metric name used).
- [ ] Reversibility: removing the rules file restores the previous state (nothing in `infra/` changed without the drill).

## Step 5: your explanation (graded by the reviewer)
Write `agentic/EXPLANATION.md` (≤ 1 page): what the rules measure, **one bug the agent introduced and how you caught it**, and one limitation that remains.
Ask the reviewer model to grade it 1–5 on mechanism accuracy, evidence and honesty about limits.

Reference outcome and the traps: `_answers/agentic.md`.
