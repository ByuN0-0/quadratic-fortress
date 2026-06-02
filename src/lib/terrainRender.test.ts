import { describe, expect, it } from "vitest";
import type { TerrainColumnMap, TerrainColumnSegment } from "./terrain";
import { buildColumnRenderShapes } from "./terrainRender";

const destructibleBlock = (
  bottomY: number,
  topY: number,
): TerrainColumnSegment => ({
  bottomY,
  topY,
  type: "block",
  destructible: true,
  topKind: "flat",
});

describe("terrain render shapes", () => {
  it("keeps separated segments in the same column as separate shapes", () => {
    const columns: TerrainColumnMap = new Map([
      [1000, [destructibleBlock(0, 1.5), destructibleBlock(2.8, 3.2)]],
    ]);

    const shapes = buildColumnRenderShapes(columns);

    expect(shapes).toHaveLength(2);
    expect(shapes.map((shape) => shape.slices)).toEqual([
      [{ index: 1000, segment: destructibleBlock(0, 1.5) }],
      [{ index: 1000, segment: destructibleBlock(2.8, 3.2) }],
    ]);
  });

  it("matches adjacent column segments one-to-one instead of bridging a hole", () => {
    const columns: TerrainColumnMap = new Map([
      [1000, [destructibleBlock(0, 1), destructibleBlock(4, 5)]],
      [1001, [destructibleBlock(0, 1), destructibleBlock(4, 5)]],
    ]);

    const shapes = buildColumnRenderShapes(columns);

    expect(shapes).toHaveLength(2);
    expect(shapes.map((shape) => shape.slices.map((slice) => slice.segment))).toEqual([
      [destructibleBlock(0, 1), destructibleBlock(0, 1)],
      [destructibleBlock(4, 5), destructibleBlock(4, 5)],
    ]);
  });
});
