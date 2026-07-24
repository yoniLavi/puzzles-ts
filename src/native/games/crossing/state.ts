/**
 * Types, codec and pure board logic for Crossing — the state parts of
 * `unreleased/crossing.c` (Lennard Sprong, 2013).
 *
 * Crossing is *Nansuke* (Number Skeleton), a Nikoli number-crossword: a walled
 * grid plus a list of multi-digit numbers, and every open cell takes a digit
 * `1`–`9` so that each listed number appears **exactly once** when the grid's
 * maximal horizontal and vertical runs (length ≥ 2) are read left-to-right /
 * top-to-bottom.
 *
 * The port's central shape: the *puzzle* (walls, the sorted number list, and
 * the runs derived from the walls) never changes after `newState`, so every
 * cloned state aliases one frozen {@link CrossingPuzzle} by reference and a
 * move copies only `grid` + `marks` (the §3.1 shared-frozen pattern —
 * `Object.freeze` throws on a populated typed array, so `readonly` is the
 * whole guarantee).
 *
 * Two upstream behaviours are deliberately preserved rather than "improved";
 * both are flagged at their sites below: the desc decoder's hard-coded
 * `maxrow = 9`, and the `done[]` array in {@link validateBoard} that is sized
 * by number count but re-scanned by run count.
 */

import { parseLeadingInt } from "../../engine/params.ts";

// --- params ----------------------------------------------------------------

export interface CrossingParams {
  w: number;
  h: number;
  /** Grow the walls 180°-rotationally symmetrically. */
  sym: boolean;
}

export const crossingPresets: readonly CrossingParams[] = [
  { w: 5, h: 5, sym: false },
  { w: 7, h: 7, sym: false },
  { w: 9, h: 9, sym: false },
];

export function defaultParams(): CrossingParams {
  return { ...crossingPresets[0] };
}

export function encodeParams(p: CrossingParams, full: boolean): string {
  return `${p.w}x${p.h}${full && p.sym ? "S" : ""}`;
}

export function decodeParams(s: string): CrossingParams {
  const p = defaultParams();
  p.sym = false;
  const wParse = parseLeadingInt(s, 0);
  p.w = wParse.value;
  let i = wParse.next;
  if (s[i] === "x") {
    const hParse = parseLeadingInt(s, i + 1);
    p.h = hParse.value;
    i = hParse.next;
  } else {
    p.h = p.w;
  }
  if (s[i] === "S") p.sym = true;
  return p;
}

/** Upstream `validate_params`, in its exact order: both dimensions ≥ 2, and at
 * least one of them ≥ 4 (a 3×3 board has no room for crossing runs). */
export function validateParams(p: CrossingParams, _full: boolean): string | null {
  if (p.w < 4 && p.h < 4) return "The width or height must be at least 4";
  if (p.w < 2) return "Width must be at least 2";
  if (p.h < 2) return "Height must be at least 2";
  return null;
}

// --- runs ------------------------------------------------------------------

/** A maximal horizontal or vertical strip of ≥ 2 open cells — the slots the
 * listed numbers are placed into. */
export interface CrossingRun {
  /** `y` for a horizontal run, `x` for a vertical one. */
  readonly row: number;
  /** `x` for a horizontal run, `y` for a vertical one. */
  readonly start: number;
  readonly horizontal: boolean;
  /** Cell indices in reading order (left→right / top→bottom). Upstream carries
   * a `len` and re-derives the start/stride with `crossing_iterate`; holding
   * the indices makes every consumer a plain `for…of`. */
  readonly cells: readonly number[];
}

/**
 * Upstream `crossing_collect_runs`: all horizontal runs (top-to-bottom, each
 * left-to-right) followed by all vertical runs (left-to-right, each
 * top-to-bottom). A run needs **two** consecutive open cells to start, so an
 * isolated 1×1 open cell belongs to no run at all — upstream's own generator
 * TODO admits those boards exist.
 *
 * The emission order is part of the byte-match surface: the generator reads one
 * number out of each run in this order before sorting.
 */
