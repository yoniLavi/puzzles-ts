/**
 * Shared colour-mkhighlight helper — idiomatic TS port of
 * `misc.c`'s `game_mkhighlight_specific` background-adjustment
 * logic.
 *
 * Every white/black-tile game (Solo, Loopy, Map, Pattern, Range,
 * Galaxies, ...) needs to shift the host background away from pure
 * white (or pure black) so that a pure-white `COL_WHITEBG` is
 * visibly brighter than the background. Without this step a
 * white-themed host renders `COL_BACKGROUND === COL_WHITEBG` and a
 * closed white region disappears into the page.
 *
 * The near-white epsilon fix (2026-05-23) is included: anything
 * within IEEE round-trip drift of exact equality is treated as
 * equal, preventing `K / dw` from overflowing to ~2.89e14 and
 * shifting the background wildly past white into out-of-gamut pink.
 */
import type { Colour } from "../../puzzle/types.ts";

const K = Math.sqrt(3) / 6;

const colourDistance = (a: Colour, b: Colour) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

const colourMix = (a: Colour, b: Colour, t: number): Colour => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const black: Colour = [0, 0, 0];
const white: Colour = [1, 1, 1];

/**
 * Adjust a background colour away from pure white or pure black so
 * that a highlight (pure white) or lowlight (pure black) is visibly
 * distinct. Mirrors `misc.c` lines 232-288.
 *
 * Returns the (possibly shifted) background colour. Games should
 * call this in their `colours()` method before deriving their
 * palette overrides.
 */
export function mkhighlightBackground(bg: Colour): Colour {
  // Treat anything within IEEE round-trip drift of exact equality
  // as equal. The C path operates in float32 where a JS-side pure
  // white round-trips exactly (so its `dw == 0.0F` branch fires),
  // but our doubles pick up ~1e-15 drift from `oklchToColour([1, 0, 0])`
  // — without this epsilon, `K / dw` overflows to ~2.89e14 and shifts
  // the background wildly past white into out-of-gamut pink.
  const EPS = 1e-9;
  let out: Colour = [bg[0], bg[1], bg[2]];
  // First, the lowlight pass (matching upstream order so the shifted
  // background ends up identical when only one pass triggers).
  const db = colourDistance(out, black);
  if (db < K) {
    if (db < EPS) out = colourMix(black, white, K / Math.sqrt(3));
    else out = colourMix(black, out, K / db);
  }
  // Then the highlight pass.
  const dw = colourDistance(out, white);
  if (dw < K) {
    if (dw < EPS) out = colourMix(white, black, K / Math.sqrt(3));
    else out = colourMix(white, out, K / dw);
  }
  return out;
}

/**
 * Full `misc.c` `game_mkhighlight` palette derivation: adjust the
 * background via {@link mkhighlightBackground}, then shift it toward
 * white by K for the highlight and toward black by K for the lowlight.
 * Per upstream, a background still within K of an extreme saturates
 * the highlight to pure white / the lowlight to pure black — this
 * also absorbs the floating-point case where the adjusted background
 * sits a hair inside K of the extreme it was shifted away from.
 *
 * Games wanting the standard bg/highlight/lowlight trio destructure
 * this instead of re-deriving the colours locally; palette index
 * placement stays per-game.
 */
export function mkhighlight(defaultBackground: Colour): {
  background: Colour;
  highlight: Colour;
  lowlight: Colour;
} {
  const bg = mkhighlightBackground(defaultBackground);

  const dw = colourDistance(bg, white);
  const highlight: Colour = dw < K ? [1, 1, 1] : colourMix(bg, white, K / dw);

  const db = colourDistance(bg, black);
  const lowlight: Colour = db < K ? [0, 0, 0] : colourMix(bg, black, K / db);

  return { background: bg, highlight, lowlight };
}
