import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../puzzle/types.ts";
import {
  type FakeDrawState,
  fakeGame,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "./fake-game.ts";
import type { Game, GameDrawing } from "./game.ts";
import { UI_UPDATE } from "./game.ts";
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

/** A fake game that exposes the reference-aid hooks over a tiny mutable Ui,
 * for the midend's `hasReference`/`getReference`/`selectReference` paths. The
 * fake's other members ignore `ui`, so the widened Ui type is a test-only cast. */
function refGame(): typeof fakeGame {
  type RefUi = { pick: string | null };
  const g = {
    ...fakeGame,
    newUi: (): RefUi => ({ pick: null }),
    reference: (_s: unknown, ui: RefUi) => ({
      items: [
        { key: "a", label: "a", status: "outstanding" as const },
        { key: "b", label: "b", status: "placed" as const },
      ],
      selected: ui.pick,
    }),
    selectReference: (ui: RefUi, key: string | null) => {
      if (ui.pick === key) return false;
      ui.pick = key;
      return true;
    },
  };
  return g as unknown as typeof fakeGame;
}

/** Drive a fresh midend and record every notification it emits. */
function harness(game: typeof fakeGame = fakeGame) {
  const notes: ChangeNotification[] = [];
  let timerActive = false;
  let redraws = 0;
  const m = new Midend(game);
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

  it("newGame requests a redraw (deterministic boards may produce the same game ID)", () => {
    const before = h.redraws();
    h.m.newGame();
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

  it("random-seed id carries FULL params (difficulty), game id does not", () => {
    // Regression: `emitIdChange` encoded both the `params:desc` id and the
    // `params#seed` seed with `full=false`, dropping a difficulty-style
    // suffix from the seed. The app's `currentParams` prefers the seed
    // form, so the type-menu label lost the difficulty (Extreme shown as
    // the default). A game whose `encodeParams` appends a suffix only at
    // `full=true` (like every difficulty game) exercises the split.
    const suffixGame: typeof fakeGame = {
      ...fakeGame,
      encodeParams: (p, full) => `t${p.target}${full ? "X" : ""}`,
      decodeParams: (s) => {
        const m = /^t(\d+)X?$/.exec(s);
        if (!m) throw new Error(`bad params "${s}"`);
        return { target: Number(m[1]) };
      },
    };
    const h = harness(suffixGame);
    h.m.newGame();
    const id = h.last("game-id-change") as Extract<
      ChangeNotification,
      { type: "game-id-change" }
    >;
    // Seed form regenerates the puzzle ⇒ must include the full suffix.
    expect(id.randomSeed).toMatch(/^t3X#[0-9a-f]+$/);
    // Descriptive form ⇒ desc specifies the puzzle, suffix omitted.
    expect(id.currentGameId).toMatch(/^t3:/);
    expect(id.currentGameId).not.toContain("X");
  });
});

describe("Midend.requestKeys forwards Game.requestKeys", () => {
  it("returns [] for a game with no requestKeys hook", () => {
    const m = new Midend(fakeGame);
    expect(m.requestKeys()).toEqual([]);
  });

  it("forwards the hook, called with the current params", () => {
    const withKeys: typeof fakeGame = {
      ...fakeGame,
      requestKeys: (p) => [{ button: 49, label: String(p.target) }],
    };
    const m = new Midend(withKeys);
    // defaultParams ⇒ target 3
    expect(m.requestKeys()).toEqual([{ button: 49, label: "3" }]);
    // params drive the hook: switch presets and the keys follow
    expect(m.setParams("t7")).toBeUndefined();
    expect(m.requestKeys()).toEqual([{ button: 49, label: "7" }]);
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

  it("expands past the preferred tile size to fill the slot (user size)", () => {
    const m = midend();
    const out = m.size({ w: 200, h: 200 }, true, 1);
    // fakeGame.computeSize: w = target(3)*tile, h = tile. With user
    // size (what the app passes), upstream midend_size's binary search
    // picks the largest tile that fits: 3*66 = 198 ≤ 200.
    expect(out).toEqual({ w: 198, h: 66 });
  });

  it("caps at the preferred tile size without user size", () => {
    const m = midend();
    const out = m.size({ w: 200, h: 200 }, false, 1);
    // Preferred tile is 10 (fits easily), so it is the ceiling.
    expect(out).toEqual({ w: 30, h: 10 });
  });

  it("shrinks below the preferred tile size when the slot is small", () => {
    const m = midend();
    const out = m.size({ w: 15, h: 15 }, true, 1);
    // Largest tile with 3*tile ≤ 15 is 5.
    expect(out).toEqual({ w: 15, h: 5 });
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
    const instance0 = (m as unknown as { drawState: FakeDrawState }).drawState.instance;
    m.size({ w: 400, h: 400 }, true, 1);
    const instance1 = (m as unknown as { drawState: FakeDrawState }).drawState.instance;
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
    const before = (m as unknown as { drawState: FakeDrawState }).drawState.instance;
    m.canvasCleared();
    const after = (m as unknown as { drawState: FakeDrawState }).drawState.instance;
    expect(after).not.toBe(before);
  });

  it("the next redraw paints a fresh background (game's `!ds.started` branch fires)", () => {
    const m = midend();
    // Pre-clear: redraws are cache-suppressed for unchanged state.
    const pre = recordingDrawing();
    m.redraw(pre.dr);
    expect(pre.ops.some((o) => o.op === "drawRect" && o.colour === 0)).toBe(false);

    m.canvasCleared();
    const post = recordingDrawing();
    m.redraw(post.dr);
    expect(post.ops.some((o) => o.op === "drawRect" && o.colour === 0)).toBe(true);
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
    const before = (m as unknown as { drawState: FakeDrawState }).drawState.instance;
    const { dr, ops } = recordingDrawing();
    m.forceRedraw(dr);
    const after = (m as unknown as { drawState: FakeDrawState }).drawState.instance;
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
    const drawing = ops.filter((o) => o.op !== "startDraw" && o.op !== "endDraw");
    expect(drawing).toEqual([]);
  });
});

describe("Midend newGame requests a redraw (deterministic boards may produce the same game ID)", () => {
  it("newGame requests a redraw even when the game ID is unchanged", () => {
    const h = harness();
    h.m.newGame();
    // Deterministic boards (e.g. English Pegs) produce the same
    // desc every time, so the app's reactive flow may not detect a
    // game-id-change. The midend must request a redraw to ensure
    // the canvas repaints after a new game.
    expect(h.redraws()).toBeGreaterThan(0);
    const types = new Set(h.notes.map((n) => n.type));
    expect(types).toContain("game-id-change");
  });
});

/** fakeGame with a counting `hint` so tests can assert how many times
 * a plan was (re)computed. */
function countingHintGame(): { game: typeof fakeGame; hintCalls: () => number } {
  let calls = 0;
  const game: typeof fakeGame = {
    ...fakeGame,
    hint: (s) => {
      calls += 1;
      const base = fakeGame.hint;
      if (!base) throw new Error("fakeGame.hint missing");
      return base(s);
    },
  };
  return { game, hintCalls: () => calls };
}

describe("Midend hint plan lifecycle", () => {
  let h: ReturnType<typeof harness>;
  const explanation = () =>
    (
      h.last("status-bar-change") as Extract<
        ChangeNotification,
        { type: "status-bar-change" }
      >
    ).activeHintExplanation;

  beforeEach(() => {
    h = harness();
    h.m.newGame(); // default target 3 ⇒ a 3-step plan from count 0
  });

  it("hint() stores a plan and displays its first step", () => {
    expect(h.m.hint()).toBeUndefined();
    expect(explanation()).toBe("Increment the counter to 1");
  });

  it("hint() on a solved game returns an error", () => {
    h.m.solve(); // jumps to solved
    expect(h.m.hint()).toBe("Already solved");
  });

  it("completing a step manually hides the hint; the next hint() shows the advanced step (no recompute)", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame();
    h.m.hint();
    expect(explanation()).toBe("Increment the counter to 1");
    // One hint per request: the follow-up step is not presented unasked.
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(explanation()).toBeUndefined();
    // Asking again re-displays from the stored plan instantly.
    expect(h.m.hint()).toBeUndefined();
    expect(explanation()).toBe("Increment the counter to 2");
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(explanation()).toBeUndefined();
    expect(h.m.hint()).toBeUndefined();
    expect(explanation()).toBe("Increment the counter to 3");
    expect(c.hintCalls()).toBe(1);
  });

  it("completing into a journey-continuation step keeps the hint displayed", () => {
    // A two-leg journey is presented as ONE hint: completing the first
    // leg must transition the display to the flagged continuation step
    // instead of hiding. The unflagged step after the journey hides as
    // usual.
    const c = countingHintGame();
    const game = {
      ...c.game,
      hint: (s: Parameters<NonNullable<typeof fakeGame.hint>>[0]) => {
        const base = c.game.hint?.(s);
        if (!base?.ok) return base ?? { ok: false as const, error: "no hint" };
        return {
          ok: true as const,
          steps: base.steps.map((step, i) =>
            i === 1 ? { ...step, continuesPrevious: true } : step,
          ),
        };
      },
    };
    h = harness(game);
    h.m.newGame(); // target 3 ⇒ steps 1,2,3; step 2 continues step 1
    h.m.hint();
    expect(explanation()).toBe("Increment the counter to 1");
    // Completing step 1 flows straight into its journey continuation.
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(explanation()).toBe("Increment the counter to 2");
    // Completing the journey's last leg hides (step 3 is unflagged).
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(explanation()).toBeUndefined();
    expect(h.m.hint()).toBeUndefined();
    expect(explanation()).toBe("Increment the counter to 3");
    expect(c.hintCalls()).toBe(1);
  });

  it("a hidden plan keeps tracking moves: completions advance it silently", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame();
    h.m.hint();
    // Two on-plan moves with no hint request in between: the stored
    // plan advances past both while hidden.
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(explanation()).toBeUndefined();
    expect(h.m.hint()).toBeUndefined();
    expect(explanation()).toBe("Increment the counter to 3");
    expect(c.hintCalls()).toBe(1);
  });

  it("a hidden plan is still dropped by an off-plan move", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame();
    h.m.hint();
    h.m.processInput(0, 0, LEFT_BUTTON); // completes step 1, hides
    h.m.processInput(0, 0, RIGHT_BUTTON); // off-plan ⇒ plan dropped
    expect(h.m.hint()).toBeUndefined();
    expect(c.hintCalls()).toBe(2); // recomputed from the new state
  });

  it("hint() while a plan is active is a refresh, not a recompute or advance", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame();
    h.m.hint();
    expect(h.m.hint()).toBeUndefined();
    expect(h.m.hint()).toBeUndefined();
    expect(explanation()).toBe("Increment the counter to 1");
    expect(c.hintCalls()).toBe(1);
  });

  it("an off-plan move drops the plan", () => {
    h.m.hint();
    expect(explanation()).toBe("Increment the counter to 1");
    h.m.processInput(0, 0, RIGHT_BUTTON); // "dec" ⇒ verdict "off"
    expect(explanation()).toBeUndefined();
  });

  it("the next hint request after invalidation recomputes from the new state", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame();
    h.m.hint();
    h.m.processInput(0, 0, RIGHT_BUTTON); // drops the plan (count now -1)
    expect(h.m.hint()).toBeUndefined();
    expect(c.hintCalls()).toBe(2);
    expect(explanation()).toBe("Increment the counter to 0");
  });

  it("an onTrack move keeps the current step displayed", () => {
    h = harness({ ...fakeGame, hintKeepTrack: () => "onTrack" });
    h.m.newGame();
    h.m.hint();
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(explanation()).toBe("Increment the counter to 1");
  });

  it("following the plan to the end clears it (exhaustion + solved)", () => {
    h.m.hint();
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.processInput(0, 0, LEFT_BUTTON); // completes the last step
    expect(h.state()?.status).toBe("solved");
    expect(explanation()).toBeUndefined();
  });

  it("a game returning an empty plan is rejected", () => {
    h = harness({ ...fakeGame, hint: () => ({ ok: true, steps: [] }) });
    h.m.newGame();
    expect(h.m.hint()).toBe("Game returned an empty hint plan");
    expect(explanation()).toBeUndefined();
  });

  it("undo clears the active plan", () => {
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.hint();
    h.m.undo();
    expect(explanation()).toBeUndefined();
  });

  it("redo clears the active plan", () => {
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.undo();
    h.m.hint();
    h.m.redo();
    expect(explanation()).toBeUndefined();
  });

  it("newGame clears the active plan", () => {
    h.m.hint();
    h.m.newGame();
    expect(explanation()).toBeUndefined();
  });

  it("restartGame clears the active plan", () => {
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.hint();
    h.m.restartGame();
    expect(explanation()).toBeUndefined();
  });

  it("solve() clears the active plan", () => {
    h.m.hint();
    h.m.solve();
    expect(explanation()).toBeUndefined();
  });

  it("canHint is true when the game implements hint()", () => {
    const props = h.m.getStaticProperties();
    expect(props.canHint).toBe(true);
  });

  it("canMarkAll reflects the game flag (default false, opt-in true)", () => {
    expect(new Midend(fakeGame).getStaticProperties().canMarkAll).toBe(false);
    const marking = { ...fakeGame, canMarkAll: true } as typeof fakeGame;
    expect(new Midend(marking).getStaticProperties().canMarkAll).toBe(true);
  });

  it("hasReference reflects the reference hook; getReference returns its model", () => {
    expect(new Midend(fakeGame).getStaticProperties().hasReference).toBe(false);
    const m = new Midend(refGame());
    m.newGameFromId("t3:g3-0");
    expect(m.getStaticProperties().hasReference).toBe(true);
    const model = m.getReference();
    expect(model?.items.map((i) => i.key)).toEqual(["a", "b"]);
    expect(model?.selected).toBeNull();
  });

  it("selectReference repaints and spotlights but records no move", () => {
    const notes: ChangeNotification[] = [];
    let redraws = 0;
    const m = new Midend(refGame());
    m.setCallbacks(
      (n) => notes.push(n),
      () => {},
      () => {
        redraws++;
      },
    );
    m.newGameFromId("t3:g3-0");

    const lastMoveCounts = () => {
      const s = [...notes]
        .reverse()
        .find((n) => n.type === "game-state-change") as
        | Extract<ChangeNotification, { type: "game-state-change" }>
        | undefined;
      return { current: s?.currentMove, total: s?.totalMoves, canUndo: s?.canUndo };
    };
    const before = lastMoveCounts();
    const redrawsBefore = redraws;

    m.selectReference("b");

    expect(redraws).toBe(redrawsBefore + 1); // it repainted
    expect(m.getReference()?.selected).toBe("b"); // it spotlighted
    // …but added no history entry: move counters are unchanged.
    expect(lastMoveCounts()).toEqual(before);
    expect(before.canUndo).toBe(false);
  });
});