export function collectRuns(w: number, h: number, walls: Uint8Array): CrossingRun[] {
  const runs: CrossingRun[] = [];

  const scan = (horizontal: boolean): void => {
    const outer = horizontal ? h : w;
    const inner = horizontal ? w : h;
    const index = (a: number, b: number): number =>
      horizontal ? a * w + b : b * w + a;
    for (let a = 0; a < outer; a++) {
      let cells: number[] | null = null;
      for (let b = 0; b < inner; b++) {
        const i = index(a, b);
        if (walls[i]) {
          if (cells) {
            runs.push({ row: a, start: b - cells.length, horizontal, cells });
            cells = null;
          }
          continue;
        }
        // Only start a run where a second open cell follows it.
        if (!cells) {
          if (b === inner - 1 || walls[index(a, b + 1)]) continue;
          cells = [];
        }
        cells.push(i);
      }
      if (cells) runs.push({ row: a, start: inner - cells.length, horizontal, cells });
    }
  };

  scan(true);
  scan(false);
  return runs;
}

// --- puzzle ----------------------------------------------------------------

/** The immutable puzzle every state of one game shares by reference. */
export interface CrossingPuzzle {
  readonly w: number;
  readonly h: number;
  /** `w·h` flags, 1 = wall (an unplayable black cell). */
  readonly walls: Uint8Array;
  /** The clue numbers as digit strings, sorted by (length, then
   * lexicographically) — upstream `cmp_numbers`. The order is byte-match
   * surface: it is the order the desc emits and the solver walks. */
  readonly numbers: readonly string[];
  /** Runs derived from `walls` once (upstream recomputes them per solver, per
   * ui and per validate call). */
  readonly runs: readonly CrossingRun[];
}

/** Upstream `cmp_numbers`: shorter first, then lexicographic (which, for equal
 * lengths of digits, is numeric order). */
export function compareNumbers(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function makePuzzle(
  w: number,
  h: number,
  walls: Uint8Array,
  numbers: readonly string[],
): CrossingPuzzle {
  return { w, h, walls, numbers, runs: collectRuns(w, h, walls) };
}

// --- desc codec ------------------------------------------------------------

/**
 * The longest number the format admits. Upstream hard-codes this instead of
 * scanning the grid for its longest run (`// TODO actually scan area for
 * longest row`), which makes its `INVALID_MAXROW` branch unreachable — kept
 * as-is so a reader doesn't "restore" a check that was never there.
 */
export const MAX_NUMBER_LENGTH = 9;

/** The verdicts upstream's `crossing_read_desc` can return. */
export type DescVerdict =
  | "valid"
  | "invalid-wall"
  | "too-long"
  | "duplicate"
  | "number";

const isDigit = (c: string | undefined): boolean =>
  c !== undefined && c >= "0" && c <= "9";

/**
 * Decode `<walls>,<num>,<num>,…`.
 *
 * The wall section is a run-length encoding in which a **decimal number** is a
 * run of that many *open* cells and a **letter** `a`–`z` a run of `1`–`26`
 * *wall* cells; the two kinds alternate over the row-major cell order. The
 * number list is the clue numbers as decimal digits, comma-separated, and is
 * stored sorted (see {@link compareNumbers}).
 *
 * Deliberately as lenient as upstream, whose own TODO list names the checks it
 * omits: a *too short* description and invalid digit characters (e.g. `0`) are
 * **not** rejected. Numbers shorter than two digits are silently dropped.
 */
export function readDesc(
  p: CrossingParams,
  desc: string,
): { walls: Uint8Array; numbers: string[]; verdict: DescVerdict } {
  const { w, h } = p;
  const walls = new Uint8Array(w * h);
  let verdict: DescVerdict = "valid";

  // `wallRun` counts pending wall cells (from a letter), `openRun` pending open
  // cells (from a decimal).
  let wallRun = 0;
  let openRun = 0;
  let at = 0;
  for (let i = 0; i < w * h; i++) {
    if (wallRun === 0 && openRun === 0) {
      const c = desc[at];
      if (isDigit(c)) {
        const parsed = parseLeadingInt(desc, at);
        openRun = parsed.value;
        at = parsed.next;
      } else if (c !== undefined && c >= "a" && c <= "z") {
        wallRun = c.charCodeAt(0) - 96; // 'a' = 1 … 'z' = 26
        at++;
      } else {
        verdict = "invalid-wall";
      }
    }
    if (wallRun > 0) {
      walls[i] = 1;
      wallRun--;
    } else if (openRun > 0) {
      openRun--;
    }
  }

  // More cell data than the board holds (this also swallows the unparseable
  // character above, which leaves the cursor parked).
  if (desc[at] !== ",") return { walls, numbers: [], verdict: "too-long" };
  at++;

  const numbers: string[] = [];
  let end = at;
  while (at < desc.length) {
    while (isDigit(desc[end])) end++;
    end++; // step over the ',' (or, on the last number, the terminator)
    const len = end - (at + 1);
    if (len > MAX_NUMBER_LENGTH) verdict = "number";
    if (len >= 2) numbers.push(desc.slice(at, at + len));
    at = end;
  }

  numbers.sort(compareNumbers);
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] === numbers[i + 1]) verdict = "duplicate";
  }

  return { walls, numbers, verdict };
}

