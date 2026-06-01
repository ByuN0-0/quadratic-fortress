import {
  BOARD,
  STARTING_HP,
  calculateDamage,
  calculateShotMath,
  distance,
  formatCoordinate,
  formatEquation,
  getProjectileConfig,
  nearlyEqual,
  round,
  roundToStep,
  type Point,
  type ProjectileConfig,
  type ProjectileType,
  type Quadratic,
} from "./math";
import {
  createInitialTerrain,
  destroyTerrain,
  findProjectileTerrainImpact,
  findSupportAtX,
  findSupportY,
  OCEAN_FALL_Y,
  settlePlayersOnTerrain,
  type TerrainMapId,
  type TerrainState,
} from "./terrain";

export type PlayerId = "p1" | "p2";
export type GameMode = "normal" | "ocean";

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
};

export const MAX_TURN_MOVE = 3;
export const MOVE_STEP = 0.1;
export const PLAYER_START_HEIGHT = BOARD.yMax;
export const PROJECTILE_TERRAIN_ARM_DISTANCE = 0.7;
export const MAX_TANK_TERRAIN_SLOPE = 1;

export function createInitialGameState(
  mode: GameMode = "normal",
  mapId: TerrainMapId = "map1",
): GameState {
  const terrain = createInitialTerrain(mapId);
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
  };
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
  const baseMath = calculateShotMath(
    shooter.tankPosition,
    target.tankPosition,
    vertex,
    input.projectileType,
  );
  const terrainImpact =
    baseMath.validationErrors.length === 0
      ? findProjectileTerrainImpact(
          shooter.tankPosition,
          baseMath.quadratic,
          baseMath.impactPoint,
          state.terrain,
          PROJECTILE_TERRAIN_ARM_DISTANCE,
        )
      : null;
  const math = terrainImpact
    ? calculateShotMath(
        shooter.tankPosition,
        target.tankPosition,
        vertex,
        input.projectileType,
        terrainImpact.point,
      )
    : baseMath;
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
  const hasBaseTerrain = state.mode === "normal";
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
  };
}

export function getRemainingMove(state: GameState): number {
  return roundToStep(Math.max(0, MAX_TURN_MOVE - state.movementUsed));
}

export function canMoveActivePlayer(state: GameState, direction: MoveDirection): boolean {
  if (state.winnerId || getRemainingMove(state) < MOVE_STEP) {
    return false;
  }

  const activePlayer = getActivePlayer(state);
  const targetPlayer = getTargetPlayer(state);
  const nextX = roundToStep(activePlayer.tankPosition.x + direction * MOVE_STEP);
  const rawNextSupport = findSupportAtX(
    nextX,
    activePlayer.tankPosition.y + MAX_TANK_TERRAIN_SLOPE * MOVE_STEP,
    state.terrain,
  );
  const currentSupport = findReachableTankSupport(
    state,
    activePlayer.tankPosition.x,
    activePlayer.tankPosition.y,
  );
  const nextSupport = findReachableTankSupport(state, nextX, activePlayer.tankPosition.y);
  const nextSlope = nextSupport?.slope ?? 0;
  const climbSlope =
    currentSupport && nextSupport
      ? (nextSupport.y - currentSupport.y) / MOVE_STEP
      : -Infinity;
  const isBlockedByNearbyWall =
    currentSupport !== null &&
    rawNextSupport === null &&
    state.mode === "normal" &&
    isNearbyTerrainWallAhead(state, nextX, direction, currentSupport.y);

  return (
    nextX >= BOARD.xMin &&
    nextX <= BOARD.xMax &&
    !nearlyEqual(nextX, targetPlayer.tankPosition.x) &&
    currentSupport !== null &&
    !isBlockedByNearbyWall &&
    Math.abs(currentSupport.slope) <= MAX_TANK_TERRAIN_SLOPE &&
    Math.abs(nextSlope) <= MAX_TANK_TERRAIN_SLOPE &&
    climbSlope <= MAX_TANK_TERRAIN_SLOPE + 0.01
  );
}

export function moveActivePlayer(state: GameState, direction: MoveDirection): GameState {
  if (!canMoveActivePlayer(state, direction)) {
    return state;
  }

  const activePlayer = getActivePlayer(state);
  const nextX = roundToStep(activePlayer.tankPosition.x + direction * MOVE_STEP);
  const nextSupport = findReachableTankSupport(state, nextX, activePlayer.tankPosition.y);
  const nextPlayers = state.players.map((player) => {
    if (player.id !== activePlayer.id) {
      return player;
    }

    return {
      ...player,
      tankPosition: {
        ...player.tankPosition,
        x: roundToStep(player.tankPosition.x + direction * MOVE_STEP),
        y: nextSupport?.y ?? (state.mode === "normal" ? BOARD.yMin : OCEAN_FALL_Y),
      },
    };
  }) as [Player, Player];

  return {
    ...state,
    players: nextPlayers,
    movementUsed: roundToStep(Math.min(MAX_TURN_MOVE, state.movementUsed + MOVE_STEP)),
    lastShot: null,
    winnerId:
      state.mode === "ocean" && !nextSupport ? getOpponentId(activePlayer.id) : state.winnerId,
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
  const baseMath = calculateShotMath(
    shooter.tankPosition,
    target.tankPosition,
    vertex,
    input.projectileType,
  );
  const terrainImpact =
    baseMath.validationErrors.length === 0
      ? findProjectileTerrainImpact(
          shooter.tankPosition,
          baseMath.quadratic,
          baseMath.impactPoint,
          state.terrain,
          PROJECTILE_TERRAIN_ARM_DISTANCE,
        )
      : null;
  const math = terrainImpact
    ? calculateShotMath(
        shooter.tankPosition,
        target.tankPosition,
        vertex,
        input.projectileType,
        terrainImpact.point,
      )
    : baseMath;

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
  };
}

function getOpponentId(playerId: PlayerId): PlayerId {
  return playerId === "p1" ? "p2" : "p1";
}

function findReachableTankSupport(
  state: GameState,
  x: number,
  currentY: number,
): { y: number; slope: number } | null {
  const maxReachY = currentY + MAX_TANK_TERRAIN_SLOPE * MOVE_STEP;
  const support = findSupportAtX(x, maxReachY, state.terrain);

  if (support || state.mode !== "normal") {
    return support;
  }

  return { y: BOARD.yMin, slope: 0 };
}

function isNearbyTerrainWallAhead(
  state: GameState,
  nextX: number,
  direction: MoveDirection,
  currentY: number,
): boolean {
  const lookAheadX = roundToStep(nextX + direction * MOVE_STEP);

  if (lookAheadX < BOARD.xMin || lookAheadX > BOARD.xMax) {
    return false;
  }

  const supportAhead = findSupportAtX(lookAheadX, BOARD.yMax, state.terrain);

  if (!supportAhead) {
    return false;
  }

  const heightDifference = supportAhead.y - currentY;

  return heightDifference > MAX_TANK_TERRAIN_SLOPE * MOVE_STEP + 0.01 && heightDifference <= 1;
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
