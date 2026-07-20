/**
 * Tier-1 tests for the spectre aperiodic tiling.
 *
 * The heavy lifting is done by `grid-aperiodic-differential.test.ts`, which
 * byte-matches five C-generated patches index-for-index. What is here is what
 * that differential *cannot* reach:
 *
 * - the structural invariants of the generated tables, which the differential
 *   only checks implicitly and only for the paths its five fixtures happen to
 *   walk (in particular `specin_S`, whose four external entries are the sole
 *   reason `SpectreContext.step` loops rather than branching once);
 * - desc round-tripping and the rejection of malformed descs, which is
 *   untrusted-input handling the differential never exercises;
 * - the `random_new("dummy")` replay fallback, which **no ordinary fixture
 *   reaches** — it fires only when a desc is replayed at a larger size than it
 *   was generated for, and diverging there is silent (the same desc quietly
 *   builds a different grid).
 */

import { describe, expect, it } from "vitest";

/**
 * FNV-1a, 32-bit, as an 8-hex-digit string.
 *
 * Written out rather than reached for from `node:crypto`: `tsconfig.json` sets
 * `"types": []` deliberately, because `src/` is browser code and should not
 * acquire Node's ambient types for the sake of one test. Six lines of
 * self-contained arithmetic is a better trade than widening that boundary.
 */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

import { randomNew } from "../../random/index.ts";
import { gridNew, gridNewDesc, gridValidateDesc } from "../grid.ts";
import {
  coordCmp,
  coordSign,
  pointMul,
  pointRot,
  SPECTRE_NVERTICES,
  spectreParamsInvalid,
  spectreTilingGenerate,
} from "./spectre.ts";
import {
  gridNewSpectres,
  spectresNewDesc,
  spectresValidateDesc,
} from "./spectre-grid.ts";
import {
  HEX_DATA,
  HEX_LETTERS,
  numSpectres,
  numSubhexes,
  POSS_SPECTRE,
  SPECTRE_ANGLES,
} from "./spectre-tables.ts";

describe("generated tables", () => {
  it("keeps the load-bearing hex ordinal order", () => {
    // This order indexes HEX_DATA and every subhexes entry, and a desc's final
    // letter is decoded through it. Reordering it silently reinterprets every
    // stored desc.
    expect(HEX_LETTERS).toBe("GDJLXPSFY");
    expect(HEX_DATA.map((h) => h.letter).join("")).toBe(HEX_LETTERS);
  });

  it("has the expected table shapes, G being the odd one out", () => {
    for (const [h, data] of HEX_DATA.entries()) {
      const isG = data.letter === "G";
      expect(numSubhexes(h)).toBe(isG ? 7 : 8);
      expect(numSpectres(h)).toBe(isG ? 2 : 1);
      expect(data.subhexes).toHaveLength(numSubhexes(h));
      expect(data.hexmap).toHaveLength(6 * numSubhexes(h));
      expect(data.specmap).toHaveLength(14 * numSpectres(h));
      expect(data.hexedges).toHaveLength(6);
      expect(data.specedges).toHaveLength(6);
      expect(data.poss.length).toBeGreaterThan(0);
    }
  });

  it("partitions the arrival tables contiguously and completely", () => {
    // `step`/`stepHex` index `in[startIndex + len - 1 - lo]`. A gap or an
    // overlap in the partition reads a neighbouring edge's entry, which is a
    // perfectly valid-looking entry pointing at the wrong tile.
    for (const data of HEX_DATA) {
      for (const [edges, inTable] of [
        [data.hexedges, data.hexin],
        [data.specedges, data.specin],
      ] as const) {
        let next = 0;
        for (const e of edges) {
          expect(e.startIndex).toBe(next);
          next += e.len;
        }
        expect(next).toBe(inTable.length);
      }
    }
  });

  it("makes every hexin entry internal, so stepHex can branch once", () => {
    for (const data of HEX_DATA) {
      expect(data.hexin.filter((m) => !m.internal)).toHaveLength(0);
    }
  });

  it("makes specin_S the only externally-arriving table", () => {
    // This is why `SpectreContext.step` is a `while` and not an `if`. Collapsed
    // to an `if`, every patch without an S hex on the relevant path still comes
    // out perfect — which is exactly what makes the bug so hard to see.
    for (const data of HEX_DATA) {
      const external = data.specin.filter((m) => !m.internal).length;
      expect({ letter: data.letter, external }).toEqual({
        letter: data.letter,
        external: data.letter === "S" ? 4 : 0,
      });
    }
  });

  it("keeps the single-entry possibility tables that must still draw", () => {
    // J and L have exactly one legal parent each. `choosePoss` still consumes a
    // random number for them; if a future refactor short-circuits that, the
    // stream desynchronises and every desc changes. Pinned here so the
    // temptation is at least visible.
    const single = HEX_DATA.filter((h) => h.poss.length === 1).map((h) => h.letter);
    expect(single).toEqual(["J", "L"]);
  });

  it("keeps the probability weights exactly as upstream rounded them", () => {
    // Integer approximations to functions of √15 — never recomputed from a
    // square root. Note the X and P sums differ by one: a genuine asymmetry in
    // upstream's rounding, not a typo.
    const sum = (letter: string) =>
      HEX_DATA.find((h) => h.letter === letter)?.poss.reduce((a, p) => a + p.prob, 0);
    expect(sum("X")).toBe(58729834);
    expect(sum("P")).toBe(58729835);
    expect(POSS_SPECTRE).toHaveLength(10);
  });

  it("describes a closed 14-sided outline with one collinear vertex", () => {
    expect(SPECTRE_ANGLES).toHaveLength(SPECTRE_NVERTICES);
    // Fourteen turns totalling a full turn clockwise, in twelfths.
    expect(SPECTRE_ANGLES.reduce((a, b) => a + b, 0)).toBe(-12);
    // The "double edge": a straight-through vertex, which is how adjacent
    // spectres come to share dots. It must survive into the emitted face.
    expect(SPECTRE_ANGLES.filter((a) => a === 0)).toHaveLength(1);
    expect(SPECTRE_ANGLES[10]).toBe(0);
  });
});

