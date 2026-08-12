/**
 * Salad's solver — a consumer of the shared Latin framework
 * ([`engine/latin.ts`](../../engine/latin.ts)), per docs/games/solver-and-generator.md § "The Latin family".
 *
 * **The pseudo-Latin-square trick.** Salad wants "each of `nums` symbols once
 * per line, the rest of the line empty", which is not a Latin square. Upstream
 * fakes it with a *complete* order-`o` square whose symbols above `nums` are
 * reinterpreted as **holes** — since a full square places each of the `o`
 * symbols once per line, exactly `o − nums` squares per line become holes for
 * free. That is why the shared `latinSolver` cube and `latinGenerate` are used
 * unchanged: the "empty" symbol is just symbols `nums+1..o` collapsed together.
 *
 * The salad-specific deductions therefore spend their time **translating**
 * between the two views: {@link latinholesSolverSync} reads the cube and writes
 * the `holes` map ("no candidate ≤ nums survives here, so this is a hole"),
 * while `placeCross`/`placeCircle` push a known marker back into the cube. The
 * board's author calls this machinery "fairly messy" in
 * `puzzles/unreleased/docs/salad.md`, and wishes for first-class Latin-squares-
 * with-repeats support upstream; that is a framework project, not a port, so
 * this reproduces the workaround (see the change's `design.md`).
 *
 * Two difficulties, both **guess-free**: upstream passes
 * `diff_recursive = DIFF_IMPOSSIBLE`, so `latinSolver` never recurses at either
 * tier. Normal (`DIFF_EASY`) is these deductions plus the generic positional /
 * numeric elimination; Extreme (`DIFF_HARD`) adds the generic set-elimination
 * and forcing-chain techniques (upstream gives Extreme no salad-specific
 * user-solver of its own).
 */

import type { DeductionRecord } from "../../engine/deduction-record.ts";
import {
  DIFF_IMPOSSIBLE,
  LatinSolver,
  type LatinSolverConfig,
  latinSolver,
} from "../../engine/latin.ts";
import {
  borderScans,
  CIRCLE,
  CROSS,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_HOLESONLY,
  GAMEMODE_LETTERS,
  latinholesCheck,
  type SaladBoard,
  type SaladState,
  scratchBoard,
} from "./state.ts";

// --- the hole ↔ candidate translation --------------------------------------

/**
 * Upstream `latinholes_solver_sync`: for every square with no marker yet, ask
 * the cube whether it can still take a symbol (`≤ nums`) and whether it can
 * still be a hole (`> nums`). Whichever is impossible settles the square.
 */
function latinholesSolverSync(solver: LatinSolver, b: SaladBoard): number {
  const o = solver.o;
  const nums = b.nums;
  if (nums === o) return 0;

  let nchanged = 0;
  for (let i = 0; i < o * o; i++) {
    if (b.holes[i]) continue;
    const x = i % o;
    const y = (i / o) | 0;

    let match = false;
    for (let n = 0; n < nums; n++) if (solver.cubeGet(x, y, n + 1)) match = true;
    if (!match) {
      nchanged++;
      b.holes[i] = CROSS;
      continue;
    }

    match = false;
    for (let n = nums; n < o; n++) if (solver.cubeGet(x, y, n + 1)) match = true;
    if (!match) {
      nchanged++;
      b.holes[i] = CIRCLE;
    }
  }
  return nchanged;
}

/** Upstream `latinholes_solver_place_cross`: a known-empty square can hold no
 * symbol, so strike every candidate `1..nums` from it. */
function placeCross(solver: LatinSolver, b: SaladBoard, x: number, y: number): number {
  let nchanged = 0;
  for (let n = 0; n < b.nums; n++) {
    const pos = solver.cubepos(x, y, n + 1);
    if (!solver.cube[pos]) continue;
    solver.cube[pos] = 0;
    nchanged++;
  }
  return nchanged;
}

/** Upstream `latinholes_solver_place_circle`: a known-filled square cannot be a
 * hole, so strike every hole symbol `nums+1..o` from it. */
function placeCircle(solver: LatinSolver, b: SaladBoard, x: number, y: number): number {
  let nchanged = 0;
  for (let n = b.nums; n < solver.o; n++) {
    const pos = solver.cubepos(x, y, n + 1);
    if (!solver.cube[pos]) continue;
    solver.cube[pos] = 0;
    nchanged++;
  }
  return nchanged;
}

