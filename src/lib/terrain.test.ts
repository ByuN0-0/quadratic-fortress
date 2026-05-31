import { describe, expect, it } from "vitest";
import {
  destroyTerrain,
  destroyTerrainBlocks,
  findProjectileTerrainImpact,
  findSupportY,
  getSegmentYAtX,
  settlePlayersOnTerrain,
  type TerrainBlock,
  type TerrainSegment,
} from "./terrain";
import { calculateQuadratic } from "./math";
import type { Player } from "./game";

describe("terrain", () => {
  it("finds the first air terrain hit on a projectile path", () => {
    const quadratic = calculateQuadratic({ x: -8, y: 0 }, { x: 0, y: 6 });
    const blocks: TerrainBlock[] = [
      { id: "platform", x: -4.3, y: 4.2, width: 0.8, height: 0.5 },
    ];

    const hit = findProjectileTerrainImpact(
      { x: -8, y: 0 },
      quadratic,
      { x: 8, y: 0 },
      blocks,
    );

    expect(hit?.blockId).toBe("platform");
    expect(hit?.point.x).toBeGreaterThanOrEqual(-4.3);
    expect(hit?.point.x).toBeLessThanOrEqual(-3.5);
  });

  it("ignores terrain too close to the projectile launch point", () => {
    const quadratic = calculateQuadratic({ x: -8, y: 2.5 }, { x: 0, y: 6 });
    const terrain = {
      blocks: [],
      segments: [{ id: "launch-slope", x1: -9.2, y1: 2, x2: -6.8, y2: 2.5 }],
    };

    const hit = findProjectileTerrainImpact(
      { x: -8, y: 2.5 },
      quadratic,
      { x: 8, y: 0 },
      terrain,
      0.7,
    );

    expect(hit).toBeNull();
  });

  it("destroys only air terrain inside the blast radius", () => {
    const blocks: TerrainBlock[] = [
      { id: "platform", x: -1, y: 2, width: 4, height: 0.5 },
    ];

    const next = destroyTerrainBlocks(blocks, { x: 1, y: 2.25 }, 1);

    expect(next).toHaveLength(2);
    expect(next[0].x).toBe(-1);
    expect(next[0].width).toBeGreaterThan(0);
    expect(next[1].x).toBeGreaterThan(1);
  });

  it("destroys only sloped terrain inside the blast radius", () => {
    const terrain = {
      blocks: [],
      segments: [{ id: "slope", x1: -2, y1: 1, x2: 2, y2: 3 }],
    };

    const next = destroyTerrain(terrain, { x: 0, y: 2 }, 0.6);

    expect(next.blocks).toHaveLength(0);
    expect(next.segments).toHaveLength(2);
    expect(next.segments[0].x2).toBeLessThan(0);
    expect(next.segments[1].x1).toBeGreaterThan(0);
  });

  it("drops players vertically to the nearest lower support", () => {
    const players: [Player, Player] = [
      {
        id: "p1",
        name: "1P",
        tankPosition: { x: 0, y: 2.5 },
        hp: 100,
        isActive: true,
      },
      {
        id: "p2",
        name: "2P",
        tankPosition: { x: 8, y: 0 },
        hp: 100,
        isActive: false,
      },
    ];

    expect(findSupportY(0, 2.5, [])).toBe(0);
    expect(settlePlayersOnTerrain(players, [])[0].tankPosition).toEqual({ x: 0, y: 0 });
  });

  it("calculates support height on sloped terrain with linear interpolation", () => {
    const slope: TerrainSegment = { id: "slope", x1: -2, y1: 1, x2: 2, y2: 3 };
    const terrain = {
      blocks: [],
      segments: [slope],
    };

    expect(getSegmentYAtX(slope, 0)).toBe(2);
    expect(findSupportY(0, 10, terrain)).toBe(2);
    expect(findSupportY(1, 10, terrain)).toBe(2.5);
  });

  it("keeps players on a remaining slope when support differs only by rounding", () => {
    const players: [Player, Player] = [
      {
        id: "p1",
        name: "1P",
        tankPosition: { x: -5.5, y: 2.99 },
        hp: 100,
        isActive: true,
      },
      {
        id: "p2",
        name: "2P",
        tankPosition: { x: 8, y: 0 },
        hp: 100,
        isActive: false,
      },
    ];
    const terrain = {
      blocks: [],
      segments: [{ id: "slope", x1: -6.8, y1: 2.5, x2: -3.9, y2: 3.6 }],
    };

    expect(settlePlayersOnTerrain(players, terrain)[0].tankPosition.y).toBe(2.99);
  });
});
