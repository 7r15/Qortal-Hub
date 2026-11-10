import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQortalLandGame } from './useQortalLandGame';
import { qortalLandRealtime } from '../realtime/qortalLandRealtime';

const t = (key: string, values?: Record<string, unknown>) =>
  key.endsWith('.time_preset') ? `${values?.minutes}+${values?.seconds}` : key;
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t }),
}));
vi.mock('../realtime/qortalLandRealtime', () => ({
  qortalLandRealtime: {
    onEvent: vi.fn(),
    onState: vi.fn(),
    send: vi.fn(),
    isReady: () => true,
    acquire: () => () => {},
  },
}));

let receive: (event: Record<string, unknown>) => void;
const originalApi = window.electronAPI;
const originalRealtime = window.qortalLandRealtime;
const prefix = 'group:qortal_land.games.chess_options.';
function Harness({ gameId = 'chess' }: { gameId?: 'chess' | 'chess960' }) {
  const game = useQortalLandGame({
    address: 'one',
    publicKey: 'key',
    sessionId: 'local',
    groupId: 7,
    roomId: 'room',
    enabled: true,
  });
  return (
    <>
      <button
        disabled={!game.transportReady}
        onClick={() =>
          void game.challenge(
            {
              address: 'two',
              sessionId: 'remote',
              destinationHash: '22'.repeat(16),
            },
            gameId
          )
        }
      >
        Challenge
      </button>
      {game.modal}
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = {
    ...originalApi,
    reticulumGetLocalDestinationHash: vi.fn(async () => ({
      destinationHash: '11'.repeat(16),
    })),
  };
  window.qortalLandRealtime = {} as typeof window.qortalLandRealtime;
  vi.mocked(qortalLandRealtime.onEvent).mockImplementation((callback) => {
    receive = callback;
    return () => {};
  });
  vi.mocked(qortalLandRealtime.onState).mockImplementation((callback) => {
    callback(true);
    return () => {};
  });
});
afterEach(() => {
  cleanup();
  window.electronAPI = originalApi;
  window.qortalLandRealtime = originalRealtime;
});
async function ready(gameId: 'chess' | 'chess960' = 'chess') {
  render(<Harness gameId={gameId} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Challenge' })).toBeEnabled()
  );
}

