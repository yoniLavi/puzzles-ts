/**
 * Loopy's keyboard — the one game of fifty-seven that had none.
 *
 * Three kinds of guarantee, in the order they were written:
 *
 * 1. **A coverage proof over all 23 presets** (`add-loopy-keyboard-control`
 *    design D5). The arrow rule in `cursor.ts` claims every edge is reachable
 *    from either endpoint by pressing one arrow at most `degree` times. That is
 *    walked mechanically here, per tiling, rather than argued — and the
 *    triangular case shows *why* the repeat press exists, by exhibiting the
 *    edge that plain angular-nearest strands from both ends.
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
  edgesByDirection,
  farDot,
  type LoopyCursor,
  newLoopyCursor,
  nextEdgeFor,
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
/** `LoopyParams.type` index of the triangular grid, the degree-6 case. */
const TRIANGULAR = 1;

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

/** Press `arrow` `count` times from a fresh cursor on `dot`, exactly as
 * `interpretMove` would, and return the edge highlighted after each press. */
function pressesFrom(dot: GridDot, arrow: number, count: number): GridEdge[] {
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

/** The dots a travel press (Shift+arrow) can reach from the cursor's start. */
function travelReachable(grid: Grid): Set<number> {
  const start = newLoopyCursor(grid).dot;
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const d = grid.dots[queue.pop() as number];
    for (const a of ARROWS) {
      const e = edgesByDirection(d, a)?.[0];
      if (e === undefined) continue;
      const far = farDot(e, d).index;
      if (!seen.has(far)) {
        seen.add(far);
        queue.push(far);
      }
    }
  }
  return seen;
}

describe("the arrow rule covers every edge on every tiling (design D5)", () => {
  const presetList = allPresets();

  it("sees all 23 presets", () => {
    expect(presetList).toHaveLength(23);
  });

  for (const [i, p] of presetList.entries()) {
    it(`${encodeParams(p, true)}: every incident edge is reached from every dot, within degree presses`, () => {
      const { grid } = buildLoopyGrid(gridTypeOf(p), p.w, p.h, randomNew(`kb-${i}`));
      expect(grid.numDots).toBeGreaterThan(0);
      let maxDegree = 0;
      let unreachableRankZero = 0;

      for (const dot of grid.dots) {
        const degree = dot.edges.length;
        maxDegree = Math.max(maxDegree, degree);
        expect(degree).toBeGreaterThan(0);
        for (const arrow of ARROWS) {
          // `degree` presses of one arrow visit each incident edge exactly
          // once — which is the coverage claim — and the next press wraps.
          const cycle = pressesFrom(dot, arrow, degree + 1);
          expect(new Set(cycle.slice(0, degree).map((e) => e.index)).size).toBe(degree);
          expect(cycle[degree]).toBe(cycle[0]);
        }
      }

      // Every edge is reachable from *either* endpoint, and the proof is the
      // cycle above — so this is the same fact from the edge's side, kept as
      // the statement the design makes.
      for (const e of grid.edges) {
        for (const d of [e.dot1, e.dot2]) {
          const reached = ARROWS.some((a) =>
            pressesFrom(d, a, d.edges.length).some((x) => x === e),
          );
          expect(reached).toBe(true);
          // And how many edges would the *first* press alone never choose?
          const firstOnly = ARROWS.some((a) => pressesFrom(d, a, 1)[0] === e);
          if (!firstOnly) unreachableRankZero++;
        }
      }

      // Degree is small on every tiling, so the "at most degree presses"
      // bound is a handful. The design's one-seed sweep reported six as the
      // ceiling; this seed finds a degree-7 dot on Penrose rhombs, which is
      // why the rule is stated in terms of degree and not of a number.
      expect(maxDegree).toBeLessThanOrEqual(8);

      // Every dot can be *travelled* to (Shift+arrow walks the first-ranked
      // edge), so a keyboard player can start a loop anywhere on the board.
      expect(travelReachable(grid).size).toBe(grid.numDots);

      if (p.type === TRIANGULAR) {
        // The hole the repeat press closes, exhibited rather than described:
        // on the triangular grid some (dot, edge) pairs are the first choice
        // of *no* arrow. Without the repeat those edges would depend on their
        // other endpoint, and the design shows the same tie recurs there.
        expect(unreachableRankZero).toBeGreaterThan(0);
      }
    });
  }

  it("plain angular-nearest strands a triangular edge from both ends — the repeat is not decoration", () => {
    const p = presetList.find((q) => q.type === TRIANGULAR) as LoopyParams;
    const { grid } = buildLoopyGrid(gridTypeOf(p), p.w, p.h, randomNew("kb-tri"));
    const stranded = grid.edges.filter((e) =>
      [e.dot1, e.dot2].every((d) => !ARROWS.some((a) => pressesFrom(d, a, 1)[0] === e)),
    );
    expect(stranded.length).toBeGreaterThan(0);
    // ...and every one of them is reached once the repeat is allowed.
    for (const e of stranded) {
      expect(
        ARROWS.some((a) => pressesFrom(e.dot1, a, e.dot1.edges.length).includes(e)),
      ).toBe(true);
    }
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
      // Right from the top-left dot: the top edge of the top-left face.
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
      // The cursor may have travelled, so re-aim it at `e` by the arrow that
      // points back along it; the rule guarantees some arrow does within a
      // few presses.
      aimAt(byKey.s, byKey.ui, byKey.ds, e);
      const k = press(byKey.s, byKey.ui, byKey.ds, key) as LoopyMove;
      const c = click(byClick.s, byClick.ui, byClick.ds, e, button) as LoopyMove;
      expect(k).toEqual(c);
      expect(k.ops[0]).toEqual({ edge: e.index, state: expected });
      byKey.s = loopyGame.executeMove(byKey.s, k);
      byClick.s = loopyGame.executeMove(byClick.s, c);
    }
  });
});

