import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';

import pg from 'pg';

import { freshVillage, defaultConfig, points, units, advance } from '../packages/shared/game';

import type * as DB from '../packages/db';

import type * as Engine from '../apps/server/src/engine';

let db: typeof DB, engine: typeof Engine;
let runNpcTurn: typeof import('../apps/server/src/application/npcs').runNpcTurn;
let spawn: typeof import('../apps/server/src/application/game').spawn;

const testUrl =
  process.env.TEST_DATABASE_URL || 'postgres://warband:warband_local@127.0.0.1:55432/warband_test';

const at = Date.UTC(2026, 0, 1);

beforeAll(async () => {
  if (!new URL(testUrl).pathname.endsWith('_test'))
    throw new Error('Integration database name must end in _test');

  const admin = new pg.Pool({ connectionString: testUrl.replace(/\/[^/]+$/, '/postgres') });

  const name = new URL(testUrl).pathname.slice(1);

  if (!/^[a-z_]+$/.test(name)) throw new Error('Invalid test DB name');

  if (!(await admin.query('SELECT datname FROM pg_database WHERE datname=$1', [name])).rowCount)
    await admin.query(`CREATE DATABASE "${name}"`);

  await admin.end();

  process.env.DATABASE_URL = testUrl;

  process.env.NODE_ENV = 'test';

  db = await import('../packages/db');

  engine = await import('../apps/server/src/engine');
  ({ runNpcTurn } = await import('../apps/server/src/application/npcs'));
  ({ spawn } = await import('../apps/server/src/application/game'));

  await db.initialize();
});

beforeEach(async () => {
  await db.pool.query(
    'TRUNCATE worlds,users,tribes,players,villages,scheduled_events,reports,outbox,idempotency_keys,refresh_sessions,messages,forum_threads,forum_posts,diplomacy,audit_log RESTART IDENTITY CASCADE',
  );

  await db.pool.query('INSERT INTO worlds(id,name,config) VALUES(1,$1,$2)', [
    defaultConfig.name,

    JSON.stringify(defaultConfig),
  ]);

  await db.pool.query('INSERT INTO config_versions(world_id,version,config) VALUES(1,$1,$2)', [
    defaultConfig.version,
    JSON.stringify(defaultConfig),
  ]);

  await db.pool.query(
    "INSERT INTO players(world_id,name) VALUES(1,'Attacker'),(1,'Defender'),(1,'Supporter')",
  );

  for (let i = 1; i <= 3; i++) {
    const v = freshVillage(at);

    v.resources = { wood: 5000, clay: 5000, iron: 5000 };

    await db.pool.query(
      'INSERT INTO villages(world_id,player_id,x,y,name,state,points) VALUES(1,$1,$2,500,$3,$4,$5)',

      [i, 499 + i, 'Village ' + i, JSON.stringify(v), points(v.buildings)],
    );
  }
});

afterAll(async () => {
  await db?.pool.end();
});

const snapshot = async () => ({
  villages: (await db.pool.query('SELECT id,player_id,state,points FROM villages ORDER BY id'))
    .rows,

  reports: (
    await db.pool.query('SELECT player_id,kind,subject,payload,created_at FROM reports ORDER BY id')
  ).rows,

  events: (
    await db.pool.query('SELECT id,village_id,due_at,kind,status FROM scheduled_events ORDER BY id')
  ).rows,
});

async function schedule(kind: Engine.EventKind, due: number, payload: any, village = 2) {
  return db.transaction((tx) => engine.event(tx, village, kind, due, payload, defaultConfig));
}

async function drain(to = at + 1000000) {
  return db.transaction(async (tx) => {
    await db.worldLock(tx);

    return engine.drain(tx, to);
  });
}

async function village(id = 1) {
  return (await db.pool.query('SELECT * FROM villages WHERE id=$1', [id])).rows[0];
}

