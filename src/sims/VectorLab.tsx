/**
 * Vector lab: vectors on a grid, for the toolbox lessons (0.3 and 1.9). One vector with its components
 * and a multiple kA (mode 'one'), or two vectors with their sum A + B drawn head to tail and their
 * difference A − B drawn as A + (−B) (mode 'two').
 *
 * One grid square is one unit of the quantity, and the vector tips snap to the grid, so components are
 * whole numbers a student can read off and 3-4-5 triangles come out exact.
 *
 * Props (Astro wrapper: <Spread figure={VectorLab} figureProps={{ id: 'fig-1-9', mode: 'two', unit: 'm' }}>)
 *   id              figure id (required); tasks are stored as `${id}:${task}`
 *   mode            'one' | 'two'                                   (default 'one')
 *   unit            'N' | 'm' | 'm/s': what the vectors are         (default 'N'; m = displacement, m/s = velocity)
 *   a, b            start vectors [x, y] in whole units              (default [2, 3], [2, −1])
 *   showComponents  draw A's components and the acute angle θ between A and the x axis; the readout gives
 *                   the component sizes |A|cos θ and |A|sin θ with the sign read off the drawing
 *                   (Aₓ = −|A|cos θ for an arrow pointing left), as lesson 0.3 does trig in a right
 *                   triangle only, and shows that Aₓ + A_y is not |A|  (default false)
 *   showSum         (mode 'two') the sum A + B                       (default true in 'two')
 *   showDiff        (mode 'two') the difference A − B as A + (−B)    (default false)
 *   showScaled      (mode 'one') the multiple kA                     (default false)
 *   names           what to call the arrows: { a, b, sum, diff }, each a short name with an optional
 *                   subscript after '_' ('v_SM'), drawn on the canvas and in the readout. Defaults A, B, A+B,
 *                   A−B. Lets a figure use the lesson's own names (v_SM, v_M, v_S for a boat in a river).
 *   tasks           task ids to show (below)
 *
 * Step `set` keys: a, b ([x, y]), k (one of ±0.5, ±1, ±2, ±3), showComponents, showSum, showDiff, showScaled
 * (booleans), names (as the prop; keys left out fall back to the defaults).
 *
 * Tasks are ticked only by the learner's own actions: a step's `set` clears what counts as "own", so a
 * state a step produced never ticks a task. Success conditions:
 *   make-3-4       the learner drags A to (3, 4)
 *   negative-k     the learner switches on kA and picks a negative k                     (mode 'one')
 *   same-line      the learner drags B (or A) so B points the way A does                 (mode 'two')
 *   perpendicular  the learner makes A and B perpendicular                               (mode 'two')
 *   cancel         the learner makes A + B = 0                                           (mode 'two')
 *   subtract       the learner switches on the difference A − B                          (mode 'two')
 *   car-faster     with A pointing straight down (rain) and the difference on, the learner drags B along
 *                  +x to more than 3 units (the car speeds up)                           (mode 'two')
 *   components-sum the learner shows A's components while A has both Aₓ ≠ 0 and A_y ≠ 0, so that Aₓ + A_y
 *                  and |A| are visibly different numbers (the learner switched the components on or moved A)
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { add, angle, dot, len, scale, sub, type Vec2 } from '~/physics/vec';
import { angleFromLegs } from '~/physics/toolbox';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 13;
const WORLD_H = 10.5;
const LIM_X = 6;
const LIM_Y = 4;
const TIP_PX = 11;

export type VectorMode = 'one' | 'two';

/** k choices for kA; zero is left out so kA always has a direction to compare */
const K_STEPS = [-3, -2, -1, -0.5, 0.5, 1, 2, 3];

