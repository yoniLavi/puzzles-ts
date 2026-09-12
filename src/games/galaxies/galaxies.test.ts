import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/index.ts";
import {
  CURSOR_SELECT,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { sizedDrawState } from "../../engine/testing/sized-draw-state.ts";
import { PuzzleButton } from "../../engine/types.ts";
import { newGameDesc } from "./generator.ts";
import {
  GalaxiesDiff,
  type GalaxiesMove,
  type GalaxiesParams,
  galaxiesGame,
} from "./index.ts";
import { legalDotsFor, okToAddAssocWithOpposite, reachableFromDot } from "./moves.ts";
import { COL_CURSOR, COL_DRAG, COL_EDGE, COL_MISTAKE } from "./render.ts";
import { clearForSolve, solverState } from "./solver.ts";
import {
  addAssoc,
  blankGame,
  checkComplete,
  cloneState,
  decodeGame,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  rebuildDots,
  SpaceType,
  spaceOppositeDot,
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
  });
});

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
    expect(next.cheated).toBe(true);
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
    // Asserted rather than skipped: a grid with no unset interior edge would
    // make every assertion below unreachable and the test green over nothing.
    expect(ex, "no unset interior edge to toggle").toBeGreaterThanOrEqual(0);
    const next = galaxiesGame.executeMove(s0, {
      ops: [{ kind: "edge", x: ex, y: ey }],
      solving: false,
    });
    expect(next.flags[idx(next, ex, ey)] & 2 /* F_EDGE_SET */).toBeTruthy();
    expect(s0.flags[idx(s0, ex, ey)] & 2).toBeFalsy(); // original unchanged
  });

  it("save round-trip via the Game's serializeMove/deserializeMove defaults", () => {
    const p: GalaxiesParams = { w: 3, h: 3, diff: GalaxiesDiff.Normal };
    const rng = randomNew("save-rt");
    const { desc } = galaxiesGame.newDesc(p, rng);
    const s0 = galaxiesGame.newState(p, desc);
    const move = {
      ops: [{ kind: "edge" as const, x: 1, y: 2 }],
      solving: false,
    };
    // No serializeMove on this game means the engine's default JSON
    // round-trip applies. Verify the move object is JSON-safe.
    const serialized = JSON.stringify(move);
    const parsed = JSON.parse(serialized);
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
    color?: number;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    thickness?: number;
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
      ops.push({ op: "drawRect", color: c, x: r.x, y: r.y, w: r.w, h: r.h }),
    drawLine: (_a: unknown, _b: unknown, c: number, thickness: number) =>
      ops.push({ op: "drawLine", color: c, thickness }),
    drawPolygon: (_p: unknown, f: number) => ops.push({ op: "drawPolygon", color: f }),
    drawCircle: (_p: unknown, _r: number, f: number, outline: number) =>
      // A ring is a stroke with no fill (f < 0); the palette index that
      // matters is then the outline's.
      ops.push({ op: "drawCircle", color: f >= 0 ? f : outline }),
    drawText: (_p: unknown, _o: unknown, c: number) =>
      ops.push({ op: "drawText", color: c }),
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
    expect(ui.cursor.visible).toBe(true);
  });
});

describe("Galaxies solver: hand-crafted small positions", () => {
  it("a too-small puzzle with one dot at the center is trivially solvable", () => {
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
    // wrong-wall recolor (no tile mistakes present), so any such rect
    // proves the wall was painted in the mistake color.
    expect(ops.some((o) => o.op === "drawRect" && o.color === COL_MISTAKE)).toBe(true);
  });

  it("recolors a flagged wall on a board that was already drawn", () => {
    // Paint twice (docs/games/rendering.md § "Prove the overlay repaints"): a Check & Save changes no tile value, so
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
    expect(cold.ops.some((o) => o.op === "drawRect" && o.color === COL_MISTAKE)).toBe(
      false,
    );

    // Frame 2: Check & Save turns the overlay on. Nothing else changed.
    const warm = recordingDrawing();
    const mistakes = galaxiesGame.findMistakes?.(s) ?? [];
    galaxiesRedraw(warm.dr, ds, s, s, 1, ui, 0, 0, undefined, mistakes);
    expect(warm.ops.some((o) => o.op === "drawRect" && o.color === COL_MISTAKE)).toBe(
      true,
    );

    // Frame 3: the overlay clears (the player moves on) — the wall must go
    // back to COL_EDGE, which only happens if the *removal* is stale too.
    const cleared = recordingDrawing();
    galaxiesRedraw(cleared.dr, ds, s, s, 1, ui, 0, 0, undefined, undefined);
    expect(
      cleared.ops.some((o) => o.op === "drawRect" && o.color === COL_MISTAKE),
    ).toBe(false);
    expect(cleared.ops.some((o) => o.op === "drawRect" && o.color === COL_EDGE)).toBe(
      true,
    );
  });
});