describe('transactional timeline on PostgreSQL', () => {
  it('replays recorded combat, support, recruitment and merchant events without mutating the world', async () => {
    await schedule('recruit', at + 10, { unit: 'spear' }, 1);

    await schedule('movement', at + 20, {
      kind: 'support',
      origin: 3,
      originName: 'Village 3',
      owner: 3,
      units: { spear: 10 },
      travel: 1000,
      reserved: 10,
    });

    await schedule('movement', at + 30, {
      kind: 'attack',
      origin: 1,
      originName: 'Village 1',
      owner: 1,
      units: { axe: 100 },
      travel: 1000,
      reserved: 100,
    });

    await schedule('market', at + 40, {
      origin: 1,
      originName: 'Village 1',
      owner: 1,
      resources: { wood: 10, clay: 0, iron: 0 },
      merchants: 1,
      travel: 1000,
    });

    await drain();
    const before = await snapshot();

    const rows = (
      await db.pool.query(
        'SELECT e.*,row_to_json(j) AS journal FROM scheduled_events e JOIN event_journal j ON j.event_id=e.id ORDER BY e.id',
      )
    ).rows;

    expect(rows.length).toBeGreaterThan(4);

    for (const ev of rows) {
      const result = await engine.replayEvent(ev, ev.journal, defaultConfig);
      expect(result.matches, JSON.stringify({ id: ev.id, kind: ev.kind, result })).toBe(true);
    }

    expect(await snapshot()).toEqual(before);
  });

  it('replays a village time range through command checkpoints and detects altered history', async () => {
    const { exportTimeline, replayTimeline } =
      await import('../apps/server/src/application/replay');
    await schedule('recruit', at + 10, { unit: 'spear' }, 1);
    await drain(at + 15);
    await db.transaction(async (tx) => {
      await db.worldLock(tx);
      await engine.execute(
        tx,
        1,
        1,
        { action: 'rename', name: 'Replay capital' },
        at + 20,
        defaultConfig,
      );
    });
    await schedule('recruit', at + 30, { unit: 'spear' }, 1);
    await drain(at + 40);
    const before = await snapshot();
    const bundle = await exportTimeline(db.pool, { villageId: 1, from: at, to: at + 50 });
    const result = await replayTimeline(bundle, db.pool);
    expect(result.matches, JSON.stringify(result)).toBe(true);
    expect(result.verified).toBe(2);
    expect(result.appliedCheckpoints).toHaveLength(1);
    bundle.events[1].journal.after_state.units.spear += 1;
    const corrupt = await replayTimeline(bundle, db.pool);
    expect(corrupt.matches).toBe(false);
    expect(corrupt.results.at(-1).diff.some((d: any) => d.path === '$.state.units.spear')).toBe(
      true,
    );
    expect(await snapshot()).toEqual(before);
  });

  it('refuses to certify a replay range with pending or missing-journal events', async () => {
    const { exportTimeline, replayTimeline } =
      await import('../apps/server/src/application/replay');
    await schedule('recruit', at + 10, { unit: 'spear' }, 1);
    await schedule('recruit', at + 30, { unit: 'spear' }, 1);
    await drain(at + 20);
    const result = await replayTimeline(
      await exportTimeline(db.pool, { villageId: 1, from: at, to: at + 40 }),
      db.pool,
    );
    expect(result.matches).toBe(false);
    expect(result.verified).toBe(1);
    expect(result.missing).toHaveLength(1);
  });

  it('reserves finite merchants until the round trip completes', async () => {
    await db.transaction(async (tx) => {
      await db.worldLock(tx);
      await engine.execute(
        tx,
        1,
        1,
        { action: 'market', targetId: 2, resources: { wood: 100, clay: 0, iron: 0 } },
        at,
        defaultConfig,
      );
    });

    expect((await village()).state.merchantsAway).toBe(1);

    await expect(
      db.transaction(async (tx) => {
        await db.worldLock(tx);
        return engine.execute(
          tx,
          1,
          1,
          { action: 'market', targetId: 2, resources: { wood: 1, clay: 0, iron: 0 } },
          at + 1,
          defaultConfig,
        );
      }),
    ).rejects.toThrow('merchants');

    await drain(at + 6000);
    expect((await village()).state.merchantsAway).toBe(1);

    await drain(at + 12000);
    expect((await village()).state.merchantsAway).toBe(0);
  });

  it('preserves scout intelligence at arrival even when later events mutate the same batch', async () => {
    await schedule('movement', at + 100, {
      kind: 'scout',
      origin: 1,
      originName: 'Village 1',
      owner: 1,
      units: { scout: 30 },
      travel: 1000,
      reserved: 60,
    });

    await schedule('build', at + 200, { building: 'wall', level: 10 });

    await schedule('movement', at + 300, {
      kind: 'attack',
      origin: 1,
      originName: 'Village 1',
      owner: 1,
      units: { axe: 10000 },
      travel: 1000,
      reserved: 10000,
    });

    await drain();

    const intel = (
      await db.pool.query("SELECT payload FROM reports WHERE player_id=1 AND kind='scout'")
    ).rows[0].payload;

    expect(intel.buildings.wall).toBe(2);

    expect(intel.units.spear).toBe(35);

    expect((await village(2)).state.units.spear).toBe(0);
  });

  it('returns to a village conquered in the same batch after the origin is lost', async () => {
    for (const id of [1, 2]) {
      const v = await village(id);

      v.state.loyalty = 1;

      v.state.units = {};

      v.state.buildings.wall = 0;

      await db.pool.query('UPDATE villages SET state=$1 WHERE id=$2', [
        JSON.stringify(v.state),
        id,
      ]);
    }

    await schedule(
      'movement',
      at + 100,
      {
        kind: 'attack',
        origin: 1,
        originName: 'Village 1',
        owner: 1,
        units: { axe: 1000, noble: 1 },
        travel: 1000,
        reserved: 1100,
      },
      2,
    );

    await schedule(
      'movement',
      at + 200,
      {
        kind: 'attack',
        origin: 2,
        originName: 'Village 2',
        owner: 2,
        units: { axe: 1000, noble: 1 },
        travel: 1000,
        reserved: 1100,
      },
      1,
    );

    await schedule('return', at + 300, { owner: 1, units: { spear: 5 }, reserved: 5 }, 1);

    await drain();

    expect((await village(1)).player_id).toBe(2);

    expect((await village(2)).player_id).toBe(1);

    expect((await village(2)).state.units.spear).toBe(5);

    expect((await db.pool.query("SELECT id FROM reports WHERE kind='loss'")).rowCount).toBe(0);
  });

  it('releases home population for support troops killed abroad', async () => {
    const home = await village(3),
      target = await village(2);

    home.state.reservedPopulation = 10;

    target.state.units = {};

    target.state.buildings.wall = 0;

    target.state.garrison = { '3': { owner: 3, units: { spear: 10 } } };

    await db.pool.query('UPDATE villages SET state=$1 WHERE id=3', [JSON.stringify(home.state)]);

    await db.pool.query('UPDATE villages SET state=$1 WHERE id=2', [JSON.stringify(target.state)]);

    await schedule('movement', at + 100, {
      kind: 'attack',
      origin: 1,
      originName: 'Village 1',
      owner: 1,
      units: { axe: 10000 },
      travel: 1000,
      reserved: 10000,
    });

    await drain(at + 500);

    expect((await village(3)).state.reservedPopulation).toBe(0);

    expect((await village(2)).state.garrison['3'].units.spear).toBe(0);

    expect(
      (await db.pool.query("SELECT id FROM reports WHERE player_id=3 AND kind='battle'")).rowCount,
    ).toBe(1);
  });

  it('applies build completion before a later attack and publishes only committed reports', async () => {
    await schedule('build', at + 100, { building: 'wall', level: 10 });

    await schedule('movement', at + 101, {
      kind: 'attack',

      origin: 1,

      originName: 'Village 1',

      owner: 1,

      units: { axe: 100 },

      travel: 1000,

      reserved: 100,
    });

    await drain();

    const r = (
      await db.pool.query("SELECT payload FROM reports WHERE player_id=1 AND kind='battle'")
    ).rows[0].payload;

    expect(r.wallBefore).toBe(10);

    expect((await db.pool.query('SELECT id FROM outbox')).rowCount).toBeGreaterThan(0);
  });

  it('makes each recruit available at its individual completion timestamp', async () => {
    await schedule('recruit', at + 100, { unit: 'spear' }, 1);

    await schedule('recruit', at + 300, { unit: 'spear' }, 1);

    await drain(at + 200);

    expect((await village()).state.units.spear).toBe(36);

    expect(
      (await db.pool.query("SELECT id FROM scheduled_events WHERE status='pending'")).rowCount,
    ).toBe(1);
  });

  it('is exactly once when retried', async () => {
    await schedule('recruit', at + 100, { unit: 'spear' }, 1);

    await drain();

    const a = await snapshot();

    await drain();

    expect(await snapshot()).toEqual(a);
  });

  it('retries lock timeouts without duplicating resource charges or post-commit observers', async () => {
    const woodBefore = (await village()).state.resources.wood;
    const holder = await db.pool.connect();
    const retriesBefore = db.dbCounters.retries;
    let attempts = 0;
    let notifications = 0;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(9273,1)');
      await db.transaction(async (tx) => {
        attempts++;
        // Force a real lock timeout on the first attempt; production keeps its five-second limit.
        await tx.query("SET LOCAL lock_timeout = '25ms'");
        await tx.query(
          "UPDATE villages SET state=jsonb_set(state,'{resources,wood}',to_jsonb((state#>>'{resources,wood}')::numeric-7)) WHERE id=1",
        );
        db.afterCommit(tx, () => notifications++);
        if (attempts === 2) await holder.query('COMMIT');
        await tx.query('SELECT pg_advisory_xact_lock(9273,1)');
      });
      expect(attempts).toBe(2);
      expect(db.dbCounters.retries).toBe(retriesBefore + 1);
      expect((await village()).state.resources.wood).toBe(woodBefore - 7);
      expect(notifications).toBe(1);
    } finally {
      await holder.query('ROLLBACK').catch(() => {});
      holder.release();
    }
  });

  it('exhausts bounded lock timeout retries without committing charges or observers', async () => {
    const woodBefore = (await village()).state.resources.wood;
    const holder = await db.pool.connect();
    const retriesBefore = db.dbCounters.retries;
    const exhaustedBefore = db.dbCounters.exhausted;
    let attempts = 0;
    let notifications = 0;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(9273,2)');
      await expect(
        db.transaction(async (tx) => {
          attempts++;
          await tx.query("SET LOCAL lock_timeout = '25ms'");
          await tx.query(
            "UPDATE villages SET state=jsonb_set(state,'{resources,wood}',to_jsonb((state#>>'{resources,wood}')::numeric-7)) WHERE id=1",
          );
          db.afterCommit(tx, () => notifications++);
          await tx.query('SELECT pg_advisory_xact_lock(9273,2)');
        }, 2),
      ).rejects.toMatchObject({ code: '55P03' });
      expect(attempts).toBe(2);
      expect(db.dbCounters.retries).toBe(retriesBefore + 1);
      expect(db.dbCounters.exhausted).toBe(exhaustedBefore + 1);
      expect((await village()).state.resources.wood).toBe(woodBefore);
      expect(notifications).toBe(0);
    } finally {
      await holder.query('ROLLBACK').catch(() => {});
      holder.release();
    }
  });

  it('rolls back state, reports, event status and outbox together', async () => {
    await schedule('movement', at + 100, {
      kind: 'attack',

      origin: 1,

      originName: 'Village 1',

      owner: 1,

      units: { axe: 100 },

      travel: 1000,

      reserved: 100,
    });

    const before = await snapshot();

    await expect(
      db.transaction(async (tx) => {
        await db.worldLock(tx);

        await engine.drain(tx, at + 10000);

        throw new Error('injected crash before commit');
      }),
    ).rejects.toThrow('injected crash');

    expect(await snapshot()).toEqual(before);

    expect((await db.pool.query('SELECT id FROM outbox')).rowCount).toBe(0);

    await drain();

    expect(
      (await db.pool.query("SELECT id FROM scheduled_events WHERE status='done'")).rowCount,
    ).toBe(2);
  });

  it('recovers a pending event after its resolver connection is killed', async () => {
    await schedule('recruit', at + 100, { unit: 'spear' }, 1);

    await expect(
      db.transaction(async (tx) => {
        await db.worldLock(tx);
        await engine.drain(tx, at + 1000);
        const pid = (await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await db.pool.query('SELECT pg_terminate_backend($1)', [pid]);
        // Let the connection-loss event arrive while the checked-out transaction
        // is between SQL queries, as can happen during hashing or side-effect I/O.
        await new Promise((resolve) => setTimeout(resolve, 25));
      }),
    ).rejects.toThrow();
    expect((await village()).state.units.spear).toBe(35);
    expect((await db.pool.query('SELECT 1 FROM event_journal')).rowCount).toBe(0);
    expect((await db.pool.query('SELECT 1 FROM outbox')).rowCount).toBe(0);

    await drain();

    expect((await village()).state.units.spear).toBe(36);

    expect(
      (await db.pool.query("SELECT id FROM scheduled_events WHERE status='done'")).rowCount,
    ).toBe(1);
  });

  it('serializes duplicate commands and charges resources only once', async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        engine.command(1, 1, { action: 'build', building: 'wood' }, 'same-key'),
      ),
    );

    expect(new Set(responses.map((r) => JSON.stringify(r))).size).toBe(1);

    expect(
      (await db.pool.query("SELECT id FROM scheduled_events WHERE kind='build'")).rowCount,
    ).toBe(1);

    expect((await db.pool.query('SELECT id FROM audit_log')).rowCount).toBe(1);

    await expect(
      engine.command(1, 1, { action: 'build', building: 'clay' }, 'same-key'),
    ).rejects.toThrow('another command');
  });

  it('rejects commands against another player’s village', async () => {
    await expect(
      engine.command(1, 2, { action: 'build', building: 'wood' }, 'forbidden'),
    ).rejects.toThrow('do not own');
  });

  it('rejects oversending and rolls back the whole command', async () => {
    const before = (await village()).state.units;

    await expect(
      engine.command(
        1,

        1,

        { action: 'movement', targetId: 2, kind: 'attack', units: { axe: 10000 } },

        'too-many',
      ),
    ).rejects.toThrow('Not enough');

    expect((await village()).state.units).toEqual(before);

    expect((await db.pool.query('SELECT id FROM scheduled_events')).rowCount).toBe(0);
  });

  it('cancelled movement cannot attack and returns all troops', async () => {
    await engine.command(
      1,

      1,

      { action: 'movement', targetId: 2, kind: 'attack', units: { axe: 10 } },

      'send',
    );

    const ev = (await db.pool.query("SELECT * FROM scheduled_events WHERE kind='movement'"))
      .rows[0];

    await engine.command(1, 1, { action: 'cancelMovement', eventId: ev.id }, 'cancel');

    await drain(Date.now() + 100000);

    expect((await village()).state.units.axe).toBe(25);

    expect((await db.pool.query("SELECT id FROM reports WHERE kind='battle'")).rowCount).toBe(0);
  });

  it('support joins the garrison and can be withdrawn', async () => {
    await engine.command(
      1,

      1,

      { action: 'movement', targetId: 2, kind: 'support', units: { spear: 10 } },

      'support',
    );

    await drain(Date.now() + 100000);

    expect((await village(2)).state.garrison['1'].units.spear).toBe(10);

    await engine.command(1, 1, { action: 'withdraw', targetId: 2 }, 'withdraw');

    await drain(Date.now() + 200000);

    expect((await village(2)).state.garrison['1']).toBeUndefined();

    expect((await village()).state.units.spear).toBe(35);

    expect((await village()).state.reservedPopulation).toBe(0);
  });

  it('caravans conserve resources subject to warehouse capacity', async () => {
    await engine.command(
      1,

      1,

      { action: 'market', targetId: 2, resources: { wood: 100, clay: 20, iron: 0 } },

      'market',
    );

    await drain(Date.now() + 100000);

    const r = (await db.pool.query("SELECT payload FROM reports WHERE kind='market'")).rows[0];

    expect(r.payload.resources).toEqual({ wood: 100, clay: 20, iron: 0 });
  });

  it('conquest transfers ownership and cancels construction and recruiting', async () => {
    const v = await village(2);

    v.state.loyalty = 1;

    v.state.units = {};

    v.state.buildings.wall = 0;

    await db.pool.query('UPDATE villages SET state=$1 WHERE id=2', [JSON.stringify(v.state)]);

    await schedule('build', at + 10000, { building: 'wood', level: 6 });

    await schedule('recruit', at + 10000, { unit: 'spear' });

    await schedule('movement', at + 100, {
      kind: 'attack',

      origin: 1,

      originName: 'Village 1',

      owner: 1,

      units: { axe: 10000, noble: 1 },

      travel: 1000,

      reserved: 10100,
    });

    await drain();

    expect((await village(2)).player_id).toBe(1);

    expect((await village(2)).state.loyalty).toBe(25);

    expect(
      (await db.pool.query("SELECT id FROM scheduled_events WHERE status='cancelled'")).rowCount,
    ).toBe(2);

    expect(
      (await db.pool.query("SELECT payload FROM reports WHERE player_id=1 AND kind='battle'"))
        .rows[0].payload.conquered,
    ).toBe(true);
  });

  it('scouting report contains only intelligence from successful scouts', async () => {
    await schedule('movement', at + 100, {
      kind: 'scout',

      origin: 1,

      originName: 'Village 1',

      owner: 1,

      units: { scout: 30 },

      travel: 1000,

      reserved: 60,
    });

    await drain();

    const r = (
      await db.pool.query("SELECT payload FROM reports WHERE player_id=1 AND kind='scout'")
    ).rows[0].payload;

    expect(r.success).toBe(true);

    expect(r.buildings.main).toBe(5);
  });

  it('serial and eight competing workers give identical results for 500 tied arrivals', async () => {
    const seed = await snapshot();

    const make = async () =>
      db.transaction(async (tx) => {
        for (let i = 0; i < 500; i++)
          await engine.event(
            tx,

            2,

            'movement',

            at + 100 + Math.floor(i / 5) * 10,

            {
              kind: 'attack',

              origin: 1,

              originName: 'Village 1',

              owner: 1,

              units: { axe: 1, spear: 1 },

              travel: 200,

              reserved: 2,
            },

            defaultConfig,
          );
      });

    await make();

    await drain();

    const serial = await snapshot();

    await db.pool.query('TRUNCATE scheduled_events,reports,outbox RESTART IDENTITY CASCADE');

    for (const v of seed.villages)
      await db.pool.query('UPDATE villages SET state=$1,player_id=$2,points=$4 WHERE id=$3', [
        JSON.stringify(v.state),

        v.player_id,

        v.id,

        v.points,
      ]);

    await make();

    await expect(
      db.transaction(async (tx) => {
        await db.worldLock(tx);

        await engine.drain(tx, at + 400);

        throw new Error('chaos');
      }),
    ).rejects.toThrow('chaos');

    for (let wave = 0; wave < 100; wave++) {
      await Promise.all(Array.from({ length: 8 }, () => engine.resolveDue()));

      if (
        !(await db.pool.query("SELECT 1 FROM scheduled_events WHERE status='pending' LIMIT 1"))
          .rowCount
      )
        break;
    }

    const parallel = await snapshot();

    expect(parallel.villages).toEqual(serial.villages);

    expect(parallel.reports).toEqual(serial.reports);

    // Rolled-back inserts consume sequence numbers. Compare semantic return events,

    // while requiring the original combat event IDs to remain unchanged.

    const normalize = (events: any[]) =>
      events.map((e) => (e.kind === 'return' ? { ...e, id: 0 } : e));

    expect(normalize(parallel.events)).toEqual(normalize(serial.events));

    expect(serial.reports.filter((r) => r.kind === 'battle')).toHaveLength(1000);
  });
});

