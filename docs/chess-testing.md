# Chess feature testing

The local feature branch adds color selection, turn popups, optional clocks,
and Chess960 as a separate game. Both players need updated code for Chess960,
timed games, or an explicit color choice. Random, untimed standard-chess
invitations retain the original handshake format for older clients.

Use two accounts in the same Qortal group and Qortal Land room. Include a
second computer in the test, ideally on a different network. Reticulum games
require Electron; the browser development server cannot test the transport.

## Invitations and colors

- Choose White, accept on the other account, and verify that the challenger
  has white and moves first. Repeat with Black.
- Choose Random and confirm that both boards agree on colors and the first
  turn. Random selection does not guarantee alternating colors.
- Choose “Let your opponent choose.” Accept once with White and once with
  Black on the recipient account, checking both board orientations.
- Decline and cancel invitations; neither action should start a game.
- Play a rematch. Explicit colors stay assigned to the same players;
  Random is drawn again for each round.
- Briefly interrupt connectivity during a rematch. After recovery, confirm
  that the round, colors, position, and side to move agree.
- With an older Hub, use Random and verify an ordinary chess game still works.

## Turn popups

- Check that the player with white receives one popup at the start.
- Make alternating moves. Only the player whose turn begins should receive
  a popup, and it should disappear after about five seconds.
- Reconnect during the same turn; the popup should not repeat.
- Turn notifications off, reopen the game, and confirm the setting persists.
- Enable Do Not Disturb or lock the app before the opponent moves. No popup
  should appear or be replayed on unlocking. Subsequent turns should alert.
- Finish or resign. There should be no additional turn popup after the result.
- Watch from a third account and check that spectators receive no player-turn
  popup and still see the correct colors and position.

These are in-app popups, not operating-system notifications.

## Clocks

- Try untimed play and the 3+2, 5+0, 5+3, 10+0, 10+5, 15+10, and 30+0 presets.
  The first number is minutes per player; the second is seconds added per move.
- Confirm the recipient sees the chosen time control before accepting.
- Make several moves, including a promotion, and compare both players' clocks.
  Increments should apply once; message delivery delays should not consume
  thinking time.
- Briefly disconnect and reconnect. Clocks should pause during recovery and
  resume with the time already spent preserved. Repeat with a move awaiting
  acknowledgement, and reload the renderer during a timed game.
- Let your clock expire. Both players should see the same result; the clocks
  should stop, the final board should agree, and chat should remain available.
- Check that resignation and checkmate stop the clocks too. Start a rematch
  and verify it gets fresh time with the same settings.
- Enable spectating and confirm that the spectator sees clocks. Spectator
  times are estimates and can lag behind the players' displays.

Each player's game service measures their own thinking time; there is no
central clock arbiter. The service retains clocks across renderer reloads,
pauses during link recovery, and follows the existing abandonment timeout
when recovery fails.

## Chess960

- Choose Chess960 from the game menu. Both players should see the same mirrored
  back rank, bishops on opposite colors, and the king between the rooks.
- Repeat color, clock, notification, reconnect, rematch, spectator, and chat
  checks in Chess960. A rematch draws a new random starting position, which
  can occasionally repeat.
- Castle by selecting the king, then its highlighted rook. Check both sides,
  including a stationary king, a stationary rook, and a king/rook swap.
- Ensure castling is unavailable through check, after moving the king or that
  rook, or when another piece blocks either piece's required path.

Automated tests cover all 960 layouts and both castling directions, shared
Python/TypeScript position hashes, signed options, peer clock acknowledgements,
timeout events, and the UI controls. The cross-device checks above remain manual.
Rule reference: [FIDE Chess960 guidelines](https://handbook.fide.com/chapter/E012023).
