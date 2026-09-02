/**
 * Clusters generator — port of `clusters_generate` / `new_game_desc` in
 * `puzzles/unreleased/clusters.c`.
 *
 * This is the byte-match surface (see clusters-differential.test.ts): under
 * {@link ClustersGenerateOptions.upstreamLooseGate} the only randomness is one
 * `randomUpto(rs, 2)` per cell, and the solver is deterministic, so the emitted
 * desc is a pure function of the seed and reproduces the C byte-for-byte. The
 * scan orders, the flip-and-restart `break`, and the `force`-every-100 cadence
 * are transcribed verbatim — each decides the outcome.
 *
 * The two difficulty tiers (`add-clusters-difficulty-tiers`) change only *which
 * candidates are kept*, never how one is built. The single extra draw they can
 * make — the cell perturbed when a Tricky candidate turns out too easy — is
 * unreachable on the loose path, so the oracle above is untouched.
 */
import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import {
  type ClustersStatus,
  COMPLETE,
  INVALID,
  solveGame,
  UNFINISHED,
} from "./solver.ts";
import {
  type ClustersParams,
  COLMASK,
  DIFF_EASY,
  DIFF_TRICKY,
  encodeDesc,
  F_COLOR_0,
  F_COLOR_1,
  F_SINGLE,
} from "./state.ts";

const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

/** The cadence at which a stuck run re-randomizes every cell rather than only
 * the blank ones (upstream `clusters_generate`'s `force` argument). */
const FORCE_EVERY = 100;

/** Count same-color orthogonal neighbors of cell `(x,y)` for color `col`. */
function sameNeighbors(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  col: number,
): number {
  let count = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    if ((grid[ny * w + nx] & COLMASK) === col) count++;
  }
  return count;
}

/**
 * One generation attempt (upstream `clusters_generate`). Fills the grid with a
 * candidate puzzle in place and returns the solver verdict the caller gates on:
 *
 *  1. Two-color every cell at random (`force`, or only the still-blank ones).
 *  2. Repeatedly flip the first cell with **zero** same-color neighbors,
 *     rescanning from the top after each flip, until none remains.
 *  3. Reduce to clues: a cell with exactly one same-color neighbor becomes a
 *     dot (`F_SINGLE`); every other cell is cleared.
 *  4. Prune adjacent equal dot pairs (two adjacent identical dots are mutually
 *     derivable): in scan order, clear a dot and its left/upper twin.
 *  5. Gate: solve the resulting puzzle at the requested tier — and, above the
 *     easiest tier, reject it if the tier below already solves it (see
 *     {@link ClustersGenerateOptions.upstreamLooseGate}).
 *
 * Steps 1–4 are untouched by the tiers: every board this emits comes from the
 * same candidate stream, and the tier only decides which candidates are kept.
 */
