import { describe, expect, it } from 'vitest';
import { createChessState, hashChessState } from './chess';
import {
  parseChessSpectatorEvent,
  recordChessSpectatorAttestation,
  verifyChessSpectatorSnapshot,
  CHESS_SPECTATOR_SNAPSHOT_TTL_MS,
  type ChessSpectatorSnapshot,
} from './chessSpectators';

const matchId = '00112233-4455-4677-8899-aabbccddeeff';
const roundId = '11112233-4455-4677-8899-aabbccddeeff';

const snapshot = (): ChessSpectatorSnapshot => ({
  eventId: crypto.randomUUID(),
  authorAddress: 'Q-requester',
  matchId,
  roundId,
  requesterAddress: 'Q-requester',
  recipientAddress: 'Q-recipient',
  state: createChessState(1),
  stateHash: '00'.repeat(32),
  phase: 'active',
  timestamp: Date.now(),
  expiresAt: Date.now() + 60_000,
});

const event = (payload: unknown) => ({
  eventId: crypto.randomUUID(),
  groupId: 7,
  channelId: 'qortal-land',
  eventType: 'message',
  authorAddress: 'Q-requester',
  timestamp: Date.now(),
  encryptedPayload: JSON.stringify(payload),
});

describe('Chess spectator events', () => {
  it.each([null, [], 12, 'text', false])(
    'ignores non-object payload %j',
    (payload) => {
      expect(parseChessSpectatorEvent(event(payload), 7)).toBeNull();
    }
  );

  it('rejects self-attestation and unbounded expiry', () => {
    const payload = {
      ...snapshot(),
      qortalLand: true,
      version: 1,
      qortalLandType: 'chess_spectator_state',
    };
    expect(
      parseChessSpectatorEvent(
        event({
          ...payload,
          recipientAddress: payload.requesterAddress,
        }),
        7
      )
    ).toBeNull();
    expect(
      parseChessSpectatorEvent(
        event({
          ...payload,
          expiresAt: Date.now() + CHESS_SPECTATOR_SNAPSHOT_TTL_MS * 2,
        }),
        7
      )
    ).toBeNull();
  });

  it('limits shared consent to the earlier expiry and ignores expired consent', () => {
    const first = snapshot();
    const records = new Map();
    recordChessSpectatorAttestation(records, first);
    expect(
      recordChessSpectatorAttestation(records, {
        ...first,
        authorAddress: 'Q-recipient',
        expiresAt: first.expiresAt + 60_000,
      })?.expiresAt
    ).toBe(first.expiresAt);
    const expired = {
      ...first,
      timestamp: Date.now() - 1000,
      expiresAt: Date.now() - 1,
    };
    expect(recordChessSpectatorAttestation(new Map(), expired)).toBeNull();
  });

  it('does not replace a renewed attestation with delayed history', () => {
    const first = snapshot();
    const records = new Map();
    recordChessSpectatorAttestation(records, first);
    recordChessSpectatorAttestation(records, {
      ...first,
      timestamp: first.timestamp - 10_000,
      expiresAt: first.expiresAt - 10_000,
    });
    expect(
      recordChessSpectatorAttestation(records, {
        ...first,
        authorAddress: 'Q-recipient',
      })?.expiresAt
    ).toBe(first.expiresAt);
  });
  it('parses and verifies a player-attested board snapshot', async () => {
    const state = createChessState(1);
    const stateHash = await hashChessState(state);
    const timestamp = Date.now();
    const parsed = parseChessSpectatorEvent(
      {
        eventId: crypto.randomUUID(),
        groupId: 7,
        channelId: 'qortal-land',
        eventType: 'message',
        authorAddress: 'Q-requester',
        timestamp,
        encryptedPayload: JSON.stringify({
          qortalLand: true,
          version: 1,
          qortalLandType: 'chess_spectator_state',
          matchId,
          roundId,
          requesterAddress: 'Q-requester',
          recipientAddress: 'Q-recipient',
          state,
          stateHash,
          phase: 'active',
          expiresAt: timestamp + 60_000,
        }),
      },
      7
    );

    expect(parsed?.kind).toBe('snapshot');
    if (parsed?.kind !== 'snapshot') throw new Error('snapshot expected');
    await expect(verifyChessSpectatorSnapshot(parsed.snapshot)).resolves.toBe(
      true
    );
  });

  it('rejects snapshots published by someone other than the two players', async () => {
    const state = createChessState(1);
    const timestamp = Date.now();
    expect(
      parseChessSpectatorEvent(
        {
          eventId: crypto.randomUUID(),
          groupId: 7,
          channelId: 'qortal-land',
          eventType: 'message',
          authorAddress: 'Q-spectator',
          timestamp,
          encryptedPayload: JSON.stringify({
            qortalLand: true,
            version: 1,
            qortalLandType: 'chess_spectator_state',
            matchId,
            roundId,
            requesterAddress: 'Q-requester',
            recipientAddress: 'Q-recipient',
            state,
            stateHash: await hashChessState(state),
            phase: 'active',
            expiresAt: timestamp + 60_000,
          }),
        },
        7
      )
    ).toBeNull();
  });

  it('requires matching attestations from both players before exposing a game', async () => {
    const state = createChessState(1);
    const stateHash = await hashChessState(state);
    const snapshot = {
      eventId: crypto.randomUUID(),
      authorAddress: 'Q-requester',
      matchId,
      roundId,
      requesterAddress: 'Q-requester',
      recipientAddress: 'Q-recipient',
      state,
      stateHash,
      phase: 'active' as const,
      timestamp: Date.now(),
      expiresAt: Date.now() + 60_000,
    };
    const records = new Map();

    expect(recordChessSpectatorAttestation(records, snapshot)).toBeNull();
    expect(
      recordChessSpectatorAttestation(records, {
        ...snapshot,
        eventId: crypto.randomUUID(),
        authorAddress: 'Q-recipient',
      })
    ).toMatchObject({ stateHash, authorAddress: 'Q-recipient' });

    const conflictingRecords = new Map();
    expect(
      recordChessSpectatorAttestation(conflictingRecords, snapshot)
    ).toBeNull();
    expect(
      recordChessSpectatorAttestation(conflictingRecords, {
        ...snapshot,
        eventId: crypto.randomUUID(),
        authorAddress: 'Q-recipient',
        stateHash: 'ff'.repeat(32),
      })
    ).toBeNull();
  });

  it('accepts group-member spectator chat without treating it as a move', () => {
    const parsed = parseChessSpectatorEvent(
      {
        eventId: crypto.randomUUID(),
        groupId: 7,
        channelId: 'qortal-land',
        eventType: 'message',
        authorAddress: 'Q-spectator',
        timestamp: Date.now(),
        encryptedPayload: JSON.stringify({
          qortalLand: true,
          version: 1,
          qortalLandType: 'chess_spectator_chat',
          matchId,
          roundId,
          messageText: 'Good move!',
        }),
      },
      7
    );
    expect(parsed).toMatchObject({
      kind: 'chat',
      chat: { authorAddress: 'Q-spectator', text: 'Good move!' },
    });
  });
});
