/**
 * Unequal generator — port of `new_game_desc` (+ `game_assemble`/`game_strip`/
 * the `gg_*` clue machinery) from `unequal.c`.
 *
 * Generate a full Latin square as the solution, then build a minimal clue set:
 * greedily *assemble* clues (number givens + inequality signs) onto a blank
 * board until the graded solver solves it, then *strip* redundant clues. In
 * Adjacent mode every adjacency flag implied by the solution is present from the
 * start, so only number givens are added/removed. RNG-faithful to upstream over
 * the bit-identical `random.ts`, so the emitted desc matches C byte-for-byte for
 * the same seed.
 */

import { latinGenerate } from "../../engine/latin.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { solveUnequal } from "./solver.ts";
import {
  ADJTHAN,
  DIFF_RECURSIVE,
  diffToLevel,
  type Mode,
  n2c,
  type UnequalParams,
} from "./state.ts";

const MAXTRIES = 50;
/** The board being assembled: number givens, adjacency flags, and the solver's
 * last candidate cube (`state->hints`). */
interface GenState {
  o: number;
  mode: Mode;
  nums: Uint8Array; // o²
  flags: Int32Array; // o² (F_ADJ_*)
  hints: Uint8Array; // o³ (candidate cube)
}

function blankGen(o: number, mode: Mode): GenState {
  return {
    o,
    mode,
    nums: new Uint8Array(o * o),
    flags: new Int32Array(o * o),
    hints: new Uint8Array(o * o * o),
  };
}

/**
 * Run the graded solver on a copy of `g`'s givens, writing the deductions back
 * into `g.nums` and the final candidate cube into `g.hints` (upstream aliases
 * `state->nums` into the solver, so deductions accumulate there). Returns
 * `-1` impossible · `0` unfinished · `1` solved uniquely · `2` ambiguous.
 */
function solverState(g: GenState, maxdiff: number): number {
  const ret = solveUnequal(g.o, g.mode, g.flags, g.nums, maxdiff, g.hints);
  if (ret === 10) return -1; // DIFF_IMPOSSIBLE
  if (ret === 12) return 0; // DIFF_UNFINISHED
  if (ret === 11) return 2; // DIFF_AMBIGUOUS
  return 1;
}

/** Returns true if it placed (or, with `checkonly`, could have placed) the clue.
 * A clue code is `loc*5 + which`; `which == 4` adds the number given, `0..3` an
 * inequality flag toward the matching `ADJTHAN` direction. */
function ggPlaceClue(
  g: GenState,
  ccode: number,
  latin: Int32Array,
  checkonly: boolean,
): boolean {
  const loc = (ccode / 5) | 0;
  const which = ccode % 5;
  const o = g.o;
  const x = loc % o;
  const y = (loc / o) | 0;

  if (which === 4) {
    // add number
    if (g.nums[loc] !== 0) return false;
    if (!checkonly) g.nums[loc] = latin[loc];
  } else {
    // add flag
    if (g.mode === "adjacent") return false; // flags always all present
    if (g.flags[loc] & ADJTHAN[which].f) return false; // already has flag
    const lx = x + ADJTHAN[which].dx;
    const ly = y + ADJTHAN[which].dy;
    if (lx < 0 || ly < 0 || lx >= o || ly >= o) return false; // off grid
    const lloc = loc + ADJTHAN[which].dx + ADJTHAN[which].dy * o;
    if (latin[loc] <= latin[lloc]) return false; // flag would be incorrect
    if (!checkonly) g.flags[loc] |= ADJTHAN[which].f;
  }
  return true;
}

/** Returns true if it removed (or, with `checkonly`, could have removed) the
 * clue. */
function ggRemoveClue(g: GenState, ccode: number, checkonly: boolean): boolean {
  const loc = (ccode / 5) | 0;
  const which = ccode % 5;
  if (which === 4) {
    if (g.nums[loc] === 0) return false;
    if (!checkonly) g.nums[loc] = 0;
  } else {
    if (g.mode === "adjacent") return false;
    if (!(g.flags[loc] & ADJTHAN[which].f)) return false;
    if (!checkonly) g.flags[loc] &= ~ADJTHAN[which].f;
  }
  return true;
}

/**
 * Pick the next clue to add: the placeable clue whose cell has the most
 * remaining candidate possibilities, tie-broken by fewest existing flag-clues.
 * Faithful to `gg_best_clue`, including upstream's flat `hints[loc*o + j]` read
 * (a transposition quirk vs the cube's `(x*o+y)*o+n` layout — reproduced exactly
 * so the greedy choice, and hence the desc, matches C byte-for-byte).
 */
function ggBestClue(g: GenState, scratch: Int32Array, latin: Int32Array): number {
  const o = g.o;
  const ls = o * o * 5;
  let maxposs = 0;
  let minclues = 5;
  let best = -1;

  for (let i = ls; i-- > 0; ) {
    if (!ggPlaceClue(g, scratch[i], latin, true)) continue;
    const loc = (scratch[i] / 5) | 0;
    let nposs = 0;
    for (let j = 0; j < o; j++) if (g.hints[loc * o + j]) nposs++;
    let nclues = 0;
    for (let j = 0; j < 4; j++) if (g.flags[loc] & ADJTHAN[j].f) nclues++;
    if (nposs > maxposs || (nposs === maxposs && nclues < minclues)) {
      best = i;
      maxposs = nposs;
      minclues = nclues;
    }
  }
  if (best === -1) throw new Error("unequal: gg_best_clue found no placeable clue");
  return best;
}

