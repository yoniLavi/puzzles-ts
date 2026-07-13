/**
 * Inertia — behavioural tests.
 *
 * Tier 1 (the slide rule, the codec, the generator, the route aid, the deaths
 * tally) plus tier 2.5 render scenarios (playbook §5).
 */
import { describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newInertiaDesc } from "./generator.ts";
import { inertiaGame } from "./index.ts";
import { COL_DEAD_PLAYER, COL_GEM, COL_HINT, COL_MINE, COL_PLAYER } from "./render.ts";
import { findGemCandidates, solveRoute } from "./solver.ts";
import {
  BLANK,
  GEM,
  type InertiaState,
  MINE,
  newState,
  STOP,
  validateDesc,
  WALL,
} from "./state.ts";

/** A `Midend` that records its status-bar notifications. */
function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(inertiaGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  const status = (): string => {
    const last = [...notes].reverse().find((n) => n.type === "status-bar-change") as
      | Extract<ChangeNotification, { type: "status-bar-change" }>
      | undefined;
    return last?.statusBarText ?? "";
  };
  return { m, status };
}

/** Directions, by the name a reader can follow. */
const N = 0;
const NE = 1;
const E = 2;
const SE = 3;
const S = 4;
const SW = 5;
const W = 6;
const NW = 7;

/** A hand-built board. Rows are given as desc characters, so a test reads like
 * the board it describes. */
function board(rows: string[]): { params: { w: number; h: number }; desc: string } {
  return {
    params: { w: rows[0].length, h: rows.length },
    desc: rows.join(""),
  };
}

function play(s: InertiaState, ...dirs: number[]): InertiaState {
  let state = s;
  for (const dir of dirs) state = inertiaGame.executeMove(state, { type: "move", dir });
  return state;
}

const SEED_ID = "10x8#inertia-test";

// --- params + codec --------------------------------------------------

describe("inertia params and desc codec", () => {
  it("round-trips params", () => {
    const p = { w: 15, h: 12 };
    expect(inertiaGame.decodeParams(inertiaGame.encodeParams(p, true))).toEqual(p);
  });

  it("decodes a bare size as a square grid", () => {
    expect(inertiaGame.decodeParams("9")).toEqual({ w: 9, h: 9 });
  });

  it("rejects degenerate params", () => {
    expect(inertiaGame.validateParams({ w: 1, h: 8 }, true)).not.toBeNull();
    expect(inertiaGame.validateParams({ w: 8, h: 1 }, true)).not.toBeNull();
    // 2x2 has both dimensions >= 2 but an area below six.
    expect(inertiaGame.validateParams({ w: 2, h: 2 }, true)).not.toBeNull();
    expect(inertiaGame.validateParams({ w: 3, h: 2 }, true)).toBeNull();
  });

  it("rejects malformed descs", () => {
    const p = { w: 3, h: 2 };
    expect(validateDesc(p, "sSgbbb")).toBeNull();
    expect(validateDesc(p, "sSgbb")).not.toBeNull(); // too short
    expect(validateDesc(p, "sSgbbbb")).not.toBeNull(); // too long
    expect(validateDesc(p, "sSgbbz")).not.toBeNull(); // bad character
    expect(validateDesc(p, "ssgbbb")).not.toBeNull(); // no start
    expect(validateDesc(p, "sSSbbb")).not.toBeNull(); // two starts
    expect(validateDesc(p, "sSbbbb")).not.toBeNull(); // no gems
  });

  it("puts the ball on the start square, and treats that square as a stop", () => {
    // The ball starts at (1,0). Sliding east it should return to its start and
    // be caught there by the stop the start square left behind.
    const { params, desc } = board(["bSbg", "wwww"]);
    const s = newState(params, desc);
    expect([s.px, s.py]).toEqual([1, 0]);
    expect(s.grid[1]).toBe(STOP);
    expect(s.gems).toBe(1);
  });
});

// --- the slide rule --------------------------------------------------