it('allows unrelated causal components to commit while another component is held', async () => {
  const { lockCausalComponent } = await import('../packages/db/causality');

  await db.transaction(async (tx) => {
    await db.worldLock(tx);
    await engine.event(tx, 1, 'recruit', at + 1000, { unit: 'spear' }, defaultConfig);
    await engine.event(tx, 2, 'recruit', at + 1000, { unit: 'spear' }, defaultConfig);
  });

  let unlock!: () => void, admitted!: () => void;

  const released = new Promise<void>((r) => {
      unlock = r;
    }),
    locked = new Promise<void>((r) => {
      admitted = r;
    });

  const first = db.transaction(async (tx) => {
    await lockCausalComponent(tx, [1], at + 1000);
    admitted();
    await released;
    return engine.drain(tx, at + 1000);
  });

  await locked;

  try {
    const second = await db.transaction(async (tx) => {
      await tx.query("SET LOCAL statement_timeout='3s'");
      const plan = await lockCausalComponent(tx, [2], at + 1000);
      expect(plan.players).toEqual([2]);
      return engine.drain(tx, at + 1000);
    });

    expect(second).toBe(1);

    expect(
      (await db.pool.query('SELECT status FROM scheduled_events WHERE village_id=1')).rows[0]
        .status,
    ).toBe('pending');
  } finally {
    unlock();
    await first;
  }
});

