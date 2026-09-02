/**
 * **A game's palette, adapted to a dark scheme** — the three-step rule
 * `puzzle-view.ts` used to apply inline.
 *
 * It is a module rather than a block inside the component for one reason: it was
 * previously impossible to test, so a second copy of it grew in
 * `scripts/checks/color-dark-check.test.ts` carrying the comment *"Keep in step
 * with it"*. A rule maintained in two places by hand is a rule with no owner, and
 * the parts of it that are hand-maintained — `paletteOverrides` and
 * `paletteSwaps`, both keyed by **color index** — are exactly the parts whose
 * failure mode is silent: the game renders correctly in one scheme and
 * incorrectly in the other, with nothing failing (`ts-engine`, "A game's palette
 * index order is stable").
 */

import type { Color } from "../engine/types.ts";
import { colorToOKLCH, darkModeColor, type OKLCH } from "../utils/color.ts";
import { clamp } from "../utils/math.ts";
import type { PuzzleAugmentations } from "./augmentation.ts";

/**
 * Adapt `palette` (the light-mode palette the game produced, in OKLCH) to a dark
 * scheme sitting at background lightness `backgroundLightness`.
 *
 * Three ways an index can get its dark-mode color, most specific first:
 *
 * 1. a per-puzzle entry in `augmentation.ts` — a fixed OKLCH color, a lightness
 *    nudge, or `false` for "leave the light value alone";
 * 2. the **authored** dark value of the token the game used, which the engine
 *    reports per index in sRGB (`authoredDark`) because a token's scheme values
 *    cannot cross the worker boundary attached to the color;
 * 3. otherwise, calculation — `darkModeColor`, which is what every color did
 *    before the token table existed and what every token that has not been given
 *    a dark value still does.
 *
 * A per-puzzle entry wins over an authored one because it is the more specific
 * statement: a game that wants its black *lifted* rather than preserved (Light
 * Up's wall) says so there. A lightness nudge is the one that composes — it
 * scales whichever color the first two steps produced.
 *
 * The swaps run **last**, after every index has its value. They exist because
 * inverting lightness turns an emboss into an inset, so a game built on
 * `game_mkhighlight` exchanges each trio's highlight and lowlight to keep the
 * light coming from the same direction. That means an index does **not** denote
 * the same role in both schemes, which is worth knowing before comparing one
 * index's two values to each other.
 */
export function darkModePalette(
  palette: readonly OKLCH[],
  darkMode: PuzzleAugmentations["darkMode"],
  authoredDark: Record<number, Color>,
  backgroundLightness: number,
): OKLCH[] {
  const out = palette.map(([l, c, h], i): OKLCH => {
    const override = darkMode?.paletteOverrides?.[i];
    if (Array.isArray(override)) return [...override];
    if (override === false) return [l, c, h];

    const authored = authoredDark[i];
    let [nl, nc, nh] = authored
      ? colorToOKLCH(authored)
      : darkModeColor([l, c, h], backgroundLightness);
    if (typeof override === "number") {
      nl *= override;
      if (nl < 0) nl = backgroundLightness - nl;
      nl = clamp(0, nl, 1);
    }
    return [nl, nc, nh];
  });

  for (const [a, b] of darkMode?.paletteSwaps ?? []) {
    [out[a], out[b]] = [out[b], out[a]];
  }
  return out;
}
