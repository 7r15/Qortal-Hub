import { describe, expect, it } from 'vitest';
import { chess960BackRank, deriveChess960Position } from './chess960';
import {
  applyChessMove,
  createChessState,
  getChessLegalMoves,
  hashChessState,
  type ChessState,
} from './chess';

describe('Chess960', () => {
  it('generates all 960 unique legal mirrored starting positions', () => {
    const seen = new Set<string>();
    for (let position = 0; position < 960; position++) {
      const rank = chess960BackRank(position);
      seen.add(rank.join(''));
      expect([...rank].sort()).toEqual([2, 2, 3, 3, 4, 4, 5, 6]);
      const bishops = rank.flatMap((piece, file) =>
        piece === 3 ? [file] : []
      );
      expect(bishops[0] % 2).not.toBe(bishops[1] % 2);
      const rooks = rank.flatMap((piece, file) => (piece === 4 ? [file] : []));
      expect(rank.indexOf(6)).toBeGreaterThan(rooks[0]);
      expect(rank.indexOf(6)).toBeLessThan(rooks[1]);
      const state = createChessState(1, position);
      expect(state.board.slice(56)).toEqual(rank);
      expect(state.board.slice(0, 8)).toEqual(rank.map((piece) => -piece));
    }
    expect(seen.size).toBe(960);
    expect(chess960BackRank(518)).toEqual([4, 2, 3, 5, 6, 3, 2, 4]);
  });

  it('castles on both sides from every starting layout, including swaps and stationary pieces', () => {
    for (let position = 0; position < 960; position++) {
      const rank = chess960BackRank(position);
      const king = rank.indexOf(6) + 56;
      const rooks = rank.flatMap((piece, file) =>
        piece === 4 ? [file + 56] : []
      );
      for (const [side, rook] of rooks.entries()) {
        const state = createChessState(1, position);
        state.board.fill(0);
        state.board[king] = 6;
        state.board[rook] = 4;
        state.board[4] = -6;
        expect(getChessLegalMoves(state)).toContainEqual({
          from: king,
          to: rook,
        });
        const next = applyChessMove(state, 1, king, rook);
        expect(next.board[side === 0 ? 58 : 62]).toBe(6);
        expect(next.board[side === 0 ? 59 : 61]).toBe(4);
        expect(next.board.filter((piece) => piece !== 0)).toHaveLength(3);
        expect(next.castlingRights.slice(0, 2)).toEqual([false, false]);
        expect(next.halfmoveClock).toBe(1);
      }
    }
  });

  it('rejects blocked paths, attacked crossing squares and attacks uncovered by the rook', () => {
    const state: ChessState = createChessState(1, 518);
    state.board.fill(0);
    state.board[60] = 6;
    state.board[63] = 4;
    state.board[0] = -6;
    state.board[61] = 2;
    expect(getChessLegalMoves(state)).not.toContainEqual({ from: 60, to: 63 });
    state.board[61] = 0;
    state.board[5] = -4;
    expect(getChessLegalMoves(state)).not.toContainEqual({ from: 60, to: 63 });
    const position = Array.from({ length: 960 }, (_, i) => i).find((i) => {
      const rank = chess960BackRank(i);
      return rank[1] === 4 && rank[2] === 6;
    })!;
    const discovered = createChessState(1, position);
    discovered.board.fill(0);
    discovered.board[58] = 6;
    discovered.board[57] = 4;
    discovered.board[56] = -4;
    discovered.board[4] = -6;
    expect(getChessLegalMoves(discovered)).not.toContainEqual({
      from: 58,
      to: 57,
    });
  });

  it('binds the variant and starting layout into the position hash', async () => {
    expect(await hashChessState(createChessState(1, 518))).not.toBe(
      await hashChessState(createChessState(1))
    );
    const seed = [
      '00112233-4455-4677-8899-aabbccddeeff',
      '11'.repeat(16),
      '22'.repeat(16),
    ] as const;
    const position = await deriveChess960Position(...seed);
    // Shared with the Python bridge fixture.
    expect(position).toBe(854);
    expect(await hashChessState(createChessState(1, position))).toBe(
      '666121ed8ab3297418e36f989319d7ebed879d87aa50fe386184fe04c92bc0a9'
    );
    expect(await deriveChess960Position(...seed)).toBe(position);
  });
});
