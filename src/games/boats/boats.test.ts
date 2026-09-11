/**
 * Boats — behavioral tests (tier 1) plus render scenarios (tier 2.5).
 *
 * The byte-match differential (`boats-differential.test.ts`) covers the
 * generator, the solver and the codec against the C. What it cannot reach is
 * everything downstream of `newDesc`: input mapping, `executeMove`'s shape
 * resolution and completion check, the mistake overlay, and the frame the
 * player actually sees. That is what this file is for (docs/games/testing.md §
 * "The test tiers": a byte-match differential does not exercise the
 * interactive completion path).
 */

import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MOD_CTRL,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { fleetFits, newBoatsDesc, validateParams } from "./generator.ts";
import { boatsGame } from "./index.ts";
import {
  type BoatsDrawState,
  COL_COLLISION_ERROR,
  COL_COLLISION_TEXT,
  COL_SHIP_ERROR,
  COL_SHIP_GUESS,
  COL_WATER,
  computeSize,
  FLASH_TIME,
  fleetLayout,
  fleetRowLimit,
  fleetRows,
  PREFERRED_TILE_SIZE,
} from "./render.ts";
import { findMistakes, solveBoats, solveToGrid } from "./solver.ts";
import {
  type BoatsMove,
  type BoatsParams,
  type BoatsState,
  type BoatsUi,
  boardOf,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_NORMAL,
  DIFF_TRICKY,
  decodeFleet,
  decodeParams,
  defaultFleet,
  EMPTY,
  encodeDesc,
  encodeFleet,
  encodeParams,
  isShip,
  newState,
  newUi,
  PRESETS,
  presetParams,
  SHIP_LEFT,
  SHIP_RIGHT,
  SHIP_SINGLE,
  SHIP_VAGUE,
  textFormat,
  validateDesc,
  WATER,
} from "./state.ts";
import { adjustShips, checkFleet, countShips } from "./validate.ts";

const params = (over: Partial<BoatsParams> = {}): BoatsParams => ({
  w: 6,
  h: 6,
  fleet: 3,
  fleetData: defaultFleet(3),
  diff: DIFF_EASY,
  strip: false,
  ...over,
});

/** Reach into a driven Midend for its live state. */
function stateOf(
  me: Midend<BoatsParams, BoatsState, BoatsMove, BoatsUi, BoatsDrawState>,
): BoatsState {
  return (me as unknown as { state: BoatsState }).state;
}

/** Generate a board deterministically, for the tests that need a real one. */
function generated(p: BoatsParams, seed: string): BoatsState {
  const { desc } = newBoatsDesc(p, randomNew(seed));
  return newState(p, desc);
}

// --- params ----------------------------------------------------------------

describe("boats params", () => {
  it("round-trips every preset through encode/decode", () => {
    for (let i = 0; i < PRESETS.length; i++) {
      const p = presetParams(i);
      const decoded = decodeParams(encodeParams(p, true));
      expect(decoded).toEqual(p);
    }
  });

  it("omits the difficulty and strip flag from a non-full encoding", () => {
    const p = params({ diff: DIFF_HARD, strip: true });
    expect(encodeParams(p, false)).toBe("6x6f3,3,2,1");
    expect(encodeParams(p, true)).toBe("6x6f3dhS,3,2,1");
  });

  it("decodes a square form with no explicit height", () => {
    const p = decodeParams("7f2,2,1");
    expect([p.w, p.h, p.fleet]).toEqual([7, 7, 2]);
  });

  it("rejects an unknown difficulty letter only on a full validation", () => {
    const p = decodeParams("6x6f3dz,3,2,1");
    expect(validateParams(p, true)).toBe("Unknown difficulty level");
    // A `params:desc` id carries no difficulty, so it must not be rejected.
    expect(validateParams(p, false)).toBeNull();
  });

  it("reports upstream's messages in upstream's order", () => {
    expect(validateParams(params({ w: 100 }), true)).toBe("Width is too high");
    expect(validateParams(params({ h: 100 }), true)).toBe("Height is too high");
    expect(validateParams(params({ fleet: 0, fleetData: [] }), true)).toBe(
      "Fleet size must be at least 1",
    );
    expect(validateParams(params({ w: 2, h: 2, fleet: 3 }), true)).toBe(
      "Fleet size must be smaller than the width and height",
    );
    expect(validateParams(params({ fleet: 3, fleetData: [0, 0, 0] }), true)).toBe(
      "Fleet must contain at least 1 boat",
    );
  });

  it("rejects a fleet that cannot physically fit, in either orientation", () => {
    // Measured against the C: the default 3,2,1 pyramid needs a 5x5.
    expect(validateParams(params({ w: 5, h: 4 }), true)).toBe(
      "Fleet does not fit into the grid",
    );
    expect(validateParams(params({ w: 4, h: 5 }), true)).toBe(
      "Fleet does not fit into the grid",
    );
    expect(validateParams(params({ w: 5, h: 5 }), true)).toBeNull();
  });

  it("encodes and decodes a custom fleet, padding a short list with zeroes", () => {
    expect(encodeFleet([3, 2, 1], 3)).toBe("3,2,1");
    expect(decodeFleet(",3,2", 3)).toEqual([3, 2, 0]);
    expect(decodeFleet("2,2,2", 3)).toEqual([2, 2, 2]);
    expect(defaultFleet(4)).toEqual([4, 3, 2, 1]);
  });

  it("uses the default fleet when the game ID names none", () => {
    expect(decodeParams("8x8f4").fleetData).toEqual([4, 3, 2, 1]);
  });
});

