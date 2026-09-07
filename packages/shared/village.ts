import type { VillageState } from './game';
export type Village = {
  id: number;
  world_id: number;
  player_id: number | null;
  x: number;
  y: number;
  name: string;
  state: VillageState;
  points: number;
};
