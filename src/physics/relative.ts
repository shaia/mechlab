/**
 * MODEL SPECIFICATION: two point bodies on parallel straight tracks, seen from different frames (lesson 1.4).
 *
 * System:    bodies A and B with constant velocities vA, vB along one position axis (signed, m/s), and
 *            start positions xA0, xB0 [m] at t = 0 in the ground frame.
 * Dynamics:  uniform motion x(t) = x0 + v t. A frame attached to a body F moves with velocity vF; what an
 *            observer in F sees is x − xF(t) and v − vF (Galilean transformation).
 * Boundary:  none; the tracks are unbounded.
 * Ignored:   body size (meeting means equal positions of the centres), accelerations, relativity (v ≪ c).
 * Valid when: all speeds are far below the speed of light and the frames do not accelerate.
 * Failure modes: the meeting time is null when the velocities are equal (the gap never changes) and when
 *            the bodies move apart, so a negative time would be a meeting in the past.
 */

/** Position at time t of a body that starts at x0 with constant velocity v. */
export const positionAt = (x0: number, v: number, t: number): number => x0 + v * t;

/** Velocity of a body as seen from a frame that moves with velocity vFrame (all along the same axis). */
export const velocityInFrame = (v: number, vFrame: number): number => v - vFrame;

/** Signed gap xB − xA at time t. It is the same number in every frame. */
export const gapAt = (xA0: number, vA: number, xB0: number, vB: number, t: number): number =>
  positionAt(xB0, vB, t) - positionAt(xA0, vA, t);

/** Time until the bodies are at the same place, counted from t = 0; null if they never meet in the future. */
export function meetingTime(xA0: number, vA: number, xB0: number, vB: number): number | null {
  const d0 = xB0 - xA0;
  const dv = vB - vA;
  if (dv === 0) return d0 === 0 ? 0 : null;
  const t = -d0 / dv;
  return t >= 0 ? t : null;
}

/** How fast the gap shrinks, |vB − vA| when the bodies approach, otherwise 0. */
export function closingSpeed(xA0: number, vA: number, xB0: number, vB: number): number {
  const d0 = xB0 - xA0;
  const dv = vB - vA;
  return d0 * dv < 0 ? Math.abs(dv) : 0;
}
