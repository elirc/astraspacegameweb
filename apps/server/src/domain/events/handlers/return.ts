import { capacity, resources, travelTime, type Army } from '../../../../../../packages/shared/game';
import { type EventContext } from '../types';
export function returnArmy(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  if (v.player_id !== p.owner) {
    const dest = ctx.returnCandidates
      .slice()
      .sort(
        (a, b) =>
          Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y) || a.id - b.id,
      )[0];
    if (dest)
      event(dest.id, 'return', at + travelTime(v, dest, p.units, cfg), { ...p, reserved: 0 }, cfg);
    else report(p.owner, 'loss', 'Your returning army found no home', { units: p.units }, at);
  } else {
    for (const [k, n] of Object.entries(p.units as Army))
      v.state.units[k] = (v.state.units[k] || 0) + n;
    for (const r of resources)
      v.state.resources[r] = Math.min(
        capacity(v.state.buildings.storage || 0, cfg),
        v.state.resources[r] + (p.haul?.[r] || 0),
      );
    v.state.reservedPopulation = Math.max(0, v.state.reservedPopulation - (p.reserved || 0));
    notify(v.player_id, 'movement_arrived');
  }
}
