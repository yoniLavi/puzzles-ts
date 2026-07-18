/**
 * The souped-up Rectangles solver (`rect_solver`), ported faithfully.
 *
 * It is more than a plain solver: it copes with *uncertainty* about where the
 * numbers sit, because the generator runs it on a laid-out grid *before*
 * placing numbers, to decide where numbers must go for a unique solution. Each
 * `NumberData` carries a list of candidate positions (`points`); the solver
 * whittles both the per-rectangle placement lists and the per-number candidate
 * lists until every rectangle has exactly one placement (solved), some
 * rectangle has none (inconsistent), or progress stalls (ambiguous/hard).
 *
 * Used three ways: the generation uniqueness gate (numbers span a whole
 * rectangle, `rs` drives the winnowing), `solve` and `findMistakes` (each
 * number is a single fixed point, `rs` null). When `hedge`/`vedge` are given
 * and the solve is unique, the placed rectangle edges are written into them.
 *
 * The RNG draw order is byte-match surface (the generator's desc depends on it),
 * so the winnowing's `randomUpto(rs, nrpns)` and the swap-with-end removal order
 * (which the overlap counts, and hence later deductions, depend on) are
 * reproduced exactly.
 */

import type { RandomState } from "../../random/index.ts";
import { randomUpto } from "../../random/index.ts";

export interface Pt {
  x: number;
  y: number;
}

interface Rct {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NumberData {
  area: number;
  npoints: number;
  /** Candidate positions; only the first `npoints` are live. Mutated in
   * place (swap-with-end) exactly as upstream. */
  points: Pt[];
}

interface RectPositions {
  rects: Rct[];
  n: number;
}

/** Solver verdicts. */
export const SOLVE_INCONSISTENT = 0;
export const SOLVE_UNIQUE = 1;
export const SOLVE_AMBIGUOUS = 2;

function removeRectPlacement(
  w: number,
  h: number,
  rectpositions: RectPositions[],
  overlaps: Int32Array,
  rectnum: number,
  placement: number,
): void {
  const r = rectpositions[rectnum].rects[placement];
  for (let yy = 0; yy < r.h; yy++) {
    const y = yy + r.y;
    for (let xx = 0; xx < r.w; xx++) {
      const x = xx + r.x;
      const idx = (rectnum * h + y) * w + x;
      if (overlaps[idx] > 0) overlaps[idx]--;
    }
  }
  const n = rectpositions[rectnum].n;
  if (placement < n - 1) {
    const t = rectpositions[rectnum].rects[n - 1];
    rectpositions[rectnum].rects[n - 1] = rectpositions[rectnum].rects[placement];
    rectpositions[rectnum].rects[placement] = t;
  }
  rectpositions[rectnum].n--;
}

function removeNumberPlacement(
  w: number,
  number: NumberData,
  index: number,
  rectbyplace: Int32Array,
): void {
  rectbyplace[number.points[index].y * w + number.points[index].x] = -1;
  const n = number.npoints;
  if (index < n - 1) {
    const t = number.points[n - 1];
    number.points[n - 1] = number.points[index];
    number.points[index] = t;
  }
  number.npoints--;
}

export function rectSolver(
  w: number,
  h: number,
  numbers: NumberData[],
  hedge: Uint8Array | null,
  vedge: Uint8Array | null,
  rs: RandomState | null,
): number {
  const nrects = numbers.length;

  // Candidate positions for each rectangle.
  const rectpositions: RectPositions[] = [];
  for (let i = 0; i < nrects; i++) {
    const area = numbers[i].area;
    let minx = w;
    let miny = h;
    let maxx = -1;
    let maxy = -1;
    for (let j = 0; j < numbers[i].npoints; j++) {
      const px = numbers[i].points[j].x;
      const py = numbers[i].points[j].y;
      if (minx > px) minx = px;
      if (miny > py) miny = py;
      if (maxx < px) maxx = px;
      if (maxy < py) maxy = py;
    }

    const rlist: Rct[] = [];
    for (let rw = 1; rw <= area && rw <= w; rw++) {
      if (area % rw) continue;
      const rh = area / rw;
      if (rh > h) continue;

      for (let y = miny - rh + 1; y <= maxy; y++) {
        if (y < 0 || y + rh > h) continue;
        for (let x = minx - rw + 1; x <= maxx; x++) {
          if (x < 0 || x + rw > w) continue;
          // Does this rectangle contain a candidate number placement?
          let j: number;
          for (j = 0; j < numbers[i].npoints; j++)
            if (
              numbers[i].points[j].x >= x &&
              numbers[i].points[j].x < x + rw &&
              numbers[i].points[j].y >= y &&
              numbers[i].points[j].y < y + rh
            )
              break;
          if (j < numbers[i].npoints) rlist.push({ x, y, w: rw, h: rh });
        }
      }
    }
    rectpositions.push({ rects: rlist, n: rlist.length });
  }

  // Overlap counts: overlaps[(rect*h + y)*w + x].
  const overlaps = new Int32Array(nrects * w * h);
  for (let i = 0; i < nrects; i++) {
    for (let j = 0; j < rectpositions[i].n; j++) {
      const r = rectpositions[i].rects[j];
      for (let yy = 0; yy < r.h; yy++)
        for (let xx = 0; xx < r.w; xx++)
          overlaps[(i * h + (yy + r.y)) * w + (xx + r.x)]++;
    }
  }

  // Which rectangle a square is a candidate number placement for (or -1).
  const rectbyplace = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < nrects; i++) {
    for (let j = 0; j < numbers[i].npoints; j++) {
      const x = numbers[i].points[j].x;
      const y = numbers[i].points[j].y;
      rectbyplace[y * w + x] = i;
    }
  }

