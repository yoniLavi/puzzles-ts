import { describe, expect, it } from "vitest";
import { type BevelBounds, drawRecessedBorder, drawRectOutline } from "./draw.ts";
import type { GameDrawing } from "./game.ts";

interface PolyOp {
  op: "polygon";
  points: { x: number; y: number }[];
  fill: number;
}
interface LineOp {
  op: "line";
  a: { x: number; y: number };
  b: { x: number; y: number };
  colour: number;
}
type Op = PolyOp | LineOp;

function recordingDrawing(): { dr: GameDrawing; ops: Op[] } {
  const ops: Op[] = [];
  const dr = {
    drawPolygon: (points: { x: number; y: number }[], fill: number) =>
      ops.push({ op: "polygon", points: points.map((p) => ({ ...p })), fill }),
    drawLine: (
      a: { x: number; y: number },
      b: { x: number; y: number },
      colour: number,
    ) => ops.push({ op: "line", a: { ...a }, b: { ...b }, colour }),
  } as unknown as GameDrawing;
  return { dr, ops };
}

describe("drawRecessedBorder", () => {
  const bounds: BevelBounds = { left: 10, top: 10, right: 110, bottom: 110 };
  const inset = 20;
  const HI = 1;
  const LO = 2;

  it("draws two filled pentagons, highlight then lowlight", () => {
    const { dr, ops } = recordingDrawing();
    drawRecessedBorder(dr, bounds, inset, HI, LO);

    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ op: "polygon", fill: HI });
    expect(ops[1]).toMatchObject({ op: "polygon", fill: LO });
    expect((ops[0] as PolyOp).points).toHaveLength(5);
    expect((ops[1] as PolyOp).points).toHaveLength(5);
  });

  it("places the highlight wedge on the top/right corner", () => {
    const { dr, ops } = recordingDrawing();
    drawRecessedBorder(dr, bounds, inset, HI, LO);
    expect((ops[0] as PolyOp).points).toEqual([
      { x: 110, y: 110 },
      { x: 110, y: 10 },
      { x: 90, y: 30 },
      { x: 30, y: 90 },
      { x: 10, y: 110 },
    ]);
  });

  it("highlight and lowlight wedges share the two diagonal vertices", () => {
    const { dr, ops } = recordingDrawing();
    drawRecessedBorder(dr, bounds, inset, HI, LO);
    const hi = (ops[0] as PolyOp).points;
    const lo = (ops[1] as PolyOp).points;
    // The inner diagonal edge (the two inset vertices) is common to both.
    expect(hi).toContainEqual({ x: 90, y: 30 });
    expect(hi).toContainEqual({ x: 30, y: 90 });
    expect(lo).toContainEqual({ x: 90, y: 30 });
    expect(lo).toContainEqual({ x: 30, y: 90 });
  });
});

describe("drawRectOutline", () => {
  it("draws four lines with inclusive corners (x..x+w-1, y..y+h-1)", () => {
    const { dr, ops } = recordingDrawing();
    drawRectOutline(dr, 5, 7, 10, 20, 3);

    expect(ops).toHaveLength(4);
    // Far corner is inclusive: (5+10-1, 7+20-1) = (14, 26).
    const xs = ops.flatMap((o) => [(o as LineOp).a.x, (o as LineOp).b.x]);
    const ys = ops.flatMap((o) => [(o as LineOp).a.y, (o as LineOp).b.y]);
    expect(Math.max(...xs)).toBe(14);
    expect(Math.max(...ys)).toBe(26);
    expect(Math.min(...xs)).toBe(5);
    expect(Math.min(...ys)).toBe(7);
    for (const o of ops) expect((o as LineOp).colour).toBe(3);
  });
});
