/**
 * Dark-mode adaptation: the rule is that a colour keeps its RELATIONSHIP TO THE
 * BACKGROUND across the scheme flip.
 *
 * These are not "the numbers happen to be these" snapshots — each asserts the
 * property the rule exists to provide, so they stay meaningful if the constants
 * are retuned. The regression they guard is real and was measured: before
 * `hand-author-dark-palette`, chromatic colours were compressed into a fixed
 * lightness band with no reference to the background, and 150 colours across 45
 * of the 57 games turned from a subtle tint of the board into a bright patch on
 * it (Slide's target zone was the reported symptom).
 */
import { describe, expect, it } from "vitest";
import { colourToOKLCH, darkModeColor, type OKLCH, oklchToCSSColor } from "./color.ts";

/** The lightness a dark-mode board background sits at. */
const BGL = 0.2;

/** Light-mode lightness of the game background these colours are drawn on. */
const LIGHT_BG = 0.827;

const dark = (lch: OKLCH): OKLCH => darkModeColor(lch, BGL);
const darkL = (lch: OKLCH): number => dark(lch)[0];

/** A green hue, so these are chromatic and take the chromatic path. */
const GREEN = 145;

describe("dark-mode adaptation preserves the relationship to the background", () => {
  it("keeps a near-background tint near the background", () => {
    // Slide's target zone: `mkhighlightSpecific([bg, highlight, bg])`, a floor
    // tint 0.089 from the background in light mode. It must not become a patch.
    const tint: OKLCH = [0.916, 0.072, GREEN];
    const distanceInDark = Math.abs(darkL(tint) - BGL);
    expect(distanceInDark).toBeLessThan(0.2);
  });

  it("keeps a bold mark bold", () => {
    // The counterpart: something far from the background must not be flattened
    // into it, or the fix would have traded one failure for its mirror image.
    const mark: OKLCH = [0.63, 0.24, 29]; // the error red
    expect(Math.abs(darkL(mark) - BGL)).toBeGreaterThan(0.2);
  });

  it("sends text light and large fills dark, not the other way round", () => {
    // The ordering that the previous rule got backwards: it squashed text and
    // fills into a 0.23-wide band with TEXT DARKER THAN THE FILLS it sits on.
    // Dark text on a dark fill is the unreadable case, so pin the order.
    const text: OKLCH = [0.35, 0.13, 264]; // ABCD's border letters
    const thinLine: OKLCH = [0.45, 0.06, 264]; // Solo's killer-cage outline
    const largeFill: OKLCH = [0.87, 0.29, GREEN]; // a Flood tile

    expect(darkL(text)).toBeGreaterThan(darkL(largeFill));
    expect(darkL(thinLine)).toBeGreaterThan(darkL(largeFill));
    // ...and the text is genuinely legible against the board, not merely ahead
    // of the fill.
    expect(darkL(text) - BGL).toBeGreaterThan(0.4);
  });

  it("treats a chromatic colour the same way it treats a grey", () => {
    // The actual defect was the SPLIT: greys went through an
    // inversion relative to the background, chromatic colours through a
    // background-blind compression. Same lightness in must give same lightness
    // out, whatever the chroma.
    const l = 0.9;
    const grey: OKLCH = [l, 0, 0];
    const chromatic: OKLCH = [l, 0.1, GREEN];
    expect(darkL(chromatic)).toBeCloseTo(darkL(grey), 5);
  });

  it("preserves hue, and keeps chroma out of neon territory", () => {
    const colour: OKLCH = [0.6, 0.2, GREEN];
    const [, c, h] = dark(colour);
    expect(h).toBe(GREEN);
    expect(c).toBeLessThanOrEqual(0.25);
  });

  it("never returns a colour darker than the background", () => {
    // bgl is the floor: a colour below it would be invisible on the board.
    for (const l of [0, 0.25, 0.5, 0.75, 1]) {
      expect(darkL([l, 0.15, GREEN])).toBeGreaterThanOrEqual(BGL);
      expect(darkL([l, 0, 0])).toBeGreaterThanOrEqual(BGL);
    }
  });

  it("is monotonic: lighter in light mode means darker in dark mode", () => {
    // What makes the rule a *relationship* rather than a lookup — the palette's
    // internal ordering survives, inverted, so a game's composition holds up.
    const ls = [0.2, 0.4, 0.6, 0.8, 1.0];
    const out = ls.map((l) => darkL([l, 0.12, GREEN]));
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeLessThanOrEqual(out[i - 1]);
    }
  });

  it("puts a light-mode background-coloured cell at the dark background", () => {
    // The game is handed pure white in dark mode, so its own background arrives
    // as L=1 and must come back as the board colour itself.
    expect(darkL([1, 0, 0])).toBeCloseTo(BGL, 5);
    void LIGHT_BG;
  });

  it("adapts a pure white that came through the sRGB conversion", () => {
    // The case above hand-writes `[1, 0, 0]`, and a hand-written 1 is not the
    // number production supplies: a palette entry is an RGB triple, and
    // `colourToOKLCH([1, 1, 1])` returns 1.0000000000000002 — float drift in
    // the OKLab round trip. `1 - l` is then a hair *below* zero, and the
    // fractional `boost` power of a negative base is NaN, which serialises to
    // `oklch(NaN% 0 0)` and is then rejected by the canvas SILENTLY (the
    // previous fillStyle stays, so the shape paints in the wrong colour with
    // nothing logged). 57 palette entries across 42 games were resolving that
    // way. Driving the conversion rather than a literal is the whole point of
    // this test — the assertion above is identical and cannot fail.
    const white = colourToOKLCH([1, 1, 1]);
    expect(white[0]).toBeGreaterThan(1); // the drift is real; if it stops being
    // real this test still holds, but the one above stops being redundant.
    expect(darkL(white)).toBeCloseTo(BGL, 5);
    expect(String(oklchToCSSColor(dark(white)))).not.toContain("NaN");
  });

  it("yields a resolvable CSS colour for every reachable lightness", () => {
    // The general form: no input a palette can hold may produce a colour string
    // a canvas will refuse. Sweeping the sRGB extremes and their neighbourhood
    // is cheap and covers the drift band on both sides of both endpoints.
    for (const v of [0, 1e-12, 0.001, 0.5, 0.999, 1 - 1e-12, 1]) {
      for (const rgb of [
        [v, v, v],
        [v, 0, 0],
        [1, 1, v],
      ] as const) {
        const css = String(oklchToCSSColor(dark(colourToOKLCH([...rgb]))));
        expect(css, `rgb ${rgb.join(",")}`).not.toContain("NaN");
      }
    }
  });
});
