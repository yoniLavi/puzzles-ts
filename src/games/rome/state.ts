/**
 * Rome (Nikoli's *Roma*) state, params, move/ui types and the desc codec —
 * port of the corresponding parts of `puzzles/unreleased/rome.c`.
 *
 * Fill every square with an arrow so that (1) every outlined region holds only
 * *distinct* arrows and (2) following the arrows from any square reaches a
 * circled goal. Upstream rewrites rule 2 into two local invariants that the
 * whole implementation turns on — **no arrow may point off the grid** and
 * **the arrows must not form a loop** — because a disjoint-set forest that
 * merges each arrow with the square it points at collapses a valid board into
 * components each holding exactly one goal (or one still-empty square).
 *
 * So Rome carries **two** disjoint-set forests, and keeping them apart is the
 * single most important thing to know about this port:
 *
 * - {@link RomeBoard.regions} — the *static region layout* (upstream
 *   `state->dsf`), built once from the desc's wall list and shared by
 *   reference through {@link cloneState}. Used to detect duplicate arrows.
 * - a *transient arrow-connectivity* forest, rebuilt from scratch on every
 *   validity check (see `solver.ts`) and never stored on a state.
 *
 * A cell is one packed `int`, as upstream's: the `FM_*` content bits plus the
 * `FE_*` rule-violation and `FD_*` display bits the validity check ORs back
 * in. The error bits are kept *in* the grid rather than recomputed on demand
 * because every consumer (renderer, `findMistakes`, the solver's `EMPTY`
 * tests) reads them, and the generator's comparisons run against cells
 * carrying them.
 */

import { tierNames } from "../../engine/difficulty.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { ParamConfigItem, PresetMenu } from "../../engine/game.ts";
import { dimensionParamConfig, parseLeadingInt } from "../../engine/params.ts";
import { choice, dims, paramsCodec } from "../../engine/params-codec.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- cell bit-field (upstream values, verbatim) -----------------------------

export const EMPTY = 0;

export const FM_FIXED = 0x0001;
export const FM_GOAL = 0x0002;
export const FM_UP = 0x0004;
export const FM_DOWN = 0x0008;
export const FM_LEFT = 0x0010;
export const FM_RIGHT = 0x0020;

/** Points outside the grid. */
export const FE_BOUNDS = 0x0040;
/** Duplicate arrow within one outlined region. */
export const FE_DOUBLE = 0x0080;
/** Part of a loop. */
export const FE_LOOP = 0x0100;
/** Loop entry point — bounds the loop walk so it cannot spin. */
export const FE_LOOPSTART = 0x0200;

export const FD_CURSOR = 0x0400;
export const FD_PLACE = 0x0800;
export const FD_PENCIL = 0x1000;
/** Its arrow chain reaches a goal. */
export const FD_TOGOAL = 0x2000;
/** Mouse button held down on this square. */
export const FD_ENTRY = 0x4000;

export const FM_ARROWMASK = FM_UP | FM_DOWN | FM_LEFT | FM_RIGHT;
export const FE_MASK = FE_LOOP | FE_LOOPSTART | FE_BOUNDS | FE_DOUBLE;
export const FD_KBMASK = FD_CURSOR | FD_PLACE | FD_PENCIL;

/** One of the four arrow bits. */
export type RomeDir = typeof FM_UP | typeof FM_DOWN | typeof FM_LEFT | typeof FM_RIGHT;

// --- difficulty -------------------------------------------------------------

export const DIFF_EASY = 0;
export const DIFF_NORMAL = 1;
export const DIFF_TRICKY = 2;
export const DIFFCOUNT = 3;

/** Difficulty encode chars (upstream `rome_diffchars`), index = tier. */
const DIFF_CHARS = "ent";
const DIFF_NAMES = tierNames(DIFFCOUNT);

// --- validity verdicts ------------------------------------------------------

