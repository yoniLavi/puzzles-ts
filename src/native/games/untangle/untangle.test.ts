/**
 * Tier-1 behavioural tests for the Untangle port: the exact integer
 * crossing primitive, crossing/completion derivation, generation
 * invariants (planar / degree-capped / starts tangled), the
 * drag→executeMove round-trip, the 8-symmetry Solve, and the
 * move-log-replaces-supersede guarantee (save → moves → load reproduces
 * the vertex positions exactly).
 */

import { describe, expect, it } from "vitest";
import { Midend, UI_UPDATE } from "../../engine/index.ts";
import { LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE } from "../../engine/pointer.ts";
import { decodeSave } from "../../engine/save.ts";
import { randomNew } from "../../random/index.ts";
import { untangleGame } from "./index.ts";
import {
  cross,
  decodeGame,
  findCrossings,
  type RationalPoint,
  type UntangleMove,
} from "./state.ts";

const pt = (x: number, y: number, d = 1): RationalPoint => ({ x, y, d });

describe("cross() — exact integer segment intersection", () => {
  it("detects a clean X crossing", () => {
    expect(cross(pt(0, 0), pt(2, 2), pt(0, 2), pt(2, 0))).toBe(true);
  });
  it("rejects two clearly separate segments", () => {
    expect(cross(pt(0, 0), pt(1, 0), pt(0, 1), pt(1, 2))).toBe(false);
  });
  it("rejects parallel disjoint segments", () => {
    expect(cross(pt(0, 0), pt(2, 0), pt(0, 1), pt(2, 1))).toBe(false);
  });
  it("counts an endpoint lying on the other segment as a crossing", () => {
    // (1,1) is the midpoint of the first segment and an endpoint of the second.
    expect(cross(pt(0, 0), pt(2, 2), pt(1, 1), pt(3, 0))).toBe(true);
  });
  it("counts a collinear overlap as a crossing", () => {
    expect(cross(pt(0, 0), pt(2, 0), pt(1, 0), pt(3, 0))).toBe(true);
  });
  it("rejects a collinear gap (no overlap)", () => {
    expect(cross(pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0))).toBe(false);
  });
  it("is denominator-independent (mixed d)", () => {
    // Same geometry as the clean X, but the second segment uses d=2.
    expect(cross(pt(0, 0), pt(2, 2), pt(0, 4, 2), pt(4, 0, 2))).toBe(true);
  });
});

describe("findCrossings", () => {
  const edges = [
    { a: 0, b: 2 },
    { a: 1, b: 3 },
  ];
  it("flags both edges of a crossing pair and reports not-completed", () => {
    // A square's two diagonals cross.
    const pts = [pt(0, 0), pt(2, 0), pt(2, 2), pt(0, 2)];
    const { crosses, completed } = findCrossings(pts, edges);
    expect(crosses).toEqual([true, true]);
    expect(completed).toBe(false);
  });
  it("reports completed when no edges cross", () => {
    // Move the points so 0-2 and 1-3 no longer cross.
    const pts = [pt(0, 0), pt(1, 0), pt(0, 1), pt(1, 1)];
    const { crosses, completed } = findCrossings(pts, edges);
    expect(crosses).toEqual([false, false]);
    expect(completed).toBe(true);
  });
  it("ignores adjacent edges (sharing a vertex)", () => {
    const adj = [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
    ];
    const pts = [pt(0, 0), pt(1, 0), pt(2, 0)];
    expect(findCrossings(pts, adj).completed).toBe(true);
  });
});

describe("params", () => {
  it("round-trips and offers the five presets", () => {
    expect(
      untangleGame.decodeParams(untangleGame.encodeParams({ n: 10 }, true)),
    ).toEqual({
      n: 10,
    });
    const presets = untangleGame.presets().submenu;
    expect(presets?.map((p) => p.params?.n)).toEqual([6, 10, 15, 20, 25]);
  });
  it("rejects too-few and unreasonably-large", () => {
    expect(untangleGame.validateParams({ n: 3 }, true)).not.toBeNull();
    expect(untangleGame.validateParams({ n: 100000 }, true)).not.toBeNull();
    expect(untangleGame.validateParams({ n: 10 }, true)).toBeNull();
  });
});

