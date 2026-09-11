/**
 * Rectangles board generator (`new_game_desc`), ported byte-faithfully so that
 * for a given seed and params the produced desc and `aux` match the C output
 * exactly (the differential's guard).
 *
 * The shape, transliterated from upstream:
 *  1. Build a *base* grid at `size / (1 + expandfactor)` by repeatedly picking a
 *     random uncovered square and a random rectangle covering it (`enumRects` +
 *     `placeRect`), leaving occasional singletons.
 *  2. Remove each singleton by extending a neighbor (or, in the four-2×2 case,
 *     dropping a 3×3 over it).
 *  3. Stretch the base grid to full size in two passes — expand rows, transpose,
 *     expand rows again, transpose back — distributing the extra rows randomly.
 *  4. Enumerate the rectangles, and (when `unique`) run the solver to winnow the
 *     number placements to a unique solution; place one number per rectangle.
 *  5. Encode `aux` (the solution edges) and the run-length desc.
 *
 * The grid holds, per cell, the flat top-left index of the rectangle covering it
 * (`y*w + x`), or `-1` (empty) / `-2` (known singleton) during construction.
 */

import type { RandomState } from "../../engine/random/index.ts";
import { randomUpto } from "../../engine/random/index.ts";
import type { Point, Rect } from "../../engine/types.ts";
import { type NumberData, rectSolver, SOLVE_UNIQUE } from "./solver.ts";
import { encodeNumbers, type RectParams } from "./state.ts";

/**
 * Count (when `pick` is undefined) or select the `pick`-th of the possible
 * rectangles covering `(sx, sy)` in the current base grid. Upstream
 * `enum_rects`. `scratch` is a reused `2*w` buffer (top rows, then bottom rows).
 */
function enumRects(
  w: number,
  h: number,
  grid: Int32Array,
  sx: number,
  sy: number,
  scratch: Int32Array,
  pick?: number,
): number | Rect {
  const maxarea = Math.max(2, Math.floor((w * h) / 6));
  const top = scratch.subarray(0, w);
  const bottom = scratch.subarray(w);

  // Region within which any rectangle containing (sx,sy) must fall.
  for (let dy = -1; dy <= 1; dy += 2) {
    const bound = dy === -1 ? top : bottom;
    for (let dx = -1; dx <= 1; dx += 2) {
      for (let x = sx; x >= 0 && x < w; x += dx) {
        bound[x] = -2 * h * dy;
        for (let y = sy; y >= 0 && y < h; y += dy) {
          if (grid[y * w + x] === -1 && (x === sx || dy * y <= dy * bound[x - dx])) {
            bound[x] = y;
          } else break;
        }
      }
    }
  }

  // Largest rectangle actually placeable, to bound the enumeration.
  let realmaxarea = 0;
  for (let x = 0; x < w; x++) {
    const rh = bottom[x] - top[x] + 1;
    if (rh <= 0) continue;
    const dx = x > sx ? -1 : 1;
    let x2 = x;
    for (; x2 >= 0 && x2 < w; x2 += dx)
      if (bottom[x2] < bottom[x] || top[x2] > top[x]) break;
    const rw = Math.abs(x2 - x);
    if (realmaxarea < rw * rh) realmaxarea = rw * rh;
  }
  if (realmaxarea > maxarea) realmaxarea = maxarea;

  // Rectangles spanning the whole grid are boring; bound rw/rh below full size.
  let mw = w - 1;
  if (mw < 3) mw++;
  let mh = h - 1;
  if (mh < 3) mh++;

  let index = 0;
  for (let rw = 1; rw <= mw; rw++)
    for (let rh = 1; rh <= mh; rh++) {
      if (rw * rh > realmaxarea) continue;
      if (rw * rh === 1) continue;
      for (let x = Math.max(sx - rw + 1, 0); x <= Math.min(sx, w - rw); x++)
        for (let y = Math.max(sy - rh + 1, 0); y <= Math.min(sy, h - rh); y++) {
          if (
            top[x] <= y &&
            top[x + rw - 1] <= y &&
            bottom[x] >= y + rh - 1 &&
            bottom[x + rw - 1] >= y + rh - 1
          ) {
            if (pick !== undefined && index === pick) {
              return { x, y, w: rw, h: rh };
            }
            index++;
          }
        }
    }

  return index;
}

function placeRect(w: number, grid: Int32Array, r: Rect): void {
  const idx = r.y * w + r.x;
  for (let x = r.x; x < r.x + r.w; x++)
    for (let y = r.y; y < r.y + r.h; y++) grid[y * w + x] = idx;
}

