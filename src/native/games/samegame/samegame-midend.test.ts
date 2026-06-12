// Tier-1 midend integration: drive the real `Midend` with Same Game
// through a selection (status bar must update on the selection-only
// UI_UPDATE — design R2), a removal that scores and compacts, undo, and a
// win that reports "solved".
import { describe, expect, it } from "vitest";
import type { ChangeNotification, GameStatus } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/midend.ts";
import { LEFT_BUTTON } from "../../engine/pointer.ts";
import { samegameGame } from "./index.ts";

const TS = 32; // the midend sets the preferred tile size (32); border = 16.
const at = (cx: number, cy: number) => ({ x: cx * TS + 16 + 10, y: cy * TS + 16 + 10 });

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(samegameGame);
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
  return { m, notes, status, statusBar };
}

describe("Same Game midend lifecycle", () => {
  it("updates the status bar on a selection-only UI update", () => {
    const h = harness();
    // row0: 1 1 2 / row1: 3 3 3 / row2: 1 2 2, scoring (n-1)².
    expect(h.m.newGameFromId("3x3c3s1:1,1,2,3,3,3,1,2,2")).toBeUndefined();
    expect(h.statusBar()).toBe("Score: 0");
    // Select the colour-3 group (cell (0,1)); no history move, but the
    // status bar must reflect the selection.
    expect(h.m.processInput(at(0, 1).x, at(0, 1).y, LEFT_BUTTON)).toBe(true);
    expect(h.statusBar()).toBe("Score: 0  Selected: 3 (4)"); // (3-1)² under s1
  });

  it("removes a group, scoring and compacting, and undo restores it", () => {
    const h = harness();
    h.m.newGameFromId("3x3c3s1:1,1,2,3,3,3,1,2,2");
    h.m.processInput(at(0, 1).x, at(0, 1).y, LEFT_BUTTON); // select group of 3
    h.m.processInput(at(0, 1).x, at(0, 1).y, LEFT_BUTTON); // confirm removal
    expect(h.statusBar()).toBe("Score: 4"); // (3-1)² = 4
    h.m.undo();
    expect(h.statusBar()).toBe("Score: 0");
  });

  it("reports solved when the board is cleared", () => {
    const h = harness();
    h.m.newGameFromId("2x1c3s2:1,1");
    h.m.processInput(at(0, 0).x, at(0, 0).y, LEFT_BUTTON); // select the pair
    h.m.processInput(at(0, 0).x, at(0, 0).y, LEFT_BUTTON); // remove → empty board
    expect(h.status()).toBe("solved");
    expect(h.statusBar()).toContain("COMPLETE!");
  });
});
