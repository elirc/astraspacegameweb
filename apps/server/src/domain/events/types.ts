import {
  defaultConfig,
  definition,
  type Army,
  type WorldConfig,
} from '../../../../../packages/shared/game';
import type { Village } from '../../../../../packages/shared/village';
export type { Village } from '../../../../../packages/shared/village';
export type EventKind =
  | 'build'
  | 'recruit'
  | 'market'
  | 'merchantReturn'
  | 'release'
  | 'return'
  | 'withdraw'
  | 'movement';
export type Event = {
  id: number;
  village_id: number;
  kind: EventKind;
  payload: any;
  due_at: Date;
  config_version: number;
};

export type Effect =
  | { type: 'event'; villageId: number; kind: EventKind; due: number; payload: any }
  | {
      type: 'report';
      player: number | null;
      kind: string;
      subject: string;
      payload: any;
      at: number;
    }
  | { type: 'notify'; player: number | null; kind: string; payload: any }
  | { type: 'cancelQueues'; villageId: number };
export const armyPopulation = (army: Army, cfg: WorldConfig = defaultConfig) =>
  Object.entries(army).reduce(
    (n, [key, count]) => n + count * definition(cfg.units, key).population,
    0,
  );
export type EventInputs = {
  village: Village;
  ev: Event;
  cfg: WorldConfig;
  at: number;
  attackerPoints: number;
  defenderPoints: number;
  returnCandidates: Village[];
};
export function context(input: EventInputs) {
  const effects: Effect[] = [];
  return {
    ...input,
    effects,
    event: (villageId: number, kind: EventKind, due: number, payload: any, _cfg: WorldConfig) => {
      effects.push({ type: 'event', villageId, kind, due, payload: structuredClone(payload) });
    },
    report: (player: number | null, kind: string, subject: string, payload: any, at: number) => {
      if (player)
        effects.push({
          type: 'report',
          player,
          kind,
          subject,
          payload: structuredClone(payload),
          at,
        });
    },
    notify: (player: number | null, kind: string, payload: any = {}) => {
      if (player) effects.push({ type: 'notify', player, kind, payload: structuredClone(payload) });
    },
  };
}
export type EventContext = ReturnType<typeof context>;
