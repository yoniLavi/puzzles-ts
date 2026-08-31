/**
 * Bricks (Tawamurenga) state, params, hex geometry, and the desc codec —
 * port of the corresponding parts of `puzzles/unreleased/bricks.c`.
 *
 * The play area is a **hexagon stored as a padded parallelogram** (design
 * D2): `params.w`/`h` are the user-friendly size, but the backing `grid` is
 * `w = params.w + ⌈h/2⌉ − 1` wide, with the two triangular corners masked to
 * `F_BOUND` so exactly `params.w × params.h` cells remain playable. The six
 * hex neighbours are the fixed {@link BRICKS_STEPS} table. Everything else in
 * the port follows from those two facts.
 *
 * A `cell` is a packed bit-field (upstream `typedef unsigned int cell`): the
 * low three bits are a clue number (0..7, `NUM_MASK`), `F_BOUND` marks
 * padding, and `COL_MASK` holds the play colour (`F_SHADE`/`F_UNSHADE`/
 * `F_EMPTY`). A cell is *either* a number *or* a colour — never both — so a
 * cell with no `COL_MASK` bits and value ≤ 7 is a clue. The transient error /
 * cursor flags upstream ORs into the same word are kept out of persisted
 * state here (recomputed on demand — see solver.ts / render.ts).
 */

import type { PresetMenu } from "../../engine/game.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- cell bit-field (upstream values) ---------------------------------------

export const NUM_MASK = 0x007;
export const F_BOUND = 0x008;

export const F_SHADE = 0x010;
export const F_UNSHADE = 0x020;
export const F_EMPTY = 0x030;
export const COL_MASK = 0x030;

// Transient error/cursor flags (upstream ORs these into the grid; here they
// live only in a scratch array from the validator, never in state).
export const FE_ERROR = 0x040;
export const FE_TOPLEFT = 0x080;
export const FE_TOPRIGHT = 0x100;
export const FE_LINE_LEFT = 0x200;
export const FE_LINE_RIGHT = 0x400;
export const FE_CURSOR = 0x800;

/** The six hexagonal neighbours of a cell, as (dx, dy) steps (upstream
 * `bricks_steps`). Load-bearing: it gates the neighbour-count validity and
 * the generated clue values, so it is logic, not display. */
export const BRICKS_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
];

// --- difficulty -------------------------------------------------------------

export const DIFF_EASY = 0;
export const DIFF_NORMAL = 1;
export const DIFF_TRICKY = 2;
export const DIFFCOUNT = 3;

/** Difficulty encode chars (upstream `bricks_diffchars`), index = tier. */
const DIFF_CHARS = "ent";

// --- types ------------------------------------------------------------------

export interface BricksParams {
  /** User-friendly width and height (the hexagon, not the backing array). */
  w: number;
  h: number;
  /** One of `DIFF_EASY`/`DIFF_NORMAL`/`DIFF_TRICKY`. */
  diff: number;
}

export interface BricksState {
  /** Backing array width, including the `F_BOUND` padding (`bricks_grid_size`). */
  w: number;
  h: number;
  /** User-friendly (playable) width — upstream `pw`, needed by textFormat. */
  pw: number;
  /** Packed cell field, row-major over the padded array. */
  grid: Uint16Array;
  completed: boolean;
  cheated: boolean;
}

/** A cell's play colour — upstream `A`/`B`/`C`. */
export type CellColour = "shade" | "unshade" | "empty";

/**
 * A move is either a *paint* — a batch of per-cell colour settings committed
 * together (one click, one keyboard place, or a whole drag; upstream's
 * `A%d;B%d;…` string) — or a *solve* — the full-board fill (upstream's `S`
 * string, one colour per padded cell; non-playable cells' entries ignored).
 */
export type BricksMove =
  | { kind: "paint"; cells: ReadonlyArray<{ index: number; to: CellColour }> }
  | { kind: "solve"; grid: ReadonlyArray<CellColour> };

