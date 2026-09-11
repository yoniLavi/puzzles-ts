/**
 * Unruly generator: upstream's `unruly_fill_game` / `new_game_desc`. Build a
 * random valid full grid (place a random color in each cell in shuffled order,
 * solving forward after each placement), then winnow clues while the deductive
 * solver at the target difficulty can still finish, with a too-easy gate above
 * the first tier.
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { type Cell, DIFF_TRIVIAL, EMPTY, ONE, ZERO } from "./constants.ts";
import {
  type GridView,
  isComplete,
  newScratch,
  type Scratch,
  solveCopy,
  solveGame,
  validateCounts,
} from "./solver.ts";
import { encodeGrid, type UnrulyParams } from "./state.ts";

/** Fill a blank grid to a valid complete solution, or return false to
 * retry. Mutates `view`/`scratch`. */
function fillGame(view: GridView, scratch: Scratch, rng: RandomState): boolean {
  const { w2, h2, grid } = view;
  const s = w2 * h2;
  const spaces = Array.from({ length: s }, (_, i) => i);
  shuffle(spaces, rng);

  for (const i of spaces) {
    if (grid[i] !== EMPTY) continue;
    if (randomUpto(rng, 2)) {
      grid[i] = ONE;
      scratch.onesRows[Math.floor(i / w2)]++;
      scratch.onesCols[i % w2]++;
    } else {
      grid[i] = ZERO;
      scratch.zerosRows[Math.floor(i / w2)]++;
      scratch.zerosCols[i % w2]++;
    }
    solveGame(view, scratch, Number.MAX_SAFE_INTEGER);
  }

  return isComplete(view);
}

/** Does the solver at `diff` reach a complete (counts-balanced) solution
 * from `grid`? */
export function solvableAt(view: GridView, grid: Uint8Array, diff: number): boolean {
  return validateCounts(solveCopy(view, grid, diff), null) === 0;
}

export function newDesc(p: UnrulyParams, rng: RandomState): { desc: string } {
  const s = p.w2 * p.h2;

  const attempt = retryLimit("unruly: generation");
  while (true) {
    attempt();

    // Build a valid full grid, retrying until one materializes.
    const view: GridView = {
      w2: p.w2,
      h2: p.h2,
      unique: p.unique,
      grid: new Uint8Array(s),
    };
    let scratch = newScratch(view);
    const fill = retryLimit("unruly: fillGame");
    while (!fillGame(view, scratch, rng)) {
      fill();
      view.grid.fill(EMPTY);
      scratch = newScratch(view);
    }
    const grid = view.grid;

    // Winnow: empty each clue in shuffled order, keeping the removal only
    // while the solver at the target difficulty still finishes.
    const spaces = Array.from({ length: s }, (_, i) => i);
    shuffle(spaces, rng);
    for (const i of spaces) {
      const c = grid[i] as Cell;
      grid[i] = EMPTY;
      if (!solvableAt(view, grid, p.diff)) grid[i] = c;
    }

    // Too-easy gate: reject a board the next tier down already finishes, so
    // the target technique is genuinely needed. The first tier has none below.
    if (p.diff > DIFF_TRIVIAL && solvableAt(view, grid, p.diff - 1)) continue;

    return { desc: encodeGrid(grid, s) };
  }
}
