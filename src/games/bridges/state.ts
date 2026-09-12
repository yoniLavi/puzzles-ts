/**
 * Bridges' board model, from upstream's `bridges.c`: a grid of `G_*` flag words,
 * the per-cell line/possible/max counts, and an island list with each island's
 * orthogonal neighbors (`points`). Upstream's refcounted `solver_state` (two
 * dsfs) is not part of the state; the solver builds its own dsf on demand.
 */
import { tierNames } from "../../engine/difficulty.ts";
import type { GridCursor, GridDrag } from "../../engine/pointer.ts";
import { encodeRunLength, scanRunLength } from "../../engine/run-length.ts";

// --- Grid flag bits (bridges.c lines 127-142) ---
export const G_ISLAND = 0x0001;
export const G_LINEV = 0x0002;
export const G_LINEH = 0x0004;
export const G_LINE = G_LINEV | G_LINEH;
export const G_MARKV = 0x0008;
export const G_MARKH = 0x0010;
export const G_MARK = G_MARKV | G_MARKH;
export const G_NOLINEV = 0x0020;
export const G_NOLINEH = 0x0040;
export const G_WARN = 0x0080;
export const G_SWEEP = 0x1000;

const MAX_BRIDGES = 4;

export interface BridgesParams {
  w: number;
  h: number;
  /** Max bridges per direction (1..MAX_BRIDGES). */
  maxb: number;
  /** Percentage of grid squares that are islands (generation). */
  islands: number;
  /** Expansion factor, percentage (generation). */
  expansion: number;
  allowloops: boolean;
  /** Tier index into {@link DIFFICULTY_NAMES}. */
  difficulty: number;
}

/** One orthogonal direction from an island (bridges.c `struct surrounds`). */
export interface SurroundPoint {
  /** Immediately-adjacent cell in this direction. */
  x: number;
  y: number;
  /** Unit direction. */
  dx: number;
  dy: number;
  /** Distance (in cells) to the next island this way, or 0 if none. */
  off: number;
}

/** An island (clue) and its adjacency (bridges.c `struct island`). */
export interface Island {
  x: number;
  y: number;
  count: number;
  points: SurroundPoint[];
  /** Number of `points` with `off != 0` (reachable orthogonal island). */
  nislands: number;
}

export const DIFFICULTY_NAMES: readonly string[] = tierNames(3);

/** A square board of this size at every tier. */
const presetsOfSize = (size: number): BridgesParams[] =>
  DIFFICULTY_NAMES.map((_, difficulty) => ({
    w: size,
    h: size,
    maxb: 2,
    islands: 30,
    expansion: 10,
    allowloops: true,
    difficulty,
  }));

/** Square 7, 10 and 15 boards at every tier, as upstream ships them. */
export const BRIDGES_PRESETS: BridgesParams[] = [
  ...presetsOfSize(7),
  ...presetsOfSize(10),
  ...presetsOfSize(15),
];

export function defaultParams(): BridgesParams {
  return { ...BRIDGES_PRESETS[0] };
}

// --- Params codec (bridges.c decode_params/encode_params/validate_params) ---

/** Reads a leading non-negative integer (0 if none). Returns [value, nextIndex]. */
function eatNum(s: string, i: number): [number, number] {
  let n = 0;
  while (i < s.length && s[i] >= "0" && s[i] <= "9") {
    n = n * 10 + (s.charCodeAt(i) - 48);
    i++;
  }
  return [n, i];
}

export function decodeParams(s: string): BridgesParams {
  const p = defaultParams();
  let i = 0;
  [p.w, i] = eatNum(s, 0);
  p.h = p.w;
  if (s[i] === "x") {
    i++;
    [p.h, i] = eatNum(s, i);
  }
  if (s[i] === "i") {
    i++;
    [p.islands, i] = eatNum(s, i);
  }
  if (s[i] === "e") {
    i++;
    [p.expansion, i] = eatNum(s, i);
  }
  if (s[i] === "m") {
    i++;
    [p.maxb, i] = eatNum(s, i);
  }
  if (s[i] === "L") {
    i++;
    p.allowloops = false;
  }
  if (s[i] === "d") {
    i++;
    [p.difficulty, i] = eatNum(s, i);
  }
  return p;
}

