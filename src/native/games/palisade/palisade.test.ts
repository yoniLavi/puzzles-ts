import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { divvyRectangle } from "./divvy.ts";
import { palisadeGame } from "./index.ts";
import { newDesc, solver, solveToBorders } from "./solver.ts";
import {
  BORDER,
  BORDER_MASK,
  bitcount,
  buildDsf,
  DISABLED,
  decodeParams,
  encodeDesc,
  encodeParams,
  initBorders,
  isSolved,
  newState,
  type PalisadeParams,
  validateDesc,
  validateParams,
} from "./state.ts";

const PRESETS: PalisadeParams[] = [
  { w: 5, h: 5, k: 5 },
  { w: 8, h: 6, k: 6 },
  { w: 10, h: 8, k: 8 },
  { w: 15, h: 12, k: 10 },
];

describe("palisade params", () => {
  it("encodes and round-trips", () => {
    expect(encodeParams({ w: 8, h: 6, k: 6 }, true)).toBe("8x6n6");
    expect(decodeParams("8x6n6")).toEqual({ w: 8, h: 6, k: 6 });
  });

  it("decodes a bare size leniently", () => {
    expect(decodeParams("5")).toEqual({ w: 5, h: 5, k: 5 });
    expect(decodeParams("7x7")).toEqual({ w: 7, h: 7, k: 7 });
  });

  it("validates the region-size constraints", () => {
    expect(validateParams({ w: 5, h: 5, k: 5 }, true)).toBeNull();
    expect(validateParams({ w: 5, h: 5, k: 7 }, true)).not.toBeNull(); // 7 ∤ 25
    expect(validateParams({ w: 5, h: 5, k: 25 }, true)).not.toBeNull(); // k = wh
    expect(validateParams({ w: 4, h: 4, k: 2 }, true)).not.toBeNull(); // k=2 corridor
    expect(validateParams({ w: 1, h: 4, k: 2 }, true)).toBeNull(); // k=2 allowed on a strip
  });
});

describe("palisade desc codec", () => {
  it("round-trips a clue grid", () => {
    const p = { w: 5, h: 5, k: 5 };
    const { desc } = newDesc(p, randomNew("palisade-desc"));
    expect(validateDesc(p, desc)).toBeNull();
    const state = newState(p, desc);
    expect(encodeDesc(state.clues, p.w * p.h)).toBe(desc);
  });

  it("rejects malformed descs", () => {
    const p = { w: 5, h: 5, k: 5 };
    expect(validateDesc(p, "5")).not.toBeNull(); // clue > 4
    expect(validateDesc(p, "?")).not.toBeNull();
    expect(validateDesc(p, "z".repeat(2))).not.toBeNull(); // 52 > 25 squares
  });
});

describe("palisade divvy", () => {
  it("partitions every cell into exactly-k regions", () => {
    const rng = randomNew("palisade-divvy");
    for (const p of PRESETS) {
      for (let trial = 0; trial < 3; trial++) {
        const dsf = divvyRectangle(p.w, p.h, p.k, rng);
        const wh = p.w * p.h;
        for (let i = 0; i < wh; i++) expect(dsf.size(i)).toBe(p.k);
        // Count distinct regions == wh/k.
        const roots = new Set<number>();
        for (let i = 0; i < wh; i++) roots.add(dsf.canonify(i));
        expect(roots.size).toBe(wh / p.k);
      }
    }
  });
});

describe("palisade solver + generator", () => {
  // Generation is CPU-heavy (the 15×12 preset is ~0.7s/board); the
  // explicit timeout keeps it robust under parallel-suite load.
  it(
    "generates uniquely solvable boards across presets",
    () => {
      for (const p of PRESETS) {
        const rng = randomNew(`palisade-gen-${p.w}x${p.h}`);
        const { desc } = newDesc(p, rng);
        const state = newState(p, desc);
        const sol = solveToBorders(p, state.clues);
        expect(sol).not.toBeNull();
        if (sol) {
          expect(isSolved(p.w, p.h, p.k, state.clues, sol)).toBe(true);
        }
      }
    },
    30000,
  );

  it("the solver fills the rim into a valid division", () => {
    const p = { w: 5, h: 5, k: 5 };
    const { desc } = newDesc(p, randomNew("palisade-solve"));
    const clues = newState(p, desc).clues;
    const borders = initBorders(p.w, p.h);
    expect(solver(p, clues, borders)).toBe(true);
    // Every region exactly k, every clue equals its wall count.
    const dsf = buildDsf(p.w, p.h, borders, true);
    for (let i = 0; i < p.w * p.h; i++) {
      expect(dsf.size(i)).toBe(p.k);
      if (clues[i] >= 0) expect(bitcount(borders[i])).toBe(clues[i]);
    }
  });
});