// A displayed hint step is never stale (openspec `fix-stale-hint-step`). The
// engine-level guarantee: before (re-)displaying a stored step, the midend asks
// the game's `refreshHintStep` whether parts of it are already resolved and
// drops/advances past them. Modelled here with the smallest game whose move has
// a side effect that resolves a *later* plan step (Towers' auto-pencil shape):
// striking candidate `i` also strikes `i+1`, so the plan [strike 0, strike 1,
// strike 2] has step 1 resolved out from under it by step 0's side effect.
interface StrikeState {
  n: number;
  struck: number; // bitmask of removed candidates
}
type StrikeMove = { type: "strike"; i: number } | { type: "noop" };
const present = (s: StrikeState, i: number) => (s.struck & (1 << i)) === 0;

function strikeGame(opts: {
  sideEffect: boolean;
}): Game<{ n: number }, StrikeState, StrikeMove, null, { started: boolean }> {
  return {
    ...(fakeGame as unknown as Game<
      { n: number },
      StrikeState,
      StrikeMove,
      null,
      { started: boolean }
    >),
    id: "__strike__",
    defaultParams: () => ({ n: 3 }),
    presets: () => ({ title: "root", params: { n: 3 } }),
    encodeParams: (p) => `n${p.n}`,
    decodeParams: (s) => ({ n: Number(/^n(\d+)$/.exec(s)?.[1] ?? 3) }),
    validateParams: () => null,
    newDesc: () => ({ desc: "g0-0" }),
    validateDesc: () => null,
    newState: (p) => ({ n: p.n, struck: 0 }),
    newUi: () => null,
    // button 100+i strikes candidate i directly (no coordinate mapping needed).
    interpretMove: (_s, _ui, _ds, _p, button) =>
      button >= 100 ? { type: "strike", i: button - 100 } : { type: "noop" },
    executeMove: (s, m) => {
      if (m.type === "noop") return s;
      let struck = s.struck | (1 << m.i);
      // The side effect that creates staleness: resolve the next candidate too.
      if (opts.sideEffect && m.i + 1 < s.n) struck |= 1 << (m.i + 1);
      return { n: s.n, struck };
    },
    status: (s) => (s.struck === (1 << s.n) - 1 ? "solved" : "ongoing"),
    canSolve: false,
    solve: undefined,
    hint: (s) => {
      const steps = [];
      for (let i = 0; i < s.n; i++) {
        if (present(s, i)) {
          steps.push({
            move: { type: "strike", i } as StrikeMove,
            explanation: `Strike candidate ${i}`,
            // One journey, so the display stays on across legs (Towers' dup chain).
            continuesPrevious: i > 0,
          });
        }
      }
      return steps.length ? { ok: true, steps } : { ok: false, error: "done" };
    },
    hintKeepTrack: (m, step) =>
      m.type === "strike" && step.move.type === "strike" && m.i === step.move.i
        ? "completed"
        : "off",
    refreshHintStep: (step, state) =>
      step.move.type === "strike" && present(state, step.move.i) ? step : null,
    textFormat: (s) => `struck=${s.struck}`,
  };
}