const TASK_LABEL: Record<string, string> = {
  'make-3-4': 'גררו את קצה הווקטור כך שהרכיב האופקי שלו יהיה 3 והרכיב האנכי 4. מה הגודל שלו?',
  'negative-k': 'הכפילו את הווקטור במספר שלילי. לאן מצביע הווקטור החדש?',
  'same-line': 'גררו את קצה B כך שיצביע בדיוק לכיוון של A. כמה שווה גודל הסכום?',
  perpendicular: 'גררו את קצה B כך שיהיה ניצב ל-A. איך מחשבים עכשיו את גודל הסכום?',
  cancel: 'סדרו את B כך שהסכום A + B יתאפס.',
  subtract: 'הציגו את ההפרש A − B. איך הוא בנוי מ-A ומ-B הפוך?',
  'components-sum': 'הציגו את הרכיבים של A כשהוא אלכסוני. האם סכום הרכיבים שווה לגודל של A?',
  'car-faster': 'הציגו את ההפרש, וגררו את קצה החץ של המכונית ימינה, כאילו היא מאיצה. מה קורה לכיוון של הגשם ביחס למכונית?',
};

/** arrow names; a name is a base and an optional subscript after '_' */
export interface VectorNames {
  a?: string;
  b?: string;
  sum?: string;
  diff?: string;
}
interface Names {
  a: string;
  b: string;
  sum: string;
  diff: string;
}
const nameSet = (n?: VectorNames): Names => {
  const a = n?.a ?? 'A';
  const b = n?.b ?? 'B';
  return { a, b, sum: n?.sum ?? `${a}+${b}`, diff: n?.diff ?? `${a}−${b}` };
};
/** 'v_SM+v_M' → [{t:'v', sub:'SM'}, {t:'+'}, {t:'v', sub:'M'}] */
type Seg = { t: string; sub?: string };
const segs = (name: string): Seg[] => {
  const out: Seg[] = [];
  for (const m of name.matchAll(/([A-Za-z]+)_([A-Za-z0-9]+)|([^_])/g)) {
    if (m[1]) out.push({ t: m[1], sub: m[2] });
    else if (out.length && !out[out.length - 1].sub) out[out.length - 1].t += m[3];
    else out.push({ t: m[3] });
  }
  return out;
};
/** a name as plain text for screen readers: 'v_SM' → 'v SM' */
const spoken = (name: string) => name.replace(/_/g, ' ');
/** a name in the readout, with a real subscript */
function Name({ n }: { n: string }) {
  return <>{segs(n).map((g) => (g.sub ? <>{g.t}<sub>{g.sub}</sub></> : g.t))}</>;
}

/** the unit as the readouts print it, and as a screen reader says it (one grid square) */
export type VectorUnit = 'N' | 'm' | 'm/s';
const UNIT_WORD: Record<VectorUnit, string> = { N: 'ניוטון', m: 'מטר', 'm/s': 'מטר לשנייה' };
/** the colour code (CLAUDE.md): force green, velocity teal, a displacement in ink like positions */
const UNIT_TOKEN: Record<VectorUnit, 'force' | 'velocity' | 'ink'> = { N: 'force', 'm/s': 'velocity', m: 'ink' };

interface State {
  a: Vec2;
  b: Vec2;
  k: number;
  showComponents: boolean;
  showSum: boolean;
  showDiff: boolean;
  showScaled: boolean;
  names: Names;
  selected: 'a' | 'b' | null;
}

export interface VectorLabProps {
  id: string;
  mode?: VectorMode;
  unit?: VectorUnit;
  a?: [number, number];
  b?: [number, number];
  showComponents?: boolean;
  showSum?: boolean;
  showDiff?: boolean;
  showScaled?: boolean;
  names?: VectorNames;
  tasks?: string[];
}

function initial(p: VectorLabProps): State {
  return {
    a: p.a ?? [2, 3],
    b: p.b ?? [2, -1],
    k: 1,
    showComponents: p.showComponents ?? false,
    showSum: p.showSum ?? (p.mode === 'two'),
    showDiff: p.showDiff ?? false,
    showScaled: p.showScaled ?? false,
    names: nameSet(p.names),
    selected: null,
  };
}

