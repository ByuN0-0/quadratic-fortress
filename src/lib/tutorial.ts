export type TutorialState = {
  isOpen: boolean;
  currentStep: number;
  hasCompleted: boolean;
};

export const TUTORIAL_STEPS = [
  {
    title: "꼭짓점이 최고점입니다",
    body: "입력한 (h, k)는 포탄이 가장 높이 올라가는 점입니다. 예를 들어 (0, 6)을 입력하면 포물선의 꼭대기가 y=6에 놓입니다.",
  },
  {
    title: "탱크를 지나는 포물선을 만듭니다",
    body: "앱은 탱크 좌표를 y=a(x-h)^2+k에 대입해서 a값을 계산합니다. 그래서 포탄은 항상 현재 탱크에서 출발합니다.",
  },
  {
    title: "착탄점은 지형 또는 대상과 다시 만나는 곳입니다",
    body: "착탄점이 상대 탱크에 가까울수록 피해가 커집니다.",
  },
  {
    title: "원의 방정식으로 피해를 계산합니다",
    body: "폭발 중심에서 반지름 2 안에 상대 탱크 중심이 들어오면 피해가 들어갑니다. 거리가 0이면 20, 반지름 끝이면 0에 가깝습니다.",
  },
] as const;

export function createInitialTutorialState(hasCompleted = false): TutorialState {
  return {
    isOpen: !hasCompleted,
    currentStep: 0,
    hasCompleted,
  };
}

export function nextTutorialStep(state: TutorialState): TutorialState {
  if (state.currentStep >= TUTORIAL_STEPS.length - 1) {
    return closeTutorial(state);
  }

  return {
    ...state,
    currentStep: state.currentStep + 1,
  };
}

export function previousTutorialStep(state: TutorialState): TutorialState {
  return {
    ...state,
    currentStep: Math.max(0, state.currentStep - 1),
  };
}

export function openTutorial(state: TutorialState): TutorialState {
  return {
    ...state,
    isOpen: true,
    currentStep: 0,
  };
}

export function closeTutorial(state: TutorialState): TutorialState {
  return {
    ...state,
    isOpen: false,
    hasCompleted: true,
  };
}
