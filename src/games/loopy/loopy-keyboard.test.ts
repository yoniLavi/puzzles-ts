/**
 * Loopy's keyboard — the one game of fifty-seven that had none.
 *
 * Three kinds of guarantee, in the order they were written:
 *
 * 1. **A coverage proof over all 23 presets** (`add-loopy-keyboard-control`
 *    design D5). A plain arrow *walks* the cursor along an edge, which becomes
 *    the chosen one, so an edge no walk ever takes is unselectable; Shift+arrow
 *    *aims* without moving, as the fallback. The claim is that the walk alone
 *    covers every edge of 22 presets and walk plus aim covers the 23rd
 *    (Penrose kite/dart), and that is walked mechanically here per tiling
 *    rather than argued — the triangular case exhibits the tie the opposite-
 *    sense tie-break exists for, and the Penrose case pins the residue so it
 *    cannot grow silently.
 * 2. **Equality, not the new path in isolation** (the Slide lesson). The same
 *    edge is set by keyboard and by pointer and the two moves compared,
 *    autofollow included. A keyboard path asserted alone passes just as happily
 *    against the second input model this design set out not to build.
 * 3. **A frame.** A coverage proof says an edge is reachable and nothing about
 *    whether a player can see the cursor on a Penrose patch; that is a
 *    rendering question, so the cursor is captured on an aperiodic tiling.
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import type { Grid, GridDot, GridEdge } from "../../engine/grid/index.ts";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  MOD_SHFT,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import {
  type DrawOp,
  RecordingDrawing,
} from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { sizedDrawState } from "../../engine/testing/sized-draw-state.ts";
import {
  farDot,
  type LoopyCursor,
  newLoopyCursor,
  nextEdgeFor,
  walkEdge,
} from "./cursor.ts";
import { newDesc } from "./generator.ts";
import { buildLoopyGrid } from "./grid-build.ts";
import { AF_FIXED, type LoopyMove, type LoopyUi, loopyGame } from "./index.ts";
import {
  DIFF_EASY,
  DIFF_MAX,
  encodeParams,
  gridTypeOf,
  type LoopyParams,
  presets,
} from "./params.ts";
import {
  border,
  COL_CURSOR,
  computeSize,
  type LoopyDrawState,
  PREFERRED_TILE_SIZE,
} from "./render.ts";
import { solveGame } from "./solver.ts";
import { LINE_NO, LINE_UNKNOWN, LINE_YES, type LoopyState, newState } from "./state.ts";

const ARROWS = [CURSOR_UP, CURSOR_RIGHT, CURSOR_DOWN, CURSOR_LEFT] as const;
const ESCAPE = 27;
const BACKSPACE = 127;
/** `LoopyParams.type` indices: the triangular grid (degree 6, the tie case)
 * and Penrose kite/dart (degree 5 at 72°, the walk's one residue). */
const TRIANGULAR = 1;
const PENROSE_KITE_DART = 11;

/** Every preset, both menu levels flattened. */
function allPresets(): LoopyParams[] {
  const out: LoopyParams[] = [];
  const walk = (menu: { params?: LoopyParams; submenu?: unknown[] }) => {
    if (menu.params) out.push(menu.params);
    for (const sub of menu.submenu ?? [])
      walk(sub as { params?: LoopyParams; submenu?: unknown[] });
  };
  walk(presets());
  return out;
}

/** Aim `arrow` `count` times from a fresh cursor on `dot`, exactly as a
 * Shift+arrow press would, and return the edge chosen after each press. */
function aimsFrom(dot: GridDot, arrow: number, count: number): GridEdge[] {
  const cursor: LoopyCursor = { dot: dot.index, edge: -1, arrow: 0, visible: false };
  const seen: GridEdge[] = [];
  for (let i = 0; i < count; i++) {
    const e = nextEdgeFor(cursor, dot, arrow);
    if (e === null) break;
    cursor.edge = e.index;
    cursor.arrow = arrow;
    seen.push(e);
  }
  return seen;
}

