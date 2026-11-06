/**
 * MODEL SPECIFICATION: one-dimensional kinematics of a point body.
 *
 * System: a point body on a position axis (x in metres, t in seconds, t ≥ 0). Its motion is a list of
 *   segments; inside one segment the acceleration is constant, so the closed forms hold exactly:
 *     a(t) = a,   v(t) = v_s + a·τ,   x(t) = x_s + v_s·τ + a·τ²/2,   τ = t − t_start.
 *   A segment may start with a velocity jump (`v` given): an idealised instant start, stop or turn-round
 *   (a walker reversing in no time). Position is always continuous; velocity is continuous unless a segment
 *   says otherwise.
 * Dynamics: none. This module describes motion; forces enter in chapter 2.
 * Boundary: the last segment extends forever (give it `dur: Infinity` to say so). Times before 0 are not
 *   part of the model; queries clamp t to ≥ 0. `a` is right-continuous: at a segment boundary it is the
 *   value of the segment that starts there.
 * Ignored: air resistance, finite body size, the time it takes a real body to turn round.
 * Valid when: the real acceleration is nearly constant on each stretch (a braking car, a body in free fall,
 *   a walker with brisk stops).
 * Failure modes: a real turn-round is smooth, so a velocity jump has no real acceleration; a car's braking
 *   a is not constant at the end of the stop; free fall fails at speeds where air drag matters.
 *
 * Everything the live figure `MotionTrack` shows is computed here:
 *   - state (x, v, a) at a time, displacement, path length (turnarounds handled), average velocity, average
 *     speed (path / time), average acceleration;
 *   - the secant slope over [t, t+Δt] (→ v(t) as Δt → 0, with error a·Δt/2 for constant a);
 *   - the signed area under v–t (= displacement) and under a–t (= Δv, when v has no jumps);
 *   - the times at which a given position or velocity is reached, the turnaround times, the fastest instant;
 *   - two-body meeting (any piecewise motions) and the closed form for two uniform motions;
 *   - stopping time and distance, with an optional reaction time;
 *   - builders: uniform, constant acceleration, legs of constant velocity, braking, vertical throw.
 *
 * Free-fall presets import `G` (g = 10 m/s², as the exam instructs) from constants.ts, and use an
 * up-positive axis, so a = −G.
 */

import { G } from './constants';

export interface Segment {
  /** duration [s]; `Infinity` for the final segment that runs forever */
  dur: number;
  /** constant acceleration [m/s²] */
  a: number;
  /** velocity at the start of the segment [m/s]; omitted = continue with the velocity reached so far */
  v?: number;
}

/** A segment placed on the time axis, with the state at its start. */
export interface Knot {
  t0: number;
  /** end time; `Infinity` for the last knot */
  t1: number;
  x: number;
  v: number;
  a: number;
}

export interface Motion {
  x0: number;
  v0: number;
  knots: Knot[];
  /** end of the last finite segment [s]: the figure's natural time window */
  end: number;
}

export interface State {
  x: number;
  v: number;
  a: number;
}

/** A stretch of a motion inside which x is monotone (the velocity does not change sign). */
export interface Piece {
  t0: number;
  t1: number;
  x0: number;
  x1: number;
  v0: number;
  v1: number;
  a: number;
  /** sign of the displacement over the piece: +1, −1 or 0 (at rest) */
  sign: -1 | 0 | 1;
}

const EPS = 1e-9;

/* ---------- construction ---------- */

/** A motion starting at x0 with velocity v0 (unless the first segment gives its own `v`). */
export function makeMotion(x0: number, v0: number, segments: Segment[]): Motion {
  const list = segments.length > 0 ? segments : [{ dur: Infinity, a: 0 }];
  const knots: Knot[] = [];
  let t = 0;
  let x = x0;
  let v = v0;
  let end = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.v !== undefined) v = s.v;
    const last = i === list.length - 1;
    const dur = last ? Infinity : s.dur;
    knots.push({ t0: t, t1: last ? Infinity : t + dur, x, v, a: s.a });
    if (!Number.isFinite(dur)) break;
    x += v * dur + (s.a * dur * dur) / 2;
    v += s.a * dur;
    t += dur;
    end = t;
  }
  // a final segment that is itself finite still extends forever; `end` is where the listed time ends
  if (Number.isFinite(list[list.length - 1].dur)) end = t + list[list.length - 1].dur;
  return { x0, v0, knots, end: Math.max(end, 0) };
}

