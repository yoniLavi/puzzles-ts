/**
 * Keen generator — port of `new_game_desc` from `keen.c`.
 *
 * Generate a full Latin square as the solution, partition it into cages
 * (random dominoes, then fold the remaining singletons into neighbors), choose
 * a balanced mix of cage operations + values avoiding low-quality clues, then
 * accept the board only when the graded solver solves it at *exactly* the target
 * difficulty (regenerate otherwise). RNG-faithful to upstream over the
 * bit-identical `random.ts`, so the emitted desc matches C byte-for-byte for the
 * same seed.
 */

import { Dsf } from "../../engine/dsf.ts";
import { latinGenerate } from "../../engine/latin.ts";
import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { solveKeen } from "./solver.ts";
import {
  buildMinimal,
  C_ADD,
  C_DIV,
  C_MUL,
  C_SUB,
  clueOp,
  clueVal,
  DIFF_NORMAL,
  diffToLevel,
  encodeBlockStructure,
  type KeenParams,
  LETTER_OF_OP,
  MAXBLK,
} from "./state.ts";

// Per-block clue-type candidate flags (upstream F_* + BAD_SHIFT). The "bad"
// variant (`<< BAD_SHIFT`) marks a low-quality clue used only as a fallback.
const F_ADD = 0x01;
const F_SUB = 0x02;
const F_MUL = 0x04;
const F_DIV = 0x08;
const BAD_SHIFT = 4;

/** The order the balanced clue assignment deals operations in, each with its
 * candidate flag. */
const DEAL_ORDER = [
  [C_DIV, F_DIV],
  [C_SUB, F_SUB],
  [C_MUL, F_MUL],
  [C_ADD, F_ADD],
] as const;