/** The edges some walk takes, and the dots a walk from the start can reach. */
function walkCoverage(grid: Grid): { edges: Set<number>; dots: Set<number> } {
  const edges = new Set<number>();
  for (const d of grid.dots) {
    for (const a of ARROWS) {
      const e = walkEdge(d, a);
      if (e) edges.add(e.index);
    }
  }
  const start = newLoopyCursor(grid).dot;
  const dots = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const d = grid.dots[queue.pop() as number];
    for (const a of ARROWS) {
      const e = walkEdge(d, a);
      if (!e) continue;
      const far = farDot(e, d).index;
      if (!dots.has(far)) {
        dots.add(far);
        queue.push(far);
      }
    }
  }
  return { edges, dots };
}

describe("walking covers every edge, and aiming covers the rest (design D5)", () => {
  const presetList = allPresets();

  it("sees all 23 presets", () => {
    expect(presetList).toHaveLength(23);
  });

  for (const [i, p] of presetList.entries()) {
    it(`${encodeParams(p, true)}: every edge is walkable, or aimable where the walk cannot reach`, () => {
      const { grid } = buildLoopyGrid(gridTypeOf(p), p.w, p.h, randomNew(`kb-${i}`));
      expect(grid.numDots).toBeGreaterThan(0);
      const { edges, dots } = walkCoverage(grid);
      const unwalkable = grid.edges.filter((e) => !edges.has(e.index));

      // Every dot can be walked to from where the cursor starts.
      expect(dots.size).toBe(grid.numDots);

      // A walk never goes against its arrow: the edge taken lies within 90°.
      for (const d of grid.dots) {
        for (const a of ARROWS) {
          const e = walkEdge(d, a);
          if (!e) continue;
          const far = farDot(e, d);
          const [dx, dy] =
            a === CURSOR_UP
              ? [0, -1]
              : a === CURSOR_DOWN
                ? [0, 1]
                : a === CURSOR_LEFT
                  ? [-1, 0]
                  : [1, 0];
          expect(dx * (far.x - d.x) + dy * (far.y - d.y)).toBeGreaterThan(0);
        }
      }

      if (p.type === PENROSE_KITE_DART) {
        // The one tiling with a residue: degree-5 dots at 72° leave an edge
        // that is not the nearest choice from either end. Pinned, so it can
        // only shrink — and every one of them is aimable from an endpoint.
        expect(unwalkable.length).toBeGreaterThan(0);
        expect(unwalkable.length).toBeLessThanOrEqual(9);
        for (const e of unwalkable) {
          const aimable = [e.dot1, e.dot2].some((d) =>
            ARROWS.some((a) => aimsFrom(d, a, d.edges.length).includes(e)),
          );
          expect(aimable).toBe(true);
        }
      } else {
        expect(unwalkable).toEqual([]);
      }

      // Aiming itself: `degree` presses of one arrow visit each incident edge
      // exactly once and the next press wraps, from every dot.
      for (const dot of grid.dots) {
        const degree = dot.edges.length;
        for (const arrow of ARROWS) {
          const cycle = aimsFrom(dot, arrow, degree + 1);
          expect(new Set(cycle.slice(0, degree).map((e) => e.index)).size).toBe(degree);
          expect(cycle[degree]).toBe(cycle[0]);
        }
      }
    });
  }

  it("the opposite-sense tie-break is what covers the triangular grid", () => {
    // Under a same-sense tie-break, an edge tied at 60° either side of Right
    // from one end sits at the same tie either side of Left from the other, and
    // both ends resolve it the same way — so a third of the edges are never
    // walked. Shown by counting what the *shipped* rule leaves: nothing.
    const p = presetList.find((q) => q.type === TRIANGULAR) as LoopyParams;
    const { grid } = buildLoopyGrid(gridTypeOf(p), p.w, p.h, randomNew("kb-tri"));
    const tied = grid.dots.filter((d) => d.edges.length === 6);
    expect(tied.length).toBeGreaterThan(0);
    expect(walkCoverage(grid).edges.size).toBe(grid.numEdges);
    // ...and Right and Left do break the tie in opposite senses at such a dot.
    const d = tied[0];
    const right = walkEdge(d, CURSOR_RIGHT) as GridEdge;
    const left = walkEdge(d, CURSOR_LEFT) as GridEdge;
    const cross = (e: GridEdge) => {
      const f = farDot(e, d);
      return f.y - d.y; // sign of the vertical component
    };
    // Right prefers the clockwise (downward) edge; Left the counter-clockwise
    // (also downward, from Left's point of view) — i.e. both walks head down,
    // which is the two tied edges resolving in opposite rotational senses.
    expect(Math.sign(cross(right))).toBe(Math.sign(cross(left)));
  });
});

