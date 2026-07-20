/**
 * The dline index invariant, across **all 18 tilings**.
 *
 * This test exists because of the failure shape it guards, not because the
 * formulas are complicated. `dlineIndexFromDot` and `dlineIndexFromFace` are
 * two independent ways of naming the same pair of edges, and they agree only if
 * `grid.ts` reproduces `grid_make_consistent`'s ring-ordering conventions
 * exactly. If it does not, **nothing crashes**: the solver silently indexes the
 * wrong pairs, gets quietly weaker, and — because the generator is solver-gated
 * — emits *different puzzles*. Upstream's `DEBUG_DLINES` blocks existed to
 * eyeball this; here it is mechanical.
 *
 * Written before the solver, deliberately (design D3a).
 */
import { describe, expect, it } from "vitest";
import { ALL_GRID_TYPES, type Grid, type GridType } from "../../engine/grid.ts";
import { randomNew } from "../../random/index.ts";
import {
  dlineCount,
  dlineIndexFromDot,
  dlineIndexFromFace,
  isAtLeastOne,
  isAtMostOne,
  setAtLeastOne,
  setAtMostOne,
} from "./dlines.ts";
import { buildLoopyGrid } from "./grid-build.ts";
import { LOOPY_GRIDS, validateParams } from "./params.ts";

/** A small-but-representative patch of each tiling, at that type's own minimum
 * sizes where they are large (hats/spectres need 6). Built through the real
 * `buildLoopyGrid` path, so the aperiodic tilings get a genuine description —
 * and so a Penrose seed that degenerates is retried rather than throwing, which
 * at these minimum sizes it routinely does. */
function buildGrid(type: GridType, seed: string): Grid {
  const index = LOOPY_GRIDS.findIndex((g) => g.type === type);
  if (index < 0) throw new Error(`no Loopy grid entry for ${type}`);
  const entry = LOOPY_GRIDS[index];
  // Smallest square size this type actually admits — grown past the per-type
  // minima where `validateParams` imposes more (Penrose kite/dart needs width
  // 4, since width 3 never produces a non-empty patch).
  let size = Math.max(entry.amin, entry.omin);
  while (validateParams({ w: size, h: size, diff: 0, type: index }, true) !== null) {
    size++;
    if (size > 12) throw new Error(`no valid square size for ${type}`);
  }
  return buildLoopyGrid(type, size, size, randomNew(seed)).grid;
}

describe("dline indexing", () => {
  for (const type of ALL_GRID_TYPES) {
    describe(type, () => {
      const g = buildGrid(type, `dlines-${type}`);

      it("agrees between the dot-side and face-side formulas", () => {
        // For every face f and index i, the face-side formula names the pair
        // whose common dot is f.dots[i]. Find that same pair from the dot's
        // side: the dot's clockwise edge ring must contain f.edges[i] at some
        // position j, and dlineIndexFromDot(dot, j) must be the same slot.
        let checked = 0;
        for (const f of g.faces) {
          for (let i = 0; i < f.order; i++) {
            const e = f.edges[i];
            const d = f.dots[i];
            expect(e).not.toBeNull();
            expect(d).not.toBeNull();
            if (e === null || d === null) continue;

            const fromFace = dlineIndexFromFace(f, i);

            const j = d.edges.indexOf(e);
            expect(
              j,
              `edge ${e.index} missing from dot ${d.index}'s ring`,
            ).toBeGreaterThanOrEqual(0);
            expect(dlineIndexFromDot(d, j)).toBe(fromFace);
            checked++;
          }
        }
        expect(checked).toBeGreaterThan(0);
      });

      it("is injective over each dot's ring and in range", () => {
        const limit = dlineCount(g);
        for (const d of g.dots) {
          const seen = new Set<number>();
          for (let i = 0; i < d.order; i++) {
            const index = dlineIndexFromDot(d, i);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(limit);
            expect(seen.has(index), `dot ${d.index} reuses dline slot ${index}`).toBe(
              false,
            );
            seen.add(index);
          }
        }
      });

      it("gives every dline slot at most one owning (dot, position)", () => {
        // The 2·numEdges slot count is only correct if distinct (dot, i) pairs
        // never collide globally, not merely within one dot's ring.
        const owner = new Map<number, string>();
        for (const d of g.dots) {
          for (let i = 0; i < d.order; i++) {
            const index = dlineIndexFromDot(d, i);
            const key = `${d.index}:${i}`;
            const prev = owner.get(index);
            expect(prev, `slot ${index} claimed by ${prev} and ${key}`).toBeUndefined();
            owner.set(index, key);
          }
        }
      });
    });
  }
});

describe("dline bit accessors", () => {
  it("report new information exactly once", () => {
    const dlines = new Uint8Array(4);
    expect(isAtLeastOne(dlines, 2)).toBe(false);
    expect(setAtLeastOne(dlines, 2)).toBe(true);
    expect(setAtLeastOne(dlines, 2)).toBe(false);
    expect(isAtLeastOne(dlines, 2)).toBe(true);
    expect(isAtMostOne(dlines, 2)).toBe(false);
    expect(setAtMostOne(dlines, 2)).toBe(true);
    expect(setAtMostOne(dlines, 2)).toBe(false);
    expect(isAtMostOne(dlines, 2)).toBe(true);
    // The two bits are independent, and neither leaks into a neighbouring slot.
    expect(dlines[1]).toBe(0);
    expect(dlines[3]).toBe(0);
  });
});
