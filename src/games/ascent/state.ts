/**
 * Ascent (Hidoku / Hidato): types, constants, grid geometry, the path helpers,
 * the desc codec and state construction, from upstream's unreleased `ascent.c`
 * (© 2015 Lennard Sprong). The five grid modes share one square grid and differ
 * only in their movement table, so nothing here knows any other geometry.
 */
import { tierNames } from "../../engine/difficulty.ts";

// --- number sentinels (upstream `NUMBER_*`) ------------------------

/** An empty, playable cell. */
export const NUMBER_EMPTY = -1;
/** A wall cell (interior padding for hexagon/honeycomb/edges modes). */
export const NUMBER_WALL = -2;
/** A wall promoted to "boundary" (touches the grid edge). */
export const NUMBER_BOUND = -3;
/** Draw-only: the "move here" symbol. */
export const NUMBER_MOVE = -4;
/** Draw-only: the "clear this cell" cross. */
export const NUMBER_CLEAR = -5;

/** A wall of either kind (upstream `IS_OBSTACLE`). */
export function isObstacle(n: number): boolean {
  return n <= NUMBER_WALL;
}
/** Edges mode: an arrow clue pointing at where number `n` sits. */
export function numberEdge(n: number): number {
  return -10 - n;
}
/** Decode an arrow clue back to its number. Precondition: `isNumberEdge`. */
export function fromNumberEdge(n: number): number {
  return -10 - n;
}
/** Edges mode: the cell holds an arrow clue (upstream `IS_NUMBER_EDGE`). */
export function isNumberEdge(n: number): boolean {
  return n <= -10;
}

/** Draw-only flag OR'd onto a real number to show a "move" affordance. */
export const NUMBER_FLAG_MOVE = 0x4000;

/** Sentinel cell indices. */
export const CELL_NONE = -1;
export const CELL_MULTIPLE = -2;

// --- path segment flags (upstream `FLAG_*`) ------------------------

export const MAXIMUM_DIRS = 8;
/** This cell may be an endpoint (number 0 or `last`). */
export const FLAG_ENDPOINT = 1 << MAXIMUM_DIRS;
/** This cell's path is fully determined (two segments). */
export const FLAG_COMPLETE = 1 << (MAXIMUM_DIRS + 1);
/** A path segment joins two non-sequential numbers (render error). */
export const FLAG_ERROR = 1 << (MAXIMUM_DIRS + 2);
/** A path segment the user drew (vs one deduced from placed numbers). */
export const FLAG_USER = 1 << (MAXIMUM_DIRS + 3);

// --- difficulty & mode enums ---------------------------------------

export const DIFF_EASY = 0;
export const DIFF_NORMAL = 1;
export const DIFF_TRICKY = 2;
export const DIFF_HARD = 3;
export const DIFFCOUNT = 4;
export const ASCENT_DIFFNAMES = tierNames(DIFFCOUNT);
export const ASCENT_DIFFCHARS = "enth";

export const MODE_ORTHOGONAL = 0;
export const MODE_RECT = 1;
export const MODE_HEXAGON = 2;
export const MODE_HONEYCOMB = 3;
export const MODE_EDGES = 4;
export const MODECOUNT = 5;
export const ASCENT_MODENAMES = [
  "Rectangle (No diagonals)",
  "Rectangle",
  "Hexagon",
  "Honeycomb",
  "Edges",
];
export const ASCENT_MODECHARS = "ORHCE";

export function isHexagonal(mode: number): boolean {
  return mode === MODE_HEXAGON || mode === MODE_HONEYCOMB;
}

// --- movement table ------------------------------------------------

export interface AscentStep {
  dx: number;
  dy: number;
}
export interface AscentMovement {
  dircount: number;
  /** `dirs[n]` is the inverse of `dirs[dircount-(n+1)]`. */
  dirs: AscentStep[];
}

const MOVEMENT_ORTHOGONAL: AscentMovement = {
  dircount: 4,
  dirs: [
    { dx: 0, dy: -1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
  ],
};

const MOVEMENT_FULL: AscentMovement = {
  dircount: 8,
  dirs: [
    { dx: -1, dy: -1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: 1, dy: 1 },
  ],
};

/** Hexagonal grids are square grids disallowing the top-left/bottom-right
 * diagonal (6-way). */
const MOVEMENT_HEX: AscentMovement = {
  dircount: 6,
  dirs: [
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 1 },
    { dx: 0, dy: 1 },
  ],
};

export function movementForMode(mode: number): AscentMovement {
  if (mode === MODE_ORTHOGONAL) return MOVEMENT_ORTHOGONAL;
  if (isHexagonal(mode)) return MOVEMENT_HEX;
  return MOVEMENT_FULL;
}

