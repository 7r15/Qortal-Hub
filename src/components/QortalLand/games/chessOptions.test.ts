import { describe, expect, it } from 'vitest';
import { chessStartingSeat, readChessOptions } from './chessOptions';
import { deriveChessStartingSeat } from './chess';

const seed = [
  '00112233-4455-4677-8899-aabbccddeeff',
  '11'.repeat(16),
  '22'.repeat(16),
] as const;

describe('negotiated chess colors', () => {
  it('preserves the original random draw when options are absent', async () => {
    expect(await chessStartingSeat({}, ...seed)).toBe(
      await deriveChessStartingSeat(...seed)
    );
  });
  it('maps challenger and recipient colors to stable seats', async () => {
    expect(await chessStartingSeat({ chessColor: 'white' }, ...seed)).toBe(1);
    expect(await chessStartingSeat({ chessColor: 'black' }, ...seed)).toBe(2);
    for (const chessWhiteSeat of [1, 2] as const) {
      expect(
        await chessStartingSeat(
          { chessColor: 'choose', chessWhiteSeat },
          ...seed
        )
      ).toBe(chessWhiteSeat);
    }
  });
  it('rejects missing or unsolicited recipient selections', async () => {
    await expect(
      chessStartingSeat({ chessColor: 'choose' }, ...seed)
    ).rejects.toThrow();
    for (const options of [
      { chessColor: 'red' },
      { chessWhiteSeat: 1 },
      { chessColor: 'white', chessWhiteSeat: 2 },
      { chessColor: 'choose', chessWhiteSeat: true },
    ]) {
      expect(() => readChessOptions(options)).toThrow();
    }
    expect(
      readChessOptions({ chessColor: 'choose', chessWhiteSeat: 2 })
    ).toEqual({ chessColor: 'choose', chessWhiteSeat: 2 });
  });
});
