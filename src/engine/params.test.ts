import { describe, expect, it } from "vitest";
import type { ParamConfigItem } from "./game.ts";
import { atof, dimensionParamConfig, formatG, parseDimensions } from "./params.ts";

describe("parseDimensions", () => {
  it("parses a rectangular WxH prefix", () => {
    expect(parseDimensions("10x7")).toEqual({ w: 10, h: 7, next: 4 });
  });

  it("falls back to a square when there is no x", () => {
    expect(parseDimensions("4")).toEqual({ w: 4, h: 4, next: 1 });
  });

  it("leaves next at the trailing suffix for further parsing", () => {
    const dims = parseDimensions("4x4m10");
    expect(dims.w).toBe(4);
    expect(dims.h).toBe(4);
    expect("4x4m10"[dims.next]).toBe("m");
  });

  it("honors a non-zero start offset", () => {
    // e.g. a game that consumed a leading kind-letter first.
    expect(parseDimensions("c3x3", 1)).toEqual({ w: 3, h: 3, next: 4 });
  });
});

describe("atof", () => {
  // The whole point of this helper is the last case. `Number.parseFloat` yields
  // `NaN` on garbage, and `NaN < min` and `NaN > max` are *both* false, so a
  // typo in a custom-params box would slip past every bound check in the game's
  // `validateParams` and reach the generator. Returning 0 makes it fail the
  // low bound and produce the game's own message.
  it.each([
    ["0.25", 0.25],
    ["  1.5", 1.5],
    ["3", 3],
    ["0.5abc", 0.5], // C stops at the first non-float character
    ["-0.25", -0.25],
    ["", 0],
    ["abc", 0],
    ["--", 0],
  ])("atof(%o) === %o", (input, expected) => {
    expect(atof(input)).toBe(expected);
  });

  it("never returns NaN, whatever it is fed", () => {
    for (const s of ["", " ", "x", "e5", ".", "-", "NaN", "Infinity!"]) {
      expect(Number.isNaN(atof(s))).toBe(false);
    }
  });
});

describe("formatG", () => {
  // C's `%g`, and emphatically not `String(x)`. A float param encoded with full
  // double precision reads back through `atof` as a *different* number than the
  // one that generated the board, so the game ID stops naming the board it came
  // from. Six significant digits, trailing zeros stripped, exponential below
  // 1e-4 and at/above 1e6.
  it.each([
    [0, "0"],
    [1, "1"],
    [0.5, "0.5"],
    [1 / 3, "0.333333"],
    [2 / 3, "0.666667"], // rounded, not truncated
    [1.25, "1.25"],
    [100000, "100000"],
    [1000000, "1e+06"], // switches at 1e6
    [0.0001, "0.0001"],
    [0.00001, "1e-05"], // switches below 1e-4
    [1.5e-7, "1.5e-07"],
    [-1 / 3, "-0.333333"],
  ])("formatG(%o) === %o", (value, expected) => {
    expect(formatG(value)).toBe(expected);
  });

  it("round-trips through atof to within %g's six significant digits", () => {
    // The property the encoder exists for: what a game writes into an ID is
    // what reading that ID back gives it.
    for (const v of [0.5, 0.25, 1 / 3, 0.1, 12.3456, 1e-5, 3.75]) {
      expect(atof(formatG(v))).toBeCloseTo(v, 5);
      // And the encoding is stable: re-encoding what we read back is a fixpoint.
      expect(formatG(atof(formatG(v)))).toBe(formatG(v));
    }
  });
});

describe("dimensionParamConfig", () => {
  interface Plain {
    w: number;
    h: number;
  }
  interface Renamed {
    width: number;
    height: number;
    other: string;
  }

  function items<P>(cfg: ParamConfigItem<P>[]) {
    const width = cfg[0];
    const height = cfg[1];
    if (width?.type !== "string" || height?.type !== "string")
      throw new Error("both dimension items are text fields");
    return { width, height };
  }

  it("emits Width then Height as text fields, on the C-compatible keywords", () => {
    const cfg = dimensionParamConfig<Plain>();
    expect(cfg.map((i) => [i.kw, i.name, i.type])).toEqual([
      ["width", "Width", "string"],
      ["height", "Height", "string"],
    ]);
  });

  it("reads and writes w/h by default", () => {
    const { width, height } = items(dimensionParamConfig<Plain>());
    const p: Plain = { w: 4, h: 6 };
    expect([width.get(p), height.get(p)]).toEqual(["4", "6"]);
    width.set(p, "11");
    height.set(p, "9");
    expect(p).toEqual({ w: 11, h: 9 });
  });

  it("parses with atoi semantics, leaving the game's validateParams to object", () => {
    // Empty/garbage must become 0 — not NaN, which slips past every < / >
    // bound check a game's validateParams performs.
    const { width } = items(dimensionParamConfig<Plain>());
    const p: Plain = { w: 4, h: 6 };
    width.set(p, "");
    expect(p.w).toBe(0);
    width.set(p, "12abc");
    expect(p.w).toBe(12);
    width.set(p, "junk");
    expect(p.w).toBe(0);
  });

  it("drives differently-named fields through a field map, in the given order", () => {
    // Mosaic (`width`/`height`) and Unruly (`w2`/`h2`) keep their own field
    // names; the helper is widened rather than the games renamed.
    const { width, height } = items(
      dimensionParamConfig<Renamed>({ w: "width", h: "height" }),
    );
    const p: Renamed = { width: 3, height: 3, other: "untouched" };
    width.set(p, "20");
    height.set(p, "15");
    expect(p).toEqual({ width: 20, height: 15, other: "untouched" });
    expect([width.get(p), height.get(p)]).toEqual(["20", "15"]);
  });
});
