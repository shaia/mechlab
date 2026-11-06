/**
 * The launcher of lesson 0.1: a ball shot over flat ground at a chosen speed and angle, a target on
 * the ground, and the last few paths kept as faint traces so launches can be compared. Built to teach
 * how to operate a live figure (sliders, a button, tasks that tick, steps that drive it) before any
 * physics is taught; lesson 2.9 explains the motion itself.
 *
 * Every number on it comes from `launch()` in src/physics/launch.ts (RK4 under `gravity`, g = G).
 * Tasks tick only when the learner presses "שגרו" and the ball lands: a text step can set the
 * sliders or move the target, but it never launches, so it can never tick a task.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { launch, positionAt, type Flight } from '~/physics/launch';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { sci } from './core/format';
import { handNote, polyline, withAlpha } from './core/ink';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const ASPECT = 16 / 9;
/** the world shown [m]: x from X_MIN to X_MAX along the ground, y from 0 to Y_MAX */
const X_MIN = -3;
const X_MAX = 50;
const Y_MAX = 24;
const V_MIN = 10;
const V_MAX = 22;
const A_MIN = 10;
const A_MAX = 80;
/** half the width of the target [m] */
const TARGET_HALF = 1.2;
/** traces kept on screen */
const KEEP = 5;

/**
 * A quantity isolated as LTR (U+2066 … U+2069): a degree sign is a neutral character, and in RTL text it jumps
 * to the left of its number unless the two are isolated together.
 */
const ltr = (s: string) => String.fromCharCode(0x2066) + s + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  launch: 'שגרו את הכדור פעם אחת, בכפתור "שגרו".',
  'compare-30-60': `במהירות 20 מטר בשנייה: שגרו פעם בזווית ${ltr('30°')} ופעם בזווית ${ltr('60°')}. איפה נחת כל כדור?`,
  hit: 'פגעו במטרה.',
  'second-angle': `פגעו במטרה בשתי זוויות שונות מאוד (הפרש של ${ltr('10°')} לפחות), באותה מהירות שיגור.`,
};

interface Aim {
  /** launch speed [m/s] */
  v: number;
  /** launch angle above the ground [deg] */
  angle: number;
  /** centre of the target, measured from the launcher along the ground [m] */
  target: number;
}

interface Shot extends Aim {
  n: number;
  flight: Flight;
  hit: boolean;
}

