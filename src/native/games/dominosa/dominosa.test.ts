/**
 * Tier-1 behavioural tests for the dominosa port + a tier-2.5 render smoke.
 * Heavy generation/solve is seed-fixed with explicit timeouts (playbook §5.2).
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newDominosaDesc } from "./generator.ts";
import { COL_DOMINOCLASH } from "./render.ts";
import { solveNumbers } from "./solver.ts";
import { dominosaGame } from "./index.ts";
import {
  DCOUNT,
  DIFF_BASIC,
  DIFF_EXTREME,
  DIFF_HARD,
  DIFF_TRIVIAL,
  DIFFCOUNT,
  decodeParams,
  DINDEX,
  type DominosaMove,
  type DominosaState,
  encodeNumbers,
  encodeParams,
  newState,
  validateDesc,
} from "./state.ts";

describe("dominosa params", () => {
  it("round-trips the presets through encode/decode", () => {
    const cases: Array<[number, number]> = [
      [6, DIFF_BASIC],
      [3, DIFF_TRIVIAL],
      [6, DIFF_HARD],
      [6, DIFF_EXTREME],
    ];
    for (const [n, diff] of cases) {
      const s = encodeParams({ n, diff }, true);
      expect(decodeParams(s)).toEqual({ n, diff });
    }
  });

  it("decodes the legacy 'a' suffix as Ambiguous", () => {
    expect(decodeParams("6a").diff).toBe(4);
  });

  it("rejects n < 1", () => {
    expect(dominosaGame.validateParams({ n: 0, diff: DIFF_BASIC }, true)).not.toBeNull();
    expect(dominosaGame.validateParams({ n: 6, diff: DIFF_BASIC }, true)).toBeNull();
  });
});

describe("dominosa desc codec", () => {
  it("round-trips a generated desc and validates it", () => {
    const { desc } = newDominosaDesc({ n: 5, diff: DIFF_TRIVIAL }, randomNew("desc-rt"));
    expect(validateDesc({ n: 5, diff: DIFF_TRIVIAL }, desc)).toBeNull();
    const state = newState({ n: 5, diff: DIFF_TRIVIAL }, desc);
    expect(encodeNumbers(state.numbers)).toBe(desc);
  });

  it("rejects a wrong number balance", () => {
    // A 3×2 grid (n=1): needs each of {0,1} exactly 3 times. Give all 0s.
    expect(validateDesc({ n: 1, diff: DIFF_TRIVIAL }, "000000")).not.toBeNull();
  });
});

describe("dominosa solver / generator", () => {
  // For a board generated at difficulty d, the solver returns a unique solution
  // reporting max difficulty exactly d, and gets stuck one level below.
  const gradeCases: Array<[number, number, number]> = [
    [5, DIFF_TRIVIAL, DIFF_TRIVIAL],
    [6, DIFF_BASIC, DIFF_TRIVIAL],
    [6, DIFF_HARD, DIFF_BASIC],
    [6, DIFF_EXTREME, DIFF_HARD],
  ];
  for (const [n, diff, prevDiff] of gradeCases) {
    it(
      `generates an order-${n} board uniquely solvable at difficulty ${diff}`,
      () => {
        const { desc } = newDominosaDesc({ n, diff }, randomNew(`grade-${n}-${diff}`));
        const state = newState({ n, diff }, desc);
        const full = solveNumbers(n, state.numbers, DIFFCOUNT);
        expect(full.result).toBe(1);
        expect(full.pairs.length).toBe(DCOUNT(n));

        const graded = solveNumbers(n, state.numbers, diff);
        expect(graded.result).toBe(1);
        expect(graded.maxDiffUsed).toBe(diff);

        if (diff > DIFF_TRIVIAL) {
          const easier = solveNumbers(n, state.numbers, prevDiff);
          expect(easier.result).not.toBe(1); // stuck one level below
        }
      },
      30000,
    );
  }

  it(
    "generates an Ambiguous board (no difficulty guarantee, valid desc)",
    () => {
      const p = { n: 6, diff: 4 };
      const { desc, aux } = newDominosaDesc(p, randomNew("ambig"));
      expect(validateDesc(p, desc)).toBeNull();
      expect(aux.length).toBe((p.n + 2) * (p.n + 1));
    },
    30000,
  );
});

// Helper: place the whole solution via the game's own domino moves.
function layoutSolution(
  state: DominosaState,
  pairs: Array<[number, number]>,
): DominosaState {
  let s = state;
  for (const [a, b] of pairs) {
    s = dominosaGame.executeMove(s, { type: "domino", d1: a, d2: b });
  }
  return s;
}

describe("dominosa moves + completion", () => {
  it(
    "placing every solution domino completes the board",
    () => {
      const p = { n: 4, diff: DIFF_TRIVIAL };
      const { desc } = newDominosaDesc(p, randomNew("complete"));
      const state = newState(p, desc);
      const { pairs } = solveNumbers(p.n, state.numbers, DIFFCOUNT);
      const solved = layoutSolution(state, pairs);
      expect(dominosaGame.status(solved)).toBe("solved");
    },
    30000,
  );

  it("toggles a domino on and off and toggles a barrier edge", () => {
    const p = { n: 3, diff: DIFF_TRIVIAL };
    const { desc } = newDominosaDesc(p, randomNew("toggle"));
    const s0 = newState(p, desc);
    const w = s0.w;

    // Place a horizontal domino on cells 0,1 then remove it.
    const placed = dominosaGame.executeMove(s0, { type: "domino", d1: 0, d2: 1 });
    expect(placed.grid[0]).toBe(1);
    expect(placed.grid[1]).toBe(0);
    const removed = dominosaGame.executeMove(placed, { type: "domino", d1: 0, d2: 1 });
    expect(removed.grid[0]).toBe(0);
    expect(removed.grid[1]).toBe(1);

    // Barrier edge between two empty cells 0 and w (vertical).
    const edged = dominosaGame.executeMove(s0, { type: "edge", d1: 0, d2: w });
    expect(edged.edges[0]).not.toBe(0);
    expect(edged.edges[w]).not.toBe(0);
  });
});

describe("dominosa findMistakes + solve", () => {
  it(
    "flags a placed domino the unique solution doesn't contain",
    () => {
      const p = { n: 4, diff: DIFF_TRIVIAL };
      const { desc } = newDominosaDesc(p, randomNew("mistake"));
      const state = newState(p, desc);
      const { pairs } = solveNumbers(p.n, state.numbers, DIFFCOUNT);
      const solutionSet = new Set(pairs.map(([a, b]) => a * 1000 + b));

      // Find an adjacent pair that is NOT in the solution and place it.
      const w = state.w;
      const h = state.h;
      let wrong: [number, number] | null = null;
      for (let y = 0; y < h && !wrong; y++)
        for (let x = 0; x < w && !wrong; x++) {
          const i = y * w + x;
          if (x + 1 < w && !solutionSet.has(i * 1000 + (i + 1))) wrong = [i, i + 1];
        }
      expect(wrong).not.toBeNull();
      const [a, b] = wrong as [number, number];
      const placed = dominosaGame.executeMove(state, { type: "domino", d1: a, d2: b });
      const mistakes = dominosaGame.findMistakes?.(placed) ?? [];
      const flagged = new Set(mistakes.map((m) => m.index));
      expect(flagged.has(a)).toBe(true);
      expect(flagged.has(b)).toBe(true);
    },
    30000,
  );

  it(
    "solve via aux and via re-solve both reach a completed board",
    () => {
      const p = { n: 4, diff: DIFF_TRIVIAL };
      const { desc, aux } = newDominosaDesc(p, randomNew("solve"));
      const state = newState(p, desc);

      const viaAux = dominosaGame.solve?.(state, state, aux);
      expect(viaAux?.ok).toBe(true);
      if (viaAux?.ok) {
        const solved = dominosaGame.executeMove(state, viaAux.move);
        expect(dominosaGame.status(solved)).toBe("solved");
      }

      const viaSolver = dominosaGame.solve?.(state, state, undefined);
      expect(viaSolver?.ok).toBe(true);
      if (viaSolver?.ok) {
        const solved = dominosaGame.executeMove(state, viaSolver.move);
        expect(dominosaGame.status(solved)).toBe("solved");
      }
    },
    30000,
  );
});

describe("dominosa render", () => {
  it("renders a stable opener frame (numbers, background) for a fixed board", () => {
    const p = { n: 4, diff: DIFF_TRIVIAL };
    const { desc } = newDominosaDesc(p, randomNew("opener"));
    const { recording, size } = renderScenario({
      game: dominosaGame,
      id: `${encodeParams(p, true)}:${desc}`,
    });
    // Targeted guarantees paired with the snapshot (so a careless `-u` can't
    // silently erase them): a clue digit is drawn, and the frame is non-empty.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(size.w).toBeGreaterThan(0);
    expect(recording.ops).toMatchSnapshot();
  });

  it(
    "renders a clash in COL_DOMINOCLASH when a value is placed twice",
    () => {
      // Use a fixed generated board and place the same domino value in two
      // spots by re-solving to find a duplicate-able value.
      const p = { n: 4, diff: DIFF_TRIVIAL };
      const seed = "clash";
      const { desc } = newDominosaDesc(p, randomNew(seed));
      const state = newState(p, desc);
      const w = state.w;
      const h = state.h;

      // Find two disjoint adjacent pairs with the same DINDEX value.
      const byValue = new Map<number, Array<[number, number]>>();
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (x + 1 < w) {
            const v = DINDEX(state.numbers[i], state.numbers[i + 1]);
            let list = byValue.get(v);
            if (!list) {
              list = [];
              byValue.set(v, list);
            }
            list.push([i, i + 1]);
          }
        }
      let moves: DominosaMove[] | null = null;
      for (const pairs of byValue.values()) {
        for (let i = 0; i < pairs.length && !moves; i++)
          for (let j = i + 1; j < pairs.length; j++) {
            const [a1, b1] = pairs[i];
            const [a2, b2] = pairs[j];
            if (a1 !== a2 && a1 !== b2 && b1 !== a2 && b1 !== b2) {
              moves = [
                { type: "domino", d1: a1, d2: b1 },
                { type: "domino", d1: a2, d2: b2 },
              ];
              break;
            }
          }
        if (moves) break;
      }
      expect(moves).not.toBeNull();

      const { recording } = renderScenario({
        game: dominosaGame,
        id: `${encodeParams(p, true)}:${desc}`,
        moves: moves ?? undefined,
      });
      const clash = recording.ops.some(
        (o) => o.op === "rect" && o.colour === COL_DOMINOCLASH,
      );
      expect(clash).toBe(true);
    },
    30000,
  );
});
