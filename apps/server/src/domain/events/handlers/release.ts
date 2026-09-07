import { type EventContext } from '../types';
export function release(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  if (v.player_id === p.owner)
    v.state.reservedPopulation = Math.max(0, v.state.reservedPopulation - p.population);
}
