/**
 * Sticks generator — port of `new_game_desc` in `puzzles/unreleased/sticks.c`.
 *
 * This is the byte-match surface (see sticks-differential.test.ts). The RNG
 * draw order is upstream's exactly: the symmetric black placement (shared
 * `placeSymmetricBlacks` — one `randomUpto` pair per rejection-sampling
 * attempt plus the `SYMM_ROT4` center draw), then per fill attempt one
 * `randomUpto(rs, 2)` per white cell and one `randomUpto(rs, n)` per
 * multi-cell segment's clue position, retried until the contradiction solver
 * deduces the fill back to completion (a unique, guess-free solution), then
 * one `shuffle` of the cell indices for the greedy clue minimization. The
 * solver is deterministic, so the desc is a pure function of the seed.
 */
import { Dsf } from "../../engine/dsf.ts";
import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { placeSymmetricBlacks } from "../../engine/symmetric-blacks.ts";
import { sticksMakeDsf, sticksSolveGame } from "./solver.ts";
import { encodeDesc, F_BLOCK, F_HOR, F_VER, type SticksParams } from "./state.ts";

/** Runaway backstop only — upstream loops unbounded, and the fill retry
 * converges quickly in practice (docs/games/testing.md § "Quirks are load-bearing — capped, not cleaned"). */
const MAX_FILL_ATTEMPTS = 100_000;

export function newSticksDesc(p: SticksParams, rng: RandomState): { desc: string } {
  const { w, h } = p;
  const s = w * h;
  const grid = new Uint8Array(s);
  const numbers = new Int16Array(s);
  const dsf = new Dsf(s);
  const minimal = new Int32Array(s);

  // Symmetric black placement (upstream set_blacks, copied from lightup.c —
  // the shared helper reproduces its draw order; the board starts cleared).
  placeSymmetricBlacks({
    w,
    h,
    blackpc: p.blackpc,
    symm: p.symm,
    rs: rng,
    isBlack: (x, y) => (grid[y * w + x] & F_BLOCK) !== 0,
    setBlack: (x, y, black) => {
      grid[y * w + x] = black ? F_BLOCK : 0;
    },
  });

  // Fill + clue, retried until the solver deduces the board to completion
  // (which also leaves `grid` holding the unique solution's lines).
  const attempt = retryLimit("sticks: fill attempts", MAX_FILL_ATTEMPTS);
  do {
    attempt();

    for (let i = 0; i < s; i++) {
      if (!(grid[i] & F_BLOCK)) grid[i] = randomUpto(rng, 2) ? F_HOR : F_VER;
      else grid[i] = F_BLOCK;
    }

    sticksMakeDsf(grid, null, w, h, dsf, null);

    // dsf_minimal ≡ the smallest index in a class; the shared Dsf doesn't
    // track it, so precompute after all merges (docs/games/solver-and-generator.md § "The Latin family"). Byte-safe:
    // membership-determined, independent of the root choice.
    minimal.fill(-1);
    for (let i = 0; i < s; i++) {
      const r = dsf.canonify(i);
      if (minimal[r] === -1) minimal[r] = i;
    }

    numbers.fill(-1);
    for (let i = 0; i < s; i++) {
      if (grid[i] & F_BLOCK) {
        // Black clue: how many lines connect to this cell.
        let n = 0;
        if (i % w > 0 && grid[i - 1] & F_HOR) n++;
        if (i % w < w - 1 && grid[i + 1] & F_HOR) n++;
        if (Math.floor(i / w) > 0 && grid[i - w] & F_VER) n++;
        if (Math.floor(i / w) < h - 1 && grid[i + w] & F_VER) n++;
        numbers[i] = n;
      } else if (minimal[dsf.canonify(i)] === i) {
        // Length clue on a randomUpto-chosen cell of the segment (the
        // minimal cell is its leftmost/topmost, so `i + offset` stays
        // inside the run).
        const n = dsf.size(i);
        if (n === 1) numbers[i] = 1;
        else if (grid[i] & F_HOR) numbers[i + randomUpto(rng, n)] = n;
        else if (grid[i] & F_VER) numbers[i + w * randomUpto(rng, n)] = n;
      }
    }
  } while (sticksSolveGame(grid, numbers, w, h) !== "complete");

  // Greedy clue minimization: one shuffle, then keep each removal only
  // while the board still solves to completion.
  const spaces = Array.from({ length: s }, (_, i) => i);
  shuffle(spaces, rng);
  for (let j = 0; j < s; j++) {
    const i = spaces[j];
    const temp = numbers[i];
    if (temp === -1) continue;
    numbers[i] = -1;
    if (sticksSolveGame(grid, numbers, w, h) !== "complete") numbers[i] = temp;
  }

  return { desc: encodeDesc(grid, numbers, w, h) };
}
