/**
 * Singles (Hitori) generator — port of `new_game_desc` plus the Latin-
 * square machinery (`latin_generate`/`latin_generate_rect` and the
 * bipartite `matching` it rests on) from `singles.c` / `latin.c` /
 * `matching.c`.
 *
 * The whole chain is RNG-faithful to upstream: over the bit-identical
 * `random.ts` it reproduces the C desc byte-for-byte for the same seed
 * (see `singles-differential.test.ts`). The two RNG-bearing steps inside
 * matching are reproduced exactly — `shuffle(Lorder)` once per BFS pass,
 * and the in-place `random_upto` swap that permutes the remaining
 * adjacency list during the DFS.
 */
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import {
  newSolverState,
  OP_BLACK,
  type SolverState,
  solveAllblackbutone,
  solveRemovesplits,
  solverOpAdd,
  solverOpsDo,
  solveSpecific,
} from "./solver.ts";
import {
  DIFF_ANY,
  DIFF_EASY,
  type Difficulty,
  diffToLevel,
  encodeDesc,
  F_BLACK,
  F_CIRCLE,
  makeState,
  type SinglesParams,
  type SinglesState,
} from "./state.ts";

// --- bipartite matching (matching.c, RNG-faithful) -------------------------

/**
 * Maximum bipartite matching (Hopcroft–Karp) between `nl` left and `nr`
 * right vertices. `adjlists[L]` lists L's neighbours (mutated in place by
 * the randomising DFS, exactly as upstream). Returns the L→R assignment
 * array (`-1` = unmatched), the analogue of upstream's `outl`.
 */
function matching(
  nl: number,
  nr: number,
  adjlists: number[][],
  adjsizes: number[],
  rs: RandomState,
): Int32Array {
  const LtoR = new Int32Array(nl).fill(-1);
  const RtoL = new Int32Array(nr).fill(-1);
  const Llayer = new Int32Array(nl);
  const Rlayer = new Int32Array(nr);
  const Lqueue = new Int32Array(nl);
  const Rqueue = new Int32Array(nr);
  const nmin = Math.min(nl, nr);
  const augpath = new Int32Array(2 * nmin);
  const dfsstate = new Int32Array(nmin + 1);
  const Lorder = new Int32Array(nl);

  outer: while (true) {
    /* BFS from the unassigned left vertices, layering as we go. */
    Llayer.fill(-1);
    Rlayer.fill(-1);

    let Lqs = 0;
    for (let L = 0; L < nl; L++) {
      if (LtoR[L] === -1) {
        Llayer[L] = 0;
        Lqueue[Lqs++] = L;
      }
    }

    let layer = 0;
    let targetLayer = -1;
    while (true) {
      let foundFreeR = false;
      let Rqs = 0;
      for (let q = 0; q < Lqs; q++) {
        const L = Lqueue[q];
        for (let j = 0; j < adjsizes[L]; j++) {
          const R = adjlists[L][j];
          if (R !== LtoR[L] && Rlayer[R] === -1) {
            Rlayer[R] = layer + 1;
            Rqueue[Rqs++] = R;
            if (RtoL[R] === -1) foundFreeR = true;
          }
        }
      }
      layer++;

      if (foundFreeR) {
        targetLayer = layer;
        break;
      }
      if (Rqs === 0) break outer; /* goto done */

      Lqs = 0;
      for (let q = 0; q < Rqs; q++) {
        const R = Rqueue[q];
        const L = RtoL[R];
        if (L !== -1 && Llayer[L] === -1) {
          Llayer[L] = layer + 1;
          Lqueue[Lqs++] = L;
        }
      }
      layer++;

      if (Lqs === 0) break outer; /* goto done */
    }

    /* Target-layer R vertices are only interesting if unassigned. */
    for (let R = 0; R < nr; R++) {
      if (Rlayer[R] === targetLayer && RtoL[R] !== -1) Rlayer[R] = -1;
    }

    /* Choose an order in which to try the L vertices. */
    for (let L = 0; L < nl; L++) Lorder[L] = L;
    shuffle(Lorder as unknown as number[], rs);

    /* DFS for vertex-disjoint augmenting paths; augment each found. */
    dfsstate[0] = 0;
    let i = 0;
    while (true) {
      let L: number;
      if (i === 0) {
        if (dfsstate[0] === nl) break; /* DFS finished */
        L = Lorder[dfsstate[0]++];
        if (Llayer[L] !== 0) continue;
      } else {
        L = augpath[2 * i - 2];
        const j = dfsstate[i]++;
        if (j === adjsizes[L]) {
          i--;
          continue;
        }
        if (adjsizes[L] - j > 1) {
          const which = j + randomUpto(rs, adjsizes[L] - j);
          const tmp = adjlists[L][which];
          adjlists[L][which] = adjlists[L][j];
          adjlists[L][j] = tmp;
        }
        const R = adjlists[L][j];

        if (Rlayer[R] !== 2 * i - 1) continue;

        augpath[2 * i - 1] = R;
        Rlayer[R] = -1;

        if (2 * i - 1 === targetLayer) {
          for (let k = 0; k < 2 * i; k += 2) {
            LtoR[augpath[k]] = augpath[k + 1];
            RtoL[augpath[k + 1]] = augpath[k];
          }
          i = 0;
          continue;
        }

        L = RtoL[R];
        if (Llayer[L] !== 2 * i) continue;
      }

      augpath[2 * i] = L;
      Llayer[L] = -1;
      i++;
      dfsstate[i] = 0;
    }
  }

  return LtoR;
}

