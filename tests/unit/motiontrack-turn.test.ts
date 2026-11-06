import { describe, expect, it } from 'vitest';
import { TASKS, buildModel, initialState, turnSpans, type State } from '~/sims/motiontrack/model';
import { legs } from '~/physics/kinematics';

const findTurn = (st: State) => TASKS['find-turn'].test({ st, m: buildModel(st), init: { origin: 0, flip: false } });

describe('MotionTrack find-turn: a reversal spans the rest between opposite legs', () => {
  it('an instant turn is a zero-length span; a rest between opposite legs is the whole rest', () => {
    const walker = legs(1, [
      { dur: 3, v: 2 },
      { dur: 2, v: -3 },
      { dur: 2, v: 0 },
      { dur: 2, v: 1 },
      { dur: Infinity, v: 0 },
    ]);
    expect(turnSpans(walker, 0, 10)).toEqual([
      [3, 3],
      [5, 7],
    ]);
  });

  it('a rest between two legs in the same direction is not a turn', () => {
    const stopAndGo = legs(0, [
      { dur: 3, v: 4 },
      { dur: 2, v: 0 },
      { dur: 2, v: 2 },
      { dur: 4, v: -3 },
      { dur: Infinity, v: 0 },
    ]);
    expect(turnSpans(stopAndGo, 0, 12)).toEqual([[7, 7]]);
  });

  it('the walk-back-and-forth task accepts every moment of the 5–7 s rest, and no moment of a straight walk', () => {
    const at = (t: number) => findTurn({ ...initialState({ preset: 'walk-back-and-forth' }), t });
    for (const t of [3, 5, 6, 7, 7.2]) expect(at(t)).toBe(true);
    for (const t of [1, 4, 7.5, 8.5]) expect(at(t)).toBe(false);
  });
});
