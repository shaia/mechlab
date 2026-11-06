/**
 * MotionTrack's state, the derived model (motions, display frame, axis ranges) and the task checks.
 * No DOM, no canvas. The "display frame" is the learner's axis: x_display = s·(x_world − O), where O is
 * the origin they placed and s = ±1 is the positive direction they chose. Velocity and acceleration
 * flip with s; time, path length and the motion itself do not.
 */

import { niceTicks } from '../core/plot';
import {
  acceleration,
  apex,
  areaVT,
  displacement,
  fastestInstant,
  meetings,
  pathLength,
  pieces,
  position,
  positionRange,
  accelerationRange,
  stateAt,
  velocity,
  velocityRange,
  type Motion,
} from '~/physics/kinematics';
import {
  BASE_PARAMS,
  PRESETS,
  type GraphId,
  type Layer,
  type Orientation,
  type Params,
  type Preset,
  type PresetId,
  type SliderId,
  type TaskId,
} from './presets';

export interface State {
  preset: PresetId;
  p: Params;
  /** time cursor [s] */
  t: number;
  playing: boolean;
  layers: Layer[];
  toggles: Layer[];
  graphs: GraphId[];
  sliders: SliderId[];
  /** world position of the origin [m] */
  origin: number;
  /** true = the positive direction is reversed (left on a horizontal track, down on a vertical one) */
  flip: boolean;
  /** time step of the dot trail [s] */
  trail: number;
  orientation: Orientation;
  /** world range [lo, hi] (m) the track and x–t always cover; replaces the preset's `window` when set */
  window?: [number, number];
}

export interface Model {
  def: Preset;
  p: Params;
  T: number;
  A: Motion;
  B?: Motion;
  s: 1 | -1;
  O: number;
  orientation: Orientation;
  /** world range of the track [m] */
  wlo: number;
  whi: number;
  /** axis ranges in the display frame */
  xr: [number, number];
  vr: [number, number];
  ar: [number, number];
}

/** Expand [lo, hi] to round tick values, with a margin. */
export function niceRange(lo: number, hi: number, pad = 0.06): [number, number] {
  if (!(hi > lo)) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  const ticks = niceTicks(lo - span * pad, hi + span * pad, 4);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : span / 4;
  return [Math.floor((lo - span * pad) / step + 1e-9) * step, Math.ceil((hi + span * pad) / step - 1e-9) * step];
}

export function buildModel(st: State): Model {
  const def = PRESETS[st.preset];
  const p = st.p;
  const { A, B } = def.build(p);
  const T = Math.max(1, def.T(p));
  const s = st.flip ? -1 : 1;

  let lo = (st.window ?? def.window)[0];
  let hi = (st.window ?? def.window)[1];
  for (const m of B ? [A, B] : [A]) {
    const r = positionRange(m, 0, T);
    lo = Math.min(lo, r.min);
    hi = Math.max(hi, r.max);
  }
  if (def.ground !== undefined) lo = Math.min(lo, def.ground);
  const [wlo, whi] = niceRange(lo, hi, 0.08);
  const O = Math.max(wlo, Math.min(whi, st.origin));
  const xr: [number, number] = s === 1 ? [wlo - O, whi - O] : [-(whi - O), -(wlo - O)];

  let vlo = 0;
  let vhi = 0;
  let alo = 0;
  let ahi = 0;
  for (const m of B ? [A, B] : [A]) {
    const vr = velocityRange(m, 0, T);
    const ar = accelerationRange(m, 0, T);
    vlo = Math.min(vlo, vr.min * s, vr.max * s);
    vhi = Math.max(vhi, vr.min * s, vr.max * s);
    alo = Math.min(alo, ar.min * s, ar.max * s);
    ahi = Math.max(ahi, ar.min * s, ar.max * s);
  }
  return { def, p, T, A, B, s, O, orientation: st.orientation, wlo, whi, xr, vr: niceRange(vlo, vhi, 0.1), ar: niceRange(alo, ahi, 0.15) };
}

/* ---------- display-frame accessors ---------- */

export const Xd = (m: Model, mo: Motion, t: number) => m.s * (position(mo, t) - m.O);
export const Vd = (m: Model, mo: Motion, t: number) => m.s * velocity(mo, t);
export const Ad = (m: Model, mo: Motion, t: number) => m.s * acceleration(mo, t);

/** the secant window used by the secant layer: [t, t+Δt], or [t−Δt, t] when it would leave the time axis */
export function secantWindow(t: number, dt: number, T: number): [number, number] {
  return t + dt <= T + 1e-9 ? [t, t + dt] : [Math.max(0, t - dt), t];
}

/* ---------- initial state ---------- */

export interface InitProps {
  preset?: PresetId;
  layers?: Layer[];
  toggles?: Layer[];
  graphs?: GraphId[];
  sliders?: SliderId[];
  params?: Partial<Params>;
  t?: number;
  origin?: number;
  flip?: boolean;
  trailStep?: number;
  orientation?: Orientation;
  trackWindow?: [number, number];
}

export function initialState(props: InitProps): State {
  const id = props.preset && props.preset in PRESETS ? props.preset : 'uniform';
  const def = PRESETS[id];
  return {
    preset: id,
    p: { ...BASE_PARAMS, ...def.defaults, ...props.params },
    t: props.t ?? 0,
    playing: false,
    layers: props.layers ?? def.layers,
    toggles: props.toggles ?? def.toggles,
    graphs: props.graphs ?? def.graphs,
    sliders: props.sliders ?? def.sliders,
    origin: props.origin ?? 0,
    flip: props.flip ?? false,
    trail: props.trailStep ?? 1,
    orientation: props.orientation ?? def.orientation,
    window: props.trackWindow,
  };
}

