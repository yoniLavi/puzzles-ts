/**
 * Types and pure state helpers for Mathrax — the state/codec parts of
 * `puzzles/unreleased/mathrax.c` (© 2019 Lennard Sprong).
 *
 * A board is an `o × o` Latin square of digits `1..o`. Clues sit on the
 * `(o−1) × (o−1)` interior grid *intersections*, each constraining the four
 * cells around it: an arithmetic clue means the operation gives the same result
 * on both diagonal pairs (`topleft ∘ botright == topright ∘ botleft`) and shows
 * that result; `=` means each diagonal pair is equal; `E`/`O` mean all four
 * digits are even / odd.
 *
 * The clue array is immutable after load and shared by reference across cloned
 * states; the working digits, per-cell flags and pencil marks are cloned per
 * move.
 *
 * **Two bitmask conventions live in this port, deliberately.** The *solver's*
 * candidate masks (`solver.ts`) keep upstream's `BIT(d) = 1 << (d−1)` verbatim,
 * because they decide the solver's verdict and so the generated description
 * (playbook §4.4). The *player's* pencil marks here use the Latin-family
 * convention `1 << n` (bits `1..o`), which is what `engine/candidate-hint.ts`
 * (mark-all, and a future explained hint) reads. Marks never reach the desc or a
 * save — the save codec replays moves — so the divergence is free.
 */

// --- difficulty ------------------------------------------------------------

export type MathraxDiff = "easy" | "normal" | "tricky" | "recursive";

export const DIFF_EASY = 0;
export const DIFF_NORMAL = 1;
export const DIFF_TRICKY = 2;
export const DIFF_RECURSIVE = 3;
export const DIFF_COUNT = 4;

/** `mathrax_diffchars` / `mathrax_diffnames`, indexed by level. */
const DIFF_CHARS = "entr";
export const DIFF_NAMES = ["Easy", "Normal", "Tricky", "Recursive"];
const DIFFS: MathraxDiff[] = ["easy", "normal", "tricky", "recursive"];

export function diffToLevel(d: MathraxDiff): number {
  const i = DIFFS.indexOf(d);
  return i < 0 ? DIFF_EASY : i;
}
export function diffFromLevel(level: number): MathraxDiff {
  return DIFFS[level] ?? "easy";
}
export function diffChar(d: MathraxDiff): string {
  return DIFF_CHARS[diffToLevel(d)];
}
export function diffName(d: MathraxDiff): string {
  return DIFF_NAMES[diffToLevel(d)];
}

// --- clues -----------------------------------------------------------------
// A clue is one packed number: the low three bits hold the type, the rest the
// clue's number (upstream `CLUENUM`/`SET_CLUENUM`). Equality is encoded as
// `CLUE_SUB` with number 0, which is also how `mathraxOptions` deduces it
// (|a − b| == 0 ⇒ a == b) — so there is no separate equality arm anywhere.

export const CLUE_NONE = 0;
export const CLUE_ADD = 1;
export const CLUE_SUB = 2;
export const CLUE_MUL = 3;
export const CLUE_DIV = 4;
export const CLUE_EVN = 5;
export const CLUE_ODD = 6;
export const CLUEMASK = 7;

export function clueType(clue: number): number {
  return clue & CLUEMASK;
}
export function clueNum(clue: number): number {
  return clue >>> 3;
}
export function setClueNum(n: number): number {
  return n << 3;
}

// --- clue-type options (which clue kinds the generator may emit) ------------

export const OPTION_ADD = 1;
export const OPTION_SUB = 2;
export const OPTION_MUL = 4;
export const OPTION_DIV = 8;
export const OPTION_EQL = 16;
export const OPTION_ODD = 32;
export const OPTIONSMASK = 63;

/** The clue-type option bits in upstream's fixed encode/decode order. */
export const OPTION_LETTERS: ReadonlyArray<{ bit: number; letter: string }> = [
  { bit: OPTION_ADD, letter: "A" },
  { bit: OPTION_SUB, letter: "S" },
  { bit: OPTION_MUL, letter: "M" },
  { bit: OPTION_DIV, letter: "D" },
  { bit: OPTION_EQL, letter: "E" },
  { bit: OPTION_ODD, letter: "O" },
];

// --- cell flags ------------------------------------------------------------