export interface LaunchSandboxProps {
  id: string;
  v?: number;
  angle?: number;
  target?: number;
  tasks?: string[];
  /** lesson wording for a task, overriding the default label */
  taskLabels?: Record<string, string>;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const metres = (x: number) => `${sci(x)} m`;

export default function LaunchSandbox(props: LaunchSandboxProps) {
  const initial = (): Aim => ({
    v: clamp(props.v ?? 20, V_MIN, V_MAX),
    angle: clamp(props.angle ?? 30, A_MIN, A_MAX),
    target: props.target ?? 30,
  });
  const [aim, setAim] = useState<Aim>(initial);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flying, setFlying] = useState<Shot | null>(null);
  const [live, setLive] = useState('');
  /** loop time at which the flying ball left the launcher (set by the first frame that draws it) */
  const t0 = useRef<number | null>(null);
  /** the shot whose landing has been handled, so a frame cannot land it twice */
  const landed = useRef(0);
  const count = useRef(0);
  /** every landed shot of this visit, for the tasks that compare launches */
  const history = useRef<Shot[]>([]);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st) =>
        setAim((prev) => ({
          v: clamp(num(st.v) ?? prev.v, V_MIN, V_MAX),
          angle: clamp(num(st.angle) ?? prev.angle, A_MIN, A_MAX),
          target: num(st.target) ?? prev.target,
        })),
      ),
    [props.id],
  );

  const describe = (s: Shot) =>
    `הכדור ששוגר ב-${s.v} מטר בשנייה בזווית ${s.angle} מעלות נחת ${sci(s.flight.range)} מטר מהמשגר, אחרי ${sci(s.flight.time)} שניות. ` +
    (s.hit ? 'פגיעה במטרה.' : `החטאה: ${sci(Math.abs(s.flight.range - s.target))} מטר ${s.flight.range > s.target ? 'אחרי' : 'לפני'} המטרה.`);

  const land = (s: Shot) => {
    if (landed.current === s.n) return;
    landed.current = s.n;
    setFlying(null);
    setShots((prev) => [...prev, s].slice(-KEEP));
    setLive(describe(s));
    history.current.push(s);
    const h = history.current;
    if (s.hit) done('hit');
    if (h.some((o) => o.v === 20 && o.angle === 30) && h.some((o) => o.v === 20 && o.angle === 60)) done('compare-30-60');
    if (s.hit && h.some((o) => o.hit && o.v === s.v && o.target === s.target && Math.abs(o.angle - s.angle) >= 10)) done('second-angle');
  };

  const fire = () => {
    const flight = launch(aim.v, aim.angle);
    const n = ++count.current;
    t0.current = null;
    setFlying({ ...aim, n, flight, hit: Math.abs(flight.range - aim.target) <= TARGET_HALF });
    setLive('הכדור באוויר.');
    done('launch');
  };

  const layout = (v: View) => {
    const padX = 14;
    const padTop = 10;
    const padBottom = Math.max(26, v.h * 0.1);
    const ppm = Math.min((v.w - 2 * padX) / (X_MAX - X_MIN), (v.h - padTop - padBottom) / Y_MAX);
    const left = (v.w - ppm * (X_MAX - X_MIN)) / 2;
    const ground = v.h - padBottom;
    return { ppm, ground, sx: (x: number) => left + (x - X_MIN) * ppm, sy: (y: number) => ground - y * ppm };
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const { ppm, ground, sx, sy } = layout(view);
    const narrow = view.w < 520;
    const pt = (q: readonly [number, number]): [number, number] => [sx(q[0]), sy(q[1])];

    // the ground, with a scale: a tick every 10 m
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx(X_MIN), ground);
    ctx.lineTo(sx(X_MAX), ground);
    ctx.stroke();
    ctx.font = `${narrow ? 10 : 12}px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = 0; x <= X_MAX; x += 10) {
      ctx.beginPath();
      ctx.moveTo(sx(x), ground);
      ctx.lineTo(sx(x), ground + 5);
      ctx.stroke();
      ctx.fillText(x === 0 ? '0' : `${x} m`, sx(x), ground + 7);
    }
    ctx.restore();

    // the target: a band on the ground and a flag
    const tx0 = sx(aim.target - TARGET_HALF);
    const tx1 = sx(aim.target + TARGET_HALF);
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.28);
    ctx.fillRect(tx0, ground - 6, tx1 - tx0, 6);
    ctx.strokeStyle = p.equip;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx(aim.target), ground);
    ctx.lineTo(sx(aim.target), ground - 30);
    ctx.stroke();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.moveTo(sx(aim.target), ground - 30);
    ctx.lineTo(sx(aim.target) + 14, ground - 25);
    ctx.lineTo(sx(aim.target), ground - 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    handNote(ctx, 'מטרה', sx(aim.target), ground - 40, p, narrow ? 12 : 14);

    // earlier paths, faint, each with its angle at the landing point
    shots.forEach((s, i) => {
      const fresh = i === shots.length - 1 && !flying;
      polyline(ctx, s.flight.path.map(pt), fresh ? p.ink : p.ink3, fresh ? 2 : 1.4, { alpha: fresh ? 1 : 0.7 });
      const [lx] = pt(s.flight.path[s.flight.path.length - 1]);
      ctx.save();
      ctx.fillStyle = fresh ? p.ink : p.ink3;
      ctx.beginPath();
      ctx.arc(lx, ground, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${narrow ? 10 : 12}px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      // stagger the labels of shots that land close together
      ctx.fillText(`${s.angle}°`, lx, ground - 8 - (i % 2) * 13);
      ctx.restore();
    });

    // the launcher: a base and a barrel along the aim
    const th = (aim.angle * Math.PI) / 180;
    const [bx, by] = [sx(0), ground];
    const barrel = Math.max(22, 2.4 * ppm);
    ctx.save();
    ctx.strokeStyle = p.equip;
    ctx.fillStyle = p.equip;
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barrel * Math.cos(th), by - barrel * Math.sin(th));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, 7, Math.PI, 2 * Math.PI);
    ctx.fill();
    // the angle, from the ground to the barrel
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = p.ink2;
    ctx.beginPath();
    ctx.arc(bx, by, barrel + 8, -th, 0);
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.font = `600 ${narrow ? 11 : 13}px ${p.fontUi}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${aim.angle}°`, bx + (barrel + 12) * Math.cos(th / 2), by - (barrel + 12) * Math.sin(th / 2) - 4);
    ctx.restore();

    // the ball in flight; in still mode it lands at once and only its whole path is drawn
    if (flying) {
      if (t0.current === null) t0.current = t;
      const elapsed = motionAllowed() ? t - t0.current : flying.flight.time;
      const upTo = Math.min(elapsed, flying.flight.time);
      const k = flying.flight.times.findIndex((tt) => tt > upTo);
      const trail = (k < 0 ? flying.flight.path : flying.flight.path.slice(0, k)).map(pt);
      const ball = pt(positionAt(flying.flight, upTo));
      polyline(ctx, [...trail, ball], p.ink, 2);
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(ball[0], ball[1], 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (elapsed >= flying.flight.time) land(flying);
    } else if (shots.length > 0) {
      const s = shots[shots.length - 1];
      if (s.hit) handNote(ctx, 'פגיעה!', sx(s.target), ground - 62, p, narrow ? 15 : 19);
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, {
    worldWidth: ASPECT,
    worldHeight: 1,
    animate: flying !== null,
  });
  useEffect(invalidate, [aim, shots, flying]);

  const setV = (v: number) => setAim((a) => ({ ...a, v: clamp(Math.round(v), V_MIN, V_MAX) }));
  const setAngle = (d: number) => setAim((a) => ({ ...a, angle: clamp(Math.round(d), A_MIN, A_MAX) }));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') setAngle(aim.angle + 1);
    else if (e.key === 'ArrowDown') setAngle(aim.angle - 1);
    else if (e.key === 'ArrowRight') setV(aim.v + 1);
    else if (e.key === 'ArrowLeft') setV(aim.v - 1);
    else if (e.key === 'Enter' || e.key === ' ') fire();
    else return;
    e.preventDefault();
  };

  const last = shots[shots.length - 1];
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: משגר כדורים על קרקע ישרה, ומטרה במרחק ${sci(aim.target)} מטר. מהירות השיגור ${aim.v} מטר בשנייה, הזווית ${aim.angle} מעלות. במקלדת: חץ למעלה ולמטה משנה את הזווית, ימינה ושמאלה את המהירות, Enter משגר.`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        setAim(initial());
        setShots([]);
        setFlying(null);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        flying ? (
          <span>הכדור באוויר…</span>
        ) : last ? (
          <>
            <span>
              נחת במרחק <b class="q">{metres(last.flight.range)}</b> מהמשגר
            </span>
            <span>
              זמן באוויר <b class="q">{sci(last.flight.time)} s</b>
            </span>
            <span>
              גובה מרבי <b class="q">{metres(last.flight.peak)}</b>
            </span>
            <span>
              {last.hit ? (
                <b>פגיעה במטרה ✓</b>
              ) : (
                <>
                  החטאה: <b class="q">{metres(Math.abs(last.flight.range - last.target))}</b>{' '}
                  {last.flight.range > last.target ? 'אחרי המטרה' : 'לפני המטרה'}
                </>
              )}
            </span>
          </>
        ) : (
          <span>
            קבעו מהירות וזווית, ולחצו על "שגרו". המטרה במרחק <b class="q">{metres(aim.target)}</b> מהמשגר.
          </span>
        )
      }
      controls={
        <>
          <Slider label="מהירות השיגור" value={aim.v} min={V_MIN} max={V_MAX} step={1} format={(v) => `${v} m/s`} onChange={setV} />
          <Slider label="זווית מעל הקרקע" value={aim.angle} min={A_MIN} max={A_MAX} step={1} format={(d) => `${d}°`} onChange={setAngle} />
          <div class="group" role="group" aria-label="שיגור">
            <button type="button" class="btn primary" onClick={fire}>
              שגרו
            </button>
          </div>
          <div class="group ltr-space" role="group" aria-label="כיוון עדין של הזווית">
            <button type="button" class="toggle" aria-label="הקטנת הזווית במעלה אחת" onClick={() => setAngle(aim.angle - 1)}>
              −1°
            </button>
            <button type="button" class="toggle" aria-label="הגדלת הזווית במעלה אחת" onClick={() => setAngle(aim.angle + 1)}>
              +1°
            </button>
          </div>
        </>
      }
    />
  );
}
