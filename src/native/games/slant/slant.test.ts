/**
 * Behavioural tests for the Slant port (tier 1 logic + tier 2 render ops +
 * tier 2.5 render scenario; the C-vs-TS byte-match lives in
 * slant-differential.test.ts).
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import cReference from "./__fixtures__/slant-c-reference.json" with { type: "json" };
import { newDesc, slantGenerate } from "./generator.ts";
import { slantGame } from "./index.ts";
import { COL_ERROR, COL_GROUNDED, newDrawState } from "./render.ts";
import { SOLVE_UNIQUE, SolverScratch, slantSolve } from "./solver.ts";
import {
  computeErrors,
  DIFF_EASY,
  DIFF_HARD,
  decodeClues,
  decodeParams,
  encodeClues,
  encodeParams,
  executeMove,
  newState,
  type SlantMove,
  type SlantState,
  type SlantUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

const FIXTURE = (
  cReference as {
    fixtures: {
      w: number;
      h: number;
      diff: number;
      seed: string;
      desc: string;
      aux: string;
    }[];
  }
).fixtures[0]; // 5x5 Easy

const P22 = { w: 2, h: 2, diff: DIFF_EASY };

function ui(over: Partial<SlantUi> = {}): SlantUi {
  return {
    cx: 0,
    cy: 0,
    cursorVisible: false,
    swapButtons: false,
    fadeGrounded: false,
    ...over,
  };
}

/** Centre of square (x, y) at the default 32px tile (border = 11). */
function centre(x: number, y: number) {
  return { x: 11 + x * 32 + 16, y: 11 + y * 32 + 16 };
}

const set = (x: number, y: number, v: -1 | 0 | 1): SlantMove => ({
  type: "set",
  x,
  y,
  v,
});

function applyAll(state: SlantState, moves: SlantMove[]): SlantState {
  let s = state;
  for (const m of moves) s = executeMove(s, m);
  return s;
}

describe("slant params", () => {
  it("round-trips through encode/decode", () => {
    for (const p of [
      { w: 5, h: 5, diff: DIFF_EASY },
      { w: 12, h: 10, diff: DIFF_HARD },
    ]) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
    expect(encodeParams({ w: 12, h: 10, diff: DIFF_HARD }, true)).toBe("12x10dh");
    expect(encodeParams({ w: 12, h: 10, diff: DIFF_HARD }, false)).toBe("12x10");
  });

  it("decodes leniently", () => {
    expect(decodeParams("7")).toEqual({ w: 7, h: 7, diff: DIFF_EASY });
    // An unknown difficulty char keeps the default.
    expect(decodeParams("6x6dq").diff).toBe(DIFF_EASY);
  });

  it("rejects invalid params", () => {
    expect(validateParams({ w: 1, h: 5, diff: 0 }, true)).not.toBeNull();
    expect(validateParams({ w: 5, h: 1, diff: 0 }, true)).not.toBeNull();
    expect(validateParams({ w: 2, h: 2, diff: 0 }, true)).toBeNull();
  });
});

describe("slant desc codec", () => {
  it("round-trips a generated desc", () => {
    const p = { w: FIXTURE.w, h: FIXTURE.h, diff: FIXTURE.diff };
    expect(validateDesc(p, FIXTURE.desc)).toBeNull();
    expect(encodeClues(decodeClues(p, FIXTURE.desc))).toBe(FIXTURE.desc);
  });

  it("rejects malformed descs", () => {
    expect(validateDesc(P22, "5h")).not.toBeNull(); // bad clue digit
    expect(validateDesc(P22, "h")).not.toBeNull(); // too short (8 < 9)
    expect(validateDesc(P22, "j")).not.toBeNull(); // too long (10 > 9)
    expect(validateDesc(P22, "i")).toBeNull(); // exactly 9 clueless vertices
  });

  it("emits z-chunked runs for large clueless stretches", () => {
    const clues = new Int8Array(30).fill(-1);
    expect(encodeClues(clues)).toBe("zd"); // 26 + 4
  });
});

