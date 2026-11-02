import { readChessClock, type ChessClockView } from './chessClock';
import i18n from '../../../i18n/i18n';
import { hashChessState, type ChessState } from './chess';
import type { GameChatMessage } from './GameSessionChat';

export const QORTAL_LAND_GAME_CHANNEL_ID = 'qortal-land';
export const CHESS_SPECTATOR_SNAPSHOT_TTL_MS = 10 * 60_000;

export type ChessSpectatorSnapshot = {
  eventId: string;
  authorAddress: string;
  matchId: string;
  roundId: string;
  requesterAddress: string;
  recipientAddress: string;
  state: ChessState;
  stateHash: string;
  phase: 'active' | 'finished';
  timestamp: number;
  expiresAt: number;
  clock?: ChessClockView;
};

export type ChessSpectatorClose = {
  eventId: string;
  authorAddress: string;
  matchId: string;
  roundId: string;
  timestamp: number;
};

export type ChessSpectatorChat = GameChatMessage & {
  matchId: string;
  roundId: string;
};

export type ChessSpectatorEvent =
  | { kind: 'snapshot'; snapshot: ChessSpectatorSnapshot }
  | { kind: 'close'; close: ChessSpectatorClose }
  | { kind: 'chat'; chat: ChessSpectatorChat };

export type ChessSpectatorAttestations = Map<
  string,
  Map<string, ChessSpectatorSnapshot>
>;

type ReticulumEvent = {
  eventId?: unknown;
  groupId?: unknown;
  channelId?: unknown;
  eventType?: unknown;
  authorAddress?: unknown;
  encryptedPayload?: unknown;
  timestamp?: unknown;
};

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const isHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

export const isChessSpectatorState = (value: unknown): value is ChessState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Partial<ChessState>;
  const outcome = state.outcome;
  const validOutcome =
    outcome === null ||
    (typeof outcome === 'object' &&
      outcome !== null &&
      (outcome.type === 'draw' ||
        outcome.type === 'abandoned' ||
        outcome.type === 'protocol-error' ||
        ((outcome.type === 'win' ||
          outcome.type === 'resigned' ||
          outcome.type === 'timeout') &&
          (outcome.winner === 1 || outcome.winner === 2))));
  return (
    (state.chess960 === undefined ||
      (Number.isInteger(state.chess960) &&
        state.chess960 >= 0 &&
        state.chess960 < 960)) &&
    Array.isArray(state.board) &&
    state.board.length === 64 &&
    state.board.every(
      (piece) =>
        Number.isInteger(piece) && Number(piece) >= -6 && Number(piece) <= 6
    ) &&
    (state.nextSeat === 1 || state.nextSeat === 2) &&
    (state.whiteSeat === 1 || state.whiteSeat === 2) &&
    Number.isInteger(state.ply) &&
    Number(state.ply) >= 0 &&
    Number(state.ply) <= 600 &&
    Number.isInteger(state.halfmoveClock) &&
    Array.isArray(state.castlingRights) &&
    state.castlingRights.length === 4 &&
    state.castlingRights.every((right) => typeof right === 'boolean') &&
    (state.enPassant === null ||
      (Number.isInteger(state.enPassant) &&
        Number(state.enPassant) >= 0 &&
        Number(state.enPassant) < 64)) &&
    validOutcome
  );
};

export function parseChessSpectatorEvent(
  event: ReticulumEvent,
  expectedGroupId: number
): ChessSpectatorEvent | null {
  if (
    !event ||
    Number(event.groupId) !== expectedGroupId ||
    event.channelId !== QORTAL_LAND_GAME_CHANNEL_ID ||
    event.eventType !== 'message' ||
    typeof event.eventId !== 'string' ||
    typeof event.authorAddress !== 'string' ||
    typeof event.encryptedPayload !== 'string'
  ) {
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(event.encryptedPayload) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.qortalLand !== true ||
    payload.version !== 1
  )
    return null;
  const type = String(payload.qortalLandType || '');
  const timestamp = Number(event.timestamp);
  const matchId = payload.matchId;
  const roundId = payload.roundId;
  if (
    !isUuid(matchId) ||
    !isUuid(roundId) ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    timestamp > Date.now() + 60_000
  )
    return null;

  if (type === 'chess_spectator_state') {
    const requesterAddress = String(payload.requesterAddress || '');
    const recipientAddress = String(payload.recipientAddress || '');
    const authorAddress = event.authorAddress;
    const state = payload.state;
    const stateHash = payload.stateHash;
    const phase = payload.phase;
    const expiresAt = Number(payload.expiresAt);
    if (
      !requesterAddress ||
      !recipientAddress ||
      requesterAddress === recipientAddress ||
      ![requesterAddress, recipientAddress].includes(authorAddress) ||
      !isChessSpectatorState(state) ||
      !isHash(stateHash) ||
      (phase !== 'active' && phase !== 'finished') ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= timestamp ||
      expiresAt - timestamp > CHESS_SPECTATOR_SNAPSHOT_TTL_MS
    ) {
      return null;
    }
    return {
      kind: 'snapshot',
      snapshot: {
        eventId: event.eventId,
        authorAddress,
        matchId,
        roundId,
        requesterAddress,
        recipientAddress,
        state,
        stateHash: stateHash.toLowerCase(),
        phase,
        timestamp,
        expiresAt,
        clock: readChessClock(payload.clock, timestamp),
      },
    };
  }

  if (type === 'chess_spectator_closed') {
    return {
      kind: 'close',
      close: {
        eventId: event.eventId,
        authorAddress: event.authorAddress,
        matchId,
        roundId,
        timestamp,
      },
    };
  }

  if (type === 'chess_spectator_chat') {
    const text =
      typeof payload.messageText === 'string' ? payload.messageText.trim() : '';
    if (
      !text ||
      text.length > 500 ||
      new TextEncoder().encode(text).length > 2_000
    ) {
      return null;
    }
    return {
      kind: 'chat',
      chat: {
        matchId,
        roundId,
        messageId: isUuid(payload.messageId)
          ? payload.messageId
          : event.eventId,
        authorAddress: event.authorAddress,
        text,
        createdAt: timestamp,
        delivered: true,
      },
    };
  }

  return null;
}