/** The state after switching to another preset: its own defaults, cursor at 0. */
export function presetState(prev: State, id: PresetId): State {
  const def = PRESETS[id];
  return {
    ...prev,
    preset: id,
    p: { ...BASE_PARAMS, ...def.defaults },
    t: 0,
    playing: false,
    layers: def.layers,
    toggles: def.toggles,
    graphs: def.graphs,
    sliders: def.sliders,
    orientation: def.orientation,
  };
}

/* ---------- tasks ---------- */

export interface TaskCtx {
  st: State;
  m: Model;
  init: { origin: number; flip: boolean };
  target?: [number, number];
  line?: number;
}

export interface TaskDef {
  /** the state keys the check reads; it runs only when one of them was changed by the learner */
  needs: string[];
  test: (c: TaskCtx) => boolean;
}

/**
 * Where the body reverses: [t, t] for an instant turn (the times of turnTimes), or the whole rest
 * [t_stop, t_go] when the body stops and then moves off the other way (the reversal spans the rest).
 * A rest between two legs in the SAME direction is not a turn.
 */
export function turnSpans(mo: Motion, ta: number, tb: number): [number, number][] {
  const out: [number, number][] = [];
  let lastSign = 0;
  let lastEnd = 0;
  for (const p of pieces(mo, ta, tb)) {
    if (p.sign === 0) continue;
    if (lastSign !== 0 && p.sign !== lastSign) out.push([lastEnd, p.t0]);
    lastSign = p.sign;
    lastEnd = p.t1;
  }
  return out;
}

const lineOf = (c: TaskCtx) => c.line ?? c.m.def.line ?? 0;

export const TASKS: Record<TaskId, TaskDef> = {
  'move-origin': { needs: ['origin'], test: (c) => c.st.origin !== c.init.origin },
  'flip-axis': { needs: ['flip'], test: (c) => c.st.flip !== c.init.flip },
  'zero-displacement': {
    needs: ['t'],
    test: ({ m, st }) => Math.abs(displacement(m.A, 0, st.t)) < 0.05 && pathLength(m.A, 0, st.t) > 1,
  },
  'find-rest': {
    needs: ['t'],
    test: ({ m, st }) => {
      const s = stateAt(m.A, st.t);
      return st.t > 0.05 && Math.abs(s.v) < 1e-9 && s.a === 0;
    },
  },
  'find-turn': {
    needs: ['t'],
    test: ({ m, st }) => turnSpans(m.A, 0, m.T).some(([a, b]) => st.t >= a - 0.2 && st.t <= b + 0.2),
  },
  'set-velocity': {
    needs: ['p.x0', 'p.v0'],
    test: (c) => {
      const [tt, xx] = c.target ?? [6, 9];
      return Math.abs(Xd(c.m, c.m.A, tt) - xx) < 0.1;
    },
  },
  'negative-velocity': { needs: ['p.v0'], test: ({ m }) => m.s * m.p.v0 < 0 },
  'make-them-meet': {
    needs: ['p.x0', 'p.v0', 'p.x02', 'p.v2'],
    test: ({ m }) => !!m.B && meetings(m.A, m.B, 0.5, m.T).length > 0,
  },
  'shrink-secant': { needs: ['p.dt', 'layers'], test: ({ m, st }) => st.layers.includes('secant') && m.p.dt <= 0.05 },
  'find-fastest': {
    needs: ['t'],
    test: ({ m, st }) => Math.abs(st.t - fastestInstant(m.A, 0, m.T).t) <= 0.3,
  },
  'tangent-flat': { needs: ['t'], test: ({ m, st }) => st.t > 0.05 && Math.abs(velocity(m.A, st.t)) < 0.4 },
  'speed-up-negative': {
    needs: ['p.x0', 'p.v0', 'p.a', 't'],
    test: ({ m, st }) => Vd(m, m.A, st.t) < -0.05 && Ad(m, m.A, st.t) < 0,
  },
  'stop-at-line': {
    needs: ['p.v0', 'p.a'],
    test: (c) => Math.abs(Xd(c.m, c.m.A, 1e4) - lineOf(c)) <= 1,
  },
  'pause-at-top': {
    needs: ['t', 'playing'],
    test: ({ m, st }) => {
      const top = apex(m.p.x0, m.p.v0);
      return !st.playing && top.t > 0 && Math.abs(st.t - top.t) <= 0.12;
    },
  },
  'change-mass': {
    needs: ['p.m', 'p.m2', 't'],
    test: ({ m, st }) => {
      const r = Math.max(m.p.m, m.p.m2) / Math.min(m.p.m, m.p.m2);
      return r >= 5 && st.t >= m.A.end - 1e-6;
    },
  },
  'reach-height': {
    needs: ['p.v0', 'p.x0'],
    test: (c) => Math.abs(c.m.s * (apex(c.m.p.x0, c.m.p.v0).y - c.m.O) - lineOf(c)) <= 0.5,
  },
  'area-equals-dx': {
    needs: ['t', 'p.t1'],
    test: ({ m, st }) =>
      st.layers.includes('area') && m.p.t1 >= 1 && st.t - m.p.t1 >= 1 && Math.abs(areaVT(m.A, m.p.t1, st.t)) >= 3,
  },
  'net-area-zero': {
    needs: ['t', 'p.t1'],
    test: ({ m, st }) =>
      st.layers.includes('area') && Math.abs(areaVT(m.A, m.p.t1, st.t)) < 0.5 && pathLength(m.A, m.p.t1, st.t) >= 2,
  },
};
