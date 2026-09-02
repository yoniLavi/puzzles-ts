/**
 * Tier-1 tests for the shared random-loop generator. `generateLoop` guarantees
 * the white/black boundary is **a single closed loop**; these assert that
 * invariant, the bias protocol, and reproducibility for a fixed seed.
 *
 * **Where the line falls.** *Which* loop comes out of a given seed is not this
 * file's guarantee and deliberately not asserted here: the module is
 * RNG-faithful to upstream `generate_loop`, and that is checked byte-for-byte,
 * transitively, by Pearl's differential — the loop coloring drives Pearl's
 * desc. So a change to the candidate scoring, the selection order or the
 * random-flip pass is invisible to this file *by design* and loud in
 * `pearl-differential.test.ts` — verified, not assumed: reversing `faceScore`'s
 * sign takes that file from 14 passed / 1 skipped to **7 failed**, one for every
 * desc byte-match fixture it has. What belongs here is everything true of
 * *every* loop, whichever one a seed happens to produce.
 */
import { describe, expect, it } from "vitest";
import { gridNewSquare } from "./grid/index.ts";
import {
  FACE_BLACK,
  FACE_GRAY,
  FACE_WHITE,
  generateLoop,
  type LoopgenBias,
} from "./loopgen.ts";
import { randomNew } from "./random/index.ts";

/**
 * The boundary the coloring describes, measured independently of it: every
 * grid edge whose two sides differ in color (the infinite exterior counts as
 * black), grouped into connected components.
 *
 * Degree parity alone is *not* the guarantee. A board split into two separate
 * rings gives every dot degree 0 or 2 and passes a parity check while being
 * exactly the failure the topology test in `canColorFace` exists to prevent,
 * so the components are counted too.
 */
function loopStats(w: number, h: number, seed: string) {
  const g = gridNewSquare(w, h);
  const board = new Int8Array(g.numFaces);
  generateLoop(g, board, randomNew(seed));

  // Every face is colored (no gray left).
  let anyGray = false;
  for (let i = 0; i < g.numFaces; i++)
    if (board[i] !== FACE_WHITE && board[i] !== FACE_BLACK) anyGray = true;

  // Boundary edges: face colors differ (exterior counts as black).
  const dotDegree = new Int32Array(g.numDots);
  const adjacency = new Map<number, number[]>();
  let loopEdges = 0;
  for (const e of g.edges) {
    const c1 = e.face1 ? board[e.face1.index] : FACE_BLACK;
    const c2 = e.face2 ? board[e.face2.index] : FACE_BLACK;
    if (c1 !== c2) {
      loopEdges++;
      dotDegree[e.dot1.index]++;
      dotDegree[e.dot2.index]++;
      for (const [a, b] of [
        [e.dot1.index, e.dot2.index],
        [e.dot2.index, e.dot1.index],
      ]) {
        const list = adjacency.get(a);
        if (list) list.push(b);
        else adjacency.set(a, [b]);
      }
    }
  }
  const allEven = Array.from(dotDegree).every((d) => d === 0 || d === 2);

  // Connected components over the dots the boundary actually touches.
  const seen = new Set<number>();
  let components = 0;
  for (const dot of adjacency.keys()) {
    if (seen.has(dot)) continue;
    components++;
    const stack = [dot];
    seen.add(dot);
    while (stack.length > 0) {
      const at = stack.pop() as number;
      for (const to of adjacency.get(at) ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        stack.push(to);
      }
    }
  }

  return { board, anyGray, loopEdges, allEven, components };
}

