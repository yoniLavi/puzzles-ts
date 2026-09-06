/*
 * Cross-game guard: **nobody hand-draws the raised tile bevel any more.**
 *
 * Six games each wrote out the two triangles, the winding and the order — and
 * four different thickness formulas, so the same idiom carried a 1px border in
 * Fifteen and a 3px one in Mines at the same tile size. They now call
 * `drawRaisedBevel` and `raisedBevelWidth` (`unify-the-raised-tile-bevel`).
 * This is the reverse direction: a *seventh* game re-deriving it is what the
 * guard exists to catch, because that is how the collection got to six —
 * `drawRectCorners` reached seven copies before anyone noticed.
 *
 * ON THE KEY. The bevel's shape is **a pair of `drawPolygon` calls filled with
 * the bare `COL_LOWLIGHT` and `COL_HIGHLIGHT` constants**, adjacent in the
 * source. That is tighter than "mentions COL_LOWLIGHT" for a measured reason:
 * three games (mathrax, salad, seismic) fill a *lone* triangle with
 * `COL_LOWLIGHT` as a pencil-mode corner marker, which is a different thing and
 * must not be swept in. The population below classifies them rather than
 * narrowing the key, which is this repo's standing instrument rule.
 *
 * TWIDDLE IS NOT IN THE POPULATION and not by an exemption: its four
 * trapezoids meet a center point and take a *per-edge cursor color*, so their
 * fills are ternaries rather than the bare constants and the key cannot match
 * them. That is the right answer — four rotatable trapezoids with per-edge
 * colors are not two triangles, and bending them into the helper is the
 * contortion `AGENTS.md` forbids.
 */

import { describe, expect, it } from "vitest";

/** Every game's own sources as raw text, test files excluded. */
const sources = Object.entries(
  import.meta.glob("../games/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
).filter(([p]) => !p.includes(".test."));

/** A `drawPolygon(...)` call and the color arguments it ends with. */
function polygonFills(text: string): string[] {
  const out: string[] = [];
  // Anchored on the closing `);` of the statement rather than any `)`, because
  // a points array can contain them — `{ x: tx + ((ts / 2) | 0), … }`.
  const call = /drawPolygon\(([\s\S]{0,500}?)\)\s*;/g;
  for (const m of text.matchAll(call)) {
    const tail = (m[1].split("],").pop() ?? m[1]).replace(/\s+/g, " ");
    out.push(tail);
  }
  return out;
}

describe("the raised tile bevel is drawn in one place", () => {
  it("scans the whole collection", () => {
    // The vacuity number. An `import.meta.glob` that matched nothing yields
    // `{}` and every assertion below then passes having looked at nothing —
    // the shape this repo has been bitten by repeatedly.
    expect(sources.length).toBeGreaterThanOrEqual(200);
    expect(sources.some(([, t]) => t.includes("drawRaisedBevel"))).toBe(true);
  });

  it("finds no game re-deriving the two triangles", () => {
    const offenders: string[] = [];
    for (const [path, text] of sources) {
      const fills = polygonFills(text);
      for (let i = 0; i + 1 < fills.length; i++) {
        const pair = `${fills[i]} ${fills[i + 1]}`;
        const lowPair = /COL_LOWLIGHT, COL_LOWLIGHT/.test(fills[i]);
        const highPair = /COL_HIGHLIGHT, COL_HIGHLIGHT/.test(fills[i + 1]);
        const reversed =
          /COL_HIGHLIGHT, COL_HIGHLIGHT/.test(fills[i]) &&
          /COL_LOWLIGHT, COL_LOWLIGHT/.test(fills[i + 1]);
        if ((lowPair && highPair) || reversed) {
          offenders.push(`${path.replace("../games/", "")} (${pair.slice(0, 60)})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("knows the lone LOWLIGHT triangles, which are a different thing", () => {
    // The classification the key deliberately does not narrow away: a single
    // triangle filled COL_LOWLIGHT is a pencil-mode corner marker, not half a
    // bevel. Listing them is what keeps the scan honest — if this set changes,
    // somebody either added a marker or started hand-rolling a bevel, and the
    // two need different answers.
    const lone = sources
      .filter(([, t]) =>
        polygonFills(t).some((f) => /COL_LOWLIGHT, COL_LOWLIGHT/.test(f)),
      )
      .map(([p]) => p.replace("../games/", "").split("/")[0])
      .sort();
    expect(lone).toEqual(["mathrax", "salad", "seismic"]);
  });
});
