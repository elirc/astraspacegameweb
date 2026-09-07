import { definition } from '../../../../../../packages/shared/game';
import { type EventContext } from '../types';
export function recruit(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  v.state.units[p.unit] = (v.state.units[p.unit] || 0) + 1;
  v.state.reservedPopulation = Math.max(
    0,
    v.state.reservedPopulation - definition(units, p.unit).population,
  );
  notify(v.player_id, 'recruit_done');
}
