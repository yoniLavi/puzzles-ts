/**
 * Behavioural tests for the Crossing port (add-crossing-ts-port): the params
 * and desc codecs (including upstream's exact validation messages and its
 * deliberate leniency), run collection, the two-technique solver, the
 * solver-gated generator's tier-1 properties, Solo-style input with the sticky
 * pencil mode, `executeMove` through to completion via a real `Midend`, Solve,
 * `findMistakes` (wrong digits *and* notes that rule the answer out), the text
 * format, and tier-2.5 render scenarios with snapshots.
 */
import { describe, expect, it } from "vitest";
import type { ChangeNotification, GameStatus } from "../../../puzzle/types.ts";
import { colourToOKLCH } from "../../../utils/color.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_DOWN,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import cReference from "./__fixtures__/crossing-c-reference.json" with { type: "json" };
import { newCrossingDesc } from "./generator.ts";
import { crossingGame } from "./index.ts";
import {
  COL_ACROSS,
  COL_ACROSSFIT,
  COL_DOWN,
  COL_DOWNFIT,
  COL_ERROR,
  COL_GHOST,
  COL_GRID,
  COL_HELD,
  COL_HIGHLIGHT,
  COL_INNERBG,
  COL_LOWLIGHT,
  COL_OUTERBG,
  COL_WALL_M,
  layoutNumbers,
  NCOLOURS,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { findCrossingMistakes, solveCrossing } from "./solver.ts";
import {
  type CrossingMove,
  type CrossingParams,
  type CrossingState,
  type CrossingUi,
  cloneState,
  collectRuns,
  crossingPresets,
  decodeParams,
  encodeDesc,
  encodeParams,
  newState,
  numberAvailableTo,
  numberFitsRun,
  placedRuns,
  readDesc,
  textFormat,
  validateBoard,
  validateDesc,
  validateParams,
} from "./state.ts";

const P5 = { w: 5, h: 5, sym: false };
const FIX = cReference.fixtures[0]; // 5x5, seed crossing-5x5-1
const FIX_ID = `5x5:${FIX.desc}`;
const TS = PREFERRED_TILE_SIZE;

/** The unique solution of the fixture board. */
function fixtureSolution(): Uint8Array {
  const solved = solveCrossing(newState(P5, FIX.desc).puzzle);
  expect(solved.status).toBe("valid");
  return solved.grid;
}

/** Every ink move that fills the fixture board with its solution. */
function solutionMoves(): CrossingMove[] {
  const state = newState(P5, FIX.desc);
  const answer = fixtureSolution();
  const moves: CrossingMove[] = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) {
      const i = y * 5 + x;
      if (state.puzzle.walls[i]) continue;
      moves.push({ kind: "set", x, y, digit: answer[i] });
    }
  return moves;
}

const newUi = (): CrossingUi => crossingGame.newUi(newState(P5, FIX.desc));

/** Drive `interpretMove` at the preferred tile size. */
function press(
  state: CrossingState,
  ui: CrossingUi,
  button: number,
  x: number,
  y: number,
): CrossingMove | null | typeof UI_UPDATE {
  return crossingGame.interpretMove(
    state,
    ui,
    { tilesize: TS } as never,
    { x, y },
    button,
  );
}

/** Pixel centre of cell (x, y) — the half-tile margin plus half a tile. */
const cellCentre = (x: number, y: number): { x: number; y: number } => ({
  x: (x + 1) * TS,
  y: (y + 1) * TS,
});

/** A midend plus a reader of the last notified game status. */
function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(crossingGame);
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

// ---------------------------------------------------------------------------

describe("crossing params", () => {
  it("encode/decode round-trips, with S only on a full encode", () => {
    expect(encodeParams(P5, true)).toBe("5x5");
    expect(encodeParams({ w: 7, h: 4, sym: true }, true)).toBe("7x4S");
    expect(encodeParams({ w: 7, h: 4, sym: true }, false)).toBe("7x4");
    expect(decodeParams("7x4S")).toEqual({ w: 7, h: 4, sym: true });
  });

  it("decodes a bare width as a square board", () => {
    expect(decodeParams("6")).toEqual({ w: 6, h: 6, sym: false });
    expect(decodeParams("6S")).toEqual({ w: 6, h: 6, sym: true });
  });

  it("requires both dimensions >= 2 and at least one >= 4", () => {
    expect(validateParams(P5, true)).toBeNull();
    expect(validateParams({ w: 4, h: 2, sym: false }, true)).toBeNull();
    expect(validateParams({ w: 2, h: 4, sym: false }, true)).toBeNull();
    expect(validateParams({ w: 3, h: 3, sym: false }, true)).toBe(
      "The width or height must be at least 4",
    );
    expect(validateParams({ w: 1, h: 9, sym: false }, true)).toBe(
      "Width must be at least 2",
    );
    expect(validateParams({ w: 9, h: 1, sym: false }, true)).toBe(
      "Height must be at least 2",
    );
  });

  it("rejects a board too large to generate, but only when generating", () => {
    // Measured ceiling: every shape up to 225 squares generated 3/3, everything
    // from 240 up failed at least once, and 280+ never generated. Upstream has
    // no bound at all and simply retries for ever there.
    expect(validateParams({ w: 15, h: 15, sym: false }, true)).toBeNull();
    expect(validateParams({ w: 16, h: 16, sym: false }, true)).toBe(
      "Width times height must be at most 225; larger boards cannot be generated",
    );
    // A description that already exists stays playable at any size.
    expect(validateParams({ w: 16, h: 16, sym: false }, false)).toBeNull();
  });
});