describe("exact arithmetic", () => {
  it("rotates in a cycle of twelve, negatives included", () => {
    expect(pointRot(0)).toEqual([1, 0, 0, 0]);
    expect(pointRot(12)).toEqual(pointRot(0));
    expect(pointRot(-3)).toEqual(pointRot(9));
    expect(pointRot(-13)).toEqual(pointRot(11));
    // A half turn is exactly -1, and rotating twice by a sixth is a third.
    expect(pointRot(6)).toEqual([-1, 0, 0, 0]);
    expect(pointMul(pointRot(2), pointRot(2))).toEqual(pointRot(4));
  });

  it("signs a + b√3 exactly where the parts disagree", () => {
    expect(coordSign({ c1: 0, cr3: 0 })).toBe(0);
    expect(coordSign({ c1: 3, cr3: 1 })).toBe(+1);
    expect(coordSign({ c1: -3, cr3: -1 })).toBe(-1);
    // 2 - √3 > 0 but 1 - √3 < 0: the squaring branch, which is the whole point.
    expect(coordSign({ c1: 2, cr3: -1 })).toBe(+1);
    expect(coordSign({ c1: 1, cr3: -1 })).toBe(-1);
    // 7² = 49 < 3·4² = 48? No — 49 > 48, so 7 - 4√3 > 0, just barely.
    expect(coordSign({ c1: 7, cr3: -4 })).toBe(+1);
    expect(coordSign({ c1: -7, cr3: 4 })).toBe(-1);
    // Negative zero must not be read as a sign.
    expect(coordSign({ c1: -0, cr3: -0 })).toBe(0);
    expect(coordCmp({ c1: 5, cr3: 0 }, { c1: 2, cr3: 2 })).toBe(-1); // 5 < 2+2√3
  });

  it("stays exact at magnitudes far past a 32-bit product", () => {
    // JS doubles are exact to 2^53, so this predicate is *more* reliable than
    // the C's, whose int multiplication would overflow here. Deliberate — see
    // the note on coordSign.
    expect(coordSign({ c1: 100_000_000, cr3: -57_735_026 })).toBe(+1);
    expect(coordSign({ c1: 100_000_000, cr3: -57_735_027 })).toBe(-1);
  });
});

