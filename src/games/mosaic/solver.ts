/**
 * Mosaic solver and generator (the solver half of upstream's `mosaic.c`:
 * `solve_cell`, `solve_check`, `solve_game_actual`, `hide_clues`,
 * `new_game_desc`).
 *
 * One deduction rule, three drivers: generation feasibility
 * (`solveCheck`, desc-side, knows full/empty), clue minimization
 * (`hideClues`), and the Solve command / mistake check
 * (`solveGameActual`, board-side, clue numbers only).
 */

import { type RandomState, randomBits } from "../../engine/random/index.ts";
import { shuffle } from "../../engine/shuffle.ts";
import {
  countAround,
  encodeBoard,
  type MosaicBoard,
  type MosaicMistake,
  type MosaicParams,
  type MosaicState,
  STATE_BLANK,
  STATE_MARK_MASK,
  STATE_MARKED,
  STATE_UNMARKED,
} from "./state.ts";

// --- solver scratch -----------------------------------------------------

/** Upstream's `struct solution_cell[]` as parallel typed arrays:
 * `hideClues` runs `solveCheck` once per candidate clue, so this is the
 * hot allocation. */
export interface Solution {
  /** STATE_UNMARKED / STATE_MARKED / STATE_BLANK per cell. */
  cell: Uint8Array;
  solved: Uint8Array;
  /** Set when this clue's deduction actually narrowed something —
   * a not-needed clue is hidden for free by `hideClues`. */
  needed: Uint8Array;
}

function newSolution(size: number): Solution {
  return {
    cell: new Uint8Array(size),
    solved: new Uint8Array(size),
    needed: new Uint8Array(size),
  };
}

type CellResult = "progress" | "none" | "contradiction";

/** Set every still-unmarked neighbor (3×3, clipped) to `mark`. */
function markAround(
  width: number,
  height: number,
  sol: Solution,
  x: number,
  y: number,
  mark: number,
): void {
  for (let j = Math.max(0, y - 1); j <= Math.min(height - 1, y + 1); j++) {
    for (let i = Math.max(0, x - 1); i <= Math.min(width - 1, x + 1); i++) {
      const pos = j * width + i;
      if (sol.cell[pos] === STATE_UNMARKED) sol.cell[pos] = mark;
    }
  }
}

/**
 * The whole deduction rule (upstream `solve_cell`). `clue < 0` means
 * the cell shows no clue; `full`/`empty` are the generation-side
 * shortcuts (the clue saturates its neighborhood / is zero) and are
 * always false on the board-side drivers.
 */
export function solveCell(
  width: number,
  height: number,
  clue: number,
  full: boolean,
  empty: boolean,
  sol: Solution,
  x: number,
  y: number,
): CellResult {
  const pos = y * width + x;
  if (sol.solved[pos]) return "none";
  const { marked, blank, total } = countAround(width, height, sol.cell, x, y);
  const determined = marked + blank === total;

  if (clue < 0) {
    // No clue here; solved once its neighborhood is determined.
    if (!determined) return "none";
    sol.solved[pos] = 1;
    return "progress";
  }
  // The unknowns are forced blank once the clue is met, and marked once it
  // needs all of them; a determined neighborhood short of both is a
  // contradiction.
  let mark: number;
  if (full) mark = STATE_MARKED;
  else if (empty || marked === clue) mark = STATE_BLANK;
  else if (clue === total - blank) mark = STATE_MARKED;
  else if (determined) return "contradiction";
  else return "none";
  sol.solved[pos] = 1;
  if (!determined) sol.needed[pos] = 1;
  markAround(width, height, sol, x, y, mark);
  return "progress";
}

// --- generation-side cells ------------------------------------------------

/** The generator's per-cell knowledge (upstream `struct desc_cell`),
 * as parallel typed arrays. */
export interface GenCells {
  clue: Int8Array;
  shown: Uint8Array;
  full: Uint8Array;
  empty: Uint8Array;
}

/** Compute one cell's clue from the image (upstream `populate_cell`): the
 * black cells of its clipped 3×3 neighborhood, itself included. "Full"
 * means the clue saturates the neighborhood (9 interior, 6 edge, 4
 * corner), "empty" that it is 0. */
export function populateCell(
  width: number,
  height: number,
  image: Uint8Array,
  x: number,
  y: number,
): { clue: number; full: boolean; empty: boolean } {
  let clue = 0;
  let total = 0;
  for (let j = Math.max(0, y - 1); j <= Math.min(height - 1, y + 1); j++) {
    for (let i = Math.max(0, x - 1); i <= Math.min(width - 1, x + 1); i++) {
      clue += image[j * width + i];
      total++;
    }
  }
  return { clue, full: clue === total, empty: clue === 0 };
}

/** Upstream `start_point_check`, quirk included: `newDesc` scans only the
 * first `(width-1)*(height-1)` cells, not the whole board. Scanning them
 * all would change every generated board. */
export function startPointCheck(cells: GenCells, scanSize: number): boolean {
  for (let i = 0; i < scanSize; i++) {
    if (cells.empty[i] || cells.full[i]) return true;
  }
  return false;
}

/**
 * Desc-side feasibility check (upstream `solve_check`): run the
 * deduction over the shown clues — in rng-shuffled order when `rng` is
 * given (generation), stable scan order otherwise (the re-checks
 * inside `hideClues`) — until no progress. Returns whether every cell
 * of the board was determined, plus the solution (for `needed`).
 */
