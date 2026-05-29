import { describe, expect, it } from "vitest";
import {
  BLAST_RADIUS,
  calculateDamage,
  calculateImpactPoint,
  calculateQuadratic,
  calculateShotMath,
  distance,
  validateVertex,
} from "./math";

describe("quadratic math", () => {
  it("calculates a quadratic through the shooter and selected vertex", () => {
    const quadratic = calculateQuadratic({ x: -8, y: 0 }, { x: 0, y: 6 });

    expect(quadratic.a).toBeCloseTo(-0.09375);
    expect(quadratic.h).toBe(0);
    expect(quadratic.k).toBe(6);
  });

  it("calculates decimal-coordinate shots", () => {
    const quadratic = calculateQuadratic({ x: -7.9, y: 0 }, { x: 0.1, y: 6.4 });
    const impactPoint = calculateImpactPoint({ x: -7.9, y: 0 }, { x: 0.1, y: 6.4 });

    expect(quadratic.a).toBeCloseTo(-0.1);
    expect(quadratic.h).toBe(0.1);
    expect(quadratic.k).toBe(6.4);
    expect(impactPoint).toEqual({ x: 8.1, y: 0 });
  });

  it("rejects impossible or out-of-range vertices", () => {
    expect(validateVertex({ x: -8, y: 6 }, { x: -8, y: 0 })).toContain(
      "꼭짓점 x가 탱크 x와 같으면 a값을 계산할 수 없습니다.",
    );
    expect(validateVertex({ x: 11, y: 6 }, { x: -8, y: 0 })).toContain(
      "꼭짓점 x는 -10부터 10 사이여야 합니다.",
    );
    expect(validateVertex({ x: 0, y: 0 }, { x: -8, y: 0 })).toContain(
      "꼭짓점 y는 0보다 크고 10 이하여야 합니다.",
    );
  });

  it("rejects decimal vertices with the same x as the shooter", () => {
    expect(validateVertex({ x: -7.9, y: 6 }, { x: -7.9, y: 0 })).toContain(
      "꼭짓점 x가 탱크 x와 같으면 a값을 계산할 수 없습니다.",
    );
  });

  it("uses the second ground intersection as the impact point", () => {
    expect(calculateImpactPoint({ x: -8, y: 0 }, { x: 0, y: 6 })).toEqual({
      x: 8,
      y: 0,
    });
  });

  it("calculates Euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 1, y: Math.sqrt(3) })).toBeCloseTo(
      BLAST_RADIUS,
    );
  });

  it("calculates linear radial damage and clamps it", () => {
    expect(calculateDamage(0)).toBe(20);
    expect(calculateDamage(1)).toBe(10);
    expect(calculateDamage(2)).toBe(0);
    expect(calculateDamage(3)).toBe(0);
  });

  it("calculates a direct hit from p1 to p2", () => {
    const result = calculateShotMath(
      { x: -8, y: 0 },
      { x: 8, y: 0 },
      { x: 0, y: 6 },
    );

    expect(result.isValidImpact).toBe(true);
    expect(result.damage).toBe(20);
    expect(result.distanceToTarget).toBe(0);
  });
});
