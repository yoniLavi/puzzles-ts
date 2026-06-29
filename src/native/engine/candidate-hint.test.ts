import { describe, expect, it } from "vitest";
import {
  adaptiveMarkAllMove,
  anyEmptyLacksNotes,
  type CandidateHighlights,
  type CandidateMove,
  findRegionDuplicate,
  firstUnreflectedPlaceIndex,
  joinNums,
  keepCandidateHintTrack,
  nakedSingle,
  nextPlace,
  nextStrike,
  obviousCandidateMarks,
  refreshCandidateHintStep,
  regionDuplicateMarks,
} from "./candidate-hint.ts";
import type { HintStep } from "./game.ts";
import type { DeductionRecord } from "./latin.ts";
import { rowColRegions } from "./latin-hint.ts";

/** Build a working board from a `grid` (0 = empty) and a matching `pencil`
 * candidate-bitmask array. */
function board(grid: number[], pencil: number[]): [Int8Array, Int32Array] {
  return [Int8Array.from(grid), Int32Array.from(pencil)];
}

/** Bitmask of candidates `ns` (bit `1 << n`). */
const bits = (...ns: number[]): number => ns.reduce((m, n) => m | (1 << n), 0);

describe("joinNums", () => {
  it("renders 0, 1, 2 and 3+ value lists", () => {
    expect(joinNums([])).toBe("");
    expect(joinNums([3])).toBe("3");
    expect(joinNums([1, 2])).toBe("1 and 2");
    expect(joinNums([1, 2, 3])).toBe("1, 2 and 3");
    expect(joinNums([1, 2, 3, 4])).toBe("1, 2, 3 and 4");
  });
});

describe("nakedSingle", () => {
  it("finds the first empty cell whose notes are a single candidate", () => {
    // 2×2: cell 0 has {1,2}; cell 1 has only {2}; rest filled.
    const [grid, pencil] = board([0, 0, 1, 2], [bits(1, 2), bits(2), 0, 0]);
    expect(nakedSingle(grid, pencil, 2)).toEqual({ x: 1, y: 0, n: 2 });
  });

  it("ignores empty cells with no notes and returns null when none is single", () => {
    const [grid, pencil] = board([0, 0, 0, 0], [bits(1, 2), 0, bits(1, 2), bits(1, 2)]);
    expect(nakedSingle(grid, pencil, 2)).toBeNull();
  });
});

describe("anyEmptyLacksNotes", () => {
  it("is true iff some empty cell carries no pencil notes", () => {
    const all = bits(1, 2);
    expect(
      anyEmptyLacksNotes(Int8Array.from([0, 0]), Int32Array.from([all, 0]), 1),
    ).toBe(false);
    // order 1 reads only cell 0; cell 0 empty with no notes → true.
    expect(anyEmptyLacksNotes(Int8Array.from([0]), Int32Array.from([0]), 1)).toBe(true);
    // a filled cell with no notes does not count.
    expect(anyEmptyLacksNotes(Int8Array.from([1]), Int32Array.from([0]), 1)).toBe(
      false,
    );
  });
});

describe("regionDuplicateMarks", () => {
  it("marks every empty cell of the value's regions that still notes it", () => {
    // 3×3. Place 2 at (0,0); its row (cells 1,2) and column (cells 3,6) still
    // note 2 in some empty cells. Cell 1: {2}; cell 2: {1}; cell 3: {2,3}; cell 6
    // empty no-note. Only cells 1 and 3 should be struck.
    const grid = [2, 0, 0, 0, 0, 0, 0, 0, 0];
    const pencil = [0, bits(2), bits(1), bits(2, 3), 0, 0, 0, 0, 0];
    const marks = regionDuplicateMarks(
      grid,
      pencil,
      0,
      0,
      2,
      3,
      rowColRegions(0, 0, 3),
    );
    expect(new Set(marks.map((m) => `${m.x},${m.y},${m.n}`))).toEqual(
      new Set(["1,0,2", "0,1,2"]),
    );
  });

  it("de-duplicates a cell reachable through two regions", () => {
    // A custom region set where cell index 1 lies in both regions; it must be
    // marked once, not twice.
    const grid = [3, 0, 0, 0];
    const pencil = [0, bits(3), 0, 0];
    const regions = [{ cells: [0, 1] }, { cells: [1, 0] }];
    const marks = regionDuplicateMarks(grid, pencil, 0, 0, 3, 2, regions);
    expect(marks).toEqual([{ x: 1, y: 0, n: 3 }]);
  });

  it("never marks the home cell and returns [] when nothing is live", () => {
    const grid = [1, 2, 0, 0];
    const pencil = [0, 0, bits(2), 0];
    expect(
      regionDuplicateMarks(grid, pencil, 0, 0, 1, 2, rowColRegions(0, 0, 2)),
    ).toEqual([]);
  });
});

