import { createContext, useContext } from 'react';
import {
  defaultConfig,
  capacity,
  farmCapacity,
  population,
  production,
  buildingCost,
  battle,
  type WorldConfig,
  type Army,
  type VillageState,
} from '../../../packages/shared/game';
export const RulesContext = createContext<WorldConfig>(defaultConfig);
export function useGameRules() {
  const config = useContext(RulesContext);
  return {
    config,
    buildings: config.buildings,
    units: config.units,
    capacity: (level: number) => capacity(level, config),
    farmCapacity: (level: number) => farmCapacity(level, config),
    population: (v: VillageState) => population(v, config),
    production: (level: number, speed = 1) => production(level, speed, config),
    buildingCost: (key: string, level: number) => buildingCost(key, level, config),
    battle: (a: Army, d: Army, wall: number, seed: number, morale = 1) =>
      battle(a, d, wall, seed, morale, config),
  };
}
