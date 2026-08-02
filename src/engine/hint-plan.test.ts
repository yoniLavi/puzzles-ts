import { describe, expect, it } from "vitest";
import { deduceHintPlan } from "./hint-plan.ts";
import { StepBudgetExceeded, stepBudget } from "./step-budget.ts";

/**
 * A toy board: a run of cells, each `null` until decided. The "deduction"
 * decides the leftmost undecided cell. Enough to pin the loop's contract
 * without any game's semantics.
 */
type Toy = (string | null)[];
type ToyStatus = "done" | "unfinished";

const status = (b: Toy): ToyStatus =>
  b.every((c) => c !== null) ? "done" : "unfinished";

const nextCell = (b: Toy): number | null => {
  const i = b.indexOf(null);
  return i === -1 ? null : i;
};

const spec = (
  board: Toy,
  over: Partial<Parameters<typeof deduceHintPlan>[0]> = {},
) => ({
  board,
  status,
  incomplete: "unfinished" as ToyStatus,
  next: nextCell,
  apply: (b: Toy, i: number) => {
    b[i] = "x";
  },
  ...over,
});

describe("deduceHintPlan", () => {
  it("deduces to completion and reports the reached status", () => {
    const board: Toy = [null, null, null];
    const { status: st, plan } = deduceHintPlan(spec(board));
    expect(plan).toEqual([0, 1, 2]);
    expect(st).toBe("done");
  });

  it("stops as soon as the status leaves `incomplete`, before asking for a firing", () => {
    let asked = 0;
    const { status: st, plan } = deduceHintPlan({
      board: ["x"] as Toy,
      status,
      incomplete: "unfinished" as ToyStatus,
      next: (b: Toy) => {
        asked++;
        return nextCell(b);
      },
      apply: () => {},
    });
    expect(plan).toEqual([]);
    expect(st).toBe("done");
    expect(asked).toBe(0);
  });

  it("stops when `next` returns null, reporting the board still incomplete", () => {
    const board: Toy = [null, null];
    const { status: st, plan } = deduceHintPlan(spec(board, { next: () => null }));
    expect(plan).toEqual([]);
    expect(st).toBe("unfinished");
  });

  it("honours the plan cap, and reports `incomplete` rather than the capped board's status", () => {
    // Deliberately a board the loop *could* finish: the cap must win, and the
    // reported status must not claim the plan ran to completion.
    const board: Toy = [null, null, null, null, null];
    const { status: st, plan } = deduceHintPlan(spec(board, { planCap: 2 }));
    expect(plan).toEqual([0, 1]);
    expect(st).toBe("unfinished");
  });

  it("ticks the budget once per iteration, so a non-advancing rule throws instead of hanging", () => {
    const board: Toy = [null];
    expect(() =>
      deduceHintPlan(
        spec(board, {
          // The classic regression: a rung reports a firing but changes nothing.
          apply: () => {},
          budget: stepBudget("toy", 50),
        }),
      ),
    ).toThrow(StepBudgetExceeded);
  });

  it("mutates only the working board it was handed", () => {
    // The caller owns the clone; the helper must not reach past `board`.
    const original: Toy = [null, null];
    const working = [...original];
    deduceHintPlan(spec(working));
    expect(original).toEqual([null, null]);
    expect(working).toEqual(["x", "x"]);
  });

  it("skips `apply` when the rungs apply as they detect", () => {
    // Subsets' shape: `next` writes the deduction itself.
    const board: Toy = [null, null];
    const { plan } = deduceHintPlan({
      board,
      status,
      incomplete: "unfinished" as ToyStatus,
      next: (b: Toy) => {
        const i = nextCell(b);
        if (i === null) return null;
        b[i] = "self-applied";
        return i;
      },
    });
    expect(plan).toEqual([0, 1]);
    expect(board).toEqual(["self-applied", "self-applied"]);
  });
});
