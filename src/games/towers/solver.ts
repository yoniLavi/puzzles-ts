/**
 * Towers (Skyscrapers) solver — the two Towers-specific deductions
 * (`solver_easy`, `solver_hard`) and the validator (`towers_valid`) from
 * `towers.c`, riding on the shared generic `LatinSolver` (`engine/latin.ts`).
 *
 * The clue heuristics work in terms of the cells *along* a clue's line of
 * sight, nearest the clue first (`lineCells`); a taller tower hides every
 * shorter one behind it, so the clue counts the increasing-maxima run seen
 * from that edge. The generic Latin layers (positional/set elimination,
 * forcing chains, recursion) supply everything else.
 */

import {
  type DeductionRecord,
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  type LatinReason,
  type LatinSolver,
  latinSolver,
} from "../../engine/latin.ts";
import {
  DIFF_EASY,
  DIFF_EXTREME,
  DIFF_HARD,
  DIFF_UNREASONABLE,
  lineCells,
} from "./state.ts";

export { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE };

/** Why a Towers-specific deduction forced a candidate change — the premise the
 * hint narrates and highlights. Together with {@link LatinReason} it covers
 * every technique the hint narrates; the `kind`s never collide.
 * `fullLine`/`tallestNearest` come from the hint planner's own extreme-clue
 * check, not from the recording solver. */
export type TowersReason =
  /** A clue equal to the grid width — the whole line must climb `1..w`. */
  | { kind: "fullLine"; clue: number; clueVal: number }
  /** A clue of `1` — the tallest tower must stand next to the clue. */
  | { kind: "tallestNearest"; clue: number; clueVal: number }
  /** A pair of facing clues summing to `w+1` fixes the tallest tower's spot. */
  | { kind: "facing"; clue: number; clue2: number; clueVal: number }
  /** The clue already sees an increasing run one short of its count, so the
   * cell next to the clue must hold the tallest remaining tower. */
  | { kind: "lineFull"; clue: number; clueVal: number }
  /** A height too tall to hide this close to the clue (the lower-bound rule). */
  | { kind: "lowerBound"; clue: number; clueVal: number; height: number }
  /** No valid height arrangement giving exactly `clueVal` visible towers puts
   * this height here (the hard exhaustive-arrangement rule). */
  | { kind: "arrangement"; clue: number; clueVal: number }
  /** A *hidden* single — height `n` can go in only one cell of a row (`line:
   * "row"`, `index` = its y) or column (`line: "col"`, `index` = its x), the cell
   * itself still showing several candidates. Distinct from the generic Latin
   * `single` (a *naked* single). Re-derived from the working board at placement
   * time (the recording solver conflates the two under `single`). */
  | { kind: "hiddenSingle"; n: number; line: "row" | "col"; index: number }
  /** A placement forced by deeper combined deductions the working notes don't yet
   * reflect (neither a naked nor a clean hidden single) — narrated honestly. */
  | { kind: "forcedSingle"; n: number };

/** A reason attached to a recorded Towers deduction. */
export type HintReason = TowersReason | LatinReason;

/** One recorded Towers deduction op (a {@link DeductionRecord} with a narrowed
 * reason). */
export interface HintOp extends DeductionRecord {
  reason: HintReason;
}

/** Shared, mutable solver context (upstream `struct solver_ctx`). `started`
 * gates the one-off facing-clue deduction and, as upstream's, persists across
 * the fixpoint and recursion (no per-recursion copy). */
interface TowersCtx {
  w: number;
  clues: Int32Array;
  started: boolean;
}

// --- solver_easy -----------------------------------------------------------

