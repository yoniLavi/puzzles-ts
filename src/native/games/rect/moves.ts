/**
 * Rectangles state construction and move execution, plus the edge-drawing
 * primitive and the correctness analysis. Kept separate from `index.ts` so
 * `render.ts` can import `gridDrawRect` for the drag preview without a cycle
 * (playbook §3.2).
 */

import type { GameStatus } from "../../../puzzle/types.ts";
import {
  decodeNumbers,
  type RectMove,
  type RectParams,
  type RectState,
} from "./state.ts";

/* Range predicates, matching upstream's macros. `HRANGE`: an hedge is
 * meaningful only for `y ∈ [1, h-1]`; `VRANGE`: a vedge only for
 * `x ∈ [1, w-1]`. */
const hrange = (w: number, h: number, x: number, y: number) =>
  x >= 0 && x < w && y >= 1 && y < h;
const vrange = (w: number, h: number, x: number, y: number) =>
  x >= 1 && x < w && y >= 0 && y < h;

/**
 * Recompute the per-cell correctness overlay (upstream `get_correct`). A cell
 * is correct (1) iff it belongs to a valid rectangle — every boundary edge
 * present, no interior edge, and exactly one contained number equal to the
 * rectangle's area; otherwise 0.
 */
export function getCorrect(
  w: number,
  h: number,
  grid: Int32Array,
  hedge: Uint8Array,
  vedge: Uint8Array,
): Uint8Array {
  const ret = new Uint8Array(w * h).fill(0xff);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (ret[y * w + x] !== 0xff) continue;

      // Find the rectangle starting at this point.
      let rw = 1;
      while (x + rw < w && !vedge[y * w + (x + rw)]) rw++;
      let rh = 1;
      while (y + rh < h && !hedge[(y + rh) * w + x]) rh++;

      let valid = true;
      // Check the horizontal edges.
      for (let xx = x; xx < x + rw; xx++) {
        for (let yy = y; yy <= y + rh; yy++) {
          const e = !hrange(w, h, xx, yy) || hedge[yy * w + xx] !== 0;
          const ec = yy === y || yy === y + rh;
          if (e !== ec) valid = false;
        }
      }
      // Check the vertical edges.
      for (let yy = y; yy < y + rh; yy++) {
        for (let xx = x; xx <= x + rw; xx++) {
          const e = !vrange(w, h, xx, yy) || vedge[yy * w + xx] !== 0;
          const ec = xx === x || xx === x + rw;
          if (e !== ec) valid = false;
        }
      }

      if (!valid) {
        ret[y * w + x] = 0;
        continue;
      }

      // We have a rectangle. Count its numbers and area.
      let num = 0;
      let area = 0;
      for (let xx = x; xx < x + rw; xx++) {
        for (let yy = y; yy < y + rh; yy++) {
          area++;
          const g = grid[yy * w + xx];
          if (g) {
            if (num > 0) valid = false; // two numbers
            num = g;
          }
        }
      }
      if (num !== area) valid = false;

      const fill = valid ? 1 : 0;
      for (let xx = x; xx < x + rw; xx++)
        for (let yy = y; yy < y + rh; yy++) ret[yy * w + xx] = fill;
    }
  }

  return ret;
}

/**
 * Draw (or measure) the edges of the rectangle box `(x1,y1)`–`(x2,y2)` into the
 * given edge grids (upstream `grid_draw_rect`). `c` is the edge value, `really`
 * commits (vs. just measuring `changed`), `outline` draws the boundary edges
 * (and, when `c === 1`, clears interior edges); `!outline` clears interior only.
 * Returns whether anything changed.
 */
export function gridDrawRect(
  w: number,
  h: number,
  hedge: Uint8Array,
  vedge: Uint8Array,
  c: number,
  really: boolean,
  outline: boolean,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  let changed = false;

  // Horizontal edges.
  for (let x = x1; x < x2; x++)
    for (let y = y1; y <= y2; y++)
      if (hrange(w, h, x, y)) {
        let val = hedge[y * w + x];
        if (y === y1 || y === y2) {
          if (!outline) continue;
          val = c;
        } else if (c === 1) {
          val = 0;
        }
        changed = changed || hedge[y * w + x] !== val;
        if (really) hedge[y * w + x] = val;
      }

  // Vertical edges.
  for (let y = y1; y < y2; y++)
    for (let x = x1; x <= x2; x++)
      if (vrange(w, h, x, y)) {
        let val = vedge[y * w + x];
        if (x === x1 || x === x2) {
          if (!outline) continue;
          val = c;
        } else if (c === 1) {
          val = 0;
        }
        changed = changed || vedge[y * w + x] !== val;
        if (really) vedge[y * w + x] = val;
      }

  return changed;
}

/** Parse the desc into the initial state (all edges clear). */
export function newState(params: RectParams, desc: string): RectState {
  const { w, h } = params;
  const area = w * h;
  const grid = decodeNumbers(desc, area);
  const vedge = new Uint8Array(area);
  const hedge = new Uint8Array(area);
  const correct = getCorrect(w, h, grid, hedge, vedge);
  return { w, h, grid, vedge, hedge, completed: false, cheated: false, correct };
}

