/** Text helpers for canvas figures: Hebrew labels in an LTR canvas and signed numbers. */

import { sci } from './format';
import type { Palette } from './canvas';

/** U+2212, the minus sign used everywhere a signed quantity is printed */
export const MINUS = '−';

/** A signed number with an explicit sign: +3, −2, 0. */
export function signed(x: number, sig = 3): string {
  if (Math.abs(x) < 1e-9) return '0';
  return `${x > 0 ? '+' : MINUS}${sci(Math.abs(x), sig)}`;
}

/** A number with a minus sign (U+2212) but no plus sign. */
export const plain = (x: number, sig = 3): string => (Math.abs(x) < 1e-9 ? '0' : sci(x, sig).replace('-', MINUS));

export interface TextStyle {
  size?: number;
  weight?: number;
  color: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  italic?: boolean;
  /** draw with the UI font (default) or the handwriting font */
  hand?: boolean;
}

/**
 * Draw a label in the figure's font. `rtl` (default true) sets the base direction to right-to-left, so a
 * Hebrew phrase that contains a Latin letter ("מבט מ-A") keeps its reading order. Pure physics
 * symbols and numbers pass `rtl: false`.
 */
export function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, s: TextStyle, rtl = true) {
  ctx.save();
  ctx.font = `${s.italic ? 'italic ' : ''}${s.weight ?? 600} ${s.size ?? 13}px ${s.hand ? p.fontHand : p.fontUi}`;
  ctx.fillStyle = s.color;
  ctx.textAlign = s.align ?? 'center';
  ctx.textBaseline = s.baseline ?? 'middle';
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.fillText(text, x, y);
  ctx.restore();
}
