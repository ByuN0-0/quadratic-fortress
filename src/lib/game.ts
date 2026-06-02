import {
  BOARD,
  STARTING_HP,
  calculateDamage,
  calculateShotMath,
  distance,
  formatCoordinate,
  formatEquation,
  getProjectileConfig,
  getYAtX,
  isImpactInBounds,
  nearlyEqual,
  round,
  roundToStep,
  type Point,
  type ProjectileConfig,
  type ProjectileType,
  type Quadratic,
} from "./math";
import {
  buildTerrainColumnMap,
  cloneTerrainColumnMap,
  createInitialTerrain,
  doesTerrainColumnOverlapBody,
  destroyTerrain,
  findColumnSupportAtX,
  findProjectileTerrainImpact,
  findSupportY,
  OCEAN_FALL_Y,
  settlePlayersOnTerrain,
  TERRAIN_COLUMN_STEP,
  type TerrainMapId,
  type TerrainState,
} from "./terrain";

export type PlayerId = "p1" | "p2";
export type GameMode = "normal" | "ocean" | "practice";
export type PracticeStageNumber = 1 | 2 | 3;

export type PracticeStageConfig = {
  step: PracticeStageNumber;
  title: string;
  message: string;
  problem: string;
  defaultInput: ShotInput;
  p1Position: Point;
  targetPosition: Point;
  targetHp: number;
  terrain: TerrainState;
};

export type PracticeState = {
  step: PracticeStageNumber;
  isComplete: boolean;
  pendingNextStep: PracticeStageNumber | null;
};

export type Player = {
  id: PlayerId;
  name: string;
  tankPosition: Point;
  hp: number;
  isActive: boolean;
};

export type ShotInput = {
  vertexX: number;
  vertexY: number;
  projectileType?: ProjectileType;
};

export type MoveDirection = -1 | 1;

export type ShotCollisionType = "terrain" | "tank" | "outOfBounds" | "none";

export type ShotResult = {
  id: number;
  shooterId: PlayerId;
  targetId: PlayerId;
  projectile: ProjectileConfig;
  vertex: Point;
  quadratic: Quadratic;
  impactPoint: Point;
  distanceToTarget: number;
  distanceToShooter: number;
  damage: number;
  shooterDamage: number;
  isValidImpact: boolean;
  validationErrors: string[];
  explanation: string[];
  isApplied: boolean;
  terrainImpactBlockId: string | null;
  collisionType: ShotCollisionType;
};

export type GameState = {
  players: [Player, Player];
  activePlayerId: PlayerId;
  movementUsed: number;
  shotHistory: ShotResult[];
  lastShot: ShotResult | null;
  terrain: TerrainState;
  mode: GameMode;
  mapId: TerrainMapId;
  winnerId: PlayerId | null;
  practice: PracticeState | null;
};

export const MAX_TURN_MOVE = 3;
export const MOVE_STEP = 0.1;
export const PLAYER_START_HEIGHT = BOARD.yMax;
export const PROJECTILE_TERRAIN_ARM_DISTANCE = 0.7;
export const MAX_TANK_TERRAIN_SLOPE = 1;
export const MAX_TANK_STEP_UP_HEIGHT = 0.4;
export const PLAYER_TERRITORY_LIMIT_X = 1;
export const P1_AIM_LIMIT_MESSAGE = "1P는 조준점을 x=1 이하로 설정해야 합니다.";
export const P2_AIM_LIMIT_MESSAGE = "2P는 조준점을 x=-1 이상으로 설정해야 합니다.";
export const MOVE_TERRITORY_LIMIT_MESSAGE = "진영 경계입니다.";
export const BACKWARD_AIM_MESSAGE =
  "뒤쪽으로는 조준할 수 없습니다. 꼭짓점을 상대 방향으로 이동하세요.";

