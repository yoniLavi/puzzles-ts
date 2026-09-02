/**
 * **Every game paints the same board.** The one place a game's `colors()` is
 * called is `resolvePalette`, which hands it the host background already shifted
 * off the extremes — so whether a port's C called `game_mkhighlight` or took
 * `frontend_default_colour` raw, the index it paints its board with resolves to
 * one tone across the collection.
 *
 * This is measured against **pure white**, because that is what the frontend
 * hands the engine in dark mode and it is the input on which the collection
 * split: the raw-background games painted `#161616` and the `mkhighlight` games
 * `#3c3c3c`, and nothing failed. A light host sits just outside the shift's
 * reach, so a test against it alone would have passed over the defect.
 */
import { describe, expect, it } from "vitest";
import {
  mkhighlightBackground,
  resolvePalette,
} from "../engine/color/color-mkhighlight.ts";
import { getTsGame, registeredGameIds } from "../engine/registry.ts";
import type { Color, PuzzleId } from "../engine/types.ts";
import { oklchToColor } from "../utils/color.ts";
import { puzzleAugmentations } from "./augmentation.ts";
import "../games/index.ts";

/** What `puzzle-view.ts` hands the engine in dark mode. */
const WHITE = oklchToColor([1, 0, 0]);
/** What it hands the engine under the light theme (L 0.87). */
const LIGHT = oklchToColor([0.87, 0, 0]);

/** The board a game is expected to paint for a given host background. */
const board = (host: Color): Color => mkhighlightBackground(host);

function boardOf(id: string, host: Color): Color {
  const game = getTsGame(id);
  if (!game) throw new Error(`${id} is not registered`);
  const index = puzzleAugmentations[id as PuzzleId]?.paletteBgIndex ?? 0;
  const color = resolvePalette(game, host)[index];
  if (!color) throw new Error(`${id} has no color at its board index ${index}`);
  return color;
}

describe("the board every game paints", () => {
  const ids = registeredGameIds();

  it("looks at every registered game", () => {
    expect(ids.length).toBe(57);
  });

  it.each(ids)("%s paints the collection's board tone on a white host", (id) => {
    const expected = board(WHITE);
    const actual = boardOf(id, WHITE);
    for (let c = 0; c < 3; c++) expect(actual[c]).toBeCloseTo(expected[c], 9);
  });

  it.each(ids)("%s paints the collection's board tone on the light host", (id) => {
    const expected = board(LIGHT);
    const actual = boardOf(id, LIGHT);
    for (let c = 0; c < 3; c++) expect(actual[c]).toBeCloseTo(expected[c], 9);
  });

  it("is a real shift on a white host, so the check above is not vacuous", () => {
    // If the shift ever stopped firing on white, both sides of the comparison
    // would be pure white and every game would pass for the wrong reason.
    expect(board(WHITE)[0]).toBeLessThan(0.9);
    expect(board(WHITE)[0]).toBeGreaterThan(0.8);
  });
});
