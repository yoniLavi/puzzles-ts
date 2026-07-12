/**
 * Behavioural tests for the Bridges port (tier 1 logic + tier 2.5 render).
 * The byte-match generator/solver differential lives in
 * `bridges-differential.test.ts`; this file covers the codec, the drag→move
 * input model, executeMove/solve/findMistakes, and a render smoke frame.
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
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newBridgesDesc } from "./generator.ts";
import { bridgesGame } from "./index.ts";
import { newDrawState, setTileSize } from "./render.ts";
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

const randomState = (seed: string) => randomNew(seed);

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

  it("finds orthogonal neighbours across empty cells", () => {
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
  const centre = (cell: number) => cell * ts + b + Math.trunc(ts / 2);

  it("left-drag between adjacent islands emits an L bridge move", () => {
    const s = twoIslands();
    const ui = bridgesGame.newUi(s);
    const ds = newDrawState(s);
    setTileSize(ds, ts);

    // Press on island (0,0), drag toward (2,0), release.
    expect(
      bridgesGame.interpretMove(s, ui, ds, { x: centre(0), y: centre(0) }, LEFT_BUTTON),
    ).toBe(UI_UPDATE);
    expect(
      bridgesGame.interpretMove(s, ui, ds, { x: centre(2), y: centre(0) }, LEFT_DRAG),
    ).toBe(UI_UPDATE);
    const move = bridgesGame.interpretMove(
      s,
      ui,
      ds,
      { x: centre(2), y: centre(0) },
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

    bridgesGame.interpretMove(s, ui, ds, { x: centre(0), y: centre(0) }, RIGHT_BUTTON);
    bridgesGame.interpretMove(s, ui, ds, { x: centre(2), y: centre(0) }, RIGHT_DRAG);
    const nmove = bridgesGame.interpretMove(
      s,
      ui,
      ds,
      { x: centre(2), y: centre(0) },
      RIGHT_RELEASE,
    ) as BridgesMove;
    expect(nmove.ops).toEqual([{ op: "N", x1: 0, y1: 0, x2: 2, y2: 0 }]);
    const s2 = bridgesGame.executeMove(s, nmove);
    expect(s2.gridAt(1, 0) & G_NOLINEH).toBeTruthy();

    // A left click on an island with no drag toggles its mark.
    const ui2 = bridgesGame.newUi(s);
    bridgesGame.interpretMove(s, ui2, ds, { x: centre(0), y: centre(0) }, LEFT_BUTTON);
    const mmove = bridgesGame.interpretMove(
      s,
      ui2,
      ds,
      { x: centre(0), y: centre(0) },
      LEFT_RELEASE,
    ) as BridgesMove;
    expect(mmove.ops).toEqual([{ op: "M", x: 0, y: 0 }]);
    const s3 = bridgesGame.executeMove(s, mmove);
    expect(s3.gridAt(0, 0) & G_MARK).toBeTruthy();
  });
});

describe("bridges solve + findMistakes", () => {
  const genState = (difficulty: number, seed: string) => {
    const p = { ...BRIDGES_PRESETS[0], difficulty };
    const { desc } = newBridgesDesc(p, randomState(seed));
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

describe("bridges render smoke (tier 2.5)", () => {
  it("redraws a generated board: background + island circles + a clue", () => {
    const p = BRIDGES_PRESETS[0];
    const { desc } = newBridgesDesc(p, randomState("bridges-render"));
    const id = `${encodeParams(p, true)}:${desc}`;
    const { recording } = renderScenario({ game: bridgesGame, id });
    // Background fill, island circles, and at least one clue number.
    expect(recording.ops.some((o) => o.op === "rect")).toBe(true);
    expect(recording.ops.some((o) => o.op === "circle")).toBe(true);
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
  });
});

// A Midend-driven save round-trip (state survives serialise/parse).
describe("bridges save round-trip", () => {
  it("saveGame -> loadGame restores an equivalent game", () => {
    const p = BRIDGES_PRESETS[0];
    const { desc } = newBridgesDesc(p, randomState("bridges-save"));
    const id = `${encodeParams(p, true)}:${desc}`;
    const me = new Midend(bridgesGame);
    expect(me.newGameFromId(id)).toBeUndefined();
    const saved = me.saveGame();
    const me2 = new Midend(bridgesGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText?.()).toBe(me.formatAsText?.());
  });
});
