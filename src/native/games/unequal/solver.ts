/**
 * Unequal solver — the Unequal-specific deductions (inequality "links" and
 * adjacency elimination) and the validator from `unequal.c`, riding on the
 * shared generic `LatinSolver` (`engine/latin.ts`).
 *
 * Two modes share one solver: **Unequal** uses `solverLinks` (greater-than bound
 * elimination); **Adjacent** uses `solverAdjacent` / `solverAdjacentSet`
 * (differ-by-1 elimination). The generic Latin layers (positional/set
 * elimination, forcing chains, recursion) supply everything else.
 */

import {
  DIFF_AMBIGUOUS,
  type DeductionRecord,
  DIFF_IMPOSSIBLE,
  type LatinReason,
  type LatinSolver,
  latinSolver,
} from "../../engine/latin.ts";
import {
  ADJTHAN,
  DIFF_EXTREME,
  DIFF_LATIN,
  DIFF_RECURSIVE,
  DIFF_SET,
  type Mode,
} from "./state.ts";

export { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE };

/** Why an Unequal-specific deduction ruled a candidate out — the premise the
 * hint narrates and highlights. Combined with {@link LatinReason} (the generic
 * positional/set/forcing deductions) it covers every technique the recording
 * solver fires. The `kind` fields never collide with the Latin reasons.
 *
 * `greater`/`lesser` fire only in Unequal mode (an inequality "link"), and carry
 * the cell across the `>` sign (`ox`,`oy`) plus that cell's binding value
 * (`bound`, 1-based): for `greater` the smaller cell can be no *less* than
 * `bound`, so this cell must exceed it; for `lesser` the larger cell can be no
 * *more* than `bound`, so this cell must fall short of it. `adjacent`/
 * `adjacentSet` fire only in Adjacent mode and carry the constraining neighbour
 * (`ox`,`oy`) and whether a bar joins them (`bar`). */
export type UnequalReason =
  | { kind: "greater"; ox: number; oy: number; bound: number }
  | { kind: "lesser"; ox: number; oy: number; bound: number }
  | { kind: "adjacent"; ox: number; oy: number; v: number; bar: boolean }
  | { kind: "adjacentSet"; ox: number; oy: number; bar: boolean };

/** A reason attached to a recorded Unequal deduction. */
export type HintReason = UnequalReason | LatinReason;

/** One recorded Unequal deduction op (a {@link DeductionRecord} with a narrowed
 * reason). */
export interface HintOp extends DeductionRecord {
  reason: HintReason;
}

/** An inequality clue: the cell at `(gx, gy)` must hold a number greater (by at
 * least `len`) than the cell at `(lx, ly)`. */
interface SolverLink {
  gx: number;
  gy: number;
  lx: number;
  ly: number;
  len: number;
}

/** Shared, immutable solver context (upstream `struct solver_ctx`). The links
 * are derived once from the (fixed) adjacency flags; nothing mutates during
 * solving, so the one ctx is shared across the fixpoint and recursion (the C
 * `clone_ctx` rebuilds an identical list). */
export interface UnequalCtx {
  o: number;
  mode: Mode;
  flags: Int32Array;
  links: SolverLink[];
}

export function newCtx(o: number, mode: Mode, flags: Int32Array): UnequalCtx {
  const links: SolverLink[] = [];
  if (mode === "unequal") {
    for (let x = 0; x < o; x++) {
      for (let y = 0; y < o; y++) {
        const f = flags[y * o + x];
        for (let i = 0; i < 4; i++) {
          if (f & ADJTHAN[i].f)
            links.push({ gx: x, gy: y, lx: x + ADJTHAN[i].dx, ly: y + ADJTHAN[i].dy, len: 1 });
        }
      }
    }
  }
  return { o, mode, flags, links };
}

// --- min/max of a cell's remaining possibilities (solver_nminmax) ----------

/** The smallest and largest still-possible value indices (0-based) at `(x, y)`.
 * A filled cell pins both to `grid-1`. */
function nminmax(solver: LatinSolver, x: number, y: number): { min: number; max: number } {
  const o = solver.o;
  const v = solver.grid[y * o + x];
  if (v > 0) return { min: v - 1, max: v - 1 };
  let min = o;
  let max = 0;
  for (let n = 0; n < o; n++) {
    if (solver.cubeGet(x, y, n + 1)) {
      if (n > max) max = n;
      if (n < min) min = n;
    }
  }
  return { min, max };
}

// --- solver_links (Unequal-mode easy) --------------------------------------

