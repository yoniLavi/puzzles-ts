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
  narrateLatinReason,
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

describe("narrateLatinReason (shared row/column-game narration)", () => {
  it("narrates each generic arm with the shared wording", () => {
    expect(narrateLatinReason({ kind: "single" }, [3])).toBe(
      "Every other number has been ruled out in this cell, so it can only be 3.",
    );
    expect(
      narrateLatinReason({ kind: "hiddenSingle", n: 2, line: "col", index: 1 }, []),
    ).toBe(
      "In this column, 2 can go in only this cell — every other cell in the column has ruled it out — so it must be 2.",
    );
    expect(narrateLatinReason({ kind: "forcedSingle", n: 4 }, [])).toBe(
      "Working through this cell's row and column together, only 4 can still go here — so it must be 4.",
    );
    expect(narrateLatinReason({ kind: "dup", n: 1 }, [])).toBe(
      "There's already a 1 in this row and column, so we must cross out the 1 from the other cells they pass through.",
    );
    expect(narrateLatinReason({ kind: "set" }, [2, 3])).toBe(
      "Another group of cells already accounts for a fixed set of numbers that includes 2 and 3, so we must cross out 2 and 3 here.",
    );
    expect(narrateLatinReason({ kind: "forcing" }, [5])).toBe(
      "Following a chain of two-candidate cells, placing 5 here would force a contradiction further along — so we must cross out 5.",
    );
  });

  it("ignores extra fields a dup reason may carry (only n is read)", () => {
    // Real callers pass a LatinReason `dup` (which carries px/py) by reference,
    // not as a literal — bind it so the assignment mirrors that, not an
    // excess-property literal check.
    const dupWithExtra = { kind: "dup" as const, n: 6, px: 0, py: 0 };
    expect(narrateLatinReason(dupWithExtra, [])).toBe(
      "There's already a 6 in this row and column, so we must cross out the 6 from the other cells they pass through.",
    );
  });
});