/**
 * Upstream `latinholes_solver_count`: per row and column, once `order − nums`
 * crosses are known every other square must be filled; once `nums` circles are
 * known every other square must be empty.
 */
function latinholesSolverCount(solver: LatinSolver, b: SaladBoard): number {
  const o = solver.o;
  const nums = b.nums;
  let nchanged = 0;
  let x = 0;
  let y = 0;

  for (let dir = 0; dir < 2; dir++) {
    for (let i = 0; i < o; i++) {
      if (dir) x = i;
      else y = i;

      let holecount = 0;
      let circlecount = 0;
      for (let j = 0; j < o; j++) {
        if (dir) y = j;
        else x = j;
        if (b.holes[y * o + x] === CROSS) holecount++;
        if (b.holes[y * o + x] === CIRCLE) circlecount++;
      }

      if (holecount === o - nums) {
        for (let j = 0; j < o; j++) {
          if (dir) y = j;
          else x = j;
          if (!b.holes[y * o + x]) nchanged += placeCircle(solver, b, x, y);
        }
      } else if (circlecount === nums) {
        for (let j = 0; j < o; j++) {
          if (dir) y = j;
          else x = j;
          if (!b.holes[y * o + x]) nchanged += placeCross(solver, b, x, y);
        }
      }
    }
  }

  return nchanged;
}

// --- the ABC End View border deduction -------------------------------------

/**
 * Why a border-clue elimination is forced — the premise Salad's hint narrates
 * (hint path only; every allocation below is gated on `solver.recorder`, so the
 * generator path builds none of these).
 */
export type BorderReason =
  /** Near the clue: the first square that could hold a symbol must hold the
   * clue's, so every *other* symbol is ruled out of it. `skipped` counts the
   * already-known-empty squares between the clue and this one. */
  | { kind: "borderNear"; clue: number; clueVal: number; skipped: number }
  /** Past the clue's reach: the clue's own symbol cannot sit this far in.
   * `reach` is how many squares from the clue it may still sit (0-based), which
   * starts at `order − nums` (the line's whole hole budget), is reduced by the
   * `tightenedBy` empty squares already marked beyond it, and is cut off
   * outright at `circleAt` if a square in between is known to hold a symbol. */
  | {
      kind: "borderFar";
      clue: number;
      clueVal: number;
      reach: number;
      holes: number;
      tightenedBy: number;
      circleAt: number | null;
    };

/**
 * Upstream `salad_letters_solver_dir`, for one border clue looking inward:
 *
 * - **Near the clue**, until the first square that isn't a known hole, no
 *   symbol *other than* the clue's can appear — whatever the clue sees first
 *   must be the clue.
 * - **Past the clue's reach**, the clue symbol itself can no longer appear. The
 *   reach is `order − nums` squares (the most holes a line can hold), shortened
 *   by every hole already confirmed *beyond* that distance, and cut short
 *   outright by a confirmed circle.
 */
