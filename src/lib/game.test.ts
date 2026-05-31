import { describe, expect, it } from "vitest";
import {
  MAX_TURN_MOVE,
  MOVE_STEP,
  applyLastShot,
  canMoveActivePlayer,
  createInitialGameState,
  getRemainingMove,
  moveActivePlayer,
  prepareShot,
  submitShot,
} from "./game";
import { getProjectileConfig } from "./math";

function createFlatShotState(): ReturnType<typeof createInitialGameState> {
  const state = createInitialGameState();

  return {
    ...state,
    players: [
      { ...state.players[0], tankPosition: { x: -8, y: 0 } },
      { ...state.players[1], tankPosition: { x: 8, y: 0 } },
    ],
    terrain: {
      blocks: [],
      segments: [],
      holes: [],
    },
  };
}

describe("game reducer", () => {
  it("stores the selected game mode", () => {
    expect(createInitialGameState().mode).toBe("normal");
    expect(createInitialGameState("ocean").mode).toBe("ocean");
  });

  it("stores the selected terrain map", () => {
    const state = createInitialGameState("normal", "map2");

    expect(state.mapId).toBe("map2");
    expect(state.terrain.blocks.some((block) => block.id.startsWith("map2"))).toBe(true);
  });

  it("starts players by dropping from the top onto air terrain", () => {
    const state = createInitialGameState();

    expect(state.players[0].tankPosition).toEqual({ x: -8, y: 2.5 });
    expect(state.players[1].tankPosition).toEqual({ x: 8, y: 2.5 });
  });

  it("switches turn and applies damage after a valid shot", () => {
    const next = submitShot(createFlatShotState(), { vertexX: 0, vertexY: 6 });

    expect(next.activePlayerId).toBe("p2");
    expect(next.players[1].hp).toBe(80);
    expect(next.shotHistory).toHaveLength(1);
    expect(next.shotHistory[0].projectile.id).toBe("normal");
  });

  it("stores the selected projectile and applies its damage", () => {
    const next = submitShot(createFlatShotState(), {
      vertexX: 0,
      vertexY: 6,
      projectileType: "power",
    });

    expect(next.players[1].hp).toBe(65);
    expect(next.shotHistory[0].projectile.id).toBe("power");
    expect(next.shotHistory[0].damage).toBe(35);
  });

  it("explodes on air terrain before reaching the ground impact", () => {
    const state = {
      ...createInitialGameState(),
      terrain: {
        blocks: [{ id: "test-platform", x: -4.3, y: 4.9, width: 0.8, height: 0.5 }],
        segments: [] as ReturnType<typeof createInitialGameState>["terrain"]["segments"],
        holes: [],
      },
    };
    const prepared = prepareShot(state, { vertexX: 0, vertexY: 6 });

    expect(prepared.lastShot?.terrainImpactBlockId).toBe("test-platform");
    expect(prepared.lastShot?.impactPoint.y).toBeGreaterThan(0);

    const applied = applyLastShot(prepared);
    expect(applied.terrain.holes).toHaveLength(1);
    expect(applied.terrain.holes[0].radius).toBe(1);
    expect(applied.players[1].hp).toBe(100);
    expect(applied.activePlayerId).toBe("p2");
  });

  it("keeps turn and HP unchanged after invalid input", () => {
    const next = submitShot(createInitialGameState(), { vertexX: -8, vertexY: 6 });

    expect(next.activePlayerId).toBe("p1");
    expect(next.players[1].hp).toBe(100);
    expect(next.shotHistory).toHaveLength(0);
    expect(next.lastShot?.validationErrors.length).toBeGreaterThan(0);
  });

  it("prepares a valid shot without immediately applying damage or switching turn", () => {
    const state = moveActivePlayer(createFlatShotState(), 1);
    const next = prepareShot(state, { vertexX: 0, vertexY: 6 });

    expect(next.activePlayerId).toBe("p1");
    expect(next.players[1].hp).toBe(100);
    expect(next.movementUsed).toBe(0.1);
    expect(next.shotHistory).toHaveLength(0);
    expect(next.lastShot?.isApplied).toBe(false);
    expect(next.lastShot?.damage).toBeGreaterThan(0);
  });

  it("applies the prepared valid shot and switches turn", () => {
    const prepared = prepareShot(createFlatShotState(), { vertexX: 0, vertexY: 6 });
    const applied = applyLastShot(prepared);

    expect(applied.activePlayerId).toBe("p2");
    expect(applied.players[1].hp).toBe(80);
    expect(applied.movementUsed).toBe(0);
    expect(applied.shotHistory).toHaveLength(1);
    expect(applied.lastShot?.isApplied).toBe(true);
  });

  it("does not apply invalid prepared shots", () => {
    const state = moveActivePlayer(createInitialGameState(), 1);
    const prepared = prepareShot(state, { vertexX: -7.9, vertexY: 6 });
    const applied = applyLastShot(prepared);

    expect(applied.activePlayerId).toBe("p1");
    expect(applied.players[1].hp).toBe(100);
    expect(applied.movementUsed).toBe(0.1);
    expect(applied.shotHistory).toHaveLength(0);
    expect(applied.lastShot?.validationErrors.length).toBeGreaterThan(0);
  });

  it("does not apply the same prepared shot twice", () => {
    const prepared = prepareShot(createFlatShotState(), { vertexX: 0, vertexY: 6 });
    const applied = applyLastShot(prepared);
    const reapplied = applyLastShot(applied);

    expect(reapplied.players[1].hp).toBe(80);
    expect(reapplied.shotHistory).toHaveLength(1);
  });

  it("moves the active player left and right before firing", () => {
    let state = createInitialGameState();

    state = moveActivePlayer(state, 1);
    expect(state.players[0].tankPosition.x).toBe(-7.9);
    expect(state.movementUsed).toBe(0.1);

    state = moveActivePlayer(state, -1);
    expect(state.players[0].tankPosition.x).toBe(-8);
    expect(state.movementUsed).toBe(0.2);
  });

  it("limits active player movement to three spaces per turn", () => {
    let state = createInitialGameState();

    for (let move = 0; move < MAX_TURN_MOVE / MOVE_STEP; move += 1) {
      state = moveActivePlayer(state, 1);
    }

    const afterLimit = moveActivePlayer(state, 1);

    expect(state.players[0].tankPosition.x).toBe(-5);
    expect(afterLimit.players[0].tankPosition.x).toBe(-5);
    expect(getRemainingMove(afterLimit)).toBe(0);
  });

  it("does not move outside the board", () => {
    let state = createInitialGameState();

    for (let move = 0; move < 20; move += 1) {
      state = moveActivePlayer(state, -1);
    }

    const blocked = moveActivePlayer(state, -1);

    expect(state.players[0].tankPosition.x).toBe(-10);
    expect(blocked.players[0].tankPosition.x).toBe(-10);
    expect(blocked.movementUsed).toBe(2);
  });

  it("does not move onto the opponent tank position", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: 7.9, y: 0 },
        },
        createInitialGameState().players[1],
      ] as ReturnType<typeof createInitialGameState>["players"],
    };

    expect(canMoveActivePlayer(state, 1)).toBe(false);
    expect(moveActivePlayer(state, 1)).toBe(state);
  });

  it("blocks movement on terrain steeper than slope 1", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: 0, y: 0 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [{ id: "steep", x1: 0, y1: 0, x2: 1, y2: 2 }],
        holes: [],
      },
    };

    expect(canMoveActivePlayer(state, 1)).toBe(false);
    expect(moveActivePlayer(state, 1)).toBe(state);
  });

  it("moves on gentle slopes and corrects y to the terrain height", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: 0, y: 0 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [{ id: "gentle", x1: 0, y1: 0, x2: 1, y2: 1 }],
        holes: [],
      },
    };

    const moved = moveActivePlayer(state, 1);

    expect(moved.players[0].tankPosition).toEqual({ x: 0.1, y: 0.1 });
  });

  it("does not snap from the base ground up to an overhead platform", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -6.2, y: 0 },
        },
        createInitialGameState().players[1],
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [{ id: "overhead", x1: -6.8, y1: 2.5, x2: -5.8, y2: 3 }],
        holes: [],
      },
    };

    const moved = moveActivePlayer(state, -1);

    expect(moved.players[0].tankPosition).toEqual({ x: -6.3, y: 0 });
  });

  it("resets movement after a valid shot and keeps it after invalid shot", () => {
    let state = createInitialGameState();
    state = moveActivePlayer(state, 1);
    state = applyLastShot(prepareShot(state, { vertexX: 0, vertexY: 6 }));

    expect(state.activePlayerId).toBe("p2");
    expect(state.movementUsed).toBe(0);

    state = moveActivePlayer(state, -1);
    state = applyLastShot(prepareShot(state, { vertexX: 7.9, vertexY: 6 }));

    expect(state.activePlayerId).toBe("p2");
    expect(state.movementUsed).toBe(0.1);
    expect(state.lastShot?.validationErrors.length).toBeGreaterThan(0);
  });

  it("declares a winner when target HP reaches zero", () => {
    let state: ReturnType<typeof createInitialGameState> = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -8, y: 0 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [] as ReturnType<typeof createInitialGameState>["terrain"]["segments"],
        holes: [],
      },
    };

    for (let turn = 0; turn < 8; turn += 1) {
      state = submitShot(state, { vertexX: 0, vertexY: 6 });
    }

    expect(state.winnerId).toBeNull();

    state = submitShot(state, { vertexX: 0, vertexY: 6 });

    expect(state.winnerId).toBe("p1");
    expect(state.players[1].hp).toBe(0);
  });

  it("declares defeat after an unsupported player falls in ocean mode", () => {
    const state = {
      ...createInitialGameState("ocean"),
      activePlayerId: "p2" as const,
      players: [
        {
          ...createInitialGameState("ocean").players[0],
          tankPosition: { x: -8, y: 2.5 },
          isActive: false,
        },
        {
          ...createInitialGameState("ocean").players[1],
          tankPosition: { x: 8, y: 2.5 },
          isActive: true,
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [
          { id: "left", x: -8.5, y: 2, width: 1, height: 0.5 },
          { id: "right", x: 7.5, y: 2, width: 1, height: 0.5 },
        ],
        segments: [] as ReturnType<typeof createInitialGameState>["terrain"]["segments"],
        holes: [],
      },
      lastShot: {
        id: 1,
        shooterId: "p2" as const,
        targetId: "p1" as const,
        projectile: getProjectileConfig("normal"),
        vertex: { x: 0, y: 6 },
        quadratic: { a: -0.1, h: 0, k: 6 },
        impactPoint: { x: -8, y: 2.25 },
        distanceToTarget: 0,
        damage: 0,
        isValidImpact: true,
        validationErrors: [],
        explanation: [],
        isApplied: false,
        terrainImpactBlockId: "left",
      },
    };

    const applied = applyLastShot(state);

    expect(applied.winnerId).toBe("p2");
    expect(applied.players[0].hp).toBe(0);
    expect(applied.players[0].tankPosition.y).toBe(-1);
  });
});
