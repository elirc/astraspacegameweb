import { z } from 'zod';
import { createHash } from 'node:crypto';
import { database, transaction, worldLock, config } from '../../../../packages/db';
import { command, fail, notify } from './engine';
import { battle } from '../../../../packages/shared/game';
const id = (v: unknown) => z.coerce.number().int().positive().parse(v);
export const inboxQuery = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  kind: z.string().max(30).optional(),
  unread: z.enum(['true', 'false']).default('false'),
  archived: z.enum(['true', 'false']).default('false'),
});
export function createExtendedUseCases(state: (req: any, reply: any) => any) {
  return {
    state,
    get_api_villages_id: async (req: any, reply: any) => {
      const data = await state(req, reply),
        village = data.villages.find((v: any) => v.id === id((req.params as any).id));
      if (!village) fail('Village not found', 404);
      return { ...data, village };
    },
    commandAlias: (action: string) => async (req: any) => {
      const body = req.body as any;
      const input = {
        ...body,
        action,
        ...(body?.queueId ? { eventId: body.queueId } : {}),
        ...(body?.targetVillageId ? { targetId: body.targetVillageId } : {}),
        ...(body?.ownerVillageId ? { targetId: body.ownerVillageId } : {}),
      };
      // Outer request idempotency covers these aliases; use a separate stable command key.
      return command(
        req.playerId,
        id((req.params as any).id),
        input,
        'cmd:' + createHash('sha256').update(String(req.headers['idempotency-key'])).digest('hex'),
      );
    },
    post_api_movements_id_cancel: async (req: any) => {
      const eventId = id((req.params as any).id),
        ev = (await database.query('SELECT payload FROM scheduled_events WHERE id=$1', [eventId]))
          .rows[0];
      if (!ev || ev.payload.owner !== req.playerId) fail('Movement not found', 404);
      return command(
        req.playerId,
        ev.payload.origin,
        { action: 'cancelMovement', eventId },
        'cmd:' + createHash('sha256').update(String(req.headers['idempotency-key'])).digest('hex'),
      );
    },
    get_api_map_village_id: async (req: any) => {
      const row = (
        await database.query(
          'SELECT v.id,v.x,v.y,v.name,v.points,v.player_id,p.name AS player_name,p.tribe_id,t.tag AS tribe_tag FROM villages v LEFT JOIN players p ON p.id=v.player_id LEFT JOIN tribes t ON t.id=p.tribe_id WHERE v.id=$1',
          [id((req.params as any).id)],
        )
      ).rows[0];
      if (!row) fail('Village not found', 404);
      return { village: row };
    },
    get_api_reports_id: async (req: any) => {
      const report = (
        await database.query('SELECT * FROM reports WHERE id=$1 AND player_id=$2', [
          id((req.params as any).id),
          req.playerId,
        ])
      ).rows[0];
      if (!report) fail('Report not found', 404);
      return { report };
    },
    post_api_reports_bulk: async (req: any) => {
      const input = z
        .object({
          ids: z.array(z.number().int().positive()).min(1).max(100),
          action: z.enum(['read', 'archive', 'restore']),
        })
        .parse(req.body);
      const result =
        input.action === 'read'
          ? await database.query(
              'UPDATE reports SET read=true WHERE player_id=$1 AND id=ANY($2::bigint[])',
              [req.playerId, input.ids],
            )
          : await database.query(
              'UPDATE reports SET archived=$3 WHERE player_id=$1 AND id=ANY($2::bigint[])',
              [req.playerId, input.ids, input.action === 'archive'],
            );
      return { ok: true, updated: result.rowCount };
    },
    post_api_messages_id_read: async (req: any) => {
      await database.query('UPDATE messages SET read=true WHERE id=$1 AND recipient_id=$2', [
        id((req.params as any).id),
        req.playerId,
      ]);
      return { ok: true };
    },
    post_api_messages_bulk: async (req: any) => {
      const input = z
        .object({
          ids: z.array(z.number().int().positive()).min(1).max(100),
          action: z.enum(['read', 'archive', 'restore']),
        })
        .parse(req.body);
      if (input.action === 'read')
        await database.query(
          'UPDATE messages SET read=true WHERE recipient_id=$1 AND id=ANY($2::bigint[])',
          [req.playerId, input.ids],
        );
      if (input.action === 'archive')
        await database.query(
          'INSERT INTO message_archive(player_id,message_id) SELECT $1,id FROM messages WHERE (sender_id=$1 OR recipient_id=$1) AND id=ANY($2::bigint[]) ON CONFLICT DO NOTHING',
          [req.playerId, input.ids],
        );
      if (input.action === 'restore')
        await database.query(
          'DELETE FROM message_archive WHERE player_id=$1 AND message_id=ANY($2::bigint[])',
          [req.playerId, input.ids],
        );
      return { ok: true };
    },
    get_api_sim_battle: async (req: any) => {
      const q = z
        .object({
          attacker: z.string().max(2000),
          defender: z.string().max(2000),
          wall: z.coerce.number().int().min(0).max(100).default(0),
          seed: z.coerce.number().int().default(7139),
          morale: z.coerce.number().min(0.01).max(1).default(1),
        })
        .parse(req.query);
      let a: any, d: any;
      try {
        a = JSON.parse(q.attacker);
        d = JSON.parse(q.defender);
      } catch {
        fail('Armies must be JSON objects');
      }
      const cfg = await transaction(config);
      const army = z
        .record(z.string(), z.number().int().min(0).max(1000000))
        .refine(
          (value) => Object.keys(value).every((key) => Object.hasOwn(cfg.units, key)),
          'Unknown unit',
        );
      const attacker = army
        .refine(
          (value) => Object.values(value).some((n) => n > 0),
          'Choose at least one attacking unit',
        )
        .parse(a);
      return {
        battle: battle(attacker, army.parse(d), q.wall, q.seed, q.morale, cfg),
      };
    },
    get_api_tribes_members: async (req: any) => ({
      members: (
        await database.query(
          'SELECT p.id,p.name,p.role,p.tribe_id FROM players p JOIN players me ON me.tribe_id=p.tribe_id WHERE me.id=$1 ORDER BY p.role,p.name',
          [req.playerId],
        )
      ).rows,
      invitations: (
        await database.query(
          'SELECT i.*,t.name,t.tag FROM tribe_invitations i JOIN tribes t ON t.id=i.tribe_id WHERE i.player_id=$1',
          [req.playerId],
        )
      ).rows,
    }),
    post_api_tribes_members: async (req: any) => {
      const input = z
        .object({
          action: z.enum(['invite', 'kick', 'promote', 'demote', 'transfer', 'open']),
          playerId: z.number().int().positive().optional(),
          open: z.boolean().optional(),
        })
        .parse(req.body);
      return transaction(async (tx) => {
        await worldLock(tx);
        const me = (await tx.query('SELECT * FROM players WHERE id=$1 FOR UPDATE', [req.playerId]))
          .rows[0];
        if (!me.tribe_id || !['founder', 'officer'].includes(me.role))
          fail('Tribe leadership required', 403);
        if (!['invite', 'kick'].includes(input.action) && me.role !== 'founder')
          fail('Only the founder can change leadership or joining rules', 403);
        if (input.action === 'open') {
          if (input.open === undefined) fail('Choose a joining rule');
          await tx.query('UPDATE tribes SET open_join=$1 WHERE id=$2', [input.open, me.tribe_id]);
          return { ok: true };
        }
        if (!input.playerId || input.playerId === req.playerId) fail('Choose another player');
        const target = (
          await tx.query('SELECT * FROM players WHERE id=$1 FOR UPDATE', [input.playerId])
        ).rows[0];
        if (!target) fail('Player not found', 404);
        if (input.action === 'invite') {
          if (target.tribe_id) fail('This player already belongs to a tribe');
          await tx.query(
            'INSERT INTO tribe_invitations(tribe_id,player_id,invited_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [me.tribe_id, target.id, me.id],
          );
        } else {
          if (
            target.tribe_id !== me.tribe_id ||
            target.role === 'founder' ||
            (me.role === 'officer' && target.role === 'officer')
          )
            fail('You cannot change this member', 403);
          if (input.action === 'kick')
            await tx.query("UPDATE players SET tribe_id=null,role='member' WHERE id=$1", [
              target.id,
            ]);
          else if (input.action === 'transfer') {
            await tx.query("UPDATE players SET role='officer' WHERE id=$1", [me.id]);
            await tx.query("UPDATE players SET role='founder' WHERE id=$1", [target.id]);
            await tx.query('UPDATE tribes SET founder_id=$1 WHERE id=$2', [target.id, me.tribe_id]);
          } else
            await tx.query('UPDATE players SET role=$1 WHERE id=$2', [
              input.action === 'promote' ? 'officer' : 'member',
              target.id,
            ]);
        }
        await notify(tx, target.id, 'tribe_event');
        await notify(tx, me.id, 'tribe_event');
        return { ok: true };
      });
    },
    get_api_push_key: async () => ({ publicKey: process.env.VAPID_PUBLIC_KEY || null }),
    post_api_push_subscribe: async (req: any) => {
      const subscription = z
        .object({
          endpoint: z.url().max(2048),
          expirationTime: z.number().nullable().optional(),
          keys: z.object({
            p256dh: z.string().min(16).max(512),
            auth: z.string().min(16).max(512),
          }),
        })
        .parse(req.body);
      const url = new URL(subscription.endpoint);
      const allowed = [
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com',
        'web.push.apple.com',
        ...(process.env.PUSH_ALLOWED_HOSTS || '').split(',').filter(Boolean),
      ];
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        !allowed.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))
      )
        fail('Unsupported browser push endpoint');
      if (!process.env.VAPID_PUBLIC_KEY)
        fail('Push notifications are not configured on this server', 503);
      await database.query(
        'INSERT INTO push_subscriptions(endpoint,player_id,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET player_id=$2,subscription=$3',
        [subscription.endpoint, req.playerId, JSON.stringify(subscription)],
      );
      return { ok: true };
    },
    post_api_push_unsubscribe: async (req: any) => {
      const { endpoint } = z.object({ endpoint: z.string().max(2048) }).parse(req.body);
      await database.query('DELETE FROM push_subscriptions WHERE player_id=$1 AND endpoint=$2', [
        req.playerId,
        endpoint,
      ]);
      return { ok: true };
    },
  };
}
