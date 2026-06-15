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
import { COL_HINT, COL_HINT_CELL } from "./render.ts";
import { newDesc } from "./solver.ts";
import type { PalisadeHint } from "./state.ts";

// The equivalentEdges frame: a sibling edge AND a shaded *region* (more
// than one referenced cell). numberExhausted legs now also carry a sibling
// (they're grouped into a journey too), but reference a single clue cell —
// so the multi-cell region distinguishes the rule we're hunting.
const isEquivalentEdgesFrame = (hl: PalisadeHint | undefined): boolean =>
  (hl?.edges?.length ?? 0) > 0 && (hl?.cells?.length ?? 0) > 1;

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
        hintUntil: (step) =>
          isEquivalentEdgesFrame(step.highlights as PalisadeHint | undefined),
      });
    } catch {
      return null;
    }
  };

  for (const preset of ["5x5n5", "8x6n6"]) {
    for (let i = 0; i < 200; i++) {
      const id = `${preset}#eq-${i}`;
      const result = tryScenario(id);
      if (
        result &&
        isEquivalentEdgesFrame(result.hint?.highlights as PalisadeHint | undefined)
      ) {
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
    const rectsOf = (colour: number): number =>
      ops.filter((o) => o.op === "rect" && o.colour === colour).length;

    // Both forced edges paint COL_HINT (they share a fate, so they share a
    // colour) — at least two blue rects — over a COL_HINT_CELL-shaded region.
    expect(rectsOf(COL_HINT)).toBeGreaterThanOrEqual(2);
    expect(rectsOf(COL_HINT_CELL)).toBeGreaterThan(0);

    // Shading the region does not erase the clues: digits are still drawn.
    expect(ops.some((o) => o.op === "text")).toBe(true);

    // The displayed step really is the equivalentEdges one (a sibling
    // edge, and a multi-cell referenced region).
    const hl = result.hint?.highlights as PalisadeHint | undefined;
    expect(isEquivalentEdgesFrame(hl)).toBe(true);
    expect(hl?.cells?.length ?? 0).toBeGreaterThan(1);
  });

  it("matches the opener-frame snapshot", () => {
    // A fixed descriptive board → a stable frame, exercising a different
    // rule than equivalentEdges. This board's opening deduction forces
    // more than one edge, so its first leg surfaces a COL_HINT_SIBLING
    // edge (the firing's other edge) alongside the COL_HINT action edge —
    // the grouped-journey rendering.
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
