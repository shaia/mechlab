import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  accelComponents,
  averageAcceleration,
  averageVelocity,
  ellipsePath,
  linePath,
  numericDerivative,
  presetPath,
  projectilePath,
  speed,
  type PlanarPresetId,
} from '~/physics/planar';
import { dot, len, relativeError, sub, type Vec2 } from '~/physics/vec';

const IDS: PlanarPresetId[] = ['straight-speeding-up', 'circle-constant-speed', 'curve-slowing-down', 'throw'];
const sample = (T: number, n = 20) => Array.from({ length: n }, (_, i) => (T * (i + 0.5)) / n);
/** size of the difference of two vectors, relative to the second one */
const vecErr = (a: Vec2, b: Vec2) => len(sub(a, b)) / len(b);

describe('analytic limit: circle at constant speed', () => {
  const R = 3;
  const w = 1.7;
  const p = ellipsePath([1, -2], R, R, 0.4, w, 0, 10);
  it('a is purely radial, of size v²/r, and points at the centre', () => {
    for (const t of sample(10)) {
      const v = p.v(t);
      const a = p.a(t);
      const { aT, aN } = accelComponents(v, a);
      expect(Math.abs(aT) / len(a)).toBeLessThan(1e-12);
      expect(relativeError(Math.abs(aN), speed(v) ** 2 / R)).toBeLessThan(1e-12);
      const toCentre: Vec2 = [1 - p.r(t)[0], -2 - p.r(t)[1]];
      expect(relativeError(dot(a, toCentre) / (len(a) * len(toCentre)), 1)).toBeLessThan(1e-12);
    }
  });
  it('the speed is the same at every instant (conservation of speed on the circle)', () => {
    const s0 = speed(p.v(0));
    for (const t of sample(10)) expect(relativeError(speed(p.v(t)), s0)).toBeLessThan(1e-12);
  });
});

describe('analytic limit: straight line speeding up', () => {
  it('a is purely tangential, equal to the line acceleration, with zero radial part', () => {
    const p = linePath([0, 0], [3, 4], 2, 0.8, 5);
    for (const t of sample(5)) {
      const { aT, aN } = accelComponents(p.v(t), p.a(t));
      expect(relativeError(aT, 0.8)).toBeLessThan(1e-12);
      expect(Math.abs(aN) / 0.8).toBeLessThan(1e-12);
    }
  });
});

describe('analytic limit: projectile', () => {
  const p = projectilePath([0, 0], [4, 8], 1.6);
  it('a is (0, −g) everywhere and the horizontal velocity never changes', () => {
    for (const t of sample(1.6)) {
      expect(p.a(t)).toEqual([0, -G]);
      expect(relativeError(p.v(t)[0], 4)).toBeLessThan(1e-12);
    }
  });
  it('at the top of the flight a is purely radial (zero tangential part) of size g', () => {
    const { aT, aN } = accelComponents(p.v(0.8), p.a(0.8));
    expect(Math.abs(aT) / G).toBeLessThan(1e-12);
    expect(relativeError(Math.abs(aN), G)).toBeLessThan(1e-12);
  });
  it('on the way up the tangential part of a is opposite to v, on the way down along v', () => {
    expect(accelComponents(p.v(0.2), p.a(0.2)).aT).toBeLessThan(0);
    expect(accelComponents(p.v(1.4), p.a(1.4)).aT).toBeGreaterThan(0);
  });
});

describe('analytic limit: slowing down on a curve', () => {
  it('the tangential part of a is negative (opposite v) all along the preset path', () => {
    const p = presetPath('curve-slowing-down');
    for (const t of sample(p.duration)) expect(accelComponents(p.v(t), p.a(t)).aT).toBeLessThan(0);
  });
});

describe('consistency: the analytic v and a are the derivatives of the path', () => {
  for (const id of IDS) {
    it(`${id}: v matches a central difference of r, a matches one of v`, () => {
      const p = presetPath(id);
      for (const t of sample(p.duration, 8)) {
        // a straight path at v = 0 has a zero vector: compare against the scale of the path, not the component
        const scaleV = Math.max(speed(p.v(t)), 1);
        expect(len(sub(numericDerivative(p.r, t, 1e-4), p.v(t))) / scaleV).toBeLessThan(1e-6);
        const scaleA = Math.max(len(p.a(t)), 1);
        expect(len(sub(numericDerivative(p.v, t, 1e-4), p.a(t))) / scaleA).toBeLessThan(1e-6);
      }
    });
  }
});

describe('convergence: finite differences approach the instantaneous quantities as dt → 0', () => {
  const p = presetPath('curve-slowing-down');
  const t = 1.0;
  const errV = (dt: number) => vecErr(averageVelocity(p, t, dt), p.v(t));
  const errA = (dt: number) => vecErr(averageAcceleration(p, t, dt), p.a(t));
  it('the error of the average velocity falls in proportion to dt (first order)', () => {
    expect(errV(0.01)).toBeLessThan(errV(0.02));
    expect(relativeError(errV(0.02) / errV(0.01), 2)).toBeLessThan(0.1);
    expect(errV(1e-4)).toBeLessThan(1e-3);
  });
  it('the error of Δv/Δt falls in proportion to dt too', () => {
    expect(relativeError(errA(0.02) / errA(0.01), 2)).toBeLessThan(0.1);
    expect(errA(1e-4)).toBeLessThan(1e-3);
  });
});

describe('scaling: radial acceleration on a circle goes as v²/r', () => {
  it('doubling the speed at the same radius quadruples |a|', () => {
    const slow = ellipsePath([0, 0], 2, 2, 0, 1, 0, 1);
    const fast = ellipsePath([0, 0], 2, 2, 0, 2, 0, 1);
    expect(relativeError(len(fast.a(0.3)) / len(slow.a(0.3)), 4)).toBeLessThan(1e-12);
  });
  it('doubling the radius at the same speed halves |a|', () => {
    const small = ellipsePath([0, 0], 2, 2, 0, 2, 0, 1); // v = 4
    const big = ellipsePath([0, 0], 4, 4, 0, 1, 0, 1); // v = 4
    expect(relativeError(len(small.a(0.2)) / len(big.a(0.2)), 2)).toBeLessThan(1e-12);
  });
});

describe('analytic limit: a start from rest', () => {
  it('at v = 0 all of a is tangential and positive: the body is about to move along a and speed up', () => {
    const p = presetPath('straight-speeding-up');
    const { aT, aN, tangential } = accelComponents(p.v(0), p.a(0));
    expect(relativeError(aT, len(p.a(0)))).toBeLessThan(1e-12);
    expect(aN).toBe(0);
    // the limit of the direction of v just after t = 0 is the direction of a
    const vSoon = p.v(1e-6);
    expect(relativeError(dot(tangential, vSoon) / (len(tangential) * len(vSoon)), 1)).toBeLessThan(1e-9);
  });
});

describe('the circle preset: speed, radius and |a| are three different numbers', () => {
  it('radius 4 m, speed 2 m/s, |a| = v²/r = 1 m/s², pointing at the centre', () => {
    const p = presetPath('circle-constant-speed');
    for (const t of sample(p.duration, 6)) {
      expect(relativeError(len(p.r(t)), 4)).toBeLessThan(1e-12);
      expect(relativeError(speed(p.v(t)), 2)).toBeLessThan(1e-12);
      expect(relativeError(len(p.a(t)), 1)).toBeLessThan(1e-12);
    }
  });
});
