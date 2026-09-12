/**
 * The chain ordinal: a small number in a cell's corner saying **where in an
 * ordered chain of forced consequences that cell falls**.
 *
 * A Tactic is a bounded chain of forced consequences to a named endpoint.
 * Narrated over an *unordered* set of shaded cells ("a contradiction further
 * along"), it is a claim the player can only check by redoing the deduction,
 * which docs/games/hints.md § "The forcing boundary" forbids; the order is what
 * turns the shading back into something walkable.
 *
 * **Why a number and not an arrow.** The obvious drawing is a path through the
 * chain, and it was prototyped and measured before being rejected. An arrow
 * between two cells claims *this one
 * forces that one*, which in Clusters is false in a third of links — what forces
 * a cell there is its own neighborhood, not the cell before it in discovery
 * order — and half its links are not even adjacent, so the arrows crossed the
 * board. An ordinal claims only the order, which is true in every game that
 * draws one. It also stays inside one tile, so it rides the existing
 * `OverlaySidecar` diff instead of needing a second drawing pass.
 *
 * Note that a *true* implication chain (the Latin family's, where each link
 * really is forced by its predecessor) is not thereby entitled to arrows: what
 * decides the glyph is that one mark should mean one thing across the
 * collection, and the weakest true claim is the one every chain can make.
 */

import type { GameDrawing } from "./game.ts";
import type { Point } from "./types.ts";

/**
 * Draw chain position `k` (1-based) in the **bottom-right** corner of the tile
 * whose top-left pixel is `at`, sized off `tileSize`.
 *
 * A corner rather than the center: a chain cell carries content of its own — the
 * color it would be forced to, its two surviving pencil marks — and the ordinal
 * answers a different question from that content (*when*, not *what*), so
 * overlapping them blurs two claims into one mark.
 *
 * **Bottom-right specifically, and it is the only corner free in every game that
 * draws one.** Keen and Solo put a cage clue in the top-left; the candidate
 * games pack an empty cell's pencil marks from the top-left too, and a chain
 * cell has exactly two candidates by definition of the technique, so its marks
 * are always in the top row. One corner across the collection is worth more than
 * a per-game best fit: the mark means the same thing everywhere, so it can be
 * learned once.
 *
 * `inset` overrides the default corner inset, for a cell whose corner is already
 * spoken for: Clusters' contradiction lands on the final chain cell often enough
 * that "numbered *and* ringed" is a common frame, and at the default the ring
 * painted straight over the digit.
 */
export function drawHintOrdinal(
  dr: GameDrawing,
  at: Point,
  tileSize: number,
  k: number,
  color: number,
  inset = Math.max(1, Math.floor(tileSize / 12)),
): void {
  const size = Math.max(7, Math.floor(tileSize / 3));
  dr.drawText(
    // `mathematical` centers the glyph vertically on `y`, so the bottom inset
    // has to carry half the size or the digit is clipped by the tile edge.
    {
      x: at.x + tileSize - inset,
      y: at.y + tileSize - inset - Math.floor(size / 2),
    },
    { align: "right", baseline: "mathematical", fontType: "variable", size },
    color,
    String(k),
  );
}
