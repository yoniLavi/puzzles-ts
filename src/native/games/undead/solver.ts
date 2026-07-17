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

import { runDeductionFixpoint } from "../../engine/deduction-fixpoint.ts";
import { stepBudget } from "../../engine/step-budget.ts";
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
export function nextList(
  guess: Int32Array,
  possible: Int32Array,
  pos: number,
): boolean {
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

  return {
    iterativeSolved,
    bruteforceSolved,
    inconsistent,
    iterativeDepth,
    ambiguous,
    guess,
  };
}

// --- the deductive ladder (fork divergence: guess-free generation) ---------
//
// Upstream Undead grades difficulty by *how much brute force* a board needs,
// which conflicts with this fork's guess-free generation policy
// (`docs/porting/hint-authoring.md` §1A: every shipped tier of a logic puzzle
// must be solvable by pure deduction). This ladder adds the two deductive rungs
// upstream never built — **exact counting** and **depth-1 forcing** — between
// arc-consistency (`solveIterative`) and the brute-force oracle, so Easy/Normal/
// Tricky become pure-deduction tiers graded by *which technique* they need.
//
// All three rungs are *sound*: they only narrow a cell to values the true
// solution still allows, so a ladder that narrows every cell to a singleton has
// proven that singleton is the unique solution. `solveBruteforce` remains the
// independent uniqueness oracle.

/** Highest deductive technique a board needs (or `RECURSION` if the ladder
 * stalls — that board needs nested hypothesising = guessing). */
export const RUNG_ARC = 0;
export const RUNG_COUNTING = 1;
export const RUNG_FORCING = 2;
export const RUNG_RECURSION = 3;
export type Rung = 0 | 1 | 2 | 3;

/** Outcome of one propagation step/fixpoint. */
type Step = "progress" | "stuck" | "inconsistent";

/** Every cell narrowed to a single monster (1/2/4). */
function isSolved(guess: Uint8Array, numTotal: number): boolean {
  for (let i = 0; i < numTotal; i++) {
    const v = guess[i];
    if (v !== MON_GHOST && v !== MON_VAMPIRE && v !== MON_ZOMBIE) return false;
  }
  return true;
}

/** Any cell with an empty candidate set (a contradiction). */
function anyEmpty(guess: Uint8Array, numTotal: number): boolean {
  for (let i = 0; i < numTotal; i++) if (guess[i] === 0) return true;
  return false;
}

/**
 * Rung 1 — arc-consistency to a fixpoint: repeat `solveIterative` (the
 * per-sightline candidate intersection) until nothing changes. Reports whether
 * it made progress / stalled / hit a contradiction, plus the pass count (used by
 * the generator's Easy cap).
 */
function arcFixpoint(
  common: UndeadCommon,
  guess: Uint8Array,
): { step: Step; passes: number } {
  const numTotal = common.numTotal;
  const old = guess.slice();
  let passes = 0;
  let everChanged = false;
  while (true) {
    solveIterative(common, guess);
    passes++;
    if (anyEmpty(guess, numTotal)) return { step: "inconsistent", passes };
    let changed = false;
    for (let i = 0; i < numTotal; i++) {
      if (guess[i] !== old[i]) {
        changed = true;
        old[i] = guess[i];
      }
    }
    if (changed) everChanged = true;
    else break;
  }
  return { step: everChanged ? "progress" : "stuck", passes };
}

/**
 * Rung 2 — exact counting (one pass). The three monster totals sum to the cell
 * count, so they are *equalities*: exactly `numGhosts` cells are ghosts, etc.
 * That licenses Hall-type deductions per type `T` (mask `m`, target `nT`):
 *  - `placed_T > nT` or `possible_T < nT` ⇒ contradiction;
 *  - `placed_T === nT` (all `T`s pinned) ⇒ strike `m` from every other cell;
 *  - `possible_T === nT` (only `nT` cells can be `T`, and `nT` are needed) ⇒
 *    force all of them to `T`.
 * `placed_T` counts singleton-`T` cells; `possible_T` counts cells whose
 * candidate set still includes `m`.
 */
