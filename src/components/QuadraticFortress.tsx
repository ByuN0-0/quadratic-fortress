import { useEffect, useMemo, useRef, useState } from "react";
import { Component } from "react";
import type { ReactNode } from "react";
import rough from "roughjs";
import {
  Calculator,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  History,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Target,
  X,
} from "lucide-react";
import {
  applyLastShot,
  continuePracticeAfterSuccess,
  createInitialGameState,
  createPracticeGameState,
  createPreviewShot,
  canMoveActivePlayer,
  getAimXRange,
  getActivePlayer,
  getPracticeStage,
  getRemainingMove,
  isMoveBlockedByTerritory,
  getShotProjectile,
  moveActivePlayer,
  MOVE_TERRITORY_LIMIT_MESSAGE,
  PRACTICE_STAGES,
  prepareShot,
  type MoveDirection,
  type GameState,
  type GameMode,
  type PlayerId,
  type PracticeStageConfig,
  type ShotInput,
  type ShotResult,
} from "../lib/game";
import {
  TERRAIN_COLUMN_STEP,
  getTerrainMapCategoryDescription,
  getTerrainMapCategoryLabel,
  getTerrainMapDescription,
  getTerrainMapIdsByCategory,
  getTerrainMapLabel,
  type TerrainColumnSegment,
  type TerrainMapCategory,
  type TerrainMapId,
} from "../lib/terrain";
import { buildColumnRenderShapes, type ColumnRenderShape } from "../lib/terrainRender";
import {
  BLAST_RADIUS,
  BOARD,
  COORDINATE_STEP,
  PROJECTILE_TYPES,
  STARTING_HP,
  formatCoordinate,
  formatEquation,
  getYAtX,
  round,
  roundToStep,
  type Point,
} from "../lib/math";
import {
  TUTORIAL_STEPS,
  closeTutorial,
  createInitialTutorialState,
  nextTutorialStep,
  openTutorial,
  previousTutorialStep,
  type TutorialState,
} from "../lib/tutorial";
import "../styles/game.css";

const STORAGE_KEY = "quadratic-fortress-tutorial-complete";
const DEFAULT_INPUT: ShotInput = { vertexX: 0, vertexY: 6, projectileType: "normal" };
const HP_ANIMATION_DURATION = 600;
const SHOT_DURATION_PER_UNIT = 70;
const MIN_SHOT_ANIMATION_DURATION = 320;
const MAX_SHOT_ANIMATION_DURATION = 1100;
const FALL_DURATION_PER_UNIT = 240;
const MIN_FALL_DURATION = 450;
const MAX_FALL_DURATION = 1100;
const MOVE_ANIMATION_DURATION = 180;

type ScreenPoint = {
  x: number;
  y: number;
};

type CoordinateDisplayMode = "teacher" | "student";
type ScreenMode = "menu" | "category" | "map" | "game";
type PracticeDialogMode = "intro" | "success" | "complete" | null;
type DisplayHpByPlayer = Record<PlayerId, number>;
type AimInputByPlayer = Record<PlayerId, ShotInput>;
type Players = GameState["players"];
type ErrorBoundaryState = {
  errorMessage: string | null;
};

function getPlayerLabel(playerId: PlayerId): string {
  return playerId === "p1" ? "1P" : "2P";
}