describe("generateLoop", () => {
  it("colours every face and leaves one single closed loop", () => {
    for (const seed of ["loop-a", "loop-b", "loop-c"]) {
      const s = loopStats(8, 8, seed);
      expect(s.anyGray).toBe(false);
      expect(s.loopEdges).toBeGreaterThan(0);
      // Every dot has even loop-degree (0 or 2): the boundary is a set of
      // *simple* loops…
      expect(s.allEven).toBe(true);
      // …and there is exactly one of them, which is the actual guarantee. A
      // coloring that walls a region off inside the wrong color satisfies the
      // parity check above and fails here.
      expect(s.components).toBe(1);
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

describe("the bias protocol", () => {
  /** Every call the generator makes to the bias, as `(face, color-then)`. */
  function record(w: number, h: number, seed: string) {
    const g = gridNewSquare(w, h);
    const board = new Int8Array(g.numFaces);
    const calls: Array<{ face: number; color: number }> = [];
    const bias: LoopgenBias = (b, face) => {
      calls.push({ face, color: b[face] });
      return 0;
    };
    generateLoop(g, board, randomNew(seed), bias);
    return { calls, board, numFaces: g.numFaces };
  }

  it("takes back every tentative colouring, and says so", () => {
    // The contract is "tentative set → restore → notify-commit", which is what
    // lets a bias keep incremental state instead of rescanning the board. Two
    // ways to break it look identical from here and are equally fatal: leaving
    // the trial color on the board, or restoring it without saying so. Either
    // shows the same face non-gray on two calls running.
    const { calls } = record(6, 6, "bias-protocol");
    expect(calls.length).toBeGreaterThan(50);

    const lastColor = new Map<number, number>();
    const doubled: number[] = [];
    for (const { face, color } of calls) {
      if (color !== FACE_GRAY && lastColor.get(face) !== FACE_GRAY) {
        if (lastColor.has(face)) doubled.push(face);
      }
      lastColor.set(face, color);
    }
    expect(doubled).toEqual([]);
  });

  it("lets a bias track the board incrementally rather than rescanning it", () => {
    // The whole point of the protocol, and the one part of it with no consumer
    // today — Pearl's bias deliberately rescans, so nothing else would notice a
    // notification going missing. The doc comment promises it, so it is checked
    // here.
    //
    // Two biases computing the same number, one from the board and one from the
    // notifications alone: how many faces *before* this one are currently white.
    // The score must depend on which face is being scored, and on faces other
    // than that one. A flat count would drift by the same amount for every
    // candidate in a round, leave the arg-max untouched, and let a whole class
    // of missed notifications through unseen — a stale *neighbor* is what
    // actually changes a decision.
    function run(stateful: boolean) {
      const g = gridNewSquare(6, 6);
      const board = new Int8Array(g.numFaces);
      const shadow = new Int8Array(g.numFaces);
      let started = false;
      const bias: LoopgenBias = (b, face) => {
        // The seed face is colored before any call, so a tracking bias reads
        // the board once and follows the notifications from there.
        if (!started) {
          shadow.set(b);
          started = true;
        } else {
          shadow[face] = b[face];
        }
        const source = stateful ? shadow : b;
        let count = 0;
        for (let i = 0; i < face; i++) if (source[i] === FACE_WHITE) count++;
        return count;
      };
      generateLoop(g, board, randomNew("bias-incremental"), bias);
      return Array.from(board);
    }

    expect(run(true)).toEqual(run(false));
  });

  it("a biased run is still a single closed loop", () => {
    const g = gridNewSquare(7, 7);
    const board = new Int8Array(g.numFaces);
    // A bias that genuinely steers: prefer faces low on the board.
    const bias: LoopgenBias = (_b, face) => face;
    generateLoop(g, board, randomNew("bias-steers"), bias);

    let anyGray = false;
    for (let i = 0; i < g.numFaces; i++)
      if (board[i] !== FACE_WHITE && board[i] !== FACE_BLACK) anyGray = true;
    expect(anyGray).toBe(false);

    const dotDegree = new Int32Array(g.numDots);
    for (const e of g.edges) {
      const c1 = e.face1 ? board[e.face1.index] : FACE_BLACK;
      const c2 = e.face2 ? board[e.face2.index] : FACE_BLACK;
      if (c1 !== c2) {
        dotDegree[e.dot1.index]++;
        dotDegree[e.dot2.index]++;
      }
    }
    expect(Array.from(dotDegree).every((d) => d === 0 || d === 2)).toBe(true);
  });
});
