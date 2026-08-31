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
import { tracksGame } from "./index.ts";
import { COL_CURSOR, COL_ERROR } from "./render.ts";
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
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR)).toBe(
      true,
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
        .recording.ops.filter((o) => o.op === "rect" && o.colour === COL_CURSOR)
        .map((o) => JSON.stringify(o));

    const first = frame([CURSOR_RIGHT]);
    // An outline is four rects; the frame carries a couple more in the same
    // colour, so the count is a floor rather than an equality — what the test
    // turns on is that the *set* of them differs.
    expect(
      first.length,
      "the cursor outline is drawn after one press",
    ).toBeGreaterThanOrEqual(4);

    // Where it would have been had the press only revealed it: select reveals
    // without moving, so this is the frame the old behaviour produced.
    const revealOnly = frame([CURSOR_SELECT2]);
    expect(first).not.toEqual(revealOnly);

    // …and a second press moves it again, so the first was not a one-off.
    const second = frame([CURSOR_RIGHT, CURSOR_RIGHT]);
    expect(second).not.toEqual(first);
  });
});
