/**
 * How a colour is **declared** and how two colours are **combined** — the
 * mechanism behind the collection's token table.
 *
 * The table itself is in two halves: [`palette.ts`](./palette.ts) holds the
 * shared roles, [`palette-games.ts`](./palette-games.ts) the per-game
 * vocabularies. Neither the declaration helper nor the combinators live there,
 * because a wildcard import of either half must see *colours and nothing else* —
 * that is how `palette.test.ts` enumerates the vocabulary without a
 * hand-maintained list of which exports are colours.
 *
 * Nothing in this module decides a colour. Every value comes from a token.
 */

import type { Colour } from "../../puzzle/types.ts";

/**
 * A colour token: a value, plus optionally the value it takes under another
 * colour scheme.
 *
 * ## Why the scheme value rides on the colour
 *
 * A token cannot be recognised later by its *value*, because two tokens may share
 * one and still behave oppositely when the scheme flips: `INK` and `PIECE_BLACK`
 * are both pure black, and the first must invert in dark mode while the second
 * must not. The identity of a token is therefore (value, scheme behaviour), and
 * the scheme half has to travel attached to the array a game put in its palette.
 *
 * It travels as an own property rather than a wrapper object so a token is
 * *structurally still a `Colour`* — a game writes `ret[COL_BLACK] = PIECE_BLACK`
 * and nothing else in the collection learns a new type. The cost is that the
 * property does not survive `structuredClone` (an array's indices cross, its
 * other own properties do not), so the tag is read off **engine-side** and only
 * plain per-index data reaches the frontend. See `Midend.darkPalette`.
 *
 * The corollary is that a game must assign a token, never a copy of one:
 * `[...PIECE_BLACK]` is the right colour with its scheme decision silently
 * removed.
 */
type Token = Colour & { readonly dark?: Colour };

/**
 * Declare a colour token.
 *
 * `dark` is the value the token takes in dark mode. Leaving it out is a
 * deliberate, supported state — the colour is then adapted by `utils/color.ts`'s
 * calculation, exactly as every colour was before tokens existed — so a scheme
 * can be authored token by token rather than in one flag day. Stating `dark`
 * equal to the light value is how to say **this colour means the same thing under
 * every scheme**: a black piece is black on any board.
 *
 * The returned array is frozen. A token is shared by every game that references
 * it, so an in-place `ret[COL_X][0] = …` would silently repaint the collection;
 * freezing turns that into a throw at the mutation site.
 */
export function token(light: Colour, dark?: Colour): Colour {
  const t = [...light] as Token;
  if (dark) Object.defineProperty(t, "dark", { value: Object.freeze([...dark]) });
  return Object.freeze(t);
}

/**
 * The value this colour takes in dark mode, or `undefined` if it has not been
 * authored one and should be adapted by calculation.
 */
export function darkValue(c: Colour): Colour | undefined {
  return (c as Token).dark;
}

// --- combining colours -------------------------------------------------

/**
 * Scale a colour by a factor, per channel. The shape almost every
 * background-derived colour in the collection takes: a wash that must track the
 * board's own brightness rather than sit at a fixed value on top of it.
 */
export function scale(colour: Colour, factor: number): Colour {
  return [colour[0] * factor, colour[1] * factor, colour[2] * factor];
}

/**
 * `weight` of the way from `from` to `to`, per channel — the other shape a
 * derived colour takes, and the one that composes *tokens* rather than the
 * background. Signpost builds three 16-entry ramps out of eight region tokens
 * and `INK` this way, and its dimmed arrow background is a tenth of the way from
 * the board toward the arrow.
 */
export function mix(from: Colour, to: Colour, weight: number): Colour {
  return [
    from[0] + weight * (to[0] - from[0]),
    from[1] + weight * (to[1] - from[1]),
    from[2] + weight * (to[2] - from[2]),
  ];
}
