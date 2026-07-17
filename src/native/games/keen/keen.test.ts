/**
 * Behavioural tests for the Keen (KenKen) port.
 *
 * Tier 1 — pure logic: params/desc codecs, generator quality (seeded; solvable,
 * unique, correctly graded, valid cage areas), the cage solver, move
 * transitions, completion + flash, findMistakes, and Solve through a real
 * Midend (the aux path). Tier 2.5 — render scenarios: the initial frame (cage
 * clue text + grid backing), the pencil-mode indicator, and the Check & Save
 * mistake overlay, each with targeted op assertions plus a snapshot.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newKeenDesc } from "./generator.ts";
import { keenGame } from "./index.ts";
import {
  COL_ERROR,
  COL_PENCIL_BODY,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import { solveKeen } from "./solver.ts";
import {
  C_DIV,
  C_SUB,
  CMASK,
  cloneState,
  clueOp,
  decodeParams,
  diffToLevel,
  encodeParams,
  type KeenParams,
  type KeenState,
  newState,
  newUi,
  validateDesc,
  validateParams,
} from "./state.ts";

function gen(p: KeenParams, seed: string) {
  const { desc, aux } = newKeenDesc(p, randomNew(seed));
  return { p, desc, aux, st: newState(p, desc) };
}

function solutionGrid(st: KeenState): number[] {
  const r = keenGame.solve?.(st, st);
  if (!r?.ok || r.move.type !== "solve") throw new Error("solve failed");
  return r.move.grid;
}

// A deterministic descriptive id from the frozen C fixture (4×4 Easy).
const D4 = "aa_a_aa_ba_5a,d2s1a9m4d2m6s2";
const P4: KeenParams = { w: 4, diff: "easy", multiplicationOnly: false };

// --- tier 1: params --------------------------------------------------------

describe("keen params codec", () => {
  it("round-trips full and short forms", () => {
    expect(encodeParams({ w: 6, diff: "hard", multiplicationOnly: false }, true)).toBe(
      "6dh",
    );
    expect(encodeParams({ w: 6, diff: "hard", multiplicationOnly: false }, false)).toBe(
      "6",
    );
    expect(encodeParams({ w: 5, diff: "easy", multiplicationOnly: true }, true)).toBe(
      "5dem",
    );
    expect(decodeParams("6dh")).toEqual({
      w: 6,
      diff: "hard",
      multiplicationOnly: false,
    });
    expect(decodeParams("5dem")).toEqual({
      w: 5,
      diff: "easy",
      multiplicationOnly: true,
    });
    expect(decodeParams("9dn")).toEqual({
      w: 9,
      diff: "normal",
      multiplicationOnly: false,
    });
  });

  it("rejects invalid params", () => {
    expect(
      validateParams({ w: 2, diff: "easy", multiplicationOnly: false }, true),
    ).not.toBeNull();
    expect(
      validateParams({ w: 10, diff: "easy", multiplicationOnly: false }, true),
    ).not.toBeNull();
    expect(
      validateParams({ w: 6, diff: "normal", multiplicationOnly: false }, true),
    ).toBeNull();
  });
});

// --- tier 1: desc codec ----------------------------------------------------

describe("keen desc codec", () => {
  it("accepts a valid desc and decodes a blank starting grid", () => {
    expect(validateDesc(P4, D4)).toBeNull();
    const st = newState(P4, D4);
    expect(st.grid.every((v) => v === 0)).toBe(true);
    expect(st.pencil.every((v) => v === 0)).toBe(true);
    // The fixture has a div, a sub, adds and muls — every cage carries a clue.
    let cages = 0;
    for (let i = 0; i < 16; i++) if (st.clues.minimal[i] === i) cages++;
    let clued = 0;
    for (let i = 0; i < 16; i++) if (st.clues.clues[i] !== 0) clued++;
    expect(clued).toBe(cages);
  });

  it("rejects malformed descs", () => {
    expect(validateDesc(P4, "!!!,a1")).not.toBeNull(); // bad block structure
    expect(validateDesc(P4, D4.replace(",d2s1a9m4d2m6s2", ",a9"))).not.toBeNull(); // too few clues
    // A subtraction clue on a non-domino cage: take a desc whose first cage is
    // large and tag it 's'.
    expect(
      validateDesc({ w: 3, diff: "easy", multiplicationOnly: false }, "z3,s9"),
    ).not.toBeNull();
  });
});

// --- tier 1: generator -----------------------------------------------------

describe("keen generator", () => {
  for (const p of [
    { w: 4, diff: "easy", multiplicationOnly: false },
    { w: 5, diff: "easy", multiplicationOnly: true },
    { w: 6, diff: "normal", multiplicationOnly: false },
    { w: 6, diff: "hard", multiplicationOnly: false },
  ] as KeenParams[]) {
    it(`emits a unique, exactly-graded board for ${p.w}d${p.diff}${p.multiplicationOnly ? "m" : ""}`, () => {
      const { st } = gen(p, `keen-gen-${p.w}-${p.diff}-${p.multiplicationOnly}`);
      const lvl = diffToLevel(p.diff);
      // Unique + exactly this difficulty.
      const soln = new Uint8Array(p.w * p.w);
      expect(solveKeen(p.w, st.clues, soln, lvl)).toBe(lvl);
      if (lvl > 0) {
        const easier = new Uint8Array(p.w * p.w);
        expect(solveKeen(p.w, st.clues, easier, lvl - 1)).toBeGreaterThan(lvl - 1);
      }
      // Valid cage areas: 1..6, and every sub/div cage is a domino.
      for (let i = 0; i < p.w * p.w; i++) {
        if (st.clues.minimal[i] !== i) continue;
        const size = st.clues.dsf.size(i);
        expect(size).toBeGreaterThanOrEqual(1);
        expect(size).toBeLessThanOrEqual(6);
        const op = clueOp(st.clues.clues[i]);
        if (op === C_SUB || op === C_DIV) expect(size).toBe(2);
        if (p.multiplicationOnly) expect(st.clues.clues[i] & CMASK).toBe(0x20000000);
      }
    });
  }
});

// --- tier 1: solver --------------------------------------------------------

describe("keen solver", () => {
  it("solves a known board to its unique solution", () => {
    const st = newState(P4, D4);
    const soln = new Uint8Array(16);
    expect(solveKeen(4, st.clues, soln, 0)).toBe(0);
    // Result is a valid Latin square.
    for (let y = 0; y < 4; y++) {
      const row = new Set<number>();
      const col = new Set<number>();
      for (let x = 0; x < 4; x++) {
        row.add(soln[y * 4 + x]);
        col.add(soln[x * 4 + y]);
      }
      expect(row.size).toBe(4);
      expect(col.size).toBe(4);
    }
  });
});

// --- tier 1: moves ---------------------------------------------------------

describe("keen moves", () => {
  it("places, pencils, fills-all and strikes without mutating the input", () => {
    const st = newState(P4, D4);
    const placed = keenGame.executeMove(st, {
      type: "set",
      x: 1,
      y: 2,
      n: 3,
      pencil: false,
    });
    expect(placed.grid[2 * 4 + 1]).toBe(3);
    expect(st.grid[2 * 4 + 1]).toBe(0); // original untouched

    const pen = keenGame.executeMove(st, {
      type: "set",
      x: 0,
      y: 0,
      n: 2,
      pencil: true,
    });
    expect(pen.pencil[0]).toBe(1 << 2);

    const all = keenGame.executeMove(st, { type: "pencilAll" });
    expect(all.pencil[0]).toBe((1 << 5) - (1 << 1)); // bits 1..4

    const struck = keenGame.executeMove(all, {
      type: "pencilStrike",
      marks: [{ x: 0, y: 0, n: 2 }],
    });
    expect(struck.pencil[0] & (1 << 2)).toBe(0);
  });

  it("auto-pencil strikes the placed digit from its row and column", () => {
    const all = keenGame.executeMove(newState(P4, D4), { type: "pencilAll" });
    const next = keenGame.executeMove(all, {
      type: "set",
      x: 1,
      y: 1,
      n: 3,
      pencil: false,
      autoElim: true,
    });
    // 3 struck from the rest of row 1 and column 1.
    for (let k = 0; k < 4; k++) {
      if (k !== 1) {
        expect(next.pencil[1 * 4 + k] & (1 << 3)).toBe(0);
        expect(next.pencil[k * 4 + 1] & (1 << 3)).toBe(0);
      }
    }
  });

  it("completes and flashes when the last correct digit lands (not on Solve)", () => {
    const st = newState(P4, D4);
    const sol = solutionGrid(st);
    let cur = st;
    for (let i = 0; i < 15; i++)
      cur = keenGame.executeMove(cur, {
        type: "set",
        x: i % 4,
        y: (i / 4) | 0,
        n: sol[i],
        pencil: false,
      });
    expect(cur.completed).toBe(false);
    const before = cur;
    cur = keenGame.executeMove(cur, {
      type: "set",
      x: 3,
      y: 3,
      n: sol[15],
      pencil: false,
    });
    expect(cur.completed).toBe(true);
    expect(cur.cheated).toBe(false);
    expect(keenGame.flashLength?.(before, cur, 1, newUi(st))).toBeGreaterThan(0);
  });

  it("Solve completes the board but marks it cheated (no flash)", () => {
    const st = newState(P4, D4);
    const r = keenGame.solve?.(st, st);
    if (!r?.ok) throw new Error("solve failed");
    const done = keenGame.executeMove(st, r.move);
    expect(done.completed).toBe(true);
    expect(done.cheated).toBe(true);
    expect(keenGame.flashLength?.(st, done, 1, newUi(st))).toBe(0);
  });
});

// --- tier 1: findMistakes --------------------------------------------------

describe("keen findMistakes", () => {
  it("flags a wrong digit and a note that excludes the solution", () => {
    const st = newState(P4, D4);
    const sol = solutionGrid(st);
    const wrong = (sol[0] % 4) + 1;
    const bad = keenGame.executeMove(st, {
      type: "set",
      x: 0,
      y: 0,
      n: wrong,
      pencil: false,
    });
    const ms = keenGame.findMistakes?.(bad) ?? [];
    expect(ms).toContainEqual({ kind: "cell", x: 0, y: 0 });

    // A note that has crossed out the correct value (kind "note").
    const all = keenGame.executeMove(st, { type: "pencilAll" });
    const struck = keenGame.executeMove(all, {
      type: "pencilStrike",
      marks: [{ x: 1, y: 1, n: sol[1 * 4 + 1] }],
    });
    expect(keenGame.findMistakes?.(struck) ?? []).toContainEqual({
      kind: "note",
      x: 1,
      y: 1,
    });
  });

  it("ignores a cell whose notes merely carry extra candidates", () => {
    const all = keenGame.executeMove(newState(P4, D4), { type: "pencilAll" });
    // Every candidate pencilled in (includes the solution) — not a mistake.
    expect((keenGame.findMistakes?.(all) ?? []).length).toBe(0);
  });
});

// --- tier 1: Solve via a real Midend (aux path) ----------------------------

describe("keen Solve via Midend", () => {
  it("solves a freshly generated board and reports solved", () => {
    const me = new Midend(keenGame);
    expect(me.newGameFromId("6dn#keen-solve")).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    const solved = (me as unknown as { state: KeenState }).state;
    expect(solved.completed).toBe(true);
    expect(keenGame.status(solved)).toBe("solved");
  });

  it("save round-trips a played board", () => {
    const me = new Midend(keenGame);
    expect(me.newGameFromId(`4de:${D4}`)).toBeUndefined();
    me.playMoves([{ type: "set", x: 0, y: 0, n: 1, pencil: false }]);
    const saved = me.saveGame();
    const me2 = new Midend(keenGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect((me2 as unknown as { state: KeenState }).state.grid[0]).toBe(1);
  });
});

// cloneState sanity (immutable clues shared, mutable arrays copied).
describe("keen cloneState", () => {
  it("shares clues by reference and copies the working arrays", () => {
    const st = newState(P4, D4);
    const c = cloneState(st);
    expect(c.clues).toBe(st.clues);
    c.grid[0] = 9;
    expect(st.grid[0]).toBe(0);
  });
});

// --- tier 2.5: render scenarios --------------------------------------------

const RENDER_ID = `4de:${D4}`;

describe("keen render", () => {
  it("draws the initial frame with cage clues and the grid backing", () => {
    const { recording } = renderScenario({ game: keenGame, id: RENDER_ID });
    // Cage clue text is drawn (numbers + operation symbols).
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    // Filled rects (the grid backing + cell backgrounds).
    expect(recording.ops.some((o) => o.op === "rect")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("shows the pencil-mode indicator glyph when sticky pencil is on", () => {
    const palette = keenGame.colours(DEFAULT_BACKGROUND);
    const ts = keenGame.preferredTileSize ?? 48;
    const render = (hpencil: boolean): RecordingDrawing => {
      const st = newState(P4, D4);
      const ui = newUi(st);
      ui.hpencil = hpencil;
      const ds = newDrawState(st);
      setTileSize(ds, ts);
      const dr = new RecordingDrawing(palette);
      redraw(dr, ds, null, st, 1, ui, 0, 0);
      return dr;
    };
    const glyph = (r: RecordingDrawing) =>
      r.ops.some((o) => o.op === "polygon" && o.fill === COL_PENCIL_BODY);
    expect(glyph(render(true))).toBe(true);
    expect(glyph(render(false))).toBe(false);
  });

  it("Check & Save highlights a mistake even when the cell was already drawn", () => {
    // Regression (playbook §3.2): the mistake overlay isn't part of a cell's
    // tile value, so it must be in the diff cache key — otherwise findMistakes()
    // on an already-painted cell repaints nothing and the red never shows.
    const me = new Midend(keenGame);
    expect(me.newGameFromId(RENDER_ID)).toBeUndefined();
    const st = (me as unknown as { state: KeenState }).state;
    const sol = solutionGrid(st);
    const wrong = (sol[0] % 4) + 1;
    me.playMoves([{ type: "set", x: 0, y: 0, n: wrong, pencil: false }]);

    const palette = keenGame.colours(DEFAULT_BACKGROUND);
    me.redraw(new RecordingDrawing(palette)); // first paint: wrong digit, no overlay
    expect(me.findMistakes()).toBeGreaterThan(0);
    const after = new RecordingDrawing(palette);
    me.redraw(after);
    expect(after.ops.some((o) => o.op === "line" && o.colour === COL_ERROR)).toBe(true);
  });
});

describe("adaptive mark-all ('M')", () => {
  const W = 4;
  const press = (st: KeenState) =>
    keenGame.interpretMove(st, newUi(st), null, { x: 0, y: 0 }, 77);

  it("fills note-less cells on the first press, then cleans obvious dups, then no-ops", () => {
    // First press on a fresh board: empty cells are note-less → fill all.
    const fresh = newState(P4, D4);
    expect(press(fresh)).toEqual({ type: "pencilAll" });

    // Fully-noted board with a placed 1 at (0,0): the press cleans the obvious
    // row/column duplicates of the 1, and is a single atomic pencilStrike.
    const noted = cloneState(fresh);
    const all = (1 << (W + 1)) - (1 << 1);
    for (let i = 0; i < W * W; i++) noted.pencil[i] = all;
    noted.grid[0] = 1;
    noted.pencil[0] = 0;
    const move = press(noted);
    if (typeof move !== "object" || move === null || move.type !== "pencilStrike")
      throw new Error("expected pencilStrike");
    const struck = new Set(move.marks.map((m) => `${m.x},${m.y},${m.n}`));
    // Row 0 (cells x=1,2,3) and column 0 (cells y=1,2,3) lose their 1.
    expect(struck).toEqual(
      new Set(["1,0,1", "2,0,1", "3,0,1", "0,1,1", "0,2,1", "0,3,1"]),
    );

    // Apply it and press again: nothing left to fill or strike → a true no-op.
    const cleaned = keenGame.executeMove(noted, move);
    expect(press(cleaned)).toBeNull();
  });

  it("never strikes a candidate that is only a cage-mate (cages are not uniqueness regions)", () => {
    // Place a 1 at (0,0); note 1 at (2,2), which shares neither row nor column
    // with (0,0). Even if (0,0) and (2,2) were cage-mates, a Keen cage permits a
    // legal repeat, so the 1 at (2,2) must survive the cleanup (design D3).
    const st = cloneState(newState(P4, D4));
    const all = (1 << (W + 1)) - (1 << 1);
    for (let i = 0; i < W * W; i++) st.pencil[i] = all;
    st.grid[0] = 1;
    st.pencil[0] = 0;
    const move = press(st);
    if (typeof move !== "object" || move === null || move.type !== "pencilStrike")
      throw new Error("expected pencilStrike");
    const struck = new Set(move.marks.map((m) => `${m.x},${m.y},${m.n}`));
    expect(struck.has("2,2,1")).toBe(false); // not in row 0 or column 0 → kept
  });
});

describe("on-screen keys (requestKeys)", () => {
  const keysFor = (w: number) =>
    keenGame.requestKeys?.({ ...keenGame.defaultParams(), w });

  it("offers digits 1..w plus clear at two widths", () => {
    expect(keysFor(4)).toEqual([
      ..."1234".split("").map((d) => ({ button: d.charCodeAt(0), label: d })),
      { button: 8, label: "Clear" },
    ]);
    expect(keysFor(6)).toEqual([
      ..."123456".split("").map((d) => ({ button: d.charCodeAt(0), label: d })),
      { button: 8, label: "Clear" },
    ]);
  });
});
