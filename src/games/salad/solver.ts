/**
 * Salad's solver — a consumer of the shared Latin framework
 * ([`engine/latin.ts`](../../engine/latin.ts)), per docs/games/solver-and-generator.md § "The Latin family".
 *
 * **The empty square is a symbol of the cube.** Salad wants "each of `nums`
 * symbols once per line, the other `order − nums` squares empty" — a
 * *pseudo*-Latin square. The cube expresses that directly: it is told its last
 * symbol, {@link holeSymbol} (`nums + 1`), repeats `order − nums` times per line
 * (`LatinRepeats`), and from there every generic deduction reasons about "the
 * empty square" as a value with a multiplicity — placed when exactly that many
 * cells of a line can still be empty, struck from a line once it holds all its
 * empties, weighed correctly by set elimination, never used as a forcing-chain
 * link. Upstream instead fakes the rule with a *full* order-`o` square whose
 * symbols above `nums` are reinterpreted as holes, and its solver spends its
 * time translating between the two views ("fairly messy", its author says in
 * `docs/salad.md`, wishing for exactly this support). That translation layer —
 * `latinholes_solver_sync`, `_count`, `_place_cross`, `_place_circle` — is gone;
 * what it computed by hand, the cube now knows.
 *
 * The player's two markers map onto the cube in one line each: a **cross**
 * (known empty) is the hole symbol *placed*; a **ball** (known to hold a symbol,
 * which one unknown) is the hole symbol *struck*. The `holes` array on a board
 * is the player-facing record of those two facts and is read back off the cube
 * after a solve ({@link markersFromCube}).
 *
 * What stays Salad's own is the ABC End View border deduction
 * ({@link saladLettersSolverDir}), which reads the cube for "known empty" /
 * "known filled" where it used to read the marker array.
 *
 * Two difficulties, both **guess-free**: `diffRecursive = DIFF_IMPOSSIBLE`, so
 * the cube never recurses at either tier. Normal (`DIFF_EASY`) is the border
 * deduction plus the generic positional / numeric elimination — which, with the
 * hole a real symbol, now includes "only these `k` squares can be empty" and
 * "this line already has its `k` empties"; Extreme (`DIFF_HARD`) adds the
 * generic set elimination and forcing chains.
 */

