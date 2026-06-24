/**
 * Undead solver — port of `undead.c`'s `solve_iterative` / `solve_bruteforce`
 * and the difficulty grading.
 *
 * Both solvers enumerate the `{ghost, vampire, zombie}` choice at each monster
 * cell via the {@link nextList} odometer, constrained by each cell's candidate
 * bitmask. The **iterative** solver narrows a path's cells to those candidates
 * that survive in *some* legal assignment of that path (intersected to a
 * fixpoint); the **brute-force** solver enumerates whole-grid assignments and
 * succeeds only when exactly one is consistent.
 *
 * Monster bitmask values: 1 ghost, 2 vampire, 4 zombie, 7 undecided, 0
 * inconsistent (no candidate left).
 */

import {
  MON_GHOST,
  MON_NONE,
  MON_VAMPIRE,
  MON_ZOMBIE,
  type UndeadCommon,
  type UndeadPath,
  type UndeadState,
} from "./state.ts";

/**
 * The `{1,2,4}` odometer (upstream `next_list`), ported branch-for-branch (see
 * design D2). `guess[pos]` holds the current monster value (1/2/4) at each list
 * position; `possible[pos]` is the allowed bitmask there. Advances position
 * `pos` to its next allowed value, carrying to `pos-1` on overflow; returns
 * `false` only when the whole list is exhausted. All recursions to `pos-1`
 * happen at `pos ≥ 1` (the `pos === 0` block intercepts every carry case), so
 * the index never goes negative.
 */
export function nextList(guess: Int32Array, possible: Int32Array, pos: number): boolean {
  if (pos === 0) {
    if (
      (guess[pos] === 1 && possible[pos] === 1) ||
      (guess[pos] === 2 && (possible[pos] === 3 || possible[pos] === 2)) ||
      guess[pos] === 4
    )
      return false;
    if (guess[pos] === 1 && (possible[pos] === 3 || possible[pos] === 7)) {
      guess[pos] = 2;
      return true;
    }
    if (guess[pos] === 1 && possible[pos] === 5) {
      guess[pos] = 4;
      return true;
    }
    if (guess[pos] === 2 && (possible[pos] === 6 || possible[pos] === 7)) {
      guess[pos] = 4;
      return true;
    }
  }

  if (guess[pos] === 1) {
    if (possible[pos] === 1) return nextList(guess, possible, pos - 1);
    if (possible[pos] === 3 || possible[pos] === 7) {
      guess[pos] = 2;
      return true;
    }
    if (possible[pos] === 5) {
      guess[pos] = 4;
      return true;
    }
  }

  if (guess[pos] === 2) {
    if (possible[pos] === 2) return nextList(guess, possible, pos - 1);
    if (possible[pos] === 3) {
      guess[pos] = 1;
      return nextList(guess, possible, pos - 1);
    }
    if (possible[pos] === 6 || possible[pos] === 7) {
      guess[pos] = 4;
      return true;
    }
  }

  if (guess[pos] === 4) {
    if (possible[pos] === 5 || possible[pos] === 7) {
      guess[pos] = 1;
      return nextList(guess, possible, pos - 1);
    }
    if (possible[pos] === 6) {
      guess[pos] = 2;
      return nextList(guess, possible, pos - 1);
    }
    if (possible[pos] === 4) return nextList(guess, possible, pos - 1);
  }

  return false;
}

/** Lowest set monster bit (the odometer's starting value for a candidate set). */
function lowestBit(v: number): number {
  return v & 1 ? 1 : v & 2 ? 2 : 4;
}

/** True iff the placed monsters (cells equal to 1/2/4) do not exceed any total. */
function checkNumbers(common: UndeadCommon, guess: Int32Array | Uint8Array): boolean {
  let cg = 0;
  let cv = 0;
  let cz = 0;
  for (let i = 0; i < common.numTotal; i++) {
    if (guess[i] === MON_GHOST) cg++;
    else if (guess[i] === MON_VAMPIRE) cv++;
    else if (guess[i] === MON_ZOMBIE) cz++;
  }
  return cg <= common.numGhosts && cv <= common.numVampires && cz <= common.numZombies;
}

