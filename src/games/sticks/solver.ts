/**
 * Sticks contradiction solver — port of `sticks_make_dsf` /
 * `sticks_max_size_horizontal` / `sticks_max_size_vertical` /
 * `sticks_validate` / `sticks_try` / `sticks_solve_game` in
 * `puzzles/unreleased/sticks.c`.
 *
 * The one technique: for each blank cell, tentatively place a horizontal
 * line; if the board becomes provably invalid, the cell must be vertical
 * (and vice versa). `sticksValidate` is both the constraint checker and
 * the deduction oracle — it merges adjacent same-orientation line cells
 * into segments with a dsf, then checks each clued segment's length (too
 * long, or provably unable to reach its clue) and each clued black cell's
 * connected-line / free-neighbour counts. Generation gates on this solver
 * (a single implicit guess-free difficulty tier), so its exact deductive
 * power is byte-match surface: the two `x > 1` / `y > 1` reachability
 * quirks below are ported verbatim.
 *
 * The solver works on bare `(grid, numbers, w, h)` arrays (the caller owns
 * cloning); play-facing wrappers over immutable {@link SticksState} sit at
 * the bottom.
 */
import { Dsf } from "../../engine/dsf.ts";
import {
  F_BLOCK,
  F_HOR,
  F_VER,
  type SticksMistake,
  type SticksState,
} from "./state.ts";

export type SticksStatus = "complete" | "unfinished" | "invalid";

/** Reusable scratch for the hot validate path (upstream passes dsf+lengths). */
export interface SticksScratch {
  dsf: Dsf;
  /** Per segment root: -1 no clue, -2 two or more clues, else the clue cell. */
  lengths: Int32Array;
}

export function newScratch(s: number): SticksScratch {
  return { dsf: new Dsf(s), lengths: new Int32Array(s) };
}

/**
 * Merge adjacent same-orientation line cells into segments; when `lengths`
 * is given, record each segment's clue cell (`-1` none, `-2` duplicate).
 */
export function sticksMakeDsf(
  grid: Uint8Array,
  numbers: Int16Array | null,
  w: number,
  h: number,
  dsf: Dsf,
  lengths: Int32Array | null,
): void {
  const s = w * h;
  if (lengths) lengths.fill(-1);
  dsf.reinit();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1 && grid[i] & F_HOR && grid[i + 1] & F_HOR) dsf.merge(i, i + 1);
      if (y < h - 1 && grid[i] & F_VER && grid[i + w] & F_VER) dsf.merge(i, i + w);
    }
  }
  if (lengths && numbers) {
    for (let i = 0; i < s; i++) {
      if (numbers[i] !== -1) {
        const c = dsf.canonify(i);
        lengths[c] = lengths[c] !== -1 ? -2 : i;
      }
    }
  }
}

/**
 * The most cells the horizontal segment through clue cell `idx` could ever
 * span: walk left then right past blanks/horizontals until a wall, a
 * vertical, or territory owned by a different clue. The `x > 1` bound on
 * the adjacent-segment look-behind is upstream's (not `x > 0`) — ported
 * verbatim, since the solver's exact power decides which boards generate.
 */
function maxSizeHorizontal(
  grid: Uint8Array,
  w: number,
  dsf: Dsf,
  lengths: Int32Array,
  idx: number,
): number {
  const y = Math.floor(idx / w);
  let ret = 1;
  for (let action = -1; action < 2; action += 2) {
    let x = (idx % w) + action;
    while (x >= 0 && x < w) {
      if (grid[y * w + x] & (F_BLOCK | F_VER)) break;
      const c = dsf.canonify(y * w + x);
      if (lengths[c] !== -1 && lengths[c] !== idx) break;
      if (action === -1 && x > 1 && grid[y * w + x - 1] & F_HOR) {
        const other = lengths[dsf.canonify(y * w + x - 1)];
        if (other !== -1 && other !== idx) break;
      }
      if (action === 1 && x < w - 1 && grid[y * w + x + 1] & F_HOR) {
        const other = lengths[dsf.canonify(y * w + x + 1)];
        if (other !== -1 && other !== idx) break;
      }
      ret++;
      x += action;
    }
  }
  return ret;
}

/** Vertical twin of {@link maxSizeHorizontal} (upstream `y > 1` quirk kept). */
function maxSizeVertical(
  grid: Uint8Array,
  w: number,
  h: number,
  dsf: Dsf,
  lengths: Int32Array,
  idx: number,
): number {
  const x = idx % w;
  let ret = 1;
  for (let action = -1; action < 2; action += 2) {
    let y = Math.floor(idx / w) + action;
    while (y >= 0 && y < h) {
      if (grid[y * w + x] & (F_BLOCK | F_HOR)) break;
      const c = dsf.canonify(y * w + x);
      if (lengths[c] !== -1 && lengths[c] !== idx) break;
      if (action === -1 && y > 1 && grid[(y - 1) * w + x] & F_VER) {
        const other = lengths[dsf.canonify((y - 1) * w + x)];
        if (other !== -1 && other !== idx) break;
      }
      if (action === 1 && y < h - 1 && grid[(y + 1) * w + x] & F_VER) {
        const other = lengths[dsf.canonify((y + 1) * w + x)];
        if (other !== -1 && other !== idx) break;
      }
      ret++;
      y += action;
    }
  }
  return ret;
}