export function validateDesc(p: CrossingParams, desc: string): string | null {
  switch (readDesc(p, desc).verdict) {
    case "invalid-wall":
      return "Block description contains invalid character";
    case "too-long":
      return "Block description is too long";
    case "duplicate":
      return "Duplicate numbers are not supported";
    case "number":
      return "One of the numbers is too long";
    default:
      return null;
  }
}

/** The exact inverse of {@link readDesc}'s wall section plus the `,`-joined
 * number list — upstream's `new_game_desc` tail. */
export function encodeDesc(
  w: number,
  h: number,
  walls: Uint8Array,
  numbers: readonly string[],
): string {
  let out = "";
  let wallRun = 0;
  let openRun = 0;
  for (let i = 0; i < w * h; i++) {
    if (walls[i] && openRun > 0) {
      out += String(openRun);
      openRun = 0;
    } else if (!walls[i] && wallRun > 0) {
      out += String.fromCharCode(96 + wallRun);
      wallRun = 0;
    }
    if (walls[i]) wallRun++;
    else openRun++;
  }
  if (openRun > 0) out += String(openRun);
  if (wallRun > 0) out += String.fromCharCode(96 + wallRun);

  // Upstream writes the ',' then every number with a trailing comma, then backs
  // up one character — so a (constructively unreachable) empty list yields no
  // separator at all.
  return numbers.length > 0 ? `${out},${numbers.join(",")}` : out;
}

// --- state -----------------------------------------------------------------

export interface CrossingState {
  readonly params: CrossingParams;
  /** The puzzle, shared by reference across every clone. */
  readonly puzzle: CrossingPuzzle;
  /** `w·h` entered digits, `0` = empty; cloned per move. */
  grid: Uint8Array;
  /** `w·h` pencil-mark bitmasks (bit `n-1` = digit `n`); cloned per move. */
  marks: Int32Array;
  completed: boolean;
  cheated: boolean;
}

export function newState(p: CrossingParams, desc: string): CrossingState {
  const { walls, numbers } = readDesc(p, desc);
  return {
    params: p,
    puzzle: makePuzzle(p.w, p.h, walls, numbers),
    grid: new Uint8Array(p.w * p.h),
    marks: new Int32Array(p.w * p.h),
    completed: false,
    cheated: false,
  };
}