/** Add best clues to `g` until it is solvable at `difficulty`. */
function gameAssemble(
  g: GenState,
  scratch: Int32Array,
  latin: Int32Array,
  difficulty: number,
): void {
  // Never use a guessing solver during assembly: a wrong guess that "solves"
  // would confuse gg_place_clue. We always trim toward harder in game_strip.
  if (difficulty >= DIFF_RECURSIVE) difficulty = DIFF_RECURSIVE - 1;

  // `copy` accumulates the solver's deductions (upstream aliases state->nums).
  const copy: GenState = {
    o: g.o,
    mode: g.mode,
    nums: g.nums.slice(),
    flags: g.flags.slice(),
    hints: g.hints.slice(),
  };

  while (true) {
    if (solverState(copy, difficulty) === 1) break;
    const best = ggBestClue(copy, scratch, latin);
    ggPlaceClue(g, scratch[best], latin, false);
    ggPlaceClue(copy, scratch[best], latin, false);
  }
}

/** Remove redundant clues from `g` while the board stays solvable. */
function gameStrip(
  g: GenState,
  scratch: Int32Array,
  latin: Int32Array,
  difficulty: number,
): void {
  const o = g.o;
  const o2 = o * o;
  const lscratch = o2 * 5;
  const copy = blankGen(o, g.mode);

  for (let i = 0; i < lscratch; i++) {
    if (!ggRemoveClue(g, scratch[i], false)) continue;
    copy.nums.set(g.nums);
    copy.flags.set(g.flags);
    if (solverState(copy, difficulty) !== 1) {
      // Can't solve without it — put it back.
      const ok = ggPlaceClue(g, scratch[i], latin, false);
      if (!ok) throw new Error("unequal: failed to restore a required clue");
    }
  }
}

/** Seed every adjacency flag implied by the solution (Adjacent mode). */
function addAdjacentFlags(g: GenState, latin: Int32Array): void {
  const o = g.o;
  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      if (x < o - 1 && Math.abs(latin[y * o + x] - latin[y * o + x + 1]) === 1) {
        g.flags[y * o + x] |= ADJTHAN[1].f; // F_ADJ_RIGHT
        g.flags[y * o + x + 1] |= ADJTHAN[3].f; // F_ADJ_LEFT
      }
      if (y < o - 1 && Math.abs(latin[y * o + x] - latin[(y + 1) * o + x]) === 1) {
        g.flags[y * o + x] |= ADJTHAN[2].f; // F_ADJ_DOWN
        g.flags[(y + 1) * o + x] |= ADJTHAN[0].f; // F_ADJ_UP
      }
    }
  }
}

export function newUnequalDesc(
  p: UnequalParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const o = p.order;
  const o2 = o * o;
  let diff = diffToLevel(p.diff);
  const lscratch = o2 * 5;

  // Clue codes, randomised later. Numbers (which == 4) come before the
  // inequalities (which 0..3), in `(i%o2)*5 + 4 - (i/o2)` order.
  const scratch = new Int32Array(lscratch);
  for (let i = 0; i < lscratch; i++) scratch[i] = (i % o2) * 5 + 4 - ((i / o2) | 0);

  let sq!: ReturnType<typeof latinGenerate>;
  let ntries = 1;

  const attempt = retryLimit(`unequal: generation (${o}${p.mode})`, 2000);
  while (true) {
    attempt();

    sq = latinGenerate(o, rng);

    // Separately shuffle the numeric (first o²) and inequality (rest) codes.
    shuffleRange(scratch, 0, o2, rng);
    shuffleRange(scratch, o2, lscratch - o2, rng);

    const state = blankGen(o, p.mode);
    if (p.mode === "adjacent") addAdjacentFlags(state, sq);

    gameAssemble(state, scratch, sq, diff);
    gameStrip(state, scratch, sq, diff);

    if (diff > 0) {
      const copy: GenState = {
        o,
        mode: state.mode,
        nums: state.nums.slice(),
        flags: state.flags.slice(),
        hints: state.hints.slice(),
      };
      const nsol = solverState(copy, diff - 1);
      if (nsol > 0) {
        // Too easy — try again, then drop a level after MAXTRIES (faithful).
        if (ntries < MAXTRIES) {
          ntries++;
          continue;
        }
        diff--;
      }
    }

    return { desc: encodeDesc(state), aux: encodeAux(sq, o) };
  }
}

/** Shuffle `arr[start .. start+len)` in place, RNG-faithful (the draw sequence
 * matches C's `shuffle(arr + start, len, …)`). */
function shuffleRange(
  arr: Int32Array,
  start: number,
  len: number,
  rng: RandomState,
): void {
  const slice: number[] = [];
  for (let i = 0; i < len; i++) slice[i] = arr[start + i];
  shuffle(slice, rng);
  for (let i = 0; i < len; i++) arr[start + i] = slice[i];
}

function encodeDesc(g: GenState): string {
  const o = g.o;
  let ret = "";
  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      const f = g.flags[y * o + x];
      ret += String(g.nums[y * o + x]);
      if (f & ADJTHAN[0].f) ret += "U";
      if (f & ADJTHAN[1].f) ret += "R";
      if (f & ADJTHAN[2].f) ret += "D";
      if (f & ADJTHAN[3].f) ret += "L";
      ret += ",";
    }
  }
  return ret;
}

function encodeAux(sq: Int32Array, o: number): string {
  let s = "S";
  for (let i = 0; i < o * o; i++) s += n2c(sq[i], o);
  return s;
}