/** the acute angle between v and the x axis, in whole degrees (0–90), as in a right triangle */
const acuteDeg = (v: Vec2) => Math.round(angleFromLegs(Math.abs(v[1]), Math.abs(v[0])));
/** which way v points, in words, read off the signs of its components */
const sideWords = (v: Vec2) => {
  const h = v[0] > 0 ? 'ימינה' : v[0] < 0 ? 'שמאלה' : '';
  const u = v[1] > 0 ? 'למעלה' : v[1] < 0 ? 'למטה' : '';
  return h && u ? `${h} ו${u}` : h || u;
};
/** the sign a component takes from the drawing, written before |A|cos θ */
const signOf = (x: number) => (x < 0 ? '−' : '');
const num = (x: number) => (Math.abs(x) < 1e-9 ? '0' : sci(x, 3).replace('-', '−'));
const vecText = (v: Vec2) => `(${num(v[0])}, ${num(v[1])})`;
const kLabel = (k: number) => (k === -0.5 ? '−½' : k === 0.5 ? '½' : `${k < 0 ? '−' : ''}${Math.abs(k)}`);
/** the multiple as a vector's name: −A, not −1A */
const kName = (k: number) => (k === 1 ? '' : k === -1 ? '−' : kLabel(k));

export default function VectorLab(props: VectorLabProps) {
  const two = props.mode === 'two';
  const unit: VectorUnit = props.unit ?? 'N';
  const [s, setS] = useState<State>(() => initial(props));
  const drag = useRef<'a' | 'b' | null>(null);
  const [live, setLive] = useState('');
  /** state keys the learner changed since the last step or mount; tasks look only at these */
  const touched = useRef(new Set<string>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  /** a change made by the learner (a step's change goes through subscribeSteps and is not "own") */
  const change = (patch: Partial<State>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setS((prev) => ({ ...prev, ...patch }));
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev };
          for (const k of ['showComponents', 'showSum', 'showDiff', 'showScaled'] as const) {
            if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          }
          if (Array.isArray(st.a) && st.a.length === 2) next.a = [Number(st.a[0]), Number(st.a[1])];
          if (Array.isArray(st.b) && st.b.length === 2) next.b = [Number(st.b[0]), Number(st.b[1])];
          if (typeof st.k === 'number' && K_STEPS.includes(st.k)) next.k = st.k;
          if (st.names && typeof st.names === 'object') next.names = nameSet(st.names as VectorNames);
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    const [ax, ay] = s.a;
    const cross = s.a[0] * s.b[1] - s.a[1] * s.b[0];
    const nonzero = len(s.a) > 0 && len(s.b) > 0;
    if (has('make-3-4') && own('a') && ax === 3 && ay === 4) done('make-3-4');
    if (has('negative-k') && own('k', 'showScaled') && s.showScaled && s.k < 0) done('negative-k');
    if (has('same-line') && own('a', 'b') && nonzero && cross === 0 && dot(s.a, s.b) > 0) done('same-line');
    if (has('perpendicular') && own('a', 'b') && nonzero && dot(s.a, s.b) === 0) done('perpendicular');
    if (has('cancel') && own('a', 'b') && len(s.a) > 0 && len(add(s.a, s.b)) === 0) done('cancel');
    if (has('subtract') && own('showDiff') && two && s.showDiff && len(sub(s.a, s.b)) > 0) done('subtract');
    if (has('components-sum') && own('showComponents', 'a') && s.showComponents && ax !== 0 && ay !== 0) done('components-sum');
    if (has('car-faster') && own('b') && two && s.showDiff && ax === 0 && ay < 0 && s.b[1] === 0 && s.b[0] > 3) done('car-faster');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    grid(ctx, view, p);
    const O = toScreen(view, 0, 0);
    const at = (v: Vec2) => toScreen(view, v[0], v[1]);
    const colA = p[UNIT_TOKEN[unit]];
    const colB = p.equip;
    const colR = p.accent;
    const colD = p.hand;
    const N = s.names;

    if (s.showComponents) {
      components(ctx, view, [0, 0], s.a, colA, p, N.a);
      angleArc(ctx, O, s.a, colA, p);
    }

    if (two && s.showDiff) {
      // A − B built as A + (−B): −B from the origin, the same −B moved to A's tip, and the result
      const nb = scale(s.b, -1);
      const d = sub(s.a, s.b);
      const [nx, ny] = at(nb);
      const [tx, ty] = at(d);
      const [ax0, ay0] = at(s.a);
      arrow(ctx, O[0], O[1], nx, ny, { color: withAlpha(colB, 0.45), width: 2, head: 10 });
      tag(ctx, `−${N.b}`, nx, ny, nb, withAlpha(colB, 0.9), p);
      arrow(ctx, ax0, ay0, tx, ty, { color: withAlpha(colB, 0.55), width: 2.2, head: 11 });
      if (len(d) > 0) {
        arrow(ctx, O[0], O[1], tx, ty, { color: colD, width: 4, head: 15 });
        tag(ctx, N.diff, tx, ty, d, colD, p);
      } else {
        tagAt(ctx, `${N.diff} = 0`, O[0], O[1] + 22, colD, p);
      }
    }

    if (!two && s.showScaled) {
      const ka = scale(s.a, s.k);
      const [x, y] = at(ka);
      arrow(ctx, O[0], O[1], x, y, { color: colR, width: 7, head: 17, alpha: 0.45 });
      tag(ctx, `${kName(s.k)}${N.a}`, x, y, ka, colR, p);
    }

    if (two) {
      if (s.showSum) {
        // B again, from A's tip: the head-to-tail picture of the sum
        const [ax, ay] = at(s.a);
        const [tx, ty] = at(add(s.a, s.b));
        arrow(ctx, ax, ay, tx, ty, { color: withAlpha(colB, 0.55), width: 2.2, head: 11 });
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = withAlpha(colB, 0.35);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(...at(s.b));
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();
        const r = add(s.a, s.b);
        if (len(r) > 0) {
          arrow(ctx, O[0], O[1], tx, ty, { color: colR, width: 4, head: 15 });
          tag(ctx, N.sum, tx, ty, r, colR, p);
        } else {
          ctx.save();
          ctx.strokeStyle = colR;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(O[0], O[1], 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          tagAt(ctx, `${N.sum} = 0`, O[0], O[1] - 22, colR, p);
        }
      }
      const [bx, by] = at(s.b);
      arrow(ctx, O[0], O[1], bx, by, { color: colB, width: 3, head: 13 });
      tag(ctx, N.b, bx, by, s.b, colB, p);
      handle(ctx, bx, by, colB, s.selected === 'b', p);
    }

    const [ax, ay] = at(s.a);
    arrow(ctx, O[0], O[1], ax, ay, { color: colA, width: 3, head: 13 });
    tag(ctx, N.a, ax, ay, s.a, colA, p);
    handle(ctx, ax, ay, colA, s.selected === 'a', p);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    animate: false,
  });
  useEffect(invalidate, [s]);

  const snap = (x: number, y: number): Vec2 => [
    Math.max(-LIM_X, Math.min(LIM_X, Math.round(x))),
    Math.max(-LIM_Y, Math.min(LIM_Y, Math.round(y))),
  ];

  const hit = (v: View, sx: number, sy: number): 'a' | 'b' | null => {
    const near = (w: Vec2) => {
      const [x, y] = toScreen(v, w[0], w[1]);
      return Math.hypot(sx - x, sy - y) < TIP_PX + 12;
    };
    if (near(s.a)) return 'a';
    if (two && near(s.b)) return 'b';
    return null;
  };

  const describe = (st: State) => {
    const n = st.names;
    const parts = [`הווקטור ${spoken(n.a)} הוא ${vecText(st.a)}, בגודל ${num(len(st.a))} ${UNIT_WORD[unit]}.`];
    if (two) parts.push(`${spoken(n.b)} הוא ${vecText(st.b)}. הסכום ${spoken(n.sum)} הוא ${vecText(add(st.a, st.b))}, בגודל ${num(len(add(st.a, st.b)))}.`);
    if (two && st.showDiff) parts.push(`ההפרש ${spoken(n.diff)} הוא ${vecText(sub(st.a, st.b))}.`);
    else if (st.showScaled) parts.push(`${kLabel(st.k)} כפול ${spoken(n.a)} הוא ${vecText(scale(st.a, st.k))}.`);
    return parts.join(' ');
  };

  const move = (which: 'a' | 'b', w: Vec2) => change({ [which]: w });

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (!h) return;
    drag.current = h;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [x, y] = toWorld(v, e.offsetX, e.offsetY);
    const w = snap(x, y);
    if (w[0] !== s[d][0] || w[1] !== s[d][1]) move(d, w);
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const order: ('a' | 'b')[] = two ? ['a', 'b'] : ['a'];
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const i = order.indexOf(s.selected ?? order[order.length - 1]);
      const next = order[(i + 1) % order.length];
      setS((prev) => ({ ...prev, selected: next }));
      setLive(`נבחר הווקטור ${spoken(next === 'a' ? s.names.a : s.names.b)}.`);
      return;
    }
    const dirs: Record<string, Vec2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? 'a';
    touched.current.add(sel);
    setS((prev) => {
      const next = { ...prev, selected: sel, [sel]: snap(prev[sel][0] + d[0], prev[sel][1] + d[1]) };
      setLive(describe(next));
      return next;
    });
  };

  const reset = () => {
    touched.current.clear();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const r = add(s.a, s.b);
  const ka = scale(s.a, s.k);
  const N = s.names;
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: וקטורים על רשת, כל משבצת ${UNIT_WORD[unit]} אחד. ${describe(s)} גררו את קצה החץ; במקלדת: רווח בוחר וקטור, חיצים מזיזים.`}
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
        // one span per quantity: commas between LTR quantities reorder in an RTL line
        <>
          <b class="q">
            <Name n={N.a} /> = {vecText(s.a)} {unit}
          </b>
          <span class="q">
            |<Name n={N.a} />| = {num(len(s.a))} {unit}
          </span>
          <span>
            זווית חדה מציר x: <span class="q">{len(s.a) > 0 ? `θ = ${acuteDeg(s.a)}°` : '—'}</span>
            {len(s.a) > 0 && `, ${sideWords(s.a)}`}
          </span>
          {s.showComponents && len(s.a) > 0 && (
            <>
              <span class="q">
                Aₓ = {s.a[0] === 0 ? '' : `${signOf(s.a[0])}|A| cos θ = `}
                {num(s.a[0])} {unit}
              </span>
              <span class="q">
                A_y = {s.a[1] === 0 ? '' : `${signOf(s.a[1])}|A| sin θ = `}
                {num(s.a[1])} {unit}
              </span>
              {s.a[0] !== 0 && s.a[1] !== 0 && (
                <span class="q">
                  Aₓ + A_y = {num(s.a[0] + s.a[1])} {unit} ≠ |A| = {num(len(s.a))} {unit}
                </span>
              )}
            </>
          )}
          {two && (
            <b class="q">
              <Name n={N.b} /> = {vecText(s.b)} {unit}
            </b>
          )}
          {two && (
            <span class="q">
              |<Name n={N.b} />| = {num(len(s.b))} {unit}
            </span>
          )}
          {two && s.showSum && (
            <span>
              סכום:{' '}
              <b class="q">
                <Name n={N.sum} /> = {vecText(r)} {unit}
              </b>
            </span>
          )}
          {two && s.showSum && (
            <span class="q">
              |<Name n={N.sum} />| = {num(len(r))} {unit}
            </span>
          )}
          {two && s.showDiff && (
            <span>
              הפרש:{' '}
              <b class="q">
                <Name n={N.diff} /> = {vecText(sub(s.a, s.b))} {unit}
              </b>
            </span>
          )}
          {two && s.showDiff && (
            <span class="q">
              |<Name n={N.diff} />| = {num(len(sub(s.a, s.b)))} {unit}
            </span>
          )}
          {!two && s.showScaled && (
            <b class="q">
              {kName(s.k)}A = {vecText(ka)} {unit}
            </b>
          )}
          {!two && s.showScaled && (
            <span class="q">
              |{kName(s.k)}A| = {num(len(ka))} {unit}
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label={<>רכיבים של <span class="q"><Name n={N.a} /></span></>} on={s.showComponents} swatch={`var(--${UNIT_TOKEN[unit]})`} onChange={(v) => change({ showComponents: v })} />
            {two && <Toggle label={<>הסכום <span class="q"><Name n={N.sum} /></span></>} on={s.showSum} swatch="var(--accent)" onChange={(v) => change({ showSum: v })} />}
            {two && <Toggle label={<>ההפרש <span class="q"><Name n={N.diff} /></span></>} on={s.showDiff} swatch="var(--hand)" onChange={(v) => change({ showDiff: v })} />}
            {!two && <Toggle label="כפל במספר" on={s.showScaled} swatch="var(--accent)" onChange={(v) => change({ showScaled: v })} />}
          </div>
          {!two && s.showScaled && (
            <Slider
              label="המספר k"
              min={0}
              max={K_STEPS.length - 1}
              step={1}
              value={Math.max(0, K_STEPS.indexOf(s.k))}
              format={(i) => kLabel(K_STEPS[i])}
              onChange={(i) => change({ k: K_STEPS[i] })}
            />
          )}
          <p class="hint hand">גררו את העיגול שבקצה החץ.</p>
        </>
      }
    />
  );
}

/** Grid squares of 1 N, with the x and y axes through the origin. */
function grid(ctx: CanvasRenderingContext2D, v: View, p: Palette) {
  const [ox, oy] = toScreen(v, 0, 0);
  const halfW = v.w / 2 / v.ppm;
  const halfH = v.h / 2 / v.ppm;
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let i = -Math.floor(halfW); i <= halfW; i++) {
    const [x] = toScreen(v, i, 0);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, v.h);
    ctx.stroke();
  }
  for (let j = -Math.floor(halfH); j <= halfH; j++) {
    const [, y] = toScreen(v, 0, j);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(v.w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.4;
  arrow(ctx, 6, oy, v.w - 6, oy, { color: p.ink3, width: 1.4, head: 9 });
  arrow(ctx, ox, v.h - 6, ox, 6, { color: p.ink3, width: 1.4, head: 9 });
  ctx.font = `italic 600 14px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('x', v.w - 8, oy + 6);
  // left of the axis: a vector name at a tip on the top row sits to the right of the axis
  ctx.textAlign = 'right';
  ctx.fillText('y', ox - 8, 6);
  ctx.restore();
}

