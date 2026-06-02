import { describe, expect, it } from "vitest";
import {
  BACKWARD_AIM_MESSAGE,
  MAX_TURN_MOVE,
  MAX_TANK_STEP_UP_HEIGHT,
  MOVE_STEP,
  P1_AIM_LIMIT_MESSAGE,
  P2_AIM_LIMIT_MESSAGE,
  applyLastShot,
  canMoveActivePlayer,
  continuePracticeAfterSuccess,
  createInitialGameState,
  createPracticeGameState,
  createPreviewShot,
  getPracticeStage,
  getRemainingMove,
  moveActivePlayer,
  prepareShot,
  submitShot,
} from "./game";
import { getProjectileConfig } from "./math";
import { buildTerrainColumnMap, terrainColumnIndex } from "./terrain";

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

function createAppliedTerrainBlast(
  state: ReturnType<typeof createInitialGameState>,
  impactPoint: { x: number; y: number },
  blastRadius: number,
): NonNullable<ReturnType<typeof createInitialGameState>["lastShot"]> {
  const projectile = {
    ...getProjectileConfig("normal"),
    blastRadius,
  } as ReturnType<typeof getProjectileConfig>;

  return {
    id: state.shotHistory.length + 1,
    shooterId: "p1",
    targetId: "p2",
    projectile,
    vertex: { x: 0, y: 6 },
    quadratic: { a: 0, h: 0, k: 6 },
    impactPoint,
    distanceToTarget: 0,
    distanceToShooter: 0,
    damage: 0,
    shooterDamage: 0,
    isValidImpact: true,
    validationErrors: [],
    explanation: [],
    isApplied: false,
    terrainImpactBlockId: "terrain-column",
    collisionType: "terrain",
  };
}

