/**
 * The Crossing generator — `crossing_generate` / `new_game_desc` from
 * `unreleased/crossing.c`.
 *
 * One attempt is four steps, of which only the first two draw randomness:
 *
 * 1. **grow the walls** — shuffle the cell-index list once, then open cells one
 *    at a time until every 2×2 block holds an open cell and all open cells are
 *    connected. The pool check *mutates* the board as it tests (it forces a wall
 *    wherever a 2×2 would otherwise be entirely open), which is part of the
 *    algorithm, not a side effect to tidy away.
 * 2. **fill the grid** — one `randomUpto(9) + 1` per cell. This is the candidate
 *    *solution*.
 * 3. **read off the numbers** — one per run; reject on a duplicate (Nansuke
 *    forbids those) or an over-long run.
 * 4. **gate on the solver** — accept only if the deductive solver reaches a
 *    complete, unique answer from the walls and numbers alone.
 *
 * The RNG surface is therefore exactly `shuffle(cells)` followed by `w·h`
 * `randomUpto(9)` draws per attempt, so the description is a pure function of
 * the seed and reproduces the C byte-for-byte — and because step 4 gates on the
 * solver, that one byte-match validates the generator, the solver *and* the
 * codec together (playbook §4.3/§4.4).
 */

import { Dsf } from "../../engine/dsf.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { solveCrossing } from "./solver.ts";
import {
  type CrossingParams,
  type CrossingPuzzle,
  collectRuns,
  compareNumbers,
  encodeDesc,
  MAX_NUMBER_LENGTH,
  makePuzzle,
} from "./state.ts";

/** Wall-growth cell states (upstream `GEN_*`). A `BLANK` cell that is never
 * opened ends up a wall, so the final board is two-valued. */
const BLANK = 0;
const WALL = 1;
const CELL = 2;

/**
 * Upstream `crossing_gen_walls_checkpool`. Returns whether every 2×2 block
 * contains at least one open cell — *and*, in the same pass, forces a wall into
 * any 2×2 whose other three cells are open, so no 2×2 block of open cells
 * survives.
 *
 * The four quadrant tests run in this order and see each other's writes (the
 * top-left rule can turn an already-open cell into a wall, which then makes the
 * top-right rule's guard fail). Transcribed literally: the wall decisions it
 * makes here decide the board, and so the description.
 */
function checkPool(w: number, h: number, cells: Uint8Array): boolean {
  let ok = true;

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = y * w + x;
      const tr = y * w + x + 1;
      const bl = (y + 1) * w + x;
      const br = (y + 1) * w + x + 1;

      if (
        cells[tl] !== CELL &&
        cells[tr] !== CELL &&
        cells[bl] !== CELL &&
        cells[br] !== CELL
      ) {
        ok = false;
      }

      if (cells[tr] === CELL && cells[bl] === CELL && cells[br] === CELL)
        cells[tl] = WALL;
      if (cells[tl] === CELL && cells[bl] === CELL && cells[br] === CELL)
        cells[tr] = WALL;
      if (cells[tl] === CELL && cells[tr] === CELL && cells[br] === CELL)
        cells[bl] = WALL;
      if (cells[tl] === CELL && cells[tr] === CELL && cells[bl] === CELL)
        cells[br] = WALL;
    }
  }

  return ok;
}

/**
 * Upstream `crossing_gen_walls_checkdsf`: are all open cells one connected
 * component? Neighbours merge when their *three-valued* states are equal, so a
 * class is homogeneous and "the largest class containing an open cell holds
 * every open cell" is exactly the connectivity test.
 *
 * Only class membership and size are read, both independent of which element
 * the union-find picks as root, so the shared `Dsf` is byte-match safe here
 * (playbook §2.2).
 */
function checkDsf(w: number, h: number, cells: Uint8Array): boolean {
  const dsf = new Dsf(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      if (cells[i] === cells[i + 1]) dsf.merge(i, i + 1);
    }
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cells[i] === cells[i + w]) dsf.merge(i, i + w);
    }

  let total = 0;
  let maxSize = -1;
  for (let i = 0; i < w * h; i++) {
    if (cells[i] !== CELL) continue;
    total++;
    maxSize = Math.max(maxSize, dsf.size(i));
  }
  return maxSize === total;
}