/** A given: the player may not change it. */
export const F_IMMUTABLE = 0x01;
/** This digit is duplicated in its row or column. */
export const FE_COUNT = 0x02;
export const FE_TOPLEFT = 0x04;
export const FE_TOPRIGHT = 0x08;
export const FE_BOTLEFT = 0x10;
export const FE_BOTRIGHT = 0x20;
export const FE_ERRORMASK = 0x3e;

// --- params ----------------------------------------------------------------

export interface MathraxParams {
  /** Grid order (`o × o`, digits `1..o`). */
  o: number;
  diff: MathraxDiff;
  /** Bitmask of the enabled clue types (`OPTION_*`). */
  options: number;
}

export function defaultParams(): MathraxParams {
  return { o: 5, diff: "easy", options: OPTIONSMASK };
}

export function encodeParams(p: MathraxParams, full: boolean): string {
  let s = String(p.o);
  if (full) {
    s += `d${diffChar(p.diff)}`;
    // An empty letter set means "all", so the full set is written as nothing.
    if (p.options !== OPTIONSMASK) {
      for (const { bit, letter } of OPTION_LETTERS) if (p.options & bit) s += letter;
    }
  }
  return s;
}

export function decodeParams(s: string): MathraxParams {
  const p = defaultParams();
  p.options = 0;
  let i = 0;
  let digits = "";
  while (i < s.length && s[i] >= "0" && s[i] <= "9") digits += s[i++];
  p.o = digits ? Number.parseInt(digits, 10) : 0; // atoi("") === 0
  if (s[i] === "d") {
    i++;
    // An unrecognised (or missing) letter leaves the difficulty invalid, which
    // `validateParams` then rejects — faithful to `decode_params`.
    const idx = i < s.length ? DIFF_CHARS.indexOf(s[i]) : -1;
    p.diff = idx >= 0 ? diffFromLevel(idx) : ("invalid" as MathraxDiff);
    if (i < s.length) i++;
  }
  // Each letter is tested once, in order — so they must appear in `A S M D E O`
  // order to all be read (upstream's six sequential `if`s).
  for (const { bit, letter } of OPTION_LETTERS) {
    if (s[i] === letter) {
      p.options |= bit;
      i++;
    }
  }
  if (!p.options) p.options = OPTIONSMASK;
  return p;
}

export function validateParams(p: MathraxParams, full: boolean): string | null {
  if (p.o < 3) return "Size must be at least 3";
  if (p.o > 9) return "Size must be no more than 9";
  if (DIFFS.indexOf(p.diff) < 0) return "Unknown difficulty rating";
  if (full && !p.options) return "At least one clue type must be enabled";
  // A 3x3 grid has only four intersections, and at that size two of the four
  // tiers have nothing to grade with: measured over 3,000 candidate boards each,
  // none needed Normal (Easy always sufficed) and none needed Recursive (Tricky
  // always sufficed). Tricky itself is fine — roughly one board in ten binds.
  // Refusing to generate beats offering a difficulty that silently yields
  // another one (`grade-difficulty-tiers-honestly`); a saved game or a game ID
  // carrying its own description still loads, because `full` is false there.
  if (full && p.o === 3 && (p.diff === "normal" || p.diff === "recursive")) {
    return "Size 3 has no Normal or Recursive puzzles; use Easy or Tricky";
  }
  return null;
}

// --- state -----------------------------------------------------------------

export interface MathraxState {
  params: MathraxParams;
  /** `o²` working digits (0 = blank). */
  grid: Uint8Array;
  /** `o²` per-cell flags: {@link F_IMMUTABLE} plus the live `FE_*` error bits,
   * recomputed by {@link mathraxValidate} on every committed digit move (as
   * upstream stores them on the state and `game_redraw` reads them back). */
  flags: Uint8Array;
  /** `o²` pencil-mark bitmaps, bit `n` = candidate `n` (see the module note). */
  marks: Int32Array;
  /** `(o−1)²` packed clues at the interior intersections. Immutable after load,
   * shared by reference across cloned states. */
  clues: Int32Array;
  completed: boolean;
  cheated: boolean;
}

export function cloneState(s: MathraxState): MathraxState {
  return {
    params: s.params,
    grid: s.grid.slice(),
    flags: s.flags.slice(),
    marks: s.marks.slice(),
    clues: s.clues, // immutable, shared
    completed: s.completed,
    cheated: s.cheated,
  };
}

