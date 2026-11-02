import { deriveChessStartingSeat, type ChessSeat } from './chess';
import i18n from '../../../i18n/i18n';

// An absent color choice preserves the original random-color handshake.
export type ChessColorChoice = 'random' | 'white' | 'black' | 'choose';
export const isChessGame = (game: unknown): game is 'chess' | 'chess960' =>
  game === 'chess' || game === 'chess960';
export const CHESS_TIME_CONTROLS = [
  '3+2',
  '5+0',
  '5+3',
  '10+0',
  '10+5',
  '15+10',
  '30+0',
] as const;
export type ChessTimeControl = (typeof CHESS_TIME_CONTROLS)[number];
export type ChessOptions = {
  chessColor?: Exclude<ChessColorChoice, 'random'>;
  chessWhiteSeat?: ChessSeat;
  chessTime?: ChessTimeControl;
};

export function readChessOptions(value: Record<string, unknown>): ChessOptions {
  const time = value.chessTime;
  if (
    time !== undefined &&
    !CHESS_TIME_CONTROLS.includes(time as ChessTimeControl)
  ) {
    throw new Error(
      i18n.t('group:qortal_land.games.chess_options.invalid_time')
    );
  }
  const timing: ChessOptions =
    time === undefined ? {} : { chessTime: time as ChessTimeControl };
  const chessColor = value.chessColor;
  if (chessColor === undefined && value.chessWhiteSeat === undefined)
    return timing;
  if (typeof chessColor !== 'string' || !['white', 'black', 'choose'].includes(chessColor)) {
    throw new Error(
      i18n.t('group:qortal_land.games.chess_options.invalid_color')
    );
  }
  const chessWhiteSeat = value.chessWhiteSeat;
  if (
    chessWhiteSeat !== undefined &&
    (chessColor !== 'choose' || (chessWhiteSeat !== 1 && chessWhiteSeat !== 2))
  ) {
    throw new Error(
      i18n.t('group:qortal_land.games.chess_options.invalid_color')
    );
  }
  return {
    ...timing,
    chessColor: chessColor as ChessOptions['chessColor'],
    ...(chessWhiteSeat === undefined
      ? {}
      : { chessWhiteSeat: chessWhiteSeat as ChessSeat }),
  };
}

export async function chessStartingSeat(
  options: ChessOptions,
  roundId: string,
  requesterNonce: string,
  recipientNonce: string,
  game: 'chess' | 'chess960' = 'chess'
): Promise<ChessSeat> {
  if (options.chessColor === 'white') return 1;
  if (options.chessColor === 'black') return 2;
  if (options.chessColor === 'choose') {
    if (options.chessWhiteSeat !== 1 && options.chessWhiteSeat !== 2) {
      throw new Error(
        i18n.t('group:qortal_land.games.chess_options.invalid_color')
      );
    }
    return options.chessWhiteSeat;
  }
  return deriveChessStartingSeat(roundId, requesterNonce, recipientNonce, game);
}
