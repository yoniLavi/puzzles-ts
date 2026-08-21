import { describe, expect, it } from "vitest";
import { assertNever, rejectMove } from "./assert-never.ts";

type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };

/** A complete dispatch. The `default` arm type-checks *because* every member is
 * handled above it — that is the whole guarantee, and it is asserted by this
 * file compiling, not by any runtime expectation below. */
function area(s: Shape): number {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.r * s.r;
    case "square":
      return s.side * s.side;
    default:
      return assertNever(s, "test: area");
  }
}

/**
 * The same dispatch with an arm removed — the mistake this helper exists to
 * catch, which is a *type* error and so cannot be observed by running anything.
 *
 * `@ts-expect-error` inverts it into an assertion: `tsc` fails this file if the
 * line ever stops erroring, which is what would happen if `assertNever` took
 * `unknown` instead of `never` (or if a caller reached for a `as never` cast).
 * A runtime-only test would pass just as happily in that world.
 */
function incompleteArea(s: Shape): number {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.r * s.r;
    // "square" deliberately unhandled.
    default:
      // @ts-expect-error `s` is narrowed to `{ kind: "square" }`, not `never`.
      return assertNever(s, "test: incompleteArea");
  }
}

describe("assertNever", () => {
  it("passes every handled member through, so the guard costs nothing", () => {
    expect(area({ kind: "square", side: 3 })).toBe(9);
    expect(area({ kind: "circle", r: 1 })).toBeCloseTo(Math.PI);
  });

  it("throws naming the context and the value", () => {
    const foreign = { kind: "hexagon" } as unknown as Shape;
    expect(() => area(foreign)).toThrow('test: area: unrecognised {"kind":"hexagon"}');
  });

  it("still refuses at runtime when the compile-time arm is missing", () => {
    // The companion to the `@ts-expect-error` above: the unhandled member is a
    // type error *and* a refusal, not one or the other.
    expect(() => incompleteArea({ kind: "square", side: 3 })).toThrow(
      /test: incompleteArea: unrecognised/,
    );
  });
});

describe("rejectMove", () => {
  it("reads the same as assertNever, for a move type with nothing to narrow", () => {
    expect(() => rejectMove({ ops: null }, "map: executeMove")).toThrow(
      'map: executeMove: unrecognised {"ops":null}',
    );
  });

  it("describes a value JSON cannot render, rather than throwing over it", () => {
    // The message is read on a path where something has already gone wrong. A
    // second throw from inside the reporter replaces the one legible error with
    // a confusing one, so `describe` must survive anything.
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(() => rejectMove(circular, "x: executeMove")).toThrow(
      "x: executeMove: unrecognised [object Object]",
    );
    expect(() => rejectMove(undefined, "x: executeMove")).toThrow(
      "x: executeMove: unrecognised undefined",
    );
  });

  it("truncates a huge move so the game's name is not buried", () => {
    // A solve move carries a whole grid; an off-union value can carry anything.
    const huge = { grid: Array.from({ length: 2000 }, (_, i) => i % 10) };
    let message = "";
    try {
      rejectMove(huge, "solo: executeMove");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message.startsWith("solo: executeMove: unrecognised {")).toBe(true);
    expect(message.endsWith("…")).toBe(true);
    expect(message.length).toBeLessThan(300);
  });
});
