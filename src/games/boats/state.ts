/**
 * Boats — params, cell model, immutable state, and the description codec.
 *
 * Boats is *Battleships* (© 2012 Lennard Sprong, `puzzles/unreleased/boats.c`):
 * locate a known fleet in a grid where the edge numbers count the occupied
 * cells of each row and column, a handful of boat segments are given with
 * their orientation, and no two boats touch — not even diagonally.
 *
 * **Cell values keep upstream's numeric order.** `IS_SHIP(x)` is `x >=
 * SHIP_VAGUE`, i.e. a `>=` test over the enum, and both the solver and the
 * codec lean on it, so the constants below are ordered exactly as the C enum
 * and stored as raw bytes in an `Int8Array`. A string union would have to
 * re-derive "is this any kind of ship?" at every use and would box a hot
 * per-cell array.
 *
 * **Two grids, two lifetimes.** `gridClues` and `borderClues` never change once
 * a game is created, so every state shares the one instance by reference (the
 * docs/games/mechanics.md § "Idiomatic state, not a C transliteration" shared-immutable pattern) and a move clones only `grid`. The
 * *solver* needs both mutable — it fills in hidden border numbers and restores
 * them afterwards — so it works on a separate {@link BoatsBoard} scratch, never
 * on a `BoatsState`.
 */

import { tierNames } from "../../engine/difficulty.ts";
import { parseLeadingInt } from "../../engine/params.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { newCursor } from "../../engine/pointer.ts";

// --- difficulty ------------------------------------------------------------

export const DIFF_EASY = 0;
export const DIFF_NORMAL = 1;
export const DIFF_TRICKY = 2;
export const DIFF_HARD = 3;
export const DIFFCOUNT = 4;

export const DIFF_NAMES: readonly string[] = tierNames(4);
/** The difficulty letters `encodeParams` writes and `decodeParams` reads. */
const DIFF_CHARS = "enth";

// --- cell values (upstream's enum order; `isShip` is a `>=` test) ----------

export const EMPTY = 0;
/** Written by the solver when a deduction contradicts the board. Never
 * reachable through play — it is how `boats_solver_place_*` reports "this
 * square already holds the opposite", which the validator then sees as
 * `STATUS_INVALID`. */
export const CORRUPT = 1;
export const WATER = 2;
/** A ship segment whose shape is not yet determined. */
export const SHIP_VAGUE = 3;
export const SHIP_TOP = 4;
export const SHIP_BOTTOM = 5;
export const SHIP_CENTER = 6;
export const SHIP_LEFT = 7;
export const SHIP_RIGHT = 8;
export const SHIP_SINGLE = 9;

/** Upstream `IS_SHIP`: every ship part sorts at or above {@link SHIP_VAGUE}. */
export function isShip(cell: number): boolean {
  return cell >= SHIP_VAGUE;
}

/** A row/column whose occupancy number the "remove numbers" mode hid. */
export const NO_CLUE = -1;

// --- board status (upstream's `STATUS_*`; `Math.max` picks the worse) ------

export const STATUS_COMPLETE = 0;
export const STATUS_INCOMPLETE = 1;
export const STATUS_INVALID = 2;

// --- params ----------------------------------------------------------------

export interface BoatsParams {
  w: number;
  h: number;
  /** The largest boat that can appear — "fleet size" in the UI. */
  fleet: number;
  /** `fleetData[k]` = how many boats of size `k + 1` the fleet holds. Always
   * exactly {@link BoatsParams.fleet} entries long. */
  fleetData: number[];
  /** `DIFF_EASY` … `DIFF_HARD`; `DIFFCOUNT + 1` when a game ID named a
   * difficulty letter this build doesn't know (rejected by `validateParams`,
   * exactly as upstream). */
  diff: number;
  /** "Remove numbers": hide some border clues to raise the difficulty. */
  strip: boolean;
}

/** Upstream `boats_default_fleet`: the classic pyramid — `fleet` boats of size
 * 1, `fleet − 1` of size 2, …, one of size `fleet`. */
export function defaultFleet(fleet: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < fleet; i++) out.push(fleet - i);
  return out;
}

/** Upstream `boats_decode_fleet`: read `fleet` counts out of a string,
 * skipping any non-digit run between them and yielding 0 once the string runs
 * out (so `",3,2"` at `fleet = 3` is `[3, 2, 0]`). */
