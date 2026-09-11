/**
 * The dark-scheme pass, and in particular **`paletteSwaps`** — the one part of
 * the pipeline that is hand-maintained, keyed by raw color index, and silent
 * when it is wrong.
 *
 * A swap exists because inverting lightness turns an emboss into an inset: a
 * game built on `game_mkhighlight` draws each surface with a lighter band on the
 * side the light comes from and a darker one opposite, and if every color's
 * lightness inverts, so does the direction of the light. Exchanging each trio's
 * highlight and lowlight puts it back.
 *
 * That is a claim about *roles*, and it is the claim these tests make: whatever
 * the pipeline does to the numbers, a bevel highlight has to stay lighter than
 * the surface it sits on and a lowlight darker, **in both schemes**. A swap
 * naming the wrong index — `[16, 18]` for `[16, 17]`
 * — leaves every test green, every color in the palette, and one game's blocks
 * lit from the wrong side in dark mode only.
 */
import { describe, expect, it } from "vitest";
import {
  mkhighlightBackground,
  resolvePalette,
} from "../engine/color/color-mkhighlight.ts";
import { darkValue } from "../engine/color/color-token.ts";
import { correctRegionColor, lineNoColor } from "../engine/color/palette.ts";
import { getTsGame } from "../engine/registry.ts";
import type { Color, PuzzleId } from "../engine/types.ts";
import {
  colorToOKLCH,
  darkModeColor,
  type OKLCH,
  oklchToColor,
} from "../utils/color.ts";
import { puzzleAugmentations } from "./augmentation.ts";
import { darkModePalette } from "./dark-palette.ts";
import "../games/index.ts";

/** The lightness a dark-mode board background sits at, per `utils/color.ts`. */
const DARK_BG_L = 0.2;
/** What `components/view.ts` hands the engine in dark mode, and why: games derive
 * colors by scaling the background down, so the palette is generated light and
 * inverted afterwards. (`resolvePalette` shifts it off pure white before the
 * game sees it, exactly as the midend does.) */
const DARK_INPUT = oklchToColor([1, 0, 0]);

function schemes(id: PuzzleId): { light: OKLCH[]; dark: OKLCH[] } {
  const game = getTsGame(id);
  if (!game) throw new Error(`${id} is not registered`);
  const rgb = resolvePalette(game, DARK_INPUT);
  const light = rgb.map(colorToOKLCH);
  const authored: Record<number, Color> = {};
  rgb.forEach((c, i) => {
    const d = c && darkValue(c);
    if (d) authored[i] = [...d];
  });
  const { darkMode } = puzzleAugmentations[id] ?? {};
  return { light, dark: darkModePalette(light, darkMode, authored, DARK_BG_L) };
}

/** Every `paletteSwaps` pair in the collection, with its game. */
const PAIRS: [PuzzleId, number, number][] = Object.entries(puzzleAugmentations).flatMap(
  ([id, aug]) =>
    (aug.darkMode?.paletteSwaps ?? []).map(
      ([a, b]) => [id as PuzzleId, a, b] as [PuzzleId, number, number],
    ),
);

describe("dark-mode palette swaps", () => {
  it("finds the swap pairs it means to check", () => {
    // The "how many things did I look at?" guard. Without it a refactor that
    // stopped finding any pair would leave every test below vacuously green.
    expect(PAIRS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PAIRS.map(([id]) => id)).size).toBeGreaterThanOrEqual(3);
  });

  it.each(PAIRS)("%s swaps two real, different colors (%i, %i)", (id, a, b) => {
    // What can be checked without knowing a game's palette LAYOUT. An index past
    // the end of the palette leaves `undefined` in it, which reaches the canvas
    // as a color it silently refuses; a pair naming two equal lightnesses is a
    // swap that does nothing, which means the emboss it was written to fix is
    // still inverted.
    const { light } = schemes(id);
    expect(light[a], `${id}[${a}] is in the palette`).toBeDefined();
    expect(light[b], `${id}[${b}] is in the palette`).toBeDefined();
    expect(Math.abs(light[a][0] - light[b][0])).toBeGreaterThan(0.01);
  });

  it("swaps each index at most once", () => {
    // Two pairs sharing an index apply in list order and the second undoes part
    // of the first, which is never what is meant.
    for (const id of new Set(PAIRS.map(([g]) => g))) {
      const used = PAIRS.filter(([g]) => g === id).flatMap(([, a, b]) => [a, b]);
      expect(new Set(used).size, `${id} names an index twice`).toBe(used.length);
    }
  });

  it("actually exchanges the pair", () => {
    // The mechanism itself, stated once: without it the assertions in the next
    // describe would be testing the calculation and not the swap.
    const [id, a, b] = PAIRS[0];
    const { light } = schemes(id);
    const withSwap = darkModePalette(light, { paletteSwaps: [[a, b]] }, {}, DARK_BG_L);
    const without = darkModePalette(light, {}, {}, DARK_BG_L);
    expect(withSwap[a]).toEqual(without[b]);
    expect(withSwap[b]).toEqual(without[a]);
  });
});

