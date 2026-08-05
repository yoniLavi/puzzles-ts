import {
  ColorSpace,
  to as convert,
  display,
  OKLCH as OKLCHspace,
  parse,
  sRGB as sRGBspace,
} from "colorjs.io/fn";
import type { Colour } from "../engine/types.ts";
import { clamp } from "./math.ts";

// Register color spaces for parse() function.
// Must include anything used by our design tokens, plus sRGB just in case.
ColorSpace.register(OKLCHspace);
ColorSpace.register(sRGBspace);

// A "Colour" (from the C puzzle code) is an [r, g, b] triplet
// with each component in the range [0, 1] (in sRGB space).

/**
 * OKLch color space coords:
 * - lightness in [0, 1]
 * - chroma in [0, 1], but typically 0-0.4
 * - hue in [0, 360], or NaN for achromatic
 */
export type OKLCH = [l: number, c: number, h: number];

/**
 * colorjs.io 0.7 widened its `Coords` to `[number | null, …]` to carry CSS
 * Color 4 *missing* components — the `none` in `oklch(0.5 none 0)`. CSS
 * resolves a missing component to 0 wherever it is used as a number, so that
 * is the coercion here: it keeps the tuple total without inventing a value.
 * Reachable only through {@link cssColorToOKLCH}, whose input is an arbitrary
 * CSS string; the two conversions below start from coords we supply.
 */
const coords3 = (c: readonly (number | null)[]): [number, number, number] => [
  c[0] ?? 0,
  c[1] ?? 0,
  c[2] ?? 0,
];

export const colourToOKLCH = (rgb: Colour): OKLCH =>
  coords3(convert({ space: sRGBspace, coords: rgb }, OKLCHspace).coords);

export const oklchToColour = (lch: OKLCH): Colour =>
  coords3(convert({ space: OKLCHspace, coords: lch }, sRGBspace).coords);

export const cssColorToOKLCH = (cssColor: string): OKLCH =>
  coords3(convert(parse(cssColor), OKLCHspace).coords);

export const oklchToCSSColor = (lch: OKLCH): string =>
  // display() returns the best CSS <color> string this browser can handle.
  display({ space: OKLCHspace, coords: lch });

export const isGrayChroma = (c: number) => c < 0.01;

/**
 * Compresses lightness l [0, 1] to fit within [floor, 1 - headroom],
 * with optional boost to expand lightness difference at the low end.
 */
const compressLightness = (
  l: number,
  options?: { floor?: number; headroom?: number; boost?: number },
) => {
  const { floor = 0, headroom = 0, boost = 1 } = options ?? {};
  const compressedL = floor + l ** boost * (1 - floor - headroom);
  return clamp(0, compressedL, 1);
};

/**
 * "Invert" a color from a light-mode color palette to a dark one.
 * bgl is the background lightness in the dark mode palette, and is the
 * minimum lightness that will be returned. (Ideally, bgl should be at least
 * the display's black level floor. In practice, our dark-mode palettes tend
 * to use an off-black background somewhere around bgl=0.18, which is above
 * the floor for most displays and ambient lighting conditions.)
 */
function invertLightness([l, c, h]: OKLCH, bgl: number): OKLCH {
  return [compressLightness(1 - l, { floor: bgl, boost: 0.8 }), c, h];
}

