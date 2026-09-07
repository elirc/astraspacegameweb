import { describe, expect, it } from 'vitest';
import { frontierLimit, frontierSites, starterRuins } from '../packages/shared/spawning';

describe('world frontier placement', () => {
  it('spreads arrivals across a compact core, then grows outward without coordinate collisions', () => {
    const sites = frontierSites(1000, 42, 0, 1200);
    expect(new Set(sites.map((p) => `${p.x},${p.y}`)).size).toBe(sites.length);
    const occupied = new Set(sites.map((p) => `${p.x},${p.y}`));
    for (const p of sites)
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          if (dx || dy) expect(occupied.has(`${p.x + dx},${p.y + dy}`)).toBe(false);
    const early = sites.slice(0, 80),
      late = sites.slice(-80);
    const averageRadius = (rows: typeof sites) =>
      rows.reduce((n, p) => n + Math.hypot(p.x - 500, p.y - 500), 0) / rows.length;
    expect(averageRadius(late)).toBeGreaterThan(averageRadius(early) * 3);
    for (const xSide of [-1, 1])
      for (const ySide of [-1, 1])
        expect(
          early.filter((p) => (p.x - 500) * xSide > 0 && (p.y - 500) * ySide > 0).length,
        ).toBeGreaterThan(10);
  });

  it('resumes the same seeded schedule across batches and respects map edges', () => {
    const whole = frontierSites(100, 907, 0, frontierLimit(100));
    const resumed = [
      ...frontierSites(100, 907, 0, 137),
      ...frontierSites(100, 907, 137, frontierLimit(100) - 137),
    ];
    expect(resumed).toEqual(whole);
    expect(whole.length).toBeGreaterThan(500);
    expect(whole.every((p) => p.x >= 0 && p.y >= 0 && p.x < 100 && p.y < 100)).toBe(true);
    expect(frontierSites(100, 908, 0, 40)).not.toEqual(frontierSites(100, 907, 0, 40));
    expect(frontierSites(100, 907, frontierLimit(100), 128)).toEqual([]);
  });

  it('provides nearby spaced neutral targets without overpopulating an established neighborhood', () => {
    const origin = { x: 50, y: 50 };
    const existing = [{ x: 52, y: 50, player_id: 1 }];
    const ruins = starterRuins(origin, existing, 100, 42);
    expect(ruins).toHaveLength(2);
    for (const p of ruins) {
      expect(Math.hypot(p.x - origin.x, p.y - origin.y)).toBeGreaterThanOrEqual(3);
      expect(Math.hypot(p.x - origin.x, p.y - origin.y)).toBeLessThanOrEqual(6);
      expect(existing.every((v) => Math.abs(v.x - p.x) >= 2 || Math.abs(v.y - p.y) >= 2)).toBe(
        true,
      );
    }
    expect(
      Math.max(Math.abs(ruins[0]!.x - ruins[1]!.x), Math.abs(ruins[0]!.y - ruins[1]!.y)),
    ).toBeGreaterThanOrEqual(2);
    expect(
      starterRuins(
        origin,
        ruins.map((p) => ({ ...p, player_id: null })),
        100,
        42,
      ),
    ).toEqual([]);
    expect(starterRuins(origin, [{ ...ruins[0]!, player_id: null }], 100, 42)).toHaveLength(1);
  });

  it('keeps neutral ruins inside boundaries and handles a crowded neighborhood', () => {
    const edge = starterRuins({ x: 0, y: 0 }, [], 100, 88);
    expect(edge).toHaveLength(2);
    expect(edge.every((p) => p.x >= 0 && p.y >= 0)).toBe(true);
    const crowded = Array.from({ length: 169 }, (_, i) => ({
      x: 44 + (i % 13),
      y: 44 + Math.floor(i / 13),
      player_id: 1,
    }));
    expect(starterRuins({ x: 50, y: 50 }, crowded, 100, 88)).toEqual([]);
  });
});