const TANK_DIRECT_HIT_RADIUS = 0.45;
const TANK_TERRAIN_PRIORITY_RADIUS = 0.8;
const TANK_SIDE_BODY_HEIGHT = 0.75;
const CURRENT_SUPPORT_REACH_HEIGHT = MAX_TANK_STEP_UP_HEIGHT + 0.1;
const INTERNAL_MOVE_STEPS = Math.round(MOVE_STEP / TERRAIN_COLUMN_STEP);

export const PRACTICE_STAGES: PracticeStageConfig[] = [
  {
    step: 1,
    title: "꼭짓점 좌표 조절",
    message:
      "슬라이더를 움직이면 포탄 궤적의 꼭짓점 좌표를 조절할 수 있습니다. 벽을 넘으면서 목표물을 맞힐 수 있도록 꼭짓점을 조절해 보세요.",
    problem:
      "현재 (-8, 0)에 대포가 위치해 있고, 목표물은 (8, 0)에 위치해 있다. 좌표평면상에 [-1, 1]×[0, 6]의 벽이 있을 때, 목표물을 타격하기 위한 꼭짓점의 좌표를 구하시오.",
    defaultInput: { vertexX: 0, vertexY: 5, projectileType: "normal" },
    p1Position: { x: -8, y: 0 },
    targetPosition: { x: 8, y: 0 },
    targetHp: 1,
    terrain: {
      blocks: [{ id: "practice-1-wall", x: -1, y: 0, width: 2, height: 6 }],
      segments: [],
      holes: [],
    },
  },
  {
    step: 2,
    title: "대포 이동과 그래프의 평행이동",
    message:
      "MOVE의 좌우 화살표를 누르면 대포를 0.1칸씩 이동할 수 있습니다. 대포가 이동하면 같은 꼭짓점으로 조준하더라도 포탄 궤적의 위치가 달라집니다.",
    problem:
      "현재 (-8, 0)에 대포가 위치해 있고, 목표물은 (6, 0)에 위치해 있다. 좌표평면상에 [-1, 1]×[0, 6]의 벽이 있을 때, 위의 문제 상황과 동일한 조준점으로 조준하여 목표물을 타격하기 위해 대포를 얼마나 이동시켜야 하는지 구하시오.",
    defaultInput: { vertexX: 0, vertexY: 7, projectileType: "normal" },
    p1Position: { x: -8, y: 0 },
    targetPosition: { x: 6, y: 0 },
    targetHp: 1,
    terrain: {
      blocks: [{ id: "practice-2-wall", x: -1, y: 0, width: 2, height: 6 }],
      segments: [],
      holes: [],
    },
  },
  {
    step: 3,
    title: "파괴 가능한 지형과 포탄 종류",
    message:
      "포탄에는 종류가 있습니다. 강력탄은 피해가 크지만 폭발 범위가 좁고, 범위탄은 피해가 약하지만 폭발 범위가 넓습니다. 일부 지형은 포탄에 맞으면 파괴됩니다. 목표물의 체력을 모두 깎으면 연습 모드가 종료됩니다.",
    problem:
      "벽을 파괴하거나 넘기며 목표물의 체력을 모두 깎아 보세요. 포탄 종류에 따라 폭발 반경과 피해량이 달라집니다.",
    defaultInput: { vertexX: 0, vertexY: 10, projectileType: "normal" },
    p1Position: { x: -8, y: 0 },
    targetPosition: { x: 8, y: 0 },
    targetHp: 35,
    terrain: {
      blocks: [{ id: "practice-3-wall", x: 0, y: 0, width: 1, height: 10 }],
      segments: [],
      holes: [],
    },
  },
];


function withTerrainColumns(terrain: TerrainState): TerrainState {
  return {
    ...terrain,
    columns: buildTerrainColumnMap(terrain),
  };
}


type TankImpact = {
  point: Point;
  collisionType: "tank";
};

