/**
 * `GridDrag` — the shared anchor/current pair, and the four questions a game
 * used to answer for itself.
 *
 * Each `it` below is aimed at one helper, so breaking that helper fails a named
 * test rather than a scatter of them. The mutations they were checked against
 * are recorded in the change's `tasks.md`.
 */

import { describe, expect, it } from "vitest";
import { endDrag, GridDrag, moveDrag, newDrag, startDrag } from "./pointer.ts";

describe("GridDrag", () => {
  it("starts idle, and says so", () => {
    const d = newDrag();
    expect(d.live).toBe(false);
    // The coordinates are meaningless while idle, but they must not read as a
    // real cell: a game that forgets to check `live` should land out of bounds
    // rather than silently on (0, 0).
    expect([d.sx, d.sy, d.ex, d.ey]).toEqual([-1, -1, -1, -1]);
  });

  it("anchors both ends where the drag began", () => {
    const d = newDrag();
    startDrag(d, 3, 7);
    expect(d.live).toBe(true);
    expect([d.sx, d.sy]).toEqual([3, 7]);
    // Both ends, not just the anchor — a game that reads the near end before
    // the first move event must see the press cell, not the last drag's.
    expect([d.ex, d.ey]).toEqual([3, 7]);
  });

  it("moves the near end and leaves the anchor alone", () => {
    const d = newDrag();
    startDrag(d, 3, 7);
    expect(moveDrag(d, 5, 7)).toBe(true);
    expect([d.sx, d.sy]).toEqual([3, 7]);
    expect([d.ex, d.ey]).toEqual([5, 7]);
  });

  it("reports a move onto the cell it was already on as no change", () => {
    // This is the predicate several games hand-rolled to avoid repainting for a
    // drag event that landed where the last one did.
    const d = newDrag();
    startDrag(d, 3, 7);
    expect(moveDrag(d, 3, 7)).toBe(false);
    expect(moveDrag(d, 4, 7)).toBe(true);
    expect(moveDrag(d, 4, 7)).toBe(false);
  });

  it("refuses to move a drag that is not running", () => {
    // A stray drag event — one whose press the game declined — must not start a
    // drag by the back door.
    const d = newDrag();
    expect(moveDrag(d, 2, 2)).toBe(false);
    expect(d.live).toBe(false);
    expect([d.ex, d.ey]).toEqual([-1, -1]);
  });

  it("ends a running drag once, and reports which call did it", () => {
    const d = newDrag();
    startDrag(d, 1, 1);
    expect(endDrag(d)).toBe(true);
    expect(d.live).toBe(false);
    // Idempotent, and the second call says it did nothing: a release arriving
    // after a cancel must not read as something to commit.
    expect(endDrag(d)).toBe(false);
  });

  it("leaves the last positions readable after it ends", () => {
    // A release commits from the positions, so ending must not clear them
    // before the game has read them.
    const d = newDrag();
    startDrag(d, 2, 4);
    moveDrag(d, 6, 4);
    endDrag(d);
    expect([d.sx, d.sy, d.ex, d.ey]).toEqual([2, 4, 6, 4]);
  });

  it("is recognizable by instanceof, which is how the engine finds one", () => {
    // The engine cancels a drag it finds on a `Ui` it knows nothing else about,
    // and does it by type rather than by field names — a scan keyed on a name
    // is the failure mode this collection has hit most often. If `GridDrag`
    // ever stops being a class, the midend's sweep silently finds nothing.
    const ui = { cursor: { x: 0, y: 0, visible: false }, drag: newDrag(), n: 3 };
    const found = Object.values(ui).filter((v) => v instanceof GridDrag);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(ui.drag);
  });
});
