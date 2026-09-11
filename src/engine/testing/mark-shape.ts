/**
 * Shape assertions for a hint's board marks — the guards behind
 * `docs/games/hints.md` § "Shade vs ring".
 *
 * **Shape, deliberately, and not color.** "Some rect carries the hint color"
 * is satisfied by exactly the thing these guards exist to forbid: a solid fill
 * behind the digits the hint is talking about. So a target asserts *four thin
 * rects and none solid*, and an evidence contour asserts its **side count**,
 * which distinguishes one contour around a `w`-cell region (`2w + 2` sides) from
 * a ring per cell (`4w`) — a game that loses the neighbor test still fails.
 *
 * Dev/test-only; never imported by production code.
 */
import { expect } from "vitest";

interface RectOp {
  op: string;
  color?: number;
  w?: number;
  h?: number;
}

/** A rect is a mark *side* when it is thin in exactly one direction; a solid
 * fill is thick in both. */
export function isThin(r: { w?: number; h?: number }): boolean {
  const w = r.w ?? 0;
  const h = r.h ?? 0;
  return Math.min(w, h) * 4 < Math.max(w, h);
}

/** Every rect drawn in `color`. */
export function markSides(ops: readonly RectOp[], color: number): RectOp[] {
  return ops.filter((o) => o.op === "rect" && o.color === color);
}

/**
 * The cell a deduction acts on is **ringed**: four thin rects in `color`, and
 * no solid one. `rings` says how many cells are expected to be ringed — a step
 * may act on more than one.
 */
export function expectRing(ops: readonly RectOp[], color: number, rings = 1): void {
  const sides = markSides(ops, color);
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
  color: number,
  cells: number,
): void {
  const sides = markSides(ops, color);
  expect(
    sides.length,
    `a ${cells}-cell contour is ${2 * cells + 2} sides, not ${4 * cells} per-cell rings`,
  ).toBe(2 * cells + 2);
  for (const s of sides)
    expect(isThin(s), `contour side ${s.w}x${s.h} is not thin — that is a fill`).toBe(
      true,
    );
}
