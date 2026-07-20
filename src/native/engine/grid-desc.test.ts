import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import { gridNew } from "./grid.ts";
import { gridNewDesc, gridValidateDesc } from "./grid-desc.ts";
import { PERIODIC_GRID_TYPES } from "./grid-tilings.ts";

const DESCLESS = PERIODIC_GRID_TYPES.filter((t) => t !== "triangular");

describe("gridNewDesc", () => {
  it("returns the version flag for triangular", () => {
    expect(gridNewDesc("triangular", 5, 5, randomNew("seed"))).toBe("0");
  });

  it("returns null for every other periodic tiling", () => {
    for (const type of DESCLESS) {
      expect(gridNewDesc(type, 5, 5, randomNew("seed"))).toBeNull();
    }
  });

  it("consumes no randomness for the periodic tilings", () => {
    // The contract is that `gridNewDesc` is the *only* RNG-bearing entry point;
    // the corollary is that for a tiling needing no description it must not
    // touch the stream at all, or it would shift every later draw a caller
    // makes from the same state.
    const rng = randomNew("seed");
    const before = JSON.stringify(rng);
    for (const type of PERIODIC_GRID_TYPES) gridNewDesc(type, 5, 5, rng);
    expect(JSON.stringify(rng)).toBe(before);
  });
});

describe("gridValidateDesc", () => {
  it("accepts both of triangular's version flags", () => {
    // Absent is upstream's legacy ragged-ear algorithm, and stays legal
    // permanently because old shared game IDs carry it.
    expect(gridValidateDesc("triangular", 5, 5, null)).toBeNull();
    expect(gridValidateDesc("triangular", 5, 5, "0")).toBeNull();
  });

  it("rejects any other triangular description", () => {
    for (const desc of ["1", "", "00", "x"]) {
      expect(gridValidateDesc("triangular", 5, 5, desc)).not.toBeNull();
    }
  });

  it("rejects a description supplied to a tiling that takes none", () => {
    for (const type of DESCLESS) {
      expect(gridValidateDesc(type, 5, 5, null)).toBeNull();
      expect(gridValidateDesc(type, 5, 5, "0")).not.toBeNull();
    }
  });

  it("round-trips what gridNewDesc produces", () => {
    for (const type of PERIODIC_GRID_TYPES) {
      const desc = gridNewDesc(type, 5, 5, randomNew("seed"));
      expect(gridValidateDesc(type, 5, 5, desc)).toBeNull();
      expect(() => gridNew(type, 5, 5, desc)).not.toThrow();
    }
  });
});

describe("gridNew's description guard", () => {
  it("throws when an invalid description reaches construction", () => {
    // Upstream asserts rather than returning an error: reaching construction
    // with a bad description means the caller skipped validation.
    expect(() => gridNew("square", 5, 5, "0")).toThrow(/invalid description/);
    expect(() => gridNew("triangular", 5, 5, "9")).toThrow(/invalid description/);
  });

  it("still accepts triangular's two legal forms", () => {
    expect(() => gridNew("triangular", 5, 5, null)).not.toThrow();
    expect(() => gridNew("triangular", 5, 5, "0")).not.toThrow();
  });
});