// --- a board to drive -------------------------------------------------------

function board(type = 0, w = 7, h = 7, seed = "loopy-kb") {
  const p: LoopyParams = { w, h, diff: DIFF_EASY, type };
  const { desc } = newDesc(p, randomNew(seed));
  const s = newState(p, desc);
  const ui = loopyGame.newUi(s);
  const ds = sizedDrawState(loopyGame, s);
  return { p, desc, s, ui, ds };
}

function press(s: LoopyState, ui: LoopyUi, ds: LoopyDrawState, button: number) {
  return loopyGame.interpretMove(s, ui, ds, { x: 0, y: 0 }, button);
}

/** Screen position of an edge's midpoint — where a pointer would click it. */
function midpoint(s: LoopyState, ds: LoopyDrawState, e: GridEdge) {
  const g = s.grid;
  const ts = ds.tileSize;
  const b = border(ts);
  const gx = (e.dot1.x + e.dot2.x) / 2;
  const gy = (e.dot1.y + e.dot2.y) / 2;
  return {
    x: Math.round(((gx - g.lowestX) * ts) / g.tileSize) + b,
    y: Math.round(((gy - g.lowestY) * ts) / g.tileSize) + b,
  };
}

function click(
  s: LoopyState,
  ui: LoopyUi,
  ds: LoopyDrawState,
  e: GridEdge,
  button: number,
) {
  return loopyGame.interpretMove(s, ui, ds, midpoint(s, ds, e), button);
}

describe("keyboard and pointer are the same move (the Slide rule)", () => {
  for (const autofollow of [0, AF_FIXED]) {
    it(`sets the same edge to the same state, autofollow ${autofollow ? "on" : "off"}`, () => {
      const byKey = board();
      byKey.ui.autofollow = autofollow;
      // Right from the top-left dot walks the top edge of the top-left face.
      expect(press(byKey.s, byKey.ui, byKey.ds, CURSOR_RIGHT)).toBe(UI_UPDATE);
      const e = byKey.s.grid.edges[byKey.ui.cursor.edge];
      const keyMove = press(byKey.s, byKey.ui, byKey.ds, CURSOR_SELECT) as LoopyMove;

      const byClick = board();
      byClick.ui.autofollow = autofollow;
      const clickMove = click(byClick.s, byClick.ui, byClick.ds, e, LEFT_BUTTON);

      expect(keyMove).toEqual(clickMove);
      expect(keyMove.kind).toBe("set");
      expect(keyMove.ops.every((op) => op.state === LINE_YES)).toBe(true);
      // With autofollow on the corner dot has one other edge, so the click is
      // extended round the corner — and so, identically, is the keypress.
      expect(keyMove.ops.length).toBe(autofollow ? 2 : 1);

      const afterKey = loopyGame.executeMove(byKey.s, keyMove);
      const afterClick = loopyGame.executeMove(byClick.s, clickMove as LoopyMove);
      expect([...afterKey.lines]).toEqual([...afterClick.lines]);
    });
  }

  it("Enter, Space and Backspace are the left, right and middle buttons", () => {
    const byKey = board();
    press(byKey.s, byKey.ui, byKey.ds, CURSOR_RIGHT);
    const e = byKey.s.grid.edges[byKey.ui.cursor.edge];
    const byClick = board();

    for (const [key, button, expected] of [
      [CURSOR_SELECT, LEFT_BUTTON, LINE_YES],
      [CURSOR_SELECT, LEFT_BUTTON, LINE_UNKNOWN],
      [CURSOR_SELECT2, RIGHT_BUTTON, LINE_NO],
      [BACKSPACE, MIDDLE_BUTTON, LINE_UNKNOWN],
      [CURSOR_SELECT2, RIGHT_BUTTON, LINE_NO],
      [CURSOR_SELECT2, RIGHT_BUTTON, LINE_UNKNOWN],
    ] as const) {
      // A select never moves the cursor, so `e` stays chosen throughout.
      expect(byKey.ui.cursor.edge).toBe(e.index);
      const k = press(byKey.s, byKey.ui, byKey.ds, key) as LoopyMove;
      const c = click(byClick.s, byClick.ui, byClick.ds, e, button) as LoopyMove;
      expect(k).toEqual(c);
      expect(k.ops[0]).toEqual({ edge: e.index, state: expected });
      byKey.s = loopyGame.executeMove(byKey.s, k);
      byClick.s = loopyGame.executeMove(byClick.s, c);
    }
  });
});

