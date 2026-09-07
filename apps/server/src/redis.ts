import { createClient } from 'redis';
import { database } from '../../../packages/db';
export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:56379',
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 1000,
    reconnectStrategy: (retries) => Math.min(5000, 250 * (retries + 1)),
  },
});
redis.on('error', () => {});
export function connectRedis() {
  if (!redis.isOpen) void redis.connect().catch(() => {});
}
export async function takeLimit(key: string, max: number, windowMs: number) {
  const bucket = Math.floor(Date.now() / windowMs),
    name = `wb:limit:${key}:${bucket}`;
  if (redis.isReady)
    try {
      const count = await redis.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n",
        { keys: [name], arguments: [String(windowMs)] },
      );
      return Number(count) <= max;
    } catch {}
  // Redis loss must not remove abuse controls or stop the authoritative engine.
  const row = (
    await database.query(
      "INSERT INTO rate_buckets(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 millisecond') ON CONFLICT(key) DO UPDATE SET hits=rate_buckets.hits+1 RETURNING hits",
      [name, windowMs],
    )
  ).rows[0];
  return row.hits <= max;
}
export async function cached<T>(key: string, seconds: number, fetch: () => Promise<T>): Promise<T> {
  if (redis.isReady)
    try {
      const value = await redis.get(key);
      if (value) return JSON.parse(value);
    } catch {}
  const result = await fetch();
  if (redis.isReady) void redis.set(key, JSON.stringify(result), { EX: seconds }).catch(() => {});
  return result;
}