// --- desc codec ------------------------------------------------------------

describe("boats desc codec", () => {
  it("round-trips a generated description", () => {
    const p = params();
    const state = generated(p, "boats-codec-1");
    expect(encodeDesc(p.w, p.h, state.borderClues, state.gridClues)).toBe(
      newBoatsDesc(p, randomNew("boats-codec-1")).desc,
    );
  });

  it("drops the trailing run of clue-less squares, as upstream does", () => {
    // Upstream's encoder only emits a run when it meets a clue or hits the
    // 26-square cap, so whatever is left at the end is simply dropped — and the
    // decoder is fine with it, because those squares are empty anyway.
    const border = new Int32Array(6).fill(1);
    // 3x3 with one clue: the two squares after it are never flushed.
    const clues = new Int8Array(9);
    clues[6] = WATER;
    expect(encodeDesc(3, 3, border, clues)).toBe("1,1,1,1,1,1,fW");
    // An all-empty grid therefore encodes as no grid part at all — which the
    // C fixtures confirm (the 4x4 Easy board's desc ends at its last comma).
    expect(encodeDesc(3, 3, border, new Int8Array(9))).toBe("1,1,1,1,1,1,");
  });

  it("splits a run longer than 26 squares", () => {
    const border = new Int32Array(20).fill(0);
    const clues = new Int8Array(100);
    clues[29] = WATER;
    const desc = encodeDesc(10, 10, border, clues);
    expect(desc).toContain("zcW"); // 26 + 3 empties, then the clue
  });

  it("accepts a short description but rejects an overlong grid", () => {
    const p = params();
    expect(validateDesc(p, "1,1,1,1,1,1,1,1,1,1,1,1,")).toBeNull();
    expect(validateDesc(p, "1,1,1,1,1,1,1,1,1,1,1,1,zz")).toBe("Too many grid clues");
    expect(validateDesc(p, "1,1,1,1,1,1,1,1,1,1,1,")).toBe("Not enough border clues");
    expect(validateDesc(p, "1,1,1,1,1,1,1,1,1,1,1,1,1,")).toBe("Too many border clues");
    expect(validateDesc(p, "1,1,1,1,1,1,1,1,1,1,1,1,Q")).toBe(
      "Description contains invalid characters",
    );
  });

  it("decodes hidden border numbers", () => {
    const p = params({ strip: true });
    const state = newState(p, "1,-,1,1,1,1,1,1,1,1,1,1,");
    expect(state.borderClues[1]).toBe(-1);
    expect(state.borderClues[0]).toBe(1);
  });

  it("seeds the playable grid from the given clues", () => {
    const p = params();
    // A given single at the top-left, then water.
    const state = newState(p, "1,1,1,1,1,1,1,1,1,1,1,1,SW");
    expect(state.gridClues[0]).toBe(SHIP_SINGLE);
    expect(isShip(state.grid[0])).toBe(true);
    expect(state.grid[1]).toBe(WATER);
  });
});

// --- solver ----------------------------------------------------------------

