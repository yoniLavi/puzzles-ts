/**
 * Types and pure state helpers for ABCD — the state/codec parts of
 * `unreleased/abcd.c` (Lennard Sprong, 2011).
 *
 * The *player state* is the grid of entered letters plus pencil marks; the
 * *puzzle data* is the `(w+h)·n` edge clue numbers. The clues never change
 * after `newState`, so every clone aliases the same `numbers` array and only
 * `grid` and `pencil` are copied per move.
 *
 * C uses one `clues[w·h·n]` array for two unrelated jobs, the player's pencil
 * marks and the solver's candidate cube. Here they are separate:
 * {@link AbcdState.pencil}, and a fresh cube local to {@link ./solver.ts}.
 */

import { type GridCursor, newCursor } from "../../engine/pointer.ts";

// --- constants -------------------------------------------------------------

/** An empty grid cell (upstream `EMPTY = 127`; a letter index is `0..n-1`). */
export const EMPTY = -1;
/** A hidden edge clue (upstream `NO_NUMBER = -1`). */
export const NO_NUMBER = -1;

// --- clue / cube indexing (upstream CUBOID / HOR_CLUE / VER_CLUE macros) ----

/** Candidate-cube / pencil-mark index for letter `i` at cell `(x, y)`. */
export function cuboid(x: number, y: number, i: number, n: number, w: number): number {
  return i + x * n + y * n * w;
}
/** `numbers` index of the row-`y` clue counting letter `i`. */
export function horClue(y: number, i: number, n: number): number {
  return i + y * n;
}
/** `numbers` index of the column-`x` clue counting letter `i`. The `numbers`
 * array is the `h·n` row clues followed by the `w·n` column clues. */
export function verClue(x: number, i: number, n: number, h: number): number {
  return i + (x + h) * n;
}

// --- params ----------------------------------------------------------------

export interface AbcdParams {
  w: number;
  h: number;
  /** Number of distinct letters (`A`…). */
  n: number;
  /** Disallow diagonally-adjacent identical letters. */
  diag: boolean;
  /** Generate an incomplete clue set (harder). Generation-time only — absent
   * from a shared game ID (`encodeParams(_, false)`). */
  removenums: boolean;
}

export const abcdPresets: AbcdParams[] = [
  { w: 4, h: 4, n: 4, diag: false, removenums: false },
  { w: 4, h: 4, n: 4, diag: false, removenums: true },
  { w: 5, h: 5, n: 4, diag: false, removenums: false },
  { w: 5, h: 5, n: 4, diag: false, removenums: true },
  { w: 6, h: 6, n: 4, diag: false, removenums: false },
  { w: 7, h: 7, n: 3, diag: false, removenums: false },
  { w: 7, h: 7, n: 4, diag: false, removenums: false },
];

export function defaultParams(): AbcdParams {
  return { ...abcdPresets[2] };
}

export function encodeParams(p: AbcdParams, full: boolean): string {
  let s = `${p.w}x${p.h}n${p.n}`;
  if (p.diag) s += "D";
  if (full && p.removenums) s += "R";
  return s;
}

export function decodeParams(s: string): AbcdParams {
  // `W[xH][nN][D][R]`: a missing height is the width, and missing digits are 0.
  const [, w, h, n, diag, removenums] =
    /^(\d*)(?:x(\d*))?(?:n(\d*))?(D)?(R)?/.exec(s) ?? [];
  const int = (d?: string): number => (d ? Number.parseInt(d, 10) : 0);
  return {
    w: int(w),
    h: int(h ?? w),
    n: n === undefined ? defaultParams().n : int(n),
    diag: diag !== undefined,
    removenums: removenums !== undefined,
  };
}

