/**
 * Behavioural tests for the Loopy port.
 *
 * The byte-match differential (`loopy-differential.test.ts`) is the strongest
 * assurance this port has, but it can only cover what the C is willing to
 * generate. These tests cover the rest: the codecs, the input table, the
 * completion classification, the two upstream quirks that are preserved on
 * purpose, and the retry paths the C reaches by aborting or hanging.
 */
import { describe, expect, it } from "vitest";
import { LEFT_BUTTON, MIDDLE_BUTTON, RIGHT_BUTTON } from "../../engine/pointer.ts";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { buildLoopyGrid } from "./grid-build.ts";
import {
  AF_ADAPTIVE,
  AF_FIXED,
  AF_OFF,
  autofollowEdges,
  type LoopyMove,
  loopyGame,
  nextLineState,
} from "./index.ts";
import {
  DIFF_EASY,
  DIFF_HARD,
  DIFF_NORMAL,
  DIFF_TRICKY,
  decodeParams,
  defaultParams,
  encodeParams,
  LOOPY_GRIDS,
  validateParams,
} from "./params.ts";
import { _internals, checkCaches, SolverState, solveGame } from "./solver.ts";
import {
  decodeClues,
  encodeClues,
  LINE_NO,
  LINE_UNKNOWN,
  LINE_YES,
  type LoopyState,
  NO_CLUE,
  newState,
  opp,
  textFormat,
  validateDesc,
} from "./state.ts";

const squareParams = (w = 4, h = 4, diff = DIFF_EASY) => ({ w, h, diff, type: 0 });

/** A blank state over a freshly built grid, with no clues. */
function blankState(w = 4, h = 4, type = 0): LoopyState {
  const p = { w, h, diff: DIFF_EASY, type };
  const { desc, grid } = buildLoopyGrid(
    LOOPY_GRIDS[type].type,
    w,
    h,
    randomNew("blank"),
  );
  const lines = new Uint8Array(grid.numEdges);
  lines.fill(LINE_UNKNOWN);
  void p;
  return {
    grid,
    gridDesc: desc,
    gridType: type,
    clues: new Int8Array(grid.numFaces).fill(NO_CLUE),
    lines,
    lineErrors: new Uint8Array(grid.numEdges),
    exactlyOneLoop: false,
    solved: false,
    cheated: false,
  };
}

