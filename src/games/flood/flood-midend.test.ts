// Tier-1 midend integration: drive the real `Midend` with Flood through
// a winning fill, a losing fill (exhausting the limit → "lost"), undo /
// redo, a forced redraw, and a hint.
import { describe, expect, it } from "vitest";
import type { GameDrawing } from "../../engine/game.ts";
import { Midend } from "../../engine/midend.ts";
import { CURSOR_RIGHT, CURSOR_SELECT } from "../../engine/pointer.ts";
import type { ChangeNotification, GameStatus } from "../../engine/types.ts";
import { floodGame } from "./index.ts";

function recordingDrawing() {
  const ops: Array<{ op: string; color?: number }> = [];
  const dr: GameDrawing = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: () => ops.push({ op: "drawUpdate" }),
    clip: () => ops.push({ op: "clip" }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (_r, color) => ops.push({ op: "drawRect", color }),
    drawLine: (_a, _b, color) => ops.push({ op: "drawLine", color }),
    drawPolygon: (_p, color) => ops.push({ op: "drawPolygon", color }),
    drawCircle: (_p, _r, color) => ops.push({ op: "drawCircle", color }),
    drawText: (_p, _o, color) => ops.push({ op: "drawText", color }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  };
  return { dr, ops };
}

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(floodGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  const status = () =>
    (
      [...notes].reverse().find((n) => n.type === "game-state-change") as
        | Extract<ChangeNotification, { type: "game-state-change" }>
        | undefined
    )?.status as GameStatus | undefined;
  const statusBar = () =>
    [...notes].reverse().find((n) => n.type === "status-bar-change") as
      | Extract<ChangeNotification, { type: "status-bar-change" }>
      | undefined;
  return { m, notes, status, statusBar };
}

describe("Flood midend lifecycle", () => {
  it("paints the board on a forced redraw", () => {
    const h = harness();
    // 3×3, three colors, generous limit.
    expect(h.m.newGameFromId("3x3c3m9:011000222,9")).toBeUndefined();
    const { dr, ops } = recordingDrawing();
    h.m.forceRedraw(dr);
    // Background + recessed bevels + one rect per tile.
    expect(ops.filter((o) => o.op === "drawRect").length).toBeGreaterThanOrEqual(9);
    expect(ops.filter((o) => o.op === "drawPolygon").length).toBe(2);
  });

  it("a fill advances the move counter", () => {
    const h = harness();
    expect(h.m.newGameFromId("3x3c3m9:011000222,9")).toBeUndefined();
    expect(h.statusBar()?.statusBarText).toContain("0 / 9 moves");
    // Move the cursor to (1,0) (color 1) and fill.
    expect(h.m.processInput(0, 0, CURSOR_RIGHT)).toBe(true);
    expect(h.m.processInput(0, 0, CURSOR_SELECT)).toBe(true);
    expect(h.statusBar()?.statusBarText).toContain("1 / 9 moves");
  });

  it("completing within the limit reports solved", () => {
    const h = harness();
    // 2×1 board: corner color 0, other cell color 1 — one fill wins.
    expect(h.m.newGameFromId("2x1c3m5:01,5")).toBeUndefined();
    expect(h.status()).toBe("ongoing");
    h.m.processInput(0, 0, CURSOR_RIGHT); // cursor to (1,0)
    h.m.processInput(0, 0, CURSOR_SELECT); // fill color 1
    expect(h.status()).toBe("solved");
    expect(h.statusBar()?.statusBarText).toContain("COMPLETED!");
  });

  it("exhausting the limit unsolved reports lost", () => {
    const h = harness();
    // 3×1 board 0,1,2 with limit 1: a single fill cannot complete it.
    expect(h.m.newGameFromId("3x1c3m1:012,1")).toBeUndefined();
    h.m.processInput(0, 0, CURSOR_RIGHT); // cursor to (1,0), color 1
    h.m.processInput(0, 0, CURSOR_SELECT); // fill color 1 → 1,1,2 (incomplete)
    expect(h.status()).toBe("lost");
    expect(h.statusBar()?.statusBarText).toContain("FAILED!");
  });

  it("undo and redo restore the move count", () => {
    const h = harness();
    expect(h.m.newGameFromId("3x3c3m9:011000222,9")).toBeUndefined();
    h.m.processInput(0, 0, CURSOR_RIGHT);
    h.m.processInput(0, 0, CURSOR_SELECT);
    expect(h.statusBar()?.statusBarText).toContain("1 / 9 moves");
    h.m.undo();
    expect(h.statusBar()?.statusBarText).toContain("0 / 9 moves");
    h.m.redo();
    expect(h.statusBar()?.statusBarText).toContain("1 / 9 moves");
  });

  it("surfaces a hint and renders its SOLNNEXT circle", () => {
    const h = harness();
    expect(h.m.newGameFromId("3x3c3m9:011000222,9")).toBeUndefined();
    expect(h.m.hint()).toBeUndefined();
    const { dr, ops } = recordingDrawing();
    h.m.forceRedraw(dr);
    // The hint highlights the next-fill squares with a separator-color
    // circle (palette index 1).
    expect(ops.some((o) => o.op === "drawCircle" && o.color === 1)).toBe(true);
  });
});
