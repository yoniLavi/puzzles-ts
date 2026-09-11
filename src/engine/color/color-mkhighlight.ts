/**
 * The bevel trio — a background shifted off pure white and pure black, and the
 * highlight and lowlight derived from it — ported from upstream `misc.c`'s
 * `game_mkhighlight` and `game_mkhighlight_specific`.
 *
 * The shift is what makes a pure-white highlight or pure-black lowlight visibly
 * distinct from the board: without it a white host renders
 * `COL_BACKGROUND === COL_WHITEBG`, and a closed white region disappears into
 * the page. {@link resolvePalette} applies it once, for every game.
 */
import type { Color } from "../types.ts";
import { darkValue, token } from "./color-token.ts";

const K = Math.sqrt(3) / 6;

const colorDistance = (a: Color, b: Color) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

const colorMix = (a: Color, b: Color, t: number): Color => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const black: Color = [0, 0, 0];
const white: Color = [1, 1, 1];

// Anything within IEEE round-trip drift of exact equality counts as equal. The C
// runs in float32, where a pure white round-trips exactly and its `dw == 0.0F`
// branch fires; doubles pick up ~1e-15 of drift, and without this `K / dw`
// overflows to ~2.89e14 and shifts the background past white into out-of-gamut
// pink.
const EPS = 1e-9;

/**
 * Shift a background color away from pure white or pure black so that a
 * highlight (pure white) or lowlight (pure black) is visibly distinct, and
 * return the shifted color.
 */
export function mkhighlightBackground(bg: Color): Color {
  let out: Color = [bg[0], bg[1], bg[2]];
  // The lowlight pass first, in upstream's order, so the shifted background is
  // identical when only one pass fires.
  const db = colorDistance(out, black);
  if (db < K) {
    if (db < EPS) out = colorMix(black, white, K / Math.sqrt(3));
    else out = colorMix(black, out, K / db);
  }
  // Then the highlight pass.
  const dw = colorDistance(out, white);
  if (dw < K) {
    if (dw < EPS) out = colorMix(white, black, K / Math.sqrt(3));
    else out = colorMix(white, out, K / dw);
  }
  return out;
}

/**
 * Upstream's `game_mkhighlight`: adjust the background via
 * {@link mkhighlightBackground}, then shift it toward white by K for the
 * highlight and toward black by K for the lowlight. A background still within K
 * of an extreme saturates the highlight to pure white / the lowlight to pure
 * black — which also absorbs the floating-point case where the adjusted
 * background sits a hair inside K of the extreme it was shifted away from.
 *
 * Games wanting the standard bg/highlight/lowlight trio destructure this instead
 * of re-deriving the colors locally; palette index placement stays per-game.
 */
export function mkhighlight(defaultBackground: Color): {
  background: Color;
  highlight: Color;
  lowlight: Color;
} {
  const bg = mkhighlightBackground(defaultBackground);

  const dw = colorDistance(bg, white);
  const highlight: Color = dw < K ? [1, 1, 1] : colorMix(bg, white, K / dw);

  const db = colorDistance(bg, black);
  const lowlight: Color = db < K ? [0, 0, 0] : colorMix(bg, black, K / db);

  return { background: bg, highlight, lowlight };
}

/**
 * **The board every game paints sits at the same tone.** A game's `colors()`
 * is handed the host background already shifted off pure white and pure black
 * by {@link mkhighlightBackground}, and this is the one place that hands it.
 *
 * Upstream shifts the background only in the games that call
 * `game_mkhighlight`; the rest take `frontend_default_colour` as-is. In dark
 * mode, where the frontend hands pure white and the shift always fires, that
 * split put boards at different tones and landed a raw-background game's white
 * flash exactly on its own board. Shifting once here makes the board tone a
 * property of the collection — and a game that calls `mkhighlight` itself gets
 * the identical trio, because the shift is exactly idempotent (a shifted
 * background is exactly K from the extreme, and the shift fires only strictly
 * inside K).
 */
export function resolvePalette(
  game: { colors(defaultBackground: Color): Color[] },
  hostBackground: Color,
): Color[] {
  return game.colors(mkhighlightBackground(hostBackground));
}

/**
 * The shared "this region / area is correctly completed" shade — the local
 * completion feedback a game gives a finished region, not a global solved
 * check. The cell background darkened to 75%, upstream Rectangles'
 * `COL_CORRECT`: a settled gray rather than a per-game hue, so "done and
 * correct" reads the same everywhere. Pass the background the game actually
 * paints its cells with.
 */
export function correctRegionColor(background: Color): Color {
  return [background[0] * 0.75, background[1] * 0.75, background[2] * 0.75];
}

/**
 * Upstream's `game_mkhighlight_specific`: derive a highlight (toward white) and
 * lowlight (toward black) from an **arbitrary base color**, each a distance `K`
 * from the base.
 *
 * Unlike {@link mkhighlight} (which starts from the frontend background and
 * pre-shifts it away from the extremes), this takes a fixed base — e.g. Unruly's
 * near-white and near-black tiles — and, when that base sits within `K` of white
 * or black, **extrapolates the base itself** along the line to the extreme so
 * the highlight/lowlight stay in gamut (saturating to pure white/black). The
 * returned `base` is therefore the possibly-shifted color the caller should
 * paint, exactly as the C writes back into the palette.
 *
 * One subtle C detail is preserved: when the highlight pass shifts the base, the
 * lowlight is recomputed from the new base but using the **original**
 * black-distance `db` (`colour_mix(bg, black, k/db, …)`), not a freshly
 * measured one.
 */
export function mkhighlightSpecific(base: Color): {
  base: Color;
  highlight: Color;
  lowlight: Color;
} {
  const light = mkhighlightSpecificValue(base);
  const darkBase = darkValue(base);
  if (!darkBase) return light;
  // A base that authors its dark value (Unruly's near-black and near-white
  // tiles, which must not invert) hands that decision on to the trio built
  // from it: each member's dark value is the same derivation applied to the
  // dark base. Without this the trio would be three untagged arrays, adapted
  // by calculation, and the pieces would swap colors in dark mode.
  const dark = mkhighlightSpecificValue(darkBase);
  return {
    base: token(light.base, dark.base),
    highlight: token(light.highlight, dark.highlight),
    lowlight: token(light.lowlight, dark.lowlight),
  };
}

function mkhighlightSpecificValue(base: Color): {
  base: Color;
  highlight: Color;
  lowlight: Color;
} {
  let bg: Color = [base[0], base[1], base[2]];
  let lowlight: Color;
  let highlight: Color;

  // Lowlight pass (toward black).
  const db = colorDistance(bg, black);
  if (db < K) {
    lowlight = [0, 0, 0];
    bg =
      db < EPS ? colorMix(black, white, K / Math.sqrt(3)) : colorMix(black, bg, K / db);
  } else {
    lowlight = colorMix(bg, black, K / db);
  }

  // Highlight pass (toward white).
  const dw = colorDistance(bg, white);
  if (dw < K) {
    highlight = [1, 1, 1];
    bg =
      dw < EPS ? colorMix(white, black, K / Math.sqrt(3)) : colorMix(white, bg, K / dw);
    // The base moved; recompute lowlight from it, reusing the original db.
    lowlight = colorMix(bg, black, K / db);
  } else {
    highlight = colorMix(bg, white, K / dw);
  }

  return { base: bg, highlight, lowlight };
}
