import { z } from 'zod';
export function definition<T>(catalog: Record<string, T>, key: string): T {
  const value = catalog[key];
  if (value === undefined) throw new Error('Unknown rule: ' + key);
  return value;
}
export const resources = ['wood', 'clay', 'iron'] as const;
export type Resource = (typeof resources)[number];
export type Stock = Record<Resource, number>;
export type Army = Record<string, number>;
export type Building = {
  name: string;
  description: string;
  max: number;
  cost: Stock;
  factor: number;
  seconds: number;
  requires?: Record<string, number>;
  population: number;
};
export type Unit = {
  name: string;
  description: string;
  cost: Stock;
  population: number;
  attack: number;
  defense: number;
  cavalryDefense: number;
  speed: number;
  carry: number;
  seconds: number;
  building: string;
  level: number;
  class: 'infantry' | 'cavalry';
};
import worldData from '../config/worlds/w1.json';
export const buildings = worldData.buildings as Record<string, Building>;
export const units = worldData.units as Record<string, Unit>;
const stockSchema = z.object({
  wood: z.number().nonnegative(),
  clay: z.number().nonnegative(),
  iron: z.number().nonnegative(),
});
const keySchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
const buildingSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000),
  max: z.number().int().min(1).max(100),
  cost: stockSchema,
  factor: z.number().min(1).max(3),
  seconds: z.number().positive(),
  requires: z.record(keySchema, z.number().int().nonnegative()).optional(),
  population: z.number().int().nonnegative(),
});
const unitSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000),
  cost: stockSchema,
  population: z.number().int().positive(),
  attack: z.number().nonnegative(),
  defense: z.number().nonnegative(),
  cavalryDefense: z.number().nonnegative(),
  speed: z.number().positive(),
  carry: z.number().nonnegative(),
  seconds: z.number().positive(),
  building: keySchema,
  level: z.number().int().positive(),
  class: z.enum(['infantry', 'cavalry']),
});
export const worldSchema = z
  .object({
    version: z.number().int().positive(),
    name: z.string(),
    speed: z.number().positive(),
    unitSpeed: z.number().positive(),
    seed: z.number().int(),
    cancelSeconds: z.number().positive(),
    loyaltyRegen: z.number().nonnegative(),
    maxQueue: z.number().int().min(1).max(100),
    buildings: z.record(keySchema, buildingSchema).default(buildings),
    units: z.record(keySchema, unitSchema).default(units),
    economy: z
      .object({
        baseProduction: z.number().positive(),
        productionFactor: z.number().min(1),
        storageBase: z.number().positive(),
        storageFactor: z.number().min(1),
        farmBase: z.number().positive(),
        farmFactor: z.number().min(1),
        buildTimeFactor: z.number().min(1),
        headquartersFactor: z.number().positive().max(1),
        recruitFactor: z.number().positive().max(1),
        merchantCapacity: z.number().int().positive(),
        merchantSpeed: z.number().positive(),
      })
      .default(worldData.economy),
    combat: z
      .object({
        luckMin: z.number().min(-1).max(0),
        luckMax: z.number().min(0).max(1),
        moraleEnabled: z.boolean(),
        moraleFloor: z.number().positive().max(1),
        wallFlat: z.number().nonnegative(),
        wallFactor: z.number().min(1),
        ramDivisor: z.number().positive(),
        lossExponent: z.number().positive(),
        loyaltyMin: z.number().int().min(1).max(100),
        loyaltyMax: z.number().int().min(1).max(100),
      })
      .default(worldData.combat),
    features: z
      .object({
        market: z.boolean(),
        archers: z.literal(false),
        church: z.literal(false),
        premium: z.literal(false),
      })
      .default({ market: true, archers: false, church: false, premium: false }),
    map: z
      .object({
        size: z.number().int().min(100).max(30000),
        tileSize: z.number().int().min(10).max(100),
      })
      .default(worldData.map),
  })
  .superRefine((c, ctx) => {
    for (const k of Object.keys(buildings))
      if (!c.buildings[k])
        ctx.addIssue({ code: 'custom', message: 'Core building is required: ' + k });
    for (const k of Object.keys(units))
      if (!c.units[k]) ctx.addIssue({ code: 'custom', message: 'Core unit is required: ' + k });
    for (const [k, b] of Object.entries(c.buildings))
      for (const [r, l] of Object.entries(b.requires || {}))
        if (!c.buildings[r] || l > c.buildings[r]!.max)
          ctx.addIssue({ code: 'custom', message: 'Invalid prerequisite for ' + k });
    for (const [k, u] of Object.entries(c.units))
      if (!c.buildings[u.building] || u.level > c.buildings[u.building]!.max)
        ctx.addIssue({ code: 'custom', message: 'Invalid training building for ' + k });
    if (c.combat.loyaltyMin > c.combat.loyaltyMax)
      ctx.addIssue({ code: 'custom', message: 'Invalid loyalty range' });
    const visiting = new Set<string>(),
      visited = new Set<string>();
    function visit(key: string): boolean {
      if (visiting.has(key)) return false;
      if (visited.has(key)) return true;
      visiting.add(key);
      for (const prerequisite of Object.keys(c.buildings[key]?.requires || {}))
        if (!visit(prerequisite)) return false;
      visiting.delete(key);
      visited.add(key);
      return true;
    }
    for (const key of Object.keys(c.buildings))
      if (!visit(key)) {
        ctx.addIssue({ code: 'custom', message: 'Building prerequisites must not contain cycles' });
        break;
      }
  });
