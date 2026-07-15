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

import {
  collectBarrierCandidates,
  encodeWireDesc,
  growSpanningTree,
  placeBarriers,
} from "../../engine/wires.ts";
import type { RandomState } from "../../random/index.ts";
import { randomUpto } from "../../random/index.ts";
import { type NetslideParams, slideCol, slideRow } from "./state.ts";

const HEX = "0123456789abcdef";

export function newDesc(
  p: NetslideParams,
  rs: RandomState,
): { desc: string; aux: string } {
  const { w, h } = p;
  const tiles = new Uint8Array(w * h);
  const barriers = new Uint8Array(w * h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  growSpanningTree(tiles, w, h, p.wrapping, cx, cy, rs);

  // The barrier candidates are the edges the *solved* grid leaves unwired, so
  // a barrier can never sit across a wire of the solution. Collected before the
  // shuffle, because that is the grid the barriers have to be compatible with.
  const barrierCandidates = collectBarrierCandidates(tiles, w, h, p.wrapping);

  // The unshuffled grid is the solution; `solve()` just replays it.
  const aux = Array.from(tiles, (t) => HEX[t & 0xf]).join("");

  shuffle(tiles, p, cx, cy, rs);
  placeBarriers(barriers, barrierCandidates, w, h, p.barrierProbability, rs);

  return { desc: encodeWireDesc(tiles, barriers, w, h, p.wrapping), aux };
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