function findRect(w: number, h: number, grid: Int32Array, x: number, y: number): Rect {
  const idx = grid[y * w + x];
  if (idx < 0) return { x, y, w: 1, h: 1 };
  const ty = Math.floor(idx / w);
  const tx = idx % w;
  let rw = 1;
  while (tx + rw < w && grid[ty * w + (tx + rw)] === idx) rw++;
  let rh = 1;
  while (ty + rh < h && grid[(ty + rh) * w + tx] === idx) rh++;
  return { x: tx, y: ty, w: rw, h: rh };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: generate-and-check with uniqueness enforcement and rectangle merging.
export function newDesc(
  params: RectParams,
  rs: RandomState,
): { desc: string; aux: string } {
  const { expandfactor, unique } = params;
  let { w: pw, h: ph } = params;

  for (;;) {
    // Base-grid dimensions. C computes `(float)size / (1.0F + expandfactor)` in
    // single precision then casts to int, so round through `Math.fround`.
    const denom = Math.fround(1 + expandfactor);
    let p2w = Math.trunc(Math.fround(pw / denom));
    if (p2w < 2 && pw >= 2) p2w = 2;
    let p2h = Math.trunc(Math.fround(ph / denom));
    if (p2h < 2 && ph >= 2) p2h = 2;

    let grid = new Int32Array(p2w * p2h).fill(-1);
    const scratch = new Int32Array(2 * p2w);
    let nsquares = p2w * p2h;

    // Place random rectangles until the grid is full.
    while (nsquares > 0) {
      // The `square`-th uncovered square, counting row-major.
      let square = randomUpto(rs, nsquares);
      let i = 0;
      while (grid[i] !== -1 || square-- > 0) i++;
      const x = i % p2w;
      const y = Math.floor(i / p2w);

      const n = enumRects(p2w, p2h, grid, x, y, scratch) as number;
      if (!n) {
        grid[i] = -2;
        nsquares--;
      } else {
        const pick = randomUpto(rs, n);
        const r = enumRects(p2w, p2h, grid, x, y, scratch, pick) as Rect;
        placeRect(p2w, grid, r);
        nsquares -= r.w * r.h;
      }
    }

    // Deal with singletons: merge each into a neighbor, which gives up the row
    // or column the singleton extends (r2), keeping the rest (r1).
    for (let x = 0; x < p2w; x++) {
      for (let y = 0; y < p2h; y++) {
        if (grid[y * p2w + x] >= 0) continue;
        const dirs: number[] = [];
        if (x < p2w - 1) {
          const r = findRect(p2w, p2h, grid, x + 1, y);
          if ((r.w * r.h > 2 && (r.y === y || r.y + r.h - 1 === y)) || r.h === 1)
            dirs.push(1); // right
        }
        if (y > 0) {
          const r = findRect(p2w, p2h, grid, x, y - 1);
          if ((r.w * r.h > 2 && (r.x === x || r.x + r.w - 1 === x)) || r.w === 1)
            dirs.push(2); // up
        }
        if (x > 0) {
          const r = findRect(p2w, p2h, grid, x - 1, y);
          if ((r.w * r.h > 2 && (r.y === y || r.y + r.h - 1 === y)) || r.h === 1)
            dirs.push(4); // left
        }
        if (y < p2h - 1) {
          const r = findRect(p2w, p2h, grid, x, y + 1);
          if ((r.w * r.h > 2 && (r.x === x || r.x + r.w - 1 === x)) || r.w === 1)
            dirs.push(8); // down
        }

        if (dirs.length === 0) {
          // Four size-2 rectangles surround the singleton: replace with a 3×3.
          placeRect(p2w, grid, { x: x - 1, y: y - 1, w: 3, h: 3 });
          continue;
        }
        const dir = dirs[randomUpto(rs, dirs.length)];
        let r1: Rect;
        let r2: Rect;
        if (dir === 1) {
          r1 = findRect(p2w, p2h, grid, x + 1, y);
          r2 = { x, y, w: 1 + r1.w, h: 1 };
          if (r1.y === y) r1.y++;
          r1.h--;
        } else if (dir === 2) {
          r1 = findRect(p2w, p2h, grid, x, y - 1);
          r2 = { x, y: r1.y, w: 1, h: 1 + r1.h };
          if (r1.x === x) r1.x++;
          r1.w--;
        } else if (dir === 4) {
          r1 = findRect(p2w, p2h, grid, x - 1, y);
          r2 = { x: r1.x, y, w: 1 + r1.w, h: 1 };
          if (r1.y === y) r1.y++;
          r1.h--;
        } else {
          r1 = findRect(p2w, p2h, grid, x, y + 1);
          r2 = { x, y, w: 1, h: 1 + r1.h };
          if (r1.x === x) r1.x++;
          r1.w--;
        }
        if (r1.h > 0 && r1.w > 0) placeRect(p2w, grid, r1);
        placeRect(p2w, grid, r2);
      }
    }

    // Extend to the full size: expand rows, transpose, expand rows, transpose.
    for (let i = 0; i < 2; i++) {
      const p3w = p2w;
      const p3h = ph;
      const grid2 = new Int32Array(p2w * ph);
      const expand = new Int32Array(Math.max(0, p2h - 1));
      const where = new Int32Array(p2w);
      for (let y = p2h; y < ph; y++) expand[randomUpto(rs, p2h - 1)]++;

      let y2 = 0;
      let y2last = 0;
      for (let y = 0; y < p2h; y++) {
        // Copy row y of grid into row y2 of grid2.
        for (let x = 0; x < p2w; x++) {
          const val = grid[y * p2w + x];
          if (
            Math.floor(val / p2w) === y &&
            (y2 === 0 || Math.floor(grid2[(y2 - 1) * p3w + x] / p3w) < y2last)
          ) {
            grid2[y2 * p3w + x] = y2 * p3w + (val % p2w);
          } else {
            grid2[y2 * p3w + x] = grid2[(y2 - 1) * p3w + x];
          }
        }

        if (++y2 === p3h) break;
        y2last = y2;

        // Decide where each coincident edge goes among the invented rows.
        let yx = -1;
        for (let x = 0; x < p2w; x++) {
          if (grid[y * p2w + x] !== grid[(y + 1) * p2w + x]) {
            if (
              x === 0 ||
              (grid[y * p2w + (x - 1)] !== grid[y * p2w + x] &&
                grid[(y + 1) * p2w + (x - 1)] !== grid[(y + 1) * p2w + x])
            ) {
              yx = randomUpto(rs, expand[y] + 1);
            }
            // else reuse previous yx
          } else {
            yx = -1;
          }
          where[x] = yx;
        }

        for (let yy = 0; yy < expand[y]; yy++) {
          for (let x = 0; x < p2w; x++) {
            if (yy === where[x]) {
              grid2[y2 * p3w + x] = y2 * p3w + (grid[(y + 1) * p2w + x] % p2w);
            } else {
              grid2[y2 * p3w + x] = grid2[(y2 - 1) * p3w + x];
            }
          }
          y2++;
        }
      }

      // Transpose.
      p2w = p3h;
      p2h = p3w;
      grid = new Int32Array(p2w * p2h);
      for (let x = 0; x < p2w; x++)
        for (let y = 0; y < p2h; y++) {
          const v = grid2[x * p3w + y];
          grid[y * p2w + x] = (v % p3w) * p2w + Math.floor(v / p3w);
        }
      [pw, ph] = [ph, pw];
    }

    // One number per rectangle, found at its top-left square; every square of
    // the rectangle starts as a candidate position.
    const nd: NumberData[] = [];
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        if (grid[y * pw + x] !== y * pw + x) continue;
        const r = findRect(pw, ph, grid, x, y);
        const points: Point[] = [];
        for (let j = 0; j < r.h; j++)
          for (let k = 0; k < r.w; k++) points.push({ x: k + r.x, y: j + r.y });
        nd.push({ area: r.w * r.h, npoints: r.w * r.h, points });
      }
    }

    const ret = unique ? rectSolver(pw, ph, nd, null, null, rs) : SOLVE_UNIQUE;
    if (ret !== SOLVE_UNIQUE) continue; // give up and go round again

    const numbers = new Int32Array(pw * ph);
    for (const { area, npoints, points } of nd) {
      const p = points[randomUpto(rs, npoints)];
      numbers[p.y * pw + p.x] = area;
    }

    // aux: the solution edges (vedge for x≥1 row-major, then hedge for y≥1).
    let aux = "S";
    for (let y = 0; y < ph; y++)
      for (let x = 1; x < pw; x++)
        aux += grid[y * pw + x] !== grid[y * pw + (x - 1)] ? "1" : "0";
    for (let y = 1; y < ph; y++)
      for (let x = 0; x < pw; x++)
        aux += grid[y * pw + x] !== grid[(y - 1) * pw + x] ? "1" : "0";

    return { desc: encodeNumbers(numbers, pw * ph), aux };
  }
}