describe("findRegionDuplicate", () => {
  it("returns the first filled cell (grid order) with a live region duplicate", () => {
    // 3×3. Cell (1,0)=v1 has a row/col dup; cell (0,0) is filled but clean.
    // The scan is grid-order, so it returns the clean cell's *successor* dup —
    // here only (1,0) fires.
    const grid = [1, 1, 0, 0, 0, 0, 0, 0, 0];
    // (0,0)=1: row cell 1 is filled (=1), col cell 3 empty no-note → clean.
    // (1,0)=1: row cell 0 filled, col cells 4,7; cell 4 notes 1 → dup.
    const pencil = [0, 0, 0, 0, bits(1), 0, 0, 0, 0];
    const dup = findRegionDuplicate(grid, pencil, 3, (x, y) => rowColRegions(x, y, 3));
    expect(dup).toEqual({ px: 1, py: 0, n: 1, marks: [{ x: 1, y: 1, n: 1 }] });
  });

  it("returns null on a board with no region duplicates", () => {
    // cell1 and cell2 note nothing that conflicts with the placed 1 / 2.
    const grid = [1, 0, 0, 2];
    const pencil = [0, 0, 0, 0];
    expect(
      findRegionDuplicate(grid, pencil, 2, (x, y) => rowColRegions(x, y, 2)),
    ).toBeNull();
  });
});

const rc = (w: number) => (x: number, y: number) => rowColRegions(x, y, w);
const key = (m: { x: number; y: number; n: number }) => `${m.x},${m.y},${m.n}`;

describe("obviousCandidateMarks", () => {
  it("strikes only candidates equal to a placed value in the cell's regions", () => {
    // 3×3. Placed: (0,0)=1, (1,1)=2. Empty cell (2,0) notes {1,2,3}: 1 is placed
    // in its row (cell 0), 3 is placed nowhere in row/col → only 1 is obvious.
    // (2 is not in (2,0)'s row or column, so it stays.)
    const grid = [1, 0, 0, 0, 2, 0, 0, 0, 0];
    const pencil = [0, 0, bits(1, 2, 3), 0, 0, 0, 0, 0, 0];
    const marks = obviousCandidateMarks(grid, pencil, 3, rc(3));
    expect(new Set(marks.map(key))).toEqual(new Set(["2,0,1"]));
  });

  it("keeps a cell's last note even if every candidate is region-eliminated", () => {
    // 2×2. (0,0)=1, (1,1)=2 placed. Empty (1,0) notes {1,2}: 1 placed in its row
    // (cell 0), 2 placed in its column (cell 3) — both obvious. The guard keeps
    // the lowest (1), striking only 2, so the cell never empties.
    const grid = [1, 0, 0, 2];
    const pencil = [0, bits(1, 2), 0, 0];
    const marks = obviousCandidateMarks(grid, pencil, 2, rc(2));
    expect(marks.map(key)).toEqual(["1,0,2"]);
  });

  it("returns [] on an already-cleaned board (idempotent — a second pass strikes nothing)", () => {
    const grid = [1, 0, 0, 2];
    const pencil = [0, bits(2), bits(1), 0]; // each empty cell already obvious-free
    expect(obviousCandidateMarks(grid, pencil, 2, rc(2))).toEqual([]);
  });
});

describe("adaptiveMarkAllMove", () => {
  it("fills (pencilAll) when some empty cell has no notes", () => {
    const grid = [1, 0, 0, 2];
    const pencil = [0, 0, 0, 0]; // empty cells note-less → fill branch
    expect(adaptiveMarkAllMove(grid, pencil, 2, rc(2))).toEqual({ type: "pencilAll" });
  });

  it("strikes the obvious candidates when the board is fully noted", () => {
    // (0,0)=1 placed; empty cells fully noted with {1,2}. Obvious: row/col copies
    // of the 1. The result is one atomic pencilStrike.
    const grid = [1, 0, 0, 0];
    const pencil = [0, bits(1, 2), bits(1, 2), bits(1, 2)];
    const move = adaptiveMarkAllMove(grid, pencil, 2, rc(2)) as CandidateMove;
    expect(move.type).toBe("pencilStrike");
    if (move.type !== "pencilStrike") throw new Error("expected pencilStrike");
    // 1 struck from (1,0) [row of (0,0)] and (0,1) [column of (0,0)]; (1,1) keeps {1,2}.
    expect(new Set(move.marks.map(key))).toEqual(new Set(["1,0,1", "0,1,1"]));
  });

  it("returns null on an already-cleaned, fully-noted board (a true no-op press)", () => {
    const grid = [1, 0, 0, 2];
    const pencil = [0, bits(2), bits(1), 0];
    expect(adaptiveMarkAllMove(grid, pencil, 2, rc(2))).toBeNull();
  });
});

