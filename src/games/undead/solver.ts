/**
 * Undead solver — port of `undead.c`'s `solve_iterative` / `solve_bruteforce`,
 * plus this fork's deductive ladder and hint recorder.
 *
 * Both upstream solvers enumerate the `{ghost, vampire, zombie}` choice at each
 * monster cell via the {@link nextList} odometer, constrained by each cell's
 * candidate bitmask. The **iterative** solver narrows a path's cells to those
 * candidates that survive in *some* legal assignment of that path (intersected
 * to a fixpoint); the **brute-force** solver enumerates whole-grid assignments
 * and succeeds only when exactly one is consistent.
 *
 * Monster bitmask values: 1 ghost, 2 vampire, 4 zombie, 7 undecided, 0
 * inconsistent (no candidate left).
 */

import { runDeductionFixpoint } from "../../engine/deduction-fixpoint.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import {
  isSingleton,
  MON_GHOST,
  MON_NONE,
  MON_VAMPIRE,
  MON_ZOMBIE,
  MONSTERS,
  type UndeadCommon,
  type UndeadPath,
  type UndeadState,
  visibleCount,
} from "./state.ts";

/** Lowest set monster bit (the odometer's starting value for a candidate set). */
export function lowestBit(v: number): number {
  return v & 1 ? 1 : v & 2 ? 2 : 4;
}

/**
 * The odometer the solvers enumerate with (upstream `next_list`): advance
 * `guess` to the next assignment within `possible`, where `guess[pos]` is one
 * monster bit and `possible[pos]` the bits allowed there. Position `pos` turns
 * fastest, each position through its allowed bits in increasing order. Returns
 * `false` once every assignment has been visited, and at once when a carry
 * reaches an emptied cell (`possible` 0), which has no values to visit.
 */
export function nextList(
  guess: Int32Array,
  possible: Int32Array,
  pos: number,
): boolean {
  for (; pos >= 0; pos--) {
    const above = possible[pos] & ~(2 * guess[pos] - 1);
    if (above) {
      guess[pos] = lowestBit(above);
      return true;
    }
    if (pos === 0 || possible[pos] === 0) return false;
    guess[pos] = lowestBit(possible[pos]); // wrap round and carry
  }
  return false;
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
  return (
    visibleCount(path, guess, false) === path.sightingsStart &&
    visibleCount(path, guess, true) === path.sightingsEnd
  );
}

/** The candidate bits each monster on `path` (indexed as `path.mapping`) keeps
 * in *some* assignment that meets both of the path's clues and exceeds no
 * total: one path's worth of upstream `solve_iterative`. */
function pathSurvivors(
  common: UndeadCommon,
  cand: Uint8Array,
  path: UndeadPath,
): Int32Array {
  const nm = path.numMonsters;
  const survivors = new Int32Array(nm);
  if (nm === 0) return survivors;
  const loopGuess = new Int32Array(nm);
  const loopPossible = new Int32Array(nm);
  for (let i = 0; i < nm; i++) {
    loopPossible[i] = cand[path.mapping[i]];
    loopGuess[i] = lowestBit(loopPossible[i]);
  }
  // Only the path's own cells differ from `cand` between assignments.
  const full = new Int32Array(cand);
  do {
    for (let i = 0; i < nm; i++) full[path.mapping[i]] = loopGuess[i];
    if (checkNumbers(common, full) && checkSolution(full, path)) {
      for (let i = 0; i < nm; i++) survivors[i] |= loopGuess[i];
    }
  } while (nextList(loopGuess, loopPossible, nm - 1));
  return survivors;
}

/**
 * One iterative pass (upstream `solve_iterative`): narrow each path's cells, in
 * turn, to their {@link pathSurvivors}. Mutates `guess` in place; returns
 * whether every cell is now a single monster.
 */
function solveIterative(common: UndeadCommon, guess: Uint8Array): boolean {
  for (const path of common.paths) {
    const survivors = pathSurvivors(common, guess, path);
    for (let i = 0; i < path.numMonsters; i++) guess[path.mapping[i]] &= survivors[i];
  }
  return guess.every(isSingleton);
}

