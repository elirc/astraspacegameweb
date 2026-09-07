import { resources } from '../../../../../../packages/shared/game';
import { type EventContext } from '../types';
export function scout(ctx: EventContext) {
  const { village: v, ev, cfg, at, event, report, notify } = ctx;
  const p = ev.payload,
    units = cfg.units;

  const scouts =
    (v.state.units.scout || 0) +
    Object.values(v.state.garrison).reduce((s, g) => s + (g.units.scout || 0), 0);
  const sent = p.units.scout || 0,
    loss = Math.min(sent, Math.floor(scouts * 1.5)),
    survived = sent - loss;
  report(
    p.owner,
    'scout',
    `${survived ? 'Scouting successful' : 'Scouts defeated'} · ${v.name}`,
    {
      success: survived > 0,
      scoutsSent: sent,
      scoutsLost: loss,
      ...(survived
        ? {
            resources: v.state.resources,
            buildings: v.state.buildings,
            units: v.state.units,
            garrison: v.state.garrison,
          }
        : {}),
    },
    at,
  );
  report(v.player_id, 'scout', `Scouts spotted from ${p.originName}`, { scoutsLost: loss }, at);
  event(
    p.origin,
    'return',
    at + p.travel,
    { owner: p.owner, units: { scout: survived }, reserved: p.reserved },
    cfg,
  );
}