function solverLinks(solver: LatinSolver, ctx: UnequalCtx): number {
  let total = 0;
  for (const link of ctx.links) {
    const { max: gmax } = nminmax(solver, link.gx, link.gy);
    const { min: lmin } = nminmax(solver, link.lx, link.ly);
    let nchanged = 0;

    for (let j = 0; j < solver.o; j++) {
      // Greater end: rule out values too small to satisfy the inequality. The
      // lesser cell can be no smaller than `lmin + 1` (1-based), so this cell
      // must exceed it.
      if (solver.cubeGet(link.gx, link.gy, j + 1) && j < lmin + link.len) {
        if (solver.recorder) {
          solver.recorder({
            kind: "elim",
            x: link.gx,
            y: link.gy,
            n: j + 1,
            reason: { kind: "greater", ox: link.lx, oy: link.ly, bound: lmin + 1 },
            group: solver.group,
          });
        }
        solver.cube[solver.cubepos(link.gx, link.gy, j + 1)] = 0;
        nchanged++;
      }
      // Lesser end: rule out values too large to satisfy the inequality. The
      // greater cell can be no larger than `gmax + 1` (1-based), so this cell
      // must fall short of it.
      if (solver.cubeGet(link.lx, link.ly, j + 1) && j > gmax - link.len) {
        if (solver.recorder) {
          solver.recorder({
            kind: "elim",
            x: link.lx,
            y: link.ly,
            n: j + 1,
            reason: { kind: "lesser", ox: link.gx, oy: link.gy, bound: gmax + 1 },
            group: solver.group,
          });
        }
        solver.cube[solver.cubepos(link.lx, link.ly, j + 1)] = 0;
        nchanged++;
      }
    }

    // On the hint-recording path, return as soon as one link fires so each
    // recorded firing (one `solver.group`) covers a single `>` sign — otherwise
    // a pass would lump several links' eliminations under one group and a hint
    // step would narrate one clue while struck marks bled in from another (the
    // Towers "bleed across clues" bug). The generate/solve path (no recorder)
    // keeps accumulating across links, byte-identical to the C reference.
    if (solver.recorder && nchanged) return nchanged;
    total += nchanged;
  }
  return total;
}

// --- solver_adjacent (Adjacent-mode easy) ----------------------------------

function solverAdjacent(solver: LatinSolver, ctx: UnequalCtx): number {
  const o = solver.o;
  let total = 0;
  for (let x = 0; x < o; x++) {
    for (let y = 0; y < o; y++) {
      const v = solver.grid[y * o + x];
      if (v === 0) continue;
      const f = ctx.flags[y * o + x];
      for (let i = 0; i < 4; i++) {
        const isadjacent = (f & ADJTHAN[i].f) !== 0;
        const nx = x + ADJTHAN[i].dx;
        const ny = y + ADJTHAN[i].dy;
        if (nx < 0 || ny < 0 || nx >= o || ny >= o) continue;
        let nchanged = 0;
        for (let n = 0; n < o; n++) {
          const gd = Math.abs(n + 1 - v);
          if (isadjacent && gd === 1) continue;
          if (!isadjacent && gd !== 1) continue;
          if (!solver.cubeGet(nx, ny, n + 1)) continue;
          if (solver.recorder) {
            solver.recorder({
              kind: "elim",
              x: nx,
              y: ny,
              n: n + 1,
              reason: { kind: "adjacent", ox: x, oy: y, v, bar: isadjacent },
              group: solver.group,
            });
          }
          solver.cube[solver.cubepos(nx, ny, n + 1)] = 0;
          nchanged++;
        }
        // One filled cell + direction = one adjacency-clue firing (see the
        // `solverLinks` note); return per firing on the recording path.
        if (solver.recorder && nchanged) return nchanged;
        total += nchanged;
      }
    }
  }
  return total;
}

// --- solver_adjacent_set (Adjacent-mode tricky) ----------------------------

function solverAdjacentSet(solver: LatinSolver, ctx: UnequalCtx): number {
  const o = solver.o;
  let nchanged = 0;
  const scratch = new Int8Array(o);
  for (let x = 0; x < o; x++) {
    for (let y = 0; y < o; y++) {
      const f = ctx.flags[y * o + x];
      for (let i = 0; i < 4; i++) {
        const isadjacent = (f & ADJTHAN[i].f) !== 0;
        const nx = x + ADJTHAN[i].dx;
        const ny = y + ADJTHAN[i].dy;
        if (nx < 0 || ny < 0 || nx >= o || ny >= o) continue;

        // Build the maximum set of values (nx,ny) could take given (x,y)'s
        // possibilities and the adjacency clue.
        scratch.fill(0);
        for (let n = 0; n < o; n++) {
          if (!solver.cubeGet(x, y, n + 1)) continue;
          for (let nn = 0; nn < o; nn++) {
            if (n === nn) continue;
            const gd = Math.abs(nn - n);
            if (isadjacent && gd !== 1) continue;
            if (!isadjacent && gd === 1) continue;
            scratch[nn] = 1;
          }
        }

        // Remove (nx,ny) possibilities not indicated in scratch.
        let fired = 0;
        for (let n = 0; n < o; n++) {
          if (scratch[n] === 1) continue;
          if (!solver.cubeGet(nx, ny, n + 1)) continue;
          if (solver.recorder) {
            solver.recorder({
              kind: "elim",
              x: nx,
              y: ny,
              n: n + 1,
              reason: { kind: "adjacentSet", ox: x, oy: y, bar: isadjacent },
              group: solver.group,
            });
          }
          solver.cube[solver.cubepos(nx, ny, n + 1)] = 0;
          nchanged++;
          fired++;
        }
        // One cell + direction = one firing; return per firing when recording.
        if (solver.recorder && fired) return nchanged;
      }
    }
  }
  return nchanged;
}