function saladLettersSolverDir(
  solver: LatinSolver,
  b: SaladBoard,
  si: number,
  di: number,
  ei: number,
  cd: number,
): number {
  const clue = b.borderclues[cd];
  if (!clue) return 0;

  const o = solver.o;
  const nums = b.nums;
  const rec = solver.recorder;
  let nchanged = 0;

  // The furthest the clue symbol can sit from the clue: one square per hole the
  // line may still contain, minus the holes already confirmed out of range.
  let maxdist = o - nums;
  for (let i = si + di * (o - nums); i !== ei; i += di) {
    if (b.holes[i] === CROSS) maxdist--;
  }

  let dist = 0;
  let found = false;
  let outofrange = false;
  // Hint-only provenance for the far arm: which square (if any) cut the reach
  // short by being known to hold a symbol, and how many squares to walk back.
  let circleAt: number | null = null;

  for (let i = si; i !== ei; i += di) {
    const x = i % o;
    const y = (i / o) | 0;

    if (!found) {
      for (let j = 1; j <= nums; j++) {
        if (j === clue) continue;
        const pos = solver.cubepos(x, y, j);
        if (solver.cube[pos]) {
          if (rec) {
            rec({
              kind: "elim",
              x,
              y,
              n: j,
              reason: {
                kind: "borderNear",
                clue: cd,
                clueVal: clue,
                skipped: dist,
              } satisfies BorderReason,
              group: solver.group,
            });
          }
          solver.cube[pos] = 0;
          nchanged++;
        }
      }
    }

    if (b.holes[i] !== CROSS) found = true;

    if (outofrange) {
      const pos = solver.cubepos(x, y, clue);
      if (solver.cube[pos]) {
        if (rec) {
          rec({
            kind: "elim",
            x,
            y,
            n: clue,
            reason: {
              kind: "borderFar",
              clue: cd,
              clueVal: clue,
              reach: maxdist,
              holes: o - nums,
              tightenedBy: o - nums - maxdist,
              circleAt,
            } satisfies BorderReason,
            group: solver.group,
          });
        }
        solver.cube[pos] = 0;
        nchanged++;
      }
    }
    dist++;

    if (b.holes[i] === CIRCLE) {
      if (!outofrange) circleAt = i;
      outofrange = true;
    } else if (dist > maxdist) {
      outofrange = true;
    }
  }

  return nchanged;
}

/** Upstream `salad_letters_solver`: run the border deduction on all `4·order`
 * clues, in the top / left / bottom / right order the clue array uses. */
function saladLettersSolver(solver: LatinSolver, b: SaladBoard): number {
  let nchanged = 0;
  for (let i = 0; i < solver.o; i++) {
    for (const s of borderScans(i, solver.o)) {
      const n = saladLettersSolverDir(solver, b, s.start, s.step, s.end, s.clue);
      nchanged += n;
      // **Hint path only**: one *clue's* scan is one firing, so stop after the
      // first that fires and let the driver open a new `group`. Without this the
      // whole sweep lands in one group and a hint step would gather strikes from
      // unrelated clues in unrelated lines under one clue's narration (§3's
      // group-per-firing-not-per-pass trap — caught here by a highlight test
      // finding a "far" step whose targets spanned three rows). Gated, so the
      // generator sweeps every clue exactly as upstream does.
      if (n && solver.recorder) return nchanged;
    }
  }
  return nchanged;
}

/** Upstream `salad_solver_easy`: the whole salad-specific rung. On the hint path
 * each of its three deductions returns separately, for the group-per-firing
 * reason above. */
function saladSolverEasy(solver: LatinSolver, b: SaladBoard): number {
  const recording = solver.recorder !== undefined;
  let nchanged = latinholesSolverSync(solver, b);
  if (nchanged && recording) return nchanged;
  if (b.mode === GAMEMODE_LETTERS) {
    const n = saladLettersSolver(solver, b);
    nchanged += n;
    if (n && recording) return nchanged;
  }
  nchanged += latinholesSolverCount(solver, b);
  return nchanged;
}

// --- the driver ------------------------------------------------------------

/** Seed the cube with the fixed grid clues — a symbol placement, or the
 * ball/cross constraints that place no digit and so cannot travel through the
 * seeded grid (this is why `latinSolver` grew its `seed` hook). */
function seedGridClues(solver: LatinSolver, b: SaladBoard): void {
  const o = b.order;
  for (let i = 0; i < o * o; i++) {
    const clue = b.gridclues[i];
    const x = i % o;
    const y = (i / o) | 0;
    if (clue === CROSS) placeCross(solver, b, x, y);
    else if (clue === CIRCLE) placeCircle(solver, b, x, y);
    else if (clue) solver.place(x, y, clue);
  }
}

/** Seed the cube from a board's *confirmed markers* — the hint path's analogue
 * of {@link seedGridClues}. A cross or ball is a real entry (Check & Save flags a
 * wrong one), so it is a fact the working cube may assume; the player's *pencil
 * notes* never are (docs/games/hints.md § "The recorder and the soundness boundary"'s soundness boundary). Symbols need no
 * seeding here because they sit in `b.grid`, which `LatinSolver.alloc` places. */
