// Tier-1 midend integration: drive the real `Midend` with Palisade —
// new game, a mouse edge toggle, undo/redo, the Solve command, a
// save/load round-trip, and the mistake count on a fresh board.
import { describe, expect, it } from "vitest";
import type { ChangeNotification, GameStatus } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { Midend } from "../../engine/midend.ts";
import { LEFT_BUTTON } from "../../engine/pointer.ts";
import { randomNew } from "../../random/index.ts";
import { palisadeGame } from "./index.ts";
import { newDesc } from "./solver.ts";

function recordingDrawing() {
  const ops: Array<{ op: string }> = [];
  const dr: GameDrawing = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: () => {},
    clip: () => {},
    unclip: () => {},
    drawRect: () => ops.push({ op: "drawRect" }),
    drawLine: () => ops.push({ op: "drawLine" }),
    drawPolygon: () => ops.push({ op: "drawPolygon" }),
    drawCircle: () => ops.push({ op: "drawCircle" }),
    drawText: () => ops.push({ op: "drawText" }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  };
  return { dr, ops };
}

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(palisadeGame);
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
  return { m, status, statusBar };
}

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const P = { w: 5, h: 5, k: 5 };
const ID = `5x5n5:${newDesc(P, randomNew("palisade-midend")).desc}`;

// A click near the right edge of cell (1,1) at the preferred tile size
// (48): margin 24, so x≈118 lands on the R edge, y≈96 on the cell row.
const CLICK_X = 118;
const CLICK_Y = 96;

describe("Palisade midend lifecycle", () => {
  it("paints the board and shows the region-size status bar", () => {
    const h = harness();
    expect(h.m.newGameFromId(ID)).toBeUndefined();
    expect(h.statusBar()).toBe("Region size: 5");
    expect(h.status()).toBe("ongoing");

    const { dr, ops } = recordingDrawing();
    h.m.forceRedraw(dr);
    expect(ops.filter((o) => o.op === "drawRect").length).toBeGreaterThan(20);
    expect(ops.some((o) => o.op === "drawText")).toBe(true);
  });

  it("toggles an edge, then undo reverts and redo reapplies it", () => {
    const h = harness();
    expect(h.m.newGameFromId(ID)).toBeUndefined();
    const before = h.m.saveGame();

    expect(h.m.processInput(CLICK_X, CLICK_Y, LEFT_BUTTON)).toBe(true);
    const afterMove = h.m.saveGame();
    expect(bytesEqual(afterMove, before)).toBe(false);

    // Undo restores the board: clicking the same edge again reproduces
    // the moved state (the save also equality-checks the move log).
    h.m.undo();
    expect(h.m.processInput(CLICK_X, CLICK_Y, LEFT_BUTTON)).toBe(true);
    expect(bytesEqual(h.m.saveGame(), afterMove)).toBe(true);

    // And redo after a plain undo reapplies the move.
    h.m.undo();
    h.m.redo();
    expect(bytesEqual(h.m.saveGame(), afterMove)).toBe(true);
  });

  it("solves via the Solve command", () => {
    const h = harness();
    expect(h.m.newGameFromId(ID)).toBeUndefined();
    expect(h.m.solve()).toBeUndefined();
    expect(h.status()).toBe("solved-with-help");
  });

  it("reports no mistakes on a fresh board (only the rim is drawn)", () => {
    const h = harness();
    expect(h.m.newGameFromId(ID)).toBeUndefined();
    expect(h.m.findMistakes()).toBe(0);
  });

  it("round-trips through save/load", () => {
    const h = harness();
    expect(h.m.newGameFromId(ID)).toBeUndefined();
    h.m.processInput(CLICK_X, CLICK_Y, LEFT_BUTTON);
    const saved = h.m.saveGame();

    const h2 = harness();
    expect(h2.m.loadGame(saved)).toBeUndefined();
    expect(bytesEqual(h2.m.saveGame(), saved)).toBe(true);
  });
});