function countingPass(common: UndeadCommon, guess: Uint8Array): Step {
  const numTotal = common.numTotal;
  const types = [MON_GHOST, MON_VAMPIRE, MON_ZOMBIE];
  const targets = [common.numGhosts, common.numVampires, common.numZombies];
  let changed = false;
  for (let t = 0; t < 3; t++) {
    const m = types[t];
    const nT = targets[t];
    let placed = 0;
    let possible = 0;
    for (let i = 0; i < numTotal; i++) {
      const g = guess[i];
      if (g === m) placed++;
      if (g & m) possible++;
    }
    if (placed > nT || possible < nT) return "inconsistent";
    if (placed === nT) {
      for (let i = 0; i < numTotal; i++) {
        const g = guess[i];
        if (g !== m && g & m) {
          guess[i] = g & ~m;
          changed = true;
          if (guess[i] === 0) return "inconsistent";
        }
      }
    } else if (possible === nT) {
      for (let i = 0; i < numTotal; i++) {
        const g = guess[i];
        if (g & m && g !== m) {
          guess[i] = m;
          changed = true;
        }
      }
    }
  }
  return changed ? "progress" : "stuck";
}

/** Rungs 1+2 to a combined fixpoint: arc-consistency and counting cascade until
 * neither changes anything. */
function arcCountFixpoint(common: UndeadCommon, guess: Uint8Array): Step {
  let everChanged = false;
  while (true) {
    const arc = arcFixpoint(common, guess);
    if (arc.step === "inconsistent") return "inconsistent";
    const cnt = countingPass(common, guess);
    if (cnt === "inconsistent") return "inconsistent";
    if (arc.step === "progress" || cnt === "progress") everChanged = true;
    if (cnt !== "progress") break; // counting added nothing new ⇒ arc is also at fixpoint
  }
  return everChanged ? "progress" : "stuck";
}

/**
 * Rung 3 — one forcing pass (depth-1, the `DIFF_EXTREME` forcing technique,
 * classed as deduction). For each undecided cell and each of its remaining
 * candidates, hypothesise that candidate and run the arc+counting fixpoint on a
 * copy; if that yields a contradiction, eliminate the candidate from the real
 * grid. **The inner fixpoint never forces** — a hypothesis that needs a *further*
 * hypothesis to resolve is recursion (guessing), which this ladder never does; such
 * a board is left for the brute-force oracle.
 */
function forcingPass(common: UndeadCommon, guess: Uint8Array): Step {
  const numTotal = common.numTotal;
  const types = [MON_GHOST, MON_VAMPIRE, MON_ZOMBIE];
  let changed = false;
  for (let i = 0; i < numTotal; i++) {
    const g0 = guess[i];
    // Skip decided (single-bit) or already-empty cells.
    if (g0 === MON_GHOST || g0 === MON_VAMPIRE || g0 === MON_ZOMBIE || g0 === 0)
      continue;
    for (const b of types) {
      if (!(guess[i] & b)) continue;
      const trial = guess.slice();
      trial[i] = b;
      if (arcCountFixpoint(common, trial) === "inconsistent") {
        guess[i] &= ~b;
        changed = true;
        if (guess[i] === 0) return "inconsistent";
      }
    }
  }
  return changed ? "progress" : "stuck";
}

/** Rungs 1+2+3 to a fixpoint: alternate forcing with arc+counting propagation
 * of each elimination until forcing finds nothing more (or the board solves). */
function forcingFixpoint(common: UndeadCommon, guess: Uint8Array): Step {
  let everChanged = false;
  while (true) {
    const fr = forcingPass(common, guess);
    if (fr === "inconsistent") return "inconsistent";
    if (fr === "stuck") break;
    everChanged = true;
    const cr = arcCountFixpoint(common, guess);
    if (cr === "inconsistent") return "inconsistent";
    if (isSolved(guess, common.numTotal)) break;
  }
  return everChanged ? "progress" : "stuck";
}

