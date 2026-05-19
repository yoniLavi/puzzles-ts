import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../puzzle/types.ts";
import { type FakeDrawState, fakeGame, LEFT_BUTTON } from "./fake-game.ts";
import type { GameDrawing } from "./game.ts";
import { Midend } from "./midend.ts";

/** Recording fake `GameDrawing` for engine-level redraw assertions —
 * mirrors `src/native/games/flip/flip.test.ts`'s helper. */
function recordingDrawing() {
  const ops: Array<{
    op: string;
    colour?: number;
    rect?: { x: number; y: number; w: number; h: number };
  }> = [];
  const dr: GameDrawing = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: (rect) => ops.push({ op: "drawUpdate", rect }),
    clip: () => ops.push({ op: "clip" }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (rect, colour) => ops.push({ op: "drawRect", rect, colour }),
    drawLine: (_a, _b, colour) => ops.push({ op: "drawLine", colour }),
    drawPolygon: (_p, colour) => ops.push({ op: "drawPolygon", colour }),
    drawCircle: (_p, _r, colour) => ops.push({ op: "drawCircle", colour }),
    drawText: (_p, _o, colour) => ops.push({ op: "drawText", colour }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  };
  return { dr, ops };
}

/** Drive a fresh midend and record every notification it emits. */
function harness() {
  const notes: ChangeNotification[] = [];
  let timerActive = false;
  let redraws = 0;
  const m = new Midend(fakeGame);
  m.setCallbacks(
    (n) => notes.push(n),
    (active) => {
      timerActive = active;
    },
    () => {
      redraws++;
    },
  );
  const last = <T extends ChangeNotification["type"]>(type: T) =>
    [...notes].reverse().find((n) => n.type === type);
  const state = () =>
    last("game-state-change") as
      | Extract<ChangeNotification, { type: "game-state-change" }>
      | undefined;
  return {
    m,
    notes,
    state,
    timerActive: () => timerActive,
    redraws: () => redraws,
    last,
  };
}

describe("Midend lifecycle + notifications", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    h.m.newGame();
  });

  it("newGame emits id, params, state and status-bar notifications", () => {
    const types = new Set(h.notes.map((n) => n.type));
    expect(types).toEqual(
      new Set([
        "game-id-change",
        "params-change",
        "game-state-change",
        "status-bar-change",
      ]),
    );
  });

  it("a fresh game is at move 0, ongoing, no undo/redo", () => {
    const s = h.state();
    expect(s).toMatchObject({
      status: "ongoing",
      currentMove: 0,
      totalMoves: 0,
      canUndo: false,
      canRedo: false,
    });
  });

  it("game id is the reproducible params:desc form with a seed", () => {
    const id = h.last("game-id-change") as Extract<
      ChangeNotification,
      { type: "game-id-change" }
    >;
    expect(id.currentGameId).toMatch(/^t3:g3-\d+$/);
    expect(id.randomSeed).toMatch(/^t3#[0-9a-f]+$/);
  });
});

describe("Midend repaints on every transition (regression: TS games rendered no moves)", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    h.m.newGame();
  });

  it("a processed move requests a redraw", () => {
    const before = h.redraws();
    expect(h.m.processInput(0, 0, LEFT_BUTTON)).toBe(true);
    expect(h.redraws()).toBeGreaterThan(before);
  });

  it("undo, redo and restart each request a redraw", () => {
    h.m.processInput(0, 0, LEFT_BUTTON);
    let before = h.redraws();
    h.m.undo();
    expect(h.redraws()).toBeGreaterThan(before);
    before = h.redraws();
    h.m.redo();
    expect(h.redraws()).toBeGreaterThan(before);
    before = h.redraws();
    h.m.restartGame();
    expect(h.redraws()).toBeGreaterThan(before);
  });

  it("a non-animated game does not start the animation timer", () => {
    // fakeGame has no animLength/flashLength ⇒ move paints once,
    // no rAF loop requested.
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(h.timerActive()).toBe(false);
  });
});