export function encodeParams(p: BridgesParams, full: boolean): string {
  if (full) {
    return `${p.w}x${p.h}i${p.islands}e${p.expansion}m${p.maxb}${
      p.allowloops ? "" : "L"
    }d${p.difficulty}`;
  }
  return `${p.w}x${p.h}m${p.maxb}${p.allowloops ? "" : "L"}`;
}

export function validateParams(p: BridgesParams, full: boolean): string | null {
  if (p.w < 3 || p.h < 3) return "Width and height must be at least 3";
  if (p.w > Math.floor(0x7fffffff / p.h))
    return "Width times height must not be unreasonably large";
  if (p.maxb < 1 || p.maxb > MAX_BRIDGES) return "Too many bridges.";
  if (full) {
    if (p.islands <= 0 || p.islands > 30)
      return "%age of island squares must be between 1% and 30%";
    if (p.expansion < 0 || p.expansion > 100)
      return "Expansion factor must be between 0 and 100";
  }
  return null;
}

// --- Move / UI types ---

/** A single move op (one token in the C `;`-separated move grammar). */
export type BridgesOp =
  | { op: "S" } // mark this a solver-produced solution (suppresses win flash)
  | { op: "L"; x1: number; y1: number; x2: number; y2: number; n: number } // set n bridges
  | { op: "N"; x1: number; y1: number; x2: number; y2: number } // toggle no-line
  | { op: "M"; x: number; y: number }; // toggle island mark

/** A move is a sequence of ops (a drag is one L/N; solve/hint is many). */
export interface BridgesMove {
  ops: BridgesOp[];
}

export interface BridgesUi {
  /**
   * The drag's source island (`sx`, `sy`) and the island it currently points at
   * (`ex`, `ey`), or `-1` there when the direction resolves to none.
   *
   * **The far end is derived, not the pointer.** `updateDragDst` picks an axis
   * from the pointer's offset and resolves the island along it; Bridges never
   * stores a raw pointer position. That is the same reading the rest of the
   * collection uses — Tents and Boats snap the far end to an axis and Tracks
   * clamps it to the grid, so `ex`/`ey` has always meant *the far end as the
   * game understands it*.
   */
  drag: GridDrag;
  /** Whether the pointer has **left the source island**, making this a bridge
   * drag rather than a click that toggles the island's mark. Not liveness: a
   * press on an island is live immediately, and only moving off it aims. */
  aiming: boolean;
  todraw: number;
  dragIsNoline: boolean;
  nlines: number;
  cursor: GridCursor;
  /** Upstream's "show hints" preference: draw a bevel line along every span a
   * bridge *could* run down. Not the hint system, whose colors and marks are
   * `render.ts`'s `COL_HINT`. */
  showPossible: boolean;
  /** Fork aid: gray an island once its bridge count is met. Purely visual:
   * unlike a manual mark, it does not lock the island's bridges. */
  autoMark: boolean;
}

/** A wrongly-placed bridge from findMistakes, by its two island endpoints. */
export interface BridgesMistake {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The Bridges board. Mutable during generation/solving; treated as immutable by
 * the midend, which clones (`clone()`) before applying a move. The island list,
 * their adjacency and the `gridi` reverse index are fixed after generation, so
 * `clone()` shares them by reference and deep-copies only the mutable per-cell
 * arrays. A solver/generator working copy (`workingCopy()`) additionally
 * deep-copies the islands + gridi so mutation never aliases a play state.
 */
export class BridgesState {
  readonly w: number;
  readonly h: number;
  readonly maxb: number;
  readonly allowloops: boolean;
  readonly params: BridgesParams;

  grid: Uint16Array;
  lines: Uint8Array;
  possv: Uint8Array;
  possh: Uint8Array;
  maxv: Uint8Array;
  maxh: Uint8Array;

  islands: Island[];
  /** cell index -> island index, or -1. */
  gridi: Int32Array;

  completed = false;
  solved = false;

