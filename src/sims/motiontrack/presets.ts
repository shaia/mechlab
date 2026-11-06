/**
 * MotionTrack presets, sliders, layers and tasks. The public documentation is the docstring of
 * ../MotionTrack.tsx; this file holds the data it describes. Every motion is built by
 * ~/physics/kinematics, so no number on screen comes from anywhere else.
 */

import {
  brake,
  constantAcceleration,
  flight,
  legs,
  makeMotion,
  stoppingTime,
  uniform,
  type Motion,
} from '~/physics/kinematics';

export type PresetId =
  | 'walk-back-and-forth'
  | 'uniform'
  | 'two-cars-meet'
  | 'stop-and-go'
  | 'curved-xt'
  | 'brake-to-stop'
  | 'constant-acceleration'
  | 'throw-up'
  | 'drop-two-masses'
  | 'piecewise-vt';

export type SliderId = 'x0' | 'v0' | 'a' | 'x02' | 'v2' | 'dt' | 'm' | 'm2' | 't1';
export type Params = Record<SliderId, number>;
export type Layer = 'trail' | 'v-arrow' | 'a-arrow' | 'secant' | 'tangent' | 'area' | 'counters';
export type GraphId = 'x' | 'v' | 'a';
export type Orientation = 'horizontal' | 'vertical';

export interface SliderDef {
  label: string;
  min: number;
  max: number;
  step: number;
  /** shown after the value */
  unit: string;
}

export interface Preset {
  /** accessible name of the figure */
  title: string;
  orientation: Orientation;
  /** length of the time axis [s] */
  T: (p: Params) => number;
  defaults: Partial<Params>;
  sliders: SliderId[];
  sliderDefs: Partial<Record<SliderId, SliderDef>>;
  layers: Layer[];
  toggles: Layer[];
  graphs: GraphId[];
  /** world positions the track and the x–t graph always cover [lo, hi] (m) */
  window: [number, number];
  /** world position of the ground, drawn as a floor (vertical presets) */
  ground?: number;
  /** names of the bodies */
  names: [string, string?];
  /** default display position of the marked line (stop line, target height), with its label */
  line?: number;
  lineLabel?: string;
  /** the second body is the same motion in another lane, drawn with a size set by m / m2 */
  massBodies?: boolean;
  build: (p: Params) => { A: Motion; B?: Motion };
}

export const BASE_PARAMS: Params = { x0: 0, v0: 0, a: 0, x02: 0, v2: 0, dt: 1, m: 1, m2: 1, t1: 0 };

export const LAYER_LABEL: Record<Layer, string> = {
  trail: 'תרשים עקבות',
  'v-arrow': 'חץ מהירות',
  'a-arrow': 'חץ תאוצה',
  secant: 'מיתר',
  tangent: 'משיק',
  area: 'שטח',
  counters: 'העתק ודרך',
};

export const SLIDER_BASE: Record<SliderId, SliderDef> = {
  x0: { label: 'מקום התחלתי x₀', min: -10, max: 20, step: 1, unit: 'm' },
  v0: { label: 'מהירות התחלתית v₀', min: -10, max: 10, step: 0.5, unit: 'm/s' },
  a: { label: 'תאוצה a', min: -5, max: 5, step: 0.5, unit: 'm/s²' },
  x02: { label: 'מקום התחלתי של B', min: 0, max: 80, step: 1, unit: 'm' },
  v2: { label: 'מהירות של B', min: -10, max: 10, step: 0.5, unit: 'm/s' },
  dt: { label: 'Δt', min: 0.001, max: 3, step: 0, unit: 's' },
  m: { label: 'מסת A', min: 0.5, max: 10, step: 0.5, unit: 'kg' },
  m2: { label: 'מסת B', min: 0.5, max: 10, step: 0.5, unit: 'kg' },
  t1: { label: 'מתחילים מ־t₁', min: 0, max: 10, step: 0.05, unit: 's' },
};