export const STATUS_COMPLETE = 0;
export const STATUS_INCOMPLETE = 1;
export const STATUS_INVALID = 2;

// --- types ------------------------------------------------------------------

export interface RomeParams {
  w: number;
  h: number;
  /** One of `DIFF_EASY` / `DIFF_NORMAL` / `DIFF_TRICKY`. */
  diff: number;
}

/**
 * The mutable board the solver and generator work on — upstream's `game_state`
 * minus the two play flags. `RomeState` structurally *is* one, so the solver
 * takes a `RomeBoard` and every caller passes it a board it owns (a clone, a
 * generator scratch), never a live state.
 */
export interface RomeBoard {
  readonly w: number;
  readonly h: number;
  /** Static region layout (upstream `state->dsf`); never merged after decode
   * except by the generator, which owns its own scratch board. */
  readonly regions: Dsf;
  /** Packed cell bits, row-major. */
  readonly grid: Int32Array;
  /** Candidate direction set per square — the player's pencil marks, reused
   * by the solver as its working candidate set (upstream does the same). */
  readonly pencil: Int32Array;
}

export interface RomeState extends RomeBoard {
  completed: boolean;
  cheated: boolean;
}

/**
 * A move is a *place* (set or clear an arrow), a *pencil* (toggle one mark, or
 * clear the square's marks), or a *solve* (the full-grid solution): upstream's
 * `"R x,y,c"` / `"P x,y,c"` / `"S<letters>"`.
 */
export type RomeMove =
  | { kind: "place"; x: number; y: number; dir: RomeDir | null }
  | { kind: "pencil"; x: number; y: number; dir: RomeDir | null }
  | { kind: "solve"; arrows: ReadonlyArray<RomeDir | null> };

// --- ui ---------------------------------------------------------------------

export const KEYMODE_MOVE = 1;
export const KEYMODE_PLACE = 2;
export const KEYMODE_PENCIL = 3;

export const MOUSEMODE_OFF = 0;
export const MOUSEMODE_PLACE = 1;
export const MOUSEMODE_PENCIL = 2;

export interface RomeUi {
  /** Highlighted square — the keyboard cursor, and the grabbed square during
   * a mouse drag. */
  cursor: GridCursor;
  /** `KEYMODE_*`: what the keyboard cursor is armed for — plain movement,
   * placing an arrow, or penciling one. Whether the cursor is *shown* is
   * `cursor.visible`, like every other game's. */
  kmode: number;
  /** `MOUSEMODE_*`: the in-flight drag's mode, `OFF` when idle. */
  mmode: number;
  /** The direction the in-flight drag currently points at (`EMPTY` = none). */
  mdir: number;
  /** Preference: tint squares that are part of a loop (upstream default off). */
  sloops: boolean;
  /** Preference: tint squares whose arrows reach a goal (default on). */
  sgoals: boolean;
}

// --- params -----------------------------------------------------------------

const DEFAULT_PRESET = 3;

/** Every tier at 4x4, 6x6, 8x8 and 10x10. */
const PRESETS: RomeParams[] = [4, 6, 8, 10].flatMap((n) =>
  DIFF_NAMES.map((_, diff) => ({ w: n, h: n, diff })),
);

export function defaultParams(): RomeParams {
  return { ...PRESETS[DEFAULT_PRESET] };
}

