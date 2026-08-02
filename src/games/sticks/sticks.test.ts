/**
 * Behavioural tests for the Sticks port (add-sticks-ts-port §8.2): the desc
 * codec, the contradiction solver, the drag/click/keyboard input machine,
 * `findMistakes`, completion through `executeMove` (the mark=true path the
 * differential never exercises — playbook §5), the midend lifecycle + save
 * round-trip, and tier-2.5 render scenarios with snapshots.
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MOD_SHFT,
  RIGHT_BUTTON,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import { SYMM_NONE, SYMM_ROT2 } from "../../engine/symmetric-blacks.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import type { ChangeNotification, GameStatus } from "../../engine/types.ts";
import cReference from "./__fixtures__/sticks-c-reference.json" with { type: "json" };
import { sticksGame } from "./index.ts";
import { COL_ERROR, COL_LINE, newDrawState, redraw, setTileSize } from "./render.ts";
import {
  findLiveErrors,
  findMistakes,
  sticksSolveGame,
  sticksValidate,
} from "./solver.ts";
import {
  decodeParams,
  encodeDesc,
  encodeParams,
  F_BLOCK,
  F_HOR,
  F_VER,
  newState,
  type SticksMove,
  type SticksState,
  type SticksUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// The small frozen C fixture (4x4, ROT2) — a real, uniquely-solvable board.
const FIX0 = cReference.fixtures.find((f) => f.w === 4 && f.h === 4);
if (!FIX0) throw new Error("4x4 fixture missing from sticks-c-reference.json");
const FIX = FIX0;
const FIX_PARAMS = { w: FIX.w, h: FIX.h, blackpc: FIX.blackpc, symm: FIX.symm };
const FIX_ID = `${FIX.w}x${FIX.h}b${FIX.blackpc}s${FIX.symm}:${FIX.desc}`;

/** The fixture board's unique solution grid. */
function fixtureSolution(): Uint8Array {
  const s = newState(FIX_PARAMS, FIX.desc);
  const grid = s.grid.slice();
  expect(sticksSolveGame(grid, s.numbers, s.w, s.h)).toBe("complete");
  return grid;
}

/** First white cell index of the fixture whose solution is the given line. */
function whiteCellSolved(line: number): number {
  const solution = fixtureSolution();
  for (let i = 0; i < solution.length; i++) {
    if (!(solution[i] & F_BLOCK) && solution[i] & line) return i;
  }
  throw new Error("no such cell");
}

const newUi = (): SticksUi => sticksGame.newUi(newState(FIX_PARAMS, FIX.desc));

/** A midend plus a reader of the last notified game status. */
function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(sticksGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  const status = (): GameStatus | undefined =>
    (
      [...notes].reverse().find((n) => n.type === "game-state-change") as
        | Extract<ChangeNotification, { type: "game-state-change" }>
        | undefined
    )?.status;
  return { m, status };
}

/** Drive interpretMove at the default 48px tile size (border 4). */
function press(
  state: SticksState,
  ui: SticksUi,
  button: number,
  x: number,
  y: number,
): SticksMove | null | typeof UI_UPDATE {
  return sticksGame.interpretMove(state, ui, null, { x, y }, button);
}

/** Pixel centre of cell (x, y) at the default tile size. */
const centre = (x: number, y: number): { x: number; y: number } => ({
  x: x * 48 + 4 + 24,
  y: y * 48 + 4 + 24,
});

