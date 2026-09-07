import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  config,
  database,
  saveVillage,
  transaction,
  worldLock,
  withVillageLock,
  type Tx,
  type Village,
} from '../../../../packages/db';
import { lockCausalComponent } from '../../../../packages/db/causality';
import { advance, commandSchemaFor, seededRandom } from '../../../../packages/shared/game';
import {
  chooseNpcAction,
  npcDelay,
  npcNames,
  npcSettingsSchema,
  npcVillageName,
  type NpcSettings,
} from '../../../../packages/shared/npc';
import { drain, execute, fail } from './engine';
import { spawn } from './game';

const reason = z.string().trim().min(10).max(1000);
const createSchema = z
  .object({ count: z.number().int().min(1).max(50), settings: npcSettingsSchema, reason })
  .strict();
const updateSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(100),
    settings: npcSettingsSchema,
    reason,
  })
  .strict();
const settingsOf = (row: any): NpcSettings => ({
  enabled: row.enabled,
  style: row.style,
  autoBuild: row.auto_build,
  minDelaySeconds: row.min_delay_seconds,
  maxDelaySeconds: row.max_delay_seconds,
  targetMode: row.target_mode,
});
async function audit(tx: Tx, actor: number, action: string, detail: unknown) {
  await tx.query(
    'INSERT INTO audit_log(world_id,actor,action,entity,detail) VALUES(1,$1,$2,1,$3)',
    [actor, action, JSON.stringify(detail)],
  );
}
export function createNpcUseCases() {
  return {
    list: async (req: any) => {
      const query = z
        .object({
          cursor: z.coerce.number().int().nonnegative().default(0),
          q: z.string().trim().max(100).default(''),
        })
        .parse(req.query);
      const rows = (
        await database.query(
          `SELECT n.*,p.name,p.banned_until,coalesce(s.points,0)::int AS points,
        (SELECT count(*)::int FROM villages v WHERE v.player_id=p.id) AS villages
        FROM npc_players n JOIN players p ON p.id=n.player_id LEFT JOIN player_scores s ON s.player_id=p.id
        WHERE p.world_id=1 AND n.player_id>$1 AND p.name ILIKE $2 ORDER BY n.player_id LIMIT 100`,
          [query.cursor, '%' + query.q + '%'],
        )
      ).rows;
      const totals = (
        await database.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE n.enabled)::int AS enabled,
        count(*) FILTER(WHERE n.enabled AND n.next_action_at<=now())::int AS due
        FROM npc_players n JOIN players p ON p.id=n.player_id WHERE p.world_id=1`)
      ).rows[0];
      return {
        npcs: rows.map((row) => ({ ...row, settings: settingsOf(row) })),
        totals,
        nextCursor: rows.length === 100 ? rows.at(-1).player_id : null,
      };
    },
    create: async (req: any) => {
      const input = createSchema.parse(req.body);
      return transaction(async (tx) => {
        await worldLock(tx);
        if (
          Number((await tx.query('SELECT count(*) AS n FROM npc_players')).rows[0].n) +
            input.count >
          1000
        )
          fail('This world supports up to 1,000 managed NPC accounts', 409);
        const seed = randomInt(1, 2147483647),
          random = seededRandom(seed);
        const used = new Set(
          (await tx.query('SELECT lower(name) AS name FROM players')).rows.map((p) => p.name),
        );
        const names = npcNames(seed)
          .filter((name) => !used.has(name.toLowerCase()))
          .slice(0, input.count);
        if (names.length !== input.count) fail('The NPC name pool is full', 409);
        const created = [];
        for (const name of names) {
          const player = await spawn(tx, name, null),
            botSeed = randomInt(1, 2147483647);
          const v = (await tx.query<Village>('SELECT * FROM villages WHERE player_id=$1', [player]))
            .rows[0]!;
          v.name = npcVillageName(botSeed);
          await saveVillage(tx, v);
          const s = input.settings;
          await tx.query(
            `INSERT INTO npc_players(player_id,enabled,style,auto_build,min_delay_seconds,max_delay_seconds,target_mode,seed,next_action_at,created_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()+$9*interval '1 second',$10)`,
            [
              player,
              s.enabled,
              s.style,
              s.autoBuild,
              s.minDelaySeconds,
              s.maxDelaySeconds,
              s.targetMode,
              botSeed,
              npcDelay(s, random),
              req.playerId,
            ],
          );
          created.push({ id: player, name, villageId: v.id, villageName: v.name });
        }
        await audit(tx, req.playerId, 'admin.npcs.create', {
          ...input,
          players: created.map((p) => p.id),
        });
        return { created };
      });
    },
    update: async (req: any) => {
      const input = updateSchema.parse(req.body),
        ids = [...new Set(input.ids)];
      return transaction(async (tx) => {
        const rows = (
          await tx.query(
            'SELECT * FROM npc_players WHERE player_id=ANY($1::bigint[]) ORDER BY player_id FOR UPDATE',
            [ids],
          )
        ).rows;
        if (rows.length !== ids.length) fail('Select existing NPC accounts only', 404);
        const s = input.settings;
        for (const row of rows) {
          const random = seededRandom(row.seed ^ (row.turn + 1));
          await tx.query(
            `UPDATE npc_players SET enabled=$2,style=$3,auto_build=$4,min_delay_seconds=$5,max_delay_seconds=$6,target_mode=$7,
            next_action_at=clock_timestamp()+$8*interval '1 second' WHERE player_id=$1`,
            [
              row.player_id,
              s.enabled,
              s.style,
              s.autoBuild,
              s.minDelaySeconds,
              s.maxDelaySeconds,
              s.targetMode,
              npcDelay(s, random),
            ],
          );
        }
        await audit(tx, req.playerId, 'admin.npcs.update', { ...input, ids });
        return { updated: ids.length };
      });
    },
    pauseAll: async (req: any) => {
      const input = z.object({ reason }).strict().parse(req.body);
      return transaction(async (tx) => {
        const result = await tx.query(
          'UPDATE npc_players SET enabled=false WHERE enabled RETURNING player_id',
        );
        await audit(tx, req.playerId, 'admin.npcs.pause', {
          reason: input.reason,
          count: result.rowCount,
        });
        return { paused: result.rowCount };
      });
    },
  };
}
async function targets(tx: Tx, village: Village, mode: string, fixed?: number) {
  // Public ownership and diplomacy only: NPC decisions never inspect hidden defender troops.
  return (
    await tx.query(
      `SELECT v.id FROM villages v LEFT JOIN players p ON p.id=v.player_id
    JOIN players owner ON owner.id=$1 WHERE v.world_id=1 AND v.id<>$2 AND v.player_id IS DISTINCT FROM $1
    AND ($3='rivals' OR v.player_id IS NULL) AND ($4::bigint IS NULL OR v.id=$4)
    AND (owner.tribe_id IS NULL OR p.tribe_id IS NULL OR (owner.tribe_id<>p.tribe_id AND NOT EXISTS(
      SELECT 1 FROM diplomacy d WHERE d.status IN ('ally','nap') AND
      ((d.tribe_a=owner.tribe_id AND d.tribe_b=p.tribe_id) OR (d.tribe_b=owner.tribe_id AND d.tribe_a=p.tribe_id)))))
    ORDER BY ((v.x-$5)^2+(v.y-$6)^2),v.id LIMIT 12`,
      [village.player_id, village.id, mode, fixed ?? null, village.x, village.y],
    )
  ).rows;
}
export async function runNpcTurn() {
  try {
    return await transaction(async (tx) => {
      // Take the world gate before the NPC row, matching admin/config lock ordering.
      await tx.query('SELECT pg_advisory_xact_lock_shared(7139,1)');
      const bot = (
        await tx.query(`SELECT n.* FROM npc_players n JOIN players p ON p.id=n.player_id
        WHERE n.enabled AND n.next_action_at<=clock_timestamp() AND p.world_id=1
        AND (p.banned_until IS NULL OR p.banned_until<=clock_timestamp())
        ORDER BY n.next_action_at,n.player_id LIMIT 1 FOR UPDATE OF n SKIP LOCKED`)
      ).rows[0];
      if (!bot) return false;
      const settings = settingsOf(bot),
        random = seededRandom(bot.seed ^ Math.imul(bot.turn + 1, 0x9e3779b9));
      const owned = (
        await tx.query<Village>('SELECT * FROM villages WHERE player_id=$1 ORDER BY id', [
          bot.player_id,
        ])
      ).rows;
      const initial = owned[bot.turn % Math.max(1, owned.length)];
      const candidates =
        initial && settings.style !== 'builder'
          ? await targets(tx, initial, settings.targetMode)
          : [];
      const target = candidates[Math.floor(random() * candidates.length)]?.id;
      const plan = await lockCausalComponent(
        tx,
        [...owned.map((v) => v.id), ...(target ? [target] : [])],
        undefined,
        bot.player_id,
      );
      await drain(tx, plan.until);
      const remaining = (
        await tx.query<Village>('SELECT * FROM villages WHERE player_id=$1 ORDER BY id', [
          bot.player_id,
        ])
      ).rows;
      if (!remaining.length) {
        await tx.query(
          'UPDATE npc_players SET enabled=false,last_action_at=clock_timestamp(),last_action=$2 WHERE player_id=$1',
          [bot.player_id, JSON.stringify({ action: 'defeated', message: 'No villages remaining' })],
        );
        return true;
      }
      const v = await withVillageLock(tx, remaining[bot.turn % remaining.length]!.id);
      const cfg = await config(tx);
      advance(v.state, plan.until, cfg);
      const pending = (
        await tx.query(
          "SELECT kind,payload FROM scheduled_events WHERE status='pending' AND (village_id=$1 OR (payload->>'origin')::bigint=$1)",
          [v.id],
        )
      ).rows;
      const validTarget = target && (await targets(tx, v, settings.targetMode, target))[0]?.id;
      const action = chooseNpcAction({
        settings,
        state: v.state,
        cfg,
        pending,
        playerId: bot.player_id,
        targetId: validTarget,
        random,
      });
      if (action)
        await execute(
          tx,
          bot.player_id,
          v.id,
          commandSchemaFor(cfg).parse(action),
          plan.until,
          cfg,
        );
      // The action, history checkpoint and next turn commit together. A crash cannot
      // spend twice or consume a turn without committing its game effects.
      const delay = npcDelay(settings, random);
      await tx.query(
        `UPDATE npc_players SET turn=turn+1,last_action_at=clock_timestamp(),last_action=$2,
        next_action_at=clock_timestamp()+$3*interval '1 second' WHERE player_id=$1`,
        [
          bot.player_id,
          JSON.stringify(
            action
              ? { ...action, villageId: v.id }
              : { action: 'waiting', message: 'Waiting for resources, queues or troops' },
          ),
          delay,
        ],
      );
      return true;
    }, 1);
  } catch (error: any) {
    if (['WB_BUSY', '40001', '40P01', '55P03'].includes(error.code)) return false;
    throw error;
  }
}
export async function runNpcBatch() {
  if (
    !(
      await database.query(
        'SELECT 1 FROM npc_players WHERE enabled AND next_action_at<=now() LIMIT 1',
      )
    ).rowCount
  )
    return { turns: 0, errors: [] as unknown[] };
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => runNpcTurn()));
  return {
    turns: results.filter((r) => r.status === 'fulfilled' && r.value).length,
    errors: results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : [])),
  };
}
