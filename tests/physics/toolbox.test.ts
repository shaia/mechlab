import { describe, expect, it } from 'vitest';
import {
  angleFromLegs,
  cosDeg,
  drawnAngleDeg,
  hypotenuse,
  legs,
  lineThrough,
  otherLeg,
  powerScale,
  sinDeg,
  tanDeg,
} from '~/physics/toolbox';
import { relativeError } from '~/physics/vec';

const close = (a: number, b: number) => expect(relativeError(a, b)).toBeLessThan(1e-12);

describe('analytic limits', () => {
  it('the line through (0 s, 4 m) and (5 s, 14 m) has slope 2 m/s and intercept 4 m', () => {
    const { slope, intercept } = lineThrough([0, 4], [5, 14]);
    close(slope, 2);
    close(intercept, 4);
  });

  it('a 3-4-5 triangle: hypotenuse 5, and its angles are about 36.87° and 53.13°', () => {
    close(hypotenuse(3, 4), 5);
    close(otherLeg(5, 3), 4);
    close(angleFromLegs(3, 4), (Math.atan(0.75) * 180) / Math.PI);
    expect(angleFromLegs(4, 3)).toBeCloseTo(53.13, 2);
  });

  it('the exact values a learner meets: sin 30° = cos 60° = ½, tan 45° = 1', () => {
    close(sinDeg(30), 0.5);
    close(cosDeg(60), 0.5);
    close(tanDeg(45), 1);
  });

  it('a vertical line has no slope (NaN, never Infinity)', () => {
    expect(lineThrough([3, 1], [3, 7]).slope).toBeNaN();
  });

  it('a 45° line on equal scales has slope 1 when both axes carry the same unit', () => {
    expect(drawnAngleDeg(1, 1, 1)).toBeCloseTo(45, 12);
  });
});

describe('identities (conservation of the triangle)', () => {
  it('sin²θ + cos²θ = 1 for every acute angle', () => {
    for (let d = 1; d < 90; d += 7) close(sinDeg(d) ** 2 + cosDeg(d) ** 2, 1);
  });

  it('the legs from (hypotenuse, angle) satisfy Pythagoras and give the angle back', () => {
    for (const [L, d] of [[2, 10], [7.5, 37], [10, 73]] as const) {
      const { opposite, adjacent } = legs(L, d);
      close(hypotenuse(opposite, adjacent), L);
      close(angleFromLegs(opposite, adjacent), d);
      close(opposite / adjacent, tanDeg(d));
    }
  });

  it('the slope does not depend on which two points of the line are taken', () => {
    const f = (t: number) => 15 * t + 10;
    const a = lineThrough([1, f(1)], [5, f(5)]);
    const b = lineThrough([2, f(2)], [9, f(9)]);
    close(a.slope, b.slope);
    close(a.intercept, b.intercept);
  });
});

describe('scaling', () => {
  it('rescaling an axis changes the drawn angle but never the slope', () => {
    const { slope } = lineThrough([0, 4], [5, 14]);
    const base = drawnAngleDeg(slope, 1, 2);
    const flatter = drawnAngleDeg(slope, 1, 8);
    const steeper = drawnAngleDeg(slope, 2, 2);
    expect(base).toBeCloseTo(45, 12);
    expect(flatter).toBeLessThan(base);
    expect(steeper).toBeGreaterThan(base);
    close(slope, 2);
  });

  it('direct, inverse and square proportion: x doubles, y goes ×2, ×½, ×4', () => {
    close(powerScale(1, 2), 2);
    close(powerScale(-1, 2), 0.5);
    close(powerScale(2, 2), 4);
    close(powerScale(2, 1.5), 2.25);
  });

  it('similar triangles: a longer ramp at the same angle has proportional legs and the same sine', () => {
    const a = legs(4, 25);
    const b = legs(8, 25);
    close(b.opposite / a.opposite, 2);
    close(b.adjacent / a.adjacent, 2);
    close(b.opposite / 8, a.opposite / 4);
  });

  it('the sine does not scale with the angle: sin 60° is not 2·sin 30°', () => {
    expect(relativeError(sinDeg(60), 2 * sinDeg(30))).toBeGreaterThan(0.1);
    expect(sinDeg(60)).toBeCloseTo(0.866, 3);
  });
});
