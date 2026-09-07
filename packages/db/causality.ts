import { type Tx, dbNow, transactionToken } from './index';
type Plan = { players: number[]; writePlayers: number[]; villages: number[]; until: number };
const plans = new WeakMap<Tx, { token: symbol | undefined; plan: Plan }>();
export function causalPlan(tx: Tx) {
  const entry = plans.get(tx);
  return entry?.token === transactionToken(tx) ? entry?.plan : undefined;
}
const sql = `SELECT 'event' AS source,e.village_id AS target_id,o.id AS origin_id,v.player_id AS target_owner,o.player_id AS origin_owner,(e.payload->>'owner')::bigint AS sender_owner,
 (e.kind='build' OR (e.kind='movement' AND coalesce(e.payload->>'kind','attack') NOT IN ('support','scout') AND
   (coalesce((e.payload->'units'->>'ram')::numeric,0)>0 OR coalesce((e.payload->'units'->>'catapult')::numeric,0)>0 OR coalesce((e.payload->'units'->>'noble')::numeric,0)>0))
  OR (e.kind='return' AND v.player_id IS DISTINCT FROM (e.payload->>'owner')::bigint)) AS changes
 FROM scheduled_events e JOIN LATERAL (SELECT id,player_id FROM villages WHERE id=e.village_id OFFSET 0) v ON true
 LEFT JOIN LATERAL (SELECT id,player_id FROM villages WHERE id=(e.payload->>'origin')::bigint OFFSET 0) o ON true
 WHERE e.world_id=1 AND e.status='pending' AND e.due_at<=$2
 UNION ALL SELECT 'support',s.station_id,s.home_id,v.player_id,h.player_id,s.player_id,true FROM support_links s JOIN villages v ON v.id=s.station_id JOIN villages h ON h.id=s.home_id
 UNION ALL SELECT 'initial',id,NULL,player_id,NULL,NULL,false FROM villages WHERE id=ANY($1::bigint[]) OR player_id=$3`;
async function plan(tx: Tx, initial: number[], until: number, actor?: number): Promise<Plan> {
  if (actor) {
    const row = (
      await tx.query(
        `WITH owners AS MATERIALIZED (SELECT DISTINCT player_id AS id FROM villages WHERE id=ANY($1::bigint[]) AND player_id IS NOT NULL UNION SELECT $2::bigint), own AS MATERIALIZED (SELECT v.id FROM owners o JOIN villages v ON v.player_id=o.id UNION SELECT id FROM villages WHERE id=ANY($1::bigint[]))
      SELECT ARRAY(SELECT id FROM owners ORDER BY id) AS players, ARRAY(SELECT id FROM own ORDER BY id) AS villages,
      EXISTS(SELECT 1 FROM own o JOIN LATERAL (SELECT 1 FROM scheduled_events e WHERE e.world_id=1 AND e.status='pending' AND e.village_id=o.id AND e.due_at<=$3 AND e.kind IN ('movement','market','return','release','withdraw') LIMIT 1 OFFSET 0) e ON true)
      OR EXISTS(SELECT 1 FROM own o JOIN LATERAL (SELECT 1 FROM scheduled_events e WHERE e.world_id=1 AND e.status='pending' AND (e.payload->>'origin')::bigint=o.id AND e.due_at<=$3 AND e.kind IN ('movement','market','return','release','withdraw') LIMIT 1 OFFSET 0) e ON true)
      OR EXISTS(SELECT 1 FROM owners o JOIN LATERAL (SELECT 1 FROM scheduled_events e WHERE e.world_id=1 AND e.status='pending' AND (e.payload->>'owner')::bigint=o.id AND e.due_at<=$3 AND e.kind IN ('movement','market','return','release','withdraw') LIMIT 1 OFFSET 0) e ON true)
      OR EXISTS(SELECT 1 FROM support_links WHERE home_id IN(SELECT id FROM own) OR station_id IN(SELECT id FROM own) OR player_id IN(SELECT id FROM owners)) AS connected`,
        [initial, actor, new Date(until)],
      )
    ).rows[0];
    if (!row.connected)
      return {
        players: row.players.map(Number),
        writePlayers: row.players.map(Number),
        villages: row.villages.map(Number),
        until,
      };
  }
  const rows = (await tx.query(sql, [initial, new Date(until), actor ?? null])).rows;
  // A points/ownership writer joins all dependent reads of those owners. Pure
  // troop/resource events can otherwise share owner locks and run independently.
  const writers = new Set<number>();
  for (const row of rows)
    if (row.changes)
      for (const owner of [row.target_owner, row.origin_owner, row.sender_owner])
        if (owner !== null) writers.add(owner);
  const node = (id: number | null, owner: number | null) =>
    owner !== null && writers.has(owner) ? -owner : id;
  const links = new Map<number, Set<number>>(),
    roots: number[] = [];
  const link = (a: number | null, b: number | null) => {
    if (a === null || b === null || a === b) return;
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  };
  for (const row of rows) {
    row.target = node(row.target_id, row.target_owner);
    row.origin = node(row.origin_id, row.origin_owner);
    row.sender =
      row.sender_owner !== null && writers.has(row.sender_owner) ? -row.sender_owner : null;
    if (row.source === 'initial') roots.push(row.target);
    else {
      link(row.target, row.origin);
      link(row.target, row.sender);
    }
  }
  const seen = new Set(roots),
    queue = [...seen];
  for (let i = 0; i < queue.length; i++)
    for (const next of links.get(queue[i]!) || [])
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  const players = new Set<number>(),
    villages = new Set(initial);
  for (const row of rows)
    if (seen.has(row.target)) {
      villages.add(row.target_id);
      if (row.origin_id !== null) villages.add(row.origin_id);
      for (const owner of [row.target_owner, row.origin_owner, row.sender_owner])
        if (owner !== null) players.add(owner);
    }
  if (actor) players.add(actor);
  return {
    players: [...players].sort((a, b) => a - b),
    writePlayers: [...players].filter((p) => writers.has(p) || p === actor).sort((a, b) => a - b),
    villages: [...villages].sort((a, b) => a - b),
    until,
  };
}

function retry(): never {
  throw Object.assign(new Error('Causal component changed or is busy; retrying'), {
    code: 'WB_BUSY',
  });
}
export async function lockCausalComponent(
  tx: Tx,
  initial: number[],
  until?: number,
  actor?: number,
) {
  // Shared world lock permits independent components while excluding config/migration operations.
  await tx.query('SELECT pg_advisory_xact_lock_shared(7139,1)');
  const cutoff = until ?? (await dbNow(tx)),
    first = await plan(tx, initial, cutoff, actor);
  const locks = [
    ...first.players.map((id) => ({ space: 2, id, shared: !first.writePlayers.includes(id) })),
    ...first.villages.map((id) => ({ space: 1, id })),
  ];
  if (
    locks.length &&
    !(await tx.query('SELECT try_component_locks($1::jsonb) AS acquired', [JSON.stringify(locks)]))
      .rows[0].acquired
  )
    retry();
  // Commands anchor their clock after lock admission. Planning can take time, and
  // a completed competing transaction must never turn a new command into a past event.
  const check = await plan(tx, initial, until === undefined ? await dbNow(tx) : cutoff, actor);
  if (
    check.players.some((id) => !first.players.includes(id)) ||
    check.writePlayers.some((id) => !first.writePlayers.includes(id)) ||
    check.villages.some((id) => !first.villages.includes(id))
  )
    retry();
  plans.set(tx, { token: transactionToken(tx), plan: check });
  return check;
}