function solverEasy(solver: LatinSolver, ctx: TowersCtx): number {
  const w = ctx.w;
  const clues = ctx.clues;
  const posOf = new Int32Array(w + 1);
  let ret = 0;

  if (!ctx.started) {
    ctx.started = true;
    /*
     * One-off: a pair of facing clues summing to w+1 means the line is two
     * increasing runs back-to-back, so the tallest tower's position is fixed
     * — place it immediately.
     */
    for (let c = 0; c < 3 * w; c = c === w - 1 ? 2 * w : c + 1) {
      const c2 = c + w;
      if (clues[c] && clues[c2] && clues[c] + clues[c2] === w + 1) {
        const cells = lineCells(c, w);
        const cell = cells[clues[c] - 1];
        if (solver.cubeGet(cell.x, cell.y, w)) {
          solver.place(
            cell.x,
            cell.y,
            w,
            solver.recorder
              ? { kind: "facing", clue: c, clue2: c2, clueVal: clues[c] }
              : undefined,
          );
          ret = 1;
        } else {
          ret = -1;
        }
      }
    }
    if (ret) return ret;
  }

  for (let c = 0; c < 4 * w; c++) {
    const clue = clues[c];
    if (!clue) continue;
    const cells = lineCells(c, w);

    // posOf[v-1] = position (along the line) of height v, or w if absent.
    for (let i = 0; i < w; i++) posOf[i] = w;
    for (let i = 0; i < w; i++) {
      const v = solver.grid[cells[i].y * w + cells[i].x];
      if (v) posOf[v - 1] = i;
    }

    // Find the increasing run of the very highest heights already visible.
    let n = 0;
    let furthest = w;
    for (let i = w; i >= 1; i--) {
      if (posOf[i - 1] === w) {
        break;
      } else if (posOf[i - 1] < furthest) {
        furthest = posOf[i - 1];
        n++;
      }
    }

    if (clue === n + 1 && furthest > 1) {
      /*
       * We can already see an increasing run of the highest heights, one
       * short of the clue, so the cell next to the clue must hold the final
       * (largest-so-far) one — rule out the small heights there.
       */
      let j = furthest - 1; // number of small heights we can rule out
      for (let i = 1; i <= w && j > 0; i++) {
        if (posOf[i - 1] < w && posOf[i - 1] >= furthest) continue; // elsewhere
        j--;
        const cell = cells[0];
        if (solver.cubeGet(cell.x, cell.y, i)) {
          if (solver.recorder) {
            solver.recorder({
              kind: "elim",
              x: cell.x,
              y: cell.y,
              n: i,
              reason: { kind: "lineFull", clue: c, clueVal: clue },
              group: solver.group,
            });
          }
          solver.cube[solver.cubepos(cell.x, cell.y, i)] = 0;
          ret = 1;
        }
      }
    }

    if (ret) return ret;

    /*
     * Lower bounds: the largest height can't sit in the first (clue−1) cells,
     * the second-largest (discounting any already hidden behind a larger one)
     * not in the first (clue−2), and so on.
     */
    let rank = 0;
    for (let height = w; height > 0; height--) {
      if (posOf[height - 1] < w) {
        let mm: number;
        for (mm = height + 1; mm < w; mm++) {
          if (posOf[mm] < posOf[height - 1]) break;
        }
        if (mm < w) continue; // this height is behind a larger one; skip
      }
      for (let j = 0; j < clue - rank - 1; j++) {
        const cell = cells[j];
        if (solver.cubeGet(cell.x, cell.y, height)) {
          if (solver.recorder) {
            solver.recorder({
              kind: "elim",
              x: cell.x,
              y: cell.y,
              n: height,
              reason: { kind: "lowerBound", clue: c, clueVal: clue, height },
              group: solver.group,
            });
          }
          solver.cube[solver.cubepos(cell.x, cell.y, height)] = 0;
          ret = 1;
        }
      }
      rank++;
    }

    // On the hint-recording path, return as soon as a clue's lower-bound
    // eliminations fire, so each recorded firing (one `solver.group`) covers a
    // single clue and a step's struck marks never bleed in from another clue's
    // line. The recorder-off path keeps accumulating across clues, as upstream
    // does (the differential checks it); `lineFull` above returns per clue on
    // every path.
    if (solver.recorder && ret) return ret;
  }

  return ret;
}

// --- solver_hard -----------------------------------------------------------