export function decodeFleet(input: string, fleet: number): number[] {
  const out: number[] = [];
  let p = 0;
  for (let i = 0; i < fleet; i++) {
    while (p < input.length && !isDigit(input[p])) p++;
    if (p < input.length) {
      const parsed = parseLeadingInt(input, p);
      out.push(parsed.value);
      p = parsed.next;
    } else {
      out.push(0);
    }
  }
  return out;
}

/** Upstream `boats_encode_fleet`: `"3,2,1"`. */
export function encodeFleet(fleetData: readonly number[], fleet: number): string {
  return fleetData.slice(0, fleet).join(",");
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

/** The twelve upstream presets (`boats.c:177`), default fleet throughout. */
export const PRESETS: readonly Omit<BoatsParams, "fleetData">[] = [
  { w: 6, h: 6, fleet: 3, diff: DIFF_EASY, strip: false },
  { w: 6, h: 6, fleet: 3, diff: DIFF_NORMAL, strip: false },
  { w: 6, h: 6, fleet: 3, diff: DIFF_HARD, strip: false },
  { w: 8, h: 8, fleet: 4, diff: DIFF_EASY, strip: false },
  { w: 8, h: 8, fleet: 4, diff: DIFF_NORMAL, strip: false },
  { w: 8, h: 8, fleet: 4, diff: DIFF_HARD, strip: false },
  { w: 10, h: 10, fleet: 4, diff: DIFF_EASY, strip: false },
  { w: 10, h: 10, fleet: 4, diff: DIFF_NORMAL, strip: false },
  { w: 10, h: 10, fleet: 4, diff: DIFF_TRICKY, strip: false },
  { w: 10, h: 10, fleet: 4, diff: DIFF_HARD, strip: false },
  { w: 10, h: 12, fleet: 5, diff: DIFF_TRICKY, strip: false },
  { w: 10, h: 12, fleet: 5, diff: DIFF_HARD, strip: false },
];

/** Upstream `DEFAULT_PRESET`. */
const DEFAULT_PRESET = 7;

export function presetParams(i: number): BoatsParams {
  const p = PRESETS[i];
  return { ...p, fleetData: defaultFleet(p.fleet) };
}

export function presetTitle(p: BoatsParams): string {
  return `${p.w}x${p.h}, size ${p.fleet} ${DIFF_NAMES[p.diff] ?? "?"}`;
}

export function defaultParams(): BoatsParams {
  return presetParams(DEFAULT_PRESET);
}

export function cloneParams(p: BoatsParams): BoatsParams {
  return { ...p, fleetData: [...p.fleetData] };
}

/**
 * Upstream `encode_params`: `<w>x<h>f<fleet>[d<c>][S],<fleet-config>`. The
 * difficulty letter and the strip flag are `full`-only (they belong to a
 * `params#seed` id, not to a `params:desc` one); the fleet configuration is
 * always emitted, because it drives generation.
 */
export function encodeParams(p: BoatsParams, full: boolean): string {
  let s = `${p.w}x${p.h}f${p.fleet}`;
  if (full) s += `d${DIFF_CHARS[p.diff] ?? "?"}`;
  if (full && p.strip) s += "S";
  return `${s},${encodeFleet(p.fleetData, p.fleet)}`;
}

/**
 * Upstream `decode_params`, read leniently: an unknown difficulty letter sets
 * an out-of-range `diff` that {@link validateParams} then rejects, rather than
 * throwing here. Fields the string doesn't mention keep their default-params
 * value, matching the C (which decodes onto a `dup_params` of the current
 * params) — except `fleet` and `strip`, which upstream resets unconditionally.
 */
export function decodeParams(s: string): BoatsParams {
  const p = defaultParams();
  p.fleet = 4;
  p.strip = false;

  let i = 0;
  const wParse = parseLeadingInt(s, i);
  p.w = p.h = wParse.value;
  i = wParse.next;

  if (s[i] === "x") {
    const hParse = parseLeadingInt(s, i + 1);
    p.h = hParse.value;
    i = hParse.next;
  }

  if (s[i] === "f") {
    const fParse = parseLeadingInt(s, i + 1);
    p.fleet = fParse.value;
    i = fParse.next;
  }

  if (s[i] === "d") {
    i++;
    p.diff = DIFFCOUNT + 1; // ...which is invalid
    if (i < s.length) {
      const found = DIFF_CHARS.indexOf(s[i]);
      if (found >= 0) p.diff = found;
      i++;
    }
  }

  if (s[i] === "S") {
    p.strip = true;
    i++;
  }

  p.fleetData = s[i] === "," ? decodeFleet(s.slice(i), p.fleet) : defaultFleet(p.fleet);

  return p;
}

/**
 * The cheap half of upstream `validate_params` — every check that reads only
 * the numbers, in upstream's order (the order decides which message a
 * doubly-invalid parameter set reports). The expensive half is the fleet-fit
 * test, which literally runs the generator, so the whole function is assembled
 * in `generator.ts`; this half is exported for the tests that only need it.
 */
export function validateParamsBasic(p: BoatsParams, full: boolean): string | null {
  const { w, h, fleet } = p;

  if (full && p.diff >= DIFFCOUNT) return "Unknown difficulty level";
  if (w > 99) return "Width is too high";
  if (h > 99) return "Height is too high";
  if (fleet < 1) return "Fleet size must be at least 1";
  if (fleet > w && fleet > h)
    return "Fleet size must be smaller than the width and height";
  if (fleet > 9) return "Fleet size must be no more than 9";

  if (!p.fleetData.slice(0, fleet).some((n) => n !== 0))
    return "Fleet must contain at least 1 boat";

  if (w < 2) return "Width must be at least 2";
  if (h < 2) return "Height must be at least 2";

  return null;
}

// --- board (the solver's and generator's mutable working object) -----------

/**
 * A mutable board: what upstream's `game_state` is to the solver. Kept
 * separate from {@link BoatsState} so that `executeMove` can stay pure while
 * the solver freely writes `grid` (and, on Tricky, `borderClues`).
 */
export interface BoatsBoard {
  readonly w: number;
  readonly h: number;
  readonly fleet: number;
  readonly fleetData: readonly number[];
  /** The given clues: `EMPTY` where the player is free, else a ship shape or
   * `WATER`. Mutated only by the generator, which is choosing them. */
  readonly gridClues: Int8Array;
  /** `w + h` occupancy numbers — columns then rows — or {@link NO_CLUE}. */
  readonly borderClues: Int32Array;
  readonly grid: Int8Array;
}

export function blankBoard(
  w: number,
  h: number,
  fleet: number,
  fleetData: readonly number[],
): BoatsBoard {
  return {
    w,
    h,
    fleet,
    fleetData: [...fleetData],
    gridClues: new Int8Array(w * h),
    borderClues: new Int32Array(w + h),
    grid: new Int8Array(w * h),
  };
}

// --- immutable state -------------------------------------------------------

export interface BoatsState {
  readonly params: BoatsParams;
  /** Shared by reference across every state of a game — never written. */
  readonly gridClues: Int8Array;
  /** Shared by reference across every state of a game — never written. */
  readonly borderClues: Int32Array;
  readonly grid: Int8Array;
  readonly completed: boolean;
  readonly cheated: boolean;
}

export function cloneState(s: BoatsState): BoatsState {
  return { ...s, grid: Int8Array.from(s.grid) };
}

/** A mutable working copy of `s` for the solver / a move application. */
export function boardOf(s: BoatsState): BoatsBoard {
  return {
    w: s.params.w,
    h: s.params.h,
    fleet: s.params.fleet,
    fleetData: s.params.fleetData,
    gridClues: Int8Array.from(s.gridClues),
    borderClues: Int32Array.from(s.borderClues),
    grid: Int8Array.from(s.grid),
  };
}

// --- moves and UI ----------------------------------------------------------

/**
 * What a fill move requires a square to be, and what it sets it to. Upstream
 * encodes these as the characters of its `P…` move string; the port keeps the
 * characters because they are the natural four-valued alphabet here — ship,
 * water, cleared, and (for `from` only) "whatever it is now".
 */
export type BoatsFill = "-" | "B" | "W";
export type BoatsFillFrom = BoatsFill | "*";

export type BoatsMove =
  | {
      kind: "fill";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      from: BoatsFillFrom;
      to: BoatsFill;
    }
  | { kind: "solve"; grid: number[] };

/**
 * Ephemeral input state (upstream `game_ui`): the keyboard cursor and the
 * in-progress line drag. None of it is serialized — a save replays the move
 * log, and a drag is never half-committed.
 */
export interface BoatsUi {
  cursor: GridCursor;
  /** `""` when no drag has started. */
  dragFrom: BoatsFillFrom | "";
  dragTo: BoatsFill | "";
  dragOk: boolean;
  /** The drag's anchor and current cell. */
  dsx: number;
  dsy: number;
  dex: number;
  dey: number;
}

export function newUi(): BoatsUi {
  return {
    cursor: newCursor(),
    dragFrom: "",
    dragTo: "",
    dragOk: false,
    dsx: -1,
    dsy: -1,
    dex: -1,
    dey: -1,
  };
}

/** What a square currently counts as, for a fill move's `from` test. */
export function fillOf(cell: number): BoatsFill {
  return isShip(cell) ? "B" : cell === WATER ? "W" : "-";
}

/**
 * Upstream `boats_validate_move`: would this fill actually change anything?
 * Suppressing a no-op *locally*, rather than by comparing states, is the
 * collection-wide idiom (docs/games/README.md § "Before you start").
 */
export function fillChangesAnything(
  s: BoatsState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  from: BoatsFillFrom,
  to: BoatsFill,
): boolean {
  if (from === to) return false;
  const w = s.params.w;

  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = y * w + x;
      if (s.gridClues[i] !== EMPTY) continue; // a given square is never editable
      if (from !== "*" && fillOf(s.grid[i]) !== from) continue;
      if (fillOf(s.grid[i]) === to) continue;
      return true;
    }
  }
  return false;
}

