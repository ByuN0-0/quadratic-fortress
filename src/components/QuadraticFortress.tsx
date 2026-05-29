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
  createInitialGameState,
  createPreviewShot,
  canMoveActivePlayer,
  getActivePlayer,
  getRemainingMove,
  getTargetPlayer,
  moveActivePlayer,
  submitShot,
  MAX_TURN_MOVE,
  MOVE_STEP,
  type MoveDirection,
  type GameState,
  type ShotInput,
  type ShotResult,
} from "../lib/game";
import {
  BLAST_RADIUS,
  BOARD,
  COORDINATE_STEP,
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
const DEFAULT_INPUT: ShotInput = { vertexX: 0, vertexY: 6 };

type ScreenPoint = {
  x: number;
  y: number;
};

export default function QuadraticFortress() {
  const [game, setGame] = useState<GameState>(() => createInitialGameState());
  const [input, setInput] = useState<ShotInput>(DEFAULT_INPUT);
  const [tutorial, setTutorial] = useState<TutorialState>(() => createInitialTutorialState(true));
  const [animationProgress, setAnimationProgress] = useState(1);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTrajectoryPreviewOn, setIsTrajectoryPreviewOn] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const activePlayer = getActivePlayer(game);
  const targetPlayer = getTargetPlayer(game);
  const previewShot = useMemo(() => createPreviewShot(game, input), [game, input]);
  const visibleShot = game.lastShot ?? previewShot;

  useEffect(() => {
    const completed =
      typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "true";
    setTutorial(createInitialTutorialState(completed));
  }, []);

  useEffect(() => {
    if (!game.lastShot || game.lastShot.validationErrors.length > 0) {
      setAnimationProgress(1);
      return;
    }

    const startedAt = performance.now();
    const duration = 1100;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setAnimationProgress(progress);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    setAnimationProgress(0);
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [game.lastShot?.id]);

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
        game,
        previewShot,
        visibleShot,
        animationProgress,
        Boolean(game.lastShot),
        isTrajectoryPreviewOn,
      );
    };

    draw();

    const observer = new ResizeObserver(draw);
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }

    return () => observer.disconnect();
  }, [game, previewShot, visibleShot, animationProgress, isTrajectoryPreviewOn]);

  const fire = () => {
    setGame((current) => submitShot(current, input));
    setIsResultOpen(false);
  };

  const moveTank = (direction: MoveDirection) => {
    setGame((current) => moveActivePlayer(current, direction));
    setIsResultOpen(false);
  };

  const reset = () => {
    setGame(createInitialGameState());
    setInput(DEFAULT_INPUT);
    setAnimationProgress(1);
    setIsResultOpen(false);
    setIsHistoryOpen(false);
    setIsTrajectoryPreviewOn(false);
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

  return (
    <main className="game-shell">
      <section className="arena-layout" aria-label="게임 화면">
        <GameHud
          activePlayerId={game.activePlayerId}
          onReset={reset}
          onTutorial={() => setTutorial((current) => openTutorial(current))}
          players={game.players}
          winnerId={game.winnerId}
        />

        <section className="board-panel arena-board" aria-label="좌표평면 게임판">
          <canvas ref={canvasRef} aria-label="포물선 전장" role="img" />
          <div className="canvas-caption">
            <span>
              {activePlayer.name}: {formatPoint(activePlayer.tankPosition)}
            </span>
            <span>
              목표 {targetPlayer.name}: {formatPoint(targetPlayer.tankPosition)}
            </span>
          </div>
        </section>

        <AimControls
          game={game}
          input={input}
          onFire={fire}
          onHistory={() => setIsHistoryOpen(true)}
          onInputChange={setInput}
          onMove={moveTank}
          onResult={() => setIsResultOpen(true)}
          onTrajectoryPreviewChange={setIsTrajectoryPreviewOn}
          previewShot={previewShot}
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
  onReset,
  onTutorial,
  players,
  winnerId,
}: {
  activePlayerId: string;
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
      </div>
      <div className="versus-hud">
        {players.map((player) => (
          <div
            className={`hud-player ${player.id === activePlayerId ? "is-active" : ""}`}
            key={player.id}
          >
            <div className="hud-player-row">
              <strong>{player.name}</strong>
              <span>{player.hp} HP</span>
            </div>
            <div className="hp-track" aria-label={`${player.name} 체력 ${player.hp}`}>
              <span style={{ width: `${(player.hp / STARTING_HP) * 100}%` }} />
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

function AimControls({
  game,
  input,
  onFire,
  onHistory,
  onInputChange,
  onMove,
  onResult,
  onTrajectoryPreviewChange,
  previewShot,
  showTrajectoryPreview,
}: {
  game: GameState;
  input: ShotInput;
  onFire: () => void;
  onHistory: () => void;
  onInputChange: (input: ShotInput | ((current: ShotInput) => ShotInput)) => void;
  onMove: (direction: MoveDirection) => void;
  onResult: () => void;
  onTrajectoryPreviewChange: (show: boolean) => void;
  previewShot: ShotResult;
  showTrajectoryPreview: boolean;
}) {
  const activePlayer = getActivePlayer(game);
  const canShowResult = Boolean(game.lastShot);
  const remainingMove = getRemainingMove(game);
  const moveStatus = getMoveStatus(game, remainingMove);

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
        <button className="fire-button" type="submit" disabled={Boolean(game.winnerId)}>
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
            disabled={!canMoveActivePlayer(game, -1)}
            onClick={() => onMove(-1)}
          >
            <ArrowLeft size={20} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="오른쪽으로 이동"
            aria-label="오른쪽으로 이동"
            disabled={!canMoveActivePlayer(game, 1)}
            onClick={() => onMove(1)}
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
      <ShotToast result={game.lastShot} vertex={previewShot.vertex} />
      <div className="quick-actions">
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

function getMoveStatus(game: GameState, remainingMove: number): string {
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
    lines: ["반지름 2 안에 목표 중심이 들어오면 피해가 생깁니다.", "damage = round(20 × (1 - 0 / 2)) = 20입니다."],
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
  animationProgress: number,
  hasFiredShot: boolean,
  showTrajectoryPreview: boolean,
) {
  const rc = rough.canvas(ctx.canvas);
  const margin = {
    left: 48,
    right: 28,
    top: 24,
    bottom: 46,
  };

  const toScreen = (point: Point): ScreenPoint => ({
    x:
      margin.left +
      ((point.x - BOARD.xMin) / (BOARD.xMax - BOARD.xMin)) *
        (width - margin.left - margin.right),
    y:
      height -
      margin.bottom -
      ((point.y - BOARD.yMin) / (BOARD.yMax - BOARD.yMin)) *
        (height - margin.top - margin.bottom),
  });

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, rc, width, height, margin, toScreen);
  const shotShooterPosition =
    game.players.find((player) => player.id === visibleShot.shooterId)?.tankPosition ??
    getActivePlayer(game).tankPosition;
  const previewShooterPosition = getActivePlayer(game).tankPosition;

  if (hasFiredShot && visibleShot.isValidImpact) {
    drawTrajectory(
      ctx,
      toScreen,
      visibleShot,
      shotShooterPosition,
      "#2f855a",
      false,
      animationProgress,
    );
    drawBlast(rc, toScreen, visibleShot);
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
  }

  for (const player of game.players) {
    drawTank(ctx, rc, toScreen, player.tankPosition, player.id === game.activePlayerId, player.id);
  }

  drawVertex(ctx, rc, toScreen, previewShot.vertex);
  if (hasFiredShot) {
    drawShell(rc, toScreen, visibleShot, shotShooterPosition, animationProgress);
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  rc: ReturnType<typeof rough.canvas>,
  width: number,
  height: number,
  margin: { left: number; right: number; top: number; bottom: number },
  toScreen: (point: Point) => ScreenPoint,
) {
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillStyle = "#687076";

  for (let x = BOARD.xMin; x <= BOARD.xMax; x += 1) {
    const from = toScreen({ x, y: BOARD.yMin });
    const to = toScreen({ x, y: BOARD.yMax });
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    if (x % 2 === 0) {
      ctx.fillText(String(x), from.x - 7, height - 20);
    }
  }

  for (let y = BOARD.yMin; y <= BOARD.yMax; y += 1) {
    const from = toScreen({ x: BOARD.xMin, y });
    const to = toScreen({ x: BOARD.xMax, y });
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    if (y % 2 === 0) {
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

  rc.rectangle(margin.left, margin.top, width - margin.left - margin.right, height - margin.top - margin.bottom, {
    stroke: "#2f3437",
    strokeWidth: 1.4,
    roughness: 1.2,
    fill: "transparent",
  });
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

  for (let index = 0; index <= steps * safeProgress; index += 1) {
    const t = index / steps;
    const x = start + (end - start) * t;
    const y = getYAtX(shot.quadratic, x);
    const screen = toScreen({ x, y });

    if (index === 0) {
      ctx.moveTo(screen.x, screen.y);
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
  position: Point,
  isActive: boolean,
  id: string,
) {
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
  const edge = toScreen({ x: shot.impactPoint.x + BLAST_RADIUS, y: shot.impactPoint.y });
  const radius = Math.abs(edge.x - center.x);

  rc.circle(center.x, center.y, radius * 2, {
    stroke: shot.damage > 0 ? "#dc2626" : "#7c7f84",
    strokeWidth: 2,
    roughness: 1.5,
    fill: shot.damage > 0 ? "rgba(248, 113, 113, 0.18)" : "rgba(156, 163, 175, 0.16)",
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
  if (!shot.isValidImpact || !Number.isFinite(shot.quadratic.a)) {
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
