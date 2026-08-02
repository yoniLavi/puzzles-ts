/**
 * Behavioural tests for the Light Up port: params/desc codecs (tier 1),
 * board mechanics and input (tier 1), solver difficulty coupling (tier 1),
 * findMistakes (tier 1), and render scenarios (tier 2/2.5).
 *
 * Deterministic boards come from the frozen C-reference fixtures — the
 * differential test proves the generator reproduces them, so their descs
 * are stable ground truth here.
 */
import { describe, expect, it } from "vitest";
import { Midend, UI_UPDATE } from "../../engine/index.ts";
import {
  CURSOR_DOWN,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import cReference from "./__fixtures__/lightup-c-reference.json" with { type: "json" };
import { puzzleIsGood } from "./generator.ts";
import { type LightupMistake, lightupGame } from "./index.ts";
import { COL_BLACK, COL_ERROR, COL_LIGHT, COL_LIT } from "./render.ts";
import { solveUnique } from "./solver.ts";
import {
  decodeParams,
  encodeDesc,
  encodeParams,
  F_IMPOSSIBLE,
  F_LIGHT,
  idx,
  type LightupMove,
  type LightupState,
  type LightupUi,
  newState,
  SYMM_ROT2,
  SYMM_ROT4,
  setLight,
  validateDesc,
  validateParams,
} from "./state.ts";

const FIXTURES = (
  cReference as {
    fixtures: {
      w: number;
      h: number;
      blackpc: number;
      symm: number;
      difficulty: number;
      seed: string;
      desc: string;
    }[];
  }
).fixtures;

/** The 7x7 easy C-reference board (differential-verified). */
const EASY = FIXTURES[0];
const EASY_PARAMS = {
  w: EASY.w,
  h: EASY.h,
  blackpc: EASY.blackpc,
  symm: EASY.symm,
  difficulty: EASY.difficulty,
};
const EASY_ID = `${EASY.w}x${EASY.h}b${EASY.blackpc}s${EASY.symm}d${EASY.difficulty}:${EASY.desc}`;

function light(x: number, y: number): LightupMove {
  return { ops: [{ kind: "light", x, y }] };
}
function mark(x: number, y: number): LightupMove {
  return { ops: [{ kind: "impossible", x, y }] };
}

/** Pixel at the centre of cell (x, y) at the preferred tile size 32. */
function px(cell: number): number {
  return 16 + cell * 32 + 16;
}

describe("lightup params", () => {
  it("full encode/decode round-trips", () => {
    const p = { w: 10, h: 10, blackpc: 20, symm: SYMM_ROT2, difficulty: 1 };
    expect(encodeParams(p, true)).toBe("10x10b20s2d1");
    expect(decodeParams("10x10b20s2d1")).toEqual(p);
    expect(encodeParams(p, false)).toBe("10x10");
  });

  it("bare WxH demotes incompatible 4-way symmetry (upstream quirk)", () => {
    // Defaults carry SYMM_ROT4 (the 7x7 preset); a non-square bare id
    // must not keep it.
    const p = decodeParams("18x10");
    expect(p.w).toBe(18);
    expect(p.h).toBe(10);
    expect(p.symm).toBe(SYMM_ROT2);
    // A square bare id keeps the default 4-way.
    expect(decodeParams("7x7").symm).toBe(SYMM_ROT4);
  });

  it("legacy 'r' suffix decodes as difficulty 2", () => {
    expect(decodeParams("7x7b20s4r").difficulty).toBe(2);
    // and difficulty resets to 0 when unspecified
    expect(decodeParams("10x10b20s2").difficulty).toBe(0);
  });

  it("rejects invalid params", () => {
    const base = { w: 7, h: 7, blackpc: 20, symm: SYMM_ROT4, difficulty: 0 };
    expect(validateParams({ ...base, w: 1 }, true)).not.toBeNull();
    expect(validateParams({ ...base, blackpc: 4 }, true)).not.toBeNull();
    expect(validateParams({ ...base, blackpc: 101 }, true)).not.toBeNull();
    expect(validateParams({ ...base, w: 8 }, true)).not.toBeNull(); // ROT4 non-square
    expect(validateParams({ ...base, symm: 9 }, true)).not.toBeNull();
    expect(validateParams({ ...base, difficulty: 3 }, true)).not.toBeNull();
    expect(validateParams(base, true)).toBeNull();
  });
});

describe("lightup desc codec", () => {
  it("fixture descs validate and round-trip through newState", () => {
    for (const f of FIXTURES) {
      const p = {
        w: f.w,
        h: f.h,
        blackpc: f.blackpc,
        symm: f.symm,
        difficulty: f.difficulty,
      };
      expect(validateDesc(p, f.desc)).toBeNull();
      const state = newState(p, f.desc);
      expect(encodeDesc(state)).toBe(f.desc);
    }
  });

  it("rejects malformed descs", () => {
    const p = EASY_PARAMS;
    expect(validateDesc(p, "!")).not.toBeNull();
    expect(validateDesc(p, "a")).not.toBeNull(); // far too short
    expect(validateDesc(p, `${EASY.desc}a`)).not.toBeNull(); // too long
    expect(validateDesc(p, "5")).not.toBeNull(); // clue out of range 0-4
  });
});

describe("lightup board mechanics", () => {
  it("a bulb lights its row and column up to black squares", () => {
    const state = newState(EASY_PARAMS, EASY.desc);
    // (0,0) is open on the fixture board; light it.
    setLight(state, 0, 0, true);
    expect(state.flags[idx(0, 0, state.w)] & F_LIGHT).toBeTruthy();
    expect(state.lights[idx(0, 0, state.w)]).toBe(1);
    // Row neighbour is lit; a cell beyond a black square is not. Row 1
    // holds blacks at (1,1) and (2,1) on this board, so (0,1) is lit from
    // (0,0) but (3,1) is not.
    expect(state.lights[idx(1, 0, state.w)]).toBeGreaterThan(0);
    expect(state.lights[idx(0, 1, state.w)]).toBeGreaterThan(0);
    setLight(state, 0, 0, false);
    expect(state.nlights).toBe(0);
    expect(state.lights[idx(1, 0, state.w)]).toBe(0);
  });

  it("executeMove keeps bulb and mark mutually exclusive", () => {
    const p = { ...EASY_PARAMS, w: 2, h: 2 };
    const empty = newState(p, "d");
    let s = lightupGame.executeMove(empty, mark(0, 0));
    expect(s.flags[0] & F_IMPOSSIBLE).toBeTruthy();
    // A light move on a marked square clears the mark (executeMove is the
    // replay path; interpretMove refuses to *produce* this).
    s = lightupGame.executeMove(s, light(0, 0));
    expect(s.flags[0] & F_IMPOSSIBLE).toBeFalsy();
    expect(s.flags[0] & F_LIGHT).toBeTruthy();
    // And a mark move removes the bulb.
    s = lightupGame.executeMove(s, mark(0, 0));
    expect(s.flags[0] & F_LIGHT).toBeFalsy();
    expect(s.flags[0] & F_IMPOSSIBLE).toBeTruthy();
    expect(s.nlights).toBe(0);
  });

  it("detects completion", () => {
    const p = { ...EASY_PARAMS, w: 2, h: 2 };
    const empty = newState(p, "d"); // 2x2, all open
    let s = lightupGame.executeMove(empty, light(0, 0));
    expect(s.completed).toBe(false);
    s = lightupGame.executeMove(s, light(1, 1));
    expect(s.completed).toBe(true);
    // Diagonal bulbs don't light each other: no overlap.
    expect(lightupGame.status(s)).toBe("solved");
  });

  it("flashes on a genuine win, not on Solve", () => {
    const p = { ...EASY_PARAMS, w: 2, h: 2 };
    const empty = newState(p, "d");
    const mid = lightupGame.executeMove(empty, light(0, 0));
    const won = lightupGame.executeMove(mid, light(1, 1));
    const u = lightupGame.newUi(empty);
    expect(lightupGame.flashLength?.(mid, won, 1, u)).toBeGreaterThan(0);
    const cheated = lightupGame.executeMove(mid, {
      solve: true,
      ops: [{ kind: "light", x: 1, y: 1 }],
    });
    expect(lightupGame.flashLength?.(mid, cheated, 1, u)).toBe(0);
  });
});

describe("lightup input", () => {
  const state = () => newState(EASY_PARAMS, EASY.desc);
  const ui = (): LightupUi => lightupGame.newUi(state());

  it("left-click toggles a bulb, right-click a mark", () => {
    const m = lightupGame.interpretMove(
      state(),
      ui(),
      null,
      { x: px(0), y: px(0) },
      LEFT_BUTTON,
    );
    expect(m).toEqual(light(0, 0));
    const m2 = lightupGame.interpretMove(
      state(),
      ui(),
      null,
      { x: px(0), y: px(0) },
      RIGHT_BUTTON,
    );
    expect(m2).toEqual(mark(0, 0));
  });

  it("clicks on black squares and out of bounds are inert", () => {
    // (1,1) is black on the fixture board.
    expect(
      lightupGame.interpretMove(
        state(),
        ui(),
        null,
        { x: px(1), y: px(1) },
        LEFT_BUTTON,
      ),
    ).toBeNull();
    expect(
      lightupGame.interpretMove(state(), ui(), null, { x: 5000, y: 5000 }, LEFT_BUTTON),
    ).toBeNull();
  });

  it("a left-click on a marked square (and right-click on a bulb) is refused", () => {
    let s = state();
    s = lightupGame.executeMove(s, mark(0, 0));
    expect(
      lightupGame.interpretMove(s, ui(), null, { x: px(0), y: px(0) }, LEFT_BUTTON),
    ).toBeNull();
    let s2 = state();
    s2 = lightupGame.executeMove(s2, light(0, 0));
    expect(
      lightupGame.interpretMove(s2, ui(), null, { x: px(0), y: px(0) }, RIGHT_BUTTON),
    ).toBeNull();
  });

  it("cursor: an arrow moves (revealing if hidden); select acts at the cursor", () => {
    const u = ui();
    // Upstream move_cursor applies the delta *and* reveals on the first
    // press, so the cursor appears already moved to (1,0).
    expect(
      lightupGame.interpretMove(state(), u, null, { x: 0, y: 0 }, CURSOR_RIGHT),
    ).toBe(UI_UPDATE);
    expect(u.cursorShow).toBe(true);
    expect(u.x).toBe(1);
    expect(
      lightupGame.interpretMove(state(), u, null, { x: 0, y: 0 }, CURSOR_DOWN),
    ).toBe(UI_UPDATE);
    // (1,1) is black: select there is inert.
    expect(
      lightupGame.interpretMove(state(), u, null, { x: 0, y: 0 }, CURSOR_SELECT),
    ).toBeNull();
    u.x = 0;
    expect(
      lightupGame.interpretMove(state(), u, null, { x: 0, y: 0 }, CURSOR_SELECT),
    ).toEqual(light(0, 1));
    // 'i' places a mark at the cursor.
    expect(
      lightupGame.interpretMove(state(), u, null, { x: 0, y: 0 }, "i".charCodeAt(0)),
    ).toEqual(mark(0, 1));
  });

  it("hiding the cursor via a pointer no-op is a UI update", () => {
    const u = ui();
    u.cursorShow = true;
    // Click on a black square: no move, but the cursor hides — repaint.
    expect(
      lightupGame.interpretMove(state(), u, null, { x: px(1), y: px(1) }, LEFT_BUTTON),
    ).toBe(UI_UPDATE);
    expect(u.cursorShow).toBe(false);
  });
});

describe("lightup solver difficulty coupling", () => {
  // The generator guarantees a board is solvable at exactly its stated
  // difficulty; assert the solver agrees on the C-reference boards.
  for (const f of FIXTURES.filter((f) => f.w === 7)) {
    it(`${f.w}x${f.h} d${f.difficulty} solves at d${f.difficulty}${
      f.difficulty > 0 ? ` but not d${f.difficulty - 1}` : ""
    }`, () => {
      const p = {
        w: f.w,
        h: f.h,
        blackpc: f.blackpc,
        symm: f.symm,
        difficulty: f.difficulty,
      };
      expect(puzzleIsGood(newState(p, f.desc), f.difficulty)).toBe(true);
      if (f.difficulty > 0) {
        expect(puzzleIsGood(newState(p, f.desc), f.difficulty - 1)).toBe(false);
      }
    });
  }
});

describe("lightup solve", () => {
  it("Solve through a real Midend completes the board", () => {
    const me = new Midend(lightupGame);
    expect(me.newGameFromId(EASY_ID)).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    const st = (me as unknown as { state: LightupState }).state;
    expect(st.completed).toBe(true);
    expect(st.usedSolve).toBe(true);
  });

  it("solve() recovers from a wrong mid-game position", () => {
    const orig = newState(EASY_PARAMS, EASY.desc);
    const solution = solveUnique(orig);
    if (!solution) throw new Error("fixture board must be uniquely solvable");
    // Place a bulb the solution doesn't have.
    let wrongCell = -1;
    for (let i = 0; i < solution.flags.length; i++) {
      if (!(orig.flags[i] & 1) && !(solution.flags[i] & F_LIGHT)) {
        wrongCell = i;
        break;
      }
    }
    const curr = lightupGame.executeMove(
      orig,
      light(wrongCell % orig.w, Math.floor(wrongCell / orig.w)),
    );
    const res = lightupGame.solve?.(orig, curr);
    if (!res?.ok) throw new Error("solve failed");
    const solved = lightupGame.executeMove(curr, res.move);
    expect(solved.completed).toBe(true);
  });
});

describe("lightup findMistakes", () => {
  const setup = () => {
    const orig = newState(EASY_PARAMS, EASY.desc);
    const solution = solveUnique(orig);
    if (!solution) throw new Error("fixture board must be uniquely solvable");
    let bulbCell = -1;
    let emptyCell = -1;
    for (let i = 0; i < solution.flags.length; i++) {
      if (orig.flags[i] & 1) continue; // black
      if (solution.flags[i] & F_LIGHT) {
        if (bulbCell < 0) bulbCell = i;
      } else if (emptyCell < 0) {
        emptyCell = i;
      }
    }
    const at = (i: number) => ({ x: i % orig.w, y: Math.floor(i / orig.w) });
    return { orig, bulbCell, emptyCell, at };
  };

  it("flags a bulb the unique solution doesn't have", () => {
    const { orig, emptyCell, at } = setup();
    const s = lightupGame.executeMove(orig, light(at(emptyCell).x, at(emptyCell).y));
    const mistakes = lightupGame.findMistakes?.(s) as readonly LightupMistake[];
    expect(mistakes).toEqual([{ ...at(emptyCell), kind: "light" }]);
  });

  it("flags a mark sitting on a solution bulb, but not an unhelpful mark", () => {
    const { orig, bulbCell, emptyCell, at } = setup();
    let s = lightupGame.executeMove(orig, mark(at(bulbCell).x, at(bulbCell).y));
    s = lightupGame.executeMove(s, mark(at(emptyCell).x, at(emptyCell).y));
    const mistakes = lightupGame.findMistakes?.(s) as readonly LightupMistake[];
    expect(mistakes).toEqual([{ ...at(bulbCell), kind: "mark" }]);
  });

  it("a correct bulb is not flagged", () => {
    const { orig, bulbCell, at } = setup();
    const s = lightupGame.executeMove(orig, light(at(bulbCell).x, at(bulbCell).y));
    expect(lightupGame.findMistakes?.(s)).toEqual([]);
  });
});

describe("lightup save round-trip", () => {
  it("saveGame -> loadGame restores an equivalent game", () => {
    const me = new Midend(lightupGame);
    expect(me.newGameFromId(EASY_ID)).toBeUndefined();
    me.playMoves([light(0, 0), mark(3, 0)]);
    const saved = me.saveGame();
    const me2 = new Midend(lightupGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toBe(me.formatAsText());
  });
});

describe("lightup rendering", () => {
  it("draws the opener frame: black tiles, clue digits, grid", () => {
    const result = renderScenario({ game: lightupGame, id: EASY_ID });
    const ops = result.recording.ops;
    // Black squares are filled COL_BLACK.
    expect(
      ops.some((o) => o.op === "rect" && o.colour === COL_BLACK && o.w === 32),
    ).toBe(true);
    // Clue digits (the fixture has 0/1/3 clues) in COL_LIGHT.
    expect(
      ops.some((o) => o.op === "text" && o.colour === COL_LIGHT && o.text === "3"),
    ).toBe(true);
    expect(result.recording.ops).toMatchSnapshot();
  });

  it("a bulb draws as a circle and lights its corridor yellow", () => {
    const { recording } = renderScenario({
      game: lightupGame,
      id: EASY_ID,
      moves: [light(0, 0)],
    });
    expect(recording.ops.some((o) => o.op === "circle" && o.fill === COL_LIGHT)).toBe(
      true,
    );
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_LIT)).toBe(
      true,
    );
  });

  it("bulbs lighting each other draw in the error colour", () => {
    const { recording } = renderScenario({
      game: lightupGame,
      id: EASY_ID,
      moves: [light(0, 0), light(3, 0)],
    });
    expect(
      recording.ops.filter((o) => o.op === "circle" && o.fill === COL_ERROR).length,
    ).toBe(2);
  });

  it("a provably-wrong clue digit turns red", () => {
    // (1,1) holds clue 0; a bulb beside it exceeds the clue.
    const { recording } = renderScenario({
      game: lightupGame,
      id: EASY_ID,
      moves: [light(1, 0)],
    });
    expect(
      recording.ops.some(
        (o) => o.op === "text" && o.colour === COL_ERROR && o.text === "0",
      ),
    ).toBe(true);
  });

  it("Check & Save highlights a mistake even when the cell was already drawn", () => {
    // Regression guard (playbook §3.2): the mistake overlay must be in the
    // per-tile diff key, or a findMistakes() after the move's own paint
    // repaints nothing.
    const me = new Midend(lightupGame);
    expect(me.newGameFromId(EASY_ID)).toBeUndefined();
    const st = (me as unknown as { state: LightupState }).state;
    const solution = solveUnique(st);
    if (!solution) throw new Error("fixture board must be uniquely solvable");
    let emptyCell = -1;
    for (let i = 0; i < solution.flags.length; i++) {
      if (!(st.flags[i] & 1) && !(solution.flags[i] & F_LIGHT)) {
        emptyCell = i;
        break;
      }
    }
    me.playMoves([light(emptyCell % st.w, Math.floor(emptyCell / st.w))]);

    const palette = lightupGame.colours(DEFAULT_BACKGROUND);
    me.redraw(new RecordingDrawing(palette)); // first paint: no overlay yet
    expect(me.findMistakes()).toBe(1);
    const after = new RecordingDrawing(palette);
    me.redraw(after);
    // The doubled red inset ring records as line segments.
    expect(after.ops.some((o) => o.op === "line" && o.colour === COL_ERROR)).toBe(true);
  });

  it("the show-lit-blobs preference suppresses blobs on lit squares", () => {
    // Mark (0,0), then light (3,0): the mark's square becomes lit.
    const blobRect = (rec: RecordingDrawing) =>
      rec.ops.some(
        (o) => o.op === "rect" && o.colour === COL_BLACK && o.w === 8, // ts/4 at 32
      );
    const me = new Midend(lightupGame);
    expect(me.newGameFromId(EASY_ID)).toBeUndefined();
    me.playMoves([mark(0, 0), light(3, 0)]);
    const palette = lightupGame.colours(DEFAULT_BACKGROUND);
    const on = new RecordingDrawing(palette);
    me.redraw(on);
    expect(blobRect(on)).toBe(true);

    expect(me.setPreferences({ "show-lit-blobs": false })).toBeUndefined();
    const off = new RecordingDrawing(palette);
    me.redraw(off);
    expect(blobRect(off)).toBe(false);
  });
});