/**
 * Adjusts chromatic colors for dark mode: invert lightness exactly as a gray is
 * inverted, then restore the apparent colorfulness that inverting costs.
 *
 * WHY INVERT RATHER THAN COMPRESS. This used to compress lightness into a fixed
 * band (`[bgl + 0.15, 0.8]`) without reference to the background at all, while
 * grays went through {@link invertLightness}, which is relative to it. A color
 * that was a subtle tint OF THE BOARD therefore became a bright patch ON it: in
 * Slide, the floor inverted to L 0.20 while the "slightly green floor" compressed
 * to L 0.78 — two colors 0.089 apart in light mode landing 0.427 apart in dark.
 * Measured across the collection, 150 colors in 45 of 57 games broke that way,
 * every one in the same direction.
 *
 * The old comment here said the compression was a compromise between colors used
 * as text (which want lightness) and colors used as fills (which want darkness),
 * and that "knowing the intended use of the color could improve the results
 * significantly". It turns out the intended use does not have to be known,
 * because THE LIGHT PALETTE ALREADY ENCODES IT IN THE LIGHTNESS: text and thin
 * lines are dark on light paper, large fills are pale on it. Inverting therefore
 * sends text light and fills dark, which is the right answer for both from one
 * rule. Against a 0.2 background:
 *
 * | color                          | light L | old L | new L |
 * | ------------------------------ | ------- | ----- | ----- |
 * | Slide target zone (large fill) |    0.92 | 0.769 | 0.310 |
 * | Flood tile (large fill)        |    0.87 | 0.753 | 0.356 |
 * | error red (mark)               |    0.63 | 0.661 | 0.561 |
 * | Solo killer outline (thin)     |    0.45 | 0.588 | 0.696 |
 * | ABCD border letters (text)     |    0.35 | 0.544 | 0.767 |
 *
 * The old rule squashed all five into 0.54–0.77 — text and giant fills within
 * 0.23 of each other, with text DARKER than the fills it is drawn on. This one
 * spreads them and puts them in the right order.
 *
 * This is now the FALLBACK, for colors that are a game's own. A color that comes
 * from a shared role in `engine/colour/palette.ts` carries an authored value per
 * scheme and never reaches here — see `hand-author-dark-palette`.
 */
function adjustChromatic([l, c, h]: OKLCH, bgl: number): OKLCH {
  const [invertedL] = invertLightness([l, c, h], bgl);

  // Hunt Effect / Helmholtz-Kohlrausch compensation:
  // At lower luminance, colors appear less colorful. Boost the chroma
  // of darker colors so they remain distinct and don't fade to gray.
  const boostC = 1 + 0.5 * (1 - invertedL);
  let adjustedC = c * boostC;

  // Glare prevention:
  // High lightness + high chroma on dark backgrounds causes "neon" glare.
  // Clamp chroma strictly for light colors, but allow more for dark colors.
  const maxChroma = 0.25 - 0.15 * invertedL;
  adjustedC = clamp(0, adjustedC, maxChroma);

  return [invertedL, adjustedC, h];
}

/**
 * Converts a light-mode puzzle palette color to dark mode:
 * - Grays are assumed to be backgrounds, text, gridlines, or similar UI.
 *   Their lightness is inverted and mapped to [bgl, 1] with a bit of a curve.
 * - Colors are assumed to be semantic (e.g., red errors, yellow lights)
 *   or large filled regions, and are adjusted to be less bright.
 *
 * While this logic works for many puzzle palette colors, it's not perfect.
 * Puzzle-specific overrides will be needed for, e.g.:
 * - Blacks and whites that should not be inverted (e.g., "black pegs" in Guess)
 * - Grays that are used in 3D effects
 */
export const darkModeColor = (lch: OKLCH, bgl: number): OKLCH =>
  isGrayChroma(lch[1]) ? invertLightness(lch, bgl) : adjustChromatic(lch, bgl);

/**
 * If lch is a gray color, apply the hue of the tint color to it,
 * adjusting chroma to approximate the tint color's own "colorfulness".
 * If lch is not a gray color, return it unchanged.
 */
export function tintGrays(lch: OKLCH, tint: OKLCH): OKLCH {
  let [l, c, h] = lch;
  if (isGrayChroma(c)) {
    // Hunt Effect compensation (see above).
    const k = 0.5;
    const epsilon = 0.05;
    const [tl, tc, th] = tint;
    c = tc * (tl / (l + epsilon)) ** k;
    h = th;
  }
  return [l, c, h];
}