function strikeInternals(
  m: Midend<{ n: number }, StrikeState, StrikeMove, null, { started: boolean }>,
) {
  return m as unknown as { activeHint: { steps: StrikeMove[]; index: number } | null };
}

describe("Midend re-validates a kept plan (a displayed step is never stale)", () => {
  it("skips a continuation step a completed move's side effects already resolved", () => {
    const m = new Midend(strikeGame({ sideEffect: true }));
    m.newGame();
    expect(m.hint()).toBeUndefined(); // plan: strike 0,1,2; displays step 0
    expect((m.activeHintStep()?.move as StrikeMove & { i: number }).i).toBe(0);

    // Strike candidate 0 — its side effect also strikes candidate 1, so the
    // stored step 1 is now resolved. The midend must advance past it to step 2.
    expect(m.processInput(0, 0, 100)).toBe(true);
    const shown = m.activeHintStep();
    expect(shown, "a kept journey stays displayed across its legs").toBeDefined();
    expect(
      (shown?.move as StrikeMove & { i: number }).i,
      "the stale step (candidate 1, already struck) must be skipped",
    ).toBe(2);
  });

  it("without the side effect, the same move keeps the next step live", () => {
    const m = new Midend(strikeGame({ sideEffect: false }));
    m.newGame();
    m.hint();
    m.processInput(0, 0, 100); // strike 0 only
    expect((m.activeHintStep()?.move as StrikeMove & { i: number }).i).toBe(1);
  });

  it("hint() re-show re-validates and recomputes when the kept plan has fully drained", () => {
    const m = new Midend(strikeGame({ sideEffect: true }));
    m.newGame();
    m.hint(); // plan strike 0,1,2
    // A scripted replay (no hintKeepTrack) strikes 0 and 2 — side effects then
    // cover 1, so every stored step is resolved but the plan is still stored.
    m.playMoves([{ type: "strike", i: 0 }]);
    expect(
      strikeInternals(m).activeHint,
      "playMoves leaves the plan untouched",
    ).not.toBeNull();
    m.playMoves([{ type: "strike", i: 2 }]);
    // The board is now fully solved; re-asking re-validates, finds the drained
    // plan, and recomputes — which refuses on a solved board.
    expect(m.hint()).toBe("done");
    expect(strikeInternals(m).activeHint).toBeNull();
  });
});

