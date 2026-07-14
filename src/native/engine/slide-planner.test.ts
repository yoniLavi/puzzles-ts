/**
 * The shared slide planner, against a synthetic sliding puzzle: a `w × h` grid
 * of numbered pieces whose home is the cell one below their number, exactly like
 * Sixteen but with the move set under the test's control. That keeps every case
 * below about the *search* rather than about any one game.
 */

import { describe, expect, it } from "vitest";
import {
  planSlides,
  type SlideMove,
  slidePieces,
  toroidalDist,
} from "./slide-planner.ts";

/** The solved board: piece `i + 1` in cell `i`. */
function solved(n: number): Int32Array {
  const board = new Int32Array(n);
  for (let i = 0; i < n; i++) board[i] = i + 1;
  return board;
}

/** Every line, slid one step either way. */
function singleStepMoves(w: number, h: number): SlideMove[] {
  const moves: SlideMove[] = [];
  for (let y = 0; y < h; y++) {
    moves.push({ axis: "row", index: y, delta: +1 });
    moves.push({ axis: "row", index: y, delta: -1 });
  }
  for (let x = 0; x < w; x++) {
    moves.push({ axis: "col", index: x, delta: +1 });
    moves.push({ axis: "col", index: x, delta: -1 });
  }
  return moves;
}

/** Total toroidal distance from every piece to its home — the natural "how far
 * from finished" measure for a puzzle whose pieces are all distinct. */
function travel(w: number, h: number): (board: Int32Array) => number {
  return (board) => {
    let total = 0;
    for (let cell = 0; cell < board.length; cell++) {
      const home = board[cell] - 1;
      total +=
        toroidalDist(Math.floor(cell / w), Math.floor(home / w), h) +
        toroidalDist(cell % w, home % w, w);
    }
    return total;
  };
}

function apply(
  board: Int32Array,
  w: number,
  h: number,
  moves: SlideMove[],
): Int32Array {
  let at = board;
  for (const m of moves) {
    const next = new Int32Array(board.length);
    slidePieces(at, next, w, h, m);
    at = next;
  }
  return at;
}

const W = 4;
const H = 4;
const N = W * H;

function puzzle(
  start: Int32Array,
  extra: Partial<Parameters<typeof planSlides>[0]> = {},
) {
  return planSlides({
    w: W,
    h: H,
    start,
    goal: solved(N),
    moves: singleStepMoves(W, H),
    heuristic: travel(W, H),
    ...extra,
  });
}