/** Dashed projections of v (drawn from `from`) onto the axes, with their values. */
function components(ctx: CanvasRenderingContext2D, view: View, from: Vec2, v: Vec2, color: string, p: Palette, name: string) {
  const [x0, y0] = toScreen(view, from[0], from[1]);
  const [xe, ye] = toScreen(view, from[0] + v[0], from[1] + v[1]);
  if (v[0] !== 0) arrow(ctx, x0, y0, xe, y0, { color: withAlpha(color, 0.75), width: 2.4, head: 10 });
  if (v[1] !== 0) arrow(ctx, xe, y0, xe, ye, { color: withAlpha(color, 0.75), width: 2.4, head: 10 });
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = withAlpha(color, 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0, ye);
  ctx.lineTo(xe, ye);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  if (v[0] !== 0) {
    ctx.textBaseline = v[1] >= 0 ? 'top' : 'bottom';
    ctx.fillText(`${name.includes('_') ? '' : name}x = ${num(v[0])}`, (x0 + xe) / 2, y0 + (v[1] >= 0 ? 6 : -6));
  }
  if (v[1] !== 0) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = v[0] >= 0 ? 'left' : 'right';
    ctx.fillText(`${name.includes('_') ? '' : name}y = ${num(v[1])}`, xe + (v[0] >= 0 ? 8 : -8), (y0 + ye) / 2);
  }
  ctx.restore();
}

