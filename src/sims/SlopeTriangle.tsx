/**
 * Slope and triangle, the figure of lesson 0.3 (the math toolbox). Two modes:
 *
 * - 'line': the graph of a car's distance from a road sign against time. Two draggable points
 *   (whole seconds, whole metres) fix a straight line; the dashed rise/run triangle between them
 *   shows Δt and Δd, and the readout gives the slope with its units (m/s), the intercept, and the
 *   angle the line happens to make *on screen*. The axis scales are switchable (seconds or metres
 *   per grid square): the drawn angle changes, the slope does not (MC-slope-is-angle). The points
 *   stay inside the range the finest scale shows (0–10 s, 0–16 m), so a coarser scale never hides
 *   them and a scale change never moves them.
 * - 'triangle': a ramp drawn to scale as a right triangle, set by its angle θ and its length L.
 *   The readout gives the height h = L·sin θ, the horizontal leg w = L·cos θ (not x, which names a
 *   graph axis in this lesson), the three ratios
 *   and Pythagoras. The ratios depend on θ alone (similar triangles), and sin 60° is not 2·sin 30°
 *   (MC-sin-of-sum).
 *
 * Every number comes from src/physics/toolbox.ts. Tasks tick only on the learner's own changes:
 * the props' starting state and any state a text step produced are skipped by identity.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { cosDeg, drawnAngleDeg, legs, lineThrough, sinDeg, tanDeg, toRad, type Point } from '~/physics/toolbox';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type SlopeMode = 'line' | 'triangle';

const COLS = 10;
const ROWS = 8;
/** the range the points may take: what the finest scale (1 s and 2 m per square) shows */
const T_MAX = 10;
const D_MAX = 16;
const X_PER = [1, 2] as const;
const Y_PER = [2, 4, 8] as const;
const HANDLE_PX = 9;
const LINE_ASPECT = 1.15;

const THETA_MIN = 5;
const THETA_MAX = 80;
const L_MIN = 2;
const L_MAX = 8;
/** triangle mode: the world shown, in metres */
const TRI_W = 13;
const TRI_H = 9.75;

const TASK_LABEL: Record<string, string> = {
  rescale: 'שנו את קנה המידה של אחד הצירים. מה קרה לזווית שבציור, ומה קרה לשיפוע?',
  'through-origin': 'גררו נקודה כך שהקו יעבור בראשית, בנקודה (0, 0). עכשיו המרחק ביחס ישר לזמן.',
  'negative-slope': 'סדרו את הנקודות כך שהשיפוע יהיה שלילי: המכונית מתקרבת לתמרור.',
  'angle-30': 'כוונו את הזווית ל-30°. איזה חלק מאורך המדרון הוא הגובה?',
  'double-angle': 'עכשיו הכפילו את הזווית ל-60°. האם גם sin θ הוכפל?',
  'same-angle-longer': 'שנו את אורך המדרון בלי לשנות את הזווית. מה קורה ל-sin θ, ל-cos θ ול-tan θ?',
};

interface State {
  p1: Point;
  p2: Point;
  xPer: number;
  yPer: number;
  theta: number;
  L: number;
  selected: 0 | 1 | null;
}