describe("the ruled-out edge", () => {
  it("is discernible, and apart from a finished region, in both schemes", () => {
    // The owner's playtest: on a dark board the ruled-out edge could not be
    // told from no edge, which a keyboard player walking the edges needs most.
    // "Disabled" still has to be seen. Measured in OKLCH lightness against the
    // board every game paints (the host shifted off white) in each scheme,
    // through the same adaptation the app applies. Lives here rather than in
    // the engine's palette test because the dark half needs `utils/color.ts`,
    // which the engine may not import.
    const L = (c: Color) => colorToOKLCH(c)[0];
    const dark = (c: Color) =>
      darkValue(c) ?? oklchToColor(darkModeColor(colorToOKLCH(c), DARK_BG_L));
    for (const host of [[0.827, 0.827, 0.827] as Color, DARK_INPUT]) {
      const board = mkhighlightBackground(host);
      const ruledOut = lineNoColor(board);
      const finished = correctRegionColor(board);
      // Light: a clear step below the board, well above ink.
      expect(L(board) - L(ruledOut)).toBeGreaterThan(0.2);
      expect(L(ruledOut)).toBeGreaterThan(0.4);
      expect(Math.abs(L(ruledOut) - L(finished))).toBeGreaterThan(0.08);
      // Dark: the value the playtest rejected sat 0.08 above the board; this
      // one sits at least twice that, and stays below ink (L 1).
      const darkBoard = L(dark(board));
      expect(L(dark(ruledOut)) - darkBoard).toBeGreaterThan(0.16);
      expect(L(dark(ruledOut))).toBeLessThan(0.85);
      expect(Math.abs(L(dark(ruledOut)) - L(dark(finished)))).toBeGreaterThan(0.08);
    }
  });
});

describe("slide's board", () => {
  /**
   * Slide's palette is `base, highlight, lowlight` per material, five materials
   * deep, and its layout is stated in `slide/render.ts`. That is what makes the
   * bevel assertion below possible here and not in the collection-wide block
   * above: **the invariant is about roles, and an index only names a role once
   * you know the layout.** The other games with swaps state no layout, so they
   * get only the collection-wide checks.
   */
  const TRIOS = [
    ["floor", 0],
    ["dragged block", 3],
    ["key block", 6],
    ["dragged key block", 9],
    ["wall", 15],
    ["ordinary block", 18],
  ] as const;

  it.each(
    TRIOS,
  )("lights the %s's bevel from one side in both schemes", (_what, base) => {
    const { light, dark } = schemes("slide");
    for (const [scheme, palette] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      const [b, h, l] = [palette[base][0], palette[base + 1][0], palette[base + 2][0]];
      expect(h, `${scheme}: highlight above base`).toBeGreaterThan(b);
      expect(l, `${scheme}: lowlight below base`).toBeLessThan(b);
    }
  });

  it("keeps the four materials' ladder in both schemes", () => {
    // The floor, an ordinary block and the wall are three steps apart, and the
    // exit stays the most prominent thing on the board. In a dark scheme every
    // step reverses — that IS the rule preserving the relationship, not a
    // violation of it — so the assertion is on the *ordering*, in each scheme's
    // own direction.
    const { light, dark } = schemes("slide");
    const [FLOOR, MAIN, TARGET, WALL, BLOCK] = [0, 6, 12, 15, 18];

    // Light: exit palest, then floor, then block, then wall.
    for (const [a, b] of [
      [TARGET, FLOOR],
      [FLOOR, BLOCK],
      [BLOCK, WALL],
    ] as const) {
      expect(light[a][0], `light ${a} vs ${b}`).toBeGreaterThan(light[b][0] + 0.04);
    }
    // Dark: the same ladder, upside down.
    for (const [a, b] of [
      [TARGET, FLOOR],
      [FLOOR, BLOCK],
      [BLOCK, WALL],
    ] as const) {
      expect(dark[a][0], `dark ${a} vs ${b}`).toBeLessThan(dark[b][0] - 0.04);
    }

    // And the key block carries hue where the two neutrals do not, which is what
    // keeps it findable at a glance whichever end of the ladder it sits at.
    expect(light[MAIN][1]).toBeGreaterThan(0.05);
    expect(dark[MAIN][1]).toBeGreaterThan(0.05);
    expect(light[WALL][1]).toBeLessThan(0.01);
    expect(light[BLOCK][1]).toBeLessThan(0.01);
  });
});