/** A recorded op with a typed reason `kind`. */
function op(
  kind: "place" | "elim",
  x: number,
  y: number,
  n: number,
  group: number,
  reasonKind = "single",
): DeductionRecord {
  return { kind, x, y, n, group, reason: { kind: reasonKind } };
}

describe("firstUnreflectedPlaceIndex", () => {
  it("returns the first placement whose cell is still empty on the working grid", () => {
    const [grid] = board([1, 0, 0, 0], [0, 0, 0, 0]);
    const ops = [op("place", 0, 0, 1, 0), op("place", 1, 0, 2, 1)];
    // (0,0) already filled → its place is reflected; (1,0) empty → index 1.
    expect(firstUnreflectedPlaceIndex(ops, grid, 2)).toBe(1);
  });

  it("returns ops.length when every recorded placement is already reflected", () => {
    const [grid] = board([1, 2, 0, 0], [0, 0, 0, 0]);
    const ops = [op("place", 0, 0, 1, 0), op("place", 1, 0, 2, 1)];
    expect(firstUnreflectedPlaceIndex(ops, grid, 2)).toBe(2);
  });
});

describe("nextStrike", () => {
  it("returns one firing's still-live elims and excludes dup-reason bookkeeping", () => {
    const [grid, pencil] = board(
      [0, 0, 0, 0],
      [bits(1, 2), bits(1, 2), bits(1, 2), bits(1, 2)],
    );
    const ops = [
      op("elim", 0, 0, 1, 0, "set"), // live
      op("elim", 1, 0, 2, 0, "dup"), // excluded (placement bookkeeping)
    ];
    const fired = nextStrike(ops, grid, pencil, 2);
    expect(fired?.map((o) => ({ x: o.x, y: o.y, n: o.n }))).toEqual([
      { x: 0, y: 0, n: 1 },
    ]);
  });

  it("skips a firing whose marks are already struck and advances to the next live one", () => {
    // (0,0) no longer carries candidate 1 → first firing dead; (1,0) carries 2 → live.
    const [grid, pencil] = board([0, 0, 0, 0], [bits(2), bits(1, 2), 0, 0]);
    const ops = [op("elim", 0, 0, 1, 0, "set"), op("elim", 1, 0, 2, 1, "set")];
    const fired = nextStrike(ops, grid, pencil, 2);
    expect(fired?.map((o) => o.group)).toEqual([1]);
  });

  it("returns null when no firing is still live", () => {
    const [grid, pencil] = board([0, 0, 0, 0], [0, 0, 0, 0]);
    expect(nextStrike([op("elim", 0, 0, 1, 0, "set")], grid, pencil, 2)).toBeNull();
  });
});

describe("nextPlace", () => {
  it("returns the first recorded placement whose cell is still empty, whole", () => {
    const [grid] = board([1, 0, 0, 0], [0, 0, 0, 0]);
    const ops = [op("place", 0, 0, 1, 0, "single"), op("place", 1, 0, 2, 1, "cage")];
    expect(nextPlace(ops, grid, 2)).toMatchObject({
      x: 1,
      y: 0,
      n: 2,
      reason: { kind: "cage" },
    });
  });
});

/** A minimal hint step over the shared candidate move/highlights shapes. */
function step(
  move: CandidateMove,
  highlights?: CandidateHighlights,
): HintStep<CandidateMove, CandidateHighlights> {
  return { move, explanation: "", highlights };
}

