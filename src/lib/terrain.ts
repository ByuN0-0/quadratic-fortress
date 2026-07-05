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
  isFoundation?: boolean;
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
  columns?: TerrainColumnMap;
};

export type TerrainMapId =
  | "map1"
  | "map2"
  | "map3"
  | "map4"
  | "map5"
  | "map6"
  | "map7"
  | "map8"
  | "map9"
  | "map10"
  | "map11"
  | "map12"
  | "map13";

export type TerrainMapCategory = "jangwi" | "etc";

export type TerrainHole = {
  id: string;
  x: number;
  y: number;
  radius: number;
};

export type CreateTerrainOptions = {
  includeSafeBase?: boolean;
};

type TerrainSupport = {
  y: number;
  slope: number;
};

export type TerrainColumnSegment = {
  topY: number;
  bottomY: number;
  type: "block" | "segment" | "foundation";
  destructible: boolean;
  topKind: "flat" | "slope" | "hole";
};

export type TerrainColumnMap = Map<number, TerrainColumnSegment[]>;

export type TerrainColumnCleanupOptions = {
  blastCenter?: Point;
  blastRadius?: number;
};

export type TerrainBlastResidual = {
  index: number;
  x: number;
  bottomY: number;
  topY: number;
  destructible: boolean;
  type: TerrainColumnSegment["type"];
  topKind: TerrainColumnSegment["topKind"];
};

export const AIR_TERRAIN_HEIGHT = 0.5;
export const TERRAIN_COLUMN_STEP = 0.01;
export const MIN_TERRAIN_COLUMN_SEGMENT_HEIGHT = 0.05;
export const SUPPORT_TOLERANCE = 0.08;
export const OCEAN_FALL_Y = -1;
const TERRAIN_COLUMN_CLEANUP_MERGE_GAP = 0.02;
const SAFE_FOUNDATION_HEIGHT = 0.5;
export const TERRAIN_MAP_IDS: TerrainMapId[] = [
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
];

const TERRAIN_MAP_METADATA: Record<
  TerrainMapId,
  { label: string; category: TerrainMapCategory; description: string }
> = {
  map1: {
    label: "3학년 1반",
    category: "jangwi",
    description: "3학년 1반 학급 숫자 지형에서 대결합니다.",
  },
  map2: {
    label: "3학년 2반",
    category: "jangwi",
    description: "3학년 2반 학급 숫자 지형에서 대결합니다.",
  },
  map5: {
    label: "3학년 3반",
    category: "jangwi",
    description: "3학년 3반 학급 숫자 지형에서 대결합니다.",
  },
  map6: {
    label: "3학년 4반",
    category: "jangwi",
    description: "3학년 4반 학급 숫자 지형에서 대결합니다.",
  },
  map7: {
    label: "3학년 5반",
    category: "jangwi",
    description: "3학년 5반 학급 숫자 지형에서 대결합니다.",
  },
  map8: {
    label: "3학년 6반",
    category: "jangwi",
    description: "3학년 6반 학급 숫자 지형에서 대결합니다.",
  },
  map9: {
    label: "3학년 7반",
    category: "jangwi",
    description: "3학년 7반 학급 숫자 지형에서 대결합니다.",
  },
  map10: {
    label: "3학년 8반",
    category: "jangwi",
    description: "3학년 8반 학급 숫자 지형에서 대결합니다.",
  },
  map3: {
    label: "열쇠",
    category: "etc",
    description: "열쇠 모양 지형의 통로를 공략합니다.",
  },
  map4: {
    label: "체크 타일",
    category: "etc",
    description: "떨어지는 발판을 계산하며 이동합니다.",
  },
  map11: {
    label: "미로",
    category: "etc",
    description: "여러 통로와 장애물을 피해 포물선 경로를 설계합니다.",
  },
  map12: {
    label: "회랑",
    category: "etc",
    description: "층층이 이어진 긴 통로 사이로 포물선 경로를 설계합니다.",
  },
  map13: {
    label: "돛단배",
    category: "etc",
    description: "돛대와 선체 지형을 피해 포물선 경로를 설계합니다.",
  },
};

const INITIAL_TERRAIN_BY_MAP: Record<
  TerrainMapId,
  { blocks: TerrainBlock[]; segments: TerrainSegment[] }