describe("inertia sliding", () => {
  it("slides until a wall blocks the way, collecting gems en route", () => {
    const { params, desc } = board(["Sggbw", "wwwww"]);
    const s0 = newState(params, desc);
    expect(s0.gems).toBe(2);

    const s1 = play(s0, E);
    expect([s1.px, s1.py]).toEqual([3, 0]); // stopped before the wall
    expect(s1.gems).toBe(0);
    expect(s1.grid[1]).toBe(BLANK);
    expect(s1.grid[2]).toBe(BLANK);
    expect(s1.distanceMoved).toBe(3);
    expect(s1.dead).toBe(false);
  });

  it("is caught by a stop square", () => {
    const { params, desc } = board(["Sbsbg", "wwwww"]);
    const s1 = play(newState(params, desc), E);
    expect([s1.px, s1.py]).toEqual([2, 0]);
    expect(s1.gems).toBe(1); // never reached the gem
  });

  it("dies on a mine", () => {
    const { params, desc } = board(["Sbmbg", "wwwww"]);
    const s1 = play(newState(params, desc), E);
    expect(s1.dead).toBe(true);
    expect([s1.px, s1.py]).toEqual([2, 0]);
    expect(inertiaGame.status(s1)).toBe("ongoing"); // dying is not losing
  });

  it("collects a gem it dies just past", () => {
    // The gem is picked up as the ball passes over it, then the mine kills it.
    const { params, desc } = board(["Sgmbb", "wwwww"]);
    const s1 = play(newState(params, desc), E);
    expect(s1.dead).toBe(true);
    expect(s1.gems).toBe(0);
  });

  it("refuses a move into an adjacent wall", () => {
    const { params, desc } = board(["wSbbg", "wwwww"]);
    const s = newState(params, desc);
    // West of the ball is a wall; so is everything south.
    expect(
      inertiaGame.interpretMove(s, ui(), null, { x: 0, y: 0 }, key("left")),
    ).toBeNull();
    expect(
      inertiaGame.interpretMove(s, ui(), null, { x: 0, y: 0 }, key("down")),
    ).toBeNull();
    expect(
      inertiaGame.interpretMove(s, ui(), null, { x: 0, y: 0 }, key("right")),
    ).toEqual({ type: "move", dir: E });
  });

  it("refuses every move while dead", () => {
    const { params, desc } = board(["Smbbg", "wwwww"]);
    const s1 = play(newState(params, desc), E);
    expect(s1.dead).toBe(true);
    expect(
      inertiaGame.interpretMove(s1, ui(), null, { x: 0, y: 0 }, key("right")),
    ).toBeNull();
    expect(() => play(s1, E)).toThrow();
  });

  it("slides diagonally", () => {
    const { params, desc } = board(["Sbbb", "bbbb", "bbgb", "bbbb"]);
    const s1 = play(newState(params, desc), SE);
    expect([s1.px, s1.py]).toEqual([3, 3]); // ran to the far corner
    expect(s1.gems).toBe(0); // through the gem at (2,2)
  });

  it("wins when the last gem is collected", () => {
    const { params, desc } = board(["Sggb", "wwww"]);
    const s1 = play(newState(params, desc), E);
    expect(s1.gems).toBe(0);
    expect(inertiaGame.status(s1)).toBe("solved");
  });
});

// --- input -----------------------------------------------------------

describe("inertia input", () => {
  it("maps the number pad to all eight directions", () => {
    const { params, desc } = board(["bbbbb", "bbbbb", "bbSbg", "bbbbb", "bbbbb"]);
    const s = newState(params, desc);
    const pad: [string, number][] = [
      ["8", N],
      ["9", NE],
      ["6", E],
      ["3", SE],
      ["2", S],
      ["1", SW],
      ["4", W],
      ["7", NW],
    ];
    for (const [k, dir] of pad) {
      const button = 0x4000 | k.charCodeAt(0); // MOD_NUM_KEYPAD
      expect(inertiaGame.interpretMove(s, ui(), null, { x: 0, y: 0 }, button)).toEqual({
        type: "move",
        dir,
      });
    }
  });

  it("takes the bare digits too, so the diagonals are keyboard-reachable", () => {
    // The web frontend never sets MOD_NUM_KEYPAD (it maps any single character
    // to its char code), so without this the diagonals would be mouse-only.
    const { params, desc } = board(["bbbbb", "bbbbb", "bbSbg", "bbbbb", "bbbbb"]);
    const s = newState(params, desc);
    for (const [k, dir] of [
      ["7", NW],
      ["9", NE],
      ["1", SW],
      ["3", SE],
    ] as const) {
      expect(
        inertiaGame.interpretMove(s, ui(), null, { x: 0, y: 0 }, k.charCodeAt(0)),
      ).toEqual({ type: "move", dir });
    }
    // A digit Inertia doesn't bind is simply not a move.
    expect(
      inertiaGame.interpretMove(s, ui(), null, { x: 0, y: 0 }, "5".charCodeAt(0)),
    ).toBeNull();
  });

  it("takes the direction of a click from the octant it lands in", () => {
    const { params, desc } = board(["bbbbb", "bbbbb", "bbSbg", "bbbbb", "bbbbb"]);
    const s = newState(params, desc);
    const ts = 32;
    const ds = inertiaGame.newDrawState?.(s);
    if (!ds) throw new Error("expected a drawstate");
    inertiaGame.setTileSize?.(ds, ts);
    // Click on the cell two to the right of the ball => east.
    const at = (cx: number, cy: number) => ({
      x: 1 + cx * ts + ts / 2,
      y: 1 + cy * ts + ts / 2,
    });

    expect(inertiaGame.interpretMove(s, ui(), ds, at(4, 2), 0x0200)).toEqual({
      type: "move",
      dir: E,
    });
    expect(inertiaGame.interpretMove(s, ui(), ds, at(2, 0), 0x0200)).toEqual({
      type: "move",
      dir: N,
    });
    expect(inertiaGame.interpretMove(s, ui(), ds, at(0, 4), 0x0200)).toEqual({
      type: "move",
      dir: SW,
    });
    // Clicking the ball's own square is not a direction at all.
    expect(inertiaGame.interpretMove(s, ui(), ds, at(2, 2), 0x0200)).toBeNull();
  });
});