describe("descriptions", () => {
  it("round-trips a generated desc back into a grid", () => {
    for (let seed = 0; seed < 12; seed++) {
      const desc = spectresNewDesc(6, 6, randomNew(String(seed)));
      expect(spectresValidateDesc(6, 6, desc)).toBeNull();
      // Structural shape: orientation, digits, hex letter.
      expect(desc).toMatch(/^[0-9AB][0-9]*[GDJLXPSFY]$/);
      const g = gridNewSpectres(6, 6, desc);
      expect(g.faces.length).toBeGreaterThan(0);
      expect(g.tileSize).toBe(32);
    }
  });

  it("round-trips through the grid.ts dispatch too", () => {
    const desc = gridNewDesc("spectres", 7, 5, randomNew("dispatch"));
    expect(desc).not.toBeNull();
    expect(gridValidateDesc("spectres", 7, 5, desc)).toBeNull();
    expect(gridNew("spectres", 7, 5, desc).faces.length).toBeGreaterThan(0);
  });

  it("builds the same grid twice from the same desc", () => {
    const desc = spectresNewDesc(6, 6, randomNew("determinism"));
    const a = gridNewSpectres(6, 6, desc);
    const b = gridNewSpectres(6, 6, desc);
    // `toEqual` distinguishes -0 from +0, which is the point: a negative zero
    // in a coordinate survives `===`, keys identically, and stringifies the
    // same, so only a structural comparison can see it.
    expect(a.dots.map((d) => [d.x, d.y])).toEqual(b.dots.map((d) => [d.x, d.y]));
    for (const [x, y] of a.dots.map((d) => [d.x, d.y])) {
      expect(Object.is(x, -0)).toBe(false);
      expect(Object.is(y, -0)).toBe(false);
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    }
  });

  it("rejects malformed descriptions", () => {
    const cases: [string | null, string][] = [
      [null, "Missing grid description string."],
      ["", "empty grid description"],
      // One character: upstream computes strlen-2 first and underflows size_t.
      ["5", "grid description too short"],
      ["!03Y", "expected digit or A,B at start of grid description"],
      ["C03Y", "expected digit or A,B at start of grid description"],
      ["0x3Y", "expected digit in grid description"],
      ["0003047Z", "invalid final hexagon type"],
      ["0003047", "invalid final hexagon type"],
      // Two characters parse fine but describe no coordinates at all.
      ["0Y", "expected at least one numeric coordinate"],
      // G holds two spectres, so index 0 is legal at level 0 and 5 is not.
      ["05G", "coordinate out of range"],
      // Level 1+ indexes a subhex: G has only seven, so 7 is out of range.
      ["0079G", "coordinate out of range"],
    ];
    for (const [desc, message] of cases) {
      expect({ desc, error: spectresValidateDesc(6, 6, desc) }).toEqual({
        desc,
        error: message,
      });
    }
  });

  it("accepts a bare two-level desc at the boundary of each hex", () => {
    // G is the only hex with two spectres, so "01G" is legal and "01D" is not.
    expect(spectresValidateDesc(6, 6, "01G")).toBeNull();
    expect(spectresValidateDesc(6, 6, "01D")).toBe("coordinate out of range");
  });

  it("refuses to build from a description that never validated", () => {
    expect(() => gridNewSpectres(6, 6, "nope")).toThrow(/invalid description reached/);
  });

  it("covers every orientation character the writer can emit", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      seen.add(spectresNewDesc(6, 6, randomNew(`o${seed}`))[0]);
    }
    // Orientations 10 and 11 are written as A and B rather than as digits; if
    // the writer and reader ever disagreed about that, these descs would fail
    // to round-trip.
    for (const c of seen) expect("0123456789AB").toContain(c);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("validates paramsInvalid independently of the string layer", () => {
    expect(spectreParamsInvalid({ orientation: 0, coords: [], finalHex: "G" })).toBe(
      "expected at least one numeric coordinate",
    );
    expect(spectreParamsInvalid({ orientation: 0, coords: [0], finalHex: "?" })).toBe(
      "invalid final hexagon type",
    );
    expect(
      spectreParamsInvalid({
        orientation: 0,
        coords: [0, 0, 3, 0, 4, 7],
        finalHex: "Y",
      }),
    ).toBeNull();
  });
});

