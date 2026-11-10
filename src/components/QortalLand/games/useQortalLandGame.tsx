import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Alert, Button, Snackbar } from '@mui/material';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n/i18n';
import { appLockedAtom } from '../../../atoms/presence';
import {
  applyConnectFourMove,
  connectFourDropRow,
  createConnectFourState,
  deriveConnectFourStartingSeat,
  hashConnectFourState,
  type ConnectFourMove,
  type ConnectFourSeat,
  type ConnectFourState,
} from './connectFour';
import {
  ConnectFourGameDialog,
  type ConnectFourGameView,
} from './ConnectFourGameDialog';
import {
  applyCheckersMove,
  createCheckersState,
  deriveCheckersStartingSeat,
  hashCheckersState,
  type CheckersMove,
  type CheckersState,
} from './checkers';
import { CheckersGameDialog } from './CheckersGameDialog';
import {
  applyChessMove,
  chessTimeoutOutcome,
  type ChessOutcome,
  createChessState,
  hashChessState,
  type ChessMove,
  type ChessPromotion,
  type ChessState,
} from './chess';
import { ChessChallengeDialog } from './ChessChallengeDialog';
import { ChessColorControl } from './ChessColorControl';
import { useChessTurnNotice } from './useChessTurnNotice';
import { deriveChess960Position } from './chess960';
import {
  isChessGame,
  chessStartingSeat,
  readChessOptions,
  type ChessColorChoice,
  type ChessTimeControl,
  type ChessOptions,
} from './chessOptions';
import { ChessClockDisplay, ChessTimeSummary } from './ChessClockDisplay';
import { readChessClock, sampleChessClock, type ChessClockView } from './chessClock';
import { ChessGameDialog } from './ChessGameDialog';
import { ChessSpectatorDialog } from './ChessSpectatorDialog';
import {
  CHESS_SPECTATOR_SNAPSHOT_TTL_MS,
  parseChessSpectatorEvent,
  publishChessSpectatorEvent,
  QORTAL_LAND_GAME_CHANNEL_ID,
  recordChessSpectatorAttestation,
  verifyChessSpectatorSnapshot,
  type ChessSpectatorAttestations,
  type ChessSpectatorChat,
  type ChessSpectatorSnapshot,
} from './chessSpectators';
import {
  GameSessionChatSharedContext,
  type GameChatMessage,
} from './GameSessionChat';
import { qortalLandRealtime } from '../realtime/qortalLandRealtime';

type Target = {
  address: string;
  sessionId: string;
  destinationHash: string;
  name?: string;
};
export type QortalLandGameId = 'connect-four' | 'checkers' | 'chess' | 'chess960';
export type QortalLandGameState = ConnectFourState | CheckersState | ChessState;
export type QortalLandGameMove = ConnectFourMove | CheckersMove | ChessMove;
export type QortalLandGameMatchView = Omit<ConnectFourGameView, 'state' | 'moves' | 'outcome'> & {
  game: QortalLandGameId;
  state?: QortalLandGameState;
  moves: QortalLandGameMove[];
  spectatorsEnabled?: boolean;
  outcome?: ConnectFourGameView['outcome'] | ChessOutcome;
  clock?: ChessClockView;
} & ChessOptions;

type Match = QortalLandGameMatchView & {
  requesterSessionId?: string;
  recipientSessionId?: string;
  requesterDestinationHash?: string;
  recipientDestinationHash?: string;
  localSpectatorsAllowed?: boolean;
  remoteSpectatorsAllowed?: boolean;
  remoteSpectatorsSupported?: boolean;
};
const isGameId = (value: unknown): value is QortalLandGameId =>
  value === 'connect-four' || value === 'checkers' || isChessGame(value);

const gameMaxPly = (game: QortalLandGameId): number =>
  game === 'connect-four' ? 42 : game === 'checkers' ? 200 : 600;

const gameConfig = (game: QortalLandGameId) => ({ game, gameVersion: 1, rulesVersion: 1 });

const deriveStartingSeat = (game: QortalLandGameId, roundId: string, requesterNonce: string, recipientNonce: string, options: ChessOptions = {}) =>
  game === 'checkers'
    ? deriveCheckersStartingSeat(roundId, requesterNonce, recipientNonce)
    : isChessGame(game)
      ? chessStartingSeat(options, roundId, requesterNonce, recipientNonce, game)
      : deriveConnectFourStartingSeat(roundId, requesterNonce, recipientNonce);

const createGameState = (game: QortalLandGameId, seat: ConnectFourSeat, position?: number) =>
  game === 'checkers' ? createCheckersState(seat) : isChessGame(game) ? createChessState(seat, position) : createConnectFourState(seat);

const hashGameState = (game: QortalLandGameId, state: QortalLandGameState) =>
  game === 'checkers'
    ? hashCheckersState(state as CheckersState)
    : isChessGame(game)
      ? hashChessState(state as ChessState)
      : hashConnectFourState(state as ConnectFourState);

const applyGameMove = (game: QortalLandGameId, state: QortalLandGameState, seat: ConnectFourSeat, move: Record<string, unknown>): QortalLandGameState => {
  if (game === 'checkers') {
    if (!Number.isInteger(move.from) || !Array.isArray(move.path)) throw new Error(i18n.t('group:qortal_land.games.errors.invalid_checkers_move'));
    return applyCheckersMove(state as CheckersState, seat, Number(move.from), move.path.map(Number));
  }
  if (isChessGame(game)) {
    if (!Number.isInteger(move.from) || !Number.isInteger(move.to)) throw new Error(i18n.t('group:qortal_land.games.errors.invalid_chess_move'));
    const promotion = move.promotion === undefined ? undefined : Number(move.promotion) as ChessPromotion;
    return applyChessMove(state as ChessState, seat, Number(move.from), Number(move.to), promotion);
  }
  if (!Number.isInteger(move.column)) throw new Error(i18n.t('group:qortal_land.games.errors.invalid_connect_four_move'));
  return applyConnectFourMove(state as ConnectFourState, seat, Number(move.column));
};

export const seatForIncomingQortalLandGameMove = (
  messageType: unknown,
  state: QortalLandGameState,
  localSeat: ConnectFourSeat
): ConnectFourSeat => (
  messageType === 'SYNC_MOVE' ? state.nextSeat : localSeat === 1 ? 2 : 1
);

type Options = {
  address: string;
  publicKey?: string;
  groupId: number;
  sessionId: string;
  roomId: string;
  enabled: boolean;
  doNotDisturb?: boolean;
  onActivity?: () => void;
  onActiveChange?: (active: boolean) => void;
  onPlayerSeen?: (address: string) => void;
  resolvePlayerName?: (address: string) => string;
};

const randomHex = (bytes: number): string => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (part) => part.toString(16).padStart(2, '0')).join('');
};

const spectatorChatKey = (matchId: string, roundId: string) =>
  `${matchId}:${roundId}`;

const parseChatMessages = (value: unknown): GameChatMessage[] => (
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const candidate = item as Record<string, unknown>;
        if (
          typeof candidate.messageId !== 'string' ||
          typeof candidate.authorAddress !== 'string' ||
          typeof candidate.text !== 'string' ||
          typeof candidate.createdAt !== 'number'
        ) return [];
        return [{
          messageId: candidate.messageId,
          authorAddress: candidate.authorAddress,
          text: candidate.text,
          createdAt: candidate.createdAt,
          delivered: candidate.delivered === true,
        }];
      }).slice(-100)
    : []
);

export const isRetryableQortalLandGameTransportError = (
  error: unknown,
  phase?: Match['phase']
): boolean => {
  const normalized = String(error || '').trim().toLowerCase();
  return (
    normalized === 'channel_send_failed' ||
    normalized === 'game_link_recovering' ||
    normalized === "('link is not ready',)" ||
    normalized === "('outlet did not transmit packet',)" ||
    normalized === 'link is not ready' ||
    normalized === 'outlet did not transmit packet' ||
    (normalized === 'match_not_active' && phase === 'reconnecting')
  );
};

export const canSignQortalLandGameHandshake = (
  fields: Record<string, unknown>,
  current: (Pick<Match, 'matchId' | 'requesterAddress' | 'recipientAddress' | 'requesterNonce'> & Partial<Pick<Match, 'recipientNonce' | 'roundId' | 'game' | 'chessColor' | 'chessWhiteSeat' | 'chessTime' | 'requesterSessionId' | 'recipientSessionId' | 'requesterDestinationHash' | 'recipientDestinationHash'>>) | null,
  address: string,
  publicKey: string
): boolean => {
  const type = String(fields.type || '');
  if (fields.signerPublicKey !== publicKey) return false;
  if (type === 'QORTAL_LAND_GAME_DECLINE' && ['busy', 'superseded'].includes(String(fields.reason))) {
    return fields.responderAddress === address;
  }
  if (!current || fields.matchId !== current.matchId) return false;
  if (type.startsWith('QORTAL_LAND_GAME_RESUME_')) {
    const lastAcknowledgedPly = fields.lastAcknowledgedPly;
    const currentGame = current.game || 'connect-four';
    if (
      !Number.isSafeInteger(lastAcknowledgedPly) ||
      Number(lastAcknowledgedPly) < 0 ||
      Number(lastAcknowledgedPly) > gameMaxPly(currentGame)
    ) return false;
    if (
      type === 'QORTAL_LAND_GAME_RESUME_REQUEST' &&
      (fields.sourceSessionId !== current?.requesterSessionId ||
        fields.targetSessionId !== current?.recipientSessionId ||
        fields.sourceDestinationHash !== current?.requesterDestinationHash ||
        fields.targetDestinationHash !== current?.recipientDestinationHash)
    ) return false;
  }
  if (
    type === 'QORTAL_LAND_GAME_INVITE' ||
    type === 'QORTAL_LAND_GAME_RESUME_REQUEST' ||
    type === 'QORTAL_LAND_GAME_RESUME_CONFIRM'
  ) {
    const identityMatches = (
      fields.requesterAddress === address &&
      current.requesterAddress === address &&
      (!fields.recipientAddress || fields.recipientAddress === current.recipientAddress)
    );
    if (!identityMatches) return false;
    if (type === 'QORTAL_LAND_GAME_INVITE') {
      return (
        fields.protocolVersion === 2 &&
        fields.chessColor === current.chessColor &&
        fields.chessTime === current.chessTime &&
        fields.game === (current.game || 'connect-four') &&
        fields.gameVersion === 1 &&
        fields.rulesVersion === 1 &&
        fields.requesterNonce === current.requesterNonce &&
        fields.sourceSessionId === current.requesterSessionId &&
        fields.targetSessionId === current.recipientSessionId &&
        fields.sourceDestinationHash === current.requesterDestinationHash &&
        fields.targetDestinationHash === current.recipientDestinationHash
      );
    }
    return fields.roundId === current.roundId;
  }
  if (type === 'QORTAL_LAND_GAME_CONFIRM') {
    return (
      fields.requesterAddress === address &&
      current.requesterAddress === address &&
      fields.requesterNonce === current.requesterNonce &&
      fields.recipientNonce === current.recipientNonce
    );
  }
  if (
    type === 'QORTAL_LAND_GAME_ACCEPT' ||
    type === 'QORTAL_LAND_GAME_DECLINE' ||
    type === 'QORTAL_LAND_GAME_RESUME_ACCEPT'
  ) {
    if (fields.responderAddress !== address || current.recipientAddress !== address) {
      return false;
    }
    if (type === 'QORTAL_LAND_GAME_ACCEPT') {
      return (
        fields.requesterNonce === current.requesterNonce &&
        fields.recipientNonce === current.recipientNonce &&
        fields.chessWhiteSeat === current.chessWhiteSeat
      );
    }
    if (type === 'QORTAL_LAND_GAME_RESUME_ACCEPT') {
      return fields.roundId === current.roundId;
    }
    return true;
  }
  return false;
};