// --- description codec -----------------------------------------------------

const CLUE_CHARS: Readonly<Record<string, number>> = {
  S: SHIP_SINGLE,
  V: SHIP_VAGUE,
  T: SHIP_TOP,
  B: SHIP_BOTTOM,
  C: SHIP_CENTER,
  L: SHIP_LEFT,
  R: SHIP_RIGHT,
  W: WATER,
};

const CLUE_LETTERS = new Map<number, string>(
  Object.entries(CLUE_CHARS).map(([ch, v]) => [v, ch]),
);

/**
 * Upstream's grid run-length alphabet: a lowercase letter is a run of
 * `letter − 'a' + 1` cells with no given clue, capped at 26 (`z`).
 */
const MAX_RUN = 26;

/**
 * Upstream `new_game`: the description is the `w + h` comma-terminated border
 * numbers (a decimal count, or `-` for a hidden one) followed by the grid as a
 * run-length string. Every character outside those alphabets — the commas —
 * is skipped, exactly as the C.
 */
export function newState(p: BoatsParams, desc: string): BoatsState {
  const { w, h } = p;
  const gridClues = new Int8Array(w * h);
  const borderClues = new Int32Array(w + h);
  const grid = new Int8Array(w * h);

  let clue = 0;
  let cell = 0;
  let i = 0;
  while (i < desc.length) {
    const c = desc[i];
    if (isDigit(c)) {
      const parsed = parseLeadingInt(desc, i);
      if (clue < w + h) borderClues[clue] = parsed.value;
      clue++;
      i = parsed.next;
    } else if (c === "-") {
      if (clue < w + h) borderClues[clue] = NO_CLUE;
      clue++;
      i++;
    } else if (c >= "a" && c <= "z") {
      cell += c.charCodeAt(0) - 97 + 1;
      i++;
    } else if (c >= "A" && c <= "Z") {
      const value = CLUE_CHARS[c];
      if (value === undefined) throw new Error(`bad boats desc character ${c}`);
      if (cell >= w * h) throw new Error("boats desc has too many grid clues");
      gridClues[cell] = value;
      grid[cell] = isShip(value) ? SHIP_VAGUE : WATER;
      cell++;
      i++;
    } else {
      i++;
    }
  }

  return {
    params: cloneParams(p),
    gridClues,
    borderClues,
    grid,
    completed: false,
    cheated: false,
  };
}