describe("params", () => {
  it("round-trips through encode/decode", () => {
    for (const p of [
      { w: 7, h: 7, diff: DIFF_EASY, type: 0 },
      { w: 10, h: 12, diff: DIFF_HARD, type: 11 },
      { w: 5, h: 3, diff: DIFF_TRICKY, type: 17 },
    ]) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("omits the difficulty when not asked for the full form", () => {
    expect(encodeParams({ w: 7, h: 9, diff: DIFF_HARD, type: 4 }, false)).toBe("7x9t4");
  });

  it("defaults a bare width to a square at Easy", () => {
    expect(decodeParams("12")).toEqual({ w: 12, h: 12, diff: DIFF_EASY, type: 0 });
  });

  it("keeps Loopy's grid ordering, which is not grid.ts's", () => {
    // The array index is the wire format, so this is a regression test against
    // anyone "tidying" LOOPY_GRIDS into GRIDGEN_LIST order: t11 must stay
    // Penrose kite/dart, where grid.ts's index 11 is greatdodecagonal.
    expect(LOOPY_GRIDS[11].type).toBe("penrose_p2_kite");
    expect(LOOPY_GRIDS[12].type).toBe("penrose_p3_thick");
    expect(LOOPY_GRIDS[16].type).toBe("hats");
  });

  it("enforces the per-type minimum sizes", () => {
    expect(validateParams(squareParams(3, 3), true)).toBeNull();
    expect(validateParams(squareParams(2, 3), true)).toMatch(/both be at least 3/);
    // Cairo: amin 3, omin 4 — both dimensions at 3 fails the "at least one" rule.
    expect(validateParams({ w: 3, h: 3, diff: 0, type: 4 }, true)).toMatch(
      /at least one .* at least 4/i,
    );
    expect(validateParams({ w: 3, h: 4, diff: 0, type: 4 }, true)).toBeNull();
    expect(validateParams({ w: 99, h: 0, diff: 0, type: 99 }, true)).toBe(
      "Illegal grid type",
    );
  });

  it("rejects the one Penrose configuration that can never generate", () => {
    // Measured: a Penrose kite/dart patch of width 3 comes out empty for every
    // seed and every height, so retrying cannot rescue it (see grid-build.ts).
    // Note it is a width bound, not a minimum-size bump: height 3 is fine.
    expect(validateParams({ w: 3, h: 6, diff: 0, type: 11 }, true)).toMatch(
      /Width for Penrose .* at least 4/,
    );
    expect(validateParams({ w: 6, h: 3, diff: 0, type: 11 }, true)).toBeNull();
  });
});

describe("clue description codec", () => {
  it("round-trips clues and gaps", () => {
    const clues = Int8Array.from([3, -1, -1, 0, 12, -1, 35, 9]);
    const desc = encodeClues(clues, clues.length);
    expect(desc).toBe("3b0CaZ9");
    expect([...decodeClues(desc, clues.length)]).toEqual([...clues]);
  });

  it("flushes a run of empties at 26, not 27", () => {
    // Upstream tests `empty_count > 25` *before* incrementing, so a run is
    // flushed once it would exceed 26 and the letter stays within a-z.
    // Reordering the test and the increment shifts every long run by one.
    for (const n of [1, 25, 26, 27, 52, 53]) {
      const clues = new Int8Array(n).fill(NO_CLUE);
      const desc = encodeClues(clues, n);
      expect(desc).toMatch(/^[a-z]+$/);
      expect([...decodeClues(desc, n)]).toEqual(new Array(n).fill(NO_CLUE));
    }
    expect(encodeClues(new Int8Array(26).fill(NO_CLUE), 26)).toBe("z");
    expect(encodeClues(new Int8Array(27).fill(NO_CLUE), 27)).toBe("za");
  });

  it("validates length against the real face count", () => {
    const p = squareParams(4, 4); // 16 faces
    expect(validateDesc(p, "a")).toMatch(/too short/); // one empty face, 16 needed
    expect(validateDesc(p, "z")).toMatch(/too long/); // a run of 26
    expect(validateDesc(p, "p")).toBeNull(); // 'p' is a run of 16
    expect(validateDesc(p, "!!!")).toMatch(/Unknown character/);
  });
});

describe("line states", () => {
  it("has an involutive opposite that fixes UNKNOWN", () => {
    // OPP(x) = 2 - x is load-bearing arithmetic, not an arbitrary tag mapping:
    // the solver's edge-dsf propagation relies on it.
    expect(opp(LINE_YES)).toBe(LINE_NO);
    expect(opp(LINE_NO)).toBe(LINE_YES);
    expect(opp(LINE_UNKNOWN)).toBe(LINE_UNKNOWN);
    for (const s of [LINE_YES, LINE_UNKNOWN, LINE_NO]) expect(opp(opp(s))).toBe(s);
  });
});

describe("input", () => {
  it("toggles two ways with a mouse and cycles three ways with a stylus", () => {
    // With a mouse each button toggles between its own state and UNKNOWN. With
    // a stylus there is no second button, so each becomes a 3-cycle — which is
    // what upstream's two deliberate switch fallthroughs implement.
    expect(nextLineState(LEFT_BUTTON, LINE_UNKNOWN, false)).toBe(LINE_YES);
    expect(nextLineState(LEFT_BUTTON, LINE_YES, false)).toBe(LINE_UNKNOWN);
    expect(nextLineState(LEFT_BUTTON, LINE_NO, false)).toBe(LINE_UNKNOWN);

    expect(nextLineState(LEFT_BUTTON, LINE_UNKNOWN, true)).toBe(LINE_YES);
    expect(nextLineState(LEFT_BUTTON, LINE_YES, true)).toBe(LINE_NO);
    expect(nextLineState(LEFT_BUTTON, LINE_NO, true)).toBe(LINE_UNKNOWN);

    expect(nextLineState(RIGHT_BUTTON, LINE_UNKNOWN, false)).toBe(LINE_NO);
    expect(nextLineState(RIGHT_BUTTON, LINE_NO, false)).toBe(LINE_UNKNOWN);
    expect(nextLineState(RIGHT_BUTTON, LINE_YES, false)).toBe(LINE_UNKNOWN);

    expect(nextLineState(RIGHT_BUTTON, LINE_UNKNOWN, true)).toBe(LINE_NO);
    expect(nextLineState(RIGHT_BUTTON, LINE_NO, true)).toBe(LINE_YES);
    expect(nextLineState(RIGHT_BUTTON, LINE_YES, true)).toBe(LINE_UNKNOWN);

    for (const old of [LINE_YES, LINE_UNKNOWN, LINE_NO]) {
      expect(nextLineState(MIDDLE_BUTTON, old, false)).toBe(LINE_UNKNOWN);
    }
    expect(nextLineState(0x9999, LINE_UNKNOWN, false)).toBeNull();
  });

  it("applies moves as absolute sets, so re-applying one is a no-op", () => {
    const s = blankState();
    const move: LoopyMove = {
      kind: "set",
      ops: [
        { edge: 0, state: LINE_YES },
        { edge: 1, state: LINE_NO },
        // The autofollow walk can legitimately name an edge twice; an absolute
        // set makes that harmless, where a toggle would cancel it out.
        { edge: 0, state: LINE_YES },
      ],
    };
    const once = loopyGame.executeMove(s, move);
    const twice = loopyGame.executeMove(once, move);
    expect([...once.lines]).toEqual([...twice.lines]);
    expect(once.lines[0]).toBe(LINE_YES);
    expect(once.lines[1]).toBe(LINE_NO);
    // And the original is untouched: executeMove is pure.
    expect(s.lines[0]).toBe(LINE_UNKNOWN);
  });

  describe("autofollow", () => {
    /** A 1x1 square patch: four dots of order 2 joined in a ring, so every
     * continuation is forced and the walk is guaranteed to come full circle. */
    function unitLoop(): LoopyState {
      const s = blankState(1, 1);
      expect(s.grid.numEdges).toBe(4);
      expect(s.grid.dots.every((d) => d.order === 2)).toBe(true);
      return s;
    }

    it("follows a forced run and stops on returning to the clicked edge", () => {
      // The closed-loop case specifically. Upstream's `goto autofollow_done`
      // sits at the end of the inner loop, so it breaks only that loop and the
      // second direction retraces the same edges; terminating both is a tidy-up
      // that cannot change the board, because ops are absolute sets. Either way
      // the answer is "the whole ring, once".
      const s = unitLoop();
      s.lines.fill(LINE_YES);
      const ui = { drawFaintLines: true, autofollow: AF_FIXED };
      const edges = autofollowEdges(s, ui, s.grid.edges[0]);
      expect([...edges].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    });

    it("stops where the run stops matching the clicked edge's state", () => {
      const s = unitLoop();
      // Break the ring: one edge is NO, so the walk cannot pass through it.
      s.lines.fill(LINE_YES);
      s.lines[2] = LINE_NO;
      const ui = { drawFaintLines: true, autofollow: AF_FIXED };
      const edges = autofollowEdges(s, ui, s.grid.edges[0]);
      expect(edges.has(2)).toBe(false);
      expect(edges.has(0)).toBe(true);
      expect(edges.size).toBe(3); // 0 plus the two reachable either side
    });

    it("stops at a junction, where the continuation is not unique", () => {
      // On a 3x3 board an interior dot has order 4, so three candidates
      // continue from it and none of them is forced.
      const s = blankState(3, 3);
      const junction = s.grid.dots.find((d) => d.order === 4);
      if (!junction) throw new Error("a 3x3 square grid has order-4 dots");
      const ui = { drawFaintLines: true, autofollow: AF_FIXED };
      const edges = autofollowEdges(s, ui, junction.edges[0]);
      // It may still run outwards from the *other* end towards the boundary,
      // but it cannot pass through the junction itself.
      expect(edges.has(junction.edges[1].index)).toBe(false);
      expect(edges.has(junction.edges[2].index)).toBe(false);
    });

    it("only consults the player's NO marks in adaptive mode", () => {
      // AF_FIXED follows the grid's shape alone; AF_ADAPTIVE additionally
      // treats an edge the player has marked NO as not a continuation, which
      // can turn a junction back into a forced run.
      const s = blankState(3, 3);
      const junction = s.grid.dots.find((d) => d.order === 4);
      if (!junction) throw new Error("a 3x3 square grid has order-4 dots");
      // Rule out two of the three continuations, leaving exactly one.
      s.lines[junction.edges[2].index] = LINE_NO;
      s.lines[junction.edges[3].index] = LINE_NO;

      const fixed = autofollowEdges(
        s,
        { drawFaintLines: true, autofollow: AF_FIXED },
        junction.edges[0],
      );
      const adaptive = autofollowEdges(
        s,
        { drawFaintLines: true, autofollow: AF_ADAPTIVE },
        junction.edges[0],
      );
      expect(fixed.has(junction.edges[1].index)).toBe(false);
      expect(adaptive.has(junction.edges[1].index)).toBe(true);
    });

    it("is off by default, so a click moves exactly one edge", () => {
      const s = unitLoop();
      s.lines.fill(LINE_YES);
      const ui = loopyGame.newUi(s);
      expect(ui.autofollow).toBe(AF_OFF);
    });
  });

  it("rejects a move naming an edge outside the grid", () => {
    const s = blankState();
    expect(() =>
      loopyGame.executeMove(s, { kind: "set", ops: [{ edge: 9999, state: LINE_YES }] }),
    ).toThrow(/out of range/);
  });
});

describe("completion and error highlighting", () => {
  /** Set the four edges of face 0 to YES on a square grid — the smallest loop. */
  function closeSmallestLoop(s: LoopyState): LoopyState {
    const face = s.grid.faces[0];
    const next = loopyGame.executeMove(s, {
      kind: "set",
      ops: face.edges
        .filter((e) => e !== null)
        .map((e) => ({ edge: e.index, state: LINE_YES as 0 })),
    });
    return next;
  }

  it("recognises exactly one loop, and wins only when the clues agree", () => {
    const s = blankState();
    const looped = closeSmallestLoop(s);
    expect(looped.exactlyOneLoop).toBe(true);
    // No clues at all, so a single closed loop satisfies everything.
    expect(looped.solved).toBe(true);
    expect([...looped.lineErrors]).toEqual(new Array(s.grid.numEdges).fill(0));
  });

  it("does not win when a clue is unsatisfied", () => {
    const s = blankState();
    // Clue an unrelated face 3, which the little loop cannot satisfy.
    s.clues[8] = 3;
    const looped = closeSmallestLoop(s);
    expect(looped.exactlyOneLoop).toBe(true);
    expect(looped.solved).toBe(false);
  });

  it("highlights every YES edge at a vertex of degree 3", () => {
    const s = blankState();
    // Three edges meeting at one dot is a hard vertex error whatever else is
    // going on, so all three light up.
    const dot = s.grid.dots.find((d) => d.order >= 3);
    if (!dot) throw new Error("square grid has interior dots of order 4");
    const next = loopyGame.executeMove(s, {
      kind: "set",
      ops: [0, 1, 2].map((j) => ({ edge: dot.edges[j].index, state: LINE_YES as 0 })),
    });
    for (const j of [0, 1, 2]) expect(next.lineErrors[dot.edges[j].index]).toBe(1);
    expect(next.exactlyOneLoop).toBe(false);
    expect(next.solved).toBe(false);
  });

  it("leaves the largest component alone and reddens the rest", () => {
    // Two disjoint closed loops: the smaller one is the error.
    const s = blankState(6, 6);
    const loop = (faceIndex: number): { edge: number; state: 0 }[] =>
      s.grid.faces[faceIndex].edges
        .filter((e) => e !== null)
        .map((e) => ({ edge: e.index, state: LINE_YES as 0 }));
    // Faces 0 and 35 are opposite corners of a 6x6 board, so their unit loops
    // share no edges and no dots.
    const next = loopyGame.executeMove(s, {
      kind: "set",
      ops: [...loop(0), ...loop(35)],
    });
    expect(next.exactlyOneLoop).toBe(false);
    const errored = [...next.lineErrors].filter(Boolean).length;
    // Exactly one of the two four-edge loops is highlighted.
    expect(errored).toBe(4);
  });

  it("clears stale errors when the board changes", () => {
    const s = blankState(6, 6);
    const loop = (faceIndex: number): { edge: number; state: 0 }[] =>
      s.grid.faces[faceIndex].edges
        .filter((e) => e !== null)
        .map((e) => ({ edge: e.index, state: LINE_YES as 0 }));
    const two = loopyGame.executeMove(s, {
      kind: "set",
      ops: [...loop(0), ...loop(35)],
    });
    expect([...two.lineErrors].some(Boolean)).toBe(true);
    // Erase the second loop; the first is now the only component.
    const one = loopyGame.executeMove(two, {
      kind: "set",
      ops: loop(35).map((o) => ({ ...o, state: LINE_UNKNOWN as 1 })),
    });
    expect([...one.lineErrors].some(Boolean)).toBe(false);
    expect(one.exactlyOneLoop).toBe(true);
  });

  it("keeps `solved` sticky across an undo, as upstream does", () => {
    const s = blankState();
    const looped = closeSmallestLoop(s);
    expect(looped.solved).toBe(true);
    // Reopening the loop does not un-win the game: `solved` is only ever set.
    const reopened = loopyGame.executeMove(looped, {
      kind: "set",
      ops: [{ edge: s.grid.faces[0].edges[0]?.index ?? 0, state: LINE_UNKNOWN }],
    });
    expect(reopened.solved).toBe(true);
    expect(reopened.exactlyOneLoop).toBe(false);
  });
});

describe("solver", () => {
  it("keeps its incremental caches in step with a fresh recount", () => {
    // A solverSetLine bookkeeping slip otherwise surfaces three rungs later as
    // a wrong deduction. This is upstream's DEBUG_CACHES check, always on.
    for (const diff of [DIFF_EASY, DIFF_NORMAL, DIFF_TRICKY, DIFF_HARD]) {
      const p = squareParams(5, 5, diff);
      const { desc } = newDesc(p, randomNew(`caches-${diff}`));
      const ss = solveGame(newState(p, desc), diff);
      expect(ss.status).toBe("solved");
      checkCaches(ss);
    }
  });

  it("solves what it generates, at each difficulty and not below", () => {
    for (const diff of [DIFF_NORMAL, DIFF_TRICKY, DIFF_HARD]) {
      const p = squareParams(6, 6, diff);
      const { desc } = newDesc(p, randomNew(`grade-${diff}`));
      const s = newState(p, desc);
      expect(solveGame(s, diff).status).toBe("solved");
      // The generator explicitly rejects a board solvable one rung easier.
      expect(solveGame(s, diff - 1).status).not.toBe("solved");
    }
  });

  it("preserves faceSetallIdentical's lost return value", () => {
    // Upstream sets `retval = false` and never reassigns it, so this reports
    // "no progress" even when it changed the board. That makes the solver
    // strictly weaker than intended — and that weakness is baked into which
    // puzzles upstream generates, because the generator is solver-gated.
    // Repairing it would change every board from every seed. See solver.ts.
    const s = blankState();
    s.clues[0] = 1; // yes(0) + 1 === clue, so the rung tries to set NO
    const ss = new SolverState(s, DIFF_HARD);
    const face = ss.grid.faces[0];
    const e1 = face.edges[0]?.index ?? 0;
    const e2 = face.edges[1]?.index ?? 0;
    // Declare the two edges identical, which is the precondition it looks for.
    ss.linedsf?.mergeFlip(e1, e2, false);

    const returned = _internals.faceSetallIdentical(ss, 0, LINE_NO);

    expect(ss.state.lines[e1]).toBe(LINE_NO); // it definitely mutated...
    expect(ss.state.lines[e2]).toBe(LINE_NO);
    expect(returned).toBe(false); // ...and still reported no progress.
  });

  it("fills in a solution for the Solve action", () => {
    const p = squareParams(5, 5, DIFF_EASY);
    const { desc } = newDesc(p, randomNew("solve"));
    const s = newState(p, desc);
    const result = loopyGame.solve?.(s, s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const solved = loopyGame.executeMove(s, result.move);
    expect(solved.solved).toBe(true);
    expect(solved.cheated).toBe(true);
    // Solve leaves nothing undecided.
    expect([...solved.lines].every((l) => l !== LINE_UNKNOWN)).toBe(true);
  });
});

describe("generation", () => {
  it("is deterministic: the same seed reproduces the same board", () => {
    // Shared game IDs depend on this, and so does the degenerate-patch retry —
    // a retry driven by the same RNG stream replays identically.
    for (const type of [0, 11, 12, 16]) {
      const size = Math.max(
        LOOPY_GRIDS[type].amin,
        LOOPY_GRIDS[type].omin,
        type === 11 ? 4 : 0,
      );
      const p = { w: size, h: size, diff: DIFF_EASY, type };
      const a = newDesc(p, randomNew(`det-${type}`));
      const b = newDesc(p, randomNew(`det-${type}`));
      expect(a.desc).toBe(b.desc);
    }
  });

  it("recovers from a degenerate aperiodic patch instead of throwing", () => {
    // At its minimum size a Penrose rhombs patch trims away to nothing for most
    // seeds — upstream aborts in dsf_new(0) on exactly these. No differential
    // fixture can reach this path, because the C cannot produce one.
    const build = () =>
      buildLoopyGrid("penrose_p3_thick", 3, 3, randomNew("degenerate"));
    const first = build();
    expect(first.grid.numFaces).toBeGreaterThan(0);
    // Deterministic: the retry sequence replays from the same stream.
    expect(build().desc).toBe(first.desc);
  });

  it("generates a valid, solvable board for every grid type", () => {
    for (let type = 0; type < LOOPY_GRIDS.length; type++) {
      const e = LOOPY_GRIDS[type];
      let size = Math.max(e.amin, e.omin);
      while (
        validateParams({ w: size, h: size, diff: DIFF_EASY, type }, true) !== null
      ) {
        size++;
      }
      const p = { w: size, h: size, diff: DIFF_EASY, type };
      const { desc } = newDesc(p, randomNew(`all-${type}`));
      expect(validateDesc(p, desc), `${e.title}: ${desc}`).toBeNull();
      const s = newState(p, desc);
      expect(solveGame(s, DIFF_EASY).status, e.title).toBe("solved");
    }
  }, 120000);
});

describe("text format", () => {
  it("renders a square board and declines every other tiling", () => {
    const p = squareParams(4, 4);
    const { desc } = newDesc(p, randomNew("text"));
    const s = newState(p, desc);
    const text = textFormat(s);
    expect(text).toBeDefined();
    // 2w+2 columns (including the newline) by 2h+1 rows.
    expect(text?.split("\n").length).toBe(2 * 4 + 1 + 1);

    // Loopy's text format assumes a square lattice; upstream expresses this as
    // a separate can_format_as_text_now(params), which this interface carries
    // as an undefined return.
    const hexParams = { w: 4, h: 4, diff: DIFF_EASY, type: 2 };
    const hex = newDesc(hexParams, randomNew("text-hex"));
    expect(textFormat(newState(hexParams, hex.desc))).toBeUndefined();
  });
});

describe("presets", () => {
  it("offers a two-level menu whose every preset is valid", () => {
    const root = loopyGame.presets();
    expect(root.submenu).toBeDefined();
    const more = root.submenu?.find((m) => m.title === "More...");
    expect(more?.submenu?.length).toBeGreaterThan(0);

    const walk = (m: { params?: typeof root.params; submenu?: unknown[] }): void => {
      if (m.params) expect(validateParams(m.params, true)).toBeNull();
      for (const c of (m.submenu ?? []) as (typeof m)[]) walk(c);
    };
    walk(root);
  });

  it("formats preset titles height-first, as upstream does", () => {
    // The 12x10 triangular preset displays as "10x12": upstream's title format
    // is sprintf("%dx%d ...", params->h, params->w).
    const titles = loopyGame.presets().submenu?.map((m) => m.title) ?? [];
    expect(titles).toContain("10x12 Triangular - Hard");
  });
});

describe("game registration", () => {
  it("declares the capabilities the app keys off", () => {
    expect(loopyGame.id).toBe("loopy");
    expect(loopyGame.canSolve).toBe(true);
    // Loopy genuinely reads MOD_STYLUS (a tap must reach all three states), so
    // it opts out of the midend's strip-the-bit default.
    expect(loopyGame.wantsStylusModifier).toBe(true);
    expect(loopyGame.isTimed).toBe(false);
    expect(loopyGame.wantsStatusbar).toBe(false);
  });

  it("defaults to a 10x10 Easy square board", () => {
    expect(defaultParams()).toEqual({ w: 10, h: 10, diff: DIFF_EASY, type: 0 });
  });
});
