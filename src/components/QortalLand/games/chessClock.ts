import type { ChessSeat } from './chess';

export type ChessClockView = {
  remainingMs: [number, number];
  runningSeat: ChessSeat | null;
  receivedAt: number;
};

export function readChessClock(
  value: unknown,
  receivedAt = Date.now()
): ChessClockView | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const clock = value as ChessClockView;
  if (
    !Array.isArray(clock.remainingMs) ||
    clock.remainingMs.length !== 2 ||
    !clock.remainingMs.every(
      (time) => Number.isSafeInteger(time) && time >= 0 && time <= 86_400_000
    ) ||
    ![null, 1, 2].includes(clock.runningSeat)
  )
    return undefined;
  return {
    remainingMs: [...clock.remainingMs],
    runningSeat: clock.runningSeat,
    receivedAt,
  };
}

export function sampleChessClock(clock: ChessClockView, now: number) {
  const remainingMs = [...clock.remainingMs] as [number, number];
  if (clock.runningSeat) {
    const index = clock.runningSeat - 1;
    remainingMs[index] = Math.max(
      0,
      remainingMs[index] - Math.max(0, now - clock.receivedAt)
    );
  }
  return { remainingMs, runningSeat: clock.runningSeat };
}

export function formatChessTime(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
