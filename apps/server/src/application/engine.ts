import { createHash } from 'node:crypto';
import {
  advance,
  definition,
  buildings,
  buildingCost,
  buildDuration,
  capacity,
  commandSchemaFor,
  defaultConfig,
  worldSchema,
  farmCapacity,
  points,
  population,
  recruitDuration,
  resources,
  travelTime,
  merchantTravelTime,
  units,
  type Army,
  type Command,
  type Stock,
  type WorldConfig,
} from '../../../../packages/shared/game';
import {
  config,
  afterCommit,
  dbNow,
  pool,
  saveVillage,
  transaction,
  withVillageLock,
  withVillageLocks,
  type Tx,
  type Village,
} from '../../../../packages/db';
import { committedResolutions } from '../metrics';
import { isDeepStrictEqual } from 'node:util';
import { causalPlan, lockCausalComponent } from '../../../../packages/db/causality';
export type { EventKind, Event } from '../domain/events/types';
import { type EventKind, type Event, context } from '../domain/events/types';
import { handlers } from '../domain/events/registry';
type Batch = {
  until: number;
  queue: Event[];
  done: number[];
  cancelled: Set<number>;
  villages: Map<number, Village>;
  reports: any[];
  notifications: any[];
  journal: any[];
  created: Event[];
  ids: number[];
  idIndex: number;
  ownerTotals: Map<number, number>;
};
const batches = new WeakMap<Tx, Batch>();
function enqueue(queue: Event[], ev: Event) {
  let low = 0,
    high = queue.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const other = queue[mid]!;
    if (
      other.due_at.getTime() < ev.due_at.getTime() ||
      (other.due_at.getTime() === ev.due_at.getTime() && other.id < ev.id)
    )
      low = mid + 1;
    else high = mid;
  }
  queue.splice(low, 0, ev);
}
export function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}
export const armyPopulation = (army: Army, cfg: WorldConfig = defaultConfig) =>
  Object.entries(army).reduce((s, [k, n]) => s + n * definition(cfg.units, k).population, 0);
