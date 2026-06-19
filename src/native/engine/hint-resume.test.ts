/**
 * Cross-game guarantee: a hint can always make progress from *any* mid-game
 * position, and following hints solves the board.
 *
 * This is the uniform "solve from the middle" check, applied to every
 * hint-bearing game through the shared `Game` interface. It exists because two
 * games shipped a real bug of the same shape — a hint that gives up (or loops)
 * when asked from a position the player reached by their own play, even though
 * the board is still solvable:
 *
 *  - **Singles** — its deductive `solveSpecific` only ran from an empty board
 *    (upstream's sole use); resumed from the player's marks, the cascade never
 *    propagated from those marks and the solver stalled ("No further move").
 *  - **Untangle** — its aux-walk re-suggested a no-op move forever once a
 *    vertex sat on its (jittering) target pixel.
 *
 * The probe drives the importable scenario both bugs travelled: ask for a fresh
 * hint, apply only its first step, repeat. (In the app, a self-played move
 * drops any stored plan, so the next hint recomputes from the current state —
 * exactly this.) Recomputing every step exercises resumption from many
 * arbitrary partial positions; a correct hint must never give up before solved.
 */
import { describe, expect, it } from "vitest";
import { fillingGame } from "../games/filling/index.ts";
import { fifteenGame } from "../games/fifteen/index.ts";
import { floodGame } from "../games/flood/index.ts";
import { palisadeGame } from "../games/palisade/index.ts";
import { rangeGame } from "../games/range/index.ts";
import { singlesGame } from "../games/singles/index.ts";
import { sixteenGame } from "../games/sixteen/index.ts";
import { unrulyGame } from "../games/unruly/index.ts";
import { untangleGame } from "../games/untangle/index.ts";
import { randomNew } from "../random/index.ts";
import type { Game, PresetMenu } from "./game.ts";

// biome-ignore lint/suspicious/noExplicitAny: a deliberately game-agnostic probe.
type AnyGame = Game<any, any, any, any, any, any>;

/** First leaf preset's params — a small, valid board for each game. */
function firstLeaf<P>(menu: PresetMenu<P>): P {
  if (menu.params !== undefined) return menu.params;
  for (const sub of menu.submenu ?? []) {
    const p = firstLeaf(sub);
    if (p !== undefined) return p;
  }
  throw new Error("no leaf preset");
}

/** Walk a fresh board to solved, recomputing the hint after every move.
 * Returns the move count, or throws with a diagnostic if a hint gives up or
 * the walk fails to converge. */
function solveByHints(game: AnyGame, seed: string): number {
  const params = firstLeaf(game.presets());
  const { desc, aux } = game.newDesc(params, randomNew(seed));
  let state = game.newState(params, desc);
  // Generous cap: far above any honest plan length, so only a genuine
  // loop/non-convergence trips it.
  const cap = 800;
  for (let moves = 0; moves < cap; moves++) {
    if (game.status(state) === "solved") return moves;
    const res = game.hint?.(state, aux);
    if (!res) throw new Error(`${seed}: game has no hint() method`);
    if (!res.ok) {
      throw new Error(`${seed}: hint gave up after ${moves} moves: "${res.error}"`);
    }
    state = game.executeMove(state, res.steps[0].move);
  }
  throw new Error(`${seed}: did not converge within ${cap} moves (loop?)`);
}

const HINT_GAMES: [string, AnyGame][] = [
  ["filling", fillingGame],
  ["fifteen", fifteenGame],
  ["flood", floodGame],
  ["palisade", palisadeGame],
  ["range", rangeGame],
  ["singles", singlesGame],
  ["sixteen", sixteenGame],
  ["unruly", unrulyGame],
  ["untangle", untangleGame],
];

const SEEDS = ["hr-a", "hr-b", "hr-c", "hr-d", "hr-e"];

describe("a hint can solve from any mid-game position", () => {
  for (const [name, game] of HINT_GAMES) {
    it(`${name}: following hints one move at a time always reaches solved`, () => {
      for (const seed of SEEDS) {
        // Throws with a per-seed diagnostic on failure.
        expect(() => solveByHints(game, `${name}-${seed}`)).not.toThrow();
      }
    });
  }
});
