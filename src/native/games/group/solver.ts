/**
 * Group solver — the two Group-specific user-solvers (Normal associativity +
 * identity fill; Hard identity elimination) and the group validator, riding on
 * the shared generic `LatinSolver` (`engine/latin.ts`).
 *
 * Group's `solver()` is `latin_solver_main` with Group supplying only its own
 * deductions; the generic Latin layers (positional/set elimination, forcing
 * chains, guess-and-verify recursion) supply everything else (design D1). The
 * difficulty mapping onto the config:
 *
 *   Trivial       → generic simple (positional/numeric single).
 *   Normal        → {@link solverNormal} (associativity forward-deduction).
 *   Hard          → {@link solverHard} (identity-hidden candidate elimination).
 *   Extreme       → generic set-elimination + forcing.
 *   Unreasonable  → generic recursion.
 *
 * The cube is indexed `(x·o + y)·o + (n−1)` (`cubepos`) and the grid `y·o + x`
 * (`gridpos`), exactly as latin.ts — so the deductions transcribe verbatim.
 * Note that `solver_normal` reads the grid with *raw* `grid[i*w+j]` indexing
 * while `solver_hard` / `group_valid` use the C `grid(x,y)` macro (`grid[y*w+x]`,
 * transposed); each is ported with the matching index expression.
 */

import { type LatinSolver, latinSolver } from "../../engine/latin.ts";
import { DIFF_EXTREME, DIFF_HARD, DIFF_TRIVIAL, DIFF_UNREASONABLE } from "./state.ts";

/** Group's deductions need no external context (unlike Unequal's links). */
type GroupCtx = null;

/**
 * Find the group identity, if it can be read off a filled cell. Any filled
 * `ab` that equals `a` proves `b` is the identity (and symmetrically). Returns
 * the identity element `1..w`, or 0 if not yet determined (`find_identity`).
 * Raw `grid[i*w+j]` indexing, as upstream.
 */
function findIdentity(solver: LatinSolver): number {
  const w = solver.o;
  const grid = solver.grid;
  for (let i = 0; i < w; i++)
    for (let j = 0; j < w; j++) {
      if (grid[i * w + j] === i + 1) return j + 1;
      if (grid[i * w + j] === j + 1) return i + 1;
    }
  return 0;
}

/**
 * Normal deduction (`solver_normal`): associativity forward-deduction plus
 * filling the identity's row and column once the identity is known.
 *
 * Associativity: for any `a,b,c`, if we know `ab`, `bc` and `(ab)c`, we can
 * place `a(bc)` (and the symmetric case). Returns `1` on the first placement,
 * `-1` on a contradiction *from the identity fill only*, `0` if nothing fired.
 */
function solverNormal(solver: LatinSolver): number {
  const w = solver.o;
  const g = solver.grid;

  for (let i = 0; i < w; i++)
    for (let j = 0; j < w; j++)
      for (let k = 0; k < w; k++) {
        if (!g[i * w + j] || !g[j * w + k]) continue;

        // Know (ab)c, want a(bc): place a(bc) = (ab)c at (x=bc-1, y=a).
        if (g[(g[i * w + j] - 1) * w + k] && !g[i * w + (g[j * w + k] - 1)]) {
          const x = g[j * w + k] - 1;
          const y = i;
          const n = g[(g[i * w + j] - 1) * w + k];
          if (solver.cubeGet(x, y, n)) {
            solver.place(x, y, n);
            return 1;
          }
          // The shipped build detects no contradiction here — the `return -1`
          // lives inside `#ifdef STANDALONE_SOLVER`, so this else is empty and
          // the search silently continues (design/byte-parity: faithful to the
          // game build the differential matches, not the standalone solver).
        }

        // Know a(bc), want (ab)c: place (ab)c = a(bc) at (x=c, y=ab-1).
        if (!g[(g[i * w + j] - 1) * w + k] && g[i * w + (g[j * w + k] - 1)]) {
          const x = k;
          const y = g[i * w + j] - 1;
          const n = g[i * w + (g[j * w + k] - 1)];
          if (solver.cubeGet(x, y, n)) {
            solver.place(x, y, n);
            return 1;
          }
        }
      }

  // Fill in the identity's row and column, if we've just learned which it is.
  const idn = findIdentity(solver);
  if (idn) {
    const i = idn;
    let doneSomething = false;
    for (let j = 1; j <= w; j++)
      if (!g[(i - 1) * w + (j - 1)] || !g[(j - 1) * w + (i - 1)]) doneSomething = true;

    if (doneSomething) {
      for (let j = 1; j <= w; j++) {
        if (!g[(j - 1) * w + (i - 1)]) {
          if (!solver.cubeGet(i - 1, j - 1, j)) return -1;
          solver.place(i - 1, j - 1, j);
        }
        if (!g[(i - 1) * w + (j - 1)]) {
          if (!solver.cubeGet(j - 1, i - 1, j)) return -1;
          solver.place(j - 1, i - 1, j);
        }
      }
      return 1;
    }
  }

  return 0;
}