/**
 * Whole-grid brute-force uniqueness check (upstream `solve_bruteforce`):
 * enumerate every assignment within the current candidate sets; succeed only
 * when exactly one is fully consistent, recording it into `guess`.
 */
function solveBruteforce(common: UndeadCommon, guess: Uint8Array): boolean {
  const numTotal = common.numTotal;
  if (numTotal === 0) return false;
  const loopPossible = new Int32Array(guess);
  const loopGuess = loopPossible.map(lowestBit);
  let solutions = 0;
  do {
    if (
      checkNumbers(common, loopGuess) &&
      common.paths.every((path) => checkSolution(loopGuess, path))
    ) {
      if (++solutions > 1) return false;
      guess.set(loopGuess);
    }
  } while (nextList(loopGuess, loopPossible, numTotal - 1));
  return solutions === 1;
}

// --- upstream's grading, and the solution -----------------------------------

export interface GradeResult {
  iterativeSolved: boolean;
  bruteforceSolved: boolean;
  inconsistent: boolean;
  /** cells still ambiguous after the iterative fixpoint. */
  ambiguous: number;
  /** the (possibly partial) candidate grid after solving. */
  guess: Uint8Array;
}

/**
 * Upstream's solver pipeline (`new_game_desc`'s grading block): the iterative
 * solver to a fixpoint, then brute force when `diffAllowsBruteforce` (upstream
 * skips it at Easy). The differential checks its verdicts against C; the
 * generator grades by {@link solveDeductive} instead.
 */
export function gradeUndead(
  common: UndeadCommon,
  start: Uint8Array,
  diffAllowsBruteforce: boolean,
): GradeResult {
  const guess = start.slice();
  let iterativeSolved: boolean;
  let before: Uint8Array;
  do {
    before = guess.slice();
    iterativeSolved = solveIterative(common, guess);
  } while (!iterativeSolved && before.some((v, i) => v !== guess[i]));
  const inconsistent = guess.includes(0);

  let ambiguous = 0;
  let bruteforceSolved = false;
  if (diffAllowsBruteforce && !iterativeSolved && !inconsistent) {
    ambiguous = guess.filter((v) => !isSingleton(v)).length;
    bruteforceSolved = solveBruteforce(common, guess);
  }
  return { iterativeSolved, bruteforceSolved, inconsistent, ambiguous, guess };
}

export type SolutionResult =
  | { ok: true; guess: Uint8Array }
  | { ok: false; error: string };

/**
 * The unique solution of a board, for `solve` and `findMistakes` (upstream
 * `solve_game`): {@link gradeUndead} from the fixed cells, every other cell
 * undecided. Never derived from the player's notes or non-fixed entries.
 */
export function findUndeadSolution(state: UndeadState): SolutionResult {
  const fixed = state.common.fixed;
  const start = state.guess.map((g, i) => (fixed[i] ? g : MON_NONE));
  const grade = gradeUndead(state.common, start, true);
  if (grade.inconsistent) return { ok: false, error: "Puzzle is inconsistent" };
  if (!grade.iterativeSolved && !grade.bruteforceSolved) {
    return { ok: false, error: "Puzzle is unsolvable" };
  }
  return { ok: true, guess: grade.guess };
}

/** True iff the board has exactly one solution (iterative-or-brute-force,
 * order-independent). Used by the differential's uniqueness assertion. */
export function isUniquelySolvable(common: UndeadCommon): boolean {
  const start = new Uint8Array(common.numTotal).fill(MON_NONE);
  const grade = gradeUndead(common, start, true);
  return !grade.inconsistent && (grade.iterativeSolved || grade.bruteforceSolved);
}

// --- the deductive ladder (fork divergence: guess-free generation) ---------
//
// Upstream grades difficulty by *how much brute force* a board needs, which
// conflicts with guess-free generation (docs/games/solver-and-generator.md
// § "Guess-free generation"). This ladder adds the two rungs upstream never
// built, **exact counting** and **depth-1 forcing**, above arc-consistency
// (`solveIterative`), and grades a board by the highest rung it needs.
//
// Every rung is *sound*: it narrows a cell only to values the true solution
// still allows, so a ladder that narrows every cell to a singleton has proven
// that singleton the unique solution. `solveBruteforce` remains the
// independent uniqueness oracle.

