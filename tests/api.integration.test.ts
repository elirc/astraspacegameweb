import { beforeAll, afterAll, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
let app: any, db: any, cache: any;
let accountEmail = '';
let cookieA = '',
  cookieB = '',
  playerA = 0,
  villageA = 0,
  villageB = 0,
  refreshToken = '';
const cookies = (r: any) =>
  r.cookies
    .filter((c: any) => c.value)
    .map((c: any) => `${c.name}=${c.value}`)
    .join('; ');
beforeAll(async () => {
  const url =
    process.env.API_TEST_DATABASE_URL ||
    'postgres://warband:warband_local@127.0.0.1:55432/warband_api_test';
  if (!new URL(url).pathname.endsWith('_test'))
    throw new Error('API test database must end in _test');
  const name = new URL(url).pathname.slice(1);
  if (!/^[a-z_]+$/.test(name)) throw new Error('Invalid database name');
  const admin = new pg.Pool({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
  if (!(await admin.query('SELECT datname FROM pg_database WHERE datname=$1', [name])).rowCount)
    await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  db = await import('../packages/db');
  await db.initialize();
  await db.pool.query('TRUNCATE rate_buckets');
  if (process.env.TEST_REDIS === '1') {
    cache = (await import('../apps/server/src/redis')).redis;
    await cache.connect();
  }
  app = await (await import('../apps/server/src/app')).buildApp();
});
afterAll(async () => {
  await app?.close();
  if (cache?.isOpen) cache.destroy();
  await db?.pool.end();
});
it('requires authentication for game state', async () => {
  expect((await app.inject({ url: '/api/state' })).statusCode).toBe(401);
});
it('creates a guest village and upgrades the same player to an account', async () => {
  const guest = await app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
  expect(guest.statusCode).toBe(200);
  cookieA = cookies(guest);
  playerA = guest.json().playerId;
  const state = await app.inject({ url: '/api/state', headers: { cookie: cookieA } });
  villageA = state.json().villages[0].id;
  const suffix = randomUUID().slice(0, 8);
  accountEmail = `a-${suffix}@example.test`;
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { cookie: cookieA },
    payload: {
      email: accountEmail,
      password: 'StrongTestPass2026!',
      name: 'Test ' + suffix,
    },
  });
  expect(r.statusCode).toBe(200);
  expect(r.json().playerId).toBe(playerA);
  cookieA = cookies(r);
  refreshToken = r.cookies.find((c: any) => c.name === 'wb_refresh').value;
  const saved = await app.inject({ url: '/api/state', headers: { cookie: cookieA } });
  expect(saved.json().villages[0].id).toBe(villageA);
  expect(saved.json().player.user_id).toBeTruthy();
  expect(r.cookies.every((c: any) => c.httpOnly)).toBe(true);
  expect(r.cookies.every((c: any) => c.sameSite === 'Strict')).toBe(true);
});
it('rotates refresh tokens and rejects reuse', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { cookie: `wb_refresh=${refreshToken}` },
  });
  expect(r.statusCode).toBe(200);
  cookieA = cookies(r);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { cookie: `wb_refresh=${refreshToken}` },
      })
    ).statusCode,
  ).toBe(401);
  expect((await app.inject({ url: '/api/state', headers: { cookie: cookieA } })).statusCode).toBe(
    401,
  );
  cookieA = cookies(
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: accountEmail, password: 'StrongTestPass2026!' },
    }),
  );
});
it('rejects invalid logins without exposing player data', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'missing@example.test', password: 'IncorrectPassword!' },
  });
  expect(r.statusCode).toBe(401);
  expect(r.json().error).toBe('Email or password is incorrect');
});
it('prevents CSRF and cross-player village mutations', async () => {
  const guest = await app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
  cookieB = cookies(guest);
  villageB = (await app.inject({ url: '/api/state', headers: { cookie: cookieB } })).json()
    .villages[0].id;
  const cmd = {
    method: 'POST' as const,
    url: `/api/villages/${villageA}/command`,
    payload: { action: 'build', building: 'wood' },
    headers: { cookie: cookieB, 'idempotency-key': randomUUID() },
  };
  expect((await app.inject(cmd)).statusCode).toBe(403);
  expect(
    (
      await app.inject({
        ...cmd,
        headers: { ...cmd.headers, cookie: cookieA, origin: 'https://attacker.example' },
      })
    ).statusCode,
  ).toBe(403);
});
it('does not disclose home troops, resources or guest credentials on the map', async () => {
  const r = await app.inject({ url: '/api/map', headers: { cookie: cookieB } });
  expect(r.statusCode).toBe(200);
  const village = r.json().villages.find((v: any) => v.id === villageA);
  expect(village.state).toBeUndefined();
  expect(village.units).toBeUndefined();
  expect(village.resources).toBeUndefined();
  expect(JSON.stringify(r.json())).not.toContain('password_hash');
});
it('rejects empty, fractional and unknown units through HTTP', async () => {
  for (const army of [{ axe: 0 }, { axe: 0.5 }, { dragon: 1 }]) {
    const r = await app.inject({
      method: 'POST',
      url: `/api/villages/${villageA}/command`,
      headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
      payload: { action: 'movement', targetId: villageB, kind: 'attack', units: army },
    });
    expect(r.statusCode).toBe(400);
  }
});
it('does not expose another player’s reports', async () => {
  const a = (await app.inject({ url: '/api/reports', headers: { cookie: cookieA } })).json();
  const b = (await app.inject({ url: '/api/reports', headers: { cookie: cookieB } })).json();
  expect(a.reports.every((r: any) => r.player_id === playerA)).toBe(true);
  expect(b.reports.some((r: any) => r.player_id === playerA)).toBe(false);
});

