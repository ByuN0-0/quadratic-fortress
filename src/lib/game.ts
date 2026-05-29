import {
  BLAST_RADIUS,
  BOARD,
  MAX_DAMAGE,
  STARTING_HP,
  calculateShotMath,
  formatEquation,
  round,
  type Point,
  type Quadratic,
} from "./math";

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
};

export type MoveDirection = -1 | 1;

export type ShotResult = {
  id: number;
  shooterId: PlayerId;
  targetId: PlayerId;
  vertex: Point;
  quadratic: Quadratic;
  impactPoint: Point;
  distanceToTarget: number;
  damage: number;
  isValidImpact: boolean;
  validationErrors: string[];
  explanation: string[];
};

export type GameState = {
  players: [Player, Player];
  activePlayerId: PlayerId;
  movementUsed: number;
  shotHistory: ShotResult[];
  lastShot: ShotResult | null;
  winnerId: PlayerId | null;
};

export const MAX_TURN_MOVE = 3;

export function createInitialGameState(): GameState {
  return {
    players: [
      {
        id: "p1",
        name: "1P",
        tankPosition: { x: -8, y: 0 },
        hp: STARTING_HP,
        isActive: true,
      },
      {
        id: "p2",
        name: "2P",
        tankPosition: { x: 8, y: 0 },
        hp: STARTING_HP,
        isActive: false,
      },
    ],
    activePlayerId: "p1",
    movementUsed: 0,
    shotHistory: [],
    lastShot: null,
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
  if (state.winnerId) {
    return state;
  }

  const shooter = getActivePlayer(state);
  const target = getTargetPlayer(state);
  const vertex = { x: input.vertexX, y: input.vertexY };
  const math = calculateShotMath(shooter.tankPosition, target.tankPosition, vertex);
  const result: ShotResult = {
    id: state.shotHistory.length + 1,
    shooterId: shooter.id,
    targetId: target.id,
    vertex,
    ...math,
    explanation: buildExplanation(shooter, target, vertex, math),
  };

  if (result.validationErrors.length > 0) {
    return {
      ...state,
      lastShot: result,
    };
  }

  const nextPlayers = state.players.map((player) => {
    if (player.id !== target.id) {
      return {
        ...player,
        isActive: player.id !== shooter.id,
      };
    }

    return {
      ...player,
      hp: Math.max(0, player.hp - result.damage),
      isActive: true,
    };
  }) as [Player, Player];

  const winnerId = nextPlayers.find((player) => player.hp <= 0)
    ? shooter.id
    : null;

  if (winnerId) {
    return {
      players: nextPlayers.map((player) => ({ ...player, isActive: player.id === winnerId })) as [
        Player,
        Player,
      ],
      activePlayerId: winnerId,
      movementUsed: 0,
      shotHistory: [result, ...state.shotHistory],
      lastShot: result,
      winnerId,
    };
  }

  return {
    players: nextPlayers,
    activePlayerId: target.id,
    movementUsed: 0,
    shotHistory: [result, ...state.shotHistory],
    lastShot: result,
    winnerId: null,
  };
}

export function getRemainingMove(state: GameState): number {
  return Math.max(0, MAX_TURN_MOVE - state.movementUsed);
}

export function canMoveActivePlayer(state: GameState, direction: MoveDirection): boolean {
  if (state.winnerId || getRemainingMove(state) <= 0) {
    return false;
  }

  const activePlayer = getActivePlayer(state);
  const targetPlayer = getTargetPlayer(state);
  const nextX = activePlayer.tankPosition.x + direction;

  return nextX >= BOARD.xMin && nextX <= BOARD.xMax && nextX !== targetPlayer.tankPosition.x;
}

export function moveActivePlayer(state: GameState, direction: MoveDirection): GameState {
  if (!canMoveActivePlayer(state, direction)) {
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
        x: player.tankPosition.x + direction,
      },
    };
  }) as [Player, Player];

  return {
    ...state,
    players: nextPlayers,
    movementUsed: state.movementUsed + 1,
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
  const distanceToTarget = round(result.distanceToTarget, 2);
  const impactX = round(result.impactPoint.x, 2);
  const impactY = round(result.impactPoint.y, 2);
  const validity = result.isValidImpact
    ? "착탄점이 전장 안에 있어 폭발 피해를 계산합니다."
    : "착탄점이 전장 밖이거나 반대 방향이라 피해가 없습니다.";

  return [
    `${shooter.name} 탱크 (${shooter.tankPosition.x}, ${shooter.tankPosition.y})와 꼭짓점 (${vertex.x}, ${vertex.y})로 a = (0 - ${vertex.y}) / (${shooter.tankPosition.x} - ${vertex.x})² = ${a} 입니다.`,
    `포탄 궤적은 ${formatEquation(result.quadratic)} 입니다.`,
    `지면과 다시 만나는 착탄점은 (${impactX}, ${impactY}) 입니다.`,
    `폭발 범위는 (x - ${impactX})² + (y - ${impactY})² ≤ ${BLAST_RADIUS ** 2} 입니다.`,
    `${target.name} 중심까지 거리는 ${distanceToTarget}이고, 피해는 round(${MAX_DAMAGE} × (1 - ${distanceToTarget} / ${BLAST_RADIUS})) = ${result.damage} 입니다.`,
    validity,
  ];
}

export function createPreviewShot(state: GameState, input: ShotInput): ShotResult {
  const shooter = getActivePlayer(state);
  const target = getTargetPlayer(state);
  const vertex = { x: input.vertexX, y: input.vertexY };
  const math = calculateShotMath(shooter.tankPosition, target.tankPosition, vertex);

  return {
    id: 0,
    shooterId: shooter.id,
    targetId: target.id,
    vertex,
    ...math,
    explanation: buildExplanation(shooter, target, vertex, math),
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
