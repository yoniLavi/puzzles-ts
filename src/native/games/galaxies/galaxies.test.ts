import { describe, expect, it } from "vitest";
import { PuzzleButton } from "../../../puzzle/types.ts";
import { UI_UPDATE } from "../../engine/index.ts";
import { randomNew } from "../../random/index.ts";
import { newGameDesc } from "./generator.ts";
import { GalaxiesDiff, type GalaxiesParams, galaxiesGame } from "./index.ts";
import { COL_EDGE, COL_MISTAKE } from "./render.ts";
import { clearForSolve, solverState } from "./solver.ts";
import {
  addAssoc,
  blankGame,
  checkComplete,
  cloneState,
  decodeGame,
  F_EDGE_SET,
  F_TILE_ASSOC,
  idx,
  rebuildDots,
  SpaceType,
  spaceTypeAt,
  tilesFromEdge,
} from "./state.ts";

const SMOKE_PARAMS: GalaxiesParams[] = [
  { w: 3, h: 3, diff: GalaxiesDiff.Normal },
  { w: 5, h: 5, diff: GalaxiesDiff.Normal },
  { w: 7, h: 7, diff: GalaxiesDiff.Normal },
];

describe("Galaxies generator integration", () => {
  for (const p of SMOKE_PARAMS) {
    it(`${p.w}x${p.h} Normal: produces a uniquely-solvable board at exactly the requested difficulty`, () => {
      const rng = randomNew(`gen-${p.w}x${p.h}-normal`);
      const desc = newGameDesc(p, rng);
      // The desc must decode and round-trip.
      const fresh = blankGame(p.w, p.h);
      const err = decodeGame(fresh, desc);
      expect(err).toBeNull();
      fresh.dots = rebuildDots(fresh);

      // Solver run from clean state must complete at exactly Normal.
      clearForSolve(fresh);
      const diff = solverState(fresh, GalaxiesDiff.Unreasonable);
      expect(diff).toBe(GalaxiesDiff.Normal);
      expect(checkComplete(fresh, false).complete).toBe(true);
    });
  }

  it("7x7 Unreasonable: completes and reports diff=Unreasonable", () => {
    const p: GalaxiesParams = {
      w: 7,
      h: 7,
      diff: GalaxiesDiff.Unreasonable,
    };
    const rng = randomNew("gen-7x7-unreasonable");
    const desc = newGameDesc(p, rng);
    const fresh = blankGame(p.w, p.h);
    const err = decodeGame(fresh, desc);
    expect(err).toBeNull();
    fresh.dots = rebuildDots(fresh);
    clearForSolve(fresh);
    const diff = solverState(fresh, GalaxiesDiff.Unreasonable);
    expect(diff).toBe(GalaxiesDiff.Unreasonable);
    expect(checkComplete(fresh, false).complete).toBe(true);
  }, 60_000);
}, 120_000);

