import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../puzzle/types.ts";
import { type FakeDrawState, fakeGame, LEFT_BUTTON } from "./fake-game.ts";
import type { Game, GameDrawing } from "./game.ts";
import { Midend } from "./midend.ts";
import type { SceneNode } from "./scene.ts";

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

describe("Midend.size is purely informational (regression: ResizeObserver flicker)", () => {
  // `puzzle-view.ts`'s `ResizeController` calls `puzzle.size()` on
  // every element-size change — including CSS transitions, mobile
  // address-bar show/hide, and other layout perturbations unrelated
  // to actual canvas resizing. Side-effecting `size()` (wiping the
  // per-tile cache + arming a full-canvas overpaint) caused a
  // user-visible "everything flickers" regression. Locking it in:
  // size() must not touch drawstate identity, and must not cause the
  // next `redraw` to emit a background fill.
  function midend() {
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    return m;
  }

  it("returns a sensible window size from computeSize(params, tile)", () => {
    const m = midend();
    const out = m.size({ w: 200, h: 200 }, true, 1);
    // fakeGame.computeSize: w = target*tile, h = tile.
    // At maxSize 200×200 the preferred tile (10) fits unscaled.
    expect(out).toEqual({ w: 30, h: 10 });
  });

  it("does NOT recreate the drawstate when called repeatedly at the same size", () => {
    const m = midend();
    m.size({ w: 200, h: 200 }, true, 1);
    const ds0 = (m as unknown as { drawState: FakeDrawState }).drawState;
    const instance0 = ds0.instance;

    m.size({ w: 200, h: 200 }, true, 1);
    m.size({ w: 200, h: 200 }, true, 1);
    const ds1 = (m as unknown as { drawState: FakeDrawState }).drawState;
    expect(ds1).toBe(ds0); // same object reference
    expect(ds1.instance).toBe(instance0);
  });

  it("does NOT recreate the drawstate even when called with a different size", () => {
    // The size() call is informational; the *actual* canvas
    // invalidation signal is `canvasCleared()` (fired by the
    // adapter from `resizeDrawing` only when the canvas backing
    // store really got reset).
    const m = midend();
    m.size({ w: 200, h: 200 }, true, 1);
    const instance0 = (m as unknown as { drawState: FakeDrawState }).drawState
      .instance;
    m.size({ w: 400, h: 400 }, true, 1);
    const instance1 = (m as unknown as { drawState: FakeDrawState }).drawState
      .instance;
    expect(instance1).toBe(instance0);
  });

  it("a redraw after only size() preserves the per-tile cache (no bg fill emitted)", () => {
    const m = midend();
    m.size({ w: 200, h: 200 }, true, 1);

    // First redraw: game's `!ds.started` branch paints its bg.
    const a = recordingDrawing();
    m.redraw(a.dr);
    expect(a.ops.some((o) => o.op === "drawRect" && o.colour === 0)).toBe(true);

    // Subsequent `size()` calls do NOT cause the next redraw to
    // re-emit a bg fill — the drawstate is preserved, so the game's
    // `!ds.started` branch doesn't fire again.
    m.size({ w: 200, h: 200 }, true, 1);
    m.size({ w: 400, h: 400 }, true, 1);
    const b = recordingDrawing();
    m.redraw(b.dr);
    expect(b.ops.some((o) => o.op === "drawRect" && o.colour === 0)).toBe(false);
  });
});

describe("Midend.canvasCleared invalidates the drawstate (the only real signal)", () => {
  // The adapter calls this from `resizeDrawing`, which is the only
  // path that actually clears the canvas backing store. The next
  // redraw must paint fresh via the game's `!ds.started` branch.
  function midend() {
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    m.size({ w: 200, h: 200 }, true, 1);
    const { dr } = recordingDrawing();
    m.redraw(dr); // consumes the game's first-paint bg fill
    return m;
  }

  it("recreates the drawstate (different instance)", () => {
    const m = midend();
    const before = (m as unknown as { drawState: FakeDrawState }).drawState
      .instance;
    m.canvasCleared();
    const after = (m as unknown as { drawState: FakeDrawState }).drawState
      .instance;
    expect(after).not.toBe(before);
  });

  it("the next redraw paints a fresh background (game's `!ds.started` branch fires)", () => {
    const m = midend();
    // Pre-clear: redraws are cache-suppressed for unchanged state.
    const pre = recordingDrawing();
    m.redraw(pre.dr);
    expect(pre.ops.some((o) => o.op === "drawRect" && o.colour === 0)).toBe(
      false,
    );

    m.canvasCleared();
    const post = recordingDrawing();
    m.redraw(post.dr);
    expect(post.ops.some((o) => o.op === "drawRect" && o.colour === 0)).toBe(
      true,
    );
  });

  it("is a no-op without a game (defensive guard)", () => {
    const fresh = new Midend(fakeGame);
    expect(() => fresh.canvasCleared()).not.toThrow();
  });
});

