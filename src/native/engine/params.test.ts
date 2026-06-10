import { describe, expect, it } from "vitest";
import { parseLeadingInt } from "./params.ts";

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
