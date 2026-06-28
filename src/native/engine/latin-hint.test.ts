/**
 * Shared Latin-family hint helpers: classifying a forced single placement as
 * naked / hidden / forced from the working board, so a hint narrates the truth
 * (the generic `latin.ts` solver records all three under one `single` reason).
 */
import { describe, expect, it } from "vitest";
import {
  classifyPlacement,
  classifyPlacementInRegions,
  hiddenSingleLine,
  singlePlacementReason,
} from "./latin-hint.ts";

// A 4×4 working board: grid (0 = empty), pencil (bit 1<<d = candidate d).
function board(rows: number[][]): { grid: Int8Array; pencil: Int32Array; w: number } {
  const w = rows.length;
  const grid = new Int8Array(w * w);
  const pencil = new Int32Array(w * w);
  // Each cell is either a placed digit (>0) or a list of candidates (array).
  return { grid, pencil, w };
}

describe("classifyPlacement", () => {
  it("naked single: the cell's own candidates are exactly {n}", () => {
    const { grid, pencil, w } = board([[], [], [], []]);
    // Cell (1,1) has only candidate 3; others irrelevant.
    pencil[1 * w + 1] = 1 << 3;
    expect(classifyPlacement(grid, pencil, 1, 1, 3, w)).toEqual({ kind: "naked" });
  });

  it("hidden single in a row: n fits no other empty cell of the row", () => {
    const { grid, pencil, w } = board([[], [], [], []]);
    const y = 2;
    // Target (1,2) has several candidates incl. 3; no other cell in row 2 has 3.
    pencil[y * w + 1] = (1 << 1) | (1 << 3);
    pencil[y * w + 0] = (1 << 1) | (1 << 4);
    pencil[y * w + 2] = (1 << 2) | (1 << 4);
    pencil[y * w + 3] = (1 << 1) | (1 << 2);
    expect(classifyPlacement(grid, pencil, 1, y, 3, w)).toEqual({
      kind: "hidden",
      line: "row",
      index: 2,
    });
  });

  it("hidden single in a column when the row also has the digit", () => {
    const { grid, pencil, w } = board([[], [], [], []]);
    const x = 1;
    // 3 appears elsewhere in row 0 (so not a row-hidden) but nowhere else in col 1.
    pencil[0 * w + x] = (1 << 2) | (1 << 3);
    pencil[0 * w + 0] = 1 << 3; // row competitor
    pencil[1 * w + x] = (1 << 1) | (1 << 2);
    pencil[2 * w + x] = (1 << 1) | (1 << 4);
    pencil[3 * w + x] = (1 << 2) | (1 << 4);
    expect(classifyPlacement(grid, pencil, x, 0, 3, w)).toEqual({
      kind: "hidden",
      line: "col",
      index: 1,
    });
  });

  it("a filled competitor doesn't block a hidden single (only empty cells count)", () => {
    const { grid, pencil, w } = board([[], [], [], []]);
    const y = 1;
    pencil[y * w + 2] = (1 << 1) | (1 << 3);
    // (0,1) is filled with 3 — must not count as a live competitor.
    grid[y * w + 0] = 3;
    pencil[y * w + 1] = 1 << 4;
    pencil[y * w + 3] = 1 << 1;
    expect(classifyPlacement(grid, pencil, 2, y, 3, w)).toEqual({
      kind: "hidden",
      line: "row",
      index: 1,
    });
  });

  it("forced: neither naked nor a clean hidden line (notes lag)", () => {
    const { grid, pencil, w } = board([[], [], [], []]);
    // 3 is live in another empty cell of both the row and the column.
    pencil[1 * w + 1] = (1 << 2) | (1 << 3);
    pencil[1 * w + 0] = 1 << 3; // row competitor
    pencil[0 * w + 1] = 1 << 3; // column competitor
    expect(classifyPlacement(grid, pencil, 1, 1, 3, w)).toEqual({ kind: "forced" });
  });
});

describe("classifyPlacementInRegions", () => {
  // A 4×4 board carved into four 2×2 sub-blocks (the cells of each, by index).
  const block = (bx: number, by: number): number[] => {
    const cells: number[] = [];
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) cells.push((by * 2 + dy) * 4 + (bx * 2 + dx));
    return cells;
  };

  it("identifies a hidden single in a non-row/column region (a sub-block)", () => {
    const { grid, pencil } = board([[], [], [], []]);
    // Target (1,0) is in the top-left block {0,1,4,5}. It notes {2,3}; no OTHER
    // cell of the block still notes 3, but a cell of its row AND its column do
    // (so it is hidden in the block alone, not the row or column).
    pencil[1] = (1 << 2) | (1 << 3); // (1,0)
    pencil[0] = 1 << 2; // (0,0) block-mate, no 3
    pencil[4] = 1 << 2; // (0,1) block-mate, no 3
    pencil[5] = 1 << 4; // (1,1) block-mate, no 3
    pencil[2] = 1 << 3; // (2,0) row competitor — blocks row-hidden
    pencil[9] = 1 << 3; // (1,2) column competitor — blocks col-hidden
    const regions = [
      { cells: [0, 1, 2, 3], tag: "row" },
      { cells: [1, 5, 9, 13], tag: "col" },
      { cells: block(0, 0), tag: "block" },
    ];
    const c = classifyPlacementInRegions(grid, pencil, 1, 3, regions);
    expect(c.kind).toBe("hidden");
    expect(c.kind === "hidden" && c.region.tag).toBe("block");
  });

  it("returns naked / forced regardless of the region list", () => {
    const { grid, pencil } = board([[], [], [], []]);
    pencil[5] = 1 << 2;
    expect(
      classifyPlacementInRegions(grid, pencil, 5, 2, [{ cells: block(0, 0) }]).kind,
    ).toBe("naked");
    // 3 still live elsewhere in the only region → forced (not hidden there).
    pencil[5] = (1 << 2) | (1 << 3);
    pencil[0] = 1 << 3;
    expect(
      classifyPlacementInRegions(grid, pencil, 5, 3, [{ cells: block(0, 0) }]).kind,
    ).toBe("forced");
  });
});

describe("singlePlacementReason", () => {
  it("maps each classification to its narratable reason", () => {
    const { grid, pencil, w } = board([[], [], [], []]);
    pencil[0] = 1 << 2;
    expect(singlePlacementReason(grid, pencil, 0, 0, 2, w)).toEqual({ kind: "single" });

    const p2 = new Int32Array(w * w);
    p2[2 * w + 1] = (1 << 1) | (1 << 3);
    p2[2 * w + 0] = 1 << 1;
    p2[2 * w + 2] = 1 << 4;
    p2[2 * w + 3] = 1 << 2;
    expect(singlePlacementReason(grid, p2, 1, 2, 3, w)).toEqual({
      kind: "hiddenSingle",
      n: 3,
      line: "row",
      index: 2,
    });

    const p3 = new Int32Array(w * w);
    p3[5] = (1 << 2) | (1 << 3);
    p3[4] = 1 << 3;
    p3[1] = 1 << 3;
    expect(singlePlacementReason(grid, p3, 1, 1, 3, w)).toEqual({
      kind: "forcedSingle",
      n: 3,
    });
  });
});

describe("hiddenSingleLine", () => {
  it("returns the whole row or column", () => {
    expect(hiddenSingleLine("row", 2, 4)).toEqual([
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
    expect(hiddenSingleLine("col", 1, 4)).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ]);
  });
});
