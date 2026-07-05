/**
 * Magnets state, params, and desc codec — idiomatic TS port of the state half
 * of `magnets.c`. Fill a grid of pre-laid 2×1 dominoes so each domino is
 * either a magnet (one `+`, one `−`) or neutral, no two orthogonally-adjacent
 * cells share a polarity, and each row/column holds its `+`/`−` clue counts.
 *
 * The domino layout and clue counts never change once the game is made, so
 * they live in a frozen `common` shared by reference across a game's states;
 * the working `grid` / `flags` / `countsDone` are cloned per move.
 */
import type { GameStatus } from "../../../puzzle/types.ts";
import type { PresetMenu } from "../../engine/game.ts";
import { parseDimensions } from "../../engine/params.ts";

// --- cell values (upstream: EMPTY == NEUTRAL) -----------------------------
export const EMPTY = 0;
export const NEUTRAL = 0;
export const POSITIVE = 1;
export const NEGATIVE = 2;

/** OPPOSITE(x) = (x·2) % 3: 0→0, 1→2, 2→1. */
export const opposite = (x: number): number => (x * 2) % 3;

// --- flag bits (upstream GS_*) --------------------------------------------
export const GS_ERROR = 1;
export const GS_SET = 2;
export const GS_NOTPOSITIVE = 4;
export const GS_NOTNEGATIVE = 8;
export const GS_NOTNEUTRAL = 16;
export const GS_MARK = 32;
export const GS_NOTMASK = GS_NOTPOSITIVE | GS_NOTNEGATIVE | GS_NOTNEUTRAL;

/** The NOT-flag bit for a given colour (0 for out of range). */
export const notFlag = (which: number): number =>
  which === NEUTRAL
    ? GS_NOTNEUTRAL
    : which === POSITIVE
      ? GS_NOTPOSITIVE
      : which === NEGATIVE
        ? GS_NOTNEGATIVE
        : 0;

// --- difficulty (upstream DIFFLIST: Easy, Tricky) -------------------------
export const DIFF_EASY = 0;
export const DIFF_TRICKY = 1;
export const DIFF_COUNT = 2;
export const DIFF_NAMES = ["Easy", "Tricky"] as const;
export const DIFF_CHARS = "et"; // ENCODE chars, indexed by difficulty

// --- roworcol ------------------------------------------------------------
export const ROW = 0;
export const COLUMN = 1;

// --- types ---------------------------------------------------------------

export interface MagnetsParams {
  w: number;
  h: number;
  diff: number;
  stripclues: boolean;
}

/** The immutable, shared-by-reference domino layout + clue targets. */
export interface MagnetsCommon {
  /** `w·h`: each cell → the index of the other end of its domino (or itself
   * for a singleton square). */
  readonly dominoes: Int32Array;
  /** `3·h`: per row, the `[neutral, positive, negative]` clue targets
   * (`−1` when the clue is absent/stripped). */
  readonly rowcount: Int32Array;
  /** `3·w`: per column, ditto. */
  readonly colcount: Int32Array;
}

export interface MagnetsState {
  readonly w: number;
  readonly h: number;
  readonly wh: number;
  readonly common: MagnetsCommon;
  /** Per-cell EMPTY/POSITIVE/NEGATIVE, cloned per move. */
  readonly grid: Int8Array;
  /** Per-cell GS_SET | GS_ERROR | GS_NOTNEUTRAL, cloned per move. */
  readonly flags: Int32Array;
  /** `2·(w+h)` clue-grey toggles, cloned per move. */
  readonly countsDone: Uint8Array;
  readonly completed: boolean;
  readonly solved: boolean;
}

export type MagnetsMove =
  | { type: "set"; idx: number; which: number }
  | { type: "flag"; idx: number; mode: "neutral" | "notneutral" | "empty" }
  | { type: "clue"; clue: number }
  | { type: "solve"; solution: readonly number[] };

export interface MagnetsUi {
  curX: number;
  curY: number;
  cursorVisible: boolean;
}

/** A player cell whose set value contradicts the unique solution. */
export interface MagnetsMistake {
  x: number;
  y: number;
}

// --- char codec (cloned from singles.c n2c/c2n) --------------------------

