/**
 * Behavioural tests for the Towers (Skyscrapers) port.
 *
 * Tier 1 — pure logic: params/desc codecs, the clue geometry, generator
 * quality (seeded; solvable, unique, correctly graded), move transitions,
 * completion + flash, findMistakes, and Solve through a real Midend (the aux
 * path). Tier 2.5 — render scenarios: a 3D initial frame, the 2D appearance,
 * and a mistake overlay, each with targeted op assertions plus a snapshot.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newTowersDesc } from "./generator.ts";
import { towersGame } from "./index.ts";
import { LEFT_BUTTON, RIGHT_BUTTON } from "../../engine/pointer.ts";
import {
  COL_ERROR,
  COL_PENCIL_BODY,
  coord,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE, solveTowers } from "./solver.ts";
import {
  clueIndex,
  cluePos,
  decodeParams,
  diffToLevel,
  encodeParams,
  isClue,
  lineCells,
  newState,
  newUi,
  type TowersMove,
  type TowersParams,
  type TowersState,
  validateDesc,
  validateParams,
} from "./state.ts";

function gen(w: number, diff: TowersParams["diff"], seed: string) {
  const p: TowersParams = { w, diff };
  const { desc, aux } = newTowersDesc(p, randomNew(seed));
  return { p, desc, aux, st: newState(p, desc) };
}

function solutionGrid(st: TowersState): number[] {
  const r = towersGame.solve?.(st, st);
  if (!r?.ok) throw new Error("solve failed");
  if (r.move.type !== "solve") throw new Error("expected solve move");
  return r.move.grid;
}

// --- tier 1: params --------------------------------------------------------

describe("towers params codec", () => {
  it("round-trips full and short forms", () => {
    expect(encodeParams({ w: 6, diff: "unreasonable" }, true)).toBe("6du");
    expect(encodeParams({ w: 6, diff: "unreasonable" }, false)).toBe("6");
    expect(decodeParams("6du")).toEqual({ w: 6, diff: "unreasonable" });
    expect(decodeParams("5dh")).toEqual({ w: 5, diff: "hard" });
    expect(decodeParams("4")).toEqual({ w: 4, diff: "easy" });
  });

  it("rejects out-of-range sizes", () => {
    expect(validateParams({ w: 2, diff: "easy" }, true)).not.toBeNull();
    expect(validateParams({ w: 10, diff: "easy" }, true)).not.toBeNull();
    expect(validateParams({ w: 5, diff: "easy" }, true)).toBeNull();
  });
});

// --- tier 1: clue geometry -------------------------------------------------

describe("towers clue geometry", () => {
  it("cluePos and clueIndex are inverse for every edge clue", () => {
    const w = 5;
    for (let i = 0; i < 4 * w; i++) {
      const { x, y } = cluePos(i, w);
      expect(clueIndex(x, y, w)).toBe(i);
    }
  });

  it("lineCells walks w in-grid cells nearest-clue-first", () => {
    const w = 5;
    // Top clue 0 scans column 0 top-to-bottom.
    expect(lineCells(0, w)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
      { x: 0, y: 4 },
    ]);
    // Right clue (3w + 0) scans row 0 right-to-left.
    expect(lineCells(3 * w, w)[0]).toEqual({ x: w - 1, y: 0 });
    for (let i = 0; i < 4 * w; i++) {
      const cells = lineCells(i, w);
      expect(cells).toHaveLength(w);
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(w);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(w);
      }
    }
  });

  it("isClue is true only at border positions carrying a clue", () => {
    const { st } = gen(5, "easy", "geo-clue");
    // Find a present clue and assert its border position reads as a clue.
    const idx = [...st.clues].findIndex((c) => c !== 0);
    expect(idx).toBeGreaterThanOrEqual(0);
    const { x, y } = cluePos(idx, 5);
    expect(isClue(st, x, y)).toBe(true);
    expect(isClue(st, 0, 0)).toBe(false); // interior cell is never a clue
  });
});

// --- tier 1: desc + generator ----------------------------------------------

describe("towers generator", () => {
  const cases: [number, TowersParams["diff"], string][] = [
    [4, "easy", "gen-4e"],
    [5, "hard", "gen-5h"],
    [6, "extreme", "gen-6x"],
    [6, "unreasonable", "gen-6u"],
  ];
  for (const [w, diff, seed] of cases) {
    it(`${w}d/${diff} is valid, unique and graded exactly at ${diff}`, () => {
      const { p, desc, aux, st } = gen(w, diff, seed);
      expect(validateDesc(p, desc)).toBeNull();
      // Givens land in both immutable and grid.
      for (let i = 0; i < w * w; i++) {
        if (st.immutable[i]) expect(st.grid[i]).toBe(st.immutable[i]);
        else expect(st.grid[i]).toBe(0);
      }
      // Uniquely solvable from the givens.
      const soln = Uint8Array.from(st.immutable);
      const ret = solveTowers(w, st.clues, soln, diffToLevel("unreasonable"));
      expect(ret).not.toBe(DIFF_IMPOSSIBLE);
      expect(ret).not.toBe(DIFF_AMBIGUOUS);
      // aux agrees with the solution.
      for (let i = 0; i < w * w; i++) expect(soln[i]).toBe(Number(aux[i + 1]));
      // Graded exactly at the requested difficulty.
      const graded = Uint8Array.from(st.immutable);
      expect(solveTowers(w, st.clues, graded, diffToLevel(diff))).toBe(
        diffToLevel(diff),
      );
    }, 30_000);
  }
});

// --- tier 1: moves + completion --------------------------------------------

describe("towers moves", () => {
  it("entering the full solution completes the board and flashes", () => {
    const { st } = gen(5, "easy", "moves-complete");
    const sol = solutionGrid(st);
    const empties: number[] = [];
    for (let i = 0; i < st.w * st.w; i++) if (!st.immutable[i]) empties.push(i);
    expect(empties.length).toBeGreaterThan(1);

    let cur = st;
    const w = st.w;
    for (const i of empties.slice(0, -1)) {
      cur = towersGame.executeMove(cur, {
        type: "set",
        x: i % w,
        y: (i / w) | 0,
        n: sol[i],
        pencil: false,
      });
    }
    expect(cur.completed).toBe(false);
    const before = cur;
    const last = empties[empties.length - 1];
    cur = towersGame.executeMove(cur, {
      type: "set",
      x: last % w,
      y: (last / w) | 0,
      n: sol[last],
      pencil: false,
    });
    expect(cur.completed).toBe(true);
    expect(towersGame.flashLength?.(before, cur, 1, newUi(cur))).toBeGreaterThan(0);
  });

  it("pencil marks toggle and pencilAll fills empties", () => {
    const { st } = gen(5, "easy", "moves-pencil");
    const i = [...st.immutable].indexOf(0);
    const w = st.w;
    const m: TowersMove = { type: "set", x: i % w, y: (i / w) | 0, n: 2, pencil: true };
    let s = towersGame.executeMove(st, m);
    expect(s.pencil[i] & (1 << 2)).toBeTruthy();
    s = towersGame.executeMove(s, m);
    expect(s.pencil[i] & (1 << 2)).toBeFalsy();

    const all = towersGame.executeMove(st, { type: "pencilAll" });
    for (let k = 0; k < w * w; k++) {
      if (!all.grid[k]) expect(all.pencil[k]).toBe((1 << (w + 1)) - (1 << 1));
    }
  });

  it("clueDone toggles and an immutable cell rejects entry", () => {
    const { st } = gen(5, "easy", "moves-clue");
    const idx = [...st.clues].findIndex((c) => c !== 0);
    const a = towersGame.executeMove(st, { type: "clueDone", index: idx });
    expect(a.cluesDone[idx]).toBe(1);
    const b = towersGame.executeMove(a, { type: "clueDone", index: idx });
    expect(b.cluesDone[idx]).toBe(0);

    const imm = [...st.immutable].findIndex((v) => v !== 0);
    if (imm >= 0) {
      const w = st.w;
      expect(() =>
        towersGame.executeMove(st, {
          type: "set",
          x: imm % w,
          y: (imm / w) | 0,
          n: 1,
          pencil: false,
        }),
      ).toThrow();
    }
  });
});

// --- tier 1: findMistakes --------------------------------------------------

describe("towers findMistakes", () => {
  it("flags a wrong tower, ignores pencil marks and givens", () => {
    const { st } = gen(5, "easy", "mistakes");
    const sol = solutionGrid(st);
    const w = st.w;
    const empty = [...st.immutable].indexOf(0);
    const wrong = (sol[empty] % w) + 1; // any height != the solution's
    expect(wrong).not.toBe(sol[empty]);

    const bad = towersGame.executeMove(st, {
      type: "set",
      x: empty % w,
      y: (empty / w) | 0,
      n: wrong,
      pencil: false,
    });
    const ms = towersGame.findMistakes?.(bad) ?? [];
    expect(ms).toContainEqual({ x: empty % w, y: (empty / w) | 0 });

    // A pencil mark is never a mistake.
    const other = [...st.immutable].findIndex((v, i) => v === 0 && i !== empty);
    const pencilled = towersGame.executeMove(st, {
      type: "set",
      x: other % w,
      y: (other / w) | 0,
      n: 3,
      pencil: true,
    });
    expect(towersGame.findMistakes?.(pencilled) ?? []).toHaveLength(0);
  });
});

// --- tier 1: Solve via a real Midend (aux path) ----------------------------

describe("towers Solve via Midend", () => {
  it("solves a freshly generated board and reports solved", () => {
    const me = new Midend(towersGame);
    expect(me.newGameFromId("6dh#towers-solve")).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    const solved = (me as unknown as { state: TowersState }).state;
    expect(solved.completed).toBe(true);
    expect(towersGame.status(solved)).toBe("solved");
  });

  it("save round-trips a played board", () => {
    const me = new Midend(towersGame);
    expect(me.newGameFromId("5de#towers-save")).toBeUndefined();
    const st = (me as unknown as { state: TowersState }).state;
    const i = [...st.immutable].indexOf(0);
    me.playMoves([
      { type: "set", x: i % st.w, y: (i / st.w) | 0, n: 1, pencil: false },
    ]);
    const saved = me.saveGame();
    const me2 = new Midend(towersGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect((me2 as unknown as { state: TowersState }).state.grid[i]).toBe(1);
  });
});

// --- tier 2.5: render scenarios --------------------------------------------

const RENDER = gen(6, "hard", "render-board");
const RENDER_ID = `6dh:${RENDER.desc}`;

function polygonCount(rec: RecordingDrawing): number {
  return rec.ops.filter((o) => o.op === "polygon").length;
}

describe("towers sticky pencil mode", () => {
  const ts = 32;
  // Click the centre of cell (cx, cy). 2D hit-testing (no 3D retargeting).
  const center = (cx: number, cy: number) => ({
    x: coord(cx, ts) + Math.floor(ts / 2),
    y: coord(cy, ts) + Math.floor(ts / 2),
  });

  function setup() {
    const { st } = gen(5, "easy", "sticky-1");
    const ui = newUi(st);
    ui.threeD = false;
    const ds = newDrawState(st);
    setTileSize(ds, ts);
    // Two distinct empty (non-immutable) cells to click.
    const empty: { x: number; y: number }[] = [];
    for (let i = 0; i < st.w * st.w && empty.length < 2; i++) {
      if (!st.immutable[i]) empty.push({ x: i % st.w, y: (i / st.w) | 0 });
    }
    return { st, ui, ds, a: empty[0], b: empty[1] };
  }

  it("sticky on (default): right-click enters pencil mode and left-clicks keep it", () => {
    const { st, ui, ds, a, b } = setup();
    // Right-click cell A → enter pencil mode.
    towersGame.interpretMove(st, ui, ds, center(a.x, a.y), RIGHT_BUTTON);
    expect(ui.hpencil).toBe(true);
    // Left-click a different cell → still in pencil mode (only the highlight moved).
    towersGame.interpretMove(st, ui, ds, center(b.x, b.y), LEFT_BUTTON);
    expect(ui.hpencil).toBe(true);
    expect([ui.hx, ui.hy]).toEqual([b.x, b.y]);
    // A digit now writes a pencil mark, not a real entry.
    const m = towersGame.interpretMove(st, ui, ds, center(b.x, b.y), 49 /* '1' */);
    expect(m).toEqual({ type: "set", x: b.x, y: b.y, n: 1, pencil: true });
    // Right-click again → toggle pencil mode back off.
    towersGame.interpretMove(st, ui, ds, center(a.x, a.y), RIGHT_BUTTON);
    expect(ui.hpencil).toBe(false);
  });

  it("right-click on a filled cell toggles the mode but does not select it", () => {
    const { st, ui, ds, a, b } = setup();
    // Fill cell B with a real digit, then enter pencil mode on empty cell A.
    const filled = towersGame.executeMove(st, {
      type: "set",
      x: b.x,
      y: b.y,
      n: 1,
      pencil: false,
    });
    towersGame.interpretMove(filled, ui, ds, center(a.x, a.y), RIGHT_BUTTON);
    expect(ui.hpencil).toBe(true);
    // Right-click the filled cell B: the mode toggles off, but the highlight
    // stays on the empty cell A (the filled cell is not selected/restyled).
    towersGame.interpretMove(filled, ui, ds, center(b.x, b.y), RIGHT_BUTTON);
    expect(ui.hpencil).toBe(false);
    expect([ui.hx, ui.hy]).toEqual([a.x, a.y]);
    expect(ui.hshow).toBe(true);
  });

  it("sticky off: a left-click reverts to real entry (upstream behaviour)", () => {
    const { st, ui, ds, a, b } = setup();
    ui.pencilSticky = false;
    towersGame.interpretMove(st, ui, ds, center(a.x, a.y), RIGHT_BUTTON);
    expect(ui.hpencil).toBe(true);
    towersGame.interpretMove(st, ui, ds, center(b.x, b.y), LEFT_BUTTON);
    expect(ui.hpencil).toBe(false);
  });
});

