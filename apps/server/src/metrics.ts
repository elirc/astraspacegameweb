import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import type { FastifyInstance } from 'fastify';
import { pool, dbCounters } from '../../../packages/db';
export const registry = new Registry();
export const npcTurns = new Counter({
  name: 'warband_npc_turns_total',
  help: 'Committed NPC decision turns',
  registers: [registry],
});
export const npcErrors = new Counter({
  name: 'warband_npc_errors_total',
  help: 'NPC worker failures excluding normal contention',
  registers: [registry],
});
collectDefaultMetrics({ register: registry, prefix: 'warband_' });
export const eventLag = new Histogram({
  name: 'warband_event_lag_seconds',
  help: 'Delay between event due time and committed resolution',
  // The lag SLO is 2 s (docs/verification.md). Spend the buckets where the SLO is
  // decided instead of on 10/30/60 s buckets nobody reads.
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2],
  registers: [registry],
});
type Resolution = { due: number; kind: string };
let resolutionObserver: ((samples: { kind: string; lag: number }[]) => void) | undefined;
export function observeResolutions(observer: typeof resolutionObserver) {
  resolutionObserver = observer;
}
export function committedResolutions(events: Resolution[]) {
  const now = Date.now();
  const samples = events.map((event) => ({
    kind: event.kind,
    lag: Math.max(0, now - event.due) / 1000,
  }));
  for (const sample of samples) eventLag.observe(sample.lag);
  resolutionObserver?.(samples);
}
export const resolverDuration = new Histogram({
  name: 'warband_resolver_transaction_seconds',
  help: 'Resolver transaction duration',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});
export const resolvedEvents = new Counter({
  name: 'warband_events_resolved_total',
  help: 'Committed events',
  registers: [registry],
});
export const resolverErrors = new Counter({
  name: 'warband_resolver_errors_total',
  help: 'Aborted resolver transactions',
  registers: [registry],
});
export const apiDuration = new Histogram({
  name: 'warband_http_request_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.15, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});
export const wsConnections = new Gauge({
  name: 'warband_ws_connections',
  help: 'Active WebSocket connections',
  registers: [registry],
});
new Gauge({
  name: 'warband_lock_retry_exhaustions_total',
  help: 'Exhausted lock retries',
  registers: [registry],
  collect() {
    this.set(dbCounters.exhausted);
  },
});
new Gauge({
  name: 'warband_lock_retries_total',
  help: 'Retried database transactions',
  registers: [registry],
  collect() {
    this.set(dbCounters.retries);
  },
});
new Gauge({
  name: 'warband_pending_events',
  help: 'Due unresolved events',
  registers: [registry],
  async collect() {
    this.set(
      Number(
        (
          await pool.query(
            "SELECT count(*) AS n FROM scheduled_events WHERE status='pending' AND due_at<=now()",
          )
        ).rows[0].n,
      ),
    );
  },
});
new Gauge({
  name: 'warband_oldest_event_seconds',
  help: 'Age of oldest overdue event',
  registers: [registry],
  async collect() {
    this.set(
      Number(
        (
          await pool.query(
            "SELECT coalesce(greatest(0,extract(epoch FROM now()-min(due_at))),0) AS n FROM scheduled_events WHERE status='pending'",
          )
        ).rows[0].n,
      ),
    );
  },
});
new Gauge({
  name: 'warband_outbox_backlog',
  help: 'Unsent notifications',
  registers: [registry],
  async collect() {
    this.set(
      Number(
        (await pool.query('SELECT count(*) AS n FROM outbox WHERE sent_at IS NULL')).rows[0].n,
      ),
    );
  },
});
export function installMetrics(app: FastifyInstance) {
  app.addHook('onResponse', async (req, reply) => {
    apiDuration.observe(
      { method: req.method, route: req.routeOptions.url || 'unmatched', status: reply.statusCode },
      reply.elapsedTime / 1000,
    );
  });
  app.get('/metrics', async (req, reply) => {
    if (
      process.env.NODE_ENV === 'production' &&
      (!process.env.METRICS_TOKEN ||
        req.headers.authorization !== `Bearer ${process.env.METRICS_TOKEN}`)
    )
      return reply.code(403).send({ error: 'Forbidden' });
    return reply.type(registry.contentType).send(await registry.metrics());
  });
}
