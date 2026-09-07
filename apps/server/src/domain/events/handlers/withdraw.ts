import { type EventContext, armyPopulation } from '../types';
export function withdraw(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  const stack = v.state.garrison[p.origin];
  if (stack && stack.owner === p.owner) {
    delete v.state.garrison[p.origin];
    event(
      p.origin,
      'return',
      at + p.travel,
      {
        owner: p.owner,
        units: stack.units,
        haul: {},
        reserved: armyPopulation(stack.units, cfg),
      },
      cfg,
    );
    notify(v.player_id, 'movement_arrived');
  }
}
