/**
 * The difficulty contract's shared helpers, exercised against synthetic solvers
 * and the fake `Game` double — before any real game's adapter depends on them.
 *
 * The helpers take a `CappedSolve` closure rather than a `Game`, so a synthetic
 * solver *is* the natural unit under test: these tests can state exactly which
 * caps solve, which is impossible to arrange with a real generator.
 */
import { describe, expect, it } from "vitest";
import {
  type CappedSolve,
  cappedSolveFor,
  type DifficultyContract,
  type DifficultyVerdict,
  lowestSolvingCap,
  solvableAtExactlyTier,
  tierNames,
} from "./difficulty.ts";
import { type FakeParams, fakeGame } from "./fake-game.ts";

/** A solver that solves at exactly the listed caps, recording every call. */
function solverOver(solvingCaps: readonly number[]): CappedSolve & { calls: number[] } {
  const calls: number[] = [];
  const solve = (cap: number): DifficultyVerdict => {
    calls.push(cap);
    return solvingCaps.includes(cap) ? "solved" : "unsolved";
  };
  return Object.assign(solve, { calls });
}

describe("solvableAtExactlyTier", () => {
  it("accepts a board that needs its tier and no less", () => {
    // Solves at Tricky (2) and Hard (3), not below: Tricky is exactly its tier.
    expect(solvableAtExactlyTier(solverOver([2, 3]), 2)).toBe(true);
  });

  it("rejects a board the tier below already solves", () => {
    // The defect `grade-difficulty-tiers-honestly` fixed four times: a board
    // offered as Extreme that a Normal solver cracks is a Normal board wearing
    // a label.
    expect(solvableAtExactlyTier(solverOver([1, 2, 3]), 2)).toBe(false);
  });

  it("rejects a board its own tier cannot solve", () => {
    expect(solvableAtExactlyTier(solverOver([3]), 2)).toBe(false);
  });

  it("means 'solvable at all' on the easiest tier, which has nothing below it", () => {
    expect(solvableAtExactlyTier(solverOver([0, 1]), 0)).toBe(true);
    expect(solvableAtExactlyTier(solverOver([1]), 0)).toBe(false);
  });

  it("asks the cheap question first and short-circuits a too-easy board", () => {
    // THE LOAD-BEARING ORDERING, not an incidental one. A generator retries in a
    // loop and rejects far more candidates than it accepts, so the common path
    // is the rejection — and paying for the deep solve before discovering the
    // easy ladder already cracked the board is pure waste.
    // `add-clusters-difficulty-tiers` (D3) measured this ordering making the
    // whole generator faster than it had been before it had tiers.
    //
    // Asserted on call ORDER, not on a timing: a test that asserted only the
    // boolean would pass with the expensive solve run first and this property
    // silently gone.
    const easyEnough = solverOver([1, 2, 3]);
    expect(solvableAtExactlyTier(easyEnough, 2)).toBe(false);
    expect(easyEnough.calls).toEqual([1]); // never asked cap 2 at all

    const needsIt = solverOver([2, 3]);
    expect(solvableAtExactlyTier(needsIt, 2)).toBe(true);
    expect(needsIt.calls).toEqual([1, 2]); // cheap first, then the real question
  });

  it("treats an impossible board as not solvable at that tier", () => {
    const impossible: CappedSolve = () => "impossible";
    expect(solvableAtExactlyTier(impossible, 0)).toBe(false);
    expect(solvableAtExactlyTier(impossible, 2)).toBe(false);
  });
});

describe("lowestSolvingCap", () => {
  it("finds the lowest cap that solves", () => {
    expect(lowestSolvingCap(solverOver([2, 3]), 4)).toBe(2);
    expect(lowestSolvingCap(solverOver([0, 1, 2, 3]), 4)).toBe(0);
  });

  it("is null when no cap in range solves", () => {
    expect(lowestSolvingCap(solverOver([]), 4)).toBeNull();
    // A cap outside the declared tier range is not reachable by a player, so it
    // does not count as solvable.
    expect(lowestSolvingCap(solverOver([9]), 4)).toBeNull();
  });

  it("stops at the first success rather than scanning every cap", () => {
    const s = solverOver([1, 2, 3]);
    expect(lowestSolvingCap(s, 4)).toBe(1);
    expect(s.calls).toEqual([0, 1]);
  });
});

