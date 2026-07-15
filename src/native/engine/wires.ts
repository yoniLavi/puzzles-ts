/**
 * Shared model layer for the two wire-grid puzzles, Net and Netslide.
 *
 * Both are grids of Net wire tiles whose solved configuration is a spanning
 * tree rooted at a source; they differ only in *how the player rearranges the
 * grid* (Net rotates a tile in place, Netslide slides a whole line). Everything
 * up to and including that rearrangement — the direction algebra, the hex wire
 * description codec, the spanning-tree grower, barrier placement, and the
 * "power flows from the source" flood — is identical, and lives here.
 *
 * Extracted from Netslide's `state.ts`/`generator.ts` when Net became the
 * second consumer (the promotion trigger the migration playbook names). It is a
 * behaviour-preserving lift: Netslide's byte-identical differential and its
 * render snapshots are the oracle, so nothing here changes what Netslide
 * produces.
 *
 * ## The `0x10` trap (design D2)
 *
 * A tile's low four bits are its wires (`R U L D`); the *same* four bits name a
 * direction. Bit `0x10`, however, means different things to the two games —
 * `FLASHING` to Netslide, `LOCKED` to Net — so this module defines **only the
 * wire bits (`0x0F`)** and leaves every high bit to each game. In particular
 * {@link computeActive} takes the "active" bit as a parameter rather than
 * hard-coding one.
 */

import type { RandomState } from "../random/index.ts";
import { randomUpto } from "../random/index.ts";
import { SortedMultiset } from "./sorted-multiset.ts";

/* ----------------------------------------------------------------------
 * Direction / wire-mask algebra (upstream's macros R/U/L/D, A/C/F/ROT,
 * X/Y, COUNT, OFFSET).
 */

export const R = 0x01;
export const U = 0x02;
export const L = 0x04;
export const D = 0x08;

/** The four directions in upstream's iteration order (`d = 1; d < 0x10;
 * d <<= 1`). Ports of upstream loops depend on this order. */
export const DIRECTIONS: readonly number[] = [R, U, L, D];

/** Rotate a direction/wire mask one step anticlockwise (upstream `A`). */
export function anticlockwise(x: number): number {
  return ((x & 0x07) << 1) | ((x & 0x08) >> 3);
}

/** Rotate a direction/wire mask one step clockwise (upstream `C`). */
export function clockwise(x: number): number {
  return ((x & 0x0e) >> 1) | ((x & 0x01) << 3);
}

/** Reverse a direction/wire mask (upstream `F`). */
export function opposite(x: number): number {
  return ((x & 0x0c) >> 2) | ((x & 0x03) << 2);
}

/** Rotate `x` by `n` quarter-turns, upstream's `ROT(x, n)`:
 * 0 = identity, 1 = anticlockwise, 2 = flip, 3 = clockwise. */
export function rot(x: number, n: number): number {
  switch (n & 3) {
    case 0:
      return x;
    case 1:
      return anticlockwise(x);
    case 2:
      return opposite(x);
    default:
      return clockwise(x);
  }
}

/** The x displacement of a single direction bit (upstream `X`). */
export function dirX(dir: number): number {
  return dir === R ? +1 : dir === L ? -1 : 0;
}

/** The y displacement of a single direction bit (upstream `Y`). */
export function dirY(dir: number): number {
  return dir === D ? +1 : dir === U ? -1 : 0;
}

/** Number of wires in a tile mask (upstream `COUNT`). */
export function wireCount(tile: number): number {
  return (
    ((tile & 0x08) >> 3) + ((tile & 0x04) >> 2) + ((tile & 0x02) >> 1) + (tile & 0x01)
  );
}

/** Step one tile in `dir`, wrapping around the torus (upstream's `OFFSET`
 * macro — it wraps unconditionally; a non-wrapping game is fenced in by
 * border barriers instead, not by clamping the arithmetic). */
export function offset(
  x: number,
  y: number,
  dir: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return {
    x: (x + w + dirX(dir)) % w,
    y: (y + h + dirY(dir)) % h,
  };
}

/* ----------------------------------------------------------------------
 * The candidate-edge structure both generators index into.
 */

/** A candidate grid edge: extend the tile at `(x, y)` in `direction`. */
export interface Xyd {
  x: number;
  y: number;
  direction: number;
}

/** Upstream `xyd_cmp` — lexicographic on x, then y, then direction. This is
 * the order the RNG indexes into (`randomUpto(size)` → `removeAt(i)`), so it
 * is part of the byte-match surface, not merely a tidy convention. */
export function xydCmp(a: Xyd, b: Xyd): number {
  return a.x - b.x || a.y - b.y || a.direction - b.direction;
}