/** Constant velocity v from x0. */
export const uniform = (x0: number, v: number): Motion => makeMotion(x0, v, [{ dur: Infinity, a: 0 }]);

/** Constant acceleration a from (x0, v0). */
export const constantAcceleration = (x0: number, v0: number, a: number): Motion =>
  makeMotion(x0, v0, [{ dur: Infinity, a }]);

/** Legs of constant velocity (a velocity jump at each leg); `v: 0` is a rest. The last leg runs forever. */
export function legs(x0: number, list: { dur: number; v: number }[]): Motion {
  return makeMotion(
    x0,
    list[0]?.v ?? 0,
    list.map((l, i) => ({ dur: i === list.length - 1 ? Infinity : l.dur, a: 0, v: l.v })),
  );
}

/* ---------- state at a time ---------- */

function knotAt(m: Motion, t: number): Knot {
  const tt = Math.max(0, t);
  for (let i = m.knots.length - 1; i > 0; i--) if (tt >= m.knots[i].t0) return m.knots[i];
  return m.knots[0];
}

export function stateAt(m: Motion, t: number): State {
  const tt = Math.max(0, t);
  const k = knotAt(m, tt);
  const tau = tt - k.t0;
  return { x: k.x + k.v * tau + (k.a * tau * tau) / 2, v: k.v + k.a * tau, a: k.a };
}
export const position = (m: Motion, t: number): number => stateAt(m, t).x;
export const velocity = (m: Motion, t: number): number => stateAt(m, t).v;
export const acceleration = (m: Motion, t: number): number => stateAt(m, t).a;

/* ---------- pieces: monotone stretches inside [ta, tb] ---------- */

/** The motion on [ta, tb] cut into stretches with constant a and no change of direction inside. */
export function pieces(m: Motion, ta: number, tb: number): Piece[] {
  const lo = Math.max(0, Math.min(ta, tb));
  const hi = Math.max(0, Math.max(ta, tb));
  const out: Piece[] = [];
  for (const k of m.knots) {
    const s = Math.max(lo, k.t0);
    const e = Math.min(hi, k.t1);
    if (!(e > s)) continue;
    const tau = s - k.t0;
    const xs = k.x + k.v * tau + (k.a * tau * tau) / 2;
    const vs = k.v + k.a * tau;
    const d = e - s;
    const cuts = [0, d];
    if (k.a !== 0) {
      const tv = -vs / k.a;
      if (tv > EPS * (1 + d) && tv < d - EPS * (1 + d)) cuts.splice(1, 0, tv);
    }
    for (let i = 0; i + 1 < cuts.length; i++) {
      const c0 = cuts[i];
      const c1 = cuts[i + 1];
      const p0 = xs + vs * c0 + (k.a * c0 * c0) / 2;
      const p1 = xs + vs * c1 + (k.a * c1 * c1) / 2;
      const tol = 1e-12 * (1 + Math.abs(p0) + Math.abs(p1));
      const dx = p1 - p0;
      out.push({
        t0: s + c0,
        t1: s + c1,
        x0: p0,
        x1: p1,
        v0: vs + k.a * c0,
        v1: vs + k.a * c1,
        a: k.a,
        sign: Math.abs(dx) <= tol ? 0 : dx > 0 ? 1 : -1,
      });
    }
  }
  return out;
}

/* ---------- displacement, path, averages ---------- */

/** Δx = x(tb) − x(ta), signed. */
export const displacement = (m: Motion, ta: number, tb: number): number => position(m, tb) - position(m, ta);

/** Distance travelled between ta and tb; never negative, counts every leg of a back-and-forth trip. */
export function pathLength(m: Motion, ta: number, tb: number): number {
  return pieces(m, ta, tb).reduce((s, p) => s + Math.abs(p.x1 - p.x0), 0);
}

