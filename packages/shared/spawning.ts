import { seededRandom } from './game';

export type Site = { x: number; y: number };
export type FrontierSite = Site & { cursor: number };
const cellSize = 4;
export const frontierLimit = (size: number) => (2 * Math.ceil(size / (2 * cellSize)) + 3) ** 2;

// Each four-tile cell gets one jittered site. Shuffle each outward shell so
// successive arrivals populate all sides, without forming rows or a visible spiral.
export function frontierSites(size: number, seed: number, from: number, count = 128) {
  const result: FrontierSite[] = [];
  const center = Math.floor(size / 2);
  const end = Math.min(frontierLimit(size), from + count);
  const shells = new Map<number, Site[]>();
  for (let cursor = from; cursor < end; cursor++) {
    const ring = Math.ceil((Math.sqrt(cursor + 1) - 1) / 2);
    let shell = shells.get(ring);
    if (!shell) {
      shell = [];
      if (ring === 0) shell.push({ x: 0, y: 0 });
      else {
        for (let x = -ring; x < ring; x++) shell.push({ x, y: -ring });
        for (let y = -ring; y < ring; y++) shell.push({ x: ring, y });
        for (let x = ring; x > -ring; x--) shell.push({ x, y: ring });
        for (let y = ring; y > -ring; y--) shell.push({ x: -ring, y });
        const random = seededRandom(seed ^ Math.imul(ring, 0x9e3779b9));
        for (let i = shell.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [shell[i], shell[j]] = [shell[j]!, shell[i]!];
        }
      }
      shells.set(ring, shell);
    }
    const cell = shell[ring === 0 ? 0 : cursor - (2 * ring - 1) ** 2]!;
    const random = seededRandom(seed ^ Math.imul(cursor + 1, 0x85ebca6b));
    const x = center + cell.x * cellSize + Math.floor(random() * 3) - 1;
    const y = center + cell.y * cellSize + Math.floor(random() * 3) - 1;
    if (x >= 0 && y >= 0 && x < size && y < size) result.push({ x, y, cursor });
  }
  return result;
}

export function starterRuins(
  origin: Site,
  nearby: (Site & { player_id: number | null })[],
  size: number,
  seed: number,
) {
  const neutralCount = nearby.filter(
    (p) => p.player_id === null && Math.hypot(p.x - origin.x, p.y - origin.y) <= 6,
  ).length;
  const needed = Math.max(0, 2 - neutralCount);
  if (!needed) return [];
  const candidates: Site[] = [];
  for (let dx = -6; dx <= 6; dx++)
    for (let dy = -6; dy <= 6; dy++) {
      const x = origin.x + dx,
        y = origin.y + dy;
      if (
        dx * dx + dy * dy >= 9 &&
        dx * dx + dy * dy <= 36 &&
        x >= 0 &&
        y >= 0 &&
        x < size &&
        y < size
      )
        candidates.push({ x, y });
    }
  const random = seededRandom(seed);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  const occupied: Site[] = [...nearby, origin];
  const result: Site[] = [];
  for (const p of candidates) {
    if (occupied.some((v) => Math.abs(v.x - p.x) < 2 && Math.abs(v.y - p.y) < 2)) continue;
    result.push(p);
    occupied.push(p);
    if (result.length === needed) break;
  }
  return result;
}