export function solveCheck(
  width: number,
  height: number,
  cells: GenCells,
  rng: RandomState | null,
): { solved: boolean; sol: Solution } {
  const size = width * height;
  const sol = newSolution(size);
  const shownPos: number[] = [];
  for (let pos = 0; pos < size; pos++) {
    if (cells.shown[pos]) shownPos.push(pos);
  }
  if (rng) shuffle(shownPos, rng);

  let solvedCount = 0;
  let madeProgress = true;
  let error = false;
  while (solvedCount < shownPos.length && madeProgress && !error) {
    madeProgress = false;
    for (const pos of shownPos) {
      const res = solveCell(
        width,
        height,
        cells.clue[pos],
        cells.full[pos] !== 0,
        cells.empty[pos] !== 0,
        sol,
        pos % width,
        Math.floor(pos / width),
      );
      if (res === "contradiction") {
        error = true;
        break;
      }
      if (res === "progress") {
        solvedCount++;
        madeProgress = true;
      }
    }
  }

  // Like upstream, count the determined cells only after a round that
  // made progress.
  let determined = 0;
  if (madeProgress) {
    for (let pos = 0; pos < size; pos++) {
      if (sol.cell[pos] & STATE_MARK_MASK) determined++;
    }
  }
  return { solved: determined === size, sol };
}

/**
 * Board-side solve (upstream `solve_game_actual`): only the clue
 * numbers are known (no full/empty shortcuts), every cell is visited
 * each round. Returns the solution cells, or `null` when deduction
 * stalls or contradicts.
 */
export function solveGameActual(board: MosaicBoard): Uint8Array | null {
  const { width, height, clues } = board;
  const size = width * height;
  const sol = newSolution(size);

  let solvedCount = 0;
  let madeProgress = true;
  let error = false;
  while (solvedCount < size && madeProgress && !error) {
    madeProgress = false;
    for (let y = 0; y < height && !error; y++) {
      for (let x = 0; x < width; x++) {
        const res = solveCell(
          width,
          height,
          clues[y * width + x],
          false,
          false,
          sol,
          x,
          y,
        );
        if (res === "contradiction") {
          error = true;
          break;
        }
        if (res === "progress") {
          madeProgress = true;
          solvedCount++;
        }
      }
    }
  }
  return solvedCount === size ? sol.cell : null;
}

// --- generator --------------------------------------------------------------

/** Hide clues the deduction never needed; in aggressive mode also try
 * hiding each needed clue in random order, reverting hides that break
 * solvability (upstream `hide_clues`). */
export function hideClues(
  width: number,
  height: number,
  cells: GenCells,
  rng: RandomState,
  aggressive: boolean,
): void {
  const { sol } = solveCheck(width, height, cells, rng);
  const size = width * height;
  const needed: number[] = [];
  for (let pos = 0; pos < size; pos++) {
    if (!sol.needed[pos]) cells.shown[pos] = 0;
    else if (aggressive) needed.push(pos);
  }
  if (aggressive) {
    shuffle(needed, rng);
    for (const pos of needed) {
      cells.shown[pos] = 0;
      if (!solveCheck(width, height, cells, null).solved) {
        cells.shown[pos] = 1;
      }
    }
  }
}

/** Upstream `new_game_desc`: random image → clues → regenerate until a
 * usable starting deduction exists and the deduction completes → hide
 * clues → run-length encode. */
export function newDesc(p: MosaicParams, rng: RandomState): { desc: string } {
  const { width, height, aggressive } = p;
  const size = width * height;
  const image = new Uint8Array(size);
  const cells: GenCells = {
    clue: new Int8Array(size),
    shown: new Uint8Array(size),
    full: new Uint8Array(size),
    empty: new Uint8Array(size),
  };

  do {
    for (let i = 0; i < size; i++) image[i] = randomBits(rng, 1);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = y * width + x;
        const { clue, full, empty } = populateCell(width, height, image, x, y);
        cells.clue[pos] = clue;
        cells.shown[pos] = 1;
        cells.full[pos] = full ? 1 : 0;
        cells.empty[pos] = empty ? 1 : 0;
      }
    }
  } while (
    !startPointCheck(cells, (width - 1) * (height - 1)) ||
    !solveCheck(width, height, cells, rng).solved
  );
  hideClues(width, height, cells, rng, aggressive);

  const clues = new Int8Array(size);
  for (let pos = 0; pos < size; pos++) {
    clues[pos] = cells.shown[pos] ? cells.clue[pos] : -1;
  }
  return { desc: encodeBoard({ width, height, clues }) };
}

// --- solve command + mistakes -------------------------------------------------

/** Hex-pack the solution's marked-cell bitmap, MSB first (the payload
 * of upstream's `s…` solve move). */
export function encodeSolution(solCells: Uint8Array): string {
  let out = "";
  for (let i = 0; i < solCells.length; i += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) {
      byte <<= 1;
      if (i + bit < solCells.length && solCells[i + bit] === STATE_MARKED) byte |= 1;
    }
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/** Every determined cell whose mark contradicts the deduced solution.
 * Generated boards are deduction-solvable hence unique, so the solver's
 * answer is the answer; if deduction stalls (a foreign desc), there is
 * nothing to check against and no mistake is reported. */
export function findMistakes(state: MosaicState): MosaicMistake[] {
  const solCells = solveGameActual(state.board);
  if (!solCells) return [];
  const { width, cells } = state;
  const mistakes: MosaicMistake[] = [];
  for (let pos = 0; pos < cells.length; pos++) {
    const mark = cells[pos] & STATE_MARK_MASK;
    if (mark !== STATE_UNMARKED && mark !== solCells[pos]) {
      mistakes.push({ x: pos % width, y: Math.floor(pos / width) });
    }
  }
  return mistakes;
}