/**
 * Δt slider: index i in 0..DT_STEPS picks DT_STOPS[i], a 1-2-5 ladder from 1 ms to 3 s. Δt grows to the right
 * (the range input is LTR), and the stops hold the round values a lesson's table reads (2, 1, 0.5, 0.1, 0.01 s).
 */
export const DT_STOPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 1.5, 2, 2.5, 3];
export const DT_STEPS = DT_STOPS.length - 1;
export const dtOfIndex = (i: number) => DT_STOPS[Math.max(0, Math.min(DT_STEPS, Math.round(i)))];
/** the stop nearest to dt on a log scale */
export const indexOfDt = (dt: number) => {
  let best = 0;
  for (let i = 1; i <= DT_STEPS; i++) if (Math.abs(Math.log(DT_STOPS[i] / dt)) < Math.abs(Math.log(DT_STOPS[best] / dt))) best = i;
  return best;
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const PRESETS: Record<PresetId, Preset> = {
  'walk-back-and-forth': {
    title: 'הולך על קו ישר: הולך, חוזר, עומד וממשיך',
    orientation: 'horizontal',
    T: () => 10,
    defaults: { x0: 1 },
    sliders: [],
    sliderDefs: {},
    layers: ['counters'],
    toggles: ['trail', 'counters', 'v-arrow'],
    graphs: ['x'],
    window: [-1, 9],
    names: ['הולך'],
    build: (p) => ({
      A: legs(p.x0, [
        { dur: 3, v: 2 },
        { dur: 2, v: -3 },
        { dur: 2, v: 0 },
        { dur: 2, v: 1 },
        { dur: Infinity, v: 0 },
      ]),
    }),
  },

  uniform: {
    title: 'גוף בתנועה קצובה',
    orientation: 'horizontal',
    T: () => 10,
    defaults: { x0: 0, v0: 1 },
    sliders: ['x0', 'v0'],
    // the velocity never changes in uniform motion, so "initial velocity v₀" would mislead (lesson 1.3)
    sliderDefs: { v0: { ...SLIDER_BASE.v0, label: 'מהירות v' } },
    layers: [],
    toggles: ['trail', 'v-arrow', 'secant'],
    graphs: ['x', 'v'],
    window: [0, 20],
    names: ['גוף'],
    build: (p) => ({ A: uniform(p.x0, p.v0) }),
  },

  'two-cars-meet': {
    title: 'שני גופים על ציר אחד',
    orientation: 'horizontal',
    T: () => 12,
    defaults: { x0: 0, v0: 2, x02: 40, v2: 1 },
    sliders: ['x0', 'v0', 'x02', 'v2'],
    sliderDefs: {
      x0: { ...SLIDER_BASE.x0, label: 'מקום התחלתי של A', min: 0, max: 60 },
      v0: { ...SLIDER_BASE.v0, label: 'מהירות של A' },
      x02: { ...SLIDER_BASE.x02, min: 0, max: 60 },
    },
    layers: [],
    toggles: ['trail', 'v-arrow'],
    graphs: ['x', 'v'],
    window: [0, 60],
    names: ['A', 'B'],
    build: (p) => ({ A: uniform(p.x0, p.v0), B: uniform(p.x02, p.v2) }),
  },

  'stop-and-go': {
    title: 'נסיעה עם עצירה וחזרה לאחור',
    orientation: 'horizontal',
    T: () => 12,
    defaults: { x0: 0 },
    sliders: [],
    sliderDefs: {},
    layers: ['counters'],
    toggles: ['trail', 'counters', 'v-arrow'],
    graphs: ['x', 'v'],
    window: [0, 18],
    names: ['גוף'],
    build: (p) => ({
      A: legs(p.x0, [
        { dur: 3, v: 4 },
        { dur: 2, v: 0 },
        { dur: 2, v: 2 },
        { dur: 4, v: -3 },
        { dur: Infinity, v: 0 },
      ]),
    }),
  },

  'curved-xt': {
    title: 'גוף שהמהירות שלו משתנה: גרף מקום-זמן מעוקל',
    orientation: 'horizontal',
    T: () => 10,
    defaults: { x0: 2, v0: 1, dt: 2 },
    sliders: ['dt'],
    sliderDefs: {},
    layers: ['secant', 'tangent'],
    toggles: ['secant', 'tangent', 'v-arrow'],
    graphs: ['x', 'v'],
    window: [0, 18],
    names: ['גוף'],
    build: (p) => ({
      A: makeMotion(p.x0, p.v0, [
        { dur: 3, a: 1.5 },
        { dur: 4, a: -3 },
        { dur: Infinity, a: 2.5 },
      ]),
    }),
  },

  'brake-to-stop': {
    title: 'רכב בולם עד לעצירה',
    orientation: 'horizontal',
    T: (p) => clamp(Math.ceil(stoppingTime(p.v0, p.a) + 1), 4, 31),
    defaults: { x0: 0, v0: 16, a: -4 },
    sliders: ['v0', 'a'],
    sliderDefs: {
      v0: { label: 'מהירות התחלתית v₀', min: 0, max: 30, step: 1, unit: 'm/s' },
      a: { label: 'תאוצה a', min: -10, max: -1, step: 0.5, unit: 'm/s²' },
    },
    layers: ['v-arrow', 'a-arrow'],
    toggles: ['trail', 'v-arrow', 'a-arrow'],
    graphs: ['x', 'v', 'a'],
    window: [0, 50],
    names: ['רכב'],
    line: 40,
    lineLabel: 'קו עצירה',
    build: (p) => ({ A: brake(p.x0, p.v0, -p.a) }),
  },

  'constant-acceleration': {
    title: 'גוף בתאוצה קבועה',
    orientation: 'horizontal',
    T: () => 8,
    defaults: { x0: 0, v0: 4, a: -2 },
    sliders: ['x0', 'v0', 'a'],
    sliderDefs: {
      x0: { ...SLIDER_BASE.x0, min: -10, max: 10 },
      v0: { ...SLIDER_BASE.v0, step: 1 },
    },
    layers: ['v-arrow', 'a-arrow'],
    toggles: ['trail', 'v-arrow', 'a-arrow', 'tangent'],
    graphs: ['x', 'v', 'a'],
    window: [-10, 10],
    names: ['גוף'],
    build: (p) => ({ A: constantAcceleration(p.x0, p.v0, p.a) }),
  },

  'throw-up': {
    title: 'זריקה אנכית כלפי מעלה',
    orientation: 'vertical',
    T: (p) => {
      const m = flight(p.x0, p.v0, 0);
      return clamp(Math.ceil(m.end * 2) / 2 + 0.5, 3, 14);
    },
    defaults: { x0: 0, v0: 15 },
    sliders: ['v0', 'x0'],
    sliderDefs: {
      v0: { label: 'מהירות הזריקה v₀', min: 0, max: 30, step: 1, unit: 'm/s' },
      x0: { label: 'גובה הזריקה', min: 0, max: 40, step: 5, unit: 'm' },
    },
    layers: ['v-arrow', 'a-arrow'],
    toggles: ['trail', 'v-arrow', 'a-arrow'],
    graphs: ['x', 'v', 'a'],
    window: [0, 25],
    ground: 0,
    names: ['כדור'],
    line: 20,
    lineLabel: 'גובה יעד',
    build: (p) => ({ A: flight(p.x0, p.v0, 0) }),
  },

  'drop-two-masses': {
    title: 'שני כדורים בעלי מסות שונות נופלים יחד',
    orientation: 'vertical',
    T: (p) => clamp(Math.ceil(flight(p.x0, 0, 0).end * 2) / 2 + 0.5, 2, 8),
    defaults: { x0: 20, v0: 0, m: 1, m2: 1 },
    sliders: ['m', 'm2'],
    sliderDefs: {},
    layers: ['trail'],
    toggles: ['trail', 'v-arrow', 'a-arrow'],
    graphs: ['x', 'v'],
    window: [0, 25],
    ground: 0,
    names: ['A', 'B'],
    massBodies: true,
    build: (p) => ({ A: flight(p.x0, 0, 0), B: flight(p.x0, 0, 0) }),
  },

  'piecewise-vt': {
    title: 'תנועה שמורכבת מכמה קטעי תאוצה קבועה',
    orientation: 'horizontal',
    T: () => 11,
    defaults: { x0: 0, t1: 0 },
    sliders: ['t1'],
    sliderDefs: {},
    layers: ['area'],
    toggles: ['area', 'trail', 'v-arrow'],
    graphs: ['x', 'v', 'a'],
    window: [-2, 10],
    names: ['גוף'],
    build: (p) => ({
      A: makeMotion(p.x0, 0, [
        { dur: 2, a: 2 },
        { dur: 1, a: 0 },
        { dur: Infinity, a: -2 },
      ]),
    }),
  },
};

export type TaskId =
  | 'move-origin'
  | 'flip-axis'
  | 'zero-displacement'
  | 'find-rest'
  | 'find-turn'
  | 'set-velocity'
  | 'negative-velocity'
  | 'make-them-meet'
  | 'shrink-secant'
  | 'find-fastest'
  | 'tangent-flat'
  | 'speed-up-negative'
  | 'stop-at-line'
  | 'pause-at-top'
  | 'change-mass'
  | 'reach-height'
  | 'area-equals-dx'
  | 'net-area-zero';

export const TASK_LABEL: Record<TaskId, string> = {
  'move-origin': 'גררו את הראשית של הציר למקום אחר. מה קרה למקום הגוף, ומה לא השתנה?',
  'flip-axis': 'הפכו את הכיוון החיובי של הציר. אילו גדלים החליפו סימן?',
  'zero-displacement': 'מצאו רגע שבו ההעתק מתחילת התנועה הוא אפס, אבל הדרך שהגוף עבר גדולה מאפס.',
  'find-rest': 'מצאו רגע שבו הגוף במנוחה.',
  'find-turn': 'מצאו רגע שבו הגוף מחליף כיוון.',
  'set-velocity': 'כוונו את המקום ההתחלתי ואת המהירות כך שהקו בגרף יעבור דרך הנקודה המסומנת.',
  'negative-velocity': 'הגדירו מהירות שלילית. לאן נע הגוף, ומה קורה לקו בגרף?',
  'make-them-meet': 'כוונו את הגופים כך שייפגשו בתוך הזמן שמוצג בגרף.',
  'shrink-secant': 'הקטינו את Δt עד שהמיתר כמעט חופף למשיק (Δt של 0.05 שנייה או פחות).',
  'find-fastest': 'מצאו את הרגע שבו הגוף מהיר ביותר, לפי שיפוע הגרף.',
  'tangent-flat': 'מצאו רגע שבו המשיק אופקי. מה המהירות באותו רגע?',
  'speed-up-negative': 'מצאו מצב שבו המהירות שלילית והתאוצה שלילית. הגוף מאיץ או מאט?',
  'stop-at-line': 'כוונו את המהירות ואת התאוצה כך שהרכב ייעצר ליד קו העצירה.',
  'pause-at-top': 'עצרו את האנימציה בנקודה הגבוהה ביותר. מה התאוצה שם?',
  'change-mass': 'שנו את המסה של אחד הכדורים (לפחות פי חמישה מהשני) והפילו אותם. מי מגיע ראשון?',
  'reach-height': 'כוונו את מהירות הזריקה כך שהכדור יגיע בדיוק לקו המסומן.',
  'area-equals-dx': 'בחרו קטע זמן שאינו מתחיל באפס והשוו בין השטח מתחת לגרף v–t להעתק.',
  'net-area-zero': 'מצאו פרק זמן (מ-t₁ עד הסמן) שבו השטח מתחת לגרף v–t, עם הסימן, הוא אפס, אף שהגוף זז כל הזמן.',
};