/** Upstream `crossing_gen_walls`. Returns the two-valued wall grid (1 = wall). */
function genWalls(w: number, h: number, sym: boolean, rng: RandomState): Uint8Array {
  const size = w * h;
  const cells = new Uint8Array(size); // all BLANK
  const spaces = Array.from({ length: size }, (_, i) => i);
  shuffle(spaces, rng); // the wall phase's only randomness

  for (let j = 0; j < size; j++) {
    // Note the check runs *before* each opening, and mutates `cells`.
    if (checkPool(w, h, cells) && checkDsf(w, h, cells)) break;

    const i = spaces[j];
    if (cells[i] === BLANK) cells[i] = CELL;
    // Symmetric mode opens the 180°-rotational partner too.
    if (sym && cells[size - (i + 1)] === BLANK) cells[size - (i + 1)] = CELL;
  }

  const walls = new Uint8Array(size);
  for (let i = 0; i < size; i++) walls[i] = cells[i] !== CELL ? 1 : 0;
  return walls;
}

/** Upstream `crossing_gen_grid`: a random digit `1`–`9` in every cell. */
function genGrid(w: number, h: number, rng: RandomState): Uint8Array {
  const grid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = 1 + randomUpto(rng, 9);
  return grid;
}

/**
 * Upstream `crossing_gen_numbers`: read one number out of each run of the
 * candidate solution, sorted. Returns `null` when a run is longer than the
 * format allows or two runs read as the same number.
 */
function genNumbers(
  w: number,
  h: number,
  walls: Uint8Array,
  grid: Uint8Array,
): string[] | null {
  const numbers: string[] = [];
  for (const run of collectRuns(w, h, walls)) {
    if (run.cells.length > MAX_NUMBER_LENGTH) return null;
    let num = "";
    for (const i of run.cells) num += String(grid[i]);
    numbers.push(num);
  }

  numbers.sort(compareNumbers);
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] === numbers[i + 1]) return null;
  }
  return numbers;
}

export interface CrossingGenOptions {
  /**
   * Accept a board containing an **isolated** open cell — one with no open
   * orthogonal neighbour, so it lies in no run and no clue number can ever
   * reach it. Upstream produces these (its first generator TODO is "Some
   * puzzles have isolated squares (1x1 areas)"): the cell stays blank on a
   * finished board, and because the completion check only inspects runs, a
   * player can even type any digit into it and still win.
   *
   * The shipped game rejects such boards; this option exists **only** so the
   * byte-match differential can reproduce upstream exactly (playbook §4.4 —
   * keep the oracle *and* ship the fix). Measured cost of the fix: 4% of 5×5
   * boards, 7% of 7×7, 17-18% of 9×9 and 12×12 are rejected, i.e. a few percent
   * more attempts on a generator that makes a 9×9 board in well under a
   * millisecond.
   */
  upstreamIsolatedCells?: boolean;
}

/** Does every open cell belong to some run? An open cell that doesn't is
 * unreachable by any clue — see {@link CrossingGenOptions.upstreamIsolatedCells}. */
function everyCellInARun(puzzle: CrossingPuzzle): boolean {
  const { w, h, walls, acrossRun, downRun } = puzzle;
  for (let i = 0; i < w * h; i++) {
    if (!walls[i] && acrossRun[i] < 0 && downRun[i] < 0) return false;
  }
  return true;
}

/** One generation attempt — `crossing_generate`. `null` means "retry". */
function generate(
  p: CrossingParams,
  rng: RandomState,
  opts: CrossingGenOptions,
): CrossingPuzzle | null {
  const { w, h } = p;
  const walls = genWalls(w, h, p.sym, rng);
  const grid = genGrid(w, h, rng);

  const numbers = genNumbers(w, h, walls, grid);
  if (!numbers) return null;

  const puzzle = makePuzzle(w, h, walls, numbers);
  // Fork: no cell of a finished board may be left blank and unreachable.
  if (!opts.upstreamIsolatedCells && !everyCellInARun(puzzle)) return null;
  // The gate: the puzzle must be solvable by pure deduction, uniquely.
  return solveCrossing(puzzle).status === "valid" ? puzzle : null;
}

export function newCrossingDesc(
  p: CrossingParams,
  rng: RandomState,
  opts: CrossingGenOptions = {},
): { desc: string } {
  const attempt = retryLimit("crossing: generation");
  for (;;) {
    attempt();
    const puzzle = generate(p, rng, opts);
    if (puzzle) return { desc: encodeDesc(p.w, p.h, puzzle.walls, puzzle.numbers) };
  }
}