export async function verifyChessSpectatorSnapshot(
  snapshot: ChessSpectatorSnapshot
): Promise<boolean> {
  return (await hashChessState(snapshot.state)) === snapshot.stateHash;
}

export function recordChessSpectatorAttestation(
  records: ChessSpectatorAttestations,
  snapshot: ChessSpectatorSnapshot
): ChessSpectatorSnapshot | null {
  if (
    snapshot.expiresAt <= Date.now() ||
    snapshot.requesterAddress === snapshot.recipientAddress ||
    ![snapshot.requesterAddress, snapshot.recipientAddress].includes(
      snapshot.authorAddress
    )
  )
    return null;
  const key = [
    snapshot.matchId,
    snapshot.roundId,
    snapshot.state.ply,
    snapshot.stateHash,
    snapshot.phase,
    snapshot.requesterAddress,
    snapshot.recipientAddress,
  ].join(':');
  const attestations =
    records.get(key) || new Map<string, ChessSpectatorSnapshot>();
  const previous = attestations.get(snapshot.authorAddress);
  if (!previous || previous.timestamp < snapshot.timestamp) {
    attestations.set(snapshot.authorAddress, snapshot);
  }
  records.set(key, attestations);
  if (records.size > 64) {
    const oldest = records.keys().next().value;
    if (oldest) records.delete(oldest);
  }
  const requester = attestations.get(snapshot.requesterAddress);
  const recipient = attestations.get(snapshot.recipientAddress);
  if (!requester || !recipient) return null;
  const expiresAt = Math.min(requester.expiresAt, recipient.expiresAt);
  if (expiresAt <= Date.now()) return null;
  return {
    ...snapshot,
    timestamp: Math.min(requester.timestamp, recipient.timestamp),
    expiresAt,
  };
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (part) =>
    part.toString(16).padStart(2, '0')
  ).join('');
};

export async function publishChessSpectatorEvent(input: {
  groupId: number;
  authorAddress: string;
  sessionId: string;
  payload: Record<string, unknown>;
}): Promise<{ eventId: string; timestamp: number }> {
  const eventId = crypto.randomUUID();
  const timestamp = Date.now();
  const authorSequence = await window.reticulumChat?.reserveAuthorSequence?.(
    input.groupId,
    input.authorAddress
  );
  if (
    !authorSequence ||
    !/^[0-9a-f]{32}$/.test(authorSequence.authorStreamId) ||
    !Number.isInteger(authorSequence.authorSeq) ||
    authorSequence.authorSeq <= 0
  ) {
    throw new Error(
      i18n.t('group:qortal_land.games.spectators.errors.sequence')
    );
  }

  let committed = false;
  try {
    const encryptedPayload = JSON.stringify({
      ...input.payload,
      qortalLand: true,
      sessionId: input.sessionId,
      version: 1,
    });
    const baseFields = {
      eventId,
      groupId: input.groupId,
      channelId: QORTAL_LAND_GAME_CHANNEL_ID,
      authorStreamId: authorSequence.authorStreamId,
      authorSeq: authorSequence.authorSeq,
      timestamp,
      eventType: 'message',
      targetEventId: null,
      replyToEventId: null,
      encryptedPayload,
      payloadHash: await sha256Hex(encryptedPayload),
      mentionAddressHashes: [],
    };
    const signed = (await window.sendMessage?.(
      'signReticulumChatEvent',
      baseFields,
      10_000
    )) as
      | {
          authorAddress?: string;
          authorPublicKey?: string;
          signature?: string;
          error?: string;
        }
      | undefined;
    if (
      !signed ||
      signed.error ||
      signed.authorAddress !== input.authorAddress
    ) {
      throw new Error(
        signed?.error ||
          i18n.t('group:qortal_land.games.spectators.errors.sign')
      );
    }
    const result = await window.reticulumChat?.publishEvent?.({
      ...baseFields,
      authorAddress: signed.authorAddress,
      authorPublicKey: signed.authorPublicKey,
      signature: signed.signature,
    });
    if (!result?.success) {
      throw new Error(
        result?.error ||
          i18n.t('group:qortal_land.games.spectators.errors.send')
      );
    }
    committed = true;
    return { eventId, timestamp };
  } finally {
    if (!committed) {
      await window.reticulumChat
        ?.releaseAuthorSequence?.(
          input.groupId,
          input.authorAddress,
          authorSequence.authorStreamId,
          authorSequence.authorSeq
        )
        .catch(() => false);
    }
  }
}