/**
 * Upstream `validate_desc`. Note it deliberately does **not** reject a
 * description with *too few* grid cells: upstream's encoder never flushes a
 * trailing run of clue-less cells, so a board whose last cells carry no clue
 * (the common case, and every all-empty board) legitimately encodes short.
 * Only an overlong grid, a wrong border-clue count, or an unknown character
 * is an error.
 */
export function validateDesc(p: BoatsParams, desc: string): string | null {
  const { w, h } = p;
  let clues = 0;
  let cells = 0;
  let i = 0;

  while (i < desc.length) {
    const c = desc[i];
    if (isDigit(c)) {
      clues++;
      i = parseLeadingInt(desc, i).next;
    } else if (c === "-") {
      clues++;
      i++;
    } else if (c >= "a" && c <= "z") {
      cells += c.charCodeAt(0) - 97 + 1;
      i++;
    } else if (c >= "A" && c <= "Z") {
      if (CLUE_CHARS[c] === undefined) return "Description contains invalid characters";
      cells++;
      i++;
    } else {
      i++;
    }
  }

  if (clues < w + h) return "Not enough border clues";
  if (clues > w + h) return "Too many border clues";
  if (cells > w * h) return "Too many grid clues";
  return null;
}

/**
 * The inverse of {@link newState} — upstream's serialization tail in
 * `new_game_desc`. **Byte-match surface**, including the quirk that a trailing
 * run of clue-less cells is dropped rather than flushed (the loop only emits a
 * run when it meets a clue or hits the 26-cell cap).
 */
