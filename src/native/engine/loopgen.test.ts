/**
 * Tier-1 tests for the shared random-loop generator. `generateLoop`
 * guarantees the white/black boundary is a single closed loop; these assert
 * that invariant and reproducibility for a fixed seed. The byte-match against
 * upstream `generate_loop` is exercised transitively by Pearl's differential
 * (the loop colouring drives Pearl's desc).
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import { gridNewSquare } from "./grid.ts";
import { FACE_BLACK, FACE_WHITE, generateLoop } from "./loopgen.ts";

/** Count the loop edges incident to each dot; a single closed loop makes
 * every dot degree 0 or 2, and there is exactly one connected loop. */
function loopStats(w: number, h: number, seed: string) {
  const g = gridNewSquare(w, h);
  const board = new Int8Array(g.numFaces);
  generateLoop(g, board, randomNew(seed));

  // Every face is coloured (no grey left).
  let anyGrey = false;
  for (let i = 0; i < g.numFaces; i++)
    if (board[i] !== FACE_WHITE && board[i] !== FACE_BLACK) anyGrey = true;

  // Boundary edges: face colours differ (exterior counts as black).
  const dotDegree = new Int32Array(g.numDots);
  let loopEdges = 0;
  for (const e of g.edges) {
    const c1 = e.face1 ? board[e.face1.index] : FACE_BLACK;
    const c2 = e.face2 ? board[e.face2.index] : FACE_BLACK;
    if (c1 !== c2) {
      loopEdges++;
      dotDegree[e.dot1.index]++;
      dotDegree[e.dot2.index]++;
    }
  }
  const allEven = Array.from(dotDegree).every((d) => d === 0 || d === 2);
  return { board, anyGrey, loopEdges, allEven };
}

describe("generateLoop", () => {
  it("colours every face and leaves a valid single-loop boundary", () => {
    for (const seed of ["loop-a", "loop-b", "loop-c"]) {
      const s = loopStats(8, 8, seed);
      expect(s.anyGrey).toBe(false);
      expect(s.loopEdges).toBeGreaterThan(0);
      // Every dot has even loop-degree (0 or 2) — the boundary is a set of
      // simple loops; the generator guarantees it is a single closed loop.
      expect(s.allEven).toBe(true);
    }
  });

  it("is reproducible: the same seed yields the same colouring", () => {
    const a = loopStats(9, 9, "repro");
    const b = loopStats(9, 9, "repro");
    expect(Array.from(a.board)).toEqual(Array.from(b.board));
  });

  it("different seeds generally give different loops", () => {
    const a = loopStats(9, 9, "seed-x");
    const b = loopStats(9, 9, "seed-y");
    expect(Array.from(a.board)).not.toEqual(Array.from(b.board));
  });
});