/** True iff a full assignment satisfies both of a path's sighting clues. */
function checkSolution(guess: Int32Array | Uint8Array, path: UndeadPath): boolean {
  let count = 0;
  let mirror = false;
  for (let i = 0; i < path.length; i++) {
    const m = path.p[i];
    if (m === -1) mirror = true;
    else if (guess[m] === MON_GHOST && mirror) count++;
    else if (guess[m] === MON_VAMPIRE && !mirror) count++;
    else if (guess[m] === MON_ZOMBIE) count++;
  }
  if (count !== path.sightingsStart) return false;

  count = 0;
  mirror = false;
  for (let i = path.length - 1; i >= 0; i--) {
    const m = path.p[i];
    if (m === -1) mirror = true;
    else if (guess[m] === MON_GHOST && mirror) count++;
    else if (guess[m] === MON_VAMPIRE && !mirror) count++;
    else if (guess[m] === MON_ZOMBIE) count++;
  }
  return count === path.sightingsEnd;
}

/**
 * One iterative pass (upstream `solve_iterative`): for each path, intersect its
 * cells' candidate sets down to those values appearing in *some* legal
 * assignment of that path. Mutates `guess` in place; returns whether every cell
 * is now a single monster.
 */
export function solveIterative(common: UndeadCommon, guess: Uint8Array): boolean {
  const numTotal = common.numTotal;
  const full = new Int32Array(numTotal);
  const possible = new Int32Array(numTotal);

  for (const path of common.paths) {
    const nm = path.numMonsters;
    if (nm <= 0) continue;

    const loopGuess = new Int32Array(nm);
    const loopPossible = new Int32Array(nm);
    for (let i = 0; i < nm; i++) {
      const v = guess[path.mapping[i]];
      loopGuess[i] = lowestBit(v);
      loopPossible[i] = v;
      possible[path.mapping[i]] = 0;
    }

    while (true) {
      for (let i = 0; i < numTotal; i++) full[i] = guess[i];
      for (let i = 0; i < nm; i++) full[path.mapping[i]] = loopGuess[i];
      if (checkNumbers(common, full) && checkSolution(full, path)) {
        for (let j = 0; j < nm; j++) possible[path.mapping[j]] |= loopGuess[j];
      }
      if (!nextList(loopGuess, loopPossible, nm - 1)) break;
    }

    for (let i = 0; i < nm; i++) guess[path.mapping[i]] &= possible[path.mapping[i]];
  }

  for (let i = 0; i < numTotal; i++) {
    const v = guess[i];
    if (v !== MON_GHOST && v !== MON_VAMPIRE && v !== MON_ZOMBIE) return false;
  }
  return true;
}

/**
 * Whole-grid brute-force uniqueness check (upstream `solve_bruteforce`):
 * enumerate every assignment within the current candidate sets; succeed only
 * when exactly one is fully consistent, recording it into `guess`.
 */
export function solveBruteforce(common: UndeadCommon, guess: Uint8Array): boolean {
  const numTotal = common.numTotal;
  if (numTotal === 0) return false;
  const loopGuess = new Int32Array(numTotal);
  const loopPossible = new Int32Array(numTotal);
  for (let i = 0; i < numTotal; i++) {
    loopPossible[i] = guess[i];
    loopGuess[i] = lowestBit(guess[i]);
  }

  let solved = false;
  let numberSolutions = 0;
  while (true) {
    let correct = checkNumbers(common, loopGuess);
    if (correct) {
      for (const path of common.paths) {
        if (!checkSolution(loopGuess, path)) {
          correct = false;
          break;
        }
      }
    }
    if (correct) {
      numberSolutions++;
      solved = true;
      if (numberSolutions > 1) {
        solved = false;
        break;
      }
      for (let i = 0; i < numTotal; i++) guess[i] = loopGuess[i];
    }
    if (!nextList(loopGuess, loopPossible, numTotal - 1)) break;
  }
  return solved;
}

