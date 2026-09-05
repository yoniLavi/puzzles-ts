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
 * Two upstream behaviors are deliberately preserved rather than "improved";
 * both are flagged at their sites below: the desc decoder's hard-coded
 * `maxrow = 9`, and the `done[]` array in {@link validateBoard} that is sized
 * by number count but re-scanned by run count.
 */

import { parseLeadingInt } from "../../engine/params.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { newCursor } from "../../engine/pointer.ts";

// --- params ----------------------------------------------------------------

export interface CrossingParams {
  w: number;
  h: number;
  /** Grow the walls 180°-rotationally symmetrically. */
  sym: boolean;
}

/**
 * Upstream ships the first three. The rest are a fork addition: the solving aids
 * make a small board quick work, so the ladder runs up to the largest board the
 * generator can produce ({@link MAX_AREA}).
 *
 * The symmetric entries are not just a flavor — they are what makes the big
 * sizes *practical*. Growing the walls in 180°-rotational pairs puts them down
 * twice as fast, so runs stay short and the duplicate-number rejection that
 * dominates large boards (see {@link MAX_AREA}) fires far less often. Measured
 * medians outside the test runner: 13×13 126 ms but 13×13 symmetric 12 ms;
 * 15×15 **1517 ms** (worst 3931 ms) but 15×15 symmetric **160 ms** (worst
 * 229 ms). Hence the full-size board is offered symmetric, where it is instant,
 * and the plain ladder stops at 13×13.
 */
export const crossingPresets: readonly CrossingParams[] = [
  { w: 5, h: 5, sym: false },
  { w: 7, h: 7, sym: false },
  { w: 9, h: 9, sym: false },
  { w: 11, h: 11, sym: false },
  { w: 13, h: 13, sym: false },
  { w: 9, h: 9, sym: true },
  { w: 13, h: 13, sym: true },
  { w: 15, h: 15, sym: true },
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

/**
 * The largest board the generator can actually produce, in squares.
 *
 * Upstream sets no upper bound at all, and `new_game_desc` retries until it
 * succeeds — so a large Custom board makes the C spin **for ever**. It is not a
 * question of patience: an attempt is rejected whenever any two runs read as the
 * same number, and since the run count grows with the area, that collision
 * becomes near-certain (a birthday problem over at most 81 two-digit numbers).
 *
 * Measured over a grid of shapes, 3 seeds each: every configuration of **225
 * squares or fewer** generated 3/3 (worst case 0.9 s at 16×14), every
 * configuration of 240 or more failed at least once, and nothing at 280+ ever
 * generated (18×16, 20×14, 24×12, 18×18 — all 0/3 within a 10,000-attempt
 * budget). So this is the docs/games/solver-and-generator.md § "Unlucky, impossible, and load-bearing validation" "impossible ⇒ reject in `validateParams`"
 * case rather than the "unlucky ⇒ retry" one, and 225 is the measured boundary
 * rather than a guess. It also bounds the clue list, which is what makes the
 * author's "no reliable way to always fit the list on screen" tractable here.
 */
export const MAX_AREA = 225;

/** Upstream `validate_params`, in its exact order: both dimensions ≥ 2, and at
 * least one of them ≥ 4 (a 3×3 board has no room for crossing runs) — plus the
 * generable-size ceiling upstream lacks (see {@link MAX_AREA}). The ceiling
 * applies only to a `full` validation, i.e. when a board is about to be
 * *generated*; a description that already exists stays playable at any size. */
export function validateParams(p: CrossingParams, full: boolean): string | null {
  if (p.w < 4 && p.h < 4) return "The width or height must be at least 4";
  if (p.w < 2) return "Width must be at least 2";
  if (p.h < 2) return "Height must be at least 2";
  if (full && p.w * p.h > MAX_AREA)
    return `Width times height must be at most ${MAX_AREA}; larger boards cannot be generated`;
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
  /** Per cell, the index into `runs` of the horizontal run through it, or -1.
   * Lets input answer "which number am I filling?" without searching. */
  readonly acrossRun: Int32Array;
  /** Per cell, the index into `runs` of the vertical run through it, or -1. */
  readonly downRun: Int32Array;
}

/** Which way the cursor advances after a digit is entered. */
export type CrossingDirection = "across" | "down";

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
  const runs = collectRuns(w, h, walls);
  const acrossRun = new Int32Array(w * h).fill(-1);
  const downRun = new Int32Array(w * h).fill(-1);
  for (let r = 0; r < runs.length; r++) {
    const map = runs[r].horizontal ? acrossRun : downRun;
    for (const i of runs[r].cells) map[i] = r;
  }
  return { w, h, walls, numbers, runs, acrossRun, downRun };
}

/** The run through `(x, y)` along `dir`, or `null` when there is none (a cell
 * can belong to a horizontal run, a vertical one, both, or — an isolated open
 * cell — neither). */
