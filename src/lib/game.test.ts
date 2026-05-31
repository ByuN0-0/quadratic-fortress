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

describe("game reducer", () => {
  it("switches turn and applies damage after a valid shot", () => {
    const next = submitShot(createInitialGameState(), { vertexX: 0, vertexY: 6 });

    expect(next.activePlayerId).toBe("p2");
    expect(next.players[1].hp).toBe(80);
    expect(next.shotHistory).toHaveLength(1);
    expect(next.shotHistory[0].projectile.id).toBe("normal");
  });

  it("stores the selected projectile and applies its damage", () => {
    const next = submitShot(createInitialGameState(), {
      vertexX: 0,
      vertexY: 6,
      projectileType: "power",
    });

    expect(next.players[1].hp).toBe(65);
    expect(next.shotHistory[0].projectile.id).toBe("power");
    expect(next.shotHistory[0].damage).toBe(35);
  });

  it("keeps turn and HP unchanged after invalid input", () => {
    const next = submitShot(createInitialGameState(), { vertexX: -8, vertexY: 6 });

    expect(next.activePlayerId).toBe("p1");
    expect(next.players[1].hp).toBe(100);
    expect(next.shotHistory).toHaveLength(0);
    expect(next.lastShot?.validationErrors.length).toBeGreaterThan(0);
  });

  it("prepares a valid shot without immediately applying damage or switching turn", () => {
    const state = moveActivePlayer(createInitialGameState(), 1);
    const next = prepareShot(state, { vertexX: 0, vertexY: 6 });

    expect(next.activePlayerId).toBe("p1");
    expect(next.players[1].hp).toBe(100);
    expect(next.movementUsed).toBe(0.1);
    expect(next.shotHistory).toHaveLength(0);
    expect(next.lastShot?.isApplied).toBe(false);
    expect(next.lastShot?.damage).toBeGreaterThan(0);
  });

  it("applies the prepared valid shot and switches turn", () => {
    const prepared = prepareShot(createInitialGameState(), { vertexX: 0, vertexY: 6 });
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
    const prepared = prepareShot(createInitialGameState(), { vertexX: 0, vertexY: 6 });
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
    let state = createInitialGameState();

    for (let turn = 0; turn < 8; turn += 1) {
      state = submitShot(state, { vertexX: 0, vertexY: 6 });
    }

    expect(state.winnerId).toBeNull();

    state = submitShot(state, { vertexX: 0, vertexY: 6 });

    expect(state.winnerId).toBe("p1");
    expect(state.players[1].hp).toBe(0);
  });
});