  private constructor(params: BridgesParams, share?: BridgesState) {
    this.w = params.w;
    this.h = params.h;
    this.maxb = params.maxb;
    this.allowloops = params.allowloops;
    this.params = params;
    const wh = params.w * params.h;

    if (share) {
      // clone: deep-copy mutable arrays, share fixed structures by reference.
      this.grid = share.grid.slice();
      this.lines = share.lines.slice();
      this.possv = share.possv.slice();
      this.possh = share.possh.slice();
      this.maxv = share.maxv.slice();
      this.maxh = share.maxh.slice();
      this.islands = share.islands;
      this.gridi = share.gridi;
      this.completed = share.completed;
      this.solved = share.solved;
    } else {
      this.grid = new Uint16Array(wh);
      this.lines = new Uint8Array(wh);
      this.possv = new Uint8Array(wh);
      this.possh = new Uint8Array(wh);
      this.maxv = new Uint8Array(wh).fill(params.maxb);
      this.maxh = new Uint8Array(wh).fill(params.maxb);
      this.islands = [];
      this.gridi = new Int32Array(wh).fill(-1);
    }
  }

  static empty(params: BridgesParams): BridgesState {
    return new BridgesState(params);
  }

  clone(): BridgesState {
    return new BridgesState(this.params, this);
  }