import type { DeductionRecord } from "../../engine/deduction-record.ts";
import {
  DIFF_IMPOSSIBLE,
  type LatinRepeats,
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

// --- the hole as a cube symbol ---------------------------------------------

/** The cube's symbol for an empty square: one past the last real symbol. This
 * is also the value a solved working `grid` holds in an empty square, which is
 * why every reader of a solved grid tests `<= nums`. */
export function holeSymbol(nums: number): number {
  return nums + 1;
}

/** How the cube is told about the empty squares. With exactly one empty square
 * per line (`nums = order − 1`) the hole is an ordinary once-per-line symbol
 * and needs no declaration. */
function repeatsFor(b: SaladBoard): LatinRepeats | undefined {
  const times = b.order - b.nums;
  return times >= 2 ? { times } : undefined;
}

/** Known empty: the hole symbol is *placed* here. */
function isKnownHole(solver: LatinSolver, i: number, hole: number): boolean {
  return solver.grid[i] === hole;
}

/** Known to hold a symbol (a ball, or a placed symbol): the hole is struck. */
function isKnownFilled(
  solver: LatinSolver,
  x: number,
  y: number,
  hole: number,
): boolean {
  return !solver.cubeGet(x, y, hole);
}

/** A cross: the square is empty, so the hole symbol goes here. A cross where
 * the cube has already ruled the hole out is a contradiction; emptying the cell
 * of every candidate is how the cube is told, and `elim` reports it. */
function placeCross(solver: LatinSolver, b: SaladBoard, x: number, y: number): void {
  const hole = holeSymbol(b.nums);
  if (solver.grid[y * b.order + x] !== 0) return;
  if (solver.cubeGet(x, y, hole)) solver.place(x, y, hole);
  else
    for (let n = 1; n <= solver.symbols; n++) solver.cube[solver.cubepos(x, y, n)] = 0;
}

/** A ball: the square holds *some* symbol, so it is not the hole. */
function placeCircle(solver: LatinSolver, b: SaladBoard, x: number, y: number): void {
  solver.cube[solver.cubepos(x, y, holeSymbol(b.nums))] = 0;
}

/** Read the two markers back off a finished cube into `holes`: a placed hole is
 * a cross, a struck hole a ball. `cube` is the solver's final candidate cube
 * (`cubeOut`), laid out with `symbols` values per cell. */
function markersFromCube(b: SaladBoard, grid: Uint8Array, cube: Uint8Array): void {
  const o = b.order;
  const hole = holeSymbol(b.nums);
  const symbols = hole;
  for (let i = 0; i < o * o; i++) {
    const x = i % o;
    const y = (i / o) | 0;
    if (grid[i] === hole) b.holes[i] = CROSS;
    else if (!cube[(x * o + y) * symbols + hole - 1]) b.holes[i] = CIRCLE;
  }
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
 *   outright by a confirmed ball.
 *
 * "Known hole" and "known ball" are read off the cube — a placed hole symbol, a
 * struck one — where upstream read its marker array.
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
  const hole = holeSymbol(nums);
  const rec = solver.recorder;
  let nchanged = 0;

  // The furthest the clue symbol can sit from the clue: one square per hole the
  // line may still contain, minus the holes already confirmed out of range.
  let maxdist = o - nums;
  for (let i = si + di * (o - nums); i !== ei; i += di) {
    if (isKnownHole(solver, i, hole)) maxdist--;
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

    if (!isKnownHole(solver, i, hole)) found = true;

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

    if (isKnownFilled(solver, x, y, hole)) {
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

/** Salad's own rung: the border deduction, in ABC End View mode. Number Ball has
 * nothing of its own left — its balls and crosses are cube facts, and the hole
 * deductions upstream wrote by hand are the cube's generic ones now. */
function saladSolverEasy(solver: LatinSolver, b: SaladBoard): number {
  return b.mode === GAMEMODE_LETTERS ? saladLettersSolver(solver, b) : 0;
}

// --- the driver ------------------------------------------------------------

/** Seed the cube with the fixed grid clues — a symbol placement, or the
 * ball/cross constraints, which place no *real* symbol and so cannot travel
 * through the seeded grid (this is why `latinSolver` grew its `seed` hook). */
function seedGridClues(solver: LatinSolver, b: SaladBoard): void {
  const o = b.order;
  for (let i = 0; i < o * o; i++) {
    const clue = b.gridclues[i];
    const x = i % o;
    const y = (i / o) | 0;
    if (clue === CROSS) placeCross(solver, b, x, y);
    else if (clue === CIRCLE) placeCircle(solver, b, x, y);
    else if (clue && solver.grid[i] === 0) solver.place(x, y, clue);
  }
}

/** Seed the cube from a board's *confirmed markers* — the hint path's analog
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

/** The shared config for a solve at `maxdiff` over `b`, seeded by `seed`. */
function configFor(
  b: SaladBoard,
  maxdiff: number,
  seed: (solver: LatinSolver) => void,
  cubeOut: Uint8Array,
): LatinSolverConfig<SaladBoard> {
  return {
    repeats: repeatsFor(b),
    maxdiff,
    diffSimple: DIFF_EASY,
    diffSet0: DIFF_HARD,
    diffSet1: DIFF_HARD,
    diffForcing: DIFF_HARD,
    // Never recurse: both tiers are pure deduction (the guess-free policy).
    diffRecursive: DIFF_IMPOSSIBLE,
    usersolvers: [saladSolverEasy, null],
    // Salad has no whole-grid post-check beyond `latinholesCheck`.
    valid: () => true,
    ctx: b,
    seed,
    cubeOut,
  };
}

/** The final candidate cube's size for `b` — `order² × symbols`. */
function cubeSize(b: SaladBoard): number {
  return b.order * b.order * holeSymbol(b.nums);
}

/** What one recording run of the solver saw, from the player's board forward. */
export interface SaladDeductions {
  /** Every candidate cleared / cell placed, in solver order, each carrying the
   * reason that forced it. Values run over `1..nums + 1`: an op with
   * `n === nums + 1` concerns the empty-square symbol, whose player-visible
   * note is the X mark (see `hint.ts` for which of those the plan teaches). */
  ops: DeductionRecord[];
  /** The marker array at the deduction fixpoint: which squares are forced empty
   * ({@link CROSS}) or forced to hold a symbol ({@link CIRCLE}), read back off
   * the cube. */
  holes: Uint8Array;
  /** The grid at the fixpoint, holes as {@link holeSymbol}. */
  grid: Uint8Array;
}

/**
 * Run the solver over a copy of `b` at `maxdiff` with recording on, and report
 * everything it deduced (hint path only). Deductive only — both of Salad's tiers
 * pass `diffRecursive = DIFF_IMPOSSIBLE`, so there is nothing to cap.
 *
 * The generator/solve path never sets `cfg.recorder`, so every reason allocation
 * and record threaded through the deductions above is inert there.
 */
export function recordSaladDeductions(b: SaladBoard, maxdiff: number): SaladDeductions {
  const o = b.order;
  const grid = b.grid.slice();
  const holes = b.holes.slice();
  const work: SaladBoard = { ...b, grid, holes };
  const ops: DeductionRecord[] = [];
  const cube = new Uint8Array(cubeSize(b));

  const cfg: LatinSolverConfig<SaladBoard> = {
    ...configFor(work, maxdiff, (solver) => seedMarkers(solver, work), cube),
    recorder: (rec) => ops.push(rec),
    budgetLabel: "salad hint",
  };
  latinSolver(grid, o, cfg);
  markersFromCube(work, grid, cube);

  return { ops, holes, grid };
}

/**
 * Upstream `salad_solve`: solve `b` in place at difficulty `maxdiff` and report
 * whether the result is a *complete, valid* board. `b.grid` and `b.holes` are
 * written; the caller supplies them blank (the generator) or seeded with the
 * clues (play).
 *
 * `DIFF_HOLESONLY` is the Number Ball generator's quality gate rather than a
 * playable tier: reason about the empty squares alone — where the hole symbol
 * must go and where it cannot — and report whether *every* hole fell out with
 * no number entered. A board that passes never made the player think about a
 * number's position, which is the concept the mode exists for.
 */
export function saladSolve(b: SaladBoard, maxdiff: number): boolean {
  const o = b.order;
  const o2 = o * o;
  const hole = holeSymbol(b.nums);

  if (maxdiff === DIFF_HOLESONLY) {
    const solver = new LatinSolver(o, repeatsFor(b));
    solver.alloc(b.grid);
    seedGridClues(solver, b);
    holesOnlyFixpoint(solver, hole);
    let holes = 0;
    for (let i = 0; i < o2; i++) if (b.grid[i] === hole) holes++;
    return holes === (o - b.nums) * o;
  }

  const cube = new Uint8Array(cubeSize(b));
  latinSolver(
    b.grid,
    o,
    configFor(b, maxdiff, (solver) => seedGridClues(solver, b), cube),
  );
  markersFromCube(b, b.grid, cube);

  // Upstream discards the difficulty `latin_solver_main` reports and asks only
  // whether the board came out complete and legal — which, with recursion
  // disabled, is exactly "pure deduction finished it", hence unique.
  return latinholesCheck(b);
}

/**
 * The hole-only deductions to a fixpoint: a line with exactly its quota of
 * possible empties has them all (positional elimination on the hole symbol,
 * whose placement strikes the line once full), and a square that can hold
 * nothing *but* the hole is empty. Never places a real symbol — that is the
 * whole point of the gate.
 */
function holesOnlyFixpoint(solver: LatinSolver, hole: number): void {
  const o = solver.o;
  const s = solver.symbols;
  for (;;) {
    let changed = 0;
    for (let y = 0; y < o; y++) {
      if (solver.row[y * s + hole - 1] < solver.times) {
        if (solver.elim(solver.cubepos(0, y, hole), o * s) > 0) changed++;
      }
    }
    for (let x = 0; x < o; x++) {
      if (solver.col[x * s + hole - 1] < solver.times) {
        if (solver.elim(solver.cubepos(x, 0, hole), s) > 0) changed++;
      }
    }
    for (let i = 0; i < o * o; i++) {
      if (solver.grid[i] !== 0) continue;
      const x = i % o;
      const y = (i / o) | 0;
      let real = 0;
      for (let n = 1; n < hole; n++) if (solver.cubeGet(x, y, n)) real++;
      if (real === 0 && solver.cubeGet(x, y, hole)) {
        solver.place(x, y, hole);
        changed++;
      }
    }
    if (!changed) return;
  }
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
    // cube's hole symbol, `nums + 1`).
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
    if (s.pencil[i] !== 0 && !(s.pencil[i] & solnBit)) out.push({ kind: "note", x, y });
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