describe("Midend moves / undo / redo", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    h.m.newGame();
  });

  it("a left click is interpreted as a move and advances history", () => {
    expect(h.m.processInput(0, 0, LEFT_BUTTON)).toBe(true);
    expect(h.state()).toMatchObject({
      currentMove: 1,
      totalMoves: 1,
      canUndo: true,
      canRedo: false,
    });
    expect(h.m.formatAsText()).toBe("count=1");
  });

  it("a non-move input returns false and changes nothing", () => {
    expect(h.m.processInput(0, 0, 0x9999)).toBe(false);
    expect(h.state()).toMatchObject({ currentMove: 0, totalMoves: 0 });
  });

  it("undo after a move restores the prior state (property)", () => {
    for (let i = 0; i < 5; i++) {
      const before = h.m.formatAsText();
      h.m.processInput(0, 0, LEFT_BUTTON);
      h.m.undo();
      expect(h.m.formatAsText()).toBe(before);
      h.m.redo(); // continue from where we were
    }
    expect(h.m.formatAsText()).toBe("count=5");
  });

  it("a move after an undo truncates the redo branch", () => {
    h.m.processInput(0, 0, LEFT_BUTTON); // count=1
    h.m.processInput(0, 0, LEFT_BUTTON); // count=2
    h.m.undo(); // back to count=1, redo available
    expect(h.state()).toMatchObject({ currentMove: 1, canRedo: true });
    h.m.processInput(0, 0, LEFT_BUTTON); // new move from count=1
    expect(h.m.formatAsText()).toBe("count=2");
    expect(h.state()).toMatchObject({
      currentMove: 2,
      totalMoves: 2,
      canRedo: false,
    });
  });

  it("undo/redo at the ends are no-ops", () => {
    h.m.undo();
    expect(h.state()).toMatchObject({ currentMove: 0 });
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.redo();
    expect(h.state()).toMatchObject({ currentMove: 1, totalMoves: 1 });
  });

  it("restartGame returns to move 0 and clears redo", () => {
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.restartGame();
    expect(h.state()).toMatchObject({
      currentMove: 0,
      totalMoves: 0,
      canUndo: false,
      canRedo: false,
    });
    expect(h.m.formatAsText()).toBe("count=0");
  });
});

describe("Midend status + solve", () => {
  it("status transitions ongoing → solved by reaching the target", () => {
    const h = harness();
    h.m.newGame(); // default target 3
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(h.state()?.status).toBe("ongoing");
    h.m.processInput(0, 0, LEFT_BUTTON); // count=3 == target
    expect(h.state()?.status).toBe("solved");
  });

  it("using the solver yields solved-with-help", () => {
    const h = harness();
    h.m.newGame();
    expect(h.m.solve()).toBeUndefined();
    expect(h.state()?.status).toBe("solved-with-help");
  });
});

describe("Midend params + presets", () => {
  it("getPresets flattens the submenu with encoded params", () => {
    const m = new Midend(fakeGame);
    expect(m.getPresets()).toEqual([
      { title: "Easy", params: "t2" },
      { title: "Hard", params: "t9" },
    ]);
  });

  it("setParams validates and rejects bad params", () => {
    const m = new Midend(fakeGame);
    expect(m.setParams("t5")).toBeUndefined();
    expect(m.getParams()).toBe("t5");
    expect(m.setParams("garbage")).toMatch(/Invalid parameters/);
    expect(m.setParams("t0")).toBe("target must be positive");
  });

  it("newGameFromId rebuilds from a descriptive id", () => {
    const h = harness();
    h.m.newGame();
    expect(h.m.newGameFromId("t4:g4-7")).toBeUndefined();
    expect(h.m.getParams()).toBe("t4");
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(h.m.formatAsText()).toBe("count=1");
  });

  it("newGameFromId rejects a malformed id", () => {
    const m = new Midend(fakeGame);
    expect(m.newGameFromId("nope")).toMatch(/Invalid game ID/);
    expect(m.newGameFromId("t2:bad!")).toBe("bad desc");
  });
});

describe("Midend timer", () => {
  it("an untimed game never activates the timer and timer() is inert", () => {
    const h = harness();
    h.m.newGame();
    h.m.timer(1.5);
    expect(h.timerActive()).toBe(false);
    // No status-bar churn from the inert tick beyond the newGame ones.
    expect(h.m.formatAsText()).toBe("count=0");
  });
});