// --- latin square (latin.c) ------------------------------------------------

/** Generate an `o × o` Latin square (values 1..o), row by row via matching,
 * faithful to `latin_generate`. */
function latinGenerate(o: number, rs: RandomState): Int32Array {
  const sq = new Int32Array(o * o);

  /* Generate rows in random order to avoid directional bias. */
  const row: number[] = [];
  for (let i = 0; i < o; i++) row[i] = i;
  shuffle(row, rs);

  const adjlists: number[][] = [];
  const adjsizes: number[] = [];
  for (let j = 0; j < o; j++) adjlists[j] = [];

  for (let i = 0; i < o; i++) {
    /* Bipartite graph: each column to the numbers not yet in that column. */
    for (let j = 0; j < o; j++) {
      const present = new Int8Array(o);
      for (let k = 0; k < i; k++) present[sq[row[k] * o + j] - 1] = 1;
      const adj = adjlists[j];
      adj.length = 0;
      for (let k = 0; k < o; k++) if (!present[k]) adj.push(k);
      adjsizes[j] = adj.length;
    }

    const m = matching(o, o, adjlists, adjsizes, rs);
    for (let j = 0; j < o; j++) sq[row[i] * o + j] = m[j] + 1;
  }

  return sq;
}

/** Crop an `o × o` Latin square to `w × h` (`o = max(w,h)`). */
function latinGenerateRect(w: number, h: number, rs: RandomState): Int32Array {
  const o = Math.max(w, h);
  const latin = latinGenerate(o, rs);
  const rect = new Int32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) rect[y * w + x] = latin[y * o + x];
  }
  return rect;
}

// --- numbers under black squares (best_black_col) --------------------------

/** Choose the number to lay under the black cell at index `i`, preferring
 * a number that erases a Latin-square uniqueness, then any non-unique one.
 * Updates `rownums`/`colnums` for the chosen number. */
function bestBlackCol(
  s: SinglesState,
  rs: RandomState,
  i: number,
  rownums: Int32Array,
  colnums: Int32Array,
): number {
  const w = s.w;
  const o = s.o;
  const x = i % w;
  const y = (i / w) | 0;

  /* Randomise the list of numbers to try (o RNG draws, as in C). */
  const scratch: number[] = [];
  for (let k = 0; k < o; k++) scratch[k] = k;
  shuffle(scratch, rs);

  let j = 0;
  let found = false;
  /* Prefer numbers that only occur once in their row AND column. */
  for (let k = 0; k < o && !found; k++) {
    j = scratch[k] + 1;
    if (rownums[y * o + j - 1] === 1 && colnums[x * o + j - 1] === 1) found = true;
  }
  /* Otherwise the first number that is not unique in its row/column. */
  for (let k = 0; k < o && !found; k++) {
    j = scratch[k] + 1;
    if (rownums[y * o + j - 1] !== 0 || colnums[x * o + j - 1] !== 0) found = true;
  }
  if (!found) throw new Error("singles: unable to place number under black cell");

  rownums[y * o + j - 1] += 1;
  colnums[x * o + j - 1] += 1;
  return j;
}