export function status(s: MathraxState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

// --- desc codec ------------------------------------------------------------

/**
 * Encode a board as the two comma-separated run-length parts upstream's
 * `new_game_desc` emits: the `o²` grid givens (a digit is its own character, a
 * run of empties is one letter `a`..`z` for 1..26), then the `(o−1)²` clues
 * (`A`/`S`/`M`/`D` + number, `E`/`O`, `a`..`z` runs; `S0` is equality).
 */
export function encodeDesc(o: number, grid: Uint8Array, clues: Int32Array): string {
  const s = o * o;
  const cs = (o - 1) * (o - 1);
  let out = "";
  let run = 0;

  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) {
      if (run) {
        out += String.fromCharCode(96 + run);
        run = 0;
      }
      out += String(grid[i]);
    } else {
      if (run === 26) {
        out += String.fromCharCode(96 + run);
        run = 0;
      }
      run++;
    }
  }
  if (run) out += String.fromCharCode(96 + run);

  out += ",";
  run = 0;
  for (let i = 0; i < cs; i++) {
    const clue = clues[i];
    if (clue !== 0) {
      if (run) {
        out += String.fromCharCode(96 + run);
        run = 0;
      }
      switch (clueType(clue)) {
        case CLUE_ADD:
          out += `A${clueNum(clue)}`;
          break;
        case CLUE_SUB:
          out += `S${clueNum(clue)}`;
          break;
        case CLUE_MUL:
          out += `M${clueNum(clue)}`;
          break;
        case CLUE_DIV:
          out += `D${clueNum(clue)}`;
          break;
        case CLUE_EVN:
          out += "E";
          break;
        case CLUE_ODD:
          out += "O";
          break;
        default:
          // Unreachable (a stored clue always carries a type); upstream emits an
          // empty space "just to be safe", so we do the same.
          out += "a";
      }
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

const CLUE_LETTERS: Record<string, number> = {
  A: CLUE_ADD,
  S: CLUE_SUB,
  M: CLUE_MUL,
  D: CLUE_DIV,
  E: CLUE_EVN,
  O: CLUE_ODD,
};

interface LoadResult {
  grid: Uint8Array;
  flags: Uint8Array;
  clues: Int32Array;
}

/**
 * Decode `desc` into the given/clue arrays, or return the upstream failure
 * message. The exact inverse of {@link encodeDesc}, and a faithful port of
 * `load_game` — including its two quirks: a run may push the position past the
 * end without complaint (the bound is only checked before the *next* character),
 * and a character in the clue part that is neither `a`..`z` nor `A`..`Z` is
 * silently ignored rather than rejected.
 */
export function loadGame(
  p: MathraxParams,
  desc: string,
): { ok: true; value: LoadResult } | { ok: false; error: string } {
  const o = p.o;
  const s = o * o;
  const co = o - 1;
  const cs = co * co;

  const grid = new Uint8Array(s);
  const flags = new Uint8Array(s);
  const clues = new Int32Array(cs);

  let i = 0;
  let pos = 0;
  while (i < desc.length && desc[i] !== ",") {
    const c = desc[i++];
    let d = 0;
    if (pos >= s) return { ok: false, error: "Grid description is too long." };

    if (c >= "a" && c <= "z") pos += c.charCodeAt(0) - 97 + 1;
    else if (c >= "1" && c <= "9") d = c.charCodeAt(0) - 48;
    else return { ok: false, error: "Grid description contains invalid characters." };

    if (d > 0 && d <= o) {
      flags[pos] |= F_IMMUTABLE;
      grid[pos] = d;
      pos++;
    } else if (d > o) {
      return { ok: false, error: "Grid clue is out of range." };
    }
  }

  if (pos > 0 && pos < s) return { ok: false, error: "Description is too short." };

  if (desc[i] === ",") {
    i++;
    pos = 0;
    while (i < desc.length) {
      if (pos >= cs) return { ok: false, error: "Clue description is too long." };
      const c = desc[i++];

      if (c >= "a" && c <= "z") pos += c.charCodeAt(0) - 97 + 1;
      if (c >= "A" && c <= "Z") {
        const type = CLUE_LETTERS[c];
        if (type === undefined)
          return { ok: false, error: "Invalid clue in description." };
        let num = "";
        while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") num += desc[i++];
        const value = num ? Number.parseInt(num, 10) : 0; // atoi
        if (value > 99)
          return { ok: false, error: "Number is too high in clue description." };
        clues[pos++] = type | setClueNum(value);
      }
      // Anything else is silently skipped, exactly as upstream.
    }

    if (pos > 0 && pos < cs)
      return { ok: false, error: "Clue description is too short." };
  }

  return { ok: true, value: { grid, flags, clues } };
}

export function validateDesc(p: MathraxParams, desc: string): string | null {
  const r = loadGame(p, desc);
  return r.ok ? null : r.error;
}

export function newState(p: MathraxParams, desc: string): MathraxState {
  const r = loadGame(p, desc);
  if (!r.ok) throw new Error(`mathrax: ${r.error}`);
  return {
    params: p,
    grid: r.value.grid,
    flags: r.value.flags,
    marks: new Int32Array(p.o * p.o),
    clues: r.value.clues,
    completed: false,
    cheated: false,
  };
}

// --- live validity ---------------------------------------------------------

export const STATUS_COMPLETE = 0;
export const STATUS_UNFINISHED = 1;
export const STATUS_INVALID = 2;

/** Upstream `BIT(d)` — the *solver-side* convention, bit `d − 1`. Used by
 * {@link mathraxOptions} / {@link mathraxValidate} and `solver.ts` only; the
 * player's pencil marks use `1 << n` (see the module note). */
export function bitOf(d: number): number {
  return 1 << (d - 1);
}

/** "No constraint" — upstream returns `~0` (every bit of an `unsigned int`).
 * Kept as `~0` rather than masked to `(1 << o) − 1`: it composes identically
 * under `&`, and the `simple` early return below hands it straight back, where
 * narrowing it would be a *different* value and could change a solver verdict —
 * which, on a solver-gated generator, changes the description (playbook §4.4). */
const ALL_DIGITS = ~0;

/**
 * The digits this cell may hold given `clue` at one of its corners and `mark`,
 * the candidate mask of the cell diagonally opposite (upstream
 * `mathrax_options`). Arithmetic clues enumerate every `(a, b)` pair satisfying
 * the operation; `E`/`O` return the fixed even/odd masks; equality arrives as
 * `CLUE_SUB` with number 0, so `|a − b| == 0` handles it.
 *
 * `simple` is the Easy-difficulty gate: only read an arithmetic clue when the
 * opposite cell is *confirmed* (a single candidate bit).
 *
 * Shared with {@link mathraxValidate}, which is why it lives here rather than in
 * `solver.ts` — a clue's admissible digits are the clue's meaning.
 */
export function mathraxOptions(clue: number, mark: number, simple: boolean): number {
  const type = clueType(clue);
  switch (type) {
    case CLUE_ADD:
    case CLUE_SUB:
    case CLUE_MUL:
    case CLUE_DIV: {
      if (simple && mark & (mark - 1)) return ALL_DIGITS;

      const cnum = clueNum(clue);
      let ret = 0;
      // Upstream enumerates 1..9 regardless of the grid order; the caller's
      // candidate mask is what bounds the result.
      for (let a = 1; a <= 9; a++) {
        if (!(mark & bitOf(a))) continue;
        for (let b = 1; b <= 9; b++) {
          const hi = Math.max(a, b);
          const lo = Math.min(a, b);
          if (
            (type === CLUE_ADD && a + b === cnum) ||
            (type === CLUE_SUB && Math.abs(a - b) === cnum) ||
            (type === CLUE_MUL && a * b === cnum) ||
            (type === CLUE_DIV && ((hi / lo) | 0) === cnum && hi % lo === 0)
          ) {
            ret |= bitOf(b);
          }
        }
      }
      return ret;
    }
    case CLUE_EVN:
      return 0xaa; // 2, 4, 6, 8
    case CLUE_ODD:
      return 0x155; // 1, 3, 5, 7, 9
    default:
      return ALL_DIGITS;
  }
}

/**
 * Recompute every cell's `FE_*` error bits in place and report whether the board
 * is complete, unfinished, or self-contradictory (upstream
 * `mathrax_validate_game`). A cell is flagged `FE_COUNT` when its digit repeats
 * in its row or column, and `FE_TOPLEFT`/… when the clue at that corner admits
 * no pairing between this cell and the one diagonally opposite it.
 *
 * Upstream's `is_solver` parameter (read the cell's marks instead of "any digit"
 * for a blank cell) is never passed `true` by the shipped game, so only that
 * branch is ported (playbook §4.4: port the shipped behaviour).
 */
export function mathraxValidate(
  o: number,
  grid: Uint8Array,
  clues: Int32Array,
  flags: Uint8Array,
): number {
  const co = o - 1;
  const maxbits = (1 << o) - 1;
  let ret = STATUS_COMPLETE;

  // Row/column occurrence counts: `counts[(d−1)·o + y]` for rows, offset by o²
  // for columns.
  const counts = new Int32Array(o * o * 2);
  for (let x = 0; x < o; x++) {
    for (let y = 0; y < o; y++) {
      flags[y * o + x] &= ~FE_ERRORMASK;
      const d = grid[y * o + x];
      if (!d) continue;
      counts[(d - 1) * o + y]++;
      counts[(d - 1) * o + o * o + x]++;
    }
  }

  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      const d = grid[y * o + x];
      const bits = d ? bitOf(d) : maxbits;

      if (!d) {
        if (ret === STATUS_COMPLETE) ret = STATUS_UNFINISHED;
      } else if (counts[(d - 1) * o + y] > 1 || counts[(d - 1) * o + o * o + x] > 1) {
        flags[y * o + x] |= FE_COUNT;
      }

      // Each of the (up to) four incident clues: does it admit *any* pairing
      // between this cell and the one diagonally across the intersection?
      if (y < o - 1 && x < o - 1)
        checkCorner(
          grid,
          clues,
          flags,
          o,
          x,
          y,
          y * co + x,
          y + 1,
          x + 1,
          bits,
          FE_BOTRIGHT,
        );
      if (y > 0 && x < o - 1)
        checkCorner(
          grid,
          clues,
          flags,
          o,
          x,
          y,
          (y - 1) * co + x,
          y - 1,
          x + 1,
          bits,
          FE_TOPRIGHT,
        );
      if (y < o - 1 && x > 0)
        checkCorner(
          grid,
          clues,
          flags,
          o,
          x,
          y,
          y * co + x - 1,
          y + 1,
          x - 1,
          bits,
          FE_BOTLEFT,
        );
      if (y > 0 && x > 0)
        checkCorner(
          grid,
          clues,
          flags,
          o,
          x,
          y,
          (y - 1) * co + x - 1,
          y - 1,
          x - 1,
          bits,
          FE_TOPLEFT,
        );

      if (flags[y * o + x] & FE_ERRORMASK) ret = STATUS_INVALID;
    }
  }

  return ret;
}

