/**
 * Netslide board generation.
 *
 * Three RNG-consuming phases, in this order — and the *order* is load-bearing,
 * because the differential asserts the desc byte-for-byte against C for the
 * same seed (see the port's design.md, D6):
 *
 *   1. Grow the solved grid outward from the centre as a spanning tree.
 *   2. Shuffle it with random slides.
 *   3. Choose barrier locations.
 *
 * Upstream is explicit that (3) comes after (2) on purpose: it means that
 * changing the barrier rate on a fixed seed leaves the shuffled grid alone, and
 * that *raising* the rate yields a superset of the barriers the lower rate gave
 * — so a player who finds a board too hard and asks for more barriers keeps the
 * ones they had already worked out.
 */

import { SortedMultiset } from "../../engine/sorted-multiset.ts";
import type { RandomState } from "../../random/index.ts";
import { randomUpto } from "../../random/index.ts";
import {
  D,
  DIRECTIONS,
  L,
  type NetslideParams,
  offset,
  opposite,
  R,
  slideCol,
  slideRow,
  U,
  wireCount,
} from "./state.ts";

const HEX = "0123456789abcdef";

/** A candidate grid edge: extend the tile at `(x, y)` in `direction`. */
interface Xyd {
  x: number;
  y: number;
  direction: number;
}

/** Upstream `xyd_cmp` — lexicographic on x, then y, then direction. This is
 * the order the RNG indexes into (`randomUpto(size)` → `removeAt(i)`), so it
 * is part of the byte-match surface, not merely a tidy convention. */
function xydCmp(a: Xyd, b: Xyd): number {
  return a.x - b.x || a.y - b.y || a.direction - b.direction;
}

export function newDesc(
  p: NetslideParams,
  rs: RandomState,
): { desc: string; aux: string } {
  const { w, h } = p;
  const tiles = new Uint8Array(w * h);
  const barriers = new Uint8Array(w * h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  growSpanningTree(tiles, p, cx, cy, rs);

  // The barrier candidates are the edges the *solved* grid leaves unwired, so
  // a barrier can never sit across a wire of the solution. Collected before the
  // shuffle, because that is the grid the barriers have to be compatible with.
  const barrierCandidates = new SortedMultiset<Xyd>(xydCmp);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = tiles[y * w + x];
      if (!(tile & R) && (p.wrapping || x < w - 1)) {
        barrierCandidates.add({ x, y, direction: R });
      }
      if (!(tile & D) && (p.wrapping || y < h - 1)) {
        barrierCandidates.add({ x, y, direction: D });
      }
    }
  }

  // The unshuffled grid is the solution; `solve()` just replays it.
  const aux = Array.from(tiles, (t) => HEX[t & 0xf]).join("");

  shuffle(tiles, p, cx, cy, rs);
  placeBarriers(barriers, barrierCandidates, p, rs);

  return { desc: encodeDesc(tiles, barriers, p), aux };
}

/**
 * Build the solved grid: start at the centre and repeatedly pick, uniformly at
 * random, one of the available ways to extend a used tile into an unused one.
 *
 * Two constraints are maintained as the frontier is updated. **No full crosses**
 * — after a tile grows its third arm, its fourth possibility is withdrawn,
 * because a four-armed tile looks the same in every orientation and so gives the
 * player nothing. **No loops** — every possibility pointing *into* the tile just
 * reached is withdrawn, since taking one would close a cycle.
 *
 * Upstream carries a proof that these two rules cannot paint the construction
 * into a corner (an unreachable region would have to be walled in by T-pieces
 * pointing away from it, whose border would have to be a closed loop — which
 * loop avoidance already made impossible), so this terminates with every tile
 * connected. Worth trusting rather than re-deriving.
 */
function growSpanningTree(
  tiles: Uint8Array,
  p: NetslideParams,
  cx: number,
  cy: number,
  rs: RandomState,
): void {
  const { w, h } = p;
  const possibilities = new SortedMultiset<Xyd>(xydCmp);

  // Note these bounds checks ignore wrapping, exactly as upstream: the growth
  // seeds only the in-grid neighbours of the centre.
  if (cx + 1 < w) possibilities.add({ x: cx, y: cy, direction: R });
  if (cy - 1 >= 0) possibilities.add({ x: cx, y: cy, direction: U });
  if (cx - 1 >= 0) possibilities.add({ x: cx, y: cy, direction: L });
  if (cy + 1 < h) possibilities.add({ x: cx, y: cy, direction: D });

  while (possibilities.size > 0) {
    const {
      x: x1,
      y: y1,
      direction: d1,
    } = possibilities.removeAt(randomUpto(rs, possibilities.size));
    const { x: x2, y: y2 } = offset(x1, y1, d1, w, h);
    const d2 = opposite(d1);

    tiles[y1 * w + x1] |= d1;
    tiles[y2 * w + x2] |= d2;

    // A T-piece has had its say: withdraw the fourth arm.
    if (wireCount(tiles[y1 * w + x1]) === 3) {
      possibilities.delete({ x: x1, y: y1, direction: 0x0f ^ tiles[y1 * w + x1] });
    }

    // Loop avoidance: nothing else may now grow into the tile we just reached.
    for (const d of DIRECTIONS) {
      const { x: x3, y: y3 } = offset(x2, y2, d, w, h);
      possibilities.delete({ x: x3, y: y3, direction: opposite(d) });
    }

    // The new frontier: ways out of the tile we just reached.
    for (const d of DIRECTIONS) {
      if (d === d2) continue; // that is the arm we arrived by
      if (!p.wrapping) {
        if (d === U && y2 === 0) continue;
        if (d === D && y2 === h - 1) continue;
        if (d === L && x2 === 0) continue;
        if (d === R && x2 === w - 1) continue;
      }
      const { x: x3, y: y3 } = offset(x2, y2, d, w, h);
      if (tiles[y3 * w + x3]) continue; // already used — would make a loop
      possibilities.add({ x: x2, y: y2, direction: d });
    }
  }
}

