import { describe, expect, it } from "vitest";
import {
  TUTORIAL_STEPS,
  closeTutorial,
  createInitialTutorialState,
  nextTutorialStep,
  openTutorial,
  previousTutorialStep,
} from "./tutorial";

describe("tutorial flow", () => {
  it("opens for first-time users", () => {
    expect(createInitialTutorialState(false).isOpen).toBe(true);
    expect(createInitialTutorialState(true).isOpen).toBe(false);
  });

  it("moves next and previous through tutorial steps", () => {
    let state = createInitialTutorialState(false);
    state = nextTutorialStep(state);
    expect(state.currentStep).toBe(1);

    state = previousTutorialStep(state);
    expect(state.currentStep).toBe(0);
  });

  it("closes and can be reopened", () => {
    let state = createInitialTutorialState(false);

    for (let index = 0; index < TUTORIAL_STEPS.length; index += 1) {
      state = nextTutorialStep(state);
    }

    expect(state.isOpen).toBe(false);
    expect(state.hasCompleted).toBe(true);

    state = openTutorial(closeTutorial(state));
    expect(state.isOpen).toBe(true);
    expect(state.currentStep).toBe(0);
  });
});
