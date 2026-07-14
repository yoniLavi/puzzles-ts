import { describe, expect, it } from "vitest";
import { HINT_AREA, HINT_TARGET, hintMarkBit, HintSidecar } from "./hint-sidecar.ts";

describe("HintSidecar", () => {
  const idx = (x: number, y: number) => y * 3 + x;
  const marks = (m: { x: number; y: number; n: number }) => hintMarkBit(m.n);

  it("every cell is stale before its first commit", () => {
    const s = new HintSidecar(9);
    for (let i = 0; i < 9; i++) expect(s.stale(i)).toBe(true);
  });

  it("packs area, target and marks; commit settles exactly that cell", () => {
    const s = new HintSidecar(9);
    s.pack(
      { area: [{ x: 0, y: 0 }], targets: [{ x: 1, y: 0 }], marks: [{ x: 1, y: 0, n: 3 }] },
      idx,
      marks,
    );
    expect(s.packed[0]).toBe(HINT_AREA);
    expect(s.packed[1]).toBe(HINT_TARGET | hintMarkBit(3));
    s.commit(1);
    expect(s.stale(1)).toBe(false);
    expect(s.stale(0)).toBe(true);
  });

  it("a hint change makes exactly the affected cells stale again", () => {
    const s = new HintSidecar(9);
    s.pack({ targets: [{ x: 2, y: 2 }], marks: [] }, idx, marks);
    for (let i = 0; i < 9; i++) s.commit(i);
    // The hint moves to another cell: old cell must repaint (erase), new
    // cell must repaint (draw), the rest are settled.
    s.pack({ targets: [{ x: 0, y: 1 }], marks: [] }, idx, marks);
    expect(s.stale(idx(2, 2))).toBe(true);
    expect(s.stale(idx(0, 1))).toBe(true);
    expect(s.stale(idx(1, 1))).toBe(false);
  });

  it("packing undefined clears the overlay (hint dismissed)", () => {
    const s = new HintSidecar(4);
    s.pack({ targets: [{ x: 0, y: 0 }], marks: [] }, (x, y) => y * 2 + x, marks);
    for (let i = 0; i < 4; i++) s.commit(i);
    s.pack(undefined, (x, y) => y * 2 + x, marks);
    expect(s.stale(0)).toBe(true); // the erased cell repaints
    expect(s.stale(1)).toBe(false);
  });
});