describe("the cursor", () => {
  it("starts hidden on the top-left dot; the first arrow reveals it and walks one edge", () => {
    const { s, ui, ds } = board();
    expect(ui.cursor.visible).toBe(false);
    expect(ui.cursor.edge).toBe(-1);
    const start = s.grid.dots[ui.cursor.dot];
    for (const other of s.grid.dots) {
      expect(other.y > start.y || (other.y === start.y && other.x >= start.x)).toBe(
        true,
      );
    }
    expect(press(s, ui, ds, CURSOR_RIGHT)).toBe(UI_UPDATE);
    expect(ui.cursor.visible).toBe(true);
    // Moved one dot to the right, and the edge just walked is the chosen one.
    const here = s.grid.dots[ui.cursor.dot];
    expect(here.x).toBeGreaterThan(start.x);
    expect(here.y).toBe(start.y);
    const e = s.grid.edges[ui.cursor.edge];
    expect(new Set([e.dot1, e.dot2])).toEqual(new Set([start, here]));
  });

  it("does not walk against the arrow: Up at the top-left corner does nothing", () => {
    const { s, ui, ds } = board();
    expect(press(s, ui, ds, CURSOR_UP)).toBeNull();
    expect(press(s, ui, ds, CURSOR_LEFT)).toBeNull();
    expect(ui.cursor.visible).toBe(false);
  });

  it("Enter marks the edge behind you and stays put; walking back and Enter undraws it", () => {
    const { s, ui, ds } = board();
    press(s, ui, ds, CURSOR_RIGHT);
    const here = ui.cursor.dot;
    const e = s.grid.edges[ui.cursor.edge];
    const draw = press(s, ui, ds, CURSOR_SELECT) as LoopyMove;
    expect(draw.ops[0]).toEqual({ edge: e.index, state: LINE_YES });
    const st = loopyGame.executeMove(s, draw);
    expect(ui.cursor.dot).toBe(here); // no auto-advance: already at the far end

    // Walk back over it: the same edge is chosen again, and Enter clears it.
    press(st, ui, ds, CURSOR_LEFT);
    expect(ui.cursor.edge).toBe(e.index);
    const undraw = press(st, ui, ds, CURSOR_SELECT) as LoopyMove;
    expect(undraw.ops[0]).toEqual({ edge: e.index, state: LINE_UNKNOWN });
  });

  it("Shift+arrow aims without moving, and a repeat takes the next edge round", () => {
    const { s, ui, ds } = board();
    // Walk to an interior dot (degree 4).
    press(s, ui, ds, CURSOR_RIGHT);
    press(s, ui, ds, CURSOR_DOWN);
    const d = s.grid.dots[ui.cursor.dot];
    expect(d.edges.length).toBe(4);

    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      expect(press(s, ui, ds, CURSOR_RIGHT | MOD_SHFT)).toBe(UI_UPDATE);
      expect(ui.cursor.dot).toBe(d.index); // never moves
      seen.push(ui.cursor.edge);
    }
    expect(new Set(seen).size).toBe(4);
    press(s, ui, ds, CURSOR_RIGHT | MOD_SHFT);
    expect(ui.cursor.edge).toBe(seen[0]); // wrapped

    // A different arrow aims afresh: its nearest, not "next after".
    press(s, ui, ds, CURSOR_UP | MOD_SHFT);
    expect(farDot(s.grid.edges[ui.cursor.edge], d).y).toBeLessThan(d.y);

    // And a plain arrow after aiming walks, ranking afresh from this dot.
    press(s, ui, ds, CURSOR_RIGHT);
    expect(s.grid.dots[ui.cursor.dot].x).toBeGreaterThan(d.x);
  });

  it("a select with nothing chosen only reveals; Escape hides; a pointer press hides", () => {
    const { s, ui, ds } = board();
    expect(press(s, ui, ds, CURSOR_SELECT)).toBe(UI_UPDATE);
    expect(ui.cursor.visible).toBe(true);
    expect(press(s, ui, ds, CURSOR_SELECT)).toBeNull(); // already shown, nothing to set

    expect(press(s, ui, ds, ESCAPE)).toBe(UI_UPDATE);
    expect(ui.cursor.visible).toBe(false);
    expect(press(s, ui, ds, ESCAPE)).toBeNull();

    press(s, ui, ds, CURSOR_RIGHT);
    expect(ui.cursor.visible).toBe(true);
    const e = s.grid.edges[0];
    const move = click(s, ui, ds, e, LEFT_BUTTON);
    expect(move).not.toBeNull();
    expect(move).not.toBe(UI_UPDATE);
    expect(ui.cursor.visible).toBe(false);

    // A click that sets nothing still repaints when it hid the cursor...
    press(s, ui, ds, CURSOR_RIGHT);
    expect(
      loopyGame.interpretMove(s, ui, ds, { x: -1000, y: -1000 }, LEFT_BUTTON),
    ).toBe(UI_UPDATE);
    // ...and is a no-op once it is already hidden.
    expect(
      loopyGame.interpretMove(s, ui, ds, { x: -1000, y: -1000 }, LEFT_BUTTON),
    ).toBeNull();
  });
});