describe("crossing desc codec", () => {
  it("decodes a fixture desc and re-encodes it identically", () => {
    const { walls, numbers } = readDesc(P5, FIX.desc);
    expect(encodeDesc(5, 5, walls, numbers)).toBe(FIX.desc);
  });

  it("reads letters as wall runs and decimals as open runs", () => {
    // "a2a3a2a2a2a6a1" — wall, 2 open, wall, 3 open, …
    const { walls } = readDesc(P5, FIX.desc);
    expect(walls[0]).toBe(1);
    expect(walls[1]).toBe(0);
    expect(walls[2]).toBe(0);
    expect(walls[3]).toBe(1);
    expect(walls.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("stores the numbers sorted by (length, lexicographic)", () => {
    const { numbers } = readDesc(P5, FIX.desc);
    const sorted = [...numbers].sort((a, b) =>
      a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
    );
    expect(numbers).toEqual(sorted);
  });

  it("reports upstream's verdicts", () => {
    expect(validateDesc(P5, FIX.desc)).toBeNull();
    // '!' is not a wall character; the cursor parks and the ',' check fires.
    expect(validateDesc(P5, "a2!3a2a2a2a6a1,12,59")).toBe(
      "Block description is too long",
    );
    // More cell data than 25 cells hold.
    expect(validateDesc(P5, "25a,12,59")).toBe("Block description is too long");
    // The same number twice.
    expect(validateDesc(P5, "a2a3a2a2a2a6a1,12,12")).toBe(
      "Duplicate numbers are not supported",
    );
    // A number longer than the format's nine digits.
    expect(validateDesc(P5, "a2a3a2a2a2a6a1,1234567890")).toBe(
      "One of the numbers is too long",
    );
  });

  it("is as lenient as upstream: single digits are dropped, short descs pass", () => {
    // Upstream's own TODO list names the checks it omits.
    expect(readDesc(P5, "a2a3a2a2a2a6a1,7,12").numbers).toEqual(["12"]);
    expect(validateDesc(P5, "25,12")).toBeNull();
  });
});

describe("crossing runs", () => {
  it("collects horizontal runs before vertical, skipping isolated cells", () => {
    // . . #     row 0: a run of 2; col 0: a run of 3; col 1: a run of 3;
    // . . #     col 2 is walled except the last cell (isolated ⇒ no run).
    // . . .
    const walls = Uint8Array.from([0, 0, 1, 0, 0, 1, 0, 0, 0]);
    const runs = collectRuns(3, 3, walls);
    expect(runs.map((r) => ({ h: r.horizontal, cells: [...r.cells] }))).toEqual([
      { h: true, cells: [0, 1] },
      { h: true, cells: [3, 4] },
      { h: true, cells: [6, 7, 8] },
      { h: false, cells: [0, 3, 6] },
      { h: false, cells: [1, 4, 7] },
    ]);
  });

  it("does not start a run on a lone open cell", () => {
    const walls = Uint8Array.from([0, 1, 0, 1, 1, 1, 0, 1, 0]);
    expect(collectRuns(3, 3, walls)).toEqual([]);
  });
});

describe("crossing solver", () => {
  it("solves the fixture board to a complete unique grid", () => {
    const state = newState(P5, FIX.desc);
    const solved = solveCrossing(state.puzzle);
    expect(solved.status).toBe("valid");
    for (let i = 0; i < 25; i++) {
      if (!state.puzzle.walls[i]) expect(solved.grid[i]).toBeGreaterThan(0);
    }
  });

  it("reports progress on a board its techniques cannot finish", () => {
    // A single 2-cell run with two candidate numbers sharing no digit position
    // is genuinely ambiguous, so the solver stops without a contradiction.
    const state = newState({ w: 4, h: 2, sym: false }, "2a1a1a2,12,34");
    expect(solveCrossing(state.puzzle).status).toBe("progress");
  });

  it("reports invalid when a full run matches no listed number", () => {
    const state = newState(P5, FIX.desc);
    const answer = fixtureSolution();
    const grid = answer.slice();
    // Corrupt one cell of a full board: its run now reads as nothing listed.
    const firstRun = state.puzzle.runs[0];
    grid[firstRun.cells[0]] = (grid[firstRun.cells[0]] % 9) + 1;
    expect(validateBoard(state.puzzle, grid).status).toBe("invalid");
  });
});

describe("crossing generator", () => {
  it("is deterministic for a seed", () => {
    const a = newCrossingDesc(P5, randomNew("determinism"));
    const b = newCrossingDesc(P5, randomNew("determinism"));
    expect(a.desc).toBe(b.desc);
  });

  it.each([
    // Every shipped preset, so a new one cannot be added without being checked.
    ...crossingPresets.map((p): [string, CrossingParams] => [
      `${p.w}x${p.h}${p.sym ? " symmetric" : ""}`,
      { ...p },
    ]),
    ["4x2", { w: 4, h: 2, sym: false }],
    ["8x5", { w: 8, h: 5, sym: false }],
  ] as [
    string,
    CrossingParams,
  ][])("generates a uniquely solvable %s board", (label, params) => {
    const { desc } = newCrossingDesc(params, randomNew(`gen-${label}`));
    expect(validateDesc(params, desc)).toBeNull();
    const state = newState(params, desc);
    // One number per run, and the solver finishes it outright.
    expect(state.puzzle.numbers.length).toBe(state.puzzle.runs.length);
    expect(solveCrossing(state.puzzle).status).toBe("valid");
  });

  it("never leaves a cell that no clue can reach", () => {
    // Upstream's first generator TODO is "Some puzzles have isolated squares
    // (1x1 areas)": an open cell with no open neighbour lies in no run, so it
    // stays blank on a finished board — and since the completion check only
    // inspects runs, a player can type any digit into it and still win.
    for (const [label, params] of [
      ["5x5", P5],
      ["7x7", { w: 7, h: 7, sym: false }],
      ["9x9", { w: 9, h: 9, sym: false }],
      ["9x9 symmetric", { w: 9, h: 9, sym: true }],
    ] as const) {
      for (let s = 0; s < 12; s++) {
        const { desc } = newCrossingDesc(params, randomNew(`iso-${label}-${s}`));
        const { puzzle } = newState(params, desc);
        const covered = new Set<number>();
        for (const run of puzzle.runs) for (const i of run.cells) covered.add(i);
        for (let i = 0; i < params.w * params.h; i++) {
          if (!puzzle.walls[i] && !covered.has(i))
            throw new Error(`${label} seed ${s}: cell ${i} belongs to no run`);
        }
      }
    }
  });

  it("still reproduces upstream's isolated-cell boards on request", () => {
    // The byte-match differential runs with `upstreamIsolatedCells`, so this
    // guards the thing that would otherwise rot silently: that the flag really
    // does change the generated board, and the oracle is therefore still
    // checking upstream's algorithm rather than the shipped one (playbook §4.4).
    const seed = "iso-seed-14"; // found by scan: upstream yields an isolated cell here
    const upstream = newCrossingDesc(P5, randomNew(seed), {
      upstreamIsolatedCells: true,
    }).desc;
    const shipped = newCrossingDesc(P5, randomNew(seed)).desc;
    expect(upstream).not.toBe(shipped);

    const covered = (desc: string): boolean => {
      const { puzzle } = newState(P5, desc);
      const seen = new Set<number>();
      for (const run of puzzle.runs) for (const i of run.cells) seen.add(i);
      for (let i = 0; i < 25; i++) if (!puzzle.walls[i] && !seen.has(i)) return false;
      return true;
    };
    expect(covered(upstream)).toBe(false);
    expect(covered(shipped)).toBe(true);
  });

  it("grows symmetric walls 180°-rotationally", () => {
    const params = { w: 6, h: 4, sym: true };
    const { desc } = newCrossingDesc(params, randomNew("sym-shape"));
    const { walls } = readDesc(params, desc);
    const size = 24;
    for (let i = 0; i < size; i++) {
      // A cell opened by the symmetric arm opens its partner, so an *open* cell
      // always has an open partner (a wall may still be forced by checkPool).
      if (!walls[i]) expect(walls[size - (i + 1)]).toBe(0);
    }
  });
});

describe("crossing input", () => {
  it("left-click selects an open cell, and a repeat click deselects it", () => {
    const state = newState(P5, FIX.desc);
    const puzzle = state.puzzle;
    // Pick a cell that is NOT a crossing: at a crossing the repeat click flips
    // the fill direction instead (see the auto-advance suite).
    let plain = -1;
    for (let i = 0; i < 25 && plain < 0; i++) {
      if (puzzle.walls[i]) continue;
      if (puzzle.acrossRun[i] < 0 || puzzle.downRun[i] < 0) plain = i;
    }
    expect(plain).toBeGreaterThanOrEqual(0);
    const [ox, oy] = [plain % 5, Math.floor(plain / 5)];

    const ui = newUi();
    const c = cellCentre(ox, oy);
    expect(press(state, ui, LEFT_BUTTON, c.x, c.y)).toBe(UI_UPDATE);
    expect(ui).toMatchObject({ cx: ox, cy: oy, cshow: true, cpencil: false });
    expect(press(state, ui, LEFT_BUTTON, c.x, c.y)).toBe(UI_UPDATE);
    expect(ui.cshow).toBe(false);
  });

  it("never selects a wall", () => {
    const state = newState(P5, FIX.desc);
    const ui = newUi();
    const wall = state.puzzle.walls.indexOf(1);
    const c = cellCentre(wall % 5, Math.floor(wall / 5));
    expect(press(state, ui, LEFT_BUTTON, c.x, c.y)).toBe(UI_UPDATE);
    expect(ui.cshow).toBe(false);
  });

  it("right-click toggles the sticky pencil mode (the fork default)", () => {
    const state = newState(P5, FIX.desc);
    const ui = newUi();
    expect(ui.pencilSticky).toBe(true);
    const open = state.puzzle.walls.indexOf(0);
    const c = cellCentre(open % 5, Math.floor(open / 5));

    expect(press(state, ui, RIGHT_BUTTON, c.x, c.y)).toBe(UI_UPDATE);
    expect(ui).toMatchObject({ cpencil: true, cshow: true });
    // A left-click elsewhere keeps pencil mode on.
    const other = cellCentre(
      state.puzzle.walls.lastIndexOf(0) % 5,
      Math.floor(state.puzzle.walls.lastIndexOf(0) / 5),
    );
    press(state, ui, LEFT_BUTTON, other.x, other.y);
    expect(ui.cpencil).toBe(true);
    // Right-click again turns it off.
    press(state, ui, RIGHT_BUTTON, c.x, c.y);
    expect(ui.cpencil).toBe(false);
  });

  it("right-click without the sticky pref is upstream's per-cell pencil select", () => {
    const state = newState(P5, FIX.desc);
    const ui = newUi();
    ui.pencilSticky = false;
    const open = state.puzzle.walls.indexOf(0);
    const c = cellCentre(open % 5, Math.floor(open / 5));
    press(state, ui, RIGHT_BUTTON, c.x, c.y);
    expect(ui).toMatchObject({ cpencil: true, cshow: true });
    press(state, ui, RIGHT_BUTTON, c.x, c.y);
    expect(ui.cshow).toBe(false);
  });

  it("arrow keys move the cursor and Enter toggles ink/pencil", () => {
    const state = newState(P5, FIX.desc);
    const ui = newUi();
    expect(press(state, ui, CURSOR_RIGHT, 0, 0)).toBe(UI_UPDATE);
    expect(ui).toMatchObject({ cx: 1, cy: 0, cshow: true, ckey: true });
    expect(press(state, ui, CURSOR_SELECT, 0, 0)).toBe(UI_UPDATE);
    expect(ui.cpencil).toBe(true);
  });

  it("enters a digit, and suppresses the no-op moves locally", () => {
    const state = newState(P5, FIX.desc);
    const ui = newUi();
    const open = state.puzzle.walls.indexOf(0);
    const [ox, oy] = [open % 5, Math.floor(open / 5)];
    const c = cellCentre(ox, oy);
    press(state, ui, LEFT_BUTTON, c.x, c.y);

    expect(press(state, ui, 0x35, 0, 0)).toEqual({
      kind: "set",
      x: ox,
      y: oy,
      digit: 5,
    });
    // Re-entering the same digit, and clearing an empty cell, change nothing.
    // (Auto-advance has moved the selection on, so put it back deliberately.)
    const filled = crossingGame.executeMove(state, {
      kind: "set",
      x: ox,
      y: oy,
      digit: 5,
    });
    ui.cx = ox;
    ui.cy = oy;
    ui.cshow = true;
    expect(press(filled, ui, 0x35, 0, 0)).toBeNull();
    expect(press(state, ui, 8, 0, 0)).toBeNull();
  });

  it("pencil marks toggle, and never touch a filled cell", () => {
    const state = newState(P5, FIX.desc);
    const ui = newUi();
    const open = state.puzzle.walls.indexOf(0);
    const [ox, oy] = [open % 5, Math.floor(open / 5)];
    const c = cellCentre(ox, oy);
    press(state, ui, RIGHT_BUTTON, c.x, c.y);

    expect(press(state, ui, 0x33, 0, 0)).toEqual({
      kind: "pencil",
      x: ox,
      y: oy,
      digit: 3,
    });
    const filled = crossingGame.executeMove(state, {
      kind: "set",
      x: ox,
      y: oy,
      digit: 5,
    });
    expect(press(filled, ui, 0x33, 0, 0)).toBeNull();
  });

  it("offers the 1-9 keypad plus a clear key", () => {
    const keys = crossingGame.requestKeys?.(P5) ?? [];
    expect(keys.map((k) => k.label)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "Clear",
    ]);
  });
});

describe("crossing cursor auto-advance", () => {
  // The game's own docs call one-cell-at-a-time entry "fairly tedious" and ask
  // for automatic cursor movement; these pin the behaviour that answers it.

  /** A horizontal run of the fixture board, and its first cell. */
  function acrossRun(): { x: number; y: number; len: number } {
    const puzzle = newState(P5, FIX.desc).puzzle;
    const run = puzzle.runs.find((r) => r.horizontal);
    if (!run) throw new Error("fixture has no horizontal run");
    const first = run.cells[0];
    return { x: first % 5, y: Math.floor(first / 5), len: run.cells.length };
  }

  it("steps along the run as digits are typed, and stops at its end", () => {
    const state = newState(P5, FIX.desc);
    const ui = newUi();
    const { x, y, len } = acrossRun();
    const c = cellCentre(x, y);
    press(state, ui, LEFT_BUTTON, c.x, c.y);
    expect(ui).toMatchObject({ cx: x, cy: y, dir: "across" });

    for (let k = 0; k < len - 1; k++) {
      expect(press(state, ui, 0x31 + k, 0, 0)).toMatchObject({
        kind: "set",
        digit: k + 1,
      });
      // The selection advanced one cell and stayed visible, so the next digit
      // lands where the player can see it (upstream hid it after a mouse entry).
      expect(ui).toMatchObject({ cx: x + k + 1, cy: y, cshow: true });
    }
    // At the end of the run it holds position rather than wrapping or leaving it.
    press(state, ui, 0x39, 0, 0);
    expect(ui).toMatchObject({ cx: x + len - 1, cy: y });
  });

  it("does not advance on a clear, on a pencil mark, or with the pref off", () => {
    const { x, y } = acrossRun();
    const c = cellCentre(x, y);

    const filled = crossingGame.executeMove(newState(P5, FIX.desc), {
      kind: "set",
      x,
      y,
      digit: 4,
    });
    const clearing = newUi();
    press(filled, clearing, LEFT_BUTTON, c.x, c.y);
    press(filled, clearing, 8, 0, 0); // Backspace
    expect(clearing).toMatchObject({ cx: x, cy: y });

    const state = newState(P5, FIX.desc);
    const pencil = newUi();
    press(state, pencil, RIGHT_BUTTON, c.x, c.y);
    press(state, pencil, 0x33, 0, 0);
    expect(pencil).toMatchObject({ cx: x, cy: y });

    const off = { ...newUi(), autoAdvance: false };
    press(state, off, LEFT_BUTTON, c.x, c.y);
    press(state, off, 0x31, 0, 0);
    expect(off).toMatchObject({ cx: x, cy: y });
  });

  it("clicking the selected cell again flips across/down at a crossing", () => {
    const state = newState(P5, FIX.desc);
    const puzzle = state.puzzle;
    // A cell that lies in both a horizontal and a vertical run.
    let crossX = -1;
    let crossY = -1;
    for (let i = 0; i < 25 && crossX < 0; i++) {
      if (puzzle.acrossRun[i] >= 0 && puzzle.downRun[i] >= 0) {
        crossX = i % 5;
        crossY = Math.floor(i / 5);
      }
    }
    expect(crossX).toBeGreaterThanOrEqual(0);

    const ui = newUi();
    const c = cellCentre(crossX, crossY);
    press(state, ui, LEFT_BUTTON, c.x, c.y);
    const first = ui.dir;
    press(state, ui, LEFT_BUTTON, c.x, c.y);
    expect(ui.dir).not.toBe(first);
    // Toggling keeps the cell selected — it is a mode change, not a deselect.
    expect(ui.cshow).toBe(true);
    press(state, ui, LEFT_BUTTON, c.x, c.y);
    expect(ui.dir).toBe(first);
  });

  it("snaps the direction when a cell lies in only one run", () => {
    const state = newState(P5, FIX.desc);
    const puzzle = state.puzzle;
    // A cell in a vertical run only: selecting it must mean "down", whatever the
    // player last did, since there is nothing to fill across.
    let onlyDown = -1;
    for (let i = 0; i < 25 && onlyDown < 0; i++) {
      if (puzzle.downRun[i] >= 0 && puzzle.acrossRun[i] < 0) onlyDown = i;
    }
    if (onlyDown < 0) return; // fixture-dependent; the assertion below is the point
    const ui = newUi();
    ui.dir = "across";
    const c = cellCentre(onlyDown % 5, Math.floor(onlyDown / 5));
    press(state, ui, LEFT_BUTTON, c.x, c.y);
    expect(ui.dir).toBe("down");
  });

  it("arrow keys set the direction they move in", () => {
    const state = newState(P5, FIX.desc);
    const ui = newUi();
    press(state, ui, CURSOR_DOWN, 0, 0);
    // Down is only kept where the cell can actually be filled downwards.
    expect(["down", "across"]).toContain(ui.dir);
    const puzzle = state.puzzle;
    const i = ui.cy * 5 + ui.cx;
    if (puzzle.downRun[i] >= 0) expect(ui.dir).toBe("down");
  });
});

describe("crossing number-list placement", () => {
  // The author's scrapped idea was dragging whole numbers onto the grid; this
  // is that, with clicks: pick a clue up from the list, drop it in a run.

  /** Pixel centre of clue number `l` in the panel. */
  function numberCentre(l: number): { x: number; y: number } {
    const { slots } = layoutNumbers(TS, 5, 5, newState(P5, FIX.desc).puzzle.numbers);
    const b = slots[l].hit;
    return { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) };
  }

  /** A run of the fixture board and the index of a number that fits it. */
  function fittingPair(): { run: number; number: number } {
    const { puzzle, grid } = newState(P5, FIX.desc);
    for (let r = 0; r < puzzle.runs.length; r++) {
      for (let l = 0; l < puzzle.numbers.length; l++) {
        if (numberFitsRun(puzzle, grid, puzzle.runs[r], l))
          return { run: r, number: l };
      }
    }
    throw new Error("fixture has no fitting number");
  }

  it("only offers numbers of the run's length that agree with what is typed", () => {
    const state = newState(P5, FIX.desc);
    const { puzzle } = state;
    const run = puzzle.runs.find((r) => r.cells.length === 2);
    if (!run) return;
    // On an empty board every 2-digit clue fits a 2-cell run.
    for (let l = 0; l < puzzle.numbers.length; l++) {
      expect(numberFitsRun(puzzle, state.grid, run, l)).toBe(
        puzzle.numbers[l].length === 2,
      );
    }
    // Typing a digit rules out every clue that disagrees with it.
    const two = puzzle.numbers.findIndex((n) => n.length === 2);
    const first = Number(puzzle.numbers[two][0]);
    const typed = crossingGame.executeMove(state, {
      kind: "set",
      x: run.cells[0] % 5,
      y: Math.floor(run.cells[0] / 5),
      digit: first,
    });
    for (let l = 0; l < puzzle.numbers.length; l++) {
      const n = puzzle.numbers[l];
      expect(numberFitsRun(puzzle, typed.grid, run, l)).toBe(
        n.length === 2 && Number(n[0]) === first,
      );
    }
  });

  it("places a clue into the selected cell's run when it is clicked", () => {
    const state = newState(P5, FIX.desc);
    const { run, number } = fittingPair();
    const cells = state.puzzle.runs[run].cells;
    const ui = newUi();
    ui.dir = state.puzzle.runs[run].horizontal ? "across" : "down";
    const cell = cellCentre(cells[0] % 5, Math.floor(cells[0] / 5));
    press(state, ui, LEFT_BUTTON, cell.x, cell.y);

    const at = numberCentre(number);
    const move = press(state, ui, LEFT_BUTTON, at.x, at.y);
    expect(move).toEqual({ kind: "place", run, number });

    const after = crossingGame.executeMove(state, move as CrossingMove);
    const text = state.puzzle.numbers[number];
    for (let k = 0; k < cells.length; k++) {
      expect(after.grid[cells[k]]).toBe(Number(text[k]));
    }
  });

  it("holds a clue when nothing is selected, and drops it on a run", () => {
    const state = newState(P5, FIX.desc);
    const { run, number } = fittingPair();
    const ui = newUi();

    const at = numberCentre(number);
    expect(press(state, ui, LEFT_BUTTON, at.x, at.y)).toBe(UI_UPDATE);
    expect(ui.heldNumber).toBe(number);
    // Clicking it again puts it back.
    press(state, ui, LEFT_BUTTON, at.x, at.y);
    expect(ui.heldNumber).toBeNull();

    press(state, ui, LEFT_BUTTON, at.x, at.y);
    const cells = state.puzzle.runs[run].cells;
    const cell = cellCentre(cells[0] % 5, Math.floor(cells[0] / 5));
    const move = press(state, ui, LEFT_BUTTON, cell.x, cell.y);
    expect(move).toMatchObject({ kind: "place", number });
    expect(ui.heldNumber).toBeNull();
    // The cell stays selected, so typing carries on from where the clue landed.
    expect(ui).toMatchObject({ cshow: true, cx: cells[0] % 5 });
  });

  it("will not place a clue already used in another run", () => {
    const state = newState(P5, FIX.desc);
    const { run, number } = fittingPair();
    const placedState = crossingGame.executeMove(state, {
      kind: "place",
      run,
      number,
    });
    const placed = placedRuns(placedState.puzzle, placedState.grid);
    expect(placed[number]).toBe(run);
    // Any *other* run of the same length can no longer take it.
    for (let r = 0; r < placedState.puzzle.runs.length; r++) {
      if (r === run) continue;
      expect(
        numberAvailableTo(placedState.puzzle, placedState.grid, placed, r, number),
      ).toBe(false);
    }
  });

  /** Which runs could still take clue `l` on `st`? */
  function candidateRuns(st: CrossingState, l: number): number[] {
    const placed = placedRuns(st.puzzle, st.grid);
    return st.puzzle.runs
      .map((_r, i) => i)
      .filter((i) => numberAvailableTo(st.puzzle, st.grid, placed, i, l));
  }

  function paintWith(st: CrossingState, ui: CrossingUi): RecordingDrawing {
    const palette = crossingGame.colours([0.827, 0.827, 0.827]);
    const ds = newDrawState(st);
    setTileSize(ds, TS);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, st, 1, ui, 0, 0);
    return dr;
  }

  /** How many *cells* carry the candidate wash (a bevelled tile paints its mid
   * colour twice, so count distinct tiles rather than rects). */
  const washedCells = (dr: RecordingDrawing): number =>
    new Set(
      dr.ops.flatMap((o) =>
        o.op === "rect" && (o.colour === COL_ACROSS || o.colour === COL_DOWN)
          ? [`${Math.floor(o.x / TS)},${Math.floor(o.y / TS)}`]
          : [],
      ),
    ).size;
  const ghostDigits = (dr: RecordingDrawing): string[] =>
    dr.ops.flatMap((o) => (o.op === "text" && o.colour === COL_GHOST ? [o.text] : []));

  it("washes every run a held clue could still go in", () => {
    const state = newState(P5, FIX.desc);
    expect(washedCells(paintWith(state, newUi()))).toBe(0);

    const l = 0;
    const runs = candidateRuns(state, l);
    expect(runs.length).toBeGreaterThan(1); // a fresh board leaves many options
    const cells = new Set(runs.flatMap((r) => [...state.puzzle.runs[r].cells]));
    const dr = paintWith(state, { ...newUi(), heldNumber: l });
    expect(washedCells(dr)).toBe(cells.size);
    // …and the clue itself is boxed in the list (held is a shape, not a hue,
    // because the hues are spoken for by the two dimensions).
    expect(dr.ops.some((o) => o.op === "line" && o.colour === COL_HELD)).toBe(true);
  });

  it("previews the digits only when a single run could take the clue", () => {
    const state = newState(P5, FIX.desc);
    const l = 0;
    // Several candidates: the wash says where it might go, but writing the
    // digits into all of them would assert placements the game cannot know
    // (and two candidates that cross would disagree on the shared cell).
    expect(candidateRuns(state, l).length).toBeGreaterThan(1);
    expect(ghostDigits(paintWith(state, { ...newUi(), heldNumber: l }))).toEqual([]);

    // Narrow it to one candidate by ruling the others out with typed digits.
    const text = state.puzzle.numbers[l];
    let narrowed = state;
    const keep = candidateRuns(state, l)[0];
    for (const r of candidateRuns(state, l)) {
      if (r === keep) continue;
      const cell = state.puzzle.runs[r].cells[0];
      const wrong = ((text.charCodeAt(0) - 48) % 9) + 1;
      narrowed = crossingGame.executeMove(narrowed, {
        kind: "set",
        x: cell % 5,
        y: Math.floor(cell / 5),
        digit: wrong,
      });
    }
    const left = candidateRuns(narrowed, l);
    expect(left).toEqual([keep]);
    const ghosted = ghostDigits(paintWith(narrowed, { ...newUi(), heldNumber: l }));
    expect(ghosted.join("")).toBe(text);
  });

  it("shows where a clue already on the board is", () => {
    const state = newState(P5, FIX.desc);
    const { run, number } = fittingPair();
    const after = crossingGame.executeMove(state, { kind: "place", run, number });

    const dr = paintWith(after, { ...newUi(), heldNumber: number });
    // Exactly the run it occupies is washed — nowhere else.
    expect(washedCells(dr)).toBe(after.puzzle.runs[run].cells.length);
    // Its digits are already on the board, so nothing is ghosted.
    expect(ghostDigits(dr)).toEqual([]);
  });

  it("splits the list by where each clue could go from the selected cell", () => {
    const state = newState(P5, FIX.desc);
    const palette = crossingGame.colours([0.827, 0.827, 0.827]);
    const textColours = (ui: CrossingUi): Map<string, number> => {
      const dr = paintWith(state, ui);
      const m = new Map<string, number>();
      for (const o of dr.ops) {
        if (o.op === "text" && state.puzzle.numbers.includes(o.text)) {
          m.set(o.text, o.colour);
        }
      }
      return m;
    };
    void palette;

    // Nothing selected: every clue reads as available.
    for (const c of textColours(newUi()).values()) expect(c).toBe(COL_GRID);

    // Select a cell that lies in both a horizontal and a vertical run.
    const puzzle = state.puzzle;
    let cell = -1;
    for (let i = 0; i < 25 && cell < 0; i++) {
      if (puzzle.acrossRun[i] >= 0 && puzzle.downRun[i] >= 0) cell = i;
    }
    expect(cell).toBeGreaterThanOrEqual(0);
    const ui: CrossingUi = {
      ...newUi(),
      cshow: true,
      cx: cell % 5,
      cy: Math.floor(cell / 5),
      dir: "across",
    };
    const activeLen = puzzle.runs[puzzle.acrossRun[cell]].cells.length;
    const crossLen = puzzle.runs[puzzle.downRun[cell]].cells.length;

    const colours = textColours(ui);
    for (const [text, colour] of colours) {
      if (text.length === activeLen) {
        // Fits the horizontal run through the cell (dir is "across" here).
        expect(colour).toBe(COL_ACROSSFIT);
      } else if (text.length === crossLen) {
        // Fits the vertical run instead — still one click from being placed,
        // so it takes that dimension's colour rather than being dimmed away.
        expect(colour).toBe(COL_DOWNFIT);
      } else {
        expect(colour).toBe(COL_LOWLIGHT);
      }
    }
    // Both directions really are represented (the cell is a crossing).
    expect([...colours.values()]).toContain(COL_ACROSSFIT);
    if (activeLen !== crossLen) expect([...colours.values()]).toContain(COL_DOWNFIT);

    // The preference turns the whole aid off.
    const off = textColours({ ...ui, fitHighlight: false });
    for (const c of off.values()) expect(c).toBe(COL_GRID);
  });

  it("paints the two dimensions at equal perceived strength", () => {
    // Checked against what is actually painted, and in OKLCH rather than RGB:
    // matching the channels numerically is *not* the same as matching what the
    // eye sees, since blue carries far less luminance than amber. An earlier
    // RGB-mirrored pair measured L=0.789/C=0.051 against L=0.818/C=0.059 and
    // read as the vertical run mattering more.
    const state = newState(P5, FIX.desc);
    const puzzle = state.puzzle;
    let cell = -1;
    for (let i = 0; i < 25 && cell < 0; i++) {
      if (puzzle.acrossRun[i] >= 0 && puzzle.downRun[i] >= 0) cell = i;
    }
    const dr = paintWith(state, {
      ...newUi(),
      cshow: true,
      cx: cell % 5,
      cy: Math.floor(cell / 5),
    });

    /** The rgb() string the renderer actually emitted for a palette index. */
    const painted = (colour: number): string => {
      const op = dr.ops.find(
        (o) => (o.op === "rect" || o.op === "text") && o.colour === colour,
      );
      if (!op || (op.op !== "rect" && op.op !== "text"))
        throw new Error(`no ${colour}`);
      return op.rgb;
    };
    const oklch = (rgbString: string): [number, number, number] => {
      const [r, g, b] = (rgbString.match(/\d+/g) ?? []).map((v) => Number(v) / 255);
      return colourToOKLCH([r, g, b]);
    };

    for (const [across, down] of [
      [COL_ACROSS, COL_DOWN],
      [COL_ACROSSFIT, COL_DOWNFIT],
    ]) {
      const [la, ca] = oklch(painted(across));
      const [ld, cd] = oklch(painted(down));
      expect(la).toBeCloseTo(ld, 2); // same lightness
      expect(ca).toBeCloseTo(cd, 2); // same colourfulness
    }
  });

  it("keeps the board wash and the list colouring on separate preferences", () => {
    const state = newState(P5, FIX.desc);
    const puzzle = state.puzzle;
    let cell = -1;
    for (let i = 0; i < 25 && cell < 0; i++) {
      if (puzzle.acrossRun[i] >= 0 && puzzle.downRun[i] >= 0) cell = i;
    }
    const base: CrossingUi = {
      ...newUi(),
      cshow: true,
      cx: cell % 5,
      cy: Math.floor(cell / 5),
    };
    const listColoured = (ui: CrossingUi): boolean =>
      paintWith(state, ui).ops.some(
        (o) =>
          o.op === "text" && (o.colour === COL_ACROSSFIT || o.colour === COL_DOWNFIT),
      );

    expect(washedCells(paintWith(state, base))).toBeGreaterThan(0);
    expect(listColoured(base)).toBe(true);

    // The board wash goes without taking the list colouring with it…
    const noRuns = { ...base, highlightRuns: false };
    expect(washedCells(paintWith(state, noRuns))).toBe(0);
    expect(listColoured(noRuns)).toBe(true);

    // …and vice versa.
    const noList = { ...base, fitHighlight: false };
    expect(washedCells(paintWith(state, noList))).toBeGreaterThan(0);
    expect(listColoured(noList)).toBe(false);
  });

  it("crosses a clue off the list once it is on the board, without dimming alone", () => {
    // "Already used" and "cannot go in this run" both grey out, so the used
    // ones are struck through — the distinction the owner lost otherwise.
    const state = newState(P5, FIX.desc);
    const { run, number } = fittingPair();
    const after = crossingGame.executeMove(state, { kind: "place", run, number });

    const before = paintWith(state, newUi());
    expect(
      before.ops.filter((o) => o.op === "line" && o.colour === COL_LOWLIGHT),
    ).toEqual([]);

    const dr = paintWith(after, newUi());
    const struck = dr.ops.filter((o) => o.op === "line" && o.colour === COL_LOWLIGHT);
    expect(struck).toHaveLength(1);
    // The strike sits on the clue that was placed.
    const { slots } = layoutNumbers(TS, 5, 5, after.puzzle.numbers);
    const slot = slots[number];
    const line = struck[0];
    if (line.op === "line") {
      expect(line.x1).toBe(slot.x);
      expect(line.y1).toBeLessThan(slot.y);
      expect(line.y1).toBeGreaterThan(slot.y - TS);
    }
  });
});