export function newKeenDesc(
  p: KeenParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const w = p.w;
  const a = w * w;
  // 3×3 puzzles above Normal are not generable — dial down (faithful).
  let diff = diffToLevel(p.diff);
  if (w === 3 && diff > DIFF_NORMAL) diff = DIFF_NORMAL;

  const order: number[] = new Array(a);
  const revorder = new Int32Array(a);
  const singletons = new Int32Array(a);
  const dsf = new Dsf(a);
  const clues = new Int32Array(a);
  const cluevals = new Int32Array(a);

  /** The neighbor of `i` passing `ok` that comes first in `order`, or -1. */
  const bestNeighbor = (i: number, ok: (j: number) => boolean): number => {
    let best = -1;
    const consider = (j: number, inGrid: boolean): void => {
      if (inGrid && ok(j) && (best === -1 || revorder[j] < revorder[best])) best = j;
    };
    consider(i - 1, i % w > 0);
    consider(i + 1, i % w < w - 1);
    consider(i - w, i >= w);
    consider(i + w, i + w < a);
    return best;
  };

  /** Give `clue` to the first block in `order` whose flags include `flag`. */
  const deal = (clue: number, flag: number): boolean => {
    for (const j of order) {
      if (singletons[j] & flag) {
        clues[j] = clue;
        singletons[j] = 0;
        return true;
      }
    }
    return false;
  };

  const attempt = retryLimit(`keen: generation (${w}d${diff})`);
  while (true) {
    attempt();

    // Latin square solution.
    const grid = latinGenerate(w, rng);

    for (let i = 0; i < a; i++) order[i] = i;
    shuffle(order, rng);
    for (let i = 0; i < a; i++) revorder[order[i]] = i;

    singletons.fill(1);
    dsf.reinit();

    // Place dominoes at random (prob 3/4), preferring the lowest-revorder
    // available neighbor.
    for (let i = 0; i < a; i++) {
      if (!singletons[i]) continue;
      const best = bestNeighbor(i, (j) => singletons[j] !== 0);
      if (best >= 0 && randomUpto(rng, 4)) {
        singletons[i] = singletons[best] = 0;
        dsf.merge(i, best);
      }
    }

    // Fold remaining singletons into a neighboring block under MAXBLK.
    for (let i = 0; i < a; i++) {
      if (!singletons[i]) continue;
      const best = bestNeighbor(i, (j) => dsf.size(j) < MAXBLK);
      if (best >= 0) {
        singletons[i] = singletons[best] = 0;
        dsf.merge(i, best);
      }
    }

    // Any stranded singleton ⇒ start over.
    if (singletons.includes(1)) continue;

    const minimal = buildMinimal(dsf, a);

    // Decide acceptable clue types per block (singletons reused as a flag
    // bitmap, keyed at each block's minimal cell).
    for (let i = 0; i < a; i++) {
      singletons[i] = 0;
      const j = minimal[i];
      const k = dsf.size(j);
      if (p.multiplicationOnly) {
        singletons[j] = F_MUL;
      } else if (j === i && k > 2) {
        singletons[j] |= F_ADD | F_MUL;
      } else if (j !== i && k === 2) {
        // Domino: both numbers known.
        const hi = Math.max(grid[i], grid[j]);
        const lo = Math.min(grid[i], grid[j]);
        // Addition: avoid sums too small/large (only one option), else allowed.
        let v = hi + lo;
        if (v > 4 && v < 2 * w - 2) singletons[j] |= F_ADD;
        else singletons[j] |= F_ADD << BAD_SHIFT;
        // Multiplication: above Normal, prefer products with multiple options.
        v = hi * lo;
        let n = 0;
        for (let kk = 1; kk <= w; kk++)
          if (v % kk === 0 && v / kk <= w && v / kk !== kk) n++;
        if (n <= 2 && diff > DIFF_NORMAL) singletons[j] |= F_MUL << BAD_SHIFT;
        else singletons[j] |= F_MUL;
        // Subtraction: avoid a difference of w−1.
        v = hi - lo;
        if (v < w - 1) singletons[j] |= F_SUB;
        // Division: integer quotient ≤ w/2.
        if (hi % lo === 0 && 2 * ((hi / lo) | 0) <= w) singletons[j] |= F_DIV;
      }
    }

    // Choose a clue per block, keeping the type counts even (dealing each
    // operation in turn), preferring the "good" candidates then falling back to
    // "bad".
    shuffle(order, rng);
    clues.fill(0);
    let dealt = true;
    while (dealt) {
      dealt = false;
      for (const [clue, good] of DEAL_ORDER)
        if (deal(clue, good) || deal(clue, good << BAD_SHIFT)) dealt = true;
    }

    // Compute the clue values from the solution.
    cluevals.fill(0);
    for (let i = 0; i < a; i++) {
      const j = minimal[i];
      if (j === i) {
        cluevals[j] = grid[i];
      } else {
        switch (clues[j]) {
          case C_ADD:
            cluevals[j] += grid[i];
            break;
          case C_MUL:
            cluevals[j] *= grid[i];
            break;
          case C_SUB:
            cluevals[j] = Math.abs(cluevals[j] - grid[i]);
            break;
          case C_DIV: {
            const d1 = cluevals[j];
            const d2 = grid[i];
            cluevals[j] = d1 === 0 || d2 === 0 ? 0 : ((d2 / d1) | 0) + ((d1 / d2) | 0);
            break;
          }
        }
      }
    }
    for (let i = 0; i < a; i++) {
      const j = minimal[i];
      if (j === i) clues[j] |= cluevals[j];
    }

    // Require solvable at exactly the target difficulty.
    const kclues = { w, dsf, minimal, clues };
    if (diff > 0 && solveKeen(w, kclues, new Uint8Array(a), diff - 1) <= diff - 1)
      continue; // too easy
    const soln = new Uint8Array(a);
    if (solveKeen(w, kclues, soln, diff) !== diff) continue;

    return {
      desc: encodeDesc(w, dsf, minimal, clues),
      aux: encodeAux(soln),
    };
  }
}

function encodeDesc(
  w: number,
  dsf: Dsf,
  minimal: Int32Array,
  clues: Int32Array,
): string {
  let desc = `${encodeBlockStructure(w, dsf)},`;
  for (let i = 0; i < w * w; i++) {
    if (minimal[i] === i) desc += LETTER_OF_OP[clueOp(clues[i])] + clueVal(clues[i]);
  }
  return desc;
}

function encodeAux(soln: Uint8Array): string {
  let s = "S";
  for (let i = 0; i < soln.length; i++) s += String.fromCharCode(48 + soln[i]);
  return s;
}