describe("Galaxies drag preview (discrete snapped target)", () => {
  // The 2026-08-08 owner-reported smear: the old pixel-following drag
  // arrows were drawn outside the per-tile cache and only one tile was
  // ever invalidated, so every tile the drag crossed kept a stale
  // arrow, and ink landed outside the board where nothing repaints.
  // The preview is now discrete — snapped target + 180° partner,
  // folded into the tile cache — so these tests pin: paint at the
  // target pair only, in the drag color, erased by the tiles' own
  // repaints, never outside the board, no full-board updates.
  //
  // COL_DRAG, not COL_CURSOR: the preview shipped in the keyboard
  // cursor's board-relative tint and the owner could not see it in
  // either scheme (2026-08-08). Asserting the *drag* color is what
  // keeps a transient affordance out of a color that, being a tint of
  // the board, cannot be prominent.
  const p: GalaxiesParams = { w: 3, h: 3, diff: GalaxiesDiff.Normal };
  const p43: GalaxiesParams = { w: 4, h: 3, diff: GalaxiesDiff.Normal };
  const TILE = 32;
  const BORDER = TILE;

  /**
   * 4×3 board with dots at doubled (3,3) and (7,1). Two dots matter: a
   * single-dot board with no edges is *already* one locally-valid
   * symmetric region, so `okToAddAssocWithOpposite` rightly refuses
   * every association on it and no preview can ever show.
   */
  function twoDotBoard() {
    const s = galaxiesGame.newState(p43, "gj");
    const ui = galaxiesGame.newUi(s);
    const ds = newDrawState(s);
    return { s, ui, ds };
  }

  /** Tile rect in pixels for tile-column c, tile-row r. */
  function tileRect(c: number, r: number) {
    return { x: c * TILE + BORDER, y: r * TILE + BORDER };
  }

  it("paints the snapped target and its mirror in the drag color, erases both when the target moves, and leaves nothing after the drag", () => {
    const { s, ui, ds } = twoDotBoard();
    const cold = recordingDrawing();
    galaxiesRedraw(cold.dr, ds, null, s, 1, ui, 0, 0);

    // Drag from the center dot; target the left-middle tile (1,3).
    // Its 180° partner about the dot is the right-middle tile (5,3).
    ui.dragging = true;
    ui.dotx = 3;
    ui.doty = 3;
    ui.srcx = 3;
    ui.srcy = 3;
    ui.targetX = 1;
    ui.targetY = 3;
    const drag1 = recordingDrawing();
    galaxiesRedraw(drag1.dr, ds, null, s, 1, ui, 0, 0);
    const clips1 = drag1.ops.filter((o) => o.op === "clip");
    expect(clips1.map((o) => ({ x: o.x, y: o.y }))).toEqual(
      expect.arrayContaining([tileRect(0, 1), tileRect(2, 1)]),
    );
    expect(clips1).toHaveLength(2);
    // Preview lines (arrows + target outline) are drag-colored —
    // never the committed arrow's ink, and never the cursor's tint.
    const lines1 = drag1.ops.filter((o) => o.op === "drawLine");
    expect(lines1.length).toBeGreaterThan(0);
    expect(lines1.every((o) => o.color === COL_DRAG)).toBe(true);
    expect(lines1.some((o) => o.color === COL_CURSOR)).toBe(false);
    // ...and heavier than one, so the preview cannot be mistaken for a
    // committed arrow even before the color registers.
    expect(lines1.every((o) => (o.thickness ?? 1) > 1)).toBe(true);

    // Move the target: the old pair must repaint clean (that repaint
    // IS the erase), the new pair paints.
    ui.targetX = 1;
    ui.targetY = 1;
    const drag2 = recordingDrawing();
    galaxiesRedraw(drag2.dr, ds, null, s, 1, ui, 0, 0);
    const clips2 = drag2.ops.filter((o) => o.op === "clip");
    expect(clips2.map((o) => ({ x: o.x, y: o.y }))).toEqual(
      expect.arrayContaining([
        tileRect(0, 1),
        tileRect(2, 1),
        tileRect(0, 0),
        tileRect(2, 2),
      ]),
    );
    expect(clips2).toHaveLength(4);

    // Drag ends: the preview pair repaints clean; nothing else.
    ui.dragging = false;
    const done = recordingDrawing();
    galaxiesRedraw(done.dr, ds, null, s, 1, ui, 0, 0);
    expect(done.ops.filter((o) => o.op === "clip")).toHaveLength(2);
    expect(done.ops.some((o) => o.op === "drawLine" && o.color === COL_DRAG)).toBe(
      false,
    );
    const idle = recordingDrawing();
    galaxiesRedraw(idle.dr, ds, null, s, 1, ui, 0, 0);
    expect(idle.ops.filter((o) => o.op === "clip")).toHaveLength(0);

    // Across every drag frame: all paint stays inside the board (the
    // outside-the-board trail could never be erased), and no frame
    // repaints the whole window (the old shape drawUpdate-ed the full
    // canvas on every pointer move).
    const boardLo = BORDER;
    const boardHiX = BORDER + 4 * TILE;
    const boardHiY = BORDER + 3 * TILE;
    for (const frame of [drag1, drag2, done]) {
      for (const o of frame.ops) {
        if (o.op === "clip" || o.op === "drawUpdate") {
          expect(o.x).toBeGreaterThanOrEqual(boardLo);
          expect(o.y).toBeGreaterThanOrEqual(boardLo);
          expect((o.x ?? 0) + (o.w ?? 0)).toBeLessThanOrEqual(boardHiX);
          expect((o.y ?? 0) + (o.h ?? 0)).toBeLessThanOrEqual(boardHiY);
        }
      }
    }
  });

  it("shows no preview on an uncommittable target (mirror off the board)", () => {
    // Dot on the top-left tile's center: every other tile's mirror
    // about it is off-grid, so nothing can commit anywhere.
    const s = galaxiesGame.newState(p, "a");
    const ui = galaxiesGame.newUi(s);
    const ds = newDrawState(s);
    const cold = recordingDrawing();
    galaxiesRedraw(cold.dr, ds, null, s, 1, ui, 0, 0);

    ui.dragging = true;
    ui.dotx = 1;
    ui.doty = 1;
    ui.srcx = 1;
    ui.srcy = 1;
    ui.targetX = 3;
    ui.targetY = 1;
    const drag = recordingDrawing();
    galaxiesRedraw(drag.dr, ds, null, s, 1, ui, 0, 0);
    expect(drag.ops.filter((o) => o.op === "clip")).toHaveLength(0);
    expect(drag.ops.some((o) => o.color === COL_DRAG)).toBe(false);
  });

  it("erases the half-grid cursor when it moves on, and leaves none behind", () => {
    // The vertex/edge cursor used to be painted after the tile loop with a
    // bare drawRect + drawUpdate — outside the per-tile cache, so nothing
    // ever erased it and every vertex and edge the cursor visited kept a
    // mark. It went unnoticed for as long as its color was an invisible
    // tint of the board; it is COL_CURSOR now, and this is the guard.
    const { s, ui, ds } = twoDotBoard();
    const cold = recordingDrawing();
    galaxiesRedraw(cold.dr, ds, null, s, 1, ui, 0, 0);

    const cursorRects = (f: ReturnType<typeof recordingDrawing>) =>
      f.ops.filter((o) => o.op === "drawRect" && o.color === COL_CURSOR);

    // A vertical edge at doubled (2,1): the two tiles it separates each
    // paint their clipped half.
    ui.cursor.visible = true;
    ui.cursor.x = 2;
    ui.cursor.y = 1;
    const at1 = recordingDrawing();
    galaxiesRedraw(at1.dr, ds, null, s, 1, ui, 0, 0);
    expect(cursorRects(at1).length).toBeGreaterThan(0);
    expect(at1.ops.filter((o) => o.op === "clip")).toHaveLength(2);

    // Move two subcells right, onto the next vertical edge. The vacated
    // tiles must repaint — and that repaint must contain no cursor.
    ui.cursor.x = 6;
    const at2 = recordingDrawing();
    galaxiesRedraw(at2.dr, ds, null, s, 1, ui, 0, 0);
    const vacated = [tileRect(0, 0), tileRect(1, 0)];
    const clipped2 = at2.ops.filter((o) => o.op === "clip");
    expect(clipped2.map((o) => ({ x: o.x, y: o.y }))).toEqual(
      expect.arrayContaining(vacated),
    );
    // Exactly the two tiles the cursor now touches carry a mark — if the
    // vacated pair still showed one, this would be four.
    expect(cursorRects(at2)).toHaveLength(2);

    // Hide the cursor: the last pair repaints clean and nothing remains.
    ui.cursor.visible = false;
    const gone = recordingDrawing();
    galaxiesRedraw(gone.dr, ds, null, s, 1, ui, 0, 0);
    expect(gone.ops.filter((o) => o.op === "clip")).toHaveLength(2);
    expect(cursorRects(gone)).toHaveLength(0);
    const idle = recordingDrawing();
    galaxiesRedraw(idle.dr, ds, null, s, 1, ui, 0, 0);
    expect(idle.ops).toHaveLength(0);
  });

  it("release commits exactly the previewed pair, not the release pixel", () => {
    const { s, ui } = twoDotBoard();
    // Press on the dot (pixel center of doubled (3,3) at tile 32 is 80).
    expect(
      galaxiesGame.interpretMove(
        s,
        ui,
        sizedDrawState(galaxiesGame, s),
        { x: 80, y: 80 },
        RIGHT_BUTTON,
      ),
    ).toBe(UI_UPDATE);
    expect(ui.dragging).toBe(true);
    // Drag onto the left-middle tile.
    expect(
      galaxiesGame.interpretMove(
        s,
        ui,
        sizedDrawState(galaxiesGame, s),
        { x: 48, y: 80 },
        RIGHT_DRAG,
      ),
    ).toBe(UI_UPDATE);
    expect([ui.targetX, ui.targetY]).toEqual([1, 3]);
    // A pointer move within the same tile has nothing to repaint.
    expect(
      galaxiesGame.interpretMove(
        s,
        ui,
        sizedDrawState(galaxiesGame, s),
        { x: 51, y: 83 },
        RIGHT_DRAG,
      ),
    ).toBeNull();
    // Release far away (touch lift-jitter): the previewed tile wins.
    const move = galaxiesGame.interpretMove(
      s,
      ui,
      sizedDrawState(galaxiesGame, s),
      { x: 300, y: 300 },
      RIGHT_RELEASE,
    );
    expect(move).toEqual({
      ops: [{ kind: "assoc", x: 1, y: 3, ax: 3, ay: 3 }],
      solving: false,
    });
    const after = galaxiesGame.executeMove(s, move as GalaxiesMove);
    expect(after.flags[idx(after, 1, 3)] & F_TILE_ASSOC).toBeTruthy();
    expect(after.flags[idx(after, 5, 3)] & F_TILE_ASSOC).toBeTruthy();
  });

  it("release where nothing can commit produces no history entry", () => {
    // Corner dot: dragging to any tile is uncommittable (mirror
    // off-grid). The old shape emitted an assoc op that executeMove
    // no-opped — an undo entry that changed nothing.
    const s = galaxiesGame.newState(p, "a");
    const ui = galaxiesGame.newUi(s);
    expect(
      galaxiesGame.interpretMove(
        s,
        ui,
        sizedDrawState(galaxiesGame, s),
        { x: 48, y: 48 },
        RIGHT_BUTTON,
      ),
    ).toBe(UI_UPDATE);
    expect(
      galaxiesGame.interpretMove(
        s,
        ui,
        sizedDrawState(galaxiesGame, s),
        { x: 80, y: 48 },
        RIGHT_DRAG,
      ),
    ).toBe(UI_UPDATE);
    expect(
      galaxiesGame.interpretMove(
        s,
        ui,
        sizedDrawState(galaxiesGame, s),
        { x: 80, y: 48 },
        RIGHT_RELEASE,
      ),
    ).toBe(UI_UPDATE);
    expect(ui.dragging).toBe(false);
  });
});

