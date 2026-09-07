import { capacity, resources } from '../../../../../../packages/shared/game';
import { type EventContext } from '../types';
export function market(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  for (const r of resources)
    v.state.resources[r] = Math.min(
      capacity(v.state.buildings.storage || 0, cfg),
      v.state.resources[r] + p.resources[r],
    );
  report(
    v.player_id,
    'market',
    `Caravan arrived from ${p.originName}`,
    { resources: p.resources },
    at,
  );
  if (p.merchants)
    event(
      p.origin,
      'merchantReturn',
      at + p.travel,
      { owner: p.owner, merchants: p.merchants },
      cfg,
    );
}