it('runs separate attacks on the same owner concurrently under shared point locks', async () => {
  const { lockCausalComponent } = await import('../packages/db/causality');
  await db.pool.query(
    "INSERT INTO villages(world_id,player_id,x,y,name,state,points) SELECT world_id,player_id,x+10,y,'Second defender',state,points FROM villages WHERE id=2",
  );
  await schedule(
    'movement',
    at + 10,
    {
      kind: 'attack',
      origin: 1,
      owner: 1,
      originName: 'First',
      units: { axe: 20 },
      travel: 1000,
      reserved: 20,
    },
    2,
  );
  await schedule(
    'movement',
    at + 10,
    {
      kind: 'attack',
      origin: 3,
      owner: 3,
      originName: 'Second',
      units: { axe: 20 },
      travel: 1000,
      reserved: 20,
    },
    4,
  );
  let release!: () => void, ready!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    acquired = new Promise<void>((r) => (ready = r));
  const first = db.transaction(async (tx) => {
    const plan = await lockCausalComponent(tx, [2], at + 10);
    expect(plan.writePlayers).toEqual([]);
    ready();
    await held;
    return engine.drain(tx, at + 10);
  });
  try {
    await Promise.race([acquired, first]);
    const second = await db.transaction(async (tx) => {
      await tx.query("SET LOCAL statement_timeout='2s'");
      const plan = await lockCausalComponent(tx, [4], at + 10);
      expect(plan.writePlayers).toEqual([]);
      expect(plan.villages).not.toContain(2);
      return engine.drain(tx, at + 10);
    });
    expect(second).toBe(1);
  } finally {
    release();
    await first;
  }
});

