import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import { dominoLayout } from "./laydomino.ts";

/** Every cell is either a lone singleton (its own partner) or paired with an
 * orthogonally-adjacent cell that points back at it. */
function assertValidLayout(grid: Int32Array, w: number, h: number): number {
  let singletons = 0;
  for (let i = 0; i < w * h; i++) {
    const j = grid[i];
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThan(w * h);
    expect(grid[j]).toBe(i); // mutual
    if (j === i) {
      singletons++;
    } else {
      const sameRow = Math.floor(j / w) === Math.floor(i / w) && Math.abs(j - i) === 1;
      const sameCol = j % w === i % w && Math.abs(j - i) === w;
      expect(sameRow || sameCol).toBe(true);
    }
  }
  return singletons;
}

describe("dominoLayout", () => {
  it("tiles an even area with no singletons", () => {
    for (const [w, h] of [
      [6, 5],
      [8, 7],
      [10, 9],
      [4, 4],
    ] as const) {
      const grid = dominoLayout(w, h, randomNew(`lay-${w}x${h}`));
      const singletons = assertValidLayout(grid, w, h);
      expect(singletons).toBe((w * h) % 2); // 0 for even area
    }
  });

  it("leaves exactly one singleton for an odd area", () => {
    const grid = dominoLayout(5, 5, randomNew("lay-odd"));
    expect(assertValidLayout(grid, 5, 5)).toBe(1);
  });

  it("is deterministic for a fixed seed (byte-match RNG)", () => {
    const a = dominoLayout(8, 7, randomNew("lay-det"));
    const b = dominoLayout(8, 7, randomNew("lay-det"));
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