describe("planSlides", () => {
  it("plans nothing on a finished board", () => {
    const plan = puzzle(solved(N));
    expect(plan.moves).toEqual([]);
    expect(plan.reachedGoal).toBe(true);
  });

  it("finds the single slide that finishes a board one move from solved", () => {
    const scrambler: SlideMove = { axis: "row", index: 2, delta: +1 };
    const start = apply(solved(N), W, H, [scrambler]);

    const plan = puzzle(start);

    expect(plan.reachedGoal).toBe(true);
    expect(plan.moves).toHaveLength(1);
    expect(apply(start, W, H, plan.moves)).toEqual(solved(N));
  });

  it("plans a route through several slides", () => {
    const start = apply(solved(N), W, H, [
      { axis: "row", index: 0, delta: +1 },
      { axis: "col", index: 3, delta: -1 },
      { axis: "row", index: 2, delta: +1 },
    ]);

    const plan = puzzle(start);

    expect(plan.reachedGoal).toBe(true);
    expect(apply(start, W, H, plan.moves)).toEqual(solved(N));
  });

  it("refuses to open with a move the game vetoes", () => {
    // The board is one `row 2, +1` slide from solved, so the plan would normally
    // open by undoing it. Vetoing that move forces a different (longer) route.
    const start = apply(solved(N), W, H, [{ axis: "row", index: 2, delta: +1 }]);

    const plan = puzzle(start, {
      rejectFirstMove: (m) => m.axis === "row" && m.index === 2 && m.delta === -1,
    });

    expect(plan.moves[0]).not.toEqual({ axis: "row", index: 2, delta: -1 });
    expect(apply(start, W, H, plan.moves)).toEqual(solved(N));
  });

  it("returns a partial plan when the budget runs out before the goal", () => {
    // A deeply scrambled board with a budget far too small to reach the goal: the
    // planner must still hand back the route to the best board it found, so the
    // player ends up closer and the next request recomputes.
    const start = apply(
      solved(N),
      W,
      H,
      Array.from({ length: 12 }, (_, i) => singleStepMoves(W, H)[(i * 5) % 16]),
    );

    const plan = puzzle(start, { maxStates: 12 });

    expect(plan.reachedGoal).toBe(false);
    expect(plan.moves.length).toBeGreaterThan(0);

    const distance = travel(W, H);
    expect(distance(apply(start, W, H, plan.moves))).toBeLessThan(distance(start));
  });

  it("honours a game's own goal test, which may be weaker than the goal board", () => {
    // A game whose win condition is satisfied by more boards than the one the
    // planner is aimed at (Netslide: *any* arrangement that powers every tile,
    // not only the one the generator drew) must be able to stop the moment it
    // holds — short of the goal board, and knowing it is finished.
    const start = apply(solved(N), W, H, [
      { axis: "row", index: 0, delta: +1 },
      { axis: "col", index: 2, delta: -1 },
      { axis: "row", index: 3, delta: -1 },
      { axis: "col", index: 1, delta: +1 },
      { axis: "row", index: 2, delta: +1 },
    ]);

    // "Good enough" the moment piece 1 is home — far short of a solved board.
    const plan = puzzle(start, { isGoal: (board) => board[0] === 1 });

    expect(plan.reachedGoal).toBe(true);
    const end = apply(start, W, H, plan.moves);
    expect(end[0]).toBe(1);
    expect(Array.from(end)).not.toEqual(Array.from(solved(N)));
  });

  describe("the exact bidirectional search", () => {
    const EXACT = { maxDepth: 10, maxStates: 200_000 } as const;

    it("stays out of the way while the forward search is making progress", () => {
      const start = apply(solved(N), W, H, [{ axis: "row", index: 2, delta: +1 }]);

      const plan = puzzle(start, {
        exactSearch: { when: "no-progress", ...EXACT },
      });

      expect(plan.reachedGoal).toBe(true);
      expect(plan.usedExactSearch).toBe(false);
    });

    it("engages when the forward search is at a strict local minimum", () => {
      // A flat heuristic — every unsolved board scores the same — leaves the
      // forward search with nothing to improve on, which is exactly the strict
      // local minimum the gate is there to catch. With a budget too small to
      // stumble onto the goal by breadth alone, only the exact search can rescue
      // it.
      const scramble: SlideMove[] = [
        { axis: "row", index: 0, delta: +1 },
        { axis: "col", index: 2, delta: -1 },
        { axis: "row", index: 3, delta: -1 },
        { axis: "col", index: 1, delta: +1 },
      ];
      const start = apply(solved(N), W, H, scramble);

      const plan = puzzle(start, {
        heuristic: (board) => (board.every((v, i) => v === i + 1) ? 0 : 100),
        exactSearch: { when: "no-progress", ...EXACT },
        maxStates: 20,
      });

      expect(plan.usedExactSearch).toBe(true);
      expect(plan.reachedGoal).toBe(true);
      expect(plan.moves).toHaveLength(scramble.length);
      expect(apply(start, W, H, plan.moves)).toEqual(solved(N));
    });

    it("returns a *shortest* plan, which is what makes a recomputed plan converge", () => {
      // Not a stylistic preference. Follow the first move of a shortest plan and
      // the distance to the goal drops by one; follow the first move of a plan
      // one move too long and it need not, which is how a recomputed hint ends up
      // walking in circles for ever.
      const scramble: SlideMove[] = [
        { axis: "row", index: 0, delta: +1 },
        { axis: "col", index: 2, delta: -1 },
        { axis: "row", index: 3, delta: -1 },
      ];
      const start = apply(solved(N), W, H, scramble);

      const plan = puzzle(start, { exactSearch: { when: "first", ...EXACT } });

      expect(plan.usedExactSearch).toBe(true);
      expect(plan.reachedGoal).toBe(true);
      expect(apply(start, W, H, plan.moves)).toEqual(solved(N));
      expect(plan.moves.length).toBe(scramble.length);
    });

    it("shortens the distance to the goal on every step of the walk", () => {
      // The convergence property itself: re-plan from scratch after every single
      // move — the harshest thing a player can do to a hint — and the number of
      // moves still to make must fall by exactly one each time.
      const start = apply(solved(N), W, H, [
        { axis: "row", index: 0, delta: +1 },
        { axis: "col", index: 2, delta: -1 },
        { axis: "row", index: 3, delta: -1 },
        { axis: "col", index: 0, delta: +1 },
      ]);

      let board = start;
      let previous = Number.POSITIVE_INFINITY;
      for (let step = 0; step < 20; step++) {
        const plan = puzzle(board, { exactSearch: { when: "first", ...EXACT } });
        if (plan.moves.length === 0) break;
        expect(plan.moves.length).toBeLessThan(previous);
        previous = plan.moves.length;
        board = apply(board, W, H, [plan.moves[0]]);
      }
      expect(board).toEqual(solved(N));
    });

    it("falls through to the heuristic when the ends cannot meet in budget", () => {
      const start = apply(
        solved(N),
        W,
        H,
        Array.from({ length: 14 }, (_, i) => singleStepMoves(W, H)[(i * 7) % 16]),
      );

      const plan = puzzle(start, {
        exactSearch: { when: "first", maxDepth: 4, maxStates: 500 },
      });

      // The exact search could not reach, but the plan is still useful.
      expect(plan.moves.length).toBeGreaterThan(0);
      const distance = travel(W, H);
      expect(distance(apply(start, W, H, plan.moves))).toBeLessThan(distance(start));
    });
  });
});

describe("slidePieces", () => {
  it("moves a row's pieces by +delta, wrapping around", () => {
    const board = Int32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const out = new Int32Array(9);
    slidePieces(board, out, 3, 3, { axis: "row", index: 0, delta: +1 });
    expect(Array.from(out)).toEqual([3, 1, 2, 4, 5, 6, 7, 8, 9]);
  });

  it("moves a column's pieces by +delta, wrapping around", () => {
    const board = Int32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const out = new Int32Array(9);
    slidePieces(board, out, 3, 3, { axis: "col", index: 0, delta: +1 });
    expect(Array.from(out)).toEqual([7, 2, 3, 1, 5, 6, 4, 8, 9]);
  });
});