/**
 * The largest board area that generates in a tolerable time, per letter count
 * and diagonal mode, for a board whose *shorter* side is at least 6.
 *
 * Generation fills the grid at random and keeps the fill only if the solver
 * finds its edge clues uniquely solvable, so the acceptance rate — not any
 * bound in the algorithm — decides whether a board exists to be found. It falls
 * off a cliff: 9x9 n4 accepts 1 attempt in 18,586 (~1.2 s), while 10x10 n4
 * accepted **none in 454,144** (~30 s of trying). Upstream's author hit the same
 * wall and left it as a `TODO`, never having produced a 10x10 n4 board.
 *
 * The numbers are measured, not derived (the 139-configuration sweep is in
 * `bound-abcd-generable-sizes`' design), and the two obvious closed forms are
 * both WRONG:
 *
 *   - **Area alone cannot express it.** 10x10 n4 never generates; 2x50 n4, the
 *     same area, generates in 195 ms. Which is why the bound below applies only
 *     when both sides are >= 6, with a single generous area cap for the rest.
 *   - **Clue density cannot either.** 5x40 n4 and 8x10 n4 have the *same*
 *     `n(w+h)/wh`, and one is 859 ms while the other never generates at all.
 *
 * More letters make a board harder (each one is another count to satisfy), and
 * `diag` makes it markedly EASIER despite being an extra restriction: a more
 * constrained board is more deducible, so the solver reaches a unique solution
 * more often. 9x9 n5 never generates; with `diag` it takes 34 ms.
 *
 * Keyed `n * 2 + (diag ? 1 : 0)`; `diag` requires n >= 5 above.
 */
const MAX_GENERABLE_AREA = new Map<number, number>([
  [3 * 2, 130], // 11x11 296 ms, 10x12 965 ms | 12x12 6.0 s, 9x20 never
  [4 * 2, 82], //  9x9 1.2 s, 8x10 859 ms     | 6x14 2.9 s, 9x10 5.0 s, 10x10 never
  [5 * 2, 74], //  8x9 2.0 s, 8x8 286 ms      | 7x11 5.0 s, 8x10 never, 9x9 30 s
  [6 * 2, 68], //  8x8 500 ms                 | 6x12 5.0 s, 8x9 7.5 s, 9x9 never
  [7 * 2, 68], //  8x8 667 ms                 | 8x9 never
  [8 * 2, 68], //  8x8 581 ms                 | 8x9 7.5 s
  [9 * 2, 68], //  8x8 489 ms                 | 8x9 15 s
  [5 * 2 + 1, 110], // 10x10 735 ms           | 11x11 10 s
  [6 * 2 + 1, 90], //  9x9 2.0 s              | 10x10 never
  [7 * 2 + 1, 70], //  8x8 102 ms             | 9x9 5.0 s, 10x10 never
  [8 * 2 + 1, 70], //  8x8 104 ms             | 9x9 15 s
  [9 * 2 + 1, 70], //  8x8 77 ms              | 9x9 never
]);

/** Below this shorter side, a board is bounded by area alone. A short line is
 * nearly pinned by its own clues, so thin boards stay easy far past the area
 * where a squarer one dies: 2x50 n4 is 195 ms and 3x30 n4 is 199 ms, where
 * 10x10 n4 and 9x10 n4 are hopeless. 150 is the largest thin area measured
 * generable (5x30 n3, 2.5 s); 5x40 n4 at 200 never generates. */
const THIN_SIDE = 6;
const MAX_THIN_AREA = 160;