describe("boats solver", () => {
  it("solves every preset's generated board at exactly its difficulty", () => {
    for (let i = 0; i < PRESETS.length; i++) {
      const p = presetParams(i);
      const state = generated(p, `boats-preset-${i}`);
      const result = solveBoats(boardOf(state), p.diff);
      expect(result, `preset ${i}`).toEqual({ kind: "solved", diff: p.diff });
    }
  });

  it("needs each tier for a board generated at that tier", () => {
    for (const diff of [DIFF_EASY, DIFF_NORMAL, DIFF_TRICKY, DIFF_HARD]) {
      const p = params({ w: 8, h: 8, fleet: 4, fleetData: defaultFleet(4), diff });
      const state = generated(p, `boats-tier-${diff}`);
      // Solvable at its own tier...
      expect(solveBoats(boardOf(state), diff)).toEqual({ kind: "solved", diff });
      // ...and, above Easy, not at the tier below it.
      if (diff > DIFF_EASY)
        expect(solveBoats(boardOf(state), diff - 1).kind).toBe("stuck");
    }
  });

  it("reports a contradictory board as invalid", () => {
    // Row 0 says one ship; two given singles sit in it.
    const p = params({ w: 4, h: 4, fleet: 2, fleetData: [2, 1] });
    const state = newState(p, "1,0,1,0,1,0,0,0,SaS");
    expect(solveBoats(boardOf(state), DIFF_HARD).kind).toBe("invalid");
  });

  it("restores hidden border numbers it filled in while solving", () => {
    const p = params({ diff: DIFF_TRICKY, strip: true });
    const state = generated(p, "boats-restore-1");
    const board = boardOf(state);
    const before = Int32Array.from(board.borderClues);
    solveBoats(board, DIFF_TRICKY);
    expect(Array.from(board.borderClues)).toEqual(Array.from(before));
    expect(before.some((c) => c === -1)).toBe(true);
  });

  it("solves to a grid whose fleet inventory matches the params", () => {
    const p = params({ w: 8, h: 8, fleet: 4, fleetData: defaultFleet(4) });
    const state = generated(p, "boats-inventory-1");
    const solved = solveToGrid(state);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;

    const board = boardOf(state);
    board.grid.set(solved.grid);
    adjustShips(board);
    const counts = new Int32Array(p.fleet);
    checkFleet(board, counts);
    expect(Array.from(counts)).toEqual(p.fleetData);

    // ...and the row/column numbers are met exactly.
    const ships = new Int32Array(p.w + p.h);
    countShips(board, undefined, ships);
    for (let i = 0; i < p.w + p.h; i++) expect(ships[i]).toBe(state.borderClues[i]);
  });
});

// --- generator -------------------------------------------------------------

describe("boats generator", () => {
  it("is deterministic for a seed", () => {
    const p = params();
    const a = newBoatsDesc(p, randomNew("boats-determinism")).desc;
    const b = newBoatsDesc(p, randomNew("boats-determinism")).desc;
    expect(a).toBe(b);
  });

  it("produces a description its own validator accepts", () => {
    for (let i = 0; i < PRESETS.length; i++) {
      const p = presetParams(i);
      const { desc } = newBoatsDesc(p, randomNew(`boats-valid-${i}`));
      expect(validateDesc(p, desc), desc).toBeNull();
    }
  });

  it("hides at least two border numbers when asked to remove numbers", () => {
    const p = params({ diff: DIFF_TRICKY, strip: true });
    const state = generated(p, "boats-strip-1");
    const hidden = Array.from(state.borderClues).filter((c) => c === -1).length;
    // One hidden number is derivable from the fleet total, so upstream refuses
    // to ship a board with only one.
    expect(hidden).toBeGreaterThanOrEqual(2);
  });

  it("places a fleet that fits and refuses one that does not", () => {
    expect(fleetFits(params({ w: 5, h: 5 }))).toBe(true);
    expect(fleetFits(params({ w: 5, h: 4 }))).toBe(false);
  });
});

// --- input and moves -------------------------------------------------------

/** Drive `interpretMove` with the game's own ui, as the midend would. */
function press(
  state: BoatsState,
  ui: ReturnType<typeof newUi>,
  x: number,
  y: number,
  button: number,
) {
  const ts = PREFERRED_TILE_SIZE;
  return boatsGame.interpretMove(
    state,
    ui,
    { tilesize: ts } as never,
    { x: x * ts + ts / 2, y: y * ts + ts / 2 },
    button,
  );
}

