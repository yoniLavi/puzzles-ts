/**
 * Tier-1 tests for the shared symmetric black-square placer.
 *
 * Written by `audit-test-suite-strength` §5: 151 lines shared by seven files.
 * `sticks.test.ts` imported the `SYMM_*` *constants*, but `placeSymmetricBlacks`
 * itself had no direct test at all — its guarantees lived in Light Up's and
 * Sticks' frozen differentials, which do catch its defects but report them as a
 * differing description string rather than as the rule that broke.
 *
 * The module's own doc comment calls its RNG draw order byte-match critical, so
 * these state the *symmetry* it produces (which is what a reader would call the
 * point of the code) and the guards around it — not the draw order, which the
 * differentials already pin exactly and which no restatement here could pin
 * better.
 *
 * **That division of labour was checked, not assumed.** Mutating
 * `if (!rotate) rw += wodd` to drop its guard changes the 4-fold *region size*
 * on an odd-width board — so it changes which boards exist without breaking any
 * symmetry, and it survives everything here. Light Up's and Sticks' frozen
 * differentials fail on it (3 tests), which is the right place for it to be
 * caught. What survives these tests should be the byte-match layer and nothing
 * else; if you add a case here, check which side of that line it falls on.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import {
  placeSymmetricBlacks,
  SYMM_MAX,
  SYMM_NONE,
  SYMM_REF2,
  SYMM_REF4,
  SYMM_ROT2,
  SYMM_ROT4,
  SYMMETRY_CHOICES,
} from "./symmetric-blacks.ts";

/** Run the placer over a plain boolean grid and return it. */
function place(w: number, h: number, blackpc: number, symm: number, seed = "s") {
  const grid = new Uint8Array(w * h);
  placeSymmetricBlacks({
    w,
    h,
    blackpc,
    symm,
    rs: randomNew(seed),
    isBlack: (x, y) => grid[y * w + x] === 1,
    setBlack: (x, y, black) => {
      grid[y * w + x] = black ? 1 : 0;
    },
  });
  return { grid, at: (x: number, y: number) => grid[y * w + x] === 1 };
}

const countBlack = (g: Uint8Array) => g.reduce((a, v) => a + v, 0);

describe("SYMMETRY_CHOICES", () => {
  it("labels every symmetry, in SYMM_* order", () => {
    // The Custom-type dialog indexes this array by the raw `SYMM_*` value, so a
    // reordering silently mislabels the option a player picks.
    expect(SYMMETRY_CHOICES).toHaveLength(SYMM_MAX);
    expect(SYMMETRY_CHOICES[SYMM_NONE]).toBe("None");
    expect(SYMMETRY_CHOICES[SYMM_REF2]).toBe("2-way mirror");
    expect(SYMMETRY_CHOICES[SYMM_ROT2]).toBe("2-way rotational");
    expect(SYMMETRY_CHOICES[SYMM_REF4]).toBe("4-way mirror");
    expect(SYMMETRY_CHOICES[SYMM_ROT4]).toBe("4-way rotational");
  });
});

describe("the symmetry each mode actually produces", () => {
  // Even dimensions throughout: the region then tiles the board exactly, so the
  // symmetry is total rather than approximate at an odd centre line.
  const W = 8;
  const H = 8;
  const PC = 30;

  it("SYMM_NONE imposes none, and still blackens roughly the asked-for share", () => {
    const { grid, at } = place(W, H, PC, SYMM_NONE);
    expect(countBlack(grid)).toBe(Math.floor((W * H * PC) / 100));
    // Not symmetric under any of the three maps (a false positive here would
    // need every one of them to hold by chance).
    const mirrored = (x: number, y: number) => at(x, H - 1 - y);
    const rot2 = (x: number, y: number) => at(W - 1 - x, H - 1 - y);
    const same = (f: (x: number, y: number) => boolean) => {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) if (at(x, y) !== f(x, y)) return false;
      return true;
    };
    expect(same(mirrored) && same(rot2)).toBe(false);
  });

  it("SYMM_REF2 mirrors top to bottom", () => {
    const { at } = place(W, H, PC, SYMM_REF2);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) expect(at(x, y)).toBe(at(x, H - 1 - y));
  });

  it("SYMM_ROT2 is unchanged by a half turn", () => {
    const { at } = place(W, H, PC, SYMM_ROT2);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) expect(at(x, y)).toBe(at(W - 1 - x, H - 1 - y));
  });

  it("SYMM_REF4 mirrors in both axes", () => {
    const { at } = place(W, H, PC, SYMM_REF4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        expect(at(x, y)).toBe(at(W - 1 - x, y));
        expect(at(x, y)).toBe(at(x, H - 1 - y));
      }
  });

  it("SYMM_ROT4 is unchanged by a quarter turn", () => {
    const { at } = place(W, H, PC, SYMM_ROT4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) expect(at(x, y)).toBe(at(W - 1 - y, x));
  });
});

