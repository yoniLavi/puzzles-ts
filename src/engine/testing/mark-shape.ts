/**
 * Shape assertions for a hint's board marks — the guards behind
 * `docs/games/hints.md` § "Shade vs ring".
 *
 * **Shape, deliberately, and not colour.** "Some rect carries the hint colour"
 * is satisfied by exactly the thing these guards exist to forbid: a solid fill
 * behind the digits the hint is talking about. It would have passed unchanged
 * through the entire rewrite that removed the fills. So a target asserts *four
 * thin rects and none solid*, and an evidence contour asserts its **side count**,
 * which distinguishes one contour around a `w`-cell region (`2w + 2` sides) from
 * a ring per cell (`4w`) — a game that loses the neighbour test still fails.
 *
 * Dev/test-only; never imported by production code.
 */
import { expect } from "vitest";

interface RectOp {
  op: string;
  colour?: number;
  w?: number;
  h?: number;
}

/** A rect is a mark *side* when it is thin in exactly one direction. A solid
 * fill is thick in both, which is the shape every one of these replaced. */
export function isThin(r: { w?: number; h?: number }): boolean {
  const w = r.w ?? 0;
  const h = r.h ?? 0;
  return Math.min(w, h) * 4 < Math.max(w, h);
}

/** Every rect drawn in `colour`. */
export function markSides(ops: readonly RectOp[], colour: number): RectOp[] {
  return ops.filter((o) => o.op === "rect" && o.colour === colour);
}

/**
 * The cell a deduction acts on is **ringed**: four thin rects in `colour`, and
 * no solid one. `rings` says how many cells are expected to be ringed — a step
 * may act on more than one.
 */
export function expectRing(ops: readonly RectOp[], colour: number, rings = 1): void {
  const sides = markSides(ops, colour);
  expect(sides.length, `${rings} target ring(s) is ${4 * rings} rects`).toBe(4 * rings);
  for (const s of sides)
    expect(isThin(s), `ring side ${s.w}x${s.h} is not thin — that is a fill`).toBe(
      true,
    );
}

/**
 * A contiguous `cells`-cell evidence region is **one contour**: `2·cells + 2`
 * sides for a straight line or rectangle-free run, never `4·cells`.
 *
 * The count is the assertion. A region drawn as one ring per cell, or one that
 * silently lost a cell, both come out at a different number.
 */
export function expectContour(
  ops: readonly RectOp[],
  colour: number,
  cells: number,
): void {
  const sides = markSides(ops, colour);
  expect(
    sides.length,
    `a ${cells}-cell contour is ${2 * cells + 2} sides, not ${4 * cells} per-cell rings`,
  ).toBe(2 * cells + 2);
  for (const s of sides)
    expect(isThin(s), `contour side ${s.w}x${s.h} is not thin — that is a fill`).toBe(
      true,
    );
}