/** Δx / Δt over [ta, tb] (signed). NaN when tb = ta. */
export const avgVelocity = (m: Motion, ta: number, tb: number): number => displacement(m, ta, tb) / (tb - ta);

/** Path length / time (never negative). NaN when tb = ta. */
export const avgSpeed = (m: Motion, ta: number, tb: number): number => pathLength(m, ta, tb) / Math.abs(tb - ta);

/** Δv / Δt over [ta, tb] (signed). NaN when tb = ta. */
export const avgAcceleration = (m: Motion, ta: number, tb: number): number =>
  (velocity(m, tb) - velocity(m, ta)) / (tb - ta);

/** Slope of the chord of x–t from t to t + dt: the average velocity over that step. */
export const secantSlope = (m: Motion, t: number, dt: number): number => (position(m, t + dt) - position(m, t)) / dt;

/* ---------- areas under the graphs ---------- */

/** Signed area under v–t from ta to tb: positive where v > 0, negative where v < 0. Equals Δx. */
export function areaVT(m: Motion, ta: number, tb: number): number {
  const sgn = tb >= ta ? 1 : -1;
  return sgn * pieces(m, ta, tb).reduce((s, p) => s + ((p.v0 + p.v1) / 2) * (p.t1 - p.t0), 0);
}

/** Signed area under a–t from ta to tb. Equals Δv unless a velocity jump lies inside. */
export function areaAT(m: Motion, ta: number, tb: number): number {
  const sgn = tb >= ta ? 1 : -1;
  return sgn * pieces(m, ta, tb).reduce((s, p) => s + p.a * (p.t1 - p.t0), 0);
}

/** The positive part and the negative part of the area under v–t (their sum is Δx, their absolute sum the path). */
export function areaSplitVT(m: Motion, ta: number, tb: number): { positive: number; negative: number } {
  let positive = 0;
  let negative = 0;
  for (const p of pieces(m, ta, tb)) {
    const a = ((p.v0 + p.v1) / 2) * (p.t1 - p.t0);
    if (a > 0) positive += a;
    else negative += a;
  }
  return tb >= ta ? { positive, negative } : { positive: -negative, negative: -positive };
}

/* ---------- when does something happen ---------- */

function dedupe(ts: number[]): number[] {
  const s = [...ts].sort((p, q) => p - q);
  const out: number[] = [];
  for (const t of s) if (out.length === 0 || t - out[out.length - 1] > 1e-9) out.push(t);
  return out;
}

/** Roots τ in [0, d] of c0 + c1·τ + c2·τ² = 0. */
function rootsIn(c0: number, c1: number, c2: number, d: number): number[] {
  const tol = 1e-9 * (1 + d);
  const keep = (r: number) => (r >= -tol && r <= d + tol ? [Math.min(d, Math.max(0, r))] : []);
  const scale = Math.abs(c0) + Math.abs(c1) * (1 + d) + Math.abs(c2) * (1 + d) ** 2;
  if (Math.abs(c2) <= 1e-14 * (scale || 1)) {
    if (Math.abs(c1) <= 1e-14 * (scale || 1)) return [];
    return keep(-c0 / c1);
  }
  let disc = c1 * c1 - 4 * c2 * c0;
  if (disc < -1e-12 * (c1 * c1 + Math.abs(4 * c2 * c0))) return [];
  if (disc < 0) disc = 0;
  const q = -(c1 + (c1 >= 0 ? 1 : -1) * Math.sqrt(disc)) / 2;
  const r1 = q / c2;
  const r2 = q !== 0 ? c0 / q : r1;
  return [...keep(r1), ...(r2 !== r1 ? keep(r2) : [])];
}

/** The segments clipped to [ta, tb], each with its start state: the unit the root finders work on. */
function clipped(m: Motion, ta: number, tb: number) {
  const lo = Math.max(0, Math.min(ta, tb));
  const hi = Math.max(0, Math.max(ta, tb));
  const out: { s: number; d: number; x: number; v: number; a: number }[] = [];
  for (const k of m.knots) {
    const s = Math.max(lo, k.t0);
    const e = Math.min(hi, k.t1);
    if (!(e >= s) || (e === s && s !== lo && s !== hi)) continue;
    const tau = s - k.t0;
    out.push({ s, d: e - s, x: k.x + k.v * tau + (k.a * tau * tau) / 2, v: k.v + k.a * tau, a: k.a });
  }
  return out;
}

