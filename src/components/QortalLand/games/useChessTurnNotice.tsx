import { FormControlLabel, Snackbar, Switch } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isChessGame } from './chessOptions';
import type { QortalLandGameMatchView } from './useQortalLandGame';

const STORAGE_KEY = 'qortalland.chess.turnNotifications';

export function useChessTurnNotice(
  match: QortalLandGameMatchView | null,
  suppressed: boolean
) {
  const { t } = useTranslation(['group']);
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [notice, setNotice] = useState<string | null>(null);
  const lastTurn = useRef<string | null>(null);
  const turn =
    isChessGame(match?.game) &&
    match.phase === 'active' &&
    match.state &&
    match.localSeat === match.state.nextSeat &&
    !match.pendingMoveId &&
    !match.outcome &&
    !match.state.outcome
      ? `${match.matchId}:${match.roundId}:${match.state.ply}`
      : null;

  useEffect(() => {
    if (!turn || suppressed || !enabled) {
      setNotice(null);
    }
    if (turn && turn !== lastTurn.current) {
      lastTurn.current = turn;
      if (enabled && !suppressed) setNotice(turn);
    }
  }, [enabled, suppressed, turn]);

  return {
    control: (
      <FormControlLabel
        label={t('group:qortal_land.games.chess_options.turn_notifications')}
        control={
          <Switch
            checked={enabled}
            onChange={(_, checked) => {
              setEnabled(checked);
              try {
                localStorage.setItem(STORAGE_KEY, String(checked));
              } catch {
                /* The preference still applies for this session. */
              }
            }}
          />
        }
      />
    ),
    popup: (
      <Snackbar
        open={Boolean(notice && turn === notice && !suppressed)}
        autoHideDuration={5000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setNotice(null);
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        message={t('group:qortal_land.games.chess_options.your_turn')}
      />
    ),
  };
}