// --- difficulty gate (new_game_is_good) ------------------------------------

const MAXTRIES = 20;

/** True iff the board is solvable at `diff` and (for diff > Easy) NOT
 * solvable at the level below with the sneaky generation-artefact step. */
function newGameIsGood(
  diffLevel: number,
  state: SinglesState,
  tosolve: SinglesState,
): boolean {
  tosolve.nums = state.nums; // share immutable numbers
  tosolve.flags.fill(0);
  tosolve.completed = false;
  tosolve.impossible = false;

  const sret = solveSpecific(tosolve, diffLevel, false);
  let sretEasy = 0;
  if (diffLevel > DIFF_EASY) {
    tosolve.flags.fill(0);
    tosolve.completed = false;
    tosolve.impossible = false;
    sretEasy = solveSpecific(tosolve, diffLevel - 1, true);
  }

  return !(sret <= 0 || sretEasy > 0);
}

// --- new_game_desc ---------------------------------------------------------

/** Defensive cap on the outer regenerate loop. Upstream has no cap (it
 * relies on `solveAllblackbutone` locking a white's last escape before it
 * can be boxed in, so generation never makes the board impossible); this
 * only fires if a porting discrepancy would otherwise hang the worker. */
const MAX_REGENERATE = 10000;

export function newSinglesDesc(
  paramsOrig: SinglesParams,
  rs: RandomState,
): { desc: string } {
  let diff: Difficulty = paramsOrig.diff;
  const w = paramsOrig.w;
  const h = paramsOrig.h;
  const o = Math.max(w, h);
  const n = w * h;

  /* Tiny boards (no dimension ≥ 4) can't be generated at Tricky. */
  if ((w < 4 || h < 4) && diffToLevel(diff) > DIFF_EASY) diff = "easy";
  const diffLevel = diffToLevel(diff);

  const nums = new Int8Array(n);
  const state = makeState(w, h, nums);
  const tosolve = makeState(w, h, nums);
  const ss: SolverState = newSolverState(state);

  const scratch = new Int32Array(n);
  const rownums = new Int32Array(h * o);
  const colnums = new Int32Array(w * o);

  let regenerations = 0;
  generate: while (true) {
    if (++regenerations > MAX_REGENERATE) {
      throw new Error("singles generator: exceeded regenerate cap");
    }
    ss.ops = [];
    state.flags.fill(0);

    /* Latin rectangle. */
    const latin = latinGenerateRect(w, h, rs);
    for (let i = 0; i < n; i++) state.nums[i] = latin[i];

    /* Add black squares at random, laying forced whites between placements. */
    for (let i = 0; i < n; i++) scratch[i] = i;
    shuffle(scratch as unknown as number[], rs);
    for (let k = 0; k < n; k++) {
      const i = scratch[k];
      if (state.flags[i] & (F_CIRCLE | F_BLACK)) continue;

      solverOpAdd(ss, i % w, (i / w) | 0, OP_BLACK);
      solverOpsDo(state, ss);

      solveAllblackbutone(state, ss);
      solverOpsDo(state, ss);

      solveRemovesplits(state, ss);
      solverOpsDo(state, ss);

      if (state.impossible) continue generate;
    }

    /* Count white numbers per row/column. */
    rownums.fill(0);
    colnums.fill(0);
    for (let i = 0; i < n; i++) {
      if (state.flags[i] & F_BLACK) continue;
      const j = state.nums[i];
      const x = i % w;
      const y = (i / w) | 0;
      rownums[y * o + j - 1] += 1;
      colnums[x * o + j - 1] += 1;
    }

    let ntries = 0;
    while (true) {
      for (let i = 0; i < n; i++) {
        if (!(state.flags[i] & F_BLACK)) continue;
        state.nums[i] = bestBlackCol(state, rs, i, rownums, colnums);
      }

      if (diffLevel !== DIFF_ANY && !newGameIsGood(diffLevel, state, tosolve)) {
        ntries++;
        if (ntries > MAXTRIES) continue generate;
        continue;
      }
      break;
    }

    return { desc: encodeDesc(state) };
  }
}
