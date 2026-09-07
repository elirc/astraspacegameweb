import { type EventContext } from '../types';
export function merchantReturn(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  if (v.player_id === p.owner)
    v.state.merchantsAway = Math.max(0, (v.state.merchantsAway || 0) - p.merchants);
  notify(p.owner, 'movement_arrived');
}
