/**
 * MotionTrack's canvas painters: the layout, the track diagram and the three graphs. Pure drawing:
 * every number comes from ~/physics/kinematics through the Model.
 */

import {
  areaAT,
  areaVT,
  meetings,
  pieces,
  position,
  velocity,
  type Motion,
} from '~/physics/kinematics';
import type { Palette } from '../core/canvas';
import { sci } from '../core/format';
import { arrow, withAlpha } from '../core/ink';
import { drawAxes, insetBox, makePlot, niceTicks, type Box, type Plot } from '../core/plot';
import { Ad, secantWindow, Vd, Xd, type Model, type State } from './model';
import type { GraphId, Orientation } from './presets';

export type LayoutKind = 'row' | 'col' | 'side' | 'tall';

export interface Layout {
  kind: LayoutKind;
  track: Box;
  graphs: { id: GraphId; box: Box }[];
}

export const WIDE_FROM = 520;

export function layoutKind(cw: number, o: Orientation): LayoutKind {
  return o === 'vertical' ? (cw >= WIDE_FROM ? 'side' : 'tall') : cw >= WIDE_FROM ? 'row' : 'col';
}

const trackHeight = (hasB: boolean) => (hasB ? 178 : 120);

/** Canvas height in CSS px for a given width: the figure's aspect ratio is width / this. */
export function figureHeight(kind: LayoutKind, nG: number, hasB: boolean): number {
  switch (kind) {
    case 'row':
      return trackHeight(hasB) + (nG ? 200 : 0);
    case 'col':
      return trackHeight(hasB) + nG * 150;
    case 'tall':
      return 290 + nG * 150;
    default:
      return Math.max(340, nG * 170);
  }
}

export function layoutOf(kind: LayoutKind, w: number, h: number, graphs: GraphId[], hasB: boolean): Layout {
  const n = graphs.length;
  const gb: Layout['graphs'] = [];
  let track: Box;
  if (kind === 'row') {
    const th = trackHeight(hasB);
    track = { x: 0, y: 0, w, h: n ? th : h };
    graphs.forEach((id, i) => gb.push({ id, box: { x: (i * w) / n, y: th, w: w / n, h: h - th } }));
  } else if (kind === 'col') {
    const th = trackHeight(hasB);
    track = { x: 0, y: 0, w, h: th };
    graphs.forEach((id, i) => gb.push({ id, box: { x: 0, y: th + i * 150, w, h: 150 } }));
  } else if (kind === 'tall') {
    track = { x: 0, y: 0, w, h: 290 };
    graphs.forEach((id, i) => gb.push({ id, box: { x: 0, y: 290 + i * 150, w, h: 150 } }));
  } else {
    const tw = n ? Math.min(250, w * 0.4) : w;
    track = { x: 0, y: 0, w: tw, h };
    graphs.forEach((id, i) => gb.push({ id, box: { x: tw, y: (i * h) / n, w: w - tw, h: h / n } }));
  }
  return { kind, track, graphs: gb };
}

/** Where the plot (axes, curves) sits inside a graph panel. */
export const plotBox = (b: Box): Box => insetBox(b, { l: 54, r: 14, t: 22, b: 34 });

const minus = (s: string) => s.replace('-', '−');
export const num = (x: number, sig = 3) => (Math.abs(x) < 1e-9 ? '0' : minus(sci(x, sig)));
export const signed = (x: number, sig = 3) => (Math.abs(x) < 1e-9 ? '0' : `${x > 0 ? '+' : ''}${num(x, sig)}`);

/* ---------- the geometry the pointer handlers need ---------- */

export interface Geometry {
  layout: Layout;
  plots: { id: GraphId; plot: Plot }[];
  /** screen position of the origin marker, when it can be dragged */
  origin: { x: number; y: number } | null;
  /** convert a screen point on the track to a world position */
  trackWorld: (sx: number, sy: number) => number;
}

export interface Draw {
  ctx: CanvasRenderingContext2D;
  p: Palette;
  w: number;
  h: number;
  st: State;
  m: Model;
  layout: Layout;
  target?: [number, number];
  line?: number;
  draggableOrigin: boolean;
  selectedOrigin: boolean;
}

