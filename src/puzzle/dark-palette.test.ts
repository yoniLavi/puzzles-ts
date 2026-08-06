/**
 * The dark-scheme pass, and in particular **`paletteSwaps`** — the one part of
 * the pipeline that is hand-maintained, keyed by raw colour index, and silent
 * when it is wrong.
 *
 * A swap exists because inverting lightness turns an emboss into an inset: a
 * game built on `game_mkhighlight` draws each surface with a lighter band on the
 * side the light comes from and a darker one opposite, and if every colour's
 * lightness inverts, so does the direction of the light. Exchanging each trio's
 * highlight and lowlight puts it back.
 *
 * That is a claim about *roles*, and it is the claim these tests make: whatever
 * the pipeline does to the numbers, a bevel highlight has to stay lighter than
 * the surface it sits on and a lowlight darker, **in both schemes**. Nothing
 * asserted it before. A swap naming the wrong index — `[16, 18]` for `[16, 17]`
 * — leaves every test green, every colour in the palette, and one game's blocks
 * lit from the wrong side in dark mode only.
 */
import { describe, expect, it } from "vitest";
import { darkValue } from "../engine/colour/colour-token.ts";
import { getTsGame } from "../engine/registry.ts";
import type { Colour, PuzzleId } from "../engine/types.ts";
import { colourToOKLCH, type OKLCH, oklchToColour } from "../utils/color.ts";
import { puzzleAugmentations } from "./augmentation.ts";
import { darkModePalette } from "./dark-palette.ts";
import "../games/index.ts";

/** The lightness a dark-mode board background sits at, per `utils/color.ts`. */
const DARK_BG_L = 0.2;
/** What `puzzle-view.ts` hands a game in dark mode, and why: games derive
 * colours by scaling the background down, so the palette is generated light and
 * inverted afterwards. */
const DARK_INPUT = oklchToColour([1, 0, 0]);

function schemes(id: PuzzleId): { light: OKLCH[]; dark: OKLCH[] } {
  const game = getTsGame(id);
  if (!game) throw new Error(`${id} is not registered`);
  const rgb = game.colours(DARK_INPUT);
  const light = rgb.map(colourToOKLCH);
  const authored: Record<number, Colour> = {};
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

  it.each(PAIRS)("%s swaps two real, different colours (%i, %i)", (id, a, b) => {
    // What can be checked without knowing a game's palette LAYOUT. An index past
    // the end of the palette leaves `undefined` in it, which reaches the canvas
    // as a colour it silently refuses; a pair naming two equal lightnesses is a
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

describe("slide's board", () => {
  /**
   * Slide's palette is `base, highlight, lowlight` per material, five materials
   * deep, and its layout is stated in `slide/render.ts`. That is what makes the
   * bevel assertion below possible here and not in the collection-wide block
   * above: **the invariant is about roles, and an index only names a role once
   * you know the layout.** Establishing that for the other two games with swaps
   * is worth doing and is not this change's job.
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