function clustersGenerate(
  grid: Uint8Array,
  w: number,
  h: number,
  rng: RandomState,
  force: boolean,
  diff: number,
  loose: boolean,
): ClustersStatus {
  const s = w * h;
  const counts = new Int32Array(s);

  // 1. Random two-color fill. `randomUpto(rs, 2) ? F_COLOR_0 : F_COLOR_1` —
  //    1 → red, 0 → blue (the whole RNG draw the desc depends on).
  for (let i = 0; i < s; i++) {
    if (force || !grid[i]) grid[i] = randomUpto(rng, 2) ? F_COLOR_0 : F_COLOR_1;
  }

  // 2. Flip isolated cells until none remain, restarting the scan after each
  //    flip (the `break` is load-bearing for byte-match). The final pass, which
  //    finds nothing to flip, leaves `counts` holding the settled neighbor
  //    counts step 3 reads.
  let reset = true;
  while (reset) {
    reset = false;
    for (let i = 0; i < s; i++) {
      const x = i % w;
      const y = (i - x) / w;
      counts[i] = sameNeighbors(grid, w, h, x, y, grid[i] & COLMASK);
    }
    for (let i = 0; i < s; i++) {
      if (counts[i] === 0) {
        grid[i] ^= COLMASK; // swap this cell's color
        reset = true;
        break;
      }
    }
  }

  // 3. Cells with exactly one same-color neighbor become dot clues; clear all
  //    others.
  for (let i = 0; i < s; i++) {
    if (counts[i] === 1) grid[i] |= F_SINGLE;
    else grid[i] = 0;
  }

  // 4. Prune adjacent identical dot pairs.
  for (let i = 0; i < s; i++) {
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && grid[i] & F_SINGLE && grid[i] === grid[i - 1]) {
      grid[i] = 0;
      grid[i - 1] = 0;
    } else if (y > 0 && grid[i] & F_SINGLE && grid[i] === grid[i - w]) {
      grid[i] = 0;
      grid[i - w] = 0;
    }
  }

  // The pre-tier gate: solve at the deeper rung, accept on completion.
  if (loose) return solveGame(grid, w, h, 1);

  // The tiers are named after the solver's own two rungs and share its scale, so
  // a tier *is* the `maxdiff` to solve at. The easy rung goes first, on the grid
  // itself: it is much the cheaper of the two, and running it to its fixpoint
  // before the lookahead costs the deeper solve nothing, because `solveGame`
  // begins with that same fixpoint and the deduction is confluent (a refuted
  // coloring stays refuted as more cells fill in — see solver.ts), so the
  // two-call sequence reaches the identical grid.
  const easy = solveGame(grid, w, h, DIFF_EASY);
  if (diff === DIFF_EASY) return easy;

  // Tricky, and the single-cell rule alone finished it — so this board does not
  // need the tier the player asked for. Rejecting it takes more than returning
  // "no": every other rejection leaves a *partly* solved grid whose blank cells
  // the next attempt re-randomizes, but a completed one has no blank cells left,
  // so step 1 would change nothing and draw no randomness, step 2 would find no
  // isolated cell in a solved board, and step 3 would re-derive the very same
  // clues — a fixed point that spins for ever.
  //
  // One flipped cell is enough to break it, and is much the better break: this
  // retry loop is a hill-climb rather than independent sampling — it keeps what
  // the solver proved and re-rolls the rest — so clearing the grid instead would
  // throw away the whole climb and buy a fresh one on every too-easy candidate.
  // Measured over 50 seeds: clearing costs 5x the median at 7x7 (316 ms against
  // 66) and 7x at 8x8, where its worst case is 20.7 s against 3.7 s (design D4).
  if (easy === COMPLETE) {
    const i = randomUpto(rng, s);
    grid[i] ^= COLMASK;
    return UNFINISHED;
  }

  // A contradiction is an ordinary rejection at either tier, as it always was.
  if (easy === INVALID) return INVALID;

  return solveGame(grid, w, h, DIFF_TRICKY);
}

/**
 * Attempts before the generator gives up — the house default (`MAX_REGENERATE`).
 *
 * Clusters had **no** bound before the tiers: the old `MAX_ATTEMPTS` named only
 * the `force` cadence and nothing counted. That was survivable by accident — one
 * acceptance test whose every rejection leaves deduced cells behind cannot reject
 * for ever — and a second test removes the accident. A synchronous generator that
 * cannot succeed owns its thread outright; see `engine/retry-limit.ts`.
 *
 * The bound is not decorative and is not near any legal configuration. The tiers
 * that `validateParams` allows converge in well under a second of attempts at
 * every offered size (10×10 Tricky, the slowest: 1.4 s median, 10.9 s worst over
 * 50 seeds), while a board too small to admit a Tricky puzzle spends the whole
 * budget and reports failure in 0.4 s at 2×2 and 1.7 s at 3×3 — which is how the
 * size floor in `state.ts` was measured.
 */
const MAX_ATTEMPTS = 10_000;

export interface ClustersGenerateOptions {
  /**
   * Reproduce the pre-tier gate verbatim: solve at the deeper rung whatever the
   * tier, and accept any board it completes.
   *
   * Clusters shipped with that one gate, so every board was "solvable with one
   * hypothetical" and none was *required* to need one — measured, 50–64% of them
   * (by board size) fall to the single-cell rule alone. Gating Tricky on "and
   * not solvable one rung down" is what makes the setting bind, and because the
   * generator is solver-gated it changes which candidates are kept, hence every
   * Tricky description.
   *
   * This flag keeps the byte-match oracle that validates the generator, the
   * solver's exact deductive power and the run-length codec in one assertion:
   * `clusters-differential.test.ts` sets it, and nothing else ever should. The
   * oracle's blind spot is therefore exactly the `if (loose)` branch above and
   * the tier arithmetic around it.
   */
  readonly upstreamLooseGate?: boolean;
}

export function newClustersDesc(
  p: ClustersParams,
  rng: RandomState,
  options: ClustersGenerateOptions = {},
): { desc: string } {
  const { w, h } = p;
  const loose = options.upstreamLooseGate ?? false;
  const grid = new Uint8Array(w * h);
  const attempt = retryLimit("clusters: generation attempts", MAX_ATTEMPTS);
  let attempts = 0;
  let force = false;
  while (clustersGenerate(grid, w, h, rng, force, p.diff, loose) !== COMPLETE) {
    attempt();
    attempts++;
    force = attempts % FORCE_EVERY === 0;
  }
  return { desc: encodeDesc(grid, w, h) };
}
