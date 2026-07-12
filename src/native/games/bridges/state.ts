/**
 * Types and pure state helpers for Bridges (Hashiwokakero).
 *
 * Faithful port of the data model in `puzzles/bridges.c`: a flat grid of `G_*`
 * flag words plus the per-cell line/possible/max counts, and an island list
 * with orthogonal-neighbour adjacency (`surrounds`). The C keeps the five count
 * arrays as slices of one `wha` block; here they are five typed arrays. The
 * refcounted `solver_state` (two dsfs) is *not* part of the logical state — the
 * solver creates its own dsf on demand — so it is omitted here.
 */

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
export const G_NOLINE = G_NOLINEV | G_NOLINEH;
export const G_WARN = 0x0080;
export const G_SWEEP = 0x1000;

export const MAX_BRIDGES = 4;

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
  /** 0 = Easy, 1 = Medium, 2 = Hard. */
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

/** Presets: 7/10/15 square × Easy/Medium/Hard, all maxb 2, 30% islands, 10% expansion, loops allowed. */
export const BRIDGES_PRESETS: BridgesParams[] = [
  { w: 7, h: 7, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 0 },
  { w: 7, h: 7, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 1 },
  { w: 7, h: 7, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 2 },
  { w: 10, h: 10, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 0 },
  { w: 10, h: 10, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 1 },
  { w: 10, h: 10, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 2 },
  { w: 15, h: 15, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 0 },
  { w: 15, h: 15, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 1 },
  { w: 15, h: 15, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 2 },
];

export const DIFFICULTY_NAMES = ["Easy", "Medium", "Hard"] as const;

export function defaultParams(): BridgesParams {
  return { ...BRIDGES_PRESETS[0] };
}

// --- Params codec (bridges.c decode_params/encode_params/validate_params) ---

/** Reads a leading non-negative integer, advancing the cursor. Returns [value, nextIndex]. */
function eatNum(s: string, i: number): [number, number] {
  let n = 0;
  let seen = false;
  while (i < s.length && s[i] >= "0" && s[i] <= "9") {
    n = n * 10 + (s.charCodeAt(i) - 48);
    i++;
    seen = true;
  }
  return [seen ? n : 0, i];
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
  p.allowloops = true;
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
  if (p.h > 0 && p.w > Math.floor(0x7fffffff / p.h))
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
  dragxSrc: number;
  dragySrc: number;
  dragxDst: number;
  dragyDst: number;
  todraw: number;
  dragging: boolean;
  dragIsNoline: boolean;
  nlines: number;
  curX: number;
  curY: number;
  curVisible: boolean;
  showHints: boolean;
}

/** Highlight returned by findMistakes: a wrongly-placed bridge span. */
export interface BridgesMistake {
  /** The two island endpoints of the offending bridge. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const min = Math.min;

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
    const w = this.w;
    if (i1.x === i2.x) {
      const x = i1.x;
      const s = i1.y < i2.y ? i1.y + 1 : i2.y + 1;
      const e = i1.y < i2.y ? i2.y - 1 : i1.y - 1;
      for (let y = s; y <= e; y++) {
        const c = y * w + x;
        if (isMax) this.maxv[c] = n;
        else if (n < 0) this.grid[c] ^= G_NOLINEV;
        else if (n === 0) this.grid[c] &= ~G_LINEV;
        else {
          this.grid[c] |= G_LINEV;
          this.lines[c] = n;
        }
      }
    } else if (i1.y === i2.y) {
      const y = i1.y;
      const s = i1.x < i2.x ? i1.x + 1 : i2.x + 1;
      const e = i1.x < i2.x ? i2.x - 1 : i1.x - 1;
      for (let x = s; x <= e; x++) {
        const c = y * w + x;
        if (isMax) this.maxh[c] = n;
        else if (n < 0) this.grid[c] ^= G_NOLINEH;
        else if (n === 0) this.grid[c] &= ~G_LINEH;
        else {
          this.grid[c] |= G_LINEH;
          this.lines[c] = n;
        }
      }
    } else {
      throw new Error("islandJoin: islands not orthogonal");
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

  islandAdjspace(is: Island, marks: boolean, missing: number, direction: number): number {
    const pt = is.points[direction];
    const gline = pt.dx ? G_LINEH : G_LINEV;
    if (marks) {
      const mline = pt.dx ? G_MARKH : G_MARKV;
      if (this.gridAt(pt.x, pt.y) & mline) return 0;
    }
    let poss = this.possibles(pt.dx, pt.x, pt.y);
    poss = min(poss, missing);
    const curr = this.gridCount(pt.x, pt.y, gline);
    poss = min(poss, this.maximum(pt.dx, pt.x, pt.y) - curr);
    return poss;
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
        nsurrspc += min(ifree, bmax - bcurr);
      }
    }
    if (nsurrspc < nspc) return true; // surrounding islands can't absorb the rest
    return false;
  }

  // --- Map-wide helpers (bridges.c) ---

  /** Recompute possv/possh from the current lines. C map_update_possibles. */
  mapUpdatePossibles(): void {
    const w = this.w;
    const h = this.h;
    const grid = this.grid;
    const gridi = this.gridi;
    const maxbParam = this.params.maxb;

    // Vertical stripes -> possv.
    for (let x = 0; x < w; x++) {
      let idx = x;
      let s = -1;
      let e = -1;
      let bl = false;
      let maxb = maxbParam;
      let y = 0;
      for (; y < h; y++) {
        if (gridi[idx] >= 0) {
          maxb = this.islands[gridi[idx]].count;
          break;
        }
        this.possv[idx] = 0;
        idx += w;
      }
      for (; y < h; y++) {
        maxb = min(maxb, this.maxv[idx]);
        const fi = gridi[idx];
        if (fi >= 0) {
          const np = min(maxb, this.islands[fi].count);
          if (s !== -1) {
            for (let i = s; i <= e; i++) this.possv[i * w + x] = bl ? 0 : np;
          }
          s = y + 1;
          bl = false;
          maxb = this.islands[fi].count;
        } else {
          e = y;
          if (grid[idx] & (G_LINEH | G_NOLINEV)) bl = true;
        }
        idx += w;
      }
      if (s !== -1) {
        for (let i = s; i <= e; i++) this.possv[i * w + x] = 0;
      }
    }

    // Horizontal stripes -> possh.
    for (let y = 0; y < h; y++) {
      let idx = y * w;
      let s = -1;
      let e = -1;
      let bl = false;
      let maxb = maxbParam;
      let x = 0;
      for (; x < w; x++) {
        if (gridi[idx] >= 0) {
          maxb = this.islands[gridi[idx]].count;
          break;
        }
        this.possh[idx] = 0;
        idx += 1;
      }
      for (; x < w; x++) {
        maxb = min(maxb, this.maxh[idx]);
        const fi = gridi[idx];
        if (fi >= 0) {
          const np = min(maxb, this.islands[fi].count);
          if (s !== -1) {
            for (let i = s; i <= e; i++) this.possh[y * w + i] = bl ? 0 : np;
          }
          s = x + 1;
          bl = false;
          maxb = this.islands[fi].count;
        } else {
          e = x;
          if (grid[idx] & (G_LINEV | G_NOLINEH)) bl = true;
        }
        idx += 1;
      }
      if (s !== -1) {
        for (let i = s; i <= e; i++) this.possh[y * w + i] = 0;
      }
    }
  }

