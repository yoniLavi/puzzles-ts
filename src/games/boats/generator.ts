/**
 * Boats — the solver-gated generator (upstream's "Generator" block), plus the
 * fleet-fit half of `validateParams`.
 *
 * `newBoatsDesc` is byte-match surface end to end. Every stage is gated by the
 * solver's verdict on an intermediate board:
 *
 *  1. place a random fleet, and derive the border numbers from it;
 *  2. keep adding a random given clue until the **Easy** solver is no longer
 *     stuck (note: "no longer stuck" includes "contradictory", faithfully —
 *     upstream tests `!= -1`, not `== solved`);
 *  3. try removing each given clue, keeping the removal only while the board
 *     still solves at the target difficulty;
 *  4. if "remove numbers" is on, do the same for the border numbers, then
 *     refuse a board that ends up hiding only one (that is no puzzle);
 *  5. reject the whole board unless it solves at **exactly** the target
 *     difficulty, and start over.
 *
 * So the published description depends on the solver's verdict on every board
 * along the way, and the differential's one byte-match assertion validates the
 * generator, all four solver tiers, the dsf root choice and the codec together
 * (docs/games/solver-and-generator.md § "Solver-gated generation").
 *
 * **RNG draws must be reproduced in order, including the wasted ones.** The
 * fleet placement shuffles the run list and draws a position *per boat*, and
 * the clue-removal passes shuffle a full-grid permutation twice — the second
 * `shuffle` permutes the array the first one already permuted, rather than a
 * fresh identity, so it cannot be replaced with one shuffle of a fresh array
 * (docs/games/testing.md § "Byte-match: fidelity where there is a right answer").
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { borderCluesLast, solveBoats } from "./solver.ts";
import {
  type BoatsBoard,
  type BoatsParams,
  blankBoard,
  DIFF_EASY,
  EMPTY,
  encodeDesc,
  isShip,
  NO_CLUE,
  SHIP_VAGUE,
  validateParamsBasic,
  WATER,
} from "./state.ts";
import { adjustShips, collectRuns } from "./validate.ts";

/** Upstream `MAX_ATTEMPTS`: after this many rejected boards, relax the puzzle
 * (drop "remove numbers" first, then step the difficulty down) rather than
 * spinning for ever on parameters that cannot reach the requested grade. */
const MAX_ATTEMPTS = 1000;

/**
 * A runaway backstop over upstream's own relaxation ladder. Upstream degrades
 * at most five times (once for `strip`, then once per difficulty step) and then
 * `assert`s — which a release build compiles out, leaving a genuine infinite
 * loop. Ten thousand attempts is far past any legitimate generation (the
 * fixtures converge in tens of milliseconds) so this only fires on a porting
 * divergence, and it throws rather than returning a fallback, so no seed that
 * used to converge can quietly change its desc.
 */
const MAX_GENERATE_ATTEMPTS = 10_000;

/**
 * Upstream `boats_generate_fleet`: place every boat, largest first, into a
 * randomly chosen run that can still take it. With no random state it places
 * each boat in the first possible run at the first possible position — that is
 * the deterministic fit test `validateParams` uses.
 *
 * Returns false when some boat has nowhere to go; the caller retries from an
 * empty grid.
 */
export function generateFleet(b: BoatsBoard, rng: RandomState | null): boolean {
  const { w, h, fleet, fleetData, grid } = b;

  for (let f = fleet - 1; f >= 0; f--) {
    for (let j = 0; j < fleetData[f]; j++) {
      const runs = collectRuns(b);
      const order = runs.map((_, i) => i);
      if (rng) shuffle(order, rng);

      let placed = false;
      for (const runIndex of order) {
        const run = runs[runIndex];
        if (run.ships > 0) continue; // already holds a boat
        if (run.len < f + 1) continue; // too small

        const pos = run.start + (rng ? randomUpto(rng, run.len - f) : 0);

        if (run.horizontal) {
          fillBlockVague(b, pos, run.row, pos + f, run.row);
          placeWaterAt(b, pos - 1, run.row);
          placeWaterAt(b, pos + f + 1, run.row);
          if (f === 0) {
            placeWaterAt(b, pos, run.row - 1);
            placeWaterAt(b, pos, run.row + 1);
          }
        } else {
          fillBlockVague(b, run.row, pos, run.row, pos + f);
          placeWaterAt(b, run.row, pos - 1);
          placeWaterAt(b, run.row, pos + f + 1);
          if (f === 0) {
            placeWaterAt(b, run.row - 1, pos);
            placeWaterAt(b, run.row + 1, pos);
          }
        }

        adjustShips(b);
        placed = true;
        break;
      }

      if (!placed) return false;
    }
  }

  for (let i = 0; i < w * h; i++) if (grid[i] === EMPTY) grid[i] = WATER;
  return true;
}

// The generator's own placement primitives. They are upstream's
// `boats_solver_place_ship`/`_place_water` reached through `fill_row`, but the
// generator only ever writes onto empty squares of a consistent board, so the
// contradiction (`CORRUPT`) arm is unreachable here.
function placeShipAt(b: BoatsBoard, x: number, y: number): void {
  const { w, h, grid } = b;
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  if (grid[y * w + x] !== EMPTY) return;
  grid[y * w + x] = SHIP_VAGUE;
  // Boats never touch, so the diagonals are water.
  placeWaterAt(b, x - 1, y - 1);
  placeWaterAt(b, x + 1, y - 1);
  placeWaterAt(b, x - 1, y + 1);
  placeWaterAt(b, x + 1, y + 1);
}