describe("crossing moves and completion", () => {
  it("executeMove is pure and rejects a wall", () => {
    const state = newState(P5, FIX.desc);
    const before = state.grid.slice();
    const open = state.puzzle.walls.indexOf(0);
    crossingGame.executeMove(state, {
      kind: "set",
      x: open % 5,
      y: Math.floor(open / 5),
      digit: 7,
    });
    expect([...state.grid]).toEqual([...before]);

    const wall = state.puzzle.walls.indexOf(1);
    expect(() =>
      crossingGame.executeMove(state, {
        kind: "set",
        x: wall % 5,
        y: Math.floor(wall / 5),
        digit: 7,
      }),
    ).toThrow();
  });

  it("filling the board completes the game and flashes", () => {
    const { m, status } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    const moves = solutionMoves();
    m.playMoves(moves);
    expect(status()).toBe("solved");

    // …and the same transition arms the celebration flash (no help was taken).
    const penultimate = moves
      .slice(0, -1)
      .reduce((s2, mv) => crossingGame.executeMove(s2, mv), newState(P5, FIX.desc));
    const final = crossingGame.executeMove(penultimate, moves[moves.length - 1]);
    expect(penultimate.completed).toBe(false);
    expect(final).toMatchObject({ completed: true, cheated: false });
    expect(
      crossingGame.flashLength?.(penultimate, final, 1, newUi()) ?? 0,
    ).toBeGreaterThan(0);
  });

  it("Solve completes the game with help (no flash)", () => {
    const { m, status } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    expect(m.solve()).toBeUndefined();
    expect(status()).toBe("solved-with-help");
    // `cheated` is set, so the celebration flash must not fire (playbook §3.6).
    const start = newState(P5, FIX.desc);
    const solveResult = crossingGame.solve?.(start, start);
    expect(solveResult?.ok).toBe(true);
    if (solveResult?.ok) {
      const solved = crossingGame.executeMove(start, solveResult.move);
      expect(solved.completed).toBe(true);
      expect(solved.cheated).toBe(true);
      expect(crossingGame.flashLength?.(start, solved, 1, newUi()) ?? 0).toBe(0);
    }
  });

  it("clearing a digit un-fills the cell without un-completing", () => {
    const state = newState(P5, FIX.desc);
    const open = state.puzzle.walls.indexOf(0);
    const [x, y] = [open % 5, Math.floor(open / 5)];
    const set = crossingGame.executeMove(state, { kind: "set", x, y, digit: 4 });
    const cleared = crossingGame.executeMove(set, { kind: "set", x, y, digit: null });
    expect(cleared.grid[open]).toBe(0);
  });

  it("a pencil clear erases every mark in the cell", () => {
    const state = newState(P5, FIX.desc);
    const open = state.puzzle.walls.indexOf(0);
    const [x, y] = [open % 5, Math.floor(open / 5)];
    let s = crossingGame.executeMove(state, { kind: "pencil", x, y, digit: 3 });
    s = crossingGame.executeMove(s, { kind: "pencil", x, y, digit: 8 });
    expect(s.marks[open]).toBe((1 << 2) | (1 << 7));
    s = crossingGame.executeMove(s, { kind: "pencil", x, y, digit: null });
    expect(s.marks[open]).toBe(0);
  });
});

