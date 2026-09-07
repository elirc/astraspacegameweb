import type { RequestPort, ReplyPort } from './ports';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash, verify } from 'argon2';
import { z } from 'zod';
import { database, orm, transaction, worldLock, type Tx } from '../../../../packages/db';
import { fail } from './engine';
import { users, players } from '../../../../packages/db/schema';
import { eq } from 'drizzle-orm';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const options = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api',
};
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
  name: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[\p{L}\p{N} _-]+$/u)
    .optional(),
});
export async function authenticate(req: RequestPort) {
  await req.jwtVerify();
  const claims = req.user as any;
  const row = (
    await database.query(
      'SELECT s.*,p.banned_until,coalesce(u.is_admin,false) AS is_admin FROM session_families s JOIN players p ON p.id=s.player_id LEFT JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.revoked_at IS NULL AND s.expires_at>now()',
      [claims.sid],
    )
  ).rows[0];
  if (
    !row ||
    row.player_id !== claims.playerId ||
    (row.banned_until && new Date(row.banned_until).getTime() > Date.now())
  )
    fail('Please sign in to your world', 401);
  req.playerId = row.player_id;
  req.userId = row.user_id;
  req.isAdmin = row.is_admin;
  req.sessionId = row.id;
}
export function createAuthUseCases(
  app: { jwt: { sign: (payload: any, options: any) => string } },
  spawn: (tx: Tx, name: string, userId: number | null) => Promise<number>,
) {
  function cookies(reply: ReplyPort, family: any, token: string) {
    reply.setCookie(
      'wb_access',
      app.jwt.sign(
        { playerId: family.player_id, userId: family.user_id, sid: family.id },
        { expiresIn: '15m' },
      ),
      { ...options, maxAge: 900 },
    );
    reply.setCookie('wb_refresh', token, { ...options, maxAge: 2592000 });
    return { ok: true, playerId: family.player_id, server_now: Date.now() };
  }
  async function session(reply: ReplyPort, playerId: number, userId: number | null) {
    const token = randomBytes(32).toString('hex');
    const family = await transaction(async (tx) => {
      const f = (
        await tx.query(
          "INSERT INTO session_families(id,player_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '30 days') RETURNING *",
          [randomUUID(), playerId, userId],
        )
      ).rows[0];
      await tx.query('INSERT INTO session_tokens(token_hash,family_id) VALUES($1,$2)', [
        digest(token),
        f.id,
      ]);
      return f;
    });
    return cookies(reply, family, token);
  }
  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  return {
    post_api_auth_guest: async (_req: any, reply: any) =>
      session(
        reply,
        await transaction((tx) => spawn(tx, 'Wanderer ' + randomBytes(3).toString('hex'), null)),
        null,
      ),
    post_api_auth_register: async (req: any, reply: any) => {
      const input = credentials.parse(req.body);
      if (!input.name) fail('Choose a player name');
      const password = await hash(input.password);
      let guest: number | null = null;
      try {
        await authenticate(req);
        if (!req.userId) guest = req.playerId;
      } catch {}
      const result = await transaction(async (tx) => {
        await worldLock(tx);
        const user = (
          await tx.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id', [
            input.email,
            password,
          ])
        ).rows[0].id;
        if (guest) {
          if (
            !(
              await tx.query(
                'UPDATE players SET user_id=$1,name=$2 WHERE id=$3 AND user_id IS NULL RETURNING id',
                [user, input.name, guest],
              )
            ).rowCount
          )
            fail('This guest was already saved', 409);
          await tx.query('UPDATE session_families SET revoked_at=now() WHERE player_id=$1', [
            guest,
          ]);
          return { player: guest, user };
        }
        return { player: await spawn(tx, input.name!, user), user };
      });
      return session(reply, result.player, result.user);
    },
    post_api_auth_login: async (req: any, reply: any) => {
      const input = credentials.parse(req.body);
      const user = (
        await orm()
          .select({
            id: users.id,
            password_hash: users.passwordHash,
            player: players.id,
            banned_until: players.bannedUntil,
          })
          .from(users)
          .innerJoin(players, eq(players.userId, users.id))
          .where(eq(users.email, input.email))
      )[0];
      if (
        !user ||
        !(await verify(user.password_hash, input.password)) ||
        (user.banned_until && new Date(user.banned_until).getTime() > Date.now())
      )
        fail('Email or password is incorrect', 401);
      return session(reply, user.player, user.id);
    },
    post_api_auth_refresh: async (req: any, reply: any) => {
      const raw = req.cookies.wb_refresh;
      if (!raw) fail('Please sign in again', 401);
      const token = randomBytes(32).toString('hex');
      const result = await transaction(async (tx) => {
        const s = (
          await tx.query(
            'SELECT t.consumed_at,s.*,p.banned_until FROM session_tokens t JOIN session_families s ON s.id=t.family_id JOIN players p ON p.id=s.player_id WHERE token_hash=$1 FOR UPDATE OF s,t',
            [digest(raw!)],
          )
        ).rows[0];
        if (!s) return null;
        if (s.consumed_at) {
          await tx.query('UPDATE session_families SET revoked_at=now() WHERE id=$1', [s.id]);
          return null;
        }
        if (
          s.revoked_at ||
          new Date(s.expires_at).getTime() <= Date.now() ||
          (s.banned_until && new Date(s.banned_until).getTime() > Date.now())
        )
          return null;
        await tx.query('UPDATE session_tokens SET consumed_at=now() WHERE token_hash=$1', [
          digest(raw!),
        ]);
        await tx.query('INSERT INTO session_tokens(token_hash,family_id) VALUES($1,$2)', [
          digest(token),
          s.id,
        ]);
        return s;
      });
      if (!result) fail('Please sign in again', 401);
      return cookies(reply, result, token);
    },
    post_api_auth_logout: async (req: any, reply: any) => {
      if (req.cookies.wb_refresh)
        await database.query(
          'UPDATE session_families SET revoked_at=now() WHERE id IN (SELECT family_id FROM session_tokens WHERE token_hash=$1)',
          [digest(req.cookies.wb_refresh)],
        );
      reply.clearCookie('wb_access', options);
      reply.clearCookie('wb_refresh', options);
      return { ok: true };
    },
    post_api_auth_forgot: async (req: any) => {
      const { email } = z.object({ email: z.email().max(254) }).parse(req.body);
      await transaction(async (tx) => {
        const user = (await tx.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]))
          .rows[0];
        if (!user) return;
        const token = randomBytes(32).toString('hex');
        await tx.query(
          "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
          [digest(token), user.id],
        );
        await tx.query("INSERT INTO side_effects(kind,payload) VALUES('email',$1)", [
          JSON.stringify({
            to: email,
            subject: 'Reset your Warband password',
            text: `Open ${process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:3001'}/?reset=${token} to choose a new password. This link expires in 30 minutes.`,
          }),
        ]);
      });
      return { ok: true, message: 'If an account exists, a reset link will be sent.' };
    },
    post_api_auth_reset: async (req: any) => {
      const input = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          password: z.string().min(10).max(128),
        })
        .parse(req.body);
      const password = await hash(input.password);
      await transaction(async (tx) => {
        const reset = (
          await tx.query(
            'UPDATE password_resets SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING user_id',
            [digest(input.token)],
          )
        ).rows[0];
        if (!reset) fail('Reset link is invalid or expired');
        await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2', [password, reset.user_id]);
        await tx.query('UPDATE session_families SET revoked_at=now() WHERE user_id=$1', [
          reset.user_id,
        ]);
        await tx.query('UPDATE password_resets SET consumed_at=now() WHERE user_id=$1', [
          reset.user_id,
        ]);
      });
      return { ok: true };
    },
  };
}