/** A board with no given clues at all, so every square is editable. */
function blankState(): BoatsState {
  const p = params();
  return newState(p, "1,1,1,1,1,1,1,1,1,1,1,1,");
}

describe("boats input", () => {
  it("cycles a square empty → boat → water → empty on left-click", () => {
    let state = blankState();
    const ui = newUi();

    for (const expected of [SHIP_VAGUE, WATER, EMPTY]) {
      expect(press(state, ui, 2, 2, LEFT_BUTTON)).toBe(UI_UPDATE);
      const move = press(state, ui, 2, 2, LEFT_RELEASE);
      expect(move).not.toBe(UI_UPDATE);
      state = boatsGame.executeMove(state, move as BoatsMove);
      if (expected === SHIP_VAGUE) expect(isShip(state.grid[2 * 6 + 2])).toBe(true);
      else expect(state.grid[2 * 6 + 2]).toBe(expected);
    }
  });

  it("toggles water on right-click", () => {
    let state = blankState();
    const ui = newUi();
    press(state, ui, 1, 1, RIGHT_BUTTON);
    state = boatsGame.executeMove(
      state,
      press(state, ui, 1, 1, LEFT_RELEASE) as BoatsMove,
    );
    expect(state.grid[1 * 6 + 1]).toBe(WATER);
  });

  it("fills a whole run along one row on a drag", () => {
    let state = blankState();
    const ui = newUi();
    press(state, ui, 1, 3, RIGHT_BUTTON);
    press(state, ui, 3, 3, LEFT_DRAG);
    const move = press(state, ui, 4, 3, LEFT_RELEASE) as BoatsMove;
    expect(move).toMatchObject({ kind: "fill", x0: 1, x1: 4, y0: 3, y1: 3, to: "W" });

    state = boatsGame.executeMove(state, move);
    for (let x = 1; x <= 4; x++) expect(state.grid[3 * 6 + x]).toBe(WATER);
    expect(state.grid[3 * 6 + 0]).toBe(EMPTY);
    expect(state.grid[3 * 6 + 5]).toBe(EMPTY);
  });

  it("constrains a diagonal drag to the axis it moved furthest along", () => {
    const state = blankState();
    const ui = newUi();
    press(state, ui, 1, 1, RIGHT_BUTTON);
    // Three columns right, one row down: the row wins.
    press(state, ui, 4, 2, LEFT_DRAG);
    expect([ui.dex, ui.dey]).toEqual([4, 1]);
  });

  it("widens the click target on the far edges so a whole line is easy to fill", () => {
    const state = blankState();
    const ui = newUi();
    const ts = PREFERRED_TILE_SIZE;
    // A press in the number column maps back onto the last board column.
    boatsGame.interpretMove(
      state,
      ui,
      { tilesize: ts } as never,
      { x: 6 * ts + 2, y: 2 * ts + 2 },
      RIGHT_BUTTON,
    );
    expect(ui.dsx).toBe(5);
  });

  it("rejects a no-op move rather than pushing a history entry", () => {
    const state = blankState();
    const ui = newUi();
    // Clearing an already-empty square changes nothing.
    ui.dragFrom = "-";
    ui.dragTo = "-";
    ui.dragOk = true;
    ui.dsx = ui.dex = 0;
    ui.dsy = ui.dey = 0;
    expect(press(state, ui, 0, 0, LEFT_RELEASE)).toBe(UI_UPDATE);
  });

  it("places with the keyboard cursor and fills a line with Ctrl+arrow", () => {
    let state = blankState();
    const ui = newUi();

    expect(press(state, ui, 0, 0, CURSOR_RIGHT)).toBe(UI_UPDATE);
    expect([ui.cursor.x, ui.cursor.y, ui.cursor.visible]).toEqual([1, 0, true]);

    const place = press(state, ui, 0, 0, CURSOR_SELECT) as BoatsMove;
    state = boatsGame.executeMove(state, place);
    expect(isShip(state.grid[1])).toBe(true);

    expect(press(state, ui, 0, 0, CURSOR_DOWN)).toBe(UI_UPDATE);
    const fill = press(state, ui, 0, 0, CURSOR_DOWN | MOD_CTRL) as BoatsMove;
    expect(fill).toMatchObject({ kind: "fill", to: "B" });
  });

  it("places water with the secondary select key", () => {
    let state = blankState();
    const ui = newUi();
    press(state, ui, 0, 0, CURSOR_RIGHT);
    const move = press(state, ui, 0, 0, CURSOR_SELECT2) as BoatsMove;
    state = boatsGame.executeMove(state, move);
    expect(state.grid[1]).toBe(WATER);
  });

  it("never edits a given clue square", () => {
    const p = params();
    const state = newState(p, "1,1,1,1,1,1,1,1,1,1,1,1,S");
    const ui = newUi();
    press(state, ui, 0, 0, RIGHT_BUTTON);
    expect(press(state, ui, 0, 0, LEFT_RELEASE)).toBe(UI_UPDATE);
  });
});

