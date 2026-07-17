/**
 * Behavioural tests for the Separate port.
 *
 * Tier 1 — params/desc codecs, the win condition, the solver/generator, and
 * findMistakes. Tier 2.5 — render scenarios (opener frame snapshot + a
 * mistakes-overlay frame) driven through a real Midend.
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newSeparateDesc } from "./generator.ts";
import { separateGame } from "./index.ts";
import { COL_CORRECT, COL_ERROR } from "./render.ts";
import { solve, solveToBorders } from "./solver.ts";
import {
  BORDER,
  BORDER_D,
  BORDER_R,
  decodeParams,
  encodeDesc,
  encodeParams,
  executeMove,
  isSolved,
  newState,
  type SeparateMove,
  type SeparateParams,
  validateDesc,
  validateParams,
} from "./state.ts";

const P5: SeparateParams = { w: 5, h: 5, k: 5 };

// --- params ----------------------------------------------------------------

describe("separate params", () => {
  it("round-trips encode/decode", () => {
    expect(encodeParams({ w: 6, h: 6, k: 4 }, true)).toBe("6x6n4");
    expect(decodeParams("6x6n4")).toEqual({ w: 6, h: 6, k: 4 });
  });

  it("decodes a bare size to a square grid with k = w", () => {
    expect(decodeParams("5")).toEqual({ w: 5, h: 5, k: 5 });
  });

  it("rejects invalid params", () => {
    expect(validateParams({ w: 0, h: 5, k: 5 }, true)).not.toBeNull();
    expect(validateParams({ w: 5, h: 5, k: 3 }, true)).not.toBeNull(); // 3 ∤ 25
    expect(validateParams({ w: 5, h: 5, k: 25 }, true)).not.toBeNull(); // whole grid
    expect(validateParams({ w: 5, h: 5, k: 1 }, true)).not.toBeNull();
    expect(validateParams({ w: 6, h: 6, k: 4 }, true)).toBeNull();
  });
});

// --- desc codec ------------------------------------------------------------

describe("separate desc codec", () => {
  it("round-trips a generated desc", () => {
    const { desc } = newSeparateDesc(P5, randomNew("sep-rt"));
    const s = newState(P5, desc);
    expect(encodeDesc(s.letters, P5.w * P5.h)).toBe(desc);
  });

  it("rejects a malformed desc", () => {
    expect(validateDesc(P5, "ABCDE")).not.toBeNull(); // wrong length
    expect(validateDesc(P5, "F".repeat(25))).not.toBeNull(); // F is outside k=5
    const { desc } = newSeparateDesc(P5, randomNew("sep-valid"));
    expect(validateDesc(P5, desc)).toBeNull();
  });
});

// --- win condition ---------------------------------------------------------

describe("separate isSolved", () => {
  it("accepts the unique partition and rejects a broken one", () => {
    const { desc } = newSeparateDesc(P5, randomNew("sep-win"));
    const s = newState(P5, desc);
    const sol = solveToBorders(P5, s.letters);
    expect(sol).not.toBeNull();
    if (!sol) return;
    expect(isSolved(P5.w, P5.h, P5.k, s.letters, sol)).toBe(true);

    // Remove one *interior* wall → two regions merge (over-size / duplicate
    // letter): no longer solved.
    const broken = sol.slice();
    outer: for (let y = 0; y < P5.h; y++) {
      for (let x = 0; x < P5.w - 1; x++) {
        const i = y * P5.w + x;
        if (broken[i] & BORDER_R) {
          broken[i] &= ~BORDER_R;
          broken[i + 1] &= ~8; // clear the neighbour's BORDER_L
          break outer;
        }
      }
    }
    expect(isSolved(P5.w, P5.h, P5.k, s.letters, broken)).toBe(false);
  });
});

// --- solver / generator ----------------------------------------------------

describe("separate solver + generator", () => {
  for (const p of [
    { w: 4, h: 4, k: 4 },
    { w: 5, h: 5, k: 5 },
    { w: 6, h: 6, k: 4 },
  ]) {
    it(`generates uniquely-solvable ${p.w}x${p.h}n${p.k} boards`, () => {
      const rng = randomNew(`sep-gen-${p.w}-${p.h}-${p.k}`);
      for (let n = 0; n < 5; n++) {
        const { desc } = newSeparateDesc(p, rng);
        const s = newState(p, desc);
        const dsf = solve(p, s.letters);
        expect(dsf).not.toBeNull();
        const sol = solveToBorders(p, s.letters);
        expect(sol).not.toBeNull();
        if (sol) expect(isSolved(p.w, p.h, p.k, s.letters, sol)).toBe(true);
      }
    });
  }
});

// --- solve through the Midend ----------------------------------------------

describe("separate solve", () => {
  it("Solve produces a completed board", () => {
    const { desc } = newSeparateDesc(P5, randomNew("sep-solve"));
    const s0 = newState(P5, desc);
    const result = separateGame.solve?.(s0, s0, undefined);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const solved = executeMove(s0, result.move);
    expect(solved.completed).toBe(true);
  });
});

// --- findMistakes ----------------------------------------------------------

/** An interior edge that is NOT a wall in the unique solution (so drawing a
 * wall there is a guaranteed mistake). Returns the two-sided edges move. */
