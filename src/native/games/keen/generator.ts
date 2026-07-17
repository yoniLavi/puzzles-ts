/**
 * Keen generator — port of `new_game_desc` from `keen.c`.
 *
 * Generate a full Latin square as the solution, partition it into cages
 * (random dominoes, then fold the remaining singletons into neighbours), choose
 * a balanced mix of cage operations + values avoiding low-quality clues, then
 * accept the board only when the graded solver solves it at *exactly* the target
 * difficulty (regenerate otherwise). RNG-faithful to upstream over the
 * bit-identical `random.ts`, so the emitted desc matches C byte-for-byte for the
 * same seed.
 */

import { Dsf } from "../../engine/dsf.ts";
import { latinGenerate } from "../../engine/latin.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { solveKeen } from "./solver.ts";
import {
  buildMinimal,
  C_ADD,
  C_DIV,
  C_MUL,
  C_SUB,
  CMASK,
  clueVal,
  DIFF_NORMAL,
  diffToLevel,
  encodeBlockStructure,
  type KeenParams,
  MAXBLK,
} from "./state.ts";

// Per-block clue-type candidate flags (upstream F_* + BAD_SHIFT). The "bad"
// variant (`<< BAD_SHIFT`) marks a low-quality clue used only as a fallback.
const F_ADD = 0x01;
const F_SUB = 0x02;
const F_MUL = 0x04;
const F_DIV = 0x08;
const BAD_SHIFT = 4;