describe('the random_new("dummy") replay fallback', () => {
  // A desc records only as deep a substitution hierarchy as the size it was
  // generated for needed. Replaying it at a *larger* size walks off the end of
  // that record, which is the only way to reach the fallback — and getting it
  // wrong is silent: the patch stays valid and self-consistent, it is simply a
  // different patch, so a saved puzzle would load with its clues on the wrong
  // faces.
  const desc = "0003047Y"; // the C's 6x6 seed-0 desc; six recorded coordinates
  const params = { orientation: 0, coords: [0, 0, 3, 0, 4, 7], finalHex: "Y" };

  it("is not reached at sizes the desc already covers", () => {
    // Establishes the contrast for the test below, and pins the boundary: this
    // desc's six levels are enough for a patch four times the area it was
    // generated for, which is why no ordinary fixture reaches the fallback and
    // why the size below has to be as large as it is.
    const depth = spectreTilingGenerate(params, 12 * 7, 12 * 7, () => {});
    expect(depth).toBe(params.coords.length);
  });

  it("is genuinely reached at 26x26", () => {
    // Replay installs no RNG of its own, so the hierarchy growing past the
    // desc's recorded depth can only have come from the fallback.
    const depth = spectreTilingGenerate(params, 26 * 7, 26 * 7, () => {});
    expect(depth).toBeGreaterThan(params.coords.length);
  });

  it("matches the C bit-for-bit once the fallback has fired", () => {
    // Reference: `build/native/auxiliary/grid-trace spectres 26 26 0003047Y`.
    // Recorded as counts, a bounding box, the ends of the dot list and a digest
    // of the whole incidence dump — the same comparison the differential makes,
    // without carrying a second megabyte of fixture for one test.
    const g = gridNewSpectres(26, 26, desc);

    expect({
      dots: g.dots.length,
      edges: g.edges.length,
      faces: g.faces.length,
    }).toEqual({ dots: 2879, edges: 3325, faces: 447 });
    expect([g.lowestX, g.lowestY, g.highestX, g.highestY]).toEqual([2, 1, 1458, 1457]);

    const dots = g.dots.map((d) => [d.x, d.y]);
    expect(dots.slice(0, 3)).toEqual([
      [728, 673],
      [744, 689],
      [738, 710],
    ]);
    expect(dots.slice(-3)).toEqual([
      [31, 1383],
      [36, 1361],
      [15, 1355],
    ]);

    const dump = JSON.stringify({
      tileSize: g.tileSize,
      boundingBox: [g.lowestX, g.lowestY, g.highestX, g.highestY],
      dots,
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
    });
    // Both numbers below are the C's, obtained by running the reference
    // command above and hashing its dump with `fnv1a` — NOT by recording what
    // this port happened to produce. The length is carried alongside the hash
    // because a 32-bit digest alone is a weak collision guard; together with
    // the counts, bounding box and dot slices asserted above, this pins the
    // whole incidence.
    expect({ length: dump.length, hash: fnv1a(dump) }).toEqual({
      length: 312165,
      hash: "39389bd9",
    });
  });

  it("shares one fallback stream rather than restarting it per extension", () => {
    // Two replays at a size that fires the fallback must agree — they would
    // anyway if the fallback were recreated per call, but they would *not*
    // agree with the C, which is what the digest above pins. This guards the
    // cheaper property that the fallback is at least deterministic.
    const a = gridNewSpectres(26, 26, desc);
    const b = gridNewSpectres(26, 26, desc);
    expect(a.dots.map((d) => [d.x, d.y])).toEqual(b.dots.map((d) => [d.x, d.y]));
  });
});

describe("faces", () => {
  it("emits order-14 faces before trimming merges nothing away", () => {
    const g = gridNewSpectres(6, 6, "0003047Y");
    // Every spectre is a 14-gon, collinear vertex included. If the collinear
    // vertex were dropped as an optimisation these would be 13.
    for (const f of g.faces) expect(f.order).toBe(SPECTRE_NVERTICES);
  });

  it("satisfies Euler's formula for a connected planar patch", () => {
    const g = gridNewSpectres(6, 6, "0003047Y");
    // V - E + F = 1 counting only the bounded faces (the exterior is excluded).
    expect(g.dots.length - g.edges.length + g.faces.length).toBe(1);
  });
});