it('drains older attacks before a later points writer on another village of the defender', async () => {
  const { lockCausalComponent } = await import('../packages/db/causality');
  await db.pool.query(
    "INSERT INTO villages(world_id,player_id,x,y,name,state,points) SELECT world_id,player_id,x+10,y,'Second defender',state,points FROM villages WHERE id=2",
  );
  const attack = await schedule(
    'movement',
    at + 10,
    {
      kind: 'attack',
      origin: 1,
      owner: 1,
      originName: 'First',
      units: { axe: 20 },
      travel: 1000,
      reserved: 20,
    },
    2,
  );
  await schedule('build', at + 20, { building: 'wood', level: 6, population: 0 }, 4);
  await db.transaction(async (tx) => {
    const plan = await lockCausalComponent(tx, [4], at + 20);
    expect(plan.writePlayers).toContain(2);
    expect(plan.villages).toContain(2);
    expect(await engine.drain(tx, at + 20)).toBe(2);
  });
  const record = (
    await db.pool.query('SELECT context FROM event_journal WHERE event_id=$1', [attack])
  ).rows[0];
  const total = Number(
    (await db.pool.query('SELECT points FROM player_scores WHERE player_id=2')).rows[0].points,
  );
  expect(new Map(record.context.ownerTotals).get(2)).toBeLessThan(total);
});

it('includes earlier events on a defender’s other villages in a morale-dependent component', async () => {
  const { lockCausalComponent } = await import('../packages/db/causality');

  const state = freshVillage(at);

  const extra = (
    await db.pool.query(
      'INSERT INTO villages(world_id,player_id,x,y,name,state,points) VALUES(1,2,550,550,$1,$2,$3) RETURNING id',
      ['Second defender village', JSON.stringify(state), points(state.buildings)],
    )
  ).rows[0].id;

  await db.transaction(async (tx) => {
    await db.worldLock(tx);
    await engine.event(
      tx,
      extra,
      'build',
      at + 500,
      { building: 'wall', level: 2, fromLevel: 1 },
      defaultConfig,
    );
    await engine.event(
      tx,
      2,
      'movement',
      at + 1000,
      {
        kind: 'attack',
        origin: 1,
        originName: 'Village 1',
        owner: 1,
        units: { axe: 5 },
        travel: 1000,
        reserved: 5,
      },
      defaultConfig,
    );
  });

  await db.transaction(async (tx) => {
    const plan = await lockCausalComponent(tx, [2], at + 1000);
    expect(plan.villages).toContain(extra);
    expect(plan.players).toEqual([1, 2]);
    await engine.drain(tx, plan.until);
  });

  const journals = (
    await db.pool.query(
      'SELECT j.context,e.kind FROM event_journal j JOIN scheduled_events e ON e.id=j.event_id ORDER BY e.due_at,e.id',
    )
  ).rows;

  expect(journals.map((j) => j.kind)).toEqual(['build', 'movement']);

  const expected = Number(
    (await db.pool.query('SELECT sum(points) AS points FROM villages WHERE player_id=2')).rows[0]
      .points,
  );

  expect(journals[1].context.ownerTotals.find((entry: number[]) => entry[0] === 2)[1]).toBe(
    expected,
  );
});