describe("slant errors and completion", () => {
  it("flags a closed loop on every participating diagonal", () => {
    // The minimal diamond loop around the centre vertex of a 2x2 grid.
    let s = newState(P22, "i");
    s = applyAll(s, [set(0, 0, 1), set(1, 0, -1), set(0, 1, -1), set(1, 1, 1)]);
    expect(Array.from(s.loopErrors)).toEqual([1, 1, 1, 1]);
    expect(s.completed).toBe(false); // full but erroneous
  });

  it("flags an over-committed clue vertex", () => {
    // Clue 0 at the top-left vertex; a backslash in square (0,0) meets it.
    let s = newState(P22, "0h");
    s = executeMove(s, set(0, 0, -1));
    expect(s.vertexErrors[0]).toBe(1);
  });

  it("flags a clue vertex that can no longer be satisfied", () => {
    // Clue 4 at the centre vertex (index 4 of the 3x3 vertex grid); a
    // forward slash in (0,0) avoids it, capping its degree at 3.
    let s = newState(P22, "d4d");
    s = executeMove(s, set(0, 0, 1));
    expect(s.vertexErrors[4]).toBe(1);
  });

  it("marks border-connected diagonals grounded", () => {
    let s = newState(P22, "i");
    s = executeMove(s, set(0, 0, -1));
    expect(s.grounded[0]).toBe(1);
  });

  it("completes (and latches) on the unique solution", () => {
    const p = { w: FIXTURE.w, h: FIXTURE.h, diff: FIXTURE.diff };
    let s = newState(p, FIXTURE.desc);
    const moves: SlantMove[] = [];
    for (let i = 0; i < p.w * p.h; i++) {
      moves.push(set(i % p.w, Math.floor(i / p.w), FIXTURE.aux[i] === "\\" ? -1 : 1));
    }
    s = applyAll(s, moves);
    expect(s.completed).toBe(true);
    expect(s.usedSolve).toBe(false);
    // Clearing a square afterwards keeps the latched flag.
    s = executeMove(s, set(0, 0, 0));
    expect(s.completed).toBe(true);
  });

  it("computeErrors reports complete only when full and clean", () => {
    const p = { w: FIXTURE.w, h: FIXTURE.h, diff: FIXTURE.diff };
    const clues = decodeClues(p, FIXTURE.desc);
    const soln = new Int8Array(p.w * p.h);
    for (let i = 0; i < soln.length; i++) soln[i] = FIXTURE.aux[i] === "\\" ? -1 : 1;
    expect(computeErrors(p.w, p.h, clues, soln).complete).toBe(true);
    soln[3] = 0;
    expect(computeErrors(p.w, p.h, clues, soln).complete).toBe(false);
  });
});

describe("slant input", () => {
  const state = newState(P22, "i");

  it("left-click cycles blank -> \\ -> / -> blank", () => {
    const u = ui();
    const m1 = slantGame.interpretMove(state, u, null, centre(0, 0), LEFT_BUTTON);
    expect(m1).toEqual(set(0, 0, -1));
    const s1 = executeMove(state, m1 as SlantMove);
    const m2 = slantGame.interpretMove(s1, u, null, centre(0, 0), LEFT_BUTTON);
    expect(m2).toEqual(set(0, 0, 1));
    const s2 = executeMove(s1, m2 as SlantMove);
    const m3 = slantGame.interpretMove(s2, u, null, centre(0, 0), LEFT_BUTTON);
    expect(m3).toEqual(set(0, 0, 0));
  });

  it("right-click cycles the other way", () => {
    const m = slantGame.interpretMove(state, ui(), null, centre(1, 1), RIGHT_BUTTON);
    expect(m).toEqual(set(1, 1, 1));
  });

  it("swap-buttons preference swaps the directions", () => {
    const m = slantGame.interpretMove(
      state,
      ui({ swapButtons: true }),
      null,
      centre(0, 0),
      LEFT_BUTTON,
    );
    expect(m).toEqual(set(0, 0, 1));
  });

  it("ignores clicks outside the grid and hides the cursor on a click", () => {
    expect(
      slantGame.interpretMove(state, ui(), null, { x: 2, y: 2 }, LEFT_BUTTON),
    ).toBe(null);
    const u = ui({ cursorVisible: true });
    slantGame.interpretMove(state, u, null, centre(0, 0), LEFT_BUTTON);
    expect(u.cursorVisible).toBe(false);
  });

  it("cursor keys reveal and move the cursor", () => {
    const u = ui();
    expect(slantGame.interpretMove(state, u, null, { x: 0, y: 0 }, CURSOR_RIGHT)).toBe(
      UI_UPDATE,
    );
    expect(u).toMatchObject({ cx: 1, cy: 0, cursorVisible: true });
    // Clamped at the edge, still a UI update.
    expect(slantGame.interpretMove(state, u, null, { x: 0, y: 0 }, CURSOR_RIGHT)).toBe(
      UI_UPDATE,
    );
    expect(u.cx).toBe(1);
    expect(slantGame.interpretMove(state, u, null, { x: 0, y: 0 }, CURSOR_LEFT)).toBe(
      UI_UPDATE,
    );
    expect(u.cx).toBe(0);
  });

  it("select reveals the cursor first, then cycles", () => {
    const u = ui();
    expect(slantGame.interpretMove(state, u, null, { x: 0, y: 0 }, CURSOR_SELECT)).toBe(
      UI_UPDATE,
    );
    expect(u.cursorVisible).toBe(true);
    expect(
      slantGame.interpretMove(state, u, null, { x: 0, y: 0 }, CURSOR_SELECT),
    ).toEqual(set(0, 0, -1));
    expect(
      slantGame.interpretMove(state, u, null, { x: 0, y: 0 }, CURSOR_SELECT2),
    ).toEqual(set(0, 0, 1));
  });

  it("direct keys place at the cursor; a no-op returns null", () => {
    const u = ui({ cx: 1, cy: 0, cursorVisible: true });
    expect(slantGame.interpretMove(state, u, null, { x: 0, y: 0 }, 92)).toEqual(
      set(1, 0, -1),
    );
    expect(slantGame.interpretMove(state, u, null, { x: 0, y: 0 }, 47)).toEqual(
      set(1, 0, 1),
    );
    // Backspace on an already-blank square: no effect.
    expect(slantGame.interpretMove(state, u, null, { x: 0, y: 0 }, 8)).toBe(null);
  });
});