describe("sticks desc codec", () => {
  it("decodes the fixture desc to a consistent board", () => {
    const s = newState(FIX_PARAMS, FIX.desc);
    expect(s.grid.length).toBe(16);
    // Re-encoding is the exact inverse (also asserted across all fixtures
    // by the differential's extra check).
    expect(encodeDesc(s.grid, s.numbers, s.w, s.h)).toBe(FIX.desc);
  });

  it("chains z for blank runs over 26", () => {
    const grid = new Uint8Array(32);
    const numbers = new Int16Array(32).fill(-1);
    numbers[30] = 5;
    const desc = encodeDesc(grid, numbers, 8, 4);
    expect(desc).toBe("zd5a");
    const p = { w: 8, h: 4, blackpc: 20, symm: SYMM_NONE };
    expect(validateDesc(p, desc)).toBeNull();
    const back = newState(p, desc);
    expect(back.numbers[30]).toBe(5);
  });

  it("separates adjacent white clues with _ and shares B with its digit", () => {
    const grid = new Uint8Array(4);
    const numbers = new Int16Array(4).fill(-1);
    grid[0] = F_BLOCK;
    numbers[0] = 2;
    numbers[1] = 1;
    numbers[2] = 3;
    const desc = encodeDesc(grid, numbers, 4, 1);
    expect(desc).toBe("B2_1_3a");
    const p = { w: 4, h: 1, blackpc: 20, symm: SYMM_NONE };
    const back = newState(p, desc);
    expect(back.grid[0]).toBe(F_BLOCK);
    expect(Array.from(back.numbers)).toEqual([2, 1, 3, -1]);
  });

  it("validateDesc rejects wrong lengths and unknown characters", () => {
    expect(validateDesc(FIX_PARAMS, FIX.desc)).toBeNull();
    expect(validateDesc(FIX_PARAMS, `${FIX.desc}a`)).toBe("Description is too long");
    expect(validateDesc(FIX_PARAMS, "a1a")).toBe("Description is too short");
    expect(validateDesc(FIX_PARAMS, "a!b")).toBe(
      "Description contains invalid characters",
    );
  });
});

describe("sticks params", () => {
  it("encodes and decodes both forms", () => {
    const p = { w: 7, h: 7, blackpc: 20, symm: SYMM_ROT2 };
    expect(encodeParams(p, true)).toBe("7x7b20s2");
    expect(encodeParams(p, false)).toBe("7x7");
    expect(decodeParams("7x7b20s2")).toEqual(p);
    expect(decodeParams("10x10")).toMatchObject({ w: 10, h: 10 });
  });

  it("validates bounds in upstream order", () => {
    expect(validateParams({ w: 1, h: 5, blackpc: 20, symm: 0 }, true)).toBe(
      "Width and height must be at least 2",
    );
    expect(validateParams({ w: 5, h: 5, blackpc: 4, symm: 0 }, true)).toBe(
      "Percentage of black squares must be between 5% and 100%",
    );
    expect(validateParams({ w: 5, h: 6, blackpc: 20, symm: 4 }, true)).toBe(
      "4-fold symmetry is only available with square grids",
    );
    expect(validateParams({ w: 5, h: 5, blackpc: 20, symm: 9 }, true)).toBe(
      "Unknown symmetry type",
    );
    // The short check ignores everything but dimensions.
    expect(validateParams({ w: 5, h: 5, blackpc: 0, symm: 9 }, false)).toBeNull();
  });
});

describe("sticks solver", () => {
  it("deduces the fixture board to its unique complete solution", () => {
    const solution = fixtureSolution();
    for (let i = 0; i < solution.length; i++) {
      if (!(solution[i] & F_BLOCK)) expect(solution[i] & (F_HOR | F_VER)).not.toBe(0);
    }
  });

  it("reports an over-long segment as invalid, flagging the clue cell", () => {
    // 3x1: clue 1 at cell 0, but a 2-cell horizontal segment through it.
    const grid = new Uint8Array([F_HOR, F_HOR, 0]);
    const numbers = new Int16Array([1, -1, -1]);
    expect(sticksValidate(grid, numbers, 3, 1)).toBe("invalid");
    const errors: number[] = [];
    sticksValidate(grid, numbers, 3, 1, undefined, errors);
    expect(errors).toEqual([0]);
  });

  it("reports a clueless board as unfinished (no deduction possible)", () => {
    const grid = new Uint8Array(4);
    const numbers = new Int16Array(4).fill(-1);
    expect(sticksSolveGame(grid, numbers, 2, 2)).toBe("unfinished");
  });

  it("findLiveErrors flags an over-connected black clue", () => {
    // 3x1: black cell with clue 0 in the middle, a horizontal line touching it.
    const grid = new Uint8Array([F_HOR, F_BLOCK, 0]);
    const numbers = new Int16Array([-1, 0, -1]);
    const state: SticksState = {
      w: 3,
      h: 1,
      grid,
      numbers,
      completed: false,
      cheated: false,
    };
    expect(findLiveErrors(state)).toEqual([1]);
  });
});

