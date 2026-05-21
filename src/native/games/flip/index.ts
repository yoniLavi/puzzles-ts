/**
 * Flip — native TS port (the pattern-establishing first game; change
 * `add-flip-ts-port` originally, then ported to the scene-graph
 * contract by `add-scene-graph-reconciler`). Light-toggling over
 * GF(2): clicking a cell toggles an overlapping set of lights defined
 * by a per-cell matrix; win when every light is off.
 *
 * Idiomatic rendering of `puzzles/flip.c` (deleted when this ships):
 * immutable state, discriminated `FlipMove`, GC instead of
 * dup/free, the `random.ts` we already ported for `random_upto`, and
 * the on-demand `SortedMultiset` standing in for `tree234` in the
 * RANDOM matrix generator. The logic mirrors the C reference; it is
 * not a control-flow transliteration. The rendering shape is the
 * declarative scene-graph contract: `scene()` returns a fresh
 * `SceneNode[]` per frame and the framework reconciles. There is no
 * imperative `redraw`, no per-tile `Int16Array` pixel cache, no
 * `started` first-paint flag — only a minimal drawstate carrying the
 * current tile size (for click→cell mapping in `interpretMove`) and a
 * per-tile referential-equality memo (so unchanged tiles return the
 * same JS object reference frame-over-frame and the reconciler
 * short-circuits without comparison).
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";

// Stable upstream button codes (mirror `PuzzleButton` in
// src/puzzle/types.ts). Kept as plain consts so this module's import
// graph has no runtime enum — it lets the advisory `scripts/diff-flip.ts`
// run under Node's strip-only TS loader.
const LEFT_BUTTON = 0x0200;
const CURSOR_UP = 0x0200 + 9;
const CURSOR_DOWN = 0x0200 + 10;
const CURSOR_LEFT = 0x0200 + 11;
const CURSOR_RIGHT = 0x0200 + 12;
const CURSOR_SELECT = 0x0200 + 13;
const CURSOR_SELECT2 = 0x0200 + 14;
import {
  type Game,
  registerGame,
  type SceneNode,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/index.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { SortedMultiset } from "./sorted-multiset.ts";

// --- types ----------------------------------------------------------

export type MatrixType = "crosses" | "random";

export interface FlipParams {
  w: number;
  h: number;
  matrixType: MatrixType;
}

export interface FlipState {
  readonly w: number;
  readonly h: number;
  /** wh×wh GF(2) toggle matrix, shared by reference across all states
   * of one game (C reference-counts it; we just share + let GC free). */
  readonly matrix: Uint8Array;
  /** wh cells; bit 0 = lit ("wrong"), bit 1 = solver-hint marker. */
  readonly grid: Uint8Array;
  readonly moves: number;
  readonly completed: boolean;
  readonly cheated: boolean;
  readonly hintsActive: boolean;
}

export type FlipMove =
  | { kind: "flip"; x: number; y: number }
  | { kind: "solve"; mask: number[] };

export interface FlipUi {
  cx: number;
  cy: number;
  cursorVisible: boolean;
}

/** Minimal drawstate. `tileSize` is the click→cell mapping anchor
 * read by `interpretMove`; `tiles` is the per-tile scene-node memo
 * for referential-equality short-circuit in the reconciler. The old
 * per-tile `Int16Array` pixel cache and `started` first-paint flag
 * are gone — `scene()` is pure state→tree, so there is nothing
 * imperative to invalidate. */
export interface FlipDrawState {
  tileSize: number;
  tiles: Array<TileMemo | undefined>;
}

interface TileMemo {
  /** Key encoding the visible state that produced `node`: tile value
   * (lit/hint/cursor bits) packed with tile size. `-1` is a sentinel
   * meaning "always invalidate" (used for animating tiles, which
   * change every frame). */
  key: number;
  node: SceneNode;
}

// Colour palette indices (mirror flip.c's enum).
const COL_BACKGROUND = 0;
const COL_WRONG = 1;
const COL_RIGHT = 2;
const COL_GRID = 3;
const COL_DIAG = 4;
const COL_HINT = 5;
const COL_CURSOR = 6;
const NCOLOURS = 7;

const PREFERRED_TILE_SIZE = 48;
const ANIM_TIME = 0.25;
const FLASH_FRAME = 0.07;
const INT_MAX = 2147483647;

// --- bitmap hex codec (flip.c encode_bitmap/decode_bitmap) ----------

const HEX = "0123456789abcdef";

