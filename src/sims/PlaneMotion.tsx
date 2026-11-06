/**
 * PlaneMotion: a point body on a path in the plane, with its position vector, velocity, acceleration and
 * the construction that defines the acceleration, Δv = v₂ − v₁ (lesson 1.10).
 *
 * Model: src/physics/planar.ts (prescribed path, exact derivatives; MODEL SPECIFICATION there). The
 * figure is physics space: x to the right, y up, metres. Velocity arrows are drawn crisp and to scale
 * (a stated number of metres of drawing per m/s, per preset), acceleration arrows likewise per m/s²; both
 * scales are printed under the figure. Colours: velocity teal, acceleration orange.
 *
 * What it can draw (toggles; all default off except the body, the path and v):
 *   showPos    position vector r from the origin O to the body
 *   showV      velocity v at the body, tangent to the path
 *   showA      acceleration a at the body
 *   showSplit  a split into its tangential part (along v, changes the speed) and radial part
 *              (across v, changes the direction); the readout gives both with signs
 *   showAvg    the displacement Δr from r(t) to r(t+Δt) (thin ink arrow; with showPos also r₂ from O, so the
 *              triangle r₁ + Δr = r₂ is on screen) and the average velocity Δr/Δt along it
 *   showDv     v₁ = v(t) and v₂ = v(t+Δt) moved tail to tail at the body, and Δv from the tip of v₁ to the
 *              tip of v₂; the readout compares Δv/Δt with a
 *
 * Props (Astro wrapper: <Spread figure={PlaneMotion} figureProps={{ id: 'fig-1-10', preset: 'throw' }}>)
 *   id         figure id (required); tasks are stored as `${id}:${task}`
 *   preset     'straight-speeding-up' | 'circle-constant-speed' | 'curve-slowing-down' | 'throw'
 *              (default 'straight-speeding-up'); each preset's path is in planar.ts `presetPath`
 *   t          start time [s] (default 0), clamped to the preset's playable range
 *   dt         the interval Δt [s] for showAvg/showDv (default half of the largest allowed)
 *   showPos, showV (default true), showA, showSplit, showAvg, showDv   initial toggles
 *   tasks      task ids to show (below)
 * The learner can switch presets, drag the body along the path, scrub or play time, and slide Δt (a log
 * scale, from 1% of its maximum up to 2 s or a sixth of the path time).
 *
 * Step `set` keys: preset (string), t, dt (numbers), playing (boolean), and the six show* booleans.
 *
 * Tasks, ticked only by the learner's own actions (a step's `set` clears what counts as "own"):
 *   shrink-dt            the learner moves the Δt slider with showAvg on, at an instant where the path
 *                        really bends (the average velocity at the largest Δt is more than 5° off the
 *                        tangent), until the average velocity is within 2° of v
 *   circle-accel-inward  preset is the circle and showA is on after the learner switches it on, picks the
 *                        preset, or moves the body; a then points at the centre
 *   find-slowing         with showA and showSplit on, the learner moves or plays the body to an instant
 *                        where the tangential part of a points against v (aT/|a| < −0.2, v ≠ 0)
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import {
  accelComponents,
  averageAcceleration,
  averageVelocity,
  deltaV,
  presetPath,
  speed,
  type PlanarPath,
  type PlanarPresetId,
} from '~/physics/planar';
import { len, type Vec2 } from '~/physics/vec';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { label, plain, signed } from './core/text';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 13;
const WORLD_H = 9;

const PRESET_IDS: PlanarPresetId[] = ['straight-speeding-up', 'circle-constant-speed', 'curve-slowing-down', 'throw'];
const PRESET_NAME: Record<PlanarPresetId, string> = {
  'straight-speeding-up': 'ישר, מאיץ',
  'circle-constant-speed': 'מעגל, גודל מהירות קבוע',
  'curve-slowing-down': 'עקום, מאט',
  throw: 'זריקה',
};
/** metres of drawing per m/s of velocity, and per m/s² of acceleration */
const SCALE: Record<PlanarPresetId, { v: number; a: number }> = {
  'straight-speeding-up': { v: 0.6, a: 2 },
  'circle-constant-speed': { v: 1, a: 2 },
  'curve-slowing-down': { v: 0.5, a: 0.5 },
  throw: { v: 0.4, a: 0.25 },
};