export function cloneState(s: CrossingState): CrossingState {
  return {
    params: s.params,
    puzzle: s.puzzle,
    grid: s.grid.slice(),
    marks: s.marks.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

export function status(s: CrossingState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

// --- board validity --------------------------------------------------------

/** The three-valued board verdict (upstream's `STATUS_*` ints). */
export type SolveStatus = "valid" | "invalid" | "progress";

export interface ValidateResult {
  status: SolveStatus;
  /** Per **number** index: how many runs currently read as that number. */
  done: Int32Array;
  /** Per **run** index: the run is full but matches no listed number. */
  runErrs: Uint8Array;
}

/**
 * Upstream `crossing_validate`. For every run, find which listed numbers of the
 * run's length it currently reads as; a *full* run matching none is a definite
 * error, and a number claimed by more than one run likewise. `"valid"` means
 * every run is full and every number used exactly once.
 *
 * **Two upstream shapes preserved deliberately.**
 *
 * 1. `full` is computed *across* the numbers of matching length rather than per
 *    number, so a run whose length matches **no** number at all keeps
 *    `full = true` with `any = false` and is flagged — which is right (no
 *    number can ever go there) but is not what the code reads like.
 * 2. The completion re-scan indexes `done` by **run** index while the
 *    accumulation above indexes it by **number** index. Those coincide only
 *    because a solved Nansuke has exactly one number per run — which every
 *    generated board does. `done` is sized to hold both so that a hand-authored
 *    description with a mismatched count cannot read out of bounds (the C reads
 *    past its allocation there).
 */
export function validateBoard(
  puzzle: CrossingPuzzle,
  grid: Uint8Array,
): ValidateResult {
  const { numbers, runs } = puzzle;
  const done = new Int32Array(Math.max(numbers.length, runs.length));
  const runErrs = new Uint8Array(runs.length);
  let status: SolveStatus = "valid";

  for (let i = 0; i < runs.length; i++) {
    const cells = runs[i].cells;
    let any = false;
    let full = true;

    for (let l = 0; l < numbers.length; l++) {
      const num = numbers[l];
      if (num.length !== cells.length) continue;

      let match = true;
      for (let k = 0; k < cells.length; k++) {
        const digit = grid[cells[k]];
        if (digit === 0) full = false;
        if (digit !== num.charCodeAt(k) - 48) match = false;
      }

      if (match) {
        any = true;
        done[l]++;
      }
    }

    if (status === "valid" && !full) status = "progress";
    if (full && !any) {
      status = "invalid";
      runErrs[i] = 1;
    }
  }

  if (status !== "invalid") {
    for (let i = 0; i < runs.length; i++) {
      if (done[i] > 1) {
        status = "invalid";
        break;
      }
      if (done[i] === 0) status = "progress";
    }
  }

  return { status, done, runErrs };
}

// --- moves and ui ----------------------------------------------------------

export type CrossingMove =
  /** Ink: place `digit` (or clear the cell when `null`) at `(x, y)`. */
  | { kind: "set"; x: number; y: number; digit: number | null }
  /** Note: toggle mark `digit`, or erase every mark when `null`. */
  | { kind: "pencil"; x: number; y: number; digit: number | null }
  /** Auto-solve: overwrite every open cell from the solver's grid. */
  | { kind: "solve"; grid: readonly number[] };

export interface CrossingUi {
  /** Selected cell. */
  cx: number;
  cy: number;
  /** The selection is shown. */
  cshow: boolean;
  /** The selection takes pencil marks rather than ink. */
  cpencil: boolean;
  /** The selection came from the keyboard, so it survives an entry. */
  ckey: boolean;
  /** Preference (default on, the fork's shared convention): right-click toggles
   * a *sticky* pencil mode that stays on until right-clicked again (a
   * CapsLock-style toggle with an on-screen indicator) rather than upstream's
   * per-cell pencil select. Matches Keen/Towers/Solo/ABCD/Mathrax/Unequal. */
  pencilSticky: boolean;
}

export function newUi(_state: CrossingState): CrossingUi {
  return {
    cx: 0,
    cy: 0,
    cshow: false,
    cpencil: false,
    ckey: false,
    pencilSticky: true,
  };
}

// --- text format -----------------------------------------------------------

/**
 * ASCII rendering for the share-as-text panel (upstream `game_text_format`):
 * the grid with `#` for a wall, the entered digit, or `.` for an empty cell,
 * followed by the number list grouped by length.
 */
export function textFormat(state: CrossingState): string {
  const { w, h, walls, numbers } = state.puzzle;
  let out = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out += walls[i] ? "#" : state.grid[i] ? String(state.grid[i]) : ".";
    }
    out += "\n";
  }

  // Upstream writes a sentinel character that the first length group backs over,
  // so each group header is preceded by exactly one newline and the list keeps a
  // trailing comma. Reproduced literally.
  out += "Q";
  let prevLen = 0;
  for (const num of numbers) {
    if (num.length !== prevLen) out = `${out.slice(0, -1)}\n${num.length}: `;
    prevLen = num.length;
    out += `${num},`;
  }
  return out;
}
