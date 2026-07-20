/**
 * Group generator — a faithful port of `group.c`'s `new_game_desc`.
 *
 * Shape: pick a group of order `w` from the static {@link GROUP_DATA} table,
 * decompress it into a full Cayley table by BFS, randomly permute its
 * (non-identity) elements, then remove clues one at a time while the puzzle
 * stays solvable at the target difficulty. The generator is *solver-gated*, so
 * the emitted desc depends on the solver's verdict at every step — which is
 * exactly why one byte-match differential validates the whole solver + codec
 * chain (design D8).
 *
 * RNG-faithful: the only draws are `randomUpto` (group choice, the extra
 * blanked row/column in identity-hidden mode) and `shuffle` (element
 * permutation, clue-removal order), reproduced in C's order so generation is
 * byte-for-byte identical.
 */

import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { GROUP_DATA, GROUPS } from "./groupdata.ts";
import { solveGroup } from "./solver.ts";
import {
  DIFF_EXTREME,
  DIFF_HARD,
  DIFF_NORMAL,
  DIFF_UNREASONABLE,
  encodeGrid,
  type GroupParams,
  toChar,
} from "./state.ts";

/** Shuffle `arr[start..start+len)` in place, matching C's
 * `shuffle(arr + start, len, …)` draw order (design/byte-parity). */
function shuffleRange(
  arr: Uint8Array,
  start: number,
  len: number,
  rng: RandomState,
): void {
  const slice: number[] = [];
  for (let i = 0; i < len; i++) slice.push(arr[start + i]);
  shuffle(slice, rng);
  for (let i = 0; i < len; i++) arr[start + i] = slice[i];
}

export function newGameDesc(
  p: GroupParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const w = p.w;
  const a = w * w;

  // Difficulty exceptions: some size/difficulty combinations cannot be met
  // because every puzzle of at most that difficulty is actually even easier.
  // Port the four guards verbatim — they change which puzzles generate.
  let diff = p.diff;
  if (w < 5 && diff === DIFF_UNREASONABLE) diff--;
  if ((w < 5 || ((w === 6 || w === 8) && p.id)) && diff === DIFF_EXTREME) diff--;
  if ((w < 6 || (w === 6 && p.id)) && diff === DIFF_HARD) diff--;
  if ((w < 4 || (w === 4 && p.id)) && diff === DIFF_NORMAL) diff--;

  const grid = new Uint8Array(a); // the puzzle grid being carved down
  const soln = new Uint8Array(a); // canonical table, then the full solution
  const scratch = new Uint8Array(a); // solver working copy
  const queue = new Int32Array(a); // BFS queue of element numbers
  const perm = new Uint8Array(w); // element permutation

  const attempt = retryLimit(`group: generation (${w}d${diff}${p.id ? "" : "i"})`);

  while (true) {
    attempt();

    // Pick a group of order w and decompress it into a canonical table `soln`
    // by BFS, using `queue` as the work list. Row 0 (element 1) is the identity
    // row 1,2,…,w; each generator maps one row to another.
    const gi = GROUPS[w];
    const group = GROUP_DATA[gi.offset + randomUpto(rng, gi.count)];
    const gens = group.gens;

    soln.fill(0);
    for (let i = 0; i < w; i++) soln[i] = i + 1;
    let qh = 0;
    let qt = 0;
    queue[qt++] = 1;
    while (qh < qt) {
      const i = queue[qh++];
      const rowOff = (i - 1) * w;
      for (let j = 0; j < group.ngens; j++) {
        const genOff = j * w;
        // gen[x] maps element (x+1) to element (gen[x] - 'A' + 1).
        const nri = gens.charCodeAt(genOff + soln[rowOff] - 1) - 64;
        const newOff = (nri - 1) * w;
        if (!soln[newOff]) {
          for (let k = 0; k < w; k++)
            soln[newOff + k] = gens.charCodeAt(genOff + soln[rowOff + k] - 1) - 64;
          queue[qt++] = nri;
        }
      }
    }

    // Shuffle the table's elements (fixing the identity in place iff id mode).
    for (let i = 0; i < w; i++) perm[i] = i;
    if (p.id) shuffleRange(perm, 1, w - 1, rng);
    else shuffleRange(perm, 0, w, rng);
    for (let i = 0; i < w; i++)
      for (let j = 0; j < w; j++)
        grid[perm[i] * w + perm[j]] = perm[soln[i * w + j] - 1] + 1;

    // Keep the full shuffled solution for the aux string.
    soln.set(grid);

    if (!p.id) {
      // Blank the identity row/column plus one more random row/column, so the
      // player can't read off the identity for free; retry if that overshoots.
      const j = 1 + randomUpto(rng, w - 1);
      for (let i = 0; i < w; i++) {
        grid[perm[0] * w + i] = 0;
        grid[i * w + perm[0]] = 0;
        grid[perm[j] * w + i] = 0;
        grid[i * w + perm[j]] = 0;
      }
      scratch.set(grid);
      if (solveGroup(scratch, w, diff) > diff) continue; // didn't work; go again
    }

    // Remove entries one by one while the puzzle stays solvable at `diff`.
    // In identity-shown mode the identity's row and column (index 0) stay given.
    const start = p.id ? 1 : 0;
    const indices: number[] = [];
    for (let i = start; i < w; i++)
      for (let j = start; j < w; j++) if (grid[i * w + j]) indices.push(i * w + j);
    shuffle(indices, rng);

    for (const idx of indices) {
      scratch.set(grid);
      scratch[idx] = 0;
      if (solveGroup(scratch, w, diff) <= diff) grid[idx] = 0;
    }

    // Reject a puzzle that's too easy (solvable one level below target).
    if (diff > 0) {
      scratch.set(grid);
      if (solveGroup(scratch, w, diff - 1) < diff) continue;
    }

    break;
  }

  const desc = encodeGrid(grid, a);
  let aux = "S";
  for (let i = 0; i < a; i++) aux += toChar(soln[i], p.id);
  return { desc, aux };
}