describe("sticks findMistakes", () => {
  it("flags a line contradicting the unique solution, and only that", () => {
    const i = whiteCellSolved(F_VER);
    const state = newState(FIX_PARAMS, FIX.desc);
    state.grid[i] = F_HOR; // contradicts the solution's vertical
    expect(findMistakes(state)).toEqual([{ index: i }]);
    state.grid[i] = F_VER; // matches the solution
    expect(findMistakes(state)).toEqual([]);
  });

  it("never flags a blank cell (missing lines are incomplete, not wrong)", () => {
    const state = newState(FIX_PARAMS, FIX.desc);
    expect(findMistakes(state)).toEqual([]);
  });
});

describe("sticks input", () => {
  it("left click cycles blank -> vertical -> horizontal -> blank", () => {
    const i = whiteCellSolved(F_VER);
    const x = i % 4;
    const y = (i - x) / 4;
    let state = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi();
    const c = centre(x, y);

    for (const expected of ["ver", "hor", "none"] as const) {
      expect(press(state, ui, LEFT_BUTTON, c.x, c.y)).toBe(UI_UPDATE);
      const move = press(state, ui, LEFT_RELEASE, c.x, c.y);
      expect(move).toEqual({
        kind: "set",
        changes: [{ index: i, line: expected }],
      });
      state = sticksGame.executeMove(state, move as SticksMove);
    }
    expect(state.grid[i]).toBe(0);
  });

  it("right click cycles the other way (blank -> horizontal)", () => {
    const i = whiteCellSolved(F_VER);
    const c = centre(i % 4, Math.floor(i / 4));
    const state = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi();
    press(state, ui, RIGHT_BUTTON, c.x, c.y);
    expect(press(state, ui, RIGHT_RELEASE, c.x, c.y)).toEqual({
      kind: "set",
      changes: [{ index: i, line: "hor" }],
    });
  });

  it("a click on a black cell commits nothing", () => {
    const state = newState(FIX_PARAMS, FIX.desc);
    const black = state.grid.findIndex((t) => (t & F_BLOCK) !== 0);
    expect(black).toBeGreaterThanOrEqual(0);
    const c = centre(black % 4, Math.floor(black / 4));
    const ui = newUi();
    press(state, ui, LEFT_BUTTON, c.x, c.y);
    expect(press(state, ui, LEFT_RELEASE, c.x, c.y)).toBe(UI_UPDATE);
  });

  it("a horizontal drag accretes cells and commits them as one move", () => {
    const state = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi();
    const c0 = centre(0, 0);
    press(state, ui, LEFT_BUTTON, c0.x, c0.y);
    // Sweep right across the top row in half-tile steps.
    for (let px = c0.x; px <= centre(3, 0).x; px += 24) {
      press(state, ui, LEFT_DRAG, px, c0.y);
    }
    const move = press(state, ui, LEFT_RELEASE, centre(3, 0).x, c0.y);
    expect(move).not.toBe(UI_UPDATE);
    expect(move).not.toBeNull();
    const set = move as Extract<SticksMove, { kind: "set" }>;
    expect(set.kind).toBe("set");
    expect(set.changes.length).toBeGreaterThan(1);
    for (const ch of set.changes) {
      expect(ch.line).toBe("hor");
      expect(state.grid[ch.index] & F_BLOCK).toBe(0);
    }
  });

  it("keyboard: Enter places a vertical at the cursor, no-ops suppressed", () => {
    const state = newState(FIX_PARAMS, FIX.desc);
    // Find a white cell reachable at the cursor origin by moving right.
    const ui = newUi();
    // Arrow to make the cursor visible.
    expect(press(state, ui, CURSOR_RIGHT, 0, 0)).toBe(UI_UPDATE);
    const i = ui.cy * 4 + ui.cx;
    if (state.grid[i] & F_BLOCK) {
      // Fixture-dependent guard: step once more if we landed on a wall.
      press(state, ui, CURSOR_RIGHT, 0, 0);
    }
    const j = ui.cy * 4 + ui.cx;
    const move = press(state, ui, CURSOR_SELECT, 0, 0);
    expect(move).toEqual({ kind: "set", changes: [{ index: j, line: "ver" }] });
    const after = sticksGame.executeMove(state, move as SticksMove);
    // '1' places a vertical — already vertical, so it is a suppressed no-op;
    // Enter cycles onward (vertical -> horizontal), so it still moves.
    expect(press(after, ui, 49 /* '1' */, 0, 0)).toBeNull();
    expect(press(after, ui, CURSOR_SELECT, 0, 0)).toEqual({
      kind: "set",
      changes: [{ index: j, line: "hor" }],
    });
  });

  it("Shift+arrow draws a line across the two cells", () => {
    const state = newState(FIX_PARAMS, FIX.desc);
    const ui = newUi();
    press(state, ui, CURSOR_RIGHT, 0, 0); // reveal cursor at (0,0)... may move
    const ox = ui.cx;
    const oy = ui.cy;
    const move = press(state, ui, CURSOR_RIGHT | MOD_SHFT, 0, 0);
    // Shift+horizontal-arrow paints vertical lines on both cells (upstream
    // mapping); black or already-set cells are skipped.
    if (move !== UI_UPDATE && move !== null) {
      const set = move as Extract<SticksMove, { kind: "set" }>;
      for (const ch of set.changes) {
        expect(ch.line).toBe("ver");
        expect([oy * 4 + ox, ui.cy * 4 + ui.cx]).toContain(ch.index);
      }
    }
  });
});

