// Seed for the in-process render-snapshot harness, on Palisade.
//
// These are the exact frames that were painful to verify in the browser
// harness (OffscreenCanvas blocked getImageData, right-click marks did
// not register, stopping on a mid-plan hint step needed Auto-Hint
// timing). Here they are reached in-process via the real Midend and
// asserted with no browser and no human eyeball:
//
//  1. the `equivalentEdges` hint frame — action edge COL_HINT, the
//     sibling edge COL_HINT_SIBLING, the shaded region COL_HINT_CELL,
//     clue digits still drawn (the spec's "hint frame asserted without
//     a browser" scenario);
//  2. a fixed opener frame snapshot — a render regression is a
//     reviewable text diff (the spec's "render regression is a snapshot
//     diff" scenario).
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { palisadeGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL, COL_HINT_SIBLING } from "./render.ts";
import { newDesc } from "./solver.ts";
import type { PalisadeHint } from "./state.ts";

const hasSiblings = (hl: PalisadeHint | undefined): boolean =>
  (hl?.edges?.length ?? 0) > 0;

/**
 * Deterministically find a board whose hint plan reaches an
 * `equivalentEdges` deduction (the one carrying a sibling edge), and
 * return the frame with that step displayed. The scan is fixed-seed, so
 * it resolves to the same board every run; it only re-resolves (and the
 * snapshot/board churns, healthily) if the generator or solver changes.
 */
function equivalentEdgesFrame() {
  // A board with no opening deduction (or any other per-board oddity)
  // is not what we're hunting; skip a throwing scenario rather than
  // failing the whole scan.
  const tryScenario = (id: string) => {
    try {
      return renderScenario({
        game: palisadeGame,
        id,
        showHint: true,
        hintUntil: (step) => hasSiblings(step.highlights as PalisadeHint | undefined),
      });
    } catch {
      return null;
    }
  };

  for (const preset of ["5x5n5", "8x6n6"]) {
    for (let i = 0; i < 200; i++) {
      const id = `${preset}#eq-${i}`;
      const result = tryScenario(id);
      if (result && hasSiblings(result.hint?.highlights as PalisadeHint | undefined)) {
        return { id, result };
      }
    }
  }
  throw new Error(
    "no equivalentEdges board found in the scan range — the rule may no " +
      "longer fire, or the generator changed; widen the scan or pick a seed",
  );
}

describe("Palisade render scenarios", () => {
  it("reaches the equivalentEdges hint frame in-process and paints it", () => {
    const { result } = equivalentEdgesFrame();
    const ops = result.recording.ops;
    const paintsRect = (colour: number): boolean =>
      ops.some((o) => o.op === "rect" && o.colour === colour);

    // The action edge (blue), its related sibling edge (orange), and the
    // shaded referenced region (light blue) are all painted, distinctly.
    expect(paintsRect(COL_HINT)).toBe(true);
    expect(paintsRect(COL_HINT_SIBLING)).toBe(true);
    expect(paintsRect(COL_HINT_CELL)).toBe(true);

    // Shading the region does not erase the clues: digits are still drawn.
    expect(ops.some((o) => o.op === "text")).toBe(true);

    // The displayed step really is the equivalentEdges one (a sibling
    // edge, and a non-empty referenced region).
    const hl = result.hint?.highlights as PalisadeHint | undefined;
    expect(hasSiblings(hl)).toBe(true);
    expect(hl?.cells?.length ?? 0).toBeGreaterThan(0);
  });

  it("matches the opener-frame snapshot", () => {
    // A fixed descriptive board → a stable frame. The opener deduction is
    // a simpler rule than equivalentEdges (no sibling edge), exercising a
    // second rule's rendering.
    const P = { w: 5, h: 5, k: 5 };
    const id = `5x5n5:${newDesc(P, randomNew("palisade-render-opener")).desc}`;
    const { recording, hint } = renderScenario({
      game: palisadeGame,
      id,
      showHint: true,
    });

    expect(hint).toBeDefined();
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });
});
