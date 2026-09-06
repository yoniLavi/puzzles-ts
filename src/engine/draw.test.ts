import { describe, expect, it } from "vitest";
import {
  type BevelBounds,
  drawRecessedBorder,
  drawRectOutline,
  drawThickRectOutline,
} from "./draw.ts";
import type { GameDrawing } from "./game.ts";

interface RectOp {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

/** A `GameDrawing` that records only `drawRect` — what the thick outline emits. */
function recordingRects(): { dr: GameDrawing; ops: RectOp[] } {
  const ops: RectOp[] = [];
  const dr = {
    drawRect: (r: { x: number; y: number; w: number; h: number }, color: number) =>
      ops.push({ ...r, color }),
  } as unknown as GameDrawing;
  return { dr, ops };
}

interface PolyOp {
  op: "polygon";
  points: { x: number; y: number }[];
  fill: number;
}
interface LineOp {
  op: "line";
  a: { x: number; y: number };
  b: { x: number; y: number };
  color: number;
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
      color: number,
    ) => ops.push({ op: "line", a: { ...a }, b: { ...b }, color }),
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
    for (const o of ops) expect((o as LineOp).color).toBe(3);
  });
});

describe("drawThickRectOutline", () => {
  /*
   * This is tested here rather than through a game because of what the
   * promotion measured: with the helper wired into all eight games, deleting a
   * whole side of the frame failed **one** test in the collection (Crossing's).
   * The other seven draw their error or mistake frame in a code path no
   * snapshot reaches — Tents' and Magnets' render-scenario snapshots contain
   * zero mistake ops. A primitive eight games share needs a check at its own
   * level, not eight chances that one game's frame happens to be observed.
   */
  it("draws four bands that cover exactly the frame, and nothing inside it", () => {
    const { dr, ops } = recordingRects();
    drawThickRectOutline(dr, 10, 20, 30, 40, 3, 7);

    expect(ops).toHaveLength(4);
    for (const o of ops) expect(o.color).toBe(7);

    // Every pixel of the border ring is painted, and no interior pixel is.
    const painted = (px: number, py: number) =>
      ops.some((o) => px >= o.x && px < o.x + o.w && py >= o.y && py < o.y + o.h);
    for (let px = 10; px < 40; px++) {
      for (let py = 20; py < 60; py++) {
        const onRing = px < 13 || px >= 37 || py < 23 || py >= 57;
        expect(painted(px, py), `(${px},${py})`).toBe(onRing);
      }
    }
  });

  it("stays inside the rect it was given", () => {
    const { dr, ops } = recordingRects();
    drawThickRectOutline(dr, 0, 0, 8, 8, 2, 1);
    for (const o of ops) {
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.x + o.w).toBeLessThanOrEqual(8);
      expect(o.y + o.h).toBeLessThanOrEqual(8);
    }
  });
});