function encodeBitmap(bmp: Uint8Array, len: number): string {
  const slen = (len + 3) >> 2;
  let out = "";
  for (let i = 0; i < slen; i++) {
    let v = 0;
    for (let j = 0; j < 4; j++) {
      if (i * 4 + j < len && bmp[i * 4 + j]) v |= 8 >> j;
    }
    out += HEX[v];
  }
  return out;
}

function decodeBitmap(bmp: Uint8Array, len: number, hex: string): void {
  const slen = (len + 3) >> 2;
  for (let i = 0; i < slen; i++) {
    const c = hex[i];
    let v: number;
    if (c >= "0" && c <= "9") v = c.charCodeAt(0) - 48;
    else if (c >= "A" && c <= "F") v = c.charCodeAt(0) - 65 + 10;
    else if (c >= "a" && c <= "f") v = c.charCodeAt(0) - 97 + 10;
    else v = 0;
    for (let j = 0; j < 4; j++) {
      if (i * 4 + j < len) bmp[i * 4 + j] = v & (8 >> j) ? 1 : 0;
    }
  }
}

// --- params ---------------------------------------------------------

function parseLeadingInt(
  s: string,
  start: number,
): { value: number; next: number } {
  let i = start;
  while (i < s.length && s[i] >= "0" && s[i] <= "9") i++;
  return { value: Number.parseInt(s.slice(start, i) || "0", 10), next: i };
}

// --- RANDOM matrix generator (flip.c new_game_desc RANDOM branch) ---

interface Sq {
  cx: number;
  cy: number;
  x: number;
  y: number;
  coverage: number;
  ominosize: number;
}