export function validateParams(p: AbcdParams, full: boolean): string | null {
  // A width or height under 2 could break the solver.
  if (p.w < 2) return "Width must be at least 2";
  if (p.h < 2) return "Height must be at least 2";
  // 2-letter puzzles are dull and even×even 2-letter grids have no unique
  // solution; 1-letter multi-cell puzzles don't exist.
  if (p.n < 3 && !p.diag) return "Letters must be at least 3";
  // Under 5 letters, diagonal mode can't avoid the no-touch rule in practice.
  if (p.n < 5 && p.diag) return "Letters for Diagonal mode must be at least 5";
  // Arbitrary ceiling that avoids clashing with midend hotkeys and fits the keypad.
  if (p.n > 9) return "Letters must be no more than 9";
  // Generation only: a shared game ID or a saved game is handed over rather
  // than searched for, so a described board outside the bound still opens.
  if (full) {
    const area = p.w * p.h;
    const thin = Math.min(p.w, p.h) < THIN_SIDE;
    const max = thin
      ? MAX_THIN_AREA
      : (MAX_GENERABLE_AREA.get(p.n * 2 + (p.diag ? 1 : 0)) ?? 0);
    if (area > max) {
      return thin
        ? `A board this long has no ABCD puzzle to find; keep the area under ${max} squares`
        : `${p.n} letters have no ABCD puzzle on a board this big; keep the area under ${max} squares, or use fewer letters`;
    }
  }
  return null;
}

// --- desc codec ------------------------------------------------------------

/**
 * Validate a description: `(w+h)·n` clue numbers in `numbers`-array order,
 * comma-separated, a bare `-` for a hidden clue. As upstream's `validate_desc`,
 * each number must fit its axis (a row clue `≤ 1 + w/2`, a column clue
 * `≤ 1 + h/2`).
 */
export function validateDesc(p: AbcdParams, desc: string): string | null {
  const { w, h, n } = p;
  let i = 0; // clue index
  // Each token is a digit run or one other non-comma character.
  for (const [token] of desc.matchAll(/\d+|[^,]/g)) {
    if (/^\d/.test(token)) {
      // A clue which can't possibly fit its line is rejected; `i < h·n` is a row.
      const max = 1 + (((i < h * n ? w : h) / 2) | 0);
      if (Number.parseInt(token, 10) > max)
        return "Description contains invalid number clue.";
    } else if (token !== "-") {
      return "Invalid character in description.";
    }
    i++;
  }
  if (i < (w + h) * n) return "Description contains not enough clues.";
  if (i > (w + h) * n) return "Description contains too many clues.";
  return null;
}

/** Parse a description into the `numbers` array (`NO_NUMBER` for `-`). */
export function parseNumbers(p: AbcdParams, desc: string): Int32Array {
  const numbers = new Int32Array((p.w + p.h) * p.n);
  let i = 0;
  for (const [token] of desc.matchAll(/\d+|-/g))
    numbers[i++] = token === "-" ? NO_NUMBER : Number.parseInt(token, 10);
  return numbers;
}

// --- state -----------------------------------------------------------------

export interface AbcdState {
  params: AbcdParams;
  /** `w·h` entered letters (`0..n-1`) or {@link EMPTY}; cloned per move. */
  grid: Int8Array;
  /** `w·h·n` pencil-mark cube (1 = mark present); cloned per move. */
  pencil: Uint8Array;
  /** `(w+h)·n` immutable edge clues (`NO_NUMBER` for hidden); shared by
   * reference across every clone (never mutated after `newState`). */
  readonly numbers: Int32Array;
  completed: boolean;
  cheated: boolean;
}

export function newState(p: AbcdParams, desc: string): AbcdState {
  const a = p.w * p.h;
  return {
    params: p,
    grid: new Int8Array(a).fill(EMPTY),
    pencil: new Uint8Array(a * p.n), // pencil marks start empty
    numbers: parseNumbers(p, desc),
    completed: false,
    cheated: false,
  };
}

export function cloneState(s: AbcdState): AbcdState {
  return {
    params: s.params,
    grid: s.grid.slice(),
    pencil: s.pencil.slice(),
    numbers: s.numbers, // immutable, shared
    completed: s.completed,
    cheated: s.cheated,
  };
}

// --- win condition (abcd_validate_puzzle == 0) -----------------------------

/** Is the board solved: every clue met exactly, no two identical letters
 * touching, and every cell filled? */
export function isCompleted(state: AbcdState): boolean {
  return validatePuzzle(state.params, state.grid, state.numbers) === 0;
}

