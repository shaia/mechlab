import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { launch, positionAt } from '~/physics/launch';
import { relativeError } from '~/physics/vec';

const rad = (deg: number) => (deg * Math.PI) / 180;
const CASES: [number, number][] = [
  [10, 15],
  [20, 30],
  [20, 45],
  [22, 72],
  [14, 60],
];

describe('analytic limit: a launch over flat ground without air', () => {
  it.each(CASES)('v₀ = %d m/s at %d° lands at v₀²·sin2θ/g, after 2v₀·sinθ/g, rising to v₀²·sin²θ/2g', (v0, deg) => {
    const f = launch(v0, deg);
    expect(relativeError(f.range, (v0 * v0 * Math.sin(2 * rad(deg))) / G)).toBeLessThan(1e-9);
    expect(relativeError(f.time, (2 * v0 * Math.sin(rad(deg))) / G)).toBeLessThan(1e-9);
    expect(relativeError(f.peak, (v0 * Math.sin(rad(deg))) ** 2 / (2 * G))).toBeLessThan(1e-9);
  });

  it('complementary angles (30° and 60°, 24° and 66°) land at the same point', () => {
    expect(relativeError(launch(20, 30).range, launch(20, 60).range)).toBeLessThan(1e-9);
    expect(relativeError(launch(17, 24).range, launch(17, 66).range)).toBeLessThan(1e-9);
  });

  it('45° reaches farther than any other whole-degree angle at the same speed', () => {
    const r45 = launch(20, 45).range;
    for (let d = 10; d <= 80; d++) if (d !== 45) expect(launch(20, d).range).toBeLessThan(r45);
  });

  it('a launch from a height h₀ lands where the quadratic y = h₀ + v₀ sinθ·t − gt²/2 reaches 0', () => {
    const [v0, deg, h0] = [10, 30, 15];
    const vy = v0 * Math.sin(rad(deg));
    const t = (vy + Math.sqrt(vy * vy + 2 * G * h0)) / G;
    const f = launch(v0, deg, { h0 });
    expect(relativeError(f.time, t)).toBeLessThan(1e-9);
    expect(relativeError(f.range, v0 * Math.cos(rad(deg)) * t)).toBeLessThan(1e-9);
  });
});

describe('conservation', () => {
  it.each(CASES)('energy: at %d m/s, %d°, the ball lands with the speed it was launched with', (v0, deg) => {
    expect(relativeError(launch(v0, deg).landingSpeed, v0)).toBeLessThan(1e-9);
  });

  it('energy: from a height h₀ the landing speed is √(v₀² + 2gh₀), whatever the angle', () => {
    for (const deg of [-20, 0, 35, 80]) {
      expect(relativeError(launch(10, deg, { h0: 15 }).landingSpeed, Math.sqrt(100 + 2 * G * 15))).toBeLessThan(1e-9);
    }
  });
});

describe('scaling', () => {
  it('doubling the launch speed makes the range four times larger', () => {
    expect(relativeError(launch(20, 45).range, 4 * launch(10, 45).range)).toBeLessThan(1e-9);
    expect(relativeError(launch(21, 35).range, 2.25 * launch(14, 35).range)).toBeLessThan(1e-9);
  });

  it('a weaker gravity stretches the range by the same factor (g/6 → 6 times farther)', () => {
    expect(relativeError(launch(12, 40, { g: G / 6 }).range, 6 * launch(12, 40).range)).toBeLessThan(1e-9);
  });
});

describe('convergence', () => {
  it('the landing point does not depend on the step size (exact under a constant force)', () => {
    const coarse = launch(19, 53, { dt: 0.2 });
    const fine = launch(19, 53, { dt: 0.001 });
    expect(relativeError(coarse.range, fine.range)).toBeLessThan(1e-9);
    expect(relativeError(coarse.peak, fine.peak)).toBeLessThan(1e-9);
  });

  it('the interpolated position converges to the exact one as the stored step shrinks', () => {
    const exact = (t: number) => [20 * Math.cos(rad(40)) * t, 20 * Math.sin(rad(40)) * t - (G * t * t) / 2];
    // the worst error over the flight: at one instant it depends on where the instant falls inside a step
    const err = (dt: number) => {
      const f = launch(20, 40, { dt });
      let worst = 0;
      for (let t = 0; t < f.time; t += 0.0037) {
        const [x, y] = positionAt(f, t);
        const [ex, ey] = exact(t);
        worst = Math.max(worst, Math.hypot(x - ex, y - ey));
      }
      return worst;
    };
    // linear interpolation between stored points: the worst error, g·dt²/8, falls fourfold as dt halves
    expect(relativeError(err(0.04) / err(0.02), 4)).toBeLessThan(0.1);
    expect(err(0.01)).toBeLessThan(1e-3);
  });
});
