/**
 * A ball launched over flat ground: the path, where it lands, how long it flies and how high it rises.
 * Built for the launcher of lesson 0.1 (LaunchSandbox); lesson 2.9 derives the same numbers by hand.
 *
 * MODEL SPECIFICATION
 * - System: one point body launched from height h₀ above flat, horizontal ground, with speed v₀ at an
 *   angle θ above the horizontal; world axes x along the ground (toward the target), y up.
 * - Dynamics: Newton's second law under constant gravity alone (`gravity` in motion.ts), integrated
 *   with `rk4Step`. Under a constant force the motion is exactly quadratic in t, so RK4 is exact and
 *   so is the cubic Hermite interpolation used to find the landing and the peak inside a step.
 * - Boundary: the flight ends when the body comes back down to y = 0.
 * - Ignored: air resistance, spin, wind, the body's size, the ground's curvature, the launcher's height
 *   above the ground unless given as h₀.
 * - Valid when: the body is dense and slow enough that air resistance is small against its weight
 *   (a stone, a shot put, a basketball over a few metres), and the flight is short against the
 *   Earth's radius.
 * - Failure modes: a light or fast body (a badminton shuttle, a table-tennis ball, a long kick)
 *   lands well short of this prediction, and its best angle is below 45°; the result is meaningless
 *   for a body launched downward through the ground (h₀ = 0 and θ < 0).
 */

import { G } from './constants';
import { gravity, rk4Step, type Body } from './motion';

export interface Flight {
  /** the path from launch to landing, [x, y] in m; the last point is the landing point */
  path: [number, number][];
  /** the time of each path point [s] */
  times: number[];
  /** horizontal distance from the launch point to the landing point [m] */
  range: number;
  /** time in the air [s] */
  time: number;
  /** highest y reached [m] */
  peak: number;
  /** speed at the landing point [m/s] */
  landingSpeed: number;
}

export interface LaunchOptions {
  /** free-fall acceleration [m/s²]; the formula sheet's G by default */
  g?: number;
  /** launch height above the ground [m] */
  h0?: number;
  /** integration step [s] */
  dt?: number;
}

/** Cubic Hermite interpolation on one step: value at fraction s ∈ [0, 1] from the end values and slopes. */
function hermite(y0: number, d0: number, y1: number, d1: number, h: number, s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * d0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * d1;
}

/** Launch a body with speed v0 [m/s] at angleDeg above the horizontal, and follow it until it lands. */
export function launch(v0: number, angleDeg: number, opts: LaunchOptions = {}): Flight {
  const g = opts.g ?? G;
  const h0 = opts.h0 ?? 0;
  const dt = opts.dt ?? 0.01;
  const th = (angleDeg * Math.PI) / 180;
  const m = 1; // the path does not depend on the mass under gravity alone
  const F = gravity(m, g);
  let b: Body = { pos: [0, h0, 0], vel: [v0 * Math.cos(th), v0 * Math.sin(th), 0], m };
  let t = 0;
  const path: [number, number][] = [[0, h0]];
  const times: number[] = [0];
  let peak = h0;

  for (let i = 0; i < 1e6; i++) {
    const next = rk4Step(b, F, t, dt);
    const [x0, y0] = b.pos;
    const [x1, y1] = next.pos;
    const [vx0, vy0] = b.vel;
    const [vx1, vy1] = next.vel;
    // the top of the path inside this step: vy is linear in t under a constant force
    if (vy0 > 0 && vy1 <= 0) {
      const s = vy0 / (vy0 - vy1);
      peak = Math.max(peak, hermite(y0, vy0, y1, vy1, dt, s));
    }
    if (y1 < 0) {
      // landing inside this step: bisect the interpolated height for y = 0
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 80; k++) {
        const mid = (lo + hi) / 2;
        if (hermite(y0, vy0, y1, vy1, dt, mid) > 0) lo = mid;
        else hi = mid;
      }
      const s = (lo + hi) / 2;
      const xl = hermite(x0, vx0, x1, vx1, dt, s);
      const vxl = vx0 + s * (vx1 - vx0);
      const vyl = vy0 + s * (vy1 - vy0);
      const tl = t + s * dt;
      path.push([xl, 0]);
      times.push(tl);
      return { path, times, range: xl, time: tl, peak, landingSpeed: Math.hypot(vxl, vyl) };
    }
    b = next;
    t += dt;
    path.push([x1, y1]);
    times.push(t);
  }
  throw new Error(`launch(${v0}, ${angleDeg}): the body never came down`);
}

/** Where along the path the body is at time t: interpolated between stored points; the landing point after landing. */
export function positionAt(f: Flight, t: number): [number, number] {
  if (t <= 0) return f.path[0];
  if (t >= f.time) return f.path[f.path.length - 1];
  let lo = 0;
  let hi = f.times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f.times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const s = (t - f.times[lo]) / (f.times[hi] - f.times[lo]);
  const a = f.path[lo];
  const c = f.path[hi];
  return [a[0] + s * (c[0] - a[0]), a[1] + s * (c[1] - a[1])];
}