export function useQortalLandGame(options: Options) {
  const {
    address,
    publicKey,
    groupId,
    sessionId,
    roomId,
    enabled,
    doNotDisturb = false,
    onActivity,
    onActiveChange,
    onPlayerSeen,
    resolvePlayerName,
  } = options;
  const { t } = useTranslation(['group']);
  const reconnectingError = t('group:qortal_land.games.errors.reconnecting');
  const isAppLocked = useAtomValue(appLockedAtom);
  const [transportReady, setTransportReady] = useState(false);
  const [localDestinationHash, setLocalDestinationHash] = useState('');
  const [match, setMatch] = useState<Match | null>(null);
  const [challengeTarget, setChallengeTarget] = useState<{ target: Target; game: 'chess' | 'chess960' } | null>(null);
  const [chosenWhiteSeat, setChosenWhiteSeat] = useState<1 | 2>(2);
  const turnNotice = useChessTurnNotice(match, isAppLocked || doNotDisturb || !enabled);
  const [now, setNow] = useState(Date.now());
  const matchRef = useRef<Match | null>(null);
  const eventChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingCommandsRef = useRef(new Map<string, { type: string; matchId?: string; messageId?: string }>());
  const moveInFlightRef = useRef(false);
  const typingSentRef = useRef(false);
  const typingTimerRef = useRef<number | null>(null);
  const doNotDisturbRef = useRef(doNotDisturb);
  const spectatorAttestationsRef = useRef<ChessSpectatorAttestations>(new Map());
  const spectatorMatchesRef = useRef(new Map<string, ChessSpectatorSnapshot>());
  const spectatorClosedAtRef = useRef(new Map<string, number>());
  const [spectatorMatches, setSpectatorMatches] = useState<ChessSpectatorSnapshot[]>([]);
  const [spectatorChats, setSpectatorChats] = useState<Record<string, GameChatMessage[]>>({});
  const [watchedMatchId, setWatchedMatchId] = useState<string | null>(null);
  const [dismissedWatchMatchId, setDismissedWatchMatchId] = useState<string | null>(null);
  const lastSharedMatchRef = useRef<{ matchId: string; roundId: string } | null>(null);
  const spectatorContextRef = useRef('');

  useEffect(() => {
    setChallengeTarget(null);
    spectatorContextRef.current = `${address}:${groupId}:${sessionId}`;
    spectatorAttestationsRef.current.clear();
    spectatorMatchesRef.current.clear();
    spectatorClosedAtRef.current.clear();
    setSpectatorMatches([]);
    setSpectatorChats({});
    setWatchedMatchId(null);
    setDismissedWatchMatchId(null);
    lastSharedMatchRef.current = null;
    return () => { spectatorContextRef.current = ''; };
  }, [address, groupId, sessionId]);

  useEffect(() => { matchRef.current = match; }, [match]);
  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    if (!enabled) {
      setLocalDestinationHash('');
      return () => {
        cancelled = true;
      };
    }
    const loadDestination = async () => {
      let hash = '';
      try {
        const result = await window.electronAPI?.reticulumGetLocalDestinationHash?.();
        const candidate = String(result?.destinationHash || '').trim().toLowerCase();
        if (/^[0-9a-f]{32}$/.test(candidate)) hash = candidate;
      } catch {
        hash = '';
      }
      if (cancelled) return;
      setLocalDestinationHash(hash);
      if (!hash) {
        retryTimer = window.setTimeout(loadDestination, 1_000);
      }
    };
    void loadDestination();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [enabled]);
  useEffect(() => {
    doNotDisturbRef.current = doNotDisturb;
  }, [doNotDisturb]);
  const replaceMatch = useCallback((next: Match | null) => {
    matchRef.current = next;
    setMatch(next);
  }, []);
  const updateMatch = useCallback((updater: (current: Match | null) => Match | null) => {
    const next = updater(matchRef.current);
    matchRef.current = next;
    setMatch(next);
  }, []);

  useEffect(() => {
    if (match?.phase !== 'active' && match?.clock?.runningSeat) {
      updateMatch((value) => value?.clock ? {
        ...value,
        clock: {
          ...value.clock,
          ...sampleChessClock(value.clock, Date.now()),
          runningSeat: null,
        },
      } : value);
    }
  }, [match?.phase, match?.clock?.runningSeat, updateMatch]);
  const appendSpectatorChat = useCallback((chat: ChessSpectatorChat) => {
    const chatKey = spectatorChatKey(chat.matchId, chat.roundId);
    const message: GameChatMessage = {
      messageId: chat.messageId,
      authorAddress: chat.authorAddress,
      authorName: resolvePlayerName?.(chat.authorAddress),
      text: chat.text,
      createdAt: chat.createdAt,
      delivered: chat.delivered,
      failed: chat.failed,
    };
    setSpectatorChats((current) => {
      const previous = current[chatKey] || [];
      if (previous.some((item) => item.messageId === message.messageId && item.authorAddress === message.authorAddress)) return current;
      const next = [...previous, message]
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(-100);
      const entries = Object.entries({ ...current, [chatKey]: next });
      return Object.fromEntries(entries.slice(-20));
    });
    updateMatch((current) => {
      if (
        !current ||
        current.matchId !== chat.matchId ||
        current.roundId !== chat.roundId ||
        !current.spectatorsEnabled ||
        current.chatMessages.some((item) => item.messageId === message.messageId && item.authorAddress === message.authorAddress)
      ) {
        return current;
      }
      return {
        ...current,
        chatMessages: [...current.chatMessages, message]
          .sort((left, right) => left.createdAt - right.createdAt)
          .slice(-100),
      };
    });
  }, [resolvePlayerName, updateMatch]);

  const applySpectatorEvent = useCallback(async (rawEvent: unknown) => {
    const context = `${address}:${groupId}:${sessionId}`;
    if (spectatorContextRef.current !== context) return;
    const parsed = parseChessSpectatorEvent(
      rawEvent as Record<string, unknown>,
      groupId
    );
    if (!parsed) return;
    if (parsed.kind === 'chat') {
      appendSpectatorChat(parsed.chat);
      return;
    }
    if (parsed.kind === 'close') {
      // Keep each author's revocation even when history delivers it before
      // either board attestation. Unrelated members cannot revoke a player.
      const closeKey = `${parsed.close.matchId}:${parsed.close.roundId}:${parsed.close.authorAddress}`;
      spectatorClosedAtRef.current.set(
        closeKey,
        Math.max(parsed.close.timestamp, spectatorClosedAtRef.current.get(closeKey) || 0)
      );
      if (spectatorClosedAtRef.current.size > 128) {
        const oldest = spectatorClosedAtRef.current.keys().next().value;
        if (oldest) spectatorClosedAtRef.current.delete(oldest);
      }
      for (const [key, attestations] of spectatorAttestationsRef.current) {
        if (key.startsWith(`${parsed.close.matchId}:${parsed.close.roundId}:`)) {
          const previous = attestations.get(parsed.close.authorAddress);
          if (previous && previous.timestamp <= parsed.close.timestamp) {
            attestations.delete(parsed.close.authorAddress);
          }
        }
      }
      const existing = spectatorMatchesRef.current.get(parsed.close.matchId);
      if (
        !existing ||
        existing.roundId !== parsed.close.roundId ||
        existing.timestamp > parsed.close.timestamp ||
        ![existing.requesterAddress, existing.recipientAddress].includes(
          parsed.close.authorAddress
        )
      ) {
        return;
      }
      spectatorMatchesRef.current.delete(parsed.close.matchId);
      setSpectatorMatches([...spectatorMatchesRef.current.values()]);
      setWatchedMatchId((current) =>
        current === parsed.close.matchId ? null : current
      );
      return;
    }
    if (!(await verifyChessSpectatorSnapshot(parsed.snapshot))) return;
    if (spectatorContextRef.current !== context) return;
    const revokedAt = Math.max(...[
      parsed.snapshot.requesterAddress, parsed.snapshot.recipientAddress,
    ].map((player) => spectatorClosedAtRef.current.get(
      `${parsed.snapshot.matchId}:${parsed.snapshot.roundId}:${player}`
    ) || 0));
    if (parsed.snapshot.timestamp <= revokedAt) return;
    const snapshot = recordChessSpectatorAttestation(
      spectatorAttestationsRef.current,
      parsed.snapshot
    );
    if (!snapshot || snapshot.timestamp <= revokedAt) return;
    const existing = spectatorMatchesRef.current.get(snapshot.matchId);
    if (
      existing &&
      (existing.requesterAddress !== snapshot.requesterAddress ||
        existing.recipientAddress !== snapshot.recipientAddress ||
        existing.timestamp > snapshot.timestamp ||
        (existing.roundId === snapshot.roundId &&
          (existing.state.ply > snapshot.state.ply ||
            (existing.phase === 'finished' && snapshot.phase !== 'finished'))))
    ) {
      return;
    }
    spectatorMatchesRef.current.set(snapshot.matchId, snapshot);
    setSpectatorMatches(
      [...spectatorMatchesRef.current.values()].sort(
        (left, right) => right.timestamp - left.timestamp
      )
    );
  }, [address, appendSpectatorChat, groupId, sessionId]);

  useEffect(() => {
    if (!enabled || !Number.isInteger(groupId) || groupId <= 0) return;
    let cancelled = false;
    const unsubscribe = window.reticulumChat?.onEvent?.(({ event }) => {
      void applySpectatorEvent(event);
    });
    void window.reticulumChat
      ?.getMessageHistory?.(groupId, QORTAL_LAND_GAME_CHANNEL_ID, 300, {
        repairNetwork: false,
      })
      .then(async (history) => {
        if (cancelled || !Array.isArray(history)) return;
        const ordered = [...history].sort(
          (left: any, right: any) => Number(left?.timestamp || 0) - Number(right?.timestamp || 0)
        );
        for (const event of ordered) {
          if (cancelled) return;
          await applySpectatorEvent(event);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [applySpectatorEvent, enabled, groupId]);
  const beginRound = useCallback(async (
    current: Match,
    roundId: string,
    requesterNonce: string,
    recipientNonce: string
  ) => {
    const startingSeat = await deriveStartingSeat(current.game, roundId, requesterNonce, recipientNonce, current);
    const position = current.game === 'chess960' ? await deriveChess960Position(roundId, requesterNonce, recipientNonce) : undefined;
    const state = createGameState(current.game, startingSeat, position);
    const stateHash = await hashGameState(current.game, state);
    updateMatch((value) => value?.matchId === current.matchId ? {
      ...value,
      roundId,
      requesterNonce,
      recipientNonce,
      startingSeat,
      localSeat: address === value.requesterAddress ? 1 : 2,
      phase: 'active',
      clock: undefined,
      state,
      stateHash,
      moves: [],
      pendingMoveId: undefined,
      pendingSince: undefined,
      reconnectDeadline: undefined,
      outcome: undefined,
      error: undefined,
      sessionClosed: false,
      localSpectatorsAllowed: false,
      remoteSpectatorsAllowed: false,
      spectatorsEnabled: false,
    } : value);
  }, [address, updateMatch]);
  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (!qortalLandRealtime.isReady()) throw new Error(t('group:qortal_land.games.errors.transport_unavailable'));
    const requestId = crypto.randomUUID();
    const nestedType = payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message)
      ? String((payload.message as Record<string, unknown>).type || '')
      : '';
    pendingCommandsRef.current.set(requestId, {
      type: nestedType ? `${type}:${nestedType}` : type,
      ...(typeof payload.matchId === 'string' ? { matchId: payload.matchId } : {}),
      ...(payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message) && typeof (payload.message as Record<string, unknown>).messageId === 'string'
        ? { messageId: String((payload.message as Record<string, unknown>).messageId) }
        : {}),
    });
    qortalLandRealtime.send({ type, requestId, ...payload });
    return requestId;
  }, [t]);

  useEffect(() => {
    if (!isChessGame(match?.game) || match.phase !== 'active' || !transportReady) return;
    try {
      send('SEND_GAME_MESSAGE', {
        matchId: match.matchId,
        message: { type: 'MATCH_PING', messageId: crypto.randomUUID() },
      });
    } catch { /* A recovered link will retry when transport becomes ready. */ }
  }, [match?.game, match?.matchId, match?.roundId, match?.phase, send, transportReady]);

  const publishCurrentSpectatorSnapshot = useCallback(async () => {
    const current = matchRef.current;
    if (
      !current ||
      !isChessGame(current.game) ||
      !current.spectatorsEnabled ||
      !current.state ||
      !current.stateHash ||
      !current.roundId ||
      !['active', 'finishing', 'finished'].includes(current.phase)
    ) {
      return;
    }
    const state: ChessState = {
      ...(current.state as ChessState),
      outcome: current.outcome || current.state.outcome,
    };
    const stateHash = await hashChessState(state);
    const latest = matchRef.current;
    if (!latest?.spectatorsEnabled || latest.matchId !== current.matchId ||
        latest.roundId !== current.roundId || latest.stateHash !== current.stateHash ||
        latest.phase !== current.phase || latest.outcome !== current.outcome ||
        spectatorContextRef.current !== `${address}:${groupId}:${sessionId}`) return;
    const payload = {
      qortalLandType: 'chess_spectator_state',
      matchId: current.matchId,
      roundId: current.roundId,
      requesterAddress: current.requesterAddress,
      recipientAddress: current.recipientAddress,
      state,
      stateHash,
      ...(current.clock ? {
        clock: {
          ...sampleChessClock(current.clock, Date.now()),
          runningSeat: current.phase === 'active' && !state.outcome
            ? current.clock.runningSeat
            : null,
        },
      } : {}),
      phase:
        current.phase === 'finished' || state.outcome
          ? 'finished'
          : 'active',
      expiresAt: Date.now() + CHESS_SPECTATOR_SNAPSHOT_TTL_MS,
    };
    const published = await publishChessSpectatorEvent({
      groupId,
      authorAddress: address,
      sessionId,
      payload,
    });
    await applySpectatorEvent({
      eventId: published.eventId,
      groupId,
      channelId: QORTAL_LAND_GAME_CHANNEL_ID,
      eventType: 'message',
      authorAddress: address,
      encryptedPayload: JSON.stringify({
        ...payload,
        qortalLand: true,
        sessionId,
        version: 1,
      }),
      timestamp: published.timestamp,
    });
  }, [address, applySpectatorEvent, groupId, sessionId]);

  useEffect(() => {
    if (
      !isChessGame(match?.game) ||
      !match.spectatorsEnabled ||
      !match.stateHash ||
      !['active', 'finishing', 'finished'].includes(match.phase)
    ) {
      return;
    }
    void publishCurrentSpectatorSnapshot().catch(() => undefined);
  }, [
    match?.game,
    match?.matchId,
    match?.phase,
    match?.roundId,
    match?.spectatorsEnabled,
    match?.stateHash,
    publishCurrentSpectatorSnapshot,
  ]);

  useEffect(() => {
    if (!isChessGame(match?.game) || !match.spectatorsEnabled) return;
    const interval = window.setInterval(() => {
      void publishCurrentSpectatorSnapshot().catch(() => undefined);
    }, CHESS_SPECTATOR_SNAPSHOT_TTL_MS / 2);
    return () => window.clearInterval(interval);
  }, [match?.game, match?.matchId, match?.spectatorsEnabled, publishCurrentSpectatorSnapshot]);

  useEffect(() => {
    const sharing = Boolean(
      isChessGame(match?.game) &&
      match.spectatorsEnabled &&
      match.roundId &&
      ['active', 'finishing', 'finished'].includes(match.phase)
    );
    if (sharing && match?.roundId) {
      lastSharedMatchRef.current = {
        matchId: match.matchId,
        roundId: match.roundId,
      };
      return;
    }
    const previous = lastSharedMatchRef.current;
    if (!previous) return;
    lastSharedMatchRef.current = null;
    void publishChessSpectatorEvent({
      groupId,
      authorAddress: address,
      sessionId,
      payload: {
        qortalLandType: 'chess_spectator_closed',
        matchId: previous.matchId,
        roundId: previous.roundId,
      },
    }).catch(() => undefined);
  }, [address, groupId, match?.game, match?.matchId, match?.phase, match?.roundId, match?.spectatorsEnabled, sessionId]);

  const setSpectatorsAllowed = useCallback((enabledForLocalPlayer: boolean) => {
    const current = matchRef.current;
    if (
      !current ||
      !isChessGame(current.game) ||
      !current.remoteSpectatorsSupported ||
      !['active', 'finishing'].includes(current.phase)
    ) {
      return;
    }
    const messageId = crypto.randomUUID();
    updateMatch((value) =>
      value && value.matchId === current.matchId
        ? {
            ...value,
            localSpectatorsAllowed: enabledForLocalPlayer,
            spectatorsEnabled:
              enabledForLocalPlayer && value.remoteSpectatorsAllowed === true,
          }
        : value
    );
    try {
      send('SEND_GAME_MESSAGE', {
        matchId: current.matchId,
        message: {
          type: 'SPECTATOR_PERMISSION',
          messageId,
          roundId: current.roundId,
          enabled: enabledForLocalPlayer,
        },
      });
    } catch {
      updateMatch((value) =>
        value && value.matchId === current.matchId
          ? {
              ...value,
              localSpectatorsAllowed: !enabledForLocalPlayer,
              spectatorsEnabled:
                !enabledForLocalPlayer && value.remoteSpectatorsAllowed === true,
            }
          : value
      );
    }
  }, [send, updateMatch]);

  const failProtocol = useCallback((reason: string) => {
    const current = matchRef.current;
    if (!current) return;
    try {
      if (['active', 'finishing', 'reconnecting'].includes(current.phase)) {
        send('SEND_GAME_MESSAGE', {
          matchId: current.matchId,
          message: { type: 'PROTOCOL_ERROR', messageId: crypto.randomUUID(), reason },
        });
      } else {
        send('CLOSE_GAME_LINK', { matchId: current.matchId });
      }
    } catch { /* link may already be gone */ }
    updateMatch((value) => value && ({ ...value, phase: 'finished', outcome: { type: 'protocol-error' }, error: reason }));
  }, [send, updateMatch]);

  const handleGameMessage = useCallback(async (message: Record<string, unknown>) => {
    const current = matchRef.current;
    if (!current || message.matchId !== current.matchId) return;
    if (message.type === 'MATCH_PONG') {
      updateMatch((value) => value && value.matchId === current.matchId ? {
        ...value,
        remoteSpectatorsSupported: message.spectatorProtocol === 1,
      } : value);
      return;
    }
    if (message.type === 'SPECTATOR_PERMISSION') {
      if (!isChessGame(current.game) || message.roundId !== current.roundId || typeof message.enabled !== 'boolean') return;
      updateMatch((value) => {
        if (!value || value.matchId !== current.matchId) return value;
        const remoteSpectatorsAllowed = message.enabled === true;
        return {
          ...value,
          remoteSpectatorsAllowed,
          spectatorsEnabled:
            value.localSpectatorsAllowed === true && remoteSpectatorsAllowed,
        };
      });
      return;
    }
    if (message.type === 'CHAT_MESSAGE') {
      const parsed = parseChatMessages([message]);
      if (parsed.length !== 1) return;
      updateMatch((value) => {
        if (!value || value.matchId !== current.matchId || value.chatMessages.some((item) => item.messageId === parsed[0].messageId)) return value;
        return { ...value, chatMessages: [...value.chatMessages, parsed[0]].slice(-100) };
      });
      return;
    }
    if (message.type === 'CHAT_ACK') {
      const messageId = String(message.messageId || '');
      updateMatch((value) => value ? {
        ...value,
        chatMessages: value.chatMessages.map((item) => item.messageId === messageId ? { ...item, delivered: true } : item),
      } : value);
      return;
    }
    if (message.type === 'CHAT_TYPING') {
      updateMatch((value) => value ? { ...value, remoteTypingUntil: message.active === true ? Date.now() + 3_000 : undefined } : value);
      return;
    }
    if (message.type === 'ROUND_REQUEST') {
      const roundId = String(message.roundId || '');
      const requesterNonce = String(message.requesterNonce || '');
      const game = message.game;
      if (!isGameId(game) || !['session-idle', 'finished'].includes(current.phase) || !roundId || !/^[0-9a-f]{32}$/i.test(requesterNonce)) return;
      replaceMatch({ ...current, game, roundId, requesterNonce, recipientNonce: undefined, phase: 'round-incoming', state: undefined, stateHash: undefined, moves: [], outcome: undefined, error: undefined });
      return;
    }
    if (message.type === 'ROUND_RESPONSE') {
      if (current.phase !== 'round-waiting' || message.roundId !== current.roundId) return;
      if (message.accepted !== true) {
        replaceMatch({ ...current, phase: 'finished', state: undefined, error: `Rematch ${String(message.reason || 'declined')}` });
        return;
      }
      const recipientNonce = String(message.recipientNonce || '');
      if (!/^[0-9a-f]{32}$/i.test(recipientNonce)) {
        failProtocol(t('group:qortal_land.games.errors.invalid_rematch_nonce'));
        return;
      }
      await beginRound(current, current.roundId, current.requesterNonce, recipientNonce);
      return;
    }
    if (message.type === 'ROUND_CANCEL') {
      if (current.phase === 'round-incoming' && message.roundId === current.roundId) {
        replaceMatch({ ...current, phase: 'session-idle', state: undefined, stateHash: undefined, moves: [], outcome: undefined, error: undefined });
      }
      return;
    }
    if (message.roundId !== current.roundId || !current.state || !current.localSeat) return;
    if (message.type === 'MOVE_ACK') {
      if (message.messageId !== current.pendingMoveId || message.stateHash !== current.stateHash) {
        failProtocol(t('group:qortal_land.games.errors.move_ack_mismatch'));
        return;
      }
      const acknowledged = {
        ...current,
        pendingMoveId: undefined,
        pendingSince: undefined,
        lastRoundTripMs: current.pendingSince
          ? Math.max(1, Date.now() - current.pendingSince)
          : current.lastRoundTripMs,
      };
      if (current.state.outcome) {
        send('SEND_GAME_MESSAGE', {
          matchId: current.matchId,
          message: {
            type: 'GAME_OVER',
            messageId: crypto.randomUUID(),
            ply: current.state.ply,
            stateHash: current.stateHash,
            outcome: current.state.outcome,
          },
        });
        acknowledged.phase = 'finishing';
        acknowledged.outcome = current.state.outcome;
      }
      replaceMatch(acknowledged);
      return;
    }
    if (message.type === 'RESIGN') {
      const winner = current.localSeat;
      const timedOut = message.reason === 'timeout' && isChessGame(current.game);
      const loser = winner === 1 ? 2 : 1;
      // Timeouts are acknowledged by the game service, even without a renderer.
      if (!timedOut) {
        send('SEND_GAME_MESSAGE', {
          matchId: current.matchId,
          message: { type: 'RESIGN_ACK', messageId: crypto.randomUUID() },
        });
      }
      const clock = current.clock
        ? { ...current.clock, ...sampleChessClock(current.clock, Date.now()), runningSeat: null }
        : undefined;
      if (timedOut && clock) clock.remainingMs[loser - 1] = 0;
      replaceMatch({
        ...current,
        phase: 'finished',
        outcome: timedOut
          ? chessTimeoutOutcome(current.state as ChessState, loser)
          : { type: 'resigned', winner },
        clock,
      });
      return;
    }
    if (message.type === 'RESIGN_ACK') {
      replaceMatch({ ...current, phase: 'finished', outcome: current.outcome });
      return;
    }
    if (message.type === 'GAME_OVER') {
      if (
        message.ply !== current.state.ply ||
        message.stateHash !== current.stateHash ||
        JSON.stringify(message.outcome) !== JSON.stringify(current.state.outcome)
      ) {
        failProtocol(t('group:qortal_land.games.errors.final_state_mismatch'));
        return;
      }
      send('SEND_GAME_MESSAGE', {
        matchId: current.matchId,
        message: {
          type: 'GAME_OVER_ACK',
          messageId: String(message.messageId || crypto.randomUUID()),
          ply: current.state.ply,
          stateHash: current.stateHash,
        },
      });
      replaceMatch({
        ...current,
        phase: 'finished',
        outcome: current.state.outcome || undefined,
      });
      return;
    }
    if (message.type === 'GAME_OVER_ACK') {
      if (message.ply !== current.state.ply || message.stateHash !== current.stateHash) {
        failProtocol(t('group:qortal_land.games.errors.final_ack_mismatch'));
        return;
      }
      replaceMatch({
        ...current,
        phase: 'finished',
        outcome: current.state.outcome || current.outcome,
      });
      return;
    }
    if (message.type === 'PROTOCOL_ERROR') {
      replaceMatch({ ...current, phase: 'finished', outcome: { type: 'protocol-error' }, error: String(message.reason || '') });
      return;
    }
    if (message.type !== 'MOVE' && message.type !== 'SYNC_MOVE') return;
    const move = message as unknown as QortalLandGameMove;
    try {
      if (current.pendingMoveId || move.ply !== current.state.ply + 1 || move.previousStateHash !== current.stateHash) {
        throw new Error(t('group:qortal_land.games.errors.unexpected_move_sequence'));
      }
      const moveSeat = seatForIncomingQortalLandGameMove(message.type, current.state, current.localSeat);
      const next = applyGameMove(current.game, current.state, moveSeat, message);
      const resultingHash = await hashGameState(current.game, next);
      if (resultingHash !== move.resultingStateHash) throw new Error(t('group:qortal_land.games.errors.move_hash_mismatch'));
      send('SEND_GAME_MESSAGE', {
        matchId: current.matchId,
        message: { type: 'MOVE_ACK', messageId: move.messageId, ply: move.ply, stateHash: resultingHash },
      });
      const nextMatch: Match = {
        ...current,
        state: next,
        stateHash: resultingHash,
        moves: [...current.moves, move],
      };
      if (next.outcome) {
        nextMatch.phase = 'finishing';
        nextMatch.outcome = next.outcome;
        send('SEND_GAME_MESSAGE', {
          matchId: current.matchId,
          message: { type: 'GAME_OVER', messageId: crypto.randomUUID(), ply: next.ply, stateHash: resultingHash, outcome: next.outcome },
        });
      }
      replaceMatch(nextMatch);
    } catch (error) {
      failProtocol(error instanceof Error ? error.message : 'Illegal remote move');
    }
  }, [beginRound, failProtocol, replaceMatch, send, t]);

  const handleEvent = useCallback(async (event: Record<string, unknown>) => {
    if (event.type === 'TRANSPORT_STATE') {
      setTransportReady(event.state === 'ready');
      return;
    }
    if (event.type === 'SIGNATURE_REQUIRED') {
      const fields = event.fields;
      if (!publicKey || !fields || typeof fields !== 'object' || Array.isArray(fields)) return;
      if (!canSignQortalLandGameHandshake(fields as Record<string, unknown>, matchRef.current, address, publicKey)) {
        failProtocol(t('group:qortal_land.games.errors.unexpected_handshake_request'));
        return;
      }
      const response = await window.sendMessage?.('signPresenceMessage', fields, 10_000) as { signature?: string; error?: string } | undefined;
      if (!response?.signature || response.error) {
        failProtocol(response?.error || t('group:qortal_land.games.errors.handshake_declined'));
        return;
      }
      send('SUBMIT_HANDSHAKE_SIGNATURE', {
        challengeId: event.challengeId,
        matchId: event.matchId,
        signature: response.signature,
        publicKey,
      });
      return;
    }
    if (event.type === 'GAME_CLOCK' && event.matchId === matchRef.current?.matchId && event.roundId === matchRef.current?.roundId) {
      updateMatch((value) => value && ({ ...value, clock: readChessClock(event.clock) }));
      return;
    }
    if (event.type === 'COMMAND_RESULT' && event.ok === false) {
      const requestId = String(event.requestId || '');
      const pending = pendingCommandsRef.current.get(requestId);
      pendingCommandsRef.current.delete(requestId);
      if (!pending || !pending.matchId || pending.matchId !== matchRef.current?.matchId) {
        return;
      }
      const error = String(event.error || t('group:qortal_land.games.errors.command_failed'));
      if (pending.type.endsWith(':CHAT_TYPING') || error === 'chess_time_expired') return;
      if (pending.type.endsWith(':CHAT_MESSAGE')) {
        updateMatch((value) => value && ({
          ...value,
          chatMessages: value.chatMessages.map((item) => item.messageId === pending.messageId ? { ...item, failed: true } : item),
          error,
        }));
        return;
      }
      if (isRetryableQortalLandGameTransportError(error, matchRef.current?.phase)) {
        updateMatch((value) => value && ({
          ...value,
          phase: value.phase === 'finished' ? value.phase : 'reconnecting',
          reconnectDeadline: value.reconnectDeadline || Date.now() + 30_000,
          error: reconnectingError,
        }));
        if (qortalLandRealtime.isReady()) {
          qortalLandRealtime.send({ type: 'GET_ACTIVE_MATCH', requestId: crypto.randomUUID() });
        }
        return;
      }
      updateMatch((value) => value && ({ ...value, phase: 'finished', error }));
      return;
    }
    if (event.type === 'COMMAND_RESULT') {
      pendingCommandsRef.current.delete(String(event.requestId || ''));
      return;
    }
    if (event.type === 'GAME_LINK_STATE') {
      if (event.matchId && event.matchId !== matchRef.current?.matchId) return;
      const state = String(event.state || '');
      updateMatch((value) => value && ({
        ...value,
        phase: state === 'waiting_response' ? 'waiting' : state === 'recovering' ? 'reconnecting' : value.phase,
        reconnectDeadline: typeof event.deadlineAt === 'number' ? event.deadlineAt : value.reconnectDeadline,
      }));
      return;
    }
    if (event.type === 'GAME_CHAT_HISTORY') {
      if (event.matchId !== matchRef.current?.matchId) return;
      const messages = parseChatMessages(event.messages);
      updateMatch((value) => {
        if (!value || messages.length === 0) return value;
        const merged = new Map(value.chatMessages.map((item) => [item.messageId, item]));
        messages.forEach((item) => merged.set(item.messageId, item));
        return { ...value, chatMessages: Array.from(merged.values()).sort((left, right) => left.createdAt - right.createdAt).slice(-100) };
      });
      return;
    }
    if (event.type === 'GAME_INVITE_RECEIVED') {
      if (matchRef.current && event.matchId !== matchRef.current.matchId) return;
      if (!isGameId(event.game)) return;
      if (doNotDisturbRef.current) {
        send('RESPOND_TO_INVITE', {
          matchId: String(event.matchId),
          decision: 'decline',
          reason: 'do_not_disturb',
        });
        return;
      }
      setChosenWhiteSeat(2);
      onPlayerSeen?.(String(event.requesterAddress));
      replaceMatch({
        matchId: String(event.matchId), requesterAddress: String(event.requesterAddress),
        game: event.game,
        ...readChessOptions(event),
        roundId: String(event.matchId),
        recipientAddress: String(event.recipientAddress || address),
        requesterSessionId: String(event.sourceSessionId || ''),
        recipientSessionId: String(event.targetSessionId || sessionId),
        requesterDestinationHash: String(event.sourceDestinationHash || ''),
        recipientDestinationHash: String(event.targetDestinationHash || ''),
        requesterNonce: String(event.requesterNonce || ''), phase: 'incoming',
        requesterName: resolvePlayerName?.(String(event.requesterAddress)),
        recipientName: t('group:qortal_land.games.player.you'),
        moves: [],
        chatMessages: [],
        expiresAt: Number(event.expiresAt),
      });
      return;
    }
    if (event.type === 'GAME_STARTED' || event.type === 'GAME_SNAPSHOT' || event.type === 'GAME_TIMEOUT') {
      if (matchRef.current && event.matchId !== matchRef.current.matchId) return;
      const requesterAddress = String(event.requesterAddress);
      const recipientAddress = String(event.recipientAddress);
      const requesterNonce = String(event.requesterNonce);
      const recipientNonce = String(event.recipientNonce);
      const requesterSessionId = String(event.requesterSessionId || '');
      const recipientSessionId = String(event.recipientSessionId || '');
      const requesterDestinationHash = String(event.requesterDestinationHash || '');
      const recipientDestinationHash = String(event.recipientDestinationHash || '');
      const roundId = String(event.roundId || event.matchId);
      const transportPhase = String(event.phase || '');
      const eventGame = isGameId(event.game) ? event.game : matchRef.current?.game || 'connect-four';
      const chatMessages = parseChatMessages(event.chatMessages);
      if ([
        'establishing',
        'awaiting_invite_signature',
        'awaiting_response',
        'invited',
      ].includes(transportPhase)) {
        replaceMatch({
          matchId: String(event.matchId),
          game: eventGame,
          ...readChessOptions(event),
          roundId,
          requesterAddress,
          recipientAddress,
          requesterSessionId,
          recipientSessionId,
          requesterDestinationHash,
          recipientDestinationHash,
          requesterNonce,
          recipientNonce: /^[0-9a-f]{32}$/i.test(recipientNonce) ? recipientNonce : undefined,
          requesterName: requesterAddress === address ? t('group:qortal_land.games.player.you') : resolvePlayerName?.(requesterAddress),
          recipientName: recipientAddress === address ? t('group:qortal_land.games.player.you') : resolvePlayerName?.(recipientAddress),
          phase: transportPhase === 'invited'
            ? 'incoming'
            : transportPhase === 'awaiting_response'
              ? 'waiting'
              : 'opening',
          moves: [],
          chatMessages,
          expiresAt: typeof event.expiresAt === 'number' ? event.expiresAt : undefined,
          sessionClosed: false,
        });
        return;
      }
      if ((transportPhase === 'session_idle' && event.timeoutSeat !== 1 && event.timeoutSeat !== 2) || transportPhase === 'round_waiting' || transportPhase === 'round_incoming') {
        const pending = event.pendingRound && typeof event.pendingRound === 'object' && !Array.isArray(event.pendingRound)
          ? event.pendingRound as Record<string, unknown>
          : {};
        replaceMatch({
          matchId: String(event.matchId),
          game: isGameId(pending.game) ? pending.game : eventGame,
          ...readChessOptions(event),
          roundId: String(pending.roundId || roundId),
          requesterAddress,
          recipientAddress,
          requesterSessionId,
          recipientSessionId,
          requesterDestinationHash,
          recipientDestinationHash,
          requesterNonce: String(pending.requesterNonce || requesterNonce),
          recipientNonce: undefined,
          requesterName: requesterAddress === address ? t('group:qortal_land.games.player.you') : resolvePlayerName?.(requesterAddress),
          recipientName: recipientAddress === address ? t('group:qortal_land.games.player.you') : resolvePlayerName?.(recipientAddress),
          phase: transportPhase === 'round_waiting' ? 'round-waiting' : transportPhase === 'round_incoming' ? 'round-incoming' : 'session-idle',
          moves: [],
          chatMessages,
          sessionClosed: false,
          reconnectDeadline: undefined,
        });
        return;
      }
      const startingSeat = await deriveStartingSeat(eventGame, roundId, requesterNonce, recipientNonce, readChessOptions(event));
      const localSeat: ConnectFourSeat = address === requesterAddress ? 1 : 2;
      const position = eventGame === 'chess960' ? await deriveChess960Position(roundId, requesterNonce, recipientNonce) : undefined;
      let state = createGameState(eventGame, startingSeat, position);
      let stateHash = await hashGameState(eventGame, state);
      const transcript = Array.isArray(event.transcript) ? event.transcript : [];
      const moves: QortalLandGameMove[] = [];
      for (const raw of transcript) {
        if (!raw || typeof raw !== 'object') throw new Error(t('group:qortal_land.games.errors.invalid_snapshot_move'));
        const move = raw as QortalLandGameMove;
        if (
          move.ply !== state.ply + 1 ||
          move.previousStateHash !== stateHash
        ) {
          throw new Error(t('group:qortal_land.games.errors.snapshot_sequence_mismatch'));
        }
        const seat = state.nextSeat;
        state = applyGameMove(eventGame, state, seat, raw as Record<string, unknown>);
        stateHash = await hashGameState(eventGame, state);
        if (stateHash !== move.resultingStateHash) throw new Error(t('group:qortal_land.games.errors.snapshot_transcript_mismatch'));
        moves.push(move);
      }
      let pendingMoveId: string | undefined;
      const pendingRaw = event.pendingOutboundMove;
      if (pendingRaw && typeof pendingRaw === 'object' && !Array.isArray(pendingRaw)) {
        const pending = pendingRaw as QortalLandGameMove;
        if (
          state.outcome ||
          state.nextSeat !== localSeat ||
          pending.ply !== state.ply + 1 ||
          pending.previousStateHash !== stateHash ||
          typeof pending.messageId !== 'string'
        ) {
          throw new Error(t('group:qortal_land.games.errors.snapshot_pending_move_mismatch'));
        }
        state = applyGameMove(eventGame, state, localSeat, pendingRaw as Record<string, unknown>);
        stateHash = await hashGameState(eventGame, state);
        if (stateHash !== pending.resultingStateHash) {
          throw new Error(t('group:qortal_land.games.errors.snapshot_pending_hash_mismatch'));
        }
        pendingMoveId = pending.messageId;
        moves.push(pending);
      }
      updateMatch((previous) => ({
        ...(previous || {} as Match), matchId: String(event.matchId), roundId, requesterAddress,
        game: eventGame,
        ...readChessOptions(event),
        recipientAddress, requesterSessionId, recipientSessionId,
        requesterDestinationHash, recipientDestinationHash,
        requesterNonce, recipientNonce, startingSeat,
        localSeat,
        phase: ['recovering', 'awaiting_resume_accept', 'awaiting_resume_confirm'].includes(transportPhase)
          ? 'reconnecting'
          : ['awaiting_confirm', 'awaiting_start_ack'].includes(transportPhase)
            ? 'starting'
            : transportPhase === 'ending'
              ? 'finishing'
              : event.timeoutSeat === 1 || event.timeoutSeat === 2
                ? 'finished'
                : pendingMoveId
                  ? 'active'
                  : state.outcome
                    ? 'finished'
                    : 'active',
        state,
        stateHash,
        clock: readChessClock(event.clock),
        pendingMoveId,
        pendingSince: pendingMoveId ? Date.now() : undefined,
        moves,
        chatMessages: chatMessages.length ? chatMessages : previous?.chatMessages || [],
        outcome: (event.type === 'GAME_TIMEOUT' || event.timeoutSeat === 1 || event.timeoutSeat === 2) && isChessGame(eventGame)
          ? chessTimeoutOutcome(state as ChessState, (event.loser ?? event.timeoutSeat) === 1 ? 1 : 2)
          : state.outcome || undefined,
        sessionClosed: false,
        reconnectDeadline: ['recovering', 'awaiting_resume_accept', 'awaiting_resume_confirm'].includes(transportPhase) ? Date.now() + 30_000 : undefined,
        error: previous?.phase === 'reconnecting' ? undefined : previous?.error,
      }));
      return;
    }
    if (event.type === 'GAME_MESSAGE' && event.message && typeof event.message === 'object') {
      await handleGameMessage(event.message as Record<string, unknown>);
      return;
    }
    if (event.type === 'GAME_INVITE_RESPONSE') {
      if (event.matchId !== matchRef.current?.matchId) return;
      if (event.accepted === true) {
        const recipientNonce = String(event.recipientNonce || '');
        if (!/^[0-9a-f]{32}$/i.test(recipientNonce)) {
          failProtocol(t('group:qortal_land.games.errors.invalid_recipient_nonce'));
          return;
        }
        updateMatch((value) => value && ({
          ...value,
          recipientNonce,
          ...readChessOptions({ chessColor: value.chessColor, chessWhiteSeat: event.chessWhiteSeat }),
          phase: 'starting',
        }));
        return;
      }
      updateMatch((value) => value && ({
        ...value,
        phase: 'finished',
        sessionClosed: true,
        error:
          event.reason === 'do_not_disturb'
            ? t('group:qortal_land.games.errors.do_not_disturb')
            : t('group:qortal_land.games.errors.invitation_declined'),
      }));
      return;
    }
    if (event.type === 'GAME_ENDED') {
      if (event.matchId !== matchRef.current?.matchId) return;
      // A completed game can remain as a hidden session-idle link so the next
      // challenge can reuse the temporary peer connection. If that retained
      // link closes later, it is cleanup rather than a new user-visible game
      // result. Do not resurrect the dismissed game-over dialog.
      if (matchRef.current.phase === 'session-idle') {
        replaceMatch(null);
        return;
      }
      const result = String(event.outcome || 'abandoned');
      updateMatch((value) => value && ({
        ...value,
        phase: 'finished',
        sessionClosed: true,
        outcome: result === 'protocol_error' ? { type: 'protocol-error' } : result === 'abandoned' || result === 'link_closed' || result === 'land_context_cleared' ? { type: 'abandoned' } : value.outcome,
        error: result === 'declined' || result === 'expired' ? result : value.error,
      }));
    }
  }, [address, failProtocol, handleGameMessage, onPlayerSeen, publicKey, reconnectingError, replaceMatch, resolvePlayerName, send, t, updateMatch]);

  useEffect(() => {
    if (
      !enabled ||
      !publicKey ||
      !localDestinationHash ||
      !(window.qortalLandRealtime || window.qortalLandGames)
    ) return;
    const disposeEvent = qortalLandRealtime.onEvent((event) => {
      if (event.type === 'TRANSPORT_RESTARTED') {
        updateMatch((value) => value ? {
          ...value,
          phase: 'finished',
          sessionClosed: true,
          reconnectDeadline: undefined,
          remoteTypingUntil: undefined,
          outcome: { type: 'abandoned' },
          error: 'The game service restarted; the temporary session was cleared',
        } : value);
        return;
      }
      eventChainRef.current = eventChainRef.current
        .then(() => handleEvent(event))
        .catch((error) => failProtocol(error instanceof Error ? error.message : t('group:qortal_land.games.errors.invalid_event')));
    });
    const disposeState = qortalLandRealtime.onState((ready) => {
      setTransportReady(ready);
      if (ready) {
        qortalLandRealtime.send({
          type: 'SET_LAND_CONTEXT', requestId: crypto.randomUUID(), address, publicKey,
          groupId: String(groupId), landSessionId: sessionId, roomId,
          localDestinationHash,
        });
        qortalLandRealtime.send({ type: 'GET_ACTIVE_MATCH', requestId: crypto.randomUUID() });
        return;
      }
      pendingCommandsRef.current.clear();
      updateMatch((value) => {
        if (!value) return value;
        const phase = ['active', 'finishing', 'round-waiting', 'round-incoming'].includes(value.phase)
          ? 'reconnecting'
          : value.phase;
        return { ...value, phase, reconnectDeadline: Date.now() + 30_000, remoteTypingUntil: undefined };
      });
    });
    const release = qortalLandRealtime.acquire();
    return () => {
      disposeEvent();
      disposeState();
      release();
    };
  }, [address, enabled, failProtocol, groupId, handleEvent, localDestinationHash, publicKey, roomId, send, sessionId, updateMatch]);

  useEffect(() => () => {
    try {
      qortalLandRealtime.send({ type: 'CLEAR_LAND_CONTEXT', requestId: crypto.randomUUID() });
    } catch { /* transport already stopped */ }
  }, []);

  useEffect(() => {
    const active = Boolean(match && !['idle', 'finished', 'session-idle'].includes(match.phase));
    onActiveChange?.(active);
  }, [match, onActiveChange]);

  useEffect(() => {
    const hasTimedMatch = Boolean(match && match.phase !== 'session-idle');
    if (!hasTimedMatch && spectatorMatches.length === 0) return;
    const timer = window.setInterval(
      () => setNow(Date.now()),
      hasTimedMatch ? 250 : 5_000
    );
    return () => window.clearInterval(timer);
  }, [match?.matchId, match?.phase, spectatorMatches.length]);

  useEffect(() => {
    const expiredIds = spectatorMatches
      .filter((candidate) => candidate.expiresAt <= now)
      .map((candidate) => candidate.matchId);
    if (expiredIds.length === 0) return;
    const expired = new Set(expiredIds);
    for (const matchId of expired) spectatorMatchesRef.current.delete(matchId);
    setSpectatorMatches([...spectatorMatchesRef.current.values()]);
    setWatchedMatchId((current) => (current && expired.has(current) ? null : current));
  }, [now, spectatorMatches]);

  useEffect(() => {
    if (!match?.reconnectDeadline || match.sessionClosed) return;
    const deadline = match.reconnectDeadline;
    const timer = window.setTimeout(() => {
      updateMatch((value) => value?.reconnectDeadline === deadline ? {
        ...value,
        phase: 'finished',
        sessionClosed: true,
        reconnectDeadline: undefined,
        remoteTypingUntil: undefined,
        outcome: { type: 'abandoned' },
        error: t('group:qortal_land.games.errors.recovery_failed'),
      } : value);
    }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [match?.reconnectDeadline, match?.sessionClosed, t, updateMatch]);

  useEffect(() => () => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
  }, []);

  const sendChallenge = useCallback(async (target: Target, game: QortalLandGameId = 'connect-four', color: ChessColorChoice = 'random', time?: ChessTimeControl) => {
    onActivity?.();
    if (
      !transportReady ||
      target.address === address ||
      !target.sessionId ||
      !/^[0-9a-f]{32}$/.test(target.destinationHash)
    ) return;
    const existing = matchRef.current;
    if (existing?.phase === 'session-idle') {
      const peer = existing.requesterAddress === address ? existing.recipientAddress : existing.requesterAddress;
      if (peer === target.address && !isChessGame(game) && !existing.chessColor && !existing.chessTime) {
        const roundId = crypto.randomUUID();
        const requesterNonce = randomHex(16);
        replaceMatch({ ...existing, game, roundId, requesterNonce, recipientNonce: undefined, phase: 'round-waiting', state: undefined, stateHash: undefined, moves: [], outcome: undefined, error: undefined });
        send('SEND_GAME_MESSAGE', { matchId: existing.matchId, message: { type: 'ROUND_REQUEST', messageId: crypto.randomUUID(), roundId, requesterNonce, ...gameConfig(game) } });
        return;
      }
      send('CLOSE_GAME_LINK', { matchId: existing.matchId });
      replaceMatch(null);
    } else if (existing) {
      return;
    }
    const matchId = crypto.randomUUID();
    const requesterNonce = randomHex(16);
    replaceMatch({
      matchId,
      game,
      ...(isChessGame(game) && color !== 'random' ? { chessColor: color } : {}),
      ...(isChessGame(game) && time ? { chessTime: time } : {}),
      roundId: matchId,
      requesterAddress: address,
      recipientAddress: target.address,
      requesterSessionId: sessionId,
      recipientSessionId: target.sessionId,
      requesterDestinationHash: localDestinationHash,
      recipientDestinationHash: target.destinationHash,
      requesterNonce,
      requesterName: t('group:qortal_land.games.player.you'),
      recipientName: target.name || resolvePlayerName?.(target.address),
      phase: 'opening',
      moves: [],
      chatMessages: [],
    });
    send('OPEN_GAME_LINK', {
      matchId,
      recipientAddress: target.address,
      targetSessionId: target.sessionId,
      targetDestinationHash: target.destinationHash,
      requesterNonce,
      game,
      ...(isChessGame(game) && color !== 'random' ? { chessColor: color } : {}),
      ...(isChessGame(game) && time ? { chessTime: time } : {}),
    });
  }, [address, localDestinationHash, onActivity, replaceMatch, resolvePlayerName, send, sessionId, t, transportReady]);

  const challenge = useCallback(async (target: Target, game: QortalLandGameId = 'connect-four') => {
    if (isChessGame(game)) {
      if (transportReady && (!matchRef.current || matchRef.current.phase === 'session-idle')) setChallengeTarget({ target, game });
    } else await sendChallenge(target, game);
  }, [sendChallenge, transportReady]);

  const respond = useCallback((accepted: boolean) => {
    onActivity?.();
    const current = matchRef.current;
    if (!current) return;
    const recipientNonce = accepted ? randomHex(16) : undefined;
    if (current.phase === 'round-incoming') {
      send('SEND_GAME_MESSAGE', {
        matchId: current.matchId,
        message: {
          type: 'ROUND_RESPONSE', messageId: crypto.randomUUID(), roundId: current.roundId,
          accepted, ...(accepted ? { recipientNonce } : { reason: 'declined' }),
        },
      });
      if (accepted && recipientNonce) {
        void beginRound(current, current.roundId, current.requesterNonce, recipientNonce);
      } else {
        replaceMatch({ ...current, phase: 'finished', state: undefined, error: t('group:qortal_land.games.errors.rematch_declined') });
      }
      return;
    }
    const selection = accepted && current.chessColor === 'choose'
      ? { chessWhiteSeat: chosenWhiteSeat } : {};
    send('RESPOND_TO_INVITE', {
      ...selection,
      matchId: current.matchId,
      decision: accepted ? 'accept' : 'decline',
      ...(accepted ? { recipientNonce } : { reason: 'declined' }),
    });
    replaceMatch({
      ...current,
      ...selection,
      recipientNonce: recipientNonce || current.recipientNonce,
      phase: accepted ? 'starting' : 'finished',
      error: accepted ? undefined : 'declined',
    });
  }, [beginRound, chosenWhiteSeat, onActivity, replaceMatch, send, t]);

  const playColumn = useCallback(async (column: number): Promise<boolean> => {
    onActivity?.();
    const current = matchRef.current;
    if (moveInFlightRef.current || current?.game !== 'connect-four' || !current.state || !current.localSeat || current.phase !== 'active' || current.pendingMoveId || current.state.nextSeat !== current.localSeat || connectFourDropRow(current.state, column) === null) return false;
    moveInFlightRef.current = true;
    try {
      const previousStateHash = current.stateHash || await hashConnectFourState(current.state);
      const next = applyConnectFourMove(current.state, current.localSeat, column);
      const resultingStateHash = await hashConnectFourState(next);
      const messageId = crypto.randomUUID();
      const move: ConnectFourMove = { messageId, ply: next.ply, column, previousStateHash, resultingStateHash };
      replaceMatch({
        ...current,
        state: next,
        stateHash: resultingStateHash,
        pendingMoveId: messageId,
        pendingSince: Date.now(),
        moves: [...current.moves, move],
      });
      send('SEND_GAME_MESSAGE', { matchId: current.matchId, message: { type: 'MOVE', roundId: current.roundId, ...move } });
      return true;
    } catch (error) {
      failProtocol(error instanceof Error ? error.message : t('group:qortal_land.games.errors.move_failed'));
      return false;
    } finally {
      moveInFlightRef.current = false;
    }
  }, [failProtocol, onActivity, replaceMatch, send, t]);

  const playCheckersMove = useCallback(async (from: number, path: number[]): Promise<boolean> => {
    onActivity?.();
    const current = matchRef.current;
    if (moveInFlightRef.current || current?.game !== 'checkers' || !current.state || !current.localSeat || current.phase !== 'active' || current.pendingMoveId || current.state.nextSeat !== current.localSeat) return false;
    moveInFlightRef.current = true;
    try {
      const previousStateHash = current.stateHash || await hashCheckersState(current.state);
      const next = applyCheckersMove(current.state, current.localSeat, from, path);
      const resultingStateHash = await hashCheckersState(next);
      const messageId = crypto.randomUUID();
      const move: CheckersMove = { messageId, ply: next.ply, from, path, previousStateHash, resultingStateHash };
      replaceMatch({ ...current, state: next, stateHash: resultingStateHash, pendingMoveId: messageId, pendingSince: Date.now(), moves: [...current.moves, move] });
      send('SEND_GAME_MESSAGE', { matchId: current.matchId, message: { type: 'MOVE', roundId: current.roundId, ...move } });
      return true;
    } catch (error) {
      failProtocol(error instanceof Error ? error.message : t('group:qortal_land.games.errors.move_failed'));
      return false;
    } finally {
      moveInFlightRef.current = false;
    }
  }, [failProtocol, onActivity, replaceMatch, send, t]);

  const playChessMove = useCallback(async (from: number, to: number, promotion?: ChessPromotion): Promise<boolean> => {
    onActivity?.();
    const current = matchRef.current;
    if (moveInFlightRef.current || !isChessGame(current?.game) || !current.state || !current.localSeat || current.phase !== 'active' || current.pendingMoveId || current.state.nextSeat !== current.localSeat) return false;
    moveInFlightRef.current = true;
    try {
      const previousStateHash = current.stateHash || await hashChessState(current.state as ChessState);
      const next = applyChessMove(current.state as ChessState, current.localSeat, from, to, promotion);
      const resultingStateHash = await hashChessState(next);
      const messageId = crypto.randomUUID();
      const move: ChessMove = { messageId, ply: next.ply, from, to, ...(promotion ? { promotion } : {}), previousStateHash, resultingStateHash };
      replaceMatch({ ...current, state: next, stateHash: resultingStateHash, pendingMoveId: messageId, pendingSince: Date.now(), moves: [...current.moves, move] });
      send('SEND_GAME_MESSAGE', { matchId: current.matchId, message: { type: 'MOVE', roundId: current.roundId, ...move } });
      return true;
    } catch (error) {
      failProtocol(error instanceof Error ? error.message : t('group:qortal_land.games.errors.move_failed'));
      return false;
    } finally {
      moveInFlightRef.current = false;
    }
  }, [failProtocol, onActivity, replaceMatch, send, t]);

  const performResign = useCallback(() => {
    onActivity?.();
    const current = matchRef.current;
    if (!current?.localSeat) return;
    send('RESIGN_GAME', { matchId: current.matchId });
    replaceMatch({ ...current, phase: 'finishing', outcome: { type: 'resigned', winner: current.localSeat === 1 ? 2 : 1 } });
  }, [onActivity, replaceMatch, send]);

  const sendChat = useCallback((text: string): boolean => {
    onActivity?.();
    const current = matchRef.current;
    const normalized = text.trim();
    if (
      !current || current.sessionClosed ||
      ['opening', 'waiting', 'incoming', 'starting', 'reconnecting', 'session-idle'].includes(current.phase) ||
      !normalized ||
      normalized.length > 500 ||
      new TextEncoder().encode(normalized).length > 2_000
    ) return false;
    const record: GameChatMessage = {
      messageId: crypto.randomUUID(),
      authorAddress: address,
      text: normalized,
      createdAt: Date.now(),
      delivered: false,
    };
    replaceMatch({ ...current, chatMessages: [...current.chatMessages, record].slice(-100) });
    try {
      send('SEND_GAME_MESSAGE', {
        matchId: current.matchId,
        message: { type: 'CHAT_MESSAGE', messageId: record.messageId, text: record.text, createdAt: record.createdAt },
      });
      if (current.spectatorsEnabled && current.roundId) {
        void publishChessSpectatorEvent({
          groupId,
          authorAddress: address,
          sessionId,
          payload: {
            qortalLandType: 'chess_spectator_chat',
            matchId: current.matchId,
            roundId: current.roundId,
            messageId: record.messageId,
            messageText: record.text,
          },
        }).catch(() => {
          updateMatch((value) => value?.matchId === current.matchId ? {
            ...value,
            chatMessages: value.chatMessages.map((item) => item.messageId === record.messageId
              ? { ...item, failed: true } : item),
          } : value);
        });
      }
      return true;
    } catch {
      updateMatch((value) => value ? {
        ...value,
        chatMessages: value.chatMessages.filter((item) => item.messageId !== record.messageId),
        error: t('group:qortal_land.games.errors.chat_send_failed'),
      } : value);
      return false;
    }
  }, [address, groupId, onActivity, replaceMatch, send, sessionId, t, updateMatch]);

  const sendTyping = useCallback((active: boolean) => {
    if (active) onActivity?.();
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    const current = matchRef.current;
    const available = current && !current.sessionClosed && !['opening', 'waiting', 'incoming', 'starting', 'reconnecting', 'session-idle'].includes(current.phase);
    if (!available) return;
    if (active && !typingSentRef.current) {
      try {
        send('SEND_GAME_MESSAGE', { matchId: current.matchId, message: { type: 'CHAT_TYPING', active: true } });
        typingSentRef.current = true;
      } catch { /* ephemeral signal */ }
    }
    if (!active && typingSentRef.current) {
      try { send('SEND_GAME_MESSAGE', { matchId: current.matchId, message: { type: 'CHAT_TYPING', active: false } }); } catch { /* ephemeral signal */ }
      typingSentRef.current = false;
      return;
    }
    if (active) {
      typingTimerRef.current = window.setTimeout(() => {
        typingTimerRef.current = null;
        const latest = matchRef.current;
        if (latest && typingSentRef.current) {
          try { send('SEND_GAME_MESSAGE', { matchId: latest.matchId, message: { type: 'CHAT_TYPING', active: false } }); } catch { /* ephemeral signal */ }
          typingSentRef.current = false;
        }
      }, 2_000);
    }
  }, [onActivity, send]);

  const close = useCallback(() => {
    onActivity?.();
    const current = matchRef.current;
    if (current?.phase === 'round-waiting') {
      try {
        send('SEND_GAME_MESSAGE', { matchId: current.matchId, message: { type: 'ROUND_CANCEL', messageId: crypto.randomUUID(), roundId: current.roundId } });
      } catch { /* connection may have ended */ }
      replaceMatch({ ...current, phase: 'session-idle', state: undefined, stateHash: undefined, moves: [], outcome: undefined, error: undefined });
      return;
    }
    if (current?.phase === 'finished' && !current.sessionClosed && (Boolean(current.state) || current.roundId !== current.matchId)) {
      replaceMatch({ ...current, phase: 'session-idle', state: undefined, stateHash: undefined, moves: [], outcome: undefined, error: undefined });
      return;
    }
    if (current) try { send('CLOSE_GAME_LINK', { matchId: current.matchId }); } catch { /* done */ }
    replaceMatch(null);
  }, [onActivity, replaceMatch, send]);

  const rematch = useCallback(() => {
    onActivity?.();
    const current = matchRef.current;
    if (!current || current.phase !== 'finished' || !current.state || !transportReady) return;
    const roundId = crypto.randomUUID();
    const requesterNonce = randomHex(16);
    replaceMatch({
      ...current,
      roundId,
      requesterNonce,
      recipientNonce: undefined,
      phase: 'round-waiting',
      state: undefined,
      stateHash: undefined,
      moves: [],
      chatMessages: [],
      outcome: undefined,
      error: undefined,
      localSpectatorsAllowed: false,
      remoteSpectatorsAllowed: false,
      spectatorsEnabled: false,
    });
    send('SEND_GAME_MESSAGE', { matchId: current.matchId, message: { type: 'ROUND_REQUEST', messageId: crypto.randomUUID(), roundId, requesterNonce, ...gameConfig(current.game) } });
  }, [onActivity, replaceMatch, send, transportReady]);

  const watchableMatch = spectatorMatches.find(
    (candidate) =>
      candidate.phase === 'active' &&
      candidate.expiresAt > now &&
      candidate.matchId !== dismissedWatchMatchId &&
      ![candidate.requesterAddress, candidate.recipientAddress].includes(address)
  );
  const watchedSnapshot = watchedMatchId
    ? spectatorMatches.find((candidate) => candidate.matchId === watchedMatchId) || null
    : null;
  const sendSpectatorChat = useCallback((text: string): boolean => {
    const snapshot = watchedMatchId
      ? spectatorMatchesRef.current.get(watchedMatchId)
      : null;
    const normalized = text.trim();
    if (
      !snapshot ||
      !['active', 'finished'].includes(snapshot.phase) ||
      snapshot.expiresAt <= Date.now() ||
      !normalized ||
      normalized.length > 500 ||
      new TextEncoder().encode(normalized).length > 2_000
    ) {
      return false;
    }
    const chatKey = spectatorChatKey(snapshot.matchId, snapshot.roundId);
    const record: ChessSpectatorChat = {
      matchId: snapshot.matchId,
      roundId: snapshot.roundId,
      messageId: crypto.randomUUID(),
      authorAddress: address,
      text: normalized,
      createdAt: Date.now(),
      delivered: false,
    };
    appendSpectatorChat(record);
    void publishChessSpectatorEvent({
      groupId,
      authorAddress: address,
      sessionId,
      payload: {
        qortalLandType: 'chess_spectator_chat',
        matchId: snapshot.matchId,
        roundId: snapshot.roundId,
        messageId: record.messageId,
        messageText: record.text,
      },
    })
      .then(() => {
        setSpectatorChats((current) => ({
          ...current,
          [chatKey]: (current[chatKey] || []).map((message) =>
            message.messageId === record.messageId
              ? { ...message, delivered: true }
              : message
          ),
        }));
      })
      .catch(() => {
        setSpectatorChats((current) => ({
          ...current,
          [chatKey]: (current[chatKey] || []).map((message) =>
            message.messageId === record.messageId
              ? { ...message, failed: true }
              : message
          ),
        }));
      });
    return true;
  }, [address, appendSpectatorChat, groupId, sessionId, watchedMatchId]);

  // A dialog opened after the authenticated lock screen becomes MUI's newest
  // focus trap even though the lock screen is visually above it. Preserve the
  // game state while locked, but do not mount game UI that can steal focus.
  const sharingMessage = match?.spectatorsEnabled
    ? t('group:qortal_land.games.spectators.sharing_on')
    : match?.localSpectatorsAllowed
      ? t('group:qortal_land.games.spectators.waiting_for_opponent')
      : t('group:qortal_land.games.spectators.sharing_off');
  const spectatorControls = match?.remoteSpectatorsSupported &&
    ['active', 'finishing'].includes(match.phase) ? (
      <Alert
        severity="info"
        sx={{ mb: 1, flexShrink: 0 }}
        action={
          <Button color="inherit" size="small"
            onClick={() => setSpectatorsAllowed(!match.localSpectatorsAllowed)}>
            {t(match.localSpectatorsAllowed
              ? 'group:qortal_land.games.spectators.disable'
              : 'group:qortal_land.games.spectators.allow')}
          </Button>
        }
      >
        {sharingMessage}
      </Alert>
    ) : null;
  const playerModal = match?.game === 'checkers' ? (
    <CheckersGameDialog
      address={address}
      match={match}
      now={now}
      onClose={close}
      onPlayMove={playCheckersMove}
      onRematch={rematch}
      onResign={performResign}
      onRespond={respond}
      onSendChat={sendChat}
      onTyping={sendTyping}
      resolvePlayerName={resolvePlayerName}
      transportReady={transportReady}
    />
  ) : isChessGame(match?.game) ? (
    <ChessGameDialog
      address={address}
      spectatorControls={
        <>
          {match.phase === 'incoming' && (
            <>
              <ChessColorControl
                options={match}
                selectedSeat={chosenWhiteSeat}
                onChoose={setChosenWhiteSeat}
              />
              <ChessTimeSummary preset={match.chessTime} />
            </>
          )}
          {match.state && turnNotice.control}
          {match.game === 'chess960' && (
            <Alert severity="info" sx={{ mb: 1 }}>
              {t('group:qortal_land.games.chess_options.castle_help')}
            </Alert>
          )}
          {match.state && match.clock && (
            <ChessClockDisplay
              clock={match.clock}
              whiteSeat={(match.state as ChessState).whiteSeat}
              now={now}
            />
          )}
          {spectatorControls}
        </>
      }
      match={match}
      now={now}
      onClose={close}
      onPlayMove={playChessMove}
      onRematch={rematch}
      onResign={performResign}
      onRespond={respond}
      onSendChat={sendChat}
      onTyping={sendTyping}
      resolvePlayerName={resolvePlayerName}
      transportReady={transportReady}
    />
  ) : (
    <ConnectFourGameDialog
      address={address}
      match={match as ConnectFourGameView | null}
      now={now}
      onClose={close}
      onPlayColumn={playColumn}
      onRematch={rematch}
      onResign={performResign}
      onRespond={respond}
      onSendChat={sendChat}
      onTyping={sendTyping}
      resolvePlayerName={resolvePlayerName}
      transportReady={transportReady}
    />
  );

  const modal = isAppLocked ? null : (
    <>
      {challengeTarget && (
        <ChessChallengeDialog
          game={challengeTarget.game}
          onCancel={() => setChallengeTarget(null)}
          onChallenge={(color, time) => {
            const target = challengeTarget;
            setChallengeTarget(null);
            void sendChallenge(target.target, target.game, color, time);
          }}
        />
      )}
      {turnNotice.popup}
      <GameSessionChatSharedContext.Provider
        value={isChessGame(match?.game) && match.spectatorsEnabled === true}
      >
        {playerModal}
      </GameSessionChatSharedContext.Provider>
      <ChessSpectatorDialog
        address={address}
        messages={
          watchedSnapshot
            ? spectatorChats[
                spectatorChatKey(watchedSnapshot.matchId, watchedSnapshot.roundId)
              ] || []
            : []
        }
        onClose={() => setWatchedMatchId(null)}
        onSendChat={sendSpectatorChat}
        resolvePlayerName={resolvePlayerName}
        snapshot={watchedSnapshot}
      />
      <Snackbar
        action={
          <>
            <Button
              color="inherit"
              onClick={() => {
                if (watchableMatch) setWatchedMatchId(watchableMatch.matchId);
              }}
              size="small"
            >
              {t('group:qortal_land.games.spectators.watch')}
            </Button>
            <Button
              color="inherit"
              onClick={() => setDismissedWatchMatchId(watchableMatch?.matchId || null)}
              size="small"
            >
              {t('group:qortal_land.games.spectators.dismiss')}
            </Button>
          </>
        }
        anchorOrigin={{ horizontal: 'center', vertical: 'bottom' }}
        message={
          watchableMatch
            ? t('group:qortal_land.games.spectators.available', {
                player1:
                  resolvePlayerName?.(watchableMatch.requesterAddress) ||
                  watchableMatch.requesterAddress,
                player2:
                  resolvePlayerName?.(watchableMatch.recipientAddress) ||
                  watchableMatch.recipientAddress,
              })
            : ''
        }
        open={Boolean(
          watchableMatch &&
          watchableMatch.matchId !== dismissedWatchMatchId &&
          !watchedMatchId &&
          !match
        )}
      />
    </>
  );

  const presence = useMemo(() => (
    match && ['starting', 'active', 'finishing', 'reconnecting'].includes(match.phase)
      ? {
          matchId: match.matchId,
          peerAddress:
            match.requesterAddress === address
              ? match.recipientAddress
              : match.requesterAddress,
        }
      : null
  ), [address, match?.matchId, match?.phase, match?.recipientAddress, match?.requesterAddress]);

  return {
    transportReady,
    busy: Boolean(match && match.phase !== 'session-idle'),
    presence,
    challenge,
    modal,
  };
}