function seedMarkers(solver: LatinSolver, b: SaladBoard): void {
  const o = b.order;
  for (let i = 0; i < o * o; i++) {
    const x = i % o;
    const y = (i / o) | 0;
    if (b.holes[i] === CROSS) placeCross(solver, b, x, y);
    else if (b.holes[i] === CIRCLE) placeCircle(solver, b, x, y);
  }
}

/** What one recording run of the solver saw, from the player's board forward. */
export interface SaladDeductions {
  /** Every candidate cleared / cell placed, in solver order, each carrying the
   * reason that forced it. Values run over the *whole* order-`o` alphabet, so an
   * op with `n > nums` concerns one of the interchangeable hole symbols and has
   * no player-visible note (see `hint.ts`). */
  ops: DeductionRecord[];
  /** The marker array at the deduction fixpoint: which squares are forced empty
   * ({@link CROSS}) or forced to hold a symbol ({@link CIRCLE}). Salad's hole
   * deductions write markers rather than candidates, so this — not `ops` — is
   * where "this square must be empty" shows up. */
  holes: Uint8Array;
  /** The grid at the fixpoint, for the same reason. */
  grid: Uint8Array;
}

/**
 * Run the solver over a copy of `b` at `maxdiff` with recording on, and report
 * everything it deduced (hint path only). Deductive only — both of Salad's tiers
 * pass `diffRecursive = DIFF_IMPOSSIBLE`, so there is nothing to cap.
 *
 * The generator/solve path never sets `cfg.recorder`, so every reason allocation
 * and record threaded through the deductions above is inert there — proved by the
 * 28-fixture byte-match differential staying green unedited.
 */
export function recordSaladDeductions(b: SaladBoard, maxdiff: number): SaladDeductions {
  const o = b.order;
  const grid = b.grid.slice();
  const holes = b.holes.slice();
  const work: SaladBoard = { ...b, grid, holes };
  const ops: DeductionRecord[] = [];

  const cfg: LatinSolverConfig<SaladBoard> = {
    maxdiff,
    diffSimple: DIFF_EASY,
    diffSet0: DIFF_HARD,
    diffSet1: DIFF_HARD,
    // **The hint may not reach the forcing rung, on any tier**
    // (`audit-guessing-tier-names`, design D4 — the Galaxies precedent). This is
    // the *recording* solver, the hint's projection of the deduction, and a
    // conclusion reached by propagating from a hypothesis is a search result
    // rather than a technique a player can learn. Where it would have fired, the
    // plan simply ends and `candidateHint` refuses with "No further move can be
    // deduced from this position" — which is the honest thing to say.
    //
    // Salad's *solve* path (`saladSolve`, which the generator gates on) keeps
    // the rung at `DIFF_HARD`, so no board changes and the byte-match
    // differential is untouched. The five Latin games reach the same state a
    // different way: they already cap their hint at `min(tier, DIFF_EXTREME)`,
    // and moving the rung to `Unreasonable` put it out of that reach.
    diffForcing: DIFF_IMPOSSIBLE,
    diffRecursive: DIFF_IMPOSSIBLE,
    usersolvers: [saladSolverEasy, null],
    valid: () => true,
    ctx: work,
    seed: (solver) => {
      seedMarkers(solver, work);
    },
    recorder: (rec) => ops.push(rec),
    budgetLabel: "salad hint",
  };
  latinSolver(grid, o, cfg);

  return { ops, holes, grid };
}

/**
 * Upstream `salad_solve`: solve `b` in place at difficulty `maxdiff` and report
 * whether the result is a *complete, valid* board. `b.grid` and `b.holes` are
 * written; the caller supplies them blank (the generator) or seeded with the
 * clues (play).
 *
 * `DIFF_HOLESONLY` is the Number Ball generator's quality gate rather than a
 * playable tier: run only the two hole deductions to a fixpoint and report
 * whether *every* hole fell out with no number entered.
 */
