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
};

export const AIR_TERRAIN_HEIGHT = 0.5;
export const SUPPORT_TOLERANCE = 0.08;

export function createInitialTerrain(): TerrainState {
  return {
    blocks: [
      { id: "air-left", x: -9.2, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      { id: "air-center", x: -1.5, y: 4, width: 3, height: AIR_TERRAIN_HEIGHT },
      { id: "air-right", x: 6.8, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
    ],
    segments: [
      { id: "slope-up-left", x1: -6.8, y1: 2.5, x2: -1.5, y2: 4.5 },
      { id: "slope-down-right", x1: 1.5, y1: 4.5, x2: 6.8, y2: 2.5 },
    ],
  };
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

  const { blocks, segments } = normalizeTerrain(terrain);
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

    const hitBlock = blocks.find((block) => isPointInsideBlock({ x, y }, block));
    const hitSegment = segments.find((segment) => isPointOnSegment({ x, y }, segment));

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
  return {
    blocks: destroyTerrainBlocks(terrain.blocks, center, radius),
    segments: terrain.segments.flatMap((segment) => splitSegmentByBlast(segment, center, radius)),
  };
}

export function settlePlayersOnTerrain(
  players: [Player, Player],
  terrain: TerrainState | TerrainBlock[],
): [Player, Player] {
  const normalizedTerrain = normalizeTerrain(terrain);

  return players.map((player) => {
    if (isPlayerSupported(player.tankPosition, normalizedTerrain)) {
      return player;
    }

    return {
      ...player,
      tankPosition: {
        ...player.tankPosition,
        y: findSupportY(player.tankPosition.x, player.tankPosition.y, normalizedTerrain),
      },
    };
  }) as [Player, Player];
}

export function findSupportY(
  x: number,
  fromY: number,
  terrain: TerrainState | TerrainBlock[],
): number {
  const { blocks, segments } = normalizeTerrain(terrain);
  const blockY = blocks
    .filter((block) => blockCoversX(block, x))
    .map((block) => block.y + block.height)
    .filter((topY) => topY <= fromY + SUPPORT_TOLERANCE);
  const segmentY = segments
    .filter((segment) => segmentCoversX(segment, x))
    .map((segment) => getSegmentYAtX(segment, x))
    .filter((y) => y <= fromY + SUPPORT_TOLERANCE);
  const platformY = [...blockY, ...segmentY].reduce(
    (highest, topY) => Math.max(highest, topY),
    BOARD.yMin,
  );

  return round(platformY, 2);
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

function splitSegmentByBlast(
  segment: TerrainSegment,
  center: Point,
  radius: number,
): TerrainSegment[] {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const fx = segment.x1 - center.x;
  const fy = segment.y1 - center.y;
  const a = dx ** 2 + dy ** 2;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx ** 2 + fy ** 2 - radius ** 2;
  const discriminant = b ** 2 - 4 * a * c;

  if (a <= FLOAT_EPSILON || discriminant <= 0) {
    return c <= 0 ? [] : [segment];
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDiscriminant) / (2 * a);
  const t2 = (-b + sqrtDiscriminant) / (2 * a);
  const removeStart = Math.max(0, Math.min(t1, t2));
  const removeEnd = Math.min(1, Math.max(t1, t2));

  if (removeStart >= 1 || removeEnd <= 0 || removeStart >= removeEnd) {
    return [segment];
  }

  const nextSegments: TerrainSegment[] = [];
  if (removeStart > FLOAT_EPSILON) {
    nextSegments.push(createSegmentSlice(segment, 0, removeStart, `${segment.id}-l`));
  }

  if (removeEnd < 1 - FLOAT_EPSILON) {
    nextSegments.push(createSegmentSlice(segment, removeEnd, 1, `${segment.id}-r`));
  }

  return nextSegments;
}

function createSegmentSlice(
  segment: TerrainSegment,
  fromT: number,
  toT: number,
  id: string,
): TerrainSegment {
  return {
    id,
    x1: round(segment.x1 + (segment.x2 - segment.x1) * fromT, 2),
    y1: round(segment.y1 + (segment.y2 - segment.y1) * fromT, 2),
    x2: round(segment.x1 + (segment.x2 - segment.x1) * toT, 2),
    y2: round(segment.y1 + (segment.y2 - segment.y1) * toT, 2),
  };
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
      }
    : terrain;
}

function segmentCoversX(segment: TerrainSegment, x: number): boolean {
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);
  return x >= minX - FLOAT_EPSILON && x <= maxX + FLOAT_EPSILON;
}

function isPointOnSegment(point: Point, segment: TerrainSegment): boolean {
  if (!segmentCoversX(segment, point.x)) {
    return false;
  }

  return Math.abs(point.y - getSegmentYAtX(segment, point.x)) <= 0.05;
}
