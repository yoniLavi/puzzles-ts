/**
 * Behavioral tests for Bridges (tier 1 logic + tier 2.5 render). The byte-match
 * generator/solver differential is `bridges-differential.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import {
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { newBridgesDesc } from "./generator.ts";
import { bridgesGame } from "./index.ts";
import { COL_MARK, newDrawState, setTileSize } from "./render.ts";
import {
  BRIDGES_PRESETS,
  type BridgesMove,
  type BridgesOp,
  decodeParams,
  encodeGame,
  encodeParams,
  G_LINEH,
  G_LINEV,
  G_MARK,
  G_NOLINEH,
  newStateFromDesc,
  validateDesc,
  validateParams,
} from "./state.ts";

describe("bridges params codec", () => {
  it("round-trips every preset in full form", () => {
    for (const p of BRIDGES_PRESETS) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("encodes the full form as C does (7x7 hard)", () => {
    expect(encodeParams(BRIDGES_PRESETS[2], true)).toBe("7x7i30e10m2d2");
  });

  it("non-full form carries maxb and the loop flag", () => {
    const p = { ...BRIDGES_PRESETS[0], allowloops: false };
    expect(encodeParams(p, false)).toBe("7x7m2L");
    expect(decodeParams("7x7m2L").allowloops).toBe(false);
  });

  it("rejects a too-small grid", () => {
    expect(validateParams({ ...BRIDGES_PRESETS[0], w: 2, h: 2 }, true)).not.toBeNull();
    expect(validateParams(BRIDGES_PRESETS[0], true)).toBeNull();
  });
});

describe("bridges desc codec", () => {
  const p3 = { ...BRIDGES_PRESETS[0], w: 3, h: 3 };
  const desc = "1a2c2a1"; // (0,0)=1 (2,0)=2 (0,2)=2 (2,2)=1

  it("parses a desc and re-encodes it identically", () => {
    const state = newStateFromDesc(p3, desc);
    expect(state.islands.length).toBe(4);
    expect(encodeGame(state)).toBe(desc);
  });

  it("finds orthogonal neighbors across empty cells", () => {
    const state = newStateFromDesc(p3, desc);
    expect(state.islandAt(0, 0)?.nislands).toBe(2);
  });

  it("validateDesc accepts a good desc and rejects overruns / lone islands", () => {
    expect(validateDesc(p3, desc)).toBeNull();
    expect(validateDesc(p3, "zzz")).not.toBeNull();
    expect(validateDesc(p3, "1i")).not.toBeNull();
  });
});

describe("bridges input model (drag → move)", () => {
  // Two islands in the top row of a 3x3 board, empty elsewhere.
  const p3 = { ...BRIDGES_PRESETS[0], w: 3, h: 3 };
  const twoIslands = () => newStateFromDesc(p3, "1a1f");
  const ts = 24;
  const b = 4; // border(24)
  const center = (cell: number) => cell * ts + b + Math.trunc(ts / 2);

  it("left-drag between adjacent islands emits an L bridge move", () => {
    const s = twoIslands();
    const ui = bridgesGame.newUi(s);
    const ds = newDrawState(s);
    setTileSize(ds, ts);

    // Press on island (0,0), drag toward (2,0), release.
    expect(
      bridgesGame.interpretMove(s, ui, ds, { x: center(0), y: center(0) }, LEFT_BUTTON),
    ).toBe(UI_UPDATE);
    expect(
      bridgesGame.interpretMove(s, ui, ds, { x: center(2), y: center(0) }, LEFT_DRAG),
    ).toBe(UI_UPDATE);
    const move = bridgesGame.interpretMove(
      s,
      ui,
      ds,
      { x: center(2), y: center(0) },
      LEFT_RELEASE,
    ) as BridgesMove;
    expect(move.ops).toEqual([{ op: "L", x1: 0, y1: 0, x2: 2, y2: 0, n: 1 }]);

    const s2 = bridgesGame.executeMove(s, move);
    expect(s2.gridCount(1, 0, G_LINEH)).toBe(1);
  });

  it("right-drag lays a no-line, and a plain click toggles the island mark", () => {
    const s = twoIslands();
    const ui = bridgesGame.newUi(s);
    const ds = newDrawState(s);
    setTileSize(ds, ts);

    bridgesGame.interpretMove(s, ui, ds, { x: center(0), y: center(0) }, RIGHT_BUTTON);
    bridgesGame.interpretMove(s, ui, ds, { x: center(2), y: center(0) }, RIGHT_DRAG);
    const nmove = bridgesGame.interpretMove(
      s,
      ui,
      ds,
      { x: center(2), y: center(0) },
      RIGHT_RELEASE,
    ) as BridgesMove;
    expect(nmove.ops).toEqual([{ op: "N", x1: 0, y1: 0, x2: 2, y2: 0 }]);
    const s2 = bridgesGame.executeMove(s, nmove);
    expect(s2.gridAt(1, 0) & G_NOLINEH).toBeTruthy();

    // A left click on an island with no drag toggles its mark.
    const ui2 = bridgesGame.newUi(s);
    bridgesGame.interpretMove(s, ui2, ds, { x: center(0), y: center(0) }, LEFT_BUTTON);
    const mmove = bridgesGame.interpretMove(
      s,
      ui2,
      ds,
      { x: center(0), y: center(0) },
      LEFT_RELEASE,
    ) as BridgesMove;
    expect(mmove.ops).toEqual([{ op: "M", x: 0, y: 0 }]);
    const s3 = bridgesGame.executeMove(s, mmove);
    expect(s3.gridAt(0, 0) & G_MARK).toBeTruthy();
  });

  // Both tests above press on island (0, 0), which is its own transpose — so
  // neither can see the drag source being stored x-for-y. Measured: swapping
  // the two coordinates the press writes passed all 72 bridges tests. The
  // board below puts its islands on the middle row instead, where (0, 1) and
  // (1, 0) are different cells and only one of them is an island.
  const middleRow = () => newStateFromDesc(p3, "c1a1c"); // islands (0,1), (2,1)

  it("stores the drag source the right way round on an asymmetric board", () => {
    const s = middleRow();
    const ui = bridgesGame.newUi(s);
    const ds = newDrawState(s);
    setTileSize(ds, ts);

    expect(
      bridgesGame.interpretMove(s, ui, ds, { x: center(0), y: center(1) }, LEFT_BUTTON),
    ).toBe(UI_UPDATE);
    bridgesGame.interpretMove(s, ui, ds, { x: center(2), y: center(1) }, LEFT_DRAG);
    const move = bridgesGame.interpretMove(
      s,
      ui,
      ds,
      { x: center(2), y: center(1) },
      LEFT_RELEASE,
    ) as BridgesMove;
    expect(move.ops).toEqual([{ op: "L", x1: 0, y1: 1, x2: 2, y2: 1, n: 1 }]);
  });

  it("a press on an empty square cancels rather than arming a drag", () => {
    // (1, 0) is empty on this board: a press there must leave nothing armed, or
    // the following drag would run from a square holding no island.
    const s = middleRow();
    const ui = bridgesGame.newUi(s);
    const ds = newDrawState(s);
    setTileSize(ds, ts);

    bridgesGame.interpretMove(s, ui, ds, { x: center(1), y: center(0) }, LEFT_BUTTON);
    // Nothing armed is the assertion: a later drag resolving to no island would
    // also emit no move, so checking only the move cannot tell the two apart.
    expect(ui.drag.live).toBe(false);
    expect(ui.drag.sx).toBe(-1);

    bridgesGame.interpretMove(s, ui, ds, { x: center(2), y: center(1) }, LEFT_DRAG);
    expect(ui.aiming).toBe(false);
    const move = bridgesGame.interpretMove(
      s,
      ui,
      ds,
      { x: center(2), y: center(1) },
      LEFT_RELEASE,
    );
    expect(move).not.toMatchObject({ ops: [{ op: "L" }] });
  });

  it("a press alone points at no island yet", () => {
    // The press anchors the source but must leave the far end unresolved:
    // `render` draws a drag line whenever there is a destination, so a far end
    // left sitting on the source would draw one from the island to itself.
    const s = middleRow();
    const ui = bridgesGame.newUi(s);
    const ds = newDrawState(s);
    setTileSize(ds, ts);

    bridgesGame.interpretMove(s, ui, ds, { x: center(0), y: center(1) }, LEFT_BUTTON);
    expect([ui.drag.sx, ui.drag.sy]).toEqual([0, 1]);
    expect([ui.drag.ex, ui.drag.ey]).toEqual([-1, -1]);
  });

  it("leaves nothing armed after a release", () => {
    // The engine cancels a live drag when the board changes under it, so a
    // drag still marked live after its own release would be canceled for no
    // reason — and, before that, a stray drag event could resume it.
    const s = middleRow();
    const ui = bridgesGame.newUi(s);
    const ds = newDrawState(s);
    setTileSize(ds, ts);

    bridgesGame.interpretMove(s, ui, ds, { x: center(0), y: center(1) }, LEFT_BUTTON);
    bridgesGame.interpretMove(s, ui, ds, { x: center(2), y: center(1) }, LEFT_DRAG);
    bridgesGame.interpretMove(s, ui, ds, { x: center(2), y: center(1) }, LEFT_RELEASE);
    expect(ui.aiming).toBe(false);
    expect(ui.drag.live).toBe(false);
    expect(ui.drag.sx).toBe(-1);
    expect(ui.drag.sy).toBe(-1);
  });
});

describe("bridges solve + findMistakes", () => {
  const genState = (difficulty: number, seed: string) => {
    const p = { ...BRIDGES_PRESETS[0], difficulty };
    const { desc } = newBridgesDesc(p, randomNew(seed));
    return { p, state: bridgesGame.newState(p, desc) };
  };

  it("solve() produces a move that completes a freshly generated board", () => {
    const { state } = genState(0, "bridges-solve-easy");
    const res = bridgesGame.solve?.(state, state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const solved = bridgesGame.executeMove(state, res.move);
    expect(bridgesGame.status(solved)).toBe("solved");
  });

  it("a fully solved board has no mistakes; an extra bridge is flagged", () => {
    const { state } = genState(0, "bridges-mistake-easy");
    const res = bridgesGame.solve?.(state, state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const solved = bridgesGame.executeMove(state, res.move);
    expect(bridgesGame.findMistakes?.(solved)).toEqual([]);

    // Over-bridge (n=2) every right/down span the unique solution uses exactly
    // once — that strictly exceeds the solution, so each must be flagged.
    const ops: BridgesOp[] = solved.islands.flatMap((is) =>
      is.points
        .filter(
          (pt) =>
            pt.off > 0 &&
            (pt.dx === 1 || pt.dy === 1) &&
            solved.gridCount(pt.x, pt.y, pt.dx ? G_LINEH : G_LINEV) === 1,
        )
        .map((pt) => ({
          op: "L" as const,
          x1: is.x,
          y1: is.y,
          x2: is.x + pt.off * pt.dx,
          y2: is.y + pt.off * pt.dy,
          n: 2,
        })),
    );
    if (ops.length === 0) return; // no single-bridge span to over-bridge; skip
    const over = bridgesGame.executeMove(state, { ops });
    const mistakes = bridgesGame.findMistakes?.(over) ?? [];
    expect(mistakes.length).toBeGreaterThan(0);
  });
});

describe("bridges auto-mark aid", () => {
  const p3 = { ...BRIDGES_PRESETS[0], w: 3, h: 3 };

  it("grays a satisfied island only when the pref is on, without locking it", () => {
    const s0 = newStateFromDesc(p3, "1a1f"); // two count-1 islands
    // One bridge satisfies both count-1 islands.
    const s1 = bridgesGame.executeMove(s0, {
      ops: [{ op: "L", x1: 0, y1: 0, x2: 2, y2: 0, n: 1 }],
    });
    const palette = bridgesGame.colors([0.9, 0.9, 0.9]);
    const markCircles = (autoMark: boolean) => {
      const ds = newDrawState(s1);
      setTileSize(ds, 24);
      const ui = { ...bridgesGame.newUi(s1), autoMark };
      const rec = new RecordingDrawing(palette);
      bridgesGame.redraw?.(rec, ds, null, s1, 0, ui, 0, 0);
      return rec.ops.filter((o) => o.op === "circle" && o.fill === COL_MARK).length;
    };

    expect(markCircles(true)).toBeGreaterThan(0); // satisfied islands grayed
    expect(markCircles(false)).toBe(0); // no auto-gray when the pref is off
    // Purely visual: the island is NOT actually marked/locked in the state.
    expect(s1.gridAt(0, 0) & G_MARK).toBeFalsy();
  });
});

describe("bridges render smoke (tier 2.5)", () => {
  it("redraws a generated board: background + island circles + a clue", () => {
    const p = BRIDGES_PRESETS[0];
    const { desc } = newBridgesDesc(p, randomNew("bridges-render"));
    const id = `${encodeParams(p, true)}:${desc}`;
    const { recording } = renderScenario({ game: bridgesGame, id });
    expect(recording.ops.some((o) => o.op === "rect")).toBe(true);
    expect(recording.ops.some((o) => o.op === "circle")).toBe(true);
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
  });
});

describe("bridges save round-trip", () => {
  it("saveGame -> loadGame restores an equivalent game", () => {
    const p = BRIDGES_PRESETS[0];
    const { desc } = newBridgesDesc(p, randomNew("bridges-save"));
    const id = `${encodeParams(p, true)}:${desc}`;
    const me = new Midend(bridgesGame);
    expect(me.newGameFromId(id)).toBeUndefined();
    const saved = me.saveGame();
    const me2 = new Midend(bridgesGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText?.()).toBe(me.formatAsText?.());
  });
});
