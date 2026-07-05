/**
 * Signpost solver — the single forced-link deduction iterated to a
 * fixpoint (upstream `solve_single` + `solve_state`).
 *
 * The one rule: if a cell has exactly one legal cell it may link *to*,
 * make that link; symmetrically, if exactly one cell may link *to* a
 * given cell, make that link. Iterating this with `updateNumbers`
 * solves every board this fork generates (the generator is
 * solver-gated on exactly this power).
 */

import {
  assignStateInto,
  checkCompletion,
  cloneState,
  DXS,
  DYS,
  isValidMove,
  makeLink,
  type SignpostState,
  updateNumbers,
} from "./state.ts";

/** Make every forced link. Reads `state`, writes links into `copy`;
 * returns the number of links made, or -1 if a contradiction is found. */
function solveSingle(
  state: SignpostState,
  copy: SignpostState,
  from: Int32Array,
): number {
  const { w, n } = state;
  let nlinks = 0;
  from.fill(-1);

  // For each cell, find its sole legal successor.
  for (let i = 0; i < n; i++) {
    if (state.next[i] !== -1) continue;
    if (state.nums[i] === n) continue; // no next from the last number

    const d = state.dirs[i];
    let poss = -1;
    const sx = i % w;
    const sy = Math.floor(i / w);
    let x = sx;
    let y = sy;
    for (;;) {
      x += DXS[d];
      y += DYS[d];
      if (x < 0 || x >= w || y < 0 || y >= state.h) break;
      if (!isValidMove(state, true, sx, sy, x, y)) continue;

      const j = y * w + x;
      if (state.prev[j] !== -1) continue; // can't break a back-link

      if (
        state.nums[i] > 0 &&
        state.nums[j] > 0 &&
        state.nums[i] <= n &&
        state.nums[j] <= n &&
        state.nums[j] === state.nums[i] + 1
      ) {
        poss = j;
        from[j] = i;
        break;
      }

      poss = poss === -1 ? j : -2;
      from[j] = from[j] === -1 ? i : -2;
    }
    if (poss === -2) {
      // multiple candidates — no deduction
    } else if (poss === -1) {
      copy.impossible = true;
      return -1;
    } else {
      makeLink(copy, i, poss);
      nlinks++;
    }
  }

  // For each cell, find its sole legal predecessor.
  for (let i = 0; i < n; i++) {
    if (state.prev[i] !== -1) continue;
    if (state.nums[i] === 1) continue; // no prev from the first number

    if (from[i] === -1) {
      copy.impossible = true;
      return -1;
    }
    if (from[i] === -2) {
      // multiple candidates — no deduction
    } else {
      makeLink(copy, from[i], i);
      nlinks++;
    }
  }

  return nlinks;
}

/**
 * Solve `state` in place. Returns 1 if solved, 0 if stuck, -1 if
 * impossible. Mirrors upstream `solve_state`.
 */
export function solveState(state: SignpostState): number {
  const copy = cloneState(state);
  const scratch = new Int32Array(state.n);

  for (;;) {
    updateNumbers(state);
    if (solveSingle(state, copy, scratch)) {
      assignStateInto(state, copy);
      if (state.impossible) break;
      continue;
    }
    break;
  }

  updateNumbers(state);
  if (state.impossible) return -1;
  return checkCompletion(state, false) ? 1 : 0;
}
