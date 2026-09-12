/**
 * Types and pure state helpers for Solo (Sudoku) — the state/codec parts of
 * `solo.c`.
 *
 * A board is a `cr × cr` grid (`cr = c·r`) of digits `1..cr`. The player fills
 * every cell so each row, column, and sub-block holds every digit once, with a
 * subset of cells given (immutable). Four composable variants:
 *
 *  - **standard** — rectangular `c × r` sub-blocks.
 *  - **jigsaw** (`r === 1`) — irregular sub-blocks from a block partition.
 *  - **X** (`xtype`) — the two main diagonals must also hold every digit.
 *  - **killer** (`killer`) — a second cage partition with digit-sum clues.
 *
 * The block partition(s) and given cells are immutable (shared by reference);
 * the working `grid` and `pencil` bitmaps are cloned per move.
 *
 * The codecs transcribe `solo.c`'s and are held to it by the byte-match
 * differential: the block-structure run-length encoding's 'z' handling must
 * match `solo.c` exactly, so do not copy Keen's, whose convention differs.
 */

import { digitValue, parseLeadingInt } from "../../engine/decimal.ts";
import { tierNames } from "../../engine/difficulty.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { newCursor } from "../../engine/pointer.ts";

// --- difficulty (standard axis) --------------------------------------------
// DIFF_AMBIGUOUS and DIFF_IMPOSSIBLE are solver verdicts, not params.

export const DIFF_BLOCK = 0; // "Easy"
export const DIFF_SIMPLE = 1; // "Normal"
export const DIFF_INTERSECT = 2; // "Tricky"
export const DIFF_SET = 3; // "Hard"
export const DIFF_EXTREME = 4; // "Extreme"
export const DIFF_RECURSIVE = 5; // "Unreasonable"
export const DIFF_AMBIGUOUS = 6;
export const DIFF_IMPOSSIBLE = 7;
const DIFFCOUNT = 6; // number of selectable difficulties

export const DIFF_NAMES = tierNames(DIFFCOUNT, { search: true });

/** `solo_diffchars`: the public encoding writes a tier as `d<char>`. */
const DIFF_CHARS = "tbiaeu";

// --- killer difficulty (independent axis) ----------------------------------
// kdiff is fixed per preset, so it has neither a param encoding nor display
// names.

export const DIFF_KSINGLE = 0;
export const DIFF_KMINMAX = 1;
export const DIFF_KSUMS = 2;
export const DIFF_KINTERSECT = 3;

// --- symmetry --------------------------------------------------------------

export const SYMM_NONE = 0;
export const SYMM_ROT2 = 1;
const SYMM_ROT4 = 2;
const SYMM_REF2 = 3;
const SYMM_REF2D = 4;
const SYMM_REF4 = 5;
export const SYMM_REF4D = 6;
const SYMM_REF8 = 7;

/**
 * The image cells of `(x, y)` under symmetry `s` (including `(x, y)` itself),
 * written into `output` as `[x0, y0, x1, y1, …]`; returns the count. Faithful to
 * `symmetries()` — the order is RNG-relevant for the generator, so keep it.
 */
export function symmetries(
  cr: number,
  x: number,
  y: number,
  output: number[],
  s: number,
): number {
  let i = 0;
  const add = (ax: number, ay: number) => {
    output[2 * i] = ax;
    output[2 * i + 1] = ay;
    i++;
  };
  add(x, y);
  switch (s) {
    case SYMM_NONE:
      break;
    case SYMM_ROT2:
      add(cr - 1 - x, cr - 1 - y);
      break;
    case SYMM_ROT4:
      add(cr - 1 - y, x);
      add(y, cr - 1 - x);
      add(cr - 1 - x, cr - 1 - y);
      break;
    case SYMM_REF2:
      add(cr - 1 - x, y);
      break;
    case SYMM_REF2D:
      add(y, x);
      break;
    case SYMM_REF4:
      add(cr - 1 - x, y);
      add(x, cr - 1 - y);
      add(cr - 1 - x, cr - 1 - y);
      break;
    case SYMM_REF4D:
      add(y, x);
      add(cr - 1 - x, cr - 1 - y);
      add(cr - 1 - y, cr - 1 - x);
      break;
    case SYMM_REF8:
      add(cr - 1 - x, y);
      add(x, cr - 1 - y);
      add(cr - 1 - x, cr - 1 - y);
      add(y, x);
      add(y, cr - 1 - x);
      add(cr - 1 - y, x);
      add(cr - 1 - y, cr - 1 - x);
      break;
  }
  return i;
}

