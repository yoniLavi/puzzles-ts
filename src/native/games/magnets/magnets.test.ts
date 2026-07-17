/** Tier-1 behavioural tests for the Magnets port. */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { newMagnetsDesc } from "./generator.ts";
import { magnetsGame } from "./index.ts";
import { MagnetsSolver } from "./solver.ts";
import {
  DIFF_COUNT,
  DIFF_EASY,
  DIFF_TRICKY,
  decodeParams,
  encodeParams,
  GS_SET,
  type MagnetsParams,
  NEUTRAL,
  newState,
  POSITIVE,
} from "./state.ts";

const P = (
  w: number,
  h: number,
  diff = DIFF_TRICKY,
  stripclues = false,
): MagnetsParams => ({ w, h, diff, stripclues });

describe("magnets params", () => {
  it("round-trips full encode/decode", () => {
    for (const p of [P(6, 5, DIFF_EASY), P(10, 9, DIFF_TRICKY, true), P(8, 7)]) {
      const enc = encodeParams(p, true);
      expect(decodeParams(enc)).toEqual(p);
    }
  });

  it("encodes 10x9 Tricky strip-clues as 10x9dtS", () => {
    expect(encodeParams(P(10, 9, DIFF_TRICKY, true), true)).toBe("10x9dtS");
  });

  it("rejects a 4x4 Tricky board (needs a side >= 5)", () => {
    expect(magnetsGame.validateParams(P(4, 4, DIFF_TRICKY), true)).not.toBeNull();
    expect(magnetsGame.validateParams(P(5, 4, DIFF_TRICKY), true)).toBeNull();
  });

  it("all presets validate", () => {
    const walk = (m: {
      params?: MagnetsParams;
      submenu?: unknown[];
    }): MagnetsParams[] => {
      if (m.params) return [m.params];
      return (m.submenu as { params?: MagnetsParams }[]).flatMap((s) =>
        walk(s as { params?: MagnetsParams; submenu?: unknown[] }),
      );
    };
    for (const p of walk(magnetsGame.presets())) {
      expect(magnetsGame.validateParams(p, true)).toBeNull();
    }
  });
});

describe("magnets desc codec", () => {
  it("newState re-encodes to the same desc for a generated board", () => {
    const p = P(6, 5, DIFF_EASY);
    const { desc } = newMagnetsDesc(p, randomNew("codec-1"));
    expect(magnetsGame.validateDesc(p, desc)).toBeNull();
    const s = newState(p, desc);
    // singletons are pre-set neutral
    for (let i = 0; i < s.wh; i++) {
      if (s.common.dominoes[i] === i) {
        expect(s.flags[i] & GS_SET).toBeTruthy();
        expect(s.grid[i]).toBe(NEUTRAL);
      }
    }
  });

  it("rejects inconsistent dominoes and short descs", () => {
    const p = P(3, 3, DIFF_EASY);
    expect(magnetsGame.validateDesc(p, "...,...,...,...,LLLLLLLLL")).not.toBeNull();
    expect(magnetsGame.validateDesc(p, "...")).not.toBeNull();
  });
});

describe("magnets generator + solver", () => {
  it("generates uniquely solvable boards at the requested difficulty", () => {
    for (const p of [P(6, 5, DIFF_EASY), P(6, 5, DIFF_TRICKY), P(8, 7, DIFF_TRICKY)]) {
      const { desc, aux } = newMagnetsDesc(p, randomNew(`gen-${p.w}x${p.h}-${p.diff}`));
      const s = newState(p, desc);
      const solver = new MagnetsSolver(
        s.w,
        s.h,
        s.common.dominoes,
        s.common.rowcount,
        s.common.colcount,
      );
      expect(solver.solve(DIFF_COUNT)).toBe(1); // uniquely solvable

      // aux is the solution; the solver must reproduce it.
      for (let i = 0; i < s.wh; i++) {
        const auxVal = aux[i] === "+" ? 1 : aux[i] === "-" ? 2 : 0;
        expect(solver.grid[i]).toBe(auxVal);
      }
    }
  });

  it("a Tricky board is not solvable at Easy", () => {
    const p = P(8, 7, DIFF_TRICKY);
    const { desc } = newMagnetsDesc(p, randomNew("tricky-not-easy"));
    const s = newState(p, desc);
    const easy = new MagnetsSolver(
      s.w,
      s.h,
      s.common.dominoes,
      s.common.rowcount,
      s.common.colcount,
    );
    expect(easy.solve(DIFF_EASY)).toBeLessThanOrEqual(0); // ambiguous at Easy
  });
});

describe("magnets moves + findMistakes", () => {
  it("the magnet cycle sets both ends and back", () => {
    const p = P(6, 5, DIFF_EASY);
    const { desc } = newMagnetsDesc(p, randomNew("cycle"));
    let s = newState(p, desc);
    // Find a horizontal domino (idx → idx+1).
    let idx = -1;
    for (let i = 0; i < s.wh; i++) {
      if (s.common.dominoes[i] === i + 1) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const partner = s.common.dominoes[idx];

    s = magnetsGame.executeMove(s, { type: "set", idx, which: POSITIVE });
    expect(s.grid[idx]).toBe(POSITIVE);
    expect(s.grid[partner]).toBe(2); // NEGATIVE
    expect(s.flags[idx] & GS_SET).toBeTruthy();

    s = magnetsGame.executeMove(s, { type: "set", idx, which: 2 });
    expect(s.grid[idx]).toBe(2);
    expect(s.grid[partner]).toBe(POSITIVE);
  });

  it("clue-done toggle greys a clue and does not affect completion", () => {
    const p = P(6, 5, DIFF_EASY);
    const { desc } = newMagnetsDesc(p, randomNew("clue"));
    let s = newState(p, desc);
    expect(s.countsDone[0]).toBe(0);
    s = magnetsGame.executeMove(s, { type: "clue", clue: 0 });
    expect(s.countsDone[0]).toBe(1);
    expect(magnetsGame.status(s)).toBe("ongoing");
  });

  it("findMistakes flags a wrong placement and Solve reaches completion", () => {
    const p = P(6, 5, DIFF_EASY);
    const { desc, aux } = newMagnetsDesc(p, randomNew("mistake"));
    let s = newState(p, desc);
    expect(magnetsGame.findMistakes?.(s)).toEqual([]);

    // Place a wrong magnet: find a magnet cell in the solution, set it opposite.
    let wrongIdx = -1;
    for (let i = 0; i < s.wh; i++) {
      if (s.common.dominoes[i] === i + 1 && aux[i] === "+") {
        wrongIdx = i;
        break;
      }
    }
    if (wrongIdx >= 0) {
      const dirty = magnetsGame.executeMove(s, {
        type: "set",
        idx: wrongIdx,
        which: 2,
      });
      const mistakes = magnetsGame.findMistakes?.(dirty) ?? [];
      expect(mistakes.length).toBeGreaterThan(0);
    }

    // Solve reaches completion.
    const solveRes = magnetsGame.solve?.(s, s, aux);
    expect(solveRes?.ok).toBe(true);
    if (solveRes?.ok) {
      s = magnetsGame.executeMove(s, solveRes.move);
      expect(s.completed).toBe(true);
    }
  });
});