> = {
  map1: {
    blocks: [
      { id: "air-left", x: -9.2, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      { id: "air-center", x: -1.5, y: 4, width: 3, height: AIR_TERRAIN_HEIGHT },
      { id: "air-right", x: 6.8, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      ...createLowerFoundationBlocks("map1-foundation"),
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
      ...createLowerFoundationBlocks("map2-foundation"),
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
  map5: createClassMapTerrain("map5", 3),
  map6: createClassMapTerrain("map6", 4),
  map7: createClassMapTerrain("map7", 5),
  map8: createClassMapTerrain("map8", 6),
  map9: createClassMapTerrain("map9", 7),
  map10: createClassMapTerrain("map10", 8),
  map3: {
    blocks: createMapThreeBlocks(),
    segments: [],
  },
  map4: {
    blocks: createMapFourBlocks(),
    segments: [],
  },
  map11: {
    blocks: createMazeMapBlocks(),
    segments: [],
  },
  map12: {
    blocks: createCorridorMapBlocks(),
    segments: [],
  },
  map13: {
    blocks: createSailboatMapBlocks(),
    segments: [],
  },
};

function createClassMapTerrain(
  prefix: string,
  classDigit: 3 | 4 | 5 | 6 | 7 | 8,
): { blocks: TerrainBlock[]; segments: TerrainSegment[] } {
  return {
    blocks: [
      { id: `${prefix}-left`, x: -9.2, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      { id: `${prefix}-center`, x: -1.5, y: 4, width: 3, height: AIR_TERRAIN_HEIGHT },
      { id: `${prefix}-right`, x: 6.8, y: 2, width: 2.4, height: AIR_TERRAIN_HEIGHT },
      ...createLowerFoundationBlocks(`${prefix}-foundation`),
      ...createDigitThreeBlocks(`${prefix}-grade`, -5, 5),
      ...createClassDigitBlocks(`${prefix}-class`, 2, 5, classDigit),
      { id: `${prefix}-middle-mark-left`, x: -1, y: 7, width: 1, height: 1 },
      { id: `${prefix}-middle-mark-right`, x: 0, y: 7, width: 1, height: 1 },
    ],
    segments: [
      { id: `${prefix}-slope-up-left`, x1: -6.8, y1: 2.5, x2: -1.5, y2: 4.5 },
      { id: `${prefix}-slope-down-right`, x1: 1.5, y1: 4.5, x2: 6.8, y2: 2.5 },
    ],
  };
}

function createClassDigitBlocks(prefix: string, x: number, y: number, digit: 3 | 4 | 5 | 6 | 7 | 8): TerrainBlock[] {
  if (digit === 3) {
    return createDigitThreeBlocks(prefix, x, y);
  }

  if (digit === 4) {
    return createDigitFourBlocks(prefix, x, y);
  }

  if (digit === 5) {
    return createDigitFiveBlocks(prefix, x, y);
  }

  if (digit === 6) {
    return createDigitSixBlocks(prefix, x, y);
  }

  if (digit === 7) {
    return createDigitSevenBlocks(prefix, x, y);
  }

  return createDigitEightBlocks(prefix, x, y);
}

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

function createDigitFourBlocks(prefix: string, x: number, y: number): TerrainBlock[] {
  return createDigitBlocks(prefix, x, y, [
    [0, 4],
    [0, 2],
    [0, 3],
    [1, 2],
    [2, 0],
    [2, 1],
    [2, 2],
    [2, 3],
    [2, 4],
  ]);
}

function createDigitFiveBlocks(prefix: string, x: number, y: number): TerrainBlock[] {
  return createDigitBlocks(prefix, x, y, [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [0, 3],
    [0, 4],
    [1, 4],
    [2, 4],
  ]);
}

function createDigitSixBlocks(prefix: string, x: number, y: number): TerrainBlock[] {
  return createDigitBlocks(prefix, x, y, [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [0, 3],
    [0, 4],
    [1, 4],
    [2, 4],
  ]);
}

function createDigitSevenBlocks(prefix: string, x: number, y: number): TerrainBlock[] {
  return createDigitBlocks(prefix, x, y, [
    [0, 4],
    [1, 4],
    [2, 4],
    [2, 0],
    [2, 1],
    [2, 2],
    [2, 3],
  ]);
}

function createDigitEightBlocks(prefix: string, x: number, y: number): TerrainBlock[] {
  return createDigitBlocks(prefix, x, y, [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [0, 3],
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

function createLowerFoundationBlocks(prefix: string): TerrainBlock[] {
  return [
    { id: `${prefix}-safe-base`, x: -10, y: 0, width: 20, height: SAFE_FOUNDATION_HEIGHT, isFoundation: true },
    { id: `${prefix}-playable-base`, x: -10, y: SAFE_FOUNDATION_HEIGHT, width: 20, height: 2 - SAFE_FOUNDATION_HEIGHT },
    { id: `${prefix}-left-side`, x: -10, y: 2, width: 1, height: 0.9 },
    { id: `${prefix}-right-side`, x: 9, y: 2, width: 1, height: 0.9 },
    { id: `${prefix}-center`, x: -2, y: 2, width: 4, height: 1.4 },
  ];
}

function createMapThreeBlocks(): TerrainBlock[] {
  return [
    ...createBlockRow("map3-left-base", -10, 0, 5),
    ...createBlockRow("map3-right-base", 5, 0, 5),
    ...createBlockGrid("map3-left-start", -9, 6, 2, 2),
    ...createBlockGrid("map3-left-lower", -7, 3, 2, 2),
    ...createHalfBlockRow("map3-left-mid-a", -9, 4.5, 2),
    ...createHalfBlockRow("map3-left-mid-b", -9, 3, 2),
    ...createBlockRow("map3-center-top", -2, 9, 4),
    ...createBlockGrid("map3-center-left-wall", -2, 7, 1, 2),
    ...createBlockGrid("map3-center-right-wall", 1, 7, 1, 2),
    ...createBlockRow("map3-center-bottom", -2, 6, 4),
    ...createBlockGrid("map3-center-column", 0, 1, 1, 5),
    ...createBlockRow("map3-center-column-foot", -1, 0.5, 2),
    ...createHalfBlockRow("map3-center-half-left-a", -1, 4, 1),
    ...createHalfBlockRow("map3-center-half-left-b", -1, 3, 1),
    ...createHalfBlockRow("map3-center-half-left-c", -1, 2, 1),
    ...createHalfBlockRow("map3-center-half-left-d", -1, 1, 1),
    ...createBlockGrid("map3-right-start", 7, 5, 2, 2),
    ...createBlockGrid("map3-right-lower", 5, 2, 2, 2),
    ...createHalfBlockRow("map3-right-mid-a", 7, 3.5, 2),
    ...createHalfBlockRow("map3-right-mid-b", 7, 2, 2),
  ];
}

function createMapFourBlocks(): TerrainBlock[] {
  return [
    ...createBlockRow("map4-left-a", -9, 8, 2),
    ...createBlockRow("map4-left-b", -7, 7, 2),
    ...createBlockRow("map4-left-c", -9, 6, 2),
    ...createBlockRow("map4-left-d", -7, 5, 2),
    ...createBlockRow("map4-left-e", -9, 4, 2),
    ...createBlockRow("map4-left-f", -7, 3, 2),
    ...createBlockRow("map4-left-g", -9, 2, 2),
    ...createBlockRow("map4-left-h", -5, 6, 2),
    ...createBlockRow("map4-left-i", -5, 4, 2),
    ...createBlockRow("map4-right-a", 7, 7, 2),
    ...createBlockRow("map4-right-b", 5, 6, 2),
    ...createBlockRow("map4-right-c", 3, 5, 2),
    ...createBlockRow("map4-right-d", 7, 5, 2),
    ...createBlockRow("map4-right-e", 5, 4, 2),
    ...createBlockRow("map4-right-f", 3, 3, 2),
    ...createBlockRow("map4-right-g", 5, 2, 2),
    ...createBlockRow("map4-right-h", 7, 1, 2),
    ...createBlockRow("map4-right-i", 7, 3, 2),
  ];
}

function createMazeMapBlocks(): TerrainBlock[] {
  const cells: [number, number][] = [
    [-7, 8], [-6, 8], [-5, 8],
    [4, 8], [5, 8], [6, 8],
    [-7, 7], [-6, 7], [-5, 7],
    [4, 7], [5, 7], [6, 7],
    [-7, 6], [-6, 6], [-5, 6], [-4, 6], [-3, 6], [-2, 6], [-1, 6],
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6],
    [-5, 5], [0, 5], [4, 5],
    [-9, 4], [-8, 4], [-7, 4], [-5, 4], [-3, 4], [-1, 4], [0, 4],
    [2, 4], [3, 4], [4, 4], [6, 4], [7, 4], [8, 4],
    [-9, 3], [-5, 3], [-3, 3], [2, 3], [8, 3],
    [-9, 2], [-8, 2], [-6, 2], [-5, 2], [-4, 2], [-3, 2], [-2, 2],
    [-1, 2], [0, 2], [2, 2], [4, 2], [5, 2], [6, 2], [8, 2],
    [-9, 1], [-4, 1], [0, 1], [2, 1], [8, 1],
    [-9, 0], [-8, 0], [-7, 0], [-6, 0], [-5, 0], [-4, 0], [-3, 0],
    [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
    [5, 0], [6, 0], [7, 0], [8, 0], [9, 0],
  ];

  return createDigitBlocks("map11-maze", 0, 0, cells);
}

function createCorridorMapBlocks(): TerrainBlock[] {
  const cells: [number, number][] = [
    [-9, 8], [-8, 8], [-7, 8], [-6, 8], [-5, 8], [-4, 8],
    [-2, 8], [-1, 8], [0, 8], [1, 8], [2, 8], [3, 8],
    [5, 8], [6, 8], [7, 8], [8, 8],
    [-9, 6], [-8, 6], [-7, 6], [-6, 6], [-5, 6],
    [-3, 6], [-2, 6], [-1, 6], [0, 6],
    [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6],
    [-9, 4], [-8, 4], [-7, 4],
    [-5, 4], [-4, 4], [-3, 4],
    [-1, 4], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],
    [6, 4], [7, 4], [8, 4],
    [-9, 2], [-8, 2], [-7, 2], [-6, 2], [-5, 2], [-4, 2],
    [-3, 2], [-2, 2], [-1, 2], [0, 2], [1, 2],
    [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
    [-6, 0], [-4, 0], [-3, 0], [-2, 0],
    [1, 0], [2, 0], [4, 0], [5, 0],
  ];

  return createDigitBlocks("map12-corridor", 0, 0, cells);
}

function createSailboatMapBlocks(): TerrainBlock[] {
  const cells: [number, number][] = [
    [-6, 0], [-5, 0], [-4, 0], [-3, 0], [-2, 0], [-1, 0],
    [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0],
    [-8, 1], [-7, 1], [-6, 1], [-5, 1], [-4, 1], [-3, 1], [-2, 1], [-1, 1],
    [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1],
    [-9, 2], [-8, 2], [-7, 2], [-6, 2], [-5, 2], [-4, 2], [-3, 2], [-2, 2], [-1, 2],
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
    [-9, 3], [-8, 3], [7, 3], [8, 3],
    [-1, 3],
    [-1, 4],
    [-1, 5],
    [-7, 6], [-5, 6], [-1, 6], [0, 6],
    [-6, 7], [-1, 7], [0, 7], [1, 7], [4, 7], [6, 7],
    [-1, 8], [0, 8], [1, 8], [5, 8],
    [-1, 9], [0, 9],
  ];

  return createDigitBlocks("map13-sailboat", 0, 0, cells);
}

function createBlockGrid(prefix: string, x: number, y: number, width: number, height: number): TerrainBlock[] {
  return Array.from({ length: width * height }, (_, index) => {
    const cellX = index % width;
    const cellY = Math.floor(index / width);

    return {
      id: `${prefix}-${cellX}-${cellY}`,
      x: x + cellX,
      y: y + cellY,
      width: 1,
      height: 1,
    };
  });
}

function createBlockRow(prefix: string, x: number, y: number, length: number): TerrainBlock[] {
  return createBlockGrid(prefix, x, y, length, 1);
}

function createHalfBlockRow(prefix: string, x: number, y: number, length: number): TerrainBlock[] {
  return Array.from({ length }, (_, index) => ({
    id: `${prefix}-${index}`,
    x: x + index,
    y,
    width: 1,
    height: AIR_TERRAIN_HEIGHT,
  }));
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

export function createInitialTerrain(
  mapId: TerrainMapId = "map1",
  options: CreateTerrainOptions = {},
): TerrainState {
  const terrain = INITIAL_TERRAIN_BY_MAP[mapId] ?? INITIAL_TERRAIN_BY_MAP.map1;
  const includeSafeBase = options.includeSafeBase ?? true;

  return {
    blocks: terrain.blocks
      .filter((block) => includeSafeBase || !block.isFoundation)
      .map((block) => ({ ...block })),
    segments: terrain.segments.map((segment) => ({ ...segment })),
    holes: [],
  };
}

export function buildTerrainColumnMap(terrain: TerrainState | TerrainBlock[]): TerrainColumnMap {
  const normalizedTerrain = normalizeTerrain(terrain);

  if (normalizedTerrain.columns) {
    return cloneTerrainColumnMap(normalizedTerrain.columns);
  }

  const columns: TerrainColumnMap = new Map();
  const startIndex = terrainColumnIndex(BOARD.xMin);
  const endIndex = terrainColumnIndex(BOARD.xMax);

  for (let index = startIndex; index <= endIndex; index += 1) {
    const x = terrainColumnX(index);
    const solidSegments = [
      ...normalizedTerrain.blocks.flatMap((block) => terrainBlockToColumnSegments(block, x)),
      ...normalizedTerrain.segments.flatMap((segment) => terrainSlopeToColumnSegments(segment, x)),
    ].flatMap((segment) => subtractHolesFromColumnSegment(segment, x, normalizedTerrain.holes));

    if (solidSegments.length > 0) {
      columns.set(
        index,
        solidSegments
          .filter((segment) => segment.topY - segment.bottomY > FLOAT_EPSILON)
          .sort((a, b) => b.topY - a.topY),
      );
    }
  }

  return columns;
}

export function cloneTerrainColumnMap(columns: TerrainColumnMap): TerrainColumnMap {
  return new Map(
    [...columns.entries()].map(([index, segments]) => [
      index,
      segments.map((segment) => ({ ...segment })),
    ]),
  );
}

export function findColumnSupportAtX(
  columns: TerrainColumnMap,
  x: number,
  fromY: number,
  hasBaseTerrain = true,
): TerrainColumnSegment | null {
  const column = getStableTerrainColumnSegments(columns, x);
  const supports = column.filter((segment) => segment.topY <= fromY + SUPPORT_TOLERANCE);
  const upperSupports = supports.filter((segment) => segment.type !== "foundation");
  const candidates = upperSupports.length > 0 ? upperSupports : supports;

  if (candidates.length === 0) {
    return hasBaseTerrain
      ? {
          topY: BOARD.yMin,
          bottomY: BOARD.yMin,
          type: "foundation",
          destructible: false,
          topKind: "flat",
        }
      : null;
  }

  return candidates.reduce((highest, segment) =>
    segment.topY > highest.topY ? segment : highest,
  );
}

export function doesTerrainColumnOverlapBody(
  columns: TerrainColumnMap,
  x: number,
  footY: number,
  bodyHeight: number,
): boolean {
  const bodyBottom = footY + SUPPORT_TOLERANCE;
  const bodyTop = footY + bodyHeight;

  return getTerrainColumnSegments(columns, x).some(
    (segment) => segment.topY > bodyBottom && segment.bottomY < bodyTop,
  );
}

export function terrainColumnX(index: number): number {
  return round(BOARD.xMin + index * TERRAIN_COLUMN_STEP, 2);
}

export function terrainColumnCenterX(index: number): number {
  return BOARD.xMin + (index + 0.5) * TERRAIN_COLUMN_STEP;
}

function getClosestDxFromCircleCenterToColumn(index: number, centerX: number): number {
  const leftX = terrainColumnX(index);
  const rightX = leftX + TERRAIN_COLUMN_STEP;

  if (centerX >= leftX && centerX <= rightX) {
    return 0;
  }

  return Math.min(Math.abs(leftX - centerX), Math.abs(rightX - centerX));
}

export function terrainColumnIndex(x: number): number {
  return Math.round((round(x, 2) - BOARD.xMin) / TERRAIN_COLUMN_STEP);
}

function getTerrainColumnSegments(columns: TerrainColumnMap, x: number): TerrainColumnSegment[] {
  return columns.get(terrainColumnIndex(x)) ?? [];
}

function getStableTerrainColumnSegments(columns: TerrainColumnMap, x: number): TerrainColumnSegment[] {
  return getTerrainColumnSegments(columns, x).filter(isStableTerrainColumnSegment);
}

function isStableTerrainColumnSegment(segment: TerrainColumnSegment): boolean {
  return segment.topY - segment.bottomY >= MIN_TERRAIN_COLUMN_SEGMENT_HEIGHT;
}

function terrainBlockToColumnSegments(block: TerrainBlock, x: number): TerrainColumnSegment[] {
  if (!blockCoversX(block, x)) {
    return [];
  }

  return [
    {
      topY: round(block.y + block.height, 2),
      bottomY: round(block.y, 2),
      type: block.isFoundation ? "foundation" : "block",
      destructible: !block.isFoundation,
      topKind: "flat",
    },
  ];
}

function terrainSlopeToColumnSegments(
  segment: TerrainSegment,
  x: number,
): TerrainColumnSegment[] {
  if (!segmentCoversX(segment, x)) {
    return [];
  }

  const topY = getSegmentYAtX(segment, x);

  return [
    {
      topY: round(topY, 2),
      bottomY: round(topY - AIR_TERRAIN_HEIGHT, 2),
      type: "segment",
      destructible: true,
      topKind: "slope",
    },
  ];
}

function subtractHolesFromColumnSegment(
  segment: TerrainColumnSegment,
  x: number,
  holes: TerrainHole[],
): TerrainColumnSegment[] {
  return holes.reduce<TerrainColumnSegment[]>(
    (segments, hole) => segments.flatMap((current) => subtractHoleFromSingleSegment(current, x, hole)),
    [segment],
  );
}

function subtractHoleFromSingleSegment(
  segment: TerrainColumnSegment,
  x: number,
  hole: TerrainHole,
): TerrainColumnSegment[] {
  const dx = x - hole.x;

  if (Math.abs(dx) >= hole.radius) {
    return [segment];
  }

  const offsetY = Math.sqrt(hole.radius ** 2 - dx ** 2);
  const removeBottom = hole.y - offsetY;
  const removeTop = hole.y + offsetY;

  if (removeTop <= segment.bottomY + FLOAT_EPSILON || removeBottom >= segment.topY - FLOAT_EPSILON) {
    return [segment];
  }

  const nextSegments: TerrainColumnSegment[] = [];
  const lowerTop = Math.min(segment.topY, removeBottom);
  const upperBottom = Math.max(segment.bottomY, removeTop);

  if (lowerTop > segment.bottomY + FLOAT_EPSILON) {
    nextSegments.push({
      ...segment,
      topY: round(lowerTop, 2),
      topKind: "hole",
    });
  }

  if (segment.topY > upperBottom + FLOAT_EPSILON) {
    nextSegments.push({
      ...segment,
      bottomY: round(upperBottom, 2),
    });
  }

  return nextSegments;
}

export function getTerrainMapLabel(mapId: TerrainMapId): string {
  return TERRAIN_MAP_METADATA[mapId].label;
}

export function getTerrainMapDescription(mapId: TerrainMapId): string {
  return TERRAIN_MAP_METADATA[mapId].description;
}

export function getTerrainMapCategory(mapId: TerrainMapId): TerrainMapCategory {
  return TERRAIN_MAP_METADATA[mapId].category;
}

export function getTerrainMapIdsByCategory(category: TerrainMapCategory): TerrainMapId[] {
  return TERRAIN_MAP_IDS.filter((mapId) => getTerrainMapCategory(mapId) === category);
}

export function getTerrainMapCategoryLabel(category: TerrainMapCategory): string {
  return category === "jangwi" ? "장위중학교" : "기타맵";
}

export function getTerrainMapCategoryDescription(category: TerrainMapCategory): string {
  return category === "jangwi"
    ? "3학년 학급 맵과 장위중학교 전용 맵을 선택합니다."
    : "열쇠, 체크 타일 등 기타 맵을 선택합니다.";
}
export function findProjectileTerrainImpact(
  shooter: Point,
  quadratic: Quadratic,
  groundImpact: Point,
  terrain: TerrainState | TerrainBlock[],
  minTravelDistance = 0,
): { point: Point; blockId: string; collisionType: "terrain" } | null {
  if (!Number.isFinite(quadratic.a)) {
    return null;
  }

  const normalizedTerrain = normalizeTerrain(terrain);
  const terrainForImpact = {
    ...normalizedTerrain,
    columns: buildTerrainColumnMap(normalizedTerrain),
  };
  const distanceX = groundImpact.x - shooter.x;
  const steps = Math.max(1, Math.ceil(Math.abs(distanceX) / 0.02));
  let previousPoint: Point = shooter;

  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const x = shooter.x + distanceX * t;
    const y = getYAtX(quadratic, x);
    const traveled = Math.hypot(x - shooter.x, y - shooter.y);

    const point = { x, y };
    const hitTerrainId = getProjectileTerrainHitId(point, terrainForImpact);

    if (traveled < minTravelDistance) {
      previousPoint = point;
      continue;
    }

    if (hitTerrainId) {
      return {
        point: refineProjectileTerrainImpactPoint(previousPoint, point, terrainForImpact),
        blockId: hitTerrainId,
        collisionType: "terrain",
      };
    }

    previousPoint = point;
  }

  return null;
}

function getProjectileTerrainHitId(point: Point, terrain: TerrainState): string | null {
  const columns = terrain.columns ?? buildTerrainColumnMap(terrain);
  return isPointInsideTerrainColumns(point, columns) ? "terrain-column" : null;
}

function refineProjectileTerrainImpactPoint(
  from: Point,
  to: Point,
  terrain: TerrainState,
): Point {
  if (!isPointInsideTerrainForProjectile(to, terrain)) {
    return { x: roundToStep(to.x), y: round(to.y, 2) };
  }

  if (isPointInsideTerrainForProjectile(from, terrain)) {
    return { x: roundToStep(to.x), y: round(to.y, 2) };
  }

  let low = from;
  let high = to;

  for (let index = 0; index < 18; index += 1) {
    const mid = {
      x: (low.x + high.x) / 2,
      y: (low.y + high.y) / 2,
    };

    if (isPointInsideTerrainForProjectile(mid, terrain)) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return { x: roundToStep(high.x), y: round(high.y, 2) };
}

function isPointInsideTerrainForProjectile(point: Point, terrain: TerrainState): boolean {
  const columns = terrain.columns ?? buildTerrainColumnMap(terrain);
  return isPointInsideTerrainColumns(point, columns);
}

function isPointInsideTerrainColumns(point: Point, columns: TerrainColumnMap): boolean {
  return getStableTerrainColumnSegments(columns, point.x).some(
    (segment) => point.y > segment.bottomY + FLOAT_EPSILON && point.y < segment.topY - FLOAT_EPSILON,
  );
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

  const nextColumns = destroyTerrainColumns(buildTerrainColumnMap(terrain), center, radius);

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
    columns: nextColumns,
  };
}

export function destroyTerrainColumns(
  columns: TerrainColumnMap,
  center: Point,
  radius: number,
): TerrainColumnMap {
  const nextColumns = cloneTerrainColumnMap(columns);
  const startIndex = terrainColumnIndex(Math.max(BOARD.xMin, center.x - radius));
  const endIndex = terrainColumnIndex(Math.min(BOARD.xMax, center.x + radius));

  for (let index = startIndex; index <= endIndex; index += 1) {
    const dx = getClosestDxFromCircleCenterToColumn(index, center.x);

    if (Math.abs(dx) > radius) {
      continue;
    }

    const dy = Math.sqrt(radius ** 2 - dx ** 2);
    const destroyBottom = center.y - dy;
    const destroyTop = center.y + dy;
    const column = nextColumns.get(index) ?? [];
    const nextColumn = column.flatMap((segment) =>
      destroyColumnSegment(segment, destroyBottom, destroyTop),
    );

    if (nextColumn.length > 0) {
      nextColumns.set(index, nextColumn.sort((a, b) => b.topY - a.topY));
    } else {
      nextColumns.delete(index);
    }
  }

  return cleanupTerrainColumns(nextColumns, {
    blastCenter: center,
    blastRadius: radius,
  });
}

export function cleanupTerrainColumns(
  columns: TerrainColumnMap,
  options: TerrainColumnCleanupOptions = {},
): TerrainColumnMap {
  const cleanedColumns = new Map<number, TerrainColumnSegment[]>();
  const indexes = [...columns.keys()].sort((a, b) => a - b);

  for (const index of indexes) {
    const stableSegments = mergeNearbyColumnSegments(
      (columns.get(index) ?? []).filter((segment) =>
        !segment.destructible || isStableTerrainColumnSegment(segment),
      ),
      index,
      options,
    ).filter((segment) => !isIsolatedTinyTerrainFragment(segment, index, columns));

    if (stableSegments.length > 0) {
      cleanedColumns.set(index, stableSegments.sort((a, b) => b.topY - a.topY));
    }
  }

  return cleanedColumns;
}

function mergeNearbyColumnSegments(
  segments: TerrainColumnSegment[],
  index: number,
  options: TerrainColumnCleanupOptions,
): TerrainColumnSegment[] {
  const sortedSegments = [...segments].sort((a, b) => a.bottomY - b.bottomY);
  const mergedSegments: TerrainColumnSegment[] = [];

  for (const segment of sortedSegments) {
    const previous = mergedSegments[mergedSegments.length - 1];

    if (
      previous &&
      canMergeColumnSegments(previous, segment) &&
      segment.bottomY - previous.topY <= TERRAIN_COLUMN_CLEANUP_MERGE_GAP &&
      !isGapInsideCleanupBlast(index, previous.topY, segment.bottomY, options)
    ) {
      previous.topY = round(Math.max(previous.topY, segment.topY), 2);
      previous.topKind = previous.topKind === "hole" || segment.topKind === "hole" ? "hole" : previous.topKind;
      continue;
    }

    mergedSegments.push({ ...segment });
  }

  return mergedSegments;
}

function canMergeColumnSegments(a: TerrainColumnSegment, b: TerrainColumnSegment): boolean {
  return a.type === b.type && a.destructible === b.destructible;
}

function isGapInsideCleanupBlast(
  index: number,
  gapBottom: number,
  gapTop: number,
  options: TerrainColumnCleanupOptions,
): boolean {
  if (!options.blastCenter || options.blastRadius === undefined || gapTop <= gapBottom) {
    return false;
  }

  const dx = getClosestDxFromCircleCenterToColumn(index, options.blastCenter.x);

  if (Math.abs(dx) > options.blastRadius) {
    return false;
  }

  const dy = Math.sqrt(options.blastRadius ** 2 - dx ** 2);
  const destroyBottom = options.blastCenter.y - dy;
  const destroyTop = options.blastCenter.y + dy;

  return destroyTop > gapBottom + FLOAT_EPSILON && destroyBottom < gapTop - FLOAT_EPSILON;
}

export function findDestructibleSegmentsInsideBlast(
  columns: TerrainColumnMap,
  center: Point,
  radius: number,
): TerrainBlastResidual[] {
  const residuals: TerrainBlastResidual[] = [];
  const startIndex = terrainColumnIndex(Math.max(BOARD.xMin, center.x - radius));
  const endIndex = terrainColumnIndex(Math.min(BOARD.xMax, center.x + radius));

  for (let index = startIndex; index <= endIndex; index += 1) {
    const x = terrainColumnCenterX(index);
    const dx = x - center.x;

    if (Math.abs(dx) >= radius - FLOAT_EPSILON) {
      continue;
    }

    const dy = Math.sqrt(radius ** 2 - dx ** 2);
    const destroyBottom = center.y - dy;
    const destroyTop = center.y + dy;

    for (const segment of columns.get(index) ?? []) {
      if (
        segment.destructible &&
        isStableTerrainColumnSegment(segment) &&
        destroyTop > segment.bottomY + FLOAT_EPSILON &&
        destroyBottom < segment.topY - FLOAT_EPSILON
      ) {
        residuals.push({
          index,
          x,
          bottomY: segment.bottomY,
          topY: segment.topY,
          destructible: segment.destructible,
          type: segment.type,
          topKind: segment.topKind,
        });
      }
    }
  }

  return residuals;
}

export function assertNoDestructibleSegmentsInsideBlast(
  columns: TerrainColumnMap,
  center: Point,
  radius: number,
): void {
  const residuals = findDestructibleSegmentsInsideBlast(columns, center, radius);

  if (residuals.length > 0) {
    throw new Error(`Destructible terrain remains inside blast: ${JSON.stringify(residuals.slice(0, 5))}`);
  }
}

function isIsolatedTinyTerrainFragment(
  segment: TerrainColumnSegment,
  index: number,
  columns: TerrainColumnMap,
): boolean {
  const height = segment.topY - segment.bottomY;

  if (!segment.destructible || height >= MIN_TERRAIN_COLUMN_SEGMENT_HEIGHT * 2.5) {
    return false;
  }

  return ![-1, 1].some((offset) =>
    (columns.get(index + offset) ?? []).some((neighbor) =>
      isStableTerrainColumnSegment(neighbor) &&
      Math.min(segment.topY, neighbor.topY) - Math.max(segment.bottomY, neighbor.bottomY) >
        MIN_TERRAIN_COLUMN_SEGMENT_HEIGHT,
    ),
  );
}
function floorCoordinate(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.floor(value * scale) / scale;
}

function ceilCoordinate(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.ceil(value * scale) / scale;
}
function destroyColumnSegment(
  segment: TerrainColumnSegment,
  destroyBottom: number,
  destroyTop: number,
): TerrainColumnSegment[] {
  if (!segment.destructible || destroyTop <= segment.bottomY || destroyBottom >= segment.topY) {
    return [segment];
  }

  const pieces: TerrainColumnSegment[] = [];

  if (destroyBottom > segment.bottomY) {
    pieces.push({
      ...segment,
      topY: floorCoordinate(Math.min(destroyBottom, segment.topY), 2),
      topKind: "hole",
    });
  }

  if (destroyTop < segment.topY) {
    pieces.push({
      ...segment,
      bottomY: ceilCoordinate(Math.max(destroyTop, segment.bottomY), 2),
    });
  }

  return pieces.filter((piece) => !piece.destructible || isStableTerrainColumnSegment(piece));
}

export function settlePlayersOnTerrain(
  players: [Player, Player],
  terrain: TerrainState | TerrainBlock[],
  hasBaseTerrain = true,
): [Player, Player] {
  const normalizedTerrain = normalizeTerrain(terrain);

  return players.map((player) => {
    const supportY = normalizedTerrain.columns
      ? findColumnSupportAtX(
          normalizedTerrain.columns,
          player.tankPosition.x,
          player.tankPosition.y + SUPPORT_TOLERANCE,
          false,
        )?.topY ?? null
      : findSupportYOrNull(player.tankPosition.x, player.tankPosition.y, normalizedTerrain);
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

  if (normalizedTerrain.columns) {
    return findColumnSupportAtX(normalizedTerrain.columns, x, fromY, false)?.topY ?? null;
  }

  const { blocks, segments, holes } = normalizedTerrain;

  const nonFoundationBlockY = blocks
    .filter((block) => !block.isFoundation)
    .filter((block) => blockCoversX(block, x))
    .map((block) => block.y + block.height)
    .filter((topY) => !isPointInsideAnyHole({ x, y: topY }, holes))
    .filter((topY) => topY <= fromY + SUPPORT_TOLERANCE);
  const foundationBlockY = blocks
    .filter((block) => block.isFoundation)
    .filter((block) => blockCoversX(block, x))
    .map((block) => block.y + block.height)
    .filter((topY) => !isPointInsideAnyHole({ x, y: topY }, holes))
    .filter((topY) => topY <= fromY + SUPPORT_TOLERANCE);
  const segmentY = segments
    .filter((segment) => segmentCoversX(segment, x))
    .map((segment) => getSegmentYAtX(segment, x))
    .filter((y) => !isPointInsideAnyHole({ x, y }, holes))
    .filter((y) => y <= fromY + SUPPORT_TOLERANCE);
  const holeBoundaryY = findHoleBoundarySupports(x, fromY, normalizedTerrain);
  const upperSupports = [...nonFoundationBlockY, ...segmentY, ...holeBoundaryY];
  const supports = upperSupports.length > 0 ? upperSupports : foundationBlockY;
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

  if (normalizedTerrain.columns) {
    const support = findColumnSupportAtX(normalizedTerrain.columns, x, fromY, false);
    return support ? { y: support.topY, slope: 0 } : null;
  }

  const nonFoundationBlockSupports = normalizedTerrain.blocks
    .filter((block) => !block.isFoundation)
    .filter((block) => blockCoversX(block, x))
    .map((block) => ({ y: block.y + block.height, slope: 0 }))
    .filter((support) => !isPointInsideAnyHole({ x, y: support.y }, normalizedTerrain.holes))
    .filter((support) => support.y <= fromY + SUPPORT_TOLERANCE);
  const foundationBlockSupports = normalizedTerrain.blocks
    .filter((block) => block.isFoundation)
    .filter((block) => blockCoversX(block, x))
    .map((block) => ({ y: block.y + block.height, slope: 0 }))
    .filter((support) => !isPointInsideAnyHole({ x, y: support.y }, normalizedTerrain.holes))
    .filter((support) => support.y <= fromY + SUPPORT_TOLERANCE);
  const segmentSupports = normalizedTerrain.segments
    .filter((segment) => segmentCoversX(segment, x))
    .map((segment) => ({ y: getSegmentYAtX(segment, x), slope: getSegmentSlope(segment) }))
    .filter((support) => !isPointInsideAnyHole({ x, y: support.y }, normalizedTerrain.holes))
    .filter((support) => support.y <= fromY + SUPPORT_TOLERANCE);
  const holeBoundarySupports = findHoleBoundarySupportCandidates(x, fromY, normalizedTerrain);
  const upperSupports = [...nonFoundationBlockSupports, ...segmentSupports, ...holeBoundarySupports];
  const supports = upperSupports.length > 0 ? upperSupports : foundationBlockSupports;

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

function findHoleBoundarySupports(
  x: number,
  fromY: number,
  terrain: TerrainState,
): number[] {
  return findHoleBoundarySupportCandidates(x, fromY, terrain).map((support) => support.y);
}

function findHoleBoundarySupportCandidates(
  x: number,
  fromY: number,
  terrain: TerrainState,
): TerrainSupport[] {
  return terrain.holes.flatMap((hole) => {
    const dx = x - hole.x;
    if (Math.abs(dx) >= hole.radius) {
      return [];
    }

    const offsetY = Math.sqrt(hole.radius ** 2 - dx ** 2);
    const upperSlope = offsetY <= FLOAT_EPSILON ? Infinity : -dx / offsetY;
    const lowerSlope = offsetY <= FLOAT_EPSILON ? Infinity : dx / offsetY;
    const candidates = [
      { y: round(hole.y + offsetY, 2), slope: upperSlope },
      { y: round(hole.y - offsetY, 2), slope: lowerSlope },
    ]
      .filter((support) => support.y <= fromY + SUPPORT_TOLERANCE)
      .filter((support) => isSolidTerrainJustBelow({ x, y: support.y }, terrain));

    return candidates;
  });
}

function isPointInsideTerrainBody(point: Point, terrain: TerrainState): boolean {
  return (
    terrain.blocks.some((block) => isPointInsideBlock(point, block)) ||
    terrain.segments.some((segment) => isPointInsideSegmentBody(point, segment))
  );
}

function isSolidTerrainJustBelow(point: Point, terrain: TerrainState): boolean {
  const probe = { x: point.x, y: point.y - SUPPORT_TOLERANCE };

  return isPointInsideTerrainBody(probe, terrain) && !isPointInsideAnyHole(probe, terrain.holes);
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
  return holes.some((hole) => Math.hypot(point.x - hole.x, point.y - hole.y) < hole.radius - FLOAT_EPSILON);
}

function doesBlastTouchTerrain(terrain: TerrainState, center: Point, radius: number): boolean {
  if (terrain.columns) {
    const startIndex = terrainColumnIndex(Math.max(BOARD.xMin, center.x - radius));
    const endIndex = terrainColumnIndex(Math.min(BOARD.xMax, center.x + radius));

    for (let index = startIndex; index <= endIndex; index += 1) {
      const dx = getClosestDxFromCircleCenterToColumn(index, center.x);

      if (Math.abs(dx) > radius) {
        continue;
      }

      const dy = Math.sqrt(radius ** 2 - dx ** 2);
      const destroyBottom = center.y - dy;
      const destroyTop = center.y + dy;
      const column = terrain.columns.get(index) ?? [];

      if (
        column.some(
          (segment) =>
            segment.destructible &&
            isStableTerrainColumnSegment(segment) &&
            destroyTop > segment.bottomY &&
            destroyBottom < segment.topY,
        )
      ) {
        return true;
      }
    }

    return false;
  }

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