export function runThrough(
  puzzle: CrossingPuzzle,
  x: number,
  y: number,
  dir: CrossingDirection,
): CrossingRun | null {
  const map = dir === "across" ? puzzle.acrossRun : puzzle.downRun;
  const r = map[y * puzzle.w + x];
  return r < 0 ? null : puzzle.runs[r];
}

/** The direction the player must mean at `(x, y)`: when the cell lies in only
 * one run there is no choice, so snap to it; otherwise keep their `dir`. */
export function snapDirection(
  puzzle: CrossingPuzzle,
  x: number,
  y: number,
  dir: CrossingDirection,
): CrossingDirection {
  const across = puzzle.acrossRun[y * puzzle.w + x] >= 0;
  const down = puzzle.downRun[y * puzzle.w + x] >= 0;
  if (across && !down) return "across";
  if (down && !across) return "down";
  return dir;
}

/** True when `(x, y)` lies in both a horizontal and a vertical run, so a
 * direction toggle there is meaningful. */
export function atCrossing(puzzle: CrossingPuzzle, x: number, y: number): boolean {
  const i = y * puzzle.w + x;
  return puzzle.acrossRun[i] >= 0 && puzzle.downRun[i] >= 0;
}

/** The next cell along `dir` **within the same run**, or `null` at its end. */
export function nextInRun(
  puzzle: CrossingPuzzle,
  x: number,
  y: number,
  dir: CrossingDirection,
): { x: number; y: number } | null {
  const run = runThrough(puzzle, x, y, dir);
  if (!run) return null;
  const at = run.cells.indexOf(y * puzzle.w + x);
  if (at < 0 || at + 1 >= run.cells.length) return null;
  const next = run.cells[at + 1];
  return { x: next % puzzle.w, y: Math.floor(next / puzzle.w) };
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

// --- placing a whole number (the fork's number-list aid) --------------------

/**
 * Can listed number `l` still be written into `run`?
 *
 * Deliberately **pattern-matching only**: the number must be the run's length
 * and must agree with every digit already entered there. That is the scan a
 * player does by eye down the clue list — it uses nothing but their own
 * entries. Judging a number by whether it would leave the *crossing* runs
 * satisfiable is constraint propagation, i.e. the puzzle itself, and belongs to
 * a hint rather than to an input aid (owner-decided).
 */
export function numberFitsRun(
  puzzle: CrossingPuzzle,
  grid: Uint8Array,
  run: CrossingRun,
  l: number,
): boolean {
  const num = puzzle.numbers[l];
  if (num.length !== run.cells.length) return false;
  for (let k = 0; k < run.cells.length; k++) {
    const digit = grid[run.cells[k]];
    if (digit !== 0 && digit !== num.charCodeAt(k) - 48) return false;
  }
  return true;
}

/** For each listed number, the index of a run that currently reads exactly as
 * it, or -1 — i.e. "where have I already used this number?". A number placed in
 * one run is unavailable to any other (each appears exactly once). */
export function placedRuns(puzzle: CrossingPuzzle, grid: Uint8Array): Int32Array {
  const { numbers, runs } = puzzle;
  const at = new Int32Array(numbers.length).fill(-1);
  for (let r = 0; r < runs.length; r++) {
    const cells = runs[r].cells;
    for (let l = 0; l < numbers.length; l++) {
      if (at[l] >= 0) continue;
      const num = numbers[l];
      if (num.length !== cells.length) continue;
      let match = true;
      for (let k = 0; k < cells.length; k++) {
        if (grid[cells[k]] !== num.charCodeAt(k) - 48) {
          match = false;
          break;
        }
      }
      if (match) at[l] = r;
    }
  }
  return at;
}

/** Is listed number `l` available to `runIndex` — it fits, and it is not
 * already written into some *other* run? */
export function numberAvailableTo(
  puzzle: CrossingPuzzle,
  grid: Uint8Array,
  placed: Int32Array,
  runIndex: number,
  l: number,
): boolean {
  if (placed[l] >= 0 && placed[l] !== runIndex) return false;
  return numberFitsRun(puzzle, grid, puzzle.runs[runIndex], l);
}

/**
 * Which run through `(x, y)` should take listed number `l`, or -1?
 *
 * A number occupies a whole run, so its length usually settles the question by
 * itself. Where both runs through the cell admit it, **the one the board
 * already constrains wins**: agreeing with digits the player has entered is
 * evidence of what they meant, where a blank run admits every unused number of
 * its length and so is no evidence at all. Only a genuine tie — both runs
 * equally constrained — is settled by the current fill direction.
 *
 * That ordering was the wrong way round at first, and it is worth stating why
 * the obvious rule fails: with `4_1` written across and the crossing down run
 * still blank, clicking clue `421` wrote it *downwards*, because the sticky
 * fill direction happened to be "down" and got to decide. The board plainly
 * showed a nearly-finished word that only `421` completes; no player reads that
 * as an instruction to fill three empty squares instead.
 *
 * The renderer colors the clue list through this same function, so the color
 * a clue is written in always names the run a click would actually send it to.
 */
export function runForNumber(
  puzzle: CrossingPuzzle,
  grid: Uint8Array,
  placed: Int32Array,
  x: number,
  y: number,
  l: number,
  dir: CrossingDirection,
): number {
  const i = y * puzzle.w + x;
  const preferred = dir === "across" ? puzzle.acrossRun[i] : puzzle.downRun[i];
  const other = dir === "across" ? puzzle.downRun[i] : puzzle.acrossRun[i];
  const takes = (r: number): boolean =>
    r >= 0 && numberAvailableTo(puzzle, grid, placed, r, l);

  if (!takes(preferred)) return takes(other) ? other : -1;
  if (!takes(other)) return preferred;

  // Both admit it: how much of each run is already written decides.
  const entered = (r: number): number =>
    puzzle.runs[r].cells.reduce((n, c) => n + (grid[c] !== 0 ? 1 : 0), 0);
  return entered(other) > entered(preferred) ? other : preferred;
}

// --- moves and ui ----------------------------------------------------------

export type CrossingMove =
  /** Ink: place `digit` (or clear the cell when `null`) at `(x, y)`. */
  | { kind: "set"; x: number; y: number; digit: number | null }
  /** Note: toggle mark `digit`, or erase every mark when `null`. */
  | { kind: "pencil"; x: number; y: number; digit: number | null }
  /** Clear a list of notes atomically — the hint's rule-out move. A `pencil`
   * toggle is *one* candidate and is not idempotent (re-applying it would put
   * the note back), so one deduction ruling out several candidates needs a move
   * that only ever removes (docs/games/hints.md § "Persist, populate, and the moves"). Players produce it only by
   * following a hint; typing produces `pencil` toggles as before. */
  | { kind: "pencilStrike"; marks: readonly { x: number; y: number; n: number }[] }
  /** Write listed number `number` into run `run` — the whole clue at once,
   * as one undo step (the fork's number-list placement aid). */
  | { kind: "place"; run: number; number: number }
  /** Auto-solve: overwrite every open cell from the solver's grid. */
  | { kind: "solve"; grid: readonly number[] };

export interface CrossingUi {
  /** Selected cell. */
  cursor: GridCursor;
  /** The selection takes pencil marks rather than ink. */
  pencilMode: boolean;
  /** The selection came from the keyboard, so it survives an entry. */
  cursorFromKeyboard: boolean;
  /** Which way an entered digit advances the selection. Sticky: the arrow keys
   * set it, a repeat click at a crossing toggles it, and selecting a cell that
   * lies in only one run snaps it to that run. */
  dir: CrossingDirection;
  /** The clue number currently picked up from the list (an index into
   * `puzzle.numbers`), or `null`. While one is held it is previewed in every
   * run that can still take it, and clicking such a run places it. */
  heldNumber: number | null;
  /** Preference (default on): color the clue list by where each clue could go
   * from the selected cell — its dimension's ink if it fits one of the two runs
   * through that cell, dimmed if it fits neither. Pure bookkeeping over the
   * player's own entries — see {@link numberFitsRun}. */
  fitHighlight: boolean;
  /** Preference (default on): wash the two runs through the selected cell on
   * the board, each in its dimension's hue. Independent of
   * {@link CrossingUi.fitHighlight} — some players want to know which clues are
   * live without the board being tinted, and vice versa. */
  highlightRuns: boolean;
  /** Preference (default on, a deliberate divergence — the game's own
   * documentation asks for it): entering a digit moves the selection to the next
   * cell of the run being filled, so a number can be typed straight in instead of
   * clicking every cell. */
  autoAdvance: boolean;
  /** Preference (default on, the fork's shared convention): right-click toggles
   * a *sticky* pencil mode that stays on until right-clicked again (a
   * CapsLock-style toggle with an on-screen indicator) rather than upstream's
   * per-cell pencil select. Matches Keen/Towers/Solo/ABCD/Mathrax/Unequal. */
  pencilSticky: boolean;
  /** Preference (default on): keep the mouse highlight after a pencil change. */
  pencilKeepHighlight: boolean;
}

export function newUi(_state: CrossingState): CrossingUi {
  return {
    cursor: newCursor(),
    pencilMode: false,
    cursorFromKeyboard: false,
    dir: "across",
    heldNumber: null,
    fitHighlight: true,
    highlightRuns: true,
    autoAdvance: true,
    pencilSticky: true,
    pencilKeepHighlight: true,
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
