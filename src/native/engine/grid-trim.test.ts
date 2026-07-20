import { describe, expect, it } from "vitest";
import { makeConsistent } from "./grid-core.ts";
import { TilingBuilder } from "./grid-tilings.ts";
import { GridTrimmedAwayError, gridTrimVigorously } from "./grid-trim.ts";

const A = 20;

/** A `w`×`h` block of unit square faces with its top-left corner at
 * `(ox, oy)`, emitted row-major. */
function block(b: TilingBuilder, ox: number, oy: number, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = ox + A * x;
      const py = oy + A * y;
      b.face([px, py], [px + A, py], [px + A, py + A], [px, py + A]);
    }
  }
}

describe("gridTrimVigorously", () => {
  it("keeps a solid block whose faces all touch a landlocked dot", () => {
    const b = new TilingBuilder(A);
    block(b, 0, 0, 3, 3);
    gridTrimVigorously(b.grid);

    // A 3x3 block has a 2x2 core of landlocked dots, and every one of the nine
    // faces touches at least one of them — so nothing is trimmed.
    expect(b.grid.faces).toHaveLength(9);
    expect(b.grid.dots).toHaveLength(16);
  });

  it("drops a face attached to the block by a single coastal dot", () => {
    const b = new TilingBuilder(A);
    // Emit the doomed face *first*, so its dots occupy low indices and their
    // removal forces the survivors to be renumbered. A trim that forgot to
    // renumber would still pass a count-only assertion.
    block(b, -A, -A, 1, 1);
    block(b, 0, 0, 3, 3);
    expect(b.grid.faces).toHaveLength(10);
    expect(b.grid.dots).toHaveLength(19);

    gridTrimVigorously(b.grid);

    expect(b.grid.faces).toHaveLength(9);
    expect(b.grid.dots).toHaveLength(16);
    // The hanging face's three private dots are gone; the shared corner stays.
    expect(b.grid.dots.some((d) => d.x === -A || d.y === -A)).toBe(false);
    expect(b.grid.dots.some((d) => d.x === 0 && d.y === 0)).toBe(true);
  });

  it("renumbers survivors densely and in their original relative order", () => {
    const b = new TilingBuilder(A);
    block(b, -A, -A, 1, 1);
    block(b, 0, 0, 3, 3);
    const facesBefore = b.grid.faces.slice(1); // everything but the doomed face
    const dotsBefore = b.grid.dots.filter((d) => d.x >= 0 && d.y >= 0);

    gridTrimVigorously(b.grid);

    expect(b.grid.faces.map((f) => f.index)).toEqual([...Array(9).keys()]);
    expect(b.grid.dots.map((d) => d.index)).toEqual([...Array(16).keys()]);
    // Relative order is preserved: the survivors are the same objects, in the
    // same sequence they were emitted.
    expect(b.grid.faces).toEqual(facesBefore);
    expect(b.grid.dots).toEqual(dotsBefore);
  });

  it("keeps only the largest landlocked component", () => {
    const b = new TilingBuilder(A);
    block(b, 0, 0, 3, 3); // 2x2 landlocked core
    block(b, 20 * A, 0, 4, 4); // 3x3 landlocked core — strictly larger
    gridTrimVigorously(b.grid);

    expect(b.grid.faces).toHaveLength(16);
    // Every survivor belongs to the far block.
    expect(b.grid.dots.every((d) => d.x >= 20 * A)).toBe(true);
  });

  it("throws rather than returning an empty grid when nothing is landlocked", () => {
    const b = new TilingBuilder(A);
    block(b, 0, 0, 2, 2); // a 2x2 block has exactly one landlocked dot...
    expect(() => gridTrimVigorously(b.grid)).not.toThrow();

    const tiny = new TilingBuilder(A);
    block(tiny, 0, 0, 1, 1); // ...but a lone face has none at all
    expect(() => gridTrimVigorously(tiny.grid)).toThrow(GridTrimmedAwayError);
  });

  it("leaves a trimmed grid that links up consistently", () => {
    const b = new TilingBuilder(A);
    block(b, -A, -A, 1, 1);
    block(b, 0, 0, 3, 3);
    gridTrimVigorously(b.grid);
    makeConsistent(b.grid);

    // Euler characteristic for a simply-connected planar patch.
    const { faces, edges, dots } = b.grid;
    expect(dots.length - edges.length + faces.length).toBe(1);
    for (const f of faces) expect(f.edges.every((e) => e !== null)).toBe(true);
    for (const e of edges) expect(e.face1).not.toBeNull();
  });
});
