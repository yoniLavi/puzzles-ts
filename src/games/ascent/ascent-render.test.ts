/**
 * Tier-2.5 render-scenario tests for Ascent (docs/games/rendering.md § "The tile cache and the diff key", add-render-snapshot-harness).
 *
 * Reaches a fresh board for the Rectangle, Hexagon and Edges modes through a
 * real `Midend`, asserts the ops that matter (background fill, square borders,
 * clue text, edge arrows), then snapshots the whole record so an unintended
 * render drift surfaces as a reviewable diff. Every mode rides one renderer
 * with no per-mode board code, so these three cover the geometry differences.
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { ascentGame } from "./index.ts";
import { COL_ARROW, COL_BORDER, COL_MIDLIGHT } from "./render.ts";
import { type AscentParams, MODE_EDGES, MODE_HEXAGON, MODE_RECT } from "./state.ts";

function id(p: AscentParams, seed: string): string {
  return `${ascentGame.encodeParams(p, true)}#${seed}`;
}

const RECT: AscentParams = {
  w: 5,
  h: 5,
  diff: 1,
  mode: MODE_RECT,
  removeends: false,
  symmetrical: false,
};
const HEXAGON: AscentParams = {
  w: 5,
  h: 5,
  diff: 1,
  mode: MODE_HEXAGON,
  removeends: false,
  symmetrical: false,
};
const EDGES: AscentParams = {
  w: 5,
  h: 5,
  diff: 1,
  mode: MODE_EDGES,
  removeends: true,
  symmetrical: false,
};

describe("ascent render", () => {
  it("Rectangle: fresh board fills a background, draws tile borders and clues", () => {
    const { recording } = renderScenario({
      game: ascentGame,
      id: id(RECT, "render-rect"),
    });
    const ops = recording.ops;
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_MIDLIGHT)).toBe(true);
    expect(ops.some((o) => o.op === "polygon" && o.outline === COL_BORDER)).toBe(true);
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(ops).toMatchSnapshot();
  });

  it("Hexagon: renders real hexagonal cells (6-vertex outlines)", () => {
    const { recording } = renderScenario({
      game: ascentGame,
      id: id(HEXAGON, "render-hex"),
    });
    const ops = recording.ops;
    // A hexagon cell outline is a 6-vertex COL_BORDER polygon (design F7) —
    // not the 4-vertex square the offset-square rendering would emit.
    expect(
      ops.some(
        (o) => o.op === "polygon" && o.outline === COL_BORDER && o.points.length === 6,
      ),
    ).toBe(true);
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(ops).toMatchSnapshot();
  });

  it("Edges: draws arrow clues around the border", () => {
    const { recording } = renderScenario({
      game: ascentGame,
      id: id(EDGES, "render-edges"),
    });
    const ops = recording.ops;
    expect(ops.some((o) => o.op === "polygon" && o.fill === COL_ARROW)).toBe(true);
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(ops).toMatchSnapshot();
  });
});