/** Decode the solved layout the generator emits in `aux`. */
function parseAux(aux: string, n: number): RationalPoint[] {
  const parts = aux
    .slice(1)
    .split(";")
    .filter((p) => p.length > 0);
  expect(parts.length).toBe(n);
  return parts.map((p) => {
    const m = /^P\d+:(-?\d+),(-?\d+)\/(\d+)$/.exec(p);
    if (!m) throw new Error(`bad aux part ${p}`);
    return { x: Number(m[1]), y: Number(m[2]), d: Number(m[3]) };
  });
}

describe("generation invariants", () => {
  for (const n of [6, 10, 15, 20]) {
    it(`n=${n}: planar solution, degree ≤ 4, starts tangled`, () => {
      for (let seed = 0; seed < 8; seed++) {
        const { desc, aux } = untangleGame.newDesc(
          { n },
          randomNew(`gen-${n}-${seed}`),
        );
        expect(aux).toBeDefined();
        const edges = decodeGame(desc, n);

        // Degree cap: every vertex has at most MAXDEGREE = 4 edges.
        const degree = new Array<number>(n).fill(0);
        for (const e of edges) {
          degree[e.a]++;
          degree[e.b]++;
        }
        expect(Math.max(...degree)).toBeLessThanOrEqual(4);

        // The solved (aux) layout is crossing-free — i.e. planar.
        expect(findCrossings(parseAux(aux ?? "", n), edges).completed).toBe(true);

        // The initial circle layout has at least one crossing (never
        // starts solved).
        expect(untangleGame.newState({ n }, desc).completed).toBe(false);
      }
    });
  }
});

