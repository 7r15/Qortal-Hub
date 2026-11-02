import i18n from '../../../i18n/i18n';

// Scharnagl numbering: opposite-colored bishops, queen, two knights, then R-K-R.
export function chess960BackRank(position: number): number[] {
  if (!Number.isInteger(position) || position < 0 || position >= 960) {
    throw new RangeError(
      i18n.t('group:qortal_land.games.chess_options.invalid_position')
    );
  }
  let remaining = position;
  const rank = Array<number>(8).fill(0);
  rank[(remaining % 4) * 2 + 1] = 3;
  remaining = Math.floor(remaining / 4);
  rank[(remaining % 4) * 2] = 3;
  remaining = Math.floor(remaining / 4);
  const empty = () => rank.flatMap((piece, file) => (piece ? [] : [file]));
  rank[empty()[remaining % 6]] = 5;
  remaining = Math.floor(remaining / 6);
  const pairs: [number, number][] = [];
  for (let first = 0; first < 4; first++) {
    for (let second = first + 1; second < 5; second++)
      pairs.push([first, second]);
  }
  const spaces = empty();
  for (const index of pairs[remaining]) rank[spaces[index]] = 2;
  empty().forEach((file, index) => {
    rank[file] = index === 1 ? 6 : 4;
  });
  return rank;
}

export async function deriveChess960Position(
  roundId: string,
  requesterNonce: string,
  recipientNonce: string
): Promise<number> {
  const seed = (roundId + requesterNonce + recipientNonce).replace(/-/g, '');
  if (!/^[0-9a-f]{96}$/i.test(seed))
    throw new RangeError(
      i18n.t('group:qortal_land.games.chess_options.invalid_position')
    );
  const prefix = new TextEncoder().encode('qortalland-game:v2:chess960:');
  const bytes = Uint8Array.from(seed.match(/../g)!, (pair) =>
    parseInt(pair, 16)
  );
  const input = new Uint8Array(prefix.length + bytes.length);
  input.set(prefix);
  input.set(bytes, prefix.length);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return new DataView(digest).getUint32(0) % 960;
}