// --- grading + solution (the generator / solve / findMistakes drivers) ------

export interface GradeResult {
  iterativeSolved: boolean;
  bruteforceSolved: boolean;
  inconsistent: boolean;
  /** passes of the iterative solver until fixpoint (order-dependent — used only
   * by the generator's self-consistent grading, never the differential). */
  iterativeDepth: number;
  /** cells still ambiguous after the iterative fixpoint. */
  ambiguous: number;
  /** the (possibly partial) candidate grid after solving. */
  guess: Uint8Array;
}

/**
 * Run the full solver pipeline (iterative fixpoint, then brute-force when
 * allowed) over a starting candidate grid, recording the difficulty signals
 * (upstream `new_game_desc`'s grading block). `diffAllowsBruteforce` mirrors the
 * generator's `diff != DIFF_EASY` gate on the brute-force fallback.
 */
export function gradeUndead(
  common: UndeadCommon,
  start: Uint8Array,
  diffAllowsBruteforce: boolean,
): GradeResult {
  const numTotal = common.numTotal;
  const guess = start.slice();
  const old = guess.slice();
  let iterativeDepth = 0;
  let iterativeSolved = false;
  let inconsistent = false;
  let ambiguous = 0;

  while (true) {
    iterativeSolved = solveIterative(common, guess);
    iterativeDepth++;
    let noChange = true;
    for (let p = 0; p < numTotal; p++) {
      if (guess[p] !== old[p]) noChange = false;
      old[p] = guess[p];
      if (guess[p] === 0) inconsistent = true;
    }
    if (iterativeSolved || noChange) break;
  }

  let bruteforceSolved = false;
  if (diffAllowsBruteforce && !iterativeSolved && !inconsistent) {
    for (let p = 0; p < numTotal; p++) {
      const v = guess[p];
      if (v !== MON_GHOST && v !== MON_VAMPIRE && v !== MON_ZOMBIE) ambiguous++;
    }
    bruteforceSolved = solveBruteforce(common, guess);
  }

  return { iterativeSolved, bruteforceSolved, inconsistent, iterativeDepth, ambiguous, guess };
}

export type SolutionResult =
  | { ok: true; guess: Uint8Array }
  | { ok: false; error: string };

/**
 * The unique solution of a board, for `solve` and `findMistakes` (upstream
 * `solve_game`). Seeds fixed cells from `state.guess` and the rest undecided,
 * runs the iterative solver to a fixpoint, then brute-force if needed. Returns
 * an error when inconsistent or unsolvable. Never derived from the player's
 * notes or non-fixed entries.
 */
export function findUndeadSolution(state: UndeadState): SolutionResult {
  const common = state.common;
  const numTotal = common.numTotal;
  const guess = new Uint8Array(numTotal);
  for (let i = 0; i < numTotal; i++) {
    guess[i] = common.fixed[i] ? state.guess[i] : MON_NONE;
  }

  const old = guess.slice();
  let iterativeSolved = false;
  let inconsistent = false;
  while (true) {
    iterativeSolved = solveIterative(common, guess);
    let noChange = true;
    for (let p = 0; p < numTotal; p++) {
      if (guess[p] !== old[p]) noChange = false;
      old[p] = guess[p];
      if (guess[p] === 0) inconsistent = true;
    }
    if (iterativeSolved || noChange || inconsistent) break;
  }

  if (inconsistent) return { ok: false, error: "Puzzle is inconsistent" };
  if (!iterativeSolved) {
    if (!solveBruteforce(common, guess)) return { ok: false, error: "Puzzle is unsolvable" };
  }
  return { ok: true, guess };
}

/** True iff the board has exactly one solution (iterative-or-brute-force,
 * order-independent). Used by the differential's uniqueness assertion. */
export function isUniquelySolvable(common: UndeadCommon): boolean {
  const start = new Uint8Array(common.numTotal).fill(MON_NONE);
  const grade = gradeUndead(common, start, true);
  if (grade.inconsistent) return false;
  return grade.iterativeSolved || grade.bruteforceSolved;
}
