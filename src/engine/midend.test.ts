import { beforeEach, describe, expect, it } from "vitest";
import { mkhighlightBackground } from "./color/color-mkhighlight.ts";
import { token } from "./color/color-token.ts";
import { type FakeDrawState, fakeGame } from "./fake-game.ts";
import type { Game, GameDrawing } from "./game.ts";
import { UI_UPDATE } from "./game.ts";
import { Midend } from "./midend.ts";
import { LEFT_BUTTON, RIGHT_BUTTON } from "./pointer.ts";
import type { ChangeNotification, Color } from "./types.ts";

/** Recording fake `GameDrawing` for engine-level redraw assertions. */
function recordingDrawing() {
  const ops: Array<{
    op: string;
    color?: number;
    rect?: { x: number; y: number; w: number; h: number };
  }> = [];
  const dr: GameDrawing = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: (rect) => ops.push({ op: "drawUpdate", rect }),
    clip: () => ops.push({ op: "clip" }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (rect, color) => ops.push({ op: "drawRect", rect, color }),
    drawLine: (_a, _b, color) => ops.push({ op: "drawLine", color }),
    drawPolygon: (_p, color) => ops.push({ op: "drawPolygon", color }),
    drawCircle: (_p, _r, color) => ops.push({ op: "drawCircle", color }),
    drawText: (_p, _o, color) => ops.push({ op: "drawText", color }),
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

/**
 * A fake game with a **difficulty**, whose `encodeParams` honors `full` the way
 * every tiered game's does: the short form drops the tier (upstream
 * `encode_params(..., FALSE)`), the full form keeps it. `fakeGame` itself
 * ignores `full`, so it cannot tell the two game IDs apart — and a test that
 * cannot tell them apart is no guard on which one gets recorded.
 */
function tieredGame(): typeof fakeGame {
  type TieredParams = { target: number; diff: number };
  const g = {
    ...fakeGame,
    defaultParams: (): TieredParams => ({ target: 3, diff: 0 }),
    presets: () => ({
      title: "root",
      submenu: [
        { title: "Easy", params: { target: 3, diff: 0 } },
        { title: "Hard", params: { target: 3, diff: 1 } },
      ],
    }),
    encodeParams: (p: TieredParams, full: boolean) =>
      `t${p.target}${full ? `d${p.diff}` : ""}`,
    decodeParams: (s: string): TieredParams => {
      const m = /^t(\d+)(?:d(\d+))?$/.exec(s);
      if (!m) throw new Error(`bad params "${s}"`);
      // No `d` suffix ⇒ the game's default tier, exactly as a real game's
      // decoder does. This is the lossiness the two ids exist to separate.
      return { target: Number(m[1]), diff: m[2] === undefined ? 0 : Number(m[2]) };
    },
    validateParams: (p: TieredParams) =>
      p.target > 0 ? null : "target must be positive",
    newDesc: (p: TieredParams) => ({ desc: `g${p.target}-7` }),
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

  // The refusals a player can actually read. `canSolve`/`canHint` are the flags
  // the app hides the buttons behind, but the midend must still answer
  // correctly when something calls through anyway — a keyboard shortcut, a
  // stale UI, a scripted replay — and answering `undefined` means "done", which
  // would leave the board untouched and the player told it worked.
  it.each([
    [
      "solving",
      { ...fakeGame, canSolve: false },
      (m: Midend<never, never, never, never, never>) => m.solve(),
      "This game does not support solving",
    ],
    [
      "hints",
      { ...fakeGame, hint: undefined },
      (m: Midend<never, never, never, never, never>) => m.hint(),
      "This game does not support hints",
    ],
  ])("refuses %s on a game that does not implement it", (_what, game, call, message) => {
    const h = harness(game as typeof fakeGame);
    h.m.newGame();
    const before = h.m.formatAsText();
    expect(call(h.m as never)).toBe(message);
    expect(h.m.formatAsText()).toBe(before);
    expect(h.state()?.status).toBe("ongoing");
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

  // A game ID is user input — it arrives in a URL, a shared link, or a typed
  // box — and the midend has a separate refusal for each way it can be wrong.
  // The params-decode and params-validate arms are the ones a *plausible* bad
  // link hits (right shape, impossible values), and each returns a string the
  // player reads.
  it.each([
    ["nope", /Invalid game ID/, "no separator at all"],
    ["t2:bad!", /bad desc/, "a description the game rejects"],
    ["zzz:g3-1", /Invalid parameters/, "params the game cannot decode"],
    ["t0:g0-1", /target must be positive/, "params that decode but do not validate"],
  ])("newGameFromId(%s) refuses %s", (id, expected) => {
    const h = harness();
    h.m.newGame();
    const before = h.m.getParams();
    expect(h.m.newGameFromId(id)).toMatch(expected);
    // A refusal leaves the game it refused to replace untouched.
    expect(h.m.getParams()).toBe(before);
  });

  it("each of the three ids encodes params for the job it is for", () => {
    // The seed must carry the full params: the app's `currentParams` prefers
    // the seed form, so a short encoding drops the tier from the type-menu
    // label. And a dealt board must be remembered by the restoring id, not by
    // `currentGameId`, whose params are lossy on purpose: reopening a tiered
    // puzzle by the latter drops it to its default difficulty.
    const h = harness(tieredGame());
    expect(h.m.setParams("t3d1")).toBeUndefined();
    h.m.newGame();
    const id = h.last("game-id-change") as Extract<
      ChangeNotification,
      { type: "game-id-change" }
    >;
    // Seed form regenerates the puzzle ⇒ must include the full suffix.
    expect(id.randomSeed).toMatch(/^t3d1#[0-9a-f]+$/);
    // Descriptive form ⇒ desc specifies the puzzle, suffix omitted.
    expect(id.currentGameId).toMatch(/^t3:/);
    expect(id.currentGameId).not.toContain("d1");
    // Restore form ⇒ re-deals this game *here*, so it keeps the tier.
    expect(id.restoreGameId).toMatch(/^t3d1:/);
  });

  it("restoring from the remembered id keeps the difficulty; the shared id does not", () => {
    // The property the app depends on, asserted end to end rather than by
    // eyeballing the two encodings: `newGameFromId` sets `params` from whatever
    // prefix it is handed, so *which id you remembered* decides whether the
    // player's chosen tier survives reopening the puzzle. The `currentGameId`
    // arm is here deliberately — it pins the sharing id's documented lossiness
    // so the two ids cannot quietly converge and make the distinction dead.
    const h = harness(tieredGame());
    expect(h.m.setParams("t3d1")).toBeUndefined();
    h.m.newGame();
    const id = h.last("game-id-change") as Extract<
      ChangeNotification,
      { type: "game-id-change" }
    >;

    const restored = harness(tieredGame());
    expect(restored.m.newGameFromId(id.restoreGameId)).toBeUndefined();
    expect(restored.m.getParams()).toBe("t3d1");

    const shared = harness(tieredGame());
    expect(shared.m.newGameFromId(id.currentGameId)).toBeUndefined();
    expect(shared.m.getParams()).toBe("t3d0");
  });

  it("validates params with full=false when the id carries its own desc", () => {
    // `validate_params(params, full)`'s `full` means "these params are about
    // to GENERATE a board", which is how a game expresses a bound that only
    // generation has — a size whose generator succeeds too rarely to wait for.
    // Upstream midend.c:1956 passes exactly `desc == NULL`. Passing `true` on
    // both arms would make a generation-only bound reject an already-described
    // board, so a game ID shared before a bound was introduced would stop
    // loading, and every game gating a bound on `full` would gate on a constant.
    const boundedGame: typeof fakeGame = {
      ...fakeGame,
      validateParams: (p, full) =>
        p.target <= 0
          ? "target must be positive"
          : full && p.target > 5
            ? "too big to generate"
            : null,
    };
    const h = harness(boundedGame);
    h.m.newGame();

    // Generation arms refuse: the seed form regenerates, so it is bounded...
    expect(h.m.newGameFromId("t9#abc")).toBe("too big to generate");
    // ...as are the explicit params-setting arms.
    expect(h.m.setParams("t9")).toBe("too big to generate");

    // But a descriptive id hands over a finished board: nothing is generated,
    // so the generation-only bound must not apply.
    expect(h.m.newGameFromId("t9:g9-7")).toBeUndefined();
    expect(h.m.getParams()).toBe("t9");

    // A bound that is NOT generation-only still refuses on the desc arm.
    expect(h.m.newGameFromId("t0:g0-1")).toBe("target must be positive");
  });
});

// The three methods only the worker adapter calls. Each is one line, which is
// exactly why they are easy to break in a refactor of what they delegate to.
describe("Midend palette + teardown (adapter-facing)", () => {
  const withPalette = {
    ...fakeGame,
    colors: (bg: Color) => [bg, token([0, 0, 0], [1, 1, 1]), [0.5, 0.5, 0.5]],
  } as unknown as typeof fakeGame;

  it("getColorPalette hands the game the frontend's background, shifted off the extremes", () => {
    // The background is an *input*: a game derives washes from it (the dark
    // scheme relies on that, passing pure white so `background × 0.9` still
    // works), so swallowing it would silently flatten every derived color. It
    // arrives shifted off pure white/black (`resolvePalette`), so every game
    // paints one board tone; a mid-range color passes through untouched.
    const m = new Midend(withPalette);
    expect(m.getColorPalette([0.2, 0.4, 0.6])[0]).toEqual([0.2, 0.4, 0.6]);
    expect(m.getColorPalette([1, 1, 1])[0]).toEqual(mkhighlightBackground([1, 1, 1]));
    expect(m.getColorPalette([1, 1, 1])[0][0]).toBeLessThan(1);
  });

  it("darkPalette reports only the indices whose token authored a dark value", () => {
    // A token's `dark` is a non-index property, which structured clone drops on
    // the way to the frontend — so it is read off here and sent as plain data.
    // An *absent* index is meaningful: it means "adapt this by calculation",
    // which is what lets the scheme be authored token by token.
    const dark = new Midend(withPalette).darkPalette([1, 1, 1]);
    expect(dark).toEqual({ 1: [1, 1, 1] });
    expect(Object.hasOwn(dark, "0")).toBe(false);
    expect(Object.hasOwn(dark, "2")).toBe(false);
  });

  it("delete drops the callbacks so a torn-down midend emits nothing", () => {
    const h = harness();
    h.m.newGame();
    const emitted = h.notes.length;
    h.m.delete();
    h.m.processInput(0, 0, LEFT_BUTTON);
    h.m.undo();
    expect(h.notes.length).toBe(emitted);
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
  /** Mines is the real `isTimed` game; this is the same contract in miniature. */
  const timedGame = { ...fakeGame, isTimed: true } as typeof fakeGame;
  const clock = (h: ReturnType<typeof harness>) =>
    /^\[(\d+):(\d\d)\]/.exec(
      (
        h.last("status-bar-change") as Extract<
          ChangeNotification,
          { type: "status-bar-change" }
        >
      ).statusBarText,
    );

  it("an untimed game never activates the timer and timer() is inert", () => {
    const h = harness();
    h.m.newGame();
    h.m.timer(1.5);
    expect(h.timerActive()).toBe(false);
    // No status-bar churn from the inert tick beyond the newGame ones.
    expect(h.m.formatAsText()).toBe("count=0");
  });

  // The other half of the same predicate. `syncTimer` wants the clock running
  // when *either* the game is timed or an animation is in flight, and the fake
  // game does not animate — so with only the test above, the timed disjunct
  // could be deleted and nothing would notice, on the one hook Mines' whole
  // scoring rests on.
  it("a timed game runs its clock while play is ongoing and stops when solved", () => {
    const h = harness(timedGame);
    h.m.newGame();
    expect(h.timerActive()).toBe(true);

    h.m.timer(65);
    expect(clock(h)?.slice(1)).toEqual(["1", "05"]);

    for (let i = 0; i < 3; i++) h.m.processInput(0, 0, LEFT_BUTTON); // reach the target
    expect(h.state()?.status).toBe("solved");
    expect(h.timerActive()).toBe(false);
  });

  it("a new game resets the clock", () => {
    const h = harness(timedGame);
    h.m.newGame();
    h.m.timer(42);
    h.m.newGame();
    expect(clock(h)?.slice(1)).toEqual(["0", "00"]);
  });
});

describe("Midend.size is purely informational (regression: ResizeObserver flicker)", () => {
  // `puzzle-view.ts`'s `ResizeController` calls `puzzle.size()` on every
  // element-size change, including CSS transitions and mobile address-bar
  // show/hide. A side-effecting `size()` makes everything flicker, so it must
  // not touch drawstate identity or make the next `redraw` repaint its
  // background.
  function midend() {
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    return m;
  }

  it("preferredSize is the game's own size at its preferred tile size", () => {
    // The adapter asks for this before any layout exists, so it is the board's
    // natural size — `computeSize(params, preferredTileSize)` and nothing else.
    // Unlike `size()` it has no slot to be corrected against: whatever it
    // answers is what the canvas is first made.
    expect(midend().preferredSize()).toEqual({ w: 3 * 10, h: 10 });

    const bigTiles = new Midend({ ...fakeGame, preferredTileSize: 24 });
    bigTiles.setCallbacks(
      () => {},
      () => {},
    );
    bigTiles.newGame();
    expect(bigTiles.preferredSize()).toEqual({ w: 3 * 24, h: 24 });
  });

  it("expands past the preferred tile size to fill the slot", () => {
    const m = midend();
    const out = m.size({ w: 200, h: 200 });
    // fakeGame.computeSize: w = target(3)*tile, h = tile. Upstream
    // midend_size's binary search picks the largest tile that fits:
    // 3*66 = 198 ≤ 200. The board fills the slot it is given; capping it at
    // N× the preferred size is the `maxScale` setting's job, and it does it
    // by shrinking the slot before we see it.
    expect(out).toEqual({ w: 198, h: 66 });
  });

  it("shrinks below the preferred tile size when the slot is small", () => {
    const m = midend();
    const out = m.size({ w: 15, h: 15 });
    // Largest tile with 3*tile ≤ 15 is 5.
    expect(out).toEqual({ w: 15, h: 5 });
  });

  it("does NOT recreate the drawstate when called repeatedly at the same size", () => {
    const m = midend();
    m.size({ w: 200, h: 200 });
    const ds0 = (m as unknown as { drawState: FakeDrawState }).drawState;
    const instance0 = ds0.instance;

    m.size({ w: 200, h: 200 });
    m.size({ w: 200, h: 200 });
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
    m.size({ w: 200, h: 200 });
    const instance0 = (m as unknown as { drawState: FakeDrawState }).drawState.instance;
    m.size({ w: 400, h: 400 });
    const instance1 = (m as unknown as { drawState: FakeDrawState }).drawState.instance;
    expect(instance1).toBe(instance0);
  });

  it("a redraw after only size() preserves the per-tile cache (no bg fill emitted)", () => {
    const m = midend();
    m.size({ w: 200, h: 200 });

    // First redraw: game's `!ds.started` branch paints its bg.
    const a = recordingDrawing();
    m.redraw(a.dr);
    expect(a.ops.some((o) => o.op === "drawRect" && o.color === 0)).toBe(true);

    // Subsequent `size()` calls do NOT cause the next redraw to
    // re-emit a bg fill — the drawstate is preserved, so the game's
    // `!ds.started` branch doesn't fire again.
    m.size({ w: 200, h: 200 });
    m.size({ w: 400, h: 400 });
    const b = recordingDrawing();
    m.redraw(b.dr);
    expect(b.ops.some((o) => o.op === "drawRect" && o.color === 0)).toBe(false);
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
    m.size({ w: 200, h: 200 });
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
    expect(pre.ops.some((o) => o.op === "drawRect" && o.color === 0)).toBe(false);

    m.canvasCleared();
    const post = recordingDrawing();
    m.redraw(post.dr);
    expect(post.ops.some((o) => o.op === "drawRect" && o.color === 0)).toBe(true);
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
    m.size({ w: 200, h: 200 });
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
    expect(ops.some((o) => o.op === "drawRect" && o.color === 0)).toBe(true);
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
  // The framework decides *when* to call `game.redraw` but never paints behind
  // the game's back: every draw op in a `redraw()` call comes from the game.
  it("Midend.redraw emits only startDraw/endDraw around game.redraw", () => {
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    m.newGame();
    m.size({ w: 200, h: 200 });

    // Past its first paint the fake's redraw emits nothing, so any op besides
    // the engine's `startDraw`/`endDraw` brackets would be the engine's own.
    const ds = (m as unknown as { drawState: FakeDrawState }).drawState;
    ds.started = true;

    const { dr, ops } = recordingDrawing();
    m.redraw(dr);
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
      const s = [...notes].reverse().find((n) => n.type === "game-state-change") as
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

// A displayed hint step is never stale. The engine-level guarantee: before (re-)displaying a stored step, the midend asks
// the game's `refreshHintStep` whether parts of it are already resolved and
// drops/advances past them. Modeled here with the smallest game whose move has
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

  it("reports where a displayed step sits in its journey", () => {
    // "Step 2 of 3" in the chrome. The journey is the unit the collection
    // already has — a lead leg plus the steps flagged `continuesPrevious` — so
    // this is derived from what the game says for its own reasons, and a game
    // that never groups steps simply reports a journey of one.
    const m = new Midend(strikeGame({ sideEffect: false }));
    const seen: { index: number; length: number }[] = [];
    m.setCallbacks(
      (n) => {
        if (n.type === "status-bar-change" && n.hintJourney) seen.push(n.hintJourney);
      },
      () => {},
    );
    m.newGame();
    m.hint(); // plan: strike 0, 1, 2 — legs 1 and 2 continue the first
    expect(seen.at(-1)).toEqual({ index: 1, length: 3 });

    m.processInput(0, 0, 100); // strike 0; the journey stays displayed
    expect(seen.at(-1)).toEqual({ index: 2, length: 3 });

    expect(seen, "the whole run, so an off-by-one is visible").toEqual([
      { index: 1, length: 3 },
      { index: 2, length: 3 },
    ]);
  });

  it("reports no journey when no hint is displayed", () => {
    // The absence matters as much as the number: a stale "Step 3 of 3" left
    // beside a board with no hint on it is a label for something that is not
    // there.
    const m = new Midend(strikeGame({ sideEffect: false }));
    const seen: (unknown | undefined)[] = [];
    m.setCallbacks(
      (n) => {
        if (n.type === "status-bar-change") seen.push(n.hintJourney);
      },
      () => {},
    );
    m.newGame();
    expect(seen.at(-1)).toBeUndefined();
  });

  it("a scripted replay drops the stored plan, and hint() recomputes fresh", () => {
    const m = new Midend(strikeGame({ sideEffect: true }));
    m.newGame();
    m.hint(); // plan strike 0,1,2
    // A scripted replay bypasses `hintKeepTrack` (the moves are setup, not an
    // answer to the displayed hint), so the stored plan is dropped, as a
    // self-played move drops it; see `Midend.playMoves`.
    m.playMoves([{ type: "strike", i: 0 }]);
    expect(strikeInternals(m).activeHint, "playMoves drops the stored plan").toBeNull();
    // Side effects covered 1; strike 2 solves the board. Re-asking
    // recomputes fresh — and refuses on a solved board.
    m.playMoves([{ type: "strike", i: 2 }]);
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
    h.m.processInput(0, 0, RIGHT_BUTTON); // off-plan: drops the plan
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
  // redraw emits a sentinel op (drawCircle color 999) iff the engine
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
    ops.some((o) => o.op === "drawCircle" && o.color === MISTAKE_SENTINEL);

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