/**
 * The acute angle θ between v and the x axis, as a small arc at the origin from the nearer half of the
 * axis (+x for an arrow pointing right, −x for one pointing left), with its label.
 */
function angleArc(ctx: CanvasRenderingContext2D, O: [number, number], v: Vec2, color: string, p: Palette) {
  if (len(v) === 0) return;
  const th = angle(v);
  if (Math.abs(th) < 1e-9 || Math.abs(Math.abs(th) - Math.PI) < 1e-9) return;
  // world angle of the half axis the arc starts from
  const from = v[0] >= 0 ? 0 : v[1] >= 0 ? Math.PI : -Math.PI;
  const R = 26;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  // canvas angles run clockwise, so a world angle φ is drawn at −φ
  ctx.arc(O[0], O[1], R, -from, -th, th > from);
  ctx.stroke();
  ctx.font = `italic 700 14px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mid = -(from + th) / 2;
  ctx.fillText('θ', O[0] + (R + 11) * Math.cos(mid), O[1] + (R + 11) * Math.sin(mid));
  ctx.restore();
}

function handle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, selected: boolean, p: Palette) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, TIP_PX * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(color, 0.18);
  ctx.fill();
  ctx.lineWidth = selected ? 2.6 : 1.4;
  ctx.strokeStyle = selected ? p.ink : color;
  ctx.stroke();
  ctx.restore();
}

const TAG_FONT = 15;
/** the corner SimShell's buttons cover, in CSS px */
const BUTTONS_W = 88;
const BUTTONS_H = 48;
const SUB_FONT = 11;

/** width of a name as tagAt draws it (base letters in the tag font, subscripts smaller) */
function tagWidth(ctx: CanvasRenderingContext2D, text: string, p: Palette) {
  ctx.save();
  let w = 0;
  for (const g of segs(text)) {
    ctx.font = `italic 700 ${TAG_FONT}px ${p.fontUi}`;
    w += ctx.measureText(g.t).width;
    if (g.sub) {
      ctx.font = `700 ${SUB_FONT}px ${p.fontUi}`;
      w += ctx.measureText(g.sub).width + 1;
    }
  }
  ctx.restore();
  return w;
}

/**
 * Name beside an arrow tip, pushed outward along the arrow so it clears the head. A label that would leave
 * the canvas (a tip on the top or bottom row of the grid on a narrow screen) moves beside the tip instead.
 */
function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dir: Vec2, color: string, p: Palette) {
  const L = len(dir) || 1;
  // screen y grows downward; the label sits beyond the tip and a little to its left
  const ux = dir[0] / L;
  const uy = -dir[1] / L;
  let lx = x + ux * 16 - uy * 10;
  let ly = y + uy * 16 + ux * 10;
  const W = ctx.canvas.clientWidth || ctx.canvas.width;
  const H = ctx.canvas.clientHeight || ctx.canvas.height;
  const half = tagWidth(ctx, text, p) / 2;
  const padY = 11;
  if (ly < padY || ly > H - padY) {
    // off the top: beside the tip on the left (the y-axis name sits right of the axis); off the bottom: right
    const top = ly < padY;
    ly = Math.max(padY, Math.min(H - padY, y));
    lx = x + (top ? -(half + 12) : half + 12);
  }
  // the reset and full-screen buttons sit over the canvas's top-right corner
  if (lx + half > W - BUTTONS_W && ly < BUTTONS_H) {
    lx = x - half - 14;
    ly = Math.max(ly, padY);
  }
  lx = Math.max(half + 4, Math.min(W - half - 4, lx));
  tagAt(ctx, text, lx, ly, color, p);
}

function tagAt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let cx = x - tagWidth(ctx, text, p) / 2;
  for (const g of segs(text)) {
    ctx.font = `italic 700 ${TAG_FONT}px ${p.fontUi}`;
    ctx.fillText(g.t, cx, y);
    cx += ctx.measureText(g.t).width;
    if (g.sub) {
      ctx.font = `700 ${SUB_FONT}px ${p.fontUi}`;
      ctx.fillText(g.sub, cx + 1, y + 5);
      cx += ctx.measureText(g.sub).width + 1;
    }
  }
  ctx.restore();
}
