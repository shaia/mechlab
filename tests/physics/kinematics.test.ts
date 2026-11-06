import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  acceleration,
  apex,
  areaAT,
  areaSplitVT,
  areaVT,
  avgAcceleration,
  avgSpeed,
  avgVelocity,
  brake,
  constantAcceleration,
  displacement,
  fastestInstant,
  flight,
  legs,
  makeMotion,
  meetings,
  meetingUniform,
  pathLength,
  position,
  positionRange,
  secantSlope,
  stoppingDistance,
  stoppingTime,
  timesAtPosition,
  timesAtVelocity,
  turnTimes,
  uniform,
  velocity,
  type Motion,
} from '~/physics/kinematics';
import { gravity, rk4Step, type Body } from '~/physics/motion';
import { seededRandom } from '~/physics/lab';
import { relativeError } from '~/physics/vec';

/** A motion that reverses, rests, and speeds up: every kind of segment. */
const trip = (): Motion =>
  makeMotion(2, 3, [
    { dur: 2, a: -2 }, // v: 3 → −1, turns at t = 1.5
    { dur: 1.5, a: 0 }, // uniform at −1
    { dur: 2, a: 1.5 }, // v: −1 → 2
    { dur: 1, a: 0, v: 0 }, // instant stop, rest
    { dur: Infinity, a: -3 },
  ]);

