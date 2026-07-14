import { describe, expect, it } from "vitest";
import {
  HINT_AREA,
  HINT_TARGET,
  hintMarkBit,
  OVERLAY_FLAG,
  OverlaySidecar,
} from "./overlay-sidecar.ts";

describe("OverlaySidecar", () => {
  const idx = (x: number, y: number) => y * 3 + x;
  const marks = (m: { x: number; y: number; n: number }) => hintMarkBit(m.n);

  it("every cell is stale before its first commit", () => {
    const s = new OverlaySidecar(9);
    for (let i = 0; i < 9; i++) expect(s.stale(i)).toBe(true);
  });

  it("packs area, target and marks; commit settles exactly that cell", () => {
    const s = new OverlaySidecar(9);
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
    const s = new OverlaySidecar(9);
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
    const s = new OverlaySidecar(4);
    s.pack({ targets: [{ x: 0, y: 0 }], marks: [] }, (x, y) => y * 2 + x, marks);
    for (let i = 0; i < 4; i++) s.commit(i);
    s.pack(undefined, (x, y) => y * 2 + x, marks);
    expect(s.stale(0)).toBe(true); // the erased cell repaints
    expect(s.stale(1)).toBe(false);
  });

  it("packCells flags a mistake list and leaves the rest clear", () => {
    const s = new OverlaySidecar(9);
    s.packCells(
      [
        { x: 1, y: 0 },
        { x: 2, y: 2 },
      ],
      idx,
    );
    expect(s.packed[idx(1, 0)]).toBe(OVERLAY_FLAG);
    expect(s.at(idx(2, 2))).toBe(true);
    expect(s.at(idx(0, 0))).toBe(false);
  });

  it("a mistake overlay that clears makes the flagged cells stale again", () => {
    const s = new OverlaySidecar(9);
    s.packCells([{ x: 1, y: 1 }], idx);
    for (let i = 0; i < 9; i++) s.commit(i);
    // Check & Save's overlay is dropped on the next move: the cell that showed
    // a red highlight must repaint to erase it. (Towers shipped this bug — its
    // mistake array was missing from the diff key, so nothing lit up at all.)
    s.packCells(undefined, idx);
    expect(s.stale(idx(1, 1))).toBe(true);
    expect(s.stale(idx(0, 0))).toBe(false);
  });

  it("clear + add packs a game's own overlay topology", () => {
    // Galaxies' wall overlay: one mistake contributes different bits to the two
    // tiles the wall separates, so it packs itself rather than by cell list.
    const s = new OverlaySidecar(4);
    s.clear();
    s.add(2, 1 << 0);
    s.add(2, 1 << 3);
    expect(s.packed[2]).toBe(0b1001);
    expect(s.at(2)).toBe(true);
    s.commit(2);
    s.clear();
    expect(s.stale(2)).toBe(true);
  });
});