describe("the contract over the fake game", () => {
  // The fake `Game` has no difficulty of its own, which is the point: a
  // contract can be laid over any params type, and these assertions are about
  // the contract's own rules (purity, index round-tripping) rather than about
  // any real game's tier semantics.
  // The tier *names* are not the contract's to hold — they come off the game's
  // custom-params form (`difficultyTiers`), which the fake game has none of.
  // Only their count matters to the assertions below.
  const TIERS = 3;
  const contract: DifficultyContract<FakeParams> = {
    tierOf: (p) => Math.min(p.target, TIERS - 1),
    withTier: (p, tier) => ({ ...p, target: tier }),
    solveAtCap: (_p, desc, cap) => (cap >= desc.length ? "solved" : "unsolved"),
  };

  it("round-trips every declared tier through withTier/tierOf", () => {
    const p = fakeGame.defaultParams();
    for (let tier = 0; tier < TIERS; tier++) {
      expect(contract.tierOf(contract.withTier(p, tier))).toBe(tier);
    }
  });

  it("withTier is pure — the source params are never mutated", () => {
    const p = fakeGame.defaultParams();
    const before = { ...p };
    contract.withTier(p, 2);
    expect(p).toEqual(before);
  });

  it("cappedSolveFor binds one board and leaves the cap free", () => {
    const solve = cappedSolveFor(contract, fakeGame.defaultParams(), "ab");
    expect(solve(1)).toBe("unsolved");
    expect(solve(2)).toBe("solved");
    expect(lowestSolvingCap(solve, 3)).toBe(2);
  });
});

describe("the conventional tier names", () => {
  // The whole table in one place, so a reader can see what the collection's
  // menus say without running 29 games. `adopt-conventional-tier-names`.
  it.each([
    [2, false, ["Easy", "Normal"]],
    [3, false, ["Easy", "Normal", "Tricky"]],
    [4, false, ["Easy", "Normal", "Tricky", "Hard"]],
    [5, false, ["Easy", "Normal", "Tricky", "Hard", "Extreme"]],
    [2, true, ["Easy", "Unreasonable"]],
    [3, true, ["Easy", "Normal", "Unreasonable"]],
    [4, true, ["Easy", "Normal", "Tricky", "Unreasonable"]],
    [5, true, ["Easy", "Normal", "Tricky", "Hard", "Unreasonable"]],
    [6, true, ["Easy", "Normal", "Tricky", "Hard", "Extreme", "Unreasonable"]],
  ])("%i tiers, search=%s", (count, search, expected) => {
    expect(tierNames(count, { search })).toEqual(expected);
  });

  it("names the same rung the same word at every length", () => {
    // The property the convention exists for: a name's position is fixed across
    // the collection, so "Tricky" means the third rung in a four-tier game and
    // in a five-tier one alike. Stated as an invariant rather than left implied
    // by the table above, because the table would still pass if someone made
    // the scale depend on the count.
    for (let count = 3; count <= 5; count++) {
      expect(tierNames(count).slice(0, count - 1)).toEqual(tierNames(count - 1));
    }
  });

  it("refuses a count the scale cannot name, rather than returning a short list", () => {
    // A truncated list would give a game fewer names than tiers, and every
    // cross-game guard iterates the names — so the shortfall would show up as a
    // guard quietly covering fewer tiers, not as an error.
    expect(() => tierNames(6)).toThrow(RangeError);
    expect(() => tierNames(7, { search: true })).toThrow(RangeError);
    expect(() => tierNames(1)).toThrow(RangeError);
    expect(() => tierNames(2.5)).toThrow(RangeError);
  });

  it("never hands out Unreasonable by position", () => {
    // The word is a promise `features.md` makes to players, reserved by the
    // `ts-engine` spec for a tier whose boards can require Search. A game that
    // does not declare one must not be able to acquire the name by growing.
    for (let count = 2; count <= 5; count++) {
      expect(tierNames(count)).not.toContain("Unreasonable");
    }
  });
});