describe('chess invitation controls', () => {
  it.each(
    (['chess', 'chess960'] as const).flatMap((game) =>
      ([undefined, 'white', 'black', 'choose'] as const).map((color) => ({
        game,
        color,
      }))
    )
  )(
    'keeps a $game invitation with $color open before signing',
    async ({ game, color }) => {
      await ready(game);
      await act(async () =>
        receive({
          type: 'GAME_SNAPSHOT',
          matchId: '00112233-4455-4677-8899-aabbccddeeff',
          game,
          ...(color ? { chessColor: color } : {}),
          chessTime: '5+3',
          requesterAddress: 'one',
          recipientAddress: 'two',
          requesterNonce: '11'.repeat(16),
          recipientNonce: null,
          phase: 'awaiting_invite_signature',
          transcript: [],
          expiresAt: Date.now() + 60000,
        })
      );
      await waitFor(() =>
        expect(screen.getByText(prefix + 'preparing')).toBeInTheDocument()
      );
      expect(qortalLandRealtime.send).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CLOSE_GAME_LINK' })
      );
    }
  );
  it('shows zero and a time win when the remote clock expires', async () => {
    await ready();
    const matchId = '00112233-4455-4677-8899-aabbccddeeff';
    await act(async () =>
      receive({
        type: 'GAME_STARTED',
        matchId,
        roundId: matchId,
        game: 'chess',
        chessColor: 'black',
        chessTime: '10+5',
        requesterAddress: 'one',
        recipientAddress: 'two',
        requesterNonce: '11'.repeat(16),
        recipientNonce: '22'.repeat(16),
        phase: 'active',
        transcript: [],
        clock: { remainingMs: [600000, 2000], runningSeat: 2 },
      })
    );
    await waitFor(() => expect(screen.getByText('10:00')).toBeInTheDocument());
    await act(async () =>
      receive({
        type: 'GAME_MESSAGE',
        matchId,
        message: {
          type: 'RESIGN',
          reason: 'timeout',
          matchId,
          roundId: matchId,
        },
      })
    );
    await waitFor(() =>
      expect(screen.getByText(prefix + 'won_on_time')).toBeInTheDocument()
    );
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeEnabled();
    expect(qortalLandRealtime.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({ type: 'RESIGN_ACK' }),
      })
    );
  });
  it.each(['chess', 'chess960'] as const)(
    'sends time controls and restores a %s timeout result',
    async (gameId) => {
      await ready(gameId);
      fireEvent.click(screen.getByRole('button', { name: 'Challenge' }));
      fireEvent.mouseDown(
        screen.getByRole('combobox', { name: prefix + 'timer' })
      );
      fireEvent.click(screen.getByRole('option', { name: '10+5' }));
      fireEvent.click(screen.getByRole('button', { name: prefix + 'send' }));
      const payload = vi
        .mocked(qortalLandRealtime.send)
        .mock.calls.map(([value]) => value)
        .find((value) => value.type === 'OPEN_GAME_LINK')!;
      expect(payload.game).toBe(gameId);
      expect(payload.chessTime).toBe('10+5');
      await act(async () =>
        receive({
          ...payload,
          type: 'GAME_STARTED',
          roundId: payload.matchId,
          requesterAddress: 'one',
          recipientAddress: 'two',
          recipientNonce: '22'.repeat(16),
          phase: 'active',
          transcript: [],
          clock: { remainingMs: [600000, 600000], runningSeat: 1 },
        })
      );
      await waitFor(() => expect(screen.getAllByText('10:00')).toHaveLength(2));
      await act(async () =>
        receive({
          ...payload,
          type: 'GAME_TIMEOUT',
          roundId: payload.matchId,
          requesterAddress: 'one',
          recipientAddress: 'two',
          recipientNonce: '22'.repeat(16),
          phase: 'ending',
          transcript: [],
          loser: 1,
          clock: { remainingMs: [0, 600000], runningSeat: null },
        })
      );
      await waitFor(() =>
        expect(screen.getByText(prefix + 'lost_on_time')).toBeInTheDocument()
      );
      expect(screen.getByText('0:00')).toBeInTheDocument();
      await act(async () =>
        receive({
          ...payload,
          type: 'GAME_SNAPSHOT',
          roundId: payload.matchId,
          requesterAddress: 'one',
          recipientAddress: 'two',
          recipientNonce: '22'.repeat(16),
          phase: 'session_idle',
          transcript: [],
          timeoutSeat: 1,
          clock: { remainingMs: [0, 600000], runningSeat: null },
        })
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Rematch' })).toBeEnabled()
      );
      expect(screen.getByText(prefix + 'lost_on_time')).toBeInTheDocument();
    }
  );
  it.each(['random', 'white', 'black', 'choose'])(
    'sends the selected %s option',
    async (color) => {
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Challenge' }));
      fireEvent.mouseDown(
        screen.getByRole('combobox', { name: prefix + 'color' })
      );
      fireEvent.click(screen.getByRole('option', { name: prefix + color }));
      fireEvent.click(screen.getByRole('button', { name: prefix + 'send' }));
      const payload = vi
        .mocked(qortalLandRealtime.send)
        .mock.calls.map(([value]) => value)
        .find((value) => value.type === 'OPEN_GAME_LINK');
      expect(payload?.game).toBe('chess');
      expect(payload?.chessColor).toBe(color === 'random' ? undefined : color);
    }
  );
  it.each(['white', 'black'])(
    'lets the recipient choose %s before accepting',
    async (color) => {
      await ready();
      await act(async () =>
        receive({
          type: 'GAME_INVITE_RECEIVED',
          matchId: '00112233-4455-4677-8899-aabbccddeeff',
          requesterAddress: 'two',
          recipientAddress: 'one',
          requesterNonce: '33'.repeat(16),
          game: 'chess',
          chessColor: 'choose',
          expiresAt: Date.now() + 60000,
        })
      );
      fireEvent.mouseDown(
        screen.getByRole('combobox', { name: prefix + 'color' })
      );
      fireEvent.click(screen.getByRole('option', { name: prefix + color }));
      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
      expect(qortalLandRealtime.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'RESPOND_TO_INVITE',
          decision: 'accept',
          chessWhiteSeat: color === 'white' ? 2 : 1,
        })
      );
    }
  );
});
