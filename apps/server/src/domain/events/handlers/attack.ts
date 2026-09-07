import { definition, resources, battle, plunder } from '../../../../../../packages/shared/game';
import { type EventContext, armyPopulation } from '../types';
export function attack(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  const defenderOwner = v.player_id;
  const defenders = { ...v.state.units };
  for (const stack of Object.values(v.state.garrison))
    for (const [k, n] of Object.entries(stack.units)) defenders[k] = (defenders[k] || 0) + n;
  const attackerPoints = ctx.attackerPoints;
  const defenderPoints = defenderOwner ? ctx.defenderPoints : attackerPoints;
  const morale =
    defenderOwner && cfg.combat.moraleEnabled
      ? Math.max(
          cfg.combat.moraleFloor,
          Math.min(1, cfg.combat.moraleFloor + (3 * defenderPoints) / Math.max(1, attackerPoints)),
        )
      : 1;
  const result = battle(
    p.units,
    defenders,
    v.state.buildings.wall || 0,
    ev.id ^ cfg.seed,
    morale,
    cfg,
  );
  // Allocate integer survivors by largest remainder, preserving every troop exactly.
  const garrisonBefore = Object.fromEntries(
    Object.entries(v.state.garrison).map(([origin, g]) => [origin, armyPopulation(g.units, cfg)]),
  );
  const stacks = [{ units: v.state.units }, ...Object.values(v.state.garrison)];
  for (const [key, total] of Object.entries(defenders)) {
    const remaining = result.defendingSurvivors[key] || 0;
    const allocations = stacks.map((s, i) => ({
      i,
      exact: total ? ((s.units[key] || 0) * remaining) / total : 0,
    }));
    let assigned = 0;
    for (const a of allocations) {
      const n = Math.floor(a.exact);
      stacks[a.i]!.units[key] = n;
      assigned += n;
    }
    allocations.sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.i - b.i);
    for (let i = 0; i < remaining - assigned; i++)
      stacks[allocations[i]!.i]!.units[key] = (stacks[allocations[i]!.i]!.units[key] || 0) + 1;
  }
  for (const [origin, stack] of Object.entries(v.state.garrison)) {
    const dead = garrisonBefore[origin]! - armyPopulation(stack.units, cfg);
    if (dead > 0)
      event(Number(origin), 'release', at, { owner: stack.owner, population: dead }, cfg);
  }
  v.state.buildings.wall = result.wallAfter;
  if (result.won && (result.attackingSurvivors.catapult || 0) > 0) {
    const target = p.catapultTarget || 'main';
    v.state.buildings[target] = Math.max(
      target === 'main' ? 1 : 0,
      (v.state.buildings[target] || 0) -
        Math.floor(Math.sqrt((result.attackingSurvivors.catapult || 0) / 2)),
    );
  }
  const haul = result.won
    ? plunder(
        v.state.resources,
        Object.entries(result.attackingSurvivors).reduce(
          (s, [k, n]) => s + n * definition(units, k).carry,
          0,
        ),
      )
    : { wood: 0, clay: 0, iron: 0 };
  for (const r of resources) v.state.resources[r] -= haul[r];
  v.state.loyalty = Math.max(0, v.state.loyalty - result.loyaltyHit);
  const conquered = result.won && result.loyaltyHit > 0 && v.state.loyalty <= 0;
  if (conquered) {
    v.player_id = p.owner;
    v.state.loyalty = 25;
    v.state.units = {
      ...result.attackingSurvivors,
      noble: Math.max(0, (result.attackingSurvivors.noble || 0) - 1),
    };
    v.state.reservedPopulation = 0;
    ctx.effects.push({ type: 'cancelQueues', villageId: v.id });
    notify(p.owner, 'village_gained');
    notify(defenderOwner, 'village_lost');
  }
  const payload = {
    ...result,
    origin: p.originName,
    target: v.name,
    originId: p.origin,
    targetId: v.id,
    haul,
    loyalty: v.state.loyalty,
    conquered,
  };
  report(
    p.owner,
    'battle',
    `${conquered ? 'Village conquered' : result.won ? 'Victory' : 'Defeat'} at ${v.name}`,
    payload,
    at,
  );
  report(
    defenderOwner,
    'battle',
    `${result.won ? 'Defeat' : 'Victory'} defending ${v.name}`,
    payload,
    at,
  );
  for (const stack of Object.values(v.state.garrison))
    report(stack.owner, 'battle', `Your support fought at ${v.name}`, payload, at);
  event(
    p.origin,
    'return',
    at + p.travel,
    {
      owner: p.owner,
      units: conquered ? {} : result.attackingSurvivors,
      haul,
      reserved: p.reserved,
    },
    cfg,
  );
}
