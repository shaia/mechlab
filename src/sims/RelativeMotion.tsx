/**
 * RelativeMotion: two bodies, A and B, on parallel straight tracks, each with its own signed velocity,
 * seen from a frame the learner chooses (lesson 1.4).
 *
 * Model: uniform motion along one axis, positive to the right (src/physics/relative.ts). In the frame of
 * body F the observer sees every position as x − x_F(t) (F stays where it started on the screen, the
 * ground tick marks slide past) and every velocity as v − v_F. Velocity arrows are drawn at 2 m of track
 * per 1 m/s, the same in every frame, and always carry their sign as text. Notation: v_AB = v_A − v_B is
 * the velocity of A as seen from B.
 *
 * Props (Astro wrapper: <Spread figure={RelativeMotion} figureProps={{ id: 'fig-1-4', … }}>)
 *   id        figure id (required); steps address the figure by it, tasks are stored as `${id}:${task}`
 *   vA, vB    start velocities [m/s], integers in [−vMax, vMax]            (default −2, 2: they approach)
 *   xA, xB    start positions on the ground axis [m]                       (default +12, −12)
 *   frame     'ground' | 'A' | 'B'                                         (default 'ground')
 *   t         start time [s]                                               (default 0)
 *   duration  length of the time slider [s]                                (default 6)
 *   span      half-width of the visible stretch of track [m]               (default 60)
 *   vMax      largest |velocity| the sliders allow [m/s]                   (default 6)
 *   shapeA, shapeB   'car' | 'person' | 'bike'                             (default 'car')
 *   showGap   draw the gap between the bodies and the meeting readout      (default true)
 *   tasks     task ids to show (below)
 *
 * Step `set` keys (Step state={{…}}): vA, vB, xA, xB (numbers), frame ('ground'|'A'|'B'), t (number),
 * playing (boolean). Unknown keys are ignored; numbers are clamped.
 *
 * Tasks, ticked only by the learner's own actions (a step's `set` clears what counts as "own", so a state a
 * step produced never ticks a task):
 *   frame-of-a     the learner switches the view to A while A's ground velocity is not 0 (A then stands still)
 *   same-velocity  the learner sets vA = vB ≠ 0 (the gap stays constant)
 *   closing-speed  the learner makes the velocities opposite (vA·vB < 0) with the bodies approaching, so the
 *                  gap shrinks by |vB − vA| each second
 *   overtake       the learner makes B and A move the same way with |vB| > |vA| and B behind A (it starts on the
 *                  side A moves away from), so B catches A and passes it. The meeting may lie beyond the time
 *                  slider: the readout still gives its time, and the task tests the overtaking condition itself.
 *
 * Readout notation: in the ground frame v_A, v_B; in the frame of B, A's velocity is v_AB and B is marked as the
 * frame ("עומד: מערכת הייחוס"), never "v_B = 0", because v_B means B's velocity relative to the ground.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { closingSpeed, gapAt, meetingTime, positionAt, velocityInFrame } from '~/physics/relative';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { label, plain, signed } from './core/text';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Frame = 'ground' | 'A' | 'B';
type Shape = 'car' | 'person' | 'bike';

const ASPECT = 1.9;
const ARROW_M_PER_MS = 2;

const TASK_LABEL: Record<string, string> = {
  'frame-of-a': 'עברו למבט של A בזמן ש-A נע. איך נראה A עכשיו, ומה קרה לשאר העולם?',
  'same-velocity': 'קבעו את המהירויות כך שהמרחק בין הגופים לא ישתנה, וש-A ו-B יזוזו.',
  'closing-speed': 'קבעו שהגופים נעים זה לקראת זה. כמה מטרים בשנייה קטן המרחק ביניהם?',
  overtake: 'קבעו את המהירויות כך ש-B ישיג את A ויעקוף אותו, כששניהם נעים לאותו כיוון.',
};

export interface RelativeMotionProps {
  id: string;
  vA?: number;
  vB?: number;
  xA?: number;
  xB?: number;
  frame?: Frame;
  t?: number;
  duration?: number;
  span?: number;
  vMax?: number;
  shapeA?: Shape;
  shapeB?: Shape;
  showGap?: boolean;
  tasks?: string[];
}

interface State {
  vA: number;
  vB: number;
  xA: number;
  xB: number;
  frame: Frame;
  t: number;
  playing: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function initial(p: RelativeMotionProps): State {
  const vMax = p.vMax ?? 6;
  return {
    vA: clamp(p.vA ?? -2, -vMax, vMax),
    vB: clamp(p.vB ?? 2, -vMax, vMax),
    xA: p.xA ?? 12,
    xB: p.xB ?? -12,
    frame: p.frame ?? 'ground',
    t: p.t ?? 0,
    playing: false,
  };
}

const frameName = (f: Frame) => (f === 'ground' ? 'הקרקע' : f);
const fromFrame = (f: Frame) => (f === 'ground' ? 'מהקרקע' : `מ-${f}`);

export default function RelativeMotion(props: RelativeMotionProps) {
  const T = props.duration ?? 6;
  const span = props.span ?? 60;
  const vMax = props.vMax ?? 6;
  const showGap = props.showGap ?? true;
  const shapes: Record<'A' | 'B', Shape> = { A: props.shapeA ?? 'car', B: props.shapeB ?? 'car' };

  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** state keys the learner changed since the last step/mount; tasks look only at these */
  const touched = useRef(new Set<string>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  /** a change made by the learner */
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
          for (const k of ['vA', 'vB'] as const) if (typeof st[k] === 'number') next[k] = clamp(st[k] as number, -vMax, vMax);
          for (const k of ['xA', 'xB'] as const) if (typeof st[k] === 'number') next[k] = st[k] as number;
          if (typeof st.t === 'number') next.t = clamp(st.t, 0, T);
          if (st.frame === 'ground' || st.frame === 'A' || st.frame === 'B') next.frame = st.frame;
          if (typeof st.playing === 'boolean') next.playing = st.playing;
          return next;
        });
      }),
    [props.id, T, vMax],
  );

  // playback: advances t, stops at the end; frozen in still mode
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        const t = prev.t + dt;
        return t >= T ? { ...prev, t: T, playing: false } : { ...prev, t };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, T]);

  // tasks
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    const tStar = meetingTime(s.xA, s.vA, s.xB, s.vB);
    if (has('frame-of-a') && own('frame') && s.frame === 'A' && s.vA !== 0) done('frame-of-a');
    if (has('same-velocity') && own('vA', 'vB') && s.vA === s.vB && s.vA !== 0) done('same-velocity');
    if (has('closing-speed') && own('vA', 'vB') && s.vA * s.vB < 0 && closingSpeed(s.xA, s.vA, s.xB, s.vB) > 0) done('closing-speed');
    if (
      has('overtake') &&
      own('vA', 'vB') &&
      s.vA * s.vB > 0 &&
      Math.abs(s.vB) > Math.abs(s.vA) &&
      tStar !== null &&
      tStar > 0
    )
      done('overtake');
  }, [s, props.id, props.tasks]);

  // screen-reader line, debounced so dragging a slider does not read out every step
  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s)), 700);
    return () => clearTimeout(h);
  }, [s.vA, s.vB, s.frame]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s, { span, showGap, shapes });

  const { canvasRef, invalidate } = useFigureCanvas(draw, {
    worldWidth: 2 * span,
    worldHeight: (2 * span) / ASPECT,
    animate: false,
  });
  useEffect(invalidate, [s]);

  const reset = () => {
    touched.current.clear();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  // readout, all in the ground frame except the two velocities, which follow the chosen frame
  const vF = s.frame === 'A' ? s.vA : s.frame === 'B' ? s.vB : 0;
  const vAv = velocityInFrame(s.vA, vF);
  const vBv = velocityInFrame(s.vB, vF);
  const gap = Math.abs(gapAt(s.xA, s.vA, s.xB, s.vB, s.t));
  const tStar = meetingTime(s.xA, s.vA, s.xB, s.vB);
  const remaining = tStar === null ? null : tStar - s.t;
  const rate = closingSpeed(s.xA, s.vA, s.xB, s.vB);
  /** one velocity in the readout: the frame body is marked as the frame, never given a "v_B = 0" */
  const vRead = (name: 'A' | 'B', v: number) =>
    s.frame === name ? (
      <span>
        <b>{name}</b> עומד: זו מערכת הייחוס
      </span>
    ) : (
      <span class="q">
        <i>v</i>
        <sub>{s.frame === 'ground' ? name : name + s.frame}</sub> = {signed(v)} m/s
      </span>
    );

  let meetText: string;
  if (s.vA === s.vB) meetText = 'המרחק קבוע';
  else if (remaining === null) meetText = 'הגופים מתרחקים, לא ייפגשו';
  else if (remaining < -1e-9) meetText = 'כבר עברו זה את זה';
  else meetText = remaining < 1e-9 ? 'הגופים נפגשים עכשיו' : `נפגשים בעוד ${plain(remaining, 3)} s`;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: שני גופים, A ו-B, על מסלולים מקבילים. מבט ${fromFrame(s.frame)}. ${describe(s)} המרחק ביניהם ${plain(gap, 3)} מטרים.`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span>
            מבט <b>{fromFrame(s.frame)}</b>
          </span>
          {vRead('A', vAv)}
          {vRead('B', vBv)}
          {showGap && (
            <>
              <span>
                המרחק: <b class="q">{plain(gap, 3)} m</b>
              </span>
              {rate > 0 && (
                <span>
                  מהירות ההתקרבות: <b class="q">{plain(rate, 3)} m/s</b>
                </span>
              )}
              <span>{meetText}</span>
            </>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מערכת ייחוס">
            <span class="hint">מבט מ:</span>
            {(['ground', 'A', 'B'] as Frame[]).map((f) => (
              <Toggle key={f} label={frameName(f)} on={s.frame === f} onChange={() => change({ frame: f })} />
            ))}
          </div>
          <Slider
            label="מהירות A"
            min={-vMax}
            max={vMax}
            step={1}
            value={s.vA}
            format={(v) => `${signed(v)} m/s`}
            onChange={(v) => change({ vA: v })}
          />
          <Slider
            label="מהירות B"
            min={-vMax}
            max={vMax}
            step={1}
            value={s.vB}
            format={(v) => `${signed(v)} m/s`}
            onChange={(v) => change({ vB: v })}
          />
          <div class="group" role="group" aria-label="זמן">
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => {
                if (on && s.t >= T) setS((prev) => ({ ...prev, t: 0, playing: true }));
                else setS((prev) => ({ ...prev, playing: on }));
              }}
            />
          </div>
          <Slider
            label="זמן"
            min={0}
            max={T}
            step={0.1}
            value={s.t}
            format={(v) => `${plain(v, 2)} s`}
            onChange={(v) => setS((prev) => ({ ...prev, t: v, playing: false }))}
          />
        </>
      }
    />
  );
}

function describe(s: State): string {
  const f = s.frame === 'ground' ? 'מהקרקע' : `מ-${s.frame}`;
  const vf = s.frame === 'A' ? s.vA : s.frame === 'B' ? s.vB : 0;
  const a = signed(velocityInFrame(s.vA, vf));
  const b = signed(velocityInFrame(s.vB, vf));
  if (s.frame === 'A') return `במבט מ-A, A עומד, ומהירות B ביחס ל-A היא ${b} מטר לשנייה. החיובי הוא ימינה.`;
  if (s.frame === 'B') return `במבט מ-B, B עומד, ומהירות A ביחס ל-B היא ${a} מטר לשנייה. החיובי הוא ימינה.`;
  return `במבט ${f}, מהירות A היא ${a} מטר לשנייה ומהירות B היא ${b} מטר לשנייה. החיובי הוא ימינה.`;
}

interface PaintOpts {
  span: number;
  showGap: boolean;
  shapes: Record<'A' | 'B', Shape>;
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, o: PaintOpts) {
  const { w, h, ppm } = view;
  // body positions on the ground axis at time t, and the camera shift for the chosen frame
  const xA = positionAt(s.xA, s.vA, s.t);
  const xB = positionAt(s.xB, s.vB, s.t);
  const shift = s.frame === 'A' ? xA - s.xA : s.frame === 'B' ? xB - s.xB : 0;
  const sx = (x: number) => toScreen(view, x - shift, 0)[0];
  const vF = s.frame === 'A' ? s.vA : s.frame === 'B' ? s.vB : 0;

  const yA = h * 0.28;
  const yB = h * 0.8;
  const bw = Math.max(30, Math.min(58, 7 * ppm));
  const bh = bw * 0.52;

  // ground: a track line per body with tick marks every 10 m that slide when the frame moves
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.fillStyle = p.ink3;
  ctx.lineWidth = 1.2;
  for (const y of [yA, yB]) {
    const base = y + bh / 2 + 5;
    ctx.beginPath();
    ctx.moveTo(0, base);
    ctx.lineTo(w, base);
    ctx.stroke();
    const g0 = Math.ceil((shift - o.span) / 10) * 10;
    for (let g = g0; g <= shift + o.span; g += 10) {
      const x = sx(g);
      const major = g % 20 === 0;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, base + (major ? 8 : 5));
      ctx.stroke();
      if (major && y === yB) label(ctx, p, plain(g), x, base + 17, { size: 11, weight: 500, color: p.ink3 }, false);
    }
  }
  ctx.restore();

  // the gap, drawn between the two tracks
  const cA = sx(xA);
  const cB = sx(xB);
  if (o.showGap) {
    const gy = yA + (yB - yA) * 0.4;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = withAlpha(p.ink2, 0.55);
    ctx.lineWidth = 1.2;
    for (const [c, y] of [[cA, yA], [cB, yB]] as const) {
      ctx.beginPath();
      ctx.moveTo(c, y);
      ctx.lineTo(c, gy);
      ctx.stroke();
    }
    ctx.restore();
    if (Math.abs(cA - cB) > 14) {
      arrow(ctx, cA, gy, cB, gy, { color: p.ink2, width: 1.6, head: 8 });
      arrow(ctx, cB, gy, cA, gy, { color: p.ink2, width: 1.6, head: 8 });
    }
    const gap = Math.abs(xB - xA);
    label(ctx, p, `${plain(gap, 3)} m`, (cA + cB) / 2, gy - 11, { size: 13, color: p.ink }, false);
  }

  const body = (name: 'A' | 'B', c: number, y: number, v: number, color: string) => {
    const vView = v - vF;
    const left = c < 0;
    const right = c > w;
    if (left || right) {
      // off the visible stretch: an edge marker with the letter
      const ex = left ? 14 : w - 14;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ex + (left ? -9 : 9), y);
      ctx.lineTo(ex + (left ? 5 : -5), y - 9);
      ctx.lineTo(ex + (left ? 5 : -5), y + 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      label(ctx, p, name, ex + (left ? 18 : -18), y, { size: 15, italic: true, weight: 700, color }, false);
      return;
    }
    drawBody(ctx, p, o.shapes[name], name, c, y, bw, bh, color);
    // velocity arrow in the chosen frame, with its sign as text
    const ay = y - bh / 2 - 15;
    if (vView !== 0) {
      arrow(ctx, c, ay, c + vView * ARROW_M_PER_MS * ppm, ay, { color: p.velocity, width: 3, head: 11 });
    } else {
      ctx.save();
      ctx.fillStyle = p.velocity;
      ctx.beginPath();
      ctx.arc(c, ay, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (s.frame === name) {
      // the frame body: it stands still by definition, so it gets no velocity symbol (v_B means "relative to the ground")
      label(ctx, p, 'מערכת הייחוס', clamp(c, 50, w - 50), ay - 11, { size: 12, weight: 600, color: p.ink2 });
      return;
    }
    const sub = s.frame === 'ground' ? name : name + s.frame;
    const text = vView === 0 ? '= 0' : `= ${signed(vView)} m/s`;
    velocityLabel(ctx, p, sub, text, clamp(c, 44, w - 44), ay - 11, p.velocity);
  };
  body('A', cA, yA, s.vA, p.equip);
  body('B', cB, yB, s.vB, p.hand);

  // which frame we look from
  label(ctx, p, `מבט ${fromFrame(s.frame)}`, 10, 14, { size: 13, color: p.ink2, align: 'left' });
  if (s.frame !== 'ground') {
    const c = s.frame === 'A' ? cA : cB;
    const y = s.frame === 'A' ? yA : yB;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = s.frame === 'A' ? p.equip : p.hand;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(c - bw / 2 - 5, y - bh / 2 - 5, bw + 10, bh + 10);
    ctx.restore();
  }
}

/** "v" + subscript + value, centred on x. The subscript is drawn smaller and lower. */
function velocityLabel(ctx: CanvasRenderingContext2D, p: Palette, sub: string, value: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  const big = `italic 700 14px ${p.fontUi}`;
  const small = `italic 700 10px ${p.fontUi}`;
  const normal = `600 13px ${p.fontUi}`;
  ctx.font = big;
  const w1 = ctx.measureText('v').width;
  ctx.font = small;
  const w2 = ctx.measureText(sub).width;
  ctx.font = normal;
  const w3 = ctx.measureText(' ' + value).width;
  let cx = x - (w1 + w2 + w3) / 2;
  ctx.font = big;
  ctx.fillText('v', cx, y);
  cx += w1;
  ctx.font = small;
  ctx.fillText(sub, cx, y + 4);
  cx += w2;
  ctx.font = normal;
  ctx.fillText(' ' + value, cx, y);
  ctx.restore();
}

function drawBody(ctx: CanvasRenderingContext2D, p: Palette, shape: Shape, name: string, cx: number, cy: number, bw: number, bh: number, color: string) {
  ctx.save();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = color;
  ctx.fillStyle = withAlpha(color, 0.22);
  const r = 6;
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, r);
  ctx.fill();
  ctx.stroke();
  if (shape === 'car') {
    ctx.fillStyle = color;
    for (const dx of [-bw * 0.28, bw * 0.28]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + bh / 2, bh * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (shape === 'bike') {
    // two open wheels under the rider's box, larger than a car's filled ones; no head, which would run into
    // the velocity arrow drawn just above the box
    ctx.lineWidth = 1.6;
    for (const dx of [-bw * 0.3, bw * 0.3]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + bh / 2 + bh * 0.08, bh * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy - bh / 2 - bh * 0.16, bh * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(color, 0.22);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, p, name, cx, cy, { size: Math.round(bh * 0.62), italic: true, weight: 700, color: p.ink }, false);
}