describe("boats moves", () => {
  it("leaves a segment vague until its neighbors decide the shape", () => {
    const p = params();
    let state = newState(p, "1,1,1,1,1,1,1,1,1,1,1,1,");
    const apply = (m: BoatsMove) => {
      state = boatsGame.executeMove(state, m);
    };

    // Two adjacent boat squares say nothing yet: the boat might extend either
    // way, so both stay unresolved.
    apply({ kind: "fill", x0: 1, y0: 1, x1: 2, y1: 1, from: "-", to: "B" });
    expect(state.grid[1 * 6 + 1]).toBe(SHIP_VAGUE);
    expect(state.grid[1 * 6 + 2]).toBe(SHIP_VAGUE);

    // Cap both ends with water and they resolve to a left/right pair.
    apply({ kind: "fill", x0: 0, y0: 1, x1: 0, y1: 1, from: "-", to: "W" });
    apply({ kind: "fill", x0: 3, y0: 1, x1: 3, y1: 1, from: "-", to: "W" });
    expect(state.grid[1 * 6 + 1]).toBe(SHIP_LEFT);
    expect(state.grid[1 * 6 + 2]).toBe(SHIP_RIGHT);
  });

  it("executeMove is pure", () => {
    const state = blankState();
    const before = Array.from(state.grid);
    boatsGame.executeMove(state, {
      kind: "fill",
      x0: 0,
      y0: 0,
      x1: 5,
      y1: 0,
      from: "-",
      to: "W",
    });
    expect(Array.from(state.grid)).toEqual(before);
  });

  it("is won once every boat is placed, with no need to fill in the water", () => {
    // Upstream's win test is "every row/column count is met, the fleet
    // inventory is exact, no boats touch, and every given clue agrees" — it
    // never asks for water. `adjustShips` closes the gap: once the placed
    // ships equal the fleet's total, every undecided neighbor counts as
    // water, so the last boat resolves the shapes and the board is complete.
    const p = params({ w: 8, h: 8, fleet: 4, fleetData: defaultFleet(4) });
    const state = generated(p, "boats-win-without-water");
    const solved = solveToGrid(state);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;

    // Place only the ships; leave every water square untouched.
    let played = state;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x;
        if (!isShip(solved.grid[i]) || state.gridClues[i] !== EMPTY) continue;
        played = boatsGame.executeMove(played, {
          kind: "fill",
          x0: x,
          y0: y,
          x1: x,
          y1: y,
          from: "-",
          to: "B",
        });
      }

    expect(played.completed).toBe(true);
    // ...and there really are undecided squares left on the board.
    expect(Array.from(played.grid).some((c) => c === EMPTY)).toBe(true);
  });

  it("completes and flashes when the fleet is found", () => {
    const p = params({ w: 8, h: 8, fleet: 4, fleetData: defaultFleet(4) });
    const state = generated(p, "boats-complete-1");
    const solved = solveToGrid(state);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;

    const done = boatsGame.executeMove(state, {
      kind: "solve",
      grid: Array.from(solved.grid),
    });
    expect(done.completed).toBe(true);
    expect(boatsGame.status(done)).toBe("solved");
    // Solved with help, so no celebration flash.
    expect(boatsGame.flashLength?.(state, done, 1, newUi())).toBe(0);
  });
});

// --- Solve, through a real midend ------------------------------------------