/**
 * The three-valued board validator (upstream `abcd_validate_puzzle`):
 * `-1` a definite contradiction (a clue overcrowded, or an adjacency
 * violation), `1` no contradiction but not yet complete, `0` solved.
 * Shared by the win check and the solver's final classification.
 */
export function validatePuzzle(
  p: AbcdParams,
  grid: Int8Array,
  numbers: Int32Array,
): -1 | 0 | 1 {
  const { w, h, diag } = p;

  // Clue violations: an overcrowded clue in either direction is a contradiction.
  const rows = validateClues(p, grid, numbers, true);
  if (rows === -1) return -1;
  const cols = validateClues(p, grid, numbers, false);
  if (cols === -1) return -1;

  // Adjacency violations.
  if (!validateAdjacency(grid, w, 0, 0, w - 1, h, 1, 0)) return -1;
  if (!validateAdjacency(grid, w, 0, 0, w, h - 1, 0, 1)) return -1;
  if (diag && !validateAdjacency(grid, w, 0, 0, w - 1, h - 1, 1, 1)) return -1;
  if (diag && !validateAdjacency(grid, w, 0, 1, w - 1, h, 1, -1)) return -1;

  // No contradiction, but a clue is still unsatisfied.
  if (rows === 1 || cols === 1) return 1;

  // Finally, every square must be entered.
  for (let i = 0; i < w * h; i++) if (grid[i] === EMPTY) return 1;
  return 0;
}

/** Upstream `abcd_validate_adjacency`: false if any cell in the rectangle
 * `[sx,ex)×[sy,ey)` shares its letter with cell `(x+dx, y+dy)`. */
function validateAdjacency(
  grid: Int8Array,
  w: number,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  dx: number,
  dy: number,
): boolean {
  for (let x = sx; x < ex; x++) {
    for (let y = sy; y < ey; y++) {
      const g = grid[y * w + x];
      if (g !== EMPTY && g === grid[(y + dy) * w + (x + dx)]) return false;
    }
  }
  return true;
}

/** Upstream `abcd_validate_clues`: 1 if a clue is unsatisfied, -1 if a clue is
 * overcrowded, 0 if all satisfied — across every row (`horizontal`) or column. */
function validateClues(
  p: AbcdParams,
  grid: Int8Array,
  numbers: Int32Array,
  horizontal: boolean,
): -1 | 0 | 1 {
  const { w, h, n } = p;
  const amx = horizontal ? h : w;
  const bmx = horizontal ? w : h;
  let unsatisfied = false;
  for (let a = 0; a < amx; a++) {
    for (let i = 0; i < n; i++) {
      const clue = numbers[horizontal ? horClue(a, i, n) : verClue(a, i, n, h)];
      if (clue === NO_NUMBER) continue;
      let found = 0;
      for (let b = 0; b < bmx; b++) {
        if (grid[horizontal ? a * w + b : b * w + a] === i) found++;
      }
      if (found > clue) return -1;
      if (found < clue) unsatisfied = true;
    }
  }
  return unsatisfied ? 1 : 0;
}

// --- moves -----------------------------------------------------------------

export type AbcdMove =
  /** Enter (`letter` = index) or clear (`letter` = null) an ink letter at `(x,y)`. */
  | { type: "enter"; x: number; y: number; letter: number | null }
  /** Toggle pencil mark `letter` at `(x,y)`. */
  | { type: "pencil"; x: number; y: number; letter: number }
  /** Fill every note-less empty cell's whole candidate cube — the first press
   * of the adaptive mark-all (the `M` key), shared with the Latin family. */
  | { type: "pencilAll" }
  /** Strike the listed candidate marks atomically — the adaptive mark-all's
   * subsequent presses (obvious eliminations only, never a re-fill). */
  | { type: "pencilStrike"; marks: { x: number; y: number; letter: number }[] }
  /** Auto-solve: overwrite the grid with the canonical solution. */
  | { type: "solve"; grid: number[] };

