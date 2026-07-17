/**
 * Loop detection for Net — an idiomatic port of upstream's `net_neighbour` +
 * `compute_loops_inner`, over the shared `engine/findloop.ts`.
 *
 * A tile edge is *part of a loop* when it is a wire connecting two tiles that
 * are joined by some other path too — i.e. the edge is not a bridge. The
 * renderer paints such edges red (a live "you've made a cycle" warning), and
 * the generator's shuffle uses the same detection to reshuffle loop tiles out
 * of an accidental initial cycle.
 *
 * The returned array holds, per tile, the `ERR(dir)` flags (`dir << ERR_SHIFT`)
 * for every direction whose wire is a loop edge — so a non-zero entry means
 * "this tile touches a loop".
 */

import { findLoops } from "../../engine/findloop.ts";
import { DIRECTIONS, offset, opposite } from "../../engine/wires.ts";

const LOCKED = 0x10;

/** Upstream `ERR(dir) = dir << 6`. The error/loop flag for a direction. */
export const ERR_SHIFT = 6;

/**
 * Per-tile loop-edge flags. `includeUnlocked` false restricts the analysis to
 * edges between two *locked* tiles (the player's "highlight only settled loops"
 * mode); true considers every wired connection. `barriers` may be `null`
 * (generation, where the grid is treated as fully toroidal — upstream passes
 * `NULL` and the wrapped offset regardless of the wrapping param).
 */
export function computeLoops(
  w: number,
  h: number,
  tiles: Uint8Array,
  barriers: Uint8Array | null,
  includeUnlocked: boolean,
): Int32Array {
  const neighbours = (vertex: number): number[] => {
    const x = vertex % w;
    const y = Math.floor(vertex / w);
    let tile = tiles[vertex];
    if (barriers) tile &= ~barriers[vertex];

    const out: number[] = [];
    for (const dir of DIRECTIONS) {
      if (!(tile & dir)) continue;
      const { x: x1, y: y1 } = offset(x, y, dir, w, h);
      const v1 = y1 * w + x1;
      if (!includeUnlocked && !(tile & tiles[v1] & LOCKED)) continue;
      if (tiles[v1] & opposite(dir)) out.push(v1);
    }
    return out;
  };

  const fls = findLoops(w * h, neighbours);

  const loops = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = y * w + x;
      let flags = 0;
      for (const dir of DIRECTIONS) {
        if (!(tiles[v] & dir)) continue;
        if (barriers && barriers[v] & dir) continue;
        const { x: x1, y: y1 } = offset(x, y, dir, w, h);
        const v1 = y1 * w + x1;
        if (!includeUnlocked && !(tiles[v] & tiles[v1] & LOCKED)) continue;
        if (tiles[v1] & opposite(dir) && fls.isLoopEdge(v, v1)) {
          flags |= dir << ERR_SHIFT;
        }
      }
      loops[v] = flags;
    }
  }
  return loops;
}