describe("Midend size + first-draw (regression: black canvas on reshape)", () => {
  function midend() {
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    return m;
  }

  it("the very first redraw fills the window with palette index 0", () => {
    const m = midend();
    m.size({ w: 200, h: 200 }, true, 1);
    const { dr, ops } = recordingDrawing();
    m.redraw(dr);
    // The first op after startDraw should be a full-window background
    // fill (colour 0). winSize = computeSize(target=3, tile=10).
    const bg = ops.find((o) => o.op === "drawRect" && o.colour === 0);
    expect(bg?.rect).toEqual({ x: 0, y: 0, w: 30, h: 10 });
    // And a full-window drawUpdate fires after.
    const updates = ops.filter((o) => o.op === "drawUpdate");
    expect(updates.at(-1)?.rect).toEqual({ x: 0, y: 0, w: 30, h: 10 });
  });

  it("size() after a prior size() recreates the drawstate (different instance)", () => {
    const m = midend();
    m.size({ w: 200, h: 200 }, true, 1);
    // Drive a paint so the drawstate is "in use".
    const a = recordingDrawing();
    m.redraw(a.dr);
    // FakeDrawState's redrawCalls counter persists across redraws of
    // the same drawstate. After a reshape, the next redraw should
    // see a *fresh* drawstate (counter starts at 0).
    const stateAfterFirst = (
      m as unknown as { drawState: FakeDrawState }
    ).drawState;
    expect(stateAfterFirst.redrawCalls).toBeGreaterThan(0);
    const oldInstance = stateAfterFirst.instance;

    m.size({ w: 400, h: 400 }, true, 1); // re-size
    const stateAfterResize = (
      m as unknown as { drawState: FakeDrawState }
    ).drawState;
    expect(stateAfterResize.instance).not.toBe(oldInstance);
    expect(stateAfterResize.redrawCalls).toBe(0);
  });

  it("a second size() arms first-draw again so the next redraw refills the window", () => {
    const m = midend();
    m.size({ w: 200, h: 200 }, true, 1);
    const a = recordingDrawing();
    m.redraw(a.dr); // consumes the first-draw fill

    // A subsequent redraw without an intervening size() does NOT
    // refill (cache-friendly redraw, the usual case in midend.c).
    const b = recordingDrawing();
    m.redraw(b.dr);
    expect(b.ops.some((o) => o.op === "drawRect" && o.colour === 0)).toBe(false);

    // But after a reshape, the fill is back.
    m.size({ w: 400, h: 400 }, true, 1);
    const c = recordingDrawing();
    m.redraw(c.dr);
    expect(c.ops.some((o) => o.op === "drawRect" && o.colour === 0)).toBe(true);
  });

});

describe("Midend forceRedraw (regression: stale per-tile cache after palette/font change)", () => {
  function midend() {
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    m.size({ w: 200, h: 200 }, true, 1);
    // Consume the initial first-draw fill.
    const { dr } = recordingDrawing();
    m.redraw(dr);
    return m;
  }

  it("recreates the drawstate", () => {
    const m = midend();
    const oldInstance = (m as unknown as { drawState: FakeDrawState }).drawState
      .instance;
    const { dr } = recordingDrawing();
    m.forceRedraw(dr);
    const newInstance = (m as unknown as { drawState: FakeDrawState }).drawState
      .instance;
    expect(newInstance).not.toBe(oldInstance);
  });

  it("paints the full-window background-fill rectangle as part of the redraw", () => {
    const m = midend();
    const { dr, ops } = recordingDrawing();
    m.forceRedraw(dr);
    const bg = ops.find((o) => o.op === "drawRect" && o.colour === 0);
    expect(bg?.rect).toEqual({ x: 0, y: 0, w: 30, h: 10 });
  });

  it("is a no-op without a game (defensive guard)", () => {
    const fresh = new Midend(fakeGame);
    fresh.setCallbacks(
      () => {},
      () => {},
    );
    const { dr, ops } = recordingDrawing();
    expect(() => fresh.forceRedraw(dr)).not.toThrow();
    expect(ops.filter((o) => o.op === "drawRect").length).toBe(0);
  });
});

describe("Midend startFrom no longer fires an early redraw (was racing the app's resize)", () => {
  it("newGame emits notifications but does NOT request a redraw", () => {
    const h = harness();
    h.m.newGame();
    // Before this fix, startFrom called requestRedraw(); now the app
    // drives the first paint after newGame through its reactive flow
    // (size → resizeDrawing → redraw). The notifications still fire
    // — that part is unchanged.
    expect(h.redraws()).toBe(0);
    const types = new Set(h.notes.map((n) => n.type));
    expect(types).toContain("game-id-change");
  });
});