// --- mode-dispatching usersolvers ------------------------------------------

function solverEasy(solver: LatinSolver, ctx: UnequalCtx): number {
  return ctx.mode === "adjacent" ? solverAdjacent(solver, ctx) : solverLinks(solver, ctx);
}

function solverSet(solver: LatinSolver, ctx: UnequalCtx): number {
  return ctx.mode === "adjacent" ? solverAdjacentSet(solver, ctx) : 0;
}

// --- validator -------------------------------------------------------------

function unequalValid(solver: LatinSolver, ctx: UnequalCtx): boolean {
  const o = solver.o;
  if (ctx.mode === "adjacent") {
    for (let x = 0; x + 1 < o; x++) {
      for (let y = 0; y + 1 < o; y++) {
        const v = solver.grid[y * o + x];
        for (let i = 0; i < 4; i++) {
          const shouldBeAdj = (ctx.flags[y * o + x] & ADJTHAN[i].f) !== 0;
          const nx = x + ADJTHAN[i].dx;
          const ny = y + ADJTHAN[i].dy;
          if (nx < 0 || ny < 0 || nx >= o || ny >= o) continue;
          const nv = solver.grid[ny * o + nx];
          const isAdj = Math.abs(v - nv) === 1;
          if (isAdj && !shouldBeAdj) return false;
          if (!isAdj && shouldBeAdj) return false;
        }
      }
    }
  } else {
    for (const link of ctx.links) {
      const gv = solver.grid[link.gy * o + link.gx];
      const lv = solver.grid[link.ly * o + link.lx];
      if (gv <= lv) return false;
    }
  }
  return true;
}

// --- driver ----------------------------------------------------------------

/**
 * Solve the `o × o` Unequal board (with adjacency `flags`) into `soln`
 * (0 = blank), up to difficulty `maxdiff`. Returns the difficulty level reached,
 * or a `DIFF_IMPOSSIBLE`/`DIFF_AMBIGUOUS`/`DIFF_UNFINISHED` sentinel. Mirrors
 * `unequal.c`'s `solver_state` → `latin_solver_main`: Trivial→simple,
 * Tricky→set₀, Extreme→set₁+forcing, Recursive→recursion. When `cubeOut` is
 * given it receives the final candidate cube (the generator grades clues by it).
 */
export function solveUnequal(
  o: number,
  mode: Mode,
  flags: Int32Array,
  soln: Uint8Array,
  maxdiff: number,
  cubeOut?: Uint8Array,
  recorder?: (rec: DeductionRecord) => void,
): number {
  const ctx = newCtx(o, mode, flags);
  return latinSolver<UnequalCtx>(soln, o, {
    maxdiff,
    diffSimple: DIFF_LATIN,
    diffSet0: DIFF_SET,
    diffSet1: DIFF_EXTREME,
    diffForcing: DIFF_EXTREME,
    diffRecursive: DIFF_RECURSIVE,
    usersolvers: [null, solverEasy, solverSet, null, null],
    valid: unequalValid,
    ctx,
    cubeOut,
    recorder,
  });
}

/**
 * Run the recording solver on a sound candidate cube seeded from `grid` (the
 * placed givens/entries only — never the player's notes), up to `maxdiff`, and
 * return every candidate elimination and cell placement it makes, in solver
 * order, each tagged with the rule + premise that forced it. This is the raw
 * deduction script a hint narrates; the recorder-off path (`solveUnequal`
 * without a callback) is byte-for-byte unchanged. `grid` is treated read-only
 * (a working copy is solved internally).
 */
export function recordUnequalDeductions(
  o: number,
  mode: Mode,
  flags: Int32Array,
  grid: Uint8Array,
  maxdiff: number,
): HintOp[] {
  const ops: HintOp[] = [];
  solveUnequal(o, mode, flags, grid.slice(), maxdiff, undefined, (rec) =>
    ops.push(rec as HintOp),
  );
  return ops;
}