/** One incident-clue check of {@link mathraxValidate}: flag `bit` on `(x, y)`
 * when the clue at `clueIdx` admits no digit consistent with both this cell's
 * candidate `bits` and the cell diagonally opposite at `(ox, oy)`. */
function checkCorner(
  grid: Uint8Array,
  clues: Int32Array,
  flags: Uint8Array,
  o: number,
  x: number,
  y: number,
  clueIdx: number,
  oy: number,
  ox: number,
  bits: number,
  bit: number,
): void {
  const maxbits = (1 << o) - 1;
  const other = grid[oy * o + ox];
  const opts = mathraxOptions(clues[clueIdx], other ? bitOf(other) : maxbits, false);
  if (!(opts & bits)) flags[y * o + x] |= bit;
}

// --- moves -----------------------------------------------------------------

export type MathraxMove =
  /** Enter (or pencil-toggle) digit `n` at `(x, y)`; `n = 0` clears. */
  | { type: "set"; x: number; y: number; n: number; pencil: boolean }
  /** Fill every empty cell's pencil marks (the `M` key / mark-all button). */
  | { type: "pencilAll" }
  /** Strike the listed pencil candidates atomically (the adaptive second press
   * of mark-all, and a future hint's elimination step); idempotent. */
  | { type: "pencilStrike"; marks: { x: number; y: number; n: number }[] }
  /** Auto-solve: write the solution into every non-given cell. */
  | { type: "solve"; grid: number[] };

// --- ui --------------------------------------------------------------------

export interface MathraxUi {
  /** Highlighted cell. */
  hx: number;
  hy: number;
  /** The highlight is shown. */
  cshow: boolean;
  /** The highlight was last moved by the keyboard (so a digit entry keeps it). */
  ckey: boolean;
  /** The highlight is in pencil-mark mode. */
  cpencil: boolean;
  /** Preference (default on, fork addition): right-click toggles a *sticky*
   * pencil mode rather than selecting one cell for one mark. */
  pencilSticky: boolean;
}

export function newUi(_state: MathraxState): MathraxUi {
  return {
    hx: 0,
    hy: 0,
    cshow: false,
    ckey: false,
    cpencil: false,
    pencilSticky: true,
  };
}
