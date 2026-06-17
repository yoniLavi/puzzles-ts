/**
 * Unruly generator — idiomatic TS port of `unruly_fill_game` /
 * `new_game_desc`. Build a random valid full grid (place a random colour
 * in each cell in shuffled order, solving forward after each placement),
 * then winnow clues while the deductive solver at the target difficulty
 * can still finish, with a too-easy gate above Trivial.
 */
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import {
  type GridView,
  newScratch,
  type Scratch,
  solveGame,
  validateCounts,
  validateRows,
} from "./solver.ts";
import {
  type Cell,
  DIFF_TRIVIAL,
  EMPTY,
  encodeGrid,
  ONE,
  type UnrulyParams,
  ZERO,
} from "./state.ts";

function blankView(p: UnrulyParams): GridView {
  return {
    w2: p.w2,
    h2: p.h2,
    unique: p.unique,
    grid: new Uint8Array(p.w2 * p.h2),
  };
}

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

  return validateRows(view, null) === 0 && validateCounts(view, null) === 0;
}

/** Does the solver at `diff` reach a complete (counts-balanced) solution
 * from `grid`? */
function solvableAt(view: GridView, grid: Uint8Array, diff: number): boolean {
  const work: GridView = { ...view, grid: Uint8Array.from(grid) };
  const scratch = newScratch(work);
  solveGame(work, scratch, diff);
  return validateCounts(work, null) === 0;
}

export function newDesc(p: UnrulyParams, rng: RandomState): { desc: string } {
  const s = p.w2 * p.h2;

  while (true) {
    // Build a valid full grid, retrying until one materialises.
    const view = blankView(p);
    let scratch = newScratch(view);
    while (!fillGame(view, scratch, rng)) {
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

    // Too-easy gate: above Trivial, reject a board the next-easier solver
    // already finishes (so the target technique is genuinely needed), and
    // regenerate. Trivial boards can never be too easy.
    if (p.diff > DIFF_TRIVIAL && solvableAt(view, grid, p.diff - 1)) continue;

    return { desc: encodeGrid(grid, s) };
  }
}