const TASK_LABEL: Record<string, string> = {
  'shrink-dt': 'הציגו את המהירות הממוצעת והקטינו את Δt. מה קורה לכיוון שלה?',
  'circle-accel-inward': 'במעגל שבו גודל המהירות קבוע, הציגו את התאוצה. לאן היא מצביעה?',
  'find-slowing': 'הציגו את התאוצה ואת הפירוק שלה, ומצאו רגע שבו הרכיב המשיקי של התאוצה מצביע נגד המהירות.',
};

export interface PlaneMotionProps {
  id: string;
  preset?: PlanarPresetId;
  t?: number;
  dt?: number;
  showPos?: boolean;
  showV?: boolean;
  showA?: boolean;
  showSplit?: boolean;
  showAvg?: boolean;
  showDv?: boolean;
  tasks?: string[];
}

interface State {
  preset: PlanarPresetId;
  t: number;
  dt: number;
  playing: boolean;
  showPos: boolean;
  showV: boolean;
  showA: boolean;
  showSplit: boolean;
  showAvg: boolean;
  showDv: boolean;
}

const BOOLS = ['showPos', 'showV', 'showA', 'showSplit', 'showAvg', 'showDv'] as const;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** largest Δt for a preset; playable time is [0, duration − dtMax] so t + Δt stays on the drawn path */
const dtMaxOf = (path: PlanarPath) => Math.min(2, path.duration / 6);
const tMaxOf = (path: PlanarPath) => path.duration - dtMaxOf(path);
const dtMinOf = (path: PlanarPath) => dtMaxOf(path) / 100;

function initial(p: PlaneMotionProps): State {
  const preset = p.preset ?? 'straight-speeding-up';
  const path = presetPath(preset);
  return {
    preset,
    t: clamp(p.t ?? 0, 0, tMaxOf(path)),
    dt: clamp(p.dt ?? dtMaxOf(path) / 2, dtMinOf(path), dtMaxOf(path)),
    playing: false,
    showPos: p.showPos ?? false,
    showV: p.showV ?? true,
    showA: p.showA ?? false,
    showSplit: p.showSplit ?? false,
    showAvg: p.showAvg ?? false,
    showDv: p.showDv ?? false,
  };
}

const angleBetween = (a: Vec2, b: Vec2) => {
  const la = len(a);
  const lb = len(b);
  if (la === 0 || lb === 0) return 0;
  const c = (a[0] * b[0] + a[1] * b[1]) / (la * lb);
  return (Math.acos(clamp(c, -1, 1)) * 180) / Math.PI;
};

