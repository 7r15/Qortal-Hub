import EmojiEmotionsRoundedIcon from '@mui/icons-material/EmojiEmotionsRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import {
  Box,
  Button,
  IconButton,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import Picker, {
  EmojiStyle,
  Theme,
  type EmojiClickData,
} from 'emoji-picker-react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type GameChatMessage = {
  messageId: string;
  authorAddress: string;
  text: string;
  createdAt: number;
  delivered: boolean;
  failed?: boolean;
  authorName?: string;
};

export const GameSessionChatSharedContext = createContext(false);

type Props = {
  address: string;
  disabled?: boolean;
  messages: GameChatMessage[];
  opponentName?: string;
  remoteTyping?: boolean;
  onSend: (text: string) => boolean;
  onTyping?: (active: boolean) => void;
  resolveAuthorName?: (address: string) => string;
  shared?: boolean;
  variant?: 'default' | 'chess';
};

const CHAT_LIMIT = 500;
const ignoreTyping = () => undefined;

export function GameSessionChat({
  address,
  disabled = false,
  messages,
  opponentName = '',
  remoteTyping = false,
  onSend,
  onTyping = ignoreTyping,
  resolveAuthorName,
  shared,
  variant = 'default',
}: Props) {
  const { t } = useTranslation(['group']);
  const theme = useTheme();
  const sharedFromContext = useContext(GameSessionChatSharedContext);
  const isShared = shared ?? sharedFromContext;
  const chessLayout = variant === 'chess';
  const [draft, setDraft] = useState('');
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [unread, setUnread] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const previousCountRef = useRef(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (nearBottomRef.current) {
      element.scrollTop = element.scrollHeight;
      setUnread(0);
    } else if (messages.length > previousCountRef.current) {
      setUnread((value) => value + messages.length - previousCountRef.current);
    }
    previousCountRef.current = messages.length;
  }, [messages.length, remoteTyping]);

  useEffect(() => () => onTyping(false), [onTyping]);

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled || !onSend(text)) return;
    setDraft('');
    onTyping(false);
  };

  const insertEmoji = (emoji: EmojiClickData) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const next =
      `${draft.slice(0, start)}${emoji.emoji}${draft.slice(end)}`.slice(
        0,
        CHAT_LIMIT
      );
    setDraft(next);
    onTyping(Boolean(next));
    setEmojiAnchor(null);
    window.setTimeout(() => {
      input?.focus();
      const cursor = Math.min(start + emoji.emoji.length, next.length);
      input?.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <Box
      aria-label={t(
        isShared
          ? 'group:qortal_land.games.chat.shared_aria'
          : 'group:qortal_land.games.chat.private_aria'
      )}
      sx={{
        color: theme.palette.text.primary,
        backgroundColor: chessLayout
          ? alpha(theme.palette.background.paper, 0.32)
          : 'transparent',
        border: chessLayout ? `1px solid ${theme.palette.divider}` : 0,
        borderLeft: chessLayout
          ? undefined
          : { md: `1px solid ${alpha(theme.palette.text.primary, 0.1)}` },
        borderRadius: chessLayout ? '8px' : 0,
        borderTop: chessLayout
          ? undefined
          : {
              xs: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
              md: 0,
            },
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: chessLayout ? { xs: 280, lg: 0 } : { xs: 230, md: 0 },
        minWidth: 0,
        p: chessLayout ? '26px 14px 14px' : 0,
        pl: chessLayout ? undefined : { md: 2 },
        pt: chessLayout ? undefined : { xs: 2, md: 0 },
      }}
    >
      <Box sx={{ mb: chessLayout ? 0 : 1 }}>
        <Typography
          sx={{
            fontSize: chessLayout ? 17 : 14,
            fontWeight: chessLayout ? 700 : 850,
            lineHeight: chessLayout ? '21px' : undefined,
          }}
        >
          {t(
            isShared
              ? 'group:qortal_land.games.chat.shared_title'
              : 'group:qortal_land.games.chat.private_title'
          )}
        </Typography>
        <Typography
          sx={{
            color: alpha(theme.palette.text.primary, chessLayout ? 0.54 : 0.46),
            fontSize: chessLayout ? 12 : 10,
            fontWeight: chessLayout ? 500 : undefined,
            lineHeight: chessLayout ? '16px' : undefined,
            mt: chessLayout ? '3px' : 0,
          }}
        >
          {isShared
            ? t('group:qortal_land.games.chat.shared_description')
            : t(
                chessLayout
                  ? 'group:qortal_land.games.chat.temporary'
                  : 'group:qortal_land.games.chat.private_description'
              )}
        </Typography>
      </Box>

      <Stack
        aria-live="polite"
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            36;
          if (nearBottomRef.current) setUnread(0);
        }}
        spacing={chessLayout ? 1 : 0.8}
        sx={{
          flex: 1,
          maxHeight: chessLayout ? 'none' : { xs: 210, md: 'none' },
          minHeight: chessLayout ? 0 : { xs: 150, md: 0 },
          overflowY: 'auto',
          pr: chessLayout ? '10px' : 0.5,
          pt: chessLayout ? '18px' : 0,
          pb: chessLayout ? '14px' : 0,
          scrollbarColor: chessLayout
            ? `${alpha(theme.palette.text.secondary, 0.3)} transparent`
            : undefined,
          scrollbarWidth: chessLayout ? 'thin' : undefined,
          '&::-webkit-scrollbar': chessLayout ? { width: 4 } : undefined,
          '&::-webkit-scrollbar-thumb': chessLayout
            ? {
                backgroundColor: alpha(theme.palette.text.secondary, 0.3),
                borderRadius: 4,
              }
            : undefined,
        }}
      >
        {!chessLayout && messages.length === 0 && (
          <Typography
            sx={{
              color: alpha(theme.palette.text.primary, 0.38),
              fontSize: 12,
              mt: 2,
              textAlign: 'center',
            }}
          >
            {isShared
              ? t('group:qortal_land.games.chat.shared_empty')
              : t('group:qortal_land.games.chat.private_empty', {
                  opponent: opponentName,
                })}
          </Typography>
        )}
        {messages.map((message) => {
          const local = message.authorAddress === address;
          const authorName =
            message.authorName ||
            resolveAuthorName?.(message.authorAddress) ||
            (isShared ? message.authorAddress : opponentName);
          return (
            <Box
              key={`${message.authorAddress}:${message.messageId}`}
              sx={{
                alignSelf: local ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
              }}
            >
              <Box
                sx={{
                  backgroundColor: local
                    ? chessLayout
                      ? alpha(theme.palette.primary.main, 0.2)
                      : alpha(theme.palette.primary.main, 0.2)
                    : alpha(
                        theme.palette.text.primary,
                        chessLayout ? 0.065 : 0.08
                      ),
                  border: `1px solid ${local ? (chessLayout ? alpha(theme.palette.primary.main, 0.5) : alpha(theme.palette.primary.main, 0.46)) : alpha(theme.palette.text.primary, chessLayout ? 0.08 : 0.1)}`,
                  borderRadius: chessLayout
                    ? '8px'
                    : local
                      ? '12px 12px 3px 12px'
                      : '12px 12px 12px 3px',
                  px: chessLayout ? 1.35 : 1.2,
                  py: chessLayout ? 0.9 : 0.8,
                }}
              >
                {!local && isShared && (
                  <Typography
                    sx={{
                      color: 'primary.main',
                      fontSize: 10,
                      fontWeight: 700,
                      mb: 0.25,
                    }}
                  >
                    {authorName}
                  </Typography>
                )}
                <Typography
                  sx={{
                    fontSize: chessLayout ? 13 : 12,
                    lineHeight: chessLayout ? 1.4 : undefined,
                    overflowWrap: 'anywhere',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {message.text}
                </Typography>
              </Box>
              <Typography
                sx={{
                  color: alpha(theme.palette.text.primary, 0.36),
                  fontSize: 9,
                  mt: 0.25,
                  textAlign: local ? 'right' : 'left',
                }}
              >
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {local
                  ? ` · ${t(message.failed ? 'group:qortal_land.games.chat.failed' : message.delivered ? 'group:qortal_land.games.chat.delivered' : 'group:qortal_land.games.chat.sending')}`
                  : ''}
              </Typography>
            </Box>
          );
        })}
        {remoteTyping && (
          <Typography
            aria-live="polite"
            sx={{
              color: theme.palette.primary.main,
              fontSize: 11,
              fontStyle: 'italic',
            }}
          >
            {t('group:qortal_land.games.chat.typing', { name: opponentName })}
          </Typography>
        )}
      </Stack>

      {unread > 0 && (
        <Button
          onClick={() => {
            const element = scrollRef.current;
            if (element) element.scrollTop = element.scrollHeight;
            nearBottomRef.current = true;
            setUnread(0);
          }}
          size="small"
          sx={{ alignSelf: 'center', fontSize: 10, my: 0.4 }}
        >
          {t('group:qortal_land.games.chat.new_messages', { count: unread })}
        </Button>
      )}

      <Box sx={{ mt: chessLayout ? 0 : 1 }}>
        <Box
          sx={
            chessLayout
              ? {
                  alignItems: 'center',
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: '7px',
                  display: 'grid',
                  gridTemplateColumns: '42px 1px minmax(0, 1fr) 42px',
                  height: 52,
                  overflow: 'hidden',
                }
              : { alignItems: 'flex-end', display: 'flex', gap: 0.5 }
          }
        >
          <Tooltip title={t('group:qortal_land.games.chat.add_emoji')}>
            <span>
              <IconButton
                disabled={disabled}
                aria-label={t('group:qortal_land.games.chat.add_emoji')}
                onClick={(event) => setEmojiAnchor(event.currentTarget)}
                size="small"
                sx={{
                  color: theme.palette.primary.main,
                  height: chessLayout ? 42 : undefined,
                  width: chessLayout ? 42 : undefined,
                }}
              >
                <EmojiEmotionsRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {chessLayout && (
            <Box
              aria-hidden="true"
              sx={{
                backgroundColor: theme.palette.divider,
                height: 26,
                width: 1,
              }}
            />
          )}
          <TextField
            fullWidth
            inputRef={inputRef}
            disabled={disabled}
            multiline={!chessLayout}
            maxRows={chessLayout ? undefined : 3}
            placeholder={t(
              disabled
                ? 'group:qortal_land.games.chat.unavailable'
                : 'group:qortal_land.games.chat.placeholder'
            )}
            value={draft}
            inputProps={{
              maxLength: CHAT_LIMIT,
              'aria-label': t('group:qortal_land.games.chat.message_aria'),
            }}
            onChange={(event) => {
              setDraft(event.target.value);
              onTyping(Boolean(event.target.value));
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            size="small"
            sx={
              chessLayout
                ? {
                    '& .MuiInputBase-root': {
                      background: 'transparent',
                      fontSize: 15,
                      height: 50,
                      p: 0,
                    },
                    '& .MuiInputBase-input': { px: 1.5, py: 0 },
                    '& fieldset': { border: '0 !important' },
                  }
                : undefined
            }
          />
          <Tooltip title={t('group:qortal_land.games.chat.send')}>
            <span>
              <IconButton
                disabled={disabled || !draft.trim()}
                aria-label={t('group:qortal_land.games.chat.send_aria')}
                onClick={submit}
                size="small"
                sx={{
                  color: theme.palette.primary.main,
                  height: chessLayout ? 42 : undefined,
                  width: chessLayout ? 42 : undefined,
                }}
              >
                <SendRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
        {(!chessLayout || draft.length >= 450) && (
          <Typography
            sx={{
              color: alpha(theme.palette.text.primary, 0.34),
              fontSize: 9,
              mt: 0.3,
              textAlign: 'right',
            }}
          >
            {draft.length}/{CHAT_LIMIT}
          </Typography>
        )}
      </Box>

      <Popover
        anchorEl={emojiAnchor}
        open={Boolean(emojiAnchor)}
        onClose={() => setEmojiAnchor(null)}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        <Picker
          emojiStyle={EmojiStyle.NATIVE}
          height={360}
          lazyLoadEmojis
          onEmojiClick={insertEmoji}
          previewConfig={{ showPreview: false }}
          searchPlaceHolder={t('group:qortal_land.games.chat.search_emoji')}
          theme={theme.palette.mode === 'dark' ? Theme.DARK : Theme.LIGHT}
          width={320}
        />
      </Popover>
    </Box>
  );
}
