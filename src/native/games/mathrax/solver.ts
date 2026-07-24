/**
 * Mathrax solver — the game-specific clue deduction plus a thin difficulty
 * driver over the shared generic `LatinSolver` (`engine/latin.ts`), exactly the
 * Latin-family shape (playbook §2.2).
 *
 * Everything Latin — positional/numeric elimination, set elimination, forcing
 * chains, and the guess-and-verify recursion that doubles as the uniqueness
 * check — comes from the framework. Mathrax adds a single user-solver body
 * (`applyOptions`) wired at three difficulty rungs: for every cell it intersects
 * the candidate set with {@link mathraxOptions} across the (up to four) clues at
 * its corners, and writes the eliminations back into the cube.
 *
 * The three rungs are the *same* body under two gates:
 * - **Easy** (`simple`) only reads an arithmetic clue when the cell across the
 *   intersection is already confirmed to a single digit;
 * - **Easy and Normal** only commit an elimination that immediately confirms a
 *   single digit;
 * - **Tricky** propagates fully.
 *
 * Byte-match surface: the generator is solver-gated, so this file's exact
 * deductive *strength* decides which puzzles exist (playbook §4.4). The
 * candidate masks therefore keep upstream's `BIT(d) = 1 << (d − 1)` convention
 * verbatim — do not "align" them with the player-facing pencil-mark encoding.
 */

import {
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  DIFF_UNFINISHED,
  type LatinSolver,
  latinSolver,
} from "../../engine/latin.ts";
import {
  bitOf,
  DIFF_EASY,
  DIFF_NORMAL,
  DIFF_RECURSIVE,
  DIFF_TRICKY,
  mathraxOptions,
} from "./state.ts";

export { mathraxOptions };

/** Solver verdicts, upstream `mathrax_solve`'s return codes. */
export const SOLVE_IMPOSSIBLE = -1;
export const SOLVE_STUCK = 0;
export const SOLVE_UNIQUE = 1;
export const SOLVE_AMBIGUOUS = 2;

/** The per-solve context: a mirror of the candidate cube in Mathrax's own
 * `BIT(d)` bitmap form, plus the (immutable) clue array. The marks mirror is
 * mutated as the cube narrows, so the recursion needs a real clone — unlike
 * Keen/Towers, whose contexts are immutable. */
interface MathraxCtx {
  marks: Int32Array;
  clues: Int32Array;
}

/**
 * The one Mathrax deduction, at difficulty rung `diff` (upstream
 * `mathrax_solver_apply_options`). Returns the number of candidates eliminated,
 * or `−1` on a contradiction (a cell left with no candidate at all).
 */
function applyOptions(solver: LatinSolver, ctx: MathraxCtx, diff: number): number {
  const o = solver.o;
  const co = o - 1;
  const simple = diff === DIFF_EASY;
  const marks = ctx.marks;
  const clues = ctx.clues;

  // Pull the cube's eliminations into our own bitmap (it only ever loses bits).
  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      for (let d = 1; d <= o; d++) {
        if (!solver.cubeGet(x, y, d)) marks[y * o + x] &= ~bitOf(d);
      }
    }
  }

  let ret = 0;
  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      // Drop every candidate that no incident clue can pair with.
      let m = marks[y * o + x];
      if (y < o - 1 && x < o - 1)
        m &= mathraxOptions(clues[y * co + x], marks[(y + 1) * o + x + 1], simple);
      if (y > 0 && x < o - 1)
        m &= mathraxOptions(
          clues[(y - 1) * co + x],
          marks[(y - 1) * o + x + 1],
          simple,
        );
      if (y < o - 1 && x > 0)
        m &= mathraxOptions(clues[y * co + x - 1], marks[(y + 1) * o + x - 1], simple);
      if (y > 0 && x > 0)
        m &= mathraxOptions(
          clues[(y - 1) * co + x - 1],
          marks[(y - 1) * o + x - 1],
          simple,
        );

      if (!m) return -1;

      // Normal and below only act on a clue that immediately confirms a digit.
      if (diff <= DIFF_NORMAL && m & (m - 1)) continue;

      for (let d = 1; d <= o; d++) {
        if (solver.cubeGet(x, y, d) && !(m & bitOf(d))) {
          solver.cube[solver.cubepos(x, y, d)] = 0;
          ret++;
        }
      }
    }
  }

  return ret;
}

const solverEasy = (s: LatinSolver, c: MathraxCtx): number =>
  applyOptions(s, c, DIFF_EASY);
const solverNormal = (s: LatinSolver, c: MathraxCtx): number =>
  applyOptions(s, c, DIFF_NORMAL);
const solverTricky = (s: LatinSolver, c: MathraxCtx): number =>
  applyOptions(s, c, DIFF_TRICKY);

/**
 * Solve `grid` (0 = blank, **written back in place** with the first solution
 * found, exactly as upstream) under `clues`, up to difficulty `maxdiff`.
 * Returns one of {@link SOLVE_IMPOSSIBLE} / {@link SOLVE_STUCK} /
 * {@link SOLVE_UNIQUE} / {@link SOLVE_AMBIGUOUS}.
 *
 * The write-back is load-bearing: the generator's two clue-stripping loops keep
 * their own backup of the puzzle and restore it after each trial solve.
 */
export function mathraxSolve(
  o: number,
  grid: Uint8Array,
  clues: Int32Array,
  maxdiff: number,
): number {
  const maxbits = (1 << o) - 1;
  const marks = new Int32Array(o * o);
  for (let i = 0; i < o * o; i++) marks[i] = grid[i] ? bitOf(grid[i]) : maxbits;

  const diff = latinSolver<MathraxCtx>(grid, o, {
    maxdiff,
    diffSimple: DIFF_EASY,
    diffSet0: DIFF_NORMAL,
    diffSet1: DIFF_TRICKY,
    diffForcing: DIFF_TRICKY,
    diffRecursive: DIFF_RECURSIVE,
    usersolvers: [solverEasy, solverNormal, solverTricky, null, null],
    // Upstream `mathrax_valid` is a constant `true` — Latin uniqueness plus the
    // clue eliminations are the whole rule set — so the generic post-check is
    // simply skipped.
    valid: null,
    ctx: { marks, clues },
    // The marks mirror is mutable, so each recursive guess needs its own copy
    // (upstream `clone_ctx`); the clues never change and stay shared.
    ctxNew: (c) => ({ marks: c.marks.slice(), clues: c.clues }),
  });

  if (diff === DIFF_IMPOSSIBLE) return SOLVE_IMPOSSIBLE;
  if (diff === DIFF_UNFINISHED) return SOLVE_STUCK;
  if (diff === DIFF_AMBIGUOUS) return SOLVE_AMBIGUOUS;
  return SOLVE_UNIQUE;
}