describe("slant solve + findMistakes", () => {
  const p = { w: FIXTURE.w, h: FIXTURE.h, diff: FIXTURE.diff };

  it("solve uses the aux solution when present", () => {
    const s = newState(p, FIXTURE.desc);
    const r = slantGame.solve?.(s, s, FIXTURE.aux);
    expect(r).toEqual({ ok: true, move: { type: "solve", grid: FIXTURE.aux } });
  });

  it("solve re-derives the solution without aux, from a dirty state", () => {
    let s = newState(p, FIXTURE.desc);
    // Place two wrong diagonals first.
    const wrong0 = FIXTURE.aux[0] === "\\" ? 1 : -1;
    s = executeMove(s, set(0, 0, wrong0 as -1 | 1));
    const r = slantGame.solve?.(newState(p, FIXTURE.desc), s);
    expect(r?.ok).toBe(true);
    if (r?.ok) {
      const done = executeMove(s, r.move);
      expect(done.completed).toBe(true);
      expect(done.usedSolve).toBe(true);
      // usedSolve suppresses the win flash.
      expect(slantGame.flashLength?.(s, done, 1, ui())).toBe(0);
    }
  });

  it("flags exactly the diagonals contradicting the unique solution", () => {
    let s = newState(p, FIXTURE.desc);
    const right0 = FIXTURE.aux[0] === "\\" ? -1 : 1;
    s = executeMove(s, set(0, 0, right0 as -1 | 1)); // correct
    const wrong1 = FIXTURE.aux[1] === "\\" ? 1 : -1;
    s = executeMove(s, set(1, 0, wrong1 as -1 | 1)); // wrong
    expect(slantGame.findMistakes?.(s)).toEqual([{ x: 1, y: 0 }]);
  });

  it("reports no mistakes on a blank or correct board", () => {
    const s = newState(p, FIXTURE.desc);
    expect(slantGame.findMistakes?.(s)).toEqual([]);
  });

  it("flashes on a genuine player win", () => {
    const s = newState(p, FIXTURE.desc);
    const moves: SlantMove[] = [];
    for (let i = 0; i < p.w * p.h; i++) {
      moves.push(set(i % p.w, Math.floor(i / p.w), FIXTURE.aux[i] === "\\" ? -1 : 1));
    }
    const prev = applyAll(s, moves.slice(0, -1));
    const done = executeMove(prev, moves[moves.length - 1]);
    expect(slantGame.flashLength?.(prev, done, 1, ui())).toBeGreaterThan(0);
  });
});

