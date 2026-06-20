import { describe, expect, it } from "vitest";
import { StepBudgetExceeded, stepBudget } from "./step-budget.ts";

describe("stepBudget", () => {
  it("permits exactly `limit` ticks, then throws", () => {
    const b = stepBudget("test", 3);
    expect(() => {
      b.tick();
      b.tick();
      b.tick();
    }).not.toThrow();
    expect(() => b.tick()).toThrow(StepBudgetExceeded);
  });

  it("labels the failure and names a likely cause", () => {
    const b = stepBudget("range hint", 1);
    b.tick();
    expect(() => b.tick()).toThrow(/range hint/);
    expect(() => stepBudget("x", 0).tick()).toThrow(/without changing the board/);
  });

  it("turns a non-terminating fixpoint into a prompt failure, not a hang", () => {
    // The scenario the budget exists for: a deduction loop that never makes
    // real progress. Without the budget this `while (true)` would spin forever;
    // with it, it throws after a bounded number of iterations.
    const b = stepBudget("loopy deduction", 10_000);
    let iterations = 0;
    expect(() => {
      while (true) {
        b.tick();
        iterations++;
        // (no progress — deliberately)
      }
    }).toThrow(StepBudgetExceeded);
    expect(iterations).toBe(10_000);
  });
});