describe("crossing findMistakes", () => {
  it("flags a wrong digit but not a correct one", () => {
    const state = newState(P5, FIX.desc);
    const answer = fixtureSolution();
    const open = state.puzzle.walls.indexOf(0);
    const [x, y] = [open % 5, Math.floor(open / 5)];

    const right = crossingGame.executeMove(state, {
      kind: "set",
      x,
      y,
      digit: answer[open],
    });
    expect(findCrossingMistakes(right)).toEqual([]);

    const wrong = crossingGame.executeMove(state, {
      kind: "set",
      x,
      y,
      digit: (answer[open] % 9) + 1,
    });
    expect(findCrossingMistakes(wrong)).toEqual([{ x, y, kind: "cell" }]);
  });

  it("flags notes that have ruled out the answer, but not extra candidates", () => {
    const state = newState(P5, FIX.desc);
    const answer = fixtureSolution();
    const open = state.puzzle.walls.indexOf(0);
    const [x, y] = [open % 5, Math.floor(open / 5)];

    // A note set that excludes the solution digit is a mistake…
    const bad = cloneState(state);
    bad.marks[open] = 0x1ff & ~(1 << (answer[open] - 1));
    expect(findCrossingMistakes(bad)).toEqual([{ x, y, kind: "note" }]);

    // …while one that merely carries extra candidates is ordinary progress.
    const fine = cloneState(state);
    fine.marks[open] = 0x1ff;
    expect(findCrossingMistakes(fine)).toEqual([]);

    // And no notes at all is never a mistake.
    expect(findCrossingMistakes(state)).toEqual([]);
  });
});

