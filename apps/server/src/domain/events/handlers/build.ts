import { definition } from '../../../../../../packages/shared/game';
import { type EventContext } from '../types';
export function build(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  v.state.buildings[p.building] =
    p.fromLevel === undefined
      ? p.level
      : Math.min(
          definition(cfg.buildings, p.building).max,
          (v.state.buildings[p.building] || 0) + 1,
        );
  v.state.reservedPopulation = Math.max(0, v.state.reservedPopulation - (p.population || 0));
  notify(v.player_id, 'build_done');
}