const heb = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = 'center') => {
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
};
const ltr = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = 'center') => {
  ctx.direction = 'ltr';
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
};

export function drawAll(d: Draw): Geometry {
  const { ctx, layout } = d;
  const trackGeo = drawTrack(d, layout.track);
  const plots: Geometry['plots'] = [];
  for (const g of layout.graphs) {
    const plot = drawGraph(d, g.id, g.box);
    plots.push({ id: g.id, plot });
  }
  ctx.direction = 'ltr';
  return { layout, plots, origin: trackGeo.origin, trackWorld: trackGeo.trackWorld };
}

/* =========================== the track =========================== */

const BODY_OFF = 16;
const ROW = 24;

function drawTrack(d: Draw, box: Box): Pick<Geometry, 'origin' | 'trackWorld'> {
  const { ctx, p, m, st } = d;
  const vertical = m.orientation === 'vertical';
  const { s, O } = m;

  // axis geometry: u runs along the axis on screen, `off` is the distance from the axis, perpendicular
  const axisX = box.x + 62;
  const axisY = box.y + box.h - 34;
  const uStart = vertical ? box.y + box.h - 26 : box.x + 44;
  const uEnd = vertical ? box.y + 30 : box.x + box.w - 44;
  const dirU = Math.sign(uEnd - uStart);
  const frac = (wv: number) => (wv - m.wlo) / (m.whi - m.wlo);
  const uOf = (wv: number) => uStart + frac(wv) * (uEnd - uStart);
  const at = (u: number, off: number): [number, number] => (vertical ? [axisX + off, u] : [u, axisY - off]);
  const trackWorld = (sx: number, sy: number) => {
    const u = vertical ? sy : sx;
    return m.wlo + ((u - uStart) / (uEnd - uStart)) * (m.whi - m.wlo);
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();

  // ground
  if (m.def.ground !== undefined) {
    const gu = uOf(m.def.ground);
    const [gx0, gy0] = at(gu, -34);
    const [gx1, gy1] = at(gu, vertical ? box.w - 70 : 0);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(box.x + 4, gy0);
      ctx.lineTo(box.x + box.w - 4, gy0);
    } else {
      ctx.moveTo(gx0, gy0);
      ctx.lineTo(gx1, gy1);
    }
    ctx.stroke();
    ctx.strokeStyle = withAlpha(p.ink3, 0.6);
    ctx.lineWidth = 1;
    if (vertical) {
      for (let x = box.x + 8; x < box.x + box.w - 8; x += 9) {
        ctx.beginPath();
        ctx.moveTo(x, gy0);
        ctx.lineTo(x - 6, gy0 + 7);
        ctx.stroke();
      }
    }
  }

  // axis line, ticks and numbers
  ctx.strokeStyle = p.ink2;
  ctx.fillStyle = p.ink2;
  ctx.lineWidth = 1.6;
  const [a0x, a0y] = at(uStart - dirU * 14, 0);
  const [a1x, a1y] = at(uEnd + dirU * 14, 0);
  ctx.beginPath();
  ctx.moveTo(a0x, a0y);
  ctx.lineTo(a1x, a1y);
  ctx.stroke();
  const dispLo = Math.min(m.xr[0], m.xr[1]);
  const dispHi = Math.max(m.xr[0], m.xr[1]);
  ctx.font = `11px ${p.fontUi}`;
  ctx.lineWidth = 1.2;
  for (const dv of niceTicks(dispLo, dispHi, vertical ? 8 : 9)) {
    const u = uOf(O + s * dv);
    const [tx0, ty0] = at(u, -5);
    const [tx1, ty1] = at(u, 5);
    ctx.beginPath();
    ctx.moveTo(tx0, ty0);
    ctx.lineTo(tx1, ty1);
    ctx.stroke();
    ctx.fillStyle = dv === 0 ? p.ink : p.ink2;
    ctx.font = `${dv === 0 ? '700 ' : ''}11px ${p.fontUi}`;
    if (vertical) {
      ctx.textBaseline = 'middle';
      ltr(ctx, num(dv, 2), axisX - 10, u, 'right');
    } else {
      ctx.textBaseline = 'top';
      ltr(ctx, num(dv, 2), u, axisY + 9, 'center');
    }
  }

  // positive direction arrow, at the end the display-positive direction points to
  {
    const atEnd = s === 1;
    const u = atEnd ? uEnd + dirU * 14 : uStart - dirU * 14;
    const sign = atEnd ? 1 : -1;
    const [x1, y1] = at(u, 0);
    const [x2, y2] = at(u + dirU * sign * 22, 0);
    arrow(ctx, x1, y1, x2, y2, { color: p.ink, width: 2.4, head: 11 });
    ctx.fillStyle = p.ink;
    ctx.font = `italic 700 14px ${p.fontUi}`;
    ctx.textBaseline = 'middle';
    const [lx, ly] = at(u + dirU * sign * 22, vertical ? 0 : 0);
    if (vertical) ltr(ctx, '+y', lx + 16, ly + (sign * dirU > 0 ? 0 : 0), 'left');
    else ltr(ctx, '+x', lx + (sign > 0 ? 4 : -4), ly - 14, sign > 0 ? 'right' : 'left');
  }

  // marked line (stop line, target height)
  if (d.line !== undefined && m.def.lineLabel) {
    const u = uOf(m.O + s * d.line);
    const [lx0, ly0] = at(u, -26);
    const [lx1, ly1] = at(u, vertical ? box.w - 70 : 62);
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = p.hand;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx0, ly0);
    ctx.lineTo(lx1, ly1);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = p.hand;
    ctx.font = `600 12px ${p.fontUi}`;
    if (vertical) {
      ctx.textBaseline = 'bottom';
      heb(ctx, m.def.lineLabel, lx1 + 6, ly1 - 3, 'left');
    } else {
      ctx.textBaseline = 'middle';
      heb(ctx, m.def.lineLabel, lx1 + 6, ly1 + 8, 'left');
    }
  }

  // origin marker
  const [ox, oy] = at(uOf(O), 0);
  ctx.beginPath();
  ctx.arc(ox, oy, d.draggableOrigin ? 9 : 6, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(p.accent, d.draggableOrigin ? 0.2 : 0.1);
  ctx.fill();
  ctx.lineWidth = d.selectedOrigin ? 3 : 2;
  ctx.strokeStyle = p.accent;
  ctx.stroke();
  if (d.draggableOrigin) {
    ctx.fillStyle = p.accent;
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.textBaseline = 'middle';
    const [hx, hy] = at(uOf(O), vertical ? -2 : 22);
    if (vertical) heb(ctx, 'ראשית', hx - 22, hy - 16, 'right');
    else heb(ctx, 'ראשית', hx, hy - 6 + 0, 'center');
  }

  // bodies
  const bodies: { mo: Motion; name: string; color: string; lane: number }[] = [{ mo: m.A, name: m.def.names[0], color: p.ink, lane: 0 }];
  if (m.B) bodies.push({ mo: m.B, name: m.def.names[1] ?? 'B', color: p.accent, lane: 1 });
  const rows = (st.layers.includes('v-arrow') ? 1 : 0) + (st.layers.includes('a-arrow') ? 1 : 0);
  const laneBase = (lane: number) => BODY_OFF + lane * (ROW * (rows + 1) + 8);

  const vMax = Math.max(1, ...bodies.map((b) => Math.max(...[0, m.T].map((tt) => Math.abs(velocity(b.mo, tt))), Math.abs(m.vr[0]), Math.abs(m.vr[1]))));
  const aMax = Math.max(1, Math.abs(m.ar[0]), Math.abs(m.ar[1]));
  const span = Math.abs(uEnd - uStart);
  const vScale = Math.min(70, span * 0.3) / vMax;
  const aScale = Math.min(70, span * 0.3) / aMax;

  // dot trail
  if (st.layers.includes('trail') && st.trail > 0) {
    ctx.font = `10px ${p.fontUi}`;
    for (const b of bodies) {
      const off0 = laneBase(b.lane);
      const placed: number[] = [];
      const n = Math.floor(st.t / st.trail + 1e-9);
      for (let k = 0; k <= n; k++) {
        const tk = k * st.trail;
        const u = uOf(position(b.mo, tk));
        const level = placed.filter((q) => Math.abs(q - u) < 6.5).length;
        placed.push(u);
        const [dx, dy] = at(u, off0 - 0);
        const [lx, ly] = vertical ? [dx + level * 8, dy] : [dx, dy - level * 8];
        ctx.beginPath();
        ctx.arc(lx, ly, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(b.color, 0.75);
        ctx.fill();
      }
    }
  }

  const sizeOf = (lane: number) => (m.def.massBodies ? 7 + 2.6 * Math.sqrt(lane === 0 ? m.p.m : m.p.m2) : 9);

  for (const b of bodies) {
    const off0 = laneBase(b.lane);
    const wv = position(b.mo, st.t);
    const u = uOf(wv);
    const [bx, by] = at(u, off0);
    // leg to the axis
    const [ax, ay] = at(u, 0);
    ctx.strokeStyle = withAlpha(b.color, 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    // arrows: velocity row, then acceleration row, each stacked further from the axis
    let row = 1;
    const drawArrow = (q: number, scale: number, color: string, label: string, unit: string) => {
      const off = off0 + row * ROW;
      row++;
      const du = dirU * s * q * scale;
      const [x1, y1] = at(u, off);
      const [x2, y2] = at(u + du, off);
      if (Math.abs(du) > 0.5) arrow(ctx, x1, y1, x2, y2, { color, width: 3, head: 11 });
      else {
        ctx.beginPath();
        ctx.arc(x1, y1, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      // the tip of the arrow tells the sign by direction; the text tells it by symbol
      ctx.fillStyle = color;
      ctx.font = `600 12px ${p.fontUi}`;
      const txt = `${label} = ${signed(q)} ${unit}`;
      if (b.lane === 0 || !m.B) {
        if (vertical) {
          // beside the outermost row, v above a at the body's height: a label at its own arrow's middle
          // runs across the next row's arrow, and at rest both labels sit on one line
          const [xb] = at(u, off0);
          const [xo] = at(u, off0 + rows * ROW);
          const side = xo >= xb ? 1 : -1;
          ctx.textBaseline = 'middle';
          const dy = rows > 1 ? (label === 'v' ? -9 : 9) : 0;
          ltr(ctx, txt, xo + side * 14, by + dy, side > 0 ? 'left' : 'right');
        } else {
          ctx.textBaseline = 'bottom';
          ltr(ctx, txt, x1 + du / 2, y1 - 6, 'center');
        }
      }
    };
    const sv = Vd(m, b.mo, st.t);
    const sa = Ad(m, b.mo, st.t);
    if (st.layers.includes('v-arrow')) drawArrow(sv, vScale, p.velocity, 'v', 'm/s');
    if (st.layers.includes('a-arrow')) drawArrow(sa, aScale, p.accel, 'a', 'm/s²');

    // the body
    const r = sizeOf(b.lane);
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.paper;
    ctx.stroke();
    if (m.B) {
      ctx.fillStyle = p.paper;
      ctx.font = `700 ${Math.max(10, r)}px ${p.fontUi}`;
      ctx.textBaseline = 'middle';
      ltr(ctx, b.name, bx, by + 0.5, 'center');
    }
  }

  // arrow scales
  if (rows > 0) {
    const items: [string, number, number, string, string][] = [];
    if (st.layers.includes('v-arrow')) items.push(['m/s', vScale, vMax, p.velocity, 'v']);
    if (st.layers.includes('a-arrow')) items.push(['m/s²', aScale, aMax, p.accel, 'a']);
    let k = 0;
    for (const [unit, scale, mx, color] of items) {
      const nice = niceTicks(0, mx, 2).slice(-1)[0] || 1;
      const len = nice * scale;
      // beside the reset and fullscreen buttons, never under them: left on a horizontal track, below them on a vertical one
      const bx0 = vertical ? box.x + box.w - 14 - len : box.x + 74;
      const by0 = vertical ? box.y + 56 + k * 16 : box.y + 14 + k * 16;
      k++;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx0, by0);
      ctx.lineTo(bx0 + len, by0);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = `600 11px ${p.fontUi}`;
      ctx.textBaseline = 'middle';
      ltr(ctx, `${sci(nice, 2)} ${unit}`, bx0 - 5, by0, 'right');
    }
  }

  // meeting
  if (m.B && !m.def.massBodies) {
    const xa = position(m.A, st.t);
    const xb = position(m.B, st.t);
    const met = meetings(m.A, m.B, 0.01, m.T)[0];
    if (Math.abs(xa - xb) < 0.2 && met) {
      const [mx, my] = at(uOf(xa), 0);
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(mx, my, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = p.hand;
      ctx.font = `700 12px ${p.fontUi}`;
      ctx.textBaseline = 'top';
      heb(ctx, 'נפגשים', mx, my + (vertical ? 18 : 20), 'center');
    }
  }

  ctx.restore();
  return { origin: d.draggableOrigin ? { x: ox, y: oy } : null, trackWorld };
}

/* =========================== the graphs =========================== */

const AXIS_LABEL: Record<GraphId, string> = { x: 'x (m)', v: 'v (m/s)', a: 'a (m/s²)' };
const GRAPH_TITLE: Record<GraphId, string> = { x: 'x–t', v: 'v–t', a: 'a–t' };

function drawGraph(d: Draw, id: GraphId, box: Box): Plot {
  const { ctx, p, m, st } = d;
  const pb = plotBox(box);
  const [ylo, yhi] = id === 'x' ? m.xr : id === 'v' ? m.vr : m.ar;
  const plot = makePlot(
    pb,
    { min: 0, max: m.T, label: 't (s)', ticks: niceTicks(0, m.T, box.w > 300 ? 6 : 4) },
    { min: ylo, max: yhi, label: id === 'x' && m.orientation === 'vertical' ? 'y (m)' : AXIS_LABEL[id], ticks: niceTicks(ylo, yhi, box.h > 160 ? 5 : 3) },
  );
  drawAxes(ctx, plot, p);

  // graph title
  ctx.save();
  ctx.fillStyle = id === 'v' ? p.velocity : id === 'a' ? p.accel : p.ink;
  ctx.font = `700 13px ${p.fontUi}`;
  ctx.textBaseline = 'top';
  ltr(ctx, id === 'x' && m.orientation === 'vertical' ? 'y–t' : GRAPH_TITLE[id], pb.x + 4, box.y + 4, 'left');
  ctx.restore();

  // zero line
  if (ylo < 0 && yhi > 0) {
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(pb.x, plot.py(0));
    ctx.lineTo(pb.x + pb.w, plot.py(0));
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(pb.x - 1, pb.y - 3, pb.w + 2, pb.h + 6);
  ctx.clip();

  // area layer, under the curves
  if (st.layers.includes('area') && (id === 'v' || id === 'a')) shadeArea(d, id, plot);

  const bodies: [Motion, string, boolean][] = [[m.A, id === 'x' ? p.ink : id === 'v' ? p.velocity : p.accel, false]];
  if (m.B) bodies.push([m.B, id === 'x' ? p.accent : id === 'v' ? p.velocity : p.accel, true]);
  for (const [mo, color, dashed] of bodies) trace(ctx, plot, m, mo, id, color, dashed);

  // trail markers on x–t
  if (id === 'x' && st.layers.includes('trail') && st.trail > 0) {
    const n = Math.floor(st.t / st.trail + 1e-9);
    for (let k = 0; k <= n; k++) {
      for (const [mo, color] of bodies) {
        ctx.beginPath();
        ctx.arc(plot.px(k * st.trail), plot.py(Xd(m, mo, k * st.trail)), 3, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(color, 0.7);
        ctx.fill();
      }
    }
  }

  // secant / tangent on x–t, average velocity bar on v–t
  const sec = st.layers.includes('secant');
  const tan = st.layers.includes('tangent');
  if (id === 'x' && (sec || tan)) secantTangent(d, plot, sec, tan);
  if (id === 'v' && sec) {
    const [t0, t1] = secantWindow(st.t, m.p.dt, m.T);
    const vbar = m.s * ((position(m.A, t1) - position(m.A, t0)) / (t1 - t0));
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.px(t0), plot.py(vbar));
    ctx.lineTo(plot.px(t1), plot.py(vbar));
    ctx.stroke();
    ctx.restore();
  }

  // target point on x–t
  if (id === 'x' && d.target) {
    const [tt, xx] = d.target;
    const cx = plot.px(tt);
    const cy = plot.py(xx);
    ctx.strokeStyle = p.hand;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.moveTo(cx - 13, cy);
    ctx.lineTo(cx + 13, cy);
    ctx.moveTo(cx, cy - 13);
    ctx.lineTo(cx, cy + 13);
    ctx.stroke();
  }
  // marked line on x–t
  if (id === 'x' && d.line !== undefined && m.def.lineLabel) {
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = p.hand;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(pb.x, plot.py(d.line));
    ctx.lineTo(pb.x + pb.w, plot.py(d.line));
    ctx.stroke();
    ctx.restore();
  }

  // meeting ring on x–t
  if (id === 'x' && m.B && !m.def.massBodies) {
    const met = meetings(m.A, m.B, 0.01, m.T)[0];
    if (met && Math.abs(position(m.A, st.t) - position(m.B, st.t)) < 0.2) {
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(plot.px(met.t), plot.py(m.s * (met.x - m.O)), 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // cursor
  const cx = plot.px(Math.min(st.t, m.T));
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, pb.y);
  ctx.lineTo(cx, pb.y + pb.h);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [mo, color, dashed] of bodies) {
    const val = id === 'x' ? Xd(m, mo, st.t) : id === 'v' ? Vd(m, mo, st.t) : Ad(m, mo, st.t);
    ctx.beginPath();
    ctx.arc(cx, plot.py(val), 5.2, 0, Math.PI * 2);
    if (dashed) {
      ctx.fillStyle = p.paper;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
  ctx.restore();

  // body names at the right edge of the x–t curves
  if (m.B && id === 'x' && !m.def.massBodies) {
    ctx.font = `700 11px ${p.fontUi}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.ink;
    ltr(ctx, m.def.names[0], pb.x + pb.w + 3, plot.py(Xd(m, m.A, m.T)), 'left');
    ctx.fillStyle = p.accent;
    ltr(ctx, m.def.names[1] ?? 'B', pb.x + pb.w + 3, plot.py(Xd(m, m.B, m.T)), 'left');
  }
  return plot;
}

/** The curve of one body: exact polylines per segment (parabolas sampled, lines exact). */
function trace(ctx: CanvasRenderingContext2D, plot: Plot, m: Model, mo: Motion, id: GraphId, color: string, dashed: boolean) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dashed ? [7, 5] : []);
  const val = (t: number) => (id === 'x' ? Xd(m, mo, t) : id === 'v' ? Vd(m, mo, t) : Ad(m, mo, t));
  const segs = mo.knots.filter((k) => k.t0 < m.T);
  ctx.beginPath();
  let prevEnd: [number, number] | null = null;
  for (const k of segs) {
    const s0 = k.t0;
    const e0 = Math.min(k.t1, m.T);
    const n = id === 'x' && k.a !== 0 ? 40 : 1;
    for (let i = 0; i <= n; i++) {
      const t = s0 + ((e0 - s0) * i) / n;
      // the value at the segment's own start: a jump in v or a is drawn as a gap, not a slanted line
      const tv = i === 0 ? s0 + 1e-12 : i === n ? e0 - 1e-12 : t;
      const y = val(Math.max(0, tv));
      const px = plot.px(t);
      const py = plot.py(y);
      if (i === 0) {
        if (id === 'x' && prevEnd) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      } else ctx.lineTo(px, py);
      if (i === n) prevEnd = [px, py];
    }
  }
  ctx.stroke();
  // faint connectors across jumps of v and a
  if (id !== 'x') {
    ctx.setLineDash([2, 3]);
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 1; i < segs.length; i++) {
      const t = segs[i].t0;
      const yb = val(Math.max(0, t - 1e-12));
      const ya = val(t + 1e-12);
      if (Math.abs(ya - yb) > 1e-9) {
        ctx.moveTo(plot.px(t), plot.py(yb));
        ctx.lineTo(plot.px(t), plot.py(ya));
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function shadeArea(d: Draw, id: 'v' | 'a', plot: Plot) {
  const { ctx, p, m, st } = d;
  const ta = m.p.t1;
  const tb = st.t;
  if (Math.abs(tb - ta) < 1e-9) return;
  const lo = Math.min(ta, tb);
  const hi = Math.max(ta, tb);
  for (const pc of pieces(m.A, lo, hi)) {
    const y0 = id === 'v' ? m.s * pc.v0 : m.s * pc.a;
    const y1 = id === 'v' ? m.s * pc.v1 : m.s * pc.a;
    const mid = (y0 + y1) / 2;
    if (Math.abs(mid) < 1e-12 && Math.abs(y0) < 1e-12 && Math.abs(y1) < 1e-12) continue;
    const col = mid >= 0 ? p.pos : p.neg;
    ctx.beginPath();
    ctx.moveTo(plot.px(pc.t0), plot.py(0));
    ctx.lineTo(plot.px(pc.t0), plot.py(y0));
    ctx.lineTo(plot.px(pc.t1), plot.py(y1));
    ctx.lineTo(plot.px(pc.t1), plot.py(0));
    ctx.closePath();
    ctx.fillStyle = withAlpha(col, 0.3);
    ctx.fill();
    // a 30% fill all but vanishes on the dark paper; the outline keeps the region readable in both themes
    ctx.strokeStyle = withAlpha(col, 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();
    const wpx = plot.px(pc.t1) - plot.px(pc.t0);
    const hpx = Math.abs(plot.py(mid) - plot.py(0));
    if (wpx > 10 && hpx > 9) {
      ctx.fillStyle = col;
      ctx.font = `700 15px ${p.fontUi}`;
      ctx.textBaseline = 'middle';
      ltr(ctx, mid >= 0 ? '+' : '−', (plot.px(pc.t0) + plot.px(pc.t1)) / 2, plot.py(mid / 2), 'center');
    }
  }
  // the start of the interval
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(plot.px(ta), plot.box.y);
  ctx.lineTo(plot.px(ta), plot.box.y + plot.box.h);
  ctx.stroke();
  ctx.restore();
}

function secantTangent(d: Draw, plot: Plot, sec: boolean, tan: boolean) {
  const { ctx, p, m, st } = d;
  const t = st.t;
  const P: [number, number] = [t, Xd(m, m.A, t)];
  ctx.save();
  if (sec) {
    const [t0, t1] = secantWindow(t, m.p.dt, m.T);
    const x0 = Xd(m, m.A, t0);
    const x1 = Xd(m, m.A, t1);
    const slope = (x1 - x0) / (t1 - t0);
    // the chord line, extended across the plot
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(plot.px(0), plot.py(x0 - slope * t0));
    ctx.lineTo(plot.px(m.T), plot.py(x0 + slope * (m.T - t0)));
    ctx.stroke();
    // the slope triangle: run Δt, rise Δx
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(plot.px(t0), plot.py(x0));
    ctx.lineTo(plot.px(t1), plot.py(x0));
    ctx.lineTo(plot.px(t1), plot.py(x1));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [tt, xx] of [
      [t0, x0],
      [t1, x1],
    ]) {
      ctx.beginPath();
      ctx.arc(plot.px(tt), plot.py(xx), 4.2, 0, Math.PI * 2);
      ctx.fillStyle = p.paper;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.ink;
      ctx.stroke();
    }
  }
  if (tan) {
    const slope = Vd(m, m.A, t);
    ctx.setLineDash([]);
    ctx.strokeStyle = p.velocity;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(plot.px(Math.max(0, t - m.T * 0.5)), plot.py(P[1] - slope * Math.min(t, m.T * 0.5)));
    ctx.lineTo(plot.px(Math.min(m.T, t + m.T * 0.5)), plot.py(P[1] + slope * Math.min(m.T - t, m.T * 0.5)));
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- numbers for the HTML readout ---------- */

export interface Numbers {
  area: number;
  areaA: number;
}

export function areaNumbers(m: Model, t1: number, t: number): Numbers {
  return { area: m.s * areaVT(m.A, t1, t), areaA: m.s * areaAT(m.A, t1, t) };
}