/** Every time in [ta, tb] at which the position equals X (a body at rest on X gives the start of the rest). */
export function timesAtPosition(m: Motion, X: number, ta: number, tb: number): number[] {
  const ts: number[] = [];
  for (const c of clipped(m, ta, tb)) {
    if (c.a === 0 && c.v === 0) {
      if (Math.abs(c.x - X) <= 1e-9 * (1 + Math.abs(X))) ts.push(c.s);
      continue;
    }
    for (const r of rootsIn(c.x - X, c.v, c.a / 2, c.d)) ts.push(c.s + r);
  }
  return dedupe(ts);
}

/** Every time in [ta, tb] at which the velocity equals V (constant velocity equal to V gives the start of that stretch). */
export function timesAtVelocity(m: Motion, V: number, ta: number, tb: number): number[] {
  const ts: number[] = [];
  for (const c of clipped(m, ta, tb)) {
    if (c.a === 0) {
      if (Math.abs(c.v - V) <= 1e-9 * (1 + Math.abs(V))) ts.push(c.s);
      continue;
    }
    const r = (V - c.v) / c.a;
    if (r >= -EPS && r <= c.d + EPS) ts.push(c.s + Math.min(c.d, Math.max(0, r)));
  }
  return dedupe(ts);
}

/**
 * Times at which the body reverses direction inside (ta, tb): the last moment of motion in one direction
 * when the next motion is the other way (so a rest between two opposite legs is reported at its start).
 */
export function turnTimes(m: Motion, ta: number, tb: number): number[] {
  const out: number[] = [];
  let lastSign = 0;
  let lastEnd = 0;
  for (const p of pieces(m, ta, tb)) {
    if (p.sign === 0) continue;
    if (lastSign !== 0 && p.sign !== lastSign) out.push(lastEnd);
    lastSign = p.sign;
    lastEnd = p.t1;
  }
  return out;
}