export interface BricksUi {
  /** Keyboard cursor visible + position. */
  cursor: GridCursor;
  /** The colour the in-flight drag paints (`F_SHADE`/`F_UNSHADE`/`F_EMPTY`,
   * or 0 when no drag is active). */
  dragtype: number;
  /** Padded-cell indices accreted since the drag began; previewed by the
   * renderer and committed as one `paint` move on release. */
  drag: number[];
}

/** A cell currently violating a rule, with its localised error flags
 * (`FE_*`) — returned by findMistakes and reused by the render overlay. */
export interface BricksMistake {
  index: number;
  flags: number;
}

// --- colour <-> bits --------------------------------------------------------

export function colourBits(c: CellColour): number {
  return c === "shade" ? F_SHADE : c === "unshade" ? F_UNSHADE : F_EMPTY;
}

export function bitsColour(bits: number): CellColour {
  const c = bits & COL_MASK;
  return c === F_SHADE ? "shade" : c === F_UNSHADE ? "unshade" : "empty";
}

// --- hex geometry (design D2, upstream bricks_grid_size / apply_bounds) ------

/** The padded backing-array size for a hexagon of `params.w × params.h`. */
export function gridSize(p: BricksParams): { w: number; h: number } {
  return { w: p.w + (((p.h + 1) / 2) | 0) - 1, h: p.h };
}

/** Fill `grid` with `F_EMPTY`, then mask the two triangular corners to
 * `F_BOUND`, leaving the playable hexagon (upstream `bricks_apply_bounds`).
 * `w` is the padded width. Ported verbatim — it gates the codec cell count. */
export function applyBounds(w: number, h: number, grid: Uint16Array): void {
  grid.fill(F_EMPTY);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < ((y / 2) | 0); x++) {
      grid[y * w + (w - x - 1)] = F_BOUND;
    }
    const extra = (h | y) & 1 ? 0 : 1;
    for (let x = 0; x + extra < (((h - y) / 2) | 0); x++) {
      grid[y * w + x] = F_BOUND;
    }
  }
}

// --- params -----------------------------------------------------------------

/**
 * The hardest difficulty Bricks can actually generate.
 *
 * The tiers are lookahead depth: Easy assumes nothing, Normal assumes a cell
 * and looks for an Easy-level contradiction, Tricky lets that sub-solve recurse
 * in turn. **Depth 2 never pays.** Sampling 77 boards *chosen because Normal
 * cannot solve them* — the only region where Tricky could distinguish itself —
 * Tricky solved none, and 480 boards from a real stripping walk gave depth-1
 * and depth-2 identical verdicts throughout; 999 of 999 boards generated at
 * Tricky, and all four frozen C Tricky fixtures, fall to Normal. Bricks'
 * constraints (no three in a row, gravity support, clue counts) are local
 * enough that a contradiction either surfaces immediately or not at all, which
 * is why more lookahead buys nothing.
 *
 * The rung stays in the *solver* — hints and Solve use `DIFF_TRICKY` as "try as
 * hard as you can", where it costs nothing — but it is not a difficulty the
 * generator can honour, so it is not offered.
 */
export const MAX_GENERABLE_DIFF = DIFF_NORMAL;

const PRESETS: BricksParams[] = [
  { w: 7, h: 6, diff: DIFF_EASY },
  { w: 7, h: 6, diff: DIFF_NORMAL },
  { w: 10, h: 8, diff: DIFF_EASY },
  { w: 10, h: 8, diff: DIFF_NORMAL },
];

/**
 * The tiers a player can pick, and the **only** list of them
 * (`audit-guessing-tier-names` D11). Both the difficulty contract and the
 * custom-params dialog read this rather than repeating it — Unequal shipped a
 * menu and a dialog that disagreed for exactly that reason.
 *
 * Two names for three `DIFF_*` levels, deliberately:
 *
 * - Upstream's `Normal` is **`Unreasonable`** here. Its rung, `solverRecurse`,
 *   commits a cell by solving the rest of the board from a hypothesis — a
 *   search, not a technique a player can follow, and only a tier named
 *   `Unreasonable` may ship one.
 * - Upstream's `Tricky` has **no name at all**, because it has no boards. It is
 *   the same rung one level deeper, and `MAX_GENERABLE_DIFF` records the
 *   measurement that depth 2 never decides anything depth 1 has not. It was
 *   already refused at generation by `grade-difficulty-tiers-honestly`; what
 *   this drops is a dropdown entry that could only ever error. `DIFF_CHARS`
 *   still spells it, so a game ID or saved game carrying `dt` still loads and
 *   is still refused *with its reason* by {@link validateParams}.
 */