// --- diagonals (X-type) ----------------------------------------------------
// diag0 = top-left → bottom-right; diag1 = top-right → bottom-left.

export function diag0(i: number, cr: number): number {
  return i * (cr + 1);
}
export function diag1(i: number, cr: number): number {
  return (i + 1) * (cr - 1);
}
export function onDiag0(xy: number, cr: number): boolean {
  return xy % (cr + 1) === 0;
}
export function onDiag1(xy: number, cr: number): boolean {
  return xy % (cr - 1) === 0 && xy > 0 && xy < cr * cr - 1;
}

// --- params ----------------------------------------------------------------

export interface SoloParams {
  c: number;
  r: number;
  symm: number;
  diff: number;
  kdiff: number;
  xtype: boolean;
  killer: boolean;
}

export function defaultParams(): SoloParams {
  return {
    c: 3,
    r: 3,
    symm: SYMM_ROT2,
    diff: DIFF_BLOCK,
    kdiff: DIFF_KINTERSECT,
    xtype: false,
    killer: false,
  };
}

/** `encode_params`' symmetry suffixes; the default, 2-way rotation, has none. */
const SYMM_CODES: Record<number, string> = {
  [SYMM_NONE]: "a",
  [SYMM_ROT4]: "r4",
  [SYMM_REF2]: "m2",
  [SYMM_REF2D]: "md2",
  [SYMM_REF4]: "m4",
  [SYMM_REF4D]: "md4",
  [SYMM_REF8]: "m8",
};

/** Faithful to `encode_params`. */
export function encodeParams(p: SoloParams, full: boolean): string {
  let str = p.r > 1 ? `${p.c}x${p.r}` : `${p.c}j`;
  if (p.xtype) str += "x";
  if (p.killer) str += "k";
  if (full) {
    str += SYMM_CODES[p.symm] ?? "";
    // The default tier, `dt`, is omitted.
    if (p.diff !== DIFF_BLOCK && DIFF_CHARS[p.diff]) str += `d${DIFF_CHARS[p.diff]}`;
  }
  return str;
}

/** Faithful to `decode_params` — lenient (eats unknown chars). */
export function decodeParams(s: string): SoloParams {
  const ret = defaultParams();
  let i = 0;
  const readInt = (): number => {
    const r = parseLeadingInt(s, i);
    i = r.next;
    return r.value;
  };

  let seenR = false;
  ret.c = ret.r = readInt();
  if (s[i] === "x") {
    i++;
    ret.r = readInt();
    seenR = true;
  }
  while (i < s.length) {
    const ch = s[i];
    if (ch === "j") {
      i++;
      if (seenR) ret.c *= ret.r;
      ret.r = 1;
    } else if (ch === "x") {
      i++;
      ret.xtype = true;
    } else if (ch === "k") {
      i++;
      ret.killer = true;
    } else if (ch === "r" || ch === "m" || ch === "a") {
      const sc = s[i++];
      let sd = false;
      if (sc === "m" && s[i] === "d") {
        sd = true;
        i++;
      }
      const sn = readInt();
      if (sc === "m" && sn === 8) ret.symm = SYMM_REF8;
      if (sc === "m" && sn === 4) ret.symm = sd ? SYMM_REF4D : SYMM_REF4;
      if (sc === "m" && sn === 2) ret.symm = sd ? SYMM_REF2D : SYMM_REF2;
      if (sc === "r" && sn === 4) ret.symm = SYMM_ROT4;
      if (sc === "r" && sn === 2) ret.symm = SYMM_ROT2;
      if (sc === "a") ret.symm = SYMM_NONE;
    } else if (ch === "d") {
      i++;
      const diff = DIFF_CHARS.indexOf(s[i]);
      if (diff >= 0) {
        i++;
        ret.diff = diff;
      }
    } else {
      i++; // eat unknown character
    }
  }
  return ret;
}

const ORDER_MAX = 255;

/** Faithful to `validate_params`. */
export function validateParams(p: SoloParams, _full: boolean): string | null {
  if (p.c < 2) return "Both dimensions must be at least 2";
  if (p.c > ORDER_MAX || p.r > ORDER_MAX)
    return `Dimensions greater than ${ORDER_MAX} are not supported`;
  if (p.c * p.r > 31)
    return "Unable to support more than 31 distinct symbols in a puzzle";
  if (p.killer && p.c * p.r > 9)
    return "Killer puzzle dimensions must be smaller than 10";
  if (p.xtype && p.c * p.r < 4) return "X-type puzzle dimensions must be larger than 3";
  return null;
}