describe("Midend executeHint plays the stored plan", () => {
  let h: ReturnType<typeof harness>;
  const explanation = () =>
    (
      h.last("status-bar-change") as Extract<
        ChangeNotification,
        { type: "status-bar-change" }
      >
    ).activeHintExplanation;

  it("executes the whole plan verbatim — hint() is computed once, not per step", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame(); // target 3
    expect(h.m.executeHint()).toBeUndefined();
    expect(h.m.executeHint()).toBeUndefined();
    expect(h.m.executeHint()).toBeUndefined();
    expect(c.hintCalls()).toBe(1);
    expect(h.m.formatAsText()).toBe("count=3");
    expect(h.state()?.status).toBe("solved");
    // Plan exhausted + board solved ⇒ cleared.
    expect(explanation()).toBeUndefined();
  });

  it("computes a plan when none is stored, then previews the next step", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame();
    expect(h.m.executeHint()).toBeUndefined();
    expect(c.hintCalls()).toBe(1);
    expect(h.m.formatAsText()).toBe("count=1");
    // fakeGame has no animation ⇒ the step settles synchronously and
    // the *next* step is already on display.
    expect(explanation()).toBe("Increment the counter to 2");
  });

  it("executeHint(true) applies and hides instead of previewing (stepper mode)", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame(); // target 3
    // Apply step 1 in single-step (Hint-button stepper) mode.
    expect(h.m.executeHint(true)).toBeUndefined();
    expect(c.hintCalls()).toBe(1);
    expect(h.m.formatAsText()).toBe("count=1"); // the move did land
    // The plan is hidden — no preview of the next step (unlike auto-play).
    expect(h.m.activeHintStep()).toBeUndefined();
    expect(explanation()).toBeUndefined();
    // …but the plan advanced and is still stored: a fresh hint() re-shows the
    // next step without recomputing (show/apply alternation).
    h.m.hint();
    expect(c.hintCalls()).toBe(1);
    expect(h.m.activeHintStep()?.explanation).toBe("Increment the counter to 2");
    expect(explanation()).toBe("Increment the counter to 2");
  });

  it("executes the stored plan's current step after manual progress", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame();
    h.m.hint();
    h.m.processInput(0, 0, LEFT_BUTTON); // completes step 1 manually
    expect(h.m.executeHint()).toBeUndefined(); // plays step 2
    expect(c.hintCalls()).toBe(1);
    expect(h.m.formatAsText()).toBe("count=2");
    expect(explanation()).toBe("Increment the counter to 3");
  });

  it("recomputes after the plan was invalidated", () => {
    const c = countingHintGame();
    h = harness(c.game);
    h.m.newGame();
    h.m.hint();
    h.m.undo(); // no-op at pos 0 — use an off-plan move instead
    h.m.processInput(0, 0, RIGHT_BUTTON); // drops the plan
    expect(h.m.executeHint()).toBeUndefined();
    expect(c.hintCalls()).toBe(2);
  });

  it("hint errors pass through (solved board)", () => {
    h = harness();
    h.m.newGame();
    h.m.solve();
    expect(h.m.executeHint()).toBe("Already solved");
  });

  it("does not replay a step whose animation has not settled yet", () => {
    // An animated game: executeHint normally advances at animation
    // settle. Calling executeHint again *before* the settle must
    // advance past the in-flight step (its move is already applied),
    // not execute the same move twice.
    const c = countingHintGame();
    h = harness({ ...c.game, animLength: () => 1 });
    h.m.newGame();
    h.m.executeHint(); // step 1 in flight, no timer ticks driven
    h.m.executeHint(); // must play step 2, not step 1 again
    expect(c.hintCalls()).toBe(1);
    expect(h.m.formatAsText()).toBe("count=2");
  });
});

