/**
 * How a color is **declared** and how two colors are **combined** — the
 * mechanism behind the collection's color table.
 *
 * The table itself is [`colors.ts`](./colors.ts), [`palette.ts`](./palette.ts)
 * and [`palette-games.ts`](./palette-games.ts). Neither the declaration helper
 * nor the combinators live there, because a wildcard import of the table must
 * see *the vocabulary and nothing else* — that is how the palette tests
 * enumerate it without a hand-maintained list of which exports are colors.
 *
 * Nothing in this module decides a color. Every value comes from a token.
 */

import type { Color } from "../types.ts";

/**
 * A color token: a value, plus optionally the value it takes under another
 * color scheme.
 *
 * ## Why the scheme value rides on the color
 *
 * A token cannot be recognized later by its *value*, because two tokens may share
 * one and still behave oppositely when the scheme flips: `INK` and `BLACK` are
 * both pure black, and the first must invert in dark mode while the second must
 * not. The identity of a token is therefore (value, scheme behavior), and the
 * scheme half has to travel attached to the array a game put in its palette.
 *
 * It travels as an own property rather than a wrapper object so a token is
 * *structurally still a `Color`* — a game writes `ret[COL_BLACK] = BLACK` and
 * nothing else in the collection learns a new type. The cost is that the
 * property does not survive `structuredClone` (an array's indices cross, its
 * other own properties do not), so the tag is read off **engine-side** and only
 * plain per-index data reaches the frontend. See `Midend.darkPalette`.
 *
 * The corollary is that a game must assign a token, never a copy of one:
 * `[...BLACK]` is the right color with its scheme decision silently removed.
 * **No test can catch that in general**, and it is worth knowing why: a copy is
 * detectable only by value, and value is exactly what does not identify a token
 * — an untagged `[0, 0, 0]` is equally well a copied `BLACK` or a perfectly
 * correct `INK`. What does hold the line is that tokens are frozen and there is
 * no reason to copy one; `palette-source.test.ts` catches the neighboring
 * mistake, a token nobody references at all.
 */
type Token = Color & { readonly dark?: Color };

/**
 * Declare a color token.
 *
 * `dark` is the value the token takes in dark mode. Leaving it out is a
 * deliberate, supported state: the color is then adapted by `utils/color.ts`'s
 * calculation. Stating `dark` equal to the light value is how to say **this
 * color means the same thing under every scheme**: a black piece is black on any
 * board.
 *
 * The returned array is frozen. A token is shared by every game that references
 * it, so an in-place `ret[COL_X][0] = …` would silently repaint the collection;
 * freezing turns that into a throw at the mutation site.
 */
export function token(light: Color, dark?: Color): Color {
  const t = [...light] as Token;
  if (dark) Object.defineProperty(t, "dark", { value: Object.freeze([...dark]) });
  return Object.freeze(t);
}

/**
 * The value this color takes in dark mode, or `undefined` if it has not been
 * authored one and should be adapted by calculation.
 */
export function darkValue(c: Color): Color | undefined {
  return (c as Token).dark;
}

// --- combining colors -------------------------------------------------

/**
 * Scale a color by a factor, per channel. The shape almost every
 * background-derived color in the collection takes: a wash that must track the
 * board's own brightness rather than sit at a fixed value on top of it.
 */
export function scale(color: Color, factor: number): Color {
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}

/**
 * A color **divided** by a number — not `scale(c, 1 / k)`, for the same reason
 * as {@link fraction}: the reciprocal is usually not representable, so
 * pre-computing it rounds once more than upstream's `c / 1.5` does.
 */
export function divide(color: Color, divisor: number): Color {
  return [color[0] / divisor, color[1] / divisor, color[2] / divisor];
}

/**
 * A **fraction** of a color, multiplied before it is divided — not
 * `scale(c, num / den)`, because a ratio like `2/3` is not representable in
 * binary and pre-computing it rounds once more than upstream's `(c * 2) / 3`.
 * One ULP, invisible on screen, but keeping the operation keeps the resolved
 * palette bit-identical to the expression it came from.
 */
export function fraction(color: Color, numerator: number, denominator: number): Color {
  return [
    (color[0] * numerator) / denominator,
    (color[1] * numerator) / denominator,
    (color[2] * numerator) / denominator,
  ];
}

/**
 * `weight` of the way from `from` to `to`, per channel — the other shape a
 * derived color takes, and the one that composes *tokens* rather than the
 * background. Signpost builds three 16-entry ramps out of eight region tokens
 * and `INK` this way, and its dimmed arrow background is a tenth of the way from
 * the board toward the arrow.
 */
export function mix(from: Color, to: Color, weight: number): Color {
  return [
    from[0] + weight * (to[0] - from[0]),
    from[1] + weight * (to[1] - from[1]),
    from[2] + weight * (to[2] - from[2]),
  ];
}