// --- block structure -------------------------------------------------------

/**
 * One partition of the `cr × cr` grid into `nrBlocks` regions: the standard /
 * jigsaw sub-blocks, or (for killer) the cages. `whichblock[cell]` is the
 * region index; `blocks[b]` is the ascending cell list of region `b`. Immutable
 * once built; shared across cloned states.
 */
export interface BlockStructure {
  cr: number;
  nrBlocks: number;
  whichblock: Int32Array;
  blocks: number[][];
}

/** Build region cell-lists from `whichblock` (faithful to
 * `make_blocks_from_whichblock`: ascending cell order within each region). */
export function makeBlocksFromWhichblock(
  cr: number,
  nrBlocks: number,
  whichblock: Int32Array,
): BlockStructure {
  const blocks: number[][] = Array.from({ length: nrBlocks }, () => []);
  for (let i = 0; i < cr * cr; i++) blocks[whichblock[i]].push(i);
  return { cr, nrBlocks, whichblock, blocks };
}

/** Standard rectangular `c × r` sub-blocks (faithful to `new_game`'s formula). */
export function rectangularBlocks(c: number, r: number): BlockStructure {
  const cr = c * r;
  const whichblock = new Int32Array(cr * cr);
  for (let y = 0; y < cr; y++)
    for (let x = 0; x < cr; x++)
      whichblock[y * cr + x] = ((y / c) | 0) * c + ((x / r) | 0);
  // The formula yields exactly cr distinct block indices.
  return makeBlocksFromWhichblock(cr, cr, whichblock);
}

/** Assign block indices in order of first canonical appearance (faithful to
 * `dsf_to_blocks`). */
export function blocksFromDsf(dsf: Dsf, cr: number): BlockStructure {
  const area = cr * cr;
  const whichblock = new Int32Array(area).fill(-1);
  let nb = 0;
  for (let i = 0; i < area; i++) {
    const j = dsf.canonify(i);
    if (whichblock[j] < 0) whichblock[j] = nb++;
    whichblock[i] = whichblock[j];
  }
  return makeBlocksFromWhichblock(cr, nb, whichblock);
}

// --- grid codec ------------------------------------------------------------

/** Faithful to `encode_grid` — run-length blank/digit, no redundant `_`. */
export function encodeGrid(grid: ArrayLike<number>, area: number): string {
  let p = "";
  let run = 0;
  for (let i = 0; i <= area; i++) {
    const n = i < area ? grid[i] : -1;
    if (n === 0) {
      run++;
    } else {
      if (run) {
        // A run of blanks is a letter, `a` = 1 to `z` = 26, as many as it takes.
        for (; run > 26; run -= 26) p += "z";
        p += String.fromCharCode(96 + run);
      } else if (p.length > 0 && n > 0) {
        p += "_";
      }
      if (n > 0) p += String(n);
      run = 0;
    }
  }
  return p;
}

/**
 * Decode a grid spec from `desc` at `start` into `grid`; returns the index just
 * past the spec (at the comma or end). Faithful to `spec_to_grid`.
 */
export function specToGrid(
  desc: string,
  start: number,
  grid: Int8Array | Int32Array,
): number {
  let i = start;
  let idx = 0;
  while (i < desc.length && desc[i] !== ",") {
    const ch = desc[i];
    if (ch >= "a" && ch <= "z") {
      let run = ch.charCodeAt(0) - "a".charCodeAt(0) + 1;
      i++;
      while (run-- > 0) grid[idx++] = 0;
    } else if (ch === "_") {
      i++;
    } else if (digitValue(ch) >= 1) {
      const n = parseLeadingInt(desc, i);
      grid[idx++] = n.value;
      i = n.next;
    } else {
      break;
    }
  }
  return i;
}

/** Faithful to `validate_grid_desc`: returns `{ error, next }`. */
function validateGridDesc(
  desc: string,
  start: number,
  range: number,
  area: number,
): { error: string | null; next: number } {
  let i = start;
  let squares = 0;
  while (i < desc.length && desc[i] !== ",") {
    const ch = desc[i];
    if (ch >= "a" && ch <= "z") {
      squares += ch.charCodeAt(0) - "a".charCodeAt(0) + 1;
      i++;
    } else if (ch === "_") {
      i++;
    } else if (digitValue(ch) >= 1) {
      const n = parseLeadingInt(desc, i);
      const val = n.value;
      i = n.next;
      if (val < 1 || val > range)
        return { error: "Out-of-range number in game description", next: i };
      squares++;
    } else {
      return { error: "Invalid character in game description", next: i };
    }
  }
  if (squares < area) return { error: "Not enough data to fill grid", next: i };
  if (squares > area) return { error: "Too much data to fit in grid", next: i };
  return { error: null, next: i };
}