export function cloneRectState(s: RectState): RectState {
  return {
    ...s,
    vedge: s.vedge.slice(),
    hedge: s.hedge.slice(),
    correct: s.correct.slice(),
  };
}

/** Apply a bit-run string (`'0'`/`'1'`) into an edge grid at the given cells
 * in upstream's `S`-move order. Returns the number of characters consumed. */
function applyBitRun(
  bits: string,
  start: number,
  edge: Uint8Array,
  w: number,
  cells: Array<[number, number]>,
): void {
  let p = start;
  for (const [x, y] of cells) {
    edge[y * w + x] = bits[p] === "1" ? 1 : 0;
    if (bits[p] !== undefined && bits[p] !== "") p++;
  }
}

/** Pure move execution: returns a NEW state (upstream `execute_move`). Every
 * move type recomputes `correct` and sets `completed` monotonically once the
 * whole board is correct — including the solve path, so `status()` reports the
 * win and the midend upgrades it to "solved-with-help". */
export function executeMove(from: RectState, move: RectMove): RectState {
  const { w, h } = from;
  const next = cloneRectState(from);
  const hedge = next.hedge;
  const vedge = next.vedge;
  let cheated = from.cheated;

  if (move.type === "solve") {
    cheated = true;
    // vedge for x∈[1,w-1] row-major, then hedge for y∈[1,h-1] row-major.
    const vcells: Array<[number, number]> = [];
    for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) vcells.push([x, y]);
    const hcells: Array<[number, number]> = [];
    for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) hcells.push([x, y]);
    applyBitRun(move.vedge, 0, vedge, w, vcells);
    applyBitRun(move.hedge, 0, hedge, w, hcells);
  } else if (move.type === "rect") {
    gridDrawRect(
      w,
      h,
      hedge,
      vedge,
      1,
      true,
      !move.erasing,
      move.x,
      move.y,
      move.x + move.w,
      move.y + move.h,
    );
  } else if (move.type === "edge") {
    if (move.edge === "h") hedge[move.y * w + move.x] ^= 1;
    else vedge[move.y * w + move.x] ^= 1;
  }

  const correct = getCorrect(w, h, next.grid, hedge, vedge);
  let completed = from.completed;
  if (!completed) {
    let ok = true;
    for (let i = 0; i < w * h; i++) if (!correct[i]) ok = false;
    if (ok) completed = true;
  }

  return { ...next, correct, completed, cheated };
}

export function status(s: RectState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

export function textFormat(state: RectState): string {
  const { w, h, grid } = state;
  const hedge = state.hedge;
  const vedge = state.vedge;

  // Column width: at least 2, else the widest number.
  let col = 2;
  for (let i = 0; i < w * h; i++) {
    const len = String(grid[i]).length;
    if (col < len) col = len;
  }

  const pad = (s: string, n: number) => s.padStart(n);
  let out = "";
  for (let y = 0; y <= 2 * h; y++) {
    for (let x = 0; x <= 2 * w; x++) {
      if (x & y & 1) {
        const v = grid[Math.floor(y / 2) * w + Math.floor(x / 2)];
        out += v ? pad(String(v), col) : pad("", col);
      } else if (x & 1) {
        const on =
          y === 0 || y === 2 * h
            ? true
            : hrange(w, h, Math.floor(x / 2), Math.floor(y / 2)) &&
              hedge[Math.floor(y / 2) * w + Math.floor(x / 2)] !== 0;
        out += (on ? "-" : " ").repeat(col);
      } else if (y & 1) {
        const on =
          x === 0 || x === 2 * w
            ? true
            : vrange(w, h, Math.floor(x / 2), Math.floor(y / 2)) &&
              vedge[Math.floor(y / 2) * w + Math.floor(x / 2)] !== 0;
        out += on ? "|" : " ";
      } else {
        const hl =
          y === 0 || y === 2 * h
            ? true
            : hrange(w, h, Math.floor((x - 1) / 2), Math.floor(y / 2)) &&
              hedge[Math.floor(y / 2) * w + Math.floor((x - 1) / 2)] !== 0;
        const hr =
          y === 0 || y === 2 * h
            ? true
            : hrange(w, h, Math.floor((x + 1) / 2), Math.floor(y / 2)) &&
              hedge[Math.floor(y / 2) * w + Math.floor((x + 1) / 2)] !== 0;
        const vu =
          x === 0 || x === 2 * w
            ? true
            : vrange(w, h, Math.floor(x / 2), Math.floor((y - 1) / 2)) &&
              vedge[Math.floor((y - 1) / 2) * w + Math.floor(x / 2)] !== 0;
        const vd =
          x === 0 || x === 2 * w
            ? true
            : vrange(w, h, Math.floor(x / 2), Math.floor((y + 1) / 2)) &&
              vedge[Math.floor((y + 1) / 2) * w + Math.floor(x / 2)] !== 0;
        if (!hl && !hr && !vu && !vd) out += " ";
        else if (hl && hr && !vu && !vd) out += "-";
        else if (!hl && !hr && vu && vd) out += "|";
        else out += "+";
      }
    }
    out += "\n";
  }
  return out;
}