export type WorldConfig = z.infer<typeof worldSchema>;
export const defaultConfig: WorldConfig = worldSchema.parse(worldData);
export type VillageState = {
  buildings: Record<string, number>;
  resources: Stock;
  units: Army;
  garrison: Record<string, { owner: number; units: Army }>;
  loyalty: number;
  updatedAt: number;
  reservedPopulation: number;
  merchantsAway?: number;
};
export const capacity = (level: number, cfg: WorldConfig = defaultConfig) =>
  Math.round(cfg.economy.storageBase * Math.pow(cfg.economy.storageFactor, level));
export const farmCapacity = (level: number, cfg: WorldConfig = defaultConfig) =>
  Math.round(cfg.economy.farmBase * Math.pow(cfg.economy.farmFactor, level));
export const production = (level: number, speed = 1, cfg: WorldConfig = defaultConfig) =>
  Math.round(cfg.economy.baseProduction * Math.pow(cfg.economy.productionFactor, level) * speed);
export const points = (levels: Record<string, number>) =>
  Object.values(levels).reduce((sum, n) => sum + Math.round(10 * (Math.pow(1.2, n) - 1)), 0);
export const population = (v: VillageState, cfg: WorldConfig = defaultConfig) =>
  v.reservedPopulation +
  Object.entries(v.units).reduce((s, [k, n]) => s + n * definition(cfg.units, k).population, 0) +
  Object.entries(v.buildings).reduce(
    (s, [k, n]) => s + n * (definition(cfg.buildings, k)?.population || 0),
    0,
  );
export function buildingCost(key: string, level: number, cfg: WorldConfig = defaultConfig): Stock {
  const b = definition(cfg.buildings, key);
  return Object.fromEntries(
    resources.map((r) => [r, Math.ceil(b.cost[r] * Math.pow(b.factor, level))]),
  ) as Stock;
}
export const buildDuration = (key: string, level: number, main: number, cfg: WorldConfig) =>
  Math.max(
    1000,
    Math.ceil(
      ((definition(cfg.buildings, key).seconds *
        Math.pow(cfg.economy.buildTimeFactor, level) *
        Math.pow(cfg.economy.headquartersFactor, main)) /
        cfg.speed) *
        1000,
    ),
  );
