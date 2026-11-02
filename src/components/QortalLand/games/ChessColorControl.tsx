import { MenuItem, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ChessOptions } from './chessOptions';
import type { ChessSeat } from './chess';

export function ChessColorControl({
  options,
  selectedSeat,
  onChoose,
}: {
  options: ChessOptions;
  selectedSeat: ChessSeat;
  onChoose: (seat: ChessSeat) => void;
}) {
  const { t } = useTranslation(['group']);
  if (options.chessColor === 'choose' && !options.chessWhiteSeat) {
    return (
      <TextField
        select
        fullWidth
        margin="normal"
        value={selectedSeat === 2 ? 'white' : 'black'}
        label={t('group:qortal_land.games.chess_options.color')}
        onChange={(event) => onChoose(event.target.value === 'white' ? 2 : 1)}
      >
        {(['white', 'black'] as const).map((color) => (
          <MenuItem key={color} value={color}>
            {t(`group:qortal_land.games.chess_options.${color}`)}
          </MenuItem>
        ))}
      </TextField>
    );
  }
  const color =
    options.chessColor === 'white'
      ? 'black'
      : options.chessColor === 'black'
        ? 'white'
        : 'random';
  return (
    <Typography color="text.secondary" sx={{ mb: 1 }}>
      {t('group:qortal_land.games.chess_options.your_color', {
        color: t(`group:qortal_land.games.chess_options.${color}`),
      })}
    </Typography>
  );
}
