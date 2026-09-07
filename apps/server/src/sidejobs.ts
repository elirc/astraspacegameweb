import { Queue, Worker } from 'bullmq';
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { pool, transaction } from '../../../packages/db';
import type { FastifyInstance } from 'fastify';
import { redis } from './redis';
export async function maintenance() {
  await transaction(async (tx) => {
    await tx.query('DELETE FROM rate_buckets WHERE expires_at<now()');
    await tx.query("DELETE FROM session_families WHERE expires_at<now()-interval '1 day'");
    await tx.query("DELETE FROM password_resets WHERE expires_at<now()-interval '1 day'");
    await tx.query("DELETE FROM idempotency_keys WHERE created_at<now()-interval '7 days'");
    await tx.query("DELETE FROM side_effects WHERE delivered_at<now()-interval '30 days'");
    await tx.query(
      "INSERT INTO abuse_flags(player_id,kind,window_start,evidence) SELECT actor,'high-command-volume',date_trunc('hour',created_at),jsonb_build_object('commands',count(*)) FROM audit_log WHERE created_at>now()-interval '2 hours' AND actor IS NOT NULL GROUP BY actor,date_trunc('hour',created_at) HAVING count(*)>600 ON CONFLICT DO NOTHING",
    );
    await tx.query(
      "INSERT INTO abuse_flags(player_id,kind,window_start,evidence) SELECT actor,'regular-command-timing',date_trunc('hour',created_at),jsonb_build_object('samples',count(*),'stddevSeconds',stddev(delta)) FROM (SELECT actor,created_at,extract(epoch FROM created_at-lag(created_at) OVER(PARTITION BY actor ORDER BY created_at)) AS delta FROM audit_log WHERE created_at>now()-interval '2 hours' AND action='movement') s GROUP BY actor,date_trunc('hour',created_at) HAVING count(*)>=30 AND avg(delta)>1 AND stddev(delta)<0.05 ON CONFLICT DO NOTHING",
    );
  });
}
export function startSidejobs(app: FastifyInstance) {
  const url = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:56379');
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
  const queue = new Queue('warband-sidejobs', {
    connection: { ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false },
  });
  const smtp = new URL(process.env.SMTP_URL || 'smtp://127.0.0.1:51025');
  const mail = nodemailer.createTransport({
    host: smtp.hostname,
    port: Number(smtp.port || (smtp.protocol === 'smtps:' ? 465 : 25)),
    secure: smtp.protocol === 'smtps:',
    auth: smtp.username
      ? { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.invalid',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  const worker = new Worker(
    'warband-sidejobs',
    async (job) => {
      if (job.name === 'maintenance') return maintenance();
      if (job.name === 'rankings') {
        const rows = (
          await pool.query(
            'SELECT p.id,p.name,count(v.id)::int AS villages,coalesce(sum(v.points),0)::int AS points FROM players p LEFT JOIN villages v ON v.player_id=p.id GROUP BY p.id ORDER BY points DESC,p.id',
          )
        ).rows;
        if (redis.isReady) await redis.set('wb:rankings', JSON.stringify(rows), { EX: 120 });
        return;
      }
      return transaction(async (tx) => {
        const row = (
          await tx.query(
            'SELECT * FROM side_effects WHERE id=$1 AND delivered_at IS NULL FOR UPDATE',
            [job.data.id],
          )
        ).rows[0];
        if (!row) return;
        if (row.kind === 'email')
          await mail.sendMail({
            from: process.env.MAIL_FROM || 'Warband <noreply@warband.test>',
            ...row.payload,
          });
        if (row.kind === 'push') {
          if (!process.env.VAPID_PRIVATE_KEY)
            throw new Error('VAPID keys are required for push delivery');
          const subscriptions = (
            await tx.query('SELECT * FROM push_subscriptions WHERE player_id=$1', [
              row.payload.player,
            ])
          ).rows;
          for (const sub of subscriptions)
            try {
              await webpush.sendNotification(
                sub.subscription,
                JSON.stringify(row.payload.notification),
                { TTL: 3600, timeout: 10000 },
              );
            } catch (e: any) {
              if ([404, 410].includes(e.statusCode))
                await tx.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [sub.endpoint]);
              else throw e;
            }
        }
        await tx.query('UPDATE side_effects SET delivered_at=now() WHERE id=$1', [row.id]);
      });
    },
    { connection, concurrency: 4 },
  );
  queue.on('error', (e) => app.log.warn({ message: e.message }, 'Side-job queue disconnected'));
  worker.on('error', (e) => app.log.warn({ message: e.message }, 'Side-job worker disconnected'));
  worker.on('failed', (job, e) =>
    app.log.warn({ job: job?.id, message: e.message }, 'Side job will retry'),
  );
  let running: Promise<void> | undefined;
  async function dispatch() {
    if (!redis.isReady) return;
    await queue.upsertJobScheduler(
      'maintenance',
      { every: 60000 },
      { name: 'maintenance', data: {}, opts: { removeOnComplete: 20, removeOnFail: 20 } },
    );
    await queue.upsertJobScheduler(
      'rankings',
      { every: 30000 },
      { name: 'rankings', data: {}, opts: { removeOnComplete: 10, removeOnFail: 10 } },
    );
    const rows = (
      await pool.query(
        'SELECT id,kind FROM side_effects WHERE delivered_at IS NULL ORDER BY id LIMIT 200',
      )
    ).rows;
    for (const row of rows) {
      const id = `effect-${row.id}`;
      const prior = await queue.getJob(id);
      if (prior && (await prior.getState()) === 'failed') await prior.retry();
      else
        await queue.add(
          'deliver',
          { id: row.id },
          {
            jobId: id,
            attempts: 8,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 1000,
            removeOnFail: 1000,
          },
        );
    }
  }
  const timer = setInterval(() => {
    if (!running)
      running = dispatch()
        .catch((e) => app.log.warn(e))
        .finally(() => {
          running = undefined;
        });
  }, 5000);
  return async () => {
    clearInterval(timer);
    await running;
    const deadline = setTimeout(() => {
      void worker.disconnect();
      void queue.disconnect();
    }, 20000);
    try {
      await worker.close();
      await queue.close();
    } finally {
      clearTimeout(deadline);
      mail.close();
    }
  };
}
