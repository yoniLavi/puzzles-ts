/**
 * Galaxies state, flags, geometry helpers, encode/decode, and the
 * completion check.
 *
 * The C `game_state` carries a `space *grid` of `(2w+1)(2h+1)` cell
 * structs; we keep the same coordinate model (cells include tiles,
 * edges, and vertices in one unified grid) but store the per-cell
 * data as parallel typed arrays for cheap clone-per-move (design D2).
 * `type` (tile/edge/vertex) and `(x, y)` per cell are derivable from
 * the index, so we elide them.
 */
import { Dsf } from "./dsf.ts";

// --- flag bits (mirrors the C #defines we care about) --------------

// Persistent / save-relevant flags. Solver-internal scratch flags
// (F_MARK, F_REACHABLE, F_SCRATCH, F_MULTIPLE, F_GOOD) are not part of
// the public state; the solver uses its own scratch buffers.
export const F_DOT = 1;
export const F_EDGE_SET = 2;
export const F_TILE_ASSOC = 4;
export const F_DOT_BLACK = 8;
export const F_DOT_HOLD = 256;

export enum SpaceType {
  Tile,
  Edge,
  Vertex,
}

export function spaceTypeAt(x: number, y: number): SpaceType {
  const xe = (x & 1) === 0;
  const ye = (y & 1) === 0;
  if (xe && ye) return SpaceType.Vertex;
  if (xe || ye) return SpaceType.Edge;
  return SpaceType.Tile;
}

/** Upstream's IS_VERTICAL_EDGE(x): true when the edge sits between two
 * horizontally-adjacent tiles (i.e. lives on an even column). */
export function isVerticalEdge(x: number): boolean {
  return (x & 1) === 0;
}

// --- the State -----------------------------------------------------

export interface DotPos {
  readonly x: number;
  readonly y: number;
}

/**
 * Public, externally-immutable state. Typed arrays are technically
 * mutable in JS — internal `cloneState` produces a fresh copy that
 * callers can mutate before freezing back into a returned state.
 * `executeMove` is the only path where the public API exposes this
 * pattern; everything else (solver, generator) operates on its own
 * working copies.
 */
export interface GalaxiesState {
  readonly w: number;
  readonly h: number;
  readonly sx: number;
  readonly sy: number;
  readonly flags: Uint16Array;
  readonly dotx: Int16Array;
  readonly doty: Int16Array;
  readonly nassoc: Int16Array;
  /** Cached list of dot positions. Mutable by convention only — the
   * generator updates it after a dot moves. External consumers must
   * treat as read-only. */
  dots: DotPos[];
  completed: boolean;
  usedSolve: boolean;
  /** Difficulty diagnosis cached by the statusbar (constant given the
   * dot configuration); `-1` until first computed. Mutable by
   * convention only — written once, read many. Mirrors upstream's
   * `cdiff`. */
  cdiff: number;
}

export function idx(s: { sx: number }, x: number, y: number): number {
  return y * s.sx + x;
}

