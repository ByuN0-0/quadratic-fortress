import { describe, expect, it } from "vitest";
import {
  createInitialTerrain,
  destroyTerrain,
  findProjectileTerrainImpact,
  findSupportY,
  findSupportAtX,
  findSupportYOrNull,
  getTerrainMapLabel,
  getSegmentYAtX,
  OCEAN_FALL_Y,
  settlePlayersOnTerrain,
  TERRAIN_MAP_IDS,
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
    const map4 = createInitialTerrain("map4");
    const map5 = createInitialTerrain("map5");
    const map8 = createInitialTerrain("map8");

    expect(map1.blocks.map((block) => block.id)).not.toEqual(map2.blocks.map((block) => block.id));
    expect(map2.blocks.map((block) => block.id)).not.toEqual(map3.blocks.map((block) => block.id));
    expect(map5.blocks.map((block) => block.id)).not.toEqual(map8.blocks.map((block) => block.id));
    expect(TERRAIN_MAP_IDS).toEqual(["map1", "map2", "map5", "map6", "map7", "map8", "map3", "map4"]);
    expect(map1.holes).toEqual([]);
    expect(map2.holes).toEqual([]);
    expect(map3.holes).toEqual([]);
    expect(map4.blocks.map((block) => block.id)).not.toEqual(map3.blocks.map((block) => block.id));
    expect(map4.segments).toEqual([]);
    expect(map4.holes).toEqual([]);
  });

  it("uses the check tile layout and label on map4", () => {
    const map4 = createInitialTerrain("map4");

    expect(getTerrainMapLabel("map4")).toBe("체크 타일");
    expect(map4.blocks.some((block) => block.id.startsWith("map4-left"))).toBe(true);
    expect(map4.blocks.some((block) => block.id.startsWith("map4-right"))).toBe(true);
  });

  it("adds class maps for grades 3 through 6", () => {
    expect(getTerrainMapLabel("map5")).toBe("3학년 3반");
    expect(getTerrainMapLabel("map6")).toBe("3학년 4반");
    expect(getTerrainMapLabel("map7")).toBe("3학년 5반");
    expect(getTerrainMapLabel("map8")).toBe("3학년 6반");

    expect(createInitialTerrain("map5").blocks.some((block) => block.id.startsWith("map5-class"))).toBe(true);
    expect(createInitialTerrain("map8").blocks.some((block) => block.id.startsWith("map8-class"))).toBe(true);
  });

  it("uses block pieces for the 3학년 4반 digit", () => {
    const map6 = createInitialTerrain("map6");

    expect(map6.segments.some((segment) => segment.id.includes("class-diagonal"))).toBe(false);
    expect(map6.blocks.some((block) => block.id === "map6-class-0-3")).toBe(true);
    expect(map6.blocks.some((block) => block.id === "map6-class-2-0")).toBe(true);
  });

  it("uses block-only terrain with half-height blocks on map3", () => {
    const map3 = createInitialTerrain("map3");

    expect(map3.segments).toEqual([]);
    expect(map3.blocks.some((block) => block.width === 1 && block.height === 0.5)).toBe(true);
    expect(map3.blocks.some((block) => block.id.startsWith("map3-left-base"))).toBe(true);
    expect(map3.blocks.some((block) => block.id.startsWith("map3-right-base"))).toBe(true);
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

  it("places a tank point on the top edge of a circular blast cut", () => {
    const players: [Player, Player] = [
      {
        id: "p1",
        name: "1P",
        tankPosition: { x: -7.6, y: 3 },
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
    const terrain = {
      blocks: [{ id: "platform", x: -9.2, y: 0, width: 2.4, height: 3 }],
      segments: [],
      holes: [{ id: "blast", x: -8, y: 2.1, radius: 1 }],
    };

    expect(findSupportYOrNull(-7.6, 3, terrain)).toBe(1.18);
    expect(settlePlayersOnTerrain(players, terrain, false)[0].tankPosition.y).toBe(1.18);
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
