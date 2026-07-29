/**
 * Tier-2.5 render scenarios for Salad, plus the two tier-2 frames the scenario
 * driver cannot reach (they depend on `Ui` state, which `renderScenario`
 * replays no pointer events to set).
 *
 * Each scenario pairs targeted op assertions — the real guarantee — with a
 * `toMatchSnapshot` so unintended drift shows up as a reviewable text diff.
 * Re-baseline an intended change with `vitest -u` and commit the regenerated
 * `__snapshots__/*.snap`.
 */
import { describe, expect, it } from "vitest";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { saladGame } from "./index.ts";
import {
  COL_BORDERCLUE,
  COL_G_HOLE,
  COL_HIGHLIGHT,
  COL_I_BALLBG,
  COL_I_HOLE,
  COL_LOWLIGHT,
  COL_MISTAKE,
  COL_PENCIL,
  COL_PENCIL_BODY,
  FLASH_TIME,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import { saladSolution } from "./solver.ts";
import {
  DIFF_EASY,
  GAMEMODE_LETTERS,
  GAMEMODE_NUMBERS,
  newState,
  newUi,
  type SaladMove,
  type SaladParams,
} from "./state.ts";

const LETTERS_P: SaladParams = {
  order: 4,
  nums: 3,
  mode: GAMEMODE_LETTERS,
  diff: DIFF_EASY,
};
const LETTERS_DESC = "CaCbAfBaAa,p";
const LETTERS_ID = `4n3Lde:${LETTERS_DESC}`;

const NUMBERS_P: SaladParams = {
  order: 5,
  nums: 3,
  mode: GAMEMODE_NUMBERS,
  diff: DIFF_EASY,
};
const NUMBERS_DESC = "d1cO32b3aXa1d2b";
const NUMBERS_ID = `5n3Bde:${NUMBERS_DESC}`;

describe("salad render scenarios", () => {
  it("draws the ABC End View border clues in the margin", () => {
    const { recording } = renderScenario({ game: saladGame, id: LETTERS_ID });
    const clues = recording.ops.filter(
      (o) => o.op === "text" && o.colour === COL_BORDERCLUE,
    );
    // The reference board carries five border clues (C, C, A, B, A).
    expect(clues).toHaveLength(5);
    expect(clues.map((o) => (o.op === "text" ? o.text : "")).sort()).toEqual([
      "A",
      "A",
      "B",
      "C",
      "C",
    ]);
    expect(recording.ops).toMatchSnapshot();
  });

  it("draws Number Ball's balls and crosses", () => {
    const { recording } = renderScenario({ game: saladGame, id: NUMBERS_ID });
    // A ball is two concentric circles; a *given* one takes the immutable
    // ball background.
    expect(
      recording.ops.some((o) => o.op === "circle" && o.fill === COL_I_BALLBG),
    ).toBe(true);
    // A given cross is two thick strokes in the immutable hole colour, and
    // none is drawn in the player's guess colour on an untouched board.
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_I_HOLE)).toBe(
      true,
    );
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_G_HOLE)).toBe(
      false,
    );
    expect(recording.ops).toMatchSnapshot();
  });

  it("draws pencil marks after Mark all", () => {
    const moves: SaladMove[] = [{ type: "markAll" }];
    const { recording } = renderScenario({
      game: saladGame,
      id: NUMBERS_ID,
      moves,
    });
    const notes = recording.ops.filter(
      (o) => o.op === "text" && o.colour === COL_PENCIL,
    );
    expect(notes.length).toBeGreaterThan(0);
    // The "might be empty" mark renders as an X alongside the digits.
    expect(notes.some((o) => o.op === "text" && o.text === "X")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("outlines a Check & Save mistake in red", () => {
    const s = newState(NUMBERS_P, NUMBERS_DESC);
    const sol = saladSolution(s);
    if (!sol) throw new Error("expected a solution");
    const o = s.order;
    const i = sol.findIndex((v, k) => v > 0 && !s.gridclues[k]);
    const { recording, mistakeCount } = renderScenario({
      game: saladGame,
      id: NUMBERS_ID,
      moves: [
        { type: "set", x: i % o, y: (i / o) | 0, value: (sol[i] % NUMBERS_P.nums) + 1 },
      ],
      showMistakes: true,
    });
    expect(mistakeCount).toBeGreaterThan(0);
    expect(
      recording.ops.some((op) => op.op === "line" && op.colour === COL_MISTAKE),
    ).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });
});

// --- tier 2: frames that depend on Ui state --------------------------------

/** Paint one frame straight against the game's `redraw`, so the `Ui` (cursor,
 * pencil mode) and the flash clock can be set explicitly. */
function paint(
  state: ReturnType<typeof newState>,
  ui: ReturnType<typeof newUi>,
  flashTime = 0,
): RecordingDrawing {
  const ds = newDrawState(state);
  setTileSize(ds, saladGame.preferredTileSize ?? 32);
  const rec = new RecordingDrawing(saladGame.colours(DEFAULT_BACKGROUND));
  redraw(rec, ds, null, state, 0, ui, 0, flashTime);
  return rec;
}

describe("salad Ui-driven frames", () => {
  it("fills the selected square, and shows a corner triangle in pencil mode", () => {
    const s = newState(LETTERS_P, LETTERS_DESC);
    const ui = { ...newUi(s), hshow: true, hx: 1, hy: 2 };

    const ink = paint(s, ui);
    expect(
      ink.ops.some(
        (o) => o.op === "rect" && o.colour === COL_LOWLIGHT && o.w === 40 && o.h === 40,
      ),
    ).toBe(true);
    // No pencil-mode glyph while entering ink.
    expect(ink.ops.some((o) => o.op === "polygon" && o.fill === COL_PENCIL_BODY)).toBe(
      false,
    );

    const pencil = paint(s, { ...ui, hpencil: true });
    // The pencil highlight is a half-tile corner triangle, not a full fill.
    expect(
      pencil.ops.some(
        (o) => o.op === "polygon" && o.fill === COL_LOWLIGHT && o.points.length === 3,
      ),
    ).toBe(true);
    // ...and the CapsLock-style indicator appears in the clue margin.
    expect(
      pencil.ops.some((o) => o.op === "polygon" && o.fill === COL_PENCIL_BODY),
    ).toBe(true);
  });

  it("plays the completion flash as a moving three-phase wave", () => {
    const s = newState(LETTERS_P, LETTERS_DESC);
    const ui = newUi(s);
    // Two phases of the same flash must paint *differently* — a snapshot alone
    // cannot tell you an animation is moving (playbook §3.2).
    const phaseA = paint(s, ui, FLASH_TIME);
    const phaseB = paint(s, ui, FLASH_TIME - 0.1);
    const wave = (r: RecordingDrawing) =>
      r.ops
        .filter((o) => o.op === "rect" && o.colour === COL_HIGHLIGHT)
        .map((o) => (o.op === "rect" ? `${o.x},${o.y}` : ""))
        .join(" ");
    expect(wave(phaseA)).not.toBe("");
    expect(wave(phaseA)).not.toBe(wave(phaseB));
  });
});
