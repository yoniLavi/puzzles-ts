import { describe, expect, it } from "vitest";
import type { Colour } from "../../puzzle/types.ts";
import {
  mkhighlight,
  mkhighlightBackground,
  mkhighlightSpecific,
} from "./colour-mkhighlight.ts";

/**
 * The exact inline derivation Pegs and Sixteen carried before the
 * consolidation into `mkhighlight`. Its dw/db >= K branches match
 * upstream `misc.c` `game_mkhighlight_specific`; its < K fallbacks
 * were a bug (they produced the adjusted background instead of
 * upstream's pure white / pure black saturation), which is why the
 * shared helper must only match it on the correct branches.
 */
function previousInlineDerivation(defaultBackground: Colour): {
  background: Colour;
  highlight: Colour;
  lowlight: Colour;
} {
  const bg = mkhighlightBackground(defaultBackground);
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

  const dw = colourDistance(bg, white);
  const highlight: Colour =
    dw < K ? colourMix(white, black, K / Math.sqrt(3)) : colourMix(bg, white, K / dw);

  const db = colourDistance(bg, black);
  const lowlight: Colour =
    db < K ? colourMix(black, white, K / Math.sqrt(3)) : colourMix(bg, black, K / db);

  return { background: bg, highlight, lowlight };
}

/** Backgrounds far enough from both extremes that the old inline code
 * took its correct (upstream-matching) branches. */
const MID_RANGE_BACKGROUNDS: [string, Colour][] = [
  ["mid grey", [0.5, 0.5, 0.5]],
  ["typical dark host background", [0.13, 0.14, 0.16]],
  ["saturated colour", [0.2, 0.4, 0.8]],
];

/** Backgrounds whose adjusted form sits at (or a hair inside) K of an
 * extreme, where the old inline fallback was buggy. */
const EXTREME_BACKGROUNDS: [string, Colour][] = [
  ["pure white", [1, 1, 1]],
  ["near-white with IEEE drift", [1 - 1e-15, 1, 1]],
  ["typical light host background", [0.9, 0.9, 0.92]],
  ["pure black", [0, 0, 0]],
];

const ALL_BACKGROUNDS = [...MID_RANGE_BACKGROUNDS, ...EXTREME_BACKGROUNDS];

describe("mkhighlight", () => {
  it.each(
    MID_RANGE_BACKGROUNDS,
  )("matches the previous per-game inline derivation on %s", (_name, bg) => {
    const got = mkhighlight(bg);
    const want = previousInlineDerivation(bg);
    expect(got.background).toEqual(want.background);
    expect(got.highlight).toEqual(want.highlight);
    expect(got.lowlight).toEqual(want.lowlight);
  });

  it.each(
    ALL_BACKGROUNDS,
  )("keeps the background equal to mkhighlightBackground on %s", (_name, bg) => {
    expect(mkhighlight(bg).background).toEqual(mkhighlightBackground(bg));
  });

  it("saturates the highlight to pure white on light backgrounds (upstream misc.c)", () => {
    for (const [, bg] of [
      ["pure white", [1, 1, 1]],
      ["typical light host background", [0.9, 0.9, 0.92]],
    ] as [string, Colour][]) {
      expect(mkhighlight(bg).highlight).toEqual([1, 1, 1]);
    }
  });

  it("saturates the lowlight to pure black on a pure-black background (upstream misc.c)", () => {
    const { lowlight } = mkhighlight([0, 0, 0]);
    expect(lowlight[0]).toBeCloseTo(0, 12);
    expect(lowlight[1]).toBeCloseTo(0, 12);
    expect(lowlight[2]).toBeCloseTo(0, 12);
  });

  it.each(
    ALL_BACKGROUNDS,
  )("keeps highlight brighter and lowlight darker than the background on %s", (_name, bg) => {
    const { background, highlight, lowlight } = mkhighlight(bg);
    const luma = (c: Colour) => c[0] + c[1] + c[2];
    expect(luma(highlight)).toBeGreaterThan(luma(background));
    expect(luma(lowlight)).toBeLessThan(luma(background));
  });

  it.each(ALL_BACKGROUNDS)("stays in gamut on %s", (_name, bg) => {
    const { background, highlight, lowlight } = mkhighlight(bg);
    for (const c of [background, highlight, lowlight]) {
      for (const channel of c) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("mkhighlightSpecific", () => {
  // Unruly's two fixed bases: near-white COL_0 (0.95 grey) and dark COL_1
  // (0.2 grey). The near-white base is the case the existing mkhighlight
  // helper can't reproduce — it must shift the base itself.
  const COL_0: Colour = [0.95, 0.95, 0.95];
  const COL_1: Colour = [0.2, 0.2, 0.2];

  it("extrapolates a near-white base away from white and saturates the highlight", () => {
    const { base, highlight } = mkhighlightSpecific(COL_0);
    // Highlight saturates to pure white (the base was within K of white).
    expect(highlight).toEqual([1, 1, 1]);
    // The base is pushed darker so highlight/lowlight stay in gamut.
    expect(base[0]).toBeLessThan(COL_0[0]);
    expect(base[0]).toBeCloseTo(1 - Math.sqrt(3) / 6 / Math.sqrt(3), 6);
  });

  it("does not shift a base comfortably inside the gamut (dark COL_1)", () => {
    const { base, highlight, lowlight } = mkhighlightSpecific(COL_1);
    expect(base).toEqual(COL_1);
    const luma = (c: Colour) => c[0] + c[1] + c[2];
    expect(luma(highlight)).toBeGreaterThan(luma(base));
    expect(luma(lowlight)).toBeLessThan(luma(base));
  });

  it.each([
    ["near-white", COL_0],
    ["dark", COL_1],
    ["mid grey", [0.5, 0.5, 0.5] as Colour],
  ])("stays in gamut for the %s base", (_name, base) => {
    const r = mkhighlightSpecific(base);
    for (const c of [r.base, r.highlight, r.lowlight]) {
      for (const channel of c) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });

  it("equals mkhighlight on a mid-grey base modulo the base-vs-background shift", () => {
    // For a mid-grey base neither pass shifts, so specific's highlight/lowlight
    // match mkhighlight's (which also doesn't shift mid grey).
    const grey: Colour = [0.5, 0.5, 0.5];
    const spec = mkhighlightSpecific(grey);
    const full = mkhighlight(grey);
    expect(spec.base).toEqual(grey);
    expect(spec.highlight).toEqual(full.highlight);
    expect(spec.lowlight).toEqual(full.lowlight);
  });
});
