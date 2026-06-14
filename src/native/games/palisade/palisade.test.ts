import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { randomNew } from "../../random/index.ts";
import { divvyRectangle } from "./divvy.ts";
import { palisadeGame } from "./index.ts";
import { deduceForcedEdges, newDesc, solver, solveToBorders } from "./solver.ts";
import {
  BORDER,
  BORDER_MASK,
  bitcount,
  buildDsf,
  DISABLED,
  DX,
  DY,
  decodeParams,
  encodeDesc,
  encodeParams,
  FLIP,
  initBorders,
  isSolved,
  newState,
  type PalisadeHint,
  type PalisadeMove,
  type PalisadeParams,
  type PalisadeState,
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
  it("generates uniquely solvable boards across presets", () => {
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
  }, 30000);

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

describe("palisade win flash", () => {
  const base = (over: Partial<PalisadeState>): PalisadeState => ({
    w: 5,
    h: 5,
    k: 5,
    clues: new Int8Array(25).fill(-1),
    borders: new Uint8Array(25),
    completed: false,
    cheated: false,
    ...over,
  });
  const flash = (oldOver: Partial<PalisadeState>, newOver: Partial<PalisadeState>) =>
    palisadeGame.flashLength?.(base(oldOver), base(newOver), 0, {
      x: 1,
      y: 1,
      show: false,
    });

  it("fires on a fresh manual completion", () => {
    expect(flash({ completed: false }, { completed: true })).toBeGreaterThan(0);
  });

  it("does not fire on the Solve command (cheated flips this move)", () => {
    expect(
      flash({ completed: false, cheated: false }, { completed: true, cheated: true }),
    ).toBe(0);
  });

  it("fires again on a manual re-completion after a prior Solve", () => {
    // cheated already true from the earlier Solve; this move completes by hand.
    expect(
      flash({ completed: false, cheated: true }, { completed: true, cheated: true }),
    ).toBeGreaterThan(0);
  });

  it("does not fire when a move breaks a solved board", () => {
    expect(flash({ completed: true }, { completed: false })).toBe(0);
  });

  it("un-sticks completed: breaking a solved board reverts to unsolved", () => {
    const p = { w: 5, h: 5, k: 5 };
    const s0 = newState(p, newDesc(p, randomNew("palisade-unstick")).desc);
    const sol = solveToBorders(p, s0.clues);
    if (!sol) return;
    const solved = { ...s0, borders: sol.slice(), completed: true, cheated: true };
    // Remove an interior wall → no longer a valid division → completed false.
    let broke = false;
    for (let y = 0; y < p.h && !broke; y++) {
      for (let x = 0; x + 1 < p.w && !broke; x++) {
        const i = y * p.w + x;
        if (sol[i] & BORDER(1)) {
          const next = palisadeGame.executeMove(solved, {
            type: "edges",
            edits: [
              { x, y, flag: BORDER(1) },
              { x: x + 1, y, flag: BORDER(3) },
            ],
          });
          expect(next.completed).toBe(false); // un-stuck
          expect(next.cheated).toBe(true); // cheat record preserved
          broke = true;
        }
      }
    }
    expect(broke).toBe(true);
  });
});

describe("palisade hint", () => {
  const P = { w: 5, h: 5, k: 5 };
  const hlOf = (step: HintStep<PalisadeMove>): PalisadeHint =>
    step.highlights as PalisadeHint;
  const physicalEdge = (
    h: { x: number; y: number; dir: number },
    w: number,
  ): number => {
    const i = h.y * w + h.x;
    const j = i + DY[h.dir] * w + DX[h.dir];
    const lo = Math.min(i, j);
    return lo * 2 + (Math.max(i, j) - lo === 1 ? 0 : 1);
  };

  it("deduces a chain whose moves solve the board", () => {
    const s0 = newState(P, newDesc(P, randomNew("palisade-hint-chain")).desc);
    const r = palisadeGame.hint?.(s0);
    expect(r?.ok).toBe(true);
    if (!r?.ok) return;
    expect(r.steps.length).toBeGreaterThan(0);

    let s = s0;
    for (const step of r.steps) s = palisadeGame.executeMove(s, step.move);
    expect(s.completed).toBe(true);
  });

  it("records de-duplicated interior edges (rim-seeded)", () => {
    const s0 = newState(P, newDesc(P, randomNew("palisade-hint-rec")).desc);
    const forced = deduceForcedEdges(P, s0.clues, s0.borders);
    expect(forced.length).toBeGreaterThan(0);
    const ids = forced.map((e) => physicalEdge(e, P.w));
    // No physical edge appears twice (the dedup pass) and every edge is
    // interior (its neighbour is on the grid).
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of forced) {
      const nx = e.x + DX[e.dir];
      const ny = e.y + DY[e.dir];
      expect(nx >= 0 && nx < P.w && ny >= 0 && ny < P.h).toBe(true);
    }
  });

  it("captures referenced cells (and siblings) for highlighting", () => {
    const s0 = newState(P, newDesc(P, randomNew("palisade-hint-ctx")).desc);
    const forced = deduceForcedEdges(P, s0.clues, s0.borders);
    // Clue-pair / region deductions name cells; equivalentEdges names a
    // sibling edge. The fresh-board opener is a clue-vs-region wall, so at
    // least one forced edge carries a non-empty `cells` reference.
    expect(forced.some((e) => (e.cells?.length ?? 0) > 0)).toBe(true);
    const cvr = forced.find((e) => e.rule === "cluesVersusRegionSize");
    if (cvr) {
      // The two named cells are the two adjacent clues sharing the wall.
      expect(cvr.cells).toHaveLength(2);
      for (const i of cvr.cells ?? []) expect(s0.clues[i]).not.toBe(-1);
    }
  });

  it("does not re-hint an edge the player already marked no-wall", () => {
    const s0 = newState(P, newDesc(P, randomNew("palisade-hint-mark")).desc);
    const r = palisadeGame.hint?.(s0);
    if (!r?.ok) return;
    const nowall = r.steps.find((s) => hlOf(s).kind === "nowall");
    expect(nowall).toBeDefined();
    if (!nowall) return;
    const target = physicalEdge(hlOf(nowall), P.w);

    const s1 = palisadeGame.executeMove(s0, nowall.move);
    const r2 = palisadeGame.hint?.(s1);
    expect(r2?.ok).toBe(true);
    if (!r2?.ok) return;
    expect(r2.steps.some((s) => physicalEdge(hlOf(s), P.w) === target)).toBe(false);
  });

  it("refuses on an already-solved board", () => {
    const s0 = newState(P, newDesc(P, randomNew("palisade-hint-solved")).desc);
    const sol = solveToBorders(P, s0.clues);
    if (!sol) return;
    const solved: PalisadeState = { ...s0, borders: sol.slice(), completed: true };
    const r = palisadeGame.hint?.(solved);
    expect(r?.ok).toBe(false);
  });

  it("refuses when the board carries a wall the solution lacks", () => {
    const s0 = newState(P, newDesc(P, randomNew("palisade-hint-bad")).desc);
    const sol = solveToBorders(P, s0.clues);
    if (!sol) return;
    // Draw a wall on an interior edge the solution does not have.
    for (let y = 0; y < P.h; y++) {
      for (let x = 0; x + 1 < P.w; x++) {
        const i = y * P.w + x;
        if (!(sol[i] & BORDER(1))) {
          const bad = s0.borders.slice();
          bad[i] |= BORDER(1);
          bad[i + 1] |= BORDER(3);
          const r = palisadeGame.hint?.({ ...s0, borders: bad });
          expect(r?.ok).toBe(false);
          return;
        }
      }
    }
  });

  it("hintKeepTrack completes on the hinted edit and rejects the wrong one", () => {
    const s0 = newState(P, newDesc(P, randomNew("palisade-hint-track")).desc);
    const r = palisadeGame.hint?.(s0);
    if (!r?.ok) return;
    const step = r.steps[0];
    const hl = hlOf(step);

    // The exact hinted edit completes the step.
    expect(palisadeGame.hintKeepTrack?.(step.move, step, s0)).toBe("completed");

    // The wrong button on the same edge (other bit) deviates.
    const wrongFlag = hl.kind === "wall" ? DISABLED(BORDER(hl.dir)) : BORDER(hl.dir);
    const wrong: PalisadeMove = {
      type: "edges",
      edits: [{ x: hl.x, y: hl.y, flag: wrongFlag }],
    };
    expect(palisadeGame.hintKeepTrack?.(wrong, step, s0)).toBe("off");

    // An edit on an unrelated edge deviates.
    const other: PalisadeMove = {
      type: "edges",
      edits: [{ x: hl.x === 0 ? P.w - 1 : 0, y: hl.y, flag: BORDER(FLIP(hl.dir)) }],
    };
    expect(palisadeGame.hintKeepTrack?.(other, step, s0)).toBe("off");
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