// --- playing to completion -------------------------------------------------

/**
 * Drive a board to its solution with keys alone, through a real `Midend`,
 * mirroring every key at the game level so the result can be read back.
 */
function playToCompletionByKeyboard(type: number, w: number, h: number, seed: string) {
  const { p, desc, s: orig } = board(type, w, h, seed);
  const solution = solveGame(orig, DIFF_MAX).state;
  const g = orig.grid;
  const yes = new Set<number>();
  for (let i = 0; i < g.numEdges; i++) if (solution.lines[i] === LINE_YES) yes.add(i);
  expect(yes.size).toBeGreaterThan(3);

  const midend = new Midend(loopyGame);
  expect(midend.newGameFromId(`${encodeParams(p, true)}:${desc}`)).toBeUndefined();
  let s = orig;
  const ui = loopyGame.newUi(s);
  const ds = sizedDrawState(loopyGame, s);
  const key = (button: number) => {
    expect(midend.processInput(0, 0, button)).toBe(true);
    const r = press(s, ui, ds, button);
    if (r !== null && r !== UI_UPDATE) s = loopyGame.executeMove(s, r);
  };
  /** The arrow whose walk from `d` takes `e`, if any. */
  const arrowFor = (d: GridDot, e: GridEdge) =>
    ARROWS.find((a) => walkEdge(d, a) === e);

  // Walk to a dot on the loop (BFS over plain arrow presses).
  const onLoop = (d: GridDot) => d.edges.some((e) => yes.has(e.index));
  const start = ui.cursor.dot;
  const prev = new Map<number, [number, number]>(); // dot → [fromDot, arrow]
  const queue = [start];
  let target = -1;
  while (queue.length > 0 && target < 0) {
    const di = queue.shift() as number;
    if (onLoop(g.dots[di])) {
      target = di;
      break;
    }
    for (const a of ARROWS) {
      const e = walkEdge(g.dots[di], a);
      if (!e) continue;
      const far = farDot(e, g.dots[di]).index;
      if (far !== start && !prev.has(far)) {
        prev.set(far, [di, a]);
        queue.push(far);
      }
    }
  }
  expect(target).toBeGreaterThanOrEqual(0);
  const route: number[] = [];
  for (let d = target; d !== start; d = (prev.get(d) as [number, number])[0])
    route.unshift((prev.get(d) as [number, number])[1]);
  for (const a of route) key(a);
  expect(ui.cursor.dot).toBe(target);

  // Trace the loop: at each dot, walk the next loop edge and press Enter —
  // which marks the line just walked, the pen-behind-you model.
  let drawn = 0;
  let guard = yes.size * 2;
  while (drawn < yes.size && guard-- > 0) {
    const d = g.dots[ui.cursor.dot];
    const next = d.edges.find((e) => yes.has(e.index) && s.lines[e.index] !== LINE_YES);
    expect(next).toBeDefined();
    const a = arrowFor(d, next as GridEdge);
    expect(a).toBeDefined();
    key(a as number);
    expect(ui.cursor.edge).toBe((next as GridEdge).index);
    key(CURSOR_SELECT);
    drawn++;
  }
  expect(drawn).toBe(yes.size);
  return { s, midend, ui };
}

