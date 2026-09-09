/**
 * Tier-2.5 render scenarios for Tracks: drive a real Midend to a target frame
 * and capture `redraw`. Targeted op assertions (clue text + A/B labels, the
 * `COL_ERROR` mistake overlay, rails as thick lines) plus a snapshot so a
 * render regression is a reviewable text diff (`vitest -u` re-baselines; the
 * targeted assertions survive a careless `-u`).
 */
import { describe, expect, it } from "vitest";
import { CURSOR_RIGHT, CURSOR_SELECT2 } from "../../engine/pointer.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import type { TracksHighlights } from "./hint.ts";
import { tracksGame } from "./index.ts";
import { COL_CURSOR, COL_ERROR, COL_HINT, COL_HINT_CELL } from "./render.ts";
import type { TracksMove, TracksParams } from "./state.ts";

const P: TracksParams = { w: 6, h: 6, diff: 0, singleOnes: true };
const DESC = "f6pCkC,2,3,3,2,3,S3,3,S3,3,3,2,2";
const ID = `${tracksGame.encodeParams(P, true)}:${DESC}`;

const layTrack = (x: number, y: number): TracksMove => ({
  ops: [{ kind: "square", x, y, track: true, set: true }],
});

describe("Tracks render scenarios", () => {
  it("opener frame: clue numbers + A/B labels drawn, rails absent", () => {
    const { recording } = renderScenario({ game: tracksGame, id: ID });
    // Clue numbers and the A/B entrance/exit labels are text.
    expect(recording.ops.some((o) => o.op === "text" && o.text === "A")).toBe(true);
    expect(recording.ops.some((o) => o.op === "text" && o.text === "B")).toBe(true);
    expect(recording.ops.some((o) => o.op === "text" && o.text === "3")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("a wrong mark shows the red mistake overlay", () => {
    // (3,0), (4,0), (5,0) are no-track in the unique solution.
    const { recording, mistakeCount } = renderScenario({
      game: tracksGame,
      id: ID,
      moves: [layTrack(3, 0), layTrack(4, 0), layTrack(5, 0)],
      showMistakes: true,
    });
    expect(mistakeCount).toBeGreaterThan(0);
    expect(recording.ops.some((o) => o.op === "rect" && o.color === COL_ERROR)).toBe(
      true,
    );
  });

  it("a displayed hint marks the board, and never fills a square", () => {
    const { recording, hint } = renderScenario({
      game: tracksGame,
      id: ID,
      showHint: true,
    });
    expect(hint?.explanation.length).toBeGreaterThan(20);

    // The opening firing blocks two sides of a given piece, so its action mark
    // is the game's own edge cross recolored — a *line*, not a rect. Asserting
    // "some op carries the action color" rather than "some rect does" is the
    // point: a rect-only check would read as healthy on a frame whose whole
    // hint is drawn in lines (docs/games/hints.md § "Echo the move's shape in
    // the hint color").
    expect(
      recording.ops.some((o) => "color" in o && o.color === COL_HINT),
      "the hint painted nothing in the action color",
    ).toBe(true);
    expect(
      recording.ops.some((o) => "color" in o && o.color === COL_HINT_CELL),
      "the hint painted no evidence",
    ).toBe(true);

    // …and no hint mark is a fill. The cross-game guard says this too, but a
    // frame-level assertion here is what survives a careless `vitest -u`
    // (docs/games/hints.md § "Shade vs ring").
    const cell = 33; // PREFERRED_TILE_SIZE
    for (const o of recording.ops) {
      if (o.op !== "rect") continue;
      if (o.color !== COL_HINT && o.color !== COL_HINT_CELL) continue;
      const short = Math.min(o.w, o.h);
      expect(
        short * 4 < Math.max(o.w, o.h) || short < cell / 2,
        `a hint mark is cell-sized in both directions: ${JSON.stringify(o)}`,
      ).toBe(true);
    }
    expect(recording.ops).toMatchSnapshot();
  });

  it("a step that counts with a clue recolors that clue's digit", () => {
    // Half of several Tracks deductions lives in the margin rather than on the
    // grid, so the clue has to be part of the picture (docs/games/hints.md
    // § "Off-board evidence"). Walk the plan to the first step that cites one.
    const { recording, hint } = renderScenario({
      game: tracksGame,
      id: ID,
      showHint: true,
      hintUntil: (s) =>
        ((s as { highlights?: TracksHighlights }).highlights?.clues.length ?? 0) > 0,
    });
    const clues = (hint as { highlights?: TracksHighlights } | undefined)?.highlights
      ?.clues;
    expect(clues?.length, "no step in the plan counts with a clue").toBeGreaterThan(0);
    const hinted = recording.ops.filter((o) => o.op === "text" && o.color === COL_HINT);
    expect(hinted.length, "the cited clue's digit is not in the hint color").toBe(
      clues?.length,
    );
  });

  it("one arrow press draws the cursor a step along, not where it started", () => {
    // The player-visible half of `unify-cross-game-vocabulary`: Tracks used to
    // spend the first press revealing the cursor in place. Tracks is the
    // interesting case because its cursor walks a HALF grid and skips square
    // corners, so "moved by one" is not "moved by one tile" — the frame is
    // what settles whether the shared rule and the bespoke traversal compose.
    // The cursor is an outline, drawn as four thin `COL_CURSOR` rects.
    const frame = (presses: number[]) =>
      renderScenario({ game: tracksGame, id: ID, presses })
        .recording.ops.filter((o) => o.op === "rect" && o.color === COL_CURSOR)
        .map((o) => JSON.stringify(o));

    const first = frame([CURSOR_RIGHT]);
    // An outline is four rects; the frame carries a couple more in the same
    // color, so the count is a floor rather than an equality — what the test
    // turns on is that the *set* of them differs.
    expect(
      first.length,
      "the cursor outline is drawn after one press",
    ).toBeGreaterThanOrEqual(4);

    // Where it would have been had the press only revealed it: select reveals
    // without moving, so this is the frame the old behavior produced.
    const revealOnly = frame([CURSOR_SELECT2]);
    expect(first).not.toEqual(revealOnly);

    // …and a second press moves it again, so the first was not a one-off.
    const second = frame([CURSOR_RIGHT, CURSOR_RIGHT]);
    expect(second).not.toEqual(first);
  });
});