describe("Galaxies association gestures (left button, and cell→dot)", () => {
  // Two widenings of one gesture, from owner acceptance 2026-08-08: the
  // association drag was reachable only from the right button (which touch
  // reaches only through a 350 ms long-press) and only *from* a dot.
  const p43: GalaxiesParams = { w: 4, h: 3, diff: GalaxiesDiff.Normal };

  /** 4×3 board, dots at doubled (3,3) and (7,1). Tile (c,r)'s center pixel
   * is (48 + 32c, 48 + 32r), so the (3,3) dot sits at (80, 80). */
  function board() {
    const s = galaxiesGame.newState(p43, "gj");
    const ui = galaxiesGame.newUi(s);
    return { s, ui };
  }
  const move = (
    s: GalaxiesState,
    ui: ReturnType<typeof galaxiesGame.newUi>,
    x: number,
    y: number,
    button: number,
  ) =>
    galaxiesGame.interpretMove(
      s,
      ui,
      sizedDrawState(galaxiesGame, s),
      { x, y },
      button,
    );

  it("a left click still toggles an edge — on release, not on press", () => {
    const { s, ui } = board();
    // Press near the wall between tiles (0,1) and (1,1): doubled (2,3).
    // The press is *claimed* (UI_UPDATE) though nothing has been decided:
    // `view-interactive.ts` tracks the pointer only for a press the game
    // consumed, and a `null` here would mean no drag event ever arrives.
    expect(move(s, ui, 64, 80, LEFT_BUTTON)).toBe(UI_UPDATE);
    // Nothing is committed yet — the press has not yet said which gesture
    // it is. (Upstream toggled here; it could, having no left drag.)
    const done = move(s, ui, 66, 81, LEFT_RELEASE);
    expect(done).toEqual({
      ops: [{ kind: "edge", x: 2, y: 3 }],
      solving: false,
    });
    const after = galaxiesGame.executeMove(s, done as GalaxiesMove);
    expect(after.flags[idx(after, 2, 3)] & F_EDGE_SET).toBeTruthy();
  });

  it("a left drag from a dot associates, and toggles no edge", () => {
    const { s, ui } = board();
    expect(move(s, ui, 80, 80, LEFT_BUTTON)).toBe(UI_UPDATE);
    expect(ui.dragging).toBe(false); // claimed, but still ambiguous
    // Travel past the slop: now it is a drag, sourced from the press point.
    expect(move(s, ui, 48, 80, LEFT_DRAG)).toBe(UI_UPDATE);
    expect(ui.dragging).toBe(true);
    expect([ui.dotx, ui.doty]).toEqual([3, 3]);
    expect([ui.targetX, ui.targetY]).toEqual([1, 3]);
    const done = move(s, ui, 48, 80, LEFT_RELEASE);
    expect(done).toEqual({
      ops: [{ kind: "assoc", x: 1, y: 3, ax: 3, ay: 3 }],
      solving: false,
    });
  });

  it("a press that ends far away commits nothing (the canceled-pointer path)", () => {
    // view-interactive.ts's cancelPointerTracking synthesizes a drag and a
    // release at (-100, -100) when the pointer leaves the canvas mid-press.
    // Measuring the release against the press pixel is what stops that
    // toggling an edge on the far side of the board — and the drag it also
    // synthesizes must land nothing either, whichever gesture the press
    // turned out to have started.
    for (const [px, py] of [
      [64, 80], // inside a dot's catchment: a classic drag, dragged off-board
      [48, 48], // a plain cell: a reverse drag with no dot ever in reach
      [65, 113], // near an edge: the press that meant to be a click
    ]) {
      const { s, ui } = board();
      expect(move(s, ui, px, py, LEFT_BUTTON)).toBe(UI_UPDATE);
      const dragged = move(s, ui, -100, -100, LEFT_DRAG);
      const released = move(s, ui, -100, -100, LEFT_RELEASE);
      for (const r of [dragged, released]) {
        expect(r === null || r === UI_UPDATE).toBe(true);
      }
    }
  });

  it("a drag from a plain cell picks the dot, and commits the pair", () => {
    const { s, ui } = board();
    // Tile (0,1) = doubled (1,3). Its only legal dot is (3,3): the 180°
    // image about (7,1) would be (13,-1), off the board.
    expect(legalDotsFor(s, 1, 3)).toEqual([{ x: 3, y: 3 }]);
    expect(move(s, ui, 48, 80, LEFT_BUTTON)).toBe(UI_UPDATE);
    expect(move(s, ui, 60, 80, LEFT_DRAG)).toBe(UI_UPDATE);
    expect(ui.dragToDot).toBe(true);
    expect([ui.srcx, ui.srcy]).toEqual([1, 3]);
    expect([ui.targetX, ui.targetY]).toEqual([1, 3]);
    expect([ui.dotx, ui.doty]).toEqual([3, 3]);
    // The cell is both source and target here, so the classic drag's
    // "dragged back where it started is a null move" test must not fire.
    const done = move(s, ui, 72, 80, LEFT_RELEASE);
    expect(done).toEqual({
      ops: [{ kind: "assoc", x: 1, y: 3, ax: 3, ay: 3 }],
      solving: false,
    });
    const after = galaxiesGame.executeMove(s, done as GalaxiesMove);
    expect(after.flags[idx(after, 1, 3)] & F_TILE_ASSOC).toBeTruthy();
    expect(after.flags[idx(after, 5, 3)] & F_TILE_ASSOC).toBeTruthy();
  });

  it("an out-of-reach pointer picks no dot, and the release commits nothing", () => {
    const { s, ui } = board();
    expect(move(s, ui, 48, 112, LEFT_BUTTON)).toBe(UI_UPDATE);
    // Tile (0,2) = doubled (1,5); drag away from every legal dot.
    expect(move(s, ui, 20, 112, LEFT_DRAG)).toBe(UI_UPDATE);
    expect(ui.dragToDot).toBe(true);
    expect(ui.dotx).toBe(-1);
    expect(move(s, ui, 20, 112, LEFT_RELEASE)).toBe(UI_UPDATE);
  });

  it("a right click on an empty cell stays a no-op", () => {
    // The reverse drag is a *drag*. Starting one on the press would make a
    // bare right-click quietly associate the cell with the nearest dot.
    const { s, ui } = board();
    expect(move(s, ui, 48, 80, RIGHT_BUTTON)).toBe(UI_UPDATE);
    expect(ui.dragging).toBe(false);
    expect(move(s, ui, 48, 80, RIGHT_RELEASE)).toBeNull();
  });

  it("a right press on a dot still lifts the arrow immediately", () => {
    const { s, ui } = board();
    expect(move(s, ui, 80, 80, RIGHT_BUTTON)).toBe(UI_UPDATE);
    expect(ui.dragging).toBe(true);
    expect(ui.dragToDot).toBe(false);
  });

  it("the keyboard reaches the cell→dot gesture too", () => {
    const { s, ui } = board();
    ui.cursor.visible = true;
    ui.cursor.x = 1;
    ui.cursor.y = 3; // tile (0,1)
    expect(move(s, ui, 0, 0, CURSOR_SELECT)).toBe(UI_UPDATE);
    expect(ui.dragToDot).toBe(true);
    expect(ui.dotx).toBe(-1); // nothing picked until the cursor lands on one
    // Walk the cursor onto the dot at (3,3).
    move(s, ui, 0, 0, PuzzleButton.CURSOR_RIGHT);
    move(s, ui, 0, 0, PuzzleButton.CURSOR_RIGHT);
    expect([ui.cursor.x, ui.cursor.y]).toEqual([3, 3]);
    expect([ui.dotx, ui.doty]).toEqual([3, 3]);
    expect(move(s, ui, 0, 0, CURSOR_SELECT)).toEqual({
      ops: [{ kind: "assoc", x: 1, y: 3, ax: 3, ay: 3 }],
      solving: false,
    });
  });
});

