import { z } from 'zod';
import { database, transaction, config } from '../../../../packages/db';
import { cached } from '../redis';
const publicColumns =
  'SELECT v.id,v.x,v.y,v.name,v.points,v.player_id,p.name AS player_name,p.tribe_id,t.tag AS tribe_tag FROM villages v LEFT JOIN players p ON p.id=v.player_id LEFT JOIN tribes t ON t.id=p.tribe_id';
export function createMapUseCases() {
  return {
    get_api_map_tiles: async (req: any) => {
      const cfg = await transaction(config),
        size = cfg.map.tileSize,
        lastTile = Math.ceil(cfg.map.size / size) - 1;
      const q = z
        .object({
          x: z.coerce.number().int().min(0).max(lastTile),
          y: z.coerce.number().int().min(0).max(lastTile),
        })
        .parse(req.query);
      const villages = await cached(
        `wb:map:1:${cfg.version}:${q.x}:${q.y}`,
        10,
        async () =>
          (
            await database.query(
              publicColumns +
                ' WHERE v.x >= $1 AND v.x < $2 AND v.y >= $3 AND v.y < $4 ORDER BY v.id',
              [q.x * size, (q.x + 1) * size, q.y * size, (q.y + 1) * size],
            )
          ).rows,
      );
      return { villages, tile: q, tileSize: size };
    },
    get_api_map_search: async (req: any) => {
      const q = z
        .object({
          q: z.string().max(100).default(''),
          x: z.coerce.number().min(0).max(30000),
          y: z.coerce.number().min(0).max(30000),
        })
        .parse(req.query);
      return {
        villages: (
          await database.query(
            publicColumns +
              " WHERE v.name ILIKE $1 OR p.name ILIKE $1 OR (v.player_id IS NULL AND 'abandoned village' ILIKE $1) OR concat(v.x,'|',v.y) LIKE $1 ORDER BY (v.x-$2)^2+(v.y-$3)^2,v.id LIMIT 100",
            ['%' + q.q + '%', q.x, q.y],
          )
        ).rows,
      };
    },
  };
}