describe("boats solve", () => {
  it("completes the game through the midend and reports solved-with-help", () => {
    const p = presetParams(0);
    const { desc } = newBoatsDesc(p, randomNew("boats-midend-solve"));
    const midend = new Midend(boatsGame);
    expect(midend.newGameFromId(`${encodeParams(p, true)}:${desc}`)).toBeUndefined();

    expect(midend.solve()).toBeUndefined();
    // Solve must actually finish the game and mark it solved-with-help, not
    // merely fill some squares in (docs/games/solver-and-generator.md § "Solve
    // and the generator's aux").
    expect(stateOf(midend).completed).toBe(true);
    expect(stateOf(midend).cheated).toBe(true);
  });

  it("round-trips a played game through a save", () => {
    const p = presetParams(0);
    const { desc } = newBoatsDesc(p, randomNew("boats-save-1"));
    const midend = new Midend(boatsGame);
    midend.newGameFromId(`${encodeParams(p, true)}:${desc}`);
    midend.playMoves([
      { kind: "fill", x0: 0, y0: 0, x1: 0, y1: 5, from: "-", to: "W" },
    ]);

    const saved = midend.saveGame();
    const restored = new Midend(boatsGame);
    expect(restored.loadGame(saved)).toBeUndefined();
    expect(restored.formatAsText()).toBe(midend.formatAsText());
  });

  it("refuses to solve a puzzle its deduction cannot finish", () => {
    // Every number zero and no clues: consistent only with an empty sea, which
    // the fleet contradicts.
    const p = params();
    const state = newState(p, "0,0,0,0,0,0,0,0,0,0,0,0,");
    expect(boatsGame.solve?.(state, state)?.ok).toBe(false);
  });
});

// --- mistakes --------------------------------------------------------------

describe("boats findMistakes", () => {
  it("flags a square the unique solution contradicts, and only that square", () => {
    const p = params({ w: 8, h: 8, fleet: 4, fleetData: defaultFleet(4) });
    const state = generated(p, "boats-mistake-1");
    const solved = solveToGrid(state);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;

    // Find a square the solution has as water and put a boat on it.
    let target = -1;
    for (let i = 0; i < p.w * p.h; i++)
      if (solved.grid[i] === WATER && state.gridClues[i] === EMPTY) {
        target = i;
        break;
      }
    expect(target).toBeGreaterThanOrEqual(0);

    const x = target % p.w;
    const y = Math.floor(target / p.w);
    const wrong = boatsGame.executeMove(state, {
      kind: "fill",
      x0: x,
      y0: y,
      x1: x,
      y1: y,
      from: "-",
      to: "B",
    });

    const mistakes = findMistakes(wrong);
    expect(mistakes).toContainEqual({ x, y });
  });

  it("reports nothing on an untouched board", () => {
    const p = params({ w: 8, h: 8, fleet: 4, fleetData: defaultFleet(4) });
    expect(findMistakes(generated(p, "boats-mistake-2"))).toEqual([]);
  });

  it("reports nothing when the board is not uniquely deducible", () => {
    const p = params();
    const state = newState(p, "0,0,0,0,0,0,0,0,0,0,0,0,");
    expect(findMistakes(state)).toEqual([]);
  });
});

// --- rendering (tier 2.5) --------------------------------------------------