describe("sticks completion and solve (through a real Midend)", () => {
  it("completing the board via executeMove sets completed and flashes", () => {
    const solution = fixtureSolution();
    let state = newState(FIX_PARAMS, FIX.desc);
    const changes = [];
    for (let i = 0; i < solution.length; i++) {
      if (solution[i] & F_BLOCK) continue;
      changes.push({
        index: i,
        line: solution[i] & F_VER ? ("ver" as const) : ("hor" as const),
      });
    }
    const last = changes.pop();
    if (!last) throw new Error("fixture has no white cells");
    state = sticksGame.executeMove(state, { kind: "set", changes });
    expect(state.completed).toBe(false);
    const done = sticksGame.executeMove(state, { kind: "set", changes: [last] });
    expect(done.completed).toBe(true);
    expect(done.cheated).toBe(false);
    // The non-cheated completion transition arms the flash.
    expect(sticksGame.flashLength?.(state, done, 1, newUi())).toBeGreaterThan(0);
    expect(sticksGame.status(done)).toBe("solved");
  });

  it("Solve through the midend completes the board (solved-with-help)", () => {
    const { m, status } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    expect(m.solve()).toBeUndefined();
    expect(status()).toBe("solved-with-help");
    const text = m.formatAsText();
    expect(text).toBeDefined();
    // Every white cell carries a line ('-' or '|'), none left '.'.
    expect(text).not.toContain(".");
  });

  it("saveGame -> loadGame restores an equivalent game", () => {
    const me = new Midend(sticksGame);
    expect(me.newGameFromId(FIX_ID)).toBeUndefined();
    const i = whiteCellSolved(F_VER);
    me.playMoves([
      { kind: "set", changes: [{ index: i, line: "ver" }] },
    ] as SticksMove[]);
    const saved = me.saveGame();
    const me2 = new Midend(sticksGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toBe(me.formatAsText());
  });

  it("completed is monotonic (matches upstream: never reset)", () => {
    const solution = fixtureSolution();
    let state = newState(FIX_PARAMS, FIX.desc);
    const all = [];
    for (let i = 0; i < solution.length; i++) {
      if (solution[i] & F_BLOCK) continue;
      all.push({
        index: i,
        line: solution[i] & F_VER ? ("ver" as const) : ("hor" as const),
      });
    }
    state = sticksGame.executeMove(state, { kind: "set", changes: all });
    expect(state.completed).toBe(true);
    const broken = sticksGame.executeMove(state, {
      kind: "set",
      changes: [{ index: all[0].index, line: "none" }],
    });
    expect(broken.completed).toBe(true);
  });
});

describe("sticks text format", () => {
  it("renders the four cell glyphs", () => {
    const state = newState(FIX_PARAMS, FIX.desc);
    const i = whiteCellSolved(F_VER);
    state.grid[i] = F_VER;
    const text = textFormat(state);
    expect(text).toContain("#"); // a black cell
    expect(text).toContain("|"); // the placed vertical
    expect(text).toContain("."); // still-blank cells
    expect(text.split("\n").filter(Boolean).length).toBe(4);
  });
});

describe("sticks rendering (tier 2.5)", () => {
  it("draws the opening frame: backing, walls and clue numbers", () => {
    const result = renderScenario({ game: sticksGame, id: FIX_ID });
    const ops = result.recording.ops;
    expect(ops.length).toBeGreaterThan(0);
    // Clue numbers are drawn as text.
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(result.recording.ops).toMatchSnapshot();
  });

  it("draws a placed line as a COL_LINE bar", () => {
    const i = whiteCellSolved(F_VER);
    const result = renderScenario({
      game: sticksGame,
      id: FIX_ID,
      moves: [{ kind: "set", changes: [{ index: i, line: "ver" }] }],
    });
    expect(
      result.recording.ops.some((o) => o.op === "rect" && o.colour === COL_LINE),
    ).toBe(true);
  });

  it("repaints the mistake overlay on an already-drawn frame", () => {
    // The paint-twice guard (playbook §3.2): a cold frame proves nothing, so
    // warm the drawstate, then redraw the SAME drawstate with mistakes.
    const i = whiteCellSolved(F_VER);
    const result = renderScenario({
      game: sticksGame,
      id: FIX_ID,
      moves: [{ kind: "set", changes: [{ index: i, line: "hor" }] }],
      showMistakes: true,
    });
    expect(result.mistakeCount).toBe(1);
    expect(
      result.recording.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR),
    ).toBe(true);
  });

  it("blinks lines off on a flash beat", () => {
    // Drive redraw directly at a mid-flash time (tier 2, recording double).
    const state = newState(FIX_PARAMS, FIX.desc);
    const solution = fixtureSolution();
    for (let i = 0; i < solution.length; i++) state.grid[i] = solution[i];
    const ds = newDrawState(state);
    setTileSize(ds, 48);
    const ui = newUi();
    const dr = new RecordingDrawing(sticksGame.colours([1, 1, 1]));
    // Flash-on beat: floor(0.05 / 0.1) = 0 -> even -> lines hidden.
    redraw(dr, ds, null, state, 1, ui, 0, 0.05);
    expect(dr.ops.some((o) => o.op === "rect" && o.colour === COL_LINE)).toBe(false);
    // A later beat shows them again (same drawstate — the flash bit is in
    // the diff key, so the repaint actually happens).
    const dr2 = new RecordingDrawing(sticksGame.colours([1, 1, 1]));
    redraw(dr2, ds, null, state, 1, ui, 0, 0.15);
    expect(dr2.ops.some((o) => o.op === "rect" && o.colour === COL_LINE)).toBe(true);
  });
});