/** Smallest and largest position on [ta, tb]. */
export function positionRange(m: Motion, ta: number, tb: number): { min: number; max: number } {
  let min = position(m, ta);
  let max = min;
  for (const p of pieces(m, ta, tb)) {
    for (const x of [p.x0, p.x1]) {
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }
  const xb = position(m, tb);
  return { min: Math.min(min, xb), max: Math.max(max, xb) };
}

/** Smallest and largest velocity on [ta, tb]. */
export function velocityRange(m: Motion, ta: number, tb: number): { min: number; max: number } {
  let min = velocity(m, ta);
  let max = min;
  for (const p of pieces(m, ta, tb)) {
    for (const v of [p.v0, p.v1]) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  return { min, max };
}

/** Smallest and largest acceleration on [ta, tb]. */
export function accelerationRange(m: Motion, ta: number, tb: number): { min: number; max: number } {
  const as = pieces(m, ta, tb).map((p) => p.a);
  if (as.length === 0) as.push(acceleration(m, ta));
  return { min: Math.min(...as), max: Math.max(...as) };
}

/** The first instant on [ta, tb] at which the speed |v| is largest, and that speed. */
export function fastestInstant(m: Motion, ta: number, tb: number): { t: number; speed: number } {
  let best = { t: Math.max(0, ta), speed: Math.abs(velocity(m, ta)) };
  for (const p of pieces(m, ta, tb)) {
    for (const [t, v] of [
      [p.t0, p.v0],
      [p.t1, p.v1],
    ] as const) {
      if (Math.abs(v) > best.speed + 1e-12) best = { t, speed: Math.abs(v) };
    }
  }
  return best;
}

/* ---------- two bodies ---------- */

export interface Meeting {
  t: number;
  x: number;
}

/** Closed form for two uniform motions xA = a0 + vA·t, xB = b0 + vB·t. `null` when vA = vB. t may be negative (they met earlier). */
export function meetingUniform(xA: number, vA: number, xB: number, vB: number): Meeting | null {
  if (vA === vB) return null;
  const t = (xB - xA) / (vA - vB);
  return { t, x: xA + vA * t };
}

/** Every instant in [ta, tb] at which two piecewise motions are at the same place (coincident stretches give their start). */
export function meetings(A: Motion, B: Motion, ta: number, tb: number): Meeting[] {
  const lo = Math.max(0, Math.min(ta, tb));
  const hi = Math.max(0, Math.max(ta, tb));
  const cuts = dedupe([lo, hi, ...A.knots.map((k) => k.t0), ...B.knots.map((k) => k.t0)].filter((t) => t >= lo && t <= hi));
  const out: Meeting[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const s = cuts[i];
    const d = cuts[i + 1] - s;
    const mid = s + d / 2;
    const ka = knotAt(A, mid);
    const kb = knotAt(B, mid);
    const ta_ = s - ka.t0;
    const tb_ = s - kb.t0;
    const xa = ka.x + ka.v * ta_ + (ka.a * ta_ * ta_) / 2;
    const xb = kb.x + kb.v * tb_ + (kb.a * tb_ * tb_) / 2;
    const dv = ka.v + ka.a * ta_ - (kb.v + kb.a * tb_);
    const da = ka.a - kb.a;
    if (Math.abs(xa - xb) < 1e-12 && Math.abs(dv) < 1e-12 && Math.abs(da) < 1e-12) {
      out.push({ t: s, x: xa });
      continue;
    }
    for (const r of rootsIn(xa - xb, dv, da / 2, d)) out.push({ t: s + r, x: position(A, s + r) });
  }
  if (cuts.length === 1) {
    const x = position(A, lo);
    if (Math.abs(x - position(B, lo)) < 1e-12) out.push({ t: lo, x });
  }
  const ts = dedupe(out.map((o) => o.t));
  return ts.map((t) => ({ t, x: position(A, t) }));
}

/* ---------- stopping ---------- */

/** Time to stop from speed |v0| with deceleration of magnitude `decel` (Infinity if decel = 0). */
export const stoppingTime = (v0: number, decel: number): number => (decel === 0 ? Infinity : Math.abs(v0) / Math.abs(decel));

/** Distance covered while stopping: reaction distance |v0|·tr plus v0² / (2·decel). */
export function stoppingDistance(v0: number, decel: number, reaction = 0): number {
  if (decel === 0) return Infinity;
  return Math.abs(v0) * reaction + (v0 * v0) / (2 * Math.abs(decel));
}

/** A body braking from (x0, v0) with deceleration of magnitude `decel`; it stays at rest once stopped. */
export function brake(x0: number, v0: number, decel: number): Motion {
  if (decel === 0 || v0 === 0) return uniform(x0, v0);
  const a = -Math.sign(v0) * Math.abs(decel);
  return makeMotion(x0, v0, [
    { dur: stoppingTime(v0, decel), a },
    { dur: Infinity, a: 0, v: 0 },
  ]);
}

/* ---------- vertical motion under gravity (up is positive) ---------- */

/** Highest point of a throw: time v0/g and height y0 + v0²/(2g); a body not moving up peaks at once. */
export function apex(y0: number, v0: number, g = G): { t: number; y: number } {
  if (v0 <= 0) return { t: 0, y: y0 };
  return { t: v0 / g, y: y0 + (v0 * v0) / (2 * g) };
}

/**
 * Free flight from height y0 with velocity v0 (up positive, a = −g) until it reaches `ground`, where it
 * stays at rest. A body already at or below the ground with no upward velocity rests at once.
 */
export function flight(y0: number, v0: number, ground = 0, g = G): Motion {
  if (y0 <= ground && v0 <= 0) return uniform(y0, 0);
  const free = constantAcceleration(y0, v0, -g);
  const hits = timesAtPosition(free, ground, 1e-9, 1e6).filter((t) => t > 1e-9);
  if (hits.length === 0) return free;
  return makeMotion(y0, v0, [
    { dur: hits[hits.length - 1], a: -g },
    { dur: Infinity, a: 0, v: 0 },
  ]);
}