// --- block-structure codec -------------------------------------------------

/** The two cells either side of block-structure edge `i`: first the edges
 * between horizontal neighbors, row by row, then those between vertical
 * neighbors, column by column. */
function edgeCells(i: number, cr: number): [number, number] {
  if (i < cr * (cr - 1)) {
    const p0 = ((i / (cr - 1)) | 0) * cr + (i % (cr - 1));
    return [p0, p0 + 1];
  }
  const p0 = (i % (cr - 1)) * cr + ((i / (cr - 1)) | 0) - cr;
  return [p0, p0 + cr];
}

/** Faithful to `encode_block_structure_desc`. */
export function encodeBlockStructureDesc(cr: number, blocks: BlockStructure): string {
  let p = "";
  let currrun = 0;
  const A = "a".charCodeAt(0);
  const total = 2 * cr * (cr - 1);
  const isEdge = (i: number): boolean => {
    const [p0, p1] = edgeCells(i, cr);
    return blocks.whichblock[p0] !== blocks.whichblock[p1];
  };
  // `i === total` is a virtual edge that ends the final run.
  for (let i = 0; i <= total; i++) {
    if (i < total && !isEdge(i)) {
      currrun++;
      continue;
    }
    while (currrun > 25) {
      p += "z";
      currrun -= 25;
    }
    p += currrun ? String.fromCharCode(A - 1 + currrun) : "_";
    currrun = 0;
  }
  return p;
}

/**
 * Build a Dsf from a block-structure spec in `desc` at `start`; returns the dsf,
 * an error, and the index past the spec. Faithful to `spec_to_dsf`.
 *
 * Quirk, transcribed verbatim: encode emits `'z'` for a run of **25** non-edges
 * (`while (currrun > 25)`), but decode reads `'z'` as 26 non-edges with no
 * following edge, so the codec is not an inverse for a non-edge run ≥ 26.
 * `solo.c` never produces one (sub-blocks and cages are compact, so runs stay
 * short). The asymmetry stays so descs match the C reference byte-for-byte: do
 * not "fix" decode to 25.
 */
export function specToDsf(
  desc: string,
  start: number,
  cr: number,
): { dsf: Dsf | null; error: string | null; next: number } {
  const area = cr * cr;
  const dsf = new Dsf(area);
  const A = "a".charCodeAt(0);
  let i = start;
  let pos = 0;
  const limit = 2 * cr * (cr - 1);
  while (i < desc.length && desc[i] !== ",") {
    const ch = desc[i];
    let c: number;
    if (ch === "_") c = 0;
    else if (ch >= "a" && ch <= "z") c = ch.charCodeAt(0) - A + 1;
    else return { dsf: null, error: "Invalid character in game description", next: i };
    i++;

    const adv = c !== 26; // 'z' has no following edge: the quirk above
    while (c-- > 0) {
      if (pos >= limit)
        return {
          dsf: null,
          error: "Too much data in block structure specification",
          next: i,
        };
      const [p0, p1] = edgeCells(pos, cr);
      dsf.merge(p0, p1);
      pos++;
    }
    if (adv) pos++;
  }
  if (pos !== limit + 1)
    return {
      dsf: null,
      error: "Not enough data in block structure specification",
      next: i,
    };
  return { dsf, error: null, next: i };
}

/**
 * Validate a block-structure spec (faithful to `validate_block_desc`): build the
 * dsf, then check the region count is in `[minNr, maxNr]` and each region size
 * is in `[minSize, maxSize]`. Returns `{ error, next }`.
 */
function validateBlockDesc(
  desc: string,
  start: number,
  cr: number,
  minNr: number,
  maxNr: number,
  minSize: number,
  maxSize: number,
): { error: string | null; next: number } {
  const { dsf, error, next } = specToDsf(desc, start, cr);
  if (error || !dsf) return { error: error ?? "Invalid block structure", next };
  const area = cr * cr;
  // Count regions and sizes.
  const sizeByRoot = new Map<number, number>();
  for (let i = 0; i < area; i++) {
    const root = dsf.canonify(i);
    sizeByRoot.set(root, (sizeByRoot.get(root) ?? 0) + 1);
  }
  const nr = sizeByRoot.size;
  if (nr < minNr || nr > maxNr)
    return { error: "Wrong number of regions in block structure", next };
  for (const sz of sizeByRoot.values())
    if (sz < minSize || sz > maxSize)
      return { error: "Region of wrong size in block structure", next };
  return { error: null, next };
}

