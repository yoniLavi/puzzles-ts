/**
 * Behavioural tests for the Spokes port.
 *
 * Tier 1 (params / codec / solver / generator / input / completion) plus the
 * tier-2 and tier-2.5 render checks. The generator's agreement with upstream is
 * covered separately and far more strongly by `spokes-differential.test.ts`;
 * what lives here is everything that differential cannot see — the interactive
 * `executeMove` → completion path, the drag and keyboard input, `findMistakes`,
 * and the frames the renderer actually paints.
 */

import { describe, expect, it } from "vitest";
import type { ChangeNotification, GameStatus, Point } from "../../../puzzle/types.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newSpokesDesc } from "./generator.ts";
import { spokesGame } from "./index.ts";
import {
  COL_ERROR,
  COL_HOLDING,
  COL_LINE,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { spokesSolve, spokesValidate } from "./solver.ts";
import {
  clearBoard,
  cloneBoard,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_TRICKY,
  DIFFCOUNT,
  DIR_BOTLEFT,
  DIR_BOTRIGHT,
  DIR_RIGHT,
  decodeParams,
  encodeParams,
  getSpoke,
  newState,
  newUi,
  SPOKE_LINE,
  SPOKE_MARKED,
  type SpokesMove,
  type SpokesParams,
  type SpokesState,
  type SpokesUi,
  spokesPlace,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// A frozen 4×4 Easy board (the first fixture of the C differential), so every
// test below runs on a real, uniquely-soluble puzzle without generating one.
const FIX: SpokesParams = { w: 4, h: 4, diff: "easy" };
const FIX_DESC = "1111432442253111";
const FIX_ID = `4x4de:${FIX_DESC}`;

const TS = PREFERRED_TILE_SIZE;
/** Pixel centre of hub (x, y). */
const hub = (x: number, y: number): Point => ({
  x: x * TS + TS / 2,
  y: y * TS + TS / 2,
});

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(spokesGame);
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

function press(
  state: SpokesState,
  ui: SpokesUi,
  button: number,
  p: Point,
): SpokesMove | null | typeof UI_UPDATE {
  return spokesGame.interpretMove(state, ui, null, p, button);
}

/** The unique solution as a board, via the game's own solver. */
function solutionOf(state: SpokesState) {
  const b = cloneBoard(state);
  clearBoard(b);
  expect(spokesSolve(b, null, DIFFCOUNT)).toBe("valid");
  return b;
}

/** Every spoke of the solution in a given state, as `{index, dir}` pairs. */
function solutionSpokes(state: SpokesState, want: number) {
  const b = solutionOf(state);
  const out: { index: number; dir: number }[] = [];
  for (let i = 0; i < b.w * b.h; i++) {
    for (let d = 0; d < 4; d++) {
      if (getSpoke(b.spokes[i], d) === want) out.push({ index: i, dir: d });
    }
  }
  return out;
}

// --- params -----------------------------------------------------------------

describe("spokes params", () => {
  it("round-trips a full game id", () => {
    for (const s of ["4x4de", "6x6dt", "10x7dh"]) {
      expect(encodeParams(decodeParams(s), true)).toBe(s);
    }
  });

  it("falls back to a square board when no height is given", () => {
    expect(decodeParams("5")).toEqual({ w: 5, h: 5, diff: "easy" });
    expect(decodeParams("5dh")).toEqual({ w: 5, h: 5, diff: "hard" });
  });

  it("omits the difficulty from a non-full encoding", () => {
    expect(encodeParams({ w: 6, h: 4, diff: "hard" }, false)).toBe("6x4");
  });

  it("rejects boards below 2x2 and an unknown difficulty letter", () => {
    expect(validateParams({ w: 1, h: 4, diff: "easy" }, true)).toMatch(/Width/);
    expect(validateParams({ w: 4, h: 1, diff: "easy" }, true)).toMatch(/Height/);
    // Upstream never checks this and would index its difficulty table out of
    // bounds; the port rejects it instead.
    expect(validateParams(decodeParams("4x4dz"), true)).toMatch(/difficulty/);
    expect(validateParams({ w: 2, h: 2, diff: "hard" }, true)).toBeNull();
  });

  it("offers the six upstream presets, defaulting to 6x6 Easy", () => {
    const menu = spokesGame.presets();
    expect(menu.submenu?.map((e) => e.title)).toEqual([
      "4x4 Easy",
      "4x4 Tricky",
      "4x4 Hard",
      "6x6 Easy",
      "6x6 Tricky",
      "6x6 Hard",
    ]);
    expect(spokesGame.defaultParams()).toEqual({ w: 6, h: 6, diff: "easy" });
  });

  it("describes params with the keys the config summary template reads", () => {
    expect(spokesGame.describeParams?.({ w: 6, h: 4, diff: "tricky" })).toEqual({
      width: "6",
      height: "4",
      difficulty: 1,
    });
  });
});

// --- description codec ------------------------------------------------------

describe("spokes description codec", () => {
  it("accepts a well-formed description and rebuilds the clues", () => {
    expect(validateDesc(FIX, FIX_DESC)).toBeNull();
    const s = newState(FIX, FIX_DESC);
    expect([...s.numbers].join("")).toBe(FIX_DESC);
  });

  it("distinguishes too short from too long", () => {
    expect(validateDesc(FIX, FIX_DESC.slice(0, 10))).toBe("Description too short");
    expect(validateDesc(FIX, `${FIX_DESC}1`)).toBe("Description too long");
  });

  it("rejects a character that is neither a clue digit nor a hole", () => {
    expect(validateDesc(FIX, `9${FIX_DESC.slice(1)}`)).toBe(
      "Invalid character in description",
    );
    expect(validateDesc(FIX, `z${FIX_DESC.slice(1)}`)).toBe(
      "Invalid character in description",
    );
  });

  it("carves a wider hole for 'X' than for '0'", () => {
    // A '0' hole only removes the spokes that point *at* it; an 'X' also blocks
    // the diagonals that graze past it, so its neighbour loses more spokes.
    const zero = newState({ w: 3, h: 3, diff: "easy" }, "010111111");
    const ex = newState({ w: 3, h: 3, diff: "easy" }, "0X0111111");
    const count = (s: SpokesState, i: number) => {
      let n = 0;
      for (let d = 0; d < 8; d++) if (getSpoke(s.spokes[i], d) !== 0) n++;
      return n;
    };
    expect(count(ex, 3)).toBeLessThan(count(zero, 3));
    // Both normalise the hole's own clue to 0.
    expect(ex.numbers[1]).toBe(0);
  });

  it("renders the board as text", () => {
    const s = newState(FIX, FIX_DESC);
    const solved = { ...s, spokes: solutionOf(s).spokes };
    const text = textFormat(solved);
    expect(text.split("\n")[0]).toBe("1 1 1 1");
    // Every drawn line shows as one of the four connector glyphs.
    expect(text).toMatch(/[-|\\/]/);
  });
});

// --- solver and generator ---------------------------------------------------

describe("spokes solver", () => {
  it("deduces the unique solution and reports it valid", () => {
    const b = solutionOf(newState(FIX, FIX_DESC));
    expect(spokesValidate(b)).toBe("valid");
  });

  it("reports an over-filled hub invalid", () => {
    const s = newState(FIX, FIX_DESC);
    const b = cloneBoard(s);
    clearBoard(b);
    // Hub 0 has clue 1; giving it two lines contradicts the clue.
    spokesPlace(b, 0, DIR_RIGHT, SPOKE_LINE);
    spokesPlace(b, 0, 2 /* DIR_BOT */, SPOKE_LINE);
    expect(spokesValidate(b)).toBe("invalid");
  });

  it("reports an untouched board incomplete", () => {
    const s = newState(FIX, FIX_DESC);
    const b = cloneBoard(s);
    clearBoard(b);
    expect(spokesValidate(b)).toBe("incomplete");
  });

  it("solves every generated board at its own difficulty", () => {
    for (const [diff, level] of [
      ["tricky", DIFF_TRICKY],
      ["hard", DIFF_HARD],
    ] as const) {
      const p: SpokesParams = { w: 4, h: 4, diff };
      const { desc } = newSpokesDesc(p, randomNew(`grade-${diff}`));
      const b = cloneBoard(newState(p, desc));
      clearBoard(b);
      expect(spokesSolve(b, null, level)).toBe("valid");
    }
  });

  it("keeps upstream's leftover-position difficulty gate", () => {
    // A recorded finding, not an aspiration. Upstream's acceptance gate reads
    // "…and it does *not* solve one tier easier", but it runs that re-solve on
    // the scratch board's *leftover* position from the last candidate rather
    // than on a cleared board — so it often rejects for reasons unrelated to
    // the puzzle's difficulty, and lets through boards an easier tier can
    // crack. Measured on a fixed sample: 10 of 12 4×4 "Hard" boards also solve
    // at Tricky.
    //
    // Reproducing it is required — the generator is solver-gated, so clearing
    // the board first changes every Tricky and Hard description and forfeits
    // the byte-match differential. This test pins the observable consequence
    // so a well-meaning tidy-up of the generator cannot land silently.
    let easier = 0;
    for (let k = 0; k < 4; k++) {
      const p: SpokesParams = { w: 4, h: 4, diff: "hard" };
      const { desc } = newSpokesDesc(p, randomNew(`gate-hard-${k}`));
      const b = cloneBoard(newState(p, desc));
      clearBoard(b);
      if (spokesSolve(b, null, DIFF_TRICKY) === "valid") easier++;
    }
    expect(easier).toBeGreaterThan(0);
  });

  it("solves an Easy board without the look-ahead", () => {
    const b = cloneBoard(newState(FIX, FIX_DESC));
    clearBoard(b);
    expect(spokesSolve(b, null, DIFF_EASY)).toBe("valid");
  });
});

describe("spokes generator", () => {
  it("is reproducible from a seed", () => {
    // Small and Easy on purpose: the differential already exercises every
    // preset and difficulty against the C, and generation at the harder tiers
    // is genuinely expensive (it re-solves the board once per candidate line).
    const p: SpokesParams = { w: 4, h: 4, diff: "easy" };
    const a = newSpokesDesc(p, randomNew("repeat-me")).desc;
    const b = newSpokesDesc(p, randomNew("repeat-me")).desc;
    expect(a).toBe(b);
  });

  it("produces a soluble board for every preset shape", () => {
    for (const p of [
      { w: 2, h: 2, diff: "easy" },
      { w: 4, h: 4, diff: "easy" },
      { w: 3, h: 3, diff: "tricky" },
    ] as SpokesParams[]) {
      const { desc } = newSpokesDesc(p, randomNew(`shape-${p.w}x${p.h}-${p.diff}`));
      expect(validateDesc(p, desc)).toBeNull();
      const b = cloneBoard(newState(p, desc));
      clearBoard(b);
      expect(spokesSolve(b, null, DIFFCOUNT)).toBe("valid");
      // Every hub keeps at least one line, so no hub is stranded by the clues.
      for (let i = 0; i < p.w * p.h; i++)
        expect(desc.charCodeAt(i) - 48).toBeGreaterThan(0);
    }
  });
});

// --- input ------------------------------------------------------------------

describe("spokes input", () => {
  it("left-drag between adjacent hubs toggles the line", () => {
    const state = newState(FIX, FIX_DESC);
    const ui = newUi();

    expect(press(state, ui, LEFT_BUTTON, hub(0, 0))).toBe(UI_UPDATE);
    expect(press(state, ui, LEFT_DRAG, { x: hub(1, 0).x - 8, y: hub(0, 0).y })).toBe(
      UI_UPDATE,
    );
    expect(ui.dragStart).toBe(0);
    expect(ui.dragEnd).toBe(1);

    const move = press(state, ui, LEFT_RELEASE, hub(1, 0));
    expect(move).toEqual({ kind: "set", index: 0, dir: DIR_RIGHT, state: SPOKE_LINE });
    // The drag is over, so the ui is reset.
    expect(ui.dragStart).toBe(-1);

    // Repeating the gesture on the drawn line removes it again.
    const drawn = spokesGame.executeMove(state, move as SpokesMove);
    press(drawn, ui, LEFT_BUTTON, hub(0, 0));
    press(drawn, ui, LEFT_DRAG, { x: hub(1, 0).x - 8, y: hub(0, 0).y });
    expect(press(drawn, ui, LEFT_RELEASE, hub(1, 0))).toMatchObject({ state: 1 });
  });

  it("right-drag toggles a ruled-out mark", () => {
    const state = newState(FIX, FIX_DESC);
    const ui = newUi();
    press(state, ui, RIGHT_BUTTON, hub(0, 0));
    press(state, ui, RIGHT_DRAG, { x: hub(0, 0).x, y: hub(1, 0).y + TS - 8 });
    const move = press(state, ui, RIGHT_RELEASE, hub(0, 1));
    expect(move).toEqual({ kind: "set", index: 0, dir: 2, state: SPOKE_MARKED });
  });

  it("keeps the drag inert while the pointer is still inside the hub", () => {
    const state = newState(FIX, FIX_DESC);
    const ui = newUi();
    press(state, ui, LEFT_BUTTON, hub(0, 0));
    // Two pixels off the centre is well inside the dead zone.
    press(state, ui, LEFT_DRAG, { x: hub(0, 0).x + 2, y: hub(0, 0).y });
    expect(ui.dragEnd).toBe(-1);
    expect(press(state, ui, LEFT_RELEASE, hub(0, 0))).toBe(UI_UPDATE);
  });

  it("ignores a press outside the board", () => {
    const state = newState(FIX, FIX_DESC);
    const ui = newUi();
    expect(press(state, ui, LEFT_BUTTON, { x: -5, y: 10 })).toBeNull();
    expect(press(state, ui, LEFT_BUTTON, { x: 10, y: 4 * TS + 5 })).toBeNull();
  });

  it("refuses a diagonal line that would cross an existing one", () => {
    const state = newState(FIX, FIX_DESC);
    const crossed = spokesGame.executeMove(state, {
      kind: "set",
      index: 0,
      dir: DIR_BOTRIGHT,
      state: SPOKE_LINE,
    });
    const ui = newUi();

    // Drag from hub (1,0) down-left towards hub (0,1) — the crossing diagonal.
    press(crossed, ui, LEFT_BUTTON, hub(1, 0));
    press(crossed, ui, LEFT_DRAG, { x: hub(0, 1).x + 12, y: hub(0, 1).y - 12 });
    expect(ui.dragEnd).toBe(4);
    expect(press(crossed, ui, LEFT_RELEASE, hub(0, 1))).toBe(UI_UPDATE);

    // A *mark* on the same spoke is still allowed — only lines may not cross.
    press(crossed, ui, RIGHT_BUTTON, hub(1, 0));
    press(crossed, ui, RIGHT_DRAG, { x: hub(0, 1).x + 12, y: hub(0, 1).y - 12 });
    expect(press(crossed, ui, RIGHT_RELEASE, hub(0, 1))).toMatchObject({
      kind: "set",
      dir: DIR_BOTLEFT,
      state: SPOKE_MARKED,
    });
  });

  it("draws and marks from the half-grid keyboard cursor", () => {
    const state = newState(FIX, FIX_DESC);
    const ui = newUi();

    // The first arrow press reveals the cursor and steps it onto hub (0,0)'s
    // right-hand spoke slot.
    expect(press(state, ui, CURSOR_RIGHT, hub(0, 0))).toBe(UI_UPDATE);
    expect(ui.cshow).toBe(true);
    expect(ui.cx).toBe(1);

    expect(press(state, ui, CURSOR_SELECT, hub(0, 0))).toEqual({
      kind: "set",
      index: 0,
      dir: DIR_RIGHT,
      state: SPOKE_LINE,
    });
    expect(press(state, ui, CURSOR_SELECT2, hub(0, 0))).toEqual({
      kind: "set",
      index: 0,
      dir: DIR_RIGHT,
      state: SPOKE_MARKED,
    });
  });

  it("does nothing when the cursor sits on a hub rather than a spoke", () => {
    const state = newState(FIX, FIX_DESC);
    const ui = newUi();
    ui.cshow = true;
    expect(press(state, ui, CURSOR_SELECT, hub(0, 0))).toBe(UI_UPDATE);
  });
});

// --- moves, completion and solve --------------------------------------------

describe("spokes completion and solve (through a real Midend)", () => {
  it("Solve completes the board as solved-with-help and arms no flash", () => {
    const { m, status } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    expect(m.solve()).toBeUndefined();
    expect(status()).toBe("solved-with-help");
    expect(m.currentAnimationMs()).toBe(0);
  });

  it("drawing the solution by hand completes the board and flashes", () => {
    const state = newState(FIX, FIX_DESC);
    const moves: SpokesMove[] = solutionSpokes(state, SPOKE_LINE).map(
      ({ index, dir }) => ({ kind: "set", index, dir, state: SPOKE_LINE }),
    );

    let cur = state;
    for (const move of moves) cur = spokesGame.executeMove(cur, move);
    expect(cur.completed).toBe(true);
    expect(cur.cheated).toBe(false);
    expect(spokesGame.status(cur)).toBe("solved");
    expect(spokesGame.flashLength?.(state, cur, 1, newUi())).toBeGreaterThan(0);
  });

  it("round-trips a save with progress on it", () => {
    const { m } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    m.playMoves([{ kind: "set", index: 0, dir: DIR_RIGHT, state: SPOKE_LINE }]);
    const before = m.formatAsText();

    const m2 = new Midend(spokesGame);
    expect(m2.loadGame(m.saveGame())).toBeUndefined();
    expect(m2.formatAsText()).toBe(before);
  });

  it("leaves a hidden spoke alone", () => {
    const state = newState(FIX, FIX_DESC);
    // Hub 0 is the top-left corner, so its LEFT spoke cannot exist.
    const after = spokesGame.executeMove(state, {
      kind: "set",
      index: 0,
      dir: 4 /* DIR_LEFT */,
      state: SPOKE_LINE,
    });
    expect(after.spokes[0]).toBe(state.spokes[0]);
  });
});

// --- findMistakes -----------------------------------------------------------

describe("spokes findMistakes", () => {
  it("finds nothing on an untouched or partially-correct board", () => {
    const state = newState(FIX, FIX_DESC);
    expect(spokesGame.findMistakes?.(state)).toEqual([]);

    // Drawing a handful of *correct* lines is progress, not a mistake — a line
    // the solution needs but the player has not drawn is merely incomplete.
    let cur = state;
    for (const { index, dir } of solutionSpokes(state, SPOKE_LINE).slice(0, 3)) {
      cur = spokesGame.executeMove(cur, { kind: "set", index, dir, state: SPOKE_LINE });
    }
    expect(spokesGame.findMistakes?.(cur)).toEqual([]);
  });

  it("flags a line the solution forbids", () => {
    const state = newState(FIX, FIX_DESC);
    const { index, dir } = solutionSpokes(state, SPOKE_MARKED)[0];
    const wrong = spokesGame.executeMove(state, {
      kind: "set",
      index,
      dir,
      state: SPOKE_LINE,
    });
    expect(spokesGame.findMistakes?.(wrong)).toEqual([{ kind: "line", index, dir }]);
  });

  it("flags a mark where the solution needs a line", () => {
    const state = newState(FIX, FIX_DESC);
    const { index, dir } = solutionSpokes(state, SPOKE_LINE)[0];
    const wrong = spokesGame.executeMove(state, {
      kind: "set",
      index,
      dir,
      state: SPOKE_MARKED,
    });
    expect(spokesGame.findMistakes?.(wrong)).toEqual([{ kind: "mark", index, dir }]);
  });
});

// --- rendering --------------------------------------------------------------

describe("spokes rendering", () => {
  it("paints the opening frame", () => {
    const { recording } = renderScenario({ game: spokesGame, id: FIX_ID });
    const ops = recording.ops;
    // Sixteen hubs, each with its clue digit.
    expect(ops.filter((o) => o.op === "text").length).toBe(16);
    // Every hub is a circle; none of them carries a line yet.
    expect(ops.some((o) => o.op === "circle")).toBe(true);
    expect(ops.some((o) => o.op === "line" && o.colour === COL_LINE)).toBe(false);
    expect(ops).toMatchSnapshot();
  });

  it("draws a line between two connected hubs", () => {
    const { recording } = renderScenario({
      game: spokesGame,
      id: FIX_ID,
      moves: [{ kind: "set", index: 0, dir: DIR_RIGHT, state: SPOKE_LINE }],
    });
    expect(
      recording.ops.some(
        (o) => o.op === "line" && o.colour === COL_LINE && o.thickness > 1,
      ),
    ).toBe(true);
  });

  it("marks a wrongly drawn line in COL_ERROR", () => {
    const state = newState(FIX, FIX_DESC);
    const { index, dir } = solutionSpokes(state, SPOKE_MARKED)[0];
    const { recording, mistakeCount } = renderScenario({
      game: spokesGame,
      id: FIX_ID,
      moves: [{ kind: "set", index, dir, state: SPOKE_LINE }],
      showMistakes: true,
    });
    expect(mistakeCount).toBe(1);
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_ERROR)).toBe(
      true,
    );
  });

  it("shows the mistake overlay on a hub that was already painted", () => {
    // Regression guard (playbook §3.2): the overlay isn't part of a hub's
    // packed tile value, so it has to sit in the cache's diff key. Check &
    // Save runs a frame *after* the move that drew the hub, so a cold-frame
    // test would pass even with the overlay missing from the key.
    const { m } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    const state = newState(FIX, FIX_DESC);
    const { index, dir } = solutionSpokes(state, SPOKE_MARKED)[0];
    m.playMoves([{ kind: "set", index, dir, state: SPOKE_LINE }]);

    const palette = spokesGame.colours(DEFAULT_BACKGROUND);
    m.redraw(new RecordingDrawing(palette)); // first paint: no overlay yet
    expect(m.findMistakes()).toBe(1);

    const after = new RecordingDrawing(palette);
    m.redraw(after);
    expect(after.ops.some((o) => o.op === "line" && o.colour === COL_ERROR)).toBe(true);

    // And a third frame without the overlay repaints it away again.
    m.playMoves([{ kind: "set", index, dir, state: 1 /* EMPTY */ }]);
    const cleared = new RecordingDrawing(palette);
    m.redraw(cleared);
    expect(cleared.ops.some((o) => o.op === "line" && o.colour === COL_ERROR)).toBe(
      false,
    );
  });

  it("highlights the hubs a drag is running between", () => {
    const state = newState(FIX, FIX_DESC);
    const ui = newUi();
    ui.dragStart = 0;
    ui.dragEnd = 1;

    const palette = spokesGame.colours(DEFAULT_BACKGROUND);
    const ds = newDrawState(state);
    setTileSize(ds, TS);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, state, 1, ui, 0, 0);

    expect(
      dr.ops.filter((o) => o.op === "circle" && o.outline === COL_HOLDING).length,
    ).toBeGreaterThan(0);
  });

  it("draws the keyboard cursor brackets", () => {
    const state = newState(FIX, FIX_DESC);
    const ui = newUi();
    ui.cshow = true;
    ui.cx = 1;

    const palette = spokesGame.colours(DEFAULT_BACKGROUND);
    const ds = newDrawState(state);
    setTileSize(ds, TS);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, state, 1, ui, 0, 0);

    // Four corner brackets, two segments each.
    expect(
      dr.ops.filter((o) => o.op === "line" && o.colour === 7 /* CURSOR */).length,
    ).toBe(8);
  });

  it("computes a bordered-free board size", () => {
    expect(spokesGame.computeSize(FIX, 30)).toEqual({ w: 120, h: 120 });
  });
});