export function inGrid(s: { sx: number; sy: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.sx && y < s.sy;
}

/** Upstream's INUI: inside the user-interactive interior (excludes
 * the outer perimeter of edges/vertices). */
export function inUi(s: { sx: number; sy: number }, x: number, y: number): boolean {
  return x > 0 && y > 0 && x < s.sx - 1 && y < s.sy - 1;
}

/** Empty grid: outer border edges are set; no dots, no associations. */
export function blankGame(w: number, h: number): GalaxiesState {
  const sx = 2 * w + 1;
  const sy = 2 * h + 1;
  const n = sx * sy;
  const flags = new Uint16Array(n);
  const dotx = new Int16Array(n);
  const doty = new Int16Array(n);
  const nassoc = new Int16Array(n);
  // Border edges (outer perimeter) start set.
  for (let x = 0; x < sx; x++) {
    if (spaceTypeAt(x, 0) === SpaceType.Edge) flags[idx({ sx }, x, 0)] |= F_EDGE_SET;
    if (spaceTypeAt(x, sy - 1) === SpaceType.Edge)
      flags[idx({ sx }, x, sy - 1)] |= F_EDGE_SET;
  }
  for (let y = 0; y < sy; y++) {
    if (spaceTypeAt(0, y) === SpaceType.Edge) flags[idx({ sx }, 0, y)] |= F_EDGE_SET;
    if (spaceTypeAt(sx - 1, y) === SpaceType.Edge)
      flags[idx({ sx }, sx - 1, y)] |= F_EDGE_SET;
  }
  return {
    w,
    h,
    sx,
    sy,
    flags,
    dotx,
    doty,
    nassoc,
    dots: [],
    completed: false,
    usedSolve: false,
    cdiff: -1,
  };
}

/** Clone with freshly-allocated typed arrays the caller may mutate. */
export function cloneState(s: GalaxiesState): GalaxiesState {
  return {
    w: s.w,
    h: s.h,
    sx: s.sx,
    sy: s.sy,
    flags: new Uint16Array(s.flags),
    dotx: new Int16Array(s.dotx),
    doty: new Int16Array(s.doty),
    nassoc: new Int16Array(s.nassoc),
    dots: s.dots.slice(),
    completed: s.completed,
    usedSolve: s.usedSolve,
    cdiff: s.cdiff,
  };
}

/** Refresh the cached `dots` list from the current `flags` array. */
export function rebuildDots(s: GalaxiesState): DotPos[] {
  const dots: DotPos[] = [];
  for (let y = 1; y < s.sy - 1; y++) {
    for (let x = 1; x < s.sx - 1; x++) {
      if (s.flags[idx(s, x, y)] & F_DOT) dots.push({ x, y });
    }
  }
  return dots;
}

// --- association maintenance (mutates a working state) -------------

export function addDot(s: GalaxiesState, x: number, y: number): void {
  const i = idx(s, x, y);
  s.flags[i] |= F_DOT;
  s.nassoc[i] = 0;
}

export function removeDot(s: GalaxiesState, x: number, y: number): void {
  const i = idx(s, x, y);
  s.flags[i] &= ~F_DOT;
}

export function removeAssoc(s: GalaxiesState, tx: number, ty: number): void {
  const i = idx(s, tx, ty);
  if (s.flags[i] & F_TILE_ASSOC) {
    const di = idx(s, s.dotx[i], s.doty[i]);
    s.nassoc[di]--;
    s.flags[i] &= ~F_TILE_ASSOC;
    s.dotx[i] = -1;
    s.doty[i] = -1;
  }
}

export function addAssoc(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): void {
  removeAssoc(s, tx, ty);
  const i = idx(s, tx, ty);
  s.flags[i] |= F_TILE_ASSOC;
  s.dotx[i] = dx;
  s.doty[i] = dy;
  s.nassoc[idx(s, dx, dy)]++;
}

// --- geometry helpers -----------------------------------------------

/** The cell at position rotated 180° around `(dotX, dotY)` from
 * `(sx, sy)`. Returns null if it falls off-grid. */
export function spaceOppositeDot(
  s: GalaxiesState,
  x: number,
  y: number,
  dotX: number,
  dotY: number,
): { x: number; y: number } | null {
  const dx = x - dotX;
  const dy = y - dotY;
  const tx = dotX - dx;
  const ty = dotY - dy;
  if (!inGrid(s, tx, ty)) return null;
  return { x: tx, y: ty };
}

/** The tile rotated 180° around an *associated* tile's dot. Caller
 * must verify F_TILE_ASSOC; we read `dotx`/`doty` from that tile. */
export function tileOpposite(
  s: GalaxiesState,
  tx: number,
  ty: number,
): { x: number; y: number } | null {
  const i = idx(s, tx, ty);
  return spaceOppositeDot(s, tx, ty, s.dotx[i], s.doty[i]);
}

/** For a centre cell, the four edge-neighbours and tile-neighbours
 * (skipping two-cell jumps if off-grid). Order: left, right, up, down. */
export function adjacencies(
  s: GalaxiesState,
  x: number,
  y: number,
): {
  edges: ({ x: number; y: number } | null)[];
  tiles: ({ x: number; y: number } | null)[];
} {
  const dxs = [-1, 1, 0, 0];
  const dys = [0, 0, -1, 1];
  const edges: ({ x: number; y: number } | null)[] = [null, null, null, null];
  const tiles: ({ x: number; y: number } | null)[] = [null, null, null, null];
  for (let n = 0; n < 4; n++) {
    const ex = x + dxs[n];
    const ey = y + dys[n];
    if (!inGrid(s, ex, ey)) continue;
    edges[n] = { x: ex, y: ey };
    const tx = ex + dxs[n];
    const ty = ey + dys[n];
    if (inGrid(s, tx, ty)) tiles[n] = { x: tx, y: ty };
  }
  return { edges, tiles };
}

/** The two tiles either side of an edge (or null if off-grid). */
export function tilesFromEdge(
  s: GalaxiesState,
  ex: number,
  ey: number,
): ({ x: number; y: number } | null)[] {
  const xs: number[] = [];
  const ys: number[] = [];
  if (isVerticalEdge(ex)) {
    xs.push(ex - 1, ex + 1);
    ys.push(ey, ey);
  } else {
    xs.push(ex, ex);
    ys.push(ey - 1, ey + 1);
  }
  const out: ({ x: number; y: number } | null)[] = [];
  for (let i = 0; i < 2; i++) {
    out.push(inGrid(s, xs[i], ys[i]) ? { x: xs[i], y: ys[i] } : null);
  }
  return out;
}

// --- desc encode/decode --------------------------------------------

/** Encode the dot bitmap in upstream's run-length form: `a..y` =
 * white dot after 0..24 empty cells; `A..Y` = black dot; `z` = 25
 * empty cells with no dot. */
export function encodeGame(s: GalaxiesState): string {
  const out: string[] = [];
  let run = 0;
  for (let y = 1; y < s.sy - 1; y++) {
    for (let x = 1; x < s.sx - 1; x++) {
      const f = s.flags[idx(s, x, y)];
      if (!(f & F_DOT)) {
        run++;
      } else {
        while (run > 24) {
          out.push("z");
          run -= 25;
        }
        const base = f & F_DOT_BLACK ? "A" : "a";
        out.push(String.fromCharCode(base.charCodeAt(0) + run));
        run = 0;
      }
    }
  }
  return out.join("");
}

/** Reverse of `encodeGame`; mutates `s` to place dots described by
 * `desc`. Returns an error message on invalid chars or out-of-grid
 * positions; null on success. */
export function decodeGame(s: GalaxiesState, desc: string): string | null {
  let i = 0;
  const innerW = s.sx - 2;
  for (let p = 0; p < desc.length; p++) {
    const n = desc.charCodeAt(p);
    let df = 0;
    if (n === 122 /* z */) {
      i += 25;
      continue;
    }
    if (n >= 97 /* a */ && n <= 121 /* y */) {
      i += n - 97;
      df = 0;
    } else if (n >= 65 /* A */ && n <= 89 /* Y */) {
      i += n - 65;
      df = F_DOT_BLACK;
    } else {
      return "Invalid characters in game description";
    }
    const y = ((i / innerW) | 0) + 1;
    const x = (i % innerW) + 1;
    if (!inUi(s, x, y)) return "Too much data to fit in grid";
    addDot(s, x, y);
    s.flags[idx(s, x, y)] |= df;
    i++;
  }
  return null;
}

// --- check_complete -------------------------------------------------

export interface CompletionResult {
  /** True iff every cell of `w*h` is part of a valid component. */
  complete: boolean;
  /** Per-cell colour for rendering: 0 = invalid, 1 = white, 2 = black. */
  colours?: Int8Array;
}

/**
 * Returns whether the current edge layout partitions the board into
 * valid components — each rotationally symmetric around a unique dot.
 * If `colours` is requested, fills it with per-cell region colour.
 * Mirrors `check_complete` in galaxies.c.
 */
export function checkComplete(
  s: GalaxiesState,
  wantColours: boolean,
): CompletionResult {
  const w = s.w;
  const h = s.h;
  const dsf = new Dsf(w * h);

  // Merge tiles that share an unset edge.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y + 1 < h && !(s.flags[idx(s, 2 * x + 1, 2 * y + 2)] & F_EDGE_SET)) {
        dsf.merge(y * w + x, (y + 1) * w + x);
      }
      if (x + 1 < w && !(s.flags[idx(s, 2 * x + 2, 2 * y + 1)] & F_EDGE_SET)) {
        dsf.merge(y * w + x, y * w + (x + 1));
      }
    }
  }

  // Bounding boxes per component.
  const minx = new Int16Array(w * h);
  const miny = new Int16Array(w * h);
  const maxx = new Int16Array(w * h);
  const maxy = new Int16Array(w * h);
  const valid = new Uint8Array(w * h);
  const cx = new Int16Array(w * h);
  const cy = new Int16Array(w * h);
  const colour = new Int8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    minx[i] = w + 1;
    miny[i] = h + 1;
    maxx[i] = -1;
    maxy[i] = -1;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = dsf.canonify(y * w + x);
      if (minx[i] > x) minx[i] = x;
      if (maxx[i] < x) maxx[i] = x;
      if (miny[i] > y) miny[i] = y;
      if (maxy[i] < y) maxy[i] = y;
      valid[i] = 1;
    }
  }

  // Per component, determine the dot at the centre of symmetry.
  for (let i = 0; i < w * h; i++) {
    if (!valid[i]) continue;
    const ccx = minx[i] + maxx[i] + 1;
    const ccy = miny[i] + maxy[i] + 1;
    cx[i] = ccx;
    cy[i] = ccy;
    if (!(s.flags[idx(s, ccx, ccy)] & F_DOT)) {
      valid[i] = 0;
      continue;
    }
    if (
      dsf.canonify(((ccy - 1) >> 1) * w + ((ccx - 1) >> 1)) !== i ||
      dsf.canonify((ccy >> 1) * w + ((ccx - 1) >> 1)) !== i ||
      dsf.canonify(((ccy - 1) >> 1) * w + (ccx >> 1)) !== i ||
      dsf.canonify((ccy >> 1) * w + (ccx >> 1)) !== i
    ) {
      valid[i] = 0;
      continue;
    }
    colour[i] = s.flags[idx(s, ccx, ccy)] & F_DOT_BLACK ? 2 : 1;
  }

  // Extraneous dots / interior edges disqualify components.
  for (let y = 1; y < s.sy - 1; y++) {
    for (let x = 1; x < s.sx - 1; x++) {
      const f = s.flags[idx(s, x, y)];
      if (f & F_DOT) {
        for (let ccy = (y - 1) >> 1; ccy <= y >> 1; ccy++) {
          for (let ccx = (x - 1) >> 1; ccx <= x >> 1; ccx++) {
            if (ccx < 0 || ccy < 0 || ccx >= w || ccy >= h) continue;
            const i = dsf.canonify(ccy * w + ccx);
            if (x !== cx[i] || y !== cy[i]) valid[i] = 0;
          }
        }
      }
      if (f & F_EDGE_SET) {
        const cx1 = (x - 1) >> 1;
        const cx2 = x >> 1;
        const cy1 = (y - 1) >> 1;
        const cy2 = y >> 1;
        if (cx1 >= 0 && cx2 < w && cy1 >= 0 && cy2 < h) {
          const i = dsf.canonify(cy1 * w + cx1);
          if (i === dsf.canonify(cy2 * w + cx2)) valid[i] = 0;
        }
      }
    }
  }

  // Symmetry test: every cell's 180°-image must be in the same
  // component as itself.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = dsf.canonify(y * w + x);
      const x2 = cx[i] - 1 - x;
      const y2 = cy[i] - 1 - y;
      if (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h) {
        valid[i] = 0;
        continue;
      }
      if (i !== dsf.canonify(y2 * w + x2)) valid[i] = 0;
    }
  }

  let complete = true;
  const cols = wantColours ? new Int8Array(w * h) : undefined;
  for (let i = 0; i < w * h; i++) {
    const ci = dsf.canonify(i);
    const ok = valid[ci] === 1;
    if (cols) cols[i] = ok ? colour[ci] : 0;
    if (!ok) complete = false;
  }
  return { complete, colours: cols };
}