describe('analytic limits', () => {
  it('uniform motion is x = x₀ + v·t with a = 0', () => {
    const m = uniform(-4, 2.5);
    for (const t of [0, 1, 3.3, 10]) {
      expect(position(m, t)).toBeCloseTo(-4 + 2.5 * t, 12);
      expect(velocity(m, t)).toBe(2.5);
      expect(acceleration(m, t)).toBe(0);
    }
  });

  it('constant acceleration obeys x = x₀ + v₀t + at²/2 and v² = v₀² + 2a·Δx', () => {
    const m = constantAcceleration(1, 4, -1.5);
    for (const t of [0.5, 2, 6]) {
      expect(relativeError(position(m, t), 1 + 4 * t - 0.75 * t * t)).toBeLessThan(1e-12);
      const dx = displacement(m, 0, t);
      expect(relativeError(velocity(m, t) ** 2, 16 + 2 * -1.5 * dx)).toBeLessThan(1e-12);
    }
  });

  it('a throw up from the ground rises for v₀/g to v₀²/(2g) and lands after 2v₀/g with speed v₀', () => {
    const v0 = 20;
    const m = flight(0, v0, 0);
    const top = apex(0, v0);
    expect(relativeError(top.t, v0 / G)).toBeLessThan(1e-12);
    expect(relativeError(position(m, top.t), v0 ** 2 / (2 * G))).toBeLessThan(1e-12);
    expect(Math.abs(velocity(m, top.t))).toBeLessThan(1e-12);
    expect(acceleration(m, top.t - 1e-3)).toBe(-G);
    const land = timesAtPosition(constantAcceleration(0, v0, -G), 0, 0.1, 100);
    expect(relativeError(land[0], (2 * v0) / G)).toBeLessThan(1e-12);
    expect(relativeError(velocity(constantAcceleration(0, v0, -G), land[0]), -v0)).toBeLessThan(1e-12);
  });

  it('a drop from rest from height h lands after √(2h/g)', () => {
    const h = 20;
    const m = flight(h, 0, 0);
    const tl = turnTimes(m, 0, 10);
    expect(tl).toEqual([]);
    const t = timesAtPosition(constantAcceleration(h, 0, -G), 0, 0, 10)[0];
    expect(relativeError(t, Math.sqrt((2 * h) / G))).toBeLessThan(1e-12);
    expect(position(m, t + 3)).toBe(0);
    expect(velocity(m, t + 3)).toBe(0);
  });

  it('a throw from a building lands below the launch point and later than 2v₀/g', () => {
    const m = flight(15, 10, 0);
    const free = constantAcceleration(15, 10, -G);
    const t = timesAtPosition(free, 0, 0.01, 50);
    expect(t).toHaveLength(1);
    expect(t[0]).toBeGreaterThan((2 * 10) / G);
    expect(relativeError(t[0], (10 + Math.sqrt(100 + 2 * G * 15)) / G)).toBeLessThan(1e-12);
    expect(position(m, t[0] + 1)).toBe(0);
  });

  it('braking from v₀ with magnitude d stops after v₀/d over v₀²/(2d) and stays stopped', () => {
    const m = brake(5, 20, 5);
    expect(stoppingTime(20, 5)).toBe(4);
    expect(stoppingDistance(20, 5)).toBe(40);
    expect(relativeError(position(m, 4), 5 + 40)).toBeLessThan(1e-12);
    expect(position(m, 100)).toBeCloseTo(45, 12);
    expect(velocity(m, 100)).toBe(0);
    expect(timesAtVelocity(m, 0, 0, 10)[0]).toBeCloseTo(4, 12);
  });

  it('braking in the negative direction mirrors braking in the positive one', () => {
    const p = brake(0, 12, 3);
    const n = brake(0, -12, 3);
    for (const t of [0.5, 2, 4, 9]) {
      expect(position(n, t)).toBeCloseTo(-position(p, t), 12);
      expect(acceleration(n, t)).toBeCloseTo(-acceleration(p, t), 12);
    }
  });

  it('a reaction time adds v₀·tr of unbraked distance', () => {
    expect(stoppingDistance(20, 5, 0.5)).toBe(10 + 40);
  });

  it('two uniform motions meet at t = Δx₀ / (vA − vB), and not at all if the velocities are equal', () => {
    const r = meetingUniform(0, 4, 48, -2);
    expect(r).toEqual({ t: 8, x: 32 });
    expect(meetingUniform(0, 3, 10, 3)).toBeNull();
    expect(meetingUniform(0, 1, 10, 3)!.t).toBeLessThan(0);
  });

  it('meetings() on piecewise motions agrees with the closed form for uniform ones', () => {
    const A = uniform(0, 4);
    const B = uniform(48, -2);
    const m = meetings(A, B, 0, 20);
    expect(m).toHaveLength(1);
    expect(relativeError(m[0].t, 8)).toBeLessThan(1e-12);
    expect(relativeError(m[0].x, 32)).toBeLessThan(1e-12);
    expect(meetings(A, uniform(48, 5), 0, 20)).toEqual([]);
  });

  it('meetings() finds two meetings of a decelerating body and a uniform one', () => {
    const A = constantAcceleration(0, 10, -2); // x = 10t − t²
    const B = uniform(0, 4);
    const t = meetings(A, B, 0, 10).map((r) => r.t);
    expect(t).toHaveLength(2);
    expect(t[0]).toBe(0);
    expect(relativeError(t[1], 6)).toBeLessThan(1e-12);
  });

  it('the turnaround of a throw is where v = 0, and a rest between opposite legs counts once', () => {
    expect(turnTimes(flight(0, 20, 0), 0, 10)).toHaveLength(1);
    expect(relativeError(turnTimes(flight(0, 20, 0), 0, 10)[0], 2)).toBeLessThan(1e-12);
    const w = legs(0, [
      { dur: 3, v: 2 },
      { dur: 2, v: 0 },
      { dur: 3, v: -2 },
      { dur: 1, v: 0 },
    ]);
    expect(turnTimes(w, 0, 9)).toEqual([3]);
  });

  it('fastestInstant finds the extreme of |v| on a piecewise motion', () => {
    const m = trip();
    const f = fastestInstant(m, 0, 6.5);
    expect(f.t).toBe(0);
    expect(f.speed).toBe(3);
    const g = fastestInstant(makeMotion(0, 0, [{ dur: 3, a: 2 }, { dur: 3, a: -5 }, { dur: Infinity, a: 0 }]), 0, 8);
    expect(g.t).toBe(6);
    expect(g.speed).toBe(9);
  });

  it('timesAtPosition returns both the way up and the way down', () => {
    const m = constantAcceleration(0, 20, -G);
    const t = timesAtPosition(m, 15, 0, 10);
    expect(t).toHaveLength(2);
    expect(relativeError(t[0], 1)).toBeLessThan(1e-12);
    expect(relativeError(t[1], 3)).toBeLessThan(1e-12);
    expect(timesAtPosition(m, 20, 0, 10)).toHaveLength(1); // tangent: the apex
    expect(timesAtPosition(m, 25, 0, 10)).toEqual([]);
  });
});

