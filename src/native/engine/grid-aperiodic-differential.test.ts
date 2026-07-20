/**
 * Differential check for the **aperiodic** tilings in `grid.ts` (Penrose P2/P3,
 * hats, spectres) against the C reference, via the frozen snapshot in
 * `__fixtures__/grid-aperiodic-c-reference.json` (regenerate with
 * `build/native/auxiliary/grid-trace --aperiodic`).
 *
 * ## Why this is a separate file from `grid-differential.test.ts`
 *
 * The periodic tilings are a pure function of `(type, w, h)`, so a failure
 * there has exactly one possible cause: wrong geometry. These four are
 * RNG-bearing, which braids in a second cause — a wrong random draw order —
 * and a single red assertion could not tell them apart.
 *
 * So each fixture record carries both halves and they are asserted separately
 * (`add-aperiodic-tilings` design D1):
 *
 * - **RNG fidelity.** `gridNewDesc(type, w, h, randomNew(seed))` must reproduce
 *   the C's desc *string* byte-for-byte. Failure here means the draw order
 *   diverged, and nothing else.
 * - **Geometry.** `gridNew(type, w, h, desc)` — from the **C-generated** desc,
 *   consuming no randomness whatsoever — must match the incidence dump
 *   index-for-index. This half exercises all the metatile recursion, the BFS,
 *   the half-tile pairing and `gridTrimVigorously` with no seed plumbing at all.
 *
 * Both halves are byte-match differentials in the project's sense, and the
 * geometry half is the stronger: dot indices are assigned in first-encounter
 * order driven by the generator's own BFS, so index-exact agreement proves the
 * emission order matches, not merely the resulting shape.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../random/index.ts";
import reference from "./__fixtures__/grid-aperiodic-c-reference.json" with {
  type: "json",
};
import {
  APERIODIC_GRID_TYPES,
  type Grid,
  type GridType,
  gridComputeSize,
  gridNew,
  gridNewDesc,
  gridValidateDesc,
} from "./grid.ts";

/** One `(type, w, h, seed)` grid dumped from the C, desc included. */
interface AperiodicFixture {
  seed: string;
  type: string;
  width: number;
  height: number;
  desc: string;
  tileSize: number;
  computedExtent: [number, number];
  boundingBox: [number, number, number, number];
  dots: [number, number][];
  edges: [number, number, number, number][];
  faces: { order: number; dots: number[]; edges: number[] }[];
  dotRings: { order: number; edges: number[]; faces: number[] }[];
}

const fixtures = reference as unknown as AperiodicFixture[];

/** Re-dump a TS `Grid` in exactly the shape `grid-trace.c` emits. */
function dump(
  g: Grid,
): Omit<
  AperiodicFixture,
  "seed" | "type" | "width" | "height" | "desc" | "computedExtent"
> {
  return {
    tileSize: g.tileSize,
    boundingBox: [g.lowestX, g.lowestY, g.highestX, g.highestY],
    dots: g.dots.map((d) => [d.x, d.y]),
    edges: g.edges.map((e) => [
      e.dot1.index,
      e.dot2.index,
      e.face1 === null ? -1 : e.face1.index,
      e.face2 === null ? -1 : e.face2.index,
    ]),
    faces: g.faces.map((f) => ({
      order: f.order,
      dots: f.dots.map((d) => (d === null ? -1 : d.index)),
      edges: f.edges.map((e) => (e === null ? -1 : e.index)),
    })),
    dotRings: g.dots.map((d) => ({
      order: d.order,
      edges: d.edges.map((e) => (e === null ? -1 : e.index)),
      faces: d.faces.map((f) => (f === null ? -1 : f.index)),
    })),
  };
}

describe("grid aperiodic tilings match the C reference", () => {
  it("has a fixture for every aperiodic tiling", () => {
    // Guards against a silently-shrinking matrix: dropping a tiling from
    // grid-trace.c's list would otherwise make this file pass vacuously.
    const covered = new Set(fixtures.map((f) => f.type));
    expect([...covered].sort()).toEqual([...APERIODIC_GRID_TYPES].sort());
  });

  for (const f of fixtures) {
    const label = `${f.type} ${f.width}x${f.height} seed=${f.seed}`;

    describe(label, () => {
      // Built lazily and memoised: constructing at describe-body time would let
      // one unimplemented tiling abort collection for the whole file, hiding
      // every other tiling's result.
      let memo: ReturnType<typeof dump> | undefined;
      const got = (): ReturnType<typeof dump> => {
        memo ??= dump(gridNew(f.type as GridType, f.width, f.height, f.desc));
        return memo;
      };

      // ---- Half 1: RNG fidelity ------------------------------------------
      it("generates the C's description from the same seed", () => {
        const desc = gridNewDesc(
          f.type as GridType,
          f.width,
          f.height,
          randomNew(f.seed),
        );
        expect(desc).toBe(f.desc);
      });

      it("accepts the C's description as valid", () => {
        expect(
          gridValidateDesc(f.type as GridType, f.width, f.height, f.desc),
        ).toBeNull();
      });

      // ---- Half 2: geometry, from the C's description --------------------
      // Split into separate assertions so a failure names *what* diverged — a
      // coordinate slip (dots), a face-corner order slip (faces), a trimming
      // bug (counts), or a makeConsistent ring bug (dotRings).
      it("tile size and bounding box", () => {
        expect(got().tileSize).toBe(f.tileSize);
        expect(got().boundingBox).toEqual(f.boundingBox);
      });

      it("gridComputeSize agrees without building a grid", () => {
        const size = gridComputeSize(f.type as GridType, f.width, f.height);
        expect(size.tileSize).toBe(f.tileSize);
        expect([size.xExtent, size.yExtent]).toEqual(f.computedExtent);
      });

      it("survives trimming with the same face, edge and dot counts", () => {
        // Asserted before the full dumps below, because a trimming divergence
        // otherwise surfaces as thousands of lines of index diff whose real
        // cause is "we kept the wrong faces".
        expect({
          faces: got().faces.length,
          edges: got().edges.length,
          dots: got().dots.length,
        }).toEqual({
          faces: f.faces.length,
          edges: f.edges.length,
          dots: f.dots.length,
        });
      });

      it("dots, in emission order", () => {
        // `toEqual` distinguishes -0 from 0, which is the point: negative zero
        // survives `===` and the dot-dedup key, so a grid carrying it comes out
        // structurally perfect and only a comparison like this one sees it.
        // That is exactly how floret's bug was caught in `extend-grid-tilings`,
        // and these tilings use signed basis vectors throughout.
        expect(got().dots).toEqual(f.dots);
      });

      it("edges, with their dots and faces", () => {
        expect(got().edges).toEqual(f.edges);
      });

      it("faces, with their clockwise dot and edge rings", () => {
        expect(got().faces).toEqual(f.faces);
      });

      it("per-dot edge and face rings", () => {
        // Loopy's dline machinery indexes on these rings, so an ordering slip
        // silently corrupts every deduction rather than failing loudly.
        expect(got().dotRings).toEqual(f.dotRings);
      });

      it("no dot coordinate is fractional", () => {
        for (const [x, y] of got().dots) {
          expect(Number.isInteger(x)).toBe(true);
          expect(Number.isInteger(y)).toBe(true);
        }
      });
    });
  }
});
