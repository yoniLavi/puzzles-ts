/**
 * Ascent move application (upstream `ascent_modify_path`,
 * `ascent_clean_path`, `ascent_apply_path`, `execute_move`).
 *
 * A user gesture is a single `AscentMove` fragment. After applying it, the
 * path-resolution post-pass repeatedly cleans the drawn path and fills in
 * any numbers a fully-drawn segment now forces, then the completion check
 * runs.
 */

import {
  type AscentMove,
  type AscentState,
  CELL_MULTIPLE,
  CELL_NONE,
  checkCompletion,
  cloneAscentState,
  countSegments,
  FLAG_COMPLETE,
  findDirection,
  followPath,
  movementForMode,
  NUMBER_EMPTY,
  updatePositions,
} from "./state.ts";

/** Toggle (`add`) or clear a single path segment from `i` toward `i2`,
 * then recompute the cell's `FLAG_COMPLETE` (upstream `ascent_modify_path`).
 * Returns false if `i2` is not adjacent to `i`. */
function modifyPath(state: AscentState, add: boolean, i: number, i2: number): boolean {
  const movement = movementForMode(state.mode);
  const dir = findDirection(i, i2, state.w, movement);
  if (dir === -1) return false;
  const path = state.path;
  if (!path) return false;

  if (add && !(path[i] & (1 << dir))) path[i] |= 1 << dir;
  else path[i] &= ~(1 << dir);

  if (countSegments(state, i) === 2) path[i] |= FLAG_COMPLETE;
  else path[i] &= ~FLAG_COMPLETE;

  return true;
}

/** Remove path segments between two placed numbers, and reduce any cell
 * with more than two segments (upstream `ascent_clean_path`). */
function cleanPath(state: AscentState): void {
  const w = state.w;
  const h = state.h;
  const movement = movementForMode(state.mode);
  const path = state.path;
  if (!path) return;

  for (let i = 0; i < w * h; i++) {
    if (state.grid[i] < 0) continue;

    /* Unset lines connecting two adjacent numbers. */
    for (let dir = 0; dir < movement.dircount; dir++) {
      if (path[i] & (1 << dir)) {
        const i2 = movement.dirs[dir].dy * w + movement.dirs[dir].dx + i;
        if (state.grid[i2] >= 0) {
          modifyPath(state, false, i, i2);
          modifyPath(state, false, i2, i);
        }
      }
    }

    /* If a number has more than two segments, unset all of them. */
    if (countSegments(state, i) > 2) {
      for (let dir = 0; dir < movement.dircount; dir++) {
        if (path[i] & (1 << dir)) {
          const i2 = movement.dirs[dir].dy * w + movement.dirs[dir].dx + i;
          modifyPath(state, false, i, i2);
          modifyPath(state, false, i2, i);
        }
      }
    }
  }
}

/** Fill in numbers that a fully-drawn path now forces (upstream
 * `ascent_apply_path`). Returns whether anything was placed. */
function applyPath(state: AscentState, positions: Int32Array): boolean {
  const w = state.w;
  const movement = movementForMode(state.mode);
  const path = state.path;
  if (!path) return false;
  let ret = false;

  for (let n = 0; n <= state.last; n++) {
    const i = positions[n];
    if (i < 0) continue;
    if (!(path[i] & ~FLAG_COMPLETE)) continue;

    let cn = NUMBER_EMPTY;

    let i2 = n > 0 ? positions[n - 1] : i;
    if (i2 !== CELL_NONE && i2 !== CELL_MULTIPLE) cn = n + 1;

    i2 = n < state.last ? positions[n + 1] : i;
    if (i2 !== CELL_NONE && i2 !== CELL_MULTIPLE) cn = n - 1;

    for (let dir = 0; dir < movement.dircount; dir++) {
      if (!(path[i] & (1 << dir))) continue;

      i2 = movement.dirs[dir].dy * w + movement.dirs[dir].dx + i;
      if (cn !== NUMBER_EMPTY && state.grid[i2] === NUMBER_EMPTY) {
        state.grid[i2] = cn;
        ret = true;
      } else {
        const n2 = followPath(state, i2, i);
        if (n2 !== NUMBER_EMPTY && Math.abs(n - n2) > 1) {
          state.grid[i2] = n < n2 ? n + 1 : n - 1;
          ret = true;
        }
      }
    }
  }

  return ret;
}

/** Apply a single move fragment, run the path-resolution post-pass, and
 * set completion (upstream `execute_move`). Throws on an illegal move. */
export function executeAscentMove(state: AscentState, move: AscentMove): AscentState {
  const w = state.w;
  const h = state.h;
  const ret = cloneAscentState(state);

  switch (move.kind) {
    case "place": {
      if (state.immutable[move.cell])
        throw new Error("ascent: place on immutable cell");
      ret.grid[move.cell] = move.n;
      break;
    }
    case "line": {
      if (!move.erase && !ret.path) {
        ret.path = new Int16Array(w * h);
      }
      if (ret.path) {
        if (
          !modifyPath(ret, !move.erase, move.from, move.to) ||
          !modifyPath(ret, !move.erase, move.to, move.from)
        )
          throw new Error("ascent: illegal path move");
      }
      break;
    }
    case "clear": {
      const i = move.cell;
      if (state.immutable[i]) throw new Error("ascent: clear on immutable cell");
      ret.grid[i] = NUMBER_EMPTY;
      if (ret.path?.[i]) {
        const movement = movementForMode(ret.mode);
        for (let dir = 0; dir < movement.dircount; dir++) {
          if (ret.path[i] & (1 << dir)) {
            const i2 = movement.dirs[dir].dy * w + movement.dirs[dir].dx + i;
            modifyPath(ret, false, i, i2);
            modifyPath(ret, false, i2, i);
          }
        }
        ret.path[i] = 0;
      }
      break;
    }
    case "solve": {
      for (let i = 0; i < w * h; i++) {
        const n = move.grid[i];
        if (n >= 0) ret.grid[i] = n;
        else if (!ret.immutable[i]) ret.grid[i] = NUMBER_EMPTY;
      }
      /* Deliberate divergence from upstream, which never sets `cheated` in
       * its 'S' arm (so the win flash would fire on a solver fill). Setting
       * it here matches the collection convention (docs/games/solver-and-generator.md § "Solve and the generator's aux"). */
      ret.cheated = true;
      break;
    }
  }

  if (ret.path) {
    const positions = new Int32Array(w * h);
    do {
      cleanPath(ret);
      updatePositions(positions, ret.grid, w * h);
    } while (applyPath(ret, positions));

    let anySegment = false;
    for (let i = 0; i < w * h; i++) {
      if (ret.path[i] & ~FLAG_COMPLETE) {
        anySegment = true;
        break;
      }
    }
    if (!anySegment) ret.path = null;
  }

  if (checkCompletion(ret.grid, w, h, ret.mode)) ret.completed = true;

  return ret;
}