// --- params & state types ------------------------------------------

export interface AscentParams {
  /** User-friendly width and height (physical grid may be larger). */
  w: number;
  h: number;
  diff: number;
  mode: number;
  /** Remove the start and end points from the clues. */
  removeends: boolean;
  /** Constrain the given numbers to a rotationally symmetric pattern. */
  symmetrical: boolean;
}

export interface AscentState {
  /** Physical width/height (padded for hexagon/honeycomb/edges). */
  w: number;
  h: number;
  mode: number;
  /** The last number on the path (`w*h-1` minus obstacles/edge clues). */
  last: number;
  /** Cell contents: a number `>= 0`, or a `NUMBER_*`/edge sentinel. */
  grid: Int16Array;
  /** Per-cell immutability (clue cells + walls). Shared by reference
   * across states — it never changes after `newState`. */
  immutable: Uint8Array;
  /** Per-cell path segment bitmask (`1<<dir` | `FLAG_COMPLETE`), or
   * `null` when the player has drawn no path. */
  path: Int16Array | null;
  completed: boolean;
  cheated: boolean;
}

/** One user gesture, as a single move fragment (upstream's `P`/`L`/`D`/
 * `C`/`S`). A gesture never emits more than one fragment. */
export type AscentMove =
  | { kind: "place"; cell: number; n: number }
  | { kind: "line"; from: number; to: number; erase: boolean }
  | { kind: "clear"; cell: number }
  | { kind: "solve"; grid: number[] };

/** A user-placed number that contradicts the unique solution. */
export interface AscentMistake {
  cell: number;
}

// --- grid geometry -------------------------------------------------

/** The physical grid size for a params set (upstream `ascent_grid_size`).
 * Honeycomb widens `w`; Edges adds a 2-cell border to both dimensions. */
export function ascentGridSize(params: AscentParams): { w: number; h: number } {
  let w = params.w;
  let h = params.h;
  if (params.mode === MODE_HONEYCOMB) {
    w += ((h + 1) >> 1) - 1;
  } else if (params.mode === MODE_EDGES) {
    w += 2;
    h += 2;
  }
  return { w, h };
}

/** Is cell `i` on the outermost ring of a `w`×`h` grid? */
export function isBorderCell(i: number, w: number, h: number): boolean {
  const x = i % w;
  const y = Math.trunc(i / w);
  return x === 0 || y === 0 || x === w - 1 || y === h - 1;
}

export function isNear(a: number, b: number, w: number, mode: number): boolean {
  const dx = (a % w) - (b % w);
  const dy = Math.trunc(a / w) - Math.trunc(b / w);
  if (mode === MODE_ORTHOGONAL) return Math.abs(dx) + Math.abs(dy) === 1;
  if (isHexagonal(mode) && dx === dy) return false;
  return (Math.abs(dx) | Math.abs(dy)) === 1;
}

/** Is cell `i` a legal target for an arrow clue placed at `edge`
 * (upstream `is_edge_valid`)? Rows/columns/diagonals from the border. */
export function isEdgeValid(edge: number, i: number, w: number, h: number): boolean {
  const er = Math.trunc(edge / w);
  const ec = edge % w;
  /* Rows */
  if (er > 0 && er < h - 1) return Math.trunc(i / w) === er;
  /* Columns */
  if (ec > 0 && ec < w - 1) return i % w === ec;
  /* Diagonals */
  return Math.abs((i % w) - ec) === Math.abs(Math.trunc(i / w) - er);
}

/** The direction index from `i1` to `i2`, or -1 if not adjacent
 * (upstream `ascent_find_direction`). */
export function findDirection(
  i1: number,
  i2: number,
  w: number,
  movement: AscentMovement,
): number {
  for (let dir = 0; dir < movement.dircount; dir++) {
    if (i2 - i1 === movement.dirs[dir].dy * w + movement.dirs[dir].dx) return dir;
  }
  return -1;
}

/** `positions[n]` = the cell holding number `n` (`CELL_NONE`/`CELL_MULTIPLE`). */
export function updatePositions(
  positions: Int32Array,
  grid: Int16Array,
  s: number,
): void {
  positions.fill(CELL_NONE, 0, s);
  for (let i = 0; i < s; i++) {
    const n = grid[i];
    if (n < 0 || n >= s) continue;
    positions[n] = positions[n] === CELL_NONE ? i : CELL_MULTIPLE;
  }
}

/**
 * Follow the drawn path from `i` (having come from `prev`), returning the
 * first placed number found, or `NUMBER_EMPTY` on a dead end. `length`,
 * if provided, receives the number of steps walked. Precondition: no cell
 * has more than two path segments (ensured by `cleanPath`).
 */
