/**
 * Differential check for the periodic tilings in `grid.ts` against the C
 * reference (`puzzles/grid.c`), via the frozen snapshot in
 * `__fixtures__/grid-c-reference.json` (regenerate with
 * `build/native/auxiliary/grid-trace --all`).
 *
 * This is a **byte-match** differential, and an unusually strong one: dot
 * indices are assigned in first-encounter order driven by each generator's own
 * emission loop, so index-exact agreement proves the emission *order* matches,
 * not merely the resulting shape. A transposed coordinate or a swapped
 * face-corner order fails immediately and names the tiling.
 *
 * It is the mitigation for the main risk in `extend-grid-tilings`: 13
 * hand-transcribed generators with high typo volume. See that change's
 * design.md D7.
 */

import { describe, expect, it } from "vitest";
import reference from "./__fixtures__/grid-c-reference.json" with { type: "json" };
import { type Grid, type GridType, gridComputeSize, gridNew } from "./grid.ts";

/** One `(type, w, h, desc)` grid dumped from the C. */
interface GridFixture {
  type: string;
  width: number;
  height: number;
  desc: string | null;
  tileSize: number;
  computedExtent: [number, number];
  boundingBox: [number, number, number, number];
  /** `[x, y]` per dot, in index order. */
  dots: [number, number][];
  /** `[dot1, dot2, face1, face2]` per edge; `-1` face = infinite exterior. */
  edges: [number, number, number, number][];
  faces: { order: number; dots: number[]; edges: number[] }[];
  dotRings: { order: number; edges: number[]; faces: number[] }[];
}

const fixtures = reference as unknown as GridFixture[];

/** Re-dump a TS `Grid` in exactly the shape `grid-trace.c` emits. */
function dump(
  g: Grid,
): Omit<GridFixture, "type" | "width" | "height" | "desc" | "computedExtent"> {
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

describe("grid periodic tilings match the C reference", () => {
  it("has a fixture for every periodic tiling", () => {
    // Guards against a silently-shrinking matrix: if a tiling is dropped from
    // grid-trace.c's fixture list, this fails rather than passing vacuously.
    const covered = new Set(fixtures.map((f) => f.type));
    expect([...covered].sort()).toEqual(
      [
        "cairo",
        "compassdodecagonal",
        "dodecagonal",
        "floret",
        "greatdodecagonal",
        "greatgreatdodecagonal",
        "greathexagonal",
        "honeycomb",
        "kagome",
        "kites",
        "octagonal",
        "snubsquare",
        "square",
        "triangular",
      ].sort(),
    );
  });

  for (const f of fixtures) {
    const label = `${f.type} ${f.width}x${f.height}${f.desc === null ? "" : ` desc=${f.desc}`}`;

    describe(label, () => {
      // Built lazily and memoised: constructing at describe-body time would
      // make one unimplemented tiling abort collection for the whole file,
      // hiding every other tiling's result.
      let memo: ReturnType<typeof dump> | undefined;
      const got = (): ReturnType<typeof dump> => {
        memo ??= dump(gridNew(f.type as GridType, f.width, f.height, f.desc));
        return memo;
      };

      // Split into separate assertions so a failure names *what* diverged —
      // a coordinate typo (dots), a face-corner order slip (faces), or a
      // makeConsistent ring bug (dotRings) — rather than one wall of diff.
      it("tile size and bounding box", () => {
        expect(got().tileSize).toBe(f.tileSize);
        expect(got().boundingBox).toEqual(f.boundingBox);
      });

      it("gridComputeSize agrees without building a grid", () => {
        const size = gridComputeSize(f.type as GridType, f.width, f.height);
        expect(size.tileSize).toBe(f.tileSize);
        expect([size.xExtent, size.yExtent]).toEqual(f.computedExtent);
      });

      it("dots, in emission order", () => {
        expect(got().dots).toEqual(f.dots);
      });

      it("edges, with their dots and faces", () => {
        expect(got().edges).toEqual(f.edges);
      });

      it("faces, with their clockwise dot and edge rings", () => {
        expect(got().faces).toEqual(f.faces);
      });

      it("per-dot edge and face rings", () => {
        // Loopy's dline machinery indexes on these rings
        // (`2*edge.index + (edge.dot1 === dot ? 1 : 0)`), so an ordering slip
        // here silently corrupts every deduction rather than failing loudly.
        expect(got().dotRings).toEqual(f.dotRings);
      });

      it("no dot coordinate is fractional", () => {
        // grid.c:1404 "No floating-point arithmetic here!" — dot dedup is by
        // exact coordinate equality, so a fractional coordinate produces
        // duplicate dots and a structurally broken grid rather than an error.
        for (const [x, y] of got().dots) {
          expect(Number.isInteger(x)).toBe(true);
          expect(Number.isInteger(y)).toBe(true);
        }
      });
    });
  }
});
