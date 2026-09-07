import { z } from 'zod';
import {
  buildingCost,
  capacity,
  farmCapacity,
  population,
  resources,
  seededRandom,
  type Command,
  type VillageState,
  type WorldConfig,
} from './game';

export const npcSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    style: z.enum(['builder', 'balanced', 'raider']).default('balanced'),
    autoBuild: z.boolean().default(true),
    minDelaySeconds: z.number().int().min(5).max(86400).default(30),
    maxDelaySeconds: z.number().int().min(5).max(86400).default(120),
    targetMode: z.enum(['abandoned', 'rivals']).default('abandoned'),
  })
  .strict()
  .refine((s) => s.maxDelaySeconds >= s.minDelaySeconds, {
    message: 'Maximum interval must be at least the minimum interval',
    path: ['maxDelaySeconds'],
  });
export type NpcSettings = z.infer<typeof npcSettingsSchema>;
export const npcPaces = {
  relaxed: { minDelaySeconds: 300, maxDelaySeconds: 900 },
  steady: { minDelaySeconds: 30, maxDelaySeconds: 120 },
  active: { minDelaySeconds: 5, maxDelaySeconds: 20 },
};
export function npcDelay(settings: NpcSettings, random: () => number) {
  return (
    settings.minDelaySeconds +
    Math.floor(random() * (settings.maxDelaySeconds - settings.minDelaySeconds + 1))
  );
}
const firstNames =
  'Alden Alina Ansel Arlen Beatrice Brenna Cedric Clara Dorian Edith Edwin Elena Elias Elin Emmett Esme Felix Finn Freya Gareth Gavin Hazel Helena Hugo Iris Jasper Jonas Julian Kieran Leon Leona Livia Lucan Lydia Maeve Mara Marin Mira Nathan Nolan Orin Oscar Owen Petra Rowan Silas Soren Tessa Theo Tobias Tristan Vera Willa'.split(
    ' ',
  );
const surnames =
  'Ashford Ashworth Alderwood Arden Barrett Bellamy Blackwood Briar Brookfield Calder Carver Corwin Cresswell Darrow Dunsmore Ellery Fairchild Fenwick Fletcher Fordham Greywood Halden Hartwell Hawthorne Hayden Hollis Kendrick Kingsley Langley Linden Lockwood Lowell Marlow Mercer Norwood Oakley Penrose Prescott Redfern Reed Ridley Roswell Selwyn Shepherd Sterling Thorne Townsend Vale Waverly Westwood Whitaker Whitmore Wilder Winfield Woodward'.split(
    ' ',
  );
export function npcNames(seed: number) {
  const names = firstNames.flatMap((first) => surnames.map((last) => `${first} ${last}`));
  const random = seededRandom(seed);
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [names[i], names[j]] = [names[j]!, names[i]!];
  }
  return names;
}
export function npcVillageName(seed: number) {
  const beginnings = [
    'Amber',
    'Ash',
    'Birch',
    'Briar',
    'Cedar',
    'Elm',
    'Fox',
    'Green',
    'Hazel',
    'High',
    'Oak',
    'Pine',
    'Raven',
    'Red',
    'Stone',
    'Willow',
  ];
  const endings = ['ford', 'field', 'haven', 'brook', 'mere', 'ridge', 'wood', 'hill'];
  const random = seededRandom(seed);
  return (
    beginnings[Math.floor(random() * beginnings.length)]! +
    endings[Math.floor(random() * endings.length)]!
  );
}
type Pending = { kind: string; payload: any };
export function chooseNpcAction(input: {
  settings: NpcSettings;
  state: VillageState;
  cfg: WorldConfig;
  pending: Pending[];
  playerId: number;
  targetId?: number;
  random: () => number;
}): Command | null {
  const { settings, state, cfg, pending, random } = input;
  const room = farmCapacity(state.buildings.farm || 0, cfg) - population(state, cfg);
  const canPay = (cost: Record<string, number>) =>
    resources.every((r) => state.resources[r] >= (cost[r] || 0));
  const build = (): Command | null => {
    if (!settings.autoBuild || pending.some((e) => e.kind === 'build')) return null;
    const warehouse = capacity(state.buildings.storage || 0, cfg);
    const options = Object.entries(cfg.buildings)
      .flatMap(([key, b]) => {
        const level = state.buildings[key] || 0;
        if (
          level >= b.max ||
          (key !== 'farm' && room < b.population) ||
          !canPay(buildingCost(key, level, cfg)) ||
          Object.entries(b.requires || {}).some(([k, n]) => (state.buildings[k] || 0) < n)
        )
          return [];
        let score = 1 / (level + 1);
        if (['wood', 'clay', 'iron'].includes(key)) score *= settings.style === 'builder' ? 10 : 7;
        if (key === 'farm') score *= room < 20 ? 100 : 2;
        if (key === 'storage')
          score *= resources.some((r) => state.resources[r] > warehouse * 0.8) ? 80 : 2;
        if (key === 'main') score *= 4;
        if (['barracks', 'stable', 'smith'].includes(key))
          score *= settings.style === 'raider' ? 6 : 3;
        return [{ key, score: score * (0.75 + random() * 0.5) }];
      })
      .sort((a, b) => b.score - a.score);
    return options[0] ? { action: 'build', building: options[0].key } : null;
  };
  const recruit = (): Command | null => {
    if (room <= 0 || pending.filter((e) => e.kind === 'recruit').length >= 20) return null;
    const candidates =
      settings.style === 'builder' ? ['spear', 'sword'] : ['axe', 'spear', 'scout', 'light'];
    // Rotate priorities so armies include scouts and defense, not just one unit.
    const offset = Math.floor(random() * candidates.length);
    for (let i = 0; i < candidates.length; i++) {
      const key = candidates[(i + offset) % candidates.length]!,
        u = cfg.units[key];
      if (
        !u ||
        (state.buildings[u.building] || 0) < u.level ||
        (key === 'scout' && (state.units.scout || 0) >= 5)
      )
        continue;
      const count = Math.min(
        key === 'scout' ? 2 : 5,
        Math.floor(room / u.population),
        ...resources.map((r) => (u.cost[r] ? Math.floor(state.resources[r] / u.cost[r]) : 100)),
      );
      if (count > 0) return { action: 'recruit', unit: key, count };
    }
    return null;
  };
  const raid = (): Command | null => {
    if (
      settings.style === 'builder' ||
      !input.targetId ||
      pending.some((e) => e.kind === 'movement' && e.payload.owner === input.playerId)
    )
      return null;
    if ((state.units.scout || 0) >= 2 && random() < 0.25)
      return {
        action: 'movement',
        kind: 'scout',
        targetId: input.targetId,
        units: { scout: 2 },
        catapultTarget: 'main',
      };
    const force = Math.floor((state.units.axe || 0) * 0.65);
    return force >= 15
      ? {
          action: 'movement',
          kind: 'attack',
          targetId: input.targetId,
          units: { axe: force },
          catapultTarget: 'main',
        }
      : null;
  };
  // Economy comes first for builders; other styles alternate army, raids and development.
  const choices =
    settings.style === 'builder'
      ? [build, recruit]
      : random() < (settings.style === 'raider' ? 0.65 : 0.4)
        ? [raid, recruit, build]
        : [build, raid, recruit];
  for (const choose of choices) {
    const action = choose();
    if (action) return action;
  }
  return null;
}
