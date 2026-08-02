/**
 * Types and pure state helpers for ABCD — the state/codec parts of
 * `unreleased/abcd.c` (Lennard Sprong, 2011).
 *
 * Fill each cell of a `w × h` grid with one of `n` letters (`A`…). The numbers
 * on each row/column edge count how many of each letter that line holds, and
 * two identical letters may not be orthogonally adjacent (and, under `diag`
 * mode, not diagonally either). The puzzle has a unique solution by
 * construction.
 *
 * The one fact the whole port turns on: the *player state* is the grid of
 * entered letters + pencil marks, while the *puzzle data* is the `(w+h)·n` edge
 * clue numbers. The clues never change after `newState`, so every clone aliases
 * the same frozen `numbers` array; only `grid` + `pencil` are copied per move.
 *
 * C uses one `clues[w·h·n]` boolean array for two unrelated jobs — the player's
 * pencil marks on the live state, and the solver's candidate cube on a scratch
 * state. We separate them: {@link AbcdState.pencil} here, a fresh cube local to
 * {@link ./solver.ts}.
 */

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
  const p = defaultParams();
  let i = 0;
  const readInt = (): number => {
    let d = "";
    while (i < s.length && s[i] >= "0" && s[i] <= "9") d += s[i++];
    return d ? Number.parseInt(d, 10) : 0;
  };
  // Width (and default height to it).
  p.w = p.h = readInt();
  // Optional height.
  if (s[i] === "x") {
    i++;
    p.h = readInt();
  }
  // Optional number of letters.
  if (s[i] === "n") {
    i++;
    p.n = readInt();
  }
  // Optional flags.
  p.diag = false;
  if (s[i] === "D") {
    p.diag = true;
    i++;
  }
  p.removenums = false;
  if (s[i] === "R") {
    p.removenums = true;
    i++;
  }
  return p;
}

export function validateParams(p: AbcdParams, _full: boolean): string | null {
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
  return null;
}

// --- desc codec ------------------------------------------------------------

/**
 * Validate a description: a comma-separated list of `(w+h)·n` clue numbers in
 * `numbers`-array order, a bare `-` for a hidden clue. Faithful to
 * `validate_desc`: each number must fit its axis (a row clue `≤ 1 + w/2`, a
 * column clue `≤ 1 + h/2`), and the count must be exactly `(w+h)·n`.
 */
export function validateDesc(p: AbcdParams, desc: string): string | null {
  const { w, h, n } = p;
  const l = w + h;
  let i = 0; // clue index
  let pos = 0; // string cursor
  while (pos < desc.length) {
    const c = desc[pos];
    if (c >= "0" && c <= "9") {
      let d = "";
      while (pos < desc.length && desc[pos] >= "0" && desc[pos] <= "9")
        d += desc[pos++];
      const num = Number.parseInt(d, 10);
      // A clue which can't possibly fit is rejected. `i < h·n` ⇒ a row clue.
      if (
        (i < h * n && num > 1 + ((w / 2) | 0)) ||
        (i >= h * n && num > 1 + ((h / 2) | 0))
      )
        return "Description contains invalid number clue.";
      i++;
    } else if (c === "-") {
      i++;
      pos++;
    } else if (c === ",") {
      pos++;
    } else {
      return "Invalid character in description.";
    }
  }
  if (i < l * n) return "Description contains not enough clues.";
  if (i > l * n) return "Description contains too many clues.";
  return null;
}