function solverHard(solver: LatinSolver, ctx: TowersCtx): number {
  const w = ctx.w;
  const clues = ctx.clues;
  const possible = new Int32Array(w);
  const stack = new Int32Array(w + 1);

  for (let c = 0; c < 4 * w; c++) {
    const clue = clues[c];
    if (!clue) continue;
    const cells = lineCells(c, w);

    for (let i = 0; i < w; i++) possible[i] = 0;

    /*
     * Enumerate every height arrangement of the line consistent with the cube
     * and giving exactly `clue` visible towers, OR-ing each into `possible`
     * (per-position set of heights that can occur). `stack` holds the heights
     * placed so far; `best`/`n` track the running maximum and visible count.
     */
    let i = 0;
    stack[0] = 0;
    let best = 0;
    let n = 0;
    let bitmap = 0;

    while (true) {
      if (i < w) {
        const limit = n === clue ? best : w;
        const cell = cells[i];
        let j = stack[i] + 1;
        for (; j <= limit; j++) {
          if (bitmap & (1 << j)) continue;
          if (!solver.cubeGet(cell.x, cell.y, j)) continue;
          break;
        }

        if (j > limit) {
          i--;
          if (i < 0) break;
          bitmap &= ~(1 << stack[i]);
          if (stack[i] === best) {
            n--;
            best = 0;
            for (let k = 0; k < i; k++) if (best < stack[k]) best = stack[k];
          }
        } else {
          bitmap |= 1 << j;
          stack[i++] = j;
          if (j > best) {
            best = j;
            n++;
          }
          stack[i] = 0;
        }
      } else {
        if (n === clue) {
          for (let j = 0; j < w; j++) possible[j] |= 1 << stack[j];
        }
        i--;
        bitmap &= ~(1 << stack[i]);
        if (stack[i] === best) {
          n--;
          best = 0;
          for (let k = 0; k < i; k++) if (best < stack[k]) best = stack[k];
        }
      }
    }

    let ret = 0;
    for (let pos = 0; pos < w; pos++) {
      const cell = cells[pos];
      for (let j = 1; j <= w; j++) {
        if (solver.cubeGet(cell.x, cell.y, j) && !(possible[pos] & (1 << j))) {
          if (solver.recorder) {
            solver.recorder({
              kind: "elim",
              x: cell.x,
              y: cell.y,
              n: j,
              reason: { kind: "arrangement", clue: c, clueVal: clue },
              group: solver.group,
            });
          }
          solver.cube[solver.cubepos(cell.x, cell.y, j)] = 0;
          ret = 1;
        }
      }
      // Revert to easier deductions as soon as one clue yields something.
      if (ret) return ret;
    }
  }

  return 0;
}

// --- validator -------------------------------------------------------------

function towersValid(solver: LatinSolver, ctx: TowersCtx): boolean {
  const w = ctx.w;
  const clues = ctx.clues;
  for (let c = 0; c < 4 * w; c++) {
    const clue = clues[c];
    if (!clue) continue;
    const cells = lineCells(c, w);
    let n = 0;
    let best = 0;
    for (let i = 0; i < w; i++) {
      const v = solver.grid[cells[i].y * w + cells[i].x];
      if (v > best) {
        best = v;
        n++;
      }
    }
    if (n !== clue) return false;
  }
  return true;
}

// --- driver ----------------------------------------------------------------

/**
 * Solve the `w × w` Towers board with edge `clues` into `soln` (0 = blank),
 * up to difficulty `maxdiff`. Returns the difficulty level reached, or a
 * `DIFF_IMPOSSIBLE`/`DIFF_AMBIGUOUS`/`DIFF_UNFINISHED` sentinel. Mirrors
 * `towers.c`'s `solver()`: `DIFF_EASY`→simple, `DIFF_HARD`→set₀,
 * `DIFF_EXTREME`→set₁+forcing, `DIFF_UNREASONABLE`→recursion.
 */
export function solveTowers(
  w: number,
  clues: Int32Array,
  soln: Uint8Array,
  maxdiff: number,
  recorder?: (rec: DeductionRecord) => void,
): number {
  const ctx: TowersCtx = { w, clues, started: false };
  return latinSolver<TowersCtx>(soln, w, {
    maxdiff,
    diffSimple: DIFF_EASY,
    diffSet0: DIFF_HARD,
    diffSet1: DIFF_EXTREME,
    diffForcing: DIFF_EXTREME,
    diffRecursive: DIFF_UNREASONABLE,
    usersolvers: [solverEasy, solverHard, null, null],
    valid: towersValid,
    ctx,
    recorder,
  });
}

/**
 * Run the recording solver on a sound candidate cube seeded from `grid` (the
 * placed givens/entries only — never the player's notes), up to `maxdiff`, and
 * return every candidate elimination and cell placement it makes, in solver
 * order, each tagged with the rule + premise that forced it — the raw
 * deduction script a hint narrates. `grid` is read-only (a copy is solved).
 */
export function recordTowersDeductions(
  w: number,
  clues: Int32Array,
  grid: Uint8Array,
  maxdiff: number,
): HintOp[] {
  const ops: HintOp[] = [];
  solveTowers(w, clues, grid.slice(), maxdiff, (rec) => ops.push(rec as HintOp));
  return ops;
}
