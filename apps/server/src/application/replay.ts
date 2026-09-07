import type { Pool } from 'pg';
import { isDeepStrictEqual } from 'node:util';
import { worldSchema } from '../../../../packages/shared/game';
import { replayEvent, type Event } from './engine';
export type TimelineRange = { villageId: number; from: number; to: number };
export async function exportTimeline(source: Pool, range: TimelineRange) {
  if (
    !Number.isSafeInteger(range.villageId) ||
    range.villageId < 1 ||
    !Number.isFinite(range.from) ||
    !Number.isFinite(range.to) ||
    range.from >= range.to
  )
    throw new Error('A positive village id and increasing finite time range are required');
  const tx = await source.connect();
  try {
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const events = (
      await tx.query(
        `SELECT e.*,to_jsonb(j) AS journal FROM scheduled_events e LEFT JOIN event_journal j ON j.event_id=e.id WHERE e.village_id=$1 AND e.due_at >= $2 AND e.due_at < $3 ORDER BY e.due_at,e.id LIMIT 50001`,
        [range.villageId, new Date(range.from), new Date(range.to)],
      )
    ).rows;
    if (events.length > 50000) throw new Error('Range exceeds 50,000 events; split the time range');
    const checkpoints = (
      await tx.query(
        'SELECT * FROM village_snapshots WHERE village_id=$1 AND at >= $2 AND at < $3 ORDER BY at,id',
        [range.villageId, new Date(range.from), new Date(range.to)],
      )
    ).rows;
    const configs = (
      await tx.query('SELECT version,config FROM config_versions WHERE world_id=1 ORDER BY version')
    ).rows;
    await tx.query('COMMIT');
    return { range, events, checkpoints, configs };
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}
export type TimelineBundle = Awaited<ReturnType<typeof exportTimeline>>;
export function diffValues(
  expected: any,
  actual: any,
  path = '$',
): { path: string; expected: any; actual: any }[] {
  if (isDeepStrictEqual(expected, actual)) return [];
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object')
    return [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
      .flatMap((key) => diffValues(expected[key], actual[key], path + '.' + key))
      .slice(0, 100);
  return [{ path, expected: expected ?? null, actual: actual ?? null }];
}
// The caller supplies an isolated scratch database (CLI) or a transaction-local
// temporary schema (admin). No simulation table in the source world is written.
export async function replayTimeline(bundle: TimelineBundle, scratch: Pool) {
  const configs = new Map(
    bundle.configs.map((row) => [row.version, worldSchema.parse(row.config)]),
  );
  const resolved = bundle.events.filter((row) => row.status === 'done' && row.journal);
  const missing = bundle.events
    .filter((row) => row.status !== 'cancelled' && (row.status !== 'done' || !row.journal))
    .map((row) => ({
      id: row.id,
      status: row.status,
      reason: row.journal ? 'not resolved' : 'no journal',
    }));
  const tx = await scratch.connect();
  const results: any[] = [],
    appliedCheckpoints: number[] = [];
  let state: any,
    owner: number | null = null,
    previous: number | undefined;
  try {
    await tx.query('BEGIN');
    await tx.query(
      'CREATE TEMP TABLE replay_state (singleton boolean PRIMARY KEY DEFAULT true,state jsonb NOT NULL,owner bigint) ON COMMIT DROP; CREATE TEMP TABLE replay_results(event_id bigint PRIMARY KEY,matches boolean NOT NULL,detail jsonb NOT NULL) ON COMMIT DROP',
    );
    for (const row of resolved) {
      const ev = { ...row, due_at: new Date(row.due_at) } as Event;
      const journal = structuredClone(row.journal);
      if (previous === undefined) {
        state = structuredClone(journal.before_state);
        owner = journal.before_owner;
      } else {
        for (const checkpoint of bundle.checkpoints.filter(
          (c) => c.event_id === previous && new Date(c.at).getTime() <= ev.due_at.getTime(),
        )) {
          state = structuredClone(checkpoint.state);
          owner = checkpoint.player_id;
          appliedCheckpoints.push(checkpoint.id);
        }
        const gap = diffValues(
          { state: journal.before_state, owner: journal.before_owner },
          { state, owner },
        );
        if (gap.length) {
          results.push({
            eventId: ev.id,
            matches: false,
            stage: 'checkpoint continuity',
            diff: gap,
          });
          break;
        }
      }
      journal.before_state = structuredClone(state);
      journal.before_owner = owner;
      const cfg = worldSchema.parse(ev.payload.config || configs.get(ev.config_version));
      const accrual = configs.get(journal.context.accrualVersion) || cfg;
      const replay = await replayEvent(ev, journal, cfg, accrual);
      state = replay.actual;
      owner = replay.actualOwner;
      const diff = diffValues(
        { state: replay.expected, owner: replay.expectedOwner },
        { state, owner },
      );
      results.push({
        eventId: ev.id,
        kind: ev.kind,
        due: ev.due_at.toISOString(),
        matches: replay.matches,
        effectsMatch: replay.effectsMatch,
        diff,
      });
      previous = ev.id;
      if (!replay.matches) break;
    }
    if (state !== undefined)
      await tx.query('INSERT INTO replay_state(state,owner) VALUES($1,$2)', [
        JSON.stringify(state),
        owner,
      ]);
    if (results.length)
      await tx.query(
        'INSERT INTO replay_results SELECT event_id,matches,detail FROM jsonb_to_recordset($1::jsonb) AS x(event_id bigint,matches boolean,detail jsonb)',
        [
          JSON.stringify(
            results.map((r) => ({ event_id: r.eventId, matches: r.matches, detail: r })),
          ),
        ],
      );
    const persisted = (await tx.query('SELECT state,owner FROM replay_state')).rows[0];
    const verified = Number(
      (await tx.query('SELECT count(*) AS n FROM replay_results WHERE matches')).rows[0].n,
    );
    await tx.query('COMMIT');
    return {
      range: bundle.range,
      matches:
        missing.length === 0 &&
        verified === resolved.length &&
        results.length === resolved.length &&
        resolved.length > 0,
      events: resolved.length,
      verified,
      cancelled: bundle.events.filter((e) => e.status === 'cancelled').length,
      missing,
      baseline: resolved[0]
        ? {
            eventId: resolved[0].id,
            state: resolved[0].journal.before_state,
            owner: resolved[0].journal.before_owner,
          }
        : null,
      appliedCheckpoints,
      results,
      final: persisted || null,
    };
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}