describe("Midend mistake overlay (findMistakes lifecycle)", () => {
  // A game that flags exactly one mistake when count === 1, and whose
  // redraw emits a sentinel op (drawCircle colour 999) iff the engine
  // handed it a non-empty mistakes overlay — so a test can observe the
  // overlay being shown and then cleared on the next transition.
  const MISTAKE_SENTINEL = 999;
  const mistakeGame: typeof fakeGame = {
    ...fakeGame,
    findMistakes: (s) => (s.count === 1 ? [{ x: 1, y: 1 }] : []),
    redraw: (dr, ds, prev, s, dir, ui, at, ft, hint, mistakes) => {
      fakeGame.redraw?.(dr, ds, prev, s, dir, ui, at, ft, hint);
      if (mistakes && mistakes.length > 0) {
        dr.drawCircle({ x: 0, y: 0 }, 1, MISTAKE_SENTINEL, MISTAKE_SENTINEL);
      }
    },
  };
  const sawSentinel = (ops: ReturnType<typeof recordingDrawing>["ops"]) =>
    ops.some((o) => o.op === "drawCircle" && o.colour === MISTAKE_SENTINEL);

  it("reports the capability and count, and displays then clears the overlay", () => {
    const h = harness(mistakeGame);
    h.m.newGame();
    expect(h.m.getStaticProperties().canFindMistakes).toBe(true);

    // count 0 → no mistakes.
    expect(h.m.findMistakes()).toBe(0);

    // Move to count 1 → one mistake.
    h.m.processInput(0, 0, LEFT_BUTTON);
    expect(h.m.findMistakes()).toBe(1);

    // The overlay is now displayed: a redraw hands the game the list.
    const a = recordingDrawing();
    h.m.redraw(a.dr);
    expect(sawSentinel(a.ops)).toBe(true);

    // Any move clears the overlay: the next redraw has no mistakes.
    h.m.processInput(0, 0, LEFT_BUTTON); // count → 2
    const b = recordingDrawing();
    h.m.redraw(b.dr);
    expect(sawSentinel(b.ops)).toBe(false);
  });

  it("a game without findMistakes reports no capability and zero", () => {
    const h = harness();
    h.m.newGame();
    expect(h.m.getStaticProperties().canFindMistakes).toBe(false);
    expect(h.m.findMistakes()).toBe(0);
  });

  it("a refused hint surfaces the mistake overlay (the refusal's promise)", () => {
    // A hint refused because the board has a mistake must light up the same
    // overlay Check & Save uses, so "fix the highlighted mistakes" is true.
    const refusingHintGame: typeof fakeGame = {
      ...mistakeGame,
      hint: (s) =>
        s.count === 1
          ? { ok: false, error: "Fix the highlighted mistakes first." }
          : { ok: true, steps: [] },
    };
    const h = harness(refusingHintGame);
    h.m.newGame();
    // Move to count 1 → the board now has a mistake, and no overlay yet.
    h.m.processInput(0, 0, LEFT_BUTTON);
    const before = recordingDrawing();
    h.m.redraw(before.dr);
    expect(sawSentinel(before.ops)).toBe(false);

    // Ask for a hint: it refuses and returns the message...
    expect(h.m.hint()).toBe("Fix the highlighted mistakes first.");
    // ...and the refusal lit up the overlay: the next redraw shows it.
    const after = recordingDrawing();
    h.m.redraw(after.dr);
    expect(sawSentinel(after.ops)).toBe(true);
  });

  it("a refused hint with no mistakes highlights nothing", () => {
    // A refusal unrelated to mistakes (e.g. already solved) must not invent
    // an overlay: findMistakes finds zero and nothing lights up.
    const refusingHintGame: typeof fakeGame = {
      ...mistakeGame,
      // count 0 ⇒ no mistakes; refuse anyway (as if "already solved").
      hint: () => ({ ok: false, error: "This board is already solved." }),
    };
    const h = harness(refusingHintGame);
    h.m.newGame(); // count 0 ⇒ findMistakes returns []
    expect(h.m.hint()).toBe("This board is already solved.");
    const after = recordingDrawing();
    h.m.redraw(after.dr);
    expect(sawSentinel(after.ops)).toBe(false);
  });
});

