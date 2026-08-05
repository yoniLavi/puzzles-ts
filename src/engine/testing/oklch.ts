/**
 * OKLCH conversion for the engine's colour tests — deliberately a *different*
 * implementation from the one under test.
 *
 * `colours.ts` inlines the OKLab→sRGB matrices rather than importing a colour
 * library, because it is reached from the puzzle worker and a library in that
 * chunk is a bundle cost every game pays. That is only safe while the inlined
 * maths and a real library agree, so `colours.test.ts` pins it — and the pin is
 * worth nothing if both sides come from the same code.
 *
 * That independence is also why this is a private copy rather than a re-export
 * of `src/utils/color.ts`, which offers the same two helpers to the app's
 * dark-mode adaptation. They are both four-line wrappers of colorjs.io, and
 * keeping them separate means a threshold retuned for a UI reason cannot
 * silently change what the engine's colour tests assert. (The other half of the
 * reason: the engine imports nothing above it — `module-layering.test.ts`.)
 *
 * **Test-only.** Nothing under `engine/` or `games/` may import this in
 * production code; that is what `testing/` means here.
 */
import {
  ColorSpace,
  to as convert,
  OKLCH as OKLCHspace,
  sRGB as sRGBspace,
} from "colorjs.io/fn";
import type { Colour } from "../types.ts";

ColorSpace.register(OKLCHspace);
ColorSpace.register(sRGBspace);

/**
 * OKLCh coordinates: lightness in [0, 1], chroma in [0, 1] (typically 0–0.4),
 * hue in [0, 360] — or NaN for an achromatic colour, which is why any distance
 * measured in this space has to pass its chroma through {@link isGrayChroma}
 * first.
 */
export type OKLCH = [l: number, c: number, h: number];

/**
 * colorjs.io 0.7 widened its `Coords` to `[number | null, …]` for CSS Color 4
 * *missing* components (the `none` in `oklch(0.5 none 0)`). Nothing here parses
 * CSS — the input is always an sRGB triple this repo supplies — so the null arm
 * is not reachable from this module; it is coerced rather than asserted so that
 * a future caller who does parse CSS gets CSS's own answer (a missing component
 * is 0) instead of a crash. Deliberately duplicated from `src/utils/color.ts`
 * rather than shared, for the independence reason in the header above.
 */
const coords3 = (c: readonly (number | null)[]): [number, number, number] => [
  c[0] ?? 0,
  c[1] ?? 0,
  c[2] ?? 0,
];

export const colourToOKLCH = (rgb: Colour): OKLCH =>
  coords3(convert({ space: sRGBspace, coords: rgb }, OKLCHspace).coords);

/** Below this chroma a colour has no meaningful hue, and NaN hues appear. */
export const isGrayChroma = (c: number) => c < 0.01;
