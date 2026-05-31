import { describe, expect, it } from "vitest";
import {
  createInitialTerrain,
  destroyTerrain,
  findProjectileTerrainImpact,
  findSupportY,
  findSupportAtX,
  findSupportYOrNull,
  getSegmentYAtX,
  OCEAN_FALL_Y,
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

  it("creates distinct temporary terrain for each selectable map", () => {
    const map1 = createInitialTerrain("map1");
    const map2 = createInitialTerrain("map2");
    const map3 = createInitialTerrain("map3");

    expect(map1.blocks.map((block) => block.id)).not.toEqual(map2.blocks.map((block) => block.id));
    expect(map2.blocks.map((block) => block.id)).not.toEqual(map3.blocks.map((block) => block.id));
    expect(map1.holes).toEqual([]);
    expect(map2.holes).toEqual([]);
    expect(map3.holes).toEqual([]);
  });

  it("ignores terrain too close to the projectile launch point", () => {
    const quadratic = calculateQuadratic({ x: -8, y: 2.5 }, { x: 0, y: 6 });
    const terrain = {
      blocks: [],
      segments: [{ id: "launch-slope", x1: -9.2, y1: 2, x2: -6.8, y2: 2.5 }],
      holes: [],
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

  it("detects projectile hits inside the thickness of sloped terrain", () => {
    const terrain = {
      blocks: [],
      segments: [{ id: "slope", x1: 4, y1: 3, x2: 8, y2: 2 }],
      holes: [],
    };
    const quadratic = { a: 0, h: 0, k: 2.2 };

    const hit = findProjectileTerrainImpact({ x: 8, y: 2.5 }, quadratic, { x: 5.8, y: 2.55 }, terrain);

    expect(hit?.blockId).toBe("slope");
    expect(hit?.point.x).toBeGreaterThan(6);
  });

  it("creates a circular hole using the blast radius", () => {
    const terrain = {
      blocks: [{ id: "platform", x: -1, y: 2, width: 4, height: 0.5 }],
      segments: [],
      holes: [],
    };

    const next = destroyTerrain(terrain, { x: 1, y: 2.25 }, 1);

    expect(next.blocks).toHaveLength(1);
    expect(next.holes).toEqual([{ id: "blast-1", x: 1, y: 2.25, radius: 1 }]);
    expect(findSupportYOrNull(1, 10, next)).toBeNull();
    expect(findSupportYOrNull(-1, 10, next)).toBe(2.5);
  });

  it("creates a circular hole through sloped terrain", () => {
    const terrain = {
      blocks: [],
      segments: [{ id: "slope", x1: -2, y1: 1, x2: 2, y2: 3 }],
      holes: [],
    };

    const next = destroyTerrain(terrain, { x: 0, y: 2 }, 0.6);

    expect(next.blocks).toHaveLength(0);
    expect(next.segments).toHaveLength(1);
    expect(next.holes[0].radius).toBe(0.6);
    expect(findSupportYOrNull(0, 10, next)).toBeNull();
    expect(findSupportYOrNull(-1, 10, next)).toBe(1.5);
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

  it("marks unsupported players as falling into the sea when base terrain is disabled", () => {
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
        tankPosition: { x: 8, y: 2.5 },
        hp: 100,
        isActive: false,
      },
    ];

    expect(findSupportYOrNull(0, 2.5, [])).toBeNull();
    expect(settlePlayersOnTerrain(players, [], false)[0].tankPosition).toEqual({
      x: 0,
      y: OCEAN_FALL_Y,
    });
  });

  it("calculates support height on sloped terrain with linear interpolation", () => {
    const slope: TerrainSegment = { id: "slope", x1: -2, y1: 1, x2: 2, y2: 3 };
    const terrain = {
      blocks: [],
      segments: [slope],
      holes: [],
    };

    expect(getSegmentYAtX(slope, 0)).toBe(2);
    expect(findSupportY(0, 10, terrain)).toBe(2);
    expect(findSupportY(1, 10, terrain)).toBe(2.5);
    expect(findSupportAtX(1, 10, terrain)).toEqual({ y: 2.5, slope: 0.5 });
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
      holes: [],
    };

    expect(settlePlayersOnTerrain(players, terrain)[0].tankPosition.y).toBe(2.99);
  });
});