describe("Galaxies game flow", () => {
  it("newDesc → newState → solve → executeMove(solve) completes the puzzle", () => {
    const p: GalaxiesParams = { w: 5, h: 5, diff: GalaxiesDiff.Normal };
    const rng = randomNew("flow-5x5");
    const { desc } = galaxiesGame.newDesc(p, rng);
    const init = galaxiesGame.newState(p, desc);
    expect(galaxiesGame.status(init)).toBe("ongoing");
    const result = galaxiesGame.solve?.(init, init);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const next = galaxiesGame.executeMove(init, result.move);
    expect(galaxiesGame.status(next)).toBe("solved");
    expect(next.usedSolve).toBe(true);
  });

  it("validateDesc rejects an unparseable desc", () => {
    const p: GalaxiesParams = { w: 3, h: 3, diff: GalaxiesDiff.Normal };
    expect(galaxiesGame.validateDesc(p, "1")).toContain("Invalid characters");
  });

  it("decodeParams accepts upstream-lenient forms", () => {
    expect(galaxiesGame.decodeParams("7")).toEqual({
      w: 7,
      h: 7,
      diff: GalaxiesDiff.Normal,
    });
    expect(galaxiesGame.decodeParams("7x10")).toEqual({
      w: 7,
      h: 10,
      diff: GalaxiesDiff.Normal,
    });
    expect(galaxiesGame.decodeParams("7x7dn")).toEqual({
      w: 7,
      h: 7,
      diff: GalaxiesDiff.Normal,
    });
    expect(galaxiesGame.decodeParams("7x7du")).toEqual({
      w: 7,
      h: 7,
      diff: GalaxiesDiff.Unreasonable,
    });
  });

  it("encodeParams round-trips with full and partial flags", () => {
    const p: GalaxiesParams = { w: 7, h: 7, diff: GalaxiesDiff.Unreasonable };
    expect(galaxiesGame.encodeParams(p, false)).toBe("7x7");
    expect(galaxiesGame.encodeParams(p, true)).toBe("7x7du");
    expect(galaxiesGame.decodeParams(galaxiesGame.encodeParams(p, true))).toEqual(p);
  });

  it("validateParams rejects too-small boards", () => {
    expect(
      galaxiesGame.validateParams({ w: 2, h: 2, diff: GalaxiesDiff.Normal }, true),
    ).toContain("at least 3");
  });

  it("an edge toggle move flips F_EDGE_SET", () => {
    const p: GalaxiesParams = { w: 3, h: 3, diff: GalaxiesDiff.Normal };
    const rng = randomNew("edge-test");
    const { desc } = galaxiesGame.newDesc(p, rng);
    const s0 = galaxiesGame.newState(p, desc);
    // Find an unset interior edge to toggle.
    let ex = -1;
    let ey = -1;
    outer: for (let y = 1; y < s0.sy - 1; y++) {
      for (let x = 1; x < s0.sx - 1; x++) {
        if (((x ^ y) & 1) === 0) continue; // not an edge
        if (s0.flags[idx(s0, x, y)] === 0) {
          ex = x;
          ey = y;
          break outer;
        }
      }
    }
    if (ex < 0) return; // no candidate (very small grid)
    const next = galaxiesGame.executeMove(s0, {
      ops: [{ kind: "edge", x: ex, y: ey }],
      solving: false,
    });
    expect(next.flags[idx(next, ex, ey)] & 2 /* F_EDGE_SET */).toBeTruthy();
    expect(s0.flags[idx(s0, ex, ey)] & 2).toBeFalsy(); // original unchanged
  });

  it("save round-trip via the Game's serialiseMove/deserialiseMove defaults", () => {
    const p: GalaxiesParams = { w: 3, h: 3, diff: GalaxiesDiff.Normal };
    const rng = randomNew("save-rt");
    const { desc } = galaxiesGame.newDesc(p, rng);
    const s0 = galaxiesGame.newState(p, desc);
    const move = {
      ops: [{ kind: "edge" as const, x: 1, y: 2 }],
      solving: false,
    };
    // No serialiseMove on this game means the engine's default JSON
    // round-trip applies. Verify the move object is JSON-safe.
    const serialised = JSON.stringify(move);
    const parsed = JSON.parse(serialised);
    expect(parsed).toEqual(move);
    // The state after applying the parsed move should equal applying
    // the original.
    const a = galaxiesGame.executeMove(s0, move);
    const b = galaxiesGame.executeMove(s0, parsed);
    expect(Array.from(a.flags)).toEqual(Array.from(b.flags));
  });
});

