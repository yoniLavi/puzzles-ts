// Tier-1 midend integration test: drive the real `Midend` with the Cube
// game through a roll, undo, and redo, asserting the state/statusbar
// notifications and that a redraw paints the board.
import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { Midend } from "../../engine/midend.ts";
import { CURSOR_RIGHT } from "../../engine/pointer.ts";
import { cubeGame } from "./index.ts";

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
  const m = new Midend(cubeGame);
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

describe("Cube midend lifecycle", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    // 3x3 cube grid, no blue squares, start in the centre (index 4) where
    // every orthogonal roll is legal.
    expect(h.m.newGameFromId("c3x3:000,4")).toBeUndefined();
  });

  it("paints the board on a forced redraw", () => {
    const { dr, ops } = recordingDrawing();
    h.m.forceRedraw(dr);
    // A background rect plus a polygon per grid square (9) and the solid.
    expect(ops.filter((o) => o.op === "drawPolygon").length).toBeGreaterThan(9);
    expect(ops.some((o) => o.op === "drawRect")).toBe(true);
  });

  it("rolls on a cursor key and reports the move in the status bar", () => {
    expect(h.status()?.statusBarText).toContain("Moves: 0");
    expect(h.m.processInput(0, 0, CURSOR_RIGHT)).toBe(true);
    expect(h.status()?.statusBarText).toContain("Moves: 1");
  });

  it("undo and redo restore the move count", () => {
    h.m.processInput(0, 0, CURSOR_RIGHT);
    expect(h.status()?.statusBarText).toContain("Moves: 1");
    h.m.undo();
    expect(h.status()?.statusBarText).toContain("Moves: 0");
    h.m.redo();
    expect(h.status()?.statusBarText).toContain("Moves: 1");
  });
});
