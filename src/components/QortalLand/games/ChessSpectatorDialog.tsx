import { ChessClockDisplay } from './ChessClockDisplay';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  alpha,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import chessPieceSprite from '../../../assets/chess/cburnett-chess-pieces.svg';
import {
  chessPieceKind,
  chessPieceSeat,
  type ChessPiece,
  type ChessState,
} from './chess';
import { GameSessionChat, type GameChatMessage } from './GameSessionChat';
import type { ChessSpectatorSnapshot } from './chessSpectators';

type Props = {
  address: string;
  snapshot: ChessSpectatorSnapshot | null;
  messages: GameChatMessage[];
  onClose: () => void;
  onSendChat: (text: string) => boolean;
  resolvePlayerName?: (address: string) => string;
};

const PIECE_SPRITE_COLUMN: Record<number, number> = {
  6: 0,
  5: 1,
  3: 2,
  2: 3,
  4: 4,
  1: 5,
};

const shortAddress = (value: string) =>
  value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value;

function SpectatorPiece({
  piece,
  state,
}: {
  piece: ChessPiece;
  state: ChessState;
}) {
  const kind = chessPieceKind(piece);
  const seat = chessPieceSeat(piece);
  const column = PIECE_SPRITE_COLUMN[kind];
  if (!seat || column === undefined) return null;
  const color = seat === state.whiteSeat ? 'white' : 'black';
  return (
    <Box
      aria-hidden="true"
      sx={{
        backgroundImage: `url(${chessPieceSprite})`,
        backgroundPosition: `${column * 20}% ${color === 'white' ? 0 : 100}%`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '600% 200%',
        height: '88%',
        width: '88%',
      }}
    />
  );
}

export function ChessSpectatorDialog({
  address,
  snapshot,
  messages,
  onClose,
  onSendChat,
  resolvePlayerName,
}: Props) {
  const { t } = useTranslation(['group']);
  if (!snapshot) return null;
  const { state } = snapshot;
  const requesterName =
    resolvePlayerName?.(snapshot.requesterAddress) ||
    shortAddress(snapshot.requesterAddress);
  const recipientName =
    resolvePlayerName?.(snapshot.recipientAddress) ||
    shortAddress(snapshot.recipientAddress);
  const whiteName = state.whiteSeat === 1 ? requesterName : recipientName;
  const blackName = state.whiteSeat === 1 ? recipientName : requesterName;
  const nextName = state.nextSeat === 1 ? requesterName : recipientName;
  const winnerName =
    state.outcome && 'winner' in state.outcome
      ? state.outcome.winner === 1
        ? requesterName
        : recipientName
      : '';
  const status = state.outcome
    ? state.outcome.type === 'draw'
      ? t('group:qortal_land.games.chess_spectator.draw')
      : state.outcome.type === 'abandoned'
        ? t('group:qortal_land.games.chess_spectator.abandoned')
        : winnerName
          ? t('group:qortal_land.games.chess_spectator.winner', {
              name: winnerName,
            })
          : t('group:qortal_land.games.chess_spectator.ended')
    : t('group:qortal_land.games.chess_spectator.turn', { name: nextName });

  return (
    <Dialog
      fullWidth
      maxWidth="lg"
      open
      onClose={onClose}
      PaperProps={{
        sx: (theme) => ({
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.48)}`,
          color: theme.palette.text.primary,
          height: {
            xs: 'calc(100dvh - 32px)',
            md: 'min(820px, calc(100dvh - 80px))',
          },
          maxWidth: 1180,
        }),
      }}
    >
      <DialogTitle
        sx={{ alignItems: 'center', display: 'flex', gap: 1.25, pb: 1.5 }}
      >
        <VisibilityRoundedIcon color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 750 }}>
            {t(
              state.chess960 === undefined
                ? 'group:qortal_land.games.chess_spectator.title'
                : 'group:qortal_land.games.chess_options.chess960_title'
            )}
          </Typography>
          <Typography
            aria-live="polite"
            sx={{ color: 'primary.main', fontSize: 13 }}
          >
            {status}
          </Typography>
        </Box>
        <IconButton
          aria-label={t('group:qortal_land.games.chess_spectator.close')}
          onClick={onClose}
          sx={{ color: 'text.primary' }}
        >
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      {snapshot.clock && (
        <Box sx={{ px: 3 }}>
          <ChessClockDisplay
            clock={snapshot.clock}
            whiteSeat={state.whiteSeat}
          />
        </Box>
      )}
      <DialogContent
        sx={{
          display: 'grid',
          gap: 2.5,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' },
          minHeight: 0,
          overflowY: { xs: 'auto', lg: 'hidden' },
          pb: 2.5,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <Typography sx={{ color: 'text.secondary', fontSize: 13, mb: 0.75 }}>
            {t('group:qortal_land.games.chess_spectator.black_player', {
              name: blackName,
            })}
          </Typography>
          <Box
            aria-label={t('group:qortal_land.games.chess_spectator.board_aria')}
            role="grid"
            sx={{
              aspectRatio: '1 / 1',
              display: 'grid',
              flex: '0 0 auto',
              gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(8, minmax(0, 1fr))',
              width: 'min(100%, 64dvh, 680px)',
            }}
          >
            {state.board.map((piece, index) => {
              const dark = (Math.floor(index / 8) + (index % 8)) % 2 === 1;
              return (
                <Box
                  aria-label={t(
                    'group:qortal_land.games.chess_spectator.square_aria',
                    {
                      column: (index % 8) + 1,
                      row: Math.floor(index / 8) + 1,
                    }
                  )}
                  key={index}
                  role="gridcell"
                  sx={(theme) => ({
                    alignItems: 'center',
                    backgroundColor: dark
                      ? (theme.palette.chessBoard?.dark ??
                        theme.palette.success.main)
                      : (theme.palette.chessBoard?.light ??
                        theme.palette.success.light),
                    display: 'flex',
                    justifyContent: 'center',
                    minHeight: 0,
                    minWidth: 0,
                  })}
                >
                  {piece ? (
                    <SpectatorPiece piece={piece} state={state} />
                  ) : null}
                </Box>
              );
            })}
          </Box>
          <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: 0.75 }}>
            {t('group:qortal_land.games.chess_spectator.white_player', {
              name: whiteName,
            })}
          </Typography>
        </Box>
        <GameSessionChat
          address={address}
          messages={messages}
          resolveAuthorName={resolvePlayerName}
          shared
          onSend={onSendChat}
          variant="chess"
        />
      </DialogContent>
    </Dialog>
  );
}