function recordingDrawing() {
  const ops: Array<{
    op: string;
    colour?: number;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  }> = [];
  const dr = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: (r: { x: number; y: number; w: number; h: number }) =>
      ops.push({ op: "drawUpdate", x: r.x, y: r.y, w: r.w, h: r.h }),
    clip: (r: { x: number; y: number; w: number; h: number }) =>
      ops.push({ op: "clip", x: r.x, y: r.y, w: r.w, h: r.h }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (r: { x: number; y: number; w: number; h: number }, c: number) =>
      ops.push({ op: "drawRect", colour: c, x: r.x, y: r.y, w: r.w, h: r.h }),
    drawLine: (_a: unknown, _b: unknown, c: number) =>
      ops.push({ op: "drawLine", colour: c }),
    drawPolygon: (_p: unknown, f: number) => ops.push({ op: "drawPolygon", colour: f }),
    drawCircle: (_p: unknown, _r: number, f: number) =>
      ops.push({ op: "drawCircle", colour: f }),
    drawText: (_p: unknown, _o: unknown, c: number) =>
      ops.push({ op: "drawText", colour: c }),
    blitterNew: () => ({}),
    blitterFree: () => ops.push({ op: "blitterFree" }),
    blitterSave: () => ops.push({ op: "blitterSave" }),
    blitterLoad: () => ops.push({ op: "blitterLoad" }),
  };
  return { dr, ops };
}

// Galaxies always defines these optional Game members; pin them as
// non-optional locals so the tests don't need `!` assertions.
const newDrawState = galaxiesGame.newDrawState as NonNullable<
  typeof galaxiesGame.newDrawState
>;
const galaxiesRedraw = galaxiesGame.redraw as NonNullable<typeof galaxiesGame.redraw>;

describe("Galaxies rendering", () => {
  it("first redraw paints the background once and updates per tile", () => {
    const p: GalaxiesParams = { w: 3, h: 3, diff: GalaxiesDiff.Normal };
    const rng = randomNew("render-first-draw");
    const { desc } = galaxiesGame.newDesc(p, rng);
    const s = galaxiesGame.newState(p, desc);
    const ui = galaxiesGame.newUi(s);
    const ds = newDrawState(s);
    const { dr, ops } = recordingDrawing();
    galaxiesRedraw(dr, ds, null, s, 1, ui, 0, 0);
    // First-draw branch is responsible for the background fill —
    // per the post-Flip doctrine, the engine emits no pixels of its
    // own (see fix-flip-canvas-reshape).
    const bgFills = ops.filter((o) => o.op === "drawRect" && o.x === 0 && o.y === 0);
    expect(bgFills.length).toBeGreaterThanOrEqual(1);
    // Each tile (w*h = 9) should be clipped exactly once.
    const clips = ops.filter((o) => o.op === "clip").length;
    expect(clips).toBe(9);
  });

  it("a second redraw with no state change emits no per-tile clips", () => {
    const p: GalaxiesParams = { w: 3, h: 3, diff: GalaxiesDiff.Normal };
    const rng = randomNew("render-cache");
    const { desc } = galaxiesGame.newDesc(p, rng);
    const s = galaxiesGame.newState(p, desc);
    const ui = galaxiesGame.newUi(s);
    const ds = newDrawState(s);
    const { dr } = recordingDrawing();
    galaxiesRedraw(dr, ds, null, s, 1, ui, 0, 0);
    const { dr: dr2, ops: ops2 } = recordingDrawing();
    galaxiesRedraw(dr2, ds, null, s, 1, ui, 0, 0);
    // Cache hit on every tile — no clip/unclip pairs.
    expect(ops2.some((o) => o.op === "clip")).toBe(false);
    // First-draw is over, so no full-window bg fill either.
    expect(ops2.some((o) => o.op === "drawRect" && o.x === 0 && o.y === 0)).toBe(false);
  });
});