function findProjectileTankImpact(
  shooter: Point,
  target: Point,
  quadratic: Quadratic,
  groundImpact: Point,
  minTravelDistance: number,
): TankImpact | null {
  const pathMinX = Math.min(shooter.x, groundImpact.x) - 0.01;
  const pathMaxX = Math.max(shooter.x, groundImpact.x) + 0.01;

  if (target.x < pathMinX || target.x > pathMaxX) {
    return null;
  }

  const yAtTarget = getYAtX(quadratic, target.x);
  const traveled = distance(shooter, { x: target.x, y: yAtTarget });

  if (traveled < minTravelDistance) {
    return null;
  }

  return Math.abs(yAtTarget - target.y) <= TANK_DIRECT_HIT_RADIUS
    ? { point: { ...target }, collisionType: "tank" }
    : null;
}

function shouldPreferTankImpact(
  tankImpact: TankImpact | null,
  terrainImpact: { point: Point; blockId: string; collisionType: "terrain" } | null,
  target: Player,
): boolean {
  if (!tankImpact) {
    return false;
  }

  return !terrainImpact || distance(terrainImpact.point, target.tankPosition) <= TANK_TERRAIN_PRIORITY_RADIUS;
}

type ResolvedShotMath = {
  math: ReturnType<typeof calculateShotMath>;
  terrainImpact: { point: Point; blockId: string; collisionType: "terrain" } | null;
  tankImpact: TankImpact | null;
};

function resolveShotMath(
  state: GameState,
  shooter: Player,
  target: Player,
  vertex: Point,
  input: ShotInput,
  checkedMath: ReturnType<typeof calculateShotMath>,
): ResolvedShotMath {
  const terrainImpact =
    checkedMath.validationErrors.length === 0
      ? findProjectileTerrainImpact(
          shooter.tankPosition,
          checkedMath.quadratic,
          checkedMath.impactPoint,
          state.terrain,
          PROJECTILE_TERRAIN_ARM_DISTANCE,
        )
      : null;
  const tankImpact =
    checkedMath.validationErrors.length === 0
      ? findProjectileTankImpact(
          shooter.tankPosition,
          target.tankPosition,
          checkedMath.quadratic,
          checkedMath.impactPoint,
          PROJECTILE_TERRAIN_ARM_DISTANCE,
        )
      : null;
  const useTankImpact = shouldPreferTankImpact(tankImpact, terrainImpact, target);
  const impactOverride = useTankImpact ? tankImpact?.point : terrainImpact?.point;
  const math = impactOverride
    ? calculateShotMath(
        shooter.tankPosition,
        target.tankPosition,
        vertex,
        input.projectileType,
        impactOverride,
      )
    : checkedMath;

  return {
    math,
    terrainImpact: useTankImpact ? null : terrainImpact,
    tankImpact: useTankImpact ? tankImpact : null,
  };
}
function getShotCollisionType(
  terrainImpact: { point: Point; blockId: string; collisionType: "terrain" } | null,
  checkedMath: ReturnType<typeof calculateShotMath>,
  math: ReturnType<typeof calculateShotMath>,
  target: Player,
  shooter: Player,
): ShotCollisionType {
  if (terrainImpact) {
    return "terrain";
  }

  if (checkedMath.validationErrors.length === 0 && !isImpactInBounds(checkedMath.impactPoint)) {
    return "outOfBounds";
  }

  if (
    math.isValidImpact &&
    (distance(math.impactPoint, target.tankPosition) < math.projectile.blastRadius ||
      distance(math.impactPoint, shooter.tankPosition) < math.projectile.blastRadius)
  ) {
    return "tank";
  }

  return "none";
}
export function createInitialGameState(
  mode: GameMode = "normal",
  mapId: TerrainMapId = "map1",
): GameState {
  if (mode === "practice") {
    return createPracticeGameState(1);
  }

  const terrain = withTerrainColumns(createInitialTerrain(mapId, {
    includeSafeBase: mode !== "ocean",
  }));
  const p1StartX = -8;
  const p2StartX = 8;

  return {
    players: [
      {
        id: "p1",
        name: "1P",
        tankPosition: {
          x: p1StartX,
          y: findSupportY(p1StartX, PLAYER_START_HEIGHT, terrain),
        },
        hp: STARTING_HP,
        isActive: true,
      },
      {
        id: "p2",
        name: "2P",
        tankPosition: {
          x: p2StartX,
          y: findSupportY(p2StartX, PLAYER_START_HEIGHT, terrain),
        },
        hp: STARTING_HP,
        isActive: false,
      },
    ],
    activePlayerId: "p1",
    movementUsed: 0,
    shotHistory: [],
    lastShot: null,
    terrain,
    mode,
    mapId,
    winnerId: null,
    practice: null,
  };
}

