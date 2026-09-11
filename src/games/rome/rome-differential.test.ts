/**
 * Rome — gated differential against a frozen snapshot of C-generated reference
 * boards (`__fixtures__/rome-c-reference.json`).
 *
 * Rome's generator is solver-gated at every clue removal *and* gated out of
 * the tier below, so the strongest meaningful bar is that the TS `newDesc`
 * reproduces the C engine's description byte-for-byte for the same seed. That
 * one assertion validates, together: the three generation stages and their
 * RNG draw order, all seven deduction rules and their firing order, both disjoint-set forests (including
 * the union-by-size root identity that naked-pairs reads as an element), and
 * the two-part run-length codec (docs/games/testing.md § "Byte-match: fidelity where there is a right answer").
 *
 * The follow-on assertions add what the desc alone cannot say: that the
 * description validates, and that the TS solver grades the board at exactly
 * the tier the C solver did.
 *
 * The fixture is **frozen and cannot be regenerated**: the C build and the
 * harness that captured it are gone (see `engine/testing/differential.ts`).
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/rome-c-reference.json" with { type: "json" };
import { newRomeDesc } from "./generator.ts";
import { romeSolve, validateDesc } from "./solver.ts";
import { DIFFCOUNT, type RomeParams, readDesc, STATUS_COMPLETE } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  diff: number;
  seed: string;
  desc: string;
  /** The lowest tier at which the C solver finishes the board. */
  solverDiff: number;
  /** The C's own generation wall-clock, carried for reference (never
   * asserted — a clock assertion measures the box, not the code). */
  genMs: number;
}

const data = cReference as { fixtures: Fixture[] };

/** Lowest tier at which the TS solver finishes the board. */
function grade(p: RomeParams, desc: string): number {
  for (let d = 0; d < DIFFCOUNT; d++) {
    const { board } = readDesc(p, desc);
    if (romeSolve(board, d) === STATUS_COMPLETE) return d;
  }
  return -1;
}

describeDescDifferential<Fixture, RomeParams>({
  title: "Rome differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h} d${f.diff} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, diff: f.diff }),
  newDesc: newRomeDesc,
  extra: (f, p) => {
    expect(validateDesc(p, f.desc)).toBeNull();
    // The TS solver must reach the C solver's verdict at every tier, not just
    // produce a solvable board.
    expect(grade(p, f.desc)).toBe(f.solverDiff);
  },
});
