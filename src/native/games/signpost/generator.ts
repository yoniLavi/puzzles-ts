/**
 * Signpost generator — faithful port of upstream `new_game_desc`.
 *
 * (1) `new_game_fill`: grow a full 1..n path by a random head+tail walk;
 * (2) mark 1 and n immutable; (3) `new_game_strip`: add immutable
 * numbers until the solver can solve it, then remove redundant ones;
 * (4) encode. Byte-match-critical: the `random_upto`/`shuffle` call
 * order must match C exactly, so the walk's head-then-tail alternation
 * and the `cell_adj` enumeration order are ported verbatim.
 */

import { type RandomState, randomUpto } from "../../random/index.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { solveState } from "./solver.ts";
import {
  assignStateInto,
  blankInto,
  blankState,
  cloneState,
  dirOpposite,
  DXS,
  DYS,
  FLAG_IMMUTABLE,
  generateDesc,
  type SignpostParams,
  type SignpostState,
  stripNums,
  whichDirI,
} from "./state.ts";

/** Fill `ai`/`ad` with all non-numbered cells reachable from cell `i`
 * along each of the 8 directions; return the count. Enumeration order
 * (direction-major, outward) is byte-load-bearing. */
function cellAdj(
  s: SignpostState,
  i: number,
  ai: Int32Array,
  ad: Int32Array,
): number {
  const { w, h } = s;
  let n = 0;
  const sx = i % w;
  const sy = Math.floor(i / w);
  for (let a = 0; a < 8; a++) {
    let x = sx;
    let y = sy;
    const dx = DXS[a];
    const dy = DYS[a];
    for (;;) {
      x += dx;
      y += dy;
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      const newi = y * w + x;
      if (s.nums[newi] === 0) {
        ai[n] = newi;
        ad[n] = a;
        n++;
      }
    }
  }
  return n;
}

/** Grow a full 1..n path between `headi` and `taili`. Returns false if
 * the walk dead-ended or the two ends didn't line up (retry). */
function newGameFill(
  s: SignpostState,
  rng: RandomState,
  headi: number,
  taili: number,
): boolean {
  const aidx = new Int32Array(s.n);
  const adir = new Int32Array(s.n);

  s.nums.fill(0);
  s.nums[headi] = 1;
  s.nums[taili] = s.n;
  s.dirs[taili] = 0;
  let nfilled = 2;

  while (nfilled < s.n) {
    // Expand from headi; keep going while there's only one option.
    let an = cellAdj(s, headi, aidx, adir);
    do {
      if (an === 0) return false;
      const j = randomUpto(rng, an);
      s.dirs[headi] = adir[j];
      s.nums[aidx[j]] = s.nums[headi] + 1;
      nfilled++;
      headi = aidx[j];
      an = cellAdj(s, headi, aidx, adir);
    } while (an === 1);

    if (nfilled === s.n) break;

    // Expand to taili; keep going while there's only one option.
    an = cellAdj(s, taili, aidx, adir);
    do {
      if (an === 0) return false;
      const j = randomUpto(rng, an);
      s.dirs[aidx[j]] = dirOpposite(adir[j]);
      s.nums[aidx[j]] = s.nums[taili] - 1;
      nfilled++;
      taili = aidx[j];
      an = cellAdj(s, taili, aidx, adir);
    } while (an === 1);
  }

  // Point headi's arrow at taili; retry if they weren't in line.
  s.dirs[headi] = whichDirI(s, headi, taili);
  return s.dirs[headi] !== -1;
}

/** Ensure FLAG_IMMUTABLE is set on exactly the numbers needed to solve.
 * Returns true if it produced a solvable puzzle. Mirrors
 * `new_game_strip`. */
function newGameStrip(s: SignpostState, rng: RandomState): boolean {
  const copy = cloneState(s);

  stripNums(copy);
  if (solveState(copy) > 0) return true;

  const scratch: number[] = [];
  for (let i = 0; i < s.n; i++) scratch.push(i);
  shuffle(scratch, rng);

  let solved = false;
  // Add set numbers to empty squares until it becomes solvable.
  for (let i = 0; i < s.n; i++) {
    const j = scratch[i];
    if (copy.nums[j] > 0 && copy.nums[j] <= s.n) continue; // already solved here
    copy.nums[j] = s.nums[j];
    copy.flags[j] |= FLAG_IMMUTABLE;
    s.flags[j] |= FLAG_IMMUTABLE;
    stripNums(copy);
    if (solveState(copy) > 0) {
      solved = true;
      break;
    }
  }
  if (!solved) return false;

  // Try to remove numbers again and keep them out where still solvable
  // (never the anchors 1 and n).
  for (let i = 0; i < s.n; i++) {
    const j = scratch[i];
    if (s.flags[j] & FLAG_IMMUTABLE && s.nums[j] !== 1 && s.nums[j] !== s.n) {
      s.flags[j] &= ~FLAG_IMMUTABLE;
      assignStateInto(copy, s);
      stripNums(copy);
      if (solveState(copy) > 0) {
        // removal OK — leave it removed
      } else {
        copy.nums[j] = s.nums[j];
        s.flags[j] |= FLAG_IMMUTABLE;
      }
    }
  }
  return true;
}

export function newSignpostDesc(
  p: SignpostParams,
  rng: RandomState,
): { desc: string } {
  if (p.w === 1 && p.h === 1) return { desc: "1a" };

  const s = blankState(p);
  for (;;) {
    blankInto(s);

    // Keep trying head/tail choices until we fill successfully.
    let headi = 0;
    let taili = 0;
    do {
      if (p.forceCornerStart) {
        headi = 0;
        taili = s.n - 1;
      } else {
        do {
          headi = randomUpto(rng, s.n);
          taili = randomUpto(rng, s.n);
        } while (headi === taili);
      }
    } while (!newGameFill(s, rng, headi, taili));

    s.flags[headi] |= FLAG_IMMUTABLE;
    s.flags[taili] |= FLAG_IMMUTABLE;

    if (!newGameStrip(s, rng)) continue; // regenerate
    stripNums(s);
    return { desc: generateDesc(s, false) };
  }
}