// --- killer cages ----------------------------------------------------------

/** The immutable killer-cage data, shared across cloned states. */
export interface SoloKiller {
  kblocks: BlockStructure;
  /** `area`-length; the cage-sum clue at one cell of each cage, 0 elsewhere. */
  kgrid: Int32Array;
}

/**
 * `check_killer_cage_sum`: −1 if the cage has an empty cell; 0 if full but the
 * sum is wrong; +1 if full and correct.
 */
export function checkKillerCageSum(
  killer: SoloKiller,
  grid: ArrayLike<number>,
  blk: number,
): number {
  const cells = killer.kblocks.blocks[blk];
  let sum = 0;
  let clue = 0;
  for (const xy of cells) {
    if (grid[xy] === 0) return -1;
    sum += grid[xy];
    if (killer.kgrid[xy]) clue = killer.kgrid[xy];
  }
  return sum === clue ? 1 : 0;
}

// --- state -----------------------------------------------------------------

export interface SoloState {
  params: SoloParams;
  cr: number;
  xtype: boolean;
  killer: boolean;
  /** The sub-block partition (rectangular or jigsaw), immutable/shared. */
  blocks: BlockStructure;
  /** Killer cages + sum clues, or null. Immutable/shared. */
  killerData: SoloKiller | null;
  /** `area` working digits (0 = blank); cloned per move. */
  grid: Int8Array;
  /** `area` pencil-mark bitmaps (bit `1<<n` = mark `n`); cloned per move. */
  pencil: Int32Array;
  /** `area` flags: true where the cell is a given (immutable). Shared. */
  immutable: Uint8Array;
  completed: boolean;
  cheated: boolean;
}

export function cloneState(s: SoloState): SoloState {
  return { ...s, grid: s.grid.slice(), pencil: s.pencil.slice() };
}

// --- desc codec (assembly) -------------------------------------------------

/** Faithful to `validate_desc`. */
export function validateDesc(p: SoloParams, desc: string): string | null {
  const cr = p.c * p.r;
  const area = cr * cr;

  let r = validateGridDesc(desc, 0, cr, area);
  if (r.error) return r.error;
  let i = r.next;

  if (p.r === 1) {
    if (desc[i] !== ",") return "Expected jigsaw block structure in game description";
    i++;
    const b = validateBlockDesc(desc, i, cr, cr, cr, cr, cr);
    if (b.error) return b.error;
    i = b.next;
  }
  if (p.killer) {
    if (desc[i] !== ",") return "Expected killer block structure in game description";
    i++;
    const b = validateBlockDesc(desc, i, cr, cr, area, 2, cr);
    if (b.error) return b.error;
    i = b.next;
    if (desc[i] !== ",") return "Expected killer clue grid in game description";
    i++;
    r = validateGridDesc(desc, i, cr * area, area);
    if (r.error) return r.error;
    i = r.next;
  }
  if (i < desc.length) return "Unexpected data at end of game description";
  return null;
}

/** Faithful to `new_game`. */
export function newState(p: SoloParams, desc: string): SoloState {
  const cr = p.c * p.r;
  const area = cr * cr;

  const grid = new Int8Array(area);
  let i = specToGrid(desc, 0, grid);
  const immutable = new Uint8Array(area);
  for (let k = 0; k < area; k++) if (grid[k] !== 0) immutable[k] = 1;

  let blocks: BlockStructure;
  if (p.r === 1) {
    i++; // skip comma
    const { dsf, next } = specToDsf(desc, i, cr);
    if (!dsf) throw new Error("solo: bad jigsaw block structure in newState");
    blocks = blocksFromDsf(dsf, cr);
    i = next;
  } else {
    blocks = rectangularBlocks(p.c, p.r);
  }

  let killerData: SoloKiller | null = null;
  if (p.killer) {
    i++; // skip comma
    const { dsf, next } = specToDsf(desc, i, cr);
    if (!dsf) throw new Error("solo: bad killer block structure in newState");
    const kblocks = blocksFromDsf(dsf, cr);
    i = next;
    i++; // skip comma
    const kgrid = new Int32Array(area);
    i = specToGrid(desc, i, kgrid);
    killerData = { kblocks, kgrid };
  }

  return {
    params: p,
    cr,
    xtype: p.xtype,
    killer: p.killer,
    blocks,
    killerData,
    grid,
    pencil: new Int32Array(area),
    immutable,
    completed: false,
    cheated: false,
  };
}