/**
 * Hard deduction (`solver_hard`): systematically rule out identities in
 * identity-hidden mode. A filled `ab` that is neither `a` nor `b` proves that
 * *neither* `a` nor `b` is the identity — so neither can act as the identity on
 * any element, and we strike `ij = j` / `ji = j` candidates directly on the
 * cube. Uses the transposed `grid(x,y)` macro (`grid[y*w+x]`). Returns 1 if it
 * eliminated any candidate, else 0.
 */
function solverHard(solver: LatinSolver): number {
  const w = solver.o;
  const gm = (x: number, y: number): number => solver.grid[y * w + x]; // grid(x,y)
  let doneSomething = false;

  for (let i = 0; i < w; i++) {
    let iCanBeId = true;
    for (let j = 0; j < w; j++) {
      if (gm(i, j) && gm(i, j) !== j + 1) {
        iCanBeId = false;
        break;
      }
      if (gm(j, i) && gm(j, i) !== j + 1) {
        iCanBeId = false;
        break;
      }
    }

    if (!iCanBeId) {
      for (let j = 0; j < w; j++) {
        if (solver.cubeGet(i, j, j + 1)) {
          solver.cube[solver.cubepos(i, j, j + 1)] = 0;
          doneSomething = true;
        }
        if (solver.cubeGet(j, i, j + 1)) {
          solver.cube[solver.cubepos(j, i, j + 1)] = 0;
          doneSomething = true;
        }
      }
    }
  }

  return doneSomething ? 1 : 0;
}

/**
 * A completed grid is a valid group table iff it is associative
 * (`(ab)c == a(bc)` for all `a,b,c`) — the generic Latin layers already ensure
 * Latin-square-hood, and identity + inverses follow (`group_valid`). Uses the
 * transposed `grid(x,y)` macro; only ever called on a full grid, so no blank
 * cell can index out of range.
 */
function groupValid(solver: LatinSolver): boolean {
  const w = solver.o;
  const gm = (x: number, y: number): number => solver.grid[y * w + x]; // grid(x,y)

  for (let i = 0; i < w; i++)
    for (let j = 0; j < w; j++)
      for (let k = 0; k < w; k++) {
        const ij = gm(i, j) - 1;
        const jk = gm(j, k) - 1;
        const ijK = gm(ij, k) - 1;
        const iJk = gm(i, jk) - 1;
        if (ijK !== iJk) return false;
      }

  return true;
}

/**
 * Solve a Group Cayley table in place up to difficulty `maxdiff`. `grid` is the
 * working grid (0 = blank) seeded with the givens; it is written back with the
 * first solution found. Returns the difficulty reached, or a
 * `DIFF_IMPOSSIBLE`/`DIFF_AMBIGUOUS`/`DIFF_UNFINISHED` sentinel — matching
 * `group.c`'s `solver()` and the shared latin.ts contract.
 */
export function solveGroup(grid: Uint8Array, w: number, maxdiff: number): number {
  return latinSolver<GroupCtx>(grid, w, {
    maxdiff,
    diffSimple: DIFF_TRIVIAL,
    diffSet0: DIFF_HARD,
    diffSet1: DIFF_EXTREME,
    diffForcing: DIFF_EXTREME,
    diffRecursive: DIFF_UNREASONABLE,
    usersolvers: [null, solverNormal, solverHard, null, null],
    valid: groupValid,
    ctx: null,
  });
}
