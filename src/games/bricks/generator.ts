/**
 * Bricks generator — port of `new_game_desc` (and its helpers
 * `bricks_fill_grid`, `bricks_build_numbers`, `bricks_remove_numbers`) in
 * `puzzles/unreleased/bricks.c`.
 *
 * This is the byte-match surface (bricks-differential.test.ts). The RNG draw
 * order is upstream's exactly: per outer attempt, `fillGrid`'s conditional
 * draws, then one `shuffle` of the padded cell indices. The solver consumes no
 * RNG, so the desc is a pure function of the seed, and because every removal is
 * gated on the solver, one byte-match validates the generator, the solver's
 * exact deductive power, and the codec together.
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { solveGame } from "./solver.ts";
import {
  applyBounds,
  BRICKS_STEPS,
  type BricksParams,
  COL_MASK,
  DIFF_EASY,
  encodeDesc,
  F_BOUND,
  F_EMPTY,
  F_SHADE,
  F_UNSHADE,
  gridSize,
  MAX_GENERABLE_DIFF,
} from "./state.ts";

const MINIMUM_SHADED = 0.4;

/** Runaway backstop only — upstream loops unbounded; the min-shaded /
 * min-difficulty retries converge quickly (docs/games/testing.md § "Quirks are load-bearing — capped, not cleaned"). */
const MAX_ATTEMPTS = 100_000;

/** Fill the playable cells bottom-up with shade/unshade under the gravity +
 * no-three-run constraints (upstream `bricks_fill_grid`). The `randomUpto`
 * draw is conditional — it fires only when neither the run limit nor gravity
 * already forced an unshade — so the `||` short-circuit order is preserved. */
function fillGrid(grid: Uint16Array, w: number, h: number, rs: RandomState): void {
  for (let y = h - 1; y >= 0; y--) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      const i1 = y * w + x;
      if (grid[i1] & F_BOUND) continue;

      const i2 = (y + 1) * w + x - 1;
      const i3 = (y + 1) * w + x;

      let n2 = x === 0 || y === h - 1 ? F_BOUND : grid[i2];
      if (!(n2 & F_BOUND)) n2 &= COL_MASK;
      let n3 = y === h - 1 ? F_BOUND : grid[i3];
      if (!(n3 & F_BOUND)) n3 &= COL_MASK;

      if (
        run === 2 ||
        (y !== h - 1 && n2 !== F_SHADE && n3 !== F_SHADE) ||
        randomUpto(rs, 3) === 0
      ) {
        grid[i1] = F_UNSHADE;
        run = 0;
      } else {
        grid[i1] = F_SHADE;
        run++;
      }
    }
  }
}

/** Replace every non-shaded playable cell with its shaded-neighbor count
 * (upstream `bricks_build_numbers`); returns the total shaded count. */
function buildNumbers(grid: Uint16Array, w: number, h: number): number {
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = grid[y * w + x];
      if (n === F_SHADE) total++;
      if (n === F_SHADE || n & F_BOUND) continue;

      let shade = 0;
      for (const [dx, dy] of BRICKS_STEPS) {
        const x2 = x + dx;
        const y2 = y + dy;
        if (x2 < 0 || x2 >= w || y2 < 0 || y2 >= h) continue;
        if ((grid[y2 * w + x2] & COL_MASK) === F_SHADE) shade++;
      }
      grid[y * w + x] = shade;
    }
  }
  return total;
}

/** Greedy clue minimization (upstream `bricks_remove_numbers`): one shuffle
 * of the padded cell indices, then blank each numbered cell in that order,
 * keeping the blank only while the board still solves uniquely at `maxdiff`. */
function removeNumbers(
  grid: Uint16Array,
  w: number,
  h: number,
  maxdiff: number,
  rs: RandomState,
): void {
  const s = w * h;
  const spaces = Array.from({ length: s }, (_, i) => i);
  shuffle(spaces, rs);
  for (let j = 0; j < s; j++) {
    const i1 = spaces[j];
    const temp = grid[i1];
    if (temp & F_BOUND) continue;
    grid[i1] = F_EMPTY;
    if (solveGame(grid, w, h, maxdiff, true, true) !== "complete") {
      grid[i1] = temp;
    }
  }
}

export interface BricksGenerateOptions {
  /**
   * Reproduce upstream's min-difficulty gate verbatim: reject a candidate only
   * when the *Easy* solver completes it, whatever tier was requested. That is
   * right for `DIFF_NORMAL` and vacuous for `DIFF_TRICKY`, so
   * {@link newBricksDesc} gates on the tier actually below the one requested
   * and refuses Tricky outright (`MAX_GENERABLE_DIFF`).
   *
   * Every clue removal is solver-gated, so that changes every Tricky desc. This
   * flag keeps the oracle: `bricks-differential.test.ts` sets it so the Tricky
   * fixtures still match the C byte-for-byte. Nothing else should set it.
   */
  readonly upstreamLooseGate?: boolean;
}

export function newBricksDesc(
  p: BricksParams,
  rs: RandomState,
  options: BricksGenerateOptions = {},
): { desc: string } {
  const { w, h } = gridSize(p);
  const spaces = p.w * p.h; // playable-cell count
  const grid = new Uint16Array(w * h);
  const loose = options.upstreamLooseGate ?? false;

  // `validateParams` refuses this combination, so reaching it means a caller
  // bypassed it. Fail immediately rather than let the gate below reject every
  // candidate for ~100,000 attempts — a synchronous generator that cannot
  // succeed owns its thread outright (see `engine/retry-limit.ts`).
  if (!loose && p.diff > MAX_GENERABLE_DIFF) {
    throw new Error(
      `bricks: no board requires difficulty ${p.diff}; the generable maximum is ${MAX_GENERABLE_DIFF}`,
    );
  }

  const attempt = retryLimit("bricks: generation attempts", MAX_ATTEMPTS);
  for (;;) {
    attempt();
    applyBounds(w, h, grid);

    fillGrid(grid, w, h, rs);
    buildNumbers(grid, w, h);

    // Expose ambiguity: solve at Easy, then re-number every deduced cell.
    solveGame(grid, w, h, DIFF_EASY, true, false);
    const total = buildNumbers(grid, w, h);

    // Enforce the minimum shaded proportion (upstream's float comparison).
    if (Math.fround(total / spaces) < MINIMUM_SHADED) continue;

    removeNumbers(grid, w, h, p.diff, rs);

    // The tier gate: a board the tier below already solves is not the
    // difficulty the player asked for. Upstream always probes at `DIFF_EASY`
    // here regardless of the tier requested; `p.diff - 1` is the divergence,
    // and the two agree on every tier Bricks still offers.
    const below = loose ? DIFF_EASY : p.diff - 1;
    if (
      p.diff > DIFF_EASY &&
      spaces > 6 &&
      solveGame(grid, w, h, below, true, true) === "complete"
    ) {
      continue;
    }

    break;
  }

  return { desc: encodeDesc(grid, w, h) };
}