export function n2c(num: number): string {
  if (num === -1) return ".";
  if (num < 10) return String.fromCharCode(48 + num);
  if (num < 36) return String.fromCharCode(97 + num - 10);
  return String.fromCharCode(65 + num - 36);
}

export function c2n(c: string): number {
  const code = c.charCodeAt(0);
  if (c >= "0" && c <= "9") return code - 48;
  if (c >= "a" && c <= "z") return code - 97 + 10;
  if (c >= "A" && c <= "Z") return code - 65 + 36;
  return -1;
}

// --- params --------------------------------------------------------------

const PRESETS: MagnetsParams[] = [
  { w: 6, h: 5, diff: DIFF_EASY, stripclues: false },
  { w: 6, h: 5, diff: DIFF_TRICKY, stripclues: false },
  { w: 6, h: 5, diff: DIFF_TRICKY, stripclues: true },
  { w: 8, h: 7, diff: DIFF_EASY, stripclues: false },
  { w: 8, h: 7, diff: DIFF_TRICKY, stripclues: false },
  { w: 8, h: 7, diff: DIFF_TRICKY, stripclues: true },
  { w: 10, h: 9, diff: DIFF_TRICKY, stripclues: false },
  { w: 10, h: 9, diff: DIFF_TRICKY, stripclues: true },
];

export function defaultParams(): MagnetsParams {
  return { ...PRESETS[2] }; // upstream DEFAULT_PRESET = 2
}