export interface DeductiveResult {
  /** highest rung the ladder needed; `RUNG_RECURSION` if it never solved. */
  rung: Rung;
  /** the ladder narrowed every cell to a single monster (⇒ unique solution). */
  solved: boolean;
  /** a contradiction surfaced (the board has no solution). */
  inconsistent: boolean;
  /** arc-consistency passes in the pure-arc attempt (the Easy-tier cap). */
  arcPasses: number;
  /** the (possibly partial) candidate grid after the ladder ran. */
  guess: Uint8Array;
}

/**
 * Run the deductive ladder (arc-consistency → counting → forcing, to a combined
 * fixpoint, **without recursion**) over a starting candidate grid, escalating
 * one rung at a time so the result records the *highest* technique needed. This
 * is the generator's grading entry and (later) the hint's deduction source.
 * `solveBruteforce` stays the independent uniqueness oracle.
 *
 * `maxRung` stops escalation early: when grading for a tier, anything the ladder
 * can't solve within the tier's rung is rejected anyway, so there is no point
 * paying for the (expensive) forcing rung when grading Easy/Normal — pass
 * `RUNG_ARC` / `RUNG_COUNTING` there. `solved=false` then means "needs more than
 * `maxRung`" and the reported `rung` is `RUNG_RECURSION` (capped-out). Defaults
 * to the full ladder for callers (measurement, the hint) that want the true rung.
 */