/* ----------------------------------------------------------------------
 * Spanning-tree growth.
 */

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
export function growSpanningTree(
  tiles: Uint8Array,
  w: number,
  h: number,
  wrapping: boolean,
  cx: number,
  cy: number,
  rs: RandomState,
): void {
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
      if (!wrapping) {
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

/* ----------------------------------------------------------------------
 * Barriers.
 */

/**
 * The barrier candidates are the edges the *solved* grid leaves unwired, so a
 * barrier can never sit across a wire of the solution. Only the right/down side
 * of each tile is recorded (the other two are its neighbours'), and border
 * sides are skipped unless the game wraps.
 */
export function collectBarrierCandidates(
  tiles: Uint8Array,
  w: number,
  h: number,
  wrapping: boolean,
): SortedMultiset<Xyd> {
  const candidates = new SortedMultiset<Xyd>(xydCmp);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = tiles[y * w + x];
      if (!(tile & R) && (wrapping || x < w - 1)) {
        candidates.add({ x, y, direction: R });
      }
      if (!(tile & D) && (wrapping || y < h - 1)) {
        candidates.add({ x, y, direction: D });
      }
    }
  }
  return candidates;
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
export function placeBarriers(
  barriers: Uint8Array,
  candidates: SortedMultiset<Xyd>,
  w: number,
  h: number,
  barrierProbability: number,
  rs: RandomState,
): void {
  let nbarriers = Math.trunc(
    Math.fround(Math.fround(barrierProbability) * candidates.size),
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

/* ----------------------------------------------------------------------
 * The hex description codec.
 *
 * Each tile is a hex digit of its wire mask, optionally followed by `v` (a
 * barrier to its right) and/or `h` (a barrier below it). Only the right/down
 * side of each tile is recorded — the other two are its neighbours' — and the
 * border sides are skipped entirely unless the game wraps.
 */

export function validateWireDesc(w: number, h: number, desc: string): string | null {
  let i = 0;
  for (let n = 0; n < w * h; n++) {
    const c = desc[i];
    if (c === undefined) return "Game description shorter than expected";
    if (!/[0-9a-fA-F]/.test(c))
      return "Game description contained unexpected character";
    i++;
    while (desc[i] === "h" || desc[i] === "v") i++;
  }
  if (i < desc.length) return "Game description longer than expected";
  return null;
}

/**
 * Parse a desc into a fresh wire grid and the barriers it names. Both are the
 * bare wire bits (`0x0F`) — no border fence, no corner-join flags; those are
 * each game's business, added by {@link addBorderBarriers} and the renderers.
 */
export function parseWireDesc(
  w: number,
  h: number,
  desc: string,
): { tiles: Uint8Array; barriers: Uint8Array } {
  const tiles = new Uint8Array(w * h);
  const barriers = new Uint8Array(w * h);

  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tiles[y * w + x] = Number.parseInt(desc[i], 16);
      i++;
      while (desc[i] === "h" || desc[i] === "v") {
        const d1 = desc[i] === "v" ? R : D;
        const n = offset(x, y, d1, w, h);
        barriers[y * w + x] |= d1;
        barriers[n.y * w + n.x] |= opposite(d1);
        i++;
      }
    }
  }

  return { tiles, barriers };
}

/** Fence a non-wrapping grid in with a wall all the way round. */
export function addBorderBarriers(barriers: Uint8Array, w: number, h: number): void {
  for (let x = 0; x < w; x++) {
    barriers[x] |= U;
    barriers[(h - 1) * w + x] |= D;
  }
  for (let y = 0; y < h; y++) {
    barriers[y * w] |= L;
    barriers[y * w + (w - 1)] |= R;
  }
}

/** Encode a wire grid and its barriers back into a description string. */
export function encodeWireDesc(
  tiles: Uint8Array,
  barriers: Uint8Array,
  w: number,
  h: number,
  wrapping: boolean,
): string {
  const HEX = "0123456789abcdef";
  let desc = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      desc += HEX[tiles[i] & 0xf];
      if ((wrapping || x < w - 1) && barriers[i] & R) desc += "v";
      if ((wrapping || y < h - 1) && barriers[i] & D) desc += "h";
    }
  }
  return desc;
}

/* ----------------------------------------------------------------------
 * Powering.
 */

/**
 * Flood outward from the source tile: a tile is *active* (powered) when it is
 * reachable from the source through wires that connect in both directions and
 * are not separated by a barrier. This is both the "how close am I?" visual aid
 * and the win condition — the game is complete when every tile is active.
 *
 * `movingRow` / `movingCol` blank out a line that is mid-slide (Netslide), so
 * the powered highlight does not appear to leap across a line currently in
 * motion; pass `-1` for a game with no sliding lines (Net). `activeBit` is the
 * per-game flag written into the returned array (each game owns its own high
 * bits — see the `0x10` trap above).
 *
 * Upstream drains its worklist in sorted order via a `tree234`. That is
 * incidental — a flood fill's reachable set does not depend on visit order — so
 * a plain stack is used.
 */
export function computeActive(
  w: number,
  h: number,
  tiles: Uint8Array,
  barriers: Uint8Array,
  cx: number,
  cy: number,
  activeBit: number,
  movingRow = -1,
  movingCol = -1,
): Uint8Array {
  const active = new Uint8Array(w * h);

  active[cy * w + cx] = activeBit;
  const todo: number[] = [cy * w + cx];

  while (todo.length > 0) {
    const cur = todo.pop() as number;
    const x1 = cur % w;
    const y1 = (cur - x1) / w;

    for (const d1 of DIRECTIONS) {
      const { x: x2, y: y2 } = offset(x1, y1, d1, w, h);
      if (x2 === movingCol || y2 === movingRow) continue;
      if (!(tiles[y1 * w + x1] & d1)) continue;
      if (!(tiles[y2 * w + x2] & opposite(d1))) continue;
      if (barriers[y1 * w + x1] & d1) continue;
      if (active[y2 * w + x2]) continue;

      active[y2 * w + x2] = activeBit;
      todo.push(y2 * w + x2);
    }
  }

  return active;
}
