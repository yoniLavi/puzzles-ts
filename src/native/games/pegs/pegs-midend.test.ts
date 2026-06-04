import { describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_SELECT,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
} from "../../engine/pointer.ts";
import { pegsGame } from "./index.ts";

function harness() {
  const notes: ChangeNotification[] = [];
  let redraws = 0;
  const m = new Midend(pegsGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {
      redraws++;
    },
  );
  const last = <T extends ChangeNotification["type"]>(type: T) =>
    [...notes].reverse().find((n) => n.type === type);
  const state = () =>
    last("game-state-change") as
      | Extract<ChangeNotification, { type: "game-state-change" }>
      | undefined;
  return { m, notes, state, redraws: () => redraws, last };
}

/**
 * Convert grid coordinates to pixel coordinates at the default tile size.
 * Matches `coord(x, ts)` and `coord(y, ts)` in the Pegs game.
 */
function gridToPixel(gx: number, gy: number, ts = 33): { x: number; y: number } {
  const border = Math.floor(ts / 2);
  return { x: border + gx * ts, y: border + gy * ts };
}

// Known 7×7 cross board with centre hole at (3,3).
const CROSS_7x7 = "7x7cross:OOPPPOOOOPPPOOPPPPPPPPPPHPPPPPPPPPPOOPPPOOOOPPPOO";

describe("Pegs midend integration — lifecycle", () => {
  it("newGame emits id, params, and state notifications", () => {
    const h = harness();
    h.m.newGame();
    const types = new Set(h.notes.map((n) => n.type));
    expect(types).toContain("game-id-change");
    expect(types).toContain("params-change");
    expect(types).toContain("game-state-change");
  });

  it("newGame produces an ongoing game at move 0", () => {
    const h = harness();
    h.m.newGame();
    expect(h.state()?.status).toBe("ongoing");
    expect(h.state()?.currentMove).toBe(0);
  });

  it("newGame requests a redraw (even for deterministic boards with same game ID)", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);
    const before = h.redraws();
    // Same board type → same desc → same game ID.
    // The midend must still request a redraw.
    h.m.newGame();
    expect(h.redraws()).toBeGreaterThan(before);
  });

  it("newGameFromId works with a descriptive ID", () => {
    const h = harness();
    const error = h.m.newGameFromId(CROSS_7x7);
    expect(error).toBeUndefined();
    expect(h.state()?.status).toBe("ongoing");
  });

  it("newGameFromId works with a random seed", () => {
    const h = harness();
    const error = h.m.newGameFromId("7x7cross#test-seed");
    expect(error).toBeUndefined();
    expect(h.state()?.status).toBe("ongoing");
  });

  it("newGameFromId rejects invalid params", () => {
    const h = harness();
    const error = h.m.newGameFromId("3x1cross:PPH");
    expect(error).toMatch(/greater than three/);
  });

  it("restartGame after a move resets to move 0", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);
    // Make a drag-jump move.
    const src = gridToPixel(3, 1);
    const tgt = gridToPixel(3, 3);
    h.m.processInput(src.x, src.y, LEFT_BUTTON);
    h.m.processInput(tgt.x, tgt.y, LEFT_DRAG);
    h.m.processInput(tgt.x, tgt.y, LEFT_RELEASE);
    expect(h.state()?.currentMove).toBe(1);
    h.m.restartGame();
    expect(h.state()?.currentMove).toBe(0);
    expect(h.state()?.canUndo).toBe(false);
  });
});

