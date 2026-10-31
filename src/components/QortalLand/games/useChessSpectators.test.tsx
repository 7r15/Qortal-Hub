import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChessState, hashChessState } from './chess';
import { useQortalLandGame } from './useQortalLandGame';

const t = (key: string) => key;
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t }),
}));

const matchId = '00112233-4455-4677-8899-aabbccddeeff';
const roundId = '11112233-4455-4677-8899-aabbccddeeff';
let receive: (input: { event: unknown }) => void;
let history: unknown[];
let previousChat: typeof window.reticulumChat;

function Harness({ groupId = 7 }: { groupId?: number }) {
  return useQortalLandGame({
    address: 'Q-watcher',
    groupId,
    sessionId: 'watch-session',
    roomId: 'room',
    enabled: true,
  }).modal;
}

async function snapshots(round = roundId, timestamp = Date.now()) {
  const state = createChessState(1);
  const payload = {
    qortalLand: true,
    version: 1,
    qortalLandType: 'chess_spectator_state',
    matchId,
    roundId: round,
    requesterAddress: 'Q-one',
    recipientAddress: 'Q-two',
    state,
    stateHash: await hashChessState(state),
    phase: 'active',
    expiresAt: timestamp + 60_000,
  };
  return ['Q-one', 'Q-two'].map((authorAddress) => ({
    eventId: crypto.randomUUID(),
    groupId: 7,
    channelId: 'qortal-land',
    eventType: 'message',
    authorAddress,
    timestamp,
    encryptedPayload: JSON.stringify(payload),
  }));
}

function closeEvent(
  timestamp: number,
  authorAddress = 'Q-one',
  round = roundId
) {
  return {
    eventId: crypto.randomUUID(),
    groupId: 7,
    channelId: 'qortal-land',
    eventType: 'message',
    authorAddress,
    timestamp,
    encryptedPayload: JSON.stringify({
      qortalLand: true,
      version: 1,
      qortalLandType: 'chess_spectator_closed',
      matchId,
      roundId: round,
    }),
  };
}

const watch = () =>
  screen.queryByRole('button', {
    name: 'group:qortal_land.games.spectators.watch',
  });

beforeEach(() => {
  history = [];
  previousChat = window.reticulumChat;
  window.reticulumChat = {
    onEvent: vi.fn((callback) => {
      receive = callback;
      return vi.fn();
    }),
    getMessageHistory: vi.fn(async () => history),
  } as unknown as typeof window.reticulumChat;
});

afterEach(() => {
  cleanup();
  window.reticulumChat = previousChat;
});

describe('spectator event lifecycle', () => {
  it('shows spectator chat without letting another author suppress a message', async () => {
    history = await snapshots();
    render(<Harness />);
    await waitFor(() => expect(watch()).toBeVisible());
    fireEvent.click(watch()!);
    const messageId = crypto.randomUUID();
    await act(async () => {
      for (const [authorAddress, text] of [
        ['Q-viewer-one', 'Nice move'],
        ['Q-viewer-two', 'Well played'],
      ]) {
        const event = {
          ...closeEvent(Date.now(), authorAddress),
          encryptedPayload: JSON.stringify({
            qortalLand: true,
            version: 1,
            qortalLandType: 'chess_spectator_chat',
            matchId,
            roundId,
            messageId,
            messageText: text,
          }),
        };
        receive({ event });
        receive({ event });
      }
    });
    expect(screen.getAllByText('Nice move')).toHaveLength(1);
    expect(screen.getAllByText('Well played')).toHaveLength(1);
  });

  it('requires both players and removes the game when either revokes consent', async () => {
    const [one, two] = await snapshots();
    render(<Harness />);
    await act(async () => {
      receive({ event: one });
    });
    expect(watch()).toBeNull();
    await act(async () => {
      receive({ event: two });
    });
    await waitFor(() => expect(watch()).toBeVisible());
    await act(async () => {
      receive({ event: closeEvent(Date.now(), 'Q-stranger') });
    });
    expect(watch()).toBeVisible();
    await act(async () => {
      receive({ event: closeEvent(Date.now()) });
    });
    await waitFor(() => expect(watch()).toBeNull());
  });

  it('honors a revocation received before delayed board snapshots', async () => {
    const timestamp = Date.now() - 1000;
    const boards = await snapshots(roundId, timestamp);
    render(<Harness />);
    await act(async () => {
      receive({ event: closeEvent(timestamp + 1) });
      boards.forEach((event) => receive({ event }));
    });
    expect(watch()).toBeNull();
  });

  it('cannot restore a game when revocation arrives during hash verification', async () => {
    const timestamp = Date.now() - 1000;
    const boards = await snapshots(roundId, timestamp);
    render(<Harness />);
    await act(async () => {
      boards.forEach((event) => receive({ event }));
      receive({ event: closeEvent(timestamp + 1) });
    });
    expect(watch()).toBeNull();
  });

  it('accepts a new round and ignores a delayed close for the previous round', async () => {
    const timestamp = Date.now() - 1000;
    history = await snapshots(roundId, timestamp);
    render(<Harness />);
    await waitFor(() => expect(watch()).toBeVisible());
    const boards = await snapshots(
      '22222233-4455-4677-8899-aabbccddeeff',
      timestamp + 500
    );
    await act(async () => {
      boards.forEach((event) => receive({ event }));
    });
    await act(async () => {
      receive({ event: closeEvent(timestamp + 100) });
    });
    expect(watch()).toBeVisible();
  });

  it('closes the spectator board and clears discoveries when the group changes', async () => {
    history = await snapshots();
    const view = render(<Harness />);
    await waitFor(() => expect(watch()).toBeVisible());
    fireEvent.click(watch()!);
    expect(screen.getByRole('dialog')).toBeVisible();
    view.rerender(<Harness groupId={8} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(watch()).toBeNull());
  });
});