function cmp(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
// sqcmp_pick: coverage, ominosize, cy, cx, y, x.
function sqcmpPick(a: Sq, b: Sq): number {
  return (
    cmp(a.coverage, b.coverage) ||
    cmp(a.ominosize, b.ominosize) ||
    cmp(a.cy, b.cy) ||
    cmp(a.cx, b.cx) ||
    cmp(a.y, b.y) ||
    cmp(a.x, b.x)
  );
}
// sqcmp_cov: coverage, y, x, ominosize, cy, cx.
function sqcmpCov(a: Sq, b: Sq): number {
  return (
    cmp(a.coverage, b.coverage) ||
    cmp(a.y, b.y) ||
    cmp(a.x, b.x) ||
    cmp(a.ominosize, b.ominosize) ||
    cmp(a.cy, b.cy) ||
    cmp(a.cx, b.cx)
  );
}
// sqcmp_osize: ominosize, cy, cx, coverage, y, x.
function sqcmpOsize(a: Sq, b: Sq): number {
  return (
    cmp(a.ominosize, b.ominosize) ||
    cmp(a.cy, b.cy) ||
    cmp(a.cx, b.cx) ||
    cmp(a.coverage, b.coverage) ||
    cmp(a.y, b.y) ||
    cmp(a.x, b.x)
  );
}

interface Trees {
  pick: SortedMultiset<Sq>;
  cov: SortedMultiset<Sq>;
  osize: SortedMultiset<Sq>;
}

function addsq(
  t: Trees,
  w: number,
  h: number,
  cx: number,
  cy: number,
  x: number,
  y: number,
  matrix: Uint8Array,
): void {
  const wh = w * h;
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  if (Math.abs(x - cx) > 1 || Math.abs(y - cy) > 1) return;
  if (matrix[(cy * w + cx) * wh + y * w + x]) return;

  let coverage = 0;
  let ominosize = 0;
  for (let i = 0; i < wh; i++) {
    if (matrix[i * wh + y * w + x]) coverage++;
    if (matrix[(cy * w + cx) * wh + i]) ominosize++;
  }
  const sq: Sq = { cx, cy, x, y, coverage, ominosize };
  // The three trees share the one object (a candidate is identified by
  // (cx,cy,x,y); all three comparators tie only on the same candidate).
  if (t.pick.add(sq)) {
    t.cov.add(sq);
    t.osize.add(sq);
  }
}

function addneighbours(
  t: Trees,
  w: number,
  h: number,
  cx: number,
  cy: number,
  x: number,
  y: number,
  matrix: Uint8Array,
): void {
  addsq(t, w, h, cx, cy, x - 1, y, matrix);
  addsq(t, w, h, cx, cy, x + 1, y, matrix);
  addsq(t, w, h, cx, cy, x, y - 1, matrix);
  addsq(t, w, h, cx, cy, x, y + 1, matrix);
}

function genRandomMatrix(
  w: number,
  h: number,
  rng: RandomState,
): Uint8Array {
  const wh = w * h;
  const matrix = new Uint8Array(wh * wh);
  for (;;) {
    const t: Trees = {
      pick: new SortedMultiset<Sq>(sqcmpPick),
      cov: new SortedMultiset<Sq>(sqcmpCov),
      osize: new SortedMultiset<Sq>(sqcmpOsize),
    };
    matrix.fill(0);
    for (let i = 0; i < wh; i++) matrix[i * wh + i] = 1;
    for (let i = 0; i < wh; i++) {
      const ix = i % w;
      const iy = (i / w) | 0;
      addneighbours(t, w, h, ix, iy, ix, iy, matrix);
    }

    let limit = 4 * wh - 2 * (w + h);
    while (limit-- > 0 && t.pick.size > 0) {
      // Lowest pick element; then the run of equal (coverage,ominosize).
      const low = t.pick.get(0);
      const probe: Sq = {
        coverage: low.coverage,
        ominosize: low.ominosize,
        cx: wh,
        cy: wh,
        x: wh,
        y: wh,
      };
      const k = t.pick.lastIndexLessThan(probe);
      const pos = randomUpto(rng, k + 1);
      const sq = t.pick.removeAt(pos);
      t.cov.delete(sq);
      t.osize.delete(sq);

      matrix[(sq.cy * w + sq.cx) * wh + (sq.y * w + sq.x)] = 1;

      // Bump coverage of every candidate pointing at this output cell.
      const covProbe: Sq = {
        coverage: sq.coverage,
        x: sq.x,
        y: sq.y,
        cx: -1,
        cy: -1,
        ominosize: -1,
      };
      for (;;) {
        const sq2 = t.cov.firstGreaterThan(covProbe);
        if (
          !sq2 ||
          sq2.coverage !== sq.coverage ||
          sq2.x !== sq.x ||
          sq2.y !== sq.y
        ) {
          break;
        }
        t.pick.delete(sq2);
        t.cov.delete(sq2);
        t.osize.delete(sq2);
        sq2.coverage++;
        t.pick.add(sq2);
        t.cov.add(sq2);
        t.osize.add(sq2);
      }

      // Bump omino size of every candidate from this input cell.
      const osizeProbe: Sq = {
        ominosize: sq.ominosize,
        cx: sq.cx,
        cy: sq.cy,
        x: -1,
        y: -1,
        coverage: -1,
      };
      for (;;) {
        const sq2 = t.osize.firstGreaterThan(osizeProbe);
        if (
          !sq2 ||
          sq2.ominosize !== sq.ominosize ||
          sq2.cx !== sq.cx ||
          sq2.cy !== sq.cy
        ) {
          break;
        }
        t.pick.delete(sq2);
        t.cov.delete(sq2);
        t.osize.delete(sq2);
        sq2.ominosize++;
        t.pick.add(sq2);
        t.cov.add(sq2);
        t.osize.add(sq2);
      }

      addneighbours(t, w, h, sq.cx, sq.cy, sq.x, sq.y, matrix);
    }

    // Reject if any two matrix rows are identical (flip.c does the same).
    let dup = false;
    outer: for (let i = 0; i < wh && !dup; i++) {
      for (let j = 0; j < wh; j++) {
        if (i === j) continue;
        let same = true;
        for (let c = 0; c < wh; c++) {
          if (matrix[i * wh + c] !== matrix[j * wh + c]) {
            same = false;
            break;
          }
        }
        if (same) {
          dup = true;
          break outer;
        }
      }
    }
    if (!dup) return matrix;
  }
}

function genCrossesMatrix(w: number, h: number): Uint8Array {
  const wh = w * h;
  const matrix = new Uint8Array(wh * wh);
  for (let i = 0; i < wh; i++) {
    const ix = i % w;
    const iy = (i / w) | 0;
    for (let j = 0; j < wh; j++) {
      const jx = j % w;
      const jy = (j / w) | 0;
      if (Math.abs(jx - ix) + Math.abs(jy - iy) <= 1) matrix[i * wh + j] = 1;
    }
  }
  return matrix;
}

// --- the Game -------------------------------------------------------

function dupGrid(g: Uint8Array): Uint8Array {
  return g.slice();
}

export const flipGame: Game<
  FlipParams,
  FlipState,
  FlipMove,
  FlipUi,
  FlipDrawState
> = {
  id: "flip",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  preferredTileSize: PREFERRED_TILE_SIZE,

  defaultParams(): FlipParams {
    return { w: 5, h: 5, matrixType: "crosses" };
  },

  presets() {
    const mk = (w: number, h: number, matrixType: MatrixType) => ({
      title: `${w}x${h} ${matrixType === "crosses" ? "Crosses" : "Random"}`,
      params: { w, h, matrixType },
    });
    return {
      title: "Flip",
      submenu: [
        mk(3, 3, "crosses"),
        mk(4, 4, "crosses"),
        mk(5, 5, "crosses"),
        mk(3, 3, "random"),
        mk(4, 4, "random"),
        mk(5, 5, "random"),
      ],
    };
  },

  encodeParams(p, full): string {
    return `${p.w}x${p.h}${full ? (p.matrixType === "crosses" ? "c" : "r") : ""}`;
  },

  decodeParams(s): FlipParams {
    const wParsed = parseLeadingInt(s, 0);
    const w = wParsed.value;
    let h = w;
    let i = wParsed.next;
    if (s[i] === "x") {
      const hParsed = parseLeadingInt(s, i + 1);
      h = hParsed.value;
      i = hParsed.next;
    }
    let matrixType: MatrixType = "crosses";
    if (s[i] === "r") matrixType = "random";
    else if (s[i] === "c") matrixType = "crosses";
    return { w, h, matrixType };
  },

  validateParams(p): string | null {
    if (p.w <= 0 || p.h <= 0) {
      return "Width and height must both be greater than zero";
    }
    if (p.w > (INT_MAX - 3) / p.h) {
      return "Width times height must not be unreasonably large";
    }
    const wh = p.w * p.h;
    if (wh > (INT_MAX - 3) / wh) {
      return "Width times height is too large";
    }
    return null;
  },

  newDesc(p, rng) {
    const { w, h } = p;
    const wh = w * h;
    const matrix =
      p.matrixType === "crosses"
        ? genCrossesMatrix(w, h)
        : genRandomMatrix(w, h, rng);

    // Random soluble starting lights: choosing equiprobably from the
    // input space and pushing through the matrix is equiprobable over
    // the image space (flip.c's vector-space argument).
    const grid = new Uint8Array(wh);
    for (;;) {
      grid.fill(0);
      for (let i = 0; i < wh; i++) {
        if (randomUpto(rng, 2)) {
          for (let j = 0; j < wh; j++) grid[j] ^= matrix[i * wh + j];
        }
      }
      let any = false;
      for (let i = 0; i < wh; i++) {
        if (grid[i]) {
          any = true;
          break;
        }
      }
      if (any) break;
    }

    return { desc: `${encodeBitmap(matrix, wh * wh)},${encodeBitmap(grid, wh)}` };
  },

  validateDesc(p, desc): string | null {
    const wh = p.w * p.h;
    const mlen = (wh * wh + 3) >> 2;
    const glen = (wh + 3) >> 2;
    const isHex = (s: string) => /^[0-9a-fA-F]*$/.test(s);
    if (desc.length < mlen || !isHex(desc.slice(0, mlen))) {
      return "Matrix description is wrong length";
    }
    if (desc[mlen] !== ",") return "Expected comma after matrix description";
    const g = desc.slice(mlen + 1);
    if (g.length < glen || !isHex(g.slice(0, glen))) {
      return "Grid description is wrong length";
    }
    if (g.length !== glen) return "Unexpected data after grid description";
    return null;
  },

  newState(p, desc): FlipState {
    const { w, h } = p;
    const wh = w * h;
    const mlen = (wh * wh + 3) >> 2;
    const matrix = new Uint8Array(wh * wh);
    const grid = new Uint8Array(wh);
    decodeBitmap(matrix, wh * wh, desc);
    decodeBitmap(grid, wh, desc.slice(mlen + 1));
    return {
      w,
      h,
      matrix,
      grid,
      moves: 0,
      completed: false,
      cheated: false,
      hintsActive: false,
    };
  },

  newUi(): FlipUi {
    return { cx: 0, cy: 0, cursorVisible: false };
  },

  newDrawState(s): FlipDrawState {
    return {
      tileSize: PREFERRED_TILE_SIZE,
      tiles: new Array(s.w * s.h),
    };
  },

  setTileSize(ds, tileSize): void {
    ds.tileSize = tileSize;
  },

  interpretMove(s, ui, ds, point, button): FlipMove | null | UiUpdate {
    const { w, h } = s;
    const wh = w * h;
    const tile = ds?.tileSize ?? PREFERRED_TILE_SIZE;
    const border = tile >> 1;
    const fromCoord = (v: number) =>
      Math.floor((v - border + tile) / tile) - 1;

    const isSelect =
      button === CURSOR_SELECT || button === CURSOR_SELECT2;

    if (button === LEFT_BUTTON || isSelect) {
      let tx: number;
      let ty: number;
      if (button === LEFT_BUTTON) {
        tx = fromCoord(point.x);
        ty = fromCoord(point.y);
        ui.cursorVisible = false;
      } else {
        tx = ui.cx;
        ty = ui.cy;
        ui.cursorVisible = true;
      }
      if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
        const i = ty * w + tx;
        let makeMove = false;
        for (let j = 0; j < wh; j++) {
          if (s.matrix[i * wh + j]) {
            makeMove = true;
            break;
          }
        }
        if (makeMove) return { kind: "flip", x: tx, y: ty };
        return null; // square does nothing (MOVE_NO_EFFECT)
      }
      return UI_UPDATE;
    }

    let dx = 0;
    let dy = 0;
    if (button === CURSOR_UP) dy = -1;
    else if (button === CURSOR_DOWN) dy = 1;
    else if (button === CURSOR_LEFT) dx = -1;
    else if (button === CURSOR_RIGHT) dx = 1;
    else return null;

    const nx = Math.min(w - 1, Math.max(0, ui.cx + dx));
    const ny = Math.min(h - 1, Math.max(0, ui.cy + dy));
    const changed = nx !== ui.cx || ny !== ui.cy || !ui.cursorVisible;
    ui.cx = nx;
    ui.cy = ny;
    ui.cursorVisible = true;
    return changed ? UI_UPDATE : null;
  },

  executeMove(from, move): FlipState {
    const { w, h } = from;
    const wh = w * h;
    if (move.kind === "solve") {
      const grid = dupGrid(from.grid);
      for (let i = 0; i < wh; i++) {
        grid[i] &= ~2;
        if (move.mask[i]) grid[i] |= 2;
      }
      return {
        ...from,
        grid,
        hintsActive: true,
        cheated: true,
      };
    }
    const { x, y } = move;
    if (x < 0 || x >= w || y < 0 || y >= h) {
      throw new Error(`Flip: move out of range (${x},${y})`);
    }
    const grid = dupGrid(from.grid);
    const moves = from.completed ? from.moves : from.moves + 1;
    const i = y * w + x;
    let done = true;
    for (let j = 0; j < wh; j++) {
      grid[j] ^= from.matrix[i * wh + j];
      if (grid[j] & 1) done = false;
    }
    grid[i] ^= 2; // toggle hint marker
    return {
      ...from,
      grid,
      moves,
      completed: done || from.completed,
      hintsActive: done ? false : from.hintsActive,
    };
  },

  status(s) {
    return s.completed ? "solved" : "ongoing";
  },

  solve(_orig, curr): SolveResult<FlipMove> {
    const w = curr.w;
    const h = curr.h;
    const wh = w * h;
    // equations[i] : wh coefficients + 1 value, over GF(2).
    const stride = wh + 1;
    const eq = new Uint8Array(stride * wh);
    for (let i = 0; i < wh; i++) {
      for (let j = 0; j < wh; j++) {
        eq[i * stride + j] = curr.matrix[j * wh + i];
      }
      eq[i * stride + wh] = curr.grid[i] & 1;
    }

    const rowXor = (r1: number, r2: number) => {
      for (let c = 0; c < stride; c++) eq[r1 * stride + c] ^= eq[r2 * stride + c];
    };

    let rowsDone = 0;
    let colsDone = 0;
    const und: number[] = [];
    for (;;) {
      let i = colsDone;
      let j = -1;
      for (; i < wh; i++) {
        for (j = rowsDone; j < wh; j++) {
          if (eq[j * stride + i]) break;
        }
        if (j < wh) break;
        und.push(i); // free variable
      }
      if (i === wh) {
        // Remaining equations are 0 = const; any 1 means insoluble.
        for (let r = rowsDone; r < wh; r++) {
          if (eq[r * stride + wh]) {
            return { ok: false, error: "No solution exists for this position" };
          }
        }
        break;
      }
      if (j > rowsDone) rowXor(rowsDone, j);
      for (let r = rowsDone + 1; r < wh; r++) {
        if (eq[r * stride + i]) rowXor(r, rowsDone);
      }
      rowsDone++;
      colsDone = i + 1;
      if (rowsDone >= wh) break;
    }

    // Enumerate all solutions (free vars as a binary counter); keep the
    // one with the fewest flips.
    const solution = new Uint8Array(wh);
    let shortest = new Uint8Array(wh);
    let bestLen = wh + 1;
    for (;;) {
      for (let r = rowsDone - 1; r >= 0; r--) {
        let lead = 0;
        while (lead < wh && !eq[r * stride + lead]) lead++;
        let v = eq[r * stride + wh];
        for (let k = lead + 1; k < wh; k++) {
          if (eq[r * stride + k]) v ^= solution[k];
        }
        solution[lead] = v;
      }
      let len = 0;
      for (let i = 0; i < wh; i++) if (solution[i]) len++;
      if (len < bestLen) {
        bestLen = len;
        shortest = solution.slice();
      }
      let i = 0;
      for (; i < und.length; i++) {
        solution[und[i]] = solution[und[i]] ? 0 : 1;
        if (solution[und[i]]) break;
      }
      if (i === und.length) break;
    }

    return { ok: true, move: { kind: "solve", mask: Array.from(shortest) } };
  },

  textFormat(s): string {
    const { w, h } = s;
    const wh = w * h;
    const cw = 4;
    const ch = 4;
    const gw = w * cw + 2;
    const gh = h * ch + 1;
    const len = gw * gh;
    const board = new Array<string>(len).fill(" ");
    const RIGHT = 1;
    const DOWN = gw;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const cell = r * ch * gw + c * cw;
        const center = cell + ((ch / 2) | 0) * DOWN + ((cw / 2) | 0) * RIGHT;
        const flip = s.grid[r * w + c] & 1 ? "#" : ".";
        for (let dy = -1 + (r === 0 ? 1 : 0); dy <= 1 - (r === h - 1 ? 1 : 0); dy++) {
          for (
            let dx = -1 + (c === 0 ? 1 : 0);
            dx <= 1 - (c === w - 1 ? 1 : 0);
            dx++
          ) {
            if (s.matrix[(r * w + c) * wh + ((r + dy) * w + c + dx)]) {
              board[center + dy * DOWN + dx * RIGHT] = flip;
            }
          }
        }
        board[cell] = "+";
        for (let dx = 1; dx < cw; dx++) board[cell + dx * RIGHT] = "-";
        for (let dy = 1; dy < ch; dy++) board[cell + dy * DOWN] = "|";
      }
      board[r * ch * gw + gw - 2] = "+";
      board[r * ch * gw + gw - 1] = "\n";
      for (let dy = 1; dy < ch; dy++) {
        board[r * ch * gw + gw - 2 + dy * DOWN] = "|";
        board[r * ch * gw + gw - 1 + dy * DOWN] = "\n";
      }
    }
    for (let k = 0; k < gw - 2; k++) board[len - gw + k] = "-";
    for (let c = 0; c <= w; c++) board[len - gw + cw * c] = "+";
    board[len - 1] = "\n";
    return board.join("");
  },

  statusbarText(s): string {
    const prefix = s.completed
      ? s.cheated
        ? "Auto-solved. "
        : "COMPLETED! "
      : s.cheated
        ? "Auto-solver used. "
        : "";
    return `${prefix}Moves: ${s.moves}`;
  },

  colours(defaultBackground): Colour[] {
    const bg = defaultBackground;
    const ret: Colour[] = new Array(NCOLOURS);
    ret[COL_BACKGROUND] = [bg[0], bg[1], bg[2]];
    ret[COL_WRONG] = [bg[0] / 3, bg[1] / 3, bg[2] / 3];
    ret[COL_RIGHT] = [1, 1, 1];
    ret[COL_GRID] = [bg[0] / 1.5, bg[1] / 1.5, bg[2] / 1.5];
    ret[COL_DIAG] = ret[COL_GRID];
    ret[COL_HINT] = [1, 0, 0];
    ret[COL_CURSOR] = [0.8, 0, 0];
    return ret;
  },

  computeSize(p, tileSize): Size {
    const border = tileSize >> 1;
    return {
      w: tileSize * p.w + 2 * border,
      h: tileSize * p.h + 2 * border,
    };
  },

  animLength() {
    return ANIM_TIME;
  },

  flashLength(oldState, newState) {
    if (!oldState.completed && newState.completed) {
      return (
        FLASH_FRAME *
        (Math.max(((newState.w + 1) / 2) | 0, ((newState.h + 1) / 2) | 0) + 1)
      );
    }
    return 0;
  },

  scene(s, ui, ds, animTime, flashTime, prev, _dir): SceneNode[] {
    const { w, h } = s;
    const wh = w * h;
    const tile = ds?.tileSize ?? PREFERRED_TILE_SIZE;
    const border = tile >> 1;
    const winW = tile * w + 2 * border;
    const winH = tile * h + 2 * border;

    const flashFrame = flashTime ? Math.floor(flashTime / FLASH_FRAME) : -1;
    const animProgress = animTime / ANIM_TIME;
    const animating = animTime > 0 && prev !== null;

    const nodes: SceneNode[] = [];

    // Background fill. Owned by the game (the engine paints no pixels
    // of its own). On the first frame after canvasCleared/forceRedraw
    // this paints the whole window; on subsequent unchanged frames
    // it short-circuits via deep-equality (constant node literal).
    nodes.push({
      kind: "rect",
      id: "bg",
      x: 0,
      y: 0,
      w: winW,
      h: winH,
      fill: COL_BACKGROUND,
    });

    // Grid lines, wrapped in one group so the reconciler treats them
    // as a single unit. The group's clip is the whole board interior
    // — this group never partial-repaints in practice (the only thing
    // that would change it is a board reshape, which triggers
    // canvasCleared anyway).
    const gridChildren: SceneNode[] = [];
    for (let i = 0; i <= w; i++) {
      gridChildren.push({
        kind: "line",
        id: `v${i}`,
        from: { x: i * tile + border, y: border },
        to: { x: i * tile + border, y: h * tile + border },
        colour: COL_GRID,
        thickness: 1,
      });
    }
    for (let i = 0; i <= h; i++) {
      gridChildren.push({
        kind: "line",
        id: `h${i}`,
        from: { x: border, y: i * tile + border },
        to: { x: w * tile + border, y: i * tile + border },
        colour: COL_GRID,
        thickness: 1,
      });
    }
    nodes.push({
      kind: "group",
      id: "grid",
      clip: { x: 0, y: 0, w: winW, h: winH },
      children: gridChildren,
    });

    // Per-tile groups, each with explicit clip = the tile interior
    // (one pixel inside the border so the grid lines stay intact).
    // Memoised by (tileVal, tileSize) so an unchanged tile returns
    // the same JS object reference frame-over-frame; the reconciler
    // then short-circuits via referential equality without deep
    // comparison.
    if (ds && ds.tiles.length !== wh) {
      // Drawstate created with a different w*h (e.g. via loadGame /
      // newGameFromId for a different shape). Rebuild the memo array.
      ds.tiles = new Array(wh);
    }
    for (let i = 0; i < wh; i++) {
      const x = i % w;
      const y = (i / w) | 0;

      // Tile value: lit (bit 0), hint (bit 1), cursor (bit 2). The
      // flash overlay overlays its wave-front lit/unlit on top of
      // the static value; this matches flip.c's redraw.
      let v = s.grid[i];
      if (flashFrame >= 0) {
        const fx = (((w + 1) / 2) | 0) - Math.min(x + 1, w - x);
        const fy = (((h + 1) / 2) | 0) - Math.min(y + 1, h - y);
        const fd = Math.max(fx, fy);
        if (fd === flashFrame) v |= 1;
        else if (fd === flashFrame - 1) v &= ~1;
      }
      if (!s.hintsActive) v &= ~2;
      if (ui.cursorVisible && ui.cx === x && ui.cy === y) v |= 4;

      // This specific tile is animating iff its lit/cursor bits
      // changed between prev and current state (the `& ~2` ignores
      // hint-bit changes — matches flip.c's `(s.grid[i] ^
      // prev.grid[i]) & ~2`).
      const thisAnim =
        animating && prev !== null
          ? ((s.grid[i] ^ prev.grid[i]) & ~2) !== 0
          : false;

      // Memo key: animating tiles invalidate every frame (their
      // polygon shape varies); static tiles cache by (tileVal,
      // tileSize). Including tileSize in the key is defensive — a
      // size change without canvasCleared would otherwise produce
      // stale geometry; in practice canvasCleared always follows a
      // real resize.
      const key = thisAnim ? -1 : v | (tile << 4);
      const cached = ds?.tiles[i];
      if (cached !== undefined && cached.key === key) {
        nodes.push(cached.node);
        continue;
      }
      const node = buildTileNode(s, x, y, tile, border, v, thisAnim, animProgress);
      if (ds) ds.tiles[i] = { key, node };
      nodes.push(node);
    }

    return nodes;
  },
};