export function createPracticeGameState(
  step: PracticeStageNumber = 1,
  shotHistory: ShotResult[] = [],
): GameState {
  const stage = getPracticeStage(step);

  return {
    players: [
      {
        id: "p1",
        name: "1P",
        tankPosition: { ...stage.p1Position },
        hp: STARTING_HP,
        isActive: true,
      },
      {
        id: "p2",
        name: "목표물",
        tankPosition: { ...stage.targetPosition },
        hp: stage.targetHp,
        isActive: false,
      },
    ],
    activePlayerId: "p1",
    movementUsed: 0,
    shotHistory,
    lastShot: null,
    terrain: withTerrainColumns(cloneTerrain(stage.terrain)),
    mode: "practice",
    mapId: "map1",
    winnerId: null,
    practice: {
      step,
      isComplete: false,
      pendingNextStep: null,
    },
  };
}

export function getPracticeStage(step: PracticeStageNumber): PracticeStageConfig {
  return PRACTICE_STAGES.find((stage) => stage.step === step) ?? PRACTICE_STAGES[0];
}

export function continuePracticeAfterSuccess(state: GameState): GameState {
  if (state.mode !== "practice" || !state.practice?.pendingNextStep) {
    return state;
  }

  return createPracticeGameState(state.practice.pendingNextStep, state.shotHistory);
}

export function getActivePlayer(state: GameState): Player {
  return state.players.find((player) => player.id === state.activePlayerId) ?? state.players[0];
}

export function getTargetPlayer(state: GameState): Player {
  return state.players.find((player) => player.id !== state.activePlayerId) ?? state.players[1];
}

export function submitShot(state: GameState, input: ShotInput): GameState {
  return applyLastShot(prepareShot(state, input));
}

export function prepareShot(state: GameState, input: ShotInput): GameState {
  if (state.winnerId) {
    return state;
  }

  const shooter = getActivePlayer(state);
  const target = getTargetPlayer(state);
  const vertex = { x: input.vertexX, y: input.vertexY };
  const directionErrors = validateAimDirection(shooter, vertex);
  const baseMath = calculateShotMath(
    shooter.tankPosition,
    target.tankPosition,
    vertex,
    input.projectileType,
  );
  const checkedMath = {
    ...baseMath,
    isValidImpact: directionErrors.length > 0 ? false : baseMath.isValidImpact,
    validationErrors: [...directionErrors, ...baseMath.validationErrors],
  };
  const { math, terrainImpact, tankImpact } = resolveShotMath(
    state,
    shooter,
    target,
    vertex,
    input,
    checkedMath,
  );
  const result: ShotResult = {
    id: state.shotHistory.length + 1,
    shooterId: shooter.id,
    targetId: target.id,
    vertex,
    ...math,
    distanceToShooter: math.isValidImpact ? distance(math.impactPoint, shooter.tankPosition) : 0,
    shooterDamage: math.isValidImpact
      ? calculateDamage(distance(math.impactPoint, shooter.tankPosition), math.projectile)
      : 0,
    explanation: buildExplanation(shooter, target, vertex, math),
    isApplied: false,
    terrainImpactBlockId: terrainImpact?.blockId ?? null,
    collisionType: tankImpact?.collisionType ?? getShotCollisionType(terrainImpact, checkedMath, math, target, shooter),
  };

  return {
    ...state,
    lastShot: result,
  };
}

