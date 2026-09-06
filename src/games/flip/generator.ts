/**
 * Flip's two toggle matrices.
 *
 * `crosses` is the fixed plus-shape: a cell toggles itself and its four
 * orthogonal neighbors. `random` is upstream's greedy construction (`flip.c`'s
 * RANDOM branch of `new_game_desc`), which grows overlapping blobs chosen by
 * three sort orders — pick order, coverage, and omino size — so that every cell
 * is covered and the matrix stays interesting to solve.
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { SortedMultiset } from "../../engine/sorted-multiset.ts";

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

function addneighbors(
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

export function genRandomMatrix(w: number, h: number, rng: RandomState): Uint8Array {
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
      addneighbors(t, w, h, ix, iy, ix, iy, matrix);
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
        if (!sq2 || sq2.coverage !== sq.coverage || sq2.x !== sq.x || sq2.y !== sq.y) {
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

      addneighbors(t, w, h, sq.cx, sq.cy, sq.x, sq.y, matrix);
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

export function genCrossesMatrix(w: number, h: number): Uint8Array {
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