export function saladSolve(b: SaladBoard, maxdiff: number): boolean {
  const o = b.order;
  const o2 = o * o;

  if (maxdiff === DIFF_HOLESONLY) {
    const solver = new LatinSolver(o);
    solver.alloc(b.grid);
    seedGridClues(solver, b);

    let nchanged = 1;
    while (nchanged) {
      nchanged = latinholesSolverSync(solver, b) + latinholesSolverCount(solver, b);
    }

    let holes = 0;
    for (let i = 0; i < o2; i++) if (b.holes[i] === CROSS) holes++;
    return holes === (o - b.nums) * o;
  }

  const cfg: LatinSolverConfig<SaladBoard> = {
    maxdiff,
    diffSimple: DIFF_EASY,
    diffSet0: DIFF_HARD,
    diffSet1: DIFF_HARD,
    diffForcing: DIFF_HARD,
    // Never recurse: both tiers are pure deduction (the guess-free policy).
    diffRecursive: DIFF_IMPOSSIBLE,
    usersolvers: [saladSolverEasy, null],
    // Salad has no whole-grid post-check beyond `latinholesCheck` below.
    valid: () => true,
    ctx: b,
    seed: (solver) => {
      seedGridClues(solver, b);
    },
  };
  latinSolver(b.grid, o, cfg);

  // Upstream discards the difficulty `latin_solver_main` reports and asks only
  // whether the board came out complete and legal — which, with recursion
  // disabled, is exactly "pure deduction finished it", hence unique.
  return latinholesCheck(b);
}

// --- Check & Save ----------------------------------------------------------

/** A player marking that contradicts the unique solution. All four render as
 * the same red overlay; the kinds exist so tests (and any future hint) can say
 * *what* is wrong. */
export interface SaladMistake {
  kind: "cell" | "cross" | "circle" | "note";
  x: number;
  y: number;
}

/**
 * Re-solve from the fixed clues alone and flag every player marking the unique
 * solution contradicts (docs/games/solver-and-generator.md § "The solvable-game contract"): a wrong symbol, a cross on a square
 * that holds one, a circle on a square that must stay empty, and — notes being
 * first-class markings (§3.7) — an empty square whose non-empty notes have
 * crossed out its solution value. Returns `[]` when the board is not uniquely
 * deducible, so Check & Save neither blesses nor blocks what it cannot judge.
 */
export function saladFindMistakes(s: SaladState): SaladMistake[] {
  const o = s.order;
  const nums = s.nums;
  const board = scratchBoard(s);
  // Solve at the top tier: Salad's Extreme rung only *adds* sound generic
  // techniques to Normal's, so a Normal board still solves here (pinned by the
  // "generate low, solve high" test — docs/games/solver-and-generator.md § "Solver-gated generation"'s monotonicity check).
  if (!saladSolve(board, DIFF_HARD)) return [];

  const out: SaladMistake[] = [];
  for (let i = 0; i < o * o; i++) {
    const clue = s.gridclues[i];
    // A fixed symbol or cross is by definition correct; a fixed *circle* still
    // leaves the square's symbol up to the player.
    if (clue && clue !== CIRCLE) continue;

    // The solution's value here: a symbol `1..nums`, or 0 for a hole (the
    // pseudo-Latin square's symbols above `nums`).
    const soln = board.grid[i] <= nums ? board.grid[i] : 0;
    const x = i % o;
    const y = (i / o) | 0;

    if (s.grid[i] !== 0) {
      if (s.grid[i] !== soln) out.push({ kind: "cell", x, y });
      continue;
    }
    if (s.holes[i] === CROSS) {
      if (soln !== 0) out.push({ kind: "cross", x, y });
      continue;
    }
    if (s.holes[i] === CIRCLE && soln === 0) {
      out.push({ kind: "circle", x, y });
      continue;
    }
    // Notes: bit `n−1` is symbol `n`, bit `nums` the "might be empty" mark.
    const solnBit = soln === 0 ? 1 << nums : 1 << (soln - 1);
    if (s.marks[i] !== 0 && !(s.marks[i] & solnBit)) out.push({ kind: "note", x, y });
  }
  return out;
}

/**
 * The solved board as one entry per cell (a symbol `1..nums`, or 0 for a hole)
 * — what `Game.solve` turns into a `solve` move. `null` when no solution is
 * deducible.
 */
export function saladSolution(s: SaladState): number[] | null {
  const board = scratchBoard(s);
  if (!saladSolve(board, DIFF_HARD)) return null;
  const cells: number[] = [];
  for (let i = 0; i < s.order * s.order; i++) {
    cells.push(board.grid[i] <= s.nums ? board.grid[i] : 0);
  }
  return cells;
}
