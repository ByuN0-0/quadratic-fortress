import { describe, expect, it } from "vitest";
import {
  MAX_TURN_MOVE,
  MOVE_STEP,
  canMoveActivePlayer,
  createInitialGameState,
  getRemainingMove,
  moveActivePlayer,
  submitShot,
} from "./game";

describe("game reducer", () => {
  it("switches turn and applies damage after a valid shot", () => {
    const next = submitShot(createInitialGameState(), { vertexX: 0, vertexY: 6 });

    expect(next.activePlayerId).toBe("p2");
    expect(next.players[1].hp).toBe(80);
    expect(next.shotHistory).toHaveLength(1);
  });

  it("keeps turn and HP unchanged after invalid input", () => {
    const next = submitShot(createInitialGameState(), { vertexX: -8, vertexY: 6 });

    expect(next.activePlayerId).toBe("p1");
    expect(next.players[1].hp).toBe(100);
    expect(next.shotHistory).toHaveLength(0);
    expect(next.lastShot?.validationErrors.length).toBeGreaterThan(0);
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
    state = submitShot(state, { vertexX: 0, vertexY: 6 });

    expect(state.activePlayerId).toBe("p2");
    expect(state.movementUsed).toBe(0);

    state = moveActivePlayer(state, -1);
    state = submitShot(state, { vertexX: 7.9, vertexY: 6 });

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
