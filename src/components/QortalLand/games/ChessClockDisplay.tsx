import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import {
  formatChessTime,
  sampleChessClock,
  type ChessClockView,
} from './chessClock';
import type { ChessSeat } from './chess';
import type { ChessTimeControl } from './chessOptions';

export function ChessTimeSummary({ preset }: { preset?: ChessTimeControl }) {
  const { t } = useTranslation(['group']);
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      {preset
        ? t('group:qortal_land.games.chess_options.time_preset', {
            minutes: preset.split('+')[0],
            seconds: preset.split('+')[1],
          })
        : t('group:qortal_land.games.chess_options.untimed')}
    </Typography>
  );
}

export function ChessClockDisplay({
  clock,
  whiteSeat,
  now,
}: {
  clock: ChessClockView;
  whiteSeat: ChessSeat;
  now?: number;
}) {
  const { t } = useTranslation(['group']);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    if (now !== undefined || !clock.runningSeat) return;
    const timer = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [clock.runningSeat, now]);
  const current = sampleChessClock(clock, now ?? tick);
  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
      {([whiteSeat, 3 - whiteSeat] as ChessSeat[]).map((seat) => (
        <Box
          key={seat}
          sx={{
            flex: 1,
            p: 1,
            border: '1px solid',
            borderRadius: 1,
            borderColor:
              current.runningSeat === seat ? 'primary.main' : 'divider',
            backgroundColor: 'background.paper',
            color: 'text.primary',
          }}
        >
          <Typography variant="caption">
            {t(
              `group:qortal_land.games.chess_options.${seat === whiteSeat ? 'white' : 'black'}`
            )}
          </Typography>
          <Typography
            sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}
          >
            {formatChessTime(current.remainingMs[seat - 1])}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
