# Moderation and mass cancellation

Use a separately registered administrator account. Grant its role with `pnpm admin -- grant exact-email`; revoke with `pnpm admin -- revoke exact-email`. Keep operator accounts out of ordinary competitive play.

The administration page supports player search, timed bans, unbans, ban-and-strip, audit search and heuristic review. Every write requires an explanation. A ban revokes all session families. Stripping clears village ownership and home armies and cancels that player's pending movements and production. Preserve evidence before using this irreversible administrative action.

For exceptional mass movement cancellation, submit a reviewed list (maximum 500 IDs) and reason to `POST /api/admin/movements/cancel` with an idempotency key. Due events resolve first; only still-pending movements are cancelled. Troops return on their origin timeline. Inspect the returned count and the admin audit record. Reusing the same key and payload returns the recorded result.

Abuse flags are evidence for a person to review, not automatic guilt. Dismiss or mark actioned with a reason. Neither a volume threshold nor regular timing automatically bans an account.
