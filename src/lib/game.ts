import {
  BOARD,
  STARTING_HP,
  calculateShotMath,
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
  findSupportY,
  settlePlayersOnTerrain,
  type TerrainState,
} from "./terrain";

export type PlayerId = "p1" | "p2";

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
  damage: number;
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
  winnerId: PlayerId | null;
};

export const MAX_TURN_MOVE = 3;
export const MOVE_STEP = 0.1;
export const PLAYER_START_HEIGHT = BOARD.yMax;
export const PROJECTILE_TERRAIN_ARM_DISTANCE = 0.7;

export function createInitialGameState(): GameState {
  const terrain = createInitialTerrain();
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
    if (player.id !== result.targetId) {
      return {
        ...player,
        isActive: player.id !== result.shooterId,
      };
    }

    return {
      ...player,
      hp: Math.max(0, player.hp - result.damage),
      isActive: true,
    };
  }) as [Player, Player];
  const nextTerrain = result.isValidImpact
    ? destroyTerrain(state.terrain, result.impactPoint, result.projectile.blastRadius)
    : state.terrain;
  const nextPlayers = settlePlayersOnTerrain(damagedPlayers, nextTerrain);

  const winnerId = nextPlayers.find((player) => player.hp <= 0)
    ? result.shooterId
    : null;

  if (winnerId) {
    return {
      players: nextPlayers.map((player) => ({ ...player, isActive: player.id === winnerId })) as [
        Player,
        Player,
      ],
      activePlayerId: winnerId,
      movementUsed: 0,
      shotHistory: [appliedResult, ...state.shotHistory],
      lastShot: appliedResult,
      terrain: nextTerrain,
      winnerId,
    };
  }

  return {
    players: nextPlayers,
    activePlayerId: result.targetId,
    movementUsed: 0,
    shotHistory: [appliedResult, ...state.shotHistory],
    lastShot: appliedResult,
    terrain: nextTerrain,
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

  return (
    nextX >= BOARD.xMin &&
    nextX <= BOARD.xMax &&
    !nearlyEqual(nextX, targetPlayer.tankPosition.x)
  );
}

export function moveActivePlayer(state: GameState, direction: MoveDirection): GameState {
  if (!canMoveActivePlayer(state, direction)) {
    return state;
  }

  const activePlayer = getActivePlayer(state);
  const nextX = roundToStep(activePlayer.tankPosition.x + direction * MOVE_STEP);
  const nextPlayers = state.players.map((player) => {
    if (player.id !== activePlayer.id) {
      return player;
    }

    return {
      ...player,
      tankPosition: {
        ...player.tankPosition,
        x: roundToStep(player.tankPosition.x + direction * MOVE_STEP),
        y: findSupportY(nextX, PLAYER_START_HEIGHT, state.terrain),
      },
    };
  }) as [Player, Player];

  return {
    ...state,
    players: nextPlayers,
    movementUsed: roundToStep(Math.min(MAX_TURN_MOVE, state.movementUsed + MOVE_STEP)),
    lastShot: null,
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
    explanation: buildExplanation(shooter, target, vertex, math),
    isApplied: false,
    terrainImpactBlockId: terrainImpact?.blockId ?? null,
  };
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
