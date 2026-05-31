import { useEffect, useMemo, useRef, useState } from "react";
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
  createInitialGameState,
  createPreviewShot,
  canMoveActivePlayer,
  getActivePlayer,
  getRemainingMove,
  getShotProjectile,
  getTargetPlayer,
  moveActivePlayer,
  prepareShot,
  MAX_TURN_MOVE,
  MOVE_STEP,
  type MoveDirection,
  type GameState,
  type GameMode,
  type PlayerId,
  type ShotInput,
  type ShotResult,
} from "../lib/game";
import {
  TERRAIN_MAP_IDS,
  getTerrainMapLabel,
  type TerrainMapId,
} from "../lib/terrain";
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
type ScreenMode = "menu" | "map" | "game";
type DisplayHpByPlayer = Record<PlayerId, number>;
type AimInputByPlayer = Record<PlayerId, ShotInput>;
type Players = GameState["players"];

export default function QuadraticFortress() {
  const [game, setGame] = useState<GameState>(() => createInitialGameState());
  const [aimInputByPlayer, setAimInputByPlayer] = useState<AimInputByPlayer>(() =>
    createInitialAimInputByPlayer(),
  );
  const [tutorial, setTutorial] = useState<TutorialState>(() => createInitialTutorialState(true));
  const [screenMode, setScreenMode] = useState<ScreenMode>("menu");
  const [selectedMode, setSelectedMode] = useState<GameMode>("normal");
  const [animationProgress, setAnimationProgress] = useState(1);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTrajectoryPreviewOn, setIsTrajectoryPreviewOn] = useState(false);
  const [isShotAnimating, setIsShotAnimating] = useState(false);
  const [isFalling, setIsFalling] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [visualPlayers, setVisualPlayers] = useState<Players | null>(null);
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

  const renderGame = useMemo(
    () => (visualPlayers ? { ...game, players: visualPlayers } : game),
    [game, visualPlayers],
  );
  const activePlayer = getActivePlayer(renderGame);
  const targetPlayer = getTargetPlayer(renderGame);
  const activeInput = aimInputByPlayer[game.activePlayerId];
  const previewShot = useMemo(() => createPreviewShot(game, activeInput), [game, activeInput]);
  const visibleShot = game.lastShot ?? previewShot;
  const isInteractionLocked = isShotAnimating || isFalling || isMoving;

  const chooseMode = (mode: GameMode) => {
    setSelectedMode(mode);
    setScreenMode("map");
  };

  const startGame = (mode: GameMode, mapId: TerrainMapId) => {
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

    const nextGame = createInitialGameState(mode, mapId);
    setGame(nextGame);
    setAimInputByPlayer(createInitialAimInputByPlayer());
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
    setScreenMode("game");
  };

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const completed =
      typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "true";
    setTutorial(createInitialTutorialState(completed));
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
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / MOVE_ANIMATION_DURATION);
      const easedProgress = 1 - (1 - progress) ** 2;
      const nextPlayers = endGame.players.map((player) => {
        if (player.id !== playerId) {
          return player;
        }

        return {
          ...player,
          tankPosition: {
            x:
              startPlayer.tankPosition.x +
              (endPlayer.tankPosition.x - startPlayer.tankPosition.x) * easedProgress,
            y:
              startPlayer.tankPosition.y +
              (endPlayer.tankPosition.y - startPlayer.tankPosition.y) * easedProgress,
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
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }
    if (hpFrameRef.current) {
      cancelAnimationFrame(hpFrameRef.current);
    }
    if (fallFrameRef.current) {
      cancelAnimationFrame(fallFrameRef.current);
    }
    if (moveFrameRef.current) {
      cancelAnimationFrame(moveFrameRef.current);
    }

    const nextGame = createInitialGameState(game.mode, game.mapId);
    setGame(nextGame);
    setAimInputByPlayer(createInitialAimInputByPlayer());
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
      window.localStorage.setItem(STORAGE_KEY, "true");
      return next;
    });
  };

  const goNextTutorial = () => {
    setTutorial((current) => {
      const next = nextTutorialStep(current);
      if (!next.isOpen) {
        window.localStorage.setItem(STORAGE_KEY, "true");
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

  if (screenMode === "map") {
    return (
      <main className="game-shell mode-menu-screen">
        <section className="game-topbar" aria-label="맵 선택 화면">
          <div>
            <p className="eyebrow">{getGameModeLabel(selectedMode)}</p>
            <h1>맵 선택</h1>
          </div>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setScreenMode("menu")}
          >
            뒤로
          </button>
        </section>

        <section className="mode-menu-panel" aria-label="맵 선택">
          <div>
            <p className="eyebrow">Map</p>
            <h2>플레이할 맵을 선택하세요</h2>
          </div>
          <div className="mode-choice-grid">
            {TERRAIN_MAP_IDS.map((mapId) => (
              <button
                className="mode-choice-button"
                key={mapId}
                type="button"
                onClick={() => startGame(selectedMode, mapId)}
              >
                <strong>{getTerrainMapLabel(mapId)}</strong>
                <span>선택한 모드로 게임을 시작합니다.</span>
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
          players={game.players}
          winnerId={game.winnerId}
        />

        <section className="board-panel arena-board" aria-label="좌표평면 게임판">
          <canvas ref={canvasRef} aria-label="포물선 전장" role="img" />
          {coordinateDisplayMode === "teacher" ? (
            <div className="canvas-caption">
              <span>
                {activePlayer.name}: {formatPoint(activePlayer.tankPosition)}
              </span>
              <span>
                목표 {targetPlayer.name}: {formatPoint(targetPlayer.tankPosition)}
              </span>
            </div>
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
  players,
  winnerId,
}: {
  activePlayerId: string;
  displayHpByPlayer: DisplayHpByPlayer;
  mapId: TerrainMapId;
  mode: GameMode;
  onReset: () => void;
  onTutorial: () => void;
  players: GameState["players"];
  winnerId: string | null;
}) {
  return (
    <header className="game-hud" aria-label="게임 상태">
      <div className="game-brand">
        <p className="eyebrow">Quadratic Fortress</p>
        <h1>2차함수 포트리스</h1>
        <p className={`mode-label mode-${mode}`}>{getGameModeLabel(mode)} · {getTerrainMapLabel(mapId)}</p>
      </div>
      <div className="versus-hud">
        {players.map((player) => (
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
              <span style={{ width: `${(displayHpByPlayer[player.id] / STARTING_HP) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="turn-badge" aria-live="polite">
        {winnerId ? `${winnerId.toUpperCase()} 승리` : `${activePlayerId.toUpperCase()} 턴`}
      </div>
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
  const moveStatus = getMoveStatus(game, remainingMove, isShotAnimating);

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
          max={BOARD.xMax}
          min={BOARD.xMin}
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
          disabled={Boolean(game.winnerId) || isShotAnimating}
        >
          <Play size={20} />
          발사
        </button>
      </form>
      <div className="move-console" aria-label="탱크 이동">
        <div>
          <p className="eyebrow">Move</p>
          <strong>
            남은 이동 {formatCoordinate(remainingMove)}/{formatCoordinate(MAX_TURN_MOVE)}
          </strong>
          <small>{moveStatus}</small>
        </div>
        <div className="move-buttons">
          <button
            className="icon-button"
            type="button"
            title="왼쪽으로 이동"
            aria-label="왼쪽으로 이동"
            disabled={isShotAnimating || !canMoveActivePlayer(game, -1)}
            onClick={() => onMove(-1)}
          >
            <ArrowLeft size={20} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="오른쪽으로 이동"
            aria-label="오른쪽으로 이동"
            disabled={isShotAnimating || !canMoveActivePlayer(game, 1)}
            onClick={() => onMove(1)}
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
      <ShotToast result={game.lastShot} vertex={previewShot.vertex} />
      <div className="quick-actions">
        <div className="mode-toggle" aria-label="좌표 표시 모드">
          <button
            className={coordinateDisplayMode === "teacher" ? "is-active" : ""}
            type="button"
            aria-pressed={coordinateDisplayMode === "teacher"}
            onClick={() => onCoordinateDisplayModeChange("teacher")}
          >
            교사용
          </button>
          <button
            className={coordinateDisplayMode === "student" ? "is-active" : ""}
            type="button"
            aria-pressed={coordinateDisplayMode === "student"}
            onClick={() => onCoordinateDisplayModeChange("student")}
          >
            학생용
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

function getMoveStatus(game: GameState, remainingMove: number, isShotAnimating: boolean): string {
  if (isShotAnimating) {
    return "처리 중";
  }

  if (game.winnerId) {
    return "게임 종료";
  }

  if (remainingMove <= 0) {
    return "이번 턴 이동 완료";
  }

  const canMoveLeft = canMoveActivePlayer(game, -1);
  const canMoveRight = canMoveActivePlayer(game, 1);

  if (!canMoveLeft && !canMoveRight) {
    return "이동할 공간 없음";
  }

  return `발사 전 좌우 ${formatCoordinate(MOVE_STEP)}칸 이동 가능`;
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

function createInitialAimInputByPlayer(): AimInputByPlayer {
  return {
    p1: { ...DEFAULT_INPUT },
    p2: { ...DEFAULT_INPUT },
  };
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
                    #{shot.id} {shot.shooterId.toUpperCase()} → {shot.targetId.toUpperCase()}
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
          <button
            className="secondary-button replay-button"
            type="button"
            onClick={() => setAnimationKey((current) => current + 1)}
          >
            <RotateCcw size={18} />
            다시 보기
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
    title: "1. 입력값은 최고점",
    formula: "입력: 꼭짓점 (h, k) = (0, 6)",
    lines: ["포탄은 이 점을 가장 높게 지나갑니다.", "그래프에서 max 표시가 포물선의 꼭대기입니다."],
  },
  {
    title: "2. 탱크 좌표로 a값 계산",
    formula: "0 = a(-8 - 0)² + 6 → a = -6 / 64 = -0.094",
    lines: ["현재 탱크 (-8, 0)을 식에 대입합니다.", "그래서 y = -0.094(x - 0)² + 6이 됩니다."],
  },
  {
    title: "3. 지면에 닿는 곳이 착탄점",
    formula: "x착탄 = 2h - xs = 2×0 - (-8) = 8",
    lines: ["포물선이 y=0에 다시 닿으면 폭발합니다.", "이 예시는 상대 탱크 중심 (8, 0)에 정확히 떨어집니다."],
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
          포탄이 탱크에서 출발해 꼭짓점을 지나고, y=0에 다시 닿는 지점에서 폭발합니다.
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
    drawTank(
      ctx,
      rc,
      toScreen,
      player,
      player.id === game.activePlayerId,
      displayHpByPlayer[player.id],
    );
  }

  drawVertex(ctx, rc, toScreen, previewShot.vertex);
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

  for (const block of terrain.blocks) {
    const topLeft = toScreen({ x: block.x, y: block.y + block.height });
    const bottomRight = toScreen({ x: block.x + block.width, y: block.y });
    fillTerrainPolygon(layerCtx, [
      topLeft,
      toScreen({ x: block.x + block.width, y: block.y + block.height }),
      bottomRight,
      toScreen({ x: block.x, y: block.y }),
    ]);
  }

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

  for (const block of terrain.blocks) {
    if (!isHorizontalBlockEdgeShared(terrain, block.id, block.x, block.x + block.width, block.y + block.height)) {
      strokeTerrainEdge(
        ctx,
        toScreen({ x: block.x, y: block.y + block.height }),
        toScreen({ x: block.x + block.width, y: block.y + block.height }),
      );
    }
    if (!isHorizontalBlockEdgeShared(terrain, block.id, block.x, block.x + block.width, block.y)) {
      strokeTerrainEdge(ctx, toScreen({ x: block.x, y: block.y }), toScreen({ x: block.x + block.width, y: block.y }));
    }
    strokeTerrainCapIfExposed(ctx, toScreen, terrain, block.id, block.x, block.y + block.height, block.y);
    strokeTerrainCapIfExposed(
      ctx,
      toScreen,
      terrain,
      block.id,
      block.x + block.width,
      block.y + block.height,
      block.y,
    );
  }

  for (const segment of terrain.segments) {
    strokeTerrainEdge(ctx, toScreen({ x: segment.x1, y: segment.y1 }), toScreen({ x: segment.x2, y: segment.y2 }));
    strokeTerrainEdge(
      ctx,
      toScreen({ x: segment.x1, y: segment.y1 - 0.5 }),
      toScreen({ x: segment.x2, y: segment.y2 - 0.5 }),
    );
    strokeTerrainCapIfExposed(ctx, toScreen, terrain, segment.id, segment.x1, segment.y1, segment.y1 - 0.5);
    strokeTerrainCapIfExposed(ctx, toScreen, terrain, segment.id, segment.x2, segment.y2, segment.y2 - 0.5);
  }

  ctx.restore();
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

function isHorizontalBlockEdgeShared(
  terrain: GameState["terrain"],
  sourceId: string,
  x1: number,
  x2: number,
  y: number,
) {
  return terrain.blocks.some((block) => {
    if (block.id === sourceId) {
      return false;
    }

    const sharesY =
      Math.abs(block.y - y) < 0.01 || Math.abs(block.y + block.height - y) < 0.01;
    const overlap = Math.min(x2, block.x + block.width) - Math.max(x1, block.x);

    return sharesY && overlap > 0.01;
  }) || terrain.segments.some((segment) => {
    const segmentMinX = Math.min(segment.x1, segment.x2);
    const segmentMaxX = Math.max(segment.x1, segment.x2);
    const overlapStart = Math.max(x1, segmentMinX);
    const overlapEnd = Math.min(x2, segmentMaxX);

    if (overlapEnd - overlapStart <= 0.01) {
      return false;
    }

    const midX = (overlapStart + overlapEnd) / 2;
    const progress = Math.abs(segment.x2 - segment.x1) < 0.01 ? 0 : (midX - segment.x1) / (segment.x2 - segment.x1);
    const topY = segment.y1 + (segment.y2 - segment.y1) * progress;
    const bottomY = topY - 0.5;

    return Math.abs(topY - y) < 0.01 || Math.abs(bottomY - y) < 0.01;
  });
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
  ctx.fillStyle = "#232629";
  ctx.font = "700 13px ui-sans-serif, system-ui";
  ctx.fillText(id.toUpperCase(), screen.x - 10, screen.y - 30);
  drawTankHpBar(ctx, screen, displayHp);
}

function drawTankHpBar(ctx: CanvasRenderingContext2D, screen: ScreenPoint, displayHp: number) {
  const width = 48;
  const height = 7;
  const x = screen.x - width / 2;
  const y = screen.y - 62;
  const hpRatio = Math.max(0, Math.min(1, displayHp / STARTING_HP));

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

function drawVertex(
  ctx: CanvasRenderingContext2D,
  rc: ReturnType<typeof rough.canvas>,
  toScreen: (point: Point) => ScreenPoint,
  vertex: Point,
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
  ctx.fillStyle = "#7c2d12";
  ctx.font = "700 12px ui-sans-serif, system-ui";
  ctx.fillText("max", screen.x + 10, screen.y - 10);
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
