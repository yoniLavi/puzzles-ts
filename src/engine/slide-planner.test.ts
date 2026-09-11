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

/**
 * Shortest distance from `board` to the solved one, by a plain breadth-first
 * search over the move set — an independent yardstick for the planner's claims
 * about plan length, derived without any of its machinery (no heuristic, no
 * key packing, no canonical-ordering pruning). `cap` bounds the sweep, and the
 * boards it is used on sit well inside it; `null` means "further than `cap`".
 */
function shortestDistance(
  board: Int32Array,
  w: number,
  h: number,
  cap: number,
): number | null {
  const n = w * h;
  const goal = Array.from(solved(n)).join(",");
  const label = (b: Int32Array) => Array.from(b).join(",");
  if (label(board) === goal) return 0;
  const moves = singleStepMoves(w, h);
  const seen = new Set([label(board)]);
  let frontier = [board];
  for (let depth = 1; depth <= cap; depth++) {
    const next: Int32Array[] = [];
    for (const at of frontier) {
      for (const m of moves) {
        const to = new Int32Array(n);
        slidePieces(at, to, w, h, m);
        const k = label(to);
        if (seen.has(k)) continue;
        seen.add(k);
        if (k === goal) return depth;
        next.push(to);
      }
    }
    frontier = next;
  }
  return null;
}

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

  it("vetoes only the opening move, not the move everywhere it appears", () => {
    // The veto exists to stop a hint opening by undoing the slide the player
    // just made. It is not a claim that the move is bad — later in the plan it
    // may be exactly right, and forbidding it outright turns a two-move route
    // into a four-move detour round the wrap.
    const start = apply(solved(N), W, H, [
      { axis: "row", index: 0, delta: +1 },
      { axis: "col", index: 1, delta: +1 },
    ]);
    const undoRow0: SlideMove = { axis: "row", index: 0, delta: -1 };

    const plan = puzzle(start, {
      rejectFirstMove: (m) =>
        m.axis === undoRow0.axis && m.index === undoRow0.index && m.delta === -1,
    });

    expect(plan.reachedGoal).toBe(true);
    expect(plan.moves).toHaveLength(2);
    expect(plan.moves[0]).not.toEqual(undoRow0);
    expect(plan.moves).toContainEqual(undoRow0);
  });

  it("counts the moves already spent, so the plan does not wander", () => {
    // `f = g + h`, not `f = h`. With `g` dropped the search is greedy
    // best-first: it keeps taking whatever looks locally closest and the plan
    // balloons — measured at 17 moves on this board, against A*'s 9, for a
    // position a plain BFS crosses in 5.
    const start = apply(solved(N), W, H, [
      { axis: "row", index: 3, delta: +1 },
      { axis: "col", index: 3, delta: +1 },
      { axis: "row", index: 3, delta: +1 },
      { axis: "col", index: 3, delta: +1 },
      { axis: "row", index: 3, delta: +1 },
    ]);
    const shortest = shortestDistance(start, W, H, 6);
    expect(shortest).toBe(5);

    const plan = puzzle(start);

    expect(plan.reachedGoal).toBe(true);
    // The heuristic is not admissible (one slide moves a whole line), so the
    // plan is not required to be optimal — only not to wander. Twice the true
    // distance is a generous bound that A* clears and greedy does not.
    expect(plan.moves.length).toBeLessThanOrEqual(2 * (shortest as number));
  });

  it("does not mistake a board that merely *keys* like the goal for the goal", () => {
    // Boards are compared by a packed string key, several cells to a character,
    // and that packing has to be injective or the planner stops on the wrong
    // board. One bit too few per cell and `[4, 0, 1]` packs identically to
    // `[0, 1, 1]`: the value 4 overflows its field and reads as a carry into the
    // next cell. The two are not even the same multiset, so no slide relates
    // them and this plan cannot reach its goal at all.
    const start = Int32Array.from([4, 0, 1]);
    const goal = Int32Array.from([0, 1, 1]);
    const plan = planSlides({
      w: 3,
      h: 1,
      start,
      goal,
      moves: [
        { axis: "row", index: 0, delta: +1 },
        { axis: "row", index: 0, delta: -1 },
      ],
      heuristic: (b) => (b.every((v, i) => v === goal[i]) ? 0 : 1),
    });
    expect(plan.reachedGoal).toBe(false);
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

  it("honors a game's own goal test, which may be weaker than the goal board", () => {
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
    // **One known gap, stated rather than left to be rediscovered.** Nothing
    // here catches the search *answering mid-level* — taking a level's first
    // meet instead of its cheapest, which the module's own doc names as the
    // subtle way to get it wrong. It is the local-feedback probe's one survivor
    // in this file, and that is not for want of trying:
    //
    //  - Path length does not expose it. An independent breadth-first check of
    //    every exact plan against the true distance was written and run over 352
    //    boards with the mutation in place: not one non-shortest path. That
    //    agrees with two earlier measurements (601 and ~3,900 scrambles) and has
    //    a reason — the search always grows the *smaller* frontier, so a level's
    //    meets sit at the same other-side depth. The check was not kept: 13.7 s
    //    to catch nothing this suite does not already catch.
    //  - What the mutation *does* change is when the search gives up, because
    //    answering mid-level answers before the next budget check. A differential
    //    against the pre-rewrite implementation over 426 boards found the two
    //    agreeing move for move everywhere except two, both in the
    //    budget-exhausted regime, where the mutant answered and the original
    //    refused.
    //
    // A guard would have to reach a board whose level straddles the state cap.
    // Worth writing if one turns up; not worth manufacturing.
    const EXACT = { maxDepth: 10, maxStates: 200_000 } as const;

    it("runs on a board the heuristic could have handled, and still answers", () => {
      // It runs on *every* board — the guarantee, not an oversight: a search
      // held back until the heuristic proves helpless is the shape that made
      // Sixteen's hint cycle. Here the heuristic would have got home on its own,
      // and the answer is the same either way, one move shorter or equal.
      const start = apply(solved(N), W, H, [{ axis: "row", index: 2, delta: +1 }]);

      const plan = puzzle(start, { exactSearch: EXACT });

      expect(plan.reachedGoal).toBe(true);
      expect(plan.moves).toHaveLength(1);
    });

    it("crosses a strict local minimum the forward search cannot", () => {
      // A flat heuristic — every unsolved board scores the same — leaves the
      // forward search with nothing to improve on. With a budget too small to
      // stumble onto the goal by breadth alone, only the exact search can rescue
      // it — and a board like this is what the search exists for.
      const scramble: SlideMove[] = [
        { axis: "row", index: 0, delta: +1 },
        { axis: "col", index: 2, delta: -1 },
        { axis: "row", index: 3, delta: -1 },
        { axis: "col", index: 1, delta: +1 },
      ];
      const start = apply(solved(N), W, H, scramble);

      const plan = puzzle(start, {
        heuristic: (board) => (board.every((v, i) => v === i + 1) ? 0 : 100),
        exactSearch: EXACT,
        maxStates: 20,
      });

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

      const plan = puzzle(start, { exactSearch: EXACT });

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
        const plan = puzzle(board, { exactSearch: EXACT });
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
        exactSearch: { maxDepth: 4, maxStates: 500 },
      });

      // The exact search could not reach, but the plan is still useful.
      expect(plan.moves.length).toBeGreaterThan(0);
      const distance = travel(W, H);
      expect(distance(apply(start, W, H, plan.moves))).toBeLessThan(distance(start));
      // And the plan really is the heuristic's rather than the exact search's:
      // capped at depth 4, the exact search cannot return more than four moves,
      // so a longer plan can only have come from the fallthrough. (Asserting
      // `reachedGoal` here would say nothing — the heuristic reaches the goal on
      // this board, which is the *point*: the fallthrough is not a failure.)
      expect(plan.moves.length).toBeGreaterThan(4);
    });

    it("may slide the same line several times running", () => {
      // The canonical-ordering pruning drops a *reversal* of the previous move —
      // a shortest path never contains one — but must keep a repeat. Here the
      // board is three slides of row 0 from solved on a seven-wide grid, so the
      // whole plan is one line slid three times the same way, and pruning
      // repeats costs the search that route entirely (measured: 7 moves instead
      // of 3).
      const w = 7;
      const h = 2;
      const start = apply(solved(w * h), w, h, [
        { axis: "row", index: 0, delta: +1 },
        { axis: "row", index: 0, delta: +1 },
        { axis: "row", index: 0, delta: +1 },
      ]);

      const plan = planSlides({
        w,
        h,
        start,
        goal: solved(w * h),
        moves: singleStepMoves(w, h),
        heuristic: travel(w, h),
        exactSearch: EXACT,
      });

      expect(plan.reachedGoal).toBe(true);
      expect(plan.moves).toEqual([
        { axis: "row", index: 0, delta: -1 },
        { axis: "row", index: 0, delta: -1 },
        { axis: "row", index: 0, delta: -1 },
      ]);
    });
  });

  describe("the deep search", () => {
    // Two searches over the same graph, by different machinery — one storing
    // every board it reaches, one storing almost none — so each is a referee for
    // the other. **This is the check that matters, and it is not decoration.**
    //
    // The deep search's index narrows its hash into an `Int32Array`; compare
    // that narrowed word against an unsigned `>>> 0` copy of the same hash and
    // half of every database goes invisible. Nothing fails — it quietly returns
    // "no plan" on boards it should solve, which reads exactly like a search that
    // cannot reach that far. What catches it is asking a mechanism with no hash
    // table in it for the same answer.
    //
    // Small board, small depths: the property is about agreement, not size, and
    // this runs in a moment.
    const w = 4;
    const h = 3;
    const n = w * h;
    const moves = singleStepMoves(w, h);

    it("holds every board within its database depth, and can say so", () => {
      // **The guard for the half-blind index, and it has to be this one.** With
      // `forwardDepth: 0` the search walks nowhere: it probes the board against
      // the database and nothing else, so a plan comes back exactly when the
      // database holds that board. Every board `k ≤ databaseDepth` slides from
      // the goal is one it must hold.
      //
      // The end-to-end agreement check below does *not* catch this, which was
      // measured rather than assumed: with half the entries unmatchable it still
      // passed, because at these depths there are enough other ways to reach the
      // goal that losing half of them changes no answer. That is precisely why
      // the bug survived in the first place — it only bites where the search is
      // stretched to its limit, and a test small enough to be fast is never
      // stretched. So the property is asserted directly instead.
      let held = 0;
      for (let scramble = 1; scramble <= 3; scramble++) {
        for (let trial = 0; trial < 10; trial++) {
          const picked: SlideMove[] = [];
          for (let s = 0; s < scramble; s++) {
            picked.push(moves[(trial * 3 + s * 7) % moves.length]);
          }
          const start = apply(solved(n), w, h, picked);
          if (travel(w, h)(start) === 0) continue;
          const plan = planSlides({
            w,
            h,
            start,
            goal: solved(n),
            moves,
            heuristic: travel(w, h),
            maxStates: 1,
            deepSearch: { forwardDepth: 0, databaseDepth: 3 },
          });
          held++;
          expect(
            plan.reachedGoal,
            `a board ${scramble} slides from the goal is not in a 3-deep database (scramble ${trial})`,
          ).toBe(true);
          expect(plan.moves.length).toBeLessThanOrEqual(scramble);
          expect(apply(start, w, h, plan.moves)).toEqual(solved(n));
        }
      }
      expect(held).toBeGreaterThan(20);
    });

    it("agrees with the state-bounded search, move for move", () => {
      let compared = 0;
      // Up to the deep search's full reach (3 + 3), so a board that needs the
      // *last* forward ply is among them — otherwise a search that stopped one
      // ply short would agree on everything asked of it.
      for (let scramble = 1; scramble <= 6; scramble++) {
        for (let trial = 0; trial < 8; trial++) {
          // A deterministic scramble: no RNG, so a failure names a fixed board.
          const picked: SlideMove[] = [];
          for (let s = 0; s < scramble; s++) {
            picked.push(moves[(trial * 7 + s * 5) % moves.length]);
          }
          const start = apply(solved(n), w, h, picked);
          if (travel(w, h)(start) === 0) continue;
          const base = {
            w,
            h,
            start,
            goal: solved(n),
            moves,
            heuristic: travel(w, h),
            maxStates: 1,
          };
          const stored = planSlides({
            ...base,
            exactSearch: { maxDepth: 6, maxStates: 200_000 },
          });
          const deep = planSlides({
            ...base,
            deepSearch: { forwardDepth: 3, databaseDepth: 3 },
          });
          compared++;
          expect(
            deep.reachedGoal,
            `scramble ${scramble}/${trial}: the stored search reached the goal in ${stored.moves.length}, the deep search did not`,
          ).toBe(stored.reachedGoal);
          expect(
            deep.moves.length,
            `scramble ${scramble}/${trial}: plans of different length`,
          ).toBe(stored.moves.length);
          expect(apply(start, w, h, deep.moves)).toEqual(solved(n));
        }
      }
      // How many did I actually look at?
      expect(compared).toBeGreaterThan(20);
    });

    it("reaches a board the state-bounded search cannot", () => {
      // The whole point of it: a budget too small to store the way there, and a
      // depth that walks it anyway.
      const start = apply(solved(n), w, h, [
        moves[0],
        moves[5],
        moves[9],
        moves[2],
        moves[6],
      ]);
      const base = {
        w,
        h,
        start,
        goal: solved(n),
        moves,
        heuristic: travel(w, h),
        maxStates: 1,
      };

      const starved = planSlides({
        ...base,
        exactSearch: { maxDepth: 8, maxStates: 40 },
      });
      expect(starved.reachedGoal).toBe(false);

      const deep = planSlides({
        ...base,
        exactSearch: { maxDepth: 8, maxStates: 40 },
        deepSearch: { forwardDepth: 3, databaseDepth: 3 },
      });
      expect(deep.reachedGoal).toBe(true);
      expect(apply(start, w, h, deep.moves)).toEqual(solved(n));
    });

    it("shortens the distance to the goal on every step of the walk", () => {
      // The same convergence property the stored search carries, asserted of the
      // deep one — because a game mixes the two and the walk must descend either
      // way (see `deepSearch` in the planner).
      const start = apply(solved(n), w, h, [moves[1], moves[7], moves[4], moves[10]]);
      let board = start;
      let previous = Number.POSITIVE_INFINITY;
      for (let step = 0; step < 20; step++) {
        const plan = planSlides({
          w,
          h,
          start: board,
          goal: solved(n),
          moves,
          heuristic: travel(w, h),
          maxStates: 1,
          deepSearch: { forwardDepth: 3, databaseDepth: 3 },
        });
        if (plan.moves.length === 0) break;
        expect(plan.moves.length).toBeLessThan(previous);
        previous = plan.moves.length;
        board = apply(board, w, h, [plan.moves[0]]);
      }
      expect(board).toEqual(solved(n));
    });
  });
});

describe("toroidalDist", () => {
  it("measures the shorter way round the wrap", () => {
    expect(toroidalDist(0, 3, 4)).toBe(1);
    expect(toroidalDist(3, 0, 4)).toBe(1);
    expect(toroidalDist(0, 2, 4)).toBe(2);
    expect(toroidalDist(1, 3, 5)).toBe(2);
    expect(toroidalDist(0, 4, 5)).toBe(1);
  });

  it("is zero at home and never exceeds half the axis", () => {
    for (let len = 1; len <= 9; len++) {
      for (let from = 0; from < len; from++) {
        expect(toroidalDist(from, from, len)).toBe(0);
        for (let to = 0; to < len; to++) {
          expect(toroidalDist(from, to, len)).toBeLessThanOrEqual(Math.floor(len / 2));
          expect(toroidalDist(from, to, len)).toBe(toroidalDist(to, from, len));
        }
      }
    }
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