it('database constraints reject missing, negative and fractional village aggregates', async () => {
  for (const value of [{ spear: -1 }, { spear: 1.5 }, { spear: '2' }, null]) {
    await expect(
      db.pool.query("UPDATE villages SET state=jsonb_set(state,'{units}',$1::jsonb) WHERE id=1", [
        JSON.stringify(value),
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  }

  await expect(
    db.pool.query("UPDATE villages SET state=state-'units' WHERE id=1"),
  ).rejects.toMatchObject({ code: '23514' });
});

it('matches serial history across multiple owners, support, point writers and competing workers', async () => {
  for (let i = 4; i <= 12; i++) {
    const state = freshVillage(at);
    state.reservedPopulation = 100000;
    state.units = { spear: 100, sword: 50 };
    await db.pool.query(
      'INSERT INTO villages(world_id,player_id,x,y,name,state,points) VALUES(1,$1,$2,510,$3,$4,$5)',
      [(i % 3) + 1, 500 + i, 'Mixed village ' + i, JSON.stringify(state), points(state.buildings)],
    );
  }
  const seed = await snapshot();
  const make = () =>
    db.transaction(async (tx) => {
      for (let i = 0; i < 90; i++) {
        const target = 4 + (i % 9),
          origin = 1 + (i % 3);
        await engine.event(
          tx,
          target,
          'movement',
          at + 10 + Math.floor(i / 9) * 20,
          {
            kind: i % 13 === 0 ? 'scout' : i % 11 === 0 ? 'support' : 'attack',
            origin,
            owner: origin,
            originName: 'Village ' + origin,
            units: i % 13 === 0 ? { scout: 3 } : { axe: 7, spear: 3 },
            travel: 100,
            reserved: 10,
          },
          defaultConfig,
        );
        if (i % 9 === 0)
          await engine.event(
            tx,
            4 + ((i / 9) % 9),
            'build',
            at + 15 + Math.floor(i / 9) * 20,
            { building: 'wood', level: 6 + Math.floor(i / 81), population: 0 },
            defaultConfig,
          );
      }
      await engine.event(
        tx,
        7,
        'market',
        at + 100,
        {
          origin: 1,
          owner: 1,
          originName: 'Village 1',
          resources: { wood: 20, clay: 10, iron: 0 },
          merchants: 1,
          travel: 100,
        },
        defaultConfig,
      );
    });
  await make();
  await drain();
  const serial = await snapshot();
  await db.pool.query('TRUNCATE scheduled_events,reports,outbox RESTART IDENTITY CASCADE');
  for (const v of seed.villages)
    await db.pool.query('UPDATE villages SET state=$1,player_id=$2,points=$4 WHERE id=$3', [
      JSON.stringify(v.state),
      v.player_id,
      v.id,
      v.points,
    ]);
  await make();
  for (let wave = 0; wave < 100; wave++) {
    await Promise.all(Array.from({ length: 8 }, () => engine.resolveDue()));
    if (
      !(await db.pool.query("SELECT 1 FROM scheduled_events WHERE status='pending' LIMIT 1"))
        .rowCount
    )
      break;
  }
  expect(
    (await db.pool.query("SELECT 1 FROM scheduled_events WHERE status='pending'")).rowCount,
  ).toBe(0);
  const parallel = await snapshot();
  const sorted = (rows: any[]) => rows.map((row) => JSON.stringify(row)).sort();
  expect(parallel.villages).toEqual(serial.villages);
  expect(sorted(parallel.reports)).toEqual(sorted(serial.reports));
  expect(sorted(parallel.events.map(({ id, ...event }) => event))).toEqual(
    sorted(serial.events.map(({ id, ...event }) => event)),
  );
});

it('alerts on exhausted command admission but not a resolver choosing another candidate', async () => {
  const { lockCausalComponent } = await import('../packages/db/causality');
  await schedule('recruit', at + 10, { unit: 'spear' }, 1);
  let release!: () => void, admitted!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    ready = new Promise<void>((r) => (admitted = r));
  const owner = db.transaction(async (tx) => {
    await lockCausalComponent(tx, [1], at + 1000, 1);
    admitted();
    await held;
    return engine.drain(tx, at + 1000);
  });
  const before = db.dbCounters.exhausted;
  try {
    await Promise.race([ready, owner]);
    await expect(
      engine.command(1, 1, { action: 'rename', name: 'Recovered command' }, 'admission-retry'),
    ).rejects.toMatchObject({ code: 'WB_BUSY' });
    expect(db.dbCounters.exhausted).toBe(before + 1);
    expect((await village(1)).name).toBe('Village 1');
    expect(await engine.resolveDue()).toBe(0);
    expect(db.dbCounters.exhausted).toBe(before + 1);
  } finally {
    release();
    await owner;
  }
  await engine.command(1, 1, { action: 'rename', name: 'Recovered command' }, 'admission-retry');
  expect((await village(1)).name).toBe('Recovered command');
});

it('matches serial output across disjoint battle and return timelines under competing workers', async () => {
  for (let i = 4; i <= 6; i++) {
    const state = freshVillage(at);
    state.units = { spear: 100 };
    await db.pool.query(
      'INSERT INTO villages(world_id,player_id,x,y,name,state,points) VALUES(1,$1,$2,520,$3,$4,$5)',
      [
        (i % 3) + 1,
        500 + i,
        'Independent defender ' + i,
        JSON.stringify(state),
        points(state.buildings),
      ],
    );
  }
  await db.pool.query(
    "UPDATE villages SET state=jsonb_set(state,'{reservedPopulation}','10000') WHERE id<=3",
  );
  const seed = await snapshot();
  const make = () =>
    db.transaction(async (tx) => {
      for (let i = 0; i < 90; i++) {
        const origin = (i % 3) + 1;
        await engine.event(
          tx,
          origin + 3,
          'movement',
          at + 10 + Math.floor(i / 3) * 10,
          {
            kind: 'attack',
            origin,
            owner: origin,
            originName: 'Village ' + origin,
            units: { axe: 30 },
            reserved: 30,
            travel: 50 + (i % 4) * 10,
          },
          defaultConfig,
        );
      }
    });
  await make();
  await drain();
  const serial = await snapshot();
  await db.pool.query('TRUNCATE scheduled_events,reports,outbox RESTART IDENTITY CASCADE');
  for (const v of seed.villages)
    await db.pool.query('UPDATE villages SET state=$1,player_id=$2,points=$4 WHERE id=$3', [
      JSON.stringify(v.state),
      v.player_id,
      v.id,
      v.points,
    ]);
  await make();
  for (let wave = 0; wave < 100; wave++) {
    await Promise.all(Array.from({ length: 8 }, () => engine.resolveDue()));
    if (
      !(await db.pool.query("SELECT 1 FROM scheduled_events WHERE status='pending' LIMIT 1"))
        .rowCount
    )
      break;
  }
  expect(
    (await db.pool.query("SELECT 1 FROM scheduled_events WHERE status='pending'")).rowCount,
  ).toBe(0);
  const parallel = await snapshot();
  const sorted = (rows: any[]) => rows.map((row) => JSON.stringify(row)).sort();
  expect(parallel.villages).toEqual(serial.villages);
  expect(sorted(parallel.reports)).toEqual(sorted(serial.reports));
  const normalize = (rows: any[]) =>
    rows.map((row) => (row.kind === 'movement' ? row : { ...row, id: 0 }));
  expect(sorted(normalize(parallel.events))).toEqual(sorted(normalize(serial.events)));
});

async function prepareNpc(
  options: { autoBuild?: boolean; enabled?: boolean; style?: string; mode?: string } = {},
) {
  const now = Date.now();
  const state = freshVillage(now);
  state.resources = { wood: 500, clay: 500, iron: 500 };
  await db.pool.query('UPDATE villages SET state=$1 WHERE id=1', [JSON.stringify(state)]);
  await db.pool.query(
    `INSERT INTO npc_players(player_id,enabled,auto_build,style,target_mode,min_delay_seconds,max_delay_seconds,seed,next_action_at)
    VALUES(1,$1,$2,$3,$4,5,20,81231,clock_timestamp()-interval '1 second')`,
    [
      options.enabled ?? true,
      options.autoBuild ?? true,
      options.style || 'builder',
      options.mode || 'abandoned',
    ],
  );
  return state;
}
it('NPC workers commit exactly one paid construction and random next turn under contention', async () => {
  const before = await prepareNpc();
  await Promise.all(Array.from({ length: 8 }, () => runNpcTurn()));
  const bot = (
    await db.pool.query(
      'SELECT *,extract(epoch FROM next_action_at-last_action_at) AS delay FROM npc_players',
    )
  ).rows[0];
  expect(bot.turn).toBe(1);
  expect(Number(bot.delay)).toBeGreaterThanOrEqual(5);
  expect(Number(bot.delay)).toBeLessThanOrEqual(20.01);
  const events = (await db.pool.query("SELECT * FROM scheduled_events WHERE kind='build'")).rows;
  expect(events).toHaveLength(1);
  const construction = events[0],
    after = await village();
  expect(after.state.buildings[construction.payload.building]).toBe(
    before.buildings[construction.payload.building],
  );
  const accrued = structuredClone(before);
  advance(accrued, after.state.updatedAt, defaultConfig);
  expect(after.state.resources.wood).toBeCloseTo(
    accrued.resources.wood - construction.payload.cost.wood,
    6,
  );
  expect(after.state.reservedPopulation).toBeGreaterThan(before.reservedPopulation);
  await db.pool.query('UPDATE npc_players SET enabled=false');
  expect(await runNpcTurn()).toBe(false);
  await drain(construction.due_at.getTime());
  expect((await village()).state.buildings[construction.payload.building]).toBe(
    construction.payload.level,
  );
});
it('NPC pause and ban prevent new turns, while automatic building can be disabled independently', async () => {
  await prepareNpc({ enabled: false, autoBuild: false });
  expect(await runNpcTurn()).toBe(false);
  await db.pool.query(
    "UPDATE npc_players SET enabled=true; UPDATE players SET banned_until=now()+interval '1 day' WHERE id=1",
  );
  expect(await runNpcTurn()).toBe(false);
  await db.pool.query('UPDATE players SET banned_until=null WHERE id=1');
  expect(await runNpcTurn()).toBe(true);
  expect((await db.pool.query("SELECT 1 FROM scheduled_events WHERE kind='build'")).rowCount).toBe(
    0,
  );
  expect(
    (await db.pool.query("SELECT 1 FROM scheduled_events WHERE kind='recruit'")).rowCount,
  ).toBeGreaterThan(0);
});
it('NPC crash rollback preserves its turn, resources and action history', async () => {
  await prepareNpc();
  const before = await village();
  await expect(
    db.transaction(async () => {
      expect(await runNpcTurn()).toBe(true);
      throw new Error('NPC worker crash before commit');
    }),
  ).rejects.toThrow('NPC worker crash');
  expect((await village()).state).toEqual(before.state);
  expect((await db.pool.query('SELECT turn FROM npc_players')).rows[0].turn).toBe(0);
  expect((await db.pool.query('SELECT 1 FROM scheduled_events')).rowCount).toBe(0);
  expect((await db.pool.query('SELECT 1 FROM audit_log')).rowCount).toBe(0);
  expect(await runNpcTurn()).toBe(true);
  expect((await db.pool.query('SELECT turn FROM npc_players')).rows[0].turn).toBe(1);
});
it('NPC raids use real armies and abandoned-only targeting excludes nearby players', async () => {
  const state = await prepareNpc({ style: 'raider', autoBuild: false });
  state.units = { axe: 100 };
  state.resources = { wood: 0, clay: 0, iron: 0 };
  await db.pool.query('UPDATE villages SET state=$1 WHERE id=1', [JSON.stringify(state)]);
  const abandoned = (
    await db.pool.query(
      'INSERT INTO villages(world_id,x,y,name,state,points) VALUES(1,505,500,$1,$2,100) RETURNING id',
      ['Raid target', JSON.stringify(freshVillage(Date.now()))],
    )
  ).rows[0].id;
  expect(await runNpcTurn()).toBe(true);
  const attack = (await db.pool.query("SELECT * FROM scheduled_events WHERE kind='movement'"))
    .rows[0];
  expect(attack.village_id).toBe(abandoned);
  expect(attack.payload).toMatchObject({ owner: 1, kind: 'attack', units: { axe: 65 }, origin: 1 });
  expect((await village()).state.units.axe).toBe(35);
  await drain(attack.due_at.getTime());
  expect(
    (await db.pool.query("SELECT 1 FROM reports WHERE player_id=1 AND kind='battle'")).rowCount,
  ).toBeGreaterThan(0);
});
it('NPC rival raids respect tribe alliances and defeated NPCs stop taking turns', async () => {
  const state = await prepareNpc({ style: 'raider', autoBuild: false, mode: 'rivals' });
  state.units = { axe: 100 };
  state.resources = { wood: 0, clay: 0, iron: 0 };
  await db.pool.query('UPDATE villages SET state=$1 WHERE id=1', [JSON.stringify(state)]);
  await db.pool.query(
    "INSERT INTO tribes(world_id,name,tag) VALUES(1,'Home','HOME'),(1,'Friends','FRND')",
  );
  await db.pool.query('UPDATE players SET tribe_id=CASE WHEN id=1 THEN 1 ELSE 2 END');
  await db.pool.query("INSERT INTO diplomacy(tribe_a,tribe_b,status) VALUES(1,2,'ally')");
  await runNpcTurn();
  expect(
    (await db.pool.query("SELECT 1 FROM scheduled_events WHERE kind='movement'")).rowCount,
  ).toBe(0);
  await db.pool.query(
    "DELETE FROM diplomacy; UPDATE npc_players SET next_action_at=now()-interval '1 second'",
  );
  await runNpcTurn();
  expect(
    (await db.pool.query("SELECT 1 FROM scheduled_events WHERE kind='movement'")).rowCount,
  ).toBe(1);
  await db.pool.query(
    "UPDATE villages SET player_id=2 WHERE id=1; UPDATE npc_players SET next_action_at=now()-interval '1 second'",
  );
  await runNpcTurn();
  expect((await db.pool.query('SELECT enabled FROM npc_players')).rows[0].enabled).toBe(false);
});

describe('starter placement on PostgreSQL', () => {
  type Holding = { id: number; player_id: number | null; x: number; y: number };
  const distance = (a: Holding, b: Holding) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const holdings = async () =>
    (
      await db.pool.query<Holding>(
        'SELECT id,player_id,x,y FROM villages WHERE world_id=1 ORDER BY id',
      )
    ).rows;
  const settlementSnapshot = async () => ({
    players: (
      await db.pool.query('SELECT id,user_id,name FROM players WHERE world_id=1 ORDER BY id')
    ).rows,
    holdings: await holdings(),
    frontier: (await db.pool.query('SELECT * FROM spawn_frontiers ORDER BY world_id')).rows,
    reports: (await db.pool.query('SELECT * FROM reports ORDER BY id')).rows,
    outbox: (await db.pool.query('SELECT * FROM outbox ORDER BY id')).rows,
  });

  it('concurrent joins preserve existing holdings and settle unique, spaced frontier keeps', async () => {
    const existing = await holdings();
    const playerIds = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        db.transaction((tx) => spawn(tx, `Frontier arrival ${i}`, null)),
      ),
    );
    expect(new Set(playerIds).size).toBe(12);
    const after = await holdings();
    expect(after.filter((v) => existing.some((old) => old.id === v.id))).toEqual(existing);
    const created = after.filter((v) => v.player_id !== null && playerIds.includes(v.player_id));
    expect(created).toHaveLength(12);
    expect(new Set(created.map((v) => `${v.x}|${v.y}`)).size).toBe(12);
    const center = Math.floor(defaultConfig.map.size / 2);
    for (const keep of created) {
      expect(Math.max(Math.abs(keep.x - center), Math.abs(keep.y - center))).toBeLessThan(40);
      for (const other of after)
        if (other.id !== keep.id) expect(distance(keep, other)).toBeGreaterThanOrEqual(2);
      expect(
        after.filter((v) => v.player_id === null && Math.hypot(v.x - keep.x, v.y - keep.y) <= 6)
          .length,
      ).toBeGreaterThanOrEqual(2);
    }
    expect(
      Number(
        (await db.pool.query('SELECT cursor FROM spawn_frontiers WHERE world_id=1')).rows[0].cursor,
      ),
    ).toBeGreaterThanOrEqual(created.length);
  });

  it('a failed join rolls back its player, neutral keeps, cursor and welcome before retrying the same site', async () => {
    const before = await settlementSnapshot();
    let attempted: Holding | undefined;
    await expect(
      db.transaction(async (tx) => {
        const player = await spawn(tx, 'Aborted frontier arrival', null);
        attempted = (
          await tx.query<Holding>('SELECT id,player_id,x,y FROM villages WHERE player_id=$1', [
            player,
          ])
        ).rows[0];
        expect(attempted).toBeDefined();
        expect(
          (await tx.query('SELECT 1 FROM villages WHERE player_id IS NULL')).rowCount,
        ).toBeGreaterThan(0);
        expect(
          (await tx.query('SELECT 1 FROM spawn_frontiers WHERE world_id=1 AND cursor>0')).rowCount,
        ).toBe(1);
        expect(
          (await tx.query('SELECT 1 FROM reports WHERE player_id=$1', [player])).rowCount,
        ).toBe(1);
        throw new Error('Starter creation interrupted before commit');
      }),
    ).rejects.toThrow('Starter creation interrupted before commit');
    expect(await settlementSnapshot()).toEqual(before);
    const player = await db.transaction((tx) => spawn(tx, 'Committed frontier arrival', null));
    const committed = (await holdings()).find((v) => v.player_id === player)!;
    expect({ x: committed.x, y: committed.y }).toEqual({ x: attempted!.x, y: attempted!.y });
  });

  it('fresh arrivals avoid advanced castles throughout a densely occupied core', async () => {
    const center = Math.floor(defaultConfig.map.size / 2);
    const veteran = freshVillage(at);
    veteran.buildings.main = 30;
    veteran.buildings.wood = 30;
    veteran.buildings.clay = 30;
    veteran.buildings.iron = 30;
    const veteranPoints = points(veteran.buildings);
    expect(veteranPoints).toBeGreaterThan(points(freshVillage(at).buildings) * 8);
    const core: { x: number; y: number }[] = [];
    for (let dx = -6; dx <= 6; dx += 2)
      for (let dy = -6; dy <= 6; dy += 2) core.push({ x: center + dx, y: center + dy });
    await db.pool.query(
      `INSERT INTO villages(world_id,player_id,x,y,name,state,points)
       SELECT 1,1,x,y,'Veteran core keep',$2::jsonb,$3 FROM jsonb_to_recordset($1::jsonb) AS p(x int,y int)
       ON CONFLICT(world_id,x,y) DO UPDATE SET state=excluded.state,points=excluded.points`,
      [JSON.stringify(core), JSON.stringify(veteran), veteranPoints],
    );
    const existing = await holdings();
    const player = await db.transaction((tx) => spawn(tx, 'Late frontier arrival', null));
    const after = await holdings();
    const keep = after.find((v) => v.player_id === player)!;
    expect(after.filter((v) => existing.some((old) => old.id === v.id))).toEqual(existing);
    for (const castle of core)
      expect(Math.max(Math.abs(castle.x - keep.x), Math.abs(castle.y - keep.y))).toBeGreaterThan(4);
    expect(Math.max(Math.abs(keep.x - center), Math.abs(keep.y - center))).toBeLessThan(30);
    expect(
      after.filter((v) => v.player_id === null && Math.hypot(v.x - keep.x, v.y - keep.y) <= 6)
        .length,
    ).toBe(2);
  });

  it.each([1, 2])(
    'reuses %i nearby neutral keeps and only adds the missing starter targets',
    async (existingCount) => {
      let planned: Holding | undefined;
      await expect(
        db.transaction(async (tx) => {
          const player = await spawn(tx, 'Uncommitted location probe', null);
          planned = (
            await tx.query<Holding>('SELECT id,player_id,x,y FROM villages WHERE player_id=$1', [
              player,
            ])
          ).rows[0];
          throw new Error('Location probe rolls back');
        }),
      ).rejects.toThrow('Location probe rolls back');
      const origin = planned!;
      const existing = await holdings();
      const targets: Holding[] = [];
      for (let dx = -5; dx <= 5 && targets.length < existingCount; dx++) {
        for (let dy = -5; dy <= 5 && targets.length < existingCount; dy++) {
          const candidate = { id: -1, player_id: null, x: origin.x + dx, y: origin.y + dy };
          const radius = Math.hypot(dx, dy);
          if (
            radius < 3 ||
            radius > 5 ||
            [...existing, ...targets].some((v) => distance(v, candidate) < 2)
          )
            continue;
          targets.push(candidate);
        }
      }
      expect(targets).toHaveLength(existingCount);
      const neutrals = (
        await db.pool.query<Holding>(
          `INSERT INTO villages(world_id,x,y,name,state,points)
       SELECT 1,x,y,'Existing neutral keep',$2::jsonb,$3 FROM jsonb_to_recordset($1::jsonb) AS p(x int,y int)
       RETURNING id,player_id,x,y`,
          [
            JSON.stringify(targets),
            JSON.stringify(freshVillage(at)),
            points(freshVillage(at).buildings),
          ],
        )
      ).rows;
      const player = await db.transaction((tx) =>
        spawn(tx, `Arrival with ${existingCount} targets`, null),
      );
      const after = await holdings();
      const keep = after.find((v) => v.player_id === player)!;
      expect({ x: keep.x, y: keep.y }).toEqual({ x: origin.x, y: origin.y });
      const nearby = after.filter(
        (v) => v.player_id === null && Math.hypot(v.x - keep.x, v.y - keep.y) <= 6,
      );
      expect(nearby).toHaveLength(2);
      expect(nearby.filter((v) => !neutrals.some((old) => old.id === v.id))).toHaveLength(
        2 - existingCount,
      );
      expect(after.filter((v) => neutrals.some((old) => old.id === v.id))).toEqual(neutrals);
    },
  );
});