export interface SlopeTriangleProps {
  id: string;
  mode?: SlopeMode;
  /** line mode: the two points [t in s, d in m] */
  p1?: [number, number];
  p2?: [number, number];
  /** line mode: seconds per grid square on the time axis, metres per square on the distance axis */
  xPer?: number;
  yPer?: number;
  /** triangle mode: the ramp's angle [degrees] and length [m] */
  theta?: number;
  L?: number;
  tasks?: string[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const snapPoint = (t: number, d: number): Point => [clamp(Math.round(t), 0, T_MAX), clamp(Math.round(d), 0, D_MAX)];
const pick = <T extends number>(list: readonly T[], v: unknown, fallback: number) =>
  typeof v === 'number' && (list as readonly number[]).includes(v) ? v : fallback;

function initial(p: SlopeTriangleProps): State {
  return {
    p1: snapPoint(...(p.p1 ?? [0, 4])),
    p2: snapPoint(...(p.p2 ?? [5, 14])),
    xPer: pick(X_PER, p.xPer, 1),
    yPer: pick(Y_PER, p.yPer, 2),
    theta: clamp(Math.round(p.theta ?? 30), THETA_MIN, THETA_MAX),
    L: clamp(p.L ?? 6, L_MIN, L_MAX),
    selected: null,
  };
}

/** a readout number: three significant figures, a true minus sign, no "-0" */
const num = (x: number) => (Math.abs(x) < 1e-9 ? '0' : sci(x, 3).replace('-', '−'));

export default function SlopeTriangle(props: SlopeTriangleProps) {
  const mode: SlopeMode = props.mode ?? 'line';
  const [s, setS] = useState<State>(() => initial(props));
  const drag = useRef<0 | 1 | null>(null);
  const [live, setLive] = useState('');
  // the state a text step produced, and the mount state, must not tick a task: only the learner's own controls do.
  // A boolean flag is not enough: on late hydration the cached step arrives during mount and the mount effect eats it.
  const stepState = useRef<State | null>(null);
  const prev = useRef<State | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) =>
        setS((old) => {
          const next: State = { ...old, selected: null };
          const pt = (v: unknown) => (Array.isArray(v) && v.length === 2 ? snapPoint(Number(v[0]), Number(v[1])) : null);
          next.p1 = pt(st.p1) ?? old.p1;
          next.p2 = pt(st.p2) ?? old.p2;
          next.xPer = pick(X_PER, st.xPer, old.xPer);
          next.yPer = pick(Y_PER, st.yPer, old.yPer);
          if (typeof st.theta === 'number') next.theta = clamp(Math.round(st.theta), THETA_MIN, THETA_MAX);
          if (typeof st.L === 'number') next.L = clamp(st.L, L_MIN, L_MAX);
          stepState.current = next;
          return next;
        }),
      ),
    [props.id],
  );

  const line = lineThrough(s.p1, s.p2);
  const vertical = Number.isNaN(line.slope);
  const drawn = vertical ? 90 : drawnAngleDeg(line.slope, s.xPer, s.yPer);
  const tri = legs(s.L, s.theta);

  useEffect(() => {
    const before = prev.current;
    prev.current = s;
    if (!before || s === stepState.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (mode === 'line') {
      if (has('rescale') && !vertical && (s.xPer !== before.xPer || s.yPer !== before.yPer)) done('rescale');
      if (has('through-origin') && !vertical && line.slope !== 0 && Math.abs(line.intercept) < 1e-9) done('through-origin');
      if (has('negative-slope') && !vertical && line.slope < 0) done('negative-slope');
    } else {
      if (has('angle-30') && s.theta === 30) done('angle-30');
      if (has('double-angle') && s.theta === 60) done('double-angle');
      if (has('same-angle-longer') && s.L !== before.L && s.theta === before.theta) done('same-angle-longer');
    }
  }, [s, props.id, props.tasks]);

  const draw = (f: FrameInfo) => (mode === 'line' ? drawLine(f, s) : drawTriangle(f, s));
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: mode === 'line' ? LINE_ASPECT : TRI_W,
    worldHeight: mode === 'line' ? 1 : TRI_H,
    animate: false,
  });
  useEffect(invalidate, [s]);

  const describeLine = (st: State) => {
    const l = lineThrough(st.p1, st.p2);
    if (Number.isNaN(l.slope)) return 'שתי הנקודות באותו זמן: הקו אנכי, והשיפוע שלו לא מוגדר.';
    return `הקו עובר בנקודות (${num(st.p1[0])} שניות, ${num(st.p1[1])} מטרים) ו-(${num(st.p2[0])} שניות, ${num(st.p2[1])} מטרים). השיפוע ${num(l.slope)} מטרים לשנייה, והחיתוך עם הציר האנכי ${num(l.intercept)} מטרים.`;
  };
  const describeTri = (st: State) => {
    const g = legs(st.L, st.theta);
    return `מדרון באורך ${num(st.L)} מטרים בזווית של ${st.theta} מעלות: הגובה ${num(g.opposite)} מטרים, האורך האופקי ${num(g.adjacent)} מטרים, סינוס הזווית ${num(sinDeg(st.theta))}.`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || mode !== 'line') return;
    const fr = lineFrame(v, s);
    const hit = ([0, 1] as const).find((i) => {
      const q = i === 0 ? s.p1 : s.p2;
      return Math.hypot(e.offsetX - fr.sx(q[0]), e.offsetY - fr.sy(q[1])) < HANDLE_PX + 12;
    });
    setS((old) => ({ ...old, selected: hit ?? null }));
    if (hit === undefined) return;
    drag.current = hit;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const i = drag.current;
    if (!v || i === null) return;
    const fr = lineFrame(v, s);
    const q = snapPoint(fr.tx(e.offsetX), fr.dy(e.offsetY));
    const cur = i === 0 ? s.p1 : s.p2;
    if (q[0] !== cur[0] || q[1] !== cur[1]) setS((old) => ({ ...old, [i === 0 ? 'p1' : 'p2']: q }));
  };
  const onPointerUp = () => {
    if (drag.current !== null) setLive(describeLine(s));
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (mode !== 'line') return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const next = s.selected === 0 ? 1 : 0;
      setS({ ...s, selected: next });
      setLive(`נבחרה הנקודה ${next + 1}.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const dd = dirs[e.key];
    if (!dd) return;
    e.preventDefault();
    const i = s.selected ?? 0;
    const cur = i === 0 ? s.p1 : s.p2;
    const next: State = { ...s, selected: i, [i === 0 ? 'p1' : 'p2']: snapPoint(cur[0] + dd[0], cur[1] + dd[1]) };
    setS(next);
    setLive(describeLine(next));
  };

  const reset = () => {
    // a reset is the props' starting state again: like the mount state, it ticks nothing
    const st = initial(props);
    stepState.current = st;
    setS(st);
    setLive('האיור אופס.');
  };

  if (mode === 'triangle') {
    const sq = (x: number) => x * x;
    return (
      <SimShell
        fig={props.id}
        label={`איור חי: מדרון כמשולש ישר-זווית, בקנה מידה. ${describeTri(s)} פסי הגרירה קובעים את הזווית ואת האורך.`}
        canvasRef={canvasRef}
        aspect={TRI_W / TRI_H}
        live={live}
        tasks={tasks}
        onReset={reset}
        readout={
          // one span per quantity: commas between LTR quantities reorder in an RTL line
          <>
            <b class="q">θ = {s.theta}°</b>
            <span class="q">L = {num(s.L)} m</span>
            <span class="q">h = L·sin θ = {num(tri.opposite)} m</span>
            <span class="q">w = L·cos θ = {num(tri.adjacent)} m</span>
            <b class="q">sin θ = h/L = {num(sinDeg(s.theta))}</b>
            <b class="q">cos θ = w/L = {num(cosDeg(s.theta))}</b>
            <b class="q">tan θ = h/w = {num(tanDeg(s.theta))}</b>
            <span>
              פיתגורס: <span class="q">h² + w² = {num(sq(tri.opposite) + sq(tri.adjacent))} m²</span>
            </span>
            <span class="q">L² = {num(sq(s.L))} m²</span>
          </>
        }
        controls={
          <>
            <Slider
              label="הזווית θ"
              min={THETA_MIN}
              max={THETA_MAX}
              step={1}
              value={s.theta}
              format={(v) => `${v}°`}
              onChange={(v) => {
                const next = { ...s, theta: v };
                setS(next);
                setLive(describeTri(next));
              }}
            />
            <Slider
              label="אורך המדרון L"
              min={L_MIN}
              max={L_MAX}
              step={0.5}
              value={s.L}
              format={(v) => `${num(v)} m`}
              onChange={(v) => {
                const next = { ...s, L: v };
                setS(next);
                setLive(describeTri(next));
              }}
            />
          </>
        }
      />
    );
  }

  const unitX = 's';
  const unitY = 'm';
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גרף של המרחק של מכונית מתמרור מול הזמן. ${describeLine(s)} גררו את שתי הנקודות; במקלדת: רווח בוחר נקודה, חיצים מזיזים.`}
      canvasRef={canvasRef}
      aspect={LINE_ASPECT}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current !== null ? 'grabbing' : 'grab'}
      readout={
        <>
          <span class="q">Δt = {num(Math.abs(s.p2[0] - s.p1[0]))} {unitX}</span>
          <span class="q">
            Δd = {num(s.p1[0] <= s.p2[0] ? s.p2[1] - s.p1[1] : s.p1[1] - s.p2[1])} {unitY}
          </span>
          <span>
            שיפוע: <b class="q">{vertical ? '—' : `Δd/Δt = ${num(line.slope)} ${unitY}/${unitX}`}</b>
          </span>
          <span>
            חיתוך עם הציר האנכי: <b class="q">{vertical ? '—' : `${num(line.intercept)} ${unitY}`}</b>
          </span>
          <span>
            הזווית בציור: <span class="q">{num(Math.abs(Math.round(drawn)))}°</span>
          </span>
          <span>
            {vertical
              ? 'קו אנכי: השיפוע לא מוגדר.'
              : Math.abs(line.intercept) < 1e-9 && line.slope !== 0
                ? 'הקו עובר בראשית: יחס ישר.'
                : 'הקו לא עובר בראשית: אין יחס ישר.'}
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="קנה המידה של ציר הזמן">
            <span class="hint">משבצת בציר הזמן:</span>
            {X_PER.map((v) => (
              <Toggle key={v} label={<bdi dir="ltr">{v} s</bdi>} on={s.xPer === v} onChange={() => setS({ ...s, xPer: v })} />
            ))}
          </div>
          <div class="group" role="group" aria-label="קנה המידה של ציר המרחק">
            <span class="hint">משבצת בציר המרחק:</span>
            {Y_PER.map((v) => (
              <Toggle key={v} label={<bdi dir="ltr">{v} m</bdi>} on={s.yPer === v} onChange={() => setS({ ...s, yPer: v })} />
            ))}
          </div>
          <p class="hint hand">גררו את שתי הנקודות שעל הקו.</p>
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- line mode */

function lineFrame(v: View, s: State) {
  const narrow = v.w < 480;
  const left = narrow ? 46 : 58;
  const right = 14;
  // the reset and full-screen buttons sit over the top-right corner: keep the plot below them
  const top = 44;
  const bottom = narrow ? 40 : 46;
  const sq = Math.max(4, Math.min((v.w - left - right) / COLS, (v.h - top - bottom) / ROWS));
  const pw = sq * COLS;
  const ph = sq * ROWS;
  const x0 = left + (v.w - left - right - pw) / 2;
  const y0 = top + (v.h - top - bottom - ph) / 2;
  const tmax = COLS * s.xPer;
  const dmax = ROWS * s.yPer;
  return {
    narrow,
    left: x0,
    top: y0,
    pw,
    ph,
    sq,
    tmax,
    dmax,
    sx: (t: number) => x0 + (t / tmax) * pw,
    sy: (d: number) => y0 + ph - (d / dmax) * ph,
    tx: (px: number) => ((px - x0) / pw) * tmax,
    dy: (py: number) => ((y0 + ph - py) / ph) * dmax,
  };
}

function drawLine({ ctx, view, palette: p }: FrameInfo, s: State) {
  const f = lineFrame(view, s);
  // grid, one line per square, with every tick numbered (every other one on a phone)
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.font = `${f.narrow ? 11 : 12}px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.direction = 'ltr';
  for (let i = 0; i <= COLS; i++) {
    const X = f.left + i * f.sq;
    ctx.beginPath();
    ctx.moveTo(X, f.top);
    ctx.lineTo(X, f.top + f.ph);
    ctx.stroke();
    if (!f.narrow || i % 2 === 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(String(i * s.xPer), X, f.top + f.ph + 5);
    }
  }
  for (let j = 0; j <= ROWS; j++) {
    const Y = f.top + f.ph - j * f.sq;
    ctx.beginPath();
    ctx.moveTo(f.left, Y);
    ctx.lineTo(f.left + f.pw, Y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(j * s.yPer), f.left - 6, Y);
  }
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(f.left, f.top);
  ctx.lineTo(f.left, f.top + f.ph);
  ctx.lineTo(f.left + f.pw, f.top + f.ph);
  ctx.stroke();
  // axis titles: Hebrew runs right to left, the unit stays inside the run
  ctx.font = `600 ${f.narrow ? 12 : 13}px ${p.fontUi}`;
  ctx.fillStyle = p.ink;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('הזמן t (s)', f.left + f.pw / 2, f.top + f.ph + (f.narrow ? 38 : 44));
  ctx.save();
  ctx.translate(f.left - (f.narrow ? 34 : 42), f.top + f.ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'middle';
  ctx.fillText('המרחק מהתמרור d (m)', 0, 0);
  ctx.restore();
  ctx.restore();

  const l = lineThrough(s.p1, s.p2);
  const [a, b] = s.p1[0] <= s.p2[0] ? [s.p1, s.p2] : [s.p2, s.p1];

  ctx.save();
  ctx.beginPath();
  ctx.rect(f.left, f.top, f.pw, f.ph);
  ctx.clip();
  // the line itself, across the whole plot
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  if (Number.isNaN(l.slope)) {
    ctx.moveTo(f.sx(a[0]), f.top);
    ctx.lineTo(f.sx(a[0]), f.top + f.ph);
  } else {
    ctx.moveTo(f.sx(0), f.sy(l.intercept));
    ctx.lineTo(f.sx(f.tmax), f.sy(l.intercept + l.slope * f.tmax));
  }
  ctx.stroke();
  // the rise/run triangle between the two points
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = p.hand;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(f.sx(a[0]), f.sy(a[1]));
  ctx.lineTo(f.sx(b[0]), f.sy(a[1]));
  ctx.lineTo(f.sx(b[0]), f.sy(b[1]));
  ctx.stroke();
  ctx.setLineDash([]);
  // the angle as drawn, at the left point
  if (!Number.isNaN(l.slope) && l.slope !== 0 && b[0] > a[0]) {
    const ang = Math.atan2(f.sy(a[1]) - f.sy(b[1]), f.sx(b[0]) - f.sx(a[0]));
    ctx.strokeStyle = withAlpha(p.accent, 0.85);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(f.sx(a[0]), f.sy(a[1]), 26, 0, -ang, ang > 0);
    ctx.stroke();
  }
  ctx.restore();

  // intercept marker on the vertical axis
  if (!Number.isNaN(l.slope) && l.intercept >= 0 && l.intercept <= f.dmax) {
    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(f.sx(0), f.sy(l.intercept), 4.5, 0, Math.PI * 2);
    ctx.fill();
    // left of the axis and above the tick numbers: a handle often sits on the intercept itself
    ctx.font = `italic 700 13px ${p.fontUi}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('b', f.sx(0) - 5, f.sy(l.intercept) - 6);
    ctx.restore();
  }

  // Δt and Δd beside the triangle legs
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  ctx.fillStyle = p.hand;
  ctx.direction = 'ltr';
  if (b[0] > a[0]) {
    ctx.textAlign = 'center';
    ctx.textBaseline = b[1] >= a[1] ? 'top' : 'bottom';
    ctx.fillText(`Δt = ${num(b[0] - a[0])} s`, (f.sx(a[0]) + f.sx(b[0])) / 2, f.sy(a[1]) + (b[1] >= a[1] ? 5 : -5));
  }
  if (b[1] !== a[1]) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tx = f.sx(b[0]) + 7;
    const label = `Δd = ${num(b[1] - a[1])} m`;
    // keep the label inside the canvas when the right point sits at the right edge
    const w = ctx.measureText(label).width;
    ctx.textAlign = tx + w > view.w - 4 ? 'right' : 'left';
    ctx.fillText(label, ctx.textAlign === 'right' ? f.sx(b[0]) - 7 : tx, (f.sy(a[1]) + f.sy(b[1])) / 2);
  }
  ctx.restore();

  ([s.p1, s.p2] as const).forEach((q, i) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.sx(q[0]), f.sy(q[1]), HANDLE_PX * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(p.accent, 0.22);
    ctx.fill();
    ctx.lineWidth = s.selected === i ? 2.8 : 1.6;
    ctx.strokeStyle = s.selected === i ? p.ink : p.accent;
    ctx.stroke();
    ctx.restore();
  });
}

