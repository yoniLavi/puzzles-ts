import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import { permParity, shuffle } from "./shuffle.ts";

describe("shuffle", () => {
  it("permutes in place, preserving the multiset", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 2];
    shuffle(arr, randomNew("seed"));
    expect([...arr].sort((a, b) => a - b)).toEqual([1, 2, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("is deterministic for a given RNG state", () => {
    const a = Array.from({ length: 20 }, (_, i) => i);
    const b = Array.from({ length: 20 }, (_, i) => i);
    shuffle(a, randomNew("same"));
    shuffle(b, randomNew("same"));
    expect(a).toEqual(b);
    // ...and actually permutes a 20-element array for this seed.
    expect(a).not.toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("handles empty and single-element arrays", () => {
    const empty: number[] = [];
    shuffle(empty, randomNew("x"));
    expect(empty).toEqual([]);
    const one = [42];
    shuffle(one, randomNew("x"));
    expect(one).toEqual([42]);
  });
});

describe("permParity", () => {
  it("is 0 for the identity permutation (no inversions)", () => {
    expect(permParity(Int32Array.from([0, 1, 2, 3, 4]), 5)).toBe(0);
  });

  it("is 1 for a single adjacent transposition (one inversion)", () => {
    expect(permParity(Int32Array.from([1, 0, 2, 3]), 4)).toBe(1);
  });

  it("counts inversions mod 2", () => {
    // [2,0,1]: inversions (2>0), (2>1) = 2 → even → 0.
    expect(permParity(Int32Array.from([2, 0, 1]), 3)).toBe(0);
    // [2,1,0]: inversions (2>1), (2>0), (1>0) = 3 → odd → 1.
    expect(permParity(Int32Array.from([2, 1, 0]), 3)).toBe(1);
  });

  it("only considers the first n entries", () => {
    // Trailing entry after n is ignored even though it would invert.
    expect(permParity(Int32Array.from([0, 1, 2, 0]), 3)).toBe(0);
  });
});
