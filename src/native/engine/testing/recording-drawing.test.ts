// Unit-test the shared recording GameDrawing: every primitive is
// captured in draw order, coordinates are integer-rounded, and palette
// indices are resolved to stable rgb() labels (with a visible fallback
// for an undefined index).
import { describe, expect, it } from "vitest";
import type { Colour } from "../../../puzzle/types.ts";
import { RecordingDrawing } from "./recording-drawing.ts";

// index 0 black, 1 white, 2 a clear blue (0.13, 0.5, 0.85).
const PALETTE: Colour[] = [
  [0, 0, 0],
  [1, 1, 1],
  [0.13, 0.5, 0.85],
];

describe("RecordingDrawing", () => {
  it("captures each primitive with rounded coords and resolved colours", () => {
    const dr = new RecordingDrawing(PALETTE);
    dr.startDraw(); // bookkeeping: ignored
    dr.drawRect({ x: 1.4, y: 2.6, w: 3.2, h: 4.8 }, 2);
    dr.drawLine({ x: 0.5, y: 0.5 }, { x: 10.4, y: 0.5 }, 0, 2.7);
    dr.drawText(
      { x: 5.6, y: 7.1 },
      { align: "center", baseline: "alphabetic", fontType: "variable", size: 20.3 },
      1,
      "5",
    );
    dr.drawUpdate({ x: 0, y: 0, w: 1, h: 1 }); // bookkeeping: ignored
    dr.endDraw();

    expect(dr.ops).toEqual([
      { op: "rect", x: 1, y: 3, w: 3, h: 5, colour: 2, rgb: "rgb(33, 128, 217)" },
      {
        op: "line",
        x1: 1,
        y1: 1,
        x2: 10,
        y2: 1,
        thickness: 3,
        colour: 0,
        rgb: "rgb(0, 0, 0)",
      },
      {
        op: "text",
        x: 6,
        y: 7,
        text: "5",
        align: "center",
        baseline: "alphabetic",
        fontType: "variable",
        size: 20,
        colour: 1,
        rgb: "rgb(255, 255, 255)",
      },
    ]);
  });

  it("records polygons and circles with fill/outline labels", () => {
    const dr = new RecordingDrawing(PALETTE);
    dr.drawPolygon(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 8 },
      ],
      2,
      0,
    );
    dr.drawCircle({ x: 4, y: 4 }, 3, 1, -1);

    expect(dr.ops).toEqual([
      {
        op: "polygon",
        points: [
          [0, 0],
          [10, 0],
          [5, 8],
        ],
        fill: 2,
        fillRgb: "rgb(33, 128, 217)",
        outline: 0,
        outlineRgb: "rgb(0, 0, 0)",
      },
      {
        op: "circle",
        cx: 4,
        cy: 4,
        r: 3,
        fill: 1,
        fillRgb: "rgb(255, 255, 255)",
        // -1 ("no colour") has no palette entry; surfaces as a label.
        outline: -1,
        outlineRgb: "colour#-1",
      },
    ]);
  });

  it("records clip/unclip and keeps draw order", () => {
    const dr = new RecordingDrawing(PALETTE);
    dr.clip({ x: 2, y: 2, w: 5, h: 5 });
    dr.drawRect({ x: 2, y: 2, w: 1, h: 1 }, 0);
    dr.unclip();
    expect(dr.ops.map((o) => o.op)).toEqual(["clip", "rect", "unclip"]);
  });

  it("labels an out-of-range palette index instead of throwing", () => {
    const dr = new RecordingDrawing(PALETTE);
    dr.drawRect({ x: 0, y: 0, w: 1, h: 1 }, 99);
    expect(dr.ops[0]).toMatchObject({ colour: 99, rgb: "colour#99" });
  });
});