export function presets(): PresetMenu<MagnetsParams> {
  return {
    title: "Size",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h} ${DIFF_NAMES[p.diff]}${p.stripclues ? ", strip clues" : ""}`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: MagnetsParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += `d${DIFF_CHARS[p.diff] ?? "?"}${p.stripclues ? "S" : ""}`;
  return s;
}

export function decodeParams(s: string): MagnetsParams {
  const dims = parseDimensions(s, 0);
  const ret: MagnetsParams = {
    w: dims.w,
    h: dims.h,
    diff: DIFF_EASY,
    stripclues: false,
  };
  let i = dims.next;
  if (s[i] === "d") {
    i++;
    if (i < s.length) {
      const idx = DIFF_CHARS.indexOf(s[i]);
      if (idx >= 0) ret.diff = idx;
      i++;
    }
  }
  if (s[i] === "S") {
    ret.stripclues = true;
  }
  return ret;
}

export function validateParams(p: MagnetsParams, _full: boolean): string | null {
  if (p.w < 2) return "Width must be at least two";
  if (p.h < 2) return "Height must be at least two";
  if (p.w > Number.MAX_SAFE_INTEGER / p.h) {
    return "Width times height must not be unreasonably large";
  }
  if (p.diff >= DIFF_TRICKY) {
    if (p.w < 5 && p.h < 5)
      return "Either width or height must be at least five for Tricky";
  } else {
    if (p.w < 3 && p.h < 3) return "Either width or height must be at least three";
  }
  if (p.diff < 0 || p.diff >= DIFF_COUNT) return "Unknown difficulty level";
  return null;
}

// --- desc codec ----------------------------------------------------------
// Desc = COL+ , ROW+ , COL- , ROW- , DOMINOES  (four `.`/digit/letter count
// rows each ended by a comma, then w·h domino chars L/R/T/B/*).

/** Parse one count row of `n` chars into `array[i·3 + off]`. Returns the next
 * read index, or a problem string. */
function readRow(
  desc: string,
  pos: number,
  n: number,
  array: Int32Array,
  off: number,
): { pos: number } | { error: string } {
  for (let i = 0; i < n; i++) {
    const c = desc[pos++];
    if (c === undefined) return { error: "Game description too short" };
    let num: number;
    if (c === ".") num = -1;
    else {
      num = c2n(c);
      if (num < 0) return { error: "Game description contained unexpected characters" };
    }
    array[i * 3 + off] = num;
  }
  if (desc[pos++] !== ",") {
    return { error: "Game description contained unexpected characters" };
  }
  return { pos };
}

interface Parsed {
  dominoes: Int32Array;
  rowcount: Int32Array;
  colcount: Int32Array;
  grid: Int8Array;
  flags: Int32Array;
}

/** Parse a desc into the frozen layout + counts and a fresh grid/flags (with
 * singletons pre-set neutral). Returns a problem string on failure. */
export function parseDesc(p: MagnetsParams, desc: string): Parsed | { error: string } {
  const { w, h } = p;
  const wh = w * h;
  const colcount = new Int32Array(w * 3);
  const rowcount = new Int32Array(h * 3);
  const dominoes = new Int32Array(wh);
  const grid = new Int8Array(wh);
  const flags = new Int32Array(wh);

  let pos = 0;
  for (const [n, array, off] of [
    [w, colcount, POSITIVE],
    [h, rowcount, POSITIVE],
    [w, colcount, NEGATIVE],
    [h, rowcount, NEGATIVE],
  ] as const) {
    const r = readRow(desc, pos, n, array, off);
    if ("error" in r) return r;
    pos = r.pos;
  }

  // Derive neutral counts (== size − pos − neg); a −1 pos/neg ⇒ unknown (−1).
  for (let x = 0; x < w; x++) {
    if (colcount[x * 3 + POSITIVE] < 0 || colcount[x * 3 + NEGATIVE] < 0) {
      colcount[x * 3 + NEUTRAL] = -1;
    } else {
      const neu = h - colcount[x * 3 + POSITIVE] - colcount[x * 3 + NEGATIVE];
      if (neu < 0) return { error: "Column counts inconsistent" };
      colcount[x * 3 + NEUTRAL] = neu;
    }
  }
  for (let y = 0; y < h; y++) {
    if (rowcount[y * 3 + POSITIVE] < 0 || rowcount[y * 3 + NEGATIVE] < 0) {
      rowcount[y * 3 + NEUTRAL] = -1;
    } else {
      const neu = w - rowcount[y * 3 + POSITIVE] - rowcount[y * 3 + NEGATIVE];
      if (neu < 0) return { error: "Row counts inconsistent" };
      rowcount[y * 3 + NEUTRAL] = neu;
    }
  }

  // Domino orientations.
  for (let idx = 0; idx < wh; idx++) {
    let c = desc[pos++];
    while (c === ",") c = desc[pos++]; // spacer, ignore
    if (c === "L") dominoes[idx] = idx + 1;
    else if (c === "R") dominoes[idx] = idx - 1;
    else if (c === "T") dominoes[idx] = idx + w;
    else if (c === "B") dominoes[idx] = idx - w;
    else if (c === "*") dominoes[idx] = idx;
    else {
      return {
        error:
          c === undefined
            ? "Game description too short"
            : "Game description contained unexpected characters",
      };
    }
  }

  // Consistency: each end points back, and to an orthogonal neighbour.
  for (let idx = 0; idx < wh; idx++) {
    const other = dominoes[idx];
    if (
      other < 0 ||
      other >= wh ||
      (other % w !== idx % w && Math.floor(other / w) !== Math.floor(idx / w)) ||
      dominoes[other] !== idx
    ) {
      return { error: "Domino descriptions inconsistent" };
    }
    if (other === idx) {
      grid[idx] = NEUTRAL;
      flags[idx] |= GS_SET;
    }
  }

  return { dominoes, rowcount, colcount, grid, flags };
}

export function validateDesc(p: MagnetsParams, desc: string): string | null {
  const r = parseDesc(p, desc);
  return "error" in r ? r.error : null;
}

export function newState(p: MagnetsParams, desc: string): MagnetsState {
  const r = parseDesc(p, desc);
  if ("error" in r) throw new Error(`magnets newState: ${r.error}`);
  const { w, h } = p;
  return {
    w,
    h,
    wh: w * h,
    common: { dominoes: r.dominoes, rowcount: r.rowcount, colcount: r.colcount },
    grid: r.grid,
    flags: r.flags,
    countsDone: new Uint8Array(2 * (w + h)),
    completed: false,
    solved: false,
  };
}

/** Encode the frozen layout + counts as the upstream desc (byte-faithful). */
export function encodeDesc(
  w: number,
  h: number,
  dominoes: Int32Array,
  rowcount: Int32Array,
  colcount: Int32Array,
): string {
  let out = "";
  for (let x = 0; x < w; x++) out += n2c(colcount[x * 3 + POSITIVE]);
  out += ",";
  for (let y = 0; y < h; y++) out += n2c(rowcount[y * 3 + POSITIVE]);
  out += ",";
  for (let x = 0; x < w; x++) out += n2c(colcount[x * 3 + NEGATIVE]);
  out += ",";
  for (let y = 0; y < h; y++) out += n2c(rowcount[y * 3 + NEGATIVE]);
  out += ",";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const other = dominoes[idx];
      if (other === idx) out += "*";
      else if (other === idx + 1) out += "L";
      else if (other === idx - 1) out += "R";
      else if (other === idx + w) out += "T";
      else if (other === idx - w) out += "B";
      else throw new Error("mad domino orientation");
    }
  }
  return out;
}

export function cloneState(s: MagnetsState): MagnetsState {
  return {
    ...s,
    grid: Int8Array.from(s.grid),
    flags: Int32Array.from(s.flags),
    countsDone: Uint8Array.from(s.countsDone),
  };
}

// --- clue index (border ring) --------------------------------------------

/** Is `(x, y)` a border clue cell? (one of the four one-tile margins). */
export function isClue(w: number, h: number, x: number, y: number): boolean {
  return (
    ((x === -1 || x === w) && y >= 0 && y < h) ||
    ((y === -1 || y === h) && x >= 0 && x < w)
  );
}

/** Ring index into `countsDone` for a border clue cell (upstream clue_index). */
export function clueIndex(w: number, h: number, x: number, y: number): number {
  if (y === -1) return x;
  if (x === w) return w + y;
  if (y === h) return 2 * w + h - x - 1;
  if (x === -1) return 2 * (w + h) - y - 1;
  return -1;
}

// --- counts / completion -------------------------------------------------

const inGrid = (w: number, h: number, x: number, y: number): boolean =>
  x >= 0 && x < w && y >= 0 && y < h;

/** Count cells of colour `which` in a row/column, or (which < 0) the empty,
 * not-yet-set cells. Upstream count_rowcol. */
export function countRowcol(
  state: MagnetsState,
  num: number,
  roworcol: number,
  which: number,
): number {
  const { w, h, grid, flags } = state;
  let i: number;
  let di: number;
  let n: number;
  if (roworcol === ROW) {
    i = num * w;
    di = 1;
    n = w;
  } else {
    i = num;
    di = w;
    n = h;
  }
  let count = 0;
  for (let j = 0; j < n; j++, i += di) {
    if (which < 0) {
      if (grid[i] === EMPTY && !(flags[i] & GS_SET)) count++;
    } else if (grid[i] === which) count++;
  }
  return count;
}

/**
 * Upstream check_completion: set live GS_ERROR on two touching identical
 * terminals, and report over/under-committed clue counts. Mutates `flags`
 * (clears then re-sets GS_ERROR). Returns −1 (wrong) / 0 (incomplete) / 1
 * (complete).
 */
export function checkCompletion(state: MagnetsState): number {
  const { w, h, wh, grid, flags, common } = state;
  const { rowcount, colcount, dominoes } = common;
  let wrong = false;
  let incomplete = false;

  const checkRC = (targets: Int32Array, base: number, count: number) => {
    const target = targets[base];
    if (target === -1) return;
    if (count < target) incomplete = true;
    if (count > target) wrong = true;
  };
  for (const which of [POSITIVE, NEGATIVE]) {
    for (let x = 0; x < w; x++) {
      checkRC(colcount, x * 3 + which, countRowcol(state, x, COLUMN, which));
    }
    for (let y = 0; y < h; y++) {
      checkRC(rowcount, y * 3 + which, countRowcol(state, y, ROW, which));
    }
  }

  for (let i = 0; i < wh; i++) flags[i] &= ~GS_ERROR;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const idx = y * w + x;
      if (dominoes[idx] === idx) continue; // no domino here
      if (!(flags[idx] & GS_SET)) incomplete = true;
      const which = grid[idx];
      if (which !== NEUTRAL) {
        for (const [xx, yy] of [
          [x, y - 1],
          [x, y + 1],
          [x - 1, y],
          [x + 1, y],
        ]) {
          if (inGrid(w, h, xx, yy) && grid[yy * w + xx] === which) {
            wrong = true;
            flags[yy * w + xx] |= GS_ERROR;
            flags[idx] |= GS_ERROR;
          }
        }
      }
    }
  }
  return wrong ? -1 : incomplete ? 0 : 1;
}

// --- moves ---------------------------------------------------------------

export function executeMove(state: MagnetsState, move: MagnetsMove): MagnetsState {
  const next = cloneState(state);
  const { w, wh, grid, flags, common } = next;
  const { dominoes } = common;

  const applyCell = (
    idx: number,
    m: Extract<MagnetsMove, { type: "set" | "flag" }>,
  ) => {
    const idx2 = dominoes[idx];
    if (idx === idx2) throw new Error("magnets: move on a singleton");
    flags[idx] &= ~GS_NOTMASK;
    flags[idx2] &= ~GS_NOTMASK;
    if (m.type === "flag" && (m.mode === "empty" || m.mode === "notneutral")) {
      grid[idx] = EMPTY;
      grid[idx2] = EMPTY;
      flags[idx] &= ~GS_SET;
      flags[idx2] &= ~GS_SET;
      if (m.mode === "notneutral") {
        flags[idx] |= GS_NOTNEUTRAL;
        flags[idx2] |= GS_NOTNEUTRAL;
      }
    } else {
      const which = m.type === "set" ? m.which : NEUTRAL;
      grid[idx] = which;
      grid[idx2] = opposite(which);
      flags[idx] |= GS_SET;
      flags[idx2] |= GS_SET;
    }
  };

  let solved = next.solved;
  switch (move.type) {
    case "set":
    case "flag": {
      if (move.idx < 0 || move.idx >= wh) throw new Error("magnets: move out of range");
      applyCell(move.idx, move);
      break;
    }
    case "clue": {
      if (move.clue < 0 || move.clue >= 2 * (w + next.h)) {
        throw new Error("magnets: clue out of range");
      }
      next.countsDone[move.clue] ^= 1;
      break;
    }
    case "solve": {
      solved = true;
      for (let i = 0; i < wh; i++) {
        if (dominoes[i] === i) continue;
        grid[i] = move.solution[i];
        flags[i] |= GS_SET;
        flags[i] &= ~GS_NOTMASK;
      }
      break;
    }
  }

  const complete = checkCompletion(next) === 1;
  return { ...next, solved, completed: next.completed || complete };
}

export function status(state: MagnetsState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

// --- text format (upstream game_text_format) ------------------------------

export function textFormat(state: MagnetsState): string {
  const { w, h, grid, flags, common } = state;
  const { dominoes, rowcount, colcount } = common;
  const lines: string[] = [];

  // Top row: '+' then column '+' totals.
  let top = "+";
  for (let x = 0; x < w; x++) top += ` ${n2c(colcount[x * 3 + POSITIVE])}`;
  lines.push(top);

  const hborder = ` +${"-".repeat(w * 2 - 1)}+`;
  lines.push(hborder);

  for (let y = 0; y < h; y++) {
    let row = `${n2c(rowcount[y * 3 + POSITIVE])}|`;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      row +=
        dominoes[i] === i
          ? "#"
          : grid[i] === POSITIVE
            ? "+"
            : grid[i] === NEGATIVE
              ? "-"
              : flags[i] & GS_SET
                ? "*"
                : " ";
      if (x < w - 1) row += dominoes[i] === i + 1 ? " " : "|";
    }
    row += `|${n2c(rowcount[y * 3 + NEGATIVE])}`;
    lines.push(row);

    if (y < h - 1) {
      let mid = " |";
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        mid += dominoes[i] === i + w ? " " : "-";
        if (x < w - 1) mid += "+";
      }
      mid += "|";
      lines.push(mid);
    }
  }

  lines.push(hborder);

  let bottom = " ";
  for (let x = 0; x < w; x++) bottom += ` ${n2c(colcount[x * 3 + NEGATIVE])}`;
  bottom += " -";
  lines.push(bottom);

  return `${lines.join("\n")}\n`;
}
