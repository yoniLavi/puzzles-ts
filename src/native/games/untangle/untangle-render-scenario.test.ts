/**
 * Tier-2.5 render scenarios for Untangle: drive a real `Midend` to a
 * fixed board and capture `redraw`. Targeted op assertions (edges,
 * crossed-edge red, vertices) plus a `toMatchSnapshot` so a render
 * regression is a reviewable text diff. `vitest -u` re-baselines an
 * intended change — keep the targeted assertions so a careless `-u`
 * can't silently erase the guarantee.
 *
 * The opener frame is reached via `renderScenario`; the mid-drag frame
 * is reached by driving the returned midend's `processInput` (a real
 * mouse-down + drag), the only way to populate the live drag UI state.
 */

import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { LEFT_BUTTON, LEFT_DRAG } from "../../engine/pointer.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newUntangleDesc } from "./generator.ts";
import { untangleGame } from "./index.ts";
import {
  COL_CROSSEDLINE,
  COL_DRAGPOINT,
  COL_LINE,
  COL_OUTLINE,
  COL_POINT,
} from "./render.ts";
import { coordLimit, makeCircle } from "./state.ts";

/** A fixed descriptive board → a stable frame for snapshotting. */
function fixedBoard(n: number, seed: string): string {
  const { desc } = newUntangleDesc({ n }, randomNew(seed));
  return `${n}:${desc}`;
}

describe("Untangle render scenarios", () => {
  it("opener frame: edges, crossed-edge red, and all vertices drawn", () => {
    const n = 10;
    const id = fixedBoard(n, "untangle-render-opener");
    const { recording, size } = renderScenario({ game: untangleGame, id });

    const lines = recording.ops.filter((o) => o.op === "line");
    // Plain edges and at least one crossed (red) edge — the board starts
    // tangled and show-crossed-edges defaults ON.
    expect(lines.some((o) => o.colour === COL_LINE)).toBe(true);
    expect(lines.some((o) => o.colour === COL_CROSSEDLINE)).toBe(true);

    // Every vertex is drawn as a COL_POINT blob (none is being dragged).
    const pointBlobs = recording.ops.filter(
      (o) => o.op === "circle" && o.fill === COL_POINT,
    );
    expect(pointBlobs.length).toBe(n);

    // The playable-area border is drawn (4 COL_OUTLINE frame lines).
    const borderLines = recording.ops.filter(
      (o) => o.op === "line" && o.colour === COL_OUTLINE,
    );
    expect(borderLines.length).toBe(4);

    // Square board at the preferred tile size.
    const ts = untangleGame.preferredTileSize ?? 32;
    expect(size).toEqual({ w: coordLimit(n) * ts, h: coordLimit(n) * ts });

    expect(recording.ops).toMatchSnapshot();
  });

  it("mid-drag frame: the grabbed vertex renders as COL_DRAGPOINT", () => {
    const n = 10;
    const id = fixedBoard(n, "untangle-render-drag");
    const { midend, palette } = renderScenario({ game: untangleGame, id });

    // Mouse-down exactly on vertex 0's pixel (circle layout, d = tileSize
    // so the rational coordinate is already the pixel), then drag it.
    const ts = untangleGame.preferredTileSize ?? 32;
    const v0 = makeCircle(n, coordLimit(n))[0];
    const vx = Math.trunc((v0.x * ts) / v0.d);
    const vy = Math.trunc((v0.y * ts) / v0.d);
    expect(midend.processInput(vx, vy, LEFT_BUTTON)).toBe(true);
    expect(midend.processInput(vx + 30, vy + 40, LEFT_DRAG)).toBe(true);

    const rec = new RecordingDrawing(palette);
    midend.redraw(rec);

    // Exactly one vertex (the grabbed one) is the white drag point.
    const dragBlobs = rec.ops.filter(
      (o) => o.op === "circle" && o.fill === COL_DRAGPOINT,
    );
    expect(dragBlobs.length).toBe(1);

    expect(rec.ops).toMatchSnapshot();
  });

  it("toggling show-crossed-edges off repaints with no red edges (regression)", () => {
    // A pref change moves none of the render early-out's keys (positions,
    // bg, cursor), so a plain repaint would be skipped by the per-frame
    // cache. The midend drops the drawstate on setPreferences so the next
    // redraw repaints from scratch — this asserts that path end to end.
    const n = 10;
    const id = fixedBoard(n, "untangle-render-crossed-toggle");
    // A fresh midend (not renderScenario, which already painted once and
    // would leave the early-out armed) so the first `before` redraw is a
    // full paint.
    const midend = new Midend(untangleGame);
    midend.setCallbacks(
      () => {},
      () => {},
      () => {},
    );
    midend.newGameFromId(id);
    const palette = untangleGame.colours(DEFAULT_BACKGROUND);

    const before = new RecordingDrawing(palette);
    midend.redraw(before);
    expect(
      before.ops.some((o) => o.op === "line" && o.colour === COL_CROSSEDLINE),
    ).toBe(true);

    midend.setPreferences({ "show-crossed-edges": false });
    const after = new RecordingDrawing(palette);
    midend.redraw(after);
    // No edge is red now; every edge is the plain line colour.
    expect(after.ops.some((o) => o.op === "line" && o.colour === COL_CROSSEDLINE)).toBe(
      false,
    );
    expect(after.ops.some((o) => o.op === "line" && o.colour === COL_LINE)).toBe(true);
  });
});
