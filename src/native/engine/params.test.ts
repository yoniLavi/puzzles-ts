import { describe, expect, it } from "vitest";
import type { ParamConfigItem } from "./game.ts";
import { dimensionParamConfig, parseDimensions, parseLeadingInt } from "./params.ts";

describe("parseLeadingInt", () => {
  it("parses a WxH param string in two hops", () => {
    const a = parseLeadingInt("10x7", 0);
    expect(a).toEqual({ value: 10, next: 2 });
    const b = parseLeadingInt("10x7", a.next + 1);
    expect(b).toEqual({ value: 7, next: 4 });
  });

  it("returns 0 with no advance on a non-digit, matching atoi", () => {
    expect(parseLeadingInt("dn", 0)).toEqual({ value: 0, next: 0 });
  });

  it("stops at the first non-digit", () => {
    expect(parseLeadingInt("7x7dn", 2)).toEqual({ value: 7, next: 3 });
  });

  it("handles a digit run extending to the end of the string", () => {
    expect(parseLeadingInt("123", 0)).toEqual({ value: 123, next: 3 });
  });
});

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

  it("honours a non-zero start offset", () => {
    // e.g. a game that consumed a leading kind-letter first.
    expect(parseDimensions("c3x3", 1)).toEqual({ w: 3, h: 3, next: 4 });
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
