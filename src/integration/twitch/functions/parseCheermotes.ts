import { KeyedObject } from '../../../Types';

// A cheermote occurrence found in a message, in the same positional shape TwitchChat's
// `twitchjsify` produces for chat emotes - `id`/`start`/`end` - so an overlay walking a
// message's `emotes` array to splice images in by index handles both with one loop.
//
// The extra fields exist because a cheermote can't be reconstructed from its id the way an
// emoticon can: an emote URL is derivable (.../emoticons/v2/{id}/...), so carrying the id is
// enough, but a cheermote's art lives at a URL Twitch hands out per tier. `url` is therefore
// the only way the renderer can draw it, and `bits`/`color` are what make it a *cheer* on
// screen rather than just an image - Twitch renders the bit count beside the animation in the
// tier's color.
export interface CheermoteMatch {
  id: string;
  start: number;
  end: number;
  // Discriminates these from chat emotes sharing the array. Chat emotes carry no `type` today,
  // so a renderer treats "no type" and 'emote' alike.
  type: 'cheermote';
  prefix: string;
  bits: number;
  color: string;
  url: string;
}

// Which art to pull out of a tier's `images` block. Twitch nests them
// images[theme][animated|static][scale], and every tier carries the full set, so these are
// simply the defaults a chat overlay wants: dark backgrounds are the norm for overlays, and
// the animation is the point of a cheermote. Both fall back if a tier is missing them.
const IMAGE_THEME = 'dark';
const IMAGE_SCALE = '2';

// Cheermote tokens are a prefix immediately followed by the bit amount, whitespace-delimited:
// 'Cheer100', 'Kappa250', 'uni500'. The prefix is letters only and the amount is a plain
// integer, which is what keeps this from matching ordinary words with digits stuck on them -
// the prefix still has to be one Twitch told us about.
const TOKEN_PATTERN = /(^|\s)([a-zA-Z]+)(\d+)(?=\s|$)/g;

// Picks the art a given cheer amount earns: the richest tier whose threshold the cheer clears.
// Tiers arrive smallest-first in practice but are sorted here rather than trusted, since
// picking the wrong one silently shows a 1-bit sprite for a 10000-bit cheer.
function tierForBits(tiers: KeyedObject[], bits: number): KeyedObject | undefined {
  return [...tiers]
    .filter((tier) => Number(tier.min_bits) <= bits)
    .sort((a, b) => Number(b.min_bits) - Number(a.min_bits))[0];
}

function tierImageUrl(tier: KeyedObject): string {
  const themed = tier.images?.[IMAGE_THEME] ?? tier.images?.light;
  const set = themed?.animated ?? themed?.static;
  return set?.[IMAGE_SCALE] ?? set?.['1'] ?? '';
}

// Cheermote prefixes are matched case-insensitively ('cheer100' and 'Cheer100' are the same
// cheermote), so the lookup is keyed lowercase. Built per call from whatever getCheermotes
// returned rather than cached alongside it, because it's a cheap map over a list that's already
// in memory - and a stale index is a much worse failure than rebuilding one.
function indexByPrefix(cheermotes: KeyedObject[]): Map<string, KeyedObject> {
  const index = new Map<string, KeyedObject>();
  for (const cheermote of cheermotes ?? []) {
    if (typeof cheermote?.prefix === 'string') {
      index.set(cheermote.prefix.toLowerCase(), cheermote);
    }
  }
  return index;
}

// Finds every cheermote in a cheer's message text. `cheermotes` is the `data` array from
// helix/bits/cheermotes (see TwitchApi.getCheermotes) - global and channel-specific together,
// which is exactly what Twitch returns for a broadcaster.
//
// Returns [] rather than throwing on anything unexpected: this runs inside event dispatch, and
// a malformed cheermote list should cost the overlay its images, not drop the whole cheer.
export default function parseCheermotes(
  message: string | undefined,
  cheermotes: KeyedObject[] | undefined,
): CheermoteMatch[] {
  if (!message || !cheermotes?.length) {
    return [];
  }

  const index = indexByPrefix(cheermotes);
  const matches: CheermoteMatch[] = [];

  // Reset rather than reused: TOKEN_PATTERN is a module-level /g regex, so its lastIndex would
  // carry over from the previous message and skip the start of this one.
  TOKEN_PATTERN.lastIndex = 0;
  let token: RegExpExecArray | null;
  while ((token = TOKEN_PATTERN.exec(message)) !== null) {
    const [, leading, prefix, amount] = token;
    const cheermote = index.get(prefix.toLowerCase());
    if (!cheermote?.tiers?.length) {
      continue;
    }
    const bits = Number(amount);
    const tier = tierForBits(cheermote.tiers, bits);
    const url = tier ? tierImageUrl(tier) : '';
    if (!tier || !url) {
      continue;
    }
    // The match includes the whitespace that delimited it, which isn't part of the cheermote -
    // `start` steps past it so the indices cover the token itself.
    const start = token.index + leading.length;
    matches.push({
      id: String(tier.id ?? `${cheermote.prefix}${tier.min_bits}`),
      start,
      // Inclusive, matching the chat-emote indices Twitch itself hands out in the emotes tag.
      end: start + prefix.length + amount.length - 1,
      type: 'cheermote',
      prefix: cheermote.prefix,
      bits,
      color: tier.color ?? '',
      url,
    });
  }

  return matches;
}