// --- the deaths tally ------------------------------------------------

describe("inertia deaths tally", () => {
  it("counts a death once, and undo/redo does not re-count it", () => {
    const { params, desc } = board(["Smbbg", "wwwww"]);
    const { m, status } = harness();
    expect(m.newGameFromId(`${params.w}x${params.h}:${desc}`)).toBeUndefined();

    // Drive the death through the real input path, so `justMadeMove` is set
    // exactly as it is in play.
    m.processInput(0, 0, key("right"));
    expect(status()).toContain("DEAD!");
    expect(status()).toContain("Deaths: 1");

    m.undo();
    expect(status()).toContain("Deaths: 1"); // undoing does not un-kill you

    m.redo();
    expect(status()).toContain("Deaths: 1"); // and redoing does not kill you twice
  });

  it("counts the gems left in the status bar, and announces completion", () => {
    const { params, desc } = board(["Sggb", "wwww"]);
    const { m, status } = harness();
    expect(m.newGameFromId(`${params.w}x${params.h}:${desc}`)).toBeUndefined();
    expect(status()).toBe("Gems: 2");

    m.processInput(0, 0, key("right"));
    expect(status()).toBe("COMPLETED!");
  });
});

// --- the route aid ---------------------------------------------------

describe("inertia route aid", () => {
  /** A board with two gems that need two separate slides to collect. */
  const TWO_GEM = board(["Sbbg", "bwbw", "bbbb", "gbbb"]);

  it("solve installs a route without moving the ball or finishing the game", () => {
    const s0 = newState(TWO_GEM.params, TWO_GEM.desc);
    const result = inertiaGame.solve?.(s0, s0);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;

    const s1 = inertiaGame.executeMove(s0, result.move);
    expect([s1.px, s1.py]).toEqual([s0.px, s0.py]); // the ball has not moved
    expect(s1.gems).toBe(s0.gems); // no gems collected
    expect(inertiaGame.status(s1)).toBe("ongoing"); // and it is not finished
    expect(s1.cheated).toBe(true);
    expect(s1.route).not.toBeNull();
    expect(s1.routePos).toBe(0);
  });

  it("following the route advances it", () => {
    const s0 = newState(TWO_GEM.params, TWO_GEM.desc);
    const result = inertiaGame.solve?.(s0, s0);
    if (!result?.ok) throw new Error("expected a route");
    const s1 = inertiaGame.executeMove(s0, result.move);
    const route = s1.route ?? [];
    expect(route.length).toBeGreaterThan(1);

    const s2 = play(s1, route[0]);
    expect(s2.route).toBe(s1.route); // same route object, shared by reference
    expect(s2.routePos).toBe(1);
  });

  it("deviating from the route re-solves from where the ball ends up", () => {
    const s0 = newState(TWO_GEM.params, TWO_GEM.desc);
    const result = inertiaGame.solve?.(s0, s0);
    if (!result?.ok) throw new Error("expected a route");
    const s1 = inertiaGame.executeMove(s0, result.move);
    const route = s1.route ?? [];

    // Play some *other* legal direction than the one the route asks for.
    const wrong = [N, NE, E, SE, S, SW, W, NW].find(
      (d) =>
        d !== route[0] &&
        inertiaGame.interpretMove(s1, ui(), null, { x: 0, y: 0 }, padKey(d)) !== null,
    );
    expect(wrong).toBeDefined();
    if (wrong === undefined) return;

    const s2 = play(s1, wrong);
    expect(s2.route).not.toBeNull();
    expect(s2.routePos).toBe(0); // a fresh route, not an advanced one
    // And the fresh route is a real one: it collects the remaining gems.
    let end: InertiaState = s2;
    for (const d of s2.route ?? []) end = play(end, d);
    expect(end.gems).toBe(0);
  });

  it("collecting the last gem discards the route", () => {
    const one = board(["Sbbg", "wwww"]);
    const s0 = newState(one.params, one.desc);
    const result = inertiaGame.solve?.(s0, s0);
    if (!result?.ok) throw new Error("expected a route");
    const s1 = inertiaGame.executeMove(s0, result.move);

    const s2 = play(s1, E);
    expect(s2.gems).toBe(0);
    expect(s2.route).toBeNull();
  });

  it("dying discards the route", () => {
    const withMine = board(["Sbbg", "bmbb", "bbbb", "bbbb"]);
    const s0 = newState(withMine.params, withMine.desc);
    const result = inertiaGame.solve?.(s0, s0);
    if (!result?.ok) throw new Error("expected a route");
    const s1 = inertiaGame.executeMove(s0, result.move);

    const s2 = play(s1, SE); // straight into the mine
    expect(s2.dead).toBe(true);
    expect(s2.route).toBeNull();
  });

  it("Enter follows the route's next step", () => {
    const s0 = newState(TWO_GEM.params, TWO_GEM.desc);
    const result = inertiaGame.solve?.(s0, s0);
    if (!result?.ok) throw new Error("expected a route");
    const s1 = inertiaGame.executeMove(s0, result.move);

    const move = inertiaGame.interpretMove(s1, ui(), null, { x: 0, y: 0 }, 0x020d);
    expect(move).toEqual({ type: "move", dir: (s1.route ?? [])[0] });
  });

  it("refuses to solve an already-finished board", () => {
    const one = board(["Sbbg", "wwww"]);
    const done = play(newState(one.params, one.desc), E);
    expect(done.gems).toBe(0);
    expect(inertiaGame.solve?.(done, done)).toEqual({
      ok: false,
      error: "Game is already solved",
    });
  });
});

