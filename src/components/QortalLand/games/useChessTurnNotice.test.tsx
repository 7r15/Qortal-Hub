import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChessState } from './chess';
import { useChessTurnNotice } from './useChessTurnNotice';
import type { QortalLandGameMatchView } from './useQortalLandGame';

const t = (key: string) => key;
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t }),
}));
const key = 'group:qortal_land.games.chess_options.your_turn';
const match: QortalLandGameMatchView = {
  matchId: 'match',
  roundId: 'round',
  game: 'chess',
  phase: 'active',
  requesterAddress: 'one',
  recipientAddress: 'two',
  requesterNonce: '',
  localSeat: 1,
  state: createChessState(1),
  moves: [],
  chatMessages: [],
};
function Harness({
  current = match,
  suppressed = false,
}: {
  current?: QortalLandGameMatchView;
  suppressed?: boolean;
}) {
  const notice = useChessTurnNotice(current, suppressed);
  return (
    <>
      {notice.control}
      {notice.popup}
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('chess turn popups', () => {
  it('alerts once per turn, including the first, without repeating on reconnect', () => {
    const { rerender } = render(<Harness />);
    expect(screen.getByText(key)).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(key)).not.toBeInTheDocument();
    rerender(<Harness current={{ ...match, phase: 'reconnecting' }} />);
    rerender(<Harness />);
    expect(screen.queryByText(key)).not.toBeInTheDocument();
    rerender(
      <Harness
        current={{ ...match, state: { ...createChessState(1), ply: 2 } }}
      />
    );
    expect(screen.getByText(key)).toBeVisible();
  });
  it('suppresses locked/DND turns and does not replay them on unlock', () => {
    const { rerender } = render(<Harness suppressed />);
    expect(screen.queryByText(key)).not.toBeInTheDocument();
    rerender(<Harness />);
    expect(screen.queryByText(key)).not.toBeInTheDocument();
  });
  it('does not announce the opponent turn, pending moves or finished games', () => {
    const { rerender } = render(
      <Harness current={{ ...match, localSeat: 2 }} />
    );
    expect(screen.queryByText(key)).not.toBeInTheDocument();
    rerender(<Harness current={{ ...match, pendingMoveId: 'pending' }} />);
    expect(screen.queryByText(key)).not.toBeInTheDocument();
    rerender(
      <Harness
        current={{ ...match, outcome: { type: 'resigned', winner: 1 } }}
      />
    );
    expect(screen.queryByText(key)).not.toBeInTheDocument();
  });
  it('persists the off preference across mounts', () => {
    const view = render(<Harness current={{ ...match, localSeat: 2 }} />);
    fireEvent.click(screen.getByRole('checkbox'));
    view.unmount();
    render(<Harness />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByText(key)).not.toBeInTheDocument();
  });
});