describe("palisade moves", () => {
  it("toggles a wall on both shared sides", () => {
    const p = { w: 5, h: 5, k: 5 };
    const { desc } = newDesc(p, randomNew("palisade-move"));
    const s0 = newState(p, desc);
    // Right edge of cell (1,1): flag BORDER_R on (1,1), BORDER_L on (2,1).
    const s1 = palisadeGame.executeMove(s0, {
      type: "edges",
      edits: [
        { x: 1, y: 1, flag: BORDER(1) },
        { x: 2, y: 1, flag: BORDER(3) },
      ],
    });
    expect(s1.borders[1 * 5 + 1] & BORDER(1)).toBeTruthy();
    expect(s1.borders[1 * 5 + 2] & BORDER(3)).toBeTruthy();
    expect(s0.borders[1 * 5 + 1] & BORDER(1)).toBeFalsy(); // original unchanged
  });

  it("rejects toggling a grid-rim wall", () => {
    const p = { w: 5, h: 5, k: 5 };
    const s0 = newState(p, newDesc(p, randomNew("palisade-rim")).desc);
    expect(() =>
      palisadeGame.executeMove(s0, {
        type: "edges",
        edits: [{ x: 0, y: 0, flag: BORDER(0) }], // up wall on top row → off-grid
      }),
    ).toThrow();
  });

  it("a solve move completes and marks cheated", () => {
    const p = { w: 5, h: 5, k: 5 };
    const s0 = newState(p, newDesc(p, randomNew("palisade-solvemove")).desc);
    const res = palisadeGame.solve?.(s0, s0);
    expect(res?.ok).toBe(true);
    if (res?.ok) {
      const solved = palisadeGame.executeMove(s0, res.move);
      expect(solved.completed).toBe(true);
      expect(solved.cheated).toBe(true);
      expect(palisadeGame.status(solved)).toBe("solved");
    }
  });
});

describe("palisade findMistakes", () => {
  it("flags a wall the solution lacks and stays clean on the solution", () => {
    const p = { w: 5, h: 5, k: 5 };
    const s0 = newState(p, newDesc(p, randomNew("palisade-mistake")).desc);
    const sol = solveToBorders(p, s0.clues);
    expect(sol).not.toBeNull();
    if (!sol) return;

    // The full solution has no mistakes.
    const solvedState = { ...s0, borders: sol.slice() };
    expect(palisadeGame.findMistakes?.(solvedState)).toHaveLength(0);

    // Draw a wall the solution does not contain → at least one mistake.
    // Find an interior edge with no wall in the solution.
    let found = false;
    for (let y = 0; y < p.h && !found; y++) {
      for (let x = 0; x < p.w && !found; x++) {
        const i = y * p.w + x;
        if (x + 1 < p.w && !(sol[i] & BORDER(1))) {
          const bad = sol.slice();
          bad[i] |= BORDER(1);
          bad[i + 1] |= BORDER(3);
          const mistakes = palisadeGame.findMistakes?.({ ...s0, borders: bad }) ?? [];
          expect(mistakes.length).toBeGreaterThan(0);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it("flags a no-wall mark contradicting the solution", () => {
    const p = { w: 5, h: 5, k: 5 };
    const s0 = newState(p, newDesc(p, randomNew("palisade-mark")).desc);
    const sol = solveToBorders(p, s0.clues);
    if (!sol) return;
    // Find an interior edge that IS a wall in the solution; mark it no-wall.
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x + 1 < p.w; x++) {
        const i = y * p.w + x;
        if (sol[i] & BORDER(1)) {
          const bad = sol.slice();
          // remove the wall and assert a no-wall mark there
          bad[i] &= ~BORDER(1) & 0xff;
          bad[i] |= DISABLED(BORDER(1));
          const mistakes = palisadeGame.findMistakes?.({ ...s0, borders: bad }) ?? [];
          expect(mistakes.some((m) => m.x === x && m.y === y && m.dir === 1)).toBe(
            true,
          );
          return;
        }
      }
    }
  });
});

describe("palisade misc", () => {
  it("exposes the four presets", () => {
    const menu = palisadeGame.presets();
    expect(menu.submenu?.map((m) => m.params)).toEqual(PRESETS);
  });

  it("BORDER_MASK is the low nibble", () => {
    expect(BORDER_MASK).toBe(15);
    expect(bitcount(BORDER(0) | BORDER(2) | DISABLED(BORDER(1)))).toBe(2);
  });
});