describe("crossing text format", () => {
  it("renders the grid then the numbers grouped by length", () => {
    const text = textFormat(newState(P5, FIX.desc)) ?? "";
    const [grid, ...groups] = text.split("\n\n");
    expect(grid.split("\n")).toHaveLength(5);
    for (const row of grid.split("\n")) {
      expect(row).toMatch(/^[#.1-9]{5}$/);
    }
    // Each group is "<len>: n,n,…," — the lengths ascend.
    const lens = groups
      .join("\n")
      .split("\n")
      .filter(Boolean)
      .map((g) => Number(g.split(":")[0]));
    expect(lens).toEqual([...lens].sort((a, b) => a - b));
  });
});

describe("crossing rendering", () => {
  it("draws the opening frame", () => {
    const r = renderScenario({ game: crossingGame, id: FIX_ID });
    expect(r.recording.ops.length).toBeGreaterThan(0);
    // Every wall and every clue number is on screen from the first frame.
    const texts = r.recording.ops.filter((o) => o.op === "text");
    for (const num of newState(P5, FIX.desc).puzzle.numbers) {
      expect(texts.some((o) => o.op === "text" && o.text === num)).toBe(true);
    }
    expect(r.recording.ops).toMatchSnapshot();
  });

  it("frames a full-but-unlisted run in red", () => {
    const state = newState(P5, FIX.desc);
    // Fill the first run with digits that spell no listed number.
    const run = state.puzzle.runs[0];
    const moves: CrossingMove[] = run.cells.map((i, k) => ({
      kind: "set" as const,
      x: i % 5,
      y: Math.floor(i / 5),
      digit: ((k + 7) % 9) + 1,
    }));
    const errRects = (r: { recording: RecordingDrawing }): number =>
      r.recording.ops.filter((o) => o.op === "rect" && o.colour === COL_ERROR).length;

    expect(errRects(renderScenario({ game: crossingGame, id: FIX_ID }))).toBe(0);
    const dirty = renderScenario({ game: crossingGame, id: FIX_ID, moves });
    expect(errRects(dirty)).toBeGreaterThan(0);
    expect(dirty.recording.ops).toMatchSnapshot();
  });

  it("highlights a mistake even on a cell that was already drawn", () => {
    // The paint-twice test (playbook §3.2): the overlay must sit in the diff
    // key, or Check & Save — which runs a frame *after* the move that drew the
    // cell — would silently highlight nothing.
    const state = newState(P5, FIX.desc);
    const answer = fixtureSolution();
    const open = state.puzzle.walls.indexOf(0);
    const dirty = crossingGame.executeMove(state, {
      kind: "set",
      x: open % 5,
      y: Math.floor(open / 5),
      digit: (answer[open] % 9) + 1,
    });
    const mistakes = findCrossingMistakes(dirty);
    expect(mistakes).toHaveLength(1);

    const palette = crossingGame.colours([0.827, 0.827, 0.827]);
    const ds = newDrawState(dirty);
    setTileSize(ds, TS);
    const ui = newUi();
    const errLines = (dr: RecordingDrawing): number =>
      dr.ops.filter((o) => o.op === "line" && o.colour === COL_ERROR).length;

    // Frame 1 warms the cache with no overlay…
    const first = new RecordingDrawing(palette);
    redraw(first, ds, null, dirty, 1, ui, 0, 0);
    expect(errLines(first)).toBe(0);

    // …frame 2 adds the overlay on an otherwise unchanged board…
    const second = new RecordingDrawing(palette);
    redraw(second, ds, dirty, dirty, 1, ui, 0, 0, undefined, mistakes);
    expect(errLines(second)).toBeGreaterThan(0);

    // …and frame 3 clears it again.
    const third = new RecordingDrawing(palette);
    redraw(third, ds, dirty, dirty, 1, ui, 0, 0, undefined, []);
    expect(errLines(third)).toBe(0);
  });

  it("highlights the selected cell and marks a keyboard cursor", () => {
    const state = newState(P5, FIX.desc);
    const palette = crossingGame.colours([0.827, 0.827, 0.827]);
    const open = state.puzzle.walls.indexOf(0);
    const paint = (ui: CrossingUi): RecordingDrawing => {
      const ds = newDrawState(state);
      setTileSize(ds, TS);
      const dr = new RecordingDrawing(palette);
      redraw(dr, ds, null, state, 1, ui, 0, 0);
      return dr;
    };

    const idle = paint(newUi());
    expect(
      idle.ops.filter((o) => o.op === "rect" && o.colour === COL_HIGHLIGHT),
    ).toHaveLength(0);

    const selected = {
      ...newUi(),
      cshow: true,
      cx: open % 5,
      cy: Math.floor(open / 5),
    };
    expect(
      paint(selected).ops.filter((o) => o.op === "rect" && o.colour === COL_HIGHLIGHT)
        .length,
    ).toBe(1);

    // The keyboard cursor draws corner brackets rather than a filled highlight.
    const keyed = { ...selected, ckey: true };
    const keyedOps = paint(keyed).ops;
    expect(
      keyedOps.filter((o) => o.op === "rect" && o.colour === COL_HIGHLIGHT),
    ).toHaveLength(0);
    expect(
      keyedOps.filter((o) => o.op === "line" && o.colour === COL_HIGHLIGHT).length,
    ).toBe(8);
  });

  it("draws pencil marks in an empty cell", () => {
    const state = newState(P5, FIX.desc);
    const open = state.puzzle.walls.indexOf(0);
    const noted = crossingGame.executeMove(state, {
      kind: "pencil",
      x: open % 5,
      y: Math.floor(open / 5),
      digit: 4,
    });
    const palette = crossingGame.colours([0.827, 0.827, 0.827]);
    const ds = newDrawState(noted);
    setTileSize(ds, TS);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, noted, 1, ui0(), 0, 0);
    expect(dr.ops.some((o) => o.op === "text" && o.text === "4")).toBe(true);
  });

  it("sweeps highlight/lowlight across the board during the completion flash", () => {
    const solved = solutionMoves().reduce(
      (s2, mv) => crossingGame.executeMove(s2, mv),
      newState(P5, FIX.desc),
    );
    const palette = crossingGame.colours([0.827, 0.827, 0.827]);
    const frameColours = (flashTime: number): number[] => {
      const ds = newDrawState(solved);
      setTileSize(ds, TS);
      const dr = new RecordingDrawing(palette);
      redraw(dr, ds, null, solved, 1, ui0(), 0, flashTime);
      return [
        ...new Set(dr.ops.flatMap((o) => (o.op === "rect" ? [o.colour] : []))),
      ].sort((a, b) => a - b);
    };
    // A settled board paints no tile in the flash colours; two different flash
    // phases paint *different* cells with them, so the wave is really moving.
    const settled = frameColours(0);
    expect(settled).not.toContain(COL_HIGHLIGHT);
    const early = frameColours(0.7);
    const late = frameColours(0.3);
    expect(early).toContain(COL_HIGHLIGHT);
    expect(late).toContain(COL_HIGHLIGHT);

    const litCells = (flashTime: number): string[] => {
      const ds = newDrawState(solved);
      setTileSize(ds, TS);
      const dr = new RecordingDrawing(palette);
      redraw(dr, ds, null, solved, 1, ui0(), 0, flashTime);
      return dr.ops.flatMap((o) =>
        o.op === "rect" && o.colour === COL_HIGHLIGHT ? [`${o.x},${o.y}`] : [],
      );
    };
    expect(litCells(0.7)).not.toEqual(litCells(0.3));
  });

  it("paints entered digits on one neutral tile, not nine colours", () => {
    // The per-digit colours upstream drew were a leftover from a scrapped
    // drag-and-drop design; its author asked for them to go.
    const withDigits = solutionMoves()
      .slice(0, 4)
      .reduce((s2, mv) => crossingGame.executeMove(s2, mv), newState(P5, FIX.desc));
    const palette = crossingGame.colours([0.827, 0.827, 0.827]);
    expect(palette).toHaveLength(NCOLOURS);

    const ds = newDrawState(withDigits);
    setTileSize(ds, TS);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, withDigits, 1, ui0(), 0, 0);

    // Every digit is drawn in the same (grid) colour…
    const digitColours = dr.ops.flatMap((o) =>
      o.op === "text" && /^[1-9]$/.test(o.text) && o.size > TS / 3 ? [o.colour] : [],
    );
    expect(digitColours.length).toBeGreaterThan(0);
    expect(new Set(digitColours)).toEqual(new Set([COL_GRID]));
    // …and no tile is painted in anything outside the neutral palette.
    const tileColours = new Set(
      dr.ops.flatMap((o) => (o.op === "rect" ? [o.colour] : [])),
    );
    for (const c of tileColours) {
      expect([
        COL_OUTERBG,
        COL_INNERBG,
        COL_HIGHLIGHT,
        COL_LOWLIGHT,
        COL_WALL_M,
        COL_ERROR,
      ]).toContain(c);
    }
  });
});

/** A fresh ui, for the direct-redraw tests. */
function ui0(): CrossingUi {
  return newUi();
}
