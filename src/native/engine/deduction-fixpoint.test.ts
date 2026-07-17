import { describe, expect, it } from "vitest";
import { type DeductionRung, runDeductionFixpoint } from "./deduction-fixpoint.ts";
import { StepBudgetExceeded, stepBudget } from "./step-budget.ts";

describe("runDeductionFixpoint", () => {
  it("returns the base grade when no rung ever fires", () => {
    const calls: number[] = [];
    const rungs: DeductionRung[] = [
      () => {
        calls.push(0);
        return 0;
      },
      () => {
        calls.push(1);
        return 0;
      },
    ];
    const res = runDeductionFixpoint({ rungs, baseGrade: 3 });
    expect(res).toEqual({ grade: 3, impossible: false });
    // One pass: both rungs tried once, none fired, loop ends.
    expect(calls).toEqual([0, 1]);
  });

  it("restarts from the first rung the moment any rung fires", () => {
    // Rung 0 fires twice then stops; rung 1 fires once then stops. Because the
    // ladder restarts from the top on every firing, rung 0 is re-tried before
    // rung 1 each time it has work left.
    let r0 = 2;
    let r1 = 1;
    const order: string[] = [];
    const rungs: DeductionRung[] = [
      () => {
        order.push("r0");
        if (r0 > 0) {
          r0--;
          return 1;
        }
        return 0;
      },
      () => {
        order.push("r1");
        if (r1 > 0) {
          r1--;
          return 1;
        }
        return 0;
      },
    ];
    const res = runDeductionFixpoint({ rungs });
    expect(res).toEqual({ grade: 1, impossible: false });
    // r0, r0 (each firing restarts before r1 is tried), then r0 miss → r1 fire,
    // then r0 miss → r1 miss → stop.
    expect(order).toEqual(["r0", "r0", "r0", "r1", "r0", "r1"]);
  });

  it("tracks the highest rung that fired as the grade", () => {
    let r2 = 1;
    const rungs: DeductionRung[] = [
      () => 0,
      () => 0,
      () => {
        if (r2 > 0) {
          r2--;
          return 1;
        }
        return 0;
      },
    ];
    const res = runDeductionFixpoint({ rungs });
    expect(res).toEqual({ grade: 2, impossible: false });
  });

  it("caps the ladder at maxRung — a higher rung is never attempted", () => {
    const tried: number[] = [];
    const rungs: DeductionRung[] = [
      () => {
        tried.push(0);
        return 0;
      },
      () => {
        tried.push(1);
        return 0;
      },
      () => {
        tried.push(2); // would fire, but is above the cap
        return 1;
      },
    ];
    const res = runDeductionFixpoint({ rungs, maxRung: 1 });
    expect(res).toEqual({ grade: 0, impossible: false });
    expect(tried).toEqual([0, 1]); // rung 2 never invoked
  });

  it("stops with impossible when a rung reports a contradiction", () => {
    const rungs: DeductionRung[] = [() => 0, () => -1, () => 1];
    const res = runDeductionFixpoint({ rungs });
    expect(res.impossible).toBe(true);
  });

  it("calls beforeRung once before every rung attempt", () => {
    const before: number[] = [];
    let fireOnce = true;
    const rungs: DeductionRung[] = [
      () => {
        if (fireOnce) {
          fireOnce = false;
          return 1;
        }
        return 0;
      },
      () => 0,
    ];
    runDeductionFixpoint({ rungs, beforeRung: (r) => before.push(r) });
    // Pass 1: beforeRung(0) then rung0 fires → restart. Pass 2: beforeRung(0),
    // rung0 misses, beforeRung(1), rung1 misses → stop.
    expect(before).toEqual([0, 0, 1]);
  });

  it("stops at the top of an iteration once solved() is true — no extra rung", () => {
    let steps = 2;
    const tried: number[] = [];
    const rungs: DeductionRung[] = [
      () => {
        tried.push(0);
        if (steps > 0) {
          steps--;
          return 1;
        }
        return 0;
      },
    ];
    runDeductionFixpoint({ rungs, solved: () => steps === 0 });
    // steps: 2 → rung fires → 1 → rung fires → 0 → solved() true at top, rung
    // not tried again.
    expect(tried).toEqual([0, 0]);
  });

  it("does not run any rung when the board is already solved", () => {
    let called = false;
    runDeductionFixpoint({
      rungs: [
        () => {
          called = true;
          return 1;
        },
      ],
      solved: () => true,
    });
    expect(called).toBe(false);
  });

  it("reaches the same verdict with and without a budget (recorder on/off)", () => {
    const build = (): DeductionRung[] => {
      let r0 = 3;
      let r1 = 2;
      return [() => (r0-- > 0 ? 1 : 0), () => (r1-- > 0 ? 1 : 0)];
    };
    const off = runDeductionFixpoint({ rungs: build() });
    const on = runDeductionFixpoint({
      rungs: build(),
      budget: stepBudget("test"),
    });
    expect(on).toEqual(off);
  });

  it("trips the step budget on a rung that reports progress without terminating", () => {
    const rungs: DeductionRung[] = [() => 1]; // always fires, never converges
    expect(() =>
      runDeductionFixpoint({ rungs, budget: stepBudget("runaway", 1000) }),
    ).toThrow(StepBudgetExceeded);
  });

  it("runs unguarded without a budget (generator path) — no throw on many iterations", () => {
    let n = 100_000;
    const rungs: DeductionRung[] = [() => (n-- > 0 ? 1 : 0)];
    expect(() => runDeductionFixpoint({ rungs })).not.toThrow();
  });
});