describe("Galaxies candidate rings", () => {
  const p43: GalaxiesParams = { w: 4, h: 3, diff: GalaxiesDiff.Normal };

  function board() {
    const s = galaxiesGame.newState(p43, "gj");
    const ui = galaxiesGame.newUi(s);
    const ds = newDrawState(s);
    const cold = recordingDrawing();
    galaxiesRedraw(cold.dr, ds, null, s, 1, ui, 0, 0);
    return { s, ui, ds };
  }
  const rings = (f: ReturnType<typeof recordingDrawing>) =>
    f.ops.filter((o) => o.op === "drawCircle" && o.color === COL_DRAG);

  /** Put `ui` into a cell→dot drag on tile (0,1) = doubled (1,3), whose only
   * legal dot is (3,3) — the 180° image about (7,1) is off the board. */
  function reverseDragOnTile01(ui: ReturnType<typeof galaxiesGame.newUi>) {
    ui.dragging = true;
    ui.dragToDot = true;
    ui.srcx = 1;
    ui.srcy = 3;
    ui.targetX = 1;
    ui.targetY = 3;
    ui.dotx = 3;
    ui.doty = 3;
  }

  it("rings the legal dots while a cell→dot drag is live, and only those", () => {
    const { s, ui, ds } = board();
    reverseDragOnTile01(ui);
    const drag = recordingDrawing();
    galaxiesRedraw(drag.dr, ds, null, s, 1, ui, 0, 0);
    expect(rings(drag).length).toBeGreaterThan(0);
    // Three tiles repaint and no more: the pinned target (0,1), its 180°
    // partner (2,1) — the preview pair — and (1,1), which holds the one
    // legal dot. The board's other dot, (7,1), is on tile (3,0), which is
    // untouched: an illegal candidate is not ringed.
    const clipped = drag.ops.filter((o) => o.op === "clip");
    expect(clipped.map((o) => ({ x: o.x, y: o.y }))).toEqual([
      { x: 32, y: 64 },
      { x: 64, y: 64 },
      { x: 96, y: 64 },
    ]);
  });

  it("draws no rings when the preference is off — but the drag still works", () => {
    const { s, ui, ds } = board();
    reverseDragOnTile01(ui);
    ui.showDragCandidates = false;
    const drag = recordingDrawing();
    galaxiesRedraw(drag.dr, ds, null, s, 1, ui, 0, 0);
    expect(rings(drag)).toHaveLength(0);
    // The preview of the pair a release would commit is *not* the aid, and
    // is still drawn: the preference gates the rings alone.
    expect(drag.ops.some((o) => o.op === "drawLine" && o.color === COL_DRAG)).toBe(
      true,
    );
  });

  it("erases the rings when the drag ends", () => {
    const { s, ui, ds } = board();
    reverseDragOnTile01(ui);
    galaxiesRedraw(recordingDrawing().dr, ds, null, s, 1, ui, 0, 0);
    ui.dragging = false;
    ui.dragToDot = false;
    const done = recordingDrawing();
    galaxiesRedraw(done.dr, ds, null, s, 1, ui, 0, 0);
    expect(rings(done)).toHaveLength(0);
    const idle = recordingDrawing();
    galaxiesRedraw(idle.dr, ds, null, s, 1, ui, 0, 0);
    expect(idle.ops).toHaveLength(0);
  });

  it("rings nothing for a cell with no legal dot", () => {
    const { s, ui, ds } = board();
    // Tile (3,2) = doubled (7,5): about (3,3) its image is (-1,1), about
    // (7,1) it is (7,-3). Both off the board.
    expect(legalDotsFor(s, 7, 5)).toHaveLength(0);
    ui.dragging = true;
    ui.dragToDot = true;
    ui.srcx = 7;
    ui.srcy = 5;
    ui.targetX = 7;
    ui.targetY = 5;
    ui.dotx = -1;
    ui.doty = -1;
    const drag = recordingDrawing();
    galaxiesRedraw(drag.dr, ds, null, s, 1, ui, 0, 0);
    expect(rings(drag)).toHaveLength(0);
    expect(drag.ops.filter((o) => o.op === "clip")).toHaveLength(0);
  });
});