/** Arrow the cursor (already on one of `e`'s endpoints) until `e` is chosen. */
function aimAt(s: LoopyState, ui: LoopyUi, ds: LoopyDrawState, e: GridEdge): void {
  if (ui.cursor.edge === e.index) return;
  const d = s.grid.dots[ui.cursor.dot];
  expect(e.dot1 === d || e.dot2 === d).toBe(true);
  for (const a of ARROWS) {
    ui.cursor.arrow = 0;
    for (let i = 0; i < d.edges.length; i++) {
      press(s, ui, ds, a);
      if (ui.cursor.edge === e.index) return;
    }
  }
  throw new Error("aimAt: edge not incident or rule broken");
}

describe("the cursor", () => {
  it("starts hidden on the top-left dot, and the first arrow reveals it with an edge chosen", () => {
    const { s, ui, ds } = board();
    expect(ui.cursor.visible).toBe(false);
    expect(ui.cursor.edge).toBe(-1);
    const d = s.grid.dots[ui.cursor.dot];
    for (const other of s.grid.dots) {
      expect(other.y > d.y || (other.y === d.y && other.x >= d.x)).toBe(true);
    }
    expect(press(s, ui, ds, CURSOR_RIGHT)).toBe(UI_UPDATE);
    expect(ui.cursor.visible).toBe(true);
    expect(ui.cursor.edge).toBeGreaterThanOrEqual(0);
    // The chosen edge leaves the cursor's dot heading right.
    const e = s.grid.edges[ui.cursor.edge];
    expect(farDot(e, d).x).toBeGreaterThan(d.x);
    expect(farDot(e, d).y).toBe(d.y);
  });

  it("repeats an arrow round the incident edges, and a new arrow starts afresh", () => {
    const { s, ui, ds } = board();
    // Walk to an interior dot (degree 4) by drawing: right, Enter advances.
    press(s, ui, ds, CURSOR_RIGHT);
    let st = loopyGame.executeMove(s, press(s, ui, ds, CURSOR_SELECT) as LoopyMove);
    press(st, ui, ds, CURSOR_DOWN);
    st = loopyGame.executeMove(st, press(st, ui, ds, CURSOR_SELECT) as LoopyMove);
    const d = st.grid.dots[ui.cursor.dot];
    expect(d.edges.length).toBe(4);

    ui.cursor.arrow = 0;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      press(st, ui, ds, CURSOR_RIGHT);
      seen.push(ui.cursor.edge);
    }
    expect(new Set(seen).size).toBe(4);
    press(st, ui, ds, CURSOR_RIGHT);
    expect(ui.cursor.edge).toBe(seen[0]); // wrapped

    // A different arrow ranks afresh: its first choice, not "next after".
    press(st, ui, ds, CURSOR_UP);
    const up = st.grid.edges[ui.cursor.edge];
    expect(farDot(up, d).y).toBeLessThan(d.y);
  });

  it("drawing a line carries the cursor to the far dot; nothing else moves it", () => {
    const { s, ui, ds } = board();
    press(s, ui, ds, CURSOR_RIGHT);
    const from = ui.cursor.dot;
    const e = s.grid.edges[ui.cursor.edge];
    const st = loopyGame.executeMove(s, press(s, ui, ds, CURSOR_SELECT) as LoopyMove);
    expect(ui.cursor.dot).toBe(farDot(e, s.grid.dots[from]).index);
    expect(ui.cursor.edge).toBe(e.index); // still chosen, from the other end
    expect(ui.cursor.arrow).toBe(0); // the next arrow ranks afresh

    // Enter again undraws it, and the cursor stays where it is.
    const undraw = press(st, ui, ds, CURSOR_SELECT) as LoopyMove;
    expect(undraw.ops[0]).toEqual({ edge: e.index, state: LINE_UNKNOWN });
    const st2 = loopyGame.executeMove(st, undraw);
    expect(ui.cursor.dot).toBe(farDot(e, s.grid.dots[from]).index);

    // A cross does not travel either.
    const cross = press(st2, ui, ds, CURSOR_SELECT2) as LoopyMove;
    expect(cross.ops[0].state).toBe(LINE_NO);
    expect(ui.cursor.dot).toBe(farDot(e, s.grid.dots[from]).index);
  });

  it("Shift+arrow travels one dot without touching the board", () => {
    const { s, ui, ds } = board();
    const from = ui.cursor.dot;
    expect(press(s, ui, ds, CURSOR_RIGHT | MOD_SHFT)).toBe(UI_UPDATE);
    expect(ui.cursor.visible).toBe(true);
    expect(ui.cursor.dot).not.toBe(from);
    expect(s.grid.dots[ui.cursor.dot].x).toBeGreaterThan(s.grid.dots[from].x);
    // One dot per press: a second press moves exactly one more.
    const mid = ui.cursor.dot;
    press(s, ui, ds, CURSOR_RIGHT | MOD_SHFT);
    const e = s.grid.edges[ui.cursor.edge];
    expect(farDot(e, s.grid.dots[ui.cursor.dot])).toBe(s.grid.dots[mid]);
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

  // Travel to a dot on the loop (BFS over Shift+arrow presses).
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
      const e = edgesByDirection(g.dots[di], a)?.[0];
      if (e === undefined) continue;
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
  for (const a of route) key(a | MOD_SHFT);
  expect(ui.cursor.dot).toBe(target);

  // Trace the loop: at each dot, arrow until the next loop edge is chosen,
  // then Enter — which draws it and carries the cursor to its far end.
  let drawn = 0;
  let guard = yes.size * 2;
  while (drawn < yes.size && guard-- > 0) {
    const d = g.dots[ui.cursor.dot];
    const next = d.edges.find((e) => yes.has(e.index) && s.lines[e.index] !== LINE_YES);
    expect(next).toBeDefined();
    let chosen = false;
    for (const a of ARROWS) {
      ui.cursor.arrow = 0;
      for (let i = 0; i < d.edges.length && !chosen; i++) {
        key(a);
        if (ui.cursor.edge === (next as GridEdge).index) chosen = true;
      }
      if (chosen) break;
    }
    expect(chosen).toBe(true);
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
    // and edge the midend's cursor chose, then check the marks sit on them.
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