export function newKeenDesc(
  p: KeenParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const w = p.w;
  const a = w * w;
  // 3×3 puzzles at Hard or above are not generable — dial down (faithful).
  let diff = diffToLevel(p.diff);
  if (w === 3 && diff > DIFF_NORMAL) diff = DIFF_NORMAL;

  const order: number[] = new Array(a);
  const revorder = new Int32Array(a);
  const singletons = new Int32Array(a);
  const dsf = new Dsf(a);
  const clues = new Int32Array(a);
  const cluevals = new Int32Array(a);
  let grid!: Int32Array;
  let minimal!: Int32Array;

  const attempt = retryLimit(`keen: generation (${w}d${diff})`);
  while (true) {
    attempt();

    // Latin square solution.
    grid = latinGenerate(w, rng);

    for (let i = 0; i < a; i++) order[i] = i;
    shuffle(order, rng);
    for (let i = 0; i < a; i++) revorder[order[i]] = i;

    for (let i = 0; i < a; i++) singletons[i] = 1;
    dsf.reinit();

    // Place dominoes at random (prob 3/4), preferring the lowest-revorder
    // available neighbour.
    for (let i = 0; i < a; i++) {
      if (!singletons[i]) continue;
      let best = -1;
      const x = i % w;
      const y = (i / w) | 0;
      if (
        x > 0 &&
        singletons[i - 1] &&
        (best === -1 || revorder[i - 1] < revorder[best])
      )
        best = i - 1;
      if (
        x + 1 < w &&
        singletons[i + 1] &&
        (best === -1 || revorder[i + 1] < revorder[best])
      )
        best = i + 1;
      if (
        y > 0 &&
        singletons[i - w] &&
        (best === -1 || revorder[i - w] < revorder[best])
      )
        best = i - w;
      if (
        y + 1 < w &&
        singletons[i + w] &&
        (best === -1 || revorder[i + w] < revorder[best])
      )
        best = i + w;
      if (best >= 0 && randomUpto(rng, 4)) {
        singletons[i] = singletons[best] = 0;
        dsf.merge(i, best);
      }
    }

    // Fold remaining singletons into a neighbouring block under MAXBLK.
    for (let i = 0; i < a; i++) {
      if (!singletons[i]) continue;
      let best = -1;
      const x = i % w;
      const y = (i / w) | 0;
      if (
        x > 0 &&
        dsf.size(i - 1) < MAXBLK &&
        (best === -1 || revorder[i - 1] < revorder[best])
      )
        best = i - 1;
      if (
        x + 1 < w &&
        dsf.size(i + 1) < MAXBLK &&
        (best === -1 || revorder[i + 1] < revorder[best])
      )
        best = i + 1;
      if (
        y > 0 &&
        dsf.size(i - w) < MAXBLK &&
        (best === -1 || revorder[i - w] < revorder[best])
      )
        best = i - w;
      if (
        y + 1 < w &&
        dsf.size(i + w) < MAXBLK &&
        (best === -1 || revorder[i + w] < revorder[best])
      )
        best = i + w;
      if (best >= 0) {
        singletons[i] = singletons[best] = 0;
        dsf.merge(i, best);
      }
    }

    // Any stranded singleton ⇒ start over.
    let stranded = false;
    for (let i = 0; i < a; i++) if (singletons[i]) stranded = true;
    if (stranded) continue;

    minimal = buildMinimal(dsf, a);

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
        // Domino: both numbers known. Sort into p ≥ q.
        let pp = grid[j];
        let qq = grid[i];
        if (pp < qq) {
          const t = pp;
          pp = qq;
          qq = t;
        }
        // Addition: avoid sums too small/large (only one option), else allowed.
        let v = pp + qq;
        if (v > 4 && v < 2 * w - 2) singletons[j] |= F_ADD;
        else singletons[j] |= F_ADD << BAD_SHIFT;
        // Multiplication: above Normal, prefer products with multiple options.
        v = pp * qq;
        let n = 0;
        for (let kk = 1; kk <= w; kk++)
          if (v % kk === 0 && v / kk <= w && v / kk !== kk) n++;
        if (n <= 2 && diff > DIFF_NORMAL) singletons[j] |= F_MUL << BAD_SHIFT;
        else singletons[j] |= F_MUL;
        // Subtraction: avoid a difference of w−1.
        v = pp - qq;
        if (v < w - 1) singletons[j] |= F_SUB;
        // Division: integer quotient ≤ w/2.
        if (pp % qq === 0 && 2 * ((pp / qq) | 0) <= w) singletons[j] |= F_DIV;
      }
    }

    // Choose a clue per block, keeping the type counts even (DIV, SUB, MUL, ADD
    // in turn), preferring the "good" candidates then falling back to "bad".
    shuffle(order, rng);
    clues.fill(0);
    while (true) {
      let doneSomething = false;
      for (let k = 0; k < 4; k++) {
        let clue: number;
        let good: number;
        switch (k) {
          case 0:
            clue = C_DIV;
            good = F_DIV;
            break;
          case 1:
            clue = C_SUB;
            good = F_SUB;
            break;
          case 2:
            clue = C_MUL;
            good = F_MUL;
            break;
          default:
            clue = C_ADD;
            good = F_ADD;
            break;
        }

        let i = 0;
        for (; i < a; i++) {
          const j = order[i];
          if (singletons[j] & good) {
            clues[j] = clue;
            singletons[j] = 0;
            break;
          }
        }
        if (i === a) {
          const bad = good << BAD_SHIFT;
          for (i = 0; i < a; i++) {
            const j = order[i];
            if (singletons[j] & bad) {
              clues[j] = clue;
              singletons[j] = 0;
              break;
            }
          }
        }
        if (i < a) doneSomething = true;
      }
      if (!doneSomething) break;
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
    if (diff > 0) {
      const soln = new Uint8Array(a);
      const ret = solveKeen(w, kclues, soln, diff - 1);
      if (ret <= diff - 1) continue; // too easy
    }
    const soln = new Uint8Array(a);
    const ret = solveKeen(w, kclues, soln, diff);
    if (ret !== diff) continue; // not exactly this difficulty

    // Got a usable puzzle.
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
  const a = w * w;
  let desc = encodeBlockStructure(w, dsf);
  desc += ",";
  for (let i = 0; i < a; i++) {
    if (minimal[i] !== i) continue;
    switch (clues[i] & CMASK) {
      case C_ADD:
        desc += "a";
        break;
      case C_SUB:
        desc += "s";
        break;
      case C_MUL:
        desc += "m";
        break;
      case C_DIV:
        desc += "d";
        break;
    }
    desc += String(clueVal(clues[i]));
  }
  return desc;
}

function encodeAux(soln: Uint8Array): string {
  let s = "S";
  for (let i = 0; i < soln.length; i++) s += String.fromCharCode(48 + soln[i]);
  return s;
}
