import { transaction } from '../../../../packages/db';
import { fail } from './engine';
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export async function idempotent(
  req: {
    headers: Record<string, unknown>;
    method: string;
    url: string;
    body: unknown;
    playerId: number;
  },
  invoke: () => Promise<any>,
) {
  const key = String(req.headers['idempotency-key'] || '');
  const request = canonical({ method: req.method, url: req.url, body: req.body ?? null });
  return transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(7141,$1)', [req.playerId]);
    const old = (
      await tx.query('SELECT * FROM idempotency_keys WHERE player_id=$1 AND key=$2', [
        req.playerId,
        key,
      ])
    ).rows[0];
    if (old) {
      if (old.request !== request)
        fail('Idempotency key was already used for another request', 409);
      return old.response;
    }
    const result = await invoke();
    await tx.query(
      'INSERT INTO idempotency_keys(player_id,key,request,response) VALUES($1,$2,$3,$4)',
      [req.playerId, key, request, JSON.stringify(result ?? { ok: true })],
    );
    return result;
  });
}