describe("Midend changedState hook (upstream game_changed_state)", () => {
  /** A fake game with a recording `changedState`, a real Ui, and an
   * input that can return UI_UPDATE (RIGHT) or a move (LEFT). */
  function makeRecordingGame() {
    const calls: Array<{ old: number | null; next: number }> = [];
    const game: Game<
      { target: number },
      { count: number; target: number },
      "inc",
      { edits: number },
      FakeDrawState
    > = {
      ...(fakeGame as unknown as Game<
        { target: number },
        { count: number; target: number },
        "inc",
        { edits: number },
        FakeDrawState
      >),
      newUi: () => ({ edits: 0 }),
      changedState: (_ui, oldState, newState) => {
        calls.push({ old: oldState ? oldState.count : null, next: newState.count });
      },
      interpretMove: (_s, _ui, _ds, _p, button) =>
        button === RIGHT_BUTTON ? UI_UPDATE : button === LEFT_BUTTON ? "inc" : null,
      executeMove: (s) => ({ ...s, count: s.count + 1 }),
    };
    return { game, calls };
  }

  function drive<P, S, M, U, D>(game: Game<P, S, M, U, D>) {
    const m = new Midend(game);
    m.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    return m;
  }

  it("fires once at new-game with oldState = null", () => {
    const { game, calls } = makeRecordingGame();
    const m = drive(game);
    m.newGame();
    expect(calls).toHaveLength(1);
    expect(calls[0].old).toBeNull();
    expect(calls[0].next).toBe(0);
  });

  it("fires on move, undo, redo, and restart", () => {
    const { game, calls } = makeRecordingGame();
    const m = drive(game);
    m.newGame();
    calls.length = 0;

    m.processInput(0, 0, LEFT_BUTTON); // move: count 0 -> 1
    expect(calls.at(-1)).toEqual({ old: 0, next: 1 });

    m.undo(); // 1 -> 0
    expect(calls.at(-1)).toEqual({ old: 1, next: 0 });

    m.redo(); // 0 -> 1
    expect(calls.at(-1)).toEqual({ old: 0, next: 1 });

    const before = calls.length;
    m.restartGame(); // back to the initial state
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)?.next).toBe(0);
  });

  it("does NOT fire on a bare UI_UPDATE", () => {
    const { game, calls } = makeRecordingGame();
    const m = drive(game);
    m.newGame();
    calls.length = 0;
    const handled = m.processInput(0, 0, RIGHT_BUTTON); // UI_UPDATE
    expect(handled).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