/** Highest deductive technique a board needs (or `RECURSION` if the ladder
 * stalls — that board needs nested hypothesizing = guessing). */
export const RUNG_ARC = 0;
export const RUNG_COUNTING = 1;
export const RUNG_FORCING = 2;
const RUNG_RECURSION = 3;
export type Rung = 0 | 1 | 2 | 3;

/** The ladder's cap for each tier level, `DIFF_EASY` upward. */
export const TIER_RUNG: readonly Rung[] = [RUNG_ARC, RUNG_COUNTING, RUNG_FORCING];

/**
 * Easy's bound on arc-consistency passes: a board needing more than this falls
 * to Normal even though it never leaves the arc rung.
 *
 * It lives beside the rungs because Easy is a rung *and a bound* and both of
 * its readers need the pair: the generator's tier-acceptance rule
 * (`gradeMatchesTier`) and the difficulty contract's `solveAtCap` are two
 * spellings of one rule. A copy of the bound in either could drift unnoticed,
 * because the game's own tests exercise the generator's spelling and every
 * cross-game guard the contract's.
 */
export const EASY_MAX_ARC_PASSES = 3;

/** Outcome of one propagation step/fixpoint. */
type Step = "progress" | "stuck" | "inconsistent";

/**
 * Rung 1 — arc-consistency to a fixpoint: repeat `solveIterative` (the
 * per-sightline candidate intersection) until nothing changes. Reports whether
 * it made progress / stalled / hit a contradiction, plus the pass count (used by
 * the Easy cap).
 */
