// Tier-1 midend integration: drive the real `Midend` with Mosaic through
// a full keyboard solve, undo/redo, the Solve command, the mistake
// overlay, and a forced redraw.
import { describe, expect, it } from "vitest";
import type { GameDrawing } from "../../engine/game.ts";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
} from "../../engine/pointer.ts";
import type { ChangeNotification, GameStatus } from "../../engine/types.ts";
import { mosaicGame } from "./index.ts";

function recordingDrawing() {
  const ops: Array<{ op: string; color?: number }> = [];
  const dr: GameDrawing = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: () => {},
    clip: () => {},
    unclip: () => {},
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
  const m = new Midend(mosaicGame);
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
    (
      [...notes].reverse().find((n) => n.type === "status-bar-change") as
        | Extract<ChangeNotification, { type: "status-bar-change" }>
        | undefined
    )?.statusBarText;
  // Keyboard driver: track the cursor ourselves and walk it to each cell.
  const cursor = { x: 0, y: 0, shown: false };
  const selectAt = (x: number, y: number, double = false) => {
    if (!cursor.shown) {
      // First select only reveals the cursor at (0,0).
      m.processInput(0, 0, CURSOR_LEFT);
      cursor.shown = true;
    }
    while (cursor.x < x) {
      m.processInput(0, 0, CURSOR_RIGHT);
      cursor.x++;
    }
    while (cursor.x > x) {
      m.processInput(0, 0, CURSOR_LEFT);
      cursor.x--;
    }
    while (cursor.y < y) {
      m.processInput(0, 0, CURSOR_DOWN);
      cursor.y++;
    }
    m.processInput(0, 0, double ? CURSOR_SELECT2 : CURSOR_SELECT);
  };
  return { m, status, statusBar, selectAt };
}

// 3×3 all-black board: every clue saturates its neighborhood.
const GAME_ID = "3x3:464696464";

describe("Mosaic midend lifecycle", () => {
  it("paints the board on a forced redraw", () => {
    const h = harness();
    expect(h.m.newGameFromId(GAME_ID)).toBeUndefined();
    const { dr, ops } = recordingDrawing();
    h.m.forceRedraw(dr);
    expect(ops.filter((o) => o.op === "drawRect").length).toBeGreaterThanOrEqual(9);
    expect(ops.filter((o) => o.op === "drawText").length).toBe(9);
  });

  it("tracks the clue count and completes via keyboard marking", () => {
    const h = harness();
    expect(h.m.newGameFromId(GAME_ID)).toBeUndefined();
    expect(h.statusBar()).toBe("Clues left: 9");
    expect(h.status()).toBe("ongoing");
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        h.selectAt(x, y);
      }
    }
    expect(h.status()).toBe("solved");
    expect(h.statusBar()).toBe("COMPLETED!");
  });

  it("undo and redo restore the clue count", () => {
    const h = harness();
    expect(h.m.newGameFromId(GAME_ID)).toBeUndefined();
    // Marking the top-left 2×2 satisfies the corner clue (4) and no other;
    // the fourth mark is the move undone.
    h.selectAt(0, 0);
    h.selectAt(1, 0);
    h.selectAt(0, 1);
    h.selectAt(1, 1);
    expect(h.statusBar()).toBe("Clues left: 8");
    h.m.undo();
    expect(h.statusBar()).toBe("Clues left: 9");
    h.m.redo();
    expect(h.statusBar()).toBe("Clues left: 8");
  });

  it("solves via the Solve command", () => {
    const h = harness();
    expect(h.m.newGameFromId(GAME_ID)).toBeUndefined();
    expect(h.m.solve()).toBeUndefined();
    expect(h.statusBar()).toBe("Auto solved");
    expect(h.status()).toBe("solved-with-help");
  });

  it("recomputes mistakes as marks change", () => {
    const h = harness();
    expect(h.m.newGameFromId(GAME_ID)).toBeUndefined();
    h.selectAt(1, 0, true); // blank a cell that must be black
    expect(h.m.findMistakes()).toBe(1);
    h.selectAt(1, 0, true); // double-toggle again: blank → black, now correct
    expect(h.m.findMistakes()).toBe(0);
  });
});
