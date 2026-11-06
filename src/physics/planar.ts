/**
 * MODEL SPECIFICATION: planar motion of a point body along a prescribed path (lesson 1.10).
 *
 * System:    one point body whose position is a known function r(t) = (x(t), y(t)) in metres, t in seconds.
 *            Nothing here says what force makes the body move: this is kinematics only.
 * Dynamics:  none. The velocity v = dr/dt and the acceleration a = dv/dt are the analytic derivatives of the
 *            path, written out by hand for each family of paths (line, ellipse/circle, projectile).
 *            Finite-difference helpers (average velocity over dt, Δv over dt) exist to show that they
 *            converge to v and a as dt → 0.
 * Boundary:  paths are defined for every real t; `duration` is only the stretch a figure plays.
 * Ignored:   air resistance, rotation of the body, the force behind the motion.
 * Valid when: the path is smooth (twice differentiable). The tangential/radial split of a needs a
 *            direction of motion, so it is defined only where the speed is not zero.
 * Failure modes: at v = 0 (a start from rest, the top of a vertical throw, the end of a pendulum swing)
 *            v gives no direction. The body is about to move along a, so the limit of v̂ just after
 *            that instant is â: `accelComponents` then returns all of a as tangential, aT = |a| > 0
 *            (the speed is about to grow) and aN = 0. Finite differences with dt of about 1e-8 or less
 *            lose all digits to rounding; the figure never goes below 0.01 s.
 *
 * Sign convention: the tangential component aT = a·v̂ is positive when the body speeds up and
 * negative when it slows down. The radial (normal) component aN is signed along the left normal of v
 * (v̂ rotated 90° counter-clockwise): positive when a bends the path to the left.
 */

import { G } from './constants';
import { add, dot, len, scale, sub, type Vec2 } from './vec';

export interface PlanarPath {
  /** position [m] */
  r(t: number): Vec2;
  /** velocity [m/s], the exact derivative of r */
  v(t: number): Vec2;
  /** acceleration [m/s²], the exact derivative of v */
  a(t: number): Vec2;
  /** seconds a figure plays before it loops */
  duration: number;
}

/** Straight line from p0 along the unit direction of `dir`, initial speed v0, constant tangential acceleration a. */
export function linePath(p0: Vec2, dir: Vec2, v0: number, a: number, duration: number): PlanarPath {
  const L = len(dir);
  const u: Vec2 = [dir[0] / L, dir[1] / L];
  return {
    r: (t) => add(p0, scale(u, v0 * t + 0.5 * a * t * t)),
    v: (t) => scale(u, v0 + a * t),
    a: () => scale(u, a),
    duration,
  };
}

/**
 * Motion on the ellipse (cx + A cos φ, cy + B sin φ) with the angle φ(t) = φ0 + ω0 t − ½ α t².
 * A = B gives a circle; α = 0 gives constant angular rate (constant speed on a circle).
 */
export function ellipsePath(c: Vec2, A: number, B: number, phi0: number, omega0: number, alpha: number, duration: number): PlanarPath {
  const phi = (t: number) => phi0 + omega0 * t - 0.5 * alpha * t * t;
  const w = (t: number) => omega0 - alpha * t;
  return {
    r: (t) => [c[0] + A * Math.cos(phi(t)), c[1] + B * Math.sin(phi(t))],
    v: (t) => [-A * Math.sin(phi(t)) * w(t), B * Math.cos(phi(t)) * w(t)],
    a: (t) => {
      const p = phi(t);
      const wt = w(t);
      // d/dt of w·(−A sinφ, B cosφ), with dw/dt = −α
      return [-A * Math.cos(p) * wt * wt + A * Math.sin(p) * alpha, -B * Math.sin(p) * wt * wt - B * Math.cos(p) * alpha];
    },
    duration,
  };
}

/** Projectile under constant gravity g (default the formula sheet's G), thrown from p0 with velocity v0. */
export function projectilePath(p0: Vec2, v0: Vec2, duration: number, g: number = G): PlanarPath {
  return {
    r: (t) => [p0[0] + v0[0] * t, p0[1] + v0[1] * t - 0.5 * g * t * t],
    v: (t) => [v0[0], v0[1] - g * t],
    a: () => [0, -g],
    duration,
  };
}

export type PlanarPresetId = 'straight-speeding-up' | 'circle-constant-speed' | 'curve-slowing-down' | 'throw';

/**
 * The four paths of lesson 1.10, in metres and seconds (all fit a 13 m × 9 m window around the origin).
 * The circle has radius 4 m and speed 2 m/s, so |a| = 1 m/s²: three different numbers, so that nobody reads
 * "|a| equals |v|" off the figure (a = v²/r is lesson 2.10's).
 */
export function presetPath(id: PlanarPresetId): PlanarPath {
  switch (id) {
    case 'straight-speeding-up':
      return linePath([-5, -3], [0.8, 0.6], 0, 0.5, 6);
    case 'circle-constant-speed':
      return ellipsePath([0, 0], 4, 4, 0, 0.5, 0, 4 * Math.PI);
    case 'curve-slowing-down':
      return ellipsePath([-2, -1], 4, 4, -0.3, 1, 0.3, 3);
    case 'throw':
      return projectilePath([-5, -3], [4, 8], 1.6);
  }
}

export const speed = (v: Vec2): number => len(v);

/** Average velocity over [t, t+dt]: Δr/Δt. */
export function averageVelocity(path: PlanarPath, t: number, dt: number): Vec2 {
  return scale(sub(path.r(t + dt), path.r(t)), 1 / dt);
}

/** Change of velocity over [t, t+dt]: Δv = v(t+dt) − v(t), the vector subtraction of lesson 1.9. */
export function deltaV(path: PlanarPath, t: number, dt: number): Vec2 {
  return sub(path.v(t + dt), path.v(t));
}

/** Average acceleration over [t, t+dt]: Δv/Δt. */
export function averageAcceleration(path: PlanarPath, t: number, dt: number): Vec2 {
  return scale(deltaV(path, t, dt), 1 / dt);
}

/** Central finite-difference derivative of a vector function of time; used to check the analytic v and a. */
export function numericDerivative(f: (t: number) => Vec2, t: number, h: number): Vec2 {
  return scale(sub(f(t + h), f(t - h)), 1 / (2 * h));
}

export interface AccelSplit {
  /** signed size of the part of a along v: + speeding up, − slowing down [m/s²] */
  aT: number;
  /** signed size of the part of a across v, + toward the left of v [m/s²] */
  aN: number;
  /** the tangential part as a vector (along ±v̂) */
  tangential: Vec2;
  /** the radial (normal) part as a vector, perpendicular to v */
  radial: Vec2;
}

/** Split a into the part along v (changes the speed) and the part across v (changes the direction). */
export function accelComponents(v: Vec2, a: Vec2): AccelSplit {
  const s = len(v);
  // at rest the body is about to move along a: all of a is tangential and speeds it up (MODEL SPECIFICATION)
  if (s === 0) return { aT: len(a), aN: 0, tangential: a, radial: [0, 0] };
  const t: Vec2 = [v[0] / s, v[1] / s];
  const n: Vec2 = [-t[1], t[0]];
  const aT = dot(a, t);
  const aN = dot(a, n);
  return { aT, aN, tangential: scale(t, aT), radial: scale(n, aN) };
}