describe("game reducer", () => {
  it("stores the selected game mode", () => {
    expect(createInitialGameState().mode).toBe("normal");
    expect(createInitialGameState("ocean").mode).toBe("ocean");
    expect(createInitialGameState("practice").mode).toBe("practice");
  });

  it("creates the first practice mission with a target and wall", () => {
    const state = createPracticeGameState();

    expect(state.practice).toEqual({ step: 1, isComplete: false, pendingNextStep: null });
    expect(getPracticeStage(1).defaultInput).toEqual({
      vertexX: 0,
      vertexY: 5,
      projectileType: "normal",
    });
    expect(state.activePlayerId).toBe("p1");
    expect(state.players[0].tankPosition).toEqual({ x: -8, y: 0 });
    expect(state.players[1].name).toBe("목표물");
    expect(state.players[1].tankPosition).toEqual({ x: 8, y: 0 });
    expect(state.players[1].hp).toBe(1);
    expect(state.terrain.blocks).toEqual([
      { id: "practice-1-wall", x: -1, y: 0, width: 2, height: 6 },
    ]);
  });

  it("creates terrain columns at game start", () => {
    expect(createInitialGameState().terrain.columns).toBeDefined();
    expect(createInitialGameState("ocean", "map2").terrain.columns).toBeDefined();
    expect(createPracticeGameState(1).terrain.columns).toBeDefined();
  });

  it("removes class-map safe-base terrain in ocean mode", () => {
    const normalState = createInitialGameState("normal", "map1");
    const oceanState = createInitialGameState("ocean", "map1");

    expect(normalState.terrain.blocks.some((block) => block.id.endsWith("-safe-base") && block.isFoundation)).toBe(true);
    expect(oceanState.terrain.blocks.some((block) => block.id.endsWith("-safe-base"))).toBe(false);
    expect(oceanState.terrain.blocks.some((block) => block.id.endsWith("-playable-base"))).toBe(true);
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

  it("keeps a normal-mode player on the safe base after playable ground is destroyed", () => {
    const state = createInitialGameState("normal", "map1");
    const next = applyLastShot({
      ...state,
      lastShot: createAppliedTerrainBlast(state, { x: 8, y: 1.5 }, 1.1),
    });

    expect(next.players[1].tankPosition.y).toBe(0.5);
    expect(next.winnerId).toBeNull();
  });

  it("defeats an ocean-mode player when destroyed playable ground has no lower support", () => {
    const state = createInitialGameState("ocean", "map1");
    const next = applyLastShot({
      ...state,
      lastShot: createAppliedTerrainBlast(state, { x: 8, y: 1.5 }, 1.1),
    });

    expect(next.players[1].hp).toBe(0);
    expect(next.winnerId).toBe("p1");
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

  it("applies the same blast damage to the shooter when inside the explosion radius", () => {
    const state = {
      ...createFlatShotState(),
      players: [
        { ...createFlatShotState().players[0], tankPosition: { x: -8, y: 0 } },
        { ...createFlatShotState().players[1], tankPosition: { x: 8, y: 0 } },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [
          { id: "near-shooter", x: -7.4, y: 0.7, width: 0.5, height: 0.5 },
        ],
        segments: [] as ReturnType<typeof createInitialGameState>["terrain"]["segments"],
        holes: [],
      },
    };

    const next = submitShot(state, { vertexX: 0, vertexY: 6, projectileType: "wide" });

    expect(next.players[0].hp).toBeLessThan(100);
    expect(next.players[1].hp).toBe(100);
    expect(next.shotHistory[0].shooterDamage).toBeGreaterThan(0);
    expect(next.shotHistory[0].damage).toBe(0);
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

    expect(prepared.lastShot?.terrainImpactBlockId).toBe("terrain-column");
    expect(prepared.lastShot?.collisionType).toBe("terrain");
    expect(prepared.lastShot?.impactPoint.y).toBeGreaterThan(0);

    const applied = applyLastShot(prepared);
    expect(applied.terrain.holes).toHaveLength(1);
    expect(applied.terrain.holes[0].radius).toBe(1);
    expect(applied.players[1].hp).toBe(100);
    expect(applied.activePlayerId).toBe("p2");
  });

  it("marks out-of-bounds shots with a collision type", () => {
    const base = createFlatShotState();
    const state = {
      ...base,
      players: [
        { ...base.players[0], tankPosition: { x: -9, y: 0 } },
        base.players[1],
      ] as ReturnType<typeof createInitialGameState>["players"],
    };
    const prepared = prepareShot(state, { vertexX: 1, vertexY: 6 });

    expect(prepared.lastShot?.collisionType).toBe("outOfBounds");
  });

  it("marks damaging ground blasts as tank collision candidates", () => {
    const next = prepareShot(createFlatShotState(), { vertexX: 0, vertexY: 6 });

    expect(next.lastShot?.collisionType).toBe("tank");
  });


  it("destroys destructible terrain inside the blast when a shot hits a tank", () => {
    const base = createFlatShotState();
    const state = {
      ...base,
      players: [
        { ...base.players[0], tankPosition: { x: -8, y: 0 } },
        { ...base.players[1], tankPosition: { x: 8, y: 0 } },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [
          { id: "safe-base", x: 7.5, y: 0, width: 1, height: 0.1, isFoundation: true },
          { id: "target-platform", x: 7.5, y: 0.1, width: 1, height: 0.4 },
        ],
        segments: [] as ReturnType<typeof createInitialGameState>["terrain"]["segments"],
        holes: [],
        columns: buildTerrainColumnMap({
          blocks: [
            { id: "safe-base", x: 7.5, y: 0, width: 1, height: 0.1, isFoundation: true },
            { id: "target-platform", x: 7.5, y: 0.1, width: 1, height: 0.4 },
          ],
          segments: [],
          holes: [],
        }),
      },
    };

    const prepared = prepareShot(state, { vertexX: 0, vertexY: 6, projectileType: "normal" });

    expect(prepared.lastShot?.collisionType).toBe("tank");
    expect(prepared.lastShot?.impactPoint).toEqual({ x: 8, y: 0 });

    const applied = applyLastShot(prepared);
    const impactColumn = applied.terrain.columns?.get(terrainColumnIndex(8));

    expect(applied.terrain.holes.at(-1)).toEqual({ id: "blast-1", x: 8, y: 0, radius: 1 });
    expect(impactColumn?.some((segment) => segment.destructible)).toBe(false);
    expect(impactColumn?.some((segment) => !segment.destructible)).toBe(true);
  });  it("keeps turn and HP unchanged after invalid input", () => {
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

  it("blocks 1P from aiming the vertex behind the tank", () => {
    const state = createFlatShotState();
    const preview = createPreviewShot(state, { vertexX: -9, vertexY: 6 });
    const prepared = prepareShot(state, { vertexX: -9, vertexY: 6 });
    const submitted = submitShot(state, { vertexX: -9, vertexY: 6 });

    expect(preview.validationErrors[0]).toBe(BACKWARD_AIM_MESSAGE);
    expect(prepared.lastShot?.validationErrors[0]).toBe(BACKWARD_AIM_MESSAGE);
    expect(submitted.shotHistory).toHaveLength(0);
    expect(submitted.activePlayerId).toBe("p1");
  });

  it("blocks 2P from aiming the vertex behind the tank", () => {
    const state = {
      ...createFlatShotState(),
      activePlayerId: "p2" as const,
      players: [
        { ...createFlatShotState().players[0], isActive: false },
        { ...createFlatShotState().players[1], isActive: true },
      ] as ReturnType<typeof createInitialGameState>["players"],
    };
    const next = submitShot(state, { vertexX: 9, vertexY: 6 });

    expect(next.lastShot?.validationErrors[0]).toBe(BACKWARD_AIM_MESSAGE);
    expect(next.shotHistory).toHaveLength(0);
    expect(next.activePlayerId).toBe("p2");
  });

  it("blocks 1P from aiming beyond x=1", () => {
    const state = createFlatShotState();
    const preview = createPreviewShot(state, { vertexX: 2, vertexY: 6 });
    const submitted = submitShot(state, { vertexX: 2, vertexY: 6 });

    expect(preview.validationErrors).toContain(P1_AIM_LIMIT_MESSAGE);
    expect(submitted.lastShot?.validationErrors).toContain(P1_AIM_LIMIT_MESSAGE);
    expect(submitted.shotHistory).toHaveLength(0);
    expect(submitted.activePlayerId).toBe("p1");
  });

  it("blocks 2P from aiming beyond x=-1", () => {
    const state = {
      ...createFlatShotState(),
      activePlayerId: "p2" as const,
      players: [
        { ...createFlatShotState().players[0], isActive: false },
        { ...createFlatShotState().players[1], isActive: true },
      ] as ReturnType<typeof createInitialGameState>["players"],
    };
    const preview = createPreviewShot(state, { vertexX: -2, vertexY: 6 });
    const submitted = submitShot(state, { vertexX: -2, vertexY: 6 });

    expect(preview.validationErrors).toContain(P2_AIM_LIMIT_MESSAGE);
    expect(submitted.lastShot?.validationErrors).toContain(P2_AIM_LIMIT_MESSAGE);
    expect(submitted.shotHistory).toHaveLength(0);
    expect(submitted.activePlayerId).toBe("p2");
  });

  it("keeps forward aiming valid inside the limited vertex range", () => {
    const p1State = createFlatShotState();
    const p2State = {
      ...createFlatShotState(),
      activePlayerId: "p2" as const,
      players: [
        { ...createFlatShotState().players[0], isActive: false },
        { ...createFlatShotState().players[1], isActive: true },
      ] as ReturnType<typeof createInitialGameState>["players"],
    };

    expect(createPreviewShot(p1State, { vertexX: 1, vertexY: 6 }).validationErrors).toHaveLength(0);
    expect(createPreviewShot(p2State, { vertexX: -1, vertexY: 6 }).validationErrors).toHaveLength(0);
  });

  it("uses the same forward-aim rule in practice mode", () => {
    const state = createPracticeGameState(1);
    const next = submitShot(state, { vertexX: -9, vertexY: 6 });

    expect(next.lastShot?.validationErrors[0]).toBe(BACKWARD_AIM_MESSAGE);
    expect(next.shotHistory).toHaveLength(0);
    expect(next.activePlayerId).toBe("p1");
    expect(next.practice).toEqual({ step: 1, isComplete: false, pendingNextStep: null });
  });

  it("keeps practice stage 2 movement available", () => {
    const state = createPracticeGameState(2);
    const moved = moveActivePlayer(state, 1);

    expect(canMoveActivePlayer(state, 1)).toBe(true);
    expect(moved.players[0].tankPosition.x).toBe(-7.9);
    expect(moved.activePlayerId).toBe("p1");
  });

  it("keeps practice mode on 1P turn when the target survives", () => {
    const state = {
      ...createPracticeGameState(3),
      terrain: {
        blocks: [] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [] as ReturnType<typeof createInitialGameState>["terrain"]["segments"],
        holes: [],
      },
    };
    const next = submitShot(state, { vertexX: 0, vertexY: 6, projectileType: "wide" });

    expect(next.mode).toBe("practice");
    expect(next.practice).toEqual({ step: 3, isComplete: false, pendingNextStep: null });
    expect(next.activePlayerId).toBe("p1");
    expect(next.players[1].hp).toBe(23);
  });

  it("waits for confirmation before advancing to the next practice mission", () => {
    const next = submitShot(createPracticeGameState(1), {
      vertexX: 0,
      vertexY: 7,
      projectileType: "normal",
    });

    expect(next.mode).toBe("practice");
    expect(next.practice).toEqual({ step: 1, isComplete: false, pendingNextStep: 2 });
    expect(next.activePlayerId).toBe("p1");
    expect(next.players[0].tankPosition).toEqual({ x: -8, y: 0 });
    expect(next.players[1].tankPosition).toEqual({ x: 8, y: 0 });
    expect(next.players[1].hp).toBe(0);
    expect(next.shotHistory).toHaveLength(1);

    const advanced = continuePracticeAfterSuccess(next);
    expect(advanced.practice).toEqual({ step: 2, isComplete: false, pendingNextStep: null });
    expect(advanced.players[1].tankPosition).toEqual({ x: 6, y: 0 });
    expect(advanced.shotHistory).toHaveLength(1);
  });

  it("completes practice mode after defeating the stage three target", () => {
    const state = {
      ...createPracticeGameState(3),
      terrain: {
        blocks: [] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [] as ReturnType<typeof createInitialGameState>["terrain"]["segments"],
        holes: [],
      },
    };
    const next = submitShot(state, { vertexX: 0, vertexY: 6, projectileType: "power" });

    expect(next.mode).toBe("practice");
    expect(next.practice).toEqual({ step: 3, isComplete: true, pendingNextStep: null });
    expect(next.activePlayerId).toBe("p1");
    expect(next.winnerId).toBeNull();
    expect(next.players[1].hp).toBe(0);
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

  it("blocks 1P from moving past x=-1", () => {
    const state = {
      ...createFlatShotState(),
      players: [
        { ...createFlatShotState().players[0], tankPosition: { x: -1, y: 0 } },
        createFlatShotState().players[1],
      ] as ReturnType<typeof createInitialGameState>["players"],
    };

    expect(canMoveActivePlayer(state, 1)).toBe(false);
    expect(moveActivePlayer(state, 1)).toBe(state);
  });

  it("blocks 2P from moving past x=1", () => {
    const state = {
      ...createFlatShotState(),
      activePlayerId: "p2" as const,
      players: [
        { ...createFlatShotState().players[0], isActive: false },
        {
          ...createFlatShotState().players[1],
          tankPosition: { x: 1, y: 0 },
          isActive: true,
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
    };

    expect(canMoveActivePlayer(state, -1)).toBe(false);
    expect(moveActivePlayer(state, -1)).toBe(state);
  });

  it("does not move outside the board", () => {
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
        segments: [],
        holes: [],
      },
    };

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

  it("blocks uphill movement on terrain steeper than slope 1", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -2, y: 0 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [{ id: "steep", x1: -2, y1: 0, x2: -1, y2: 1.5 }],
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
          tankPosition: { x: -2, y: 0 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [{ id: "gentle", x1: -2, y1: 0, x2: -1, y2: 1 }],
        holes: [],
      },
    };

    const moved = moveActivePlayer(state, 1);

    expect(moved.players[0].tankPosition.x).toBe(-1.9);
    expect(moved.players[0].tankPosition.y).toBeCloseTo(0.1);
  });

  it("allows moving off a cliff and landing on lower terrain", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -2.1, y: 4 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [
          { id: "ledge", x: -3, y: 3.5, width: 0.9, height: 0.5 },
          { id: "floor", x: -2, y: 0, width: 1, height: 0.5 },
        ] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [],
        holes: [],
      },
    };

    const moved = moveActivePlayer(state, 1);

    expect(canMoveActivePlayer(state, 1)).toBe(true);
    expect(moved.players[0].tankPosition).toEqual({ x: -2, y: 0.5 });
    expect(moved.movementUsed).toBe(0.1);
  });

  it("allows dropping onto a lower check tile beyond a ledge", () => {
    const state = {
      ...createInitialGameState("ocean", "map4"),
      players: [
        {
          ...createInitialGameState("ocean", "map4").players[0],
          tankPosition: { x: -7.05, y: 9 },
        },
        createInitialGameState("ocean", "map4").players[1],
      ] as ReturnType<typeof createInitialGameState>["players"],
    };

    const moved = moveActivePlayer(state, 1);

    expect(canMoveActivePlayer(state, 1)).toBe(true);
    expect(moved.players[0].tankPosition).toEqual({ x: -6.9, y: 8 });
  });

  it("allows moving off a cliff when there is no side wall in the move path", () => {
    const state = {
      ...createInitialGameState("normal"),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -2.1, y: 4 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [
          { id: "ledge", x: -3, y: 3.5, width: 0.9, height: 0.5 },
          { id: "floor", x: -1, y: 0, width: 1, height: 0.5 },
        ] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [],
        holes: [],
      },
    };

    const moved = moveActivePlayer(state, 1);

    expect(canMoveActivePlayer(state, 1)).toBe(true);
    expect(moved.players[0].tankPosition).toEqual({ x: -2, y: 0 });
  });

  it("blocks stepping up more than the maximum tank climb height", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -0.05, y: 1 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [
          { id: "low", x: -1, y: 0, width: 1, height: 1 },
          { id: "too-high", x: 0, y: MAX_TANK_STEP_UP_HEIGHT + 0.1, width: 1, height: 1 },
        ] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [],
        holes: [],
      },
    };

    expect(canMoveActivePlayer(state, 1)).toBe(false);
    expect(moveActivePlayer(state, 1)).toBe(state);
  });

  it("blocks side walls that overlap the tank body at the current height", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -0.05, y: 8 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [
          { id: "ledge", x: -1, y: 7, width: 1, height: 1 },
          { id: "body-wall", x: 0, y: 8.2, width: 1, height: 1 },
        ] as ReturnType<typeof createInitialGameState>["terrain"]["blocks"],
        segments: [],
        holes: [],
      },
    };

    expect(canMoveActivePlayer(state, 1)).toBe(false);
    expect(moveActivePlayer(state, 1)).toBe(state);
  });

  it("blocks moving through the exposed side wall of a sloped terrain segment", () => {
    const state = {
      ...createInitialGameState(),
      activePlayerId: "p2" as const,
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -8, y: 2 },
          isActive: false,
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 6.9, y: 2 },
          isActive: true,
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [{ id: "base", x: -10, y: 0, width: 20, height: 2 }],
        segments: [{ id: "right-slope", x1: 1.5, y1: 4.5, x2: 6.8, y2: 2.5 }],
        holes: [],
      },
    };

    expect(canMoveActivePlayer(state, -1)).toBe(false);
    expect(moveActivePlayer(state, -1)).toBe(state);
  });

  it("declares a winner when moving off a cliff into the sea", () => {
    const state = {
      ...createInitialGameState("ocean"),
      players: [
        {
          ...createInitialGameState("ocean").players[0],
          tankPosition: { x: -2.1, y: 4 },
        },
        {
          ...createInitialGameState("ocean").players[1],
          tankPosition: { x: 8, y: 0 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [{ id: "ledge", x: -3, y: 3.5, width: 0.9, height: 0.5 }] as ReturnType<
          typeof createInitialGameState
        >["terrain"]["blocks"],
        segments: [],
        holes: [],
      },
    };

    const moved = moveActivePlayer(state, 1);

    expect(canMoveActivePlayer(state, 1)).toBe(true);
    expect(moved.players[0].tankPosition).toEqual({ x: -2, y: -1 });
    expect(moved.winnerId).toBe("p2");
  });

  it("allows dropping into a circular blast hole when moving downhill", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -7.4, y: 1.2 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 2 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [{ id: "base", x: -10, y: 0, width: 20, height: 2 }],
        segments: [],
        holes: [{ id: "blast", x: -8, y: 2, radius: 1 }],
      },
    };

    const moved = moveActivePlayer(state, -1);

    expect(canMoveActivePlayer(state, -1)).toBe(true);
    expect(moved.players[0].tankPosition.x).toBe(-7.5);
    expect(moved.players[0].tankPosition.y).toBeCloseTo(1.13);
  });

  it("allows movement down a steep circular hole boundary", () => {
    const state = {
      ...createInitialGameState(),
      activePlayerId: "p2" as const,
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -8, y: 2 },
          isActive: false,
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 7.1, y: 1.56 },
          isActive: true,
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [{ id: "base", x: -10, y: 0, width: 20, height: 2 }],
        segments: [],
        holes: [{ id: "blast", x: 8, y: 2, radius: 1 }],
      },
    };

    const moved = moveActivePlayer(state, 1);

    expect(canMoveActivePlayer(state, 1)).toBe(true);
    expect(moved.players[1].tankPosition.x).toBe(7.2);
    expect(moved.players[1].tankPosition.y).toBeCloseTo(1.4);
  });

  it("allows entering a circular blast hole side when it is a downhill move", () => {
    const state = {
      ...createInitialGameState(),
      activePlayerId: "p2" as const,
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -8, y: 2 },
          isActive: false,
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 7, y: 2 },
          isActive: true,
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [{ id: "base", x: -10, y: 0, width: 20, height: 2 }],
        segments: [],
        holes: [{ id: "blast", x: 8, y: 2, radius: 1 }],
      },
    };

    const moved = moveActivePlayer(state, 1);

    expect(canMoveActivePlayer(state, 1)).toBe(true);
    expect(moved.players[1].tankPosition.x).toBe(7.1);
    expect(moved.players[1].tankPosition.y).toBeCloseTo(1.56);
  });

  it("allows dropping along a circular blast hole boundary when the slope is gentle", () => {
    const state = {
      ...createInitialGameState(),
      activePlayerId: "p2" as const,
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -8, y: 2 },
          isActive: false,
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 7.4, y: 1.2 },
          isActive: true,
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [{ id: "base", x: -10, y: 0, width: 20, height: 2 }],
        segments: [],
        holes: [{ id: "blast", x: 8, y: 2, radius: 1 }],
      },
    };

    const moved = moveActivePlayer(state, 1);

    expect(canMoveActivePlayer(state, 1)).toBe(true);
    expect(moved.players[1].tankPosition.x).toBe(7.5);
    expect(moved.players[1].tankPosition.y).toBeCloseTo(1.13);
  });

  it("uses the nearby flat support when a crater boundary overlaps the tank position", () => {
    const state = {
      ...createInitialGameState(),
      players: [
        {
          ...createInitialGameState().players[0],
          tankPosition: { x: -2, y: 4.4 },
        },
        {
          ...createInitialGameState().players[1],
          tankPosition: { x: 8, y: 2 },
        },
      ] as ReturnType<typeof createInitialGameState>["players"],
      terrain: {
        blocks: [{ id: "platform", x: -2.2, y: 4, width: 1.2, height: 0.4 }],
        segments: [],
        holes: [{ id: "blast", x: -2.6, y: 4.2, radius: 0.9 }],
      },
    };

    expect(canMoveActivePlayer(state, 1)).toBe(true);
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
        distanceToShooter: 16,
        damage: 0,
        shooterDamage: 0,
        isValidImpact: true,
        validationErrors: [],
        explanation: [],
        isApplied: false,
        terrainImpactBlockId: "left",
        collisionType: "terrain" as const,
      },
    };

    const applied = applyLastShot(state);

    expect(applied.winnerId).toBe("p2");
    expect(applied.players[0].hp).toBe(0);
    expect(applied.players[0].tankPosition.y).toBe(-1);
  });
});
