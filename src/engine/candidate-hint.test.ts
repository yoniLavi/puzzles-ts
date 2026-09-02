import { describe, expect, it } from "vitest";
import {
  adaptiveMarkAllMove,
  anyEmptyLacksNotes,
  type CandidateHighlights,
  type CandidateMove,
  type CandidateMoveAdapter,
  candidateHint,
  cleanObviousText,
  emitObviousCleanStep,
  findRegionDuplicate,
  firstUnreflectedPlaceIndex,
  joinNums,
  keepCandidateHintTrack,
  lazyPopulate,
  type Mark,
  nakedSingle,
  nextPlace,
  nextStrike,
  obviousCandidateMarks,
  populateStep,
  populateText,
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

describe("candidateHint (shared hint entry)", () => {
  interface St {
    completed: boolean;
  }
  // A trivial one-step plan so the success path returns it verbatim.
  const oneStep: HintStep<CandidateMove, CandidateHighlights>[] = [
    {
      move: { type: "set", x: 0, y: 0, n: 1, pencil: false },
      explanation: "place 1",
    },
  ];

  it("refuses a solved board", () => {
    const r = candidateHint<St, CandidateMove, CandidateHighlights>(
      { completed: true },
      undefined,
      () => [],
      () => oneStep,
    );
    expect(r).toEqual({ ok: false, error: "This board is already solved." });
  });

  it("refuses a board with mistakes, pointing at the overlay", () => {
    const r = candidateHint<St, CandidateMove, CandidateHighlights>(
      { completed: false },
      undefined,
      () => [{ wrong: true }],
      () => oneStep,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Fix the highlighted mistakes first/);
  });

  it("refuses when no further move can be deduced", () => {
    const r = candidateHint<St, CandidateMove, CandidateHighlights>(
      { completed: false },
      undefined,
      () => [],
      () => [],
    );
    expect(r).toEqual({
      ok: false,
      error: "No further move can be deduced from this position.",
    });
  });

  it("returns the built plan on the success path", () => {
    const r = candidateHint<St, CandidateMove, CandidateHighlights>(
      { completed: false },
      undefined,
      () => [],
      () => oneStep,
    );
    expect(r).toEqual({ ok: true, steps: oneStep });
  });

  it("defaults autoPencil off when no ui is given, and threads ui through", () => {
    const seen: boolean[] = [];
    const build = (_s: St, autoClean: boolean) => {
      seen.push(autoClean);
      return oneStep;
    };
    candidateHint<St, CandidateMove, CandidateHighlights>(
      { completed: false },
      undefined,
      () => [],
      build,
    );
    candidateHint<St, CandidateMove, CandidateHighlights>(
      { completed: false },
      { autoPencil: true },
      () => [],
      build,
    );
    expect(seen).toEqual([false, true]);
  });
});

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

  it("ignores a filled cell whose stale notes happen to be a single candidate", () => {
    // Cell (0,0) is filled but its notes were never cleared, and they read as a
    // lone candidate; announcing it would be a hint telling the player to place
    // a value in a cell that already has one. The genuine single is (1,0).
    const [grid, pencil] = board([1, 0, 2, 2], [bits(1), bits(2), 0, 0]);
    expect(nakedSingle(grid, pencil, 2)).toEqual({ x: 1, y: 0, n: 2 });
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

  it("never marks the home cell even when it is still empty and notes the value", () => {
    // The home cell is normally already filled by the caller, which would hide
    // the guard behind the `grid[j] === 0` liveness test. The contract is the
    // helper's own, so it is checked on the board that can actually violate it:
    // (0,0) empty and noting 1, with 1 as the value being placed there.
    const grid = [0, 0, 0, 0];
    const pencil = [bits(1), bits(1), 0, 0];
    expect(
      regionDuplicateMarks(grid, pencil, 0, 0, 1, 2, rowColRegions(0, 0, 2)),
    ).toEqual([{ x: 1, y: 0, n: 1 }]);
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

  it("stops at the first placement the player's board has not made yet", () => {
    // The window is what keeps a strike's premise true on the board in front of
    // the player: every op before the first unreflected placement is valid
    // against it, and everything after it is only valid once that placement is
    // made. Here the one *live* elimination sits past that line, so there is
    // nothing to teach yet — surfacing it would narrate a deduction from a board
    // state the player has not reached (docs/games/hints.md § "Solve the way a human does").
    const [grid, pencil] = board([0, 0, 0, 0], [bits(2), 0, bits(1), 0]);
    const ops = [
      op("elim", 0, 0, 1, 0, "set"), // dead: (0,0) no longer notes 1
      op("place", 1, 0, 2, 1), // unreflected — (1,0) is still empty
      op("elim", 0, 1, 1, 2, "set"), // live, but only *after* that placement
    ];
    expect(nextStrike(ops, grid, pencil, 2)).toBeNull();
  });

  it("ignores an elimination on a cell the player has already filled", () => {
    // A strike is advice to cross a note out; on a filled cell there is nothing
    // to cross out, whatever notes were left behind there.
    const [grid, pencil] = board([0, 3, 0, 0], [bits(1, 2), bits(1, 2), 0, 0]);
    expect(nextStrike([op("elim", 1, 0, 1, 0, "set")], grid, pencil, 2)).toBeNull();
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
    // The targets shrink with the marks, or the overlay goes on highlighting the
    // cell whose candidate the player has just crossed out.
    expect(s.highlights?.targets).toEqual([{ x: 1, y: 0 }]);
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

  it("treats a toggle on a candidate the step never named as off-plan", () => {
    // Striking some unrelated note is not "following the hint partially": the
    // step must be dropped, and it must not quietly shrink as though the player
    // had crossed off one of its own marks.
    const s = step({ type: "pencilStrike", marks: [{ x: 0, y: 0, n: 1 }] });
    expect(
      keepCandidateHintTrack(
        { type: "set", x: 1, y: 0, n: 2, pencil: true },
        s,
        pencil,
        2,
      ),
    ).toBe("off");
    expect(s.move).toEqual({ type: "pencilStrike", marks: [{ x: 0, y: 0, n: 1 }] });
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

  it("drops a mark whose cell has since been filled, notes or no notes", () => {
    // Filling a cell does not necessarily clear its notes, so liveness is not a
    // pencil question alone: a strike aimed at a cell the player has settled is
    // advice with nothing left to act on.
    const grid = Int8Array.from([2, 0, 0, 0]);
    const pencil = Int32Array.from([bits(1, 2), bits(1, 2), 0, 0]);
    const s = step(
      {
        type: "pencilStrike",
        marks: [
          { x: 0, y: 0, n: 1 }, // dead: (0,0) is filled, whatever it still notes
          { x: 1, y: 0, n: 2 }, // live
        ],
      },
      { area: [], targets: [], marks: [] },
    );
    expect(refreshCandidateHintStep(s, grid, pencil, 2)?.move).toEqual({
      type: "pencilStrike",
      marks: [{ x: 1, y: 0, n: 2 }],
    });
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

describe("populateStep", () => {
  it("declares no board marks — the one step allowed to paint nothing", () => {
    const s = populateStep<CandidateMove, CandidateHighlights>(
      { type: "pencilAll" },
      "fill them in",
    );
    expect(s.move).toEqual({ type: "pencilAll" });
    expect(s.highlights).toEqual({ area: [], targets: [], marks: [] });
  });
});

describe("lazyPopulate", () => {
  /** A working board plus the empty step list a builder pushes into. */
  function setup(grid: number[], pencil: number[], w: number) {
    const state = { grid, pencil };
    const wGrid = Int8Array.from(grid);
    const wPen = Int32Array.from(pencil);
    const steps: HintStep<CandidateMove, CandidateHighlights>[] = [];
    const pop = lazyPopulate<CandidateMove, CandidateHighlights>(
      state,
      wGrid,
      wPen,
      w,
      steps,
      "fill them in",
    );
    return { pop, steps, wPen };
  }

  it("emits nothing until asked, then exactly one populate step", () => {
    const { pop, steps } = setup([0, 0, 0, 0], [0, 0, 0, 0], 2);
    expect(pop.done()).toBe(false);
    expect(steps).toEqual([]);

    pop.ensure();
    expect(pop.done()).toBe(true);
    expect(steps).toHaveLength(1);
    expect(steps[0].move).toEqual({ type: "pencilAll" });
    expect(steps[0].explanation).toBe("fill them in");

    pop.ensure(); // a second call must not re-emit
    expect(steps).toHaveLength(1);
  });

  it("fills every candidate of the grid order, top one included", () => {
    const { pop, wPen } = setup([0, 0, 0, 0, 0, 0, 0, 0, 0], new Array(9).fill(0), 3);
    pop.ensure();
    expect(Array.from(wPen)).toEqual(new Array(9).fill(bits(1, 2, 3)));
  });

  it("is additive: a cell the player has narrowed keeps its notes", () => {
    // The fill mirrors the `pencilAll` *move*, which never throws away the
    // player's deductions — and this working copy has to agree with it, or the
    // plan goes on to teach strikes on candidates that are no longer on their
    // board (owner-reported on Salad, 2026-07-29).
    const { pop, wPen } = setup([0, 0, 0, 0], [bits(1), 0, 0, 0], 2);
    pop.ensure();
    expect(wPen[0]).toBe(bits(1));
    expect(wPen[1]).toBe(bits(1, 2));
  });

  it("reports done() up front on an already-noted board, and emits no step", () => {
    const { pop, steps } = setup(
      [0, 1, 0, 0],
      [bits(1, 2), 0, bits(1, 2), bits(1, 2)],
      2,
    );
    expect(pop.done()).toBe(true);
    pop.ensure();
    expect(steps).toEqual([]);
  });
});

describe("emitObviousCleanStep", () => {
  /** 2×2 with 1 placed at (0,0) and every empty cell fully noted: the two cells
   * sharing (0,0)'s row and column carry an obvious copy of the 1. */
  const openBoard = () => ({
    grid: Int8Array.from([1, 0, 0, 0]),
    pencil: Int32Array.from([0, bits(1, 2), bits(1, 2), bits(1, 2)]),
    steps: [] as HintStep<CandidateMove, CandidateHighlights>[],
  });

  it("pushes one strike step and applies its marks to the working notes", () => {
    const { grid, pencil, steps } = openBoard();
    expect(
      emitObviousCleanStep(steps, grid, pencil, 2, rc(2), "clear the easy ones"),
    ).toBe(true);
    expect(steps).toHaveLength(1);
    expect(steps[0].move).toEqual({
      type: "pencilStrike",
      marks: [
        { x: 1, y: 0, n: 1 },
        { x: 0, y: 1, n: 1 },
      ],
    });
    // Applied, or the plan re-teaches the same strikes further down.
    expect(pencil[1]).toBe(bits(2));
    expect(pencil[2]).toBe(bits(2));
    expect(pencil[3]).toBe(bits(1, 2));
  });

  it("continues the populate step it directly follows, so setup reads as one journey", () => {
    const { grid, pencil, steps } = openBoard();
    steps.push(
      populateStep<CandidateMove, CandidateHighlights>({ type: "pencilAll" }, "fill"),
    );
    emitObviousCleanStep(steps, grid, pencil, 2, rc(2), "clear the easy ones");
    expect(steps[1].continuesPrevious).toBe(true);
  });

  it("stands alone when the board was already populated", () => {
    const { grid, pencil, steps } = openBoard();
    emitObviousCleanStep(steps, grid, pencil, 2, rc(2), "clear the easy ones");
    expect(steps[0].continuesPrevious).toBe(false);
  });

  it("returns false and pushes nothing when there is nothing obvious to clear", () => {
    const grid = Int8Array.from([1, 0, 0, 2]);
    const pencil = Int32Array.from([0, bits(2), bits(1), 0]);
    const steps: HintStep<CandidateMove, CandidateHighlights>[] = [];
    expect(
      emitObviousCleanStep(steps, grid, pencil, 2, rc(2), "clear the easy ones"),
    ).toBe(false);
    expect(steps).toEqual([]);
  });
});

/**
 * A second move dialect, modeled on the games that do not speak the Latin
 * family's: a `kind` discriminator (Crossing, Salad) and candidate `n` at bit
 * `n - 1`. Renaming either is not an option — the save format replays the move
 * log — so the mechanics take the dialect as a parameter, and these cases are
 * what hold that parameter to being *read* rather than defaulted away.
 */
type DialectMove =
  | { kind: "note"; x: number; y: number; n: number }
  | { kind: "fillAll" }
  | { kind: "strike"; marks: Mark[] }
  | { kind: "clear" };

const bitFrom1 = (n: number): number => 1 << (n - 1);

const dialect: CandidateMoveAdapter<DialectMove> = {
  read: (m) => {
    switch (m.kind) {
      case "note":
        return { type: "set", x: m.x, y: m.y, n: m.n, pencil: true };
      case "fillAll":
        return { type: "pencilAll" };
      case "strike":
        return { type: "pencilStrike", marks: m.marks };
      default:
        return null;
    }
  },
  strike: (marks) => ({ kind: "strike", marks }),
  bit: bitFrom1,
};

describe("a game's own move dialect", () => {
  it("is read by keepCandidateHintTrack, encoding and all", () => {
    // (0,0) notes 1 and 2 at bits 0 and 1. Under the default `1 << n` encoding
    // candidate 2 would read as absent, so this pins the bit function as well as
    // the discriminator.
    const pencil = Int32Array.from([bitFrom1(1) | bitFrom1(2), 0, 0, 0]);
    const s: HintStep<DialectMove, CandidateHighlights> = {
      move: {
        kind: "strike",
        marks: [
          { x: 0, y: 0, n: 2 },
          { x: 0, y: 0, n: 1 },
        ],
      },
      explanation: "",
      highlights: { area: [], targets: [], marks: [] },
    };
    expect(
      keepCandidateHintTrack({ kind: "note", x: 0, y: 0, n: 2 }, s, pencil, 2, dialect),
    ).toBe("onTrack");
    expect(s.move).toEqual({ kind: "strike", marks: [{ x: 0, y: 0, n: 1 }] });
    expect(
      keepCandidateHintTrack({ kind: "note", x: 0, y: 0, n: 1 }, s, pencil, 2, dialect),
    ).toBe("completed");
  });

  it("is read by refreshCandidateHintStep when it shrinks a stored strike", () => {
    const grid = Int8Array.from([0, 0, 0, 0]);
    const pencil = Int32Array.from([bitFrom1(1), bitFrom1(1) | bitFrom1(2), 0, 0]);
    const s: HintStep<DialectMove, CandidateHighlights> = {
      move: {
        kind: "strike",
        marks: [
          { x: 0, y: 0, n: 2 }, // dead under this encoding
          { x: 1, y: 0, n: 2 }, // live
        ],
      },
      explanation: "",
      highlights: { area: [], targets: [], marks: [] },
    };
    expect(refreshCandidateHintStep(s, grid, pencil, 2, dialect)?.move).toEqual({
      kind: "strike",
      marks: [{ x: 1, y: 0, n: 2 }],
    });
  });

  it("lets emitObviousCleanStep recognise a populate step spelled its way", () => {
    const grid = Int8Array.from([1, 0, 0, 0]);
    const both = bitFrom1(1) | bitFrom1(2);
    const pencil = Int32Array.from([0, both, both, both]);
    const steps: HintStep<DialectMove, CandidateHighlights>[] = [
      populateStep<DialectMove, CandidateHighlights>({ kind: "fillAll" }, "fill"),
    ];
    emitObviousCleanStep(steps, grid, pencil, 2, rc(2), "clear", {
      enc: { bit: bitFrom1 },
      adapter: dialect,
    });
    expect(steps[1].continuesPrevious).toBe(true);
    expect(steps[1].move).toEqual({
      kind: "strike",
      marks: [
        { x: 1, y: 0, n: 1 },
        { x: 0, y: 1, n: 1 },
      ],
    });
  });
});

describe("the shared setup narration", () => {
  it("says what the game calls a board position, in both strings", () => {
    // The two setup strings and the generic narration arms must agree, or one
    // game's hints read in two vocabularies (Salad says "square", the Latin
    // family says "cell").
    const fill = populateText("letter", "square");
    expect(fill).toContain("in each empty square");
    expect(fill).not.toContain("cell");

    const clean = cleanObviousText("letter", "standing", "row or column", "square");
    expect(clean).toContain("in each square");
    expect(clean).not.toContain("cell");
    expect(clean).toContain("already standing in its row or column");

    expect(populateText("number")).toContain("in each empty cell");
    expect(cleanObviousText("number", "placed", "row, column or block")).toContain(
      "in each cell",
    );
  });
});