export function followPath(
  state: AscentState,
  i: number,
  prev: number,
  length?: { value: number },
): number {
  const w = state.w;
  const movement = movementForMode(state.mode);
  let i2 = i;
  let start = prev;
  let len = 0;
  const path = state.path;

  while (state.grid[i] === NUMBER_EMPTY && i !== start) {
    let dir = 0;
    for (; dir < movement.dircount; dir++) {
      if (!(path && path[i] & (1 << dir))) continue;
      i2 = movement.dirs[dir].dy * w + movement.dirs[dir].dx + i;
      if (i2 !== prev) break;
    }
    if (dir === movement.dircount) {
      if (length) length.value = len;
      return NUMBER_EMPTY;
    }
    prev = i;
    i = i2;
    ++len;
    if (start === CELL_NONE) start = prev;
  }

  if (length) length.value = len;
  return state.grid[i];
}

/** Count the path segments meeting at cell `i` (upstream
 * `ascent_count_segments`) — obstacles count as 2. */
export function countSegments(state: AscentState, i: number): number {
  const movement = movementForMode(state.mode);
  const w = state.w;
  const s = w * state.h;
  const n = state.grid[i];
  let segments = 0;

  if (isObstacle(n)) return 2;
  if (n === 0 || n === state.last) segments++;

  for (let dir = 0; dir < movement.dircount; dir++) {
    if (state.path && state.path[i] & (1 << dir)) {
      const j = i + w * movement.dirs[dir].dy + movement.dirs[dir].dx;
      const n2 = state.grid[j];
      if (n < 0 || n2 < 0 || Math.abs(n - n2) !== 1) segments++;
    }
  }

  if (n >= 0) {
    for (let j = 0; j < s; j++) {
      if (n > 0 && state.grid[j] === n - 1) segments++;
      if (state.grid[j] === n + 1) segments++;
    }
  }

  return segments;
}

/** Update the "previous/next number" candidate hints shown at open path
 * ends (upstream `update_path_hints`). */
export function updatePathHints(
  prevhints: Int32Array,
  nexthints: Int32Array,
  state: AscentState,
): void {
  const s = state.w * state.h;
  prevhints.fill(NUMBER_EMPTY, 0, s);
  nexthints.fill(NUMBER_EMPTY, 0, s);
  if (!state.path) return;

  for (let i = 0; i < s; i++) {
    if (
      !state.path[i] ||
      state.grid[i] !== NUMBER_EMPTY ||
      state.path[i] & FLAG_COMPLETE
    )
      continue;

    const len = { value: 0 };
    const other = followPath(state, i, CELL_NONE, len);
    if (other >= 0) {
      let hint = other - len.value;
      prevhints[i] = hint >= 0 ? hint : NUMBER_WALL;
      hint = other + len.value;
      nexthints[i] = hint <= state.last ? hint : NUMBER_WALL;
    }
  }
}

/** True if the whole grid forms a single 1..last path (upstream
 * `check_completion`) and every arrow clue is satisfied. */
export function checkCompletion(
  grid: Int16Array,
  w: number,
  h: number,
  mode: number,
): boolean {
  let x = -1;
  let y = -1;
  let last = w * h - 1;
  const movement = movementForMode(mode);

  for (let i = 0; i < w * h; i++) {
    if (grid[i] === NUMBER_EMPTY) return false;
    if (grid[i] === 0) {
      x = i % w;
      y = Math.trunc(i / w);
    }
    if (isObstacle(grid[i])) last--;
  }
  if (x === -1) return false;

  while (grid[y * w + x] !== last) {
    let i = 0;
    let x2 = -1;
    let y2 = -1;
    for (; i < movement.dircount; i++) {
      x2 = x + movement.dirs[i].dx;
      y2 = y + movement.dirs[i].dy;
      if (y2 < 0 || y2 >= h || x2 < 0 || x2 >= w) continue;
      if (grid[y2 * w + x2] === grid[y * w + x] + 1) break;
    }
    if (i === movement.dircount) return false;
    x = x2;
    y = y2;
  }

  for (let i = 0; i < w * h; i++) {
    if (!isNumberEdge(grid[i])) continue;
    const n = fromNumberEdge(grid[i]);
    let found = false;
    for (let j = 0; j < w * h; j++)
      if (grid[j] === n && isEdgeValid(i, j, w, h)) found = true;
    if (!found) return false;
  }

  return true;
}

// --- desc codec ----------------------------------------------------

/** Encode a padded number grid to a desc (the tail of upstream
 * `new_game_desc`). Numbers as decimal `n+1` (`_` before a number that
 * directly follows another), empty runs `a`–`z`, wall runs `A`–`Z`. */