export const recruitDuration = (key: string, level: number, cfg: WorldConfig) =>
  Math.max(
    500,
    Math.ceil(
      ((definition(cfg.units, key).seconds * Math.pow(cfg.economy.recruitFactor, level)) /
        cfg.speed) *
        1000,
    ),
  );
export function advance(v: VillageState, to: number, cfg: WorldConfig) {
  const hours = Math.max(0, to - v.updatedAt) / 3600000;
  for (const r of resources)
    v.resources[r] = Math.min(
      capacity(v.buildings.storage || 0, cfg),
      v.resources[r] + hours * production(v.buildings[r] || 0, cfg.speed, cfg),
    );
  v.loyalty = Math.min(100, v.loyalty + hours * cfg.loyaltyRegen * cfg.speed);
  v.updatedAt = Math.max(to, v.updatedAt);
}
export function seededRandom(seed: number) {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
export function merchantTravelTime(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cfg: WorldConfig,
) {
  return Math.max(
    1000,
    Math.ceil(
      (Math.hypot(a.x - b.x, a.y - b.y) * cfg.economy.merchantSpeed * 60000) / cfg.unitSpeed,
    ),
  );
}
export function travelTime(
  a: { x: number; y: number },
  b: { x: number; y: number },
  army: Army,
  cfg: WorldConfig,
) {
  const speeds = Object.entries(army)
    .filter(([, n]) => n > 0)
    .map(([k]) => definition(cfg.units, k).speed);
  return Math.max(
    1000,
    Math.ceil((Math.hypot(a.x - b.x, a.y - b.y) * Math.max(...speeds, 1) * 60000) / cfg.unitSpeed),
  );
}
export function battle(
  attacker: Army,
  defender: Army,
  wall: number,
  seed: number,
  morale = 1,
  cfg: WorldConfig = defaultConfig,
) {
  const units = cfg.units;
  const rng = seededRandom(seed),
    luck = cfg.combat.luckMin + rng() * (cfg.combat.luckMax - cfg.combat.luckMin);
  const effectiveWall = Math.max(0, wall - Math.floor((attacker.ram || 0) / cfg.combat.ramDivisor));
  let infantry = 0,
    cavalry = 0;
  for (const [key, n] of Object.entries(attacker)) {
    if (definition(units, key).class === 'cavalry') cavalry += n * definition(units, key).attack;
    else infantry += n * definition(units, key).attack;
  }
  const attack = (infantry + cavalry) * (1 + luck) * morale;
  const ratio = cavalry / Math.max(1, infantry + cavalry);
  const defense =
    (Object.entries(defender).reduce(
      (s, [k, n]) =>
        s +
        n *
          (definition(units, k).defense * (1 - ratio) +
            definition(units, k).cavalryDefense * ratio),
      0,
    ) +
      cfg.combat.wallFlat * effectiveWall) *
    Math.pow(cfg.combat.wallFactor, effectiveWall);
  const won = attack > defense;
  const fraction = Math.pow(
    Math.min(attack, defense) / Math.max(1, attack, defense),
    cfg.combat.lossExponent,
  );
  const survivors = (army: Army, winner: boolean) =>
    Object.fromEntries(
      Object.entries(army).map(([k, n]) => [
        k,
        winner ? Math.max(0, n - Math.round(n * fraction)) : 0,
      ]),
    );
  const attackingSurvivors = survivors(attacker, won),
    defendingSurvivors = survivors(defender, !won);
  return {
    won,
    luck,
    morale,
    attack: Math.round(attack),
    defense: Math.round(defense),
    wallBefore: wall,
    wallAfter: effectiveWall,
    attacker,
    defender,
    attackingSurvivors,
    defendingSurvivors,
    loyaltyHit:
      won && (attackingSurvivors.noble || 0) > 0
        ? cfg.combat.loyaltyMin +
          Math.floor(rng() * (cfg.combat.loyaltyMax - cfg.combat.loyaltyMin + 1))
        : 0,
  };
}
export function plunder(stock: Stock, carry: number): Stock {
  const haul: Stock = { wood: 0, clay: 0, iron: 0 };
  let left = Math.min(
    carry,
    resources.reduce((s, r) => s + Math.floor(stock[r]), 0),
  );
  for (let i = 0; i < 3; i++) {
    const available = resources.filter((r) => Math.floor(stock[r]) - haul[r] > 0);
    if (!available.length) break;
    const share = Math.ceil(left / available.length);
    for (const r of available) {
      const n = Math.min(left, share, Math.floor(stock[r]) - haul[r]);
      haul[r] += n;
      left -= n;
    }
  }
  return haul;
}
const genericArmySchema = z
  .record(keySchema, z.number().int().min(0).max(1000000))
  .refine((a) => Object.values(a).some((n) => n > 0), 'Choose at least one unit');
const genericCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('build'),
    building: keySchema,
  }),
  z.object({ action: z.literal('cancelBuild'), eventId: z.number().int().positive() }),
  z.object({
    action: z.literal('recruit'),
    unit: keySchema,
    count: z.number().int().min(1).max(1000),
  }),
  z.object({
    action: z.literal('movement'),
    targetId: z.number().int().positive(),
    kind: z.enum(['attack', 'support', 'scout']),
    units: genericArmySchema,
    catapultTarget: keySchema.default('main'),
  }),
  z.object({ action: z.literal('cancelMovement'), eventId: z.number().int().positive() }),
  z.object({ action: z.literal('withdraw'), targetId: z.number().int().positive() }),
  z.object({
    action: z.literal('market'),
    targetId: z.number().int().positive(),
    resources: z.object({
      wood: z.number().int().min(0),
      clay: z.number().int().min(0),
      iron: z.number().int().min(0),
    }),
  }),
  z.object({ action: z.literal('rename'), name: z.string().trim().min(3).max(32) }),
]);
export const armySchema = genericArmySchema.refine(
  (a) => Object.keys(a).every((k) => Object.hasOwn(units, k)),
  'Unknown unit',
);
export function commandSchemaFor(cfg: WorldConfig) {
  return genericCommandSchema.superRefine((cmd, ctx) => {
    if (cmd.action === 'build' && !Object.hasOwn(cfg.buildings, cmd.building))
      ctx.addIssue({ code: 'custom', message: 'Unknown building' });
    if (cmd.action === 'recruit' && !Object.hasOwn(cfg.units, cmd.unit))
      ctx.addIssue({ code: 'custom', message: 'Unknown unit' });
    if (cmd.action === 'movement') {
      if (!Object.hasOwn(cfg.buildings, cmd.catapultTarget))
        ctx.addIssue({ code: 'custom', message: 'Unknown catapult target' });
      for (const k of Object.keys(cmd.units))
        if (!Object.hasOwn(cfg.units, k)) ctx.addIssue({ code: 'custom', message: 'Unknown unit' });
    }
  });
}
export const commandSchema = commandSchemaFor(defaultConfig);
export type Command = z.infer<typeof commandSchema>;
export const freshVillage = (at: number): VillageState => ({
  buildings: {
    main: 5,
    wood: 5,
    clay: 5,
    iron: 5,
    farm: 7,
    storage: 7,
    barracks: 3,
    stable: 2,
    smithy: 3,
    wall: 2,
    market: 1,
    workshop: 0,
    academy: 0,
  },
  resources: { wood: 2600, clay: 2400, iron: 2100 },
  units: {
    spear: 35,
    sword: 20,
    axe: 25,
    scout: 5,
    light: 8,
    heavy: 0,
    ram: 0,
    catapult: 0,
    noble: 0,
  },
  garrison: {},
  loyalty: 100,
  updatedAt: at,
  reservedPopulation: 0,
});