export default function PlaneMotion(props: PlaneMotionProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const drag = useRef(false);
  const path = useMemo(() => presetPath(s.preset), [s.preset]);
  const tMax = tMaxOf(path);
  const dtMax = dtMaxOf(path);
  const dtMin = dtMinOf(path);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const change = (patch: Partial<State>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setS((prev) => ({ ...prev, ...patch }));
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.preset === 'string' && (PRESET_IDS as string[]).includes(st.preset)) {
            next.preset = st.preset as PlanarPresetId;
            next.t = 0;
            next.dt = dtMaxOf(presetPath(next.preset)) / 2;
          }
          const pth = presetPath(next.preset);
          if (typeof st.t === 'number') next.t = clamp(st.t, 0, tMaxOf(pth));
          if (typeof st.dt === 'number') next.dt = clamp(st.dt, dtMinOf(pth), dtMaxOf(pth));
          if (typeof st.playing === 'boolean') next.playing = st.playing;
          for (const k of BOOLS) if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          return next;
        });
      }),
    [props.id],
  );

  // playback loops over the playable range; frozen in still mode
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const d = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        const t = prev.t + d;
        return { ...prev, t: t > tMax ? t - tMax : t };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, tMax]);

  // tasks
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    const v = path.v(s.t);
    const a = path.a(s.t);
    if (has('shrink-dt') && own('dt') && s.showAvg) {
      const bendAtMax = angleBetween(averageVelocity(path, s.t, dtMax), v);
      const now = angleBetween(averageVelocity(path, s.t, s.dt), v);
      if (bendAtMax > 5 && now < 2) done('shrink-dt');
    }
    if (has('circle-accel-inward') && s.preset === 'circle-constant-speed' && s.showA && own('showA', 'preset', 't', 'playing')) {
      done('circle-accel-inward');
    }
    if (has('find-slowing') && s.showA && s.showSplit && own('t', 'playing') && speed(v) > 0.1) {
      const { aT } = accelComponents(v, a);
      if (aT / len(a) < -0.2) done('find-slowing');
    }
  }, [s, props.id, props.tasks, path, dtMax]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(path, s)), 700);
    return () => clearTimeout(h);
  }, [s.preset, s.showA, s.showSplit, Math.round(s.t * 4)]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, path, s);
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  /** move the body to the point of the playable path nearest the pointer */
  const grab = (e: PointerEvent) => {
    const view = viewRef.current;
    if (!view) return;
    const [wx, wy] = toWorld(view, e.offsetX, e.offsetY);
    let best = 0;
    let bd = Infinity;
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const t = (tMax * i) / N;
      const r = path.r(t);
      const d = Math.hypot(r[0] - wx, r[1] - wy);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    change({ t: best, playing: false });
  };
  const onPointerDown = (e: PointerEvent) => {
    drag.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    grab(e);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (drag.current) grab(e);
  };
  const onPointerUp = () => {
    drag.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = tMax / 40;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') change({ t: clamp(s.t + step, 0, tMax), playing: false });
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') change({ t: clamp(s.t - step, 0, tMax), playing: false });
    else return;
    e.preventDefault();
  };

  const reset = () => {
    touched.current.clear();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const v = path.v(s.t);
  const a = path.a(s.t);
  const sp = speed(v);
  const { aT, aN } = accelComponents(v, a);
  const vAvg = averageVelocity(path, s.t, s.dt);
  const aAvg = averageAcceleration(path, s.t, s.dt);
  const sc = SCALE[s.preset];
  const fmtScale = (m: number) => plain(1 / m, 2);

  // log scale for Δt: u = 0 is the smallest, 1 the largest
  const uOf = (dt: number) => Math.log(dt / dtMin) / Math.log(dtMax / dtMin);
  const dtOf = (u: number) => dtMin * (dtMax / dtMin) ** u;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גוף נע במישור על מסלול. ${describe(path, s)} גררו את הגוף לאורך המסלול או השתמשו בחצים במקלדת.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={
        <>
          <span class="q">t = {plain(s.t, 3)} s</span>
          <span class="q">|v| = {plain(sp, 3)} m/s</span>
          {(s.showA || s.showSplit) && <span class="q">|a| = {plain(len(a), 3)} m/s²</span>}
          {s.showSplit && (
            <>
              <span>
                רכיב משיקי <span class="q">a<sub>T</sub></span>: <b class="q">{signed(aT, 3)} m/s²</b>
              </span>
              <span>
                רכיב רדיאלי <span class="q">a<sub>R</sub></span>: <b class="q">{plain(Math.abs(aN), 3)} m/s²</b>
              </span>
            </>
          )}
          {s.showAvg && (
            <span>
              זווית בין v הממוצעת ל-v: <b class="q">{plain(angleBetween(vAvg, v), 2)}°</b>
            </span>
          )}
          {s.showDv && (
            <>
              <span class="q">|Δv| = {plain(len(deltaV(path, s.t, s.dt)), 3)} m/s</span>
              <span class="q">
                |Δv|/Δt = {plain(len(aAvg), 3)} m/s², |a| = {plain(len(a), 3)} m/s²
              </span>
            </>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מסלול">
            {PRESET_IDS.map((id) => (
              <Toggle
                key={id}
                label={PRESET_NAME[id]}
                on={s.preset === id}
                onChange={() => {
                  const pth = presetPath(id);
                  change({ preset: id, t: 0, playing: false, dt: dtMaxOf(pth) / 2 });
                  // a new path restarts t and Δt; that is not the learner moving the body or the Δt slider
                  for (const k of ['t', 'playing', 'dt']) touched.current.delete(k);
                }}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="וקטור מקום" on={s.showPos} swatch="var(--ink-2)" onChange={(on) => change({ showPos: on })} />
            <Toggle label="מהירות" on={s.showV} swatch="var(--velocity)" onChange={(on) => change({ showV: on })} />
            <Toggle label="תאוצה" on={s.showA} swatch="var(--accel)" onChange={(on) => change({ showA: on })} />
            <Toggle label="פירוק התאוצה" on={s.showSplit} swatch="var(--accel)" onChange={(on) => change({ showSplit: on })} />
            <Toggle label="מהירות ממוצעת" on={s.showAvg} swatch="var(--velocity)" onChange={(on) => change({ showAvg: on })} />
            <Toggle label="בניית Δv" on={s.showDv} swatch="var(--accel)" onChange={(on) => change({ showDv: on })} />
          </div>
          <div class="group" role="group" aria-label="זמן">
            <Toggle label={s.playing ? 'עצירה' : 'הפעלה'} on={s.playing} onChange={(on) => change({ playing: on })} />
          </div>
          <Slider
            label="זמן"
            min={0}
            max={tMax}
            step={tMax / 200}
            value={s.t}
            format={(x) => `${plain(x, 2)} s`}
            onChange={(x) => change({ t: x, playing: false })}
          />
          <Slider
            label="הפרש הזמנים Δt"
            min={0}
            max={1}
            step={0.01}
            value={uOf(s.dt)}
            format={(u) => `${plain(dtOf(u), 2)} s`}
            onChange={(u) => change({ dt: dtOf(u) })}
          />
          <p class="hint">
            קנה מידה: מטר אחד באיור הוא <span class="q">{fmtScale(sc.v)} m/s</span> של מהירות או{' '}
            <span class="q">{fmtScale(sc.a)} m/s²</span> של תאוצה. גררו את הגוף לאורך המסלול.
          </p>
        </>
      }
    />
  );
}

function describe(path: PlanarPath, s: State): string {
  const v = path.v(s.t);
  const a = path.a(s.t);
  const { aT } = accelComponents(v, a);
  const kind = Math.abs(aT) / (len(a) || 1) < 0.02 ? 'גודל המהירות קבוע' : aT > 0 ? 'גודל המהירות גדל' : 'גודל המהירות קטן';
  return `מסלול ${PRESET_NAME[s.preset]}. ברגע t = ${plain(s.t, 2)} שניות גודל המהירות ${plain(speed(v), 3)} מטר לשנייה ו${kind}.`;
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, path: PlanarPath, s: State) {
  const at = (v: Vec2) => toScreen(view, v[0], v[1]);
  const sc = SCALE[s.preset];

  // 1 m grid
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let i = -Math.floor(WORLD_W / 2); i <= WORLD_W / 2; i++) {
    const [x] = at([i, 0]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.h);
    ctx.stroke();
  }
  for (let j = -Math.floor(WORLD_H / 2); j <= WORLD_H / 2; j++) {
    const [, y] = at([0, j]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.w, y);
    ctx.stroke();
  }
  ctx.restore();

  // the path
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  const N = 200;
  for (let i = 0; i <= N; i++) {
    const [x, y] = at(path.r((path.duration * i) / N));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // origin
  const O = at([0, 0]);
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(O[0], O[1], 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, p, 'O', O[0] - 10, O[1] + 11, { size: 14, italic: true, weight: 700, color: p.ink }, false);

  const r = path.r(s.t);
  const v = path.v(s.t);
  const a = path.a(s.t);
  const B = at(r);
  /** screen point of a vector of the given scale drawn from the body */
  const tip = (vec: Vec2, k: number, from: Vec2 = r): [number, number] => at([from[0] + vec[0] * k, from[1] + vec[1] * k]);
  const tag = (text: string, to: [number, number], color: string, from: [number, number] = B) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const L = Math.hypot(dx, dy) || 1;
    label(ctx, p, text, to[0] + (dx / L) * 13 - (dy / L) * 6, to[1] + (dy / L) * 13 + (dx / L) * 6, { size: 14, italic: true, weight: 700, color }, false);
  };

  // r₁ and r₂ are nearly parallel on a throw: put each label on its outer side (away from the other arrow)
  const r2now = path.r(s.t + s.dt);
  const turn = Math.sign(r[0] * r2now[1] - r[1] * r2now[0]) || 1; // + when r₂ is counter-clockwise from r₁
  /** world point at fraction f along vector w from O, pushed `side` (+1 left, −1 right) by 0.45 m */
  const beside = (w: Vec2, f: number, side: number): [number, number] => {
    const L = len(w) || 1;
    return at([w[0] * f + (-w[1] / L) * 0.45 * side, w[1] * f + (w[0] / L) * 0.45 * side]);
  };
  const posStyle = { size: 15, italic: true, weight: 700, color: p.ink2 };

  // position vector (r₁ when the second instant is shown too)
  if (s.showPos) {
    arrow(ctx, O[0], O[1], B[0], B[1], { color: p.ink2, width: 2.2, head: 11 });
    if (s.showAvg) {
      const [lx, ly] = beside(r, 0.5, -turn);
      label(ctx, p, 'r₁', lx, ly, posStyle, false);
    } else {
      label(ctx, p, 'r', (O[0] + B[0]) / 2 + 8, (O[1] + B[1]) / 2 - 9, posStyle, false);
    }
  }

  // displacement Δr = r₂ − r₁ and the average velocity Δr/Δt along it
  if (s.showAvg) {
    const r2 = path.r(s.t + s.dt);
    const B2 = at(r2);
    if (s.showPos) {
      arrow(ctx, O[0], O[1], B2[0], B2[1], { color: withAlpha(p.ink2, 0.6), width: 1.8, head: 10 });
      const [lx, ly] = beside(r2, 0.5, turn);
      label(ctx, p, 'r₂', lx, ly, { ...posStyle, color: withAlpha(p.ink2, 0.85) }, false);
    }
    arrow(ctx, B[0], B[1], B2[0], B2[1], { color: p.ink, width: 1.8, head: 9 });
    {
      const dx = B2[0] - B[0];
      const dy = B2[1] - B[1];
      const L = Math.hypot(dx, dy) || 1;
      // Δr label on the side of the arrow away from the average-velocity label
      label(ctx, p, 'Δr', (B[0] + B2[0]) / 2 + (dy / L) * 14, (B[1] + B2[1]) / 2 - (dx / L) * 14, { size: 14, italic: true, weight: 700, color: p.ink }, false);
    }
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(B2[0], B2[1], 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const va = averageVelocity(path, s.t, s.dt);
    const t2 = tip(va, sc.v);
    arrow(ctx, B[0], B[1], t2[0], t2[1], { color: withAlpha(p.velocity, 0.55), width: 4.5, head: 13 });
    tag('v ממוצעת', t2, withAlpha(p.velocity, 0.95));
  }

  // Δv construction: v₁ and v₂ tail to tail at the body, Δv between the tips
  if (s.showDv) {
    const v2 = path.v(s.t + s.dt);
    const t1 = tip(v, sc.v);
    const t2 = tip(v2, sc.v);
    arrow(ctx, B[0], B[1], t1[0], t1[1], { color: p.velocity, width: 3, head: 12 });
    arrow(ctx, B[0], B[1], t2[0], t2[1], { color: withAlpha(p.velocity, 0.6), width: 2.4, head: 11 });
    arrow(ctx, t1[0], t1[1], t2[0], t2[1], { color: p.accel, width: 3.4, head: 12 });
    tag('v₁', t1, p.velocity);
    tag('v₂', t2, withAlpha(p.velocity, 0.9));
    const mid: [number, number] = [(t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2];
    tag('Δv', mid, p.accel, [(B[0] + mid[0]) / 2, (B[1] + mid[1]) / 2]);
  }

  // instantaneous velocity
  if (s.showV && !s.showDv) {
    const t1 = tip(v, sc.v);
    arrow(ctx, B[0], B[1], t1[0], t1[1], { color: p.velocity, width: 3.2, head: 13 });
    tag('v', t1, p.velocity);
  }

  // acceleration and its parts
  if (s.showA) {
    const ta = tip(a, sc.a);
    if (s.showSplit) {
      const { tangential, radial } = accelComponents(v, a);
      const tt = tip(tangential, sc.a);
      const tr = tip(radial, sc.a);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = withAlpha(p.accel, 0.5);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(tt[0], tt[1]);
      ctx.lineTo(ta[0], ta[1]);
      ctx.lineTo(tr[0], tr[1]);
      ctx.stroke();
      ctx.restore();
      if (len(tangential) > 1e-9) {
        arrow(ctx, B[0], B[1], tt[0], tt[1], { color: withAlpha(p.accel, 0.8), width: 2.4, head: 10 });
        tag('משיקי', tt, p.accel);
      }
      if (len(radial) > 1e-9) {
        arrow(ctx, B[0], B[1], tr[0], tr[1], { color: withAlpha(p.accel, 0.8), width: 2.4, head: 10 });
        tag('רדיאלי', tr, p.accel);
      }
    }
    arrow(ctx, B[0], B[1], ta[0], ta[1], { color: p.accel, width: 4, head: 14 });
    tag('a', ta, p.accel);
  }

  // the body, on top
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(B[0], B[1], 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
