/**
 * Unit tests for the Penrose P2/P3 tilings.
 *
 * The heavy lifting is done by `grid-aperiodic-differential.test.ts`, which
 * byte-matches 13 C-generated fixtures across both variants. These cover what
 * a fixture cannot: the shape of the hand-transcribed transition tables, the
 * description parser's rejection paths (which are untrusted-input surface), and
 * the `"dummy"` replay RNG, which no ordinary fixture reaches.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { GridTrimmedAwayError } from "../grid-trim.ts";
import { PENROSE_LETTERS, transition, transitionIn } from "./penrose.ts";
import {
  gridNewPenrose,
  type PenroseWhich,
  penroseNewDesc,
  penroseValidateDesc,
} from "./penrose-grid.ts";

const WHICHES: PenroseWhich[] = ["p2", "p3"];

describe("penrose transition tables", () => {
  // Upstream's two nested switches are the one place in this change a human
  // types the data, so assert the *shape* of what was typed. The counts come
  // from the C: 60 leaves in `transition` (penrose.c:100-266) and 36 in
  // `transition_in` (penrose.c:275-361). A dropped or duplicated row moves a
  // count; the differential then says which row.
  it("has exactly the C's 60 outward leaves", () => {
    const defined: string[] = [];
    for (const parent of PENROSE_LETTERS) {
      for (const child of PENROSE_LETTERS) {
        for (const edge of [0, 1, 2]) {
          try {
            transition(parent, child, edge);
            defined.push(`${parent}/${child}/${edge}`);
          } catch {
            // Not a legal parent/child pairing: upstream's FAIL.
          }
        }
      }
    }
    expect(defined).toHaveLength(60);
  });

  it("defines exactly the subdivision rule's children, all three edges each", () => {
    // The children each metatile subdivides into, from upstream's switch arms.
    const children: Record<string, string[]> = {
      A: ["A", "B", "U"],
      B: ["A", "B", "V"],
      U: ["B", "U"],
      V: ["A", "V"],
      C: ["C", "Y"],
      D: ["D", "X"],
      X: ["C", "X", "Y"],
      Y: ["D", "X", "Y"],
    };
    for (const parent of PENROSE_LETTERS) {
      for (const child of PENROSE_LETTERS) {
        const legal = children[parent].includes(child);
        for (const edge of [0, 1, 2]) {
          if (legal) {
            expect(() => transition(parent, child, edge)).not.toThrow();
          } else {
            expect(() => transition(parent, child, edge)).toThrow(/not a child of/);
          }
        }
      }
    }
  });

  it("rejects an out-of-range edge rather than falling through", () => {
    // Upstream's inner `switch (edge)` has no `default`, so an out-of-range
    // edge silently drops into the *next child's* dispatch. Unreachable in
    // practice, but reproducing the fallthrough would hide a real bug.
    expect(() => transition("A", "A", 3)).toThrow(/out of range/);
    expect(() => transition("A", "A", -1)).toThrow(/out of range/);
  });

  it("has exactly the C's 36 inward leaves", () => {
    const defined: string[] = [];
    for (const parent of PENROSE_LETTERS) {
      for (const edge of [0, 1, 2]) {
        for (const end of [-1, 0, 1] as const) {
          try {
            transitionIn(parent, edge, end);
            defined.push(`${parent}/${edge}/${end}`);
          } catch {
            // An `end` inconsistent with whether that edge is divided.
          }
        }
      }
    }
    expect(defined).toHaveLength(36);
  });

  it("gives every parent edge either two divided ends or one undivided", () => {
    // A structural invariant of the tiling, and a cheap check that no row was
    // transcribed with a mismatched `end`: an edge of a metatile is either cut
    // in half by a child boundary (so both -1 and +1 are entries, and 0 is
    // not) or it is not (only 0).
    for (const parent of PENROSE_LETTERS) {
      for (const edge of [0, 1, 2]) {
        const present = ([-1, 0, 1] as const).filter((end) => {
          try {
            transitionIn(parent, edge, end);
            return true;
          } catch {
            return false;
          }
        });
        expect(present).toSatisfy(
          (ends: number[]) =>
            (ends.length === 2 && ends[0] === -1 && ends[1] === 1) ||
            (ends.length === 1 && ends[0] === 0),
        );
      }
    }
  });

  it("always lands inside a child when stepping inwards", () => {
    for (const parent of PENROSE_LETTERS) {
      for (const edge of [0, 1, 2]) {
        for (const end of [-1, 0, 1] as const) {
          let result: ReturnType<typeof transitionIn> | undefined;
          try {
            result = transitionIn(parent, edge, end);
          } catch {
            continue;
          }
          expect(result.kind).toBe("internal");
          // The triangle we enter must be one that can actually step back out
          // through the same parent — i.e. a legal child of it.
          expect(() =>
            transition(parent, result.newChild, result.newEdge),
          ).not.toThrow();
        }
      }
    }
  });
});

describe("penrose descriptions", () => {
  for (const which of WHICHES) {
    describe(which, () => {
      it("generates a description it then accepts and can build", () => {
        const desc = penroseNewDesc(which, 8, 8, randomNew("round-trip"));
        // `[orientation 0-9][start vertex 0-2][letters]`.
        expect(desc).toMatch(
          which === "p2" ? /^[0-9][0-2][ABUV]+$/ : /^[0-9][0-2][CDXY]+$/,
        );
        expect(penroseValidateDesc(which, 8, 8, desc)).toBeNull();

        const g = gridNewPenrose(which, 8, 8, desc);
        expect(g.numFaces).toBeGreaterThan(0);
        // Every Penrose tile is a quadrilateral, both halves included.
        for (const f of g.faces) expect(f.order).toBe(4);
      });

      it("is deterministic: the same seed gives the same description", () => {
        const a = penroseNewDesc(which, 6, 7, randomNew("same"));
        const b = penroseNewDesc(which, 6, 7, randomNew("same"));
        expect(a).toBe(b);
      });

      it("rejects a legacy 'G' description by name", () => {
        // `penrose-legacy.c` is deliberately not ported (design D9). Falling
        // through to the generic "expected digit" error would be survivable
        // but misleading.
        const legacy = "G3,4,5";
        expect(penroseValidateDesc(which, 6, 6, legacy)).toMatch(/legacy/i);
        expect(() => gridNewPenrose(which, 6, 6, legacy)).toThrow(/legacy/i);
      });
    });
  }

  it("requires a description at all", () => {
    expect(penroseValidateDesc("p2", 6, 6, null)).toBe(
      "Missing grid description string.",
    );
    expect(penroseValidateDesc("p2", 6, 6, "")).toBe("empty grid description");
  });

  it("rejects a description too short to carry its own header", () => {
    // Upstream computes `strlen(desc) - 2` before checking the length, which
    // underflows `size_t` on a one-character desc. Checking the header first
    // reaches the same message without the underflow.
    expect(penroseValidateDesc("p2", 6, 6, "5")).toMatch(/second char/);
    expect(penroseValidateDesc("p2", 6, 6, "A")).toMatch(/expected digit at start/);
    expect(penroseValidateDesc("p2", 6, 6, "53")).toMatch(/second char/);
    expect(penroseValidateDesc("p2", 6, 6, "50")).toBe(
      "expected at least one coordinate",
    );
  });

  it("rejects letters from the other tiling", () => {
    expect(penroseValidateDesc("p2", 6, 6, "50CXY")).toMatch(/expected tile letter/);
    expect(penroseValidateDesc("p3", 6, 6, "50ABU")).toMatch(/expected tile letter/);
  });

  it("rejects a pair of letters that cannot nest", () => {
    // A may sit inside A, B or V — never inside U.
    expect(penroseValidateDesc("p2", 6, 6, "50AU")).toBe(
      "invalid pair of consecutive coordinates",
    );
    expect(penroseValidateDesc("p2", 6, 6, "50AB")).toBeNull();
  });

  it("refuses to build from a description it would reject", () => {
    expect(() => gridNewPenrose("p2", 6, 6, "50AU")).toThrow(
      /invalid penrose description/,
    );
  });
});

describe('penrose "dummy" replay RNG', () => {
  // When a stored description is replayed at a larger size than it was
  // generated for, the search asks for metatile levels the description never
  // recorded. Upstream conjures a fixed-seed RNG at that moment; this is the
  // only path that exercises it, and no differential fixture reaches it.
  //
  // The 20×20 size is chosen because it is *verified* to reach the fallback:
  // instrumenting the branch shows a 4×4 description (9 coordinates for P2,
  // 8 for P3) exhausting itself before the patch is filled. Do not shrink it —
  // this test would keep passing while asserting nothing about the fallback.
  for (const which of WHICHES) {
    it(`${which}: replays a small description at a larger size, reproducibly`, () => {
      const desc = penroseNewDesc(which, 4, 4, randomNew("small"));
      expect(penroseValidateDesc(which, 20, 20, desc)).toBeNull();

      const first = gridNewPenrose(which, 20, 20, desc);
      const second = gridNewPenrose(which, 20, 20, desc);

      // The description is far too short for a 20×20 patch, so the extra
      // levels came from the fallback RNG. Both builds must agree exactly: a
      // fallback created eagerly, per-triangle, or re-seeded per call would
      // still produce a valid tiling here, but not the same one twice.
      expect(first.numFaces).toBeGreaterThan(0);
      expect(second.dots.map((d) => [d.x, d.y])).toEqual(
        first.dots.map((d) => [d.x, d.y]),
      );
      expect(second.numFaces).toBe(first.numFaces);
    });
  }
});

describe("penrose degenerate patches", () => {
  it("reports an empty patch rather than returning an empty grid", () => {
    // A patch small enough that the seed triangle lands out of bounds never
    // runs the search at all; the tell is a description with a single
    // coordinate letter. Upstream then aborts inside `dsf_new(0)`; trimming
    // catches it here instead, which is the better failure. Not a bug to work
    // around — the differential fixtures deliberately start above this size.
    const desc = "50A";
    expect(penroseValidateDesc("p2", 1, 1, desc)).toBeNull();
    expect(() => gridNewPenrose("p2", 1, 1, desc)).toThrow(GridTrimmedAwayError);
  });
});