describe("towers render", () => {
  it("draws the pencil-mode indicator only while pencil mode is on", () => {
    const ts = towersGame.preferredTileSize ?? 48;
    const palette = towersGame.colours(DEFAULT_BACKGROUND);
    const render = (hpencil: boolean): RecordingDrawing => {
      const st = newState(RENDER.p, RENDER.desc);
      const ui = newUi(st);
      ui.hpencil = hpencil;
      ui.hshow = hpencil;
      const ds = newDrawState(st);
      setTileSize(ds, ts);
      const dr = new RecordingDrawing(palette);
      redraw(dr, ds, null, st, 1, ui, 0, 0);
      return dr;
    };
    // The indicator's pencil body is the only COL_PENCIL_BODY-filled polygon
    // (pencil marks are text; tower faces fill with background/highlight).
    const pencilGlyph = (r: RecordingDrawing) =>
      r.ops.some((o) => o.op === "polygon" && o.fill === COL_PENCIL_BODY);
    expect(pencilGlyph(render(true))).toBe(true);
    expect(pencilGlyph(render(false))).toBe(false);
  });

  it("draws the 3D initial frame with clues and tower solids", () => {
    const { recording } = renderScenario({ game: towersGame, id: RENDER_ID });
    // Clue digits are drawn as text.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    // 3D towers contribute extra face polygons beyond the box outlines.
    expect(polygonCount(recording)).toBeGreaterThan(0);
    expect(recording.ops).toMatchSnapshot();
  });

  it("the 2D appearance omits the tower-face polygons", () => {
    const ts = towersGame.preferredTileSize ?? 48;
    const palette = towersGame.colours(DEFAULT_BACKGROUND);

    const render3d = (threeD: boolean): RecordingDrawing => {
      const st = newState(RENDER.p, RENDER.desc);
      const ui = newUi(st);
      ui.threeD = threeD;
      const ds = newDrawState(st);
      setTileSize(ds, ts);
      const dr = new RecordingDrawing(palette);
      redraw(dr, ds, null, st, 1, ui, 0, 0);
      return dr;
    };

    const threeD = render3d(true);
    const twoD = render3d(false);
    // Same givens, but 3D draws two extra face polygons per filled cell.
    expect(polygonCount(threeD)).toBeGreaterThan(polygonCount(twoD));
    // Both still draw the given digits.
    expect(twoD.ops.some((o) => o.op === "text")).toBe(true);
  });

  it("the mistake overlay marks a wrong tower in COL_ERROR", () => {
    const st = newState(RENDER.p, RENDER.desc);
    const sol = solutionGrid(st);
    const w = st.w;
    const empty = [...st.immutable].indexOf(0);
    const wrong = (sol[empty] % w) + 1;
    const move: TowersMove = {
      type: "set",
      x: empty % w,
      y: (empty / w) | 0,
      n: wrong,
      pencil: false,
    };
    const { recording, mistakeCount } = renderScenario({
      game: towersGame,
      id: RENDER_ID,
      moves: [move],
      showMistakes: true,
    });
    expect(mistakeCount).toBeGreaterThan(0);
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_ERROR)).toBe(
      true,
    );
  });
});