function placeWaterAt(b: BoatsBoard, x: number, y: number): void {
  const { w, h, grid } = b;
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  if (grid[y * w + x] === EMPTY) grid[y * w + x] = WATER;
}

/** Upstream `boats_solver_fill_row` with a ship fill — an axis-aligned block,
 * so it serves a horizontal and a vertical boat alike. */
function fillBlockVague(
  b: BoatsBoard,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): void {
  for (let x = sx; x <= ex; x++)
    for (let y = sy; y <= ey; y++)
      if (b.grid[y * b.w + x] === EMPTY) placeShipAt(b, x, y);
}

/** Upstream `boats_create_borderclues`: count the ships in each line. */
function createBorderClues(b: BoatsBoard): void {
  const { w, h, grid, borderClues } = b;
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++)
      if (isShip(grid[y * w + x])) {
        borderClues[x]++;
        borderClues[y + w]++;
      }
}

/**
 * Upstream `validate_params`' fleet-fit test: can this fleet be placed at all?
 * Upstream normalizes the board to `min(w,h) × max(w,h)` first, so the verdict
 * is orientation-independent.
 *
 * This is not an optimization — it is the **only** guard against a hang.
 * `newBoatsDesc` retries fleet placement in an unbounded loop, so an
 * unfittable fleet (the default 3,2,1 in 5×4, measured) would spin for ever.
 */
export function fleetFits(p: BoatsParams): boolean {
  const board = blankBoard(
    Math.min(p.w, p.h),
    Math.max(p.w, p.h),
    p.fleet,
    p.fleetData,
  );
  return generateFleet(board, null);
}

/** Upstream `validate_params` in full: the cheap numeric checks, then the fit
 * test. Lives here rather than with the other param code because the fit test
 * *is* the generator. */
export function validateParams(p: BoatsParams, full: boolean): string | null {
  const basic = validateParamsBasic(p, full);
  if (basic !== null) return basic;
  if (!fleetFits(p)) return "Fleet does not fit into the grid";
  return null;
}

/** Upstream `new_game_desc`. */
export function newBoatsDesc(p: BoatsParams, rng: RandomState): { desc: string } {
  const { w, h } = p;
  const board = blankBoard(w, h, p.fleet, p.fleetData);
  const solution = new Int8Array(w * h);

  let diff = p.diff;
  let strip = p.strip;
  let attempts = 0;
  const guard = retryLimit("boats: generation", MAX_GENERATE_ATTEMPTS);

  // The permutation the two clue-removal passes walk. Allocated once, because
  // the second `shuffle` deliberately permutes what the first one left.
  const spaces: number[] = [];

  for (;;) {
    guard();
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      attempts = 0;
      if (strip) strip = false;
      else diff--;
      if (diff < 0) throw new Error("boats: no puzzle exists for these parameters");
    }

    board.gridClues.fill(EMPTY);
    board.grid.fill(EMPTY);
    board.borderClues.fill(0);

    while (!generateFleet(board, rng)) board.grid.fill(EMPTY);

    createBorderClues(board);
    solution.set(board.grid);

    // Add random given clues until the Easy solver is no longer stuck. (A
    // *contradictory* verdict also ends this loop — upstream tests `!= -1`.)
    spaces.length = 0;
    for (let i = 0; i < w * h; i++) spaces.push(i);
    shuffle(spaces, rng);

    const clueGuard = retryLimit("boats: seeding grid clues", w * h + 1);
    for (;;) {
      clueGuard();
      if (solveBoats(board, DIFF_EASY).kind !== "stuck") break;
      for (const j of spaces) {
        if (board.grid[j] !== EMPTY) continue;
        board.gridClues[j] = solution[j];
        break;
      }
    }

    // Remove each given clue that the target difficulty can do without.
    shuffle(spaces, rng);
    for (const j of spaces) {
      if (board.gridClues[j] === EMPTY) continue;
      const saved = board.gridClues[j];
      board.gridClues[j] = EMPTY;
      if (solveBoats(board, diff).kind === "stuck") board.gridClues[j] = saved;
    }

    if (strip) {
      const lines: number[] = [];
      for (let i = 0; i < w + h; i++) lines.push(i);
      shuffle(lines, rng);

      for (const j of lines) {
        if (board.borderClues[j] === NO_CLUE) continue;
        const saved = board.borderClues[j];
        board.borderClues[j] = NO_CLUE;
        if (solveBoats(board, diff).kind === "stuck") board.borderClues[j] = saved;
      }

      // Don't ship a puzzle that hides only one number — it is derivable from
      // the fleet's total, so it isn't hidden at all.
      borderCluesLast(board);
      if (!board.borderClues.some((c) => c === NO_CLUE)) continue;
    }

    // Finally: it must need the target difficulty, not merely permit it.
    const verdict = solveBoats(board, diff);
    if (verdict.kind !== "solved" || verdict.diff !== diff) continue;

    return { desc: encodeDesc(w, h, board.borderClues, board.gridClues) };
  }
}