export function applyLastShot(state: GameState): GameState {
  const result = state.lastShot;

  if (!result || result.isApplied || result.validationErrors.length > 0) {
    return state;
  }

  const shooter = state.players.find((player) => player.id === result.shooterId);
  const target = state.players.find((player) => player.id === result.targetId);

  if (!shooter || !target) {
    return state;
  }

  const appliedResult = {
    ...result,
    isApplied: true,
  };

  const damagedPlayers = state.players.map((player) => {
    const damage =
      player.id === result.targetId
        ? result.damage
        : player.id === result.shooterId
          ? result.shooterDamage
          : 0;
    return {
      ...player,
      hp: Math.max(0, player.hp - damage),
      isActive: player.id !== result.shooterId,
    };
  }) as [Player, Player];
  const nextTerrain = result.isValidImpact
    ? destroyTerrain(state.terrain, result.impactPoint, result.projectile.blastRadius)
    : state.terrain;
  const hasBaseTerrain = hasSafeBaseTerrain(state);
  const nextPlayers = settlePlayersOnTerrain(damagedPlayers, nextTerrain, hasBaseTerrain);
  const fallenPlayer = state.mode === "ocean"
    ? nextPlayers.find((player) => player.tankPosition.y <= OCEAN_FALL_Y)
    : null;
  const resolvedPlayers = fallenPlayer
    ? nextPlayers.map((player) =>
        player.id === fallenPlayer.id ? { ...player, hp: 0 } : player,
      ) as [Player, Player]
    : nextPlayers;

  const defeatedPlayers = resolvedPlayers.filter((player) => player.hp <= 0);
  const winnerId = fallenPlayer
    ? getOpponentId(fallenPlayer.id)
    : defeatedPlayers.length === 1
      ? getOpponentId(defeatedPlayers[0].id)
      : defeatedPlayers.length > 1
        ? result.targetId
        : null;

  if (winnerId) {
    if (state.mode === "practice" && state.practice) {
      return advancePracticeAfterTargetDefeat(state, appliedResult);
    }

    return {
      players: resolvedPlayers.map((player) => ({ ...player, isActive: player.id === winnerId })) as [
        Player,
        Player,
      ],
      activePlayerId: winnerId,
      movementUsed: 0,
      shotHistory: [appliedResult, ...state.shotHistory],
      lastShot: appliedResult,
      terrain: nextTerrain,
      mode: state.mode,
      mapId: state.mapId,
      winnerId,
      practice: state.practice,
    };
  }

  if (state.mode === "practice" && state.practice) {
    return {
      players: resolvedPlayers.map((player) => ({
        ...player,
        isActive: player.id === "p1",
      })) as [Player, Player],
      activePlayerId: "p1",
      movementUsed: 0,
      shotHistory: [appliedResult, ...state.shotHistory],
      lastShot: appliedResult,
      terrain: nextTerrain,
      mode: state.mode,
      mapId: state.mapId,
      winnerId: null,
      practice: state.practice,
    };
  }

  return {
    players: resolvedPlayers,
    activePlayerId: result.targetId,
    movementUsed: 0,
    shotHistory: [appliedResult, ...state.shotHistory],
    lastShot: appliedResult,
    terrain: nextTerrain,
    mode: state.mode,
    mapId: state.mapId,
    winnerId: null,
    practice: state.practice,
  };
}

export function getRemainingMove(state: GameState): number {
  return roundToStep(Math.max(0, MAX_TURN_MOVE - state.movementUsed));
}

export function getAimXRange(playerId: PlayerId): { min: number; max: number } {
  return playerId === "p1"
    ? { min: BOARD.xMin, max: PLAYER_TERRITORY_LIMIT_X }
    : { min: -PLAYER_TERRITORY_LIMIT_X, max: BOARD.xMax };
}

export function isMoveBlockedByTerritory(state: GameState, direction: MoveDirection): boolean {
  const activePlayer = getActivePlayer(state);
  const nextX = roundToStep(activePlayer.tankPosition.x + direction * MOVE_STEP);

  return !isXInsideMoveTerritory(state, activePlayer.id, nextX);
}