function buildTileNode(
  s: FlipState,
  x: number,
  y: number,
  ts: number,
  border: number,
  tileVal: number,
  anim: boolean,
  animProgress: number,
): SceneNode {
  const { w, h } = s;
  const wh = w * h;
  const bx = x * ts + border;
  const by = y * ts + border;
  const dcol = tileVal & 4 ? COL_CURSOR : COL_DIAG;

  // The tile clip exactly matches flip.c's drawTile clip — one pixel
  // inside the grid border so the grid lines on this tile's edges
  // stay intact when the tile repaints.
  const clip = { x: bx + 1, y: by + 1, w: ts - 1, h: ts - 1 };

  const children: SceneNode[] = [];

  // Tile background fill (or transparent during animation — the
  // animating polygon below paints the visible part).
  children.push({
    kind: "rect",
    id: "fill",
    x: bx + 1,
    y: by + 1,
    w: ts - 1,
    h: ts - 1,
    fill: anim ? COL_BACKGROUND : tileVal & 1 ? COL_WRONG : COL_RIGHT,
  });

  if (anim) {
    const at = Math.floor(ts * animProgress);
    const coords: Point[] = [
      { x: bx + ts, y: by },
      { x: bx + at, y: by + at },
      { x: bx, y: by + ts },
      { x: bx + ts - at, y: by + ts - at },
    ];
    let colour = tileVal & 1 ? COL_WRONG : COL_RIGHT;
    if (animProgress < 0.5) colour = COL_WRONG + COL_RIGHT - colour;
    children.push({
      kind: "polygon",
      id: "anim",
      points: coords,
      fill: colour,
      outline: COL_GRID,
    });
  }

  // Matrix-arrow markers for cells this tile toggles. Center cell is
  // a filled square; orthogonal/diagonal cells are 4-sided "U" marks.
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      if (!s.matrix[(y * w + x) * wh + i * w + j]) continue;
      const ox = j - x;
      const oy = i - y;
      const td = Math.max(1, (ts / 16) | 0);
      const cx = bx + ((ts / 2) | 0) + (2 * ox - 1) * td;
      const cy = by + ((ts / 2) | 0) + (2 * oy - 1) * td;
      const id = `m${i}-${j}`;
      if (ox === 0 && oy === 0) {
        children.push({
          kind: "rect",
          id,
          x: cx,
          y: cy,
          w: 2 * td + 1,
          h: 2 * td + 1,
          fill: dcol,
        });
      } else {
        children.push({
          kind: "line",
          id: `${id}-t`,
          from: { x: cx, y: cy },
          to: { x: cx + 2 * td, y: cy },
          colour: dcol,
          thickness: 1,
        });
        children.push({
          kind: "line",
          id: `${id}-b`,
          from: { x: cx, y: cy + 2 * td },
          to: { x: cx + 2 * td, y: cy + 2 * td },
          colour: dcol,
          thickness: 1,
        });
        children.push({
          kind: "line",
          id: `${id}-l`,
          from: { x: cx, y: cy },
          to: { x: cx, y: cy + 2 * td },
          colour: dcol,
          thickness: 1,
        });
        children.push({
          kind: "line",
          id: `${id}-r`,
          from: { x: cx + 2 * td, y: cy },
          to: { x: cx + 2 * td, y: cy + 2 * td },
          colour: dcol,
          thickness: 1,
        });
      }
    }
  }

  if (tileVal & 2) {
    // Three nested rectangle outlines around the tile (the solver
    // hint marker). flip.c draws them as four lines each, three
    // iterations with shrinking insets.
    let x1 = bx + ((ts / 20) | 0);
    let x2 = bx + ts - ((ts / 20) | 0);
    let y1 = by + ((ts / 20) | 0);
    let y2 = by + ts - ((ts / 20) | 0);
    for (let k = 0; k < 3; k++) {
      const id = `hint${k}`;
      children.push({
        kind: "line",
        id: `${id}-t`,
        from: { x: x1, y: y1 },
        to: { x: x2, y: y1 },
        colour: COL_HINT,
        thickness: 1,
      });
      children.push({
        kind: "line",
        id: `${id}-b`,
        from: { x: x1, y: y2 },
        to: { x: x2, y: y2 },
        colour: COL_HINT,
        thickness: 1,
      });
      children.push({
        kind: "line",
        id: `${id}-l`,
        from: { x: x1, y: y1 },
        to: { x: x1, y: y2 },
        colour: COL_HINT,
        thickness: 1,
      });
      children.push({
        kind: "line",
        id: `${id}-r`,
        from: { x: x2, y: y1 },
        to: { x: x2, y: y2 },
        colour: COL_HINT,
        thickness: 1,
      });
      x1++;
      y1++;
      x2--;
      y2--;
    }
  }

  return {
    kind: "group",
    id: `tile-${x},${y}`,
    clip,
    children,
  };
}

registerGame(flipGame);
