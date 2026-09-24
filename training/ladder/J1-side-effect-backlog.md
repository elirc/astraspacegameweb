# J1: Make the email/push backlog visible (junior)

## Context
Password-reset emails and incoming-attack pushes are written to `side_effects` (`application/auth.ts` `post_api_auth_forgot`; the relay in
`apps/server/src/index.ts`) and delivered by BullMQ in `apps/server/src/sidejobs.ts`. When SMTP breaks, rows pile up with `delivered_at IS NULL`.
Nothing shows it. Prometheus has `warband_outbox_backlog` for the *notification* outbox but nothing for side effects.

## Ticket
> As an operator I need to know how many side effects are waiting and how old the oldest one is, per kind, both on the dashboard and from the admin page.
> Add `GET /api/admin/side-effects/summary` → `{ kinds: [{ kind, pending, oldestSeconds }] }` for administrators, and a Prometheus gauge
> `warband_side_effects_pending{kind}` + `warband_side_effects_oldest_seconds{kind}`.

## Constraints
- Admin-only. Follow how the other admin routes check `req.isAdmin` (`transport/admin.ts`, `application/admin.ts`). Non-admin → 403, anonymous → 401.
- Use the partial index `side_effects_pending` (`packages/db/migrations/002_production.sql`). Show the `EXPLAIN` in your PR.
- The `kind` label may only take values from a fixed set (`email`, `push`). Unknown kinds count as `other`. Why does that matter?
- Don't add a DB query to every scrape on every role. Compute it in one role (hint: which role owns side effects?).

## Definition of done
- Route + schema registered like the others (`transport/contracts.ts` builds the OpenAPI schema).
- Integration test in `tests/api.integration.test.ts` style: seed 2 pending emails and 1 delivered push → the counts are right; non-admin → 403.
- Unit test for the SQL→DTO mapping (`oldestSeconds` never negative, empty table → `[]`).
- Seen live: stop Mailpit (`docker compose stop mailpit`), request a password reset from the UI, and watch the gauge rise in Prometheus. Paste the PromQL result.

## Explain before touching (write the answers in your PR description first)
1. Which files change, in which layer (`transport` / `application` / `server`)? What does `eslint.config.js` `boundaries` allow?
2. What data crosses which boundary: DB → application → HTTP JSON → browser, and DB → gauge → Prometheus?
3. What can fail? DB slow during a scrape; a huge backlog; a non-admin probing the route.
4. Which tests prove it, and which of them need Postgres?
5. Trade-off: gauge computed at scrape time vs refreshed on a timer. Which does `metrics.ts` do today, and what did Lab 0 teach you about that?

<details><summary>Hints</summary>

- `sidejobs.ts` runs only in `ROLE=all|sidejobs`. It already queries `side_effects` in `dispatch()` every 5 s.
- Gauge values can be set from that loop instead of from `collect()`.
- `extract(epoch FROM now()-min(created_at))`: check the column name in `002_production.sql`.
</details>

Sealed answer: `_answers/ladder/J1.md`