describe("Midend.forceRedraw is canvasCleared + redraw (palette/font replacement)", () => {
  function midend() {
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    m.size({ w: 200, h: 200 }, true, 1);
    const { dr } = recordingDrawing();
    m.redraw(dr);
    return m;
  }

  it("recreates the drawstate and immediately paints", () => {
    const m = midend();
    const before = (m as unknown as { drawState: FakeDrawState }).drawState
      .instance;
    const { dr, ops } = recordingDrawing();
    m.forceRedraw(dr);
    const after = (m as unknown as { drawState: FakeDrawState }).drawState
      .instance;
    expect(after).not.toBe(before);
    // game's bg paint runs as part of the forced redraw.
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 0)).toBe(true);
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

describe("Engine emits no pixels of its own (game owns the canvas content)", () => {
  // Locks in the directional cleanup: the framework reconciles
  // *when* to call `game.redraw` but never paints behind the game's
  // back. The whole-canvas bg fill that briefly lived in
  // `Midend.redraw` is gone — every draw op in a `redraw()` call
  // originates from `game.redraw`.
  it("Midend.redraw emits only startDraw/endDraw around game.redraw", () => {
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    m.size({ w: 200, h: 200 }, true, 1);

    // Replace fake game's `!ds.started` branch with one that paints
    // a distinctive marker, so we can prove every op in the
    // recording came from the game (not the engine).
    const ds = (m as unknown as { drawState: FakeDrawState }).drawState;
    ds.started = true; // pretend the game already did its first paint

    const { dr, ops } = recordingDrawing();
    m.redraw(dr);
    // The fake's redraw with `started=true` emits no draw ops — so
    // the only ops we see are `startDraw` and `endDraw` (the engine
    // frame brackets).
    const drawing = ops.filter(
      (o) => o.op !== "startDraw" && o.op !== "endDraw",
    );
    expect(drawing).toEqual([]);
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

// --- scene-graph dispatch ---------------------------------------------

interface SceneFakeState {
  count: number;
}
type SceneFakeMove = "inc";

/** A minimal `scene`-rendering fake: every `scene()` call returns a
 * single-rect `SceneNode[]` whose `fill` mirrors the state. Each call
 * is also counted on the fake itself (via a closure on the test) so
 * tests can prove which path the midend chose without inspecting the
 * recording GameDrawing. */
function makeSceneFake(opts: {
  withRedraw?: boolean;
  withScene?: boolean;
} = { withScene: true }) {
  const calls = { scene: 0, redraw: 0 };
  // Cache the rect node so referential equality short-circuits when
  // the state is unchanged (mirrors Flip's per-tile memoisation).
  let lastFor = -1;
  let lastNode: SceneNode | null = null;
  const game: Game<object, SceneFakeState, SceneFakeMove, null, null> = {
    id: "__scene_fake__",
    wantsStatusbar: false,
    isTimed: false,
    canSolve: false,
    canFormatAsText: false,
    preferredTileSize: 10,
    defaultParams: () => ({}),
    presets: () => ({ title: "root", params: {} }),
    encodeParams: () => "p",
    decodeParams: () => ({}),
    validateParams: () => null,
    newDesc: () => ({ desc: "d" }),
    validateDesc: () => null,
    newState: () => ({ count: 0 }),
    newUi: () => null,
    interpretMove: (_s, _ui, _ds, _p, button) =>
      button === LEFT_BUTTON ? "inc" : null,
    executeMove: (s) => ({ count: s.count + 1 }),
    status: () => "ongoing",
    colours: () => [
      [1, 1, 1],
      [0, 0, 0],
    ],
    computeSize: (_p, tile) => ({ w: tile, h: tile }),
  };
  if (opts.withScene !== false) {
    game.scene = (s) => {
      calls.scene += 1;
      if (s.count !== lastFor) {
        lastFor = s.count;
        lastNode = {
          kind: "rect",
          id: "sole",
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          fill: s.count,
        };
      }
      return [lastNode as SceneNode];
    };
  }
  if (opts.withRedraw) {
    game.redraw = () => {
      calls.redraw += 1;
    };
  }
  return { game, calls };
}

function recordingDrawingOps() {
  const ops: Array<{ op: string }> = [];
  const dr: GameDrawing = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: () => ops.push({ op: "drawUpdate" }),
    clip: () => ops.push({ op: "clip" }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: () => ops.push({ op: "drawRect" }),
    drawLine: () => ops.push({ op: "drawLine" }),
    drawPolygon: () => ops.push({ op: "drawPolygon" }),
    drawCircle: () => ops.push({ op: "drawCircle" }),
    drawText: () => ops.push({ op: "drawText" }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  };
  return { dr, ops };
}

describe("Midend dispatch: scene vs redraw", () => {
  it("a scene-defining game runs through the reconciler", () => {
    const { game, calls } = makeSceneFake();
    const m = new Midend(game);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    const { dr, ops } = recordingDrawingOps();
    m.redraw(dr);
    expect(calls.scene).toBe(1);
    expect(calls.redraw).toBe(0);
    // First frame ⇒ prev=null ⇒ reconciler paints the sole node.
    expect(ops.some((o) => o.op === "drawRect")).toBe(true);
    // The midend always frames the call with startDraw/endDraw.
    expect(ops[0].op).toBe("startDraw");
    expect(ops[ops.length - 1].op).toBe("endDraw");
  });

  it("a redraw-only game is unchanged (the reconciler is not invoked)", () => {
    // The existing `fakeGame` defines `redraw` and not `scene`; assert
    // that the redraw is what the midend calls and no reconciler ops
    // appear beyond what fakeGame.redraw itself emits.
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    const { dr, ops } = recordingDrawingOps();
    m.redraw(dr);
    // fakeGame's first-paint emits exactly one drawRect (its bg).
    expect(ops.filter((o) => o.op === "drawRect")).toHaveLength(1);
    // No clip/unclip — the reconciler never ran.
    expect(ops.some((o) => o.op === "clip")).toBe(false);
  });

  it("a game defining both scene and redraw uses scene", () => {
    const { game, calls } = makeSceneFake({ withScene: true, withRedraw: true });
    const m = new Midend(game);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    const { dr } = recordingDrawingOps();
    m.redraw(dr);
    expect(calls.scene).toBe(1);
    expect(calls.redraw).toBe(0);
  });

  it("emits zero draw ops on the second redraw of an unchanged scene", () => {
    const { game } = makeSceneFake();
    const m = new Midend(game);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    // First redraw paints everything.
    const first = recordingDrawingOps();
    m.redraw(first.dr);
    expect(first.ops.some((o) => o.op === "drawRect")).toBe(true);

    // Second redraw with the same state ⇒ scene returns the same
    // referentially-equal node ⇒ reconciler short-circuits. The only
    // ops the midend emits are its frame brackets.
    const second = recordingDrawingOps();
    m.redraw(second.dr);
    const drawing = second.ops.filter(
      (o) => o.op !== "startDraw" && o.op !== "endDraw",
    );
    expect(drawing).toEqual([]);
  });

  it("canvasCleared discards the previous-frame scene so the next redraw repaints all", () => {
    const { game } = makeSceneFake();
    const m = new Midend(game);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    m.size({ w: 100, h: 100 }, true, 1);
    // Paint once.
    const a = recordingDrawingOps();
    m.redraw(a.dr);
    expect(a.ops.some((o) => o.op === "drawRect")).toBe(true);

    // Clear the canvas (simulates the app's `resizeDrawing` invoking
    // the engine's `canvasCleared`). The next redraw should treat the
    // scene as if from scratch — every node painted.
    m.canvasCleared();
    const b = recordingDrawingOps();
    m.redraw(b.dr);
    expect(b.ops.some((o) => o.op === "drawRect")).toBe(true);
  });

  it("forceRedraw repaints the entire scene", () => {
    const { game } = makeSceneFake();
    const m = new Midend(game);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    const a = recordingDrawingOps();
    m.redraw(a.dr);
    // Same state, second paint: zero drawing ops.
    const b = recordingDrawingOps();
    m.redraw(b.dr);
    expect(
      b.ops.filter((o) => o.op !== "startDraw" && o.op !== "endDraw"),
    ).toEqual([]);

    // forceRedraw should clear lastScene and repaint:
    const c = recordingDrawingOps();
    m.forceRedraw(c.dr);
    expect(c.ops.some((o) => o.op === "drawRect")).toBe(true);
  });
});
