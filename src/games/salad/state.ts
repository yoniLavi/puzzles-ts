/**
 * Salad — params, immutable state, the description codec and the move/UI types.
 *
 * Salad (© 2013 Lennard Sprong, `puzzles/unreleased/salad.c`) is a
 * **pseudo-Latin-square** puzzle: place each of `nums` symbols exactly once in
 * every row and column of an `order × order` grid, leaving the other
 * `order − nums` squares in each line empty. Two game modes share one
 * implementation:
 *
 * - **ABC End View** ({@link GAMEMODE_LETTERS}) — clues sit outside the grid,
 *   each naming the first symbol seen looking inward along that row/column.
 * - **Number Ball** ({@link GAMEMODE_NUMBERS}) — clues sit *inside* the grid: a
 *   **ball** (circle) marks a square that must hold a number, a **cross** marks
 *   one that must stay empty.
 *
 * **The `'X'`/`'O'` sentinels keep their character codes**, exactly as upstream
 * stores them, because one `digit` array holds both the symbols (`1..nums`, and
 * `nums ≤ 9` is enforced by `validateParams`) and the two markers — and the
 * run-length desc codec is written against that mixed alphabet. Naming them
 * ({@link CROSS} / {@link CIRCLE}) is the whole idiomatic gain available here;
 * re-encoding them would buy nothing and make the codec harder to audit.
 */

import type { NoteEncoding } from "../../engine/candidate-hint.ts";
import { type RowColRegion, rowColRegions } from "../../engine/latin-hint.ts";
import { parseLeadingInt } from "../../engine/params.ts";

// --- difficulty ------------------------------------------------------------

/** Upstream `DIFF_EASY`, shown as **Normal**. */
export const DIFF_EASY = 0;
/** Upstream `DIFF_HARD`, shown as **Extreme**. */
export const DIFF_HARD = 1;
export const DIFFCOUNT = 2;

export const DIFF_NAMES: readonly string[] = ["Normal", "Extreme"];
/** The difficulty letters `encodeParams` writes and `decodeParams` reads. */
const DIFF_CHARS = "ex";

/**
 * The pseudo-tier the Number Ball generator's quality check runs at: iterate
 * *only* the hole deductions (sync + count) and ask whether every hole can be
 * placed without entering a single number. A puzzle that passes is thrown away
 * as too easy. Upstream spells it `DIFF_EASY - 1`.
 */
export const DIFF_HOLESONLY = DIFF_EASY - 1;

// --- game mode -------------------------------------------------------------

export const GAMEMODE_LETTERS = 0;
export const GAMEMODE_NUMBERS = 1;

// --- cell sentinels --------------------------------------------------------

/** `LATINH_CROSS`: this square definitely holds no symbol. Upstream's `'X'`. */
export const CROSS = 88;
/** `LATINH_CIRCLE`: this square definitely holds a symbol. Upstream's `'O'`. */
export const CIRCLE = 79;

// --- params ----------------------------------------------------------------

export interface SaladParams {
  /** Grid side length. */
  order: number;
  /** How many distinct symbols appear in each row and column. */
  nums: number;
  /** {@link GAMEMODE_LETTERS} or {@link GAMEMODE_NUMBERS}. */
  mode: number;
  /** {@link DIFF_EASY} or {@link DIFF_HARD}. */
  diff: number;
}

export const PRESETS: readonly SaladParams[] = [
  { order: 4, nums: 3, mode: GAMEMODE_LETTERS, diff: DIFF_EASY },
  { order: 5, nums: 3, mode: GAMEMODE_LETTERS, diff: DIFF_EASY },
  { order: 5, nums: 3, mode: GAMEMODE_NUMBERS, diff: DIFF_EASY },
  { order: 5, nums: 4, mode: GAMEMODE_LETTERS, diff: DIFF_EASY },
  { order: 6, nums: 3, mode: GAMEMODE_NUMBERS, diff: DIFF_EASY },
  { order: 6, nums: 4, mode: GAMEMODE_LETTERS, diff: DIFF_EASY },
  { order: 6, nums: 4, mode: GAMEMODE_NUMBERS, diff: DIFF_EASY },
  { order: 7, nums: 4, mode: GAMEMODE_LETTERS, diff: DIFF_EASY },
  { order: 7, nums: 4, mode: GAMEMODE_NUMBERS, diff: DIFF_EASY },
  { order: 8, nums: 5, mode: GAMEMODE_LETTERS, diff: DIFF_EASY },
  { order: 8, nums: 5, mode: GAMEMODE_NUMBERS, diff: DIFF_EASY },
];

