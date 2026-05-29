import { describe, expect, it } from "vitest";
import { createInitialGameState, submitShot } from "./game";

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