export function canMoveActivePlayer(state: GameState, direction: MoveDirection): boolean {
  return simulateActivePlayerMove(state, direction) !== null;
}

export function moveActivePlayer(state: GameState, direction: MoveDirection): GameState {
  const moveResult = simulateActivePlayerMove(state, direction);

  if (!moveResult) {
    return state;
  }

  const activePlayer = getActivePlayer(state);
  const nextPlayers = state.players.map((player) => {
    if (player.id !== activePlayer.id) {
      return player;
    }

    return {
      ...player,
      tankPosition: {
        ...player.tankPosition,
        x: moveResult.position.x,
        y: moveResult.position.y,
      },
    };
  }) as [Player, Player];

  return {
    ...state,
    players: nextPlayers,
    movementUsed: roundToStep(Math.min(MAX_TURN_MOVE, state.movementUsed + MOVE_STEP)),
    lastShot: null,
    winnerId:
      state.mode === "ocean" && moveResult.fellIntoOcean
        ? getOpponentId(activePlayer.id)
        : state.winnerId,
  };
}

function buildExplanation(
  shooter: Player,
  target: Player,
  vertex: Point,
  result: ReturnType<typeof calculateShotMath>,
): string[] {
  if (result.validationErrors.length > 0) {
    return result.validationErrors;
  }

  const a = round(result.quadratic.a, 3);
  const distanceToTarget = formatCoordinate(result.distanceToTarget);
  const rawDistanceToShooter = distance(result.impactPoint, shooter.tankPosition);
  const distanceToShooter = formatCoordinate(rawDistanceToShooter);
  const shooterDamage = result.isValidImpact
    ? calculateDamage(rawDistanceToShooter, result.projectile)
    : 0;
  const impactX = formatCoordinate(result.impactPoint.x);
  const impactY = formatCoordinate(result.impactPoint.y);
  const blastRadius = result.projectile.blastRadius;
  const maxDamage = result.projectile.maxDamage;
  const BLAST_RADIUS = blastRadius;
  const MAX_DAMAGE = maxDamage;
  const validity = result.isValidImpact
    ? "착탄점이 전장 안에 있어 폭발 피해를 계산합니다."
    : "착탄점이 전장 밖이거나 반대 방향이라 피해가 없습니다.";

  return [
    `${result.projectile.name}: 폭발 반경 ${formatCoordinate(blastRadius)}, 최대 피해 ${maxDamage}`,
    `${shooter.name} 탱크 ${formatPoint(shooter.tankPosition)}와 꼭짓점 ${formatPoint(vertex)}로 a = (0 - ${formatCoordinate(vertex.y)}) / (${formatCoordinate(shooter.tankPosition.x)} - ${formatCoordinate(vertex.x)})² = ${a} 입니다.`,
    `포탄 궤적은 ${formatEquation(result.quadratic)} 입니다.`,
    `지면과 다시 만나는 착탄점은 (${impactX}, ${impactY}) 입니다.`,
    `폭발 범위는 (x - ${impactX})² + (y - ${impactY})² ≤ ${BLAST_RADIUS ** 2} 입니다.`,
    `${target.name} 중심까지 거리는 ${distanceToTarget}이고, 피해는 round(${MAX_DAMAGE} × (1 - ${distanceToTarget} / ${BLAST_RADIUS})) = ${result.damage} 입니다.`,
    `${shooter.name} 중심까지 거리는 ${distanceToShooter}이고, 자기 폭발 피해는 round(${MAX_DAMAGE} × (1 - ${distanceToShooter} / ${BLAST_RADIUS})) = ${shooterDamage} 입니다.`,
    validity,
  ];
}

function formatPoint(point: Point): string {
  return `(${formatCoordinate(point.x)}, ${formatCoordinate(point.y)})`;
}

