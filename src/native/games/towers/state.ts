/**
 * Types and pure state helpers for Towers (Skyscrapers) — the state/codec
 * parts of `towers.c`.
 *
 * A board is a `w × w` Latin square of tower heights `1..w`. Each cell holds
 * an optional given height (`immutable`, shared by reference) and the player's
 * working height (`grid`) or pencil-mark bitmap (`pencil`). Around the grid sit
 * `4w` edge clues (top row, bottom row, left column, right column), each the
 * count of towers visible from that edge — a taller tower hides every shorter
 * one behind it.
 */

// --- difficulty ------------------------------------------------------------

export type Difficulty = "easy" | "hard" | "extreme" | "unreasonable";

export const DIFF_EASY = 0;
export const DIFF_HARD = 1;
export const DIFF_EXTREME = 2;
export const DIFF_UNREASONABLE = 3;
export const DIFF_COUNT = 4;

const DIFF_CHARS = "ehxu"; // towers_diffchars, indexed by level
const DIFF_NAMES = ["Easy", "Hard", "Extreme", "Unreasonable"];

export function diffToLevel(d: Difficulty): number {
  switch (d) {
    case "hard":
      return DIFF_HARD;
    case "extreme":
      return DIFF_EXTREME;
    case "unreasonable":
      return DIFF_UNREASONABLE;
    default:
      return DIFF_EASY;
  }
}
export function diffFromLevel(level: number): Difficulty {
  switch (level) {
    case DIFF_HARD:
      return "hard";
    case DIFF_EXTREME:
      return "extreme";
    case DIFF_UNREASONABLE:
      return "unreasonable";
    default:
      return "easy";
  }
}
export function diffChar(d: Difficulty): string {
  return DIFF_CHARS[diffToLevel(d)];
}
export function diffName(d: Difficulty): string {
  return DIFF_NAMES[diffToLevel(d)];
}

// --- params ----------------------------------------------------------------

export interface TowersParams {
  w: number;
  diff: Difficulty;
}

export function defaultParams(): TowersParams {
  return { w: 5, diff: "easy" };
}

export function encodeParams(p: TowersParams, full: boolean): string {
  return full ? `${p.w}d${diffChar(p.diff)}` : `${p.w}`;
}

export function decodeParams(s: string): TowersParams {
  const p = defaultParams();
  let i = 0;
  let digits = "";
  while (i < s.length && s[i] >= "0" && s[i] <= "9") digits += s[i++];
  if (digits) p.w = Number.parseInt(digits, 10);
  if (s[i] === "d") {
    i++;
    const idx = DIFF_CHARS.indexOf(s[i] ?? "");
    if (idx >= 0) p.diff = diffFromLevel(idx);
  }
  return p;
}

export function validateParams(p: TowersParams, _full: boolean): string | null {
  if (p.w < 3 || p.w > 9) return "Grid size must be between 3 and 9";
  return null;
}

// --- clue geometry (STARTSTEP / CLUEPOS / clue_index / is_clue) ------------

/**
 * The `w` grid cells along edge-clue `index`'s line, nearest the clue first.
 * `index` runs top row (`0..w-1`), bottom row (`w..2w-1`), left column
 * (`2w..3w-1`), right column (`3w..4w-1`). This is the one piece of shared
 * geometry the solver, generator, error-check and renderer all turn on.
 */
export function lineCells(index: number, w: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (index < w) {
    const x = index;
    for (let j = 0; j < w; j++) out.push({ x, y: j });
  } else if (index < 2 * w) {
    const x = index - w;
    for (let j = 0; j < w; j++) out.push({ x, y: w - 1 - j });
  } else if (index < 3 * w) {
    const y = index - 2 * w;
    for (let j = 0; j < w; j++) out.push({ x: j, y });
  } else {
    const y = index - 3 * w;
    for (let j = 0; j < w; j++) out.push({ x: w - 1 - j, y });
  }
  return out;
}

/** Border coordinate (x or y may be `-1` or `w`) of edge-clue `index`. */
export function cluePos(index: number, w: number): { x: number; y: number } {
  if (index < w) return { x: index, y: -1 };
  if (index < 2 * w) return { x: index - w, y: w };
  if (index < 3 * w) return { x: -1, y: index - 2 * w };
  return { x: w, y: index - 3 * w };
}

/** Inverse of {@link cluePos}: the clue index of a border coordinate, or `-1`
 * when `(x, y)` is not a border cell. */
export function clueIndex(x: number, y: number, w: number): number {
  if (x === -1 || x === w) return w * (x === -1 ? 2 : 3) + y;
  if (y === -1 || y === w) return (y === -1 ? 0 : w) + x;
  return -1;
}

/** True iff `(x, y)` is a border position holding a (nonzero) clue. */
export function isClue(state: TowersState, x: number, y: number): boolean {
  const w = state.w;
  if (
    ((x === -1 || x === w) && y >= 0 && y < w) ||
    ((y === -1 || y === w) && x >= 0 && x < w)
  ) {
    return state.clues[clueIndex(x, y, w)] !== 0;
  }
  return false;
}

