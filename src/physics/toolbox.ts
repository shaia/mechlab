/**
 * The math toolbox of lesson 0.3: proportion, straight lines with units, and the right triangle.
 * Every number the lesson, its questions and its figure (`SlopeTriangle`) show comes from here.
 *
 * MODEL SPECIFICATION
 * - System: (a) a straight line y = m·x + b through two points given in physical units; (b) a
 *   power law y ∝ xⁿ (n = 1 direct, n = −1 inverse, n = 2 square); (c) a right triangle given by
 *   its hypotenuse and one acute angle, or by its two legs.
 * - Dynamics: none.
 * - Boundary: none.
 * - Ignored: nothing physical; this is geometry. Angles are in degrees at the interface, as the
 *   learner's calculator must be (DEG mode); radians appear only to reproduce the radians slip.
 * - Valid when: the two points of a line have different x; triangle sides are positive and the
 *   angle is strictly between 0° and 90°.
 * - Failure modes: two points with equal x give a vertical line, whose slope is undefined (NaN,
 *   not ±∞, so no readout prints "Infinity"). A drawn angle depends on the axis scales and is not
 *   a property of the line: `drawnAngleDeg` exists to show exactly that.
 */

export type Point = readonly [number, number];

export const toRad = (deg: number) => (deg * Math.PI) / 180;
export const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** The line through two points: slope Δy/Δx (units of y per unit of x) and intercept at x = 0. */
export function lineThrough(p1: Point, p2: Point): { slope: number; intercept: number } {
  const dx = p2[0] - p1[0];
  if (dx === 0) return { slope: NaN, intercept: NaN };
  const slope = (p2[1] - p1[1]) / dx;
  return { slope, intercept: p1[1] - slope * p1[0] };
}

/**
 * The angle the line makes with the x axis *as drawn*, in degrees, when one grid square stands for
 * `xPerSquare` units on the x axis and `yPerSquare` units on the y axis (squares are square on
 * screen). The same slope draws at different angles on different scales.
 */
export function drawnAngleDeg(slope: number, xPerSquare: number, yPerSquare: number): number {
  return toDeg(Math.atan((slope * xPerSquare) / yPerSquare));
}

/** y ∝ xⁿ: the factor y is multiplied by when x is multiplied by k. */
export const powerScale = (n: number, k: number) => k ** n;

/** Legs of a right triangle from its hypotenuse and the acute angle θ (degrees) at the base. */
export function legs(hyp: number, angleDeg: number): { opposite: number; adjacent: number } {
  const a = toRad(angleDeg);
  return { opposite: hyp * Math.sin(a), adjacent: hyp * Math.cos(a) };
}

/** Pythagoras: the hypotenuse from the two legs. */
export const hypotenuse = (a: number, b: number) => Math.sqrt(a * a + b * b);

/** Pythagoras: the other leg from the hypotenuse and one leg (NaN if the leg is not shorter). */
export const otherLeg = (hyp: number, leg: number) => (leg < hyp ? Math.sqrt(hyp * hyp - leg * leg) : NaN);

/** The acute angle (degrees) opposite `opposite`, next to `adjacent`: tan θ = opposite / adjacent. */
export const angleFromLegs = (opposite: number, adjacent: number) => toDeg(Math.atan2(opposite, adjacent));

/** sin, cos and tan of an angle in degrees, as a calculator in DEG mode gives them. */
export const sinDeg = (d: number) => Math.sin(toRad(d));
export const cosDeg = (d: number) => Math.cos(toRad(d));
export const tanDeg = (d: number) => Math.tan(toRad(d));
