/**
 * MotionTrack: the live figure of chapter 1. A point body on a position axis (the track diagram,
 * optionally with a dot trail = תרשים עקבות), synchronised with x–t, v–t and a–t graphs, a time
 * cursor, play / pause, and optional layers: velocity and acceleration arrows, secant and tangent on
 * x–t, shaded signed area on v–t and a–t. Every number comes from ~/physics/kinematics.
 *
 * In a lesson:  <Spread figure={MotionTrack} figureProps={{ id: 'fig-1-5', preset: 'curved-xt', tasks: [...] }}>
 * (import MotionTrack from '~/sims/MotionTrack.astro'). A Step drives it with
 * <Step fig="fig-1-5" state={{ t: 4.8, layers: ['tangent'] }}> (see "Steps" below).
 *
 * Axis, signs: the figure always shows quantities in the LEARNER'S axis: x = s·(x_world − O), v and a
 * times s, where O is the origin (draggable when asked) and s = −1 after "flip". Time, Δt and path
 * length never change with the axis. Positive = along the arrow marked "+x" (or "+y").
 * Velocity and acceleration are signed numbers, with an arrow and a "+"/"−" in the text, never colour only.
 *
 * ======================== Props ========================
 *   id            string   figure id (required); task ids are stored as `${id}:${task}`.
 *   preset        PresetId default 'uniform'. See "Presets".
 *   orientation   'horizontal' | 'vertical'   default: the preset's. Vertical = up is the world's up.
 *   layers        Layer[]  layers switched on at the start (default: the preset's).
 *   toggles       Layer[]  which layer chips the control panel offers (default: the preset's; [] hides them).
 *   graphs        ('x'|'v'|'a')[]   graphs shown, in this order (default: the preset's; [] = track only).
 *   sliders       SliderId[]        sliders shown (default: the preset's; [] = none).
 *   params        Partial<Params>   initial values: x0, v0, a, x02, v2, dt, m, m2, t1 (see "Sliders").
 *   t             number   initial time cursor [s] (default 0).
 *   origin        number   initial world position of the origin O [m] (default 0).
 *   draggableOrigin boolean  the learner may drag the origin on the track (or use the two buttons).
 *   flip          boolean  start with the positive direction reversed.
 *   flipButton    boolean  show the "reverse the positive direction" button.
 *   trailStep     number   time step of the dot trail [s] (default 1).
 *   target        [t, x]   a marked point on x–t (display frame) for the task set-velocity (default [6, 9]).
 *   line          number   display position of the marked line (stop line / target height); default: the preset's.
 *   tasks         TaskId[] tasks listed under the figure (see "Tasks").
 *   trackWindow   [lo, hi] world range (m) the track and x–t always cover, replacing the preset's window (the
 *                 motion itself is always included). Use it when a figure's params make the preset's window
 *                 half empty (1.2: [0, 16] for x = 8t − t²).
 *   readout       ('x'|'v'|'a')[]  which of x, v, a the readout and the spoken description show (default all;
 *                 a lesson before velocity is defined, e.g. 1.2, passes ['x']). Without 'v' the 'counters' layer
 *                 shows only Δx and path length, not the two averages (they are velocities).
 *
 * Layers:  'trail' (dots at equal time steps), 'v-arrow', 'a-arrow' (arrows on the body, to scale, scale bars
 *   in the corner), 'secant' (chord of x–t over [t, t+Δt] with its slope triangle, and a bar at the average
 *   velocity on v–t; falls back to [t−Δt, t] at the end of the time axis), 'tangent' (tangent of x–t at t),
 *   'area' (signed area between t₁ and t shaded on v–t and a–t, --pos for +, --neg for −; sign marks inside), 'counters'
 *   (readout of Δx, path length, average velocity and path/time from 0 to t). The readout always shows t, and x, v, a unless the prop `readout` narrows them.
 *
 * Sliders (SliderId → state): x0 start position · v0 start velocity · a acceleration · x02, v2 second body's
 *   start position and velocity · dt secant step Δt (stops 1 ms … 3 s in a 1-2-5 ladder, growing to the right) · m, m2 masses (only the
 *   size of the ball and the readout, never the motion) · t1 start of the area interval. Each slider has the
 *   range its preset gives it; presets only use the sliders listed for them, but any can be passed in `sliders`.
 *
 * ======================== Presets ========================
 *   walk-back-and-forth  A walker with instant turns (velocity jumps): +2 m/s for 3 s, −3 m/s for 2 s, rest 2 s,
 *       +1 m/s for 2 s, rest. x₀ = 1 m, T = 10 s. Δx = 0 for t in [5, 7] while the path is 12 m. Turns at t = 3
 *       and t = 5 s; rests on [5, 7] and from 9 s. Default graphs: x. Toggles: trail, counters, v-arrow. (1.1, 1.2)
 *   uniform              One body, x = x₀ + v₀t. Sliders x0 (−10…20), v0 (−10…10). T = 10 s. Graphs x, v.
 *       Toggles: trail, v-arrow, secant (the slope triangle shows v = Δx/Δt). (1.3)
 *   two-cars-meet        A: x0, v0 (start 0, +2 m/s); B: x02, v2 (start 40 m, +1 m/s): they do NOT meet within
 *       T = 12 s at the start. Four sliders. A "נפגשים" ring appears when the cursor is on the meeting. (1.3, 1.4)
 *   stop-and-go          Legs +4 m/s 3 s, rest 2 s, +2 m/s 2 s, −3 m/s 4 s, rest: x 0 → 12 → 12 → 16 → 4. T = 12.
 *       Counters on: Δx = 4 m, path 28 m over 0…11 s. Graphs x, v. (1.3 averages, 1.8)
 *   curved-xt            x₀ = 2, v₀ = 1; a = +1.5 for 3 s, −3 for 4 s, +2.5 after. v = 0 (a turn) at t ≈ 4.83 s,
 *       fastest (|v| = 6.5 m/s) at t = 7 s. T = 10. Layers secant + tangent, slider dt (starts at 2 s). Graphs x, v. (1.5)
 *   brake-to-stop        Car, x₀ = 0, v₀ (slider 0…30, default 16), a (slider −10…−1, default −4); stops after
 *       v₀/|a| and stays; time axis fits the stop. Marked "קו עצירה" at 40 m (prop `line`). Arrows on. (1.6)
 *   constant-acceleration  x0, v0, a sliders (defaults 0, 4, −2). T = 8. Arrows on. At t > 2 s the default has
 *       v < 0 and a < 0. (1.6)
 *   throw-up             Vertical, up positive, g = G = 10 m/s². Sliders v0 (0…30, default 15) and x0 (launch height,
 *       0…40 in steps of 5, default 0). The ball lands on the ground (y = 0) and stays. Marked line "גובה יעד" at
 *       20 m (prop `line`). Graphs x, v, a. (1.7)
 *   drop-two-masses      Vertical. Two balls dropped from 20 m; sliders m, m2 (0.5…10 kg) change only the size
 *       of the balls: the motion is identical (no mass in the model). Graphs x, v. (1.7)
 *   piecewise-vt         x₀ = 0, v₀ = 0; a = +2 for 2 s, 0 for 1 s, −2 afterwards: v = 4 at 2…3 s, turn at
 *       t = 5, x returns to 0 at t ≈ 8.46 s. T = 11. Layer area, slider t1. Graphs x, v, a. (1.8)
 *
 * ======================== Tasks ========================
 * A task ticks (markTask) only from the learner's own action: a check runs when the learner changes one of
 * the keys it reads (scrub, drag, play/pause, slider, toggle, flip, origin). It is skipped while any key it
 * reads still holds a value a text step set, until the learner changes that key themselves. Defaults never
 * satisfy a task by themselves. Success conditions (display frame):
 *   move-origin         the learner dragged / moved the origin to a position other than the initial one.
 *   flip-axis           the learner reversed the positive direction (flip differs from the initial).
 *   zero-displacement   cursor at a t with |Δx(0…t)| < 0.05 m and path(0…t) > 1 m.
 *   find-rest           cursor at a t > 0.05 s where v = 0 and a = 0 exactly (a rest).
 *   find-turn           cursor within 0.2 s of a time at which the body reverses; when it stops and then moves
 *                       off the other way, anywhere in that rest (ends included, ± 0.2 s): see turnSpans.
 *   set-velocity        x(target t) within 0.1 m of the target x (default target [6 s, 9 m]); needs x0 and v0.
 *   negative-velocity   the learner set v₀ < 0 (in the display frame).
 *   make-them-meet      the bodies meet at some time in [0.5 s, T] (they do not at the start).
 *   shrink-secant       'secant' layer on and Δt ≤ 0.05 s.
 *   find-fastest        cursor within 0.3 s of the instant of largest |v|.
 *   tangent-flat        cursor at t > 0.05 s with |v| < 0.4 m/s.
 *   speed-up-negative   at the cursor v < −0.05 m/s and a < 0 (the body speeds up in the negative direction).
 *   stop-at-line        the stopping position is within 1 m of the line (default 40 m).
 *   pause-at-top        the animation is paused (or scrubbed while paused) within 0.12 s of the apex.
 *   change-mass         the larger mass ≥ 5× the smaller, and the cursor is at the landing.
 *   reach-height        the apex is within 0.5 m of the line (default 20 m).
 *   area-equals-dx      'area' layer on, t₁ ≥ 1 s, t − t₁ ≥ 1 s and |area| ≥ 3 m (the readout shows area and Δx).
 *   net-area-zero       'area' layer on, |signed area(t₁…t)| < 0.5 m while the path over that interval is ≥ 2 m.
 *
 * ======================== Steps ========================
 * The step's state (or its `set` field) may hold any of: preset (resets everything to that preset's defaults,
 * t = 0), t, layers, toggles, graphs, sliders, x0 v0 a x02 v2 dt m m2 t1 (clamped to the slider's range),
 * origin, flip, trail, playing (only `false`). A step never starts the animation and never ticks a task.
 *
 * Still mode (settings) or prefers-reduced-motion: play does nothing; the cursor is moved by hand, and
 * the figure is a static picture of the cursor's moment.
 *
 * Layout: horizontal track on top, graphs in a row (≥ 520 px wide) or stacked (phones); a vertical track sits
 * left of stacked graphs (wide) or above them (phones). Canvas is LTR physics space; controls are RTL.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { stateAt, secantSlope, avgVelocity, avgSpeed, displacement, pathLength, areaVT, areaAT } from '~/physics/kinematics';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';
import {
  drawAll,
  figureHeight,
  layoutKind,
  layoutOf,
  num,
  plotBox,
  signed,
  type Geometry,
} from './motiontrack/draw';
import { buildModel, initialState, presetState, secantWindow, TASKS, type InitProps, type State } from './motiontrack/model';
import {
  DT_STEPS,
  dtOfIndex,
  indexOfDt,
  LAYER_LABEL,
  PRESETS,
  SLIDER_BASE,
  TASK_LABEL,
  type GraphId,
  type Layer,
  type Orientation,
  type Params,
  type PresetId,
  type SliderDef,
  type SliderId,
  type TaskId,
} from './motiontrack/presets';

export type { GraphId, Layer, Params, PresetId, SliderId, TaskId } from './motiontrack/presets';

export interface MotionTrackProps {
  id: string;
  preset?: PresetId;
  orientation?: Orientation;
  layers?: Layer[];
  toggles?: Layer[];
  graphs?: GraphId[];
  sliders?: SliderId[];
  params?: Partial<Params>;
  t?: number;
  origin?: number;
  draggableOrigin?: boolean;
  flip?: boolean;
  flipButton?: boolean;
  trailStep?: number;
  target?: [number, number];
  line?: number;
  tasks?: TaskId[];
  readout?: ('x' | 'v' | 'a')[];
  trackWindow?: [number, number];
}

const LAYER_SWATCH: Partial<Record<Layer, string>> = {
  'v-arrow': 'var(--velocity)',
  'a-arrow': 'var(--accel)',
  tangent: 'var(--velocity)',
  area: 'var(--pos)',
};
const SLIDER_IDS: SliderId[] = ['x0', 'v0', 'a', 'x02', 'v2', 'dt', 'm', 'm2', 't1'];
const LAYERS: Layer[] = ['trail', 'v-arrow', 'a-arrow', 'secant', 'tangent', 'area', 'counters'];
const GRAPHS: GraphId[] = ['x', 'v', 'a'];
const TIME_STEP = 0.05;

const pick = <T,>(v: unknown, valid: readonly T[]): T[] | undefined =>
  Array.isArray(v) ? (v.filter((x) => valid.includes(x as T)) as T[]) : undefined;

export default function MotionTrack(props: MotionTrackProps) {
  const [s, setS] = useState<State>(() => initialState(props as InitProps));
  const sRef = useRef(s);
  sRef.current = s;
  const initRef = useRef({ origin: s.origin, flip: s.flip });
  const taint = useRef(new Set<string>());
  const geo = useRef<Geometry | null>(null);
  const drag = useRef<'t' | 'origin' | null>(null);
  const [live, setLive] = useState('');
  const [cw, setCw] = useState(640);
  const [selOrigin, setSelOrigin] = useState(false);

  const m = buildModel(s);
  const nG = s.graphs.length;
  const kind = layoutKind(cw, m.orientation);
  const aspect = cw / figureHeight(kind, nG, !!m.B);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const line = props.line ?? m.def.line;

  /* ---------- state changes: learner vs step ---------- */

  const commit = (next: State) => {
    sRef.current = next;
    setS(next);
  };

  const evaluate = (st: State, changed: string[]) => {
    if (!props.tasks || props.tasks.length === 0) return;
    const model = buildModel(st);
    for (const id of props.tasks) {
      const def = TASKS[id];
      if (!def || !def.needs.some((k) => changed.includes(k))) continue;
      if (def.needs.some((k) => taint.current.has(k))) continue;
      if (def.test({ st, m: model, init: initRef.current, target: props.target, line })) markTask(`${props.id}:${id}`);
    }
  };

  /** a change made by the learner: apply it, clear the step's claim on those keys, then check tasks */
  const user = (patch: Partial<State>, keys: string[]) => {
    const cur = sRef.current;
    let next = { ...cur, ...patch };
    // a parameter change may shorten the time axis: keep the cursor on it
    next = { ...next, t: Math.max(0, Math.min(next.t, buildModel(next).T)) };
    commit(next);
    for (const k of keys) taint.current.delete(k);
    evaluate(next, keys);
  };

  const setParam = (id: SliderId, v: number) => user({ p: { ...sRef.current.p, [id]: v } }, [`p.${id}`]);

  const shows = (q: 'x' | 'v' | 'a') => (props.readout ?? ['x', 'v', 'a']).includes(q);

  const describe = (st: State) => {
    const mo = buildModel(st);
    const a = stateAt(mo.A, st.t);
    const parts = [
      shows('x') && `מקום ${num(mo.s * (a.x - mo.O))} מטר`,
      shows('v') && `מהירות ${signed(mo.s * a.v)} מטר לשנייה`,
      shows('a') && `תאוצה ${signed(mo.s * a.a)} מטר לשנייה בריבוע`,
    ].filter(Boolean);
    return `t = ${num(st.t)} שניות.${parts.length ? ` ${parts.join(', ')}.` : ''}`;
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (stt) => {
        const src = (stt.set && typeof stt.set === 'object' ? stt.set : stt) as Record<string, unknown>;
        let next = sRef.current;
        const keys: string[] = [];
        const isNum = (k: string) => typeof src[k] === 'number' && Number.isFinite(src[k] as number);
        if (typeof src.preset === 'string' && src.preset in PRESETS) {
          next = presetState(next, src.preset as PresetId);
          keys.push('t', 'layers', 'playing', ...SLIDER_IDS.map((k) => `p.${k}`));
        }
        const T = () => buildModel(next).T;
        const defOf = (id: SliderId): SliderDef => {
          const base = { ...SLIDER_BASE[id], ...PRESETS[next.preset].sliderDefs[id] };
          return id === 't1' ? { ...base, max: T() } : base;
        };
        for (const id of SLIDER_IDS) {
          if (!isNum(id)) continue;
          const d = defOf(id);
          const v = Math.max(d.min, Math.min(d.max, src[id] as number));
          next = { ...next, p: { ...next.p, [id]: v } };
          keys.push(`p.${id}`);
        }
        const layers = pick<Layer>(src.layers, LAYERS);
        if (layers) {
          next = { ...next, layers };
          keys.push('layers');
        }
        const toggles = pick<Layer>(src.toggles, LAYERS);
        if (toggles) next = { ...next, toggles };
        const graphs = pick<GraphId>(src.graphs, GRAPHS);
        if (graphs) next = { ...next, graphs };
        const sliders = pick<SliderId>(src.sliders, SLIDER_IDS);
        if (sliders) next = { ...next, sliders };
        if (isNum('origin')) {
          next = { ...next, origin: Math.round(src.origin as number) };
          keys.push('origin');
        }
        if (typeof src.flip === 'boolean') {
          next = { ...next, flip: src.flip };
          keys.push('flip');
        }
        if (isNum('trail')) next = { ...next, trail: Math.max(0, src.trail as number) };
        if (src.playing === false) {
          next = { ...next, playing: false };
          keys.push('playing');
        }
        if (isNum('t')) {
          next = { ...next, t: Math.max(0, Math.min(T(), src.t as number)) };
          keys.push('t');
        } else next = { ...next, t: Math.min(next.t, T()) };
        commit(next);
        for (const k of keys) taint.current.add(k);
      }),
    [props.id],
  );

  /* ---------- play ---------- */

  const togglePlay = () => {
    const cur = sRef.current;
    if (cur.playing) {
      user({ playing: false }, ['playing']);
      return;
    }
    if (!motionAllowed()) {
      setLive('מצב נייח: ההפעלה כבויה. הזיזו את הסמן ידנית.');
      return;
    }
    const T = buildModel(cur).T;
    user({ playing: true, t: cur.t >= T - 1e-9 ? 0 : cur.t }, ['playing', 't']);
  };

  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const cur = sRef.current;
      if (!cur.playing) return;
      if (!motionAllowed()) {
        user({ playing: false }, ['playing']);
        return;
      }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const T = buildModel(cur).T;
      const t = Math.min(T, cur.t + dt);
      if (t >= T) user({ t, playing: false }, ['t', 'playing']);
      else {
        user({ t }, ['t']);
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  /* ---------- drawing ---------- */

  const draw = ({ ctx, view, palette }: FrameInfo) => {
    const cur = sRef.current;
    const model = buildModel(cur);
    const k = layoutKind(view.w, model.orientation);
    const layout = layoutOf(k, view.w, view.h, cur.graphs, !!model.B);
    geo.current = drawAll({
      ctx,
      p: palette,
      w: view.w,
      h: view.h,
      st: cur,
      m: model,
      layout,
      target: props.target ?? (props.tasks?.includes('set-velocity') ? [6, 9] : undefined),
      line: props.line ?? model.def.line,
      draggableOrigin: !!props.draggableOrigin,
      selectedOrigin: selOrigin,
    });
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, selOrigin, cw]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setCw(Math.round(c.getBoundingClientRect().width) || 640));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  /* ---------- pointer and keyboard ---------- */

  const scrubTo = (sx: number) => {
    const g = geo.current;
    if (!g) return;
    const first = g.plots[0];
    if (!first) return;
    const { box } = first.plot;
    const T = buildModel(sRef.current).T;
    const t = Math.max(0, Math.min(T, ((sx - box.x) / box.w) * T));
    user({ t: Math.round(t / TIME_STEP) * TIME_STEP, playing: false }, ['t', 'playing']);
  };

  const onPointerDown = (e: PointerEvent) => {
    const g = geo.current;
    if (!g || !viewRef.current) return;
    const { offsetX: x, offsetY: y } = e;
    if (g.origin && Math.hypot(x - g.origin.x, y - g.origin.y) < 22) {
      drag.current = 'origin';
      setSelOrigin(true);
    } else {
      const hit = g.layout.graphs.find((q) => {
        const pb = plotBox(q.box);
        return x >= pb.x - 8 && x <= pb.x + pb.w + 8 && y >= q.box.y && y <= q.box.y + q.box.h;
      });
      if (!hit) return;
      drag.current = 't';
      scrubTo(x);
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = geo.current;
    if (!g || !drag.current) return;
    if (drag.current === 't') scrubTo(e.offsetX);
    else {
      const mo = buildModel(sRef.current);
      const w = Math.round(g.trackWorld(e.offsetX, e.offsetY));
      const o = Math.max(Math.ceil(mo.wlo), Math.min(Math.floor(mo.whi), w));
      if (o !== sRef.current.origin) user({ origin: o }, ['origin']);
    }
  };

  const onPointerUp = () => {
    if (drag.current) setLive(describe(sRef.current));
    drag.current = null;
    setSelOrigin(false);
  };

  const moveOrigin = (dir: 1 | -1) => {
    const cur = sRef.current;
    const mo = buildModel(cur);
    const o = Math.max(Math.ceil(mo.wlo), Math.min(Math.floor(mo.whi), cur.origin + dir));
    user({ origin: o }, ['origin']);
    setLive(`הראשית ב-${num(o)} מטר.`);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const cur = sRef.current;
    const T = buildModel(cur).T;
    const step = e.shiftKey ? TIME_STEP * 10 : TIME_STEP;
    let t: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') t = cur.t - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') t = cur.t + step;
    else if (e.key === 'Home') t = 0;
    else if (e.key === 'End') t = T;
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (t === null) return;
    e.preventDefault();
    user({ t: Math.max(0, Math.min(T, Math.round(t / TIME_STEP) * TIME_STEP)), playing: false }, ['t', 'playing']);
    setLive(describe(sRef.current));
  };

  const reset = () => {
    const fresh = initialState(props as InitProps);
    taint.current.clear();
    commit(fresh);
    setLive('האיור אופס.');
  };

  /* ---------- readout and controls ---------- */

  const sel = (mo: typeof m.A) => {
    const st = stateAt(mo, s.t);
    return { x: m.s * (st.x - m.O), v: m.s * st.v, a: m.s * st.a };
  };
  const a = sel(m.A);
  const b = m.B ? sel(m.B) : null;
  const n0 = m.def.names[0];
  const n1 = m.def.names[1] ?? 'B';
  const two = !!m.B;
  /** the position symbol: y on a vertical track (its axis is marked +y), x otherwise */
  const pos = m.orientation === 'vertical' ? 'y' : 'x';
  const hasLayer = (l: Layer) => s.layers.includes(l);
  const win = secantWindow(s.t, m.p.dt, m.T);
  const dx0t = m.s * displacement(m.A, 0, s.t);
  const path0t = pathLength(m.A, 0, s.t);
  const areaV = m.s * areaVT(m.A, m.p.t1, s.t);
  const areaA = m.s * areaAT(m.A, m.p.t1, s.t);
  const dxA = m.s * displacement(m.A, m.p.t1, s.t);

  const toggleLayer = (l: Layer, on: boolean) =>
    user({ layers: on ? [...s.layers.filter((x) => x !== l), l] : s.layers.filter((x) => x !== l) }, ['layers']);

  const sliderDef = (id: SliderId): SliderDef => {
    const d = { ...SLIDER_BASE[id], ...m.def.sliderDefs[id] };
    return id === 't1' ? { ...d, max: m.T } : d;
  };

  const readout = (
    <>
      <b class="q">t = {num(s.t)} s</b>
      {shows('x') && (
        <span class="q">
          {pos}{two ? n0 : ''} = {num(a.x)} m
        </span>
      )}
      {shows('v') && (
        <span class="q">
          v{two ? n0 : ''} = {signed(a.v)} m/s
        </span>
      )}
      {shows('a') && (
        <span class="q">
          a{two ? n0 : ''} = {signed(a.a)} m/s²
        </span>
      )}
      {b && (
        <>
          {shows('x') && (
            <span class="q">
              {pos}{n1} = {num(b.x)} m
            </span>
          )}
          {shows('v') && (
            <span class="q">
              v{n1} = {signed(b.v)} m/s
            </span>
          )}
          {shows('a') && (
            <span class="q">
              a{n1} = {signed(b.a)} m/s²
            </span>
          )}
        </>
      )}
      {hasLayer('counters') && (
        <>
          <span>
            העתק: <b class="q">Δx = {signed(dx0t)} m</b>
          </span>
          <span>
            דרך: <b class="q">{num(path0t)} m</b>
          </span>
          {s.t > 0 && shows('v') && (
            <span class="q">
              Δx/Δt = {signed(m.s * avgVelocity(m.A, 0, s.t))} m/s
            </span>
          )}
          {s.t > 0 && shows('v') && (
            <span>
              דרך ÷ זמן: <span class="q">{num(avgSpeed(m.A, 0, s.t))} m/s</span>
            </span>
          )}
        </>
      )}
      {hasLayer('secant') && (
        <span>
          מיתר:{' '}
          <span class="q">
            Δt = {num(win[1] - win[0], 2)} s, Δx = {signed(m.s * displacement(m.A, win[0], win[1]))} m, Δx/Δt = {signed(m.s * secantSlope(m.A, win[0], win[1] - win[0]))} m/s
          </span>
        </span>
      )}
      {hasLayer('tangent') && (
        <span>
          משיק: <b class="q">v = {signed(a.v)} m/s</b>
        </span>
      )}
      {hasLayer('area') && s.graphs.includes('v') && (
        <span>
          שטח מתחת ל־<bdi dir="ltr">v–t</bdi>: <b class="q">{signed(areaV)} m</b> · העתק: <span class="q">Δx = {signed(dxA)} m</span>
        </span>
      )}
      {hasLayer('area') && s.graphs.includes('a') && (
        <span>
          שטח מתחת ל־<bdi dir="ltr">a–t</bdi>: <b class="q">{signed(areaA)} m/s</b>
        </span>
      )}
    </>
  );

  const controls = (
    <>
      <div class="group" role="group" aria-label="זמן">
        <button type="button" class={`toggle ${s.playing ? 'on' : ''}`} aria-pressed={s.playing} onClick={togglePlay}>
          {s.playing ? '⏸ השהיה' : '▶ הפעלה'}
        </button>
      </div>
      <Slider
        label="זמן t"
        min={0}
        max={m.T}
        step={TIME_STEP}
        value={s.t}
        format={(v) => `${num(v)} s`}
        onChange={(v) => {
          user({ t: v, playing: false }, ['t', 'playing']);
          setLive(describe(sRef.current));
        }}
      />
      {s.toggles.length > 0 && (
        <div class="group" role="group" aria-label="מה להציג">
          {s.toggles.map((l) => (
            <Toggle key={l} label={LAYER_LABEL[l]} on={hasLayer(l)} swatch={LAYER_SWATCH[l]} onChange={(on) => toggleLayer(l, on)} />
          ))}
        </div>
      )}
      {(props.draggableOrigin || props.flipButton) && (
        <div class="group" role="group" aria-label="ציר">
          {props.draggableOrigin && (
            <>
              <button type="button" class="toggle" onClick={() => moveOrigin(-1)}>
                {m.orientation === 'vertical' ? 'הזיזו את הראשית למטה' : 'הזיזו את הראשית שמאלה'}
              </button>
              <button type="button" class="toggle" onClick={() => moveOrigin(1)}>
                {m.orientation === 'vertical' ? 'הזיזו את הראשית למעלה' : 'הזיזו את הראשית ימינה'}
              </button>
            </>
          )}
          {props.flipButton && (
            <button
              type="button"
              class={`toggle ${s.flip ? 'on' : ''}`}
              aria-pressed={s.flip}
              onClick={() => {
                user({ flip: !s.flip }, ['flip']);
                setLive(!s.flip ? 'הכיוון החיובי הפוך.' : 'הכיוון החיובי הוחזר.');
              }}
            >
              ⇄ הפכו את הכיוון החיובי
            </button>
          )}
        </div>
      )}
      {s.sliders.map((id) => {
        if (id === 'dt') {
          return (
            <Slider
              key={id}
              label="Δt"
              min={0}
              max={DT_STEPS}
              step={1}
              value={indexOfDt(m.p.dt)}
              // a step may set Δt between two slider stops: show the value in use, as the readout does
              format={(i) => `${sci(i === indexOfDt(m.p.dt) ? m.p.dt : dtOfIndex(i), 2)} s`}
              onChange={(i) => setParam('dt', dtOfIndex(i))}
            />
          );
        }
        const d = sliderDef(id);
        return (
          <Slider
            key={id}
            label={d.label}
            min={d.min}
            max={d.max}
            step={d.step}
            value={m.p[id]}
            format={(v) => `${num(v)} ${d.unit}`}
            onChange={(v) => {
              setParam(id, v);
              setLive(describe(sRef.current));
            }}
          />
        );
      })}
      {s.graphs.length > 0 && <p class="hint hand">גררו על הגרפים כדי להזיז את הסמן.</p>}
    </>
  );

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${m.def.title}. ${describe(s)} גררו על אחד הגרפים כדי להזיז את הזמן; במקלדת: חיצים מזיזים את הזמן, רווח מפעיל או משהה.`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'pointer'}
      readout={readout}
      controls={controls}
    />
  );
}