describe("Galaxies palette: mkhighlight background shift", () => {
  it("a near-white host background produces a visibly off-white COL_BACKGROUND, distinct from COL_WHITEBG", () => {
    // Reproduces the 2026-05-23 owner-reported bug: closing a region
    // produced no visible colour change because COL_BACKGROUND was
    // identical to COL_WHITEBG (both pure white). The mkhighlight
    // background shift (misc.c lines 232-288) is the C engine's fix;
    // we must apply the same shift here.
    const palette = galaxiesGame.colours([1, 1, 1]);
    const bg = palette[0]; // COL_BACKGROUND
    const whiteBg = palette[1]; // COL_WHITEBG
    expect(whiteBg).toEqual([1, 1, 1]);
    // The shifted background must be visibly darker than white.
    const distance = Math.sqrt(
      (bg[0] - whiteBg[0]) ** 2 + (bg[1] - whiteBg[1]) ** 2 + (bg[2] - whiteBg[2]) ** 2,
    );
    expect(distance).toBeGreaterThan(0.25);
  });

  it("a mid-grey host background passes through unchanged (no shift needed)", () => {
    const palette = galaxiesGame.colours([0.5, 0.5, 0.5]);
    expect(palette[0][0]).toBeCloseTo(0.5);
    expect(palette[0][1]).toBeCloseTo(0.5);
    expect(palette[0][2]).toBeCloseTo(0.5);
  });

  it("IEEE-drift white from oklchToColour round-trip still produces a grey background, not out-of-gamut pink", () => {
    // The puzzle-view's `oklchToColour([bgl, 0, 0])` round-trip on a
    // pure-white host returns [1+e, 1-e, 1+e] with ~1e-15 drift.
    // Without the epsilon in mkhighlight, `dw` is ~1e-15 and
    // `colourMix(white, out, K/dw)` overflows to ~2.89e14, shifting
    // the bg wildly past white into out-of-gamut pink. Bug surfaced
    // 2026-05-23.
    const drifted: [number, number, number] = [
      1.0000000000000009, 0.9999999999999997, 1.0000000000000004,
    ];
    const bg = galaxiesGame.colours(drifted)[0];
    expect(bg[0]).toBeCloseTo(5 / 6, 3);
    expect(bg[1]).toBeCloseTo(5 / 6, 3);
    expect(bg[2]).toBeCloseTo(5 / 6, 3);
    // And critically: each component is in [0, 1] (no out-of-gamut).
    for (const c of bg) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe("Galaxies button code stability", () => {
  it("shared button consts still match PuzzleButton", () => {
    expect(PuzzleButton.LEFT_BUTTON).toBe(0x0200);
    expect(PuzzleButton.RIGHT_BUTTON).toBe(0x0202);
    expect(PuzzleButton.LEFT_DRAG).toBe(0x0203);
    expect(PuzzleButton.RIGHT_DRAG).toBe(0x0205);
    expect(PuzzleButton.LEFT_RELEASE).toBe(0x0206);
    expect(PuzzleButton.RIGHT_RELEASE).toBe(0x0208);
    expect(PuzzleButton.CURSOR_UP).toBe(0x0200 + 9);
    expect(PuzzleButton.CURSOR_SELECT).toBe(0x0200 + 13);
  });
});

describe("Galaxies interpretMove", () => {
  it("CURSOR_UP shows the cursor on first press (UI_UPDATE, no move)", () => {
    const p: GalaxiesParams = { w: 3, h: 3, diff: GalaxiesDiff.Normal };
    const rng = randomNew("interp-cursor");
    const { desc } = galaxiesGame.newDesc(p, rng);
    const s = galaxiesGame.newState(p, desc);
    const ui = galaxiesGame.newUi(s);
    const r = galaxiesGame.interpretMove(
      s,
      ui,
      newDrawState(s),
      { x: 0, y: 0 },
      PuzzleButton.CURSOR_UP,
    );
    expect(r).toBe(UI_UPDATE);
    expect(ui.curVisible).toBe(true);
  });
});

describe("Galaxies solver: hand-crafted small positions", () => {
  it("a too-small puzzle with one dot at the centre is trivially solvable", () => {
    // 3x3 with a dot at (3,3) — every tile is associated with that
    // dot trivially.
    const s = blankGame(3, 3);
    s.flags[idx(s, 3, 3)] |= 1 /* F_DOT */;
    s.dots = rebuildDots(s);
    clearForSolve(s);
    const diff = solverState(s, GalaxiesDiff.Unreasonable);
    expect(diff).toBe(GalaxiesDiff.Normal);
    expect(checkComplete(s, false).complete).toBe(true);
  });

  it("solver reports impossible when there are no dots", () => {
    const s = blankGame(3, 3);
    s.dots = rebuildDots(s);
    clearForSolve(s);
    const diff = solverState(s, GalaxiesDiff.Unreasonable);
    // No dots → no associations possible → expand_dots returns
    // impossible because every empty tile is unreachable.
    expect(diff).toBe(GalaxiesDiff.Impossible);
    void F_TILE_ASSOC;
  });
});

describe("Galaxies findMistakes", () => {
  // Recover the unique solution (with associations) the same way the
  // hook does, so the tests can build correct/wrong player states.
  function solutionOf(init: ReturnType<typeof galaxiesGame.newState>) {
    const sol = cloneState(init);
    clearForSolve(sol);
    sol.dots = rebuildDots(sol);
    const diff = solverState(sol, GalaxiesDiff.Unreasonable);
    expect([GalaxiesDiff.Normal, GalaxiesDiff.Unreasonable]).toContain(diff);
    return sol;
  }

  const p: GalaxiesParams = { w: 5, h: 5, diff: GalaxiesDiff.Normal };
  const rng = randomNew("mistakes-5x5");
  const { desc } = galaxiesGame.newDesc(p, rng);
  const init = galaxiesGame.newState(p, desc);
  const sol = solutionOf(init);

  it("flags a tile associated to the wrong dot", () => {
    const s = cloneState(init);
    // Pick the first interior tile and a dot that is NOT its solution dot.
    const tx = 1;
    const ty = 1;
    const si = idx(sol, tx, ty);
    const wrong = sol.dots.find((d) => d.x !== sol.dotx[si] || d.y !== sol.doty[si]);
    expect(wrong).toBeDefined();
    if (!wrong) return;
    addAssoc(s, tx, ty, wrong.x, wrong.y);

    const mistakes = galaxiesGame.findMistakes?.(s) ?? [];
    expect(mistakes).toContainEqual({ kind: "tile", x: tx, y: ty });
  });

  it("flags nothing when an association matches the solution", () => {
    const s = cloneState(init);
    const tx = 1;
    const ty = 1;
    const si = idx(sol, tx, ty);
    addAssoc(s, tx, ty, sol.dotx[si], sol.doty[si]);

    expect(galaxiesGame.findMistakes?.(s)).toEqual([]);
  });

  it("flags nothing on a freshly generated (empty) board", () => {
    expect(galaxiesGame.findMistakes?.(init)).toEqual([]);
  });

  it("flags nothing on a correctly solved board", () => {
    const result = galaxiesGame.solve?.(init, init);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const solved = galaxiesGame.executeMove(init, result.move);
    expect(galaxiesGame.status(solved)).toBe("solved");
    expect(galaxiesGame.findMistakes?.(solved)).toEqual([]);
  });

  // --- walls (the bug the association-only first cut missed) --------

  /** An interior edge whose two tiles share a solution dot (a wall here
   * would slice a single galaxy) and one whose tiles belong to different
   * galaxies (a legitimate boundary), derived from the unique solution. */
  function classifyEdges(solution: typeof sol) {
    let interior: { x: number; y: number } | null = null;
    let boundary: { x: number; y: number } | null = null;
    for (let y = 1; y < solution.sy - 1 && (!interior || !boundary); y++) {
      for (let x = 1; x < solution.sx - 1 && (!interior || !boundary); x++) {
        if (spaceTypeAt(x, y) !== SpaceType.Edge) continue;
        const [t0, t1] = tilesFromEdge(solution, x, y);
        if (!t0 || !t1) continue;
        const a = idx(solution, t0.x, t0.y);
        const b = idx(solution, t1.x, t1.y);
        if (!(solution.flags[a] & F_TILE_ASSOC)) continue;
        if (!(solution.flags[b] & F_TILE_ASSOC)) continue;
        const same =
          solution.dotx[a] === solution.dotx[b] &&
          solution.doty[a] === solution.doty[b];
        if (same && !interior) interior = { x, y };
        if (!same && !boundary) boundary = { x, y };
      }
    }
    return { interior, boundary };
  }

  const { interior, boundary } = classifyEdges(sol);

  it("flags a wall placed inside a single solution galaxy — with zero associations", () => {
    expect(interior).not.toBeNull();
    if (!interior) return;
    // Pure-wall play: no association arrows at all, just one wrong wall.
    const s = cloneState(init);
    s.flags[idx(s, interior.x, interior.y)] |= F_EDGE_SET;
    const mistakes = galaxiesGame.findMistakes?.(s) ?? [];
    expect(mistakes).toContainEqual({ kind: "edge", x: interior.x, y: interior.y });
    // And nothing of kind "tile" — there are no associations to be wrong.
    expect(mistakes.every((m) => m.kind === "edge")).toBe(true);
  });

  it("does not flag a wall on a true galaxy boundary", () => {
    expect(boundary).not.toBeNull();
    if (!boundary) return;
    const s = cloneState(init);
    s.flags[idx(s, boundary.x, boundary.y)] |= F_EDGE_SET;
    const mistakes = galaxiesGame.findMistakes?.(s) ?? [];
    expect(
      mistakes.some(
        (m) => m.kind === "edge" && m.x === boundary.x && m.y === boundary.y,
      ),
    ).toBe(false);
  });

  it("renders a flagged wall in COL_MISTAKE", () => {
    expect(interior).not.toBeNull();
    if (!interior) return;
    const s = cloneState(init);
    s.flags[idx(s, interior.x, interior.y)] |= F_EDGE_SET;
    const mistakes = galaxiesGame.findMistakes?.(s) ?? [];
    const ui = galaxiesGame.newUi(s);
    const ds = newDrawState(s);
    const { dr, ops } = recordingDrawing();
    galaxiesRedraw(dr, ds, null, s, 1, ui, 0, 0, undefined, mistakes);
    // The only COL_MISTAKE consumer reachable from this state is the
    // wrong-wall recolour (no tile mistakes present), so any such rect
    // proves the wall was painted in the mistake colour.
    expect(ops.some((o) => o.op === "drawRect" && o.colour === COL_MISTAKE)).toBe(true);
  });

  it("recolours a flagged wall on a board that was already drawn", () => {
    // Paint twice (playbook §3.2): a Check & Save changes no tile value, so
    // this frame only repaints if the wall overlay is part of the cache-miss
    // test. A cold-frame test cannot see that — every cell misses on frame 1
    // regardless — which is how a missing-from-the-diff-key overlay ships.
    expect(interior).not.toBeNull();
    if (!interior) return;
    const s = cloneState(init);
    s.flags[idx(s, interior.x, interior.y)] |= F_EDGE_SET;
    const ui = galaxiesGame.newUi(s);
    const ds = newDrawState(s);

    // Frame 1: the same board, no overlay — warms the per-tile cache.
    const cold = recordingDrawing();
    galaxiesRedraw(cold.dr, ds, null, s, 1, ui, 0, 0, undefined, undefined);
    expect(cold.ops.some((o) => o.op === "drawRect" && o.colour === COL_MISTAKE)).toBe(
      false,
    );

    // Frame 2: Check & Save turns the overlay on. Nothing else changed.
    const warm = recordingDrawing();
    const mistakes = galaxiesGame.findMistakes?.(s) ?? [];
    galaxiesRedraw(warm.dr, ds, s, s, 1, ui, 0, 0, undefined, mistakes);
    expect(warm.ops.some((o) => o.op === "drawRect" && o.colour === COL_MISTAKE)).toBe(
      true,
    );

    // Frame 3: the overlay clears (the player moves on) — the wall must go
    // back to COL_EDGE, which only happens if the *removal* is stale too.
    const cleared = recordingDrawing();
    galaxiesRedraw(cleared.dr, ds, s, s, 1, ui, 0, 0, undefined, undefined);
    expect(
      cleared.ops.some((o) => o.op === "drawRect" && o.colour === COL_MISTAKE),
    ).toBe(false);
    expect(cleared.ops.some((o) => o.op === "drawRect" && o.colour === COL_EDGE)).toBe(
      true,
    );
  });
});