export function createPreviewShot(state: GameState, input: ShotInput): ShotResult {
  const shooter = getActivePlayer(state);
  const target = getTargetPlayer(state);
  const vertex = { x: input.vertexX, y: input.vertexY };
  const directionErrors = validateAimDirection(shooter, vertex);
  const baseMath = calculateShotMath(
    shooter.tankPosition,
    target.tankPosition,
    vertex,
    input.projectileType,
  );
  const checkedMath = {
    ...baseMath,
    isValidImpact: directionErrors.length > 0 ? false : baseMath.isValidImpact,
    validationErrors: [...directionErrors, ...baseMath.validationErrors],
  };
  const { math, terrainImpact, tankImpact } = resolveShotMath(
    state,
    shooter,
    target,
    vertex,
    input,
    checkedMath,
  );

  return {
    id: 0,
    shooterId: shooter.id,
    targetId: target.id,
    vertex,
    ...math,
    distanceToShooter: math.isValidImpact ? distance(math.impactPoint, shooter.tankPosition) : 0,
    shooterDamage: math.isValidImpact
      ? calculateDamage(distance(math.impactPoint, shooter.tankPosition), math.projectile)
      : 0,
    explanation: buildExplanation(shooter, target, vertex, math),
    isApplied: false,
    terrainImpactBlockId: terrainImpact?.blockId ?? null,
    collisionType: tankImpact?.collisionType ?? getShotCollisionType(terrainImpact, checkedMath, math, target, shooter),
  };
}

function validateAimDirection(shooter: Player, vertex: Point): string[] {
  const errors: string[] = [];

  if (shooter.id === "p1" && vertex.x <= shooter.tankPosition.x) {
    errors.push(BACKWARD_AIM_MESSAGE);
  }

  if (shooter.id === "p2" && vertex.x >= shooter.tankPosition.x) {
    errors.push(BACKWARD_AIM_MESSAGE);
  }

  if (shooter.id === "p1" && vertex.x > PLAYER_TERRITORY_LIMIT_X) {
    errors.push(P1_AIM_LIMIT_MESSAGE);
  }

  if (shooter.id === "p2" && vertex.x < -PLAYER_TERRITORY_LIMIT_X) {
    errors.push(P2_AIM_LIMIT_MESSAGE);
  }

  return errors;
}

function getOpponentId(playerId: PlayerId): PlayerId {
  return playerId === "p1" ? "p2" : "p1";
}

function isXInsideMoveTerritory(state: GameState, playerId: PlayerId, x: number): boolean {
  if (state.mode === "practice") {
    return true;
  }

  return playerId === "p1"
    ? x <= -PLAYER_TERRITORY_LIMIT_X + 0.001
    : x >= PLAYER_TERRITORY_LIMIT_X - 0.001;
}

function advancePracticeAfterTargetDefeat(
  state: GameState,
  appliedResult: ShotResult,
): GameState {
  if (!state.practice) {
    return state;
  }

  const nextHistory = [appliedResult, ...state.shotHistory];

  if (state.practice.step < 3) {
    return {
      ...state,
      players: state.players.map((player) => ({
        ...player,
        hp: player.id === appliedResult.targetId ? 0 : player.hp,
        isActive: player.id === "p1",
      })) as [Player, Player],
      activePlayerId: "p1",
      movementUsed: 0,
      shotHistory: nextHistory,
      lastShot: appliedResult,
      winnerId: null,
      practice: {
        step: state.practice.step,
        isComplete: false,
        pendingNextStep: (state.practice.step + 1) as PracticeStageNumber,
      },
    };
  }

  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hp: player.id === appliedResult.targetId ? 0 : player.hp,
      isActive: player.id === "p1",
    })) as [Player, Player],
    activePlayerId: "p1",
    movementUsed: 0,
    shotHistory: nextHistory,
    lastShot: appliedResult,
    winnerId: null,
    practice: {
      step: 3,
      isComplete: true,
      pendingNextStep: null,
    },
  };
}

