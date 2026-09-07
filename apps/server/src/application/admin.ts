import { exportTimeline, replayTimeline } from './replay';
import { z } from 'zod';
import {
  database,
  pool,
  transaction,
  worldLock,
  withVillageLock,
  saveVillage,
  dbNow,
  config,
  type Village,
} from '../../../../packages/db';
import {
  advance,
  worldSchema,
  buildingCost,
  battle,
  capacity,
  resources,
} from '../../../../packages/shared/game';
import { drain, fail, notify, event, replayEvent, type Event } from './engine';
const id = (v: unknown) => z.coerce.number().int().positive().parse(v);
const reasonSchema = z.string().trim().min(10).max(1000);
async function audit(tx: any, actor: number, action: string, entity: number, detail: any) {
  await tx.query(
    'INSERT INTO audit_log(world_id,actor,action,entity,detail) VALUES(1,$1,$2,$3,$4)',
    [actor, action, entity, JSON.stringify(detail)],
  );
}
export function createAdminUseCases() {
  return {
    addHook_preHandler: async (req: any) => {
      if (req.url.startsWith('/api/admin') && !req.isAdmin)
        fail('Administrator access required', 403);
    },
    get_api_admin_config: async () => ({
      config: await transaction(config),
      versions: (
        await database.query(
          'SELECT version,effective_at,actor FROM config_versions WHERE world_id=1 ORDER BY version DESC',
        )
      ).rows,
    }),
    post_api_admin_config: async (req: any) => {
      const input = z
        .object({ config: worldSchema, dryRun: z.boolean().default(true), reason: reasonSchema })
        .parse(req.body);
      return transaction(async (tx) => {
        await worldLock(tx);
        const old = await config(tx),
          next = input.config;
        if (next.version !== old.version + 1)
          fail('Version must be exactly ' + (old.version + 1), 409);
        for (const [key, unit] of Object.entries(old.units)) {
          if (!next.units[key]) fail('Existing unit types cannot be removed: ' + key);
          if (next.units[key]!.population !== unit.population)
            fail('Population changes require a migration of existing army reservations: ' + key);
        }
        for (const [key, b] of Object.entries(old.buildings)) {
          if (!next.buildings[key]) fail('Existing building types cannot be removed: ' + key);
          if (next.buildings[key]!.population !== b.population)
            fail('Population changes require a reservation migration: ' + key);
          if (
            (
              await tx.query(
                "SELECT id FROM villages WHERE (state->'buildings'->>$1)::int>$2 LIMIT 1",
                [key, next.buildings[key]!.max],
              )
            ).rowCount
          )
            fail('Existing levels exceed the new maximum for ' + key);
        }
        if (
          (
            await tx.query('SELECT 1 FROM villages WHERE x >= $1 OR y >= $1 LIMIT 1', [
              next.map.size,
            ])
          ).rowCount
        )
          fail('The map cannot shrink past existing villages');
        const changed = Object.keys(next).filter(
          (k) => JSON.stringify((old as any)[k]) !== JSON.stringify((next as any)[k]),
        );
        const preview = {
          valid: true,
          changed,
          example: {
            timberLevel6: buildingCost('wood', 5, next),
            battle: battle({ axe: 100 }, { spear: 100 }, 2, 7139, 1, next),
          },
        };
        if (input.dryRun) return { ...preview, dryRun: true };
        const at = await dbNow(tx);
        await drain(tx, at);
        // Establish a resource anchor at the version boundary before new rates take effect.
        const villages = (await tx.query<Village>('SELECT * FROM villages ORDER BY id')).rows;
        for (const row of villages) {
          const v = await withVillageLock(tx, row.id);
          advance(v.state, at, old);
          for (const resource of resources)
            v.state.resources[resource] = Math.min(
              v.state.resources[resource],
              capacity(v.state.buildings.storage || 0, next),
            );
          await saveVillage(tx, v);
        }
        await tx.query(
          'INSERT INTO config_versions(world_id,version,config,effective_at,actor) VALUES(1,$1,$2,$3,$4)',
          [next.version, JSON.stringify(next), new Date(at), req.playerId],
        );
        await tx.query('UPDATE worlds SET config=$1,name=$2 WHERE id=1', [
          JSON.stringify(next),
          next.name,
        ]);
        await audit(tx, req.playerId, 'admin.config', 1, {
          reason: input.reason,
          version: next.version,
          changed,
        });
        await tx.query(
          "INSERT INTO outbox(player_id,type,payload) SELECT id,'config_changed',jsonb_build_object('version',$1::int) FROM players",
          [next.version],
        );
        return { ...preview, dryRun: false };
      });
    },
    get_api_admin_players: async (req: any) => {
      const q = z
        .object({
          q: z.string().max(100).default(''),
          cursor: z.coerce.number().int().nonnegative().default(0),
        })
        .parse(req.query);
      return {
        players: (
          await database.query(
            'SELECT p.*,u.email,EXISTS(SELECT 1 FROM npc_players n WHERE n.player_id=p.id) AS is_npc,count(v.id)::int AS villages FROM players p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN villages v ON v.player_id=p.id WHERE p.id>$1 AND (p.name ILIKE $2 OR u.email ILIKE $2) GROUP BY p.id,u.email ORDER BY p.id LIMIT 100',
            [q.cursor, '%' + q.q + '%'],
          )
        ).rows,
      };
    },
    post_api_admin_players_id_moderate: async (req: any) => {
      const player = id((req.params as any).id),
        input = z
          .object({
            action: z.enum(['ban', 'unban', 'strip']),
            reason: reasonSchema,
            days: z.number().int().min(1).max(36500).default(30),
          })
          .parse(req.body);
      if (player === req.playerId) fail('Use another administrator for actions on your account');
      return transaction(async (tx) => {
        await worldLock(tx);
        await drain(tx, await dbNow(tx));
        if (!(await tx.query('SELECT id FROM players WHERE id=$1 FOR UPDATE', [player])).rowCount)
          fail('Player not found', 404);
        if (input.action === 'unban')
          await tx.query('UPDATE players SET banned_until=null,ban_reason=null WHERE id=$1', [
            player,
          ]);
        else {
          await tx.query(
            "UPDATE players SET banned_until=now()+$2*interval '1 day',ban_reason=$3 WHERE id=$1",
            [player, input.days, input.reason],
          );
          await tx.query('UPDATE session_families SET revoked_at=now() WHERE player_id=$1', [
            player,
          ]);
        }
        if (input.action === 'strip') {
          const stations = (
            await tx.query(
              'SELECT DISTINCT station_id FROM support_links WHERE player_id=$1 ORDER BY station_id',
              [player],
            )
          ).rows;
          for (const station of stations) {
            const v = await withVillageLock(tx, station.station_id);
            for (const [home, stack] of Object.entries(v.state.garrison))
              if (stack.owner === player) delete v.state.garrison[home];
            await saveVillage(tx, v);
            await notify(tx, v.player_id, 'village_changed');
          }
          const rows = (
            await tx.query('SELECT id FROM villages WHERE player_id=$1 ORDER BY id', [player])
          ).rows;
          for (const row of rows) {
            const v = await withVillageLock(tx, row.id);
            v.player_id = null;
            v.state.units = {};
            v.state.reservedPopulation = 0;
            v.state.merchantsAway = 0;
            await saveVillage(tx, v);
            await tx.query(
              "UPDATE scheduled_events SET status='cancelled' WHERE village_id=$1 AND kind IN ('build','recruit') AND status='pending'",
              [v.id],
            );
          }
          await tx.query(
            "UPDATE scheduled_events SET status='cancelled' WHERE status='pending' AND (payload->>'owner')::bigint=$1",
            [player],
          );
        }
        await audit(tx, req.playerId, 'admin.' + input.action, player, input);
        await notify(tx, player, 'session_revoked');
        return { ok: true };
      });
    },
    get_api_admin_audit: async (req: any) => {
      const q = z
        .object({
          actor: z.coerce.number().int().positive().optional(),
          action: z.string().max(80).default(''),
          cursor: z.coerce.number().int().positive().optional(),
        })
        .parse(req.query);
      return {
        entries: (
          await database.query(
            'SELECT * FROM audit_log WHERE ($1::bigint IS NULL OR actor=$1) AND action LIKE $2 AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT 100',
            [q.actor ?? null, q.action + '%', q.cursor ?? null],
          )
        ).rows,
      };
    },
    get_api_admin_events: async (req: any) => {
      const q = z
        .object({
          villageId: z.coerce.number().int().positive(),
          cursor: z.coerce.number().int().nonnegative().default(0),
        })
        .parse(req.query);
      return {
        events: (
          await database.query(
            'SELECT e.*,j.event_id IS NOT NULL AS replayable FROM scheduled_events e LEFT JOIN event_journal j ON j.event_id=e.id WHERE e.village_id=$1 AND e.id>$2 ORDER BY e.id LIMIT 100',
            [q.villageId, q.cursor],
          )
        ).rows,
      };
    },
    post_api_admin_replay: async (req: any) => {
      const input = z
        .object({
          villageId: z.number().int().positive(),
          from: z.iso.datetime(),
          to: z.iso.datetime(),
        })
        .parse(req.body);
      const bundle = await exportTimeline(pool, {
        villageId: input.villageId,
        from: Date.parse(input.from),
        to: Date.parse(input.to),
      });
      return replayTimeline(bundle, pool);
    },
    post_api_admin_events_id_replay: async (req: any) => {
      const eventId = id((req.params as any).id);
      const ev = (
        await database.query<Event>('SELECT * FROM scheduled_events WHERE id=$1', [eventId])
      ).rows[0];
      const journal = (
        await database.query('SELECT * FROM event_journal WHERE event_id=$1', [eventId])
      ).rows[0];
      if (!ev || !journal) fail('This event predates replay recording or has not resolved', 404);
      const pinned = (
        await database.query('SELECT config FROM config_versions WHERE world_id=1 AND version=$1', [
          ev.config_version,
        ])
      ).rows[0];
      const cfg = worldSchema.parse(ev.payload.config || pinned?.config);
      const accrual = (
        await database.query('SELECT config FROM config_versions WHERE world_id=1 AND version=$1', [
          journal.context.accrualVersion,
        ])
      ).rows[0];
      return replayEvent(ev, journal, cfg, accrual ? worldSchema.parse(accrual.config) : cfg);
    },
    post_api_admin_movements_cancel: async (req: any) => {
      const input = z
        .object({ ids: z.array(z.number().int().positive()).min(1).max(500), reason: reasonSchema })
        .parse(req.body);
      return transaction(async (tx) => {
        await worldLock(tx);
        const now = await dbNow(tx);
        await drain(tx, now);
        const cfg = await config(tx);
        const rows = (
          await tx.query<Event>(
            "SELECT * FROM scheduled_events WHERE id=ANY($1::bigint[]) AND kind='movement' AND status='pending' ORDER BY id FOR UPDATE",
            [input.ids],
          )
        ).rows;
        for (const e of rows) {
          await tx.query("UPDATE scheduled_events SET status='cancelled' WHERE id=$1", [e.id]);
          await event(
            tx,
            e.payload.origin,
            'return',
            now + Math.max(1000, now - e.payload.sent),
            { owner: e.payload.owner, units: e.payload.units, reserved: e.payload.reserved },
            worldSchema.parse(e.payload.config || cfg),
          );
        }
        await audit(tx, req.playerId, 'admin.cancelMovements', 1, {
          ...input,
          cancelled: rows.map((e) => e.id),
        });
        return { ok: true, cancelled: rows.length };
      });
    },
    get_api_admin_abuse: async () => ({
      flags: (
        await database.query(
          "SELECT a.*,p.name FROM abuse_flags a JOIN players p ON p.id=a.player_id WHERE status='open' ORDER BY a.id DESC LIMIT 100",
        )
      ).rows,
    }),
    post_api_admin_abuse_id: async (req: any) => {
      const input = z
          .object({ status: z.enum(['dismissed', 'actioned']), reason: reasonSchema })
          .parse(req.body),
        flag = id((req.params as any).id);
      await transaction(async (tx) => {
        await tx.query('UPDATE abuse_flags SET status=$1 WHERE id=$2', [input.status, flag]);
        await audit(tx, req.playerId, 'admin.abuseReview', flag, input);
      });
      return { ok: true };
    },
  };
}