describe("moves and solve", () => {
  it("executeMove repositions a vertex and recomputes crossings", () => {
    const { desc } = untangleGame.newDesc({ n: 10 }, randomNew("move-seed"));
    const s0 = untangleGame.newState({ n: 10 }, desc);
    const move: UntangleMove = {
      kind: "place",
      points: [{ i: 0, x: 123, y: 45, d: 64 }],
      solving: false,
    };
    const s1 = untangleGame.executeMove(s0, move);
    expect(s1.pts[0]).toEqual({ x: 123, y: 45, d: 64 });
    expect(s1.pts[1]).toEqual(s0.pts[1]); // others untouched
    expect(s0.pts[0]).not.toEqual(s1.pts[0]); // original state immutable
  });

  it("a drag committed at fractional pointer coords stores integer coords (no BigInt RangeError)", () => {
    // Regression: pointer events can carry sub-pixel coords (dpr scaling).
    // An in-window fractional drop used to store a fractional vertex
    // coordinate, and `cross()`'s BigInt accumulator threw a RangeError
    // the moment crossings were recomputed.
    const { desc } = untangleGame.newDesc({ n: 10 }, randomNew("frac-drag"));
    const s0 = untangleGame.newState({ n: 10 }, desc);
    const ui = untangleGame.newUi(s0);
    const ds = untangleGame.newDrawState?.(s0);
    if (!ds) throw new Error("expected a drawstate");
    untangleGame.setTileSize?.(ds, 64);

    // Grab vertex 0 (circle layout: d = 64 = tileSize, so its rational
    // coordinate is already its pixel), then release at an in-window
    // fractional position.
    const v0 = s0.pts[0];
    untangleGame.interpretMove(s0, ui, ds, { x: v0.x, y: v0.y }, LEFT_BUTTON);
    const move = untangleGame.interpretMove(
      s0,
      ui,
      ds,
      { x: 160.25, y: 100.5 },
      LEFT_RELEASE,
    );
    expect(move).not.toBeNull();
    expect(move).not.toBe(UI_UPDATE);
    const s1 = untangleGame.executeMove(s0, move as UntangleMove);
    expect(Number.isInteger(s1.pts[0].x)).toBe(true);
    expect(Number.isInteger(s1.pts[0].y)).toBe(true);
  });

  it("fuzz: randomized fractional drags keep every coordinate integral and never throw", () => {
    // The fundamental guard: drive many drags through the real input
    // pipeline at arbitrary sub-pixel targets, with snap on and off and an
    // odd tile size that provokes fractional intermediates, and assert the
    // `RationalPoint` integer invariant holds after every committed move
    // (so `cross()` never sees a fraction).
    const { desc } = untangleGame.newDesc({ n: 10 }, randomNew("fuzz-drag"));
    let s = untangleGame.newState({ n: 10 }, desc);
    const ui = untangleGame.newUi(s);
    const ds = untangleGame.newDrawState?.(s);
    if (!ds) throw new Error("expected a drawstate");
    untangleGame.setTileSize?.(ds, 53); // odd size → fractional pixel mappings

    // Deterministic LCG so the fuzz is reproducible.
    let seed = 0x9e3779b1;
    const rnd = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const allIntegral = () =>
      s.pts.every(
        (p) => Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.d),
      );

    for (let iter = 0; iter < 250; iter++) {
      ui.snapToGrid = rnd() < 0.5;
      const vi = Math.floor(rnd() * s.n);
      const v = s.pts[vi];
      const px = (v.x * ds.tileSize) / v.d;
      const py = (v.y * ds.tileSize) / v.d;
      untangleGame.interpretMove(s, ui, ds, { x: px, y: py }, LEFT_BUTTON);
      // In-window fractional target (the case the RangeError came from).
      const tx = rnd() * s.w * ds.tileSize;
      const ty = rnd() * s.w * ds.tileSize;
      untangleGame.interpretMove(s, ui, ds, { x: tx, y: ty }, LEFT_DRAG);
      const move = untangleGame.interpretMove(
        s,
        ui,
        ds,
        { x: tx, y: ty },
        LEFT_RELEASE,
      );
      if (move && move !== UI_UPDATE) {
        s = untangleGame.executeMove(s, move as UntangleMove); // must not throw
        expect(allIntegral()).toBe(true);
      }
    }
  });

  it("a drag released far outside the area clamps to the boundary and commits (no cancel)", () => {
    // Owner-requested divergence from upstream's drag-off-to-cancel: a drop
    // outside the play area pins the vertex at the nearest in-bounds spot
    // and commits there rather than resetting to the start.
    const { desc } = untangleGame.newDesc({ n: 10 }, randomNew("clamp-drag"));
    const s0 = untangleGame.newState({ n: 10 }, desc);
    const ui = untangleGame.newUi(s0);
    const ds = untangleGame.newDrawState?.(s0);
    if (!ds) throw new Error("expected a drawstate");
    untangleGame.setTileSize?.(ds, 64);
    const size = s0.w * 64; // 5 * 64 = 320
    const margin = 8; // PLAY_BORDER_INSET (2) + CIRCLE_RADIUS (6)

    const v0 = s0.pts[0];
    untangleGame.interpretMove(s0, ui, ds, { x: v0.x, y: v0.y }, LEFT_BUTTON);
    // Drag far outside, then release (the live position rides the drag).
    untangleGame.interpretMove(s0, ui, ds, { x: 99999, y: -99999 }, LEFT_DRAG);
    const move = untangleGame.interpretMove(
      s0,
      ui,
      ds,
      { x: 99999, y: -99999 },
      LEFT_RELEASE,
    );
    // It commits (a move), not a cancel (UI_UPDATE).
    expect(move).not.toBeNull();
    expect(move).not.toBe(UI_UPDATE);
    const s1 = untangleGame.executeMove(s0, move as UntangleMove);
    const p = s1.pts[0];
    // Pinned to the nearest in-bounds corner: bottom-right x, top y.
    expect(p.x).toBe(size - margin);
    expect(p.y).toBe(margin);
  });

  it("executeMove rejects a non-integer coordinate (contract guard)", () => {
    const { desc } = untangleGame.newDesc({ n: 6 }, randomNew("int-guard"));
    const s0 = untangleGame.newState({ n: 6 }, desc);
    expect(() =>
      untangleGame.executeMove(s0, {
        kind: "place",
        points: [{ i: 0, x: 40.94, y: 10, d: 64 }],
        solving: false,
      }),
    ).toThrow(/integral/);
  });

  it("throws on a malformed move", () => {
    const { desc } = untangleGame.newDesc({ n: 6 }, randomNew("bad-move"));
    const s0 = untangleGame.newState({ n: 6 }, desc);
    expect(() =>
      untangleGame.executeMove(s0, {
        kind: "place",
        points: [{ i: 0, x: 1, y: 1, d: 0 }], // d must be > 0
        solving: false,
      }),
    ).toThrow();
  });

  it("Solve lands a crossing-free board", () => {
    for (let seed = 0; seed < 6; seed++) {
      const { desc, aux } = untangleGame.newDesc({ n: 10 }, randomNew(`solve-${seed}`));
      const init = untangleGame.newState({ n: 10 }, desc);
      const res = untangleGame.solve?.(init, init, aux);
      expect(res?.ok).toBe(true);
      if (!res?.ok) continue;
      const solved = untangleGame.executeMove(init, res.move);
      expect(untangleGame.status(solved)).toBe("solved");
    }
  });

  it("Solve refuses without aux", () => {
    const { desc } = untangleGame.newDesc({ n: 6 }, randomNew("no-aux"));
    const init = untangleGame.newState({ n: 6 }, desc);
    const res = untangleGame.solve?.(init, init, undefined);
    expect(res?.ok).toBe(false);
  });

  it("midend threads aux into Solve and reports solved status (regression)", () => {
    // The midend used to drop `aux` from `newDesc`, so Untangle's
    // aux-dependent Solve was a silent no-op.
    const me = new Midend(untangleGame);
    let lastStatus = "";
    me.setCallbacks(
      (n) => {
        if (n.type === "game-state-change") lastStatus = n.status;
      },
      () => {},
      () => {},
    );
    me.newGameFromId("10#midend-aux-status");
    me.solve();
    expect(lastStatus).toBe("solved-with-help");
  });

  it("midend Solve refuses on a loaded game (no aux this session)", () => {
    // Faithful to upstream: Solve only works on a freshly generated game.
    const gen = new Midend(untangleGame);
    gen.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    gen.newGameFromId("10#loaded-no-aux");
    const saved = gen.saveGame();

    const loaded = new Midend(untangleGame);
    loaded.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    loaded.loadGame(saved);
    expect(loaded.solve()).toBe("Solution not known for this puzzle");
  });
});