function cloneTerrain(terrain: TerrainState): TerrainState {
  return {
    blocks: terrain.blocks.map((block) => ({ ...block })),
    segments: terrain.segments.map((segment) => ({ ...segment })),
    holes: terrain.holes.map((hole) => ({ ...hole })),
    columns: terrain.columns ? cloneTerrainColumnMap(terrain.columns) : undefined,
  };
}

type MoveSimulationResult = {
  position: Point;
  fellIntoOcean: boolean;
};

function simulateActivePlayerMove(
  state: GameState,
  direction: MoveDirection,
): MoveSimulationResult | null {
  if (state.winnerId || getRemainingMove(state) < MOVE_STEP) {
    return null;
  }

  const activePlayer = getActivePlayer(state);
  const targetPlayer = getTargetPlayer(state);
  const columns = buildTerrainColumnMap(state.terrain);
  const hasBase = hasSafeBaseTerrain(state);
  let x = round(activePlayer.tankPosition.x, 2);
  let y = activePlayer.tankPosition.y;
  let isFalling = false;
  const initialSupport = findColumnSupportAtX(columns, x, y + CURRENT_SUPPORT_REACH_HEIGHT, hasBase);

  if (!initialSupport) {
    return null;
  }

  y = initialSupport.topY;

  for (let step = 0; step < INTERNAL_MOVE_STEPS; step += 1) {
    const nextX = round(x + direction * TERRAIN_COLUMN_STEP, 2);

    if (
      nextX < BOARD.xMin ||
      nextX > BOARD.xMax ||
      !isXInsideMoveTerritory(state, activePlayer.id, nextX) ||
      nearlyEqual(nextX, targetPlayer.tankPosition.x)
    ) {
      return null;
    }

    const nextSupport = findColumnSupportAtX(
      columns,
      nextX,
      y + MAX_TANK_STEP_UP_HEIGHT,
      hasBase,
    );
    const nextY = nextSupport?.topY ?? (hasBase ? BOARD.yMin : OCEAN_FALL_Y);
    const heightDelta = nextY - y;

    if (heightDelta < -MAX_TANK_STEP_UP_HEIGHT) {
      if (doesTerrainColumnOverlapBody(columns, nextX, y, TANK_SIDE_BODY_HEIGHT)) {
        return null;
      }

      x = nextX;
      isFalling = true;
      continue;
    }

    if (heightDelta > MAX_TANK_STEP_UP_HEIGHT + 0.01) {
      return null;
    }

    if (
      heightDelta > MAX_TANK_TERRAIN_SLOPE * TERRAIN_COLUMN_STEP + 0.01 &&
      nextSupport?.topKind !== "flat"
    ) {
      return null;
    }

    const bodyCheckY = heightDelta < -0.01 ? y : nextY;
    if (doesTerrainColumnOverlapBody(columns, nextX, bodyCheckY, TANK_SIDE_BODY_HEIGHT)) {
      return null;
    }

    x = nextX;
    y = nextY;
  }

  if (isFalling) {
    const landingSupport = findColumnSupportAtX(columns, x, y + CURRENT_SUPPORT_REACH_HEIGHT, hasBase);
    y = landingSupport?.topY ?? (hasBase ? BOARD.yMin : OCEAN_FALL_Y);
  }

  return {
    position: {
      x: roundToStep(x),
      y: round(y, 2),
    },
    fellIntoOcean: !hasBase && y <= OCEAN_FALL_Y,
  };
}

function hasSafeBaseTerrain(state: GameState): boolean {
  return state.mode === "normal" || state.mode === "practice";
}

export function isVertexInsideBoard(input: ShotInput): boolean {
  return (
    input.vertexX >= BOARD.xMin &&
    input.vertexX <= BOARD.xMax &&
    input.vertexY > BOARD.yMin &&
    input.vertexY <= BOARD.yMax
  );
}

export function getShotProjectile(input: ShotInput): ProjectileConfig {
  return getProjectileConfig(input.projectileType ?? "normal");
}