// --- generator + gem candidates --------------------------------------

describe("inertia generator", () => {
  it("generates boards with the right piece counts, and one start", () => {
    for (const p of [
      { w: 10, h: 8 },
      { w: 15, h: 12 },
    ]) {
      const { desc } = newInertiaDesc(p, randomNew(`gen-${p.w}x${p.h}`));
      expect(validateDesc(p, desc)).toBeNull();

      const wh = p.w * p.h;
      const fifth = Math.floor(wh / 5);
      // One fifth each of walls, stops and mines; one fifth gems, placed on
      // blank squares afterwards; exactly one start; the rest blank.
      const count = (c: string) => [...desc].filter((x) => x === c).length;
      expect(count("S")).toBe(1);
      expect(count("w")).toBe(fifth);
      expect(count("s")).toBe(fifth);
      expect(count("m")).toBe(fifth);
      expect(count("g")).toBe(fifth);
      expect(count("b")).toBe(wh - 4 * fifth - 1);
      expect(desc.length).toBe(wh);
    }
  });

  it("every generated board is completable", { timeout: 30_000 }, () => {
    for (let i = 0; i < 5; i++) {
      const p = { w: 10, h: 8 };
      const { desc } = newInertiaDesc(p, randomNew(`solvable-${i}`));
      let state: InertiaState = newState(p, desc);

      const result = solveRoute(state);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      for (const dir of result.route) state = play(state, dir);
      expect(state.dead).toBe(false);
      expect(inertiaGame.status(state)).toBe("solved");
    }
  });

  it("places every gem on a square that is on some round trip from the start", () => {
    // The candidate search is what makes a board completable at all, so check
    // its own contract: every gem the generator placed is a candidate square.
    const p = { w: 10, h: 8 };
    const { desc } = newInertiaDesc(p, randomNew("candidates"));
    const state = newState(p, desc);

    // Rebuild the pre-gem grid the generator ran the search on: gems were
    // placed on blank candidate squares, so blank them out again.
    const grid = Uint8Array.from(state.grid, (c) => (c === GEM ? BLANK : c));
    const { candidates } = findGemCandidates(grid, p.w, p.h, state.py * p.w + state.px);

    for (let i = 0; i < p.w * p.h; i++) {
      if (state.grid[i] === GEM) expect(candidates[i]).toBe(1);
    }
  });

  it("never marks a wall, mine or stop as a gem candidate", () => {
    const p = { w: 10, h: 8 };
    const { desc } = newInertiaDesc(p, randomNew("no-bad-candidates"));
    const state = newState(p, desc);
    const grid = Uint8Array.from(state.grid, (c) => (c === GEM ? BLANK : c));
    const { candidates } = findGemCandidates(grid, p.w, p.h, state.py * p.w + state.px);

    for (let i = 0; i < p.w * p.h; i++) {
      if (candidates[i]) expect(grid[i]).toBe(BLANK);
      if (state.grid[i] === WALL || state.grid[i] === MINE) {
        expect(candidates[i]).toBe(0);
      }
    }
  });
});