describe('consistency (conservation of the bookkeeping)', () => {
  it('the signed area under v–t equals x(t₂) − x(t₁) for random piecewise motions', () => {
    const rnd = seededRandom(7);
    for (let n = 0; n < 40; n++) {
      const segs = Array.from({ length: 5 }, () => ({ dur: 0.5 + 3 * rnd(), a: 6 * rnd() - 3, ...(rnd() < 0.3 ? { v: 8 * rnd() - 4 } : {}) }));
      const m = makeMotion(10 * rnd() - 5, 6 * rnd() - 3, segs);
      const t1 = 4 * rnd();
      const t2 = t1 + 12 * rnd();
      expect(Math.abs(areaVT(m, t1, t2) - displacement(m, t1, t2))).toBeLessThan(1e-9);
    }
  });

  it('the signed area under a–t equals Δv when velocity has no jumps', () => {
    const rnd = seededRandom(11);
    for (let n = 0; n < 40; n++) {
      const m = makeMotion(0, 4 * rnd() - 2, Array.from({ length: 5 }, () => ({ dur: 0.5 + 3 * rnd(), a: 6 * rnd() - 3 })));
      const t1 = 3 * rnd();
      const t2 = t1 + 10 * rnd();
      expect(Math.abs(areaAT(m, t1, t2) - (velocity(m, t2) - velocity(m, t1)))).toBeLessThan(1e-9);
    }
  });

  it('positive area plus negative area is Δx, and their absolute sum is the path length', () => {
    const m = trip();
    const s = areaSplitVT(m, 0, 7);
    expect(Math.abs(s.positive + s.negative - displacement(m, 0, 7))).toBeLessThan(1e-9);
    expect(Math.abs(s.positive - s.negative - pathLength(m, 0, 7))).toBeLessThan(1e-9);
    expect(s.positive).toBeGreaterThan(0);
    expect(s.negative).toBeLessThan(0);
  });

  it('path length is additive over adjacent intervals and at least |Δx|', () => {
    const m = trip();
    for (const [a, b, c] of [
      [0, 1, 4],
      [0.7, 1.5, 6],
      [0, 2.25, 7.1],
    ]) {
      expect(Math.abs(pathLength(m, a, c) - pathLength(m, a, b) - pathLength(m, b, c))).toBeLessThan(1e-9);
      expect(pathLength(m, a, c) + 1e-12).toBeGreaterThanOrEqual(Math.abs(displacement(m, a, c)));
    }
  });

  it('path equals |Δx| when the body never turns, and exceeds it when it does', () => {
    expect(pathLength(uniform(0, 3), 1, 5)).toBeCloseTo(12, 12);
    expect(pathLength(constantAcceleration(0, 10, -2), 0, 5)).toBeCloseTo(25, 12);
    const up = constantAcceleration(0, 10, -2); // top at t = 5, x = 25; back to 0 at t = 10
    expect(displacement(up, 0, 10)).toBeCloseTo(0, 12);
    expect(pathLength(up, 0, 10)).toBeCloseTo(50, 12);
  });

  it('average speed is at least the size of the average velocity, equal without a turn', () => {
    const m = trip();
    expect(avgSpeed(m, 0, 7)).toBeGreaterThan(Math.abs(avgVelocity(m, 0, 7)));
    expect(avgSpeed(uniform(0, -3), 1, 4)).toBeCloseTo(Math.abs(avgVelocity(uniform(0, -3), 1, 4)), 12);
  });

  it('a throw is symmetric about its apex: x(t_top − s) = x(t_top + s)', () => {
    const m = flight(0, 17, -100);
    const tt = apex(0, 17).t;
    for (const s of [0.1, 0.8, 1.6]) expect(relativeError(position(m, tt - s), position(m, tt + s))).toBeLessThan(1e-12);
  });

  it('position is continuous across every segment boundary', () => {
    const m = trip();
    for (const k of m.knots.slice(1)) expect(Math.abs(position(m, k.t0 - 1e-9) - position(m, k.t0))).toBeLessThan(1e-7);
  });

  it('average acceleration over a constant-a stretch is a', () => {
    expect(avgAcceleration(constantAcceleration(0, 2, -1.5), 1, 4)).toBeCloseTo(-1.5, 12);
  });

  it('positionRange covers the apex of a throw', () => {
    const r = positionRange(flight(0, 20, 0), 0, 10);
    expect(relativeError(r.max, 20)).toBeLessThan(1e-12);
    expect(r.min).toBe(0);
  });
});