  /** Recompute every island's `count` from the bridges on the grid. C map_count. */
  mapCount(): void {
    for (const is of this.islands) {
      is.count = 0;
      for (const pt of is.points) {
        const flag = pt.x === is.x ? G_LINEV : G_LINEH;
        if (this.gridAt(pt.x, pt.y) & flag) {
          is.count += this.lines[pt.y * this.w + pt.x];
        }
      }
    }
  }

  /** Clear everything but the islands (C map_clear — deliberately leaves lines/max). */
  mapClear(): void {
    for (let i = 0; i < this.grid.length; i++) this.grid[i] &= G_ISLAND;
  }
}

// --- Desc codec (bridges.c encode_game / new_game_sub / validate_desc) ---

/** Row-major island-grid encoding: island counts (1-9, A-G) + run-length skips. */
export function encodeGame(state: BridgesState): string {
  let ret = "";
  let run = 0;
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const is = state.islandAt(x, y);
      if (is) {
        if (run) {
          ret += String.fromCharCode(96 + run); // 'a'-1+run
          run = 0;
        }
        ret +=
          is.count < 10
            ? String.fromCharCode(48 + is.count)
            : String.fromCharCode(65 + (is.count - 10));
      } else {
        if (run === 26) {
          ret += String.fromCharCode(96 + run);
          run = 0;
        }
        run++;
      }
    }
  }
  if (run) ret += String.fromCharCode(96 + run);
  return ret;
}

export function validateDesc(params: BridgesParams, desc: string): string | null {
  const w = params.w;
  const wh = params.w * params.h;
  const lastRow = new Array<boolean>(w).fill(false);
  let nislands = 0;
  let di = 0;
  let i = 0;
  for (i = 0; i < wh; i++) {
    const c = desc[di];
    if (c === undefined) return "Game description shorter than expected";
    if ((c >= "1" && c <= "9") || (c >= "A" && c <= "G")) {
      nislands++;
      if ((i % w > 0 && lastRow[(i % w) - 1]) || lastRow[i % w]) {
        return "Game description contains joined islands";
      }
      lastRow[i % w] = true;
    } else if (c >= "a" && c <= "z") {
      const runlen = c.charCodeAt(0) - 97 + 1;
      for (let j = 0; j < runlen; j++) lastRow[(i + j) % w] = false;
      i += c.charCodeAt(0) - 97; // plus the loop's i++
    } else {
      return "Game description contains unexpected character";
    }
    di++;
  }
  if (di < desc.length || i > wh) return "Game description longer than expected";
  if (nislands < 2) return "Game description has too few islands";
  return null;
}

/** Build a fresh state from a desc (C new_game_sub). */
export function newStateFromDesc(params: BridgesParams, desc: string): BridgesState {
  const state = BridgesState.empty(params);
  let di = 0;
  let run = 0;
  for (let y = 0; y < params.h; y++) {
    for (let x = 0; x < params.w; x++) {
      let c = "";
      if (run === 0) {
        c = desc[di++] ?? "";
        if (c >= "a" && c <= "z") run = c.charCodeAt(0) - 97 + 1;
      }
      if (run > 0) {
        c = "S";
        run--;
      }
      if (c >= "1" && c <= "9") state.islandAdd(x, y, c.charCodeAt(0) - 48);
      else if (c >= "A" && c <= "G") state.islandAdd(x, y, c.charCodeAt(0) - 65 + 10);
      // 'S' = empty square; anything else was rejected by validateDesc.
    }
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

export function cloneBridgesState(s: BridgesState): BridgesState {
  return s.clone();
}
