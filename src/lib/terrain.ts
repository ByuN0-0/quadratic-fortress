import {
  BOARD,
  FLOAT_EPSILON,
  getYAtX,
  round,
  roundToStep,
  type Point,
  type Quadratic,
} from "./math";
import type { Player } from "./game";

export type TerrainBlock = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TerrainSegment = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TerrainState = {
  blocks: TerrainBlock[];
  segments: TerrainSegment[];
  holes: TerrainHole[];
};

export type TerrainMapId = "map1" | "map2" | "map3";

export type TerrainHole = {
  id: string;
  x: number;
  y: number;
  radius: number;
};

export const AIR_TERRAIN_HEIGHT = 0.5;
export const SUPPORT_TOLERANCE = 0.08;
export const OCEAN_FALL_Y = -1;
export const TERRAIN_MAP_IDS: TerrainMapId[] = ["map1", "map2", "map3"];

const INITIAL_TERRAIN_BY_MAP: Record<
  TerrainMapId,
  { blocks: TerrainBlock[]; segments: TerrainSegment[] }
> = {
  map1: {
    blocks: [
      { id: "air-left", x: -9.2, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      { id: "air-center", x: -1.5, y: 4, width: 3, height: AIR_TERRAIN_HEIGHT },
      { id: "air-right", x: 6.8, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      ...createDigitThreeBlocks("map1-3", -5, 5),
      ...createDigitOneBlocks("map1-1", 2, 5),
      { id: "map1-middle-mark-left", x: -1, y: 7, width: 1, height: 1 },
      { id: "map1-middle-mark-right", x: 0, y: 7, width: 1, height: 1 },
    ],
    segments: [
      { id: "slope-up-left", x1: -6.8, y1: 2.5, x2: -1.5, y2: 4.5 },
      { id: "slope-down-right", x1: 1.5, y1: 4.5, x2: 6.8, y2: 2.5 },
    ],
  },
  map2: {
    blocks: [
      { id: "map2-left", x: -9.2, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      { id: "map2-center", x: -1.5, y: 4, width: 3, height: AIR_TERRAIN_HEIGHT },
      { id: "map2-right", x: 6.8, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      ...createDigitThreeBlocks("map2-3", -5, 5),
      ...createDigitTwoBlocks("map2-2", 2, 5),
      { id: "map2-middle-mark-left", x: -1, y: 7, width: 1, height: 1 },
      { id: "map2-middle-mark-right", x: 0, y: 7, width: 1, height: 1 },
    ],
    segments: [
      { id: "map2-slope-up-left", x1: -6.8, y1: 2.5, x2: -1.5, y2: 4.5 },
      { id: "map2-slope-down-right", x1: 1.5, y1: 4.5, x2: 6.8, y2: 2.5 },
    ],
  },
  map3: {
    blocks: [
      { id: "map3-left", x: -9.2, y: 2.5, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      { id: "map3-center", x: -2.2, y: 5, width: 4.4, height: AIR_TERRAIN_HEIGHT },
      { id: "map3-right", x: 6.8, y: 2.5, width: 2.4, height: AIR_TERRAIN_HEIGHT },
    ],
    segments: [
      { id: "map3-left-rise", x1: -6.8, y1: 3, x2: -2.2, y2: 5.5 },
      { id: "map3-right-drop", x1: 2.2, y1: 5.5, x2: 6.8, y2: 3 },
    ],
  },
};

function createDigitThreeBlocks(prefix: string, x: number, y: number): TerrainBlock[] {
  return createDigitBlocks(prefix, x, y, [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [2, 3],
    [0, 4],
    [1, 4],
    [2, 4],
  ]);
}

function createDigitTwoBlocks(prefix: string, x: number, y: number): TerrainBlock[] {
  return createDigitBlocks(prefix, x, y, [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [2, 3],
    [0, 4],
    [1, 4],
    [2, 4],
  ]);
}

function createDigitOneBlocks(prefix: string, x: number, y: number): TerrainBlock[] {
  return createDigitBlocks(prefix, x, y, [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
  ]);
}

function createDigitBlocks(prefix: string, x: number, y: number, cells: [number, number][]): TerrainBlock[] {
  return cells.map(([cellX, cellY]) => ({
    id: `${prefix}-${cellX}-${cellY}`,
    x: x + cellX,
    y: y + cellY,
    width: 1,
    height: 1,
  }));
}

export function createInitialTerrain(mapId: TerrainMapId = "map1"): TerrainState {
  const terrain = INITIAL_TERRAIN_BY_MAP[mapId] ?? INITIAL_TERRAIN_BY_MAP.map1;

  return {
    blocks: terrain.blocks.map((block) => ({ ...block })),
    segments: terrain.segments.map((segment) => ({ ...segment })),
    holes: [],
  };
}

export function getTerrainMapLabel(mapId: TerrainMapId): string {
  const labels: Record<TerrainMapId, string> = {
    map1: "3학년 1반",
    map2: "3학년 2반",
    map3: "맵3",
  };

  return labels[mapId];
}

export function findProjectileTerrainImpact(
  shooter: Point,
  quadratic: Quadratic,
  groundImpact: Point,
  terrain: TerrainState | TerrainBlock[],
  minTravelDistance = 0,
): { point: Point; blockId: string } | null {
  if (!Number.isFinite(quadratic.a)) {
    return null;
  }

  const normalizedTerrain = normalizeTerrain(terrain);
  const { blocks, segments, holes } = normalizedTerrain;
  const distanceX = groundImpact.x - shooter.x;
  const steps = Math.max(1, Math.ceil(Math.abs(distanceX) / 0.02));

  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const x = shooter.x + distanceX * t;
    const y = getYAtX(quadratic, x);
    const traveled = Math.hypot(x - shooter.x, y - shooter.y);

    if (traveled < minTravelDistance) {
      continue;
    }

    const point = { x, y };
    const hitBlock = blocks.find(
      (block) => isPointInsideBlock(point, block) && !isPointInsideAnyHole(point, holes),
    );
    const hitSegment = segments.find(
      (segment) => isPointInsideSegmentBody(point, segment) && !isPointInsideAnyHole(point, holes),
    );

    if (hitBlock) {
      return {
        point: { x: roundToStep(x), y: round(y, 2) },
        blockId: hitBlock.id,
      };
    }

    if (hitSegment) {
      return {
        point: { x: roundToStep(x), y: round(y, 2) },
        blockId: hitSegment.id,
      };
    }
  }

  return null;
}

export function destroyTerrainBlocks(
  blocks: TerrainBlock[],
  center: Point,
  radius: number,
): TerrainBlock[] {
  return blocks.flatMap((block) => splitBlockByBlast(block, center, radius));
}

export function destroyTerrain(
  terrain: TerrainState,
  center: Point,
  radius: number,
): TerrainState {
  if (!doesBlastTouchTerrain(terrain, center, radius)) {
    return terrain;
  }

  return {
    ...terrain,
    holes: [
      ...terrain.holes,
      {
        id: `blast-${terrain.holes.length + 1}`,
        x: round(center.x, 2),
        y: round(center.y, 2),
        radius,
      },
    ],
  };
}

export function settlePlayersOnTerrain(
  players: [Player, Player],
  terrain: TerrainState | TerrainBlock[],
  hasBaseTerrain = true,
): [Player, Player] {
  const normalizedTerrain = normalizeTerrain(terrain);

  return players.map((player) => {
    const supportY = findSupportYOrNull(player.tankPosition.x, player.tankPosition.y, normalizedTerrain);
    if (supportY !== null && Math.abs(player.tankPosition.y - supportY) <= SUPPORT_TOLERANCE) {
      return player;
    }

    return {
      ...player,
      tankPosition: {
        ...player.tankPosition,
        y: supportY ?? (hasBaseTerrain ? BOARD.yMin : OCEAN_FALL_Y),
      },
    };
  }) as [Player, Player];
}

export function findSupportY(
  x: number,
  fromY: number,
  terrain: TerrainState | TerrainBlock[],
): number {
  return findSupportYOrNull(x, fromY, terrain) ?? BOARD.yMin;
}

export function findSupportYOrNull(
  x: number,
  fromY: number,
  terrain: TerrainState | TerrainBlock[],
): number | null {
  const normalizedTerrain = normalizeTerrain(terrain);
  const { blocks, segments, holes } = normalizedTerrain;
  const blockY = blocks
    .filter((block) => blockCoversX(block, x))
    .map((block) => block.y + block.height)
    .filter((topY) => !isPointInsideAnyHole({ x, y: topY }, holes))
    .filter((topY) => topY <= fromY + SUPPORT_TOLERANCE);
  const segmentY = segments
    .filter((segment) => segmentCoversX(segment, x))
    .map((segment) => getSegmentYAtX(segment, x))
    .filter((y) => !isPointInsideAnyHole({ x, y }, holes))
    .filter((y) => y <= fromY + SUPPORT_TOLERANCE);
  const supports = [...blockY, ...segmentY];
  if (supports.length === 0) {
    return null;
  }

  const platformY = supports.reduce((highest, topY) => Math.max(highest, topY), -Infinity);

  return round(platformY, 2);
}

export function findSupportAtX(
  x: number,
  fromY: number,
  terrain: TerrainState | TerrainBlock[],
): { y: number; slope: number } | null {
  const normalizedTerrain = normalizeTerrain(terrain);
  const blockSupports = normalizedTerrain.blocks
    .filter((block) => blockCoversX(block, x))
    .map((block) => ({ y: block.y + block.height, slope: 0 }))
    .filter((support) => !isPointInsideAnyHole({ x, y: support.y }, normalizedTerrain.holes))
    .filter((support) => support.y <= fromY + SUPPORT_TOLERANCE);
  const segmentSupports = normalizedTerrain.segments
    .filter((segment) => segmentCoversX(segment, x))
    .map((segment) => ({ y: getSegmentYAtX(segment, x), slope: getSegmentSlope(segment) }))
    .filter((support) => !isPointInsideAnyHole({ x, y: support.y }, normalizedTerrain.holes))
    .filter((support) => support.y <= fromY + SUPPORT_TOLERANCE);
  const supports = [...blockSupports, ...segmentSupports];

  if (supports.length === 0) {
    return null;
  }

  return supports.reduce((highest, support) => (support.y > highest.y ? support : highest), {
    y: -Infinity,
    slope: 0,
  });
}

export function isPlayerSupported(
  position: Point,
  terrain: TerrainState | TerrainBlock[],
): boolean {
  return Math.abs(position.y - findSupportY(position.x, position.y, terrain)) <= SUPPORT_TOLERANCE;
}

export function getSegmentYAtX(segment: TerrainSegment, x: number): number {
  if (Math.abs(segment.x2 - segment.x1) <= FLOAT_EPSILON) {
    return Math.max(segment.y1, segment.y2);
  }

  const progress = (x - segment.x1) / (segment.x2 - segment.x1);
  return segment.y1 + (segment.y2 - segment.y1) * progress;
}

export function getSegmentSlope(segment: TerrainSegment): number {
  if (Math.abs(segment.x2 - segment.x1) <= FLOAT_EPSILON) {
    return Infinity;
  }

  return (segment.y2 - segment.y1) / (segment.x2 - segment.x1);
}

function splitBlockByBlast(block: TerrainBlock, center: Point, radius: number): TerrainBlock[] {
  const closestY = Math.max(block.y, Math.min(center.y, block.y + block.height));
  const verticalDistance = Math.abs(center.y - closestY);

  if (verticalDistance >= radius) {
    return [block];
  }

  const horizontalReach = Math.sqrt(radius ** 2 - verticalDistance ** 2);
  const removeLeft = Math.max(block.x, center.x - horizontalReach);
  const removeRight = Math.min(block.x + block.width, center.x + horizontalReach);

  if (removeLeft >= removeRight) {
    return [block];
  }

  const nextBlocks: TerrainBlock[] = [];
  const leftWidth = removeLeft - block.x;
  const rightWidth = block.x + block.width - removeRight;

  if (leftWidth > FLOAT_EPSILON) {
    nextBlocks.push({
      ...block,
      id: `${block.id}-l`,
      width: round(leftWidth, 2),
    });
  }

  if (rightWidth > FLOAT_EPSILON) {
    nextBlocks.push({
      ...block,
      id: `${block.id}-r`,
      x: round(removeRight, 2),
      width: round(rightWidth, 2),
    });
  }

  return nextBlocks;
}

function isPointInsideBlock(point: Point, block: TerrainBlock): boolean {
  return (
    point.x >= block.x - FLOAT_EPSILON &&
    point.x <= block.x + block.width + FLOAT_EPSILON &&
    point.y >= block.y - FLOAT_EPSILON &&
    point.y <= block.y + block.height + FLOAT_EPSILON
  );
}

function blockCoversX(block: TerrainBlock, x: number): boolean {
  return x >= block.x - FLOAT_EPSILON && x <= block.x + block.width + FLOAT_EPSILON;
}

function normalizeTerrain(terrain: TerrainState | TerrainBlock[]): TerrainState {
  return Array.isArray(terrain)
    ? {
        blocks: terrain,
        segments: [],
        holes: [],
      }
    : terrain;
}

function segmentCoversX(segment: TerrainSegment, x: number): boolean {
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);
  return x >= minX - FLOAT_EPSILON && x <= maxX + FLOAT_EPSILON;
}

function isPointInsideSegmentBody(point: Point, segment: TerrainSegment): boolean {
  if (!segmentCoversX(segment, point.x)) {
    return false;
  }

  const topY = getSegmentYAtX(segment, point.x);
  return point.y <= topY + FLOAT_EPSILON && point.y >= topY - AIR_TERRAIN_HEIGHT - FLOAT_EPSILON;
}

function isPointInsideAnyHole(point: Point, holes: TerrainHole[]): boolean {
  return holes.some((hole) => Math.hypot(point.x - hole.x, point.y - hole.y) <= hole.radius);
}

function doesBlastTouchTerrain(terrain: TerrainState, center: Point, radius: number): boolean {
  return (
    terrain.blocks.some((block) => blockIntersectsCircle(block, center, radius)) ||
    terrain.segments.some((segment) => segmentIntersectsCircle(segment, center, radius))
  );
}

function blockIntersectsCircle(block: TerrainBlock, center: Point, radius: number): boolean {
  const closestX = Math.max(block.x, Math.min(center.x, block.x + block.width));
  const closestY = Math.max(block.y, Math.min(center.y, block.y + block.height));
  return Math.hypot(center.x - closestX, center.y - closestY) <= radius;
}

function segmentIntersectsCircle(segment: TerrainSegment, center: Point, radius: number): boolean {
  return (
    segmentLineIntersectsCircle(segment.x1, segment.y1, segment.x2, segment.y2, center, radius) ||
    segmentLineIntersectsCircle(
      segment.x1,
      segment.y1 - AIR_TERRAIN_HEIGHT,
      segment.x2,
      segment.y2 - AIR_TERRAIN_HEIGHT,
      center,
      radius,
    ) ||
    isPointInsideSegmentBody(center, segment)
  );
}

function segmentLineIntersectsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  center: Point,
  radius: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx ** 2 + dy ** 2;

  if (lengthSquared <= FLOAT_EPSILON) {
    return Math.hypot(center.x - x1, center.y - y1) <= radius;
  }

  const t = Math.max(
    0,
    Math.min(1, ((center.x - x1) * dx + (center.y - y1) * dy) / lengthSquared),
  );
  const closest = {
    x: x1 + dx * t,
    y: y1 + dy * t,
  };

  return Math.hypot(center.x - closest.x, center.y - closest.y) <= radius;
}