function wrongWallMove(p: SeparateParams, letters: Uint8Array): SeparateMove {
  const sol = solveToBorders(p, letters);
  if (!sol) throw new Error("board not solvable");
  const { w, h } = p;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && !(sol[i] & BORDER_R)) {
        return {
          type: "edges",
          edits: [
            { x, y, flag: BORDER(1) },
            { x: x + 1, y, flag: BORDER(3) },
          ],
        };
      }
      if (y + 1 < h && !(sol[i] & BORDER_D)) {
        return {
          type: "edges",
          edits: [
            { x, y, flag: BORDER(2) },
            { x, y: y + 1, flag: BORDER(0) },
          ],
        };
      }
    }
  }
  throw new Error("no non-wall interior edge");
}

describe("separate findMistakes", () => {
  it("flags a wall the unique solution lacks", () => {
    const { desc } = newSeparateDesc(P5, randomNew("sep-mistake"));
    const s0 = newState(P5, desc);
    const move = wrongWallMove(P5, s0.letters);
    const s1 = executeMove(s0, move);
    const mistakes = separateGame.findMistakes?.(s1) ?? [];
    expect(mistakes.length).toBeGreaterThan(0);
  });

  it("finds no mistakes on the untouched board", () => {
    const { desc } = newSeparateDesc(P5, randomNew("sep-clean"));
    const s = newState(P5, desc);
    expect(separateGame.findMistakes?.(s) ?? []).toEqual([]);
  });
});

// --- render (tier 2.5) -----------------------------------------------------

describe("separate render scenarios", () => {
  it("draws the opener frame (letters + grid) and snapshots it", () => {
    const id = `5x5n5:${newSeparateDesc(P5, randomNew("sep-render-open")).desc}`;
    const { recording } = renderScenario({ game: separateGame, id });
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops.some((o) => o.op === "rect")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("shades a correctly-completed region (COL_CORRECT), leaving the rest plain", () => {
    // Seal region 0 of the unique solution (its full boundary) so exactly that
    // one k-omino is complete while the rest of the grid is still one big region.
    const desc = newSeparateDesc(P5, randomNew("sep-valid-region")).desc;
    const letters = newState(P5, desc).letters;
    const dsf = solve(P5, letters);
    expect(dsf).not.toBeNull();
    if (!dsf) return;
    const r0 = dsf.canonify(0);
    const edits: { x: number; y: number; flag: number }[] = [];
    for (let y = 0; y < P5.h; y++) {
      for (let x = 0; x < P5.w; x++) {
        const i = y * P5.w + x;
        const inR0 = dsf.canonify(i) === r0;
        if (x + 1 < P5.w && inR0 !== (dsf.canonify(i + 1) === r0)) {
          edits.push({ x, y, flag: BORDER(1) }, { x: x + 1, y, flag: BORDER(3) });
        }
        if (y + 1 < P5.h && inR0 !== (dsf.canonify(i + P5.w) === r0)) {
          edits.push({ x, y, flag: BORDER(2) }, { x, y: y + 1, flag: BORDER(0) });
        }
      }
    }
    const { recording } = renderScenario({
      game: separateGame,
      id: `5x5n5:${desc}`,
      moves: [{ type: "edges", edits }],
    });
    const validRects = recording.ops.filter(
      (o) => o.op === "rect" && o.colour === COL_CORRECT,
    ).length;
    // Region 0 has exactly k=5 cells → 5 green tile backgrounds; the rest plain.
    expect(validRects).toBe(P5.k);
  });

  it("paints a findMistakes edge in the error colour", () => {
    const desc = newSeparateDesc(P5, randomNew("sep-render-mistake")).desc;
    const letters = newState(P5, desc).letters;
    const { recording, mistakeCount } = renderScenario({
      game: separateGame,
      id: `5x5n5:${desc}`,
      moves: [wrongWallMove(P5, letters)],
      showMistakes: true,
    });
    expect(mistakeCount).toBeGreaterThan(0);
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR)).toBe(
      true,
    );
  });
});
