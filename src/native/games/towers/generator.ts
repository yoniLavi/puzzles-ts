/**
 * Towers (Skyscrapers) generator — port of `new_game_desc` from `towers.c`.
 *
 * Generate a full Latin square as the solution, read off all `4w` edge clues,
 * then remove grid givens (and, above Easy, clues) one at a time for as long as
 * the graded solver still solves the board at the target difficulty —
 * regenerating until the board is solvable at *exactly* that difficulty and no
 * lower. RNG-faithful to upstream over the bit-identical `random.ts`, so the
 * emitted desc matches C byte-for-byte for the same seed.
 */

import { latinGenerate } from "../../engine/latin.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { solveTowers } from "./solver.ts";
import {
  DIFF_EASY,
  DIFF_HARD,
  diffToLevel,
  lineCells,
  type TowersParams,
} from "./state.ts";

export function newTowersDesc(
  p: TowersParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const w = p.w;
  const a = w * w;
  let diff = diffToLevel(p.diff);

  // Some size/difficulty combinations can't be satisfied (all such puzzles are
  // actually easier); fall back, exactly as upstream.
  if (diff > DIFF_HARD && w <= 3) diff = DIFF_HARD;

  const clues = new Int32Array(4 * w);
  const grid = new Uint8Array(a);
  const soln = new Uint8Array(a);
  const soln2 = new Uint8Array(a);

  const attempt = retryLimit(`towers: generation (${w}d${p.diff})`, 1000);
  while (true) {
    attempt();

    // Construct a Latin square as the solution.
    const latin = latinGenerate(w, rng);
    for (let i = 0; i < a; i++) grid[i] = latin[i];

    // Read off the clues from the full grid.
    for (let i = 0; i < 4 * w; i++) {
      const cells = lineCells(i, w);
      let best = 0;
      let k = 0;
      for (let j = 0; j < w; j++) {
        const v = grid[cells[j].y * w + cells[j].x];
        if (v > best) {
          best = v;
          k++;
        }
      }
      clues[i] = k;
    }

    // Keep the full solution for `aux`.
    soln.set(grid);

    if (diff === DIFF_EASY && w <= 5) {
      // Small Easy grids: prefer completely empty ones if solvable from clues.
      soln2.fill(0);
      const ret = solveTowers(w, clues, soln2, diff);
      if (ret > diff) continue;
    }

    // Remove grid givens for as long as the puzzle stays solvable.
    const order: number[] = [];
    for (let i = 0; i < a; i++) order[i] = i;
    shuffle(order, rng);
    for (let i = 0; i < a; i++) {
      const j = order[i];
      soln2.set(grid);
      soln2[j] = 0;
      const ret = solveTowers(w, clues, soln2, diff);
      if (ret <= diff) grid[j] = 0;
    }

    // Above Easy, also try removing clues (Easy keeps every clue).
    if (diff > DIFF_EASY) {
      const corder: number[] = [];
      for (let i = 0; i < 4 * w; i++) corder[i] = i;
      shuffle(corder, rng);
      for (let i = 0; i < 4 * w; i++) {
        const j = corder[i];
        const clue = clues[j];
        soln2.set(grid);
        clues[j] = 0;
        const ret = solveTowers(w, clues, soln2, diff);
        if (ret > diff) clues[j] = clue;
      }
    }

    // Must be solvable at exactly this difficulty, not below.
    soln2.set(grid);
    const ret = solveTowers(w, clues, soln2, diff);
    if (ret !== diff) continue;

    break;
  }

  return { desc: encodeDesc(w, clues, grid), aux: encodeAux(soln) };
}

function encodeDesc(w: number, clues: Int32Array, grid: Uint8Array): string {
  const a = w * w;
  let p = "";
  for (let i = 0; i < 4 * w; i++) {
    if (i) p += "/";
    if (clues[i]) p += String(clues[i]);
  }

  // Any givens at all?
  let any = false;
  for (let i = 0; i < a; i++) {
    if (grid[i]) {
      any = true;
      break;
    }
  }
  if (any) {
    p += ",";
    let run = 0;
    for (let i = 0; i <= a; i++) {
      const n = i < a ? grid[i] : -1;
      if (n === 0) {
        run++;
      } else {
        if (run) {
          while (run > 0) {
            const thisrun = Math.min(run, 26);
            p += String.fromCharCode(thisrun - 1 + 97);
            run -= thisrun;
          }
        } else if (i > 0 && n > 0) {
          // No unnecessary '_' before the very first or after the very last.
          p += "_";
        }
        if (n > 0) p += String(n);
        run = 0;
      }
    }
  }

  return p;
}

function encodeAux(soln: Uint8Array): string {
  let s = "S";
  for (let i = 0; i < soln.length; i++) s += String(soln[i]);
  return s;
}
