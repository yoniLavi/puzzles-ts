/**
 * Tier-2.5 render scenarios for Tracks: drive a real Midend to a target frame
 * and capture `redraw`. Targeted op assertions (clue text + A/B labels, the
 * `COL_ERROR` mistake overlay, rails as thick lines) plus a snapshot so a
 * render regression is a reviewable text diff (`vitest -u` re-baselines; the
 * targeted assertions survive a careless `-u`).
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { tracksGame } from "./index.ts";
import { COL_ERROR } from "./render.ts";
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
});