describe("save → moves → load reproduces vertex positions (move-log, no supersede)", () => {
  const playthrough = (): UntangleMove[] => [
    { kind: "place", points: [{ i: 0, x: 50, y: 60, d: 64 }], solving: false },
    { kind: "place", points: [{ i: 3, x: 120, y: 30, d: 64 }], solving: false },
    { kind: "place", points: [{ i: 5, x: 200, y: 180, d: 64 }], solving: false },
  ];

  it("state-level: fresh newState + replay yields identical pts", () => {
    const { desc } = untangleGame.newDesc({ n: 10 }, randomNew("replay"));
    const moves = playthrough();
    const apply = (): RationalPoint[] => {
      let s = untangleGame.newState({ n: 10 }, desc);
      for (const m of moves) s = untangleGame.executeMove(s, m);
      return s.pts;
    };
    expect(apply()).toEqual(apply());
    expect(apply()[0]).toEqual({ x: 50, y: 60, d: 64 });
  });

  it("midend-level: saveGame → loadGame → identical re-save (moves persisted)", () => {
    const me = new Midend(untangleGame);
    me.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    expect(me.newGameFromId("10#midend-save")).toBeUndefined();
    me.playMoves(playthrough());
    const saved = me.saveGame();

    const env = decodeSave(saved);
    expect(env.puzzleId).toBe("untangle");
    expect(env.moves.length).toBe(3);

    const me2 = new Midend(untangleGame);
    me2.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    expect(me2.loadGame(saved)).toBeUndefined();
    // Re-saving the loaded game yields the same bytes — desc + move log
    // (and thus every reconstructed position) round-tripped exactly.
    expect(Array.from(me2.saveGame())).toEqual(Array.from(saved));
  });
});

describe("preferences defaults", () => {
  it("ships show-crossed-edges ON, snap OFF, vertex-style Circles", () => {
    const me = new Midend(untangleGame);
    me.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    me.newGameFromId("10#prefs");
    expect(me.getPreferences()).toEqual({
      "snap-to-grid": false,
      "show-crossed-edges": true,
      "vertex-style": 0,
    });
    expect(me.getPreferencesConfig().items["vertex-style"]).toEqual({
      type: "choices",
      name: "Display style for vertices",
      choicenames: ["Circles", "Numbers"],
    });
  });
});