// --- completion check ------------------------------------------------------

/**
 * `check_valid`: true iff every row, column, block (and diagonal when xtype, and
 * killer cage) contains each digit once and every killer cage sums correctly.
 */
export function checkValid(
  cr: number,
  blocks: BlockStructure,
  killerData: SoloKiller | null,
  xtype: boolean,
  grid: ArrayLike<number>,
): boolean {
  const used = new Uint8Array(cr);
  const holdsEveryDigit = (cells: ArrayLike<number>): boolean => {
    used.fill(0);
    for (let k = 0; k < cells.length; k++) {
      const v = grid[cells[k]];
      if (v > 0 && v <= cr) used[v - 1] = 1;
    }
    return !used.includes(0);
  };
  const line = (cell: (k: number) => number): number[] =>
    Array.from({ length: cr }, (_, k) => cell(k));

  for (let i = 0; i < cr; i++) {
    if (!holdsEveryDigit(line((k) => i * cr + k))) return false; // row i
    if (!holdsEveryDigit(line((k) => k * cr + i))) return false; // column i
  }
  for (let b = 0; b < blocks.nrBlocks; b++)
    if (!holdsEveryDigit(blocks.blocks[b])) return false;
  // Killer cages: at most one of everything, plus correct sum when clued.
  if (killerData) {
    for (let b = 0; b < killerData.kblocks.nrBlocks; b++) {
      used.fill(0);
      for (const cell of killerData.kblocks.blocks[b]) {
        const v = grid[cell];
        if (v > 0 && v <= cr) {
          if (used[v - 1]) return false;
          used[v - 1] = 1;
        }
      }
      if (checkKillerCageSum(killerData, grid, b) !== 1) return false;
    }
  }
  return (
    !xtype ||
    (holdsEveryDigit(line((k) => diag0(k, cr))) &&
      holdsEveryDigit(line((k) => diag1(k, cr))))
  );
}

export function status(s: SoloState): "solved" | "ongoing" {
  return s.completed ? "solved" : "ongoing";
}

// --- moves -----------------------------------------------------------------

export type SoloMove =
  /** Enter (or pencil-toggle) digit `n` at `(x, y)`; `n = 0` clears. `autoElim`
   * (auto-pencil mode, baked at move-creation so replay is deterministic)
   * additionally strikes `n` from the pencil marks of every cell sharing a row,
   * column, block (or diagonal) with `(x, y)` on a real placement. */
  | {
      type: "set";
      x: number;
      y: number;
      n: number;
      pencil: boolean;
      autoElim?: boolean;
    }
  /** Fill every empty cell's pencil marks (the `M` key / fill-all button). */
  | { type: "pencilAll" }
  /** Strike (clear) the listed pencil candidates atomically (hint elimination). */
  | { type: "pencilStrike"; marks: { x: number; y: number; n: number }[] }
  /** Auto-solve to the given full grid. */
  | { type: "solve"; grid: number[] };

// --- ui --------------------------------------------------------------------

export interface SoloUi {
  cursor: GridCursor;
  pencilMode: boolean;
  cursorFromKeyboard: boolean;
  /** Pref (default on; upstream's `PREF_PENCIL_KEEP_HIGHLIGHT` defaults off). */
  pencilKeepHighlight: boolean;
  /** Pref (default on): right-click toggles a sticky pencil mode. */
  pencilSticky: boolean;
  /** Pref (default off): a placement strikes that digit from its row/col/block. */
  autoPencil: boolean;
}

export function newUi(_state: SoloState): SoloUi {
  return {
    cursor: newCursor(),
    pencilMode: false,
    cursorFromKeyboard: false,
    pencilKeepHighlight: true,
    pencilSticky: true,
    // Off by owner decision: notes clear only via the mark-all button or a hint
    // unless the player opts in through the "auto-pencil" pref.
    autoPencil: false,
  };
}

// --- mistakes --------------------------------------------------------------

/** A cell the player's board contradicts the unique solution at. `"cell"` = a
 * wrong filled digit; `"note"` = an empty cell whose notes ruled out its
 * solution digit. */
export interface SoloMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}