// --- save / load -----------------------------------------------------

describe("inertia save round-trip", () => {
  it("restores a solved-with-help game, route and all", () => {
    const { m } = harness();
    expect(m.newGameFromId(SEED_ID)).toBeUndefined();
    expect(m.solve()).toBeUndefined();
    m.processInput(0, 0, 0x020d); // Enter: follow one step of the route

    const before = m.formatAsText();
    const saved = m.saveGame();

    const restored = harness();
    expect(restored.m.loadGame(saved)).toBeUndefined();
    expect(restored.m.formatAsText()).toBe(before);
    // The route is rebuilt by replaying the solve move, so the arrow is back.
    expect(restored.status()).toContain("Auto-solver used.");
  });
});

// --- rendering (tier 2.5) --------------------------------------------

describe("inertia rendering", () => {
  it("draws the opening frame", () => {
    const { recording } = renderScenario({ game: inertiaGame, id: SEED_ID });
    expect(recording.ops.length).toBeGreaterThan(0);
    // Gems are diamonds, mines are circles.
    expect(recording.ops.some((o) => o.op === "polygon" && o.fill === COL_GEM)).toBe(
      true,
    );
    expect(recording.ops.some((o) => o.op === "circle" && o.fill === COL_MINE)).toBe(
      true,
    );
    // No route installed, so no route arrow.
    expect(recording.ops.some((o) => o.op === "polygon" && o.fill === COL_HINT)).toBe(
      false,
    );
    expect(recording.ops).toMatchSnapshot();
  });

  it("draws the route arrow once a route is installed", () => {
    const { recording } = renderScenario({
      game: inertiaGame,
      id: SEED_ID,
      moves: [{ type: "route", route: routeForSeed() }],
    });
    expect(recording.ops.some((o) => o.op === "polygon" && o.fill === COL_HINT)).toBe(
      true,
    );
  });

  it("draws the dead ball as a red splat, once the slide has played out", () => {
    // Straight into a mine, one square east of the ball. `settle` runs the
    // animation clock out: mid-slide the ball is still a live green circle,
    // and only the landed frame shows the splat.
    const { params, desc } = board(["Smbg", "bbbb"]);
    const id = `${params.w}x${params.h}:${desc}`;
    const moves = [{ type: "move" as const, dir: E }];

    const midSlide = renderScenario({ game: inertiaGame, id, moves });
    expect(
      midSlide.recording.ops.some((o) => o.op === "circle" && o.fill === COL_PLAYER),
    ).toBe(true);

    const landed = renderScenario({ game: inertiaGame, id, moves, settle: true });
    expect(
      landed.recording.ops.some(
        (o) => o.op === "polygon" && o.fill === COL_DEAD_PLAYER,
      ),
    ).toBe(true);
    expect(
      landed.recording.ops.some((o) => o.op === "circle" && o.fill === COL_PLAYER),
    ).toBe(false);
  });
});

/** The route the solver picks for `SEED_ID` — the same move the Solve button
 * makes, so the scenario can be driven to a route-installed frame. */
function routeForSeed(): number[] {
  const p = { w: 10, h: 8 };
  const { desc } = newInertiaDesc(p, randomNew("inertia-test"));
  const result = solveRoute(newState(p, desc));
  if (!result.ok) throw new Error(result.error);
  return result.route;
}

// --- small helpers ---------------------------------------------------

function ui() {
  return inertiaGame.newUi(newState({ w: 3, h: 2 }, "sSgbbb"));
}

/** The engine button code for an arrow key. */
function key(name: "up" | "down" | "left" | "right"): number {
  return { up: 0x0209, down: 0x020a, left: 0x020b, right: 0x020c }[name];
}

/** The number-pad button code for a direction (the pad layout is the compass). */
function padKey(dir: number): number {
  return 0x4000 | "89632147"[dir].charCodeAt(0);
}
