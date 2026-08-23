/**
 * Tier-2.5 render-scenario tests for Group: drive a real `Midend` to a target
 * frame and assert the recorded draw ops (plus a snapshot regression baseline).
 * Covers the distinctive Group rendering — the element legend, the shaded main
 * diagonal, and a player-placed subgroup divider — reached in-process with no
 * browser (docs/games/testing.md § "The test tiers", `add-render-snapshot-harness`).
 *
 * A fixed fixture desc keeps every frame deterministic without depending on the
 * generator's RNG.
 */

import { describe, expect, it } from "vitest";
import { expectRing, isThin, markSides } from "../../engine/testing/mark-shape.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { groupGame } from "./index.ts";
import { COL_DIAGONAL, COL_GRID, COL_HINT, COL_HINT_CELL } from "./render.ts";

// A 6x6 identity-shown board (group-trace-5 fixture): the identity row/column
// are given, so the frame exercises legend, diagonal, and immutable digits.
const ID = "6dn:1_2_3_4_5_6_2e3d5_4e5a1c6_3d";

function rects(ops: readonly { op: string }[]) {
  return ops.filter((o) => o.op === "rect") as {
    op: "rect";
    colour: number;
    w: number;
    h: number;
  }[];
}

describe("group render scenarios", () => {
  it("opener frame draws the legend, the shaded diagonal, and digits", () => {
    const { recording } = renderScenario({ game: groupGame, id: ID });
    const ops = recording.ops;

    // The element legend and the given digits are drawn as text.
    const textOps = ops.filter((o) => o.op === "text");
    expect(textOps.length).toBeGreaterThan(0);

    // The w cells on the main display diagonal are shaded COL_DIAGONAL.
    const diagonal = rects(ops).filter((r) => r.colour === COL_DIAGONAL);
    expect(diagonal.length).toBe(6);

    expect(recording.ops).toMatchSnapshot();
  });

  it("a subgroup divider adds thick grid edges the opener lacks", () => {
    const opener = renderScenario({ game: groupGame, id: ID });
    const withDivider = renderScenario({
      game: groupGame,
      id: ID,
      moves: [{ type: "divider", i: 0, j: 1 }],
    });

    // The divider paints extra 1px COL_GRID edges between the two elements.
    const thinGridEdges = (ops: readonly { op: string }[]) =>
      rects(ops).filter((r) => r.colour === COL_GRID && (r.w === 1 || r.h === 1))
        .length;

    expect(thinGridEdges(withDivider.recording.ops)).toBeGreaterThan(
      thinGridEdges(opener.recording.ops),
    );

    expect(withDivider.recording.ops).toMatchSnapshot();
  });

  it("an associativity hint frame rings the target and shades the known products", () => {
    // Scan Normal (identity-shown) seeds for a plan that reaches an associativity
    // step, walking the plan to it (the fixed-seed scan + hintUntil idiom).
    const isAssoc = (step: { explanation: string }) =>
      /in any group/.test(step.explanation);
    let frame: ReturnType<typeof renderScenario> | undefined;
    for (let n = 0; n < 40 && !frame; n++) {
      const r = renderScenario({
        game: groupGame,
        id: `6dn#assoc-${n}`,
        showHint: true,
        hintUntil: isAssoc,
      });
      if (r.hint && isAssoc(r.hint)) frame = r;
    }
    expect(frame, "no associativity frame found in 40 seeds").toBeDefined();
    if (!frame) return;

    // The forced cell is **ringed** COL_HINT — four thin rects, no fill — and
    // the three known products are outlined COL_HINT_CELL as evidence.
    //
    // The side count is the assertion, because it is what distinguishes one
    // contour from a ring per cell. This frame's premises are (1,1), (2,1) and
    // (4,1): an adjacent pair, which the neighbour rule joins into a 6-sided
    // contour, plus a separate cell at 4 — **10**, where a per-cell renderer
    // would give 12 and one that dropped a premise 6.
    expectRing(frame.recording.ops, COL_HINT);
    expect(frame.hint?.highlights).toMatchObject({
      area: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 4, y: 1 },
      ],
    });
    const evidence = markSides(frame.recording.ops, COL_HINT_CELL);
    expect(evidence.length).toBe(10);
    for (const s of evidence) expect(isThin(s)).toBe(true);

    expect(frame.recording.ops).toMatchSnapshot();
  });
});
