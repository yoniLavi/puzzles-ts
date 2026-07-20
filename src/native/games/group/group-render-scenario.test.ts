/**
 * Tier-2.5 render-scenario tests for Group: drive a real `Midend` to a target
 * frame and assert the recorded draw ops (plus a snapshot regression baseline).
 * Covers the distinctive Group rendering — the element legend, the shaded main
 * diagonal, and a player-placed subgroup divider — reached in-process with no
 * browser (playbook §5, `add-render-snapshot-harness`).
 *
 * A fixed fixture desc keeps every frame deterministic without depending on the
 * generator's RNG.
 */

import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { groupGame } from "./index.ts";
import { COL_DIAGONAL, COL_GRID } from "./render.ts";

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
});