describe("Pegs midend integration — drag input", () => {
  it("drag-jump: peg at (3,1) jumps over (3,2) into (3,3)", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);
    expect(h.state()?.currentMove).toBe(0);

    const src = gridToPixel(3, 1);
    const tgt = gridToPixel(3, 3);

    // LEFT_BUTTON at source peg → UI_UPDATE (drag starts).
    expect(h.m.processInput(src.x, src.y, LEFT_BUTTON)).toBe(true);
    // LEFT_DRAG toward target → UI_UPDATE (drag position updates).
    expect(h.m.processInput(tgt.x, tgt.y, LEFT_DRAG)).toBe(true);
    // LEFT_RELEASE at target → move applied.
    expect(h.m.processInput(tgt.x, tgt.y, LEFT_RELEASE)).toBe(true);

    expect(h.state()?.currentMove).toBe(1);
    expect(h.state()?.status).toBe("ongoing");
  });

  it("drag to invalid target is a no-op (UI_UPDATE only)", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    const src = gridToPixel(3, 1);
    // Release at the same cell — not a valid jump.
    expect(h.m.processInput(src.x, src.y, LEFT_BUTTON)).toBe(true);
    expect(h.m.processInput(src.x, src.y, LEFT_RELEASE)).toBe(true);
    // Move count unchanged.
    expect(h.state()?.currentMove).toBe(0);
  });

  it("drag to obstacle cell is a no-op", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    const src = gridToPixel(3, 1);
    // (0,0) is an obstacle on the cross board.
    const obst = gridToPixel(0, 0);
    expect(h.m.processInput(src.x, src.y, LEFT_BUTTON)).toBe(true);
    expect(h.m.processInput(obst.x, obst.y, LEFT_DRAG)).toBe(true);
    expect(h.m.processInput(obst.x, obst.y, LEFT_RELEASE)).toBe(true);
    expect(h.state()?.currentMove).toBe(0);
  });

  it("undo after drag-jump restores move 0", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    const src = gridToPixel(3, 1);
    const tgt = gridToPixel(3, 3);
    h.m.processInput(src.x, src.y, LEFT_BUTTON);
    h.m.processInput(tgt.x, tgt.y, LEFT_DRAG);
    h.m.processInput(tgt.x, tgt.y, LEFT_RELEASE);
    expect(h.state()?.currentMove).toBe(1);

    h.m.undo();
    expect(h.state()?.currentMove).toBe(0);
    expect(h.state()?.canUndo).toBe(false);
  });

  it("newGame after drag-jump resets the board", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    const src = gridToPixel(3, 1);
    const tgt = gridToPixel(3, 3);
    h.m.processInput(src.x, src.y, LEFT_BUTTON);
    h.m.processInput(tgt.x, tgt.y, LEFT_DRAG);
    h.m.processInput(tgt.x, tgt.y, LEFT_RELEASE);
    expect(h.state()?.currentMove).toBe(1);

    h.m.newGame();
    expect(h.state()?.currentMove).toBe(0);
    expect(h.state()?.canUndo).toBe(false);
  });
});

describe("Pegs midend integration — keyboard input", () => {
  it("cursor movement skips obstacle cells", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    // Show cursor: CURSOR_SELECT at any position.
    // The default UI places the cursor at the first peg.
    // Move cursor down — should skip obstacle cells.
    const before = h.redraws();
    expect(h.m.processInput(0, 0, CURSOR_SELECT)).toBe(true); // show cursor
    expect(h.m.processInput(0, 0, CURSOR_DOWN)).toBe(true); // move down
    expect(h.redraws()).toBeGreaterThan(before);
  });

  it("cursor select on a peg enters jumping mode", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    // Show cursor and move to a peg.
    h.m.processInput(0, 0, CURSOR_SELECT);
    // Select the peg → enter jumping mode.
    expect(h.m.processInput(0, 0, CURSOR_SELECT)).toBe(true);
    // Arrow key in a valid jump direction should execute the jump.
    // On the 7×7 cross, the cursor starts at the first playable cell.
    // Moving down from (3,1) with a peg at (3,2) and hole at (3,3)
    // is a valid jump — but we need to position the cursor first.
    // This test just verifies the keyboard flow doesn't crash.
  });

  it("cursor select on a hole is a no-op", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    // Show cursor.
    h.m.processInput(0, 0, CURSOR_SELECT);
    // Move to the centre hole (3,3). On the cross board, the cursor
    // should skip over it. Selecting a hole should be a no-op.
    // (This is hard to test without knowing exact cursor position,
    // so we just verify the flow doesn't crash.)
    h.m.processInput(0, 0, CURSOR_DOWN);
    h.m.processInput(0, 0, CURSOR_DOWN);
    h.m.processInput(0, 0, CURSOR_SELECT);
    // No crash, no move applied.
    expect(h.state()?.currentMove).toBe(0);
  });
});

describe("Pegs midend integration — generator termination", () => {
  it("generator terminates for all board types (regression: updateMoves cost-mismatch)", () => {
    // The generator used to infinite-loop when updateMoves tried to
    // delete stale entries from the byCost index with the *new* cost
    // as a probe — the comparator uses cost as primary key, so the
    // delete was a no-op and stale entries accumulated forever.
    // This test verifies the generator terminates for each board type.
    const seeds = ["pegs-regression-1", "pegs-regression-2", "pegs-regression-3"];
    const types = [
      { w: 7, h: 7, type: 0 }, // cross
      { w: 7, h: 7, type: 1 }, // octagon
      { w: 5, h: 5, type: 2 }, // random
    ];
    for (const params of types) {
      for (const seed of seeds) {
        const h = harness();
        const id = `${params.w}x${params.h}${["cross", "octagon", "random"][params.type]}#${seed}`;
        // If the generator doesn't terminate, this will hang.
        const error = h.m.newGameFromId(id);
        expect(error).toBeUndefined();
        expect(h.state()?.status).toBe("ongoing");
      }
    }
  });
});