export function solveDeductive(
  common: UndeadCommon,
  start: Uint8Array,
  maxRung: Rung = RUNG_FORCING,
): DeductiveResult {
  const numTotal = common.numTotal;
  const guess = start.slice();
  const fail = (inconsistent: boolean, arcPasses: number): DeductiveResult => ({
    rung: RUNG_RECURSION,
    solved: false,
    inconsistent,
    arcPasses,
    guess,
  });

  // Rung 1: arc-consistency alone.
  const arc = arcFixpoint(common, guess);
  if (arc.step === "inconsistent") return fail(true, arc.passes);
  if (isSolved(guess, numTotal))
    return {
      rung: RUNG_ARC,
      solved: true,
      inconsistent: false,
      arcPasses: arc.passes,
      guess,
    };
  if (maxRung < RUNG_COUNTING) return fail(false, arc.passes);

  // Rung 2: + exact counting.
  const ac = arcCountFixpoint(common, guess);
  if (ac === "inconsistent") return fail(true, arc.passes);
  if (isSolved(guess, numTotal))
    return {
      rung: RUNG_COUNTING,
      solved: true,
      inconsistent: false,
      arcPasses: arc.passes,
      guess,
    };
  if (maxRung < RUNG_FORCING) return fail(false, arc.passes);

  // Rung 3: + depth-1 forcing.
  const fc = forcingFixpoint(common, guess);
  if (fc === "inconsistent") return fail(true, arc.passes);
  if (isSolved(guess, numTotal))
    return {
      rung: RUNG_FORCING,
      solved: true,
      inconsistent: false,
      arcPasses: arc.passes,
      guess,
    };

  // The ladder stalled: this board needs recursion (nested hypothesising).
  return fail(false, arc.passes);
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
    if (!solveBruteforce(common, guess))
      return { ok: false, error: "Puzzle is unsolvable" };
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

// --- the hint recorder (fork divergence; never on the generate/solve path) ---
//
// `recordUndeadDeductions` re-runs the deductive ladder, but instead of just
// narrowing to a fixpoint it captures *each firing* — which candidate it
// eliminated (or which cell it forced) and the deduction that did it — in
// dependency order, so the hint plan (`undead/index.ts`) can narrate every step.
// It is **separate code** from `gradeUndead`/`solveDeductive`/`findUndeadSolution`
// (which the generator/solve/findMistakes paths use), so those run byte-for-byte
// unchanged and the C differential remains the guard (`add-undead-hint` task 1.3).
// The recorder, like every other deductive entry, narrows a cell only to values
// the true solution still allows, so its firings are sound to teach. It is *not*
// recursion-capable: a board the ladder can't crack without guessing yields a
// short plan, and the deductive-ladder generation policy guarantees the shipped
// tiers never need that (`hint-authoring.md` §1A; the `strengthen-undead-deduction`
// re-grade measured a zero recursion residual).

/** Why a candidate was eliminated, or a cell forced (`hint-authoring.md` §9):
 * - `sightline` — one path's two count clues admit no legal beam arrangement
 *   leaving this cell the eliminated monster (the core mirror-sighting deduction);
 * - `total` — a monster type's full count is already placed, so it is struck from
 *   every still-undecided cell (`checkNumbers` surfaced honestly, §5.6);
 * - `onlyCells` — exactly as many cells can still hold a type as remain to place,
 *   so each of them is forced to it (counting's dual, a placement);
 * - `forcing` — hypothesising the candidate forces an immediate contradiction
 *   (the depth-1 forcing rung, §1B.1). */
export type UndeadReason =
  | { kind: "sightline"; path: number }
  | { kind: "total"; monster: number }
  | { kind: "onlyCells"; monster: number; nCells: number }
  | { kind: "forcing"; monster: number }
  | { kind: "single" };

/** One recorded firing op. `kind: "elim"` removes `monster` from `cell`'s
 * candidates; `kind: "place"` forces `cell` to `monster`. `group` ties the ops
 * of a single firing together (one firing = one journey). */
export interface HintOp {
  kind: "elim" | "place";
  cell: number;
  monster: number;
  reason: UndeadReason;
  group: number;
}

const MON_BITS = [MON_GHOST, MON_VAMPIRE, MON_ZOMBIE];

/** Per-mapping-index surviving candidate bits for one path (the inner loop of
 * {@link solveIterative}, pulled out so the recorder can diff before/after). */
function pathSurvivors(
  common: UndeadCommon,
  cand: Uint8Array,
  path: UndeadPath,
): Int32Array {
  const numTotal = common.numTotal;
  const nm = path.numMonsters;
  const survivors = new Int32Array(nm);
  if (nm <= 0) return survivors;
  const loopGuess = new Int32Array(nm);
  const loopPossible = new Int32Array(nm);
  for (let i = 0; i < nm; i++) {
    const v = cand[path.mapping[i]];
    loopGuess[i] = lowestBit(v);
    loopPossible[i] = v;
  }
  const full = new Int32Array(numTotal);
  while (true) {
    for (let i = 0; i < numTotal; i++) full[i] = cand[i];
    for (let i = 0; i < nm; i++) full[path.mapping[i]] = loopGuess[i];
    if (checkNumbers(common, full) && checkSolution(full, path)) {
      for (let j = 0; j < nm; j++) survivors[j] |= loopGuess[j];
    }
    if (!nextList(loopGuess, loopPossible, nm - 1)) break;
  }
  return survivors;
}

/** Record the first path-pass that eliminates a candidate; apply it to `cand`.
 * One path-pass is one firing (`group`). Returns its ops, or `[]`. */
function recordSightlinePass(
  common: UndeadCommon,
  cand: Uint8Array,
  group: number,
): HintOp[] {
  for (let p = 0; p < common.numPaths; p++) {
    const path = common.paths[p];
    if (path.numMonsters <= 0) continue;
    const survivors = pathSurvivors(common, cand, path);
    const ops: HintOp[] = [];
    for (let j = 0; j < path.numMonsters; j++) {
      const m = path.mapping[j];
      const removed = cand[m] & ~survivors[j];
      if (!removed) continue;
      for (const b of MON_BITS) {
        if (removed & b)
          ops.push({
            kind: "elim",
            cell: m,
            monster: b,
            reason: { kind: "sightline", path: p },
            group,
          });
      }
    }
    if (ops.length > 0) {
      for (let j = 0; j < path.numMonsters; j++) cand[path.mapping[j]] &= survivors[j];
      return ops;
    }
  }
  return [];
}

/** Record the first counting deduction (total exhaustion, or its dual "only this
 * many cells can hold the type"); apply it to `cand`. Returns its ops, or `[]`. */
function recordCountingPass(
  common: UndeadCommon,
  cand: Uint8Array,
  group: number,
): HintOp[] {
  const numTotal = common.numTotal;
  const targets = [common.numGhosts, common.numVampires, common.numZombies];
  for (let t = 0; t < 3; t++) {
    const m = MON_BITS[t];
    const nT = targets[t];
    let placed = 0;
    let possible = 0;
    for (let i = 0; i < numTotal; i++) {
      if (cand[i] === m) placed++;
      if (cand[i] & m) possible++;
    }
    if (placed === nT && possible > nT) {
      // All of this type are placed — strike it from every other candidate cell.
      const ops: HintOp[] = [];
      for (let i = 0; i < numTotal; i++) {
        if (cand[i] !== m && cand[i] & m) {
          ops.push({
            kind: "elim",
            cell: i,
            monster: m,
            reason: { kind: "total", monster: m },
            group,
          });
          cand[i] &= ~m;
        }
      }
      return ops;
    }
    if (possible === nT && placed < nT) {
      // Exactly nT cells can hold the type and nT remain — force each of them.
      const ops: HintOp[] = [];
      for (let i = 0; i < numTotal; i++) {
        if (cand[i] !== m && cand[i] & m) {
          ops.push({
            kind: "place",
            cell: i,
            monster: m,
            reason: { kind: "onlyCells", monster: m, nCells: nT },
            group,
          });
          cand[i] = m;
        }
      }
      return ops;
    }
  }
  return [];
}

/** Record the first depth-1 forcing elimination; apply it to `cand`. Returns its
 * op, or `[]`. (One elimination per firing — forcing is per cell/candidate.) */
function recordForcingPass(
  common: UndeadCommon,
  cand: Uint8Array,
  group: number,
): HintOp[] {
  const numTotal = common.numTotal;
  for (let i = 0; i < numTotal; i++) {
    const g0 = cand[i];
    if (g0 === MON_GHOST || g0 === MON_VAMPIRE || g0 === MON_ZOMBIE || g0 === 0)
      continue;
    for (const b of MON_BITS) {
      if (!(cand[i] & b)) continue;
      const trial = cand.slice();
      trial[i] = b;
      if (arcCountFixpoint(common, trial) === "inconsistent") {
        cand[i] &= ~b;
        return [
          {
            kind: "elim",
            cell: i,
            monster: b,
            reason: { kind: "forcing", monster: b },
            group,
          },
        ];
      }
    }
  }
  return [];
}

/**
 * Run the deductive ladder over a candidate grid seeded from `placed` (singleton
 * bits for placed/fixed cells, `MON_NONE` for empty), recording every firing in
 * dependency order. Each round tries counting (totals lead, §D2), then a
 * sightline pass, then a forcing pass, recording the first that fires; loops to a
 * fixpoint. `placed` carries `MON_NONE` (= 7) for empty cells and a singleton
 * bit for placed ones (the player's `state.guess`).
 */
export function recordUndeadDeductions(
  common: UndeadCommon,
  placed: Uint8Array,
): HintOp[] {
  const numTotal = common.numTotal;
  const cand = new Uint8Array(numTotal);
  for (let i = 0; i < numTotal; i++) {
    const v = placed[i];
    cand[i] = v === MON_GHOST || v === MON_VAMPIRE || v === MON_ZOMBIE ? v : MON_NONE;
  }
  const ops: HintOp[] = [];
  let group = 0;
  // Each round tries counting (totals lead), then sightline, then forcing,
  // recording the first that fires as one firing/group (shared restart-on-
  // first-firing ladder). One firing = one `group`, bumped only after it fires.
  const record = (
    pass: (common: UndeadCommon, cand: Uint8Array, group: number) => HintOp[],
  ): number => {
    const fired = pass(common, cand, group);
    if (fired.length === 0) return 0;
    for (const op of fired) ops.push(op);
    group++;
    return 1;
  };
  runDeductionFixpoint({
    rungs: [
      () => record(recordCountingPass),
      () => record(recordSightlinePass),
      () => record(recordForcingPass),
    ],
    budget: stepBudget("undead hint recorder"),
    // A contradiction (an emptied candidate cell) stops the ladder — the hint
    // refuses on such a board anyway.
    solved: () => anyEmpty(cand, numTotal),
  });
  return ops;
}
