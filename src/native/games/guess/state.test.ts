/**
 * Tier-1 logic tests for Guess: params codec + validation, desc
 * round-trip, the Knuth feedback formula, and markability under the
 * blank/duplicate rules.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  FEEDBACK_CORRECTCOLOUR,
  FEEDBACK_CORRECTPLACE,
  isMarkable,
  markPegs,
  newDesc,
  newState,
  status,
  validateDesc,
  validateParams,
} from "./state.ts";

describe("params", () => {
  it("round-trips encode/decode", () => {
    const p = {
      ncolours: 8,
      npegs: 5,
      nguesses: 12,
      allowBlank: false,
      allowMultiple: true,
    };
    expect(encodeParams(p, true)).toBe("c8p5g12Bm");
    expect(decodeParams("c8p5g12Bm")).toEqual(p);
  });

  it("decodes blank/duplicate flags and ignores junk", () => {
    expect(decodeParams("c6p4g10bM")).toEqual({
      ncolours: 6,
      npegs: 4,
      nguesses: 10,
      allowBlank: true,
      allowMultiple: false,
    });
    // unknown letters are ignored, defaults fill the rest
    expect(decodeParams("p3")).toEqual({ ...defaultParams(), npegs: 3 });
  });

  it("validates", () => {
    expect(validateParams(defaultParams(), true)).toBeNull();
    expect(validateParams({ ...defaultParams(), ncolours: 1 }, true)).not.toBeNull();
    expect(validateParams({ ...defaultParams(), npegs: 1 }, true)).not.toBeNull();
    expect(validateParams({ ...defaultParams(), ncolours: 11 }, true)).not.toBeNull();
    expect(validateParams({ ...defaultParams(), nguesses: 0 }, true)).not.toBeNull();
    // no duplicates but fewer colours than pegs
    expect(
      validateParams(
        {
          ncolours: 3,
          npegs: 4,
          nguesses: 10,
          allowBlank: false,
          allowMultiple: false,
        },
        true,
      ),
    ).not.toBeNull();
  });
});

describe("desc", () => {
  it("generates a valid, recoverable solution", () => {
    const p = defaultParams();
    const { desc } = newDesc(p, randomNew("seed-1"));
    expect(desc.length).toBe(p.npegs * 2);
    expect(validateDesc(p, desc)).toBeNull();
    const s = newState(p, desc);
    expect(s.solution).toHaveLength(p.npegs);
    for (const c of s.solution) {
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(p.ncolours);
    }
    expect(s.nextGo).toBe(0);
    expect(s.solved).toBe(0);
    expect(status(s)).toBe("ongoing");
  });

  it("honours allowMultiple=false (no repeated colour in the solution)", () => {
    const p = {
      ncolours: 6,
      npegs: 4,
      nguesses: 10,
      allowBlank: false,
      allowMultiple: false,
    };
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const { desc } = newDesc(p, randomNew(seed));
      const s = newState(p, desc);
      expect(new Set(s.solution).size).toBe(p.npegs);
    }
  });

  it("rejects malformed descs", () => {
    const p = defaultParams();
    expect(validateDesc(p, "abc")).not.toBeNull(); // wrong length
    // wrong length but well-formed hex still rejected
    expect(validateDesc(p, "ab")).not.toBeNull();
  });
});

describe("markPegs (Knuth feedback)", () => {
  const ncolours = 6;

  it("scores an all-correct guess as all correct-place", () => {
    const sol = [1, 2, 3, 4];
    const { feedback, ncPlace } = markPegs([1, 2, 3, 4], sol, ncolours);
    expect(ncPlace).toBe(4);
    expect(feedback).toEqual([
      FEEDBACK_CORRECTPLACE,
      FEEDBACK_CORRECTPLACE,
      FEEDBACK_CORRECTPLACE,
      FEEDBACK_CORRECTPLACE,
    ]);
  });

  it("packs black markers before white markers", () => {
    // solution 1 2 3 4; guess 1 2 4 3:
    //   two correct place (1,2), 4 and 3 present but misplaced → 2 white.
    const { feedback, ncPlace } = markPegs([1, 2, 4, 3], [1, 2, 3, 4], ncolours);
    expect(ncPlace).toBe(2);
    expect(feedback).toEqual([
      FEEDBACK_CORRECTPLACE,
      FEEDBACK_CORRECTPLACE,
      FEEDBACK_CORRECTCOLOUR,
      FEEDBACK_CORRECTCOLOUR,
    ]);
  });

  it("counts duplicates via min(#guess, #solution)", () => {
    // solution 1 1 2 3; guess 1 1 1 1: two exact (the first two), the
    // other two 1s have no solution peg left → 0 white.
    const { feedback, ncPlace } = markPegs([1, 1, 1, 1], [1, 1, 2, 3], ncolours);
    expect(ncPlace).toBe(2);
    expect(feedback.filter((f) => f === FEEDBACK_CORRECTCOLOUR)).toHaveLength(0);
  });

  it("scores a colour present but wholly misplaced as white only", () => {
    // solution 1 2 3 4; guess 2 1 4 3 → 0 place, 4 colour.
    const { feedback, ncPlace } = markPegs([2, 1, 4, 3], [1, 2, 3, 4], ncolours);
    expect(ncPlace).toBe(0);
    expect(feedback.filter((f) => f === FEEDBACK_CORRECTCOLOUR)).toHaveLength(4);
  });
});

describe("isMarkable", () => {
  const base = {
    ncolours: 6,
    npegs: 4,
    nguesses: 10,
    allowBlank: false,
    allowMultiple: true,
  };

  it("requires all pegs filled by default", () => {
    expect(isMarkable(base, [1, 2, 3, 0])).toBe(false);
    expect(isMarkable(base, [1, 2, 3, 4])).toBe(true);
  });

  it("allowBlank lets a single peg suffice", () => {
    const p = { ...base, allowBlank: true };
    expect(isMarkable(p, [0, 0, 0, 0])).toBe(false);
    expect(isMarkable(p, [1, 0, 0, 0])).toBe(true);
  });

  it("allowMultiple=false rejects repeated colours", () => {
    const p = { ...base, allowMultiple: false };
    expect(isMarkable(p, [1, 2, 2, 3])).toBe(false);
    expect(isMarkable(p, [1, 2, 3, 4])).toBe(true);
  });
});