describe("boats rendering", () => {
  const preset0 = () => {
    const p = presetParams(0);
    const { desc } = newBoatsDesc(p, randomNew("boats-render-1"));
    return { p, id: `${encodeParams(p, true)}:${desc}` };
  };

  it("draws an opening frame with water, numbers and the fleet list", () => {
    const { id } = preset0();
    const result = renderScenario({ game: boatsGame, id });

    // A given water/ship clue paints the water background.
    expect(
      result.recording.ops.some((o) => o.op === "rect" && o.color === COL_WATER),
    ).toBe(true);
    // The row/column numbers are drawn as text.
    expect(result.recording.ops.some((o) => o.op === "text")).toBe(true);
    // The fleet display draws boat segments as circles.
    expect(result.recording.ops.some((o) => o.op === "circle")).toBe(true);

    expect(result.recording.ops).toMatchSnapshot();
  });

  it("previews a drag without committing a move", () => {
    const { id } = preset0();
    const midend = new Midend(boatsGame);
    midend.newGameFromId(id);
    const before = midend.saveGame();

    const ts = PREFERRED_TILE_SIZE;
    midend.processInput(ts / 2, ts / 2, RIGHT_BUTTON);
    midend.processInput(ts / 2, 3 * ts + ts / 2, LEFT_DRAG);

    // The drag is UI-only until release: no history entry, same save.
    expect(midend.saveGame()).toEqual(before);
  });

  it("draws the collision diamond between two boats that touch diagonally", () => {
    // A clue-less board, so every square is the player's to fill.
    const p = params();
    const id = `${encodeParams(p, true)}:1,1,1,1,1,1,1,1,1,1,1,1,`;
    const result = renderScenario({
      game: boatsGame,
      id,
      moves: [
        { kind: "fill", x0: 1, y0: 1, x1: 1, y1: 1, from: "-", to: "B" },
        { kind: "fill", x0: 2, y0: 2, x1: 2, y1: 2, from: "-", to: "B" },
      ],
    });

    // The diamond is a polygon filled COL_COLLISION_ERROR outlined COL_GRID,
    // with the exclamation mark in COL_COLLISION_TEXT on top.
    expect(
      result.recording.ops.some(
        (o) => o.op === "polygon" && o.fill === COL_COLLISION_ERROR,
      ),
    ).toBe(true);
    expect(
      result.recording.ops.some(
        (o) => o.op === "rect" && o.color === COL_COLLISION_TEXT,
      ),
    ).toBe(true);
  });

  it("hides the boats on the flashing half of the completion flash", () => {
    // Complete a board by hand (not via Solve, which sets `cheated` and so
    // suppresses the flash), then step the clock into the flash.
    const p = presetParams(0);
    const { desc } = newBoatsDesc(p, randomNew("boats-flash-1"));
    const state = newState(p, desc);
    const solved = solveToGrid(state);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;

    // Skip the given squares: a fill move on one is a no-op, and if such a
    // no-op were the *last* move the board would never make a
    // not-completed → completed transition and the flash would never arm.
    const moves: BoatsMove[] = [];
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x;
        if (state.gridClues[i] !== EMPTY) continue;
        moves.push({
          kind: "fill",
          x0: x,
          y0: y,
          x1: x,
          y1: y,
          from: "*",
          to: isShip(solved.grid[i]) ? "B" : "W",
        });
      }

    const midend = new Midend(boatsGame);
    midend.newGameFromId(`${encodeParams(p, true)}:${desc}`);
    // Play one move at a time and stop the moment the board completes. Boats
    // is won when every *boat* is placed — the remaining water need not be
    // filled in — so playing the whole list would finish the puzzle partway
    // through and leave the last transition a non-completing one, with no
    // flash armed.
    for (const move of moves) {
      midend.playMoves([move]);
      if (stateOf(midend).completed) break;
    }
    expect(stateOf(midend).completed).toBe(true);
    expect(stateOf(midend).cheated).toBe(false);

    // Walk the flash in half-frame steps and count the boats drawn on each.
    // The guarantee that matters is that it *alternates* — upstream draws no
    // boat on the "off" half — not which half comes first, so assert both
    // phases occur rather than pinning one to a timestamp (docs/games/testing.md
    // § "Seed-deterministic, never clock-gated").
    const palette = boatsGame.colors([1, 1, 1]);
    const counts: number[] = [];
    for (let i = 0; i < 12; i++) {
      midend.timer(FLASH_TIME / 10);
      const rec = new RecordingDrawing(palette);
      midend.forceRedraw(rec);
      counts.push(
        rec.ops.filter((o) => o.op === "circle" && o.fill === COL_SHIP_GUESS).length,
      );
    }

    expect(counts.some((n) => n === 0)).toBe(true);
    expect(counts.some((n) => n > 0)).toBe(true);
  });
  it("highlights a mistake on a board that was already drawn", () => {
    // The paint-twice test (docs/games/rendering.md § "Prove the overlay
    // repaints"): a cold frame proves nothing, because every cell misses the
    // cache on frame 1 anyway.
    const p = params({ w: 8, h: 8, fleet: 4, fleetData: defaultFleet(4) });
    const { desc } = newBoatsDesc(p, randomNew("boats-render-mistake"));
    const state = newState(p, desc);
    const solved = solveToGrid(state);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;

    let target = -1;
    for (let i = 0; i < p.w * p.h; i++)
      if (solved.grid[i] === WATER && state.gridClues[i] === EMPTY) {
        target = i;
        break;
      }
    const x = target % p.w;
    const y = Math.floor(target / p.w);

    const result = renderScenario({
      game: boatsGame,
      id: `${encodeParams(p, true)}:${desc}`,
      moves: [{ kind: "fill", x0: x, y0: y, x1: x, y1: y, from: "-", to: "B" }],
      showMistakes: true,
    });

    expect(result.mistakeCount).toBeGreaterThan(0);
    expect(
      result.recording.ops.some((o) => o.op === "line" && o.color === COL_SHIP_ERROR),
    ).toBe(true);
  });
});

