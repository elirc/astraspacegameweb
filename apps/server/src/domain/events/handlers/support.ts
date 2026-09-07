import { type Army } from '../../../../../../packages/shared/game';
import { type EventContext } from '../types';
export function support(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  const stack: { owner: number; units: Army } = v.state.garrison[p.origin] || {
    owner: p.owner,
    units: {},
  };
  for (const [k, n] of Object.entries(p.units as Army)) stack.units[k] = (stack.units[k] || 0) + n;
  v.state.garrison[p.origin] = stack;
  report(
    p.owner,
    'support',
    `Support arrived at ${v.name}`,
    { village: v.name, units: p.units },
    at,
  );
  report(v.player_id, 'support', `${p.originName} sent reinforcements`, { units: p.units }, at);
}
