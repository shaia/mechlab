import { describe, expect, it } from 'vitest';
import { closingSpeed, gapAt, meetingTime, positionAt, velocityInFrame } from '~/physics/relative';
import { relativeError } from '~/physics/vec';

describe('analytic limit: head-on and chasing', () => {
  it('opposite velocities close at the sum of the speeds', () => {
    expect(closingSpeed(0, 20, 100, -30)).toBe(50);
    expect(relativeError(meetingTime(0, 20, 100, -30)!, 2)).toBeLessThan(1e-12);
  });
  it('a faster chaser closes at the difference of the speeds', () => {
    // B starts behind A (at −30), both go right, B faster
    expect(closingSpeed(0, 10, -30, 15)).toBe(5);
    expect(relativeError(meetingTime(0, 10, -30, 15)!, 6)).toBeLessThan(1e-12);
  });
  it('equal velocities keep the gap constant and never meet', () => {
    expect(meetingTime(0, 7, 30, 7)).toBeNull();
    expect(gapAt(0, 7, 30, 7, 5)).toBe(30);
  });
  it('bodies moving apart have no meeting in the future', () => {
    expect(meetingTime(0, -3, 30, 4)).toBeNull();
    expect(closingSpeed(0, -3, 30, 4)).toBe(0);
  });
});

describe('conservation: Galilean invariance', () => {
  const xA0 = -12;
  const vA = 4;
  const xB0 = 20;
  const vB = -6;
  it('the gap is the same in the ground, A and B frames', () => {
    for (const t of [0, 1.5, 4]) {
      const ground = positionAt(xB0, vB, t) - positionAt(xA0, vA, t);
      for (const [x0F, vF] of [[xA0, vA], [xB0, vB]]) {
        const xF = positionAt(x0F, vF, t);
        const inFrame = positionAt(xB0, vB, t) - xF - (positionAt(xA0, vA, t) - xF);
        expect(relativeError(inFrame, ground)).toBeLessThan(1e-12);
      }
    }
  });
  it('the meeting time computed from the relative velocity vB − vA equals the ground one', () => {
    const d0 = xB0 - xA0;
    expect(relativeError(meetingTime(xA0, vA, xB0, vB)!, -d0 / velocityInFrame(vB, vA))).toBeLessThan(1e-12);
  });
  it('v_B seen from A is minus v_A seen from B', () => {
    expect(velocityInFrame(vB, vA)).toBe(-velocityInFrame(vA, vB));
  });
  it('the frame body is at rest in its own frame', () => {
    expect(velocityInFrame(vA, vA)).toBe(0);
  });
});

describe('scaling: doubling both velocities halves the meeting time', () => {
  it('t* ∝ 1/closing speed', () => {
    const t1 = meetingTime(0, 5, 60, -5)!;
    const t2 = meetingTime(0, 10, 60, -10)!;
    expect(relativeError(t1 / t2, 2)).toBeLessThan(1e-12);
  });
});