export function defaultParams(): SaladParams {
  return { ...PRESETS[0] };
}

/** The `A~C` / `1~3` symbol range a preset label and the status bar show. */
export function symbolRange(p: SaladParams): string {
  return p.mode === GAMEMODE_LETTERS
    ? `A~${String.fromCharCode(64 + p.nums)}`
    : `1~${p.nums}`;
}

export function presetLabel(p: SaladParams): string {
  const kind = p.mode === GAMEMODE_LETTERS ? "Letters" : "Numbers";
  return `${kind}: ${p.order}x${p.order} ${symbolRange(p)}`;
}

export function encodeParams(p: SaladParams, full: boolean): string {
  let s = `${p.order}n${p.nums}${p.mode === GAMEMODE_LETTERS ? "L" : "B"}`;
  if (full) s += `d${DIFF_CHARS[p.diff]}`;
  return s;
}

export function decodeParams(s: string): SaladParams {
  const p = defaultParams();

  const order = parseLeadingInt(s, 0);
  p.order = order.value;
  let i = order.next;

  if (s[i] === "n") {
    const nums = parseLeadingInt(s, i + 1);
    p.nums = nums.value;
    i = nums.next;
  }

  if (s[i] === "B") {
    p.mode = GAMEMODE_NUMBERS;
    i++;
  } else if (s[i] === "L") {
    p.mode = GAMEMODE_LETTERS;
    i++;
  }

  if (s[i] === "d") {
    i++;
    // Upstream parks an out-of-range value here so an unknown letter is
    // rejected by validateParams rather than silently defaulted.
    p.diff = DIFFCOUNT + 1;
    if (i < s.length) {
      const found = DIFF_CHARS.indexOf(s[i]);
      if (found >= 0) p.diff = found;
      i++;
    }
  }

  return p;
}

export function validateParams(p: SaladParams, _full: boolean): string | null {
  if (p.nums < 2) return "Symbols must be at least 2.";
  if (p.nums >= p.order) return "Symbols must be lower than the size.";
  if (p.order < 3) return "Size must be at least 3.";
  if (p.nums > 9) return "Symbols must be no more than 9.";
  if (p.diff >= DIFFCOUNT) return "Unknown difficulty rating";
  return null;
}

// --- state -----------------------------------------------------------------

/**
 * The mutable board the solver and generator work on — exactly the part of
 * `game_state` they touch. {@link SaladState} satisfies it structurally, so a
 * cloned state can be handed straight to the solver.
 *
 * `grid` holds the working symbols in the *order-`o`* alphabet while the solver
 * runs: the pseudo-Latin trick (see `solver.ts`) makes symbols above `nums`
 * mean "hole", so a solved `grid` cell may exceed `nums` and `holes` is what
 * says which. Player entries are always `1..nums`.
 */
export interface SaladBoard {
  readonly order: number;
  readonly nums: number;
  readonly mode: number;
  /** `order*4` border clues (0 = none): top row, left column, bottom, right. */
  readonly borderclues: Uint8Array;
  /** `order²` fixed clues: a symbol `1..nums`, {@link CROSS}, {@link CIRCLE}, or 0. */
  readonly gridclues: Uint8Array;
  /** `order²` working symbols (0 = blank). */
  readonly grid: Uint8Array;
  /** `order²` confirmed markers: 0, {@link CROSS} or {@link CIRCLE}. */
  readonly holes: Uint8Array;
}

export interface SaladState extends SaladBoard {
  readonly diff: number;
  /** `order²` pencil-mark bitmaps: bit `n−1` = symbol `n`, bit `nums` = the
   * "might be empty" X mark. */
  readonly marks: Int32Array;
  completed: boolean;
  cheated: boolean;
}

