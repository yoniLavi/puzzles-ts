import { describe, expect, it } from "vitest";
import { parseDimensions, parseLeadingInt } from "./params.ts";

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
