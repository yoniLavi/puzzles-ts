/**
 * Pattern generator — faithful port of `generate` + `generate_soluble` in
 * pattern.c. Splatter random values, smooth them with one cellular-automaton
 * averaging pass, threshold at the median to make ~half the cells black,
 * then keep regenerating until the board is both non-trivial (no monochrome
 * row/column) and uniquely line-solvable by the ported solver.
 *
 * Byte-match note: upstream computes the value grid in **single-precision
 * `float`**, and the median threshold then decides each cell with a `>=`,
 * so reproducing the C desc bit-for-bit requires single-precision
 * arithmetic. We round every intermediate through `Math.fround`. A division
 * is computed in double then rounded to float (JS has no native single
 * divide), so a double-rounding ULP difference *could* in principle flip a
 * cell on a knife-edge value; the gated differential test is what proves the
 * match holds on real boards (see design D4 / playbook §4.3).
 */
import { type RandomState, randomUpto } from "../../random/index.ts";
import { isSoluble } from "./solver.ts";
import {
  computeRuns,
  encodeClues,
  GRID_EMPTY,
  GRID_FULL,
  type PatternParams,
} from "./state.ts";

const f = Math.fround;
/** Generous backstop: a faithful port always terminates here, so an
 * exceeded cap means a divergence, not a hard puzzle. */
const MAX_REGENERATE = 100000;

/** One CA-smoothed, median-thresholded random board (upstream `generate`),
 * written into `grid` as GRID_FULL / GRID_EMPTY. */
function generate(rs: RandomState, w: number, h: number, grid: Uint8Array): void {
  const n = w * h;
  let fgrid = new Float64Array(n); // holds float32-valued samples
  for (let i = 0; i < n; i++) {
    fgrid[i] = f(f(randomUpto(rs, 100000000)) / f(100000000));
  }

  // One averaging pass: each cell becomes the mean of its (up to) nine
  // neighbours. Special case: along a dimension of size 2 we don't average
  // (else a 2×2 grid would be four identical cells).
  const fgrid2 = new Float64Array(n);
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      let cnt = 0;
      let sx = 0;
      for (let p = -1; p <= 1; p++) {
        for (let q = -1; q <= 1; q++) {
          if (i + p < 0 || i + p >= h || j + q < 0 || j + q >= w) continue;
          if ((h === 2 && p !== 0) || (w === 2 && q !== 0)) continue;
          cnt++;
          sx = f(sx + fgrid[(i + p) * w + (j + q)]);
        }
      }
      fgrid2[i * w + j] = f(sx / cnt);
    }
  }
  fgrid = fgrid2;

  // Choose the threshold that makes (about) half the cells black.
  const sorted = Float64Array.from(fgrid).sort();
  let index = Math.floor((w * h) / 2);
  if (w & h & 1) index += randomUpto(rs, 2);
  const threshold = index < n ? sorted[index] : f(sorted[n - 1] + 1);

  for (let i = 0; i < n; i++) {
    grid[i] = fgrid[i] >= threshold ? GRID_FULL : GRID_EMPTY;
  }
}

/** Per-line run-length clues of a fully-decided grid (cols `0..w-1`, then
 * rows). */
function cluesOf(grid: Uint8Array, w: number, h: number): number[][] {
  const clues: number[][] = [];
  for (let i = 0; i < w; i++) clues.push(computeRuns(grid, i, h, w) ?? []);
  for (let i = 0; i < h; i++) clues.push(computeRuns(grid, i * w, w, 1) ?? []);
  return clues;
}

export function newPatternDesc(p: PatternParams, rng: RandomState): { desc: string } {
  const { w, h } = p;
  const grid = new Uint8Array(w * h);

  for (let tries = 0; tries < MAX_REGENERATE; tries++) {
    generate(rng, w, h, grid);

    // Reject a board with any monochrome row/column (too easy), except on
    // dimensions under 3 (else nothing would ever generate).
    let ok = true;
    if (w > 2) {
      for (let i = 0; i < h && ok; i++) {
        let colours = 0;
        for (let j = 0; j < w; j++) colours |= grid[i * w + j] === GRID_FULL ? 2 : 1;
        if (colours !== 3) ok = false;
      }
    }
    if (ok && h > 2) {
      for (let j = 0; j < w && ok; j++) {
        let colours = 0;
        for (let i = 0; i < h; i++) colours |= grid[i * w + j] === GRID_FULL ? 2 : 1;
        if (colours !== 3) ok = false;
      }
    }
    if (!ok) continue;

    const clues = cluesOf(grid, w, h);
    if (isSoluble(w, h, clues)) return { desc: encodeClues(clues) };
  }
  throw new Error(`pattern generator exceeded ${MAX_REGENERATE} attempts`);
}
