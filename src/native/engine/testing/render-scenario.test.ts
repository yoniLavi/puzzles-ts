// Mechanics of the Midend-backed scenario driver, exercised against a
// real full-featured game (Palisade: redraw + hint + findMistakes). The
// game-specific seed frames (the equivalentEdges hint) live in
// palisade-render-scenario.test.ts; this file pins the driver contract.
import { describe, expect, it } from "vitest";
import { palisadeGame } from "../../games/palisade/index.ts";
import { COL_GRID, COL_HINT } from "../../games/palisade/render.ts";
import { newDesc } from "../../games/palisade/solver.ts";
import { BORDER } from "../../games/palisade/state.ts";
import { randomNew } from "../../random/index.ts";
import { renderScenario } from "./render-scenario.ts";
import { toSvg } from "./svg-drawing.ts";

const P = { w: 5, h: 5, k: 5 };
const ID = `5x5n5:${newDesc(P, randomNew("render-scenario")).desc}`;

// A guaranteed-valid interior edge edit: toggle the wall between cells
// (1,1) and (2,1). executeMove just XORs the border bits, so this is a
// legal move on any board, independent of the generated clues.
const WALL_MOVE = {
  type: "edges" as const,
  edits: [
    { x: 1, y: 1, flag: BORDER(1) },
    { x: 2, y: 1, flag: BORDER(3) },
  ],
};

describe("renderScenario", () => {
  it("throws on an invalid id rather than capturing an empty frame", () => {
    expect(() => renderScenario({ game: palisadeGame, id: "not-an-id" })).toThrow(
      /invalid id/,
    );
  });

  it("captures a non-empty frame for a fresh board", () => {
    const { recording, size } = renderScenario({ game: palisadeGame, id: ID });
    expect(recording.ops.length).toBeGreaterThan(0);
    // The clue digits and the grid rim are drawn.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_GRID)).toBe(
      true,
    );
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);
  });

  it("replays Moves directly through the midend (not pointer events)", () => {
    const before = renderScenario({ game: palisadeGame, id: ID });
    const after = renderScenario({ game: palisadeGame, id: ID, moves: [WALL_MOVE] });

    // The move actually took: the board state changed (the save bytes
    // differ) and so did the captured render.
    const beforeSave = before.midend.saveGame();
    const afterSave = after.midend.saveGame();
    expect(afterSave).not.toEqual(beforeSave);
    expect(JSON.stringify(after.recording.ops)).not.toBe(
      JSON.stringify(before.recording.ops),
    );
  });

  it("reports the mistake count (0 on a fresh board)", () => {
    const { mistakeCount } = renderScenario({
      game: palisadeGame,
      id: ID,
      showMistakes: true,
    });
    expect(mistakeCount).toBe(0);
  });

  it("shows a hint step and paints its action edge in COL_HINT", () => {
    const { hint, recording } = renderScenario({
      game: palisadeGame,
      id: ID,
      showHint: true,
    });
    expect(hint).toBeDefined();
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(
      true,
    );
  });

  it("walks the plan to a step matching hintUntil", () => {
    // Predicate matches the first step → no walking; the displayed step
    // is the plan opener.
    const opener = renderScenario({
      game: palisadeGame,
      id: ID,
      showHint: true,
      hintUntil: () => true,
    });
    // Predicate matches the second step → exactly one executeHint.
    let seen = 0;
    const second = renderScenario({
      game: palisadeGame,
      id: ID,
      showHint: true,
      hintUntil: () => seen++ >= 1,
    });
    expect(opener.hint).toBeDefined();
    expect(second.hint).toBeDefined();
    // The two steps differ (the walk advanced the displayed step).
    expect(JSON.stringify(second.hint)).not.toBe(JSON.stringify(opener.hint));
  });

  it("toSvg renders the same record as a well-formed SVG", () => {
    const { recording, size } = renderScenario({ game: palisadeGame, id: ID });
    const svg = toSvg(recording.ops, size);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    expect(svg).toContain("<rect");
    expect(svg).toContain(`width="${size.w}"`);
  });
});
