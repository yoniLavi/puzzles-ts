/**
 * Netslide behavioural tests.
 *
 * Tier 1 (pure logic) for the codec, the slide primitives, the ring cursor, the
 * generator's structural invariants, input mapping and the win condition; tier
 * 2.5 (`renderScenario` against a real `Midend`) for the frames — the opener and
 * a mid-slide animation frame.
 *
 * The generator's *fidelity to C* is pinned separately, and far more strongly,
 * by `netslide-differential.test.ts` (byte-for-byte desc match). These tests
 * cover what a byte-match cannot: that the thing plays.
 */

import { describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import type { DrawOp } from "../../engine/testing/recording-drawing.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { netslideGame } from "./index.ts";
import {
  COL_BARRIER,
  COL_BORDER,
  COL_FLASHING,
  COL_POWERED,
  COL_WIRE,
  FLASH_FRAME,
  PREFERRED_TILE_SIZE,
} from "./render.ts";
import {
  ACTIVE,
  c2pos,
  computeActive,
  D,
  DIRECTIONS,
  decodeParams,
  encodeParams,
  isComplete,
  L,
  type NetslideParams,
  newState,
  newUi,
  offset,
  opposite,
  pos2c,
  R,
  slideCol,
  slideRow,
  U,
  validateDesc,
  validateParams,
  wireCount,
} from "./state.ts";

const EASY_5x5: NetslideParams = {
  w: 5,
  h: 5,
  wrapping: false,
  barrierProbability: 1,
  movetarget: 0,
};

const hexGrid = (aux: string) => Uint8Array.from(aux, (c) => Number.parseInt(c, 16));

/* ----------------------------------------------------------------------
 * Params + desc codec.
 */

describe("netslide params", () => {
  it("round-trips every preset", () => {
    const presets = netslideGame.presets().submenu ?? [];
    expect(presets).toHaveLength(9);
    for (const { params } of presets) {
      const p = params as NetslideParams;
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("round-trips wrapping, a fractional barrier probability and a move target", () => {
    const p: NetslideParams = {
      w: 5,
      h: 5,
      wrapping: true,
      barrierProbability: 0.5,
      movetarget: 20,
    };
    expect(encodeParams(p, true)).toBe("5x5wb0.5m20");
    expect(decodeParams("5x5wb0.5m20")).toEqual(p);
  });

  it("keeps the move target in the short encoding, but drops the barriers", () => {
    // Upstream is explicit that the shuffle limit is part of the *limited*
    // params: a game id has to name it, since the status bar reports against it.
    const p: NetslideParams = {
      w: 4,
      h: 4,
      wrapping: false,
      barrierProbability: 1,
      movetarget: 7,
    };
    expect(encodeParams(p, false)).toBe("4x4m7");
    expect(encodeParams(p, true)).toBe("4x4b1m7");
  });

  it("reads a bare size as a square grid", () => {
    expect(decodeParams("6")).toMatchObject({ w: 6, h: 6 });
  });

  it("rejects degenerate params", () => {
    expect(validateParams({ ...EASY_5x5, w: 1 }, true)).not.toBeNull();
    expect(validateParams({ ...EASY_5x5, h: 1 }, true)).not.toBeNull();
    expect(
      validateParams({ ...EASY_5x5, barrierProbability: -0.1 }, true),
    ).not.toBeNull();
    expect(
      validateParams({ ...EASY_5x5, barrierProbability: 1.5 }, true),
    ).not.toBeNull();
    expect(validateParams({ ...EASY_5x5, movetarget: -1 }, true)).not.toBeNull();
    expect(validateParams(EASY_5x5, true)).toBeNull();
  });
});

describe("netslide desc", () => {
  it("parses barriers back symmetrically", () => {
    const { desc } = newDesc(EASY_5x5, randomNew("desc-roundtrip"));
    expect(validateDesc(EASY_5x5, desc)).toBeNull();

    // A wall between two tiles must be recorded on both of them, or the flood
    // fill would leak through it in one direction only.
    const s = newState(EASY_5x5, desc);
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        for (const dir of DIRECTIONS) {
          if (!(s.barriers[y * s.w + x] & dir)) continue;
          const n = offset(x, y, dir, s.w, s.h);
          expect(s.barriers[n.y * s.w + n.x] & opposite(dir)).toBeTruthy();
        }
      }
    }
  });

  it("fences a non-wrapping game in with a border wall", () => {
    const s = newState(EASY_5x5, newDesc(EASY_5x5, randomNew("border")).desc);
    for (let x = 0; x < s.w; x++) {
      expect(s.barriers[x] & U).toBeTruthy();
      expect(s.barriers[(s.h - 1) * s.w + x] & D).toBeTruthy();
    }
    for (let y = 0; y < s.h; y++) {
      expect(s.barriers[y * s.w] & L).toBeTruthy();
      expect(s.barriers[y * s.w + (s.w - 1)] & R).toBeTruthy();
    }
  });

  it("leaves a wrapping, barrier-free game entirely unwalled", () => {
    const p = { ...EASY_5x5, wrapping: true, barrierProbability: 0 };
    const s = newState(p, newDesc(p, randomNew("wrap")).desc);
    expect(s.barriers.every((b) => b === 0)).toBe(true);
  });

  it("rejects a short, a long, and a corrupt desc", () => {
    const p: NetslideParams = { ...EASY_5x5, w: 2, h: 2 };
    expect(validateDesc(p, "1234")).toBeNull();
    expect(validateDesc(p, "123")).toBe("Game description shorter than expected");
    expect(validateDesc(p, "12345")).toBe("Game description longer than expected");
    expect(validateDesc(p, "12z4")).toBe(
      "Game description contained unexpected character",
    );
  });
});

/* ----------------------------------------------------------------------
 * Sliding.
 */

describe("netslide slides", () => {
  it("slides a row, wrapping around", () => {
    // `dir = +1` shifts contents toward *lower* x — the way the arrow the
    // player clicked points — and the tile falling off the left reappears right.
    const tiles = Uint8Array.from([1, 2, 3, 4, 5, 6]); // 3 wide, 2 tall
    slideRow(3, tiles, +1, 0);
    expect([...tiles]).toEqual([2, 3, 1, 4, 5, 6]);
    slideRow(3, tiles, -1, 0);
    expect([...tiles]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("slides a column, wrapping around", () => {
    const tiles = Uint8Array.from([1, 2, 3, 4, 5, 6]); // 2 wide, 3 tall
    slideCol(2, 3, tiles, +1, 0);
    expect([...tiles]).toEqual([3, 2, 5, 4, 1, 6]);
    slideCol(2, 3, tiles, -1, 0);
    expect([...tiles]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

/* ----------------------------------------------------------------------
 * The generator's structural invariants.
 */

describe("netslide generator", () => {
  it("builds a spanning tree: all reachable, no full crosses, no loops", () => {
    for (const seed of ["tree-0", "tree-1", "tree-2"]) {
      for (const p of [
        EASY_5x5,
        { ...EASY_5x5, wrapping: true, barrierProbability: 0 },
        { ...EASY_5x5, w: 6, h: 4 },
      ]) {
        const { desc, aux } = newDesc(p, randomNew(seed));
        const solution = { ...newState(p, desc), tiles: hexGrid(aux) };

        // Every tile is powered from the centre.
        expect(isComplete(solution)).toBe(true);

        // No full crosses: a four-armed tile is identical in every orientation,
        // so it would tell the player nothing.
        for (const tile of solution.tiles) expect(wireCount(tile)).toBeLessThan(4);

        // No loops: a spanning tree over w·h tiles has exactly w·h − 1 edges,
        // and every edge is counted once from each of its two ends.
        const arms = [...solution.tiles].reduce((n, t) => n + wireCount(t), 0);
        expect(arms / 2).toBe(p.w * p.h - 1);
      }
    }
  });

  it("wires are symmetric — both tiles agree a connection exists", () => {
    const { desc, aux } = newDesc(EASY_5x5, randomNew("symmetry"));
    const s = newState(EASY_5x5, desc);
    const tiles = hexGrid(aux);
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        for (const dir of DIRECTIONS) {
          if (!(tiles[y * s.w + x] & dir)) continue;
          const n = offset(x, y, dir, s.w, s.h);
          expect(tiles[n.y * s.w + n.x] & opposite(dir)).toBeTruthy();
        }
      }
    }
  });

  it("more barriers on one seed keeps the same grid and only adds walls", () => {
    // Upstream picks barriers *after* shuffling, one at a time from the
    // candidate list, precisely so a player who finds a board too hard and asks
    // for more barriers keeps the ones they had already worked out.
    const at = (bprob: number) => {
      const p = { ...EASY_5x5, barrierProbability: bprob };
      return newState(p, newDesc(p, randomNew("superset")).desc);
    };
    const low = at(0.5);
    const high = at(1);

    expect([...high.tiles]).toEqual([...low.tiles]); // the same shuffled grid

    for (let i = 0; i < low.barriers.length; i++) {
      const lowWalls = low.barriers[i] & 0x0f;
      expect(high.barriers[i] & 0x0f & lowWalls).toBe(lowWalls);
    }
  });

  it("honours an explicit shuffle target and reports it", () => {
    const p = { ...EASY_5x5, movetarget: 12 };
    const s = newState(p, newDesc(p, randomNew("target")).desc);
    expect(netslideGame.statusbarText?.(s, newUi(s))).toContain("(target 12)");
  });
});

/* ----------------------------------------------------------------------
 * Input.
 */

/** The pixel at the centre of a gutter cell: `(-1, y)` is the gutter beside row
 * `y` on the left, `(w, y)` the one on the right, and so on around the ring. */
function gutterPoint(cx: number, cy: number) {
  const ts = PREFERRED_TILE_SIZE;
  const b = Math.floor((3 * ts) / 4) + 1; // BORDER, NARROW_BORDERS variant
  return { x: b + cx * ts + ts / 2, y: b + cy * ts + ts / 2 };
}

describe("netslide input", () => {
  const s = newState(EASY_5x5, newDesc(EASY_5x5, randomNew("input")).desc);

  it("maps each of the four gutters to the slide its arrow shows", () => {
    const ui = newUi(s);
    const click = (cx: number, cy: number, button = LEFT_BUTTON) =>
      netslideGame.interpretMove(s, ui, null, gutterPoint(cx, cy), button);

    expect(click(-1, 0)).toEqual({ type: "slide", axis: "row", index: 0, dir: +1 });
    expect(click(s.w, 0)).toEqual({ type: "slide", axis: "row", index: 0, dir: -1 });
    expect(click(0, -1)).toEqual({ type: "slide", axis: "col", index: 0, dir: +1 });
    expect(click(0, s.h)).toEqual({ type: "slide", axis: "col", index: 0, dir: -1 });
  });

  it("reverses the slide on the right button", () => {
    const ui = newUi(s);
    const at = (button: number) =>
      netslideGame.interpretMove(s, ui, null, gutterPoint(-1, 0), button);
    expect(at(LEFT_BUTTON)).toEqual({ type: "slide", axis: "row", index: 0, dir: +1 });
    expect(at(RIGHT_BUTTON)).toEqual({ type: "slide", axis: "row", index: 0, dir: -1 });
  });

  it("refuses the centre row and column, which cannot be slid", () => {
    const ui = newUi(s);
    const click = (cx: number, cy: number) =>
      netslideGame.interpretMove(s, ui, null, gutterPoint(cx, cy), LEFT_BUTTON);
    expect(click(-1, s.cy)).toBeNull();
    expect(click(s.w, s.cy)).toBeNull();
    expect(click(s.cx, -1)).toBeNull();
    expect(click(s.cx, s.h)).toBeNull();
  });

  it("refuses a click on the board itself", () => {
    const ui = newUi(s);
    expect(
      netslideGame.interpretMove(s, ui, null, gutterPoint(1, 1), LEFT_BUTTON),
    ).toBeNull();
  });

  it("walks the cursor round the ring, never stopping on an un-slidable line", () => {
    const ui = newUi(s);
    expect(ui.curVisible).toBe(false);

    // Walk further than one full circuit, so every arrow position is visited.
    for (let i = 0; i < 2 * (s.w + s.h) + 3; i++) {
      netslideGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_RIGHT);
      expect(ui.curVisible).toBe(true);
      // Never parked beside the centre column or the centre row...
      expect(ui.curX === s.cx && ui.curY >= 0 && ui.curY < s.h).toBe(false);
      expect(ui.curY === s.cy && ui.curX >= 0 && ui.curX < s.w).toBe(false);
      // ...and never off the ring.
      expect(() => c2pos(s.w, s.h, ui.curX, ui.curY)).not.toThrow();
    }
  });

  it("select slides the line the cursor is on", () => {
    const ui = newUi(s);
    netslideGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_RIGHT);
    expect(
      netslideGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_SELECT),
    ).toMatchObject({ type: "slide" });
  });

  it("a select with no cursor showing only reveals the cursor", () => {
    const ui = newUi(s);
    const move = netslideGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_SELECT);
    expect(ui.curVisible).toBe(true);
    expect(move).not.toMatchObject({ type: "slide" });
  });

  it("the ring cursor's position ↔ index mapping round-trips", () => {
    for (let pos = 0; pos < 2 * (s.w + s.h); pos++) {
      const { cx, cy } = pos2c(s.w, s.h, pos);
      expect(c2pos(s.w, s.h, cx, cy)).toBe(pos);
    }
  });
});

/* ----------------------------------------------------------------------
 * Moves + completion.
 */

describe("netslide play", () => {
  const fresh = () => newState(EASY_5x5, newDesc(EASY_5x5, randomNew("play")).desc);

  it("a slide is undone by the opposite slide", () => {
    const s = fresh();
    const slid = netslideGame.executeMove(s, {
      type: "slide",
      axis: "row",
      index: 0,
      dir: +1,
    });
    expect([...slid.tiles]).not.toEqual([...s.tiles]);

    const back = netslideGame.executeMove(slid, {
      type: "slide",
      axis: "row",
      index: 0,
      dir: -1,
    });
    expect([...back.tiles]).toEqual([...s.tiles]);
    expect(back.moveCount).toBe(2); // playing the reverse still costs a move
  });

  it("executeMove is pure — the source state is untouched", () => {
    const s = fresh();
    const before = [...s.tiles];
    netslideGame.executeMove(s, { type: "slide", axis: "col", index: 0, dir: +1 });
    expect([...s.tiles]).toEqual(before);
  });

  it("records the line that moved, for the animation", () => {
    const s = fresh();
    const row = netslideGame.executeMove(s, {
      type: "slide",
      axis: "row",
      index: 3,
      dir: -1,
    });
    expect(row).toMatchObject({ lastMoveRow: 3, lastMoveCol: -1, lastMoveDir: -1 });

    const col = netslideGame.executeMove(s, {
      type: "slide",
      axis: "col",
      index: 1,
      dir: +1,
    });
    expect(col).toMatchObject({ lastMoveRow: -1, lastMoveCol: 1, lastMoveDir: +1 });
  });

  it("completes exactly when every tile is powered", () => {
    const { desc, aux } = newDesc(EASY_5x5, randomNew("complete"));
    const s = newState(EASY_5x5, desc);
    expect(netslideGame.status(s)).toBe("ongoing");

    const solved = netslideGame.executeMove(s, {
      type: "solve",
      tiles: [...hexGrid(aux)],
    });
    expect(netslideGame.status(solved)).toBe("solved");
    expect(computeActive(solved, -1, -1).every((a) => a === ACTIVE)).toBe(true);
  });

  it("a line in motion is unpowered, so the highlight can't leap across it", () => {
    const { desc, aux } = newDesc(EASY_5x5, randomNew("moving"));
    const solved = { ...newState(EASY_5x5, desc), tiles: hexGrid(aux) };

    // On the finished board every tile is powered...
    expect(computeActive(solved, -1, -1).every((a) => a === ACTIVE)).toBe(true);
    // ...but with row 0 in flight, none of row 0 is.
    const moving = computeActive(solved, 0, -1);
    for (let x = 0; x < solved.w; x++) expect(moving[x]).toBe(0);
  });
});

/* ----------------------------------------------------------------------
 * Solve + save, through a real Midend (that is where the aux threading and the
 * save codec live — a direct call to `game.solve` would pass while the shipped
 * Solve was a no-op; playbook §3.6).
 */

/** Drive a midend and keep its notifications, so the status bar is observable. */
function driven(id: string) {
  const notes: ChangeNotification[] = [];
  const me = new Midend(netslideGame);
  me.setCallbacks(
    (n) => notes.push(n),
    () => {},
  );
  expect(me.newGameFromId(id)).toBeUndefined();
  const statusBar = () =>
    [...notes]
      .reverse()
      .find(
        (n): n is Extract<ChangeNotification, { type: "status-bar-change" }> =>
          n.type === "status-bar-change",
      )?.statusBarText ?? "";
  return { me, statusBar };
}

describe("netslide solve and save", () => {
  it("solves a freshly generated game", () => {
    const { me, statusBar } = driven("5x5b1#solve-seed");
    expect(statusBar()).toContain("Active:");
    expect(me.solve()).toBeUndefined();
    // Upstream reports moves-since-auto-solve rather than a completion once the
    // solver has been used.
    expect(statusBar()).toContain("Moves since auto-solve:");
    expect(statusBar()).toContain("Active: 25/25");
  });

  it("solves a game built from a descriptive id, which carries no aux", () => {
    // Upstream gives up here, and so did this port: a `params:desc` id — what a
    // shared link or a bookmark hands you — has no `aux`, and Netslide has no
    // solver. The finished grid is recovered from the board itself instead
    // (`reconstruct.ts`), so Solve works on any board a player can be looking at.
    // Owner-reported against `?id=3x3:52h9hbd4h4v34`.
    const { desc } = newDesc(EASY_5x5, randomNew("no-aux"));
    const { me, statusBar } = driven(`5x5b1:${desc}`);
    expect(me.solve()).toBeUndefined();
    expect(statusBar()).toContain("Active: 25/25");
  });

  it("round-trips a game with progress through save/load", () => {
    const { me, statusBar } = driven("5x5b1#save-seed");
    me.playMoves([
      { type: "slide", axis: "row", index: 0, dir: +1 },
      { type: "slide", axis: "col", index: 4, dir: -1 },
    ]);
    const saved = me.saveGame();
    expect(statusBar()).toContain("Moves: 2");

    const me2 = new Midend(netslideGame);
    me2.setCallbacks(
      () => {},
      () => {},
    );
    expect(me2.loadGame(saved)).toBeUndefined();

    // The restored board must *draw* identically, not merely report the same
    // move count. The playing midend still has the last slide's animation armed,
    // so run its clock out first — a freshly loaded game has nothing in flight.
    me.timer(10);

    const render = (m: typeof me) => {
      const rec = new RecordingDrawing(netslideGame.colours([1, 1, 1]));
      m.redraw(rec);
      return rec.ops;
    };
    expect(render(me2)).toEqual(render(me));
  });
});

/* ----------------------------------------------------------------------
 * Rendering (tier 2.5).
 */

describe("netslide rendering", () => {
  it("draws the opener: powered and unpowered wires, and the barriers", () => {
    const { recording } = renderScenario({
      game: netslideGame,
      id: "5x5b1#render-seed",
    });
    const { ops } = recording;

    // Wires are lines. The centre tile is powered by definition, so some wire is
    // always drawn in the powered colour — and on a scrambled board, most are
    // not.
    expect(ops.some((o) => o.op === "line" && o.colour === COL_POWERED)).toBe(true);
    expect(ops.some((o) => o.op === "line" && o.colour === COL_WIRE)).toBe(true);

    // A barrier-probability-1 non-wrapping board is walled all the way round.
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_BARRIER)).toBe(true);

    expect(ops).toMatchSnapshot();
  });

  it("draws the sliding row off-grid mid-animation, and settled once it lands", () => {
    const moves = [{ type: "slide", axis: "row", index: 0, dir: +1 } as const];
    const id = "5x5b1#anim-seed";

    // Without `settle` the capture is animation frame *zero* — which for a slide
    // is the maximum displacement, the pre-move grid still on screen (playbook
    // §5). `settle` runs the clock out to the landed frame.
    const mid = renderScenario({ game: netslideGame, id, moves });
    const settled = renderScenario({ game: netslideGame, id, moves, settle: true });

    // Every tile is blanked with a border-coloured (ts+1)² rect before its wires
    // go on, so those rects' x-origins are exactly where the tiles are drawn.
    const ts = PREFERRED_TILE_SIZE;
    const isTileBlank = (o: DrawOp): o is Extract<DrawOp, { op: "rect" }> =>
      o.op === "rect" && o.colour === COL_BORDER && o.w === ts + 1 && o.h === ts + 1;
    const tileOrigins = (r: typeof mid) =>
      new Set(r.recording.ops.filter(isTileBlank).map((o) => o.x));

    const b = Math.floor((3 * ts) / 4) + 1;
    // At rest, tiles sit only on the five grid columns.
    expect([...tileOrigins(settled)].sort((p, q) => p - q)).toEqual([
      b,
      b + ts,
      b + 2 * ts,
      b + 3 * ts,
      b + 4 * ts,
    ]);
    // Mid-slide, row 0 is displaced a whole tile to the right, so a tile is drawn
    // at a sixth origin — one tile past the grid's last column, where nothing is
    // ever drawn at rest. (It is the wrapping tile's twin that lands back at `b`.)
    expect(tileOrigins(mid).has(b + 5 * ts)).toBe(true);
    expect(tileOrigins(settled).has(b + 5 * ts)).toBe(false);
  });

  it("celebrates a real completion, but not one the solver handed over", () => {
    const { desc, aux } = newDesc(EASY_5x5, randomNew("flash"));
    const s = newState(EASY_5x5, desc);
    const ui = newUi(s);

    const wonByPlaying = { ...s, tiles: hexGrid(aux), completed: 9, moveCount: 9 };
    expect(netslideGame.flashLength?.(s, wonByPlaying, 1, ui)).toBeGreaterThan(0);

    const wonBySolving = { ...wonByPlaying, usedSolve: true };
    expect(netslideGame.flashLength?.(s, wonBySolving, 1, ui)).toBe(0);
  });

  it("paints the flash outward from the centre, a ring at a time", () => {
    // Reach a genuinely-won board *by playing*: scramble the solution with one
    // slide, then play its reverse. (A Solve move is deliberately not
    // celebrated, so it could never drive this frame.)
    const { desc, aux } = newDesc(EASY_5x5, randomNew("flash-frame"));
    const solution = { ...newState(EASY_5x5, desc), tiles: hexGrid(aux) };
    const scrambled = netslideGame.executeMove(solution, {
      type: "slide",
      axis: "row",
      index: 0,
      dir: +1,
    });
    const won = netslideGame.executeMove(scrambled, {
      type: "slide",
      axis: "row",
      index: 0,
      dir: -1,
    });
    expect(netslideGame.status(won)).toBe("solved");

    const flashingTilesAt = (flashTime: number) => {
      const ds = netslideGame.newDrawState?.(won);
      if (!ds) throw new Error("netslide has a draw state");
      netslideGame.setTileSize?.(ds, PREFERRED_TILE_SIZE);
      const rec = new RecordingDrawing(netslideGame.colours([1, 1, 1]));
      netslideGame.redraw?.(rec, ds, null, won, 1, newUi(won), 0, flashTime);
      return rec.ops.filter((o) => o.op === "rect" && o.colour === COL_FLASHING).length;
    };

    // Each tile blinks off-on-off-on over the four frames starting at its
    // Chebyshev distance from the centre, so the celebration reads as a ripple
    // spreading outward. On this 5×5 that means: frame 0 nothing lit yet, frame
    // 1 the centre tile alone, frame 2 the ring of 8 around it (the centre is
    // back in its off phase).
    expect(flashingTilesAt(FLASH_FRAME * 0.5)).toBe(0);
    expect(flashingTilesAt(FLASH_FRAME * 1.5)).toBe(1);
    expect(flashingTilesAt(FLASH_FRAME * 2.5)).toBe(8);
  });
});