describe("keepCandidateHintTrack", () => {
  const pencil = Int32Array.from([bits(1, 2), bits(1, 2), bits(1, 2), bits(1, 2)]);

  it("matches a populate move against a populate step", () => {
    expect(
      keepCandidateHintTrack(
        { type: "pencilAll" },
        step({ type: "pencilAll" }),
        pencil,
        2,
      ),
    ).toBe("completed");
    expect(
      keepCandidateHintTrack(
        { type: "set", x: 0, y: 0, n: 1, pencil: false },
        step({ type: "pencilAll" }),
        pencil,
        2,
      ),
    ).toBe("off");
  });

  it("matches a real placement against a set step", () => {
    const set: CandidateMove = { type: "set", x: 1, y: 0, n: 2, pencil: false };
    expect(keepCandidateHintTrack(set, step({ ...set }), pencil, 2)).toBe("completed");
    // a pencil toggle is not the placement.
    expect(
      keepCandidateHintTrack({ ...set, pencil: true }, step({ ...set }), pencil, 2),
    ).toBe("off");
  });

  it("shrinks a strike step in place as the player clears one mark, then completes", () => {
    const marks = [
      { x: 0, y: 0, n: 1 },
      { x: 1, y: 0, n: 2 },
    ];
    const s = step(
      { type: "pencilStrike", marks: [...marks] },
      { area: [], targets: [], marks: [...marks] },
    );
    // Player pencil-toggles (0,0)/1 — present, so it clears: on track, step shrinks.
    const v1 = keepCandidateHintTrack(
      { type: "set", x: 0, y: 0, n: 1, pencil: true },
      s,
      pencil,
      2,
    );
    expect(v1).toBe("onTrack");
    expect(s.move).toEqual({ type: "pencilStrike", marks: [{ x: 1, y: 0, n: 2 }] });
    expect(s.highlights?.marks).toEqual([{ x: 1, y: 0, n: 2 }]);
    // Clearing the last mark completes the step.
    expect(
      keepCandidateHintTrack(
        { type: "set", x: 1, y: 0, n: 2, pencil: true },
        s,
        pencil,
        2,
      ),
    ).toBe("completed");
  });

  it("treats a toggle that would re-add an absent candidate as off-plan", () => {
    const s = step({ type: "pencilStrike", marks: [{ x: 0, y: 0, n: 3 }] });
    // pencil[0] has no candidate 3, so toggling it adds rather than clears.
    expect(
      keepCandidateHintTrack(
        { type: "set", x: 0, y: 0, n: 3, pencil: true },
        s,
        pencil,
        2,
      ),
    ).toBe("off");
  });
});

describe("refreshCandidateHintStep", () => {
  it("drops dead strike marks and resolves the step when none survive", () => {
    const grid = Int8Array.from([0, 0, 0, 0]);
    const pencil = Int32Array.from([bits(2), bits(1, 2), 0, 0]);
    const live = step(
      {
        type: "pencilStrike",
        marks: [
          { x: 0, y: 0, n: 1 }, // dead: candidate 1 already gone at (0,0)
          { x: 1, y: 0, n: 2 }, // live
        ],
      },
      { area: [], targets: [], marks: [] },
    );
    const refreshed = refreshCandidateHintStep(live, grid, pencil, 2);
    expect(refreshed?.move).toEqual({
      type: "pencilStrike",
      marks: [{ x: 1, y: 0, n: 2 }],
    });

    const allDead = step({ type: "pencilStrike", marks: [{ x: 0, y: 0, n: 1 }] });
    expect(refreshCandidateHintStep(allDead, grid, pencil, 2)).toBeNull();
  });

  it("resolves a placement step once its cell is filled", () => {
    const placement = step({ type: "set", x: 0, y: 0, n: 1, pencil: false });
    expect(
      refreshCandidateHintStep(
        placement,
        Int8Array.from([0, 0, 0, 0]),
        Int32Array.from([0, 0, 0, 0]),
        2,
      ),
    ).toBe(placement);
    expect(
      refreshCandidateHintStep(
        placement,
        Int8Array.from([1, 0, 0, 0]),
        Int32Array.from([0, 0, 0, 0]),
        2,
      ),
    ).toBeNull();
  });

  it("resolves a populate step once every empty cell already has notes", () => {
    const populate = step({ type: "pencilAll" });
    const grid = Int8Array.from([0, 1, 0, 0]);
    // an empty cell still lacks notes → keep the step.
    expect(
      refreshCandidateHintStep(
        populate,
        grid,
        Int32Array.from([0, 0, bits(1), bits(1)]),
        2,
      ),
    ).toBe(populate);
    // every empty cell has notes → resolved.
    expect(
      refreshCandidateHintStep(
        populate,
        grid,
        Int32Array.from([bits(1), 0, bits(1), bits(1)]),
        2,
      ),
    ).toBeNull();
  });
});