/**
 * The constraint checker (upstream `sticks_validate`): complete when every
 * cell is filled and no clue is violated; invalid when some clue provably
 * cannot be met. When `errors` is given, the violating clue cells' indices
 * are collected (upstream's `F_ERROR` marking, kept out of the grid here —
 * the renderer reds those clue numbers).
 */
export function sticksValidate(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
  scratch?: SticksScratch,
  errors?: number[],
): SticksStatus {
  const { dsf, lengths } = scratch ?? newScratch(w * h);
  let ret: SticksStatus = "complete";

  sticksMakeDsf(grid, numbers, w, h, dsf, lengths);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      if (!grid[i]) {
        if (ret === "complete") ret = "unfinished";
        continue;
      }
      if (numbers[i] === -1) continue;

      let error = false;
      if (grid[i] & F_BLOCK) {
        // A black clue: `conn` lines connected, `other` neighbours that can
        // never connect (walls and edges count as unconnectable).
        let conn = 0;
        let other = 0;
        if (x === 0 || grid[i - 1] & (F_VER | F_BLOCK)) other++;
        if (x === w - 1 || grid[i + 1] & (F_VER | F_BLOCK)) other++;
        if (y === 0 || grid[i - w] & (F_HOR | F_BLOCK)) other++;
        if (y === h - 1 || grid[i + w] & (F_HOR | F_BLOCK)) other++;
        if (x !== 0 && grid[i - 1] & F_HOR) conn++;
        if (x !== w - 1 && grid[i + 1] & F_HOR) conn++;
        if (y !== 0 && grid[i - w] & F_VER) conn++;
        if (y !== h - 1 && grid[i + w] & F_VER) conn++;
        if (conn > numbers[i] || other > 4 - numbers[i]) error = true;
      } else {
        const c = dsf.canonify(i);
        if (lengths[c] < 0) {
          // -2: two clues on one segment ("a line can't overlap more than
          // one number"). A clued cell's own segment always has a clue, so
          // -1 is unreachable here.
          error = true;
        } else {
          const size = dsf.size(c);
          const target = numbers[lengths[c]];
          if (size > target) error = true;
          else if (size < target && grid[i] & F_HOR) {
            if (maxSizeHorizontal(grid, w, dsf, lengths, i) < target) error = true;
          } else if (size < target && grid[i] & F_VER) {
            if (maxSizeVertical(grid, w, h, dsf, lengths, i) < target) error = true;
          }
        }
      }

      if (error) {
        errors?.push(i);
        ret = "invalid";
      }
    }
  }
  return ret;
}

/**
 * One deduction (upstream `sticks_try`): find the first blank cell where one
 * orientation is provably invalid, commit the other, and report progress.
 */
export function sticksTry(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
  scratch: SticksScratch,
): boolean {
  const s = w * h;
  for (let i = 0; i < s; i++) {
    if (grid[i]) continue;

    grid[i] = F_HOR;
    if (sticksValidate(grid, numbers, w, h, scratch) === "invalid") {
      grid[i] = F_VER;
      return true;
    }
    grid[i] = F_VER;
    if (sticksValidate(grid, numbers, w, h, scratch) === "invalid") {
      grid[i] = F_HOR;
      return true;
    }
    grid[i] = 0;
  }
  return false;
}

/**
 * Clear every white cell, then iterate {@link sticksTry} to a fixpoint
 * (upstream `sticks_solve_game`). Mutates `grid`; returns the final verdict —
 * `"complete"` exactly when the deduction alone solves the board.
 */
export function sticksSolveGame(
  grid: Uint8Array,
  numbers: Int16Array,
  w: number,
  h: number,
): SticksStatus {
  const s = w * h;
  const scratch = newScratch(s);
  for (let i = 0; i < s; i++) {
    if (!(grid[i] & F_BLOCK)) grid[i] = 0;
  }
  let ret = sticksValidate(grid, numbers, w, h, scratch);
  while (ret === "unfinished") {
    if (!sticksTry(grid, numbers, w, h, scratch)) break;
    ret = sticksValidate(grid, numbers, w, h, scratch);
  }
  return ret;
}

// --- play-facing wrappers over immutable state ------------------------------

/** The current verdict on a play state (no marking, no mutation). */
export function sticksStatus(state: SticksState): SticksStatus {
  return sticksValidate(state.grid, state.numbers, state.w, state.h);
}

/** Clue cells currently violating a constraint — the live red-number
 * highlight (upstream's `F_ERROR` bit, recomputed pure per frame). */
export function findLiveErrors(state: SticksState): number[] {
  const errors: number[] = [];
  sticksValidate(state.grid, state.numbers, state.w, state.h, undefined, errors);
  return errors;
}

/**
 * Re-solve from the fixed clues and flag every white cell whose placed line
 * contradicts the unique solution (playbook §3.5). A *missing* line is
 * merely incomplete, never a mistake. Returns `[]` when the clues do not
 * deduce a complete board (defensive — generated boards always do).
 */
export function findMistakes(state: SticksState): SticksMistake[] {
  const { w, h, numbers } = state;
  const solved = state.grid.slice();
  if (sticksSolveGame(solved, numbers, w, h) !== "complete") return [];
  const mistakes: SticksMistake[] = [];
  for (let i = 0; i < w * h; i++) {
    const placed = state.grid[i] & (F_HOR | F_VER);
    if (!placed || state.grid[i] & F_BLOCK) continue;
    if (placed !== (solved[i] & (F_HOR | F_VER))) mistakes.push({ index: i });
  }
  return mistakes;
}