describe("Galaxies association legality is sound", () => {
  // Tightening the predicate is only safe if it can never refuse an arrow
  // the puzzle's own solution contains. That is the property; everything
  // else about `reachableFromDot` is a judgment call, but this is not.
  it("never rejects an association the unique solution contains", () => {
    const params: GalaxiesParams[] = [
      { w: 7, h: 7, diff: GalaxiesDiff.Normal },
      { w: 7, h: 7, diff: GalaxiesDiff.Unreasonable },
      { w: 10, h: 10, diff: GalaxiesDiff.Normal },
    ];
    let checked = 0;
    for (const p of params) {
      for (let seed = 0; seed < 4; seed++) {
        const rs = randomNew(`legality-${p.w}x${p.h}-${p.diff}-${seed}`);
        const { desc } = galaxiesGame.newDesc(p, rs);
        const board = galaxiesGame.newState(p, desc);

        const sol = cloneState(board);
        clearForSolve(sol);
        sol.dots = rebuildDots(sol);
        solverState(sol, GalaxiesDiff.Unreasonable);

        for (let y = 1; y < board.sy - 1; y += 2) {
          for (let x = 1; x < board.sx - 1; x += 2) {
            const si = idx(sol, x, y);
            if (!(sol.flags[si] & F_TILE_ASSOC)) continue;
            const dx = sol.dotx[si];
            const dy = sol.doty[si];
            // A tile carrying its own dot is never associated by a drag.
            if (x === dx && y === dy) continue;
            expect(
              okToAddAssocWithOpposite(board, x, y, dx, dy),
              `solution associates (${x},${y}) with dot (${dx},${dy}) on ${p.w}x${p.h} "${desc}", but the drag would refuse it`,
            ).toBe(true);
            checked++;
          }
        }
      }
    }
    // Guard the guard: a sweep that silently examined nothing would pass.
    expect(checked).toBeGreaterThan(500);
  });

  it("never points an arrow out of a cell another dot owns", () => {
    // The owner's second report (2026-08-11), as an invariant rather than a
    // board: a dot on an edge or a vertex owns every tile it touches, so an
    // arrow in one of those tiles pointing at some *other* dot is impossible.
    // It also has a visual tell, which is how it was spotted — the arrow is
    // drawn a third of a tile from the center and a dot's radius is a
    // quarter, so an arrow aimed at a dot on its own cell's boundary
    // overlaps it. Getting the rule right makes the tell unreachable: every
    // dot close enough for an arrow to touch is a dot that owns the cell.
    const owners = (s: GalaxiesState, dx: number, dy: number) => {
      const out = new Set<number>();
      for (const d of s.dots) {
        if (d.x === dx && d.y === dy) continue;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const tx = d.x + ox;
            const ty = d.y + oy;
            if (spaceTypeAt(tx, ty) !== SpaceType.Tile) continue;
            if (tx > 0 && ty > 0 && tx < s.sx - 1 && ty < s.sy - 1) {
              out.add(idx(s, tx, ty));
            }
          }
        }
      }
      return out;
    };
    let accepted = 0;
    for (const p of [
      { w: 10, h: 10, diff: GalaxiesDiff.Normal },
      { w: 7, h: 7, diff: GalaxiesDiff.Unreasonable },
    ] as GalaxiesParams[]) {
      for (let seed = 0; seed < 2; seed++) {
        const { desc } = galaxiesGame.newDesc(p, randomNew(`owned-${p.w}-${seed}`));
        const s = galaxiesGame.newState(p, desc);
        for (const d of s.dots) {
          const owned = owners(s, d.x, d.y);
          for (let y = 1; y < s.sy - 1; y += 2) {
            for (let x = 1; x < s.sx - 1; x += 2) {
              if (!okToAddAssocWithOpposite(s, x, y, d.x, d.y)) continue;
              accepted++;
              const opp = spaceOppositeDot(s, x, y, d.x, d.y);
              expect(owned.has(idx(s, x, y))).toBe(false);
              expect(opp && owned.has(idx(s, opp.x, opp.y))).toBe(false);
            }
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(300);
  });

  it("refuses the distant dot from the owner's 2026-08-11 board", () => {
    // The 24-dot 10x10 layout read off that screenshot. Dragging from the
    // bottom-left cell (3,17) offered the distant middle dot (11,11), whose
    // 180 image of that cell is (19,5) — a tile the edge dot at (18,5) owns,
    // which is what the arrow was visibly clipping into.
    const s = blankGame(10, 10);
    for (const [x, y] of [
      [5, 1],
      [10, 1],
      [15, 1],
      [19, 2],
      [2, 5],
      [6, 5],
      [18, 5],
      [9, 6],
      [17, 7],
      [18, 9],
      [6, 10],
      [11, 11],
      [14, 12],
      [1, 13],
      [4, 13],
      [17, 13],
      [5, 15],
      [10, 15],
      [13, 17],
      [19, 17],
      [5, 18],
      [11, 18],
      [17, 19],
      [1, 19],
    ]) {
      s.flags[idx(s, x, y)] |= 1 /* F_DOT */;
    }
    s.dots = rebuildDots(s);
    expect(s.dots).toHaveLength(24);

    expect(okToAddAssocWithOpposite(s, 3, 17, 11, 11)).toBe(false);
    expect(legalDotsFor(s, 3, 17)).toEqual([
      { x: 5, y: 15 },
      { x: 5, y: 18 },
    ]);
    // And the same call under the pre-fix predicate, so this test cannot
    // quietly stop testing anything: reachability is the whole difference.
    const permissive = new Uint8Array(s.sx * s.sy).fill(1);
    expect(okToAddAssocWithOpposite(s, 3, 17, 11, 11, undefined, permissive)).toBe(
      true,
    );
  });

  it("refuses a cell no galaxy centered on that dot could reach", () => {
    // The owner's 2026-08-08 report, reduced. A 5×1 strip: dots at the
    // center tile (5,1) and on the edge between (1,1) and (3,1), i.e. at
    // (2,1). The edge dot owns both tiles it separates, so the center dot's
    // galaxy cannot pass leftward through (3,1) — and by symmetry that also
    // denies it (7,1), the tile on the *open* side. Upstream's local
    // precheck accepts both: each is in-grid, dot-free, and has an in-grid
    // dot-free mirror.
    const p: GalaxiesParams = { w: 5, h: 1, diff: GalaxiesDiff.Normal };
    const s = blankGame(p.w, p.h);
    s.flags[idx(s, 5, 1)] |= 1 /* F_DOT */;
    s.flags[idx(s, 2, 1)] |= 1 /* F_DOT */;
    s.dots = rebuildDots(s);

    const reach = reachableFromDot(s, 5, 1);
    expect(reach[idx(s, 5, 1)]).toBe(1); // its own tile
    expect(reach[idx(s, 3, 1)]).toBe(0); // owned by the edge dot
    expect(reach[idx(s, 7, 1)]).toBe(0); // its mirror, so also out
    expect(reach[idx(s, 9, 1)]).toBe(0); // beyond the cut

    expect(okToAddAssocWithOpposite(s, 7, 1, 5, 1)).toBe(false);
    expect(legalDotsFor(s, 7, 1)).toEqual([]);
    // The edge dot's own pair is still offered — the tightening removes
    // only what was impossible.
    expect(legalDotsFor(s, 9, 1)).toEqual([]);
    expect(reachableFromDot(s, 2, 1)[idx(s, 1, 1)]).toBe(1);
  });
});
