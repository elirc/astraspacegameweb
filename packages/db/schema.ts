import {
  pgTable,
  smallint,
  unique,
  integer,
  bigint,
  bigserial,
  text,
  jsonb,
  timestamp,
  boolean,
  uuid,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import type { VillageState, WorldConfig } from '../shared/game';
const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
export const worlds = pgTable('worlds', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  config: jsonb('config').$type<WorldConfig>().notNull(),
  createdAt: time('created_at').defaultNow().notNull(),
});
export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: time('created_at').defaultNow().notNull(),
});
export const tribes = pgTable('tribes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: integer('world_id')
    .notNull()
    .references(() => worlds.id),
  name: text('name').notNull().unique(),
  tag: text('tag').notNull().unique(),
  description: text('description').notNull().default(''),
  founderId: bigint('founder_id', { mode: 'number' }),
  openJoin: boolean('open_join').notNull().default(true),
  createdAt: time('created_at').defaultNow().notNull(),
});
export const players = pgTable('players', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: integer('world_id')
    .notNull()
    .references(() => worlds.id),
  userId: bigint('user_id', { mode: 'number' })
    .unique()
    .references(() => users.id),
  name: text('name').notNull().unique(),
  tribeId: bigint('tribe_id', { mode: 'number' }).references(() => tribes.id),
  role: text('role').notNull().default('member'),
  bannedUntil: time('banned_until'),
  banReason: text('ban_reason'),
  createdAt: time('created_at').defaultNow().notNull(),
});
export const npcPlayers = pgTable('npc_players', {
  playerId: bigint('player_id', { mode: 'number' })
    .primaryKey()
    .references(() => players.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(true),
  style: text('style').notNull().default('balanced'),
  autoBuild: boolean('auto_build').notNull().default(true),
  minDelaySeconds: integer('min_delay_seconds').notNull().default(30),
  maxDelaySeconds: integer('max_delay_seconds').notNull().default(120),
  targetMode: text('target_mode').notNull().default('abandoned'),
  seed: integer('seed').notNull(),
  turn: bigint('turn', { mode: 'number' }).notNull().default(0),
  nextActionAt: time('next_action_at').notNull(),
  lastActionAt: time('last_action_at'),
  lastAction: jsonb('last_action'),
  createdBy: bigint('created_by', { mode: 'number' }).references(() => players.id, {
    onDelete: 'set null',
  }),
  createdAt: time('created_at').notNull().defaultNow(),
});
export const villages = pgTable(
  'villages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    worldId: integer('world_id')
      .notNull()
      .references(() => worlds.id),
    playerId: bigint('player_id', { mode: 'number' }).references(() => players.id),
    x: smallint('x').notNull(),
    y: smallint('y').notNull(),
    name: text('name').notNull(),
    state: jsonb('state').$type<VillageState>().notNull(),
    points: integer('points').notNull().default(0),
  },
  (t) => [
    unique('villages_world_id_x_y_key').on(t.worldId, t.x, t.y),
    index('villages_owner').on(t.playerId),
    index('villages_map').on(t.worldId, t.x, t.y),
  ],
);
export const scheduledEvents = pgTable('scheduled_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: integer('world_id')
    .notNull()
    .references(() => worlds.id),
  villageId: bigint('village_id', { mode: 'number' })
    .notNull()
    .references(() => villages.id),
  dueAt: time('due_at').notNull(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'),
  configVersion: integer('config_version').notNull().default(1),
  createdAt: time('created_at').defaultNow().notNull(),
  appliedAt: time('applied_at'),
});
export const reports = pgTable('reports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: integer('world_id')
    .notNull()
    .references(() => worlds.id),
  playerId: bigint('player_id', { mode: 'number' })
    .notNull()
    .references(() => players.id),
  kind: text('kind').notNull(),
  subject: text('subject').notNull(),
  payload: jsonb('payload').notNull(),
  read: boolean('read').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  createdAt: time('created_at').defaultNow().notNull(),
});
export const outbox = pgTable('outbox', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  playerId: bigint('player_id', { mode: 'number' })
    .notNull()
    .references(() => players.id),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: time('created_at').defaultNow().notNull(),
  sentAt: time('sent_at'),
});
export const sessionFamilies = pgTable('session_families', {
  id: uuid('id').primaryKey(),
  playerId: bigint('player_id', { mode: 'number' })
    .notNull()
    .references(() => players.id),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
  expiresAt: time('expires_at').notNull(),
  revokedAt: time('revoked_at'),
  createdAt: time('created_at').defaultNow().notNull(),
});
export const configVersions = pgTable(
  'config_versions',
  {
    worldId: integer('world_id')
      .notNull()
      .references(() => worlds.id),
    version: integer('version').notNull(),
    config: jsonb('config').$type<WorldConfig>().notNull(),
    effectiveAt: time('effective_at').defaultNow().notNull(),
    actor: bigint('actor', { mode: 'number' }).references(() => players.id),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.version] })],
);
export const sessionTokens = pgTable('session_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  familyId: uuid('family_id')
    .notNull()
    .references(() => sessionFamilies.id, { onDelete: 'cascade' }),
  consumedAt: time('consumed_at'),
  createdAt: time('created_at').notNull().defaultNow(),
});
export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id),
  expiresAt: time('expires_at').notNull(),
  consumedAt: time('consumed_at'),
});
export const sideEffects = pgTable('side_effects', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
  deliveredAt: time('delivered_at'),
});
export const pushSubscriptions = pgTable('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  playerId: bigint('player_id', { mode: 'number' })
    .notNull()
    .references(() => players.id),
  subscription: jsonb('subscription').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
});
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    playerId: bigint('player_id', { mode: 'number' })
      .notNull()
      .references(() => players.id),
    key: text('key').notNull(),
    request: text('request').notNull(),
    response: jsonb('response').notNull(),
    createdAt: time('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.key] })],
);
export const messages = pgTable('messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: integer('world_id')
    .notNull()
    .references(() => worlds.id),
  senderId: bigint('sender_id', { mode: 'number' })
    .notNull()
    .references(() => players.id),
  recipientId: bigint('recipient_id', { mode: 'number' })
    .notNull()
    .references(() => players.id),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: time('created_at').notNull().defaultNow(),
});
export const messageArchive = pgTable(
  'message_archive',
  {
    playerId: bigint('player_id', { mode: 'number' })
      .notNull()
      .references(() => players.id),
    messageId: bigint('message_id', { mode: 'number' })
      .notNull()
      .references(() => messages.id),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.messageId] })],
);
export const forumThreads = pgTable('forum_threads', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  tribeId: bigint('tribe_id', { mode: 'number' })
    .notNull()
    .references(() => tribes.id),
  authorId: bigint('author_id', { mode: 'number' })
    .notNull()
    .references(() => players.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
});
export const forumPosts = pgTable('forum_posts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  threadId: bigint('thread_id', { mode: 'number' })
    .notNull()
    .references(() => forumThreads.id),
  authorId: bigint('author_id', { mode: 'number' })
    .notNull()
    .references(() => players.id),
  body: text('body').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
});
export const diplomacy = pgTable(
  'diplomacy',
  {
    tribeA: bigint('tribe_a', { mode: 'number' })
      .notNull()
      .references(() => tribes.id),
    tribeB: bigint('tribe_b', { mode: 'number' })
      .notNull()
      .references(() => tribes.id),
    status: text('status').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tribeA, t.tribeB] })],
);
export const tribeInvitations = pgTable(
  'tribe_invitations',
  {
    tribeId: bigint('tribe_id', { mode: 'number' })
      .notNull()
      .references(() => tribes.id),
    playerId: bigint('player_id', { mode: 'number' })
      .notNull()
      .references(() => players.id),
    invitedBy: bigint('invited_by', { mode: 'number' })
      .notNull()
      .references(() => players.id),
    createdAt: time('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tribeId, t.playerId] })],
);
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: integer('world_id')
    .notNull()
    .references(() => worlds.id),
  actor: bigint('actor', { mode: 'number' }).references(() => players.id),
  action: text('action').notNull(),
  entity: bigint('entity', { mode: 'number' }),
  detail: jsonb('detail').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
});
export const abuseFlags = pgTable('abuse_flags', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  playerId: bigint('player_id', { mode: 'number' })
    .notNull()
    .references(() => players.id),
  kind: text('kind').notNull(),
  windowStart: time('window_start').notNull(),
  evidence: jsonb('evidence').notNull(),
  status: text('status').notNull().default('open'),
});
export const villageSnapshots = pgTable('village_snapshots', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  villageId: bigint('village_id', { mode: 'number' })
    .notNull()
    .references(() => villages.id),
  eventId: bigint('event_id', { mode: 'number' }).references(() => scheduledEvents.id),
  at: time('at').notNull(),
  state: jsonb('state').$type<VillageState>().notNull(),
  playerId: bigint('player_id', { mode: 'number' }).references(() => players.id),
  name: text('name').notNull(),
  config: jsonb('config').$type<WorldConfig>().notNull(),
});
export const eventJournal = pgTable('event_journal', {
  eventId: bigint('event_id', { mode: 'number' })
    .primaryKey()
    .references(() => scheduledEvents.id),
  villageId: bigint('village_id', { mode: 'number' })
    .notNull()
    .references(() => villages.id),
  beforeState: jsonb('before_state').$type<VillageState>().notNull(),
  afterState: jsonb('after_state').$type<VillageState>().notNull(),
  beforeOwner: bigint('before_owner', { mode: 'number' }),
  afterOwner: bigint('after_owner', { mode: 'number' }),
  context: jsonb('context').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
});
export const rateBuckets = pgTable('rate_buckets', {
  key: text('key').primaryKey(),
  hits: integer('hits').notNull(),
  expiresAt: time('expires_at').notNull(),
});
export const playerScores = pgTable('player_scores', {
  playerId: bigint('player_id', { mode: 'number' })
    .primaryKey()
    .references(() => players.id, { onDelete: 'cascade' }),
  points: bigint('points', { mode: 'number' }).notNull().default(0),
});
export const supportLinks = pgTable(
  'support_links',
  {
    stationId: bigint('station_id', { mode: 'number' })
      .notNull()
      .references(() => villages.id),
    homeId: bigint('home_id', { mode: 'number' })
      .notNull()
      .references(() => villages.id),
    playerId: bigint('player_id', { mode: 'number' })
      .notNull()
      .references(() => players.id),
  },
  (t) => [primaryKey({ columns: [t.homeId, t.stationId] })],
);
export const spawnFrontiers = pgTable('spawn_frontiers', {
  worldId: bigint('world_id', { mode: 'number' })
    .primaryKey()
    .references(() => worlds.id, { onDelete: 'cascade' }),
  cursor: bigint('cursor', { mode: 'number' }).notNull().default(0),
});