export function cloneState(s: SaladState): SaladState {
  return {
    order: s.order,
    nums: s.nums,
    mode: s.mode,
    diff: s.diff,
    borderclues: s.borderclues, // fixed, shared by reference
    gridclues: s.gridclues, // fixed, shared by reference
    grid: s.grid.slice(),
    holes: s.holes.slice(),
    marks: s.marks.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

/** A blank working board over the same fixed clues — upstream's
 * `memset(grid, 0); memset(holes, 0)` before each solver-gated attempt. */
export function scratchBoard(b: SaladBoard): SaladBoard {
  const o2 = b.order * b.order;
  return {
    order: b.order,
    nums: b.nums,
    mode: b.mode,
    borderclues: b.borderclues,
    gridclues: b.gridclues,
    grid: new Uint8Array(o2),
    holes: new Uint8Array(o2),
  };
}

// --- moves -----------------------------------------------------------------

/**
 * What a `set` / `pencil` move writes. A `number` is a symbol `1..nums`; the
 * three string tags are upstream's `'X'` / `'O'` / `'-'` move characters.
 */
export type SaladEntry = number | "cross" | "circle" | "clear";

/** One pencil mark a {@link SaladMove} strike clears: candidate `n` at
 * `(x, y)`, where `n` in `1..nums` is a symbol and `n === nums + 1` is the
 * "might be empty" X mark — so one formula, `1 << (n − 1)`, covers both. */
export interface SaladMark {
  x: number;
  y: number;
  n: number;
}

export type SaladMove =
  /** Upstream `R x,y,c` — a real entry (symbol, cross, circle or clear). */
  | { type: "set"; x: number; y: number; value: SaladEntry }
  /** Upstream `P x,y,c` — a pencil mark. `"circle"` is upstream's oddity: it
   * toggles the *real* circle marker without emptying the square. */
  | { type: "pencil"; x: number; y: number; value: SaladEntry }
  /** Fork addition, for the hint (docs/games/hints.md § "Persist, populate, and the moves"): clear a list of pencil
   * marks atomically. The per-square `pencil` move is a *toggle*, so a
   * re-applied strike would put the mark back; this one only ever removes, which
   * makes one deduction forcing several strikes a single idempotent,
   * resume-safe step. Additive to the union, so saved move logs replay
   * unchanged. */
  | { type: "pencilStrike"; marks: SaladMark[] }
  /** Pencil in the candidates of every square that carries **no** mark yet,
   * leaving the player's own narrowed notes alone — the collection-wide
   * `pencilAll` (the fill half of the adaptive Mark-all press, and the hint's
   * opener).
   *
   * Deliberately *not* upstream's resetting `markAll` below, and that is the
   * whole point: resetting every square to the full candidate set silently threw
   * away deductions the player had already pencilled (owner-reported
   * 2026-07-29, on the hint's opener and then on the Mark-all button itself).
   * Additive, so it is idempotent and resume-safe. */
  | { type: "pencilAll" }
  /** Upstream `M` — fill every empty square with all its candidate marks,
   * *resetting* any the player had narrowed.
   *
   * **Legacy replay only.** No input emits it any more (the Mark-all button and
   * the `M` key go through the adaptive, additive path above), but a saved move
   * log recorded before that change replays through here, so its behaviour must
   * not drift. */
  | { type: "markAll" }
  /** Upstream `S…` — the solved board, one entry per cell (0 = a hole). */
  | { type: "solve"; cells: number[] };

// --- the note representation ------------------------------------------------
//
// One definition of "how Salad's pencil marks are encoded", shared by the play
// path (the adaptive Mark-all press in `index.ts`) and the hint (`hint.ts`), so
// the two can never disagree about which bit is which candidate.

/**
 * Salad's projection onto the shared candidate helpers: candidate `n` sits at
 * bit `n − 1`, and the alphabet is `nums` symbols plus the "might be empty" X
 * mark at bit `nums` — **shorter than the grid order**, which is why the value
 * count has to be stated separately from the stride.
 */
export function saladNotes(nums: number): NoteEncoding {
  return { bit: (n) => 1 << (n - 1), values: nums + 1 };
}

/** A square's uniqueness regions: its row and its column, and nothing else
 * (Salad has no blocks). */
export function saladRegions(o: number): (x: number, y: number) => RowColRegion[] {
  return (x, y) => rowColRegions(x, y, o);
}

/**
 * Is there a square the player could pencil into that carries no mark yet? The
 * fill half of the adaptive Mark-all press, and the hint's populate latch.
 *
 * Note this is **not** the shared `anyEmptyLacksNotes`: a square marked
 * definitely-empty is blank *and* legitimately holds no notes for ever, so that
 * predicate would report "needs filling" on a finished board.
 */
export function needsPencilFill(b: {
  order: number;
  grid: Uint8Array;
  holes: Uint8Array;
  marks: Int32Array;
}): boolean {
  for (let i = 0; i < b.order * b.order; i++) {
    if (b.grid[i] === 0 && b.holes[i] !== CROSS && b.marks[i] === 0) return true;
  }
  return false;
}

// --- ui --------------------------------------------------------------------

export interface SaladUi {
  hx: number;
  hy: number;
  hpencil: boolean;
  hshow: boolean;
  hcursor: boolean;
  /** Preference (default on, fork divergence): right-click toggles a *sticky*
   * pencil mode — once on, left-clicks keep entering pencil marks until
   * right-clicked again (mobile-style), instead of every left-click reverting
   * to real entry. Off ⇒ exactly upstream's per-click mode. */
  pencilSticky: boolean;
}

export function newUi(_state: SaladState): SaladUi {
  return {
    hx: 0,
    hy: 0,
    hpencil: false,
    hshow: false,
    hcursor: false,
    pencilSticky: true,
  };
}

// --- desc codec ------------------------------------------------------------

/**
 * Upstream `salad_serialize`: a run of `k` blank entries becomes one lowercase
 * letter (`'a' - 1 + k`, flushed at 26 per run), a cross `X`, a circle `O`, and
 * a symbol `v` the character `v + base`. `base` is `'A' - 1` for border clues
 * (and for a letters-mode grid) and `'0'` for a Number Ball grid.
 */
export function serialize(input: Uint8Array, base: number): string {
  let out = "";
  let run = 0;
  for (let i = 0; i < input.length; i++) {
    const v = input[i];
    if (v !== 0) {
      if (run) {
        out += String.fromCharCode(96 + run);
        run = 0;
      }
      if (v === CROSS) out += "X";
      else if (v === CIRCLE) out += "O";
      else out += String.fromCharCode(v + base);
    } else {
      if (run === 26) {
        out += String.fromCharCode(96 + run);
        run = 0;
      }
      run++;
    }
  }
  if (run) out += String.fromCharCode(96 + run);
  return out;
}

interface Decoded {
  borderclues: Uint8Array;
  gridclues: Uint8Array;
  grid: Uint8Array;
  holes: Uint8Array;
}

/**
 * Upstream `load_game`: decode `desc` into the four fixed arrays, or report the
 * failure message `validate_desc` surfaces. A letters description is
 * `<border>,<grid>`; a numbers description is `<grid>` alone.
 */
function loadGame(
  p: SaladParams,
  desc: string,
): { ok: true; value: Decoded } | { ok: false; error: string } {
  const o = p.order;
  const nums = p.nums;
  const o2 = o * o;
  const ox4 = o * 4;

  const borderclues = new Uint8Array(ox4);
  const gridclues = new Uint8Array(o2);
  const grid = new Uint8Array(o2);
  const holes = new Uint8Array(o2);

  let i = 0;
  let pos = 0;

  if (p.mode === GAMEMODE_LETTERS) {
    while (i < desc.length && desc[i] !== ",") {
      const c = desc.charCodeAt(i++);
      let d = 0;
      if (pos >= ox4) return { ok: false, error: "Border description is too long." };

      if (c >= 97 && c <= 122)
        pos += c - 97 + 1; // 'a'..'z': a run of blank clues
      else if (c >= 49 && c <= 57)
        d = c - 48; // '1'..'9'
      else if (c >= 65 && c <= 73)
        d = c - 65 + 1; // 'A'..'I'
      else
        return { ok: false, error: "Border description contains invalid characters." };

      if (d > 0 && d <= nums) borderclues[pos++] = d;
      else if (d > nums) return { ok: false, error: "Border clue is out of range." };
    }

    if (pos < ox4) return { ok: false, error: "Description is too short." };
    if (desc[i] === ",") i++;
  }

  pos = 0;
  while (i < desc.length) {
    const c = desc.charCodeAt(i++);
    let d = 0;
    if (pos >= o2) return { ok: false, error: "Grid description is too long." };

    if (c >= 97 && c <= 122) {
      pos += c - 97 + 1;
    } else if (c >= 49 && c <= 57) {
      d = c - 48;
    } else if (c >= 65 && c <= 73) {
      d = c - 65 + 1;
    } else if (c === CIRCLE) {
      gridclues[pos] = CIRCLE;
      holes[pos] = CIRCLE;
      pos++;
    } else if (c === CROSS) {
      gridclues[pos] = CROSS;
      holes[pos] = CROSS;
      pos++;
    } else {
      return { ok: false, error: "Grid description contains invalid characters." };
    }

    if (d > 0 && d <= nums) {
      gridclues[pos] = d;
      grid[pos] = d;
      holes[pos] = CIRCLE;
      pos++;
    } else if (d > nums) {
      return { ok: false, error: "Grid clue is out of range." };
    }
  }

  // Upstream accepts an *empty* grid section (`pos > 0 &&`): a letters puzzle
  // whose clues all sit on the border still writes a run of blanks, but a
  // zero-length section is legal too.
  if (pos > 0 && pos < o2) return { ok: false, error: "Description is too short." };

  return { ok: true, value: { borderclues, gridclues, grid, holes } };
}

export function validateDesc(p: SaladParams, desc: string): string | null {
  const r = loadGame(p, desc);
  return r.ok ? null : r.error;
}

export function newState(p: SaladParams, desc: string): SaladState {
  const r = loadGame(p, desc);
  if (!r.ok) throw new Error(`salad: ${r.error}`);
  return {
    order: p.order,
    nums: p.nums,
    mode: p.mode,
    diff: p.diff,
    ...r.value,
    marks: new Int32Array(p.order * p.order),
    completed: false,
    cheated: false,
  };
}

// --- completion ------------------------------------------------------------

/**
 * Upstream `latinholes_check`: every line holds exactly `order − nums` blanks
 * and each symbol exactly once, and no square marked definitely-filled is still
 * blank.
 */
export function latinholesCheck(b: SaladBoard): boolean {
  const o = b.order;
  const nums = b.nums;
  const rows = new Int32Array(o * nums);
  const cols = new Int32Array(o * nums);
  const hrows = new Int32Array(o);
  const hcols = new Int32Array(o);
  let fail = false;

  for (let x = 0; x < o; x++) {
    for (let y = 0; y < o; y++) {
      const d = b.grid[y * o + x];
      if (d === 0 || d > nums) {
        hrows[y]++;
        hcols[x]++;
      } else {
        rows[y * nums + d - 1]++;
        cols[x * nums + d - 1]++;
      }
      if (d === 0 && b.holes[y * o + x] === CIRCLE) fail = true;
    }
  }

  for (let i = 0; i < o; i++) {
    if (hrows[i] !== o - nums || hcols[i] !== o - nums) fail = true;
  }
  for (let i = 0; i < o * nums; i++) {
    if (rows[i] !== 1 || cols[i] !== 1) fail = true;
  }

  return !fail;
}

/**
 * Upstream `salad_scan_dir`: the first symbol met walking `si → ei` in steps of
 * `di`. With `direct` set the scan gives up (returns 0) at the first square
 * that is neither filled nor a known cross — i.e. "we cannot tell yet".
 */
export function scanDir(
  grid: Uint8Array,
  holes: Uint8Array | null,
  si: number,
  di: number,
  ei: number,
  direct: boolean,
): number {
  for (let i = si; i !== ei; i += di) {
    if (direct && grid[i] === 0 && holes?.[i] !== CROSS) return 0;
    if (grid[i] !== 0 && grid[i] !== CROSS) return grid[i];
  }
  return 0;
}

/**
 * The four `(start, step, end)` scans of border-clue line `i`, in upstream's
 * clue order: top, left, bottom, right. Shared by the solver, the generator,
 * the live error check and the completion test, so a scan can never drift
 * between them.
 */
export function borderScans(
  i: number,
  o: number,
): { start: number; step: number; end: number; clue: number }[] {
  const o2 = o * o;
  return [
    { start: i, step: o, end: o2 + i, clue: i },
    { start: i * o, step: 1, end: (i + 1) * o, clue: i + o },
    { start: o2 - o + i, step: -o, end: i - o, clue: i + o * 2 },
    { start: (i + 1) * o - 1, step: -1, end: i * o - 1, clue: i + o * 3 },
  ];
}

/** The single scan belonging to border clue `cd` — the inverse of the clue
 * numbering {@link borderScans} lays out (`cd % o` names the line, `cd / o` the
 * side, in the top / left / bottom / right order the clue array uses). The hint
 * reads its line of sight through this rather than re-deriving the geometry. */
export function borderScanFor(
  cd: number,
  o: number,
): { start: number; step: number; end: number; clue: number } {
  return borderScans(cd % o, o)[(cd / o) | 0];
}

/** Which side of the board clue `cd` sits on, and therefore which kind of line
 * it looks along. */
export function clueSide(
  cd: number,
  o: number,
): { side: "top" | "left" | "bottom" | "right"; axis: "row" | "column" } {
  switch ((cd / o) | 0) {
    case 0:
      return { side: "top", axis: "column" };
    case 1:
      return { side: "left", axis: "row" };
    case 2:
      return { side: "bottom", axis: "column" };
    default:
      return { side: "right", axis: "row" };
  }
}

/** Upstream `salad_checkborders`: every border clue matches the first symbol
 * actually seen along its line. */
export function checkBorders(b: SaladBoard): boolean {
  const o = b.order;
  for (let i = 0; i < o; i++) {
    for (const s of borderScans(i, o)) {
      const clue = b.borderclues[s.clue];
      if (!clue) continue;
      if (scanDir(b.grid, null, s.start, s.step, s.end, false) !== clue) return false;
    }
  }
  return true;
}

export function isComplete(b: SaladBoard): boolean {
  return latinholesCheck(b) && checkBorders(b);
}

// --- text format -----------------------------------------------------------

/** Upstream `game_text_format`: the board inside an ASCII box, with the four
 * rims of border clues outside it. */
export function textFormat(s: SaladState): string {
  const o = s.order;
  const lr = 8 + o * 2; // upstream's line length, including the newline
  const rows: string[][] = [];
  for (let i = 0; i < o + 4; i++) rows.push(new Array<string>(lr - 1).fill(" "));

  const put = (row: number, col: number, ch: string): void => {
    if (row >= 0 && row < rows.length && col >= 0 && col < lr - 1) rows[row][col] = ch;
  };

  // Corners and the box.
  put(1, 2, "+");
  put(1, lr - 4, "+");
  put(o + 2, 2, "+");
  put(o + 2, lr - 4, "+");
  for (let i = 3; i < lr - 4; i++) {
    put(1, i, "-");
    put(o + 2, i, "-");
  }
  for (let i = 2; i < 2 + o; i++) {
    put(i, 2, "|");
    put(i, o * 2 + 4, "|");
  }

  // Grid contents.
  const base = s.mode === GAMEMODE_LETTERS ? 64 : 48;
  for (let i = 0; i < o; i++) {
    for (let j = 0; j < o; j++) {
      const d = s.grid[i * o + j];
      const hole = s.holes[i * o + j];
      let c: string;
      if (hole === CROSS) c = "x";
      else if (!d) c = hole === CIRCLE ? "O" : ".";
      else c = String.fromCharCode(base + d);
      put(i + 2, 2 * j + 4, c);
    }
  }

  // Border clues (always letters, as upstream prints them).
  const letter = (v: number): string => String.fromCharCode(64 + v);
  for (let i = 0; i < o; i++) {
    if (s.borderclues[i]) put(0, i * 2 + 4, letter(s.borderclues[i]));
    if (s.borderclues[i + o]) put(i + 2, 0, letter(s.borderclues[i + o]));
    if (s.borderclues[i + o * 2])
      put(o + 3, i * 2 + 4, letter(s.borderclues[i + o * 2]));
    if (s.borderclues[i + o * 3]) put(i + 2, lr - 2, letter(s.borderclues[i + o * 3]));
  }

  return `${rows.map((r) => r.join("")).join("\n")}\n`;
}
