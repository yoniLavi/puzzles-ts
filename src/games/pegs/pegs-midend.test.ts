import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
} from "../../engine/pointer.ts";
import type { ChangeNotification } from "../../engine/types.ts";
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

// Known 7×7 cross board with center hole at (3,3).
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
    // A bound Pegs applies whatever it is asked to do — the board would be
    // 40,000 cells. Deliberately NOT the "greater than three" bound, which
    // Pegs gates on `full`: see the next test.
    const error = h.m.newGameFromId("200x200cross:PPH");
    expect(error).toMatch(/unreasonably large/);
  });

  it("newGameFromId accepts a described board below the generable minimum", () => {
    // Pegs gates its size and board-type bounds on `full`, because they say
    // what its *generator* can build — a 3x1 cross board is not something
    // `newDesc` would ever produce. But `PPH` is a complete, legal board (two
    // pegs, one hole, and a legal jump), so nothing is generated and nothing
    // is refused.
    const h = harness();
    expect(h.m.newGameFromId("3x1cross:PPH")).toBeUndefined();
    expect(h.m.getParams()).toBe("3x1cross");
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
  // The cursor starts on (2,0), the cross board's first playable cell. The
  // midend keeps the cursor to itself, so these tests read its position off
  // the jump it makes: from the peg at (3,1), down over (3,2) into the hole.

  it("cursor movement skips obstacle cells", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    // (1,0) is an obstacle, so LEFT leaves the cursor on (2,0), and RIGHT,
    // DOWN bring it to (3,1). Had it moved, the jump below would not exist.
    for (const key of [CURSOR_LEFT, CURSOR_RIGHT, CURSOR_DOWN, CURSOR_SELECT]) {
      expect(h.m.processInput(0, 0, key)).toBe(true);
    }
    expect(h.m.processInput(0, 0, CURSOR_DOWN)).toBe(true);
    expect(h.state()?.currentMove).toBe(1);
  });

  it("cursor select on a peg enters jumping mode", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    h.m.processInput(0, 0, CURSOR_RIGHT);
    h.m.processInput(0, 0, CURSOR_DOWN);
    // Select the peg at (3,1): the next arrow is a jump, not a cursor move.
    expect(h.m.processInput(0, 0, CURSOR_SELECT)).toBe(true);
    expect(h.m.processInput(0, 0, CURSOR_DOWN)).toBe(true);
    expect(h.state()?.currentMove).toBe(1);
  });

  it("cursor select on a hole is a no-op", () => {
    const h = harness();
    h.m.newGameFromId(CROSS_7x7);

    // To the center hole at (3,3), where select is not consumed.
    for (const key of [CURSOR_RIGHT, CURSOR_DOWN, CURSOR_DOWN, CURSOR_DOWN]) {
      h.m.processInput(0, 0, key);
    }
    expect(h.m.processInput(0, 0, CURSOR_SELECT)).toBe(false);
    expect(h.state()?.currentMove).toBe(0);
  });
});

describe("Pegs midend integration — generator termination", () => {
  it("generator terminates for all board types (regression: updateMoves cost-mismatch)", () => {
    // The generator's move set orders by cost first, so `updateMoves` must
    // drop a stale entry by its *old* cost. A probe carrying the new cost
    // misses it, and the stale entries keep the generator going for ever.
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
