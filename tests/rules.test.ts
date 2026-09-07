import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  advance,
  battle,
  buildingCost,
  capacity,
  defaultConfig,
  freshVillage,
  plunder,
  resources,
  travelTime,
  units,
  commandSchema,
} from '../packages/shared/game';
const army = fc.record(
  Object.fromEntries(Object.keys(units).map((k) => [k, fc.integer({ min: 0, max: 10000 })])),
);
describe('combat invariants', () => {
  it('is deterministic for every generated input', () =>
    fc.assert(
      fc.property(army, army, fc.integer({ min: 0, max: 20 }), fc.integer(), (a, d, w, s) => {
        expect(battle(a, d, w, s)).toEqual(battle(a, d, w, s));
      }),
      { numRuns: 250 },
    ));
  it('conserves units and never produces negative or fractional survivors', () =>
    fc.assert(
      fc.property(army, army, fc.integer({ min: 0, max: 20 }), fc.integer(), (a, d, w, s) => {
        const r = battle(a, d, w, s);
        for (const [before, after] of [
          [a, r.attackingSurvivors],
          [d, r.defendingSurvivors],
        ] as const)
          for (const k of Object.keys(before)) {
            expect(after[k]!).toBeGreaterThanOrEqual(0);
            expect(after[k]!).toBeLessThanOrEqual(before[k]!);
            expect(Number.isInteger(after[k]!)).toBe(true);
            expect(after[k]! + (before[k]! - after[k]!)).toBe(before[k]!);
          }
        expect(r.wallAfter).toBeGreaterThanOrEqual(0);
        expect(r.wallAfter).toBeLessThanOrEqual(w);
      }),
      { numRuns: 500 },
    ));
  it('scouts alone cannot defeat an army', () =>
    expect(battle({ scout: 100 }, { spear: 1 }, 0, 42).won).toBe(false));
  it('large ram attacks lower the wall', () =>
    expect(battle({ axe: 1000, ram: 40 }, { spear: 2 }, 10, 42).wallAfter).toBe(0));
  it('a surviving noble applies a bounded loyalty hit', () => {
    const r = battle({ axe: 10000, noble: 1 }, { spear: 1 }, 0, 20);
    expect(r.loyaltyHit).toBeGreaterThanOrEqual(20);
    expect(r.loyaltyHit).toBeLessThanOrEqual(35);
  });
});
describe('resources and travel', () => {
  it('accrual is independent of processing chunks', () => {
    const a = freshVillage(0),
      b = freshVillage(0);
    advance(a, 3000, defaultConfig);
    advance(a, 6000, defaultConfig);
    advance(b, 6000, defaultConfig);
    for (const r of resources) expect(a.resources[r]).toBeCloseTo(b.resources[r], 8);
  });
  it('resources and loyalty stop at their caps', () => {
    const v = freshVillage(0);
    advance(v, 86400000, defaultConfig);
    for (const r of resources) expect(v.resources[r]).toBe(capacity(v.buildings.storage || 0));
    expect(v.loyalty).toBe(100);
  });
  it('never accrues backward in time', () => {
    const v = freshVillage(3000);
    const before = structuredClone(v);
    advance(v, 0, defaultConfig);
    expect(v).toEqual(before);
  });
  it('uses the slowest participating unit, not zero-count units', () => {
    const a = { x: 0, y: 0 },
      b = { x: 3, y: 4 };
    expect(travelTime(a, b, { scout: 3, ram: 0 }, defaultConfig)).toBe(15000);
    expect(travelTime(a, b, { scout: 3, ram: 1 }, defaultConfig)).toBe(50000);
  });
  it('plunder is nonnegative, integral, capacity bounded, and does not exceed stock', () =>
    fc.assert(
      fc.property(
        fc.record({
          wood: fc.integer({ min: 0, max: 100000 }),
          clay: fc.integer({ min: 0, max: 100000 }),
          iron: fc.integer({ min: 0, max: 100000 }),
        }),
        fc.integer({ min: 0, max: 300000 }),
        (stock, carry) => {
          const p = plunder(stock, carry);
          expect(Object.values(p).reduce((s, n) => s + n, 0)).toBe(
            Math.min(
              carry,
              Object.values(stock).reduce((s, n) => s + n, 0),
            ),
          );
          for (const r of resources) {
            expect(p[r]).toBeGreaterThanOrEqual(0);
            expect(p[r]).toBeLessThanOrEqual(stock[r]);
            expect(Number.isInteger(p[r])).toBe(true);
          }
        },
      ),
      { numRuns: 400 },
    ));
  it('building costs increase with level', () => {
    expect(buildingCost('main', 5).wood).toBeGreaterThan(buildingCost('main', 4).wood);
  });
  it('rejects negative, fractional, unknown and empty troop commands', () => {
    for (const army of [{ axe: -1 }, { axe: 1.5 }, { dragon: 1 }, { axe: 0 }])
      expect(
        commandSchema.safeParse({ action: 'movement', targetId: 1, kind: 'attack', units: army })
          .success,
      ).toBe(false);
  });
});
