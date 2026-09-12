/**
 * Boats — the solver-gated generator (upstream's "Generator" block), plus the
 * fleet-fit half of `validateParams`.
 *
 * `newBoatsDesc` is byte-match surface end to end. Every stage is gated by the
 * solver's verdict on an intermediate board:
 *
 *  1. place a random fleet, and derive the border numbers from it;
 *  2. keep adding a random given clue until the **Easy** solver is no longer
 *     stuck;
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
import { borderCluesLast, fillRow, placeWater, solveBoats } from "./solver.ts";
import {
  type BoatsBoard,
  type BoatsParams,
  blankBoard,
  DIFF_EASY,
  DIFFCOUNT,
  EMPTY,
  encodeDesc,
  isShip,
  NO_CLUE,
  SHIP_VAGUE,
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
 * fixtures converge in tens of milliseconds), and it throws rather than
 * returning a fallback, so no seed that converges can quietly change its desc.
 */
const MAX_GENERATE_ATTEMPTS = 10_000;

/**
 * Upstream `boats_generate_fleet`: place every boat, largest first, into a
 * randomly chosen run that can still take it. With no random state it places
 * each boat in the first possible run at the first possible position — that is
 * the deterministic fit test `validateParams` uses.
 *
 * It places through the solver's own primitives, whose contradiction
 * (`CORRUPT`) arm is unreachable here: a boat only ever goes into a run with no
 * ship in it, and every earlier boat is already ringed with water.
 *
 * Returns false when some boat has nowhere to go; the caller retries from an
 * empty grid.
 */
function generateFleet(b: BoatsBoard, rng: RandomState | null): boolean {
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
          fillRow(b, pos, run.row, pos + f, run.row, SHIP_VAGUE);
          placeWater(b, pos - 1, run.row);
          placeWater(b, pos + f + 1, run.row);
          if (f === 0) {
            placeWater(b, pos, run.row - 1);
            placeWater(b, pos, run.row + 1);
          }
        } else {
          fillRow(b, run.row, pos, run.row, pos + f, SHIP_VAGUE);
          placeWater(b, run.row, pos - 1);
          placeWater(b, run.row, pos + f + 1);
          if (f === 0) {
            placeWater(b, run.row - 1, pos);
            placeWater(b, run.row + 1, pos);
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

/**
 * Upstream `validate_params`, check for check in upstream's order (the order
 * decides which message a doubly-invalid parameter set reports). Lives here
 * rather than with the other param code because the last check, the fleet fit,
 * *is* the generator.
 */
export function validateParams(p: BoatsParams, full: boolean): string | null {
  const { w, h, fleet } = p;

  if (full && p.diff >= DIFFCOUNT) return "Unknown difficulty level";
  if (w > 99) return "Width is too high";
  if (h > 99) return "Height is too high";
  if (fleet < 1) return "Fleet size must be at least 1";
  if (fleet > w && fleet > h)
    return "Fleet size must be smaller than the width and height";
  if (fleet > 9) return "Fleet size must be no more than 9";

  if (!p.fleetData.slice(0, fleet).some((n) => n !== 0))
    return "Fleet must contain at least 1 boat";

  if (w < 2) return "Width must be at least 2";
  if (h < 2) return "Height must be at least 2";
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

    // The permutation both clue passes walk; the second `shuffle` permutes what
    // this one left.
    const spaces = Array.from({ length: w * h }, (_, i) => i);
    shuffle(spaces, rng);

    // Add random given clues until the Easy solver is no longer stuck. (A
    // *contradictory* verdict also ends this loop — upstream tests `!= -1`.)
    const clueGuard = retryLimit("boats: seeding grid clues", w * h + 1);
    for (;;) {
      clueGuard();
      if (solveBoats(board, DIFF_EASY).kind !== "stuck") break;
      const j = spaces.find((i) => board.grid[i] === EMPTY);
      if (j !== undefined) board.gridClues[j] = solution[j];
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
      const lines = Array.from({ length: w + h }, (_, i) => i);
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
      if (!board.borderClues.includes(NO_CLUE)) continue;
    }

    // Finally: it must need the target difficulty, not merely permit it.
    const verdict = solveBoats(board, diff);
    if (verdict.kind !== "solved" || verdict.diff !== diff) continue;

    return { desc: encodeDesc(w, h, board.borderClues, board.gridClues) };
  }
}
