import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createChessState } from './chess';
import { ChessSpectatorDialog } from './ChessSpectatorDialog';
import type { ChessSpectatorSnapshot } from './chessSpectators';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'group:qortal_land.games.chat.message_aria': 'Game chat message',
        'group:qortal_land.games.chat.send_aria': 'Send game chat message',
        'group:qortal_land.games.chess_spectator.board_aria':
          'Spectator chess board',
        'group:qortal_land.games.chess_spectator.close': 'Close spectator view',
        'group:qortal_land.games.chess_spectator.title': 'Watching Chess',
      })[key] || key,
  }),
}));

const snapshot = (): ChessSpectatorSnapshot => ({
  eventId: crypto.randomUUID(),
  authorAddress: 'Q-player-one',
  matchId: crypto.randomUUID(),
  roundId: crypto.randomUUID(),
  requesterAddress: 'Q-player-one',
  recipientAddress: 'Q-player-two',
  state: createChessState(1),
  stateHash: '00'.repeat(32),
  phase: 'active',
  timestamp: Date.now(),
  expiresAt: Date.now() + 60_000,
});

describe('Chess spectator dialog', () => {
  it('renders a read-only board and lets a spectator join match chat', () => {
    const onSendChat = vi.fn(() => true);
    render(
      <ChessSpectatorDialog
        address="Q-watcher"
        messages={[
          {
            messageId: crypto.randomUUID(),
            authorAddress: 'Q-another-watcher',
            authorName: 'Watcher',
            text: 'Good move!',
            createdAt: Date.now(),
            delivered: true,
          },
        ]}
        onClose={vi.fn()}
        onSendChat={onSendChat}
        snapshot={snapshot()}
      />
    );

    expect(
      screen.getByRole('grid', { name: 'Spectator chess board' })
    ).toBeVisible();
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);
    expect(screen.getByText('Watcher')).toBeVisible();

    const input = screen.getByRole('textbox', { name: 'Game chat message' });
    fireEvent.change(input, { target: { value: 'Hello players' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSendChat).toHaveBeenCalledWith('Hello players');
  });
});
