import { describe, expect, it } from "vitest";
import {
  buildTerrainColumnMap,
  createInitialTerrain,
  destroyTerrain,
  destroyTerrainColumns,
  findDestructibleSegmentsInsideBlast,
  findColumnSupportAtX,
  findProjectileTerrainImpact,
  findSupportY,
  findSupportAtX,
  findSupportYOrNull,
  getTerrainMapCategory,
  getTerrainMapCategoryDescription,
  getTerrainMapCategoryLabel,
  getTerrainMapDescription,
  getTerrainMapIdsByCategory,
  getTerrainMapLabel,
  getSegmentYAtX,
  OCEAN_FALL_Y,
  settlePlayersOnTerrain,
  TERRAIN_MAP_IDS,
  terrainColumnIndex,
  type TerrainBlock,
  type TerrainColumnMap,
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

    expect(hit?.blockId).toBe("terrain-column");
    expect(hit?.collisionType).toBe("terrain");
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
    const map10 = createInitialTerrain("map10");

    expect(map1.blocks.map((block) => block.id)).not.toEqual(map2.blocks.map((block) => block.id));
    expect(map2.blocks.map((block) => block.id)).not.toEqual(map3.blocks.map((block) => block.id));
    expect(map5.blocks.map((block) => block.id)).not.toEqual(map8.blocks.map((block) => block.id));
    expect(map8.blocks.map((block) => block.id)).not.toEqual(map10.blocks.map((block) => block.id));
    expect(TERRAIN_MAP_IDS).toEqual([
      "map1",
      "map2",
      "map5",
      "map6",
      "map7",
      "map8",
      "map9",
      "map10",
      "map3",
      "map4",
      "map11",
      "map12",
      "map13",
    ]);
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

  it("adds class maps for grades 3 through 8", () => {
    expect(getTerrainMapLabel("map5")).toBe("3학년 3반");
    expect(getTerrainMapLabel("map6")).toBe("3학년 4반");
    expect(getTerrainMapLabel("map7")).toBe("3학년 5반");
    expect(getTerrainMapLabel("map8")).toBe("3학년 6반");
    expect(getTerrainMapLabel("map9")).toBe("3학년 7반");
    expect(getTerrainMapLabel("map10")).toBe("3학년 8반");

    expect(createInitialTerrain("map5").blocks.some((block) => block.id.startsWith("map5-class"))).toBe(true);
    expect(createInitialTerrain("map8").blocks.some((block) => block.id.startsWith("map8-class"))).toBe(true);
    expect(createInitialTerrain("map9").blocks.some((block) => block.id.startsWith("map9-class"))).toBe(true);
    expect(createInitialTerrain("map10").blocks.some((block) => block.id.startsWith("map10-class"))).toBe(true);
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

  it("groups terrain maps by selection category", () => {
    expect(getTerrainMapCategoryLabel("jangwi")).toBe("장위중학교");
    expect(getTerrainMapCategoryLabel("etc")).toBe("기타맵");
    expect(getTerrainMapCategoryDescription("jangwi")).toContain("3학년");
    expect(getTerrainMapCategoryDescription("etc")).toContain("열쇠");
    expect(getTerrainMapIdsByCategory("jangwi")).toEqual([
      "map1",
      "map2",
      "map5",
      "map6",
      "map7",
      "map8",
      "map9",
      "map10",
    ]);
    expect(getTerrainMapIdsByCategory("etc")).toEqual(["map3", "map4", "map11", "map12", "map13"]);
    expect(getTerrainMapCategory("map1")).toBe("jangwi");
    expect(getTerrainMapCategory("map11")).toBe("etc");
    expect(getTerrainMapCategory("map12")).toBe("etc");
    expect(getTerrainMapCategory("map13")).toBe("etc");
  });

  it("adds the maze map as an etc map", () => {
    const map11 = createInitialTerrain("map11");

    expect(getTerrainMapLabel("map11")).toBe("미로");
    expect(getTerrainMapDescription("map11")).toContain("여러 통로");
    expect(map11.blocks.some((block) => block.id.startsWith("map11-maze"))).toBe(true);
    expect(map11.blocks.some((block) => block.id.startsWith("map11-foundation"))).toBe(false);
    expect(map11.blocks.some((block) => block.isFoundation)).toBe(false);
  });

  it("adds the corridor map as an etc map", () => {
    const map12 = createInitialTerrain("map12");

    expect(getTerrainMapLabel("map12")).toBe("회랑");
    expect(getTerrainMapDescription("map12")).toContain("긴 통로");
    expect(map12.blocks.some((block) => block.id.startsWith("map12-corridor"))).toBe(true);
    expect(map12.blocks.some((block) => block.x === -1 && block.y === 0)).toBe(false);
    expect(map12.blocks.filter((block) => block.y === 0 && block.x >= -4 && block.x <= -2)).toHaveLength(3);
    expect(findSupportYOrNull(-8, 10, map12)).toBe(9);
    expect(findSupportYOrNull(8, 10, map12)).toBe(9);
  });

  it("adds the sailboat map as an etc map", () => {
    const map13 = createInitialTerrain("map13");

    expect(map13.blocks.some((block) => block.id.startsWith("map13-sailboat"))).toBe(true);
    expect(map13.blocks.some((block) => block.x === 4 && block.y === 8)).toBe(false);
    expect(map13.blocks.some((block) => block.x === 5 && block.y === 8)).toBe(true);
    expect(map13.blocks.some((block) => block.x === 6 && block.y === 8)).toBe(false);
    expect(map13.blocks.filter((block) => (
      block.id.startsWith("map13-sailboat") && (
        (block.x === 4 && block.y === 7) ||
        (block.x === 5 && block.y === 8) ||
        (block.x === 6 && block.y === 7)
      )
    ))).toHaveLength(3);
    expect(findSupportYOrNull(-8, 10, map13)).toBe(4);
    expect(findSupportYOrNull(8, 10, map13)).toBe(4);
  });


  it("keeps only the lowest class-map safety layer non-destructible", () => {
    const classMapIds = ["map1", "map2", "map5", "map6", "map7", "map8", "map9", "map10"] as const;

    for (const mapId of classMapIds) {
      const columns = buildTerrainColumnMap(createInitialTerrain(mapId));
      const leftStartColumn = columns.get(terrainColumnIndex(-8));
      const rightStartColumn = columns.get(terrainColumnIndex(8));
      const leftSideColumn = columns.get(terrainColumnIndex(-9.5));
      const centerColumn = columns.get(terrainColumnIndex(0));

      expect(leftStartColumn?.some((segment) => segment.topY === 2.5 && segment.destructible)).toBe(true);
      expect(rightStartColumn?.some((segment) => segment.topY === 2.5 && segment.destructible)).toBe(true);
      expect(leftSideColumn?.some((segment) => segment.topY === 2.9 && segment.destructible)).toBe(true);
      expect(centerColumn?.some((segment) => segment.topY === 3.4 && segment.destructible)).toBe(true);
      expect(centerColumn?.some((segment) => segment.bottomY === 0 && segment.topY === 0.5 && !segment.destructible)).toBe(true);
      expect(centerColumn?.some((segment) => segment.bottomY === 0.5 && segment.topY === 2 && segment.destructible)).toBe(true);
    }
  });

  it("can create class maps without the non-destructible safety layer", () => {
    const classMapIds = ["map1", "map2", "map5", "map6", "map7", "map8", "map9", "map10"] as const;

    for (const mapId of classMapIds) {
      const normalTerrain = createInitialTerrain(mapId);
      const oceanTerrain = createInitialTerrain(mapId, { includeSafeBase: false });

      expect(normalTerrain.blocks.some((block) => block.id.endsWith("-safe-base") && block.isFoundation)).toBe(true);
      expect(oceanTerrain.blocks.some((block) => block.id.endsWith("-safe-base"))).toBe(false);
      expect(oceanTerrain.blocks.some((block) => block.id.endsWith("-playable-base") && !block.isFoundation)).toBe(true);
    }
  });

  it("destroys class-map playable ground inside a tank-centered blast while keeping the safety layer", () => {
    const classMapIds = ["map1", "map2", "map5", "map6", "map7", "map8", "map9", "map10"] as const;

    for (const mapId of classMapIds) {
      const center = { x: 8, y: 2.5 };
      const radius = 1;
      const next = destroyTerrain(createInitialTerrain(mapId), center, radius);
      const columns = buildTerrainColumnMap(next);
      const impactColumn = columns.get(terrainColumnIndex(center.x));

      expect(findDestructibleSegmentsInsideBlast(columns, center, radius)).toEqual([]);
      expect(impactColumn?.some((segment) => segment.bottomY === 0 && segment.topY === 0.5 && !segment.destructible)).toBe(true);
      expect(impactColumn?.some((segment) => segment.destructible && segment.topY > 1.5 && segment.bottomY < 2)).toBe(false);
    }
  });

  it("keeps check tile terrain destructible inside a blast", () => {
    const center = { x: -8, y: 8 };
    const radius = 1;
    const next = destroyTerrain(createInitialTerrain("map4"), center, radius);

    expect(findDestructibleSegmentsInsideBlast(buildTerrainColumnMap(next), center, radius)).toEqual([]);
  });

  it("builds multiple vertical terrain intervals in a single x column", () => {
    const columns = buildTerrainColumnMap({
      blocks: [
        { id: "floor", x: -1, y: 0, width: 2, height: 1, isFoundation: true },
        { id: "platform", x: -1, y: 4, width: 2, height: 0.5 },
      ],
      segments: [],
      holes: [],
    });

    const highSupport = findColumnSupportAtX(columns, 0, 10);
    const lowSupport = findColumnSupportAtX(columns, 0, 2);

    expect(highSupport?.topY).toBe(4.5);
    expect(lowSupport?.topY).toBe(1);
  });

  it("subtracts circular holes from terrain columns for movement support", () => {
    const columns = buildTerrainColumnMap({
      blocks: [{ id: "base", x: -10, y: 0, width: 20, height: 2 }],
      segments: [],
      holes: [{ id: "blast", x: 8, y: 2, radius: 1 }],
    });
    const support = findColumnSupportAtX(columns, 7.5, 3);

    expect(support?.topY).toBeCloseTo(1.13);
    expect(support?.topKind).toBe("hole");
  });

  it("splits a destructible column segment when a blast cuts through the middle", () => {
    const columns: TerrainColumnMap = new Map([
      [
        1000,
        [
          {
            topY: 5,
            bottomY: 0,
            type: "block",
            destructible: true,
            topKind: "flat",
          },
        ],
      ],
    ]);

    const next = destroyTerrainColumns(columns, { x: 0, y: 2.5 }, 0.5);
    const column = next.get(1000);

    expect(column).toEqual([
      { topY: 5, bottomY: 3, type: "block", destructible: true, topKind: "flat" },
      { topY: 2, bottomY: 0, type: "block", destructible: true, topKind: "hole" },
    ]);
  });

  it("keeps non-destructible column segments after a blast", () => {
    const columns: TerrainColumnMap = new Map([
      [
        1000,
        [
          {
            topY: 2,
            bottomY: 0,
            type: "foundation",
            destructible: false,
            topKind: "flat",
          },
        ],
      ],
    ]);

    const next = destroyTerrainColumns(columns, { x: 0, y: 1 }, 1);

    expect(next.get(1000)).toEqual(columns.get(1000));
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


  it("does not return terrain impacts inside the launch safety distance", () => {
    const quadratic = calculateQuadratic({ x: -8, y: 2.5 }, { x: 0, y: 6 });
    const terrain = {
      blocks: [{ id: "launch-platform", x: -8.2, y: 2, width: 0.6, height: 0.5 }],
      segments: [],
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

  it("detects terrain impacts after the launch safety distance", () => {
    const quadratic = calculateQuadratic({ x: -8, y: 2.5 }, { x: 0, y: 6 });
    const terrain = {
      blocks: [{ id: "far-platform", x: -4.4, y: 4.8, width: 1, height: 0.5 }],
      segments: [],
      holes: [],
    };

    const hit = findProjectileTerrainImpact(
      { x: -8, y: 2.5 },
      quadratic,
      { x: 8, y: 0 },
      terrain,
      0.7,
    );

    expect(hit?.collisionType).toBe("terrain");
    expect(hit?.point.x).toBeGreaterThan(-5);
  });  it("detects projectile hits inside the thickness of sloped terrain", () => {
    const terrain = {
      blocks: [],
      segments: [{ id: "slope", x1: 4, y1: 3, x2: 8, y2: 2 }],
      holes: [],
    };
    const quadratic = { a: 0, h: 0, k: 2.2 };

    const hit = findProjectileTerrainImpact({ x: 8, y: 2.5 }, quadratic, { x: 5.8, y: 2.55 }, terrain);

    expect(hit?.blockId).toBe("terrain-column");
    expect(hit?.collisionType).toBe("terrain");
    expect(hit?.point.x).toBeGreaterThan(6);
  });

  it("uses a nearby terrain hit when the armed path would otherwise tunnel through a crater", () => {
    const terrain = {
      blocks: [{ id: "base", x: -10, y: 0, width: 20, height: 2 }],
      segments: [],
      holes: [{ id: "blast", x: -2, y: 0, radius: 1.5 }],
    };
    const quadratic = { a: 0, h: 0, k: 1.6 };

    const hit = findProjectileTerrainImpact(
      { x: -2, y: 2 },
      quadratic,
      { x: -1, y: 1.6 },
      terrain,
      0.7,
    );

    expect(hit?.blockId).toBe("terrain-column");
    expect(hit?.collisionType).toBe("terrain");
    expect(hit?.point.y).toBeGreaterThan(1.4);
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
