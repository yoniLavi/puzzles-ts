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
import { LOCKED } from "./state.ts";

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
  /** The tile that `v`'s wire in direction `dir` links to, or -1 for none. */
  const linked = (v: number, dir: number): number => {
    if (!(tiles[v] & dir) || (barriers && barriers[v] & dir)) return -1;
    const o = offset(v % w, Math.floor(v / w), dir, w, h);
    const v1 = o.y * w + o.x;
    if (!includeUnlocked && !(tiles[v] & tiles[v1] & LOCKED)) return -1;
    return tiles[v1] & opposite(dir) ? v1 : -1;
  };

  const fls = findLoops(w * h, (v) => {
    const out: number[] = [];
    for (const dir of DIRECTIONS) {
      const v1 = linked(v, dir);
      if (v1 >= 0) out.push(v1);
    }
    return out;
  });

  const loops = new Int32Array(w * h);
  for (let v = 0; v < w * h; v++) {
    for (const dir of DIRECTIONS) {
      const v1 = linked(v, dir);
      if (v1 >= 0 && fls.isLoopEdge(v, v1)) loops[v] |= dir << ERR_SHIFT;
    }
  }
  return loops;
}
