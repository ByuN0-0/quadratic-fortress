import { describe, expect, it } from "vitest";
import {
  assertNoDestructibleSegmentsInsideBlast,
  cleanupTerrainColumns,
  destroyTerrainColumns,
  findDestructibleSegmentsInsideBlast,
  MIN_TERRAIN_COLUMN_SEGMENT_HEIGHT,
  type TerrainColumnMap,
  type TerrainColumnSegment,
} from "./terrain";

const segment = (
  bottomY: number,
  topY: number,
  destructible = true,
): TerrainColumnSegment => ({
  bottomY,
  topY,
  type: destructible ? "block" : "foundation",
  destructible,
  topKind: "flat",
});

const segmentCount = (columns: TerrainColumnMap) =>
  [...columns.values()].reduce((count, segments) => count + segments.length, 0);

describe("terrain column cleanup", () => {
  it("removes destructible segments thinner than the cleanup threshold", () => {
    const columns: TerrainColumnMap = new Map([[1000, [segment(0, 0.04), segment(1, 2)]]]);

    const cleaned = cleanupTerrainColumns(columns);

    expect(cleaned.get(1000)).toEqual([segment(1, 2)]);
    expect(segment(0, MIN_TERRAIN_COLUMN_SEGMENT_HEIGHT).topY).toBe(0.05);
  });

  it("merges nearly touching segments when no blast gap is being protected", () => {
    const columns: TerrainColumnMap = new Map([[1000, [segment(0, 1), segment(1.01, 2)]]]);

    const cleaned = cleanupTerrainColumns(columns);

    expect(cleaned.get(1000)).toEqual([segment(0, 2)]);
  });

  it("does not merge a small gap when the gap is inside the latest blast circle", () => {
    const columns: TerrainColumnMap = new Map([[1000, [segment(0, 1), segment(1.01, 2)]]]);

    const cleaned = cleanupTerrainColumns(columns, {
      blastCenter: { x: 0, y: 1.005 },
      blastRadius: 0.005,
    });

    expect(cleaned.get(1000)).toEqual([segment(1.01, 2), segment(0, 1)]);
  });

  it("keeps non-destructible segments even when they are thin", () => {
    const columns: TerrainColumnMap = new Map([[1000, [segment(0, 0.01, false)]]]);

    const cleaned = cleanupTerrainColumns(columns);

    expect(cleaned.get(1000)).toEqual([segment(0, 0.01, false)]);
  });

  it("does not let cleanup restore a tiny blast gap after circular destruction", () => {
    const columns: TerrainColumnMap = new Map([[1000, [segment(0, 2)]]]);
    const center = { x: 0, y: 1.005 };
    const radius = 0.005;

    const destroyed = destroyTerrainColumns(columns, center, radius);

    const segments = destroyed.get(1000) ?? [];
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual(segment(1.01, 2));
    expect(segments[1]).toEqual(expect.objectContaining({ bottomY: 0, topKind: "hole" }));
    expect(segments[1].topY).toBeLessThanOrEqual(1);
    assertNoDestructibleSegmentsInsideBlast(destroyed, center, radius);
  });

  it("reports destructible residuals that remain inside a blast circle", () => {
    const columns: TerrainColumnMap = new Map([[1000, [segment(0.9, 1.1)]]]);

    const residuals = findDestructibleSegmentsInsideBlast(columns, { x: 0, y: 1 }, 0.2);

    expect(residuals).toEqual([
      expect.objectContaining({
        index: 1000,
        bottomY: 0.9,
        topY: 1.1,
        destructible: true,
        type: "block",
      }),
    ]);
    expect(() => assertNoDestructibleSegmentsInsideBlast(columns, { x: 0, y: 1 }, 0.2)).toThrow(
      /Destructible terrain remains inside blast/,
    );
  });

  it("does not report non-destructible terrain inside a blast circle as a destructible residual", () => {
    const columns: TerrainColumnMap = new Map([[1000, [segment(0.9, 1.1, false)]]]);

    expect(findDestructibleSegmentsInsideBlast(columns, { x: 0, y: 1 }, 0.2)).toEqual([]);
    expect(() => assertNoDestructibleSegmentsInsideBlast(columns, { x: 0, y: 1 }, 0.2)).not.toThrow();
  });

  it("removes destructible terrain samples inside the blast circle", () => {
    const columns: TerrainColumnMap = new Map();
    const center = { x: 0, y: 2.5 };
    const radius = 0.5;

    for (let index = 950; index <= 1050; index += 1) {
      columns.set(index, [segment(0, 5)]);
    }

    const destroyed = destroyTerrainColumns(columns, center, radius);

    for (const [index, segments] of destroyed.entries()) {
      const x = -10 + index * 0.01 + 0.005;

      for (const current of segments) {
        for (let y = current.bottomY; y <= current.topY; y += 0.02) {
          const distanceSquared = (x - center.x) ** 2 + (y - center.y) ** 2;
          expect(distanceSquared).toBeGreaterThan(radius ** 2 - 0.0001);
        }
      }
    }
  });

  it("removes the full vertical circle interval at the blast center column", () => {
    const columns: TerrainColumnMap = new Map([[1000, [segment(0, 5)]]]);

    const destroyed = destroyTerrainColumns(columns, { x: 0, y: 2.5 }, 0.5);

    expect(destroyed.get(1000)).toEqual([
      segment(3, 5),
      { ...segment(0, 2), topKind: "hole" },
    ]);
  });

  it("preserves separated segments outside the exact blast circle", () => {
    const columns: TerrainColumnMap = new Map();
    const center = { x: 0, y: 2.5 };
    const radius = 0.5;

    for (let index = 950; index <= 1050; index += 1) {
      columns.set(index, [segment(0, 5)]);
    }

    const destroyed = destroyTerrainColumns(columns, center, radius);

    for (const [index, segments] of destroyed.entries()) {
      const x = -10 + index * 0.01 + 0.005;

      for (const current of segments.filter((item) => item.destructible)) {
        for (let y = current.bottomY; y <= current.topY; y += 0.01) {
          expect((x - center.x) ** 2 + (y - center.y) ** 2).toBeGreaterThan(radius ** 2 - 0.0001);
        }
      }
    }
  });

  it("does not grow segment counts on repeated destruction at the same point", () => {
    const columns: TerrainColumnMap = new Map([[1000, [segment(0, 5)]]]);

    const once = destroyTerrainColumns(columns, { x: 0, y: 2.5 }, 0.5);
    const twice = destroyTerrainColumns(once, { x: 0, y: 2.5 }, 0.5);

    expect(segmentCount(twice)).toBeLessThanOrEqual(segmentCount(once));
  });
});