const armyTotal = (army: Army) => Object.values(army).reduce((a, b) => a + b, 0);
export async function event(
  tx: Tx,
  villageId: number,
  kind: EventKind,
  due: number,
  payload: any,
  cfg: WorldConfig,
) {
  const batch = batches.get(tx);
  let ev: Event;
  if (batch) {
    if (batch.idIndex >= batch.ids.length) {
      batch.ids = (
        await tx.query(
          "SELECT nextval('scheduled_events_id_seq') AS id FROM generate_series(1,2048)",
        )
      ).rows.map((r) => r.id);
      batch.idIndex = 0;
    }
    ev = {
      id: batch.ids[batch.idIndex++]!,
      village_id: villageId,
      kind,
      due_at: new Date(due),
      payload: structuredClone(payload),
      config_version: cfg.version,
    };
    batch.created.push(ev);
    if (due <= batch.until) enqueue(batch.queue, ev);
  } else
    ev = (
      await tx.query<Event>(
        'INSERT INTO scheduled_events(world_id,village_id,kind,due_at,payload,config_version) VALUES(1,$1,$2,$3,$4,$5) RETURNING *',
        [villageId, kind, new Date(due), JSON.stringify(payload), cfg.version],
      )
    ).rows[0]!;
  return ev.id;
}
export async function notify(tx: Tx, player: number | null, type: string, payload: any = {}) {
  if (!player) return;
  const batch = batches.get(tx);
  if (batch) {
    batch.notifications.push({ player_id: player, type, payload });
    return;
  }
  await tx.query('INSERT INTO outbox(player_id,type,payload) VALUES($1,$2,$3)', [
    player,
    type,
    JSON.stringify(payload),
  ]);
}
export async function report(
  tx: Tx,
  player: number | null,
  kind: string,
  subject: string,
  payload: any,
  at: number,
) {
  if (!player) return;
  const batch = batches.get(tx);
  if (batch) {
    batch.reports.push({
      player_id: player,
      kind,
      subject,
      payload: structuredClone(payload),
      created_at: new Date(at),
    });
    return;
  }
  const r = await tx.query(
    'INSERT INTO reports(world_id,player_id,kind,subject,payload,created_at) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',
    [player, kind, subject, JSON.stringify(payload), new Date(at)],
  );
  await notify(tx, player, 'report_new', { id: r.rows[0].id });
}
async function playerPoints(tx: Tx, player: number) {
  const batch = batches.get(tx);
  if (batch) return batch.ownerTotals.get(player) || 0;
  return Number(
    (
      await tx.query('SELECT coalesce(sum(points),0) AS points FROM villages WHERE player_id=$1', [
        player,
      ])
    ).rows[0].points,
  );
}
async function applyEvent(
  tx: Tx,
  v: Village,
  ev: Event,
  cfg: WorldConfig,
  accrualConfig: WorldConfig = cfg,
) {
  const units = cfg.units,
    buildings = cfg.buildings;
  const at = ev.due_at.getTime(),
    p = ev.payload;
  advance(v.state, at, accrualConfig);
  const input = context({
    village: v,
    ev,
    cfg,
    at,
    attackerPoints: 0,
    defenderPoints: 0,
    returnCandidates: [],
  });
  if (ev.kind === 'return' && v.player_id !== p.owner) {
    const batch = batches.get(tx),
      cached = batch ? [...batch.villages.values()] : [];
    const stored = (
      await tx.query<Village>(
        'SELECT * FROM villages WHERE player_id=$1 AND NOT(id=ANY($2::bigint[])) ORDER BY ((x-$3)^2+(y-$4)^2),id LIMIT 1',
        [p.owner, cached.map((v) => v.id), v.x, v.y],
      )
    ).rows[0];
    input.returnCandidates = [
      ...cached.filter((v) => v.player_id === p.owner),
      ...(stored ? [stored] : []),
    ];
  }
  if (ev.kind === 'movement' && !['support', 'scout'].includes(p.kind)) {
    input.attackerPoints = await playerPoints(tx, p.owner);
    input.defenderPoints = v.player_id ? await playerPoints(tx, v.player_id) : input.attackerPoints;
  }
  const handler = handlers[ev.kind];
  if (!handler) fail('Unknown scheduled event kind: ' + ev.kind, 500);
  handler(input);
  for (const effect of input.effects) {
    switch (effect.type) {
      case 'event':
        await event(tx, effect.villageId, effect.kind, effect.due, effect.payload, cfg);
        break;
      case 'report':
        await report(tx, effect.player, effect.kind, effect.subject, effect.payload, effect.at);
        break;
      case 'notify':
        await notify(tx, effect.player, effect.kind, effect.payload);
        break;
      case 'cancelQueues': {
        const cancelled = (
          await tx.query(
            "UPDATE scheduled_events SET status='cancelled' WHERE village_id=$1 AND kind IN ('build','recruit') AND status='pending' RETURNING id",
            [effect.villageId],
          )
        ).rows;
        for (const c of cancelled) batches.get(tx)?.cancelled.add(c.id);
        break;
      }
    }
  }

  const batch = batches.get(tx);
  if (batch) batch.done.push(ev.id);
  else {
    await saveVillage(tx, v, false);
    await tx.query(
      "UPDATE scheduled_events SET status='done',applied_at=clock_timestamp() WHERE id=$1",
      [ev.id],
    );
  }
}
export async function resolveEvent(
  tx: Tx,
  v: Village,
  ev: Event,
  cfg: WorldConfig,
  accrualConfig: WorldConfig = cfg,
) {
  const batch = batches.get(tx);
  const before = structuredClone(v);
  const reads: any[] = [];
  const relevant = new Set([v.player_id, ev.payload.owner]);
  const createdStart = batch?.created.length || 0,
    reportsStart = batch?.reports.length || 0,
    notificationsStart = batch?.notifications.length || 0;
  const ownerTotals = batch
    ? [...relevant]
        .filter((owner): owner is number => typeof owner === 'number')
        .map((owner) => [owner, batch.ownerTotals.get(owner) || 0])
    : [];
  const cached =
    batch && ev.kind === 'return' && v.player_id !== ev.payload.owner
      ? [...batch.villages.values()].map((v) => structuredClone(v))
      : [];
  const proxy = new Proxy(tx, {
    get(target, key) {
      if (key === 'query')
        return async (...args: any[]) => {
          const result = await (target.query as any)(...args);
          reads.push({
            sql: args[0],
            params: structuredClone(args[1] || []),
            rows: structuredClone(result.rows),
            rowCount: result.rowCount,
          });
          return result;
        };
      return Reflect.get(target, key);
    },
  });
  if (batch) batches.set(proxy, batch);
  try {
    await applyEvent(proxy, v, ev, cfg, accrualConfig);
  } finally {
    batches.delete(proxy);
  }
  const entry = {
    event_id: ev.id,
    village_id: v.id,
    before_state: before.state,
    after_state: structuredClone(v.state),
    before_owner: before.player_id,
    after_owner: v.player_id,
    context: {
      effectsHash: batch
        ? hashEffects({
            created: batch.created.slice(createdStart),
            reports: batch.reports.slice(reportsStart),
            notifications: batch.notifications.slice(notificationsStart),
          })
        : undefined,
      due: ev.due_at.getTime(),
      kind: ev.kind,
      reads,
      ownerTotals,
      cached,
      batched: !!batch,
      createdIds: batch?.created.slice(createdStart).map((e) => e.id) || [],
      village: {
        id: v.id,
        world_id: v.world_id,
        x: v.x,
        y: v.y,
        name: before.name,
        points: before.points,
      },
      accrualVersion: accrualConfig.version,
    },
  };
  if (batch) {
    batch.journal.push(entry);
    if (before.player_id !== null)
      batch.ownerTotals.set(
        before.player_id,
        (batch.ownerTotals.get(before.player_id) || 0) - before.points,
      );
    v.points = points(v.state.buildings);
    if (v.player_id !== null)
      batch.ownerTotals.set(v.player_id, (batch.ownerTotals.get(v.player_id) || 0) + v.points);
  } else
    await tx.query(
      'INSERT INTO event_journal(event_id,village_id,before_state,after_state,before_owner,after_owner,context) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        ev.id,
        v.id,
        entry.before_state,
        entry.after_state,
        entry.before_owner,
        entry.after_owner,
        entry.context,
      ],
    );
}
export async function replayEvent(
  ev: Event,
  journal: any,
  cfg: WorldConfig,
  accrualConfig: WorldConfig = cfg,
) {
  const trace = [...journal.context.reads];
  let index = 0;
  const tx = {
    query: async (sql: string, params: any[] = []) => {
      const expected = trace[index++];
      if (
        !expected ||
        expected.sql !== sql ||
        JSON.stringify(expected.params) !== JSON.stringify(params)
      )
        throw new Error('Replay query diverged at step ' + index);
      return { rows: structuredClone(expected.rows), rowCount: expected.rowCount };
    },
  } as unknown as Tx;
  const v = {
    ...journal.context.village,
    state: structuredClone(journal.before_state),
    player_id: journal.before_owner,
  } as Village;
  const batch: Batch = {
    until: ev.due_at.getTime(),
    queue: [],
    done: [],
    cancelled: new Set(),
    villages: new Map([...(journal.context.cached || []).map((c: any) => [c.id, c]), [v.id, v]]),
    reports: [],
    notifications: [],
    journal: [],
    created: [],
    ids: journal.context.createdIds || [],
    idIndex: 0,
    ownerTotals: new Map(journal.context.ownerTotals || []),
  };
  if (journal.context.batched) batches.set(tx, batch);
  try {
    await applyEvent(tx, v, ev, cfg, accrualConfig);
  } finally {
    batches.delete(tx);
  }
  const effects = {
    created: batch.created,
    reports: batch.reports,
    notifications: batch.notifications,
  };
  const effectsMatch = journal.context.effectsHash
    ? hashEffects(effects) === journal.context.effectsHash
    : !journal.context.effects ||
      isDeepStrictEqual(JSON.parse(JSON.stringify(effects)), journal.context.effects);
  return {
    effectsMatch,
    matches:
      effectsMatch &&
      isDeepStrictEqual(v.state, journal.after_state) &&
      v.player_id === journal.after_owner &&
      index === trace.length,
    expected: journal.after_state,
    actual: v.state,
    expectedOwner: journal.after_owner,
    actualOwner: v.player_id,
    reports: batch.reports,
  };
}
function hashEffects(effects: unknown) {
  const canonical = (v: any): string => {
    if (v instanceof Date) return JSON.stringify(v.toISOString());
    if (Array.isArray(v))
      return '[' + v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',') + ']';
    if (v && typeof v === 'object')
      return (
        '{' +
        Object.keys(v)
          .filter((k) => v[k] !== undefined)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      );
    return JSON.stringify(v);
  };
  return createHash('sha256').update(canonical(effects)).digest('hex');
}
export async function drain(tx: Tx, until: number) {
  const component = causalPlan(tx);
  const queue = (
    await tx.query<Event>(
      "SELECT * FROM scheduled_events WHERE world_id=1 AND status='pending' AND due_at<=$1 AND ($2::bigint[] IS NULL OR village_id=ANY($2::bigint[])) ORDER BY due_at,id FOR UPDATE",
      [new Date(until), component?.villages || null],
    )
  ).rows;
  if (!queue.length) return 0;
  const totals = (
    await tx.query(
      'SELECT player_id,points FROM player_scores WHERE ($1::bigint[] IS NULL OR player_id=ANY($1))',
      [component?.players || null],
    )
  ).rows;
  const initialIds = [...new Set(queue.map((e) => e.village_id))];
  const initialVillages = await withVillageLocks(tx, initialIds);
  const batch: Batch = {
    until,
    queue,
    done: [],
    cancelled: new Set(),
    villages: new Map(initialVillages.map((v) => [v.id, v])),
    reports: [],
    notifications: [],
    journal: [],
    ownerTotals: new Map(totals.map((r) => [r.player_id, Number(r.points)])),
    created: [],
    ids: (
      await tx.query(
        "SELECT nextval('scheduled_events_id_seq') AS id FROM generate_series(1,$1::int)",
        [Math.max(512, queue.length * 4)],
      )
    ).rows.map((r) => r.id),
    idIndex: 0,
  };
  const currentConfig = await config(tx);
  const configCache = new Map<number, WorldConfig>(
    (await tx.query('SELECT version,config FROM config_versions WHERE world_id=1')).rows.map(
      (r) => [r.version, worldSchema.parse(r.config)],
    ),
  );
  batches.set(tx, batch);
  try {
    while (batch.queue.length) {
      const ev = batch.queue.shift()!;
      if (batch.cancelled.has(ev.id)) continue;
      let v = batch.villages.get(ev.village_id);
      if (!v) {
        v = await withVillageLock(tx, ev.village_id);
        batch.villages.set(v.id, v);
      }
      let cfg = ev.payload.config
        ? worldSchema.parse(ev.payload.config)
        : configCache.get(ev.config_version);
      if (!cfg) {
        cfg = worldSchema.parse(ev.payload.config || currentConfig);
        configCache.set(ev.config_version, cfg);
      }
      await resolveEvent(tx, v, ev, cfg, currentConfig);
    }
    if (batch.created.length)
      await tx.query(
        'INSERT INTO scheduled_events(id,world_id,village_id,kind,due_at,payload,config_version) SELECT id,1,village_id,kind,due_at,payload,config_version FROM jsonb_to_recordset($1::jsonb) AS x(id bigint,village_id bigint,kind text,due_at timestamptz,payload jsonb,config_version int)',
        [JSON.stringify(batch.created)],
      );
    if (batch.journal.length)
      await tx.query(
        'INSERT INTO event_journal(event_id,village_id,before_state,after_state,before_owner,after_owner,context) SELECT event_id,village_id,before_state,after_state,before_owner,after_owner,context FROM jsonb_to_recordset($1::jsonb) AS x(event_id bigint,village_id bigint,before_state jsonb,after_state jsonb,before_owner bigint,after_owner bigint,context jsonb)',
        [JSON.stringify(batch.journal)],
      );
    const changed = new Set(batch.journal.map((j) => j.village_id));
    const villages = [...batch.villages.values()]
      .filter((v) => changed.has(v.id))
      .map((v) => ({
        ...v,
        points: points(v.state.buildings),
      }));
    await tx.query(
      'UPDATE villages v SET state=x.state,player_id=x.player_id,points=x.points FROM jsonb_to_recordset($1::jsonb) AS x(id bigint,state jsonb,player_id bigint,points int) WHERE v.id=x.id',
      [JSON.stringify(villages)],
    );
    if (batch.reports.length) {
      const inserted = (
        await tx.query(
          'INSERT INTO reports(world_id,player_id,kind,subject,payload,created_at) SELECT 1,player_id,kind,subject,payload,created_at FROM jsonb_to_recordset($1::jsonb) AS x(player_id bigint,kind text,subject text,payload jsonb,created_at timestamptz) RETURNING id,player_id',
          [JSON.stringify(batch.reports)],
        )
      ).rows;
      for (const r of inserted)
        batch.notifications.push({
          player_id: r.player_id,
          type: 'report_new',
          payload: { id: r.id },
        });
    }
    if (batch.notifications.length)
      await tx.query(
        'INSERT INTO outbox(player_id,type,payload) SELECT player_id,type,payload FROM jsonb_to_recordset($1::jsonb) AS x(player_id bigint,type text,payload jsonb)',
        [JSON.stringify(batch.notifications)],
      );
    await tx.query(
      "UPDATE scheduled_events SET status='done',applied_at=clock_timestamp() WHERE id=ANY($1::bigint[])",
      [batch.done],
    );
    const resolutions = batch.journal.map((j) => ({
      due: j.context.due as number,
      kind: j.context.kind as string,
    }));
    afterCommit(tx, () => committedResolutions(resolutions));
    return batch.done.length;
  } finally {
    batches.delete(tx);
  }
}
function pay(v: Village, stock: Stock) {
  for (const r of resources) if (v.state.resources[r] < stock[r]) fail(`Not enough ${r}`);
  for (const r of resources) v.state.resources[r] -= stock[r];
}
export async function execute(
  tx: Tx,
  owner: number,
  villageId: number,
  cmd: Command,
  now: number,
  cfg: WorldConfig,
) {
  const units = cfg.units,
    buildings = cfg.buildings;
  const v = await withVillageLock(tx, villageId);
  if (v.player_id !== owner) fail('You do not own this village', 403);
  advance(v.state, now, cfg);
  if (cmd.action === 'build') {
    const queue = (
      await tx.query<Event>(
        "SELECT * FROM scheduled_events WHERE village_id=$1 AND kind='build' AND status='pending' ORDER BY due_at,id",
        [v.id],
      )
    ).rows;
    if (queue.length >= cfg.maxQueue) fail('Construction queue is full');
    const b = definition(buildings, cmd.building);
    const level =
      queue.filter((e) => e.payload.building === cmd.building).at(-1)?.payload.level ??
      v.state.buildings[cmd.building] ??
      0;
    if (level >= b.max) fail('Maximum building level reached');
    for (const [key, required] of Object.entries(b.requires || {}))
      if ((v.state.buildings[key] || 0) < required)
        fail(`Requires ${definition(buildings, key).name} level ${required}`);
    if (
      population(v.state, cfg) + b.population > farmCapacity(v.state.buildings.farm || 0, cfg) &&
      cmd.building !== 'farm'
    )
      fail('Expand your farm for more population');
    const price = buildingCost(cmd.building, level, cfg);
    pay(v, price);
    v.state.reservedPopulation += b.population;
    const start = Math.max(now, queue.at(-1)?.due_at.getTime() || 0);
    await event(
      tx,
      v.id,
      'build',
      start + buildDuration(cmd.building, level, v.state.buildings.main || 0, cfg),
      {
        building: cmd.building,
        level: level + 1,
        fromLevel: level,
        cost: price,
        start,
        population: b.population,
      },
      cfg,
    );
  } else if (cmd.action === 'cancelBuild') {
    const rows = (
      await tx.query<Event>(
        "SELECT * FROM scheduled_events WHERE village_id=$1 AND kind='build' AND status='pending' ORDER BY due_at,id",
        [v.id],
      )
    ).rows;
    const index = rows.findIndex((e) => e.id === cmd.eventId);
    if (index < 0) fail('This construction is no longer in the queue');
    // Cancel the tail as well so dependent levels never skip; refund all cancelled work.
    for (const e of rows.slice(index)) {
      for (const r of resources)
        v.state.resources[r] = Math.min(
          capacity(v.state.buildings.storage || 0, cfg),
          v.state.resources[r] + e.payload.cost[r],
        );
      v.state.reservedPopulation = Math.max(
        0,
        v.state.reservedPopulation - (e.payload.population || 0),
      );
      await tx.query("UPDATE scheduled_events SET status='cancelled' WHERE id=$1", [e.id]);
    }
  } else if (cmd.action === 'recruit') {
    const u = definition(units, cmd.unit);
    if ((v.state.buildings[u.building] || 0) < u.level)
      fail(`Requires ${definition(buildings, u.building).name} level ${u.level}`);
    if (
      population(v.state, cfg) + cmd.count * u.population >
      farmCapacity(v.state.buildings.farm || 0, cfg)
    )
      fail('Not enough farm capacity');
    pay(v, Object.fromEntries(resources.map((r) => [r, u.cost[r] * cmd.count])) as Stock);
    const pending = (
      await tx.query<Event>(
        "SELECT * FROM scheduled_events WHERE village_id=$1 AND kind='recruit' AND status='pending' ORDER BY due_at,id",
        [v.id],
      )
    ).rows.filter((e) => definition(units, e.payload.unit).building === u.building);
    let due = Math.max(now, pending.at(-1)?.due_at.getTime() || 0);
    const interval = recruitDuration(cmd.unit, v.state.buildings[u.building] || 0, cfg);
    for (let i = 0; i < cmd.count; i++) {
      due += interval;
      await event(tx, v.id, 'recruit', due, { unit: cmd.unit }, cfg);
    }
    v.state.reservedPopulation += cmd.count * u.population;
  } else if (cmd.action === 'movement') {
    const target = (await tx.query<Village>('SELECT * FROM villages WHERE id=$1', [cmd.targetId]))
      .rows[0];
    if (!target) fail('Target village not found');
    if (target.id === v.id) fail('Choose another village');
    if (cmd.kind === 'attack' && target.player_id === owner)
      fail('You cannot attack your own village');
    if (cmd.kind === 'scout' && Object.entries(cmd.units).some(([k, n]) => k !== 'scout' && n > 0))
      fail('Scouting parties can only contain scouts');
    for (const [k, n] of Object.entries(cmd.units))
      if ((v.state.units[k] || 0) < n)
        fail(`Not enough ${definition(units, k).name.toLowerCase()} units`);
    const travel = travelTime(v, target, cmd.units, cfg),
      reserved = armyPopulation(cmd.units, cfg);
    for (const [k, n] of Object.entries(cmd.units)) v.state.units[k] = (v.state.units[k] || 0) - n;
    v.state.reservedPopulation += reserved;
    await event(
      tx,
      target.id,
      'movement',
      now + travel,
      {
        ...cmd,
        origin: v.id,
        originName: v.name,
        targetName: target.name,
        owner,
        sent: now,
        travel,
        reserved,
      },
      cfg,
    );
    await notify(
      tx,
      target.player_id,
      cmd.kind === 'attack' ? 'incoming_attack' : 'incoming_movement',
    );
  } else if (cmd.action === 'cancelMovement') {
    const e = (
      await tx.query<Event>(
        "SELECT * FROM scheduled_events WHERE id=$1 AND kind='movement' AND status='pending' FOR UPDATE",
        [cmd.eventId],
      )
    ).rows[0];
    if (!e || e.payload.origin !== v.id || e.payload.owner !== owner)
      fail('Movement cannot be cancelled');
    if (now - e.payload.sent > cfg.cancelSeconds * 1000) fail('The cancellation window has closed');
    await tx.query("UPDATE scheduled_events SET status='cancelled' WHERE id=$1", [e.id]);
    await event(
      tx,
      v.id,
      'return',
      now + Math.max(1000, now - e.payload.sent),
      { owner, units: e.payload.units, reserved: e.payload.reserved },
      cfg,
    );
  } else if (cmd.action === 'withdraw') {
    const target = (await tx.query<Village>('SELECT * FROM villages WHERE id=$1', [cmd.targetId]))
      .rows[0];
    const stack = target?.state.garrison[v.id];
    if (!stack || stack.owner !== owner) fail('No support from this village is stationed there');
    await event(
      tx,
      target.id,
      'withdraw',
      now,
      { origin: v.id, owner, travel: travelTime(target, v, stack.units, cfg) },
      cfg,
    );
  } else if (cmd.action === 'market') {
    if (!cfg.features.market) fail('The market is disabled in this world');
    if (!v.state.buildings.market) fail('Build a marketplace first');
    const target = (await tx.query<Village>('SELECT * FROM villages WHERE id=$1', [cmd.targetId]))
      .rows[0];
    if (!target || target.id === v.id) fail('Choose another village');
    const amount = Object.values(cmd.resources).reduce((s, n) => s + n, 0);
    if (amount <= 0) fail('Choose resources to send');
    const merchants = Math.ceil(amount / cfg.economy.merchantCapacity);
    const available = Math.max(0, v.state.buildings.market - (v.state.merchantsAway || 0));
    if (merchants > available) fail(`Only ${available} merchants are available`);
    v.state.merchantsAway = (v.state.merchantsAway || 0) + merchants;
    const travel = merchantTravelTime(v, target, cfg);
    pay(v, cmd.resources);
    await event(
      tx,
      target.id,
      'market',
      now + travel,
      { resources: cmd.resources, originName: v.name, origin: v.id, owner, merchants, travel },
      cfg,
    );
  } else if (cmd.action === 'rename') v.name = cmd.name;
  await saveVillage(tx, v);
  await notify(tx, owner, 'village_changed');
  await tx.query(
    'INSERT INTO audit_log(world_id,actor,action,entity,detail) VALUES(1,$1,$2,$3,$4)',
    [owner, cmd.action, v.id, JSON.stringify(cmd)],
  );
  return { ok: true, server_now: now };
}
export async function command(owner: number, id: number, raw: unknown, key: string) {
  if (!key || key.length > 120) fail('A valid Idempotency-Key is required');
  const request = JSON.stringify({ id, raw });
  return transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(7141,$1)', [owner]);
    const existing = (
      await tx.query('SELECT * FROM idempotency_keys WHERE player_id=$1 AND key=$2', [owner, key])
    ).rows[0];
    if (existing) {
      if (existing.request !== request)
        fail('Idempotency key was already used for another command', 409);
      return existing.response;
    }
    const plan = await lockCausalComponent(
      tx,
      [id, ...(typeof (raw as any)?.targetId === 'number' ? [(raw as any).targetId] : [])],
      undefined,
      owner,
    );
    const now = plan.until;
    await drain(tx, now);
    const cfg = await config(tx);
    const cmd = commandSchemaFor(cfg).parse(raw);
    const result = await execute(tx, owner, id, cmd, now, cfg);
    await tx.query(
      'INSERT INTO idempotency_keys(player_id,key,request,response) VALUES($1,$2,$3,$4)',
      [owner, key, request, JSON.stringify(result)],
    );
    return result;
  });
}
export async function resolveDue() {
  const batchSize = Number(process.env.RESOLVER_BATCH_SIZE || 300);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 2000)
    throw new Error('RESOLVER_BATCH_SIZE must be between 1 and 2000');
  // Oldest-first: a random window lets newer events overtake the oldest overdue
  // ones, which is exactly what inflates p99 lag. Always take the head of the queue
  // (and read 8x fewer candidate rows per tick).
  const selected = (
    await pool.query(
      "SELECT village_id,due_at FROM scheduled_events WHERE world_id=1 AND status='pending' AND due_at<=statement_timestamp() ORDER BY due_at,id LIMIT $1",
      [batchSize],
    )
  ).rows;
  if (!selected.length) return 0;
  const last = selected[selected.length - 1];
  try {
    return await transaction(async (tx) => {
      const cutoff = Math.min(await dbNow(tx), last!.due_at.getTime());
      const plan = await lockCausalComponent(
        tx,
        [...new Set(selected.map((c) => c.village_id))],
        cutoff,
      );
      return drain(tx, plan.until);
    }, 1);
  } catch (e: any) {
    if (['40001', '55P03', 'WB_BUSY'].includes(e.code)) return 0;
    throw e;
  }
}
