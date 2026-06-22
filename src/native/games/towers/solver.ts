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
  DIFF_AMBIGUOUS,
  type DeductionRecord,
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
 * hint narrates and highlights. Each carries the driving clue index and value.
 * Combined with {@link LatinReason} (positional/set/forcing) it covers every
 * technique the recording solver can fire. The `kind` fields never collide.
 *
 * `fullLine`/`tallestNearest` are *extreme-clue* placements the hint planner
 * surfaces directly (not via the recording solver): a clue equal to the grid
 * width sees every tower, forcing the whole line to climb `1..w`; a clue of `1`
 * sees only the tallest, forcing it next to the clue. */
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
  | { kind: "arrangement"; clue: number; clueVal: number };

/** A reason attached to a recorded Towers deduction. */
export type HintReason = TowersReason | LatinReason;

/** One recorded Towers deduction op (a {@link DeductionRecord} with a narrowed
 * reason). */
export interface HintOp extends DeductionRecord {
  reason: HintReason;
}

/** Shared, mutable solver context (upstream `struct solver_ctx`). `started`
 * gates the one-off facing-clue deduction and persists across the fixpoint and
 * recursion, exactly as the C ctx (shared, no per-recursion copy). */
export interface TowersCtx {
  w: number;
  clues: Int32Array;
  started: boolean;
}

// --- solver_easy -----------------------------------------------------------

export function solverEasy(solver: LatinSolver, ctx: TowersCtx): number {
  const w = ctx.w;
  const clues = ctx.clues;
  const dscratch = new Int32Array(w + 1);
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

    // dscratch[v-1] = position (along the line) of height v, or w if absent.
    for (let i = 0; i < w; i++) dscratch[i] = w;
    for (let i = 0; i < w; i++) {
      const v = solver.grid[cells[i].y * w + cells[i].x];
      if (v) dscratch[v - 1] = i;
    }

    // Find the increasing run of the very highest heights already visible.
    let n = 0;
    let furthest = w;
    for (let i = w; i >= 1; i--) {
      if (dscratch[i - 1] === w) {
        break;
      } else if (dscratch[i - 1] < furthest) {
        furthest = dscratch[i - 1];
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
        if (dscratch[i - 1] < w && dscratch[i - 1] >= furthest) continue; // elsewhere
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
    let i2 = 0;
    for (let nn = w; nn > 0; nn--) {
      if (dscratch[nn - 1] < w) {
        let mm: number;
        for (mm = nn + 1; mm < w; mm++) {
          if (dscratch[mm] < dscratch[nn - 1]) break;
        }
        if (mm < w) continue; // this height is behind a larger one; skip
      }
      for (let j = 0; j < clue - i2 - 1; j++) {
        const cell = cells[j];
        if (solver.cubeGet(cell.x, cell.y, nn)) {
          if (solver.recorder) {
            solver.recorder({
              kind: "elim",
              x: cell.x,
              y: cell.y,
              n: nn,
              reason: { kind: "lowerBound", clue: c, clueVal: clue, height: nn },
              group: solver.group,
            });
          }
          solver.cube[solver.cubepos(cell.x, cell.y, nn)] = 0;
          ret = 1;
        }
      }
      i2++;
    }

    // On the hint-recording path, return as soon as a clue's lower-bound
    // eliminations fire so each recorded firing (one `solver.group`) covers a
    // single clue — otherwise a pass would lump several clues' eliminations
    // under one group, and a hint step would narrate one clue (`group[0]`) while
    // its struck marks bled in from another clue's line (the "5 from the next
    // column got pulled in" bug). The generate/solve path (no recorder) keeps
    // accumulating across clues, byte-identical to the C reference; `lineFull`
    // above already returns per clue on every path.
    if (solver.recorder && ret) return ret;
  }

  if (ret) return ret;
  return 0;
}

// --- solver_hard -----------------------------------------------------------

export function solverHard(solver: LatinSolver, ctx: TowersCtx): number {
  const w = ctx.w;
  const clues = ctx.clues;
  const iscratch = new Int32Array(w);
  const dscratch = new Int32Array(w + 1);

  for (let c = 0; c < 4 * w; c++) {
    const clue = clues[c];
    if (!clue) continue;
    const cells = lineCells(c, w);

    for (let i = 0; i < w; i++) iscratch[i] = 0;

    /*
     * Enumerate every height arrangement of the line consistent with the cube
     * and giving exactly `clue` visible towers, OR-ing each into `iscratch`
     * (per-position set of heights that can occur). `dscratch` is the working
     * stack of heights; `best`/`n` track the running maximum and visible count.
     */
    let i = 0;
    dscratch[0] = 0;
    let best = 0;
    let n = 0;
    let bitmap = 0;

    while (true) {
      if (i < w) {
        const limit = n === clue ? best : w;
        const cell = cells[i];
        let j = dscratch[i] + 1;
        for (; j <= limit; j++) {
          if (bitmap & (1 << j)) continue;
          if (!solver.cubeGet(cell.x, cell.y, j)) continue;
          break;
        }

        if (j > limit) {
          i--;
          if (i < 0) break;
          bitmap &= ~(1 << dscratch[i]);
          if (dscratch[i] === best) {
            n--;
            best = 0;
            for (let k = 0; k < i; k++) if (best < dscratch[k]) best = dscratch[k];
          }
        } else {
          bitmap |= 1 << j;
          dscratch[i++] = j;
          if (j > best) {
            best = j;
            n++;
          }
          dscratch[i] = 0;
        }
      } else {
        if (n === clue) {
          for (let j = 0; j < w; j++) iscratch[j] |= 1 << dscratch[j];
        }
        i--;
        bitmap &= ~(1 << dscratch[i]);
        if (dscratch[i] === best) {
          n--;
          best = 0;
          for (let k = 0; k < i; k++) if (best < dscratch[k]) best = dscratch[k];
        }
      }
    }

    let ret = 0;
    for (let i3 = 0; i3 < w; i3++) {
      const cell = cells[i3];
      for (let j = 1; j <= w; j++) {
        if (solver.cubeGet(cell.x, cell.y, j) && !(iscratch[i3] & (1 << j))) {
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

export function towersValid(solver: LatinSolver, ctx: TowersCtx): boolean {
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
 * `towers.c`'s `solver()`: Easy→simple, Hard→set₀, Extreme→set₁+forcing,
 * Unreasonable→recursion.
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
 * order, each tagged with the rule + premise that forced it. This is the raw
 * deduction script a hint narrates; the recorder-off path (`solveTowers`
 * without a callback) is byte-for-byte unchanged. `grid` is treated read-only
 * (a working copy is solved internally).
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