export function presets(): PresetMenu<RomeParams> {
  return {
    title: "Rome",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${DIFF_NAMES[p.diff]}`,
      params: { ...p },
    })),
  };
}

/** The "Custom type…" form, and the field list the codec below encodes. */
export const paramConfig: ParamConfigItem<RomeParams>[] = [
  ...dimensionParamConfig<RomeParams>(),
  {
    kw: "difficulty",
    name: "Difficulty",
    type: "choices",
    choices: [...DIFF_NAMES],
    get: (p) => p.diff,
    set: (p, v) => {
      p.diff = v;
    },
  },
];

/** `WxH`, plus the generator-only difficulty letter. Upstream: a `d` with an
 * absent or unrecognized char leaves the difficulty out of range, so
 * `validateParams` rejects it. */
export const { encodeParams, decodeParams } = paramsCodec(defaultParams, [
  dims(paramConfig),
  choice(paramConfig, "d", "difficulty", DIFF_CHARS, {
    full: true,
    invalid: DIFFCOUNT + 1,
  }),
]);

export function validateParams(p: RomeParams, _full: boolean): string | null {
  if (p.w < 3) return "Width must be at least 3";
  if (p.h < 3) return "Height must be at least 3";
  if (p.diff >= DIFFCOUNT) return "Unknown difficulty level";
  return null;
}

// --- board helpers ----------------------------------------------------------

/** Number of inter-cell edges: `(w-1)*h` horizontal, then `w*(h-1)` vertical —
 * the order the desc's wall list uses. */
function wallCount(w: number, h: number): number {
  return (w - 1) * h + w * (h - 1);
}

export function newBoard(w: number, h: number): RomeState {
  const s = w * h;
  return {
    w,
    h,
    regions: new Dsf(s),
    grid: new Int32Array(s),
    pencil: new Int32Array(s),
    completed: false,
    cheated: false,
  };
}

/**
 * A clone that shares the region layout by reference: it never changes after
 * decode, and path compression, the only thing that touches it, cannot alter
 * the partition or its roots.
 */
export function cloneState(s: RomeState): RomeState {
  return {
    w: s.w,
    h: s.h,
    regions: s.regions,
    grid: s.grid.slice(),
    pencil: s.pencil.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

/**
 * A fresh board holding only this state's *fixed clues* — the position the
 * puzzle started from, with every player entry, pencil mark and transient
 * error/display bit stripped. `solve` and `findMistakes` both re-derive the
 * unique solution from this rather than from the live grid.
 */
export function boardFromClues(s: RomeState): RomeState {
  const grid = s.grid.map((c) =>
    c & FM_FIXED ? c & (FM_FIXED | FM_GOAL | FM_ARROWMASK) : EMPTY,
  );
  // Share the region layout: `romeSolve` never merges it.
  return { ...newBoard(s.w, s.h), regions: s.regions, grid };
}

export function status(s: RomeState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- desc codec (byte-match surface) ----------------------------------------

const CODE_a = "a".charCodeAt(0);

/** The clue letters, in the order the encoder writes a cell's bits. */
const CLUE_BITS: Readonly<Record<string, number>> = {
  U: FM_UP,
  D: FM_DOWN,
  L: FM_LEFT,
  R: FM_RIGHT,
  X: FM_GOAL,
};

/**
 * Decode a description into a board — upstream `rome_read_desc`, the inverse
 * of {@link encodeDesc}.
 *
 * Part 1 is a run-length list over the `(w-1)*h + w*(h-1)` inter-cell edges: a
 * decimal number is a run of that many walls; a letter `a`–`y` is a run of
 * 1–25 non-walls *followed by one wall*; `z` is 26 non-walls with no trailing
 * wall. Part 2, after the `,`, run-length encodes the clue grid: a letter is a
 * run of empty squares, and `U`/`D`/`L`/`R`/`X` are fixed arrows and goals.
 *
 * Returns the codec's own rejection message alongside the board, for
 * {@link validateDesc}. Invalid input is decoded as far as it goes rather than
 * throwing, exactly as the C does.
 */
export function readDesc(
  p: RomeParams,
  desc: string,
): { board: RomeState; error: string | null } {
  const { w, h } = p;
  const s = w * h;
  const hs = (w - 1) * h;
  const ws = wallCount(w, h);
  const board = newBoard(w, h);
  const { grid, regions } = board;
  const walls = new Uint8Array(ws);
  let error: string | null = null;

  let pos = 0;
  let erun = 0;
  let wrun = 0;
  for (let i = 0; i < ws; i++) {
    if (erun === 0 && wrun === 0) {
      const ch = desc[pos] ?? "";
      if (ch >= "0" && ch <= "9") {
        const r = parseLeadingInt(desc, pos);
        wrun = r.value;
        pos = r.next;
      } else if (ch >= "a" && ch <= "y") {
        erun = ch.charCodeAt(0) - CODE_a + 1;
        wrun = 1;
        pos++;
      } else if (ch === "z") {
        erun = 26;
        pos++;
      } else {
        error = "Region description contains invalid characters";
      }
    }
    if (erun > 0) {
      walls[i] = 0;
      erun--;
    } else if (wrun > 0) {
      walls[i] = 1;
      wrun--;
    }
  }

  // Merge horizontally, then vertically — the same order the encoder walks,
  // which is also what fixes the union-by-size roots the solver's naked-pairs
  // rule reads as an element (see solver.ts).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      if (!walls[y * (w - 1) + x]) regions.merge(y * w + x, y * w + x + 1);
    }
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      if (!walls[hs + y * w + x]) regions.merge(y * w + x, (y + 1) * w + x);
    }
  }

  pos++; // the ',' separator
  erun = 0;
  for (let i = 0; i < s; i++) {
    if (erun === 0) {
      const c = desc[pos++] ?? "";
      const clue: number | undefined = CLUE_BITS[c];
      if (c >= "a" && c <= "z") erun = c.charCodeAt(0) - CODE_a + 1;
      else if (clue !== undefined) grid[i] = clue | FM_FIXED;
      else error = "Clues contain invalid characters";
    }
    if (erun > 0) erun--; // an empty square
  }

  return { board, error };
}

/**
 * Encode a finished board as a description — upstream's `new_game_desc` tail,
 * the inverse of {@link readDesc}.
 *
 * One upstream asymmetry is kept deliberately: a run of exactly 26 non-walls
 * encodes as `z` *and consumes the wall that follows it*, whereas the reader
 * takes `z` as 26 non-walls with **no** trailing wall (and a longer run leaves
 * the alphabet entirely). The two disagree only above 25 consecutive
 * non-walls. Reproduce both sides verbatim rather than "completing" either
 * (docs/games/testing.md § "Byte-match: fidelity where there is a right answer").
 */
export function encodeDesc(
  w: number,
  h: number,
  regions: Dsf,
  grid: Int32Array,
): string {
  const ws = wallCount(w, h);
  const walls = new Uint8Array(ws);
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      walls[n++] = regions.equivalent(y * w + x, y * w + x + 1) ? 0 : 1;
    }
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      walls[n++] = regions.equivalent(y * w + x, (y + 1) * w + x) ? 0 : 1;
    }
  }

  let out = "";
  let erun = 0;
  let wrun = 0;
  for (let i = 0; i < ws; i++) {
    if (!walls[i] && wrun > 0) {
      out += String(wrun);
      wrun = 0;
      erun = 0;
    } else if (walls[i] && erun > 0) {
      out += String.fromCharCode(CODE_a + erun - 1);
      erun = 0;
      // The letter already accounts for this wall, so back the counter off by
      // one and let the increment below bring it to zero (upstream's trick).
      wrun = -1;
    }
    if (!walls[i]) erun++;
    else wrun++;
  }
  if (wrun > 0) out += String(wrun);
  if (erun > 0) out += String.fromCharCode(CODE_a + erun - 1);

  out += ",";

  erun = 0;
  for (let i = 0; i < w * h; i++) {
    const c = grid[i];
    if (erun > 0 && c !== EMPTY) {
      out += String.fromCharCode(CODE_a + erun - 1);
      erun = 0;
    }
    for (const [ch, bit] of Object.entries(CLUE_BITS)) if (c & bit) out += ch;
    if (c === EMPTY) erun++;
  }
  if (erun > 0) out += String.fromCharCode(CODE_a + erun - 1);

  return out;
}