export const DIFF_NAMES = ["Easy", "Unreasonable"];

export function defaultParams(): BricksParams {
  return { ...PRESETS[0] };
}

export function presets(): PresetMenu<BricksParams> {
  return {
    title: "Bricks",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${DIFF_NAMES[p.diff]}`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: BricksParams, full: boolean): string {
  return full ? `${p.w}x${p.h}d${DIFF_CHARS[p.diff]}` : `${p.w}x${p.h}`;
}

/** atoi at `s[pos]`: parse a leading run of digits, 0 when there are none. */
function eatNum(s: string, pos: number): { value: number; next: number } {
  let next = pos;
  while (next < s.length && s[next] >= "0" && s[next] <= "9") next++;
  return { value: next > pos ? Number.parseInt(s.slice(pos, next), 10) : 0, next };
}

export function decodeParams(s: string): BricksParams {
  const p = defaultParams();
  let r = eatNum(s, 0);
  p.w = p.h = r.value;
  let pos = r.next;
  if (s[pos] === "x") {
    r = eatNum(s, pos + 1);
    p.h = r.value;
    pos = r.next;
  }
  if (s[pos] === "d") {
    pos++;
    // Upstream: an unknown/absent difficulty char leaves diff invalid so
    // validateParams rejects it; a recognised char selects the tier.
    p.diff = DIFFCOUNT + 1;
    if (pos < s.length) {
      const idx = DIFF_CHARS.indexOf(s[pos]);
      if (idx !== -1) p.diff = idx;
    }
  }
  return p;
}

export function validateParams(p: BricksParams, full: boolean): string | null {
  if (p.w < 2) return "Width must be at least 2";
  if (p.h < 2) return "Height must be at least 2";
  if (p.diff >= DIFFCOUNT) return "Unknown difficulty rating";
  // Upstream's third tier has no boards. Its rung is lookahead depth 2, which
  // never decides anything depth 1 has not already decided — see
  // `MAX_GENERABLE_DIFF` in `generator.ts` for the measurement. Upstream shipped
  // it anyway and admitted in its own documentation that Tricky "may generate a
  // puzzle at Normal difficulty instead"; it always does, so offering it is a
  // difficulty setting that silently gives you a different one
  // (`grade-difficulty-tiers-honestly`).
  //
  // Since `audit-guessing-tier-names` D11 it has no name either — `DIFF_NAMES`
  // stops at two — so this is the last place that still knows it exists, and it
  // has to keep working: `DIFF_CHARS` still spells `t`, so an old game ID or
  // saved game reaches here. Refused only for generation; loading such a game
  // works, because `full` is false there.
  if (full && p.diff > MAX_GENERABLE_DIFF) {
    return `Tricky has no puzzles distinct from ${DIFF_NAMES[MAX_GENERABLE_DIFF]}; use ${DIFF_NAMES.join(" or ")}`;
  }
  return null;
}

// --- desc codec (byte-match surface, upstream validate_desc / new_game) ------

const isDigit = (c: string | undefined): boolean =>
  c !== undefined && c >= "0" && c <= "9";

/**
 * Validate the run-length desc (upstream `validate_desc`): a digit run is a
 * clue on the current cell (rejected if > 7), a lowercase/uppercase letter
 * advances the playable-cell count by `(c - 'a'|'A') + 1`, anything else is
 * inert. The decoded count must equal exactly `params.w × params.h`.
 */
export function validateDesc(p: BricksParams, desc: string): string | null {
  const s = p.w * p.h;
  let i = 0;
  let pos = 0;
  while (i < desc.length) {
    const c = desc[i];
    if (isDigit(c)) {
      const n = eatNum(desc, i);
      if (n.value > 7) return "Number is out of range";
      i = n.next;
      pos++;
      continue;
    }
    if (c >= "a" && c <= "z") pos += c.charCodeAt(0) - 97 + 1;
    else if (c >= "A" && c <= "Z") pos += c.charCodeAt(0) - 65 + 1;
    i++;
  }
  if (pos < s) return "Not enough spaces";
  if (pos > s) return "Too many spaces";
  return null;
}

/** Decode a validated desc into a fresh state (upstream `new_game`). Walks
 * the padded grid, skipping `F_BOUND` cells, filling clue numbers and leaving
 * blank runs as `F_EMPTY`. */
export function newState(p: BricksParams, desc: string): BricksState {
  const { w, h } = gridSize(p);
  const grid = new Uint16Array(w * h);
  applyBounds(w, h, grid);

  let i = 0; // padded-grid index
  let j = 0; // blank-run cells still to skip
  let dp = 0; // desc position
  while (dp < desc.length) {
    if (grid[i] === F_BOUND) {
      i++;
      continue;
    }
    if (j > 0) {
      i++;
      j--;
      continue;
    }
    const c = desc[dp];
    if (isDigit(c)) {
      const n = eatNum(desc, dp);
      grid[i] = n.value;
      dp = n.next;
      j++; // defer the i-advance to the next iteration (matches C)
      continue;
    }
    if (c >= "a" && c <= "z") j += c.charCodeAt(0) - 97 + 1;
    dp++;
  }

  return { w, h, pw: p.w, grid, completed: false, cheated: false };
}

/**
 * Encode a generated board as a desc — the exact inverse of {@link newState}
 * and byte-for-byte upstream `new_game_desc`'s encode tail: a clue cell (bare
 * value 0..7) becomes its decimal digits, with `_` separating two adjacent
 * clues; any playable non-clue cell (`COL_MASK` set: shade / unshade / empty)
 * contributes to a run-length lowercase blank run (chaining `z` past 26);
 * `F_BOUND` padding contributes nothing. `w` is the padded width.
 */
export function encodeDesc(grid: Uint16Array, w: number, h: number): string {
  const s = w * h;
  let out = "";
  let run = 0;
  let inNumberRun = false;
  for (let i = 0; i <= s; i++) {
    const n = i === s ? 0 : grid[i];
    // Flush a pending blank run before a clue or at end.
    if (run > 0 && (i === s || !(n & COL_MASK))) {
      while (run >= 26) {
        out += "z";
        run -= 26;
      }
      if (run) out += String.fromCharCode(97 + run - 1);
      run = 0;
    }
    if (i === s) break;
    if (n <= 7) {
      // A clue (numbers are 0..7; F_BOUND is 8, colours are >= 0x10).
      if (inNumberRun) out += "_";
      out += String(n);
      inNumberRun = true;
    } else if (n & COL_MASK) {
      inNumberRun = false;
      run++;
    }
    // else F_BOUND: contributes nothing, leaves the run type unchanged.
  }
  return out;
}

export function cloneState(s: BricksState): BricksState {
  return { ...s, grid: s.grid.slice() };
}

export function status(s: BricksState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- text format (upstream game_text_format) --------------------------------

/** The sheared-hex board as ASCII (`#` shade, `-` unshade, `.` empty, digit
 * clue, `?` unknown), one cell per two columns, odd rows indented — upstream
 * `game_text_format`. */
export function textFormat(state: BricksState): string {
  const sw = state.w;
  const h = state.h;
  const w = state.pw + 1;
  const buf = new Array<string>(w * 2 * h).fill(" ");
  for (let y = 1; y <= h; y++) buf[w * 2 * y - 1] = "\n";

  for (let y = 0; y < h; y++) {
    let p = w * 2 * y;
    if (y & 1) p++;
    for (let x = 0; x < sw; x++) {
      const n = state.grid[y * sw + x] & ~0x7c0; // strip ERROR_MASK
      if (n === F_BOUND) continue;
      if (n === F_SHADE) buf[p] = "#";
      else if (n === F_UNSHADE) buf[p] = "-";
      else if (n === F_EMPTY) buf[p] = ".";
      else if (n === 7) buf[p] = "?";
      else if (n >= 0 && n <= 6) buf[p] = String(n);
      p += 2;
    }
  }
  return buf.join("");
}
