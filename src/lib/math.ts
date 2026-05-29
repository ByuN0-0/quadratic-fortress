export type Point = {
  x: number;
  y: number;
};

export type Quadratic = {
  a: number;
  h: number;
  k: number;
};

export type ShotMathResult = {
  quadratic: Quadratic;
  impactPoint: Point;
  distanceToTarget: number;
  damage: number;
  isValidImpact: boolean;
  validationErrors: string[];
};

export const BOARD = {
  xMin: -10,
  xMax: 10,
  yMin: 0,
  yMax: 10,
} as const;

export const BLAST_RADIUS = 2;
export const MAX_DAMAGE = 20;
export const STARTING_HP = 100;
export const COORDINATE_STEP = 0.1;
export const FLOAT_EPSILON = 1e-9;

export function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

export function roundToStep(value: number, places = 1): number {
  return round(value, places);
}

export function formatCoordinate(value: number): string {
  return roundToStep(value).toFixed(1);
}

export function nearlyEqual(a: number, b: number, tolerance = FLOAT_EPSILON): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function validateVertex(vertex: Point, shooter: Point): string[] {
  const errors: string[] = [];

  if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) {
    errors.push("꼭짓점 좌표는 숫자로 입력해야 합니다.");
    return errors;
  }

  if (vertex.x < BOARD.xMin - FLOAT_EPSILON || vertex.x > BOARD.xMax + FLOAT_EPSILON) {
    errors.push(`꼭짓점 x는 ${BOARD.xMin}부터 ${BOARD.xMax} 사이여야 합니다.`);
  }

  if (vertex.y <= BOARD.yMin + FLOAT_EPSILON || vertex.y > BOARD.yMax + FLOAT_EPSILON) {
    errors.push(`꼭짓점 y는 0보다 크고 ${BOARD.yMax} 이하여야 합니다.`);
  }

  if (nearlyEqual(vertex.x, shooter.x)) {
    errors.push("꼭짓점 x가 탱크 x와 같으면 a값을 계산할 수 없습니다.");
  }

  return errors;
}

export function calculateQuadratic(shooter: Point, vertex: Point): Quadratic {
  const a = (shooter.y - vertex.y) / (shooter.x - vertex.x) ** 2;
  return {
    a,
    h: vertex.x,
    k: vertex.y,
  };
}

export function getYAtX(quadratic: Quadratic, x: number): number {
  return quadratic.a * (x - quadratic.h) ** 2 + quadratic.k;
}

export function calculateImpactPoint(shooter: Point, vertex: Point): Point {
  return {
    x: 2 * vertex.x - shooter.x,
    y: 0,
  };
}

export function isImpactInBounds(point: Point): boolean {
  return (
    point.x >= BOARD.xMin - FLOAT_EPSILON &&
    point.x <= BOARD.xMax + FLOAT_EPSILON &&
    nearlyEqual(point.y, 0)
  );
}

export function isImpactInShotDirection(
  shooter: Point,
  target: Point,
  impactPoint: Point,
): boolean {
  if (nearlyEqual(target.x, shooter.x) || nearlyEqual(impactPoint.x, shooter.x)) {
    return false;
  }

  const direction = Math.sign(target.x - shooter.x);
  return direction === 0 ? false : Math.sign(impactPoint.x - shooter.x) === direction;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function calculateDamage(distanceToTarget: number): number {
  if (distanceToTarget >= BLAST_RADIUS) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(MAX_DAMAGE, Math.round(MAX_DAMAGE * (1 - distanceToTarget / BLAST_RADIUS))),
  );
}

export function calculateShotMath(
  shooter: Point,
  target: Point,
  vertex: Point,
): ShotMathResult {
  const validationErrors = validateVertex(vertex, shooter);
  const quadratic = validationErrors.length
    ? { a: Number.NaN, h: vertex.x, k: vertex.y }
    : calculateQuadratic(shooter, vertex);
  const impactPoint = calculateImpactPoint(shooter, vertex);
  const impactIsValid =
    validationErrors.length === 0 &&
    isImpactInBounds(impactPoint) &&
    isImpactInShotDirection(shooter, target, impactPoint);
  const distanceToTarget = distance(impactPoint, target);
  const damage = impactIsValid ? calculateDamage(distanceToTarget) : 0;

  return {
    quadratic,
    impactPoint,
    distanceToTarget,
    damage,
    isValidImpact: impactIsValid,
    validationErrors,
  };
}

export function formatEquation(quadratic: Quadratic): string {
  if (!Number.isFinite(quadratic.a)) {
    return "계산 불가";
  }

  const sign = quadratic.k >= 0 ? "+" : "-";
  return `y = ${round(quadratic.a, 3)}(x - ${formatCoordinate(quadratic.h)})² ${sign} ${formatCoordinate(Math.abs(quadratic.k))}`;
}