/**
 * Scramble the solved grid with random slides.
 *
 * A slide is declined — and, note, **declined after its random draws have
 * already been made**, then retried without counting toward the total — when it
 * would directly undo the previous slide, or when it would repeat the previous
 * slide so many times that the same result was reachable in fewer slides the
 * other way round. Reproducing the draws *and* the rejection is what keeps the
 * desc byte-identical to C; a cleaned-up "pick a legal move" loop would consume
 * the RNG differently and generate a different board.
 */
function shuffle(
  tiles: Uint8Array,
  p: NetslideParams,
  cx: number,
  cy: number,
  rs: RandomState,
): void {
  const { w, h } = p;
  const cols = w - 1; // the centre column cannot be slid
  const rows = h - 1; // nor the centre row
  const moves = p.movetarget || cols * rows * 2;

  let prevdir = -1;
  let prevrowcol = -1;
  let nrepeats = 0;

  for (let i = 0; i < moves /* incremented only on an accepted slide */; ) {
    // 0, 1, 2, 3 = up, right, down, left.
    const dir = randomUpto(rs, 4);
    let rowcol: number;

    if (dir % 2 === 0) {
      let col = randomUpto(rs, cols);
      if (col >= cx) col += 1; // skip the un-slidable centre column
      if (col === prevrowcol) {
        if (dir === 2 - prevdir) continue; // undoes the last slide
        if (dir === prevdir && (nrepeats + 1) * 2 > h) continue; // the long way round
      }
      slideCol(w, h, tiles, 1 - dir, col);
      rowcol = col;
    } else {
      let row = randomUpto(rs, rows);
      if (row >= cy) row += 1; // skip the un-slidable centre row
      if (row === prevrowcol) {
        if (dir === 4 - prevdir) continue; // undoes the last slide
        if (dir === prevdir && (nrepeats + 1) * 2 > w) continue; // the long way round
      }
      slideRow(w, tiles, 2 - dir, row);
      rowcol = row;
    }

    nrepeats = dir === prevdir && rowcol === prevrowcol ? nrepeats + 1 : 1;
    prevdir = dir;
    prevrowcol = rowcol;
    i++;
  }
}

/**
 * Draw barriers one at a time from the candidate set — which is why raising the
 * barrier probability on a fixed seed *extends* the previous barrier set rather
 * than replacing it.
 *
 * The count is `(int)(barrier_probability * candidates)` in C, where the
 * probability is a **`float`**, so the multiply and the truncation happen in
 * single precision. `Math.fround` reproduces that; on a fractional probability
 * it can be the difference of one barrier, and therefore of the whole board.
 */
function placeBarriers(
  barriers: Uint8Array,
  candidates: SortedMultiset<Xyd>,
  p: NetslideParams,
  rs: RandomState,
): void {
  const { w, h } = p;
  let nbarriers = Math.trunc(
    Math.fround(Math.fround(p.barrierProbability) * candidates.size),
  );

  while (nbarriers > 0) {
    const {
      x: x1,
      y: y1,
      direction: d1,
    } = candidates.removeAt(randomUpto(rs, candidates.size));
    const { x: x2, y: y2 } = offset(x1, y1, d1, w, h);

    barriers[y1 * w + x1] |= d1;
    barriers[y2 * w + x2] |= opposite(d1);

    nbarriers--;
  }
}

/**
 * Each tile is a hex digit of its wire mask, optionally followed by `v` (a
 * barrier to its right) and/or `h` (a barrier below it). Only the right/down
 * side of each tile is recorded — the other two sides are its neighbours' —
 * and the border sides are skipped entirely unless the game wraps.
 */
function encodeDesc(
  tiles: Uint8Array,
  barriers: Uint8Array,
  p: NetslideParams,
): string {
  const { w, h } = p;
  let desc = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      desc += HEX[tiles[i]];
      if ((p.wrapping || x < w - 1) && barriers[i] & R) desc += "v";
      if ((p.wrapping || y < h - 1) && barriers[i] & D) desc += "h";
    }
  }
  return desc;
}