it('revokes an access token immediately on logout', async () => {
  const guest = await app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} }),
    cookie = cookies(guest);
  expect((await app.inject({ url: '/api/state', headers: { cookie } })).statusCode).toBe(200);
  await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
  expect((await app.inject({ url: '/api/state', headers: { cookie } })).statusCode).toBe(401);
});
it('deduplicates social writes transactionally and rejects conflicting key reuse', async () => {
  const key = randomUUID(),
    request = {
      method: 'POST',
      url: '/api/messages',
      headers: { cookie: cookieA, 'idempotency-key': key },
      payload: { recipient: 'Aldric the Bold', subject: key, body: 'A single test message' },
    };
  const results = await Promise.all(Array.from({ length: 8 }, () => app.inject(request)));
  expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(200));
  expect(
    Number(
      (await db.pool.query('SELECT count(*) AS n FROM messages WHERE subject=$1', [key])).rows[0].n,
    ),
  ).toBe(1);
  expect(
    (await app.inject({ ...request, payload: { ...request.payload, body: 'Different content' } }))
      .statusCode,
  ).toBe(409);
});
it('paginates reports without duplicates and keeps archival private', async () => {
  const page1 = await app.inject({ url: '/api/reports?limit=1', headers: { cookie: cookieA } });
  const first = page1.json().reports[0];
  expect(first).toBeTruthy();
  const page2 = await app.inject({
    url: '/api/reports?limit=1&cursor=' + first.id,
    headers: { cookie: cookieA },
  });
  expect(page2.json().reports.every((r: any) => r.id < first.id)).toBe(true);
  await app.inject({
    method: 'POST',
    url: '/api/reports/bulk',
    headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
    payload: { ids: [first.id], action: 'archive' },
  });
  expect(
    (await app.inject({ url: '/api/reports?archived=true', headers: { cookie: cookieA } }))
      .json()
      .reports.some((r: any) => r.id === first.id),
  ).toBe(true);
  expect(
    (await app.inject({ url: '/api/reports/' + first.id, headers: { cookie: cookieB } }))
      .statusCode,
  ).toBe(404);
});
it('protects admin tools, validates config changes and returns a generated OpenAPI contract', async () => {
  expect(
    (await app.inject({ url: '/api/admin/config', headers: { cookie: cookieA } })).statusCode,
  ).toBe(403);
  await db.pool.query(
    'UPDATE users SET is_admin=true WHERE id=(SELECT user_id FROM players WHERE id=$1)',
    [playerA],
  );
  const original = (
    await app.inject({ url: '/api/admin/config', headers: { cookie: cookieA } })
  ).json().config;
  const next = { ...original, version: original.version + 1, speed: original.speed + 1 };
  const preview = await app.inject({
    method: 'POST',
    url: '/api/admin/config',
    headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
    payload: { config: next, dryRun: true, reason: 'Verify a harmless dry run' },
  });
  expect(preview.statusCode, preview.body).toBe(200);
  expect(preview.json().valid).toBe(true);
  expect(
    (await app.inject({ url: '/api/admin/config', headers: { cookie: cookieA } })).json().config
      .version,
  ).toBe(original.version);
  const spec = (
    await app.inject({ url: '/api/openapi.json', headers: { cookie: cookieA } })
  ).json();
  expect(spec.paths['/api/villages/{id}/command'].post).toBeTruthy();
});
it('delivers a single-use password reset token through the durable mail outbox and revokes sessions', async () => {
  const request = { method: 'POST', url: '/api/auth/forgot', payload: { email: accountEmail } };
  const known = await app.inject(request),
    unknown = await app.inject({ ...request, payload: { email: 'unknown-reset@example.test' } });
  expect(known.statusCode).toBe(200);
  expect(unknown.json().message).toBe(known.json().message);
  const effect = (
    await db.pool.query(
      "SELECT payload FROM side_effects WHERE kind='email' AND payload->>'to'=$1 ORDER BY id DESC LIMIT 1",
      [accountEmail],
    )
  ).rows[0];
  const token = effect.payload.text.match(/reset=([a-f0-9]{64})/)[1];
  expect(
    (await db.pool.query('SELECT 1 FROM password_resets WHERE token_hash=$1', [token])).rowCount,
  ).toBe(0);
  const reset = {
    method: 'POST',
    url: '/api/auth/reset',
    payload: { token, password: 'ChangedTestPass2026!' },
  };
  expect((await app.inject(reset)).statusCode).toBe(200);
  expect((await app.inject(reset)).statusCode).toBe(400);
  expect((await app.inject({ url: '/api/state', headers: { cookie: cookieA } })).statusCode).toBe(
    401,
  );
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: accountEmail, password: 'ChangedTestPass2026!' },
  });
  expect(login.statusCode, login.body).toBe(200);
  cookieA = cookies(login);
});
it('applies a versioned catalog addition and trains the new unit without code changes', async () => {
  const original = (
    await app.inject({ url: '/api/admin/config', headers: { cookie: cookieA } })
  ).json().config;
  const next = {
    ...original,
    version: original.version + 1,
    units: {
      ...original.units,
      militia: { ...original.units.spear, name: 'Militia', cost: { wood: 1, clay: 1, iron: 1 } },
    },
  };
  const result = await app.inject({
    method: 'POST',
    url: '/api/admin/config',
    headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
    payload: { config: next, dryRun: false, reason: 'Verify a new data-driven unit' },
  });
  expect(result.statusCode, result.body).toBe(200);
  const command = {
    method: 'POST',
    url: `/api/villages/${villageA}/recruit`,
    headers: { cookie: cookieA, 'idempotency-key': 'k'.repeat(120) },
    payload: { unit: 'militia', count: 1 },
  };
  const trained = await app.inject(command);
  expect(trained.statusCode, trained.body).toBe(200);
  expect((await app.inject(command)).statusCode).toBe(200);
  const rows = (
    await db.pool.query(
      "SELECT config_version FROM scheduled_events WHERE village_id=$1 AND kind='recruit' AND payload->>'unit'='militia'",
      [villageA],
    )
  ).rows;
  expect(rows).toEqual([{ config_version: next.version }]);
  const simulation = await app.inject({
    url:
      '/api/sim/battle?' +
      new URLSearchParams({ attacker: JSON.stringify({ militia: 10 }), defender: '{}' }),
    headers: { cookie: cookieA },
  });
  expect(simulation.statusCode, simulation.body).toBe(200);
  const invalid = await app.inject({
    url:
      '/api/sim/battle?' +
      new URLSearchParams({ attacker: JSON.stringify({ imaginary: 10 }), defender: '{}' }),
    headers: { cookie: cookieA },
  });
  expect(invalid.statusCode).toBe(400);
});
it('returns bounded public map tiles and prevents push subscription SSRF', async () => {
  const tile = await app.inject({ url: '/api/map/tiles?x=5&y=5', headers: { cookie: cookieA } });
  expect(tile.statusCode, tile.body).toBe(200);
  expect(
    tile
      .json()
      .villages.every((v: any) => v.x >= 500 && v.x < 600 && v.y >= 500 && v.y < 600 && !v.state),
  ).toBe(true);
  const result = await app.inject({
    method: 'POST',
    url: '/api/push/subscribe',
    headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
    payload: {
      endpoint: 'https://127.0.0.1/private',
      keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
    },
  });
  expect(result.statusCode).toBe(400);
});
it('preserves a valid movement payload through JSON-schema union validation', async () => {
  const result = await app.inject({
    method: 'POST',
    url: `/api/villages/${villageA}/command`,
    headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
    payload: {
      action: 'movement',
      targetId: villageB,
      kind: 'scout',
      units: { scout: 1 },
      catapultTarget: 'main',
    },
  });
  expect(result.statusCode, result.body).toBe(200);
  const event = (
    await db.pool.query(
      "SELECT payload FROM scheduled_events WHERE kind='movement' AND (payload->>'origin')::bigint=$1 ORDER BY id DESC LIMIT 1",
      [villageA],
    )
  ).rows[0];
  expect(event.payload.kind).toBe('scout');
  expect(event.payload.units).toEqual({ scout: 1 });
});

