import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import { shuffle } from "./shuffle.ts";

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