describe("slant generator (behavioural)", () => {
  it("generates uniquely-solvable boards at the target difficulty", () => {
    const rng = randomNew("slant-behavioural");
    for (const diff of [DIFF_EASY, DIFF_HARD]) {
      const p = { w: 6, h: 6, diff };
      const { desc } = newDesc(p, rng);
      expect(validateDesc(p, desc)).toBeNull();
      const clues = decodeClues(p, desc);
      const soln = new Int8Array(36);
      const sc = new SolverScratch(6, 6);
      expect(slantSolve(6, 6, clues, soln, sc, diff)).toBe(SOLVE_UNIQUE);
    }
  });

  it("slantGenerate fills every square without loops", () => {
    const rng = randomNew("slant-gen");
    const soln = new Int8Array(8 * 8);
    slantGenerate(8, 8, soln, rng);
    expect(soln.includes(0)).toBe(false);
    const errors = computeErrors(8, 8, new Int8Array(81).fill(-1), soln);
    expect(errors.loopErrors.every((e) => e === 0)).toBe(true);
  });
});

describe("slant midend integration", () => {
  it("save -> load round-trips a game in progress", () => {
    const me = new Midend(slantGame);
    expect(me.newGameFromId(`5x5:${FIXTURE.desc}`)).toBeUndefined();
    me.playMoves([set(0, 0, -1), set(1, 1, 1)]);
    const saved = me.saveGame();
    const me2 = new Midend(slantGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toBe(me.formatAsText());
  });

  it("text format shows clues and slashes", () => {
    let s = newState(P22, "0h");
    s = executeMove(s, set(1, 1, 1));
    expect(textFormat(s)).toBe("0-+-+\n| | |\n+-+-+\n| |/|\n+-+-+\n");
  });
});

describe("slant rendering", () => {
  it("draws clue circles and slashes on the initial frame (snapshot)", () => {
    const { recording } = renderScenario({
      game: slantGame,
      id: `5x5:${FIXTURE.desc}`,
      moves: [set(0, 0, -1)],
    });
    // Clue circles exist…
    expect(recording.ops.some((o) => o.op === "circle")).toBe(true);
    // …and the placed backslash draws its diagonal lines.
    expect(recording.ops.some((o) => o.op === "line")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("renders the mistake overlay in error colour", () => {
    const wrong0 = FIXTURE.aux[0] === "\\" ? 1 : -1;
    const { recording, mistakeCount } = renderScenario({
      game: slantGame,
      id: `5x5:${FIXTURE.desc}`,
      moves: [set(0, 0, wrong0 as -1 | 1)],
      showMistakes: true,
    });
    expect(mistakeCount).toBe(1);
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR)).toBe(
      true,
    );
  });

  it("repaints a mistake overlay onto an unchanged tile (second paint)", () => {
    // The playbook §3.2 regression: paint, then flag a mistake, then redraw
    // with no tile change — the red styling must appear on the second paint.
    const p = { w: FIXTURE.w, h: FIXTURE.h, diff: FIXTURE.diff };
    let s = newState(p, FIXTURE.desc);
    const wrong0 = FIXTURE.aux[0] === "\\" ? 1 : -1;
    s = executeMove(s, set(0, 0, wrong0 as -1 | 1));

    const palette = slantGame.colours(DEFAULT_BACKGROUND);
    const dr = new RecordingDrawing(palette);
    const ds = newDrawState(s);
    slantGame.setTileSize?.(ds, 32);
    const u = ui();
    slantGame.redraw?.(dr, ds, null, s, 1, u, 0, 0, undefined, undefined);
    dr.ops.length = 0;
    slantGame.redraw?.(dr, ds, null, s, 1, u, 0, 0, undefined, [{ x: 0, y: 0 }]);
    expect(dr.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR)).toBe(true);
  });

  it("fades grounded diagonals only when the pref is on", () => {
    const p = { w: FIXTURE.w, h: FIXTURE.h, diff: FIXTURE.diff };
    let s = newState(p, FIXTURE.desc);
    s = executeMove(s, set(0, 0, -1)); // touches the border: grounded

    const palette = slantGame.colours(DEFAULT_BACKGROUND);
    for (const fade of [false, true]) {
      const dr = new RecordingDrawing(palette);
      const ds = newDrawState(s);
      slantGame.setTileSize?.(ds, 32);
      slantGame.redraw?.(dr, ds, null, s, 1, ui({ fadeGrounded: fade }), 0, 0);
      const groundedLines = dr.ops.filter(
        (o) => o.op === "line" && o.colour === COL_GROUNDED,
      );
      expect(groundedLines.length > 0).toBe(fade);
    }
  });
});