// --- text format -----------------------------------------------------------

describe("boats textFormat", () => {
  it("renders a board up to 10x10 and declines a larger one", () => {
    const p = presetParams(0);
    const state = generated(p, "boats-text-1");
    const text = textFormat(state);
    expect(text).toBeDefined();
    expect(text?.split("\n")).toHaveLength(p.h + 1);

    const big = params({ w: 10, h: 12, fleet: 5, fleetData: defaultFleet(5) });
    expect(textFormat(generated(big, "boats-text-2"))).toBeUndefined();
  });
});

// --- fleet display layout --------------------------------------------------

describe("boats fleet display layout", () => {
  /** No boat may be drawn past the right edge of the canvas — the guarantee
   * behind upstream's `TODO ui: Certain custom fleets don't fit in the UI`. */
  const fitsOnItsRow = (p: BoatsParams): boolean =>
    [...fleetLayout(p)].every((s) => s.fx + s.width <= fleetRowLimit(p));

  it("keeps every shipped preset's fleet inside the canvas", () => {
    for (let i = 0; i < PRESETS.length; i++) {
      const p = presetParams(i);
      expect(fitsOnItsRow(p), encodeParams(p, true)).toBe(true);
    }
  });

  it("wraps a batch wider than a whole row rather than overflowing it", () => {
    // Nine size-1 boats are 9.0 tile units wide; a 5-wide board's rows hold 7.
    const p = params({ w: 5, h: 5, fleet: 3, fleetData: [9, 0, 0] });
    expect(fitsOnItsRow(p)).toBe(true);
    expect(fleetRows(p)).toBe(2);
    // …and the taller display is reflected in the canvas the midend asks for.
    const one = computeSize(params({ w: 5, h: 5, fleet: 3, fleetData: [3, 0, 0] }), 32);
    expect(computeSize(p, 32).h).toBeGreaterThan(one.h);
  });

  it("lays out exactly as upstream wherever upstream fitted", () => {
    // Upstream's algorithm verbatim: break only between whole batches, and let
    // an over-wide batch run off the edge. Wherever it stayed inside the row
    // limit its layout is the contract, so the repair must reproduce it.
    const upstream = (p: BoatsParams): { fx: number; row: number; width: number }[] => {
      const out: { fx: number; row: number; width: number }[] = [];
      let fx = 0.5;
      let row = 0;
      for (let size = 0; size < p.fleet; size++) {
        const width = (size + 1) * 0.75 + 0.25;
        if (fx + p.fleetData[size] * width > p.w + 2 && fx !== 0.5) {
          fx = 0.5;
          row++;
        }
        for (let copy = 0; copy < p.fleetData[size]; copy++) {
          out.push({ fx, row, width });
          fx += width;
        }
      }
      return out;
    };

    const cases = [
      ...PRESETS.map((_, i) => presetParams(i)),
      params({ w: 8, h: 8, fleet: 3, fleetData: [4, 2, 1] }),
      params({ w: 6, h: 6, fleet: 4, fleetData: [3, 2, 1, 1] }),
      params({ w: 12, h: 12, fleet: 5, fleetData: [5, 4, 3, 2, 1] }),
    ];
    let compared = 0;
    for (const p of cases) {
      const want = upstream(p);
      if (!want.every((s) => s.fx + s.width <= p.w + 2)) continue;
      compared++;
      const got = [...fleetLayout(p)].map(({ fx, row, width }) => ({ fx, row, width }));
      expect(got, encodeParams(p, true)).toEqual(want);
    }
    // The skip guard must not be silently eating the whole table.
    expect(compared).toBeGreaterThan(5);
  });
});
