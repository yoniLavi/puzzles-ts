import { describe, expect, it } from "vitest";
import { type DeductionTechnique, runDeductionFixpoint } from "./deduction-fixpoint.ts";
import { StepBudgetExceeded, stepBudget } from "./step-budget.ts";

/** A technique whose tier is its position — the shape every ladder had before
 * tiers were declarable, and the baseline the tier-specific tests below vary
 * from. Keeping it as a helper means a test that says `tier` means it. */
const rung = (index: number, run: () => number): DeductionTechnique => ({
  id: `rung-${index}`,
  tier: index,
  run,
});

describe("runDeductionFixpoint", () => {
  it("returns the base grade when no technique ever fires", () => {
    const calls: number[] = [];
    const techniques = [
      rung(0, () => {
        calls.push(0);
        return 0;
      }),
      rung(1, () => {
        calls.push(1);
        return 0;
      }),
    ];
    const res = runDeductionFixpoint({ techniques, baseGrade: 3 });
    expect(res).toEqual({ grade: 3, impossible: false });
    // One pass: both techniques tried once, none fired, loop ends.
    expect(calls).toEqual([0, 1]);
  });

  it("restarts from the first technique the moment any technique fires", () => {
    // Technique 0 fires twice then stops; technique 1 fires once then stops.
    // Because the ladder restarts from the top on every firing, technique 0 is
    // re-tried before technique 1 each time it has work left.
    let r0 = 2;
    let r1 = 1;
    const order: string[] = [];
    const techniques = [
      rung(0, () => {
        order.push("r0");
        if (r0 > 0) {
          r0--;
          return 1;
        }
        return 0;
      }),
      rung(1, () => {
        order.push("r1");
        if (r1 > 0) {
          r1--;
          return 1;
        }
        return 0;
      }),
    ];
    const res = runDeductionFixpoint({ techniques });
    expect(res).toEqual({ grade: 1, impossible: false });
    // r0, r0 (each firing restarts before r1 is tried), then r0 miss → r1 fire,
    // then r0 miss → r1 miss → stop.
    expect(order).toEqual(["r0", "r0", "r0", "r1", "r0", "r1"]);
  });

  it("tracks the highest tier that fired as the grade", () => {
    let r2 = 1;
    const techniques = [
      rung(0, () => 0),
      rung(1, () => 0),
      rung(2, () => {
        if (r2 > 0) {
          r2--;
          return 1;
        }
        return 0;
      }),
    ];
    const res = runDeductionFixpoint({ techniques });
    expect(res).toEqual({ grade: 2, impossible: false });
  });

  it("never lets the grade regress when a hard technique unlocks an easier one", () => {
    // The load-bearing case for taking the *maximum* tier, and the one the test
    // above cannot see: it fires the hard technique *last*, so "grade = the tier
    // that just fired" would score it identically. Here technique 2 fires first
    // and then unlocks work for technique 0 — which is the normal shape, since
    // the ladder restarts from the top after every firing. Without the max, the
    // reported grade would be the *last* tier that fired rather than the
    // highest, and that grade is what a solver-gated generator accepts a board's
    // difficulty on.
    //
    // Found by the mutation audit (`audit-test-suite-strength`): with this
    // assertion absent, `grade = r` survived this file, `latin.test.ts` and all
    // four consumer game directories, and was killed only by the full suite.
    let r2 = 1;
    let r0 = 0;
    const techniques = [
      rung(0, () => (r0-- > 0 ? 1 : 0)),
      rung(1, () => 0),
      rung(2, () => {
        if (r2-- > 0) {
          r0 = 2; // the hard deduction leaves easy work behind
          return 1;
        }
        return 0;
      }),
    ];
    expect(runDeductionFixpoint({ techniques })).toEqual({
      grade: 2,
      impossible: false,
    });
  });

  it("keeps baseGrade as a floor even when a lower tier fires", () => {
    // `baseGrade` is the difficulty floor (`latinSolverTop` passes `diffSimple`),
    // not merely the nothing-fired default — a technique below it firing must
    // not grade the board easier than the floor.
    let once = 1;
    const techniques = [rung(0, () => (once-- > 0 ? 1 : 0)), rung(1, () => 0)];
    expect(runDeductionFixpoint({ techniques, baseGrade: 3 })).toEqual({
      grade: 3,
      impossible: false,
    });
  });

  it("stops with impossible when a technique reports a contradiction", () => {
    const techniques = [rung(0, () => 0), rung(1, () => -1), rung(2, () => 1)];
    const res = runDeductionFixpoint({ techniques });
    expect(res.impossible).toBe(true);
  });

  it("calls beforeTechnique once before every technique attempt", () => {
    const before: string[] = [];
    let fireOnce = true;
    const techniques = [
      rung(0, () => {
        if (fireOnce) {
          fireOnce = false;
          return 1;
        }
        return 0;
      }),
      rung(1, () => 0),
    ];
    runDeductionFixpoint({ techniques, beforeTechnique: (t) => before.push(t.id) });
    // Pass 1: beforeTechnique(0) then technique 0 fires → restart. Pass 2:
    // beforeTechnique(0), miss, beforeTechnique(1), miss → stop.
    expect(before).toEqual(["rung-0", "rung-0", "rung-1"]);
  });

  it("stops at the top of an iteration once solved() is true — no extra attempt", () => {
    let steps = 2;
    const tried: number[] = [];
    const techniques = [
      rung(0, () => {
        tried.push(0);
        if (steps > 0) {
          steps--;
          return 1;
        }
        return 0;
      }),
    ];
    runDeductionFixpoint({ techniques, solved: () => steps === 0 });
    // steps: 2 → fires → 1 → fires → 0 → solved() true at top, not tried again.
    expect(tried).toEqual([0, 0]);
  });

  it("does not run any technique when the board is already solved", () => {
    let called = false;
    runDeductionFixpoint({
      techniques: [
        rung(0, () => {
          called = true;
          return 1;
        }),
      ],
      solved: () => true,
    });
    expect(called).toBe(false);
  });

  it("reaches the same verdict with and without a budget (recorder on/off)", () => {
    const build = (): DeductionTechnique[] => {
      let r0 = 3;
      let r1 = 2;
      return [rung(0, () => (r0-- > 0 ? 1 : 0)), rung(1, () => (r1-- > 0 ? 1 : 0))];
    };
    const off = runDeductionFixpoint({ techniques: build() });
    const on = runDeductionFixpoint({
      techniques: build(),
      budget: stepBudget("test"),
    });
    expect(on).toEqual(off);
  });

  it("trips the step budget on a technique that progresses without terminating", () => {
    const techniques = [rung(0, () => 1)]; // always fires, never converges
    expect(() =>
      runDeductionFixpoint({ techniques, budget: stepBudget("runaway", 1000) }),
    ).toThrow(StepBudgetExceeded);
  });

  it("runs unguarded without a budget (generator path) — no throw on many iterations", () => {
    let n = 100_000;
    const techniques = [rung(0, () => (n-- > 0 ? 1 : 0))];
    expect(() => runDeductionFixpoint({ techniques })).not.toThrow();
  });

  // --- tiers are declared, never positions -------------------------------
  //
  // The three tests below are the whole point of `declare-deduction-techniques`.
  // Each was proved to fail against the previous index-based runner before being
  // trusted (AGENTS.md, "Prove a new guard fails before trusting it"): regrading
  // by index reddens the first, re-capping by index reddens the second and
  // third.

  describe("tiers", () => {
    it("grades two techniques sharing one tier alike", () => {
      // Unruly's exact shape: five techniques, three tiers. Only the *second*
      // Trivial technique fires, and it must still grade Trivial — under
      // index-grading it would grade 1, promoting an easy board to Easy and
      // changing which boards a solver-gated generator accepts.
      let once = 1;
      const techniques: DeductionTechnique[] = [
        { id: "threes", tier: 0, run: () => 0 },
        { id: "single-gap", tier: 0, run: () => (once-- > 0 ? 1 : 0) },
        { id: "complete-nums", tier: 1, run: () => 0 },
      ];
      expect(runDeductionFixpoint({ techniques, baseGrade: -1 })).toEqual({
        grade: 0,
        impossible: false,
      });
    });

    it("caps by tier — a higher tier is never attempted", () => {
      const tried: string[] = [];
      /** Note the attempt, then report `ret`. */
      const noting = (id: string, ret: number) => (): number => {
        tried.push(id);
        return ret;
      };
      const techniques: DeductionTechnique[] = [
        { id: "a", tier: 0, run: noting("a", 0) },
        { id: "b", tier: 1, run: noting("b", 0) },
        { id: "c", tier: 2, run: noting("c", 1) }, // would fire
      ];
      const res = runDeductionFixpoint({ techniques, maxTier: 1 });
      expect(res).toEqual({ grade: 0, impossible: false });
      expect(tried).toEqual(["a", "b"]); // the tier-2 technique never invoked
    });

    it("keeps a cheap technique that sits after an expensive one under a low cap", () => {
      // A ladder whose tiers are not monotonically increasing — Loopy's shape,
      // where `loopDeductions` is an Easy technique deliberately placed last. An
      // index cap truncates it away with the Hard technique it happens to follow;
      // a tier cap keeps it, which is the honest reading of "this technique
      // belongs to Easy". Nothing in the tree relies on this yet; the rule is
      // asserted so a future ladder is not silently shortened.
      //
      // `hard` is bounded rather than always-firing so that a runner capping by
      // *index* — the mutant this test exists to catch — fails on the assertion
      // instead of spinning forever. A guard that hangs is not a guard.
      const tried: string[] = [];
      /** Note the attempt, then fire `budget` times before going quiet. */
      const noting = (id: string, budget: number) => (): number => {
        tried.push(id);
        return budget-- > 0 ? 1 : 0;
      };
      const techniques: DeductionTechnique[] = [
        { id: "trivial", tier: 0, run: noting("trivial", 0) },
        { id: "hard", tier: 2, run: noting("hard", 1) },
        { id: "loop", tier: 0, run: noting("loop", 1) },
      ];
      const res = runDeductionFixpoint({ techniques, maxTier: 1 });
      expect(res).toEqual({ grade: 0, impossible: false });
      // "hard" is skipped every pass; "loop" still runs, fires once, and the
      // restart re-tries "trivial" before it.
      expect(tried).toEqual(["trivial", "loop", "trivial", "loop"]);
    });
  });

  // --- the budget names the technique responsible ------------------------

  describe("non-termination attribution", () => {
    it("names the runaway technique by firing count", () => {
      const techniques: DeductionTechnique[] = [
        { id: "honest", tier: 0, run: () => 0 },
        { id: "liar", tier: 0, run: () => 1 }, // always "fires", never converges
      ];
      let thrown: unknown;
      try {
        runDeductionFixpoint({ techniques, budget: stepBudget("runaway", 50) });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(StepBudgetExceeded);
      const { message } = thrown as StepBudgetExceeded;
      // The original diagnosis survives...
      expect(message).toContain("did not terminate");
      // ...and now answers its own question.
      expect(message).toContain("Techniques by firings: liar ×50");
      expect(message).not.toContain("honest");
    });

    it("orders the tally most-fired first, so the liar leads", () => {
      let honest = 3;
      const techniques: DeductionTechnique[] = [
        { id: "honest", tier: 0, run: () => (honest-- > 0 ? 1 : 0) },
        { id: "liar", tier: 0, run: () => 1 },
      ];
      let message = "";
      try {
        runDeductionFixpoint({ techniques, budget: stepBudget("runaway", 40) });
      } catch (e) {
        message = (e as StepBudgetExceeded).message;
      }
      expect(message).toMatch(/Techniques by firings: liar ×\d+, honest ×3\./);
    });

    it("counts nothing without a budget — the generator path is untouched", () => {
      // The attribution map is allocated only when a budget is passed. Asserted
      // through the one observable the runner has: an unbudgeted run of the same
      // ladder must behave identically, including throwing nothing to augment.
      let n = 10;
      const techniques: DeductionTechnique[] = [
        { id: "counted-nowhere", tier: 0, run: () => (n-- > 0 ? 1 : 0) },
      ];
      expect(runDeductionFixpoint({ techniques })).toEqual({
        grade: 0,
        impossible: false,
      });
    });

    it("passes a non-budget error through unchanged", () => {
      const boom = new Error("technique blew up");
      const techniques: DeductionTechnique[] = [
        {
          id: "explodes",
          tier: 0,
          run: () => {
            throw boom;
          },
        },
      ];
      expect(() =>
        runDeductionFixpoint({ techniques, budget: stepBudget("x") }),
      ).toThrow(boom);
    });
  });
});