  /**
   * A working copy for the solver/generator to mutate freely — islands and the
   * gridi index are copied (deeply) so mutation (adding islands, recomputing
   * `off`/`count`) never aliases a play state's shared structures.
   */
  workingCopy(): BridgesState {
    const c = this.clone();
    c.islands = this.islands.map((is) => ({
      x: is.x,
      y: is.y,
      count: is.count,
      nislands: is.nislands,
      points: is.points.map((pt) => ({ ...pt })),
    }));
    c.gridi = this.gridi.slice();
    return c;
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inGrid(x: number, y: number): boolean {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }

  gridAt(x: number, y: number): number {
    return this.grid[y * this.w + x];
  }

  islandAt(x: number, y: number): Island | null {
    const i = this.gridi[y * this.w + x];
    return i < 0 ? null : this.islands[i];
  }

  /** Bridge count in a direction if the flag is set (C `GRIDCOUNT`). */
  gridCount(x: number, y: number, flag: number): number {
    return this.grid[y * this.w + x] & flag ? this.lines[y * this.w + x] : 0;
  }

  /** Possibles in a direction — dx != 0 means horizontal (C `POSSIBLES`). */
  possibles(dx: number, x: number, y: number): number {
    return dx ? this.possh[y * this.w + x] : this.possv[y * this.w + x];
  }

  maximum(dx: number, x: number, y: number): number {
    return dx ? this.maxh[y * this.w + x] : this.maxv[y * this.w + x];
  }

  // --- Island construction (bridges.c island_set_surrounds/find_orthogonal/add) ---

  private setSurrounds(is: Island): void {
    const pts: SurroundPoint[] = [];
    const add = (cond: boolean, ddx: number, ddy: number) => {
      if (cond) pts.push({ x: is.x + ddx, y: is.y + ddy, dx: ddx, dy: ddy, off: 0 });
    };
    // Order (left, right, up, down) is RNG-relevant — the generator picks points[j].
    add(is.x > 0, -1, 0);
    add(is.x < this.w - 1, 1, 0);
    add(is.y > 0, 0, -1);
    add(is.y < this.h - 1, 0, 1);
    is.points = pts;
    is.nislands = 0;
  }

  islandFindOrthogonal(is: Island): void {
    is.nislands = 0;
    for (const pt of is.points) {
      let x = is.x + pt.dx;
      let y = is.y + pt.dy;
      let off = 1;
      pt.off = 0;
      while (this.inGrid(x, y)) {
        if (this.gridAt(x, y) & G_ISLAND) {
          pt.off = off;
          is.nislands++;
          break;
        }
        off++;
        x += pt.dx;
        y += pt.dy;
      }
    }
  }

  mapFindOrthogonal(): void {
    for (const is of this.islands) this.islandFindOrthogonal(is);
  }

  islandAdd(x: number, y: number, count: number): Island {
    this.grid[y * this.w + x] |= G_ISLAND;
    const is: Island = { x, y, count, points: [], nislands: 0 };
    this.setSurrounds(is);
    this.gridi[y * this.w + x] = this.islands.length;
    this.islands.push(is);
    return is;
  }

  islandOrthX(is: Island, j: number): number {
    return is.x + is.points[j].off * is.points[j].dx;
  }

  islandOrthY(is: Island, j: number): number {
    return is.y + is.points[j].off * is.points[j].dy;
  }

  islandHasbridge(is: Island, direction: number): boolean {
    const pt = is.points[direction];
    const gline = pt.dx ? G_LINEH : G_LINEV;
    return (this.gridAt(pt.x, pt.y) & gline) !== 0;
  }

  islandFindConnection(is: Island, adjpt: number): Island | null {
    if (!is.points[adjpt].off) return null;
    if (!this.islandHasbridge(is, adjpt)) return null;
    return this.islandAt(this.islandOrthX(is, adjpt), this.islandOrthY(is, adjpt));
  }

  /**
   * Write bridges/no-lines/max along the span between two orthogonal islands.
   * n = -1 toggles the NOLINE flags; n = 0 clears the line; n > 0 sets n bridges.
   * `isMax` writes into maxv/maxh instead.
   */
  islandJoin(i1: Island, i2: Island, n: number, isMax: boolean): void {
    const dx = Math.sign(i2.x - i1.x);
    const dy = Math.sign(i2.y - i1.y);
    if (dx && dy) throw new Error("islandJoin: islands not orthogonal");
    const line = dx ? G_LINEH : G_LINEV;
    const noline = dx ? G_NOLINEH : G_NOLINEV;
    const max = dx ? this.maxh : this.maxv;
    const len = Math.abs(i2.x - i1.x) + Math.abs(i2.y - i1.y);
    for (let k = 1; k < len; k++) {
      const c = this.idx(i1.x + k * dx, i1.y + k * dy);
      if (isMax) max[c] = n;
      else if (n < 0) this.grid[c] ^= noline;
      else if (n === 0) this.grid[c] &= ~line;
      else {
        this.grid[c] |= line;
        this.lines[c] = n;
      }
    }
  }

  // --- Island counting helpers (bridges.c) ---

  islandCountbridges(is: Island): number {
    let c = 0;
    for (const pt of is.points) {
      c += this.gridCount(pt.x, pt.y, pt.dx ? G_LINEH : G_LINEV);
    }
    return c;
  }

  islandAdjspace(
    is: Island,
    marks: boolean,
    missing: number,
    direction: number,
  ): number {
    const pt = is.points[direction];
    const gline = pt.dx ? G_LINEH : G_LINEV;
    if (marks) {
      const mline = pt.dx ? G_MARKH : G_MARKV;
      if (this.gridAt(pt.x, pt.y) & mline) return 0;
    }
    return Math.min(
      this.possibles(pt.dx, pt.x, pt.y),
      missing,
      this.maximum(pt.dx, pt.x, pt.y) - this.gridCount(pt.x, pt.y, gline),
    );
  }

  islandCountspaces(is: Island, marks: boolean): number {
    const missing = is.count - this.islandCountbridges(is);
    if (missing < 0) return 0;
    let c = 0;
    for (let i = 0; i < is.points.length; i++) {
      c += this.islandAdjspace(is, marks, missing, i);
    }
    return c;
  }

  /** Returns a bridge *count* (not a boolean) — C `island_isadj`. */
  islandIsadj(is: Island, direction: number): number {
    const pt = is.points[direction];
    const mline = pt.dx ? G_MARKH : G_MARKV;
    const gline = pt.dx ? G_LINEH : G_LINEV;
    if (this.gridAt(pt.x, pt.y) & mline) {
      return this.gridCount(pt.x, pt.y, gline);
    }
    return this.possibles(pt.dx, pt.x, pt.y);
  }

  islandCountadj(is: Island): number {
    let nadj = 0;
    for (let i = 0; i < is.points.length; i++) {
      if (this.islandIsadj(is, i)) nadj++;
    }
    return nadj;
  }

  islandTogglemark(is: Island): void {
    const w = this.w;
    // mark the island...
    this.grid[is.y * w + is.x] ^= G_MARK;
    // ...remove all marks on non-island squares...
    for (let i = 0; i < this.grid.length; i++) {
      if (!(this.grid[i] & G_ISLAND)) this.grid[i] &= ~G_MARK;
    }
    // ...and add marks to squares around marked islands.
    for (const isLoop of this.islands) {
      if (!(this.grid[isLoop.y * w + isLoop.x] & G_MARK)) continue;
      for (const pt of isLoop.points) {
        if (!pt.off) continue;
        for (let o = 1; o < pt.off; o++) {
          const c = (isLoop.y + pt.dy * o) * w + (isLoop.x + pt.dx * o);
          this.grid[c] |= pt.dy ? G_MARKV : G_MARKH;
        }
      }
    }
  }

  /** True when this island can no longer be legally satisfied (C island_impossible). */
  islandImpossible(is: Island, strict: boolean): boolean {
    const curr = this.islandCountbridges(is);
    const nspc = is.count - curr;
    if (nspc < 0) return true; // too many bridges
    if (curr + this.islandCountspaces(is, false) < is.count) return true; // can't reach clue
    if (strict && curr < is.count) return true; // locked but unfinished

    let nsurrspc = 0;
    for (let i = 0; i < is.points.length; i++) {
      const pt = is.points[i];
      const dx = pt.dx;
      if (!pt.off) continue;
      const poss = this.possibles(dx, pt.x, pt.y);
      if (poss === 0) continue;
      const isOrth = this.islandAt(this.islandOrthX(is, i), this.islandOrthY(is, i));
      if (!isOrth) continue;
      const ifree = isOrth.count - this.islandCountbridges(isOrth);
      if (ifree > 0) {
        const bmax = this.maximum(dx, pt.x, pt.y);
        const bcurr = this.gridCount(pt.x, pt.y, dx ? G_LINEH : G_LINEV);
        nsurrspc += Math.min(ifree, bmax - bcurr);
      }
    }
    return nsurrspc < nspc; // surrounding islands can't absorb the rest
  }

  // --- Map-wide helpers (bridges.c) ---

  /** Recompute possv/possh from the current lines. C map_update_possibles. */
  mapUpdatePossibles(): void {
    const { w, h } = this;
    for (let x = 0; x < w; x++) {
      this.updateStripe(x, w, h, this.possv, this.maxv, G_LINEH | G_NOLINEV);
    }
    for (let y = 0; y < h; y++) {
      this.updateStripe(y * w, 1, w, this.possh, this.maxh, G_LINEV | G_NOLINEH);
    }
  }

  /**
   * One column (`step` w) or row (`step` 1) of `mapUpdatePossibles`; its k-th
   * cell is `start + k * step`. A run of cells between two islands can take the
   * lesser of their two clues and the run's per-cell maxima, or nothing if any
   * cell holds a `blockers` flag. Cells outside such a run take nothing.
   */
  private updateStripe(
    start: number,
    step: number,
    len: number,
    poss: Uint8Array,
    max: Uint8Array,
    blockers: number,
  ): void {
    let runStart = -1;
    let runEnd = -1;
    let blocked = false;
    let maxb = 0;
    let k = 0;
    for (; k < len; k++) {
      const island = this.gridi[start + k * step];
      if (island >= 0) {
        maxb = this.islands[island].count;
        break;
      }
      poss[start + k * step] = 0;
    }
    for (; k < len; k++) {
      const c = start + k * step;
      maxb = Math.min(maxb, max[c]);
      const island = this.gridi[c];
      if (island >= 0) {
        const count = this.islands[island].count;
        const n = Math.min(maxb, count);
        if (runStart !== -1) {
          for (let i = runStart; i <= runEnd; i++) {
            poss[start + i * step] = blocked ? 0 : n;
          }
        }
        runStart = k + 1;
        blocked = false;
        maxb = count;
      } else {
        runEnd = k;
        if (this.grid[c] & blockers) blocked = true;
      }
    }
    if (runStart !== -1) {
      for (let i = runStart; i <= runEnd; i++) poss[start + i * step] = 0;
    }
  }

  /** Recompute every island's `count` from the bridges on the grid. C map_count. */
  mapCount(): void {
    for (const is of this.islands) is.count = this.islandCountbridges(is);
  }

  /** Clear everything but the islands (C map_clear — deliberately leaves lines/max). */
  mapClear(): void {
    for (let i = 0; i < this.grid.length; i++) this.grid[i] &= G_ISLAND;
  }
}

// --- Desc codec (bridges.c encode_game / new_game_sub / validate_desc) ---

/**
 * Row-major island-grid encoding: island counts (1-9, A-G) + run-length skips.
 *
 * `keepTrailingBlanks` because {@link validateDesc} insists the cells add up to
 * the whole grid, in both directions — a desc ending short of the last row is
 * "shorter than expected".
 */
export function encodeGame(state: BridgesState): string {
  const { w } = state;
  return encodeRunLength(
    w * state.h,
    (i) => {
      const is = state.islandAt(i % w, Math.floor(i / w));
      if (!is) return null;
      return is.count < 10
        ? String.fromCharCode(48 + is.count)
        : String.fromCharCode(65 + (is.count - 10));
    },
    { keepTrailingBlanks: true },
  );
}

/**
 * Bridges reads the desc *and* the grid at once: `lastRow` remembers, per
 * column, whether the cell one row up held an island, so two islands that would
 * touch orthogonally are caught during the scan. That walk over cells is what
 * the token loop feeds; only the character arithmetic is shared.
 */
export function validateDesc(params: BridgesParams, desc: string): string | null {
  const w = params.w;
  const wh = params.w * params.h;
  const lastRow = new Array<boolean>(w).fill(false);
  let nislands = 0;
  let i = 0;
  for (const tok of scanRunLength(desc)) {
    // A token past the last cell is data the grid has no room for, whether or
    // not it is a character this game accepts.
    if (i >= wh) return "Game description longer than expected";
    if ("blanks" in tok) {
      for (let j = 0; j < tok.blanks; j++) lastRow[(i + j) % w] = false;
      i += tok.blanks;
      continue;
    }
    const c = tok.value;
    if (!((c >= "1" && c <= "9") || (c >= "A" && c <= "G"))) {
      return "Game description contains unexpected character";
    }
    nislands++;
    if ((i % w > 0 && lastRow[(i % w) - 1]) || lastRow[i % w]) {
      return "Game description contains joined islands";
    }
    lastRow[i % w] = true;
    i++;
  }
  if (i < wh) return "Game description shorter than expected";
  if (i > wh) return "Game description longer than expected";
  if (nislands < 2) return "Game description has too few islands";
  return null;
}

/** Build a fresh state from a desc (C new_game_sub). */
export function newStateFromDesc(params: BridgesParams, desc: string): BridgesState {
  const state = BridgesState.empty(params);
  const { w } = params;
  const wh = w * params.h;
  let i = 0;
  for (const tok of scanRunLength(desc)) {
    if (i >= wh) break;
    // A blank run is a run of empty squares, which `empty()` already left so.
    if ("blanks" in tok) {
      i += tok.blanks;
      continue;
    }
    const c = tok.value;
    const x = i % w;
    const y = Math.floor(i / w);
    if (c >= "1" && c <= "9") state.islandAdd(x, y, c.charCodeAt(0) - 48);
    else if (c >= "A" && c <= "G") state.islandAdd(x, y, c.charCodeAt(0) - 65 + 10);
    // Anything else was rejected by validateDesc.
    i++;
  }
  state.mapFindOrthogonal();
  state.mapUpdatePossibles();
  return state;
}

/** Plain-text board rendering (C game_text_format). */
export function textFormat(state: BridgesState): string {
  let ret = "";
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const grid = state.gridAt(x, y);
      const nl = state.lines[state.idx(x, y)];
      const is = state.islandAt(x, y);
      if (is) ret += String.fromCharCode(48 + is.count);
      else if (grid & G_LINEV) ret += nl > 1 ? '"' : nl === 1 ? "|" : "!";
      else if (grid & G_LINEH) ret += nl > 1 ? "=" : nl === 1 ? "-" : "~";
      else ret += ".";
    }
    ret += "\n";
  }
  return ret;
}
