import { initialize, pool, transaction } from '../../../packages/db';
import { buildApp, sockets } from './app';
import { resolveDue } from './engine';
import { redis, connectRedis } from './redis';
import { startSidejobs } from './sidejobs';
import { runNpcBatch } from './application/npcs';
import {
  installMetrics,
  resolverDuration,
  resolverErrors,
  resolvedEvents,
  wsConnections,
  npcTurns,
  npcErrors,
} from './metrics';
await initialize();
const role = process.env.ROLE || 'all';
if (!['all', 'api', 'ws', 'resolver', 'relay', 'sidejobs'].includes(role))
  throw new Error('Invalid ROLE');
const app = await buildApp();
installMetrics(app);
connectRedis();
const subscriber = redis.duplicate();
subscriber.on('error', () => {});
if (['all', 'api', 'ws'].includes(role))
  void subscriber
    .connect()
    .then(() =>
      subscriber.subscribe('warband:events', (raw) => {
        try {
          const event = JSON.parse(raw);
          for (const socket of sockets.get(event.player_id) || [])
            if (socket.readyState === 1)
              socket.send(JSON.stringify({ ...event, server_now: Date.now() }));
        } catch (e) {
          app.log.warn(e);
        }
      }),
    )
    .catch((e) => app.log.warn(e));
let resolving: Promise<unknown> | undefined, relaying: Promise<unknown> | undefined;
const resolver = setInterval(
  () => {
    if (resolving || !['all', 'resolver'].includes(role)) return;
    const stop = resolverDuration.startTimer();
    resolving = resolveDue()
      .then((n) => resolvedEvents.inc(n))
      .catch((e) => {
        resolverErrors.inc();
        app.log.error(e);
      })
      .finally(() => {
        stop();
        resolving = undefined;
      });
  },
  Number(process.env.RESOLVER_POLL_MS || 50),
);
const relay = setInterval(() => {
  if (relaying || !redis.isReady || !['all', 'relay'].includes(role)) return;
  relaying = transaction(async (tx) => {
    const rows = (
      await tx.query(
        'SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT 500 FOR UPDATE SKIP LOCKED',
      )
    ).rows;
    if (!rows.length) return;
    await Promise.all(rows.map((row) => redis.publish('warband:events', JSON.stringify(row))));
    const pushes = rows
      .filter((row) => row.type === 'incoming_attack')
      .map((row) => ({
        kind: 'push',
        payload: {
          player: row.player_id,
          notification: {
            title: 'Incoming attack',
            body: 'An army is approaching your village. Open Warband to prepare your defense.',
            tag: `incoming-${row.id}`,
            url: '/?page=commands',
          },
        },
      }));
    if (pushes.length)
      await tx.query(
        'INSERT INTO side_effects(kind,payload) SELECT kind,payload FROM jsonb_to_recordset($1::jsonb) AS x(kind text,payload jsonb)',
        [JSON.stringify(pushes)],
      );
    await tx.query('UPDATE outbox SET sent_at=clock_timestamp() WHERE id=ANY($1::bigint[])', [
      rows.map((r) => r.id),
    ]);
  })
    .catch((e) => app.log.error(e))
    .finally(() => {
      relaying = undefined;
    });
}, 100);
const stopJobs = ['all', 'sidejobs'].includes(role) ? startSidejobs(app) : undefined;
let thinking: Promise<unknown> | undefined;
const npcTimer = setInterval(() => {
  if (thinking || !['all', 'sidejobs'].includes(role)) return;
  thinking = runNpcBatch()
    .then((result) => {
      npcTurns.inc(result.turns);
      for (const error of result.errors) {
        npcErrors.inc();
        app.log.error(error);
      }
    })
    .catch((error) => {
      npcErrors.inc();
      app.log.error(error);
    })
    .finally(() => {
      thinking = undefined;
    });
}, 1000);
const gauges = setInterval(
  () => wsConnections.set([...sockets.values()].reduce((n, set) => n + set.size, 0)),
  5000,
);
await app.listen({ port: Number(process.env.PORT || 3001), host: '0.0.0.0' });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(resolver);
  clearInterval(relay);
  clearInterval(gauges);
  clearInterval(npcTimer);
  for (const set of sockets.values())
    for (const socket of set) socket.close(1012, 'Server restarting');
  await app.close();
  await Promise.allSettled([resolving, relaying, thinking]);
  await stopJobs?.();
  if (subscriber.isOpen) subscriber.destroy();
  if (redis.isOpen) redis.destroy();
  await pool.end();
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
