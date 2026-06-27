/**
 * The Undead deductive ladder (`strengthen-undead-deduction`): unit tests for
 * each rung (arc-consistency → exact counting → depth-1 forcing) and the
 * guess-free generation property.
 *
 * The counting rung is path-independent, so it is exercised in isolation with a
 * synthetic paths-free `UndeadCommon` (arc-consistency is then a no-op, isolating
 * counting). The forcing rung and the no-guess boundary use real generated /
 * constructed boards. The property test confirms the generation gate: every
 * accepted board is solved by the ladder with **zero recursion**, at the rung its
 * tier demands.
 */
import { describe, expect, it } from "vitest";
import { newUndeadDesc } from "./generator.ts";
import {
  isUniquelySolvable,
  RUNG_ARC,
  RUNG_COUNTING,
  RUNG_FORCING,
  solveDeductive,
} from "./solver.ts";
import { randomNew } from "../../random/index.ts";
import {
  MON_GHOST,
  MON_NONE,
  MON_VAMPIRE,
  newState,
  type Difficulty,
  type UndeadCommon,
  type UndeadParams,
} from "./state.ts";

/** A synthetic monster-only `common` with no sightlines, so arc-consistency is a
 * pure no-op and only the counting rung can make progress. */
function paintByNumbers(numTotal: number, g: number, v: number, z: number): UndeadCommon {
  return {
    params: { w: 1, h: 1, diff: "easy" },
    w: 1,
    h: 1,
    wh: 9,
    numGhosts: g,
    numVampires: v,
    numZombies: z,
    numTotal,
    grid: new Int32Array(9),
    xinfo: new Int32Array(9),
    fixed: new Uint8Array(numTotal),
    paths: [],
    numPaths: 0,
  };
}

describe("undead counting rung", () => {
  it("a fully-placed type strikes itself and Hall-forces the rest", () => {
    // Two cells, one ghost one vampire (no zombies). Cell 0 is a given ghost.
    // Arc-consistency (no paths) cannot touch cell 1; counting must finish it:
    // ghost fully placed ⇒ strike ghost from cell 1; vampire's last candidate
    // cell ⇒ force it; zombie total 0 ⇒ strike zombie everywhere.
    const common = paintByNumbers(2, 1, 1, 0);
    const start = Uint8Array.from([MON_GHOST, MON_NONE]);

    const arc = solveDeductive(common, start, RUNG_ARC);
    expect(arc.solved).toBe(false); // arc alone is stuck

    const counting = solveDeductive(common, start, RUNG_COUNTING);
    expect(counting.solved).toBe(true);
    expect(counting.rung).toBe(RUNG_COUNTING);
    expect(Array.from(counting.guess)).toEqual([MON_GHOST, MON_VAMPIRE]);
  });

  it("a zero-total monster type is struck from every cell", () => {
    // Three cells, two ghosts one vampire, no zombies. Counting strikes zombie
    // everywhere (total 0) and pins the vampire once both ghosts are forced.
    const common = paintByNumbers(3, 2, 1, 0);
    const start = Uint8Array.from([MON_GHOST, MON_GHOST, MON_NONE]);
    const counting = solveDeductive(common, start, RUNG_COUNTING);
    expect(counting.solved).toBe(true);
    expect(Array.from(counting.guess)).toEqual([MON_GHOST, MON_GHOST, MON_VAMPIRE]);
  });
});

describe("undead forcing rung", () => {
  it("is required for a Tricky board (counting alone stalls, forcing finishes)", () => {
    const params: UndeadParams = { w: 5, h: 5, diff: "tricky" };
    const { desc } = newUndeadDesc(params, randomNew("undead-forcing-rung"));
    const common = newState(params, desc).common;
    const start = new Uint8Array(common.numTotal).fill(MON_NONE);

    // Arc + counting cannot finish a Tricky board…
    expect(solveDeductive(common, start, RUNG_COUNTING).solved).toBe(false);
    // …but the depth-1 forcing rung does, with no recursion.
    const forcing = solveDeductive(common, start, RUNG_FORCING);
    expect(forcing.solved).toBe(true);
    expect(forcing.rung).toBe(RUNG_FORCING);
  });
});

describe("undead deduction/recursion boundary", () => {
  it("leaves a genuinely ambiguous board unsolved rather than guessing", () => {
    // Two cells, one ghost one vampire, no clues: both completions (G,V) and
    // (V,G) are consistent, so depth-1 forcing finds no contradiction either
    // way. The ladder must NOT nest hypotheses to pick one — it leaves the board
    // unsolved (= recursion needed), and the board is genuinely non-unique.
    const common = paintByNumbers(2, 1, 1, 0);
    const start = new Uint8Array(2).fill(MON_NONE);
    const result = solveDeductive(common, start, RUNG_FORCING);
    expect(result.solved).toBe(false);
    expect(result.inconsistent).toBe(false);
    expect(isUniquelySolvable(common)).toBe(false);
  });
});

describe("undead guess-free generation property", () => {
  const tiers: [number, number, Difficulty][] = [
    [4, 4, "easy"],
    [4, 4, "normal"],
    [4, 4, "tricky"],
    [5, 5, "normal"],
    [5, 5, "tricky"],
  ];
  for (const [w, h, diff] of tiers) {
    it(
      `every accepted ${w}x${h} ${diff} board is solved by the ladder with no recursion`,
      () => {
        const params: UndeadParams = { w, h, diff };
        for (let i = 0; i < 5; i++) {
          const { desc } = newUndeadDesc(params, randomNew(`prop-${w}x${h}-${diff}-${i}`));
          const common = newState(params, desc).common;
          const start = new Uint8Array(common.numTotal).fill(MON_NONE);
          const grade = solveDeductive(common, start); // full ladder
          expect(grade.solved).toBe(true); // deductive, zero recursion
          expect(grade.inconsistent).toBe(false);
          if (diff === "easy") expect(grade.rung).toBe(RUNG_ARC);
          else if (diff === "normal")
            expect(grade.rung === RUNG_ARC || grade.rung === RUNG_COUNTING).toBe(true);
          else expect(grade.rung).toBe(RUNG_FORCING);
          // Independently unique.
          expect(isUniquelySolvable(common)).toBe(true);
        }
      },
      30_000,
    );
  }
});
