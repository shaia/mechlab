/**
 * The vector algebra lesson 1.9 and its figure (VectorLab) rest on: sum and difference by components,
 * magnitude, multiplication by a number, and components rebuilt from a magnitude and an acute angle.
 */
import { describe, expect, it } from 'vitest';
import { cosDeg, sinDeg, angleFromLegs } from '~/physics/toolbox';
import { add, dot, len, relativeError, scale, sub, type Vec2 } from '~/physics/vec';

const close = (a: number, b: number) => expect(relativeError(a, b)).toBeLessThan(1e-12);

describe('analytic limits', () => {
  it('3 m east plus 4 m north is a 5 m displacement, not 7 m', () => {
    close(len(add([3, 0], [0, 4])), 5);
  });

  it('two equal-length perpendicular vectors differ by √2 times their length, not by zero', () => {
    close(len(sub([3, 0], [0, 3])), 3 * Math.SQRT2);
  });

  it('the rain seen from the car: (0, −4) − (3, 0) = (−3, −4) m/s, 5 m/s', () => {
    const v = sub([0, -4], [3, 0]);
    expect(v).toEqual([-3, -4]);
    close(len(v), 5);
  });

  it('the magnitude of the sum lies between |A| − |B| and |A| + |B|, with the ends at 0° and 180°', () => {
    const a: Vec2 = [3, 0];
    for (let deg = 0; deg <= 180; deg += 15) {
      const b: Vec2 = [4 * cosDeg(deg), 4 * sinDeg(deg)];
      const s = len(add(a, b));
      expect(s).toBeLessThanOrEqual(7 + 1e-12);
      expect(s).toBeGreaterThanOrEqual(1 - 1e-12);
    }
    close(len(add(a, [4, 0])), 7);
    close(len(add(a, [-4, 0])), 1);
  });
});

describe('conservation (identities that hold for every vector)', () => {
  const cases: [Vec2, Vec2][] = [
    [[3, 1], [1, 2]],
    [[-2, 3], [4, -1]],
    [[0, -4], [3, 0]],
  ];

  it('addition is commutative: A + B = B + A', () => {
    for (const [a, b] of cases) expect(add(a, b)).toEqual(add(b, a));
  });

  it('subtraction is adding the opposite: A − B = A + (−B), and B − A = −(A − B)', () => {
    for (const [a, b] of cases) {
      expect(sub(a, b)).toEqual(add(a, scale(b, -1)));
      expect(sub(b, a)).toEqual(scale(sub(a, b), -1));
    }
  });

  it('no component is longer than the vector, and the components never add up to the magnitude when both are non-zero', () => {
    for (const [a] of cases) {
      expect(Math.abs(a[0])).toBeLessThanOrEqual(len(a));
      expect(Math.abs(a[1])).toBeLessThanOrEqual(len(a));
      if (a[0] !== 0 && a[1] !== 0) expect(Math.abs(Math.abs(a[0]) + Math.abs(a[1]) - len(a))).toBeGreaterThan(0.1);
    }
  });

  it('components rebuilt from the magnitude and the acute angle, with the signs from the drawing, give the vector back', () => {
    for (const v of [[3, 4], [-2, 3], [-3, -4], [6, -8]] as Vec2[]) {
      const th = angleFromLegs(Math.abs(v[1]), Math.abs(v[0]));
      expect(th).toBeGreaterThanOrEqual(0);
      expect(th).toBeLessThanOrEqual(90);
      close(Math.sign(v[0]) * len(v) * cosDeg(th), v[0]);
      close(Math.sign(v[1]) * len(v) * sinDeg(th), v[1]);
    }
  });

  it('perpendicular vectors have a zero dot product (the figure uses it for the perpendicular task)', () => {
    expect(dot([3, 0], [0, 4])).toBe(0);
    expect(dot([2, 1], [-1, 2])).toBe(0);
  });
});

describe('scaling', () => {
  it('|kA| = |k|·|A|, and a negative k reverses the direction', () => {
    const a: Vec2 = [2, 1];
    for (const k of [-3, -2, -1, -0.5, 0.5, 1, 2, 3]) {
      close(len(scale(a, k)), Math.abs(k) * len(a));
      expect(Math.sign(dot(scale(a, k), a))).toBe(Math.sign(k));
    }
  });

  it('doubling both velocities doubles their difference (workbook 1.9-10)', () => {
    const d = sub([0, 9], [12, 0]);
    expect(sub(scale([0, 9], 2), scale([12, 0], 2))).toEqual(scale(d, 2));
    close(len(d), 15);
  });
});
