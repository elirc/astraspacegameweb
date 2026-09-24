import { inboxQuery } from './extended';
import { populateStarterRuins, starterSite } from './spawning';
import { lockCausalComponent } from '../../../../packages/db/causality';

import { z } from 'zod';
import {
  advance,
  buildings,
  freshVillage,
  points,
  units,
  worldSchema,
} from '../../../../packages/shared/game';
import {
  config,
  dbNow,
  database,
  transaction,
  worldLock,
  saveVillage,
  type Tx,
  type Village,
} from '../../../../packages/db';
import { command, drain, fail, notify, report } from './engine';
import { redis } from '../redis';
const numberId = (v: unknown) => z.coerce.number().int().positive().parse(v);
const obj = (req: any) => req.body as Record<string, any>;
export async function spawn(tx: Tx, name: string, userId: number | null) {
  await worldLock(tx);
  const now = await dbNow(tx);
  const player = (
    await tx.query('INSERT INTO players(world_id,user_id,name) VALUES(1,$1,$2) RETURNING id', [
      userId,
      name,
    ])
  ).rows[0].id;
  const cfg = await config(tx);
  const location = await starterSite(tx, cfg);
  const { x, y } = location;
  const state = freshVillage(now);
  await tx.query(
    'INSERT INTO villages(world_id,player_id,x,y,name,state,points) VALUES(1,$1,$2,$3,$4,$5,$6)',
    [player, x, y, 'Ravenswood', JSON.stringify(state), points(state.buildings)],
  );
  await populateStarterRuins(tx, location, cfg, now);
  await report(
    tx,
    player,
    'welcome',
    'Your banner rises over Ravenswood Keep',
    {
      text: `Welcome to the Crownlands. Fortify your keep, develop your resources and muster your warband. Scout the nearby ruined keeps before your first raid. New arrivals settle along the expanding frontier. This world runs at ${cfg.speed}× speed.`,
    },
    now,
  );
  return player;
}
export const gameUseCases = {
  get_api_legal: async () => ({
    operator: process.env.OPERATOR_NAME || 'Local Warband operator',
    support: process.env.SUPPORT_EMAIL || 'Contact your server administrator',
  }),
  get_api_health: async () => {
    // Deep health: an instance that cannot reach Redis can neither fan out live
    // events nor share rate limits with its peers, so it should not take traffic.
    await Promise.all([database.query('SELECT 1'), redis.ping()]);
    return { ok: true, server_now: Date.now() };
  },
  get_api_state: async (req: any) => {
    const readSnapshot = async (tx: Tx | typeof database) =>
      (
        await tx.query(
          `WITH owned AS MATERIALIZED (SELECT * FROM villages WHERE player_id=$1),
       event_ids AS MATERIALIZED (
         SELECT e.id FROM scheduled_events e JOIN owned v ON v.id=e.village_id WHERE e.world_id=1 AND e.status='pending'
         UNION SELECT id FROM scheduled_events WHERE world_id=1 AND status='pending' AND (payload->>'owner')::bigint=$1
       ), owned_events AS MATERIALIZED (SELECT e.* FROM scheduled_events e JOIN event_ids ids ON ids.id=e.id)
       SELECT floor(extract(epoch FROM statement_timestamp())*1000)::bigint AS now_ms,
        EXISTS(SELECT 1 FROM owned_events WHERE due_at<=statement_timestamp())
        OR EXISTS(SELECT 1 FROM scheduled_events e JOIN owned v ON v.id=(e.payload->>'origin')::bigint WHERE e.world_id=1 AND e.status='pending' AND e.due_at<=statement_timestamp())
        OR (EXISTS(SELECT 1 FROM support_links WHERE player_id=$1 OR home_id IN(SELECT id FROM owned) OR station_id IN(SELECT id FROM owned))
            AND EXISTS(SELECT 1 FROM scheduled_events WHERE world_id=1 AND status='pending' AND due_at<=statement_timestamp())) AS needs_drain,
        (SELECT config FROM worlds WHERE id=1) AS config,
        (SELECT to_jsonb(p)||jsonb_build_object('tribe_name',t.name,'tribe_tag',t.tag) FROM players p LEFT JOIN tribes t ON t.id=p.tribe_id WHERE p.id=$1) AS player,
        (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]') FROM owned v) AS villages,
        (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.due_at,e.id),'[]') FROM owned_events e) AS events,
        (SELECT count(*) FROM reports WHERE player_id=$1 AND read=false) AS unread,
        (SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]') FROM villages v WHERE id IN(SELECT station_id FROM support_links WHERE player_id=$1)) AS stations`,
          [req.playerId],
        )
      ).rows[0];
    // An idle read is a single MVCC snapshot and never advances persisted state.
    // Direct due effects or support dependencies retain the causal drain protocol.
    let snapshot = await readSnapshot(database);
    if (snapshot.needs_drain)
      snapshot = await transaction(async (tx) => {
        const plan = await lockCausalComponent(
          tx,
          snapshot.villages.map((v: Village) => v.id),
          undefined,
          req.playerId,
        );
        await drain(tx, plan.until);
        const current = await readSnapshot(tx);
        current.now_ms = plan.until;
        return current;
      });
    const now = Number(snapshot.now_ms);
    const cfg = worldSchema.parse(snapshot.config),
      player = snapshot.player,
      villages = snapshot.villages as Village[],
      events = snapshot.events as any[];
    if (!player) fail('Player not found', 401);
    for (const village of villages) advance(village.state, now, cfg);
    const safeEvents = events.map((e) => {
      const owns =
        Number(e.payload.owner) === req.playerId ||
        (villages.some((v) => v.id === e.village_id) && ['build', 'recruit'].includes(e.kind));
      const { config: _, ...payload } = e.payload;
      return {
        ...e,
        payload: owns
          ? payload
          : {
              kind: payload.kind,
              originName: payload.originName,
              origin: payload.origin,
              targetName: payload.targetName,
            },
      };
    });
    const unread = Number(snapshot.unread);
    const stationed = (snapshot.stations as Village[]).flatMap((v) =>
      Object.entries(v.state.garrison)
        .filter(([, g]) => g.owner === req.playerId)
        .map(([origin, g]) => ({
          targetId: v.id,
          targetName: v.name,
          origin: Number(origin),
          units: g.units,
        })),
    );
    return {
      player: { ...player, is_admin: req.isAdmin },
      villages,
      events: safeEvents,
      stationed,
      unread,
      config: cfg,
      server_now: now,
    };
  },
  post_api_villages_id_command: async (req: any) =>
    command(
      req.playerId,
      numberId((req.params as any).id),
      req.body,
      String(req.headers['idempotency-key'] || ''),
    ),
  get_api_map: async (req: any) => {
    const q = z
      .object({
        x0: z.coerce.number().default(0),
        x1: z.coerce.number().default(1000),
        y0: z.coerce.number().default(0),
        y1: z.coerce.number().default(1000),
      })
      .parse(req.query);
    return {
      villages: (
        await database.query(
          'SELECT v.id,v.x,v.y,v.name,v.points,v.player_id,p.name AS player_name,p.tribe_id,t.tag AS tribe_tag FROM villages v LEFT JOIN players p ON p.id=v.player_id LEFT JOIN tribes t ON t.id=p.tribe_id WHERE v.x BETWEEN $1 AND $2 AND v.y BETWEEN $3 AND $4 ORDER BY v.id LIMIT 50000',
          [q.x0, q.x1, q.y0, q.y1],
        )
      ).rows,
      server_now: Date.now(),
    };
  },
  get_api_reports: async (req: any) => {
    const q = inboxQuery.parse(req.query);
    const reports = (
      await database.query(
        'SELECT * FROM reports WHERE player_id=$1 AND ($2::bigint IS NULL OR id<$2) AND ($3::text IS NULL OR kind=$3) AND archived=$4 AND ($6::boolean=false OR read=false) ORDER BY id DESC LIMIT $5',
        [
          req.playerId,
          q.cursor ?? null,
          q.kind ?? null,
          q.archived === 'true',
          q.limit,
          q.unread === 'true',
        ],
      )
    ).rows;
    return { reports, next_cursor: reports.length === q.limit ? reports.at(-1)?.id : null };
  },
  post_api_reports_id_read: async (req: any) => {
    await database.query('UPDATE reports SET read=true WHERE id=$1 AND player_id=$2', [
      numberId((req.params as any).id),
      req.playerId,
    ]);
    return { ok: true };
  },
  get_api_rankings: async () => ({
    players: (
      await database.query(
        'SELECT p.id,p.name,t.tag AS tribe_tag,count(v.id)::int AS villages,coalesce(sum(v.points),0)::int AS points FROM players p LEFT JOIN villages v ON v.player_id=p.id LEFT JOIN tribes t ON p.tribe_id=t.id GROUP BY p.id,t.tag ORDER BY points DESC,p.id',
      )
    ).rows,
    server_now: Date.now(),
  }),
  get_api_messages: async (req: any) => {
    const q = inboxQuery.parse(req.query);
    const messages = (
      await database.query(
        'SELECT m.*,s.name AS sender,r.name AS recipient FROM messages m JOIN players s ON s.id=m.sender_id JOIN players r ON r.id=m.recipient_id WHERE (m.sender_id=$1 OR m.recipient_id=$1) AND ($2::bigint IS NULL OR m.id<$2) AND EXISTS(SELECT 1 FROM message_archive a WHERE a.player_id=$1 AND a.message_id=m.id)=$3 ORDER BY m.id DESC LIMIT $4',
        [req.playerId, q.cursor ?? null, q.archived === 'true', q.limit],
      )
    ).rows;
    return { messages, next_cursor: messages.length === q.limit ? messages.at(-1)?.id : null };
  },
  post_api_messages: async (req: any) => {
    const input = z
      .object({
        recipient: z.string().min(3).max(24),
        subject: z.string().trim().min(1).max(100),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(req.body);
    return transaction(async (tx) => {
      const recipient = (await tx.query('SELECT id FROM players WHERE name=$1', [input.recipient]))
        .rows[0];
      if (!recipient) fail('No player has that name');
      if (recipient.id === req.playerId) fail('Choose another player');
      await tx.query(
        'INSERT INTO messages(world_id,sender_id,recipient_id,subject,body) VALUES(1,$1,$2,$3,$4)',
        [req.playerId, recipient.id, input.subject, input.body],
      );
      await notify(tx, recipient.id, 'message_new');
      return { ok: true };
    });
  },
  get_api_tribes: async (req: any) => {
    const me = (await database.query('SELECT tribe_id FROM players WHERE id=$1', [req.playerId]))
      .rows[0];
    return {
      tribes: (
        await database.query(
          'SELECT t.*,count(p.id)::int AS members FROM tribes t LEFT JOIN players p ON p.tribe_id=t.id GROUP BY t.id ORDER BY members DESC,t.id',
        )
      ).rows,
      threads: me.tribe_id
        ? (
            await database.query(
              'SELECT f.*,p.name AS author,(SELECT count(*)::int FROM forum_posts WHERE thread_id=f.id) AS replies FROM forum_threads f JOIN players p ON p.id=f.author_id WHERE f.tribe_id=$1 ORDER BY f.id DESC',
              [me.tribe_id],
            )
          ).rows
        : [],
      diplomacy: me.tribe_id
        ? (
            await database.query(
              'SELECT d.*,t.name,t.tag FROM diplomacy d JOIN tribes t ON t.id=d.tribe_b WHERE tribe_a=$1',
              [me.tribe_id],
            )
          ).rows
        : [],
      server_now: Date.now(),
    };
  },
  post_api_tribes: async (req: any) => {
    const input = z
      .object({
        name: z.string().trim().min(3).max(40),
        tag: z
          .string()
          .trim()
          .min(2)
          .max(6)
          .regex(/^[A-Za-z0-9]+$/),
        description: z.string().max(1000).default(''),
      })
      .parse(req.body);
    return transaction(async (tx) => {
      await worldLock(tx);
      const me = (await tx.query('SELECT * FROM players WHERE id=$1 FOR UPDATE', [req.playerId]))
        .rows[0];
      if (me.tribe_id) fail('Leave your current tribe before founding a new one');
      const tribe = (
        await tx.query(
          'INSERT INTO tribes(world_id,name,tag,description,founder_id) VALUES(1,$1,$2,$3,$4) RETURNING id',
          [input.name, input.tag.toUpperCase(), input.description, req.playerId],
        )
      ).rows[0];
      await tx.query("UPDATE players SET tribe_id=$1,role='founder' WHERE id=$2", [
        tribe.id,
        req.playerId,
      ]);
      return { ok: true };
    });
  },
  post_api_tribes_id_join: async (req: any) =>
    transaction(async (tx) => {
      await worldLock(tx);
      const me = (await tx.query('SELECT * FROM players WHERE id=$1 FOR UPDATE', [req.playerId]))
        .rows[0];
      if (me.tribe_id) fail('You already belong to a tribe');
      const id = numberId((req.params as any).id);
      const tribe = (await tx.query('SELECT * FROM tribes WHERE id=$1', [id])).rows[0];
      if (!tribe) fail('Tribe not found', 404);
      if (
        !tribe.open_join &&
        !(
          await tx.query('SELECT 1 FROM tribe_invitations WHERE tribe_id=$1 AND player_id=$2', [
            id,
            req.playerId,
          ])
        ).rowCount
      )
        fail('An invitation is required', 403);
      await tx.query('DELETE FROM tribe_invitations WHERE player_id=$1', [req.playerId]);
      await tx.query("UPDATE players SET tribe_id=$1,role='member' WHERE id=$2", [
        id,
        req.playerId,
      ]);
      return { ok: true };
    }),
  post_api_tribes_leave: async (req: any) =>
    transaction(async (tx) => {
      await worldLock(tx);
      const me = (await tx.query('SELECT * FROM players WHERE id=$1 FOR UPDATE', [req.playerId]))
        .rows[0];
      if (me.role === 'founder') fail('The founder must remain to lead the tribe');
      await tx.query('UPDATE players SET tribe_id=null WHERE id=$1', [req.playerId]);
      return { ok: true };
    }),
  post_api_tribes_forum: async (req: any) => {
    const input = z
      .object({
        title: z.string().trim().min(3).max(100),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(req.body);
    const me = (await database.query('SELECT tribe_id FROM players WHERE id=$1', [req.playerId]))
      .rows[0];
    if (!me.tribe_id) fail('Join a tribe first');
    await database.query(
      'INSERT INTO forum_threads(tribe_id,author_id,title,body) VALUES($1,$2,$3,$4)',
      [me.tribe_id, req.playerId, input.title, input.body],
    );
    return { ok: true };
  },
  get_api_tribes_forum_id: async (req: any) => {
    const id = numberId((req.params as any).id);
    const thread = (
      await database.query(
        'SELECT f.*,p.name AS author FROM forum_threads f JOIN players me ON me.tribe_id=f.tribe_id JOIN players p ON p.id=f.author_id WHERE f.id=$1 AND me.id=$2',
        [id, req.playerId],
      )
    ).rows[0];
    if (!thread) fail('Thread not found', 404);
    return {
      thread,
      posts: (
        await database.query(
          'SELECT f.*,p.name AS author FROM forum_posts f JOIN players p ON p.id=f.author_id WHERE thread_id=$1 ORDER BY f.id',
          [id],
        )
      ).rows,
    };
  },
  post_api_tribes_forum_id: async (req: any) => {
    const body = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const id = numberId((req.params as any).id);
    if (
      !(
        await database.query(
          'SELECT f.id FROM forum_threads f JOIN players p ON p.tribe_id=f.tribe_id WHERE f.id=$1 AND p.id=$2',
          [id, req.playerId],
        )
      ).rowCount
    )
      fail('Thread not found', 404);
    await database.query('INSERT INTO forum_posts(thread_id,author_id,body) VALUES($1,$2,$3)', [
      id,
      req.playerId,
      body.body,
    ]);
    return { ok: true };
  },
  post_api_tribes_diplomacy: async (req: any) => {
    const input = z
      .object({
        tribeId: z.number().int().positive(),
        status: z.enum(['ally', 'neutral', 'enemy']),
      })
      .parse(req.body);
    const me = (await database.query('SELECT * FROM players WHERE id=$1', [req.playerId])).rows[0];
    if (me.role !== 'founder' || !me.tribe_id)
      fail('Only your tribe founder can set diplomacy', 403);
    if (me.tribe_id === input.tribeId) fail('Choose another tribe');
    await database.query(
      'INSERT INTO diplomacy(tribe_a,tribe_b,status) VALUES($1,$2,$3) ON CONFLICT(tribe_a,tribe_b) DO UPDATE SET status=$3',
      [me.tribe_id, input.tribeId, input.status],
    );
    return { ok: true };
  },
  post_api_restart: async (req: any) =>
    transaction(async (tx) => {
      await worldLock(tx);
      if ((await tx.query('SELECT id FROM villages WHERE player_id=$1', [req.playerId])).rowCount)
        fail('You still have a village');
      const now = await dbNow(tx);
      const v = (
        await tx.query<Village>(
          'SELECT * FROM villages WHERE player_id IS NULL ORDER BY id LIMIT 1 FOR UPDATE',
        )
      ).rows[0];
      if (!v) fail('No spawn locations are currently available');
      const state = freshVillage(now);
      await tx.query('SELECT pg_advisory_xact_lock(1,$1)', [v.id]);
      v.player_id = req.playerId;
      v.name = 'A New Beginning';
      v.state = state;
      await saveVillage(tx, v);
      return { ok: true };
    }),
};
