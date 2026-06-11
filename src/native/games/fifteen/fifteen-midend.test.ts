// Tier-1 midend integration: drive the real `Midend` with the Fifteen
// game through a slide, undo, redo, and a hint, asserting the
// statusbar notifications and that a redraw paints the board.
import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { Midend } from "../../engine/midend.ts";
import { CURSOR_LEFT } from "../../engine/pointer.ts";
import { fifteenGame } from "./index.ts";

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
  const m = new Midend(fifteenGame);
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

describe("Fifteen midend lifecycle", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    // A 4×4 board with the gap at (0,3): tiles 13,14,15 are shifted one
    // cell right of home, so a single rightward slide is legal and the
    // board is not already solved.
    expect(
      h.m.newGameFromId("4x4:1,2,3,4,5,6,7,8,9,10,11,12,0,13,14,15"),
    ).toBeUndefined();
  });

  it("paints the board on a forced redraw", () => {
    const { dr, ops } = recordingDrawing();
    h.m.forceRedraw(dr);
    // A background rect, the two recessed-border bevels, and a numbered
    // bevelled tile (3 polygons each) for every non-gap cell.
    expect(ops.some((o) => o.op === "drawRect")).toBe(true);
    expect(ops.filter((o) => o.op === "drawPolygon").length).toBeGreaterThan(2);
    expect(ops.filter((o) => o.op === "drawText").length).toBe(15);
  });

  it("slides on a cursor key and reports the move in the status bar", () => {
    expect(h.status()?.statusBarText).toContain("Moves: 0");
    // Default arrow semantics: CURSOR_LEFT moves a tile left, i.e. the
    // gap moves right — legal from (0,3).
    expect(h.m.processInput(0, 0, CURSOR_LEFT)).toBe(true);
    expect(h.status()?.statusBarText).toContain("Moves: 1");
  });

  it("undo and redo restore the move count", () => {
    h.m.processInput(0, 0, CURSOR_LEFT);
    expect(h.status()?.statusBarText).toContain("Moves: 1");
    h.m.undo();
    expect(h.status()?.statusBarText).toContain("Moves: 0");
    h.m.redo();
    expect(h.status()?.statusBarText).toContain("Moves: 1");
  });

  it("surfaces a hint and renders it with the hint colour", () => {
    // hint() returns undefined on success.
    expect(h.m.hint()).toBeUndefined();
    const { dr, ops } = recordingDrawing();
    h.m.forceRedraw(dr);
    // The hinted tile is filled with COL_HINT (palette index 4).
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 4)).toBe(true);
  });
});
