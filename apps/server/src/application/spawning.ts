import {
  frontierLimit,
  frontierSites,
  starterRuins,
  type FrontierSite,
} from '../../../../packages/shared/spawning';
import { freshVillage, points, type WorldConfig } from '../../../../packages/shared/game';
import type { Tx } from '../../../../packages/db';
import { fail } from './engine';

// Called inside spawn's exclusive world transaction. The cursor, player, castle
// and any new neutral keeps either all commit, or all roll back together.
export async function starterSite(tx: Tx, cfg: WorldConfig) {
  await tx.query('INSERT INTO spawn_frontiers(world_id) VALUES(1) ON CONFLICT DO NOTHING');
  const from = Number(
    (await tx.query('SELECT cursor FROM spawn_frontiers WHERE world_id=1 FOR UPDATE')).rows[0]
      .cursor,
  );
  const limit = frontierLimit(cfg.map.size);
  for (let offset = from; offset < Math.min(limit, from + 8192); offset += 128) {
    const candidates = frontierSites(cfg.map.size, cfg.seed, offset);
    if (!candidates.length) continue;
    const site = (
      await tx.query<FrontierSite>(
        `SELECT c.* FROM jsonb_to_recordset($1::jsonb) AS c(x int,y int,cursor bigint)
       WHERE NOT EXISTS(SELECT 1 FROM villages v WHERE v.world_id=1
         AND v.x BETWEEN c.x-1 AND c.x+1 AND v.y BETWEEN c.y-1 AND c.y+1)
       AND NOT EXISTS(SELECT 1 FROM villages v WHERE v.world_id=1 AND v.player_id IS NOT NULL AND v.points>$2
         AND v.x BETWEEN c.x-4 AND c.x+4 AND v.y BETWEEN c.y-4 AND c.y+4)
       ORDER BY c.cursor LIMIT 1`,
        [JSON.stringify(candidates), points(freshVillage(0).buildings) * 8],
      )
    ).rows[0];
    if (!site) continue;
    await tx.query('UPDATE spawn_frontiers SET cursor=$1 WHERE world_id=1', [
      Number(site.cursor) + 1,
    ]);
    return site;
  }
  fail('No suitably spaced starting keeps are available on this world frontier', 409);
}

export async function populateStarterRuins(
  tx: Tx,
  site: FrontierSite,
  cfg: WorldConfig,
  now: number,
) {
  const nearby = (
    await tx.query(
      'SELECT x,y,player_id FROM villages WHERE world_id=1 AND x BETWEEN $1-7 AND $1+7 AND y BETWEEN $2-7 AND $2+7',
      [site.x, site.y],
    )
  ).rows;
  const ruins = starterRuins(site, nearby, cfg.map.size, cfg.seed ^ Number(site.cursor));
  if (!ruins.length) return;
  const state = freshVillage(now);
  state.units = { spear: 3 };
  state.buildings.wall = 0;
  state.resources = { wood: 800, clay: 700, iron: 600 };
  await tx.query(
    `INSERT INTO villages(world_id,x,y,name,state,points)
     SELECT 1,x,y,'Ruined keep',$2::jsonb,$3 FROM jsonb_to_recordset($1::jsonb) AS p(x int,y int)`,
    [JSON.stringify(ruins), JSON.stringify(state), points(state.buildings)],
  );
}