describe("guards and bounds", () => {
  it("refuses 4-fold rotation on a non-square grid", () => {
    // The quarter-turn maps (x, y) to (w-1-y, x), which is only a grid position
    // when the grid is square.
    expect(() => place(8, 6, 30, SYMM_ROT4)).toThrow(/square grid/);
    // Its mirror counterpart has no such restriction.
    expect(() => place(8, 6, 30, SYMM_REF4)).not.toThrow();
  });

  it("rejects an unknown symmetry rather than silently placing none", () => {
    expect(() => place(8, 8, 30, SYMM_MAX)).toThrow(/Unknown symmetry/);
    expect(() => place(8, 8, 30, -1)).toThrow(/Unknown symmetry/);
  });

  it("places nothing at 0% and every square at 100%", () => {
    expect(countBlack(place(8, 8, 0, SYMM_ROT2).grid)).toBe(0);
    expect(countBlack(place(8, 8, 100, SYMM_ROT2).grid)).toBe(64);
  });

  it("blackens the symmetry-reduced region, so the share is of the whole board", () => {
    // The count is `floor(regionW * regionH * pc / 100)` copied `degree` times.
    // Getting the region wrong is the classic way this goes subtly astray, so
    // the totals are pinned per mode on an 8x8 at 50%.
    expect(countBlack(place(8, 8, 50, SYMM_NONE).grid)).toBe(32); // 8x8 region
    expect(countBlack(place(8, 8, 50, SYMM_REF2).grid)).toBe(32); // 8x4, x2
    expect(countBlack(place(8, 8, 50, SYMM_ROT2).grid)).toBe(32); // 8x4, x2
    expect(countBlack(place(8, 8, 50, SYMM_REF4).grid)).toBe(32); // 4x4, x4
    expect(countBlack(place(8, 8, 50, SYMM_ROT4).grid)).toBe(32); // 4x4, x4
  });

  it("is deterministic in the seed, and varies with it", () => {
    const a = place(8, 8, 30, SYMM_ROT2, "seed-a").grid;
    const b = place(8, 8, 30, SYMM_ROT2, "seed-a").grid;
    const c = place(8, 8, 30, SYMM_ROT2, "seed-b").grid;
    expect([...a]).toEqual([...b]);
    expect([...a]).not.toEqual([...c]);
  });
});

describe("odd dimensions — where the region overlaps its own copy", () => {
  it("includes the centre row in the region, so it can be blackened at all", () => {
    // The degree-2 region is `floor(h/2) + hodd` rows. Drop the `+ hodd` and the
    // centre row falls out of both the region *and* the mirror copy's range —
    // leaving it permanently white, which at 100% is unmistakable.
    const { grid } = place(7, 7, 100, SYMM_REF2);
    expect(countBlack(grid)).toBe(49);
  });

  it("SYMM_REF2 still mirrors, with the centre row its own reflection", () => {
    const H = 7;
    const { at } = place(7, H, 40, SYMM_REF2);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < 7; x++) expect(at(x, y)).toBe(at(x, H - 1 - y));
  });

  it("SYMM_ROT4 on an odd square gives the centre its own extra draw", () => {
    // Upstream's fix-up: the quarter-turn copy never writes the middle cell, so
    // it is decided by one further `randomUpto(rs, 100) <= blackpc` draw.
    const centre = (pc: number, seed: string) =>
      place(7, 7, pc, SYMM_ROT4, seed).at(3, 3);
    expect(centre(100, "odd-100")).toBe(true);

    // The `<=` is load-bearing and off-by-one-able, and it only shows itself on
    // the draw that equals `blackpc`. At 0% no placement draws happen at all, so
    // the centre draw is the seed's *first*, and "c-123" is a seed whose first
    // `randomUpto(rs, 100)` is exactly 0 — black under `<=`, white under `<`.
    expect(centre(0, "c-123")).toBe(true);
    // Any other 0% seed leaves it white, so this is the boundary and not a
    // "0% blackens things" bug.
    expect(centre(0, "odd-0")).toBe(false);
  });

  it("SYMM_ROT4 on an odd square is still quarter-turn symmetric off-centre", () => {
    const { at } = place(7, 7, 40, SYMM_ROT4);
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        if (x === 3 && y === 3) continue; // the centre is its own orbit
        expect(at(x, y)).toBe(at(6 - y, x));
      }
  });
});