describe("a keyboard-only player completes a board", () => {
  it("on the square grid", () => {
    const { s } = playToCompletionByKeyboard(0, 5, 5, "kb-complete-square");
    expect(loopyGame.status(s)).toBe("solved");
  });

  it("on an aperiodic tiling (Hats)", () => {
    const { s } = playToCompletionByKeyboard(16, 6, 6, "kb-complete-hats");
    expect(loopyGame.status(s)).toBe("solved");
  });
});

// --- the frame -------------------------------------------------------------

describe("the cursor is drawn, on an aperiodic tiling", () => {
  function frame(type: number, w: number, h: number, seed: string) {
    const { p, desc, s } = board(type, w, h, seed);
    const midend = new Midend(loopyGame);
    expect(midend.newGameFromId(`${encodeParams(p, true)}:${desc}`)).toBeUndefined();
    midend.size(computeSize(p, PREFERRED_TILE_SIZE));
    const capture = () => {
      const rec = new RecordingDrawing(loopyGame.colours(DEFAULT_BACKGROUND));
      midend.redraw(rec);
      return rec.ops;
    };
    return { s, midend, capture };
  }
  const isHalo = (o: DrawOp) => o.op === "line" && o.colour === COL_CURSOR;
  const isDisc = (o: DrawOp) => o.op === "circle" && o.fill === COL_CURSOR;
  const cursorOps = (ops: readonly DrawOp[]) =>
    ops.filter((o) => isHalo(o) || isDisc(o));

  it("draws nothing until the first cursor key, then a halo on the edge and a disc on the dot", () => {
    const { s, midend, capture } = frame(17, 6, 6, "kb-render-spectres");
    expect(cursorOps(capture())).toHaveLength(0);

    expect(midend.processInput(0, 0, CURSOR_RIGHT)).toBe(true);
    const ops = capture();
    expect(
      cursorOps(ops)
        .map((o) => o.op)
        .sort(),
    ).toEqual(["circle", "line"]);

    // Where they land: mirror the cursor at the game level to know which dot
    // and edge the midend's cursor walked to, then check the marks sit on them.
    const ui = loopyGame.newUi(s);
    const ds = sizedDrawState(loopyGame, s);
    press(s, ui, ds, CURSOR_RIGHT);
    const d = s.grid.dots[ui.cursor.dot];
    const e = s.grid.edges[ui.cursor.edge];
    const at = (gx: number, gy: number) => {
      const g = s.grid;
      const b = border(PREFERRED_TILE_SIZE);
      return [
        Math.round(((gx - g.lowestX) * PREFERRED_TILE_SIZE) / g.tileSize) + b,
        Math.round(((gy - g.lowestY) * PREFERRED_TILE_SIZE) / g.tileSize) + b,
      ];
    };
    const discIndex = ops.findIndex(isDisc);
    const haloIndex = ops.findIndex(isHalo);
    const disc = ops[discIndex];
    const halo = ops[haloIndex];
    expect(disc.op === "circle" && [disc.cx, disc.cy]).toEqual(at(d.x, d.y));
    expect(
      halo.op === "line" && [
        [halo.x1, halo.y1],
        [halo.x2, halo.y2],
      ],
    ).toEqual([at(e.dot1.x, e.dot1.y), at(e.dot2.x, e.dot2.y)]);

    // The halo is under the edges and the disc under the dots: the state the
    // player is about to change stays legible on top of its own highlight.
    const firstEdge = ops.findIndex((o) => o.op === "line" && !isHalo(o));
    const firstDot = ops.findIndex((o) => o.op === "circle" && !isDisc(o));
    expect(haloIndex).toBeLessThan(firstEdge);
    expect(discIndex).toBeLessThan(firstDot);

    expect(ops).toMatchSnapshot();
  });

  it("goes away on a pointer press", () => {
    const { midend, capture } = frame(17, 6, 6, "kb-render-spectres");
    midend.processInput(0, 0, CURSOR_RIGHT);
    expect(cursorOps(capture())).toHaveLength(2);
    midend.processInput(-1000, -1000, LEFT_BUTTON);
    expect(cursorOps(capture())).toHaveLength(0);
  });
});