function readTutorialCompleted(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberTutorialCompleted() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // The game should keep running even if browser storage is blocked.
  }
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { errorMessage: getErrorMessage(error) };
  }

  override render() {
    if (this.state.errorMessage) {
      return <AppErrorFallback message={this.state.errorMessage} />;
    }

    return this.props.children;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function AppErrorFallback({ message }: { message: string }) {
  return (
    <main className="game-shell mode-menu-screen">
      <section className="app-error-panel" role="alert">
        <p className="eyebrow">App Error</p>
        <h1>화면을 불러오지 못했습니다</h1>
        <p>{message}</p>
        <button className="primary-button" type="button" onClick={() => window.location.reload()}>
          새로고침
        </button>
      </section>
    </main>
  );
}

export default function QuadraticFortress() {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setRuntimeError(getErrorMessage(event.error ?? event.message));
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      setRuntimeError(getErrorMessage(event.reason));
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  if (runtimeError) {
    return <AppErrorFallback message={runtimeError} />;
  }

  return (
    <AppErrorBoundary>
      <QuadraticFortressApp />
    </AppErrorBoundary>
  );
}

function QuadraticFortressApp() {
  const [game, setGame] = useState<GameState>(() => createInitialGameState());
  const [aimInputByPlayer, setAimInputByPlayer] = useState<AimInputByPlayer>(() =>
    createInitialAimInputByPlayer(game.players),
  );
  const [tutorial, setTutorial] = useState<TutorialState>(() => createInitialTutorialState(true));
  const [screenMode, setScreenMode] = useState<ScreenMode>("menu");
  const [selectedMode, setSelectedMode] = useState<GameMode>("normal");
  const [selectedMapCategory, setSelectedMapCategory] = useState<TerrainMapCategory>("jangwi");
  const [animationProgress, setAnimationProgress] = useState(1);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTrajectoryPreviewOn, setIsTrajectoryPreviewOn] = useState(false);
  const [isShotAnimating, setIsShotAnimating] = useState(false);
  const [isFalling, setIsFalling] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [visualPlayers, setVisualPlayers] = useState<Players | null>(null);
  const [practiceDialog, setPracticeDialog] = useState<PracticeDialogMode>(null);
  const [coordinateDisplayMode, setCoordinateDisplayMode] =
    useState<CoordinateDisplayMode>("teacher");
  const [displayHpByPlayer, setDisplayHpByPlayer] = useState<DisplayHpByPlayer>(() =>
    createDisplayHpByPlayer(createInitialGameState().players),
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const fallFrameRef = useRef<number | null>(null);
  const moveFrameRef = useRef<number | null>(null);
  const hpFrameRef = useRef<number | null>(null);
  const gameRef = useRef<GameState>(game);
  const displayHpRef = useRef<DisplayHpByPlayer>(displayHpByPlayer);
  const practiceDialogKeyRef = useRef<string>("none");

  const renderGame = useMemo(
    () => (visualPlayers ? { ...game, players: visualPlayers } : game),
    [game, visualPlayers],
  );
  const activeInput = aimInputByPlayer[game.activePlayerId];
  const previewShot = useMemo(() => createPreviewShot(game, activeInput), [game, activeInput]);
  const visibleShot = game.lastShot ?? previewShot;
  const isInteractionLocked = isShotAnimating || isFalling || isMoving || Boolean(practiceDialog);
  const practiceStage = game.practice ? getPracticeStage(game.practice.step) : null;

  const chooseMode = (mode: GameMode) => {
    if (mode === "practice") {
      startPracticeMode();
      return;
    }

    setSelectedMode(mode);
    setScreenMode("category");
  };

  const chooseMapCategory = (category: TerrainMapCategory) => {
    setSelectedMapCategory(category);
    setScreenMode("map");
  };

  const startPracticeMode = () => {
    cancelAllAnimations();
    const nextGame = createPracticeGameState(1);
    setGame(nextGame);
    setAimInputByPlayer(createPracticeAimInputByPlayer(nextGame));
    setAnimationProgress(1);
    setIsResultOpen(false);
    setIsHistoryOpen(false);
    setIsTrajectoryPreviewOn(false);
    setIsShotAnimating(false);
    setIsFalling(false);
    setIsMoving(false);
    setVisualPlayers(null);
    displayHpRef.current = createDisplayHpByPlayer(nextGame.players);
    setDisplayHpByPlayer(createDisplayHpByPlayer(nextGame.players));
    practiceDialogKeyRef.current = "none";
    setPracticeDialog("intro");
    setScreenMode("game");
  };

  const startGame = (mode: GameMode, mapId: TerrainMapId) => {
    cancelAllAnimations();

    const nextGame = createInitialGameState(mode, mapId);
    setGame(nextGame);
    setAimInputByPlayer(createInitialAimInputByPlayer(nextGame.players));
    setAnimationProgress(1);
    setIsResultOpen(false);
    setIsHistoryOpen(false);
    setIsTrajectoryPreviewOn(false);
    setIsShotAnimating(false);
    setIsFalling(false);
    setIsMoving(false);
    setVisualPlayers(null);
    setPracticeDialog(null);
    displayHpRef.current = createDisplayHpByPlayer(nextGame.players);
    setDisplayHpByPlayer(createDisplayHpByPlayer(nextGame.players));
    setScreenMode("game");
  };

  const cancelAllAnimations = () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }
    if (fallFrameRef.current) {
      cancelAnimationFrame(fallFrameRef.current);
    }
    if (moveFrameRef.current) {
      cancelAnimationFrame(moveFrameRef.current);
    }
    if (hpFrameRef.current) {
      cancelAnimationFrame(hpFrameRef.current);
    }
  };

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (game.mode !== "practice" || !game.practice) {
      practiceDialogKeyRef.current = "none";
      setPracticeDialog(null);
      return;
    }

    const dialogMode = game.practice.isComplete
      ? "complete"
      : game.practice.pendingNextStep
        ? "success"
        : "intro";
    const key = `${game.practice.step}-${dialogMode}-${game.practice.pendingNextStep ?? "none"}`;

    if (practiceDialogKeyRef.current === key) {
      return;
    }

    practiceDialogKeyRef.current = key;
    setPracticeDialog(dialogMode);

    if (dialogMode === "intro") {
      setAimInputByPlayer(createPracticeAimInputByPlayer(game));
    }
  }, [game.mode, game.practice?.step, game.practice?.isComplete, game.practice?.pendingNextStep]);

  useEffect(() => {
    const completed = readTutorialCompleted();
    setTutorial((current) => ({
      ...current,
      hasCompleted: completed,
      isOpen: false,
    }));
  }, []);

  useEffect(() => {
    if (!game.lastShot || game.lastShot.validationErrors.length > 0 || game.lastShot.isApplied) {
      setAnimationProgress(1);
      setIsShotAnimating(false);
      return;
    }

    const shooterPosition =
      game.players.find((player) => player.id === game.lastShot?.shooterId)?.tankPosition ??
      getActivePlayer(game).tankPosition;
    const startedAt = performance.now();
    const duration = getShotAnimationDuration(game.lastShot, shooterPosition);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setAnimationProgress(progress);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      const current = gameRef.current;
      const applied = applyLastShot(current);
      const fallingPlayers = getFallingPlayers(current.players, applied.players);

      if (fallingPlayers.length === 0) {
        setIsShotAnimating(false);
        setGame(applied);
        return;
      }

      animateFallingPlayers(current, applied, fallingPlayers);
    };

    setAnimationProgress(0);
    setIsShotAnimating(true);
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [game.lastShot]);

  useEffect(() => {
    displayHpRef.current = displayHpByPlayer;
  }, [displayHpByPlayer]);

  useEffect(() => {
    const targetHp = createDisplayHpByPlayer(game.players);
    const startHp = displayHpRef.current;
    const playerIds: PlayerId[] = ["p1", "p2"];
    const hasChanged = playerIds.some((id) => startHp[id] !== targetHp[id]);

    if (!hasChanged) {
      return;
    }

    if (hpFrameRef.current) {
      cancelAnimationFrame(hpFrameRef.current);
    }

    const hasHpIncrease = playerIds.some((id) => targetHp[id] > startHp[id]);
    if (hasHpIncrease) {
      displayHpRef.current = targetHp;
      setDisplayHpByPlayer(targetHp);
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / HP_ANIMATION_DURATION);
      const nextHp = playerIds.reduce((next, id) => {
        next[id] = startHp[id] + (targetHp[id] - startHp[id]) * progress;
        return next;
      }, {} as DisplayHpByPlayer);

      displayHpRef.current = nextHp;
      setDisplayHpByPlayer(nextHp);

      if (progress < 1) {
        hpFrameRef.current = requestAnimationFrame(tick);
      } else {
        displayHpRef.current = targetHp;
        setDisplayHpByPlayer(targetHp);
      }
    };

    hpFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (hpFrameRef.current) {
        cancelAnimationFrame(hpFrameRef.current);
      }
    };
  }, [game.players]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const draw = () => {
      const container = canvas.parentElement;
      if (!container) {
        return;
      }

      const width = container.clientWidth;
      const reservedUiHeight = window.innerWidth <= 1120 ? 350 : 250;
      const availableBoardHeight = window.innerHeight - reservedUiHeight;
      const height = Math.max(330, Math.min(620, width * 0.58, availableBoardHeight));
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawBoard(
        ctx,
        width,
        height,
        renderGame,
        previewShot,
        visibleShot,
        displayHpByPlayer,
        animationProgress,
        Boolean(game.lastShot),
        isTrajectoryPreviewOn,
        coordinateDisplayMode,
      );
    };

    draw();

    const observer = new ResizeObserver(draw);
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }

    return () => observer.disconnect();
  }, [
    renderGame,
    previewShot,
    visibleShot,
    displayHpByPlayer,
    animationProgress,
    isTrajectoryPreviewOn,
    coordinateDisplayMode,
  ]);

  const animateFallingPlayers = (
    startGame: GameState,
    endGame: GameState,
    fallingPlayerIds: PlayerId[],
  ) => {
    if (fallFrameRef.current) {
      cancelAnimationFrame(fallFrameRef.current);
    }

    const startPlayers = startGame.players;
    const endPlayers = endGame.players;
    const maxDropDistance = fallingPlayerIds.reduce((maxDistance, id) => {
      const startPlayer = startPlayers.find((player) => player.id === id);
      const endPlayer = endPlayers.find((player) => player.id === id);
      if (!startPlayer || !endPlayer) {
        return maxDistance;
      }

      return Math.max(maxDistance, startPlayer.tankPosition.y - endPlayer.tankPosition.y);
    }, 0);
    const duration = Math.max(
      MIN_FALL_DURATION,
      Math.min(MAX_FALL_DURATION, maxDropDistance * FALL_DURATION_PER_UNIT),
    );
    const interimGame = {
      ...endGame,
      activePlayerId: startGame.activePlayerId,
      players: endPlayers.map((player) => ({
        ...player,
        isActive: player.id === startGame.activePlayerId,
      })) as Players,
    };

    setIsFalling(true);
    setVisualPlayers(startPlayers);
    setGame(interimGame);

    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const easedProgress = 1 - (1 - progress) ** 2;
      const nextPlayers = endPlayers.map((endPlayer) => {
        const startPlayer = startPlayers.find((player) => player.id === endPlayer.id) ?? endPlayer;

        if (!fallingPlayerIds.includes(endPlayer.id)) {
          return endPlayer;
        }

        return {
          ...endPlayer,
          isActive: endPlayer.id === startGame.activePlayerId,
          tankPosition: {
            x: endPlayer.tankPosition.x,
            y:
              startPlayer.tankPosition.y +
              (endPlayer.tankPosition.y - startPlayer.tankPosition.y) * easedProgress,
          },
        };
      }) as Players;

      setVisualPlayers(nextPlayers);

      if (progress < 1) {
        fallFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      setVisualPlayers(null);
      setIsFalling(false);
      setIsShotAnimating(false);
      setGame(endGame);
    };

    fallFrameRef.current = requestAnimationFrame(tick);
  };

  const animateMovingPlayer = (startGame: GameState, endGame: GameState, playerId: PlayerId) => {
    if (moveFrameRef.current) {
      cancelAnimationFrame(moveFrameRef.current);
    }

    const startPlayer = startGame.players.find((player) => player.id === playerId);
    const endPlayer = endGame.players.find((player) => player.id === playerId);

    if (!startPlayer || !endPlayer) {
      setGame(endGame);
      return;
    }

    setIsMoving(true);
    setVisualPlayers(startGame.players);

    const startedAt = performance.now();
    const isFallingMove = endPlayer.tankPosition.y < startPlayer.tankPosition.y;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / MOVE_ANIMATION_DURATION);
      const easedProgress = 1 - (1 - progress) ** 2;
      const horizontalProgress = isFallingMove ? Math.min(1, easedProgress * 2) : easedProgress;
      const fallProgress = isFallingMove ? Math.max(0, easedProgress * 2 - 1) : easedProgress;
      const nextPlayers = endGame.players.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        return {
          ...player,
          tankPosition: {
            x:
              startPlayer.tankPosition.x +
              (endPlayer.tankPosition.x - startPlayer.tankPosition.x) * horizontalProgress,
            y:
              startPlayer.tankPosition.y +
              (endPlayer.tankPosition.y - startPlayer.tankPosition.y) * fallProgress,
          },
        };
      }) as Players;

      setVisualPlayers(nextPlayers);

      if (progress < 1) {
        moveFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      setVisualPlayers(null);
      setIsMoving(false);
      setGame(endGame);
    };

    moveFrameRef.current = requestAnimationFrame(tick);
  };

  const fire = () => {
    if (isInteractionLocked) {
      return;
    }

    setGame((current) => prepareShot(current, aimInputByPlayer[current.activePlayerId]));
    setIsResultOpen(false);
  };

  const updateActiveInput = (nextInput: ShotInput | ((current: ShotInput) => ShotInput)) => {
    setAimInputByPlayer((current) => {
      const playerInput = current[game.activePlayerId];
      const resolvedInput = typeof nextInput === "function" ? nextInput(playerInput) : nextInput;

      return {
        ...current,
        [game.activePlayerId]: resolvedInput,
      };
    });
  };

  const moveTank = (direction: MoveDirection) => {
    if (isInteractionLocked) {
      return;
    }

    const current = gameRef.current;
    const next = moveActivePlayer(current, direction);
    if (next === current) {
      return;
    }

    animateMovingPlayer(current, next, current.activePlayerId);
    setIsResultOpen(false);
  };

  const reset = () => {
    cancelAllAnimations();

    const nextGame = createInitialGameState(game.mode, game.mapId);
    setGame(nextGame);
    setAimInputByPlayer(createInitialAimInputByPlayer(nextGame.players));
    setAnimationProgress(1);
    setIsResultOpen(false);
    setIsHistoryOpen(false);
    setIsTrajectoryPreviewOn(false);
    setIsShotAnimating(false);
    setIsFalling(false);
    setIsMoving(false);
    setVisualPlayers(null);
    setPracticeDialog(null);
    practiceDialogKeyRef.current = "none";
    displayHpRef.current = createDisplayHpByPlayer(nextGame.players);
    setDisplayHpByPlayer(createDisplayHpByPlayer(nextGame.players));
    setScreenMode("menu");
  };

  useEffect(() => {
    if (!isResultOpen && !isHistoryOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsResultOpen(false);
        setIsHistoryOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isResultOpen, isHistoryOpen]);

  const closeTutorialAndRemember = () => {
    setTutorial((current) => {
      const next = closeTutorial(current);
      rememberTutorialCompleted();
      return next;
    });
  };

  const goNextTutorial = () => {
    setTutorial((current) => {
      const next = nextTutorialStep(current);
      if (!next.isOpen) {
        rememberTutorialCompleted();
      }
      return next;
    });
  };

  if (tutorial.isOpen) {
    return (
      <main className="game-shell tutorial-screen">
        <section className="game-topbar" aria-label="튜토리얼 헤더">
          <div>
            <p className="eyebrow">Quadratic Fortress</p>
            <h1>튜토리얼</h1>
          </div>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={closeTutorialAndRemember}
          >
            게임으로
          </button>
        </section>
        <TutorialScreen
          state={tutorial}
          onClose={closeTutorialAndRemember}
          onNext={goNextTutorial}
          onPrevious={() => setTutorial((current) => previousTutorialStep(current))}
        />
      </main>
    );
  }

  if (screenMode === "menu") {
    return (
      <main className="game-shell mode-menu-screen">
        <section className="game-topbar" aria-label="메인 화면">
          <div>
            <p className="eyebrow">Quadratic Fortress</p>
            <h1>2차함수 포트리스</h1>
          </div>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setTutorial((current) => openTutorial(current))}
          >
            튜토리얼
          </button>
        </section>

        <section className="mode-menu-panel" aria-label="게임 모드 선택">
          <div>
            <p className="eyebrow">Game Mode</p>
            <h2>수업 방식에 맞는 모드를 선택하세요</h2>
          </div>
          <div className="mode-choice-grid">
            <button className="mode-choice-button" type="button" onClick={() => chooseMode("normal")}>
              <strong>일반 모드 시작</strong>
              <span>바닥은 안전하고 공중 지형만 파괴됩니다.</span>
            </button>
            <button className="mode-choice-button is-practice" type="button" onClick={() => chooseMode("practice")}>
              <strong>연습 모드 시작</strong>
              <span>1P만 조작하며 3단계 미션을 차례로 해결합니다.</span>
            </button>
            <button
              className="mode-choice-button is-danger"
              type="button"
              onClick={() => chooseMode("ocean")}
            >
              <strong>바다 모드 시작</strong>
              <span>아래에 지형이 없으면 낙하 후 패배합니다.</span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (screenMode === "category") {
    return (
      <main className="game-shell mode-menu-screen">
        <section className="game-topbar" aria-label="맵 범주 선택 화면">
          <div>
            <p className="eyebrow">{getGameModeLabel(selectedMode)}</p>
            <h1>맵 범주 선택</h1>
          </div>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setScreenMode("menu")}
          >
            뒤로
          </button>
        </section>

        <section className="mode-menu-panel" aria-label="맵 범주 선택">
          <div>
            <p className="eyebrow">Map Category</p>
            <h2>맵의 범주를 선택하세요</h2>
          </div>
          <div className="mode-choice-grid">
            {(["jangwi", "etc"] as TerrainMapCategory[]).map((category) => (
              <button
                className={category === "jangwi" ? "mode-choice-button" : "mode-choice-button is-danger"}
                key={category}
                type="button"
                onClick={() => chooseMapCategory(category)}
              >
                <strong>{getTerrainMapCategoryLabel(category)}</strong>
                <span>{getTerrainMapCategoryDescription(category)}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (screenMode === "map") {
    const selectableMapIds = getTerrainMapIdsByCategory(selectedMapCategory);
    const mapSelectionTitle =
      selectedMapCategory === "jangwi" ? "장위중학교 맵을 선택하세요" : "기타맵을 선택하세요";

    return (
      <main className="game-shell mode-menu-screen">
        <section className="game-topbar" aria-label="맵 선택 화면">
          <div>
            <p className="eyebrow">
              {getGameModeLabel(selectedMode)} · {getTerrainMapCategoryLabel(selectedMapCategory)}
            </p>
            <h1>세부 맵 선택</h1>
          </div>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setScreenMode("category")}
          >
            뒤로
          </button>
        </section>

        <section className="mode-menu-panel" aria-label="맵 선택">
          <div>
            <p className="eyebrow">Map</p>
            <h2>{mapSelectionTitle}</h2>
          </div>
          <div className="mode-choice-grid">
            {selectableMapIds.map((mapId) => (
              <button
                className="mode-choice-button"
                key={mapId}
                type="button"
                onClick={() => startGame(selectedMode, mapId)}
              >
                <strong>{getTerrainMapLabel(mapId)}</strong>
                <span>{getTerrainMapDescription(mapId)}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <section className="arena-layout" aria-label="게임 화면">
        <GameHud
          activePlayerId={game.activePlayerId}
          displayHpByPlayer={displayHpByPlayer}
          mapId={game.mapId}
          mode={game.mode}
          onReset={reset}
          onTutorial={() => setTutorial((current) => openTutorial(current))}
          practice={game.practice}
          players={game.players}
          winnerId={game.winnerId}
        />

        <section className="board-panel arena-board" aria-label="좌표평면 게임판">
          <canvas ref={canvasRef} aria-label="포물선 전장" role="img" />
          {practiceStage && !game.practice?.isComplete ? (
            <PracticeProblemCard stage={practiceStage} />
          ) : null}
        </section>

        <AimControls
          game={game}
          input={activeInput}
          isShotAnimating={isInteractionLocked}
          onFire={fire}
          onHistory={() => setIsHistoryOpen(true)}
          onInputChange={updateActiveInput}
          onMove={moveTank}
          onResult={() => setIsResultOpen(true)}
          onCoordinateDisplayModeChange={setCoordinateDisplayMode}
          onTrajectoryPreviewChange={setIsTrajectoryPreviewOn}
          previewShot={previewShot}
          coordinateDisplayMode={coordinateDisplayMode}
          showTrajectoryPreview={isTrajectoryPreviewOn}
        />
      </section>

      {isResultOpen && game.lastShot ? (
        <ResultDetailsModal result={game.lastShot} onClose={() => setIsResultOpen(false)} />
      ) : null}

      {isHistoryOpen ? (
        <HistoryPopover history={game.shotHistory} onClose={() => setIsHistoryOpen(false)} />
      ) : null}

      {game.winnerId ? (
        <VictoryModal game={game} winnerId={game.winnerId} onReset={reset} />
      ) : null}

      {practiceDialog && practiceStage ? (
        <PracticeModal
          mode={practiceDialog}
          onContinue={() => setGame((current) => continuePracticeAfterSuccess(current))}
          stage={practiceStage}
          onClose={() => setPracticeDialog(null)}
          onReturnToMenu={reset}
        />
      ) : null}
    </main>
  );
}

function GameHud({
  activePlayerId,
  displayHpByPlayer,
  mapId,
  mode,
  onReset,
  onTutorial,
  practice,
  players,
  winnerId,
}: {
  activePlayerId: PlayerId;
  displayHpByPlayer: DisplayHpByPlayer;
  mapId: TerrainMapId;
  mode: GameMode;
  onReset: () => void;
  onTutorial: () => void;
  practice: GameState["practice"];
  players: GameState["players"];
  winnerId: PlayerId | null;
}) {
  const modeLabel =
    mode === "practice" && practice
      ? `연습 모드 · ${practice.step}단계`
      : `${getGameModeLabel(mode)} · ${getTerrainMapLabel(mapId)}`;

  return (
    <header className="game-hud" aria-label="게임 상태">
      <div className="game-brand">
        <p className="eyebrow">Quadratic Fortress</p>
        <h1>2차함수 포트리스</h1>
        <p className={`mode-label mode-${mode}`}>{modeLabel}</p>
      </div>
      <div className="versus-hud">
        {players.map((player) => {
          const maxHp =
            mode === "practice" && player.id === "p2" && practice
              ? getPracticeStage(practice.step).targetHp
              : STARTING_HP;

          return (
            <div
              className={`hud-player ${player.id === activePlayerId ? "is-active" : ""}`}
              key={player.id}
            >
              <div className="hud-player-row">
                <strong>{player.name}</strong>
                <span>{Math.round(displayHpByPlayer[player.id])} HP</span>
              </div>
              <div
                className="hp-track"
                aria-label={`${player.name} 체력 ${Math.round(displayHpByPlayer[player.id])}`}
              >
                <span
                  style={{
                    width: `${(displayHpByPlayer[player.id] / Math.max(1, maxHp)) * 100}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {winnerId ? (
        <div className="turn-badge" aria-live="polite">
          {`${getPlayerLabel(winnerId)} 승리`}
        </div>
      ) : mode === "practice" ? (
        <div className="turn-badge practice-turn" aria-live="polite">
          1P 연습 중
        </div>
      ) : null}
      <div className="topbar-actions">
        <button
          className="icon-button"
          type="button"
          title="튜토리얼 열기"
          aria-label="튜토리얼 열기"
          onClick={onTutorial}
        >
          <HelpCircle size={20} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="게임 초기화"
          aria-label="게임 초기화"
          onClick={onReset}
        >
          <RotateCcw size={20} />
        </button>
      </div>
    </header>
  );
}

function getGameModeLabel(mode: GameMode): string {
  if (mode === "practice") {
    return "연습 모드";
  }

  return mode === "normal" ? "일반 모드" : "바다 모드";
}

function AimControls({
  coordinateDisplayMode,
  game,
  input,
  isShotAnimating,
  onFire,
  onHistory,
  onInputChange,
  onMove,
  onResult,
  onCoordinateDisplayModeChange,
  onTrajectoryPreviewChange,
  previewShot,
  showTrajectoryPreview,
}: {
  coordinateDisplayMode: CoordinateDisplayMode;
  game: GameState;
  input: ShotInput;
  isShotAnimating: boolean;
  onFire: () => void;
  onHistory: () => void;
  onInputChange: (input: ShotInput | ((current: ShotInput) => ShotInput)) => void;
  onMove: (direction: MoveDirection) => void;
  onResult: () => void;
  onCoordinateDisplayModeChange: (mode: CoordinateDisplayMode) => void;
  onTrajectoryPreviewChange: (show: boolean) => void;
  previewShot: ShotResult;
  showTrajectoryPreview: boolean;
}) {
  const activePlayer = getActivePlayer(game);
  const canShowResult = Boolean(game.lastShot);
  const remainingMove = getRemainingMove(game);
  const canFire = previewShot.validationErrors.length === 0;
  const aimXRange = getAimXRange(activePlayer.id);
  const leftMoveAvailable = canMoveActivePlayer(game, -1);
  const rightMoveAvailable = canMoveActivePlayer(game, 1);
  const moveLimitMessage =
    (isMoveBlockedByTerritory(game, -1) || isMoveBlockedByTerritory(game, 1))
      ? MOVE_TERRITORY_LIMIT_MESSAGE
      : null;
  const shotToastResult =
    game.lastShot ?? (previewShot.validationErrors.length > 0 ? previewShot : null);

  return (
    <section className="aim-console" aria-label="조준 콘솔">
      <form
        className="aim-form"
        onSubmit={(event) => {
          event.preventDefault();
          onFire();
        }}
      >
        <div className="aim-title">
          <Target size={20} />
          <div>
            <p className="eyebrow">Aim</p>
            <strong>{activePlayer.name} 조준</strong>
            <span className="aim-coordinate">
              {formatPoint({ x: input.vertexX, y: input.vertexY })}
            </span>
          </div>
        </div>
        <RangeControl
          label="꼭짓점 x"
          max={aimXRange.max}
          min={aimXRange.min}
          value={input.vertexX}
          onChange={(value) =>
            onInputChange((current) => ({
              ...current,
              vertexX: value,
            }))
          }
        />
        <RangeControl
          label="꼭짓점 y"
          max={BOARD.yMax}
          min={COORDINATE_STEP}
          value={input.vertexY}
          onChange={(value) =>
            onInputChange((current) => ({
              ...current,
              vertexY: value,
            }))
          }
        />
        <ProjectileSelect
          input={input}
          onChange={(projectileType) =>
            onInputChange((current) => ({
              ...current,
              projectileType,
            }))
          }
        />
        <button
          className="fire-button"
          type="submit"
          disabled={Boolean(game.winnerId) || isShotAnimating || !canFire}
        >
          <Play size={20} />
          발사
        </button>
      </form>
      <div className="move-console" aria-label="탱크 이동">
        <div className="move-console-copy">
          <p className="eyebrow">MOVE</p>
          <strong>이동 가능: {formatCoordinate(remainingMove)}칸</strong>
          {moveLimitMessage ? <small>{moveLimitMessage}</small> : null}
        </div>
        <div className="move-buttons">
          <button
            className="icon-button"
            type="button"
            title="왼쪽으로 이동"
            aria-label="왼쪽으로 이동"
            disabled={isShotAnimating || !leftMoveAvailable}
            onClick={() => onMove(-1)}
          >
            <ArrowLeft size={20} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="오른쪽으로 이동"
            aria-label="오른쪽으로 이동"
            disabled={isShotAnimating || !rightMoveAvailable}
            onClick={() => onMove(1)}
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
      <ShotToast result={shotToastResult} vertex={previewShot.vertex} />
      <div className="quick-actions">
        <div className="mode-toggle" aria-label="좌표 표시 모드">
          <button
            className={coordinateDisplayMode === "teacher" ? "is-active" : ""}
            type="button"
            aria-pressed={coordinateDisplayMode === "teacher"}
            onClick={() => onCoordinateDisplayModeChange("teacher")}
          >
            Easy
          </button>
          <button
            className={coordinateDisplayMode === "student" ? "is-active" : ""}
            type="button"
            aria-pressed={coordinateDisplayMode === "student"}
            onClick={() => onCoordinateDisplayModeChange("student")}
          >
            Hard
          </button>
        </div>
        <button
          className={`secondary-button ${showTrajectoryPreview ? "is-active" : ""}`}
          type="button"
          aria-pressed={showTrajectoryPreview}
          onClick={() => onTrajectoryPreviewChange(!showTrajectoryPreview)}
        >
          {showTrajectoryPreview ? <EyeOff size={18} /> : <Eye size={18} />}
          예상 경로
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!canShowResult}
          onClick={onResult}
        >
          <Calculator size={18} />
          계산 보기
        </button>
        <button className="secondary-button" type="button" onClick={onHistory}>
          <History size={18} />
          기록
        </button>
      </div>
    </section>
  );
}

function formatPoint(point: Point): string {
  return `(${formatCoordinate(point.x)}, ${formatCoordinate(point.y)})`;
}

function createDisplayHpByPlayer(players: GameState["players"]): DisplayHpByPlayer {
  return players.reduce(
    (hpByPlayer, player) => {
      hpByPlayer[player.id] = player.hp;
      return hpByPlayer;
    },
    { p1: STARTING_HP, p2: STARTING_HP } as DisplayHpByPlayer,
  );
}

function createInitialAimInputByPlayer(players?: GameState["players"]): AimInputByPlayer {
  const getInput = (playerId: PlayerId): ShotInput => {
    const player = players?.find((candidate) => candidate.id === playerId);
    const vertexY = player
      ? Math.min(BOARD.yMax, Math.max(DEFAULT_INPUT.vertexY, roundToStep(player.tankPosition.y + 1.5)))
      : DEFAULT_INPUT.vertexY;

    return {
      ...DEFAULT_INPUT,
      vertexY,
    };
  };

  return {
    p1: getInput("p1"),
    p2: getInput("p2"),
  };
}

function createPracticeAimInputByPlayer(game: GameState): AimInputByPlayer {
  const stage = game.practice ? getPracticeStage(game.practice.step) : PRACTICE_STAGES[0];

  return {
    p1: { ...stage.defaultInput },
    p2: { ...stage.defaultInput },
  };
}

function PracticeProblemCard({ stage }: { stage: PracticeStageConfig }) {
  return (
    <aside className="practice-problem" aria-label="연습 문제">
      <p className="eyebrow">Practice Mission {stage.step}</p>
      <strong>{stage.title}</strong>
      <p>{stage.problem}</p>
    </aside>
  );
}

function PracticeModal({
  mode,
  onContinue,
  onClose,
  onReturnToMenu,
  stage,
}: {
  mode: Exclude<PracticeDialogMode, null>;
  onContinue: () => void;
  onClose: () => void;
  onReturnToMenu: () => void;
  stage: PracticeStageConfig;
}) {
  const isComplete = mode === "complete";
  const isSuccess = mode === "success";
  const successMessage = `${stage.step}단계를 성공했습니다. 다음 단계로 넘어갑니다.`;

  return (
    <div className="modal-backdrop practice-modal-backdrop" role="presentation">
      <section
        aria-label={isComplete ? "연습 모드 종료" : `연습 모드 ${stage.step}단계`}
        aria-modal="true"
        className="practice-modal"
        role="dialog"
      >
        <p className="eyebrow">
          {isComplete ? "Practice Complete" : isSuccess ? "Practice Success" : `Practice ${stage.step} / 3`}
        </p>
        <h2>{isComplete ? "연습 모드가 종료되었습니다." : isSuccess ? "성공!" : stage.title}</h2>
        {isComplete ? (
          <p>모든 연습 단계를 완료했습니다.</p>
        ) : isSuccess ? (
          <p>{successMessage}</p>
        ) : (
          <>
            <p>{stage.message}</p>
            <div className="practice-modal-problem">
              <strong>문제</strong>
              <span>{stage.problem}</span>
            </div>
          </>
        )}
        <button
          className="primary-button"
          type="button"
          onClick={isComplete ? onReturnToMenu : isSuccess ? onContinue : onClose}
        >
          {isComplete ? "메인 메뉴로 돌아가기" : "OK"}
        </button>
      </section>
    </div>
  );
}

function getFallingPlayers(startPlayers: Players, endPlayers: Players): PlayerId[] {
  return endPlayers
    .filter((endPlayer) => {
      const startPlayer = startPlayers.find((player) => player.id === endPlayer.id);
      return startPlayer ? endPlayer.tankPosition.y < startPlayer.tankPosition.y : false;
    })
    .map((player) => player.id);
}

function getShotAnimationDuration(shot: ShotResult, shooterPosition: Point): number {
  const travelDistance = estimateShotTravelDistance(shot, shooterPosition);
  return Math.max(
    MIN_SHOT_ANIMATION_DURATION,
    Math.min(MAX_SHOT_ANIMATION_DURATION, travelDistance * SHOT_DURATION_PER_UNIT),
  );
}

function estimateShotTravelDistance(shot: ShotResult, shooterPosition: Point): number {
  if (!Number.isFinite(shot.quadratic.a) || shot.validationErrors.length > 0) {
    return 0;
  }

  const steps = 24;
  let distance = 0;
  let previous = shooterPosition;

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const x = shooterPosition.x + (shot.impactPoint.x - shooterPosition.x) * progress;
    const point = { x, y: getYAtX(shot.quadratic, x) };
    distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }

  return distance;
}

function RangeControl({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="range-control">
      <span>
        {label}
        <strong>{formatCoordinate(value)}</strong>
      </span>
      <input
        max={max}
        min={min}
        step={COORDINATE_STEP}
        type="range"
        value={value}
        onChange={(event) => onChange(roundToStep(Number(event.target.value)))}
        onInput={(event) => onChange(roundToStep(Number(event.currentTarget.value)))}
      />
    </label>
  );
}

function ProjectileSelect({
  input,
  onChange,
}: {
  input: ShotInput;
  onChange: (projectileType: NonNullable<ShotInput["projectileType"]>) => void;
}) {
  const selectedProjectile = getShotProjectile(input);

  return (
    <label className="projectile-control">
      <span>
        포탄
        <strong>{selectedProjectile.name}</strong>
      </span>
      <select
        value={selectedProjectile.id}
        onChange={(event) =>
          onChange(event.currentTarget.value as NonNullable<ShotInput["projectileType"]>)
        }
      >
        {PROJECTILE_TYPES.map((projectile) => (
          <option key={projectile.id} value={projectile.id}>
            {projectile.name}
          </option>
        ))}
      </select>
      <small>
        반경 {formatCoordinate(selectedProjectile.blastRadius)} / 피해 {selectedProjectile.maxDamage}
      </small>
    </label>
  );
}

function ShotToast({ result, vertex }: { result: ShotResult | null; vertex: Point }) {
  if (!result) {
    return (
      <div className="shot-toast is-aiming" aria-live="polite">
        <span>조준점</span>
        <strong>{formatPoint(vertex)}</strong>
      </div>
    );
  }

  if (result.validationErrors.length > 0) {
    return (
      <div className="shot-toast is-miss" aria-live="polite">
        <span>발사 불가</span>
        <strong>{result.validationErrors[0]}</strong>
      </div>
    );
  }

  const didDamage = result.damage > 0;
  const label = didDamage ? "명중" : result.isValidImpact ? "빗나감" : "착탄 실패";
  const detail = didDamage
    ? `피해 ${result.damage}`
    : result.isValidImpact
      ? "폭발 반경 밖"
      : "착탄점 전장 밖";

  return (
    <div className={`shot-toast ${didDamage ? "is-hit" : "is-miss"}`} aria-live="polite">
      <span>{label}</span>
      <strong>{detail}</strong>
      <small>
        착탄점 {formatPoint(result.impactPoint)}
      </small>
    </div>
  );
}

function ResultDetailsModal({ result, onClose }: { result: ShotResult; onClose: () => void }) {
  return (
    <ModalFrame label="계산 결과" onClose={onClose}>
      <section className="result-panel" aria-label="계산 결과">
        <div className="modal-heading">
          <p className="eyebrow">Result</p>
          <h2>이번 발사 계산</h2>
        </div>
        <dl className="formula-grid">
          <div>
            <dt>포탄</dt>
            <dd>{result.projectile.name}</dd>
          </div>
          <div>
            <dt>폭발 반경</dt>
            <dd>{formatCoordinate(result.projectile.blastRadius)}칸</dd>
          </div>
          <div>
            <dt>최대 피해</dt>
            <dd>{result.projectile.maxDamage}</dd>
          </div>
          <div>
            <dt>식</dt>
            <dd>{formatEquation(result.quadratic)}</dd>
          </div>
          <div>
            <dt>착탄점</dt>
            <dd>{formatPoint(result.impactPoint)}</dd>
          </div>
          <div>
            <dt>거리</dt>
            <dd>{formatCoordinate(result.distanceToTarget)}칸</dd>
          </div>
          <div>
            <dt>피해</dt>
            <dd>{result.damage}</dd>
          </div>
          <div>
            <dt>자기 피해</dt>
            <dd>{result.shooterDamage}</dd>
          </div>
        </dl>
        <ol className="explanation-list">
          {result.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>
    </ModalFrame>
  );
}

function HistoryPopover({ history, onClose }: { history: ShotResult[]; onClose: () => void }) {
  return (
    <ModalFrame label="발사 기록" onClose={onClose}>
      <section className="history-popover" aria-label="발사 기록">
        <div className="modal-heading">
          <p className="eyebrow">History</p>
          <h2>발사 기록</h2>
        </div>
        <div className="history-list">
          {history.length === 0 ? (
            <p className="empty-history">아직 발사 기록이 없습니다.</p>
          ) : (
            history.map((shot) => (
              <article className="history-item" key={shot.id}>
                <p className="history-projectile">{shot.projectile.name}</p>
                <div>
                  <strong>
                    #{shot.id} {getPlayerLabel(shot.shooterId)} → {getPlayerLabel(shot.targetId)}
                  </strong>
                  <span>피해 {shot.damage}</span>
                </div>
                <p>
                  꼭짓점 {formatPoint(shot.vertex)}, 착탄점 {formatPoint(shot.impactPoint)}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </ModalFrame>
  );
}

function VictoryModal({
  game,
  winnerId,
  onReset,
}: {
  game: GameState;
  winnerId: PlayerId;
  onReset: () => void;
}) {
  const playerStats = game.players.map((player) => {
    const shots = game.shotHistory.filter((shot) => shot.shooterId === player.id);
    const hits = shots.filter((shot) => shot.damage > 0).length;

    return {
      hp: Math.round(player.hp),
      id: player.id,
      label: player.name,
      hitRate: `${hits}/${shots.length}`,
    };
  });
  const lastAttack = game.shotHistory[0] ?? game.lastShot;
  const lastAttackText = lastAttack
    ? `${lastAttack.projectile.name} · 피해 ${lastAttack.damage}`
    : "없음";

  return (
    <div className="victory-backdrop" role="presentation">
      <section
        aria-label={`${getPlayerLabel(winnerId)} 승리`}
        aria-modal="true"
        className={`victory-panel winner-${winnerId}`}
        role="dialog"
      >
        <p className="eyebrow">Game Over</p>
        <h2>{getPlayerLabel(winnerId)} 승리!</h2>
        <div className="victory-summary" aria-label="경기 요약">
          <div className="victory-stat-card">
            <span>최종 HP</span>
            <strong>
              {playerStats.map((stat) => `${stat.label} HP : ${stat.hp}`).join("  &  ")}
            </strong>
          </div>
          <div className="victory-stat-card">
            <span>명중률</span>
            <strong>
              {playerStats.map((stat) => `${stat.label} : ${stat.hitRate}`).join("  &  ")}
            </strong>
          </div>
          <div className="victory-stat-card">
            <span>결정타</span>
            <strong>{lastAttackText}</strong>
          </div>
          <div className="victory-stat-card">
            <span>모드 / 맵</span>
            <strong>
              {getGameModeLabel(game.mode)} - {getTerrainMapLabel(game.mapId)}
            </strong>
          </div>
        </div>
        <button className="primary-button" type="button" onClick={onReset}>
          다시하기
        </button>
      </section>
    </div>
  );
}

function ModalFrame({
  children,
  label,
  onClose,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div aria-label={label} aria-modal="true" className="modal-panel" role="dialog">
        <button
          className="icon-button modal-close"
          type="button"
          title="닫기"
          aria-label="닫기"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}

function TutorialScreen({
  state,
  onClose,
  onNext,
  onPrevious,
}: {
  state: TutorialState;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const step = TUTORIAL_STEPS[state.currentStep];
  const isLastStep = state.currentStep === TUTORIAL_STEPS.length - 1;
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    setAnimationKey((current) => current + 1);
  }, [state.currentStep]);

  return (
    <section className="tutorial-stage" aria-labelledby="tutorial-title">
      <div className="tutorial-panel">
        <div className="tutorial-title-row">
          <div>
            <p className="eyebrow">
              Tutorial {state.currentStep + 1} / {TUTORIAL_STEPS.length}
            </p>
            <h2 id="tutorial-title">{step.title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="튜토리얼 닫기"
            aria-label="튜토리얼 닫기"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p>{step.body}</p>
        <TutorialSketch animationKey={animationKey} stepIndex={state.currentStep} />
        <div className="tutorial-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={state.currentStep === 0}
            onClick={onPrevious}
          >
            <SkipBack size={18} />
            이전
          </button>
          <button className="primary-button" type="button" onClick={onNext}>
            {isLastStep ? "게임 시작" : "다음"}
            <SkipForward size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

const TUTORIAL_DETAILS = [
  {
    title: "1. 입력값은 그래프의 꼭짓점",
    formula: "입력: 꼭짓점 (h, k) = (0, 6)",
    lines: ["포탄은 이 점을 가장 높게 지나갑니다.", "그래프에서 max 표시가 포물선의 꼭짓점입니다."],
  },
  {
    title: "2. 탱크 좌표로 a값 계산",
    formula: "0 = a(-8 - 0)² + 6 → a = -6 / 64 = -0.094",
    lines: ["현재 탱크 (-8, 0)을 식에 대입합니다.", "그래서 y = -0.094(x - 0)² + 6이 됩니다."],
  },
  {
    title: "3. 지형 또는 대상과 다시 만나는 곳이 착탄점",
    formula: "x착탄 = 2h - xs = 2×0 - (-8) = 8",
    lines: ["착탄점이 상대 탱크에 가까울수록 피해가 커집니다.", "이 예시는 상대 탱크 중심 (8, 0)에 정확히 떨어집니다."],
  },
  {
    title: "4. 원 안의 거리로 피해 계산",
    formula: "(x - 8)² + (y - 0)² ≤ 2², d = 0",
    lines: ["반지름 1 안에 목표 중심이 들어오면 피해가 생깁니다.", "damage = round(20 × (1 - 0 / 1)) = 20입니다."],
  },
] as const;

function TutorialSketch({
  animationKey,
  stepIndex,
}: {
  animationKey: number;
  stepIndex: number;
}) {
  const details = TUTORIAL_DETAILS[stepIndex];
  const pathId = `tutorial-shell-path-${animationKey}`;
  const svg = {
    width: 760,
    height: 360,
    margin: { left: 62, right: 34, top: 28, bottom: 62 },
  };
  const plot = {
    width: svg.width - svg.margin.left - svg.margin.right,
    height: svg.height - svg.margin.top - svg.margin.bottom,
  };
  const toTutorialScreen = (point: Point): ScreenPoint => ({
    x:
      svg.margin.left +
      ((point.x - BOARD.xMin) / (BOARD.xMax - BOARD.xMin)) * plot.width,
    y:
      svg.height -
      svg.margin.bottom -
      ((point.y - BOARD.yMin) / (BOARD.yMax - BOARD.yMin)) * plot.height,
  });
  const tutorialQuadratic = { a: -6 / 64, h: 0, k: 6 };
  const shooter = { x: -8, y: 0 };
  const target = { x: 8, y: 0 };
  const vertex = { x: 0, y: 6 };
  const impact = { x: 8, y: 0 };
  const shooterScreen = toTutorialScreen(shooter);
  const targetScreen = toTutorialScreen(target);
  const vertexScreen = toTutorialScreen(vertex);
  const impactScreen = toTutorialScreen(impact);
  const blastEdge = toTutorialScreen({ x: impact.x + BLAST_RADIUS, y: impact.y });
  const blastRadius = Math.abs(blastEdge.x - impactScreen.x);
  const xAxisY = toTutorialScreen({ x: 0, y: 0 }).y;
  const yAxisX = toTutorialScreen({ x: 0, y: 0 }).x;
  const tutorialPath = Array.from({ length: 81 }, (_, index) => {
    const x = shooter.x + ((impact.x - shooter.x) * index) / 80;
    return toTutorialScreen({ x, y: getYAtX(tutorialQuadratic, x) });
  })
    .map((point, index) => `${index === 0 ? "M" : "L"} ${round(point.x, 1)} ${round(point.y, 1)}`)
    .join(" ");
  const tankBody = { width: 54, height: 30 };

  return (
    <div className="tutorial-demo-grid">
      <div className={`tutorial-sketch step-${stepIndex}`} key={animationKey}>
        <svg className="tutorial-svg" viewBox={`0 0 ${svg.width} ${svg.height}`} role="img">
          <title>포물선 발사 애니메이션</title>
          {Array.from({ length: BOARD.xMax - BOARD.xMin + 1 }).map((_, index) => {
            const xValue = BOARD.xMin + index;
            const from = toTutorialScreen({ x: xValue, y: BOARD.yMin });
            const to = toTutorialScreen({ x: xValue, y: BOARD.yMax });
            return (
              <g key={`x-${xValue}`}>
                <line
                  className="tutorial-grid-line"
                  x1={from.x}
                  x2={to.x}
                  y1={from.y}
                  y2={to.y}
                />
                {xValue % 2 === 0 ? (
                  <text className="tutorial-axis-label" x={from.x} y={from.y + 24}>
                    {xValue}
                  </text>
                ) : null}
              </g>
            );
          })}
          {Array.from({ length: BOARD.yMax - BOARD.yMin + 1 }).map((_, index) => {
            const yValue = BOARD.yMin + index;
            const from = toTutorialScreen({ x: BOARD.xMin, y: yValue });
            const to = toTutorialScreen({ x: BOARD.xMax, y: yValue });
            return (
              <g key={`y-${yValue}`}>
                <line
                  className="tutorial-grid-line"
                  x1={from.x}
                  x2={to.x}
                  y1={from.y}
                  y2={to.y}
                />
                {yValue % 2 === 0 ? (
                  <text className="tutorial-axis-label y-label" x={from.x - 18} y={from.y + 5}>
                    {yValue}
                  </text>
                ) : null}
              </g>
            );
          })}

          <rect
            className="tutorial-plot-frame"
            height={plot.height}
            width={plot.width}
            x={svg.margin.left}
            y={svg.margin.top}
          />
          <line
            className="tutorial-axis"
            x1={toTutorialScreen({ x: BOARD.xMin, y: 0 }).x}
            x2={toTutorialScreen({ x: BOARD.xMax, y: 0 }).x}
            y1={xAxisY}
            y2={xAxisY}
          />
          <line
            className="tutorial-axis"
            x1={yAxisX}
            x2={yAxisX}
            y1={toTutorialScreen({ x: 0, y: BOARD.yMin }).y}
            y2={toTutorialScreen({ x: 0, y: BOARD.yMax }).y}
          />
          <text className="tutorial-axis-name" x={svg.width - 28} y={xAxisY - 8}>
            x
          </text>
          <text className="tutorial-axis-name" x={yAxisX + 8} y={18}>
            y
          </text>
          <path className="tutorial-path-shadow" d={tutorialPath} fill="none" />
          <path className="tutorial-path" d={tutorialPath} fill="none" id={pathId} />

          <g className="tutorial-tank tutorial-tank-left">
            <rect
              height={tankBody.height}
              rx="6"
              width={tankBody.width}
              x={shooterScreen.x - tankBody.width / 2}
              y={shooterScreen.y - tankBody.height}
            />
            <line
              x1={shooterScreen.x + 18}
              x2={shooterScreen.x + 56}
              y1={shooterScreen.y - 31}
              y2={shooterScreen.y - 55}
            />
            <circle cx={shooterScreen.x - 14} cy={shooterScreen.y + 2} r="8" />
            <circle cx={shooterScreen.x + 14} cy={shooterScreen.y + 2} r="8" />
            <text x={shooterScreen.x - 38} y={shooterScreen.y - 42}>
              1P (-8, 0)
            </text>
          </g>

          <g className="tutorial-tank tutorial-tank-right">
            <rect
              height={tankBody.height}
              rx="6"
              width={tankBody.width}
              x={targetScreen.x - tankBody.width / 2}
              y={targetScreen.y - tankBody.height}
            />
            <line
              x1={targetScreen.x - 18}
              x2={targetScreen.x - 58}
              y1={targetScreen.y - 31}
              y2={targetScreen.y - 55}
            />
            <circle cx={targetScreen.x - 14} cy={targetScreen.y + 2} r="8" />
            <circle cx={targetScreen.x + 14} cy={targetScreen.y + 2} r="8" />
            <text x={targetScreen.x - 42} y={targetScreen.y - 42}>
              2P (8, 0)
            </text>
          </g>

          <line
            className={`tutorial-helper-line ${stepIndex === 1 ? "is-active" : ""}`}
            x1={shooterScreen.x}
            x2={vertexScreen.x}
            y1={shooterScreen.y}
            y2={vertexScreen.y}
          />
          <line
            className={`tutorial-helper-line ${stepIndex === 3 ? "is-active" : ""}`}
            x1={impactScreen.x}
            x2={targetScreen.x}
            y1={impactScreen.y}
            y2={targetScreen.y}
          />

          <g className={`tutorial-vertex ${stepIndex <= 1 ? "is-active" : ""}`}>
            <circle cx={vertexScreen.x} cy={vertexScreen.y} r="11" />
            <text x={vertexScreen.x + 18} y={vertexScreen.y - 7}>
              (h, k) = (0, 6)
            </text>
            <text x={vertexScreen.x + 18} y={vertexScreen.y + 12}>
              최고점
            </text>
          </g>

          <g className={`tutorial-impact ${stepIndex >= 2 ? "is-active" : ""}`}>
            <circle cx={impactScreen.x} cy={impactScreen.y} r="13" />
            <text x={impactScreen.x - 76} y={impactScreen.y + 42}>
              착탄점 (8, 0)
            </text>
          </g>

          <g className={`tutorial-blast ${stepIndex === 3 ? "is-active" : ""}`}>
            <circle cx={impactScreen.x} cy={impactScreen.y} r={blastRadius} />
            <line
              x1={impactScreen.x}
              x2={blastEdge.x}
              y1={impactScreen.y}
              y2={impactScreen.y}
            />
            <text x={impactScreen.x - 62} y={impactScreen.y - blastRadius - 12}>
              반지름 2
            </text>
          </g>

          <circle className={`tutorial-shell step-${stepIndex}`} r="8">
            <animateMotion dur="2.9s" repeatCount="indefinite" rotate="auto">
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        </svg>
        <strong>
          포탄이 탱크에서 출발해 꼭짓점을 지나고, 지형 또는 대상에 다시 닿는 지점에서 폭발합니다.
        </strong>
      </div>

      <aside className="tutorial-math-card" aria-label="튜토리얼 계산 설명">
        <p className="eyebrow">{details.title}</p>
        <code>{details.formula}</code>
        <ul>
          {details.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  game: GameState,
  previewShot: ShotResult,
  visibleShot: ShotResult,
  displayHpByPlayer: DisplayHpByPlayer,
  animationProgress: number,
  hasFiredShot: boolean,
  showTrajectoryPreview: boolean,
  coordinateDisplayMode: CoordinateDisplayMode,
) {
  const rc = rough.canvas(ctx.canvas);
  const margin = {
    left: 48,
    right: 28,
    top: 24,
    bottom: 46,
  };
  const availableWidth = width - margin.left - margin.right;
  const availableHeight = height - margin.top - margin.bottom;
  const unit = Math.min(
    availableWidth / (BOARD.xMax - BOARD.xMin),
    availableHeight / (BOARD.yMax - BOARD.yMin),
  );
  const plotWidth = unit * (BOARD.xMax - BOARD.xMin);
  const plotHeight = unit * (BOARD.yMax - BOARD.yMin);
  const plotLeft = margin.left + (availableWidth - plotWidth) / 2;
  const plotTop = margin.top + (availableHeight - plotHeight) / 2;

  const toScreen = (point: Point): ScreenPoint => ({
    x: plotLeft + (point.x - BOARD.xMin) * unit,
    y: plotTop + (BOARD.yMax - point.y) * unit,
  });

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, rc, height, toScreen, coordinateDisplayMode);
  drawTerrain(ctx, toScreen, game.terrain);
  const shotShooterPosition =
    game.players.find((player) => player.id === visibleShot.shooterId)?.tankPosition ??
    getActivePlayer(game).tankPosition;
  const previewShooterPosition = getActivePlayer(game).tankPosition;

  if (hasFiredShot && visibleShot.validationErrors.length === 0) {
    drawTrajectory(
      ctx,
      toScreen,
      visibleShot,
      shotShooterPosition,
      "#2f855a",
      false,
      animationProgress,
    );
    if (visibleShot.isValidImpact) {
      drawBlast(rc, toScreen, visibleShot);
    }
  }

  if (showTrajectoryPreview) {
    drawTrajectory(
      ctx,
      toScreen,
      previewShot,
      previewShooterPosition,
      "#2563eb",
      true,
      1,
    );
    if (previewShot.isValidImpact) {
      drawBlast(rc, toScreen, previewShot);
    }
  }

  for (const player of game.players) {
    const tankMaxHp =
      game.mode === "practice" && player.id === "p2" && game.practice
        ? getPracticeStage(game.practice.step).targetHp
        : STARTING_HP;

    drawTank(
      ctx,
      rc,
      toScreen,
      player,
      player.id === game.activePlayerId,
      displayHpByPlayer[player.id],
      tankMaxHp,
    );
  }

  drawVertex(ctx, rc, toScreen, previewShot.vertex, getActivePlayer(game).id, game.mode);
  if (hasFiredShot) {
    drawShell(rc, toScreen, visibleShot, shotShooterPosition, animationProgress);
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  rc: ReturnType<typeof rough.canvas>,
  height: number,
  toScreen: (point: Point) => ScreenPoint,
  coordinateDisplayMode: CoordinateDisplayMode,
) {
  const isTeacherMode = coordinateDisplayMode === "teacher";
  const studentXLabels = new Set([-10, -5, 0, 5, 10]);
  const studentYLabels = new Set([0, 5, 10]);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillStyle = "#687076";

  for (let x = BOARD.xMin; x <= BOARD.xMax; x += 1) {
    const from = toScreen({ x, y: BOARD.yMin });
    const to = toScreen({ x, y: BOARD.yMax });
    if (isTeacherMode) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    if (isTeacherMode ? x % 2 === 0 : studentXLabels.has(x)) {
      ctx.fillText(String(x), from.x - 7, height - 20);
    }
  }

  for (let y = BOARD.yMin; y <= BOARD.yMax; y += 1) {
    const from = toScreen({ x: BOARD.xMin, y });
    const to = toScreen({ x: BOARD.xMax, y });
    if (isTeacherMode) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    if (isTeacherMode ? y % 2 === 0 : studentYLabels.has(y)) {
      ctx.fillText(String(y), 18, from.y + 4);
    }
  }

  const xAxisStart = toScreen({ x: BOARD.xMin, y: 0 });
  const xAxisEnd = toScreen({ x: BOARD.xMax, y: 0 });
  const yAxisStart = toScreen({ x: 0, y: BOARD.yMin });
  const yAxisEnd = toScreen({ x: 0, y: BOARD.yMax });

  rc.line(xAxisStart.x, xAxisStart.y, xAxisEnd.x, xAxisEnd.y, {
    stroke: "#1f2933",
    strokeWidth: 2,
    roughness: 0.8,
  });
  rc.line(yAxisStart.x, yAxisStart.y, yAxisEnd.x, yAxisEnd.y, {
    stroke: "#1f2933",
    strokeWidth: 2,
    roughness: 0.8,
  });

  const frameTopLeft = toScreen({ x: BOARD.xMin, y: BOARD.yMax });
  const frameBottomRight = toScreen({ x: BOARD.xMax, y: BOARD.yMin });

  rc.rectangle(frameTopLeft.x, frameTopLeft.y, frameBottomRight.x - frameTopLeft.x, frameBottomRight.y - frameTopLeft.y, {
    stroke: "#2f3437",
    strokeWidth: 1.4,
    roughness: 1.2,
    fill: "transparent",
  });
}

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  terrain: GameState["terrain"],
) {
  const terrainLayer = document.createElement("canvas");
  terrainLayer.width = ctx.canvas.width;
  terrainLayer.height = ctx.canvas.height;
  const layerCtx = terrainLayer.getContext("2d");

  if (!layerCtx) {
    return;
  }

  layerCtx.setTransform(ctx.getTransform());

  if (terrain.columns) {
    fillColumnTerrain(layerCtx, toScreen, terrain.columns);
    strokeColumnTerrainOutline(layerCtx, toScreen, terrain.columns);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(terrainLayer, 0, 0);
    ctx.restore();
    return;
  }

  fillBlockTerrain(layerCtx, toScreen, terrain.blocks);

  for (const segment of terrain.segments) {
    fillTerrainPolygon(layerCtx, [
      toScreen({ x: segment.x1, y: segment.y1 }),
      toScreen({ x: segment.x2, y: segment.y2 }),
      toScreen({ x: segment.x2, y: segment.y2 - 0.5 }),
      toScreen({ x: segment.x1, y: segment.y1 - 0.5 }),
    ]);
  }

  punchTerrainHoles(layerCtx, toScreen, terrain.holes);
  strokeTerrainOutline(layerCtx, toScreen, terrain);
  punchTerrainHoles(layerCtx, toScreen, terrain.holes);
  strokeTerrainHoleOutlines(layerCtx, toScreen, terrain);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(terrainLayer, 0, 0);
  ctx.restore();
}

function fillBlockTerrain(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  blocks: GameState["terrain"]["blocks"],
) {
  if (blocks.length === 0) {
    return;
  }

  ctx.save();
  ctx.beginPath();

  for (const block of blocks) {
    const topLeft = toScreen({ x: block.x, y: block.y + block.height });
    const topRight = toScreen({ x: block.x + block.width, y: block.y + block.height });
    const bottomRight = toScreen({ x: block.x + block.width, y: block.y });
    const bottomLeft = toScreen({ x: block.x, y: block.y });

    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
  }

  ctx.fillStyle = "#fde68a";
  ctx.fill();
  ctx.fillStyle = "rgba(180, 83, 9, 0.18)";
  ctx.fill();
  ctx.restore();
}

function fillColumnTerrain(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  columns: NonNullable<GameState["terrain"]["columns"]>,
) {
  const shapes = buildColumnRenderShapes(columns);

  ctx.save();
  ctx.beginPath();

  for (const shape of shapes) {
    addColumnRenderShapePath(ctx, toScreen, shape);
  }

  ctx.fillStyle = "#fde68a";
  ctx.fill();
  ctx.fillStyle = "rgba(180, 83, 9, 0.18)";
  ctx.fill();
  ctx.restore();
}

function strokeColumnTerrainOutline(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  columns: NonNullable<GameState["terrain"]["columns"]>,
) {
  ctx.save();
  ctx.strokeStyle = "#202124";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  clipToBoard(ctx, toScreen);

  drawExposedColumnTerrainEdges(ctx, toScreen, columns);

  ctx.restore();
}

function drawExposedColumnTerrainEdges(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  columns: NonNullable<GameState["terrain"]["columns"]>,
) {
  ctx.beginPath();

  for (const [index, segments] of columns.entries()) {
    for (const segment of segments) {
      const leftX = getColumnLeftX(index);
      const rightX = getColumnRightX(index);

      if (!hasTouchingSegmentAtY(segments, segment.topY, segment, "above")) {
        moveLineTo(ctx, toScreen, { x: leftX, y: segment.topY }, { x: rightX, y: segment.topY });
      }

      if (!hasTouchingSegmentAtY(segments, segment.bottomY, segment, "below")) {
        moveLineTo(ctx, toScreen, { x: leftX, y: segment.bottomY }, { x: rightX, y: segment.bottomY });
      }

      for (const interval of subtractCoveredIntervals(
        [[segment.bottomY, segment.topY]],
        columns.get(index - 1) ?? [],
      )) {
        moveLineTo(ctx, toScreen, { x: leftX, y: interval[0] }, { x: leftX, y: interval[1] });
      }

      for (const interval of subtractCoveredIntervals(
        [[segment.bottomY, segment.topY]],
        columns.get(index + 1) ?? [],
      )) {
        moveLineTo(ctx, toScreen, { x: rightX, y: interval[0] }, { x: rightX, y: interval[1] });
      }
    }
  }

  ctx.stroke();
}

function moveLineTo(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  from: Point,
  to: Point,
) {
  const fromScreen = toScreen(from);
  const toScreenPoint = toScreen(to);
  ctx.moveTo(fromScreen.x, fromScreen.y);
  ctx.lineTo(toScreenPoint.x, toScreenPoint.y);
}

function hasTouchingSegmentAtY(
  segments: TerrainColumnSegment[],
  y: number,
  source: TerrainColumnSegment,
  direction: "above" | "below",
) {
  return segments.some((segment) => {
    if (segment === source) {
      return false;
    }

    return direction === "above"
      ? Math.abs(segment.bottomY - y) < 0.001
      : Math.abs(segment.topY - y) < 0.001;
  });
}

function subtractCoveredIntervals(
  intervals: Array<[number, number]>,
  coveringSegments: TerrainColumnSegment[],
): Array<[number, number]> {
  return coveringSegments.reduce(
    (remaining, segment) => subtractInterval(remaining, [segment.bottomY, segment.topY]),
    intervals,
  );
}

function subtractInterval(
  intervals: Array<[number, number]>,
  cover: [number, number],
): Array<[number, number]> {
  const [coverBottom, coverTop] = cover;

  return intervals.flatMap(([bottom, top]) => {
    if (coverTop <= bottom + 0.001 || coverBottom >= top - 0.001) {
      return [[bottom, top] as [number, number]];
    }

    const pieces: Array<[number, number]> = [];
    const lowerTop = Math.min(top, coverBottom);
    const upperBottom = Math.max(bottom, coverTop);

    if (lowerTop > bottom + 0.001) {
      pieces.push([bottom, lowerTop]);
    }

    if (top > upperBottom + 0.001) {
      pieces.push([upperBottom, top]);
    }

    return pieces;
  });
}

function addColumnRenderShapePath(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  shape: ColumnRenderShape,
) {
  const slices = shape.slices;

  if (slices.length === 0) {
    return;
  }

  const first = slices[0];
  const last = slices[slices.length - 1];

  ctx.moveTo(
    toScreen({ x: getColumnLeftX(first.index), y: first.segment.topY }).x,
    toScreen({ x: getColumnLeftX(first.index), y: first.segment.topY }).y,
  );

  for (const slice of slices) {
    const point = toScreen({ x: getColumnLeftX(slice.index), y: slice.segment.topY });
    ctx.lineTo(point.x, point.y);
  }

  const lastTopRight = toScreen({ x: getColumnRightX(last.index), y: last.segment.topY });
  ctx.lineTo(lastTopRight.x, lastTopRight.y);

  const lastBottomRight = toScreen({ x: getColumnRightX(last.index), y: last.segment.bottomY });
  ctx.lineTo(lastBottomRight.x, lastBottomRight.y);

  for (const slice of [...slices].reverse()) {
    const point = toScreen({ x: getColumnLeftX(slice.index), y: slice.segment.bottomY });
    ctx.lineTo(point.x, point.y);
  }

  ctx.closePath();
}

function getColumnLeftX(index: number) {
  return round(BOARD.xMin + index * TERRAIN_COLUMN_STEP, 2);
}

function getColumnRightX(index: number) {
  return round(BOARD.xMin + (index + 1) * TERRAIN_COLUMN_STEP, 2);
}

function fillTerrainPolygon(ctx: CanvasRenderingContext2D, points: ScreenPoint[], useTerrainColor = true) {
  ctx.save();
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = useTerrainColor ? "#fde68a" : "#000000";
  ctx.fill();
  if (useTerrainColor) {
    ctx.fillStyle = "rgba(180, 83, 9, 0.18)";
    ctx.fill();
  }
  ctx.restore();
}

function strokeTerrainOutline(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  terrain: GameState["terrain"],
) {
  ctx.save();
  ctx.strokeStyle = "#202124";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  clipToBoard(ctx, toScreen);

  strokeBlockTerrainGridOutline(ctx, toScreen, terrain);

  for (const segment of terrain.segments) {
    strokeSegmentEdgeIfExposed(ctx, toScreen, terrain, segment, "top");
    strokeSegmentEdgeIfExposed(ctx, toScreen, terrain, segment, "bottom");
    strokeTerrainCapIfExposed(ctx, toScreen, terrain, segment.id, segment.x1, segment.y1, segment.y1 - 0.5);
    strokeTerrainCapIfExposed(ctx, toScreen, terrain, segment.id, segment.x2, segment.y2, segment.y2 - 0.5);
  }

  ctx.restore();
}

type TerrainEdge = {
  fixed: number;
  from: number;
  to: number;
};

function strokeBlockTerrainGridOutline(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  terrain: GameState["terrain"],
) {
  const { blocks } = terrain;

  if (blocks.length === 0) {
    return;
  }

  const xLines = getSortedBlockBoundaries(blocks, "x");
  const yLines = getSortedBlockBoundaries(blocks, "y");
  const occupied = new Set<string>();

  for (let xIndex = 0; xIndex < xLines.length - 1; xIndex += 1) {
    for (let yIndex = 0; yIndex < yLines.length - 1; yIndex += 1) {
      const center = {
        x: (xLines[xIndex] + xLines[xIndex + 1]) / 2,
        y: (yLines[yIndex] + yLines[yIndex + 1]) / 2,
      };

      if (blocks.some((block) => isPointInsideBlockRect(center, block))) {
        occupied.add(getGridCellKey(xIndex, yIndex));
      }
    }
  }

  const horizontalEdges: TerrainEdge[] = [];
  const verticalEdges: TerrainEdge[] = [];

  for (const key of occupied) {
    const [xIndex, yIndex] = key.split(",").map(Number);
    const x1 = xLines[xIndex];
    const x2 = xLines[xIndex + 1];
    const y1 = yLines[yIndex];
    const y2 = yLines[yIndex + 1];

    if (
      !occupied.has(getGridCellKey(xIndex, yIndex + 1)) &&
      isTerrainGridEdgeExposed(terrain, { fixed: y2, from: x1, to: x2 }, "horizontal", 1)
    ) {
      horizontalEdges.push({ fixed: y2, from: x1, to: x2 });
    }
    if (
      !occupied.has(getGridCellKey(xIndex, yIndex - 1)) &&
      isTerrainGridEdgeExposed(terrain, { fixed: y1, from: x1, to: x2 }, "horizontal", -1)
    ) {
      horizontalEdges.push({ fixed: y1, from: x1, to: x2 });
    }
    if (
      !occupied.has(getGridCellKey(xIndex - 1, yIndex)) &&
      isTerrainGridEdgeExposed(terrain, { fixed: x1, from: y1, to: y2 }, "vertical", -1)
    ) {
      verticalEdges.push({ fixed: x1, from: y1, to: y2 });
    }
    if (
      !occupied.has(getGridCellKey(xIndex + 1, yIndex)) &&
      isTerrainGridEdgeExposed(terrain, { fixed: x2, from: y1, to: y2 }, "vertical", 1)
    ) {
      verticalEdges.push({ fixed: x2, from: y1, to: y2 });
    }
  }

  for (const edge of mergeTerrainEdges(horizontalEdges)) {
    strokeTerrainEdge(ctx, toScreen({ x: edge.from, y: edge.fixed }), toScreen({ x: edge.to, y: edge.fixed }));
  }

  for (const edge of mergeTerrainEdges(verticalEdges)) {
    strokeTerrainEdge(ctx, toScreen({ x: edge.fixed, y: edge.from }), toScreen({ x: edge.fixed, y: edge.to }));
  }
}

function clipToBoard(ctx: CanvasRenderingContext2D, toScreen: (point: Point) => ScreenPoint) {
  const topLeft = toScreen({ x: BOARD.xMin, y: BOARD.yMax });
  const bottomRight = toScreen({ x: BOARD.xMax, y: BOARD.yMin });

  ctx.beginPath();
  ctx.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  ctx.clip();
}

function isTerrainGridEdgeExposed(
  terrain: GameState["terrain"],
  edge: TerrainEdge,
  orientation: "horizontal" | "vertical",
  direction: -1 | 1,
) {
  if (
    (orientation === "horizontal" &&
      (edge.fixed <= BOARD.yMin + 0.001 || edge.fixed >= BOARD.yMax - 0.001)) ||
    (orientation === "vertical" &&
      (edge.fixed <= BOARD.xMin + 0.001 || edge.fixed >= BOARD.xMax - 0.001))
  ) {
    return false;
  }

  const midpoint = (edge.from + edge.to) / 2;
  const probeDistances = [0.03, 0.08, 0.13];

  return !probeDistances.some((distance) => {
    const probe =
      orientation === "horizontal"
        ? { x: midpoint, y: edge.fixed + direction * distance }
        : { x: edge.fixed + direction * distance, y: midpoint };

    return (
      terrain.blocks.some((block) => isPointInsideBlockRect(probe, block)) ||
      terrain.segments.some((segment) => isPointInsideSegmentBodyForRender(probe, segment))
    );
  });
}

function getSortedBlockBoundaries(
  blocks: GameState["terrain"]["blocks"],
  axis: "x" | "y",
) {
  const values = blocks.flatMap((block) =>
    axis === "x" ? [block.x, block.x + block.width] : [block.y, block.y + block.height],
  );

  return [...new Set(values.map((value) => round(value, 3)))].sort((a, b) => a - b);
}

function isPointInsideBlockRect(point: Point, block: GameState["terrain"]["blocks"][number]) {
  return (
    point.x > block.x - 0.001 &&
    point.x < block.x + block.width + 0.001 &&
    point.y > block.y - 0.001 &&
    point.y < block.y + block.height + 0.001
  );
}

function getGridCellKey(xIndex: number, yIndex: number) {
  return `${xIndex},${yIndex}`;
}

function mergeTerrainEdges(edges: TerrainEdge[]) {
  const edgesByLine = new Map<number, TerrainEdge[]>();

  for (const edge of edges) {
    const fixed = round(edge.fixed, 3);
    const from = Math.min(edge.from, edge.to);
    const to = Math.max(edge.from, edge.to);
    const lineEdges = edgesByLine.get(fixed) ?? [];
    lineEdges.push({ fixed, from, to });
    edgesByLine.set(fixed, lineEdges);
  }

  return [...edgesByLine.entries()].flatMap(([fixed, lineEdges]) => {
    const sorted = lineEdges.sort((a, b) => a.from - b.from);
    const merged: TerrainEdge[] = [];

    for (const edge of sorted) {
      const last = merged[merged.length - 1];

      if (last && edge.from <= last.to + 0.001) {
        last.to = Math.max(last.to, edge.to);
      } else {
        merged.push({ fixed, from: edge.from, to: edge.to });
      }
    }

    return merged;
  });
}

function strokeSegmentEdgeIfExposed(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  terrain: GameState["terrain"],
  segment: GameState["terrain"]["segments"][number],
  side: "top" | "bottom",
) {
  const offsetY = side === "top" ? 0 : -0.5;
  const probeOffsetY = side === "top" ? 0.08 : -0.58;

  if (isSegmentEdgeTouchingBlock(terrain, segment, probeOffsetY)) {
    return;
  }

  strokeTerrainEdge(
    ctx,
    toScreen({ x: segment.x1, y: segment.y1 + offsetY }),
    toScreen({ x: segment.x2, y: segment.y2 + offsetY }),
  );
}

function isSegmentEdgeTouchingBlock(
  terrain: GameState["terrain"],
  segment: GameState["terrain"]["segments"][number],
  probeOffsetY: number,
) {
  return [0.25, 0.5, 0.75].some((progress) => {
    const probe = {
      x: segment.x1 + (segment.x2 - segment.x1) * progress,
      y: segment.y1 + (segment.y2 - segment.y1) * progress + probeOffsetY,
    };

    return terrain.blocks.some((block) => isPointInsideBlockRect(probe, block));
  });
}

function strokeTerrainEdge(ctx: CanvasRenderingContext2D, from: ScreenPoint, to: ScreenPoint) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function strokeTerrainCapIfExposed(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  terrain: GameState["terrain"],
  sourceId: string,
  x: number,
  topY: number,
  bottomY: number,
) {
  const isSharedEdge = [
    ...terrain.blocks.map((block) => ({
      id: block.id,
      edges: [
        { x: block.x, topY: block.y + block.height, bottomY: block.y },
        { x: block.x + block.width, topY: block.y + block.height, bottomY: block.y },
      ],
    })),
    ...terrain.segments.map((segment) => ({
      id: segment.id,
      edges: [
        { x: segment.x1, topY: segment.y1, bottomY: segment.y1 - 0.5 },
        { x: segment.x2, topY: segment.y2, bottomY: segment.y2 - 0.5 },
      ],
    })),
  ].some(
    (item) =>
      item.id !== sourceId &&
      item.edges.some(
        (edge) =>
          Math.abs(edge.x - x) < 0.01 &&
          Math.abs(edge.topY - topY) < 0.01 &&
          Math.abs(edge.bottomY - bottomY) < 0.01,
      ),
  );
  const midY = (topY + bottomY) / 2;
  const isCoveredByNeighbor = isTerrainCapCoveredByNeighbor(terrain, sourceId, x, midY);

  if (!isSharedEdge && !isCoveredByNeighbor) {
    strokeTerrainEdge(ctx, toScreen({ x, y: topY }), toScreen({ x, y: bottomY }));
  }
}

function isTerrainCapCoveredByNeighbor(
  terrain: GameState["terrain"],
  sourceId: string,
  x: number,
  y: number,
) {
  const probeDistance = 0.03;
  const left = { x: x - probeDistance, y };
  const right = { x: x + probeDistance, y };

  return (
    isPointInsideRenderedTerrain(left, terrain, sourceId) &&
    isPointInsideRenderedTerrain(right, terrain, sourceId)
  );
}

function isPointInsideRenderedTerrain(
  point: Point,
  terrain: GameState["terrain"],
  ignoredId: string,
) {
  return (
    terrain.blocks.some((block) => {
      if (block.id === ignoredId) {
        return false;
      }

      return (
        point.x >= block.x - 0.01 &&
        point.x <= block.x + block.width + 0.01 &&
        point.y >= block.y - 0.01 &&
        point.y <= block.y + block.height + 0.01
      );
    }) ||
    terrain.segments.some((segment) => {
      if (segment.id === ignoredId) {
        return false;
      }

      const minX = Math.min(segment.x1, segment.x2);
      const maxX = Math.max(segment.x1, segment.x2);

      if (point.x < minX - 0.01 || point.x > maxX + 0.01) {
        return false;
      }

      const progress =
        Math.abs(segment.x2 - segment.x1) < 0.01 ? 0 : (point.x - segment.x1) / (segment.x2 - segment.x1);
      const topY = segment.y1 + (segment.y2 - segment.y1) * progress;

      return point.y <= topY + 0.01 && point.y >= topY - 0.51;
    })
  );
}

function isPointInsideAnyRenderedTerrain(point: Point, terrain: GameState["terrain"]) {
  if (isPointInsideAnyRenderedHole(point, terrain)) {
    return false;
  }

  return (
    terrain.blocks.some(
      (block) =>
        point.x >= block.x - 0.01 &&
        point.x <= block.x + block.width + 0.01 &&
        point.y >= block.y - 0.01 &&
        point.y <= block.y + block.height + 0.01,
    ) ||
    terrain.segments.some((segment) => {
      const minX = Math.min(segment.x1, segment.x2);
      const maxX = Math.max(segment.x1, segment.x2);

      if (point.x < minX - 0.01 || point.x > maxX + 0.01) {
        return false;
      }

      const progress =
        Math.abs(segment.x2 - segment.x1) < 0.01 ? 0 : (point.x - segment.x1) / (segment.x2 - segment.x1);
      const topY = segment.y1 + (segment.y2 - segment.y1) * progress;

      return point.y <= topY + 0.01 && point.y >= topY - 0.51;
    })
  );
}

function isPointInsideAnyRenderedHole(point: Point, terrain: GameState["terrain"]) {
  return terrain.holes.some((hole) => Math.hypot(point.x - hole.x, point.y - hole.y) <= hole.radius + 0.01);
}

function isPointInsideSegmentBodyForRender(
  point: Point,
  segment: GameState["terrain"]["segments"][number],
) {
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);

  if (point.x < minX - 0.01 || point.x > maxX + 0.01) {
    return false;
  }

  const progress =
    Math.abs(segment.x2 - segment.x1) < 0.01 ? 0 : (point.x - segment.x1) / (segment.x2 - segment.x1);
  const topY = segment.y1 + (segment.y2 - segment.y1) * progress;

  return point.y <= topY + 0.01 && point.y >= topY - 0.51;
}

function punchTerrainHoles(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  holes: GameState["terrain"]["holes"],
) {
  if (holes.length === 0) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (const hole of holes) {
    const center = toScreen({ x: hole.x, y: hole.y });
    const radiusX = Math.abs(toScreen({ x: hole.x + hole.radius, y: hole.y }).x - center.x);
    const radiusY = Math.abs(toScreen({ x: hole.x, y: hole.y + hole.radius }).y - center.y);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function strokeTerrainHoleOutlines(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  terrain: GameState["terrain"],
) {
  if (terrain.holes.length === 0) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "#202124";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const hole of terrain.holes) {
    let isDrawing = false;

    for (let step = 0; step <= 96; step += 1) {
      const angle = (Math.PI * 2 * step) / 96;
      const point = {
        x: hole.x + Math.cos(angle) * hole.radius,
        y: hole.y + Math.sin(angle) * hole.radius,
      };
      const outsidePoint = {
        x: hole.x + Math.cos(angle) * (hole.radius + 0.04),
        y: hole.y + Math.sin(angle) * (hole.radius + 0.04),
      };
      const insidePoint = {
        x: hole.x + Math.cos(angle) * (hole.radius - 0.04),
        y: hole.y + Math.sin(angle) * (hole.radius - 0.04),
      };
      const shouldDraw =
        isPointInsideAnyRenderedTerrain(outsidePoint, terrain) &&
        !isPointInsideAnyRenderedTerrain(insidePoint, terrain);
      const screen = toScreen(point);

      if (shouldDraw && !isDrawing) {
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y);
        isDrawing = true;
      } else if (shouldDraw) {
        ctx.lineTo(screen.x, screen.y);
      } else if (isDrawing) {
        ctx.stroke();
        isDrawing = false;
      }
    }

    if (isDrawing) {
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  toScreen: (point: Point) => ScreenPoint,
  shot: ShotResult,
  shooterPosition: Point,
  color: string,
  dashed: boolean,
  progress = 1,
) {
  if (!Number.isFinite(shot.quadratic.a) || shot.validationErrors.length > 0) {
    return;
  }

  const start = shooterPosition.x;
  const end = shot.impactPoint.x;
  const steps = 90;
  const safeProgress = Math.max(0.04, progress);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = dashed ? 2 : 3;
  ctx.setLineDash(dashed ? [8, 6] : []);
  ctx.beginPath();
  let hasOpenPath = false;

  for (let index = 0; index <= steps * safeProgress; index += 1) {
    const t = index / steps;
    const x = start + (end - start) * t;
    const y = getYAtX(shot.quadratic, x);
    if (x < BOARD.xMin || x > BOARD.xMax || y < BOARD.yMin || y > BOARD.yMax) {
      hasOpenPath = false;
      continue;
    }

    const screen = toScreen({ x, y });

    if (!hasOpenPath) {
      ctx.moveTo(screen.x, screen.y);
      hasOpenPath = true;
    } else {
      ctx.lineTo(screen.x, screen.y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function drawTank(
  ctx: CanvasRenderingContext2D,
  rc: ReturnType<typeof rough.canvas>,
  toScreen: (point: Point) => ScreenPoint,
  player: GameState["players"][number],
  isActive: boolean,
  displayHp: number,
  maxHp = STARTING_HP,
) {
  const position = player.tankPosition;
  const id = player.id;
  const screen = toScreen(position);
  const bodyColor = id === "p1" ? "#d94841" : "#2563eb";
  const turretDirection = id === "p1" ? 1 : -1;

  rc.rectangle(screen.x - 22, screen.y - 22, 44, 18, {
    stroke: "#232629",
    strokeWidth: isActive ? 2.6 : 1.8,
    roughness: 1.3,
    fill: bodyColor,
    fillStyle: "solid",
  });
  rc.circle(screen.x - 12, screen.y - 3, 12, {
    stroke: "#232629",
    strokeWidth: 1.5,
    fill: "#fff7df",
    fillStyle: "solid",
  });
  rc.circle(screen.x + 12, screen.y - 3, 12, {
    stroke: "#232629",
    strokeWidth: 1.5,
    fill: "#fff7df",
    fillStyle: "solid",
  });
  rc.line(screen.x, screen.y - 24, screen.x + turretDirection * 34, screen.y - 43, {
    stroke: "#232629",
    strokeWidth: 5,
    roughness: 1,
  });
  ctx.save();
  ctx.fillStyle = "#232629";
  ctx.font = "700 13px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(player.name, screen.x, screen.y - 30);
  ctx.restore();
  drawTankHpBar(ctx, screen, displayHp, maxHp);
  if (isActive) {
    drawTankTurnPointer(ctx, screen);
  }
}

function drawTankHpBar(
  ctx: CanvasRenderingContext2D,
  screen: ScreenPoint,
  displayHp: number,
  maxHp = STARTING_HP,
) {
  const width = 48;
  const height = 7;
  const x = screen.x - width / 2;
  const y = screen.y - 62;
  const hpRatio = Math.max(0, Math.min(1, displayHp / Math.max(1, maxHp)));

  ctx.save();
  ctx.fillStyle = "#fee2e2";
  ctx.strokeStyle = "#202124";
  ctx.lineWidth = 1.5;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = hpRatio > 0.35 ? "#22c55e" : "#ef4444";
  ctx.fillRect(x, y, width * hpRatio, height);
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

function drawTankTurnPointer(ctx: CanvasRenderingContext2D, screen: ScreenPoint) {
  ctx.save();
  ctx.font = "900 22px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#111827";
  ctx.strokeText("▼", screen.x, screen.y - 48);
  ctx.fillText("▼", screen.x, screen.y - 48);
  ctx.restore();
}

function drawVertex(
  ctx: CanvasRenderingContext2D,
  rc: ReturnType<typeof rough.canvas>,
  toScreen: (point: Point) => ScreenPoint,
  vertex: Point,
  activePlayerId: PlayerId,
  mode: GameMode,
) {
  if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) {
    return;
  }

  const screen = toScreen(vertex);
  rc.circle(screen.x, screen.y, 12, {
    stroke: "#b45309",
    fill: "#ffffff",
    fillStyle: "solid",
    strokeWidth: 2,
  });
  const label = mode === "practice" ? "1P 연습 중" : activePlayerId === "p1" ? "1P TURN" : "2P TURN";
  ctx.save();
  ctx.fillStyle = activePlayerId === "p1" ? "#dc2626" : "#2563eb";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.font = "900 16px ui-sans-serif, system-ui";
  ctx.textBaseline = "middle";
  ctx.strokeText(label, screen.x + 12, screen.y - 12);
  ctx.fillText(label, screen.x + 12, screen.y - 12);
  ctx.restore();
}

function drawBlast(
  rc: ReturnType<typeof rough.canvas>,
  toScreen: (point: Point) => ScreenPoint,
  shot: ShotResult,
) {
  const center = toScreen(shot.impactPoint);
  const edge = toScreen({
    x: shot.impactPoint.x + shot.projectile.blastRadius,
    y: shot.impactPoint.y,
  });
  const radius = Math.abs(edge.x - center.x);

  rc.circle(center.x, center.y, radius * 2, {
    stroke: shot.damage > 0 ? "#dc2626" : "#7c7f84",
    strokeWidth: 2,
    roughness: 1.5,
    seed: 10_000 + shot.id,
    fill: "transparent",
    fillStyle: "solid",
  });
}

function drawShell(
  rc: ReturnType<typeof rough.canvas>,
  toScreen: (point: Point) => ScreenPoint,
  shot: ShotResult,
  shooterPosition: Point,
  progress: number,
) {
  if (!Number.isFinite(shot.quadratic.a) || shot.validationErrors.length > 0) {
    return;
  }

  const startX = shooterPosition.x;
  const x = startX + (shot.impactPoint.x - startX) * progress;
  const y = getYAtX(shot.quadratic, x);
  const screen = toScreen({ x, y });

  rc.circle(screen.x, screen.y, 12, {
    stroke: "#111827",
    strokeWidth: 1.6,
    roughness: 1.1,
    fill: "#111827",
    fillStyle: "solid",
  });
}