  const workspace = new Int32Array(nrects);

  // Deduction loop. An inconsistency detected mid-loop just breaks out to the
  // finalisation below, which (matching C's `cleanup:` label) recomputes the
  // verdict purely from the surviving placement counts — the mid-loop `ret = 0`
  // in C is overwritten by `ret = 1` at the label, so we don't set it here.
  deduction: for (;;) {
    let doneSomething = false;

    // Sole remaining number position → mark known.
    for (let i = 0; i < nrects; i++) {
      if (numbers[i].npoints === 1) {
        const x = numbers[i].points[0].x;
        const y = numbers[i].points[0].y;
        if (overlaps[(i * h + y) * w + x] >= -1) {
          if (overlaps[(i * h + y) * w + x] <= 0) {
            break deduction;
          }
          for (let j = 0; j < nrects; j++) overlaps[(j * h + y) * w + x] = -1;
          overlaps[(i * h + y) * w + x] = -2;
        }
      }
    }

    // Intersection of all placements → mark known.
    for (let i = 0; i < nrects; i++) {
      let minx = 0;
      let miny = 0;
      let maxx = w;
      let maxy = h;
      for (let j = 0; j < rectpositions[i].n; j++) {
        const r = rectpositions[i].rects[j];
        if (minx < r.x) minx = r.x;
        if (miny < r.y) miny = r.y;
        if (maxx > r.x + r.w) maxx = r.x + r.w;
        if (maxy > r.y + r.h) maxy = r.y + r.h;
      }
      for (let yy = miny; yy < maxy; yy++)
        for (let xx = minx; xx < maxx; xx++)
          if (overlaps[(i * h + yy) * w + xx] >= -1) {
            if (overlaps[(i * h + yy) * w + xx] <= 0) {
              break deduction;
            }
            for (let j = 0; j < nrects; j++) overlaps[(j * h + yy) * w + xx] = -1;
            overlaps[(i * h + yy) * w + xx] = -2;
          }
    }

    // Rectangle-focused elimination.
    for (let i = 0; i < nrects; i++) {
      for (let j = 0; j < rectpositions[i].n; j++) {
        const r = rectpositions[i].rects[j];
        let del = false;
        for (let k = 0; k < nrects; k++) workspace[k] = 0;

        for (let yy = 0; yy < r.h; yy++) {
          const y = yy + r.y;
          for (let xx = 0; xx < r.w; xx++) {
            const x = xx + r.x;
            if (overlaps[(i * h + y) * w + x] === -1) del = true;
            if (rectbyplace[y * w + x] !== -1) workspace[rectbyplace[y * w + x]]++;
          }
        }

        if (!del) {
          for (let k = 0; k < nrects; k++)
            if (k !== i && workspace[k] === numbers[k].npoints) {
              del = true;
              break;
            }
          if (!del && workspace[i] === 0) del = true;
        }

        if (del) {
          removeRectPlacement(w, h, rectpositions, overlaps, i, j);
          j--;
          doneSomething = true;
        }
      }
    }

    // Square-focused elimination.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Known squares are <0 everywhere, so check rect 0's plane only.
        if (overlaps[y * w + x] < 0) continue;
        let n = 0;
        let index = -1;
        for (let i = 0; i < nrects; i++)
          if (overlaps[(i * h + y) * w + x] > 0) {
            n++;
            index = i;
          }
        if (n === 1) {
          for (let j = 0; j < rectpositions[index].n; j++) {
            const r = rectpositions[index].rects[j];
            if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
            removeRectPlacement(w, h, rectpositions, overlaps, index, j);
            j--;
            doneSomething = true;
          }
        }
      }
    }

    if (doneSomething) continue;

    // Winnow number placements (generation only; deterministic solve stops).
    if (rs) {
      const rpns: Array<{ rect: number; placement: number; number: number }> = [];
      for (let i = 0; i < nrects; i++) {
        for (let j = 0; j < rectpositions[i].n; j++) {
          const r = rectpositions[i].rects[j];
          for (let yy = 0; yy < r.h; yy++) {
            const y = yy + r.y;
            for (let xx = 0; xx < r.w; xx++) {
              const x = xx + r.x;
              if (rectbyplace[y * w + x] >= 0 && rectbyplace[y * w + x] !== i) {
                rpns.push({ rect: i, placement: j, number: rectbyplace[y * w + x] });
              }
            }
          }
        }
      }

      if (rpns.length > 0) {
        const index = randomUpto(rs, rpns.length);
        const rpn = rpns[index];
        const i = rpn.rect;
        const j = rpn.placement;
        const k = rpn.number;
        const r = rectpositions[i].rects[j];
        for (let m = 0; m < numbers[k].npoints; m++) {
          const x = numbers[k].points[m].x;
          const y = numbers[k].points[m].y;
          if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) {
            removeNumberPlacement(w, numbers[k], m, rectbyplace);
            m--;
            doneSomething = true;
          }
        }
      }
    }

    if (!doneSomething) break;
  }

  // Finalise (upstream's `cleanup:`): the verdict is recomputed purely from the
  // surviving placement counts, and the sole placement of a solved rectangle is
  // written into the edge grids when they were supplied.
  let ret = SOLVE_UNIQUE;
  for (let i = 0; i < nrects; i++) {
    if (rectpositions[i].n <= 0) {
      ret = SOLVE_INCONSISTENT;
    } else if (rectpositions[i].n > 1) {
      ret = SOLVE_AMBIGUOUS;
    } else if (hedge && vedge) {
      const r = rectpositions[i].rects[0];
      for (let y = 0; y < r.h; y++) {
        if (r.x > 0) vedge[(r.y + y) * w + r.x] = 1;
        if (r.x + r.w < w) vedge[(r.y + y) * w + (r.x + r.w)] = 1;
      }
      for (let x = 0; x < r.w; x++) {
        if (r.y > 0) hedge[r.y * w + (r.x + x)] = 1;
        if (r.y + r.h < h) hedge[(r.y + r.h) * w + (r.x + x)] = 1;
      }
    }
  }

  return ret;
}
