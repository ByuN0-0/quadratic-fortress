import type { TerrainColumnMap, TerrainColumnSegment } from "./terrain";

const RENDER_CONNECT_EPSILON = 0.001;

export type ColumnRenderSlice = {
  index: number;
  segment: TerrainColumnSegment;
};

export type ColumnRenderShape = {
  slices: ColumnRenderSlice[];
};

type ColumnRenderNode = {
  key: string;
  index: number;
  segment: TerrainColumnSegment;
};

export function buildColumnRenderShapes(columns: TerrainColumnMap): ColumnRenderShape[] {
  const nodes = [...columns.entries()].flatMap(([index, segments]) =>
    segments.map((segment, segmentIndex) => ({
      key: `${index}:${segmentIndex}`,
      index,
      segment,
    })),
  );
  const nodesByIndex = new Map<number, ColumnRenderNode[]>();

  for (const node of nodes) {
    const indexedNodes = nodesByIndex.get(node.index) ?? [];
    indexedNodes.push(node);
    nodesByIndex.set(node.index, indexedNodes);
  }

  const adjacency = buildColumnRenderAdjacency(nodesByIndex);
  const visited = new Set<string>();
  const shapes: ColumnRenderShape[] = [];

  for (const node of nodes) {
    if (visited.has(node.key)) {
      continue;
    }

    const queue = [node];
    const slices: ColumnRenderSlice[] = [];
    visited.add(node.key);

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current) {
        continue;
      }

      slices.push({ index: current.index, segment: current.segment });

      for (const neighbor of adjacency.get(current.key) ?? []) {
        if (visited.has(neighbor.key)) {
          continue;
        }

        visited.add(neighbor.key);
        queue.push(neighbor);
      }
    }

    shapes.push({
      slices: slices.sort(
        (a, b) =>
          a.index - b.index ||
          a.segment.bottomY - b.segment.bottomY ||
          a.segment.topY - b.segment.topY,
      ),
    });
  }

  return shapes;
}

function buildColumnRenderAdjacency(nodesByIndex: Map<number, ColumnRenderNode[]>) {
  const adjacency = new Map<string, ColumnRenderNode[]>();
  const indexes = [...nodesByIndex.keys()].sort((a, b) => a - b);

  for (const index of indexes) {
    const leftNodes = nodesByIndex.get(index) ?? [];
    const rightNodes = nodesByIndex.get(index + 1) ?? [];

    if (leftNodes.length === 0 || rightNodes.length === 0) {
      continue;
    }

    const matches = matchAdjacentColumnNodes(leftNodes, rightNodes);

    for (const [left, right] of matches) {
      const leftNeighbors = adjacency.get(left.key) ?? [];
      const rightNeighbors = adjacency.get(right.key) ?? [];
      leftNeighbors.push(right);
      rightNeighbors.push(left);
      adjacency.set(left.key, leftNeighbors);
      adjacency.set(right.key, rightNeighbors);
    }
  }

  return adjacency;
}

function matchAdjacentColumnNodes(
  leftNodes: ColumnRenderNode[],
  rightNodes: ColumnRenderNode[],
): Array<[ColumnRenderNode, ColumnRenderNode]> {
  const candidates = leftNodes
    .flatMap((left) =>
      rightNodes.map((right) => ({
        left,
        right,
        distance: Math.abs(getSegmentCenterY(left.segment) - getSegmentCenterY(right.segment)),
      })),
    )
    .filter(({ left, right }) => doColumnSegmentsConnect(left.segment, right.segment))
    .sort((a, b) => a.distance - b.distance);
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  const matches: Array<[ColumnRenderNode, ColumnRenderNode]> = [];

  for (const candidate of candidates) {
    if (usedLeft.has(candidate.left.key) || usedRight.has(candidate.right.key)) {
      continue;
    }

    usedLeft.add(candidate.left.key);
    usedRight.add(candidate.right.key);
    matches.push([candidate.left, candidate.right]);
  }

  return matches;
}

function doColumnSegmentsConnect(a: TerrainColumnSegment, b: TerrainColumnSegment) {
  const overlap = Math.min(a.topY, b.topY) - Math.max(a.bottomY, b.bottomY);
  const touches =
    Math.abs(a.topY - b.bottomY) < RENDER_CONNECT_EPSILON ||
    Math.abs(b.topY - a.bottomY) < RENDER_CONNECT_EPSILON;

  return overlap > RENDER_CONNECT_EPSILON || touches;
}

function getSegmentCenterY(segment: TerrainColumnSegment) {
  return (segment.topY + segment.bottomY) / 2;
}