// --- state -----------------------------------------------------------------

export interface TowersState {
  w: number;
  diff: Difficulty;
  /** `4w` edge clues (0 = none); immutable, shared by reference. */
  clues: Int32Array;
  /** `w²` given heights (0 = blank); immutable, shared by reference. */
  immutable: Int8Array;
  /** `w²` working heights (0 = blank); cloned per move. */
  grid: Int8Array;
  /** `w²` pencil-mark bitmaps (bit `1<<n` = mark `n`); cloned per move. */
  pencil: Int32Array;
  /** `4w` clue struck-through flags; cloned per move. */
  cluesDone: Uint8Array;
  completed: boolean;
  cheated: boolean;
}

export function cloneState(s: TowersState): TowersState {
  return {
    w: s.w,
    diff: s.diff,
    clues: s.clues, // immutable, shared
    immutable: s.immutable, // immutable, shared
    grid: s.grid.slice(),
    pencil: s.pencil.slice(),
    cluesDone: s.cluesDone.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

// --- moves -----------------------------------------------------------------

export type TowersMove =
  /** Enter (or pencil-toggle) height `n` at `(x, y)`; `n = 0` clears.
   * `autoElim` (auto-pencil mode, decided at move-creation time off the Ui
   * preference, so replay is deterministic) additionally strikes height `n`
   * from the pencil marks of every other cell in the same row and column when
   * this is a real placement. */
  | {
      type: "set";
      x: number;
      y: number;
      n: number;
      pencil: boolean;
      autoElim?: boolean;
    }
  /** Toggle the struck-through state of edge-clue `index`. */
  | { type: "clueDone"; index: number }
  /** Fill in every pencil mark everywhere (the `M` key / fill-all button). */
  | { type: "pencilAll" }
  /** Strike (clear) the listed pencil candidates atomically — a hint's
   * single-firing elimination. Clearing an absent candidate is a no-op, so this
   * is idempotent and resume-safe (unlike a `set` pencil toggle). */
  | { type: "pencilStrike"; marks: { x: number; y: number; n: number }[] }
  /** Auto-solve to the given full grid. */
  | { type: "solve"; grid: number[] };

// --- ui --------------------------------------------------------------------

export interface TowersUi {
  hx: number;
  hy: number;
  hpencil: boolean;
  hshow: boolean;
  hcursor: boolean;
  /** Preference: 3D tower rendering (vs flat 2D digits). Default on. */
  threeD: boolean;
  /** Preference: keep the mouse highlight after a pencil-mark change. */
  pencilKeepHighlight: boolean;
  /** Preference (default on): right-click toggles a *sticky* pencil mode —
   * once on, left-clicks keep entering pencil marks until right-clicked again
   * (mobile-style), instead of every left-click reverting to real entry. */
  pencilSticky: boolean;
  /** Preference (default on): when you place a tower, immediately strike that
   * height from the pencil marks of every other cell in its row and column.
   * When on, hints also skip teaching those trivial eliminations (they happen
   * automatically) and lean on the placement instead. */
  autoPencil: boolean;
}

export function newUi(_state: TowersState): TowersUi {
  return {
    hx: 0,
    hy: 0,
    hpencil: false,
    hshow: false,
    hcursor: false,
    threeD: true,
    pencilKeepHighlight: false,
    pencilSticky: true,
    autoPencil: true,
  };
}

// --- desc codec ------------------------------------------------------------

export function validateDesc(p: TowersParams, desc: string): string | null {
  const w = p.w;
  const a = w * w;
  let i = 0; // string index
  for (let c = 0; c < 4 * w; c++) {
    if (i >= desc.length) return "Too few clues for grid size";
    if (c > 0) {
      if (desc[i] !== "/") return "Expected slashes between clues";
      i++;
    }
    if (desc[i] >= "0" && desc[i] <= "9") {
      let num = "";
      while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") num += desc[i++];
      const clue = Number.parseInt(num, 10);
      if (clue <= 0 || clue > w) return "Clue number out of range";
    }
  }
  if (desc[i] === "/") return "Too many clues for grid size";

  if (desc[i] === ",") {
    let squares = 0;
    i++;
    while (i < desc.length) {
      const ch = desc[i++];
      if (ch >= "a" && ch <= "z") {
        squares += ch.charCodeAt(0) - 97 + 1;
      } else if (ch === "_") {
        // separator, no cell
      } else if (ch > "0" && ch <= "9") {
        let num = ch;
        while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") num += desc[i++];
        const val = Number.parseInt(num, 10);
        if (val < 1 || val > w) return "Out-of-range number in grid description";
        squares++;
      } else {
        return "Invalid character in game description";
      }
    }
    if (squares < a) return "Not enough data to fill grid";
    if (squares > a) return "Too much data to fit in grid";
  }

  if (i < desc.length) return "Rubbish at end of game description";
  return null;
}

export function newState(p: TowersParams, desc: string): TowersState {
  const w = p.w;
  const a = w * w;
  const clues = new Int32Array(4 * w);
  const immutable = new Int8Array(a);
  const grid = new Int8Array(a);

  let i = 0;
  for (let c = 0; c < 4 * w; c++) {
    if (c > 0) i++; // skip '/'
    if (desc[i] >= "0" && desc[i] <= "9") {
      let num = "";
      while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") num += desc[i++];
      clues[c] = Number.parseInt(num, 10);
    }
  }

  if (desc[i] === ",") {
    let pos = 0;
    i++;
    while (i < desc.length) {
      const ch = desc[i++];
      if (ch >= "a" && ch <= "z") {
        pos += ch.charCodeAt(0) - 97 + 1;
      } else if (ch === "_") {
        // separator
      } else if (ch > "0" && ch <= "9") {
        let num = ch;
        while (i < desc.length && desc[i] >= "0" && desc[i] <= "9") num += desc[i++];
        const val = Number.parseInt(num, 10);
        grid[pos] = val;
        immutable[pos] = val;
        pos++;
      }
    }
  }

  return {
    w,
    diff: p.diff,
    clues,
    immutable,
    grid,
    pencil: new Int32Array(a),
    cluesDone: new Uint8Array(4 * w),
    completed: false,
    cheated: false,
  };
}

// --- error checking (check_errors) -----------------------------------------

/**
 * Mark every cell/clue that is currently in error. When `errors` (a `(w+2)²`
 * array, the clue ring + play area) is provided it is filled in; either way
 * the function returns whether any error exists. A full, valid grid has no
 * errors — the completion test (`!checkErrors`) relies on that.
 */
export function checkErrors(state: TowersState, errors?: Uint8Array): boolean {
  const w = state.w;
  const W = w + 2;
  const clues = state.clues;
  const grid = state.grid;
  let errs = false;

  if (errors) errors.fill(0);

  const full = (1 << (w + 1)) - (1 << 1); // bits 1..w set

  // Row duplicates.
  for (let y = 0; y < w; y++) {
    let mask = 0;
    let errmask = 0;
    for (let x = 0; x < w; x++) {
      const bit = 1 << grid[y * w + x];
      errmask |= mask & bit;
      mask |= bit;
    }
    if (mask !== full) {
      errs = true;
      errmask &= ~1;
      if (errors) {
        for (let x = 0; x < w; x++) {
          if (errmask & (1 << grid[y * w + x])) errors[(y + 1) * W + (x + 1)] = 1;
        }
      }
    }
  }

  // Column duplicates.
  for (let x = 0; x < w; x++) {
    let mask = 0;
    let errmask = 0;
    for (let y = 0; y < w; y++) {
      const bit = 1 << grid[y * w + x];
      errmask |= mask & bit;
      mask |= bit;
    }
    if (mask !== full) {
      errs = true;
      errmask &= ~1;
      if (errors) {
        for (let y = 0; y < w; y++) {
          if (errmask & (1 << grid[y * w + x])) errors[(y + 1) * W + (x + 1)] = 1;
        }
      }
    }
  }

  // Clue visibility violations.
  for (let i = 0; i < 4 * w; i++) {
    if (!clues[i]) continue;
    const cells = lineCells(i, w);
    let best = 0;
    let n = 0;
    for (let j = 0; j < w; j++) {
      const number = grid[cells[j].y * w + cells[j].x];
      if (!number) break; // can't tell what happens next
      if (number > best) {
        best = number;
        n++;
      }
    }
    if (n > clues[i] || (best === w && n < clues[i]) || (best < w && n === clues[i])) {
      if (errors) {
        const { x, y } = cluePos(i, w);
        errors[(y + 1) * W + (x + 1)] = 1;
      }
      errs = true;
    }
  }

  return errs;
}

// --- status / text ---------------------------------------------------------

export function status(s: TowersState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

/** ASCII grid with the four clue rims, matching `game_text_format`. */
export function textFormat(s: TowersState): string {
  const w = s.w;
  const clues = s.clues;
  const grid = s.grid;
  const ch = (n: number): string => (n ? String(n) : " ");
  let out = "";

  // Top clue row.
  out += "  ";
  for (let x = 0; x < w; x++) out += ` ${ch(clues[x])}`;
  out += "\n\n";

  // Main grid.
  for (let y = 0; y < w; y++) {
    out += ch(clues[y + 2 * w]);
    out += " ";
    for (let x = 0; x < w; x++) out += ` ${ch(grid[y * w + x])}`;
    out += "  ";
    out += ch(clues[y + 3 * w]);
    out += "\n";
  }

  // Bottom clue row.
  out += "\n  ";
  for (let x = 0; x < w; x++) out += ` ${ch(clues[x + w])}`;
  out += "\n";

  return out;
}