describe('scaling and symmetry', () => {
  it('doubling the speed quadruples the stopping distance; doubling the braking halves it', () => {
    expect(relativeError(stoppingDistance(40, 5), 4 * stoppingDistance(20, 5))).toBeLessThan(1e-12);
    expect(relativeError(stoppingDistance(20, 10), stoppingDistance(20, 5) / 2)).toBeLessThan(1e-12);
  });

  it('doubling the time interval doubles a uniform displacement and quadruples a from-rest one', () => {
    expect(displacement(uniform(0, 3), 0, 4)).toBeCloseTo(2 * displacement(uniform(0, 3), 0, 2), 12);
    const m = constantAcceleration(0, 0, 2);
    expect(displacement(m, 0, 4)).toBeCloseTo(4 * displacement(m, 0, 2), 12);
  });

  it('moving the origin shifts positions and leaves displacement, velocity and path alone', () => {
    const m = trip();
    const shifted = makeMotion(m.x0 + 7, m.v0, [
      { dur: 2, a: -2 },
      { dur: 1.5, a: 0 },
      { dur: 2, a: 1.5 },
      { dur: 1, a: 0, v: 0 },
      { dur: Infinity, a: -3 },
    ]);
    for (const t of [0.3, 2, 5, 6.2]) {
      expect(position(shifted, t) - position(m, t)).toBeCloseTo(7, 12);
      expect(velocity(shifted, t)).toBe(velocity(m, t));
      expect(displacement(shifted, 0.3, t)).toBeCloseTo(displacement(m, 0.3, t), 12);
      expect(pathLength(shifted, 0.3, t)).toBeCloseTo(pathLength(m, 0.3, t), 12);
    }
  });

  it('reversing the positive direction flips x, v, a and Δx but not the path', () => {
    const m = trip();
    const flipped = makeMotion(-m.x0, -m.v0, [
      { dur: 2, a: 2 },
      { dur: 1.5, a: 0 },
      { dur: 2, a: -1.5 },
      { dur: 1, a: 0, v: 0 },
      { dur: Infinity, a: 3 },
    ]);
    for (const t of [0.4, 2.7, 5.5, 8]) {
      expect(position(flipped, t)).toBeCloseTo(-position(m, t), 12);
      expect(velocity(flipped, t)).toBeCloseTo(-velocity(m, t), 12);
      expect(acceleration(flipped, t)).toBeCloseTo(-acceleration(m, t), 12);
      expect(pathLength(flipped, 0, t)).toBeCloseTo(pathLength(m, 0, t), 12);
    }
  });

  it('free fall is independent of mass: the model has no mass parameter, and a = −g for any body', () => {
    expect(acceleration(flight(20, 0, 0), 0.5)).toBe(-G);
  });
});

describe('convergence', () => {
  it('the secant slope tends to v(t) as Δt → 0, with error a·Δt/2 (first order) for constant a', () => {
    const m = constantAcceleration(1, 3, 2.5);
    const t = 1.7;
    let prev = Infinity;
    for (const dt of [0.4, 0.2, 0.1, 0.05, 0.025]) {
      const err = Math.abs(secantSlope(m, t, dt) - velocity(m, t));
      expect(relativeError(err, (2.5 * dt) / 2)).toBeLessThan(1e-9);
      if (prev !== Infinity) expect(relativeError(err * 2, prev)).toBeLessThan(1e-9);
      prev = err;
    }
  });

  it('the centred secant [t−Δt/2, t+Δt/2] is exact for constant acceleration at any Δt', () => {
    const m = constantAcceleration(1, 3, 2.5);
    expect(relativeError(secantSlope(m, 1.7 - 0.5, 1), velocity(m, 1.7))).toBeLessThan(1e-12);
  });

  it('on a curved x–t made of several segments the secant error still falls linearly in Δt', () => {
    const m = trip();
    const t = 0.7; // inside the first segment
    const e1 = Math.abs(secantSlope(m, t, 0.1) - velocity(m, t));
    const e2 = Math.abs(secantSlope(m, t, 0.05) - velocity(m, t));
    expect(relativeError(e1 / e2, 2)).toBeLessThan(1e-6);
  });

  it('closed-form kinematics agrees with RK4 of src/physics/motion.ts under constant gravity', () => {
    const b0: Body = { pos: [0, 12, 0], vel: [0, 9, 0], m: 0.3 };
    let b = b0;
    const dt = 0.01;
    for (let i = 0; i < 150; i++) b = rk4Step(b, gravity(0.3, G), i * dt, dt);
    const m = constantAcceleration(12, 9, -G);
    expect(relativeError(b.pos[1], position(m, 1.5))).toBeLessThan(1e-12);
    expect(relativeError(b.vel[1], velocity(m, 1.5))).toBeLessThan(1e-12);
  });
});
