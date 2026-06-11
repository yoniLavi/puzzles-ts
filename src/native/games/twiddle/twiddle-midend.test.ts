// Tier-1 midend integration: drive the real `Midend` with the Twiddle
// game through a rotation, undo, redo, and solve, asserting the
// statusbar notifications and that a redraw paints the board.
import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { Midend } from "../../engine/midend.ts";
import { twiddleGame } from "./index.ts";

// 'A' rotates the top-left 2×2 block anticlockwise (dir -1).
const KEY_A = 0x41;

function recordingDrawing() {
  const ops: Array<{ op: string; colour?: number }> = [];
  const dr: GameDrawing = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: () => ops.push({ op: "drawUpdate" }),
    clip: () => ops.push({ op: "clip" }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (_r, colour) => ops.push({ op: "drawRect", colour }),
    drawLine: (_a, _b, colour) => ops.push({ op: "drawLine", colour }),
    drawPolygon: (_p, colour) => ops.push({ op: "drawPolygon", colour }),
    drawCircle: (_p, _r, colour) => ops.push({ op: "drawCircle", colour }),
    drawText: (_p, _o, colour) => ops.push({ op: "drawText", colour }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  };
  return { dr, ops };
}

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(twiddleGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  const status = () =>
    [...notes].reverse().find((n) => n.type === "status-bar-change") as
      | Extract<ChangeNotification, { type: "status-bar-change" }>
      | undefined;
  return { m, notes, status };
}

describe("Twiddle midend lifecycle", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    // A 3×3 board one anticlockwise turn of block (0,0) from solved:
    // 'A' (dir -1) at (0,0) restores 1..9.
    expect(h.m.newGameFromId("3x3n2:2,5,3,1,4,6,7,8,9")).toBeUndefined();
  });

  it("paints the board on a forced redraw", () => {
    const { dr, ops } = recordingDrawing();
    h.m.forceRedraw(dr);
    expect(ops.some((o) => o.op === "drawRect")).toBe(true);
    // Bevel triangles per tile plus the two recessed-border bevels.
    expect(ops.filter((o) => o.op === "drawPolygon").length).toBeGreaterThan(2);
    // One number per cell.
    expect(ops.filter((o) => o.op === "drawText").length).toBe(9);
  });

  it("rotates on a key and reports the move in the status bar", () => {
    expect(h.status()?.statusBarText).toContain("Moves: 0");
    expect(h.m.processInput(0, 0, KEY_A)).toBe(true);
    expect(h.status()?.statusBarText).toContain("COMPLETED!");
  });

  it("undo and redo restore the move count", () => {
    h.m.processInput(0, 0, KEY_A);
    expect(h.status()?.statusBarText).toContain("COMPLETED!");
    h.m.undo();
    expect(h.status()?.statusBarText).toContain("Moves: 0");
    h.m.redo();
    expect(h.status()?.statusBarText).toContain("COMPLETED!");
  });

  it("solve snaps to the solved board and reports auto-solve", () => {
    expect(h.m.solve()).toBeUndefined();
    expect(h.status()?.statusBarText).toContain("Moves since auto-solve");
  });
});