function arcFixpoint(
  common: UndeadCommon,
  guess: Uint8Array,
): { step: Step; passes: number } {
  let passes = 0;
  let everChanged = false;
  while (true) {
    const before = guess.slice();
    solveIterative(common, guess);
    passes++;
    if (guess.includes(0)) return { step: "inconsistent", passes };
    if (before.every((v, i) => v === guess[i])) break;
    everChanged = true;
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
  const targets = [common.numGhosts, common.numVampires, common.numZombies];
  let changed = false;
  for (let t = 0; t < 3; t++) {
    const m = MONSTERS[t];
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
 * Rung 3 — one depth-1 forcing pass. For each remaining candidate of each
 * undecided cell, hypothesize it and run the arc+counting fixpoint on a copy; a
 * contradiction eliminates the candidate from the real grid. That is a
 * solve-from-hypothesis, so the tier needing it is `Unreasonable` and the hint
 * recorder has no such technique. **The inner fixpoint never forces**: a
 * hypothesis inside a hypothesis would be guessing, and a board that needs one
 * is left unsolved.
 */
function forcingPass(common: UndeadCommon, guess: Uint8Array): Step {
  let changed = false;
  for (let i = 0; i < common.numTotal; i++) {
    if (isSingleton(guess[i]) || guess[i] === 0) continue;
    for (const b of MONSTERS) {
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
    if (guess.every(isSingleton)) break;
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
 * Run the deductive ladder (arc-consistency → counting → forcing, each to a
 * combined fixpoint, **without recursion**) over a starting candidate grid,
 * escalating one rung at a time so the result records the *highest* technique
 * needed. This is the generator's grading entry.
 *
 * `maxRung` stops escalation early: grading for a tier rejects anything the
 * tier's rung cannot solve, so Easy and Normal need not pay for the expensive
 * forcing rung. `solved=false` then means "needs more than `maxRung`", reported
 * as `RUNG_RECURSION`. The default runs the full ladder.
 */
export function solveDeductive(
  common: UndeadCommon,
  start: Uint8Array,
  maxRung: Rung = RUNG_FORCING,
): DeductiveResult {
  const guess = start.slice();
  const arc = arcFixpoint(common, guess);
  const result = (rung: Rung, inconsistent = false): DeductiveResult => ({
    rung,
    solved: rung !== RUNG_RECURSION,
    inconsistent,
    arcPasses: arc.passes,
    guess,
  });

  if (arc.step === "inconsistent") return result(RUNG_RECURSION, true);
  if (guess.every(isSingleton)) return result(RUNG_ARC);
  if (maxRung < RUNG_COUNTING) return result(RUNG_RECURSION);

  if (arcCountFixpoint(common, guess) === "inconsistent") {
    return result(RUNG_RECURSION, true);
  }
  if (guess.every(isSingleton)) return result(RUNG_COUNTING);
  if (maxRung < RUNG_FORCING) return result(RUNG_RECURSION);

  if (forcingFixpoint(common, guess) === "inconsistent") {
    return result(RUNG_RECURSION, true);
  }
  // A stall here means the board needs recursion (nested hypothesizing).
  return result(guess.every(isSingleton) ? RUNG_FORCING : RUNG_RECURSION);
}

// --- the hint recorder (fork divergence; never on the generate/solve path) ---
//
// `recordUndeadDeductions` re-runs the ladder, but captures *each firing* —
// the candidate it eliminated or the cell it forced, and the deduction that did
// it — in dependency order, so the hint plan (`undead/index.ts`) can narrate
// every step. It is separate code from the grading and solve paths, so those
// cannot change under it. Like every rung it narrows a cell only to values the
// true solution allows, so its firings are sound to teach. It cannot recurse:
// a board the ladder cannot crack without guessing yields a short plan, and
// guess-free generation keeps such boards out of every tier below Unreasonable.

/** Why a candidate was eliminated, or a cell forced (docs/games/hints.md
 * § "Candidate-elimination games"):
 * - `sightline` — one path's two count clues admit no legal beam arrangement
 *   leaving this cell the eliminated monster (the core mirror-sighting deduction);
 * - `total` — a monster type's full count is already placed, so it is struck from
 *   every still-undecided cell;
 * - `onlyCells` — exactly as many cells can still hold a type as remain to place,
 *   so each of them is forced to it (counting's dual, a placement);
 * - `single` — the cell's notes are down to one monster (the planner's reason,
 *   never the recorder's).
 *
 * There is deliberately no `forcing` reason, so a hint narrating the search rung
 * is a compile error rather than a convention; see
 * {@link recordUndeadDeductions}. */
export type UndeadReason =
  | { kind: "sightline"; path: number }
  | { kind: "total"; monster: number }
  | { kind: "onlyCells"; monster: number; nCells: number }
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

/** Record the first path-pass that eliminates a candidate; apply it to `cand`.
 * One path-pass is one firing (`group`). Returns its ops, or `[]`. */
function recordSightlinePass(
  common: UndeadCommon,
  cand: Uint8Array,
  group: number,
): HintOp[] {
  for (let p = 0; p < common.numPaths; p++) {
    const path = common.paths[p];
    const survivors = pathSurvivors(common, cand, path);
    const ops: HintOp[] = [];
    for (let j = 0; j < path.numMonsters; j++) {
      const m = path.mapping[j];
      const removed = cand[m] & ~survivors[j];
      if (!removed) continue;
      for (const b of MONSTERS) {
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
    const m = MONSTERS[t];
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

/**
 * Run the ladder's counting and sightline rungs over the candidates `placed`
 * implies (a placed cell's single monster, otherwise all three), recording every
 * firing in dependency order. Each round records the first technique that
 * fires, counting first (totals lead), until neither does.
 */
export function recordUndeadDeductions(
  common: UndeadCommon,
  placed: Uint8Array,
): HintOp[] {
  const cand = placed.map((v) => (isSingleton(v) ? v : MON_NONE));
  const ops: HintOp[] = [];
  let group = 0;
  // One firing = one `group`, bumped only after it fires.
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
    // **No forcing technique.** The ladder's third rung hypothesizes a
    // candidate and runs the arc+counting *fixpoint* from it, a search the
    // collection permits only on an `Unreasonable` board and never presents as
    // a technique. `solveDeductive` keeps the rung for grading; the hint stops
    // where the search would begin, and refuses. Both techniques sit on tier 0:
    // this ladder records, it does not grade.
    techniques: [
      { id: "counting", tier: 0, run: () => record(recordCountingPass) },
      { id: "sightline", tier: 0, run: () => record(recordSightlinePass) },
    ],
    budget: stepBudget("undead hint recorder"),
    // A contradiction (an emptied candidate cell) stops the ladder — the hint
    // refuses on such a board anyway. So `settled` here means that, never
    // "solved".
    settled: () => cand.includes(0),
  });
  return ops;
}