export function encodeGridDesc(grid: Int16Array, s: number): string {
  let out = "";
  let run = 0;
  let runtype: "none" | "blank" | "wall" | "number" = "none";
  const flushRun = (a: string) => {
    const base = a.charCodeAt(0);
    while (run >= 26) {
      out += String.fromCharCode(base + 25);
      run -= 26;
    }
    if (run) out += String.fromCharCode(base + run - 1);
    run = 0;
  };

  for (let i = 0; i <= s; i++) {
    let n = i === s ? NUMBER_EMPTY : grid[i];
    if (isNumberEdge(n)) n = fromNumberEdge(n);

    if (runtype === "blank" && (i === s || n !== NUMBER_EMPTY)) flushRun("a");
    if (runtype === "wall" && (i === s || !isObstacle(n))) flushRun("A");
    if (i === s) break;

    if (n >= 0) {
      if (runtype === "number") out += "_";
      out += String(n + 1);
      runtype = "number";
    } else if (n === NUMBER_EMPTY) {
      runtype = "blank";
      run++;
    } else if (isObstacle(n)) {
      runtype = "wall";
      run++;
    }
  }

  return out;
}

/** A desc's tokens: a clue number, a blank run or a wall run. Anything else
 * (the `_` between two numbers) is skipped. */
const DESC_TOKEN = /(\d+)|([a-z])|([A-Z])/g;
/** A run letter's length: `a`/`A` is 1, `z`/`Z` is 26. */
const runLength = (c: string) => c.toLowerCase().charCodeAt(0) - "a".charCodeAt(0) + 1;

/** `null` when valid, else the rejection reason (upstream `validate_desc`). */
export function validateAscentDesc(params: AscentParams, desc: string): string | null {
  const { w, h } = ascentGridSize(params);
  const s = w * h;
  let last = 0;
  let i = 0;
  for (const [, num, blank, wall] of desc.matchAll(DESC_TOKEN)) {
    if (num) {
      last = Math.max(last, Number.parseInt(num, 10));
      i++;
    } else {
      i += runLength(blank || wall);
    }
  }

  if (last > s) return "Number is too high";
  if (i < s) return "Not enough spaces";
  if (i > s) return "Too many spaces";
  return null;
}

// --- state construction --------------------------------------------

/** Build the initial state from a desc (upstream `new_game`). */
export function newAscentState(params: AscentParams, desc: string): AscentState {
  const { w, h } = ascentGridSize(params);
  const mode = params.mode;
  const grid = new Int16Array(w * h).fill(NUMBER_EMPTY);
  const immutable = new Uint8Array(w * h);
  let last = w * h - 1;

  let i = 0;
  for (const [, num, blank, wall] of desc.matchAll(DESC_TOKEN)) {
    if (num) {
      grid[i] = Number.parseInt(num, 10) - 1;
      immutable[i++] = 1;
    } else if (blank) {
      i += runLength(blank);
    } else {
      const walls = runLength(wall);
      grid.fill(NUMBER_WALL, i, i + walls);
      immutable.fill(1, i, i + walls);
      last -= walls;
      i += walls;
    }
  }

  /* Edges mode: a number on the border is an arrow clue, not a path cell. */
  if (mode === MODE_EDGES) {
    for (let k = 0; k < w * h; k++) {
      if (isBorderCell(k, w, h) && grid[k] >= 0) {
        grid[k] = numberEdge(grid[k]);
        last--;
      }
    }
  }

  /* Promote border walls to boundary walls, then flood the promotion. */
  for (let k = 0; k < w * h; k++) {
    if (isBorderCell(k, w, h) && grid[k] === NUMBER_WALL) grid[k] = NUMBER_BOUND;
  }

  let promoted: number;
  do {
    promoted = 0;
    for (let k = 0; k < w * h; k++) {
      if (grid[k] !== NUMBER_WALL) continue;
      const x = k % w;
      const y = Math.trunc(k / w);
      if (
        (x < w - 1 && grid[k + 1] === NUMBER_BOUND) ||
        (x > 0 && grid[k - 1] === NUMBER_BOUND) ||
        // Upstream compares `y < w - 1`, not `h - 1`; kept as written. When
        // h < w the last row reads past the grid: `undefined` here, heap
        // garbage in C, and never NUMBER_BOUND in either.
        (y < w - 1 && grid[k + w] === NUMBER_BOUND) ||
        (y > 0 && grid[k - w] === NUMBER_BOUND)
      ) {
        grid[k] = NUMBER_BOUND;
        promoted++;
      }
    }
  } while (promoted);

  return {
    w,
    h,
    mode,
    last,
    grid,
    immutable,
    path: null,
    completed: false,
    cheated: false,
  };
}

export function cloneAscentState(s: AscentState): AscentState {
  return { ...s, grid: s.grid.slice(), path: s.path?.slice() ?? null };
}