/** Parse a description into the `numbers` array (`NO_NUMBER` for `-`). */
export function parseNumbers(p: AbcdParams, desc: string): Int32Array {
  const l = p.w + p.h;
  const numbers = new Int32Array(l * p.n);
  let i = 0;
  let pos = 0;
  while (pos < desc.length) {
    const c = desc[pos];
    if (c >= "0" && c <= "9") {
      let d = "";
      while (pos < desc.length && desc[pos] >= "0" && desc[pos] <= "9")
        d += desc[pos++];
      numbers[i++] = Number.parseInt(d, 10);
    } else if (c === "-") {
      numbers[i++] = NO_NUMBER;
      pos++;
    } else {
      pos++;
    }
  }
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

/**
 * Is `grid` fully solved for `numbers`? Faithful to `abcd_validate_puzzle`
 * returning 0: no clue over- or under-satisfied, no adjacency violation
 * (orthogonal, plus both diagonals under `diag`), and every cell filled.
 */
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

  // Clue violations. Mirror the C's control flow exactly: if the horizontal
  // pass reports "unsatisfied" (1) we still run the vertical pass to catch an
  // overcrowded (-1) clue; if it reports "all satisfied" (0) we likewise run
  // the vertical pass but keep its verdict as the running `invalid`.
  let invalid = validateClues(p, grid, numbers, true);
  if (invalid === -1) return -1;
  if (invalid === 1) {
    if (validateClues(p, grid, numbers, false) === -1) return -1;
  } else {
    invalid = validateClues(p, grid, numbers, false);
    if (invalid === -1) return -1;
  }

  // Adjacency violations.
  if (!validateAdjacency(grid, w, 0, 0, w - 1, h, 1, 0)) return -1;
  if (!validateAdjacency(grid, w, 0, 0, w, h - 1, 0, 1)) return -1;
  if (diag && !validateAdjacency(grid, w, 0, 0, w - 1, h - 1, 1, 1)) return -1;
  if (diag && !validateAdjacency(grid, w, 0, 1, w - 1, h, 1, -1)) return -1;

  // No contradiction, but a clue is still unsatisfied.
  if (invalid === 1) return 1;

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
  let error: -1 | 0 | 1 = 0;
  for (let a = 0; a < amx; a++) {
    for (let i = 0; i < n; i++) {
      const clue = numbers[horizontal ? horClue(a, i, n) : verClue(a, i, n, h)];
      if (clue === NO_NUMBER) continue;
      let found = 0;
      for (let b = 0; b < bmx; b++) {
        const gridpos = horizontal ? a * w + b : b * w + a;
        if (grid[gridpos] === i) found++;
      }
      if (found < clue) error = error === 0 ? 1 : error;
      else if (found > clue) error = -1;
    }
  }
  return error;
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
  /** Cursor position. */
  hx: number;
  hy: number;
  /** Cursor is in pencil-mark mode. */
  hpencil: boolean;
  /** Cursor is currently shown. */
  hshow: boolean;
  /** Cursor came from the keyboard (so it survives an entry). */
  hcursor: boolean;
  /** Preference (default on, the fork's shared convention): right-click toggles
   * a *sticky* pencil mode that stays on until right-clicked again (a
   * CapsLock-style toggle with an on-screen indicator), rather than upstream's
   * per-cell pencil select. Matches Keen/Towers/Solo/Mathrax/Unequal/Undead. */
  pencilSticky: boolean;
}

export function newUi(_state: AbcdState): AbcdUi {
  return {
    hx: 0,
    hy: 0,
    hpencil: false,
    hshow: false,
    hcursor: false,
    pencilSticky: true,
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
 * clue could be two digits (`w ≥ 19` or `h ≥ 19`) — the width the single-char
 * format can't hold — which is upstream's `game_can_format_as_text_now`
 * expressed through the widened `Game.textFormat` return (playbook §3.3).
 */
export function textFormat(state: AbcdState): string | undefined {
  const { w, h, n } = state.params;
  if (w >= 19 || h >= 19) return undefined;
  const { grid, numbers } = state;

  const rw = (w + n) * 2 + 1; // row width, incl. the trailing newline column
  const rh = h + n + 2;
  const buf = new Array<string>(rw * rh).fill(" ");
  for (let i = 0; i < rh; i++) buf[rw * (i + 1) - 1] = "\n";

  const put = (idx: number, ch: string): void => {
    buf[idx] = ch;
  };
  const digit = (num: number): string => String.fromCharCode(48 + num);

  // Letters in the top-left corner.
  for (let i = 0; i < n; i++) {
    const c = String.fromCharCode(65 + i);
    put(rw * (n - 1) + i * 2, c); // horizontal
    put(rw * i + (n - 1) * 2, c); // vertical
  }
  // Top (column) clues.
  for (let x = 0; x < w; x++)
    for (let j = 0; j < n; j++) {
      const num = numbers[verClue(x, j, n, h)];
      if (num !== NO_NUMBER) put(rw * j + n * 2 + x * 2, digit(num));
    }
  // Left (row) clues.
  for (let y = 0; y < h; y++)
    for (let j = 0; j < n; j++) {
      const num = numbers[horClue(y, j, n)];
      if (num !== NO_NUMBER) put(rw * (y + n + 1) + j * 2, digit(num));
    }
  // Outline corners (a subtle diag-vs-orthogonal cue).
  const corner = state.params.diag ? "*" : "+";
  put(rw * n + n * 2 - 1, corner); // top-left
  put(rw * (n + 1) - 2, corner); // top-right
  put(rw * (n + h + 1) + n * 2 - 1, corner); // bottom-left
  put(rw * (n + h + 2) - 2, corner); // bottom-right
  // Horizontal borders.
  for (let i = 0; i < w * 2 - 1; i++) {
    put(rw * n + n * 2 + i, "-"); // top
    put(rw * (n + h + 1) + n * 2 + i, "-"); // bottom
  }
  // Vertical borders.
  for (let y = 0; y < h; y++) {
    put(rw * (n + y + 1) + n * 2 - 1, "|"); // left
    put(rw * (n + y + 2) - 2, "|"); // right
  }
  // The entered letters.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = grid[y * w + x];
      put(
        rw * (n + y + 1) + (n + x) * 2,
        c !== EMPTY ? String.fromCharCode(65 + c) : ".",
      );
    }

  return buf.join("");
}
