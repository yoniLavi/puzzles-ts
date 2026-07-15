/**
 * The collection-wide touch guard.
 *
 * A press from a finger or a pen reaches the engine with `MOD_STYLUS` set
 * (`puzzle-view-interactive.ts` ORs it in for `pointerType` "touch"/"pen").
 * Upstream hands that bit to the game and expects every game to remember to
 * strip it. Nine of our ports did not, and shipped **completely deaf to touch**:
 * a plain `button === LEFT_BUTTON` test simply never matched. It fails silently,
 * and only on a device no test suite uses, so it went unnoticed in Flip,
 * Galaxies, Pegs, Blackbox, Dominosa, Guess, Signpost, Untangle and Inertia. The
 * midend now strips the bit for every game that has not asked for it
 * (`Game.wantsStylusModifier`).
 *
 * This is the guard: for every registered game, a touch press must do exactly
 * what the same press from a mouse does. It runs against the real registry
 * through a real `Midend`, so a newly-ported game is covered the day it is
 * registered, without anybody having to remember this test exists.
 */

import { beforeAll, describe, expect, it } from "vitest";
// Registers every ported game; `beforeAll` re-runs it in case a sibling
// file reset the shared registry under `isolate: false`.
import { registerAllGames } from "../games/index.ts";
import { TS_PORTED_PUZZLE_IDS } from "../games/ts-ported-ids.ts";
import { randomNew } from "../random/index.ts";
import type { Game } from "./game.ts";
import { Midend } from "./midend.ts";
import { LEFT_BUTTON, MOD_STYLUS, RIGHT_BUTTON } from "./pointer.ts";
import { getTsGame } from "./registry.ts";

type AnyGame = Game<unknown, unknown, unknown, unknown, unknown>;

beforeAll(registerAllGames);

/** What a single press does to a fresh board: was it consumed, and what did it
 * leave behind. Going through a real `Midend` is the point — the modifier
 * handling under test lives there. */
function press(
  game: AnyGame,
  id: string,
  button: number,
  point: { x: number; y: number },
): { consumed: boolean; board: string | undefined } {
  const m = new Midend(game);
  m.setCallbacks(
    () => {},
    () => {},
    () => {},
  );
  m.newGameFromId(id);
  const consumed = m.processInput(point.x, point.y, button);
  // Compare the *effect* of the press, not merely whether it was swallowed.
  return { consumed, board: game.canFormatAsText ? m.formatAsText() : undefined };
}

describe("touch input reaches every ported game", () => {
  for (const id of TS_PORTED_PUZZLE_IDS) {
    const game = getTsGame(id);
    if (!game) continue;

    it(`${id}: a touch press does what a mouse press does`, () => {
      if (game.wantsStylusModifier) {
        // Opted in: this game gives touch its own behaviour on purpose (Pattern
        // cycles a cell's state, having no right button to cycle with), so the
        // two are *meant* to differ. Nothing to compare.
        return;
      }

      // Build the board once and drive every probe from it by desc, so this
      // sweep doesn't re-run an expensive generator hundreds of times.
      const params = game.defaultParams();
      const desc = game.newDesc(params, randomNew(`touch-${id}`)).desc;
      const gameId = `${game.encodeParams(params, true)}:${desc}`;

      // Sweep the actual board rather than guessing where this game's live
      // targets are. The guarantee is that *wherever* a mouse press does
      // something, the same touch press does the same thing — and a coarse grid
      // is not enough: Untangle's vertices sit at arbitrary points, and an
      // earlier cut of this test sailed straight past it by never hitting one.
      const size = game.computeSize(params, game.preferredTileSize ?? 32);
      const step = Math.max(4, Math.floor(Math.min(size.w, size.h) / 12));
      let sawAnyMouseInput = false;

      for (const button of [LEFT_BUTTON, RIGHT_BUTTON]) {
        for (let x = 2; x < size.w; x += step) {
          for (let y = 2; y < size.h; y += step) {
            const point = { x, y };
            const mouse = press(game, gameId, button, point);
            const touch = press(game, gameId, button | MOD_STYLUS, point);
            expect(touch).toEqual(mouse);
            if (mouse.consumed) sawAnyMouseInput = true;
          }
        }
      }

      // Guard the guard: a game whose every probe fell on dead space would pass
      // the comparison above vacuously.
      expect(sawAnyMouseInput).toBe(true);
    });
  }

  it("the registry is populated, so the sweep above is not vacuous", () => {
    expect(TS_PORTED_PUZZLE_IDS.size).toBeGreaterThan(25);
  });
});
