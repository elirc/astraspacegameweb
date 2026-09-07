import { readFile } from 'node:fs/promises';
import { worldSchema } from '../packages/shared/game';
const file = process.argv[2] || 'packages/config/worlds/w1.json';
const cfg = worldSchema.parse(JSON.parse(await readFile(file, 'utf8')));
console.log(
  `${cfg.name} v${cfg.version}: ${Object.keys(cfg.buildings).length} buildings, ${Object.keys(cfg.units).length} units. Configuration valid.`,
);