// --- ui --------------------------------------------------------------------

export interface AbcdUi {
  cursor: GridCursor;
  /** The cursor is in pencil-mark mode. */
  pencilMode: boolean;
  /** The cursor came from the keyboard (so it survives an entry). */
  cursorFromKeyboard: boolean;
  /** Preference (default on, the collection's convention): right-click toggles
   * a *sticky* pencil mode, with an on-screen indicator, that stays on until
   * right-clicked again, rather than upstream's per-cell pencil select. */
  pencilSticky: boolean;
  /** Preference (default on): keep the mouse highlight after a pencil change. */
  pencilKeepHighlight: boolean;
}

export function newUi(_state: AbcdState): AbcdUi {
  return {
    cursor: newCursor(),
    pencilMode: false,
    cursorFromKeyboard: false,
    pencilSticky: true,
    pencilKeepHighlight: true,
  };
}

export function status(s: AbcdState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

/**
 * ASCII rendering for the share-as-text panel (upstream `game_text_format`):
 * the `A…` letters in the top-left gutter, the edge clues on the top and left
 * borders, an outlined `w × h` grid of entered letters (`.` for empty), and a
 * `+`/`*` corner cue for the no-diagonal-touch mode. Returns `undefined` when a
 * clue could be two digits (`w ≥ 19` or `h ≥ 19`), which is upstream's
 * `game_can_format_as_text_now` (docs/games/mechanics.md § "Capability flags").
 */
export function textFormat(state: AbcdState): string | undefined {
  const { w, h, n } = state.params;
  if (w >= 19 || h >= 19) return undefined;
  const { grid, numbers } = state;

  const rw = (w + n) * 2 + 1; // row width, incl. the trailing newline column
  const rh = h + n + 2;
  const buf = new Array<string>(rw * rh).fill(" ");
  for (let i = 0; i < rh; i++) buf[rw * (i + 1) - 1] = "\n";

  const digit = (num: number): string => String.fromCharCode(48 + num);

  // Letters in the top-left corner.
  for (let i = 0; i < n; i++) {
    const c = String.fromCharCode(65 + i);
    buf[rw * (n - 1) + i * 2] = c; // horizontal
    buf[rw * i + (n - 1) * 2] = c; // vertical
  }
  // Top (column) clues.
  for (let x = 0; x < w; x++)
    for (let j = 0; j < n; j++) {
      const num = numbers[verClue(x, j, n, h)];
      if (num !== NO_NUMBER) buf[rw * j + n * 2 + x * 2] = digit(num);
    }
  // Left (row) clues.
  for (let y = 0; y < h; y++)
    for (let j = 0; j < n; j++) {
      const num = numbers[horClue(y, j, n)];
      if (num !== NO_NUMBER) buf[rw * (y + n + 1) + j * 2] = digit(num);
    }
  // Outline corners (a subtle diag-vs-orthogonal cue).
  const corner = state.params.diag ? "*" : "+";
  buf[rw * n + n * 2 - 1] = corner; // top-left
  buf[rw * (n + 1) - 2] = corner; // top-right
  buf[rw * (n + h + 1) + n * 2 - 1] = corner; // bottom-left
  buf[rw * (n + h + 2) - 2] = corner; // bottom-right
  // Horizontal borders.
  for (let i = 0; i < w * 2 - 1; i++) {
    buf[rw * n + n * 2 + i] = "-"; // top
    buf[rw * (n + h + 1) + n * 2 + i] = "-"; // bottom
  }
  // Vertical borders.
  for (let y = 0; y < h; y++) {
    buf[rw * (n + y + 1) + n * 2 - 1] = "|"; // left
    buf[rw * (n + y + 2) - 2] = "|"; // right
  }
  // The entered letters.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = grid[y * w + x];
      buf[rw * (n + y + 1) + (n + x) * 2] =
        c !== EMPTY ? String.fromCharCode(65 + c) : ".";
    }

  return buf.join("");
}