/* ---------------------------------------------------------------- triangle mode */

function drawTriangle({ ctx, view, palette: p }: FrameInfo, s: State) {
  const { opposite: h, adjacent: w } = legs(s.L, s.theta);
  // the angle's corner sits low and to the left, so the longest ramp still fits with room for labels
  const A = toScreen(view, -TRI_W / 2 + 1.6, -TRI_H / 2 + 1.1);
  const ppm = view.ppm;
  const C: [number, number] = [A[0] + w * ppm, A[1]];
  const B: [number, number] = [C[0], A[1] - h * ppm];

  // ground
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(A[0] - 0.8 * ppm, A[1]);
  ctx.lineTo(A[0] + (L_MAX + 0.8) * ppm, A[1]);
  ctx.stroke();
  for (let gx = A[0] - 0.6 * ppm; gx < A[0] + (L_MAX + 0.8) * ppm; gx += 12) {
    ctx.beginPath();
    ctx.moveTo(gx, A[1]);
    ctx.lineTo(gx - 6, A[1] + 7);
    ctx.stroke();
  }
  ctx.restore();

  // the two legs, dashed, and the ramp itself
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(C[0], C[1]);
  ctx.lineTo(B[0], B[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = withAlpha(p.equip, 0.12);
  ctx.beginPath();
  ctx.moveTo(A[0], A[1]);
  ctx.lineTo(C[0], C[1]);
  ctx.lineTo(B[0], B[1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(A[0], A[1]);
  ctx.lineTo(B[0], B[1]);
  ctx.stroke();
  // right-angle mark at C
  const m = 11;
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = p.ink2;
  ctx.beginPath();
  ctx.moveTo(C[0] - m, C[1]);
  ctx.lineTo(C[0] - m, C[1] - m);
  ctx.lineTo(C[0], C[1] - m);
  ctx.stroke();
  // the angle θ at A
  const r = 34;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(A[0], A[1], r, 0, -toRad(s.theta), true);
  ctx.stroke();
  ctx.restore();

  // labels
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = `italic 700 14px ${p.fontUi}`;
  ctx.fillStyle = p.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const half = toRad(s.theta) / 2;
  ctx.fillText(`θ = ${s.theta}°`, A[0] + (r + 8) * Math.cos(half), A[1] - (r + 8) * Math.sin(half) - 2);
  ctx.font = `600 13px ${p.fontUi}`;
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'left';
  ctx.fillText(`h = ${num(h)} m`, B[0] + 8, (B[1] + C[1]) / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`w = ${num(w)} m`, (A[0] + C[0]) / 2, A[1] + 10);
  // L above the middle of the ramp, pushed out along its normal
  const nx = -Math.sin(toRad(s.theta));
  const ny = -Math.cos(toRad(s.theta));
  ctx.fillStyle = p.equip;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`L = ${num(s.L)} m`, (A[0] + B[0]) / 2 + nx * 22, (A[1] + B[1]) / 2 + ny * 22);
  ctx.restore();

  // scale bar, one metre, in the free bottom-right corner (the buttons hold the top right)
  ctx.save();
  const sx = view.w - 16 - ppm;
  const sy = view.h - 30;
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 4);
  ctx.lineTo(sx, sy + 4);
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + ppm, sy);
  ctx.moveTo(sx + ppm, sy - 4);
  ctx.lineTo(sx + ppm, sy + 4);
  ctx.stroke();
  ctx.font = `12px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('1 m', sx + ppm / 2, sy + 7);
  ctx.restore();
}