export function encodeDesc(
  w: number,
  h: number,
  borderClues: ArrayLike<number>,
  gridClues: ArrayLike<number>,
): string {
  const parts: string[] = [];
  for (let i = 0; i < w + h; i++)
    parts.push(borderClues[i] === NO_CLUE ? "-," : `${borderClues[i]},`);

  let run = 0;
  for (let i = 0; i < w * h; i++) {
    const clue = gridClues[i];
    if (clue === EMPTY) run++;
    if (run && (run === MAX_RUN || clue !== EMPTY)) {
      parts.push(String.fromCharCode(97 + run - 1));
      run = 0;
    }
    const letter = CLUE_LETTERS.get(clue);
    if (letter !== undefined) parts.push(letter);
  }

  return parts.join("");
}

// --- text format -----------------------------------------------------------

const TEXT_CHARS: Readonly<Record<number, string>> = {
  [EMPTY]: ".",
  [WATER]: "-",
  [SHIP_VAGUE]: "@",
  [SHIP_TOP]: "^",
  [SHIP_BOTTOM]: "V",
  [SHIP_CENTER]: "#",
  [SHIP_LEFT]: "<",
  [SHIP_RIGHT]: ">",
  [SHIP_SINGLE]: "O",
};

/**
 * Upstream `game_text_format`, gated by `game_can_format_as_text_now`
 * (`w <= 10 && h <= 10` — an 11-wide board's counts would not fit the
 * single-character columns). The static `Game.canFormatAsText` flag cannot
 * express a param-dependent format, so this returns `undefined` for the params
 * it cannot render (docs/games/rendering.md § "The palette: three layers, meaning first").
 */
export function textFormat(s: BoatsState): string | undefined {
  const { w, h } = s.params;
  if (w > 10 || h > 10) return undefined;

  const lineLen = w * 2 + 2;
  const out = new Array<string>(lineLen * (h + 1)).fill(" ");
  for (let i = 0; i < h + 1; i++) out[(i + 1) * lineLen - 1] = "\n";

  for (let x = 0; x < w; x++)
    if (s.borderClues[x] !== NO_CLUE)
      out[lineLen * h + x * 2] = String(s.borderClues[x]);
  for (let y = 0; y < h; y++)
    if (s.borderClues[y + w] !== NO_CLUE)
      out[(y + 1) * lineLen - 2] = String(s.borderClues[y + w]);

  for (let i = 0; i < w * h; i++) {
    const cell = s.gridClues[i] !== EMPTY ? s.gridClues[i] : s.grid[i];
    out[(i % w) * 2 + Math.floor(i / w) * lineLen] = TEXT_CHARS[cell] ?? "?";
  }

  // The C's buffer ends with a NUL where the last newline's slot would be.
  return out.slice(0, out.length - 1).join("");
}