it('uses configured world and tile sizes for map boundaries, including partial edge tiles', async () => {
  const original = (await db.pool.query('SELECT config FROM worlds WHERE id=1')).rows[0].config;
  let edgeVillage: number | undefined;
  try {
    await db.pool.query('UPDATE worlds SET config=$1 WHERE id=1', [
      { ...original, map: { ...original.map, size: 30000, tileSize: 10 } },
    ]);
    edgeVillage = (
      await db.pool.query(
        "INSERT INTO villages(world_id,x,y,name,state,points) SELECT 1,29999,29999,'Map boundary test',state,points FROM villages WHERE id=$1 RETURNING id",
        [villageA],
      )
    ).rows[0].id;
    const edge = await app.inject({
      url: '/api/map/tiles?x=2999&y=2999',
      headers: { cookie: cookieA },
    });
    expect(edge.statusCode, edge.body).toBe(200);
    expect(edge.json().tileSize).toBe(10);
    expect(edge.json().villages.map((v: any) => v.id)).toContain(edgeVillage);
    for (const coordinates of ['x=3000&y=2999', 'x=2999&y=3000', 'x=-1&y=0', 'x=0.5&y=0']) {
      const invalid = await app.inject({
        url: '/api/map/tiles?' + coordinates,
        headers: { cookie: cookieA },
      });
      expect(invalid.statusCode, invalid.body).toBe(400);
    }
    await db.pool.query('UPDATE worlds SET config=$1 WHERE id=1', [
      { ...original, map: { ...original.map, size: 1001, tileSize: 10 } },
    ]);
    expect(
      (await app.inject({ url: '/api/map/tiles?x=100&y=100', headers: { cookie: cookieA } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/map/tiles?x=101&y=100', headers: { cookie: cookieA } }))
        .statusCode,
    ).toBe(400);
  } finally {
    if (edgeVillage) await db.pool.query('DELETE FROM villages WHERE id=$1', [edgeVillage]);
    await db.pool.query('UPDATE worlds SET config=$1 WHERE id=1', [original]);
  }
});

it('serves concurrent idle snapshots while a command commits without lock failures', async () => {
  const guest = await app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
  expect(guest.statusCode, guest.body).toBe(200);
  const cookie = cookies(guest);
  const initial = (await app.inject({ url: '/api/state', headers: { cookie } })).json();
  const village = initial.villages[0];
  const results = await Promise.all([
    ...Array.from({ length: 24 }, () => app.inject({ url: '/api/state', headers: { cookie } })),
    app.inject({
      method: 'POST',
      url: `/api/villages/${village.id}/command`,
      headers: { cookie, 'idempotency-key': randomUUID() },
      payload: { action: 'rename', name: 'Concurrent capital' },
    }),
  ]);
  expect(results.map((r) => r.statusCode)).toEqual(Array(25).fill(200));
  const anchor = (
    await db.pool.query("SELECT state->>'updatedAt' AS anchor FROM villages WHERE id=$1", [
      village.id,
    ])
  ).rows[0].anchor;
  const final = (await app.inject({ url: '/api/state', headers: { cookie } })).json();
  expect(final.villages[0].name).toBe('Concurrent capital');
  expect(
    (
      await db.pool.query("SELECT state->>'updatedAt' AS anchor FROM villages WHERE id=$1", [
        village.id,
      ])
    ).rows[0].anchor,
  ).toBe(anchor);
  const build = await app.inject({
    method: 'POST',
    url: `/api/villages/${village.id}/command`,
    headers: { cookie, 'idempotency-key': randomUUID() },
    payload: { action: 'build', building: 'wood' },
  });
  expect(build.statusCode, build.body).toBe(200);
  const queued = await db.pool.query(
    "UPDATE scheduled_events SET due_at=clock_timestamp()-interval '1 second' WHERE village_id=$1 AND kind='build' AND status='pending' RETURNING id",
    [village.id],
  );
  expect(queued.rowCount).toBe(1);
  const due = await app.inject({ url: '/api/state', headers: { cookie } });
  expect(due.statusCode, due.body).toBe(200);
  expect(due.json().villages[0].state.buildings.wood).toBe(6);
  expect(
    (await db.pool.query('SELECT status FROM scheduled_events WHERE id=$1', [queued.rows[0].id]))
      .rows[0].status,
  ).toBe('done');
});

it('keeps authoritative state available after Redis disappears', async () => {
  if (cache?.isOpen) cache.destroy();
  const result = await app.inject({ url: '/api/state', headers: { cookie: cookieA } });
  expect(result.statusCode, result.body).toBe(200);
  const result2 = await app.inject({
    method: 'POST',
    url: `/api/villages/${villageA}/command`,
    headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
    payload: { action: 'rename', name: 'Still authoritative' },
  });
  expect(result2.statusCode, result2.body).toBe(200);
});

it('only administrators create idempotent NPC batches, with real villages and no login sessions', async () => {
  const suffix = randomUUID().slice(0, 8);
  const admin = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: `npc-admin-${suffix}@example.test`,
      password: 'StrongTestPass2026!',
      name: `NPC Admin ${suffix}`,
    },
  });
  expect(admin.statusCode, admin.body).toBe(200);
  const playerA = admin.json().playerId;
  const cookieA = cookies(admin);
  await db.pool.query(
    'UPDATE users SET is_admin=true WHERE id=(SELECT user_id FROM players WHERE id=$1)',
    [playerA],
  );
  const guest = await app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
  expect(guest.statusCode, guest.body).toBe(200);
  const cookieB = cookies(guest);
  const settings = {
    enabled: false,
    style: 'balanced',
    autoBuild: true,
    minDelaySeconds: 7,
    maxDelaySeconds: 19,
    targetMode: 'abandoned',
  };
  const payload = { count: 3, settings, reason: 'Populate a quiet test world' };
  for (const url of ['/api/admin/npcs', '/api/admin/npcs/update', '/api/admin/npcs/pause']) {
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie: cookieB, 'idempotency-key': randomUUID() },
          payload,
        })
      ).statusCode,
    ).toBe(403);
  }
  expect(
    (await app.inject({ url: '/api/admin/npcs', headers: { cookie: cookieB } })).statusCode,
  ).toBe(403);
  expect((await app.inject({ url: '/api/admin/npcs' })).statusCode).toBe(401);
  const request = {
    method: 'POST',
    url: '/api/admin/npcs',
    headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
    payload,
  };
  const [first, duplicate] = await Promise.all([app.inject(request), app.inject(request)]);
  expect(first.statusCode, first.body).toBe(200);
  expect(duplicate.json().created).toEqual(first.json().created);
  const ids = first.json().created.map((bot: any) => bot.id);
  expect(ids).toHaveLength(3);
  expect(new Set(first.json().created.map((bot: any) => bot.name)).size).toBe(3);
  for (const bot of first.json().created) expect(bot.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  expect(
    (await db.pool.query('SELECT 1 FROM villages WHERE player_id=ANY($1::bigint[])', [ids]))
      .rowCount,
  ).toBe(3);
  expect(
    (await db.pool.query('SELECT 1 FROM session_families WHERE player_id=ANY($1::bigint[])', [ids]))
      .rowCount,
  ).toBe(0);
  expect(
    (
      await db.pool.query(
        'SELECT 1 FROM players WHERE id=ANY($1::bigint[]) AND user_id IS NOT NULL',
        [ids],
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await db.pool.query("SELECT 1 FROM audit_log WHERE action='admin.npcs.create' AND actor=$1", [
        playerA,
      ])
    ).rowCount,
  ).toBe(1);
  const list = await app.inject({
    url: `/api/admin/npcs?cursor=${Math.min(...ids) - 1}`,
    headers: { cookie: cookieA },
  });
  const listedBatch = list.json().npcs.filter((bot: any) => ids.includes(bot.player_id));
  expect(listedBatch).toHaveLength(3);
  for (const bot of listedBatch) expect(bot.settings).toEqual(settings);
  expect(
    (
      await app.inject({
        ...request,
        headers: { ...request.headers, 'idempotency-key': randomUUID() },
        payload: { ...payload, count: 51 },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        ...request,
        headers: { ...request.headers, 'idempotency-key': randomUUID() },
        payload: {
          ...payload,
          settings: { ...settings, minDelaySeconds: 40, maxDelaySeconds: 10 },
        },
      })
    ).statusCode,
  ).toBe(400);
  const update = {
    method: 'POST',
    url: '/api/admin/npcs/update',
    headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
    payload: {
      ids,
      settings: { ...settings, enabled: true, minDelaySeconds: 10, maxDelaySeconds: 60 },
      reason: payload.reason,
    },
  };
  expect((await app.inject(update)).json().updated).toBe(3);
  expect(
    (
      await app.inject({
        ...update,
        headers: { ...update.headers, 'idempotency-key': randomUUID() },
        payload: { ...update.payload, ids: [ids[0], playerA] },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await db.pool.query(
        'SELECT 1 FROM npc_players WHERE enabled AND player_id=ANY($1::bigint[])',
        [ids],
      )
    ).rowCount,
  ).toBe(3);
  const enabledBeforePause = (await db.pool.query('SELECT 1 FROM npc_players WHERE enabled'))
    .rowCount;
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/admin/npcs/pause',
        headers: { cookie: cookieA, 'idempotency-key': randomUUID() },
        payload: { reason: payload.reason },
      })
    ).json().paused,
  ).toBe(enabledBeforePause);
  expect((await db.pool.query('SELECT 1 FROM npc_players WHERE enabled')).rowCount).toBe(0);
});
