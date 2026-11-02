import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHESS_TIME_CONTROLS,
  type ChessColorChoice,
  type ChessTimeControl,
} from './chessOptions';

export function ChessChallengeDialog({
  game = 'chess',
  onCancel,
  onChallenge,
}: {
  game?: 'chess' | 'chess960';
  onCancel: () => void;
  onChallenge: (color: ChessColorChoice, time?: ChessTimeControl) => void;
}) {
  const { t } = useTranslation(['group']);
  const [color, setColor] = useState<ChessColorChoice>('random');
  const [time, setTime] = useState<ChessTimeControl | ''>('');
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        {t('group:qortal_land.games.chess_options.challenge_game', {
          game: t(
            `group:qortal_land.games.chess_options.${game === 'chess960' ? 'chess960_title' : 'chess_title'}`
          ),
        })}
      </DialogTitle>
      <DialogContent>
        <TextField
          select
          fullWidth
          margin="normal"
          value={color}
          label={t('group:qortal_land.games.chess_options.color')}
          onChange={(event) => setColor(event.target.value as ChessColorChoice)}
        >
          {(['random', 'white', 'black', 'choose'] as const).map((choice) => (
            <MenuItem key={choice} value={choice}>
              {t(`group:qortal_land.games.chess_options.${choice}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          fullWidth
          margin="normal"
          value={time}
          label={t('group:qortal_land.games.chess_options.timer')}
          onChange={(event) =>
            setTime(event.target.value as ChessTimeControl | '')
          }
        >
          <MenuItem value="">
            {t('group:qortal_land.games.chess_options.untimed')}
          </MenuItem>
          {CHESS_TIME_CONTROLS.map((preset) => (
            <MenuItem key={preset} value={preset}>
              {t('group:qortal_land.games.chess_options.time_preset', {
                minutes: preset.split('+')[0],
                seconds: preset.split('+')[1],
              })}
            </MenuItem>
          ))}
        </TextField>
        {time && (
          <Typography variant="body2" color="text.secondary">
            {t('group:qortal_land.games.chess_options.clock_help')}
          </Typography>
        )}
        {(color !== 'random' || time || game === 'chess960') && (
          <Typography variant="body2" color="text.secondary">
            {t('group:qortal_land.games.chess_options.compatibility')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>
          {t('group:qortal_land.games.chess_options.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => onChallenge(color, time || undefined)}
        >
          {t('group:qortal_land.games.chess_options.send')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
