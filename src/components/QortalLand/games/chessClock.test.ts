import { describe, expect, it } from 'vitest';
import {
  formatChessTime,
  readChessClock,
  sampleChessClock,
} from './chessClock';
import { chessTimeoutOutcome, createChessState } from './chess';

describe('chess clocks', () => {
  it('counts down only the running clock and stops at zero', () => {
    const clock = readChessClock(
      { remainingMs: [10000, 30000], runningSeat: 1 },
      1000
    )!;
    expect(sampleChessClock(clock, 6000).remainingMs).toEqual([5000, 30000]);
    expect(sampleChessClock(clock, 90000).remainingMs).toEqual([0, 30000]);
    expect(
      sampleChessClock({ ...clock, runningSeat: null }, 90000).remainingMs
    ).toEqual([10000, 30000]);
    expect(formatChessTime(60100)).toBe('1:01');
  });
  it('rejects malformed clock snapshots', () => {
    for (const clock of [
      { remainingMs: [-1, 100], runningSeat: 1 },
      { remainingMs: [1, 2], runningSeat: true },
      { remainingMs: [1], runningSeat: null },
    ]) {
      expect(readChessClock(clock)).toBeUndefined();
    }
  });
  it('awards a time win unless the opponent lacks mating material', () => {
    const state = createChessState(1);
    expect(chessTimeoutOutcome(state, 2)).toEqual({
      type: 'timeout',
      winner: 1,
    });
    state.board = state.board.map((piece) =>
      piece > 0 && piece !== 6 ? 0 : piece
    );
    expect(chessTimeoutOutcome(state, 2)).toEqual({ type: 'draw' });
  });
});
