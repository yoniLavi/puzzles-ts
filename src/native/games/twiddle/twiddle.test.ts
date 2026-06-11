// Tier-1 behavioural tests for the Twiddle port: params codecs, presets,
// generation, desc round-trip, the block-rotation transform, move
// semantics (rotation + orientation + completion), solve, input mapping,
// and text format.
import { describe, expect, it } from "vitest";
import type { Point } from "../../../puzzle/types.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import {
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { randomNew } from "../../random/index.ts";
import { twiddleGame } from "./index.ts";
import {
  decodeParams,
  doRotate,
  encodeParams,
  isComplete,
  newDesc,
  newState,
  type TwiddleMove,
  type TwiddleParams,
  type TwiddleState,
} from "./state.ts";

const MOD_NUM_KEYPAD = 0x4000;

function params(over: Partial<TwiddleParams> = {}): TwiddleParams {
  return {
    w: 3,
    h: 3,
    n: 2,
    rowsonly: false,
    orientable: false,
    movetarget: 0,
    ...over,
  };
}

/** Make a state directly from a number list (orientations 0), bypassing
 * the generator. */
function stateFromNumbers(
  p: TwiddleParams,
  nums: number[],
  orient?: number[],
): TwiddleState {
  const desc = p.orientable
    ? nums.map((v, i) => `${v}${"uldr"[orient?.[i] ?? 0]}`).join("")
    : nums.join(",");
  return newState(p, desc);
}

function interpret(state: TwiddleState, button: number, p: Point = { x: 0, y: 0 }) {
  const ui = twiddleGame.newUi(state);
  return { move: twiddleGame.interpretMove(state, ui, null, p, button), ui };
}

describe("Twiddle params", () => {
  it("encodes and round-trips with flags", () => {
    expect(encodeParams(params(), false)).toBe("3x3n2");
    expect(encodeParams(params({ rowsonly: true }), false)).toBe("3x3n2r");
    expect(encodeParams(params({ orientable: true }), false)).toBe("3x3n2o");
    expect(encodeParams(params({ n: 3, movetarget: 20 }), false)).toBe("3x3n3m20");

    const round = decodeParams(encodeParams(params({ n: 3, orientable: true }), false));
    expect(round).toMatchObject({ w: 3, h: 3, n: 3, orientable: true });
  });

  it("decodes lenient / square shorthand and the n + flags", () => {
    expect(decodeParams("4")).toMatchObject({ w: 4, h: 4, n: 2 });
    expect(decodeParams("4x4n3")).toMatchObject({ w: 4, h: 4, n: 3 });
    expect(decodeParams("5x4")).toMatchObject({ w: 5, h: 4, n: 2 });
    expect(decodeParams("4x4n2ro")).toMatchObject({
      w: 4,
      h: 4,
      rowsonly: true,
      orientable: true,
    });
    expect(decodeParams("4x4n2m15")).toMatchObject({ movetarget: 15 });
  });

  it("validateParams rejects bad params", () => {
    expect(twiddleGame.validateParams(params({ n: 1 }), true)).not.toBeNull();
    expect(twiddleGame.validateParams(params({ w: 2, n: 3 }), true)).not.toBeNull();
    expect(twiddleGame.validateParams(params({ h: 2, n: 3 }), true)).not.toBeNull();
    expect(twiddleGame.validateParams(params({ movetarget: -1 }), true)).not.toBeNull();
    expect(twiddleGame.validateParams(params(), true)).toBeNull();
  });
});

describe("Twiddle presets", () => {
  it("offers the eight upstream presets, all valid", () => {
    const menu = twiddleGame.presets();
    expect(menu.submenu).toHaveLength(8);
    for (const item of menu.submenu ?? []) {
      expect(item.params).toBeDefined();
      expect(twiddleGame.validateParams(item.params as TwiddleParams, true)).toBeNull();
    }
  });
});

describe("Twiddle generation", () => {
  it("terminates for every preset and produces a non-solved scramble", () => {
    for (const item of twiddleGame.presets().submenu ?? []) {
      const p = item.params as TwiddleParams;
      const { desc } = newDesc(p, randomNew(`twiddle-gen-${encodeParams(p, false)}`));
      const state = newState(p, desc);
      expect(state.numbers).toHaveLength(p.w * p.h);
      expect(isComplete(state.numbers, state.orient, p.w * p.h, p.orientable)).toBe(
        false,
      );
    }
  });

  it("is deterministic for a fixed seed", () => {
    const p = params({ w: 4, h: 4 });
    const a = newDesc(p, randomNew("same")).desc;
    const b = newDesc(p, randomNew("same")).desc;
    expect(a).toBe(b);
  });

  it("round-trips a generated desc through newState/validateDesc", () => {
    for (const orientable of [false, true]) {
      const p = params({ w: 4, h: 4, orientable });
      const { desc } = newDesc(p, randomNew(`rt-${orientable}`));
      expect(twiddleGame.validateDesc(p, desc)).toBeNull();
      const state = newState(p, desc);
      expect(state.numbers).toHaveLength(16);
    }
  });

  it("validateDesc rejects malformed descs", () => {
    const p = params({ w: 3, h: 3 });
    expect(twiddleGame.validateDesc(p, "1,2,3,4,5,6,7,8")).not.toBeNull(); // too few
    expect(twiddleGame.validateDesc(p, "1,2,3,4,5,6,7,8,9,10")).not.toBeNull(); // excess
    const po = params({ w: 3, h: 3, orientable: true });
    expect(twiddleGame.validateDesc(po, "1,2,3,4,5,6,7,8,9")).not.toBeNull(); // needs letters
  });
});

describe("Twiddle doRotate", () => {
  it("rotates a 2×2 block and inverts cleanly", () => {
    const nums = Int32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const orient = new Uint8Array(9);
    doRotate(nums, orient, 3, 3, 2, false, 0, 0, 1);
    // Block (0,0): 1,2 / 4,5 → after one clockwise quarter-turn.
    expect(Array.from(nums)).toEqual([2, 5, 3, 1, 4, 6, 7, 8, 9]);
    doRotate(nums, orient, 3, 3, 2, false, 0, 0, -1);
    expect(Array.from(nums)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("advances orientation in orientable mode", () => {
    const nums = Int32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const orient = new Uint8Array(9);
    doRotate(nums, orient, 3, 3, 2, true, 0, 0, 1);
    // Every moved tile's orientation advances by +1.
    for (const i of [0, 1, 3, 4]) expect(orient[i]).toBe(1);
    for (const i of [2, 5, 6, 7, 8]) expect(orient[i]).toBe(0);
  });

  it("advances the centre tile's orientation for odd n", () => {
    const nums = Int32Array.from(Array.from({ length: 9 }, (_, i) => i + 1));
    const orient = new Uint8Array(9);
    doRotate(nums, orient, 3, 3, 3, true, 0, 0, 1);
    expect(orient[4]).toBe(1); // centre of the 3×3 block at (0,0)
  });
});

describe("Twiddle moves", () => {
  it("rotate advances the move count and is pure", () => {
    const p = params();
    const s0 = stateFromNumbers(p, [2, 5, 3, 1, 4, 6, 7, 8, 9]);
    const before = Array.from(s0.numbers);
    const s1 = twiddleGame.executeMove(s0, { type: "rotate", x: 0, y: 0, dir: -1 });
    expect(Array.from(s0.numbers)).toEqual(before); // source unmutated
    expect(s1.moveCount).toBe(1);
    // dir -1 at (0,0) reverses the scramble → solved.
    expect(Array.from(s1.numbers)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(s1.completed).toBe(1);
    expect(twiddleGame.status(s1)).toBe("solved");
  });

  it("orientable completion needs every tile upright", () => {
    const p = params({ orientable: true });
    // Numbers ordered but a tile mis-oriented → not complete.
    const s = stateFromNumbers(
      p,
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
    );
    expect(isComplete(s.numbers, s.orient, 9, true)).toBe(false);
    const upright = stateFromNumbers(p, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(isComplete(upright.numbers, upright.orient, 9, true)).toBe(true);
  });

  it("rowsonly treats equal numbers as ordered", () => {
    const p = params({ rowsonly: true });
    // Solved rowsonly 3×3: row numbers 1,1,1 / 2,2,2 / 3,3,3.
    const s = stateFromNumbers(p, [1, 1, 1, 2, 2, 2, 3, 3, 3]);
    expect(isComplete(s.numbers, s.orient, 9, false)).toBe(true);
  });

  it("solve snaps to ascending, clears orientation, sets usedSolve", () => {
    const p = params({ orientable: true });
    const s = stateFromNumbers(
      p,
      [5, 2, 3, 1, 4, 6, 9, 8, 7],
      [1, 2, 3, 0, 1, 2, 3, 0, 1],
    );
    const solved = twiddleGame.executeMove(s, { type: "solve" });
    expect(Array.from(solved.numbers)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Array.from(solved.orient)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(solved.usedSolve).toBe(true);
    expect(solved.completed).toBe(1);
    // No completion flash after a solve.
    expect(twiddleGame.flashLength?.(s, solved, 1, twiddleGame.newUi(s))).toBe(0);
  });

  it("flashes on a genuine completion", () => {
    const p = params();
    const s0 = stateFromNumbers(p, [2, 5, 3, 1, 4, 6, 7, 8, 9]);
    const s1 = twiddleGame.executeMove(s0, { type: "rotate", x: 0, y: 0, dir: -1 });
    expect(twiddleGame.flashLength?.(s0, s1, 1, twiddleGame.newUi(s0))).toBeGreaterThan(
      0,
    );
  });
});

describe("Twiddle input", () => {
  const p = params({ w: 4, h: 4, n: 2 });
  const s = stateFromNumbers(
    p,
    Array.from({ length: 16 }, (_, i) => ((i + 3) % 16) + 1),
  );

  it("maps a centred click to the region whose centre it lands in", () => {
    // Tile size 48, border 24. A click at the centre of the region whose
    // top-left is (1,1): block centre is at coord(1)+ts = 24+48+24 = ... use
    // the region-centre pixel. Region (1,1) spans tiles (1,1)-(2,2); its
    // centre is at pixel (coord(1)+ts, coord(1)+ts) = (72+48?, ...). Simpler:
    // click the centre of tile (1,1)'s top-left → maps via the (n-1) offset.
    const ts = 48;
    const border = 24;
    // Centre of the 2×2 region with top-left (1,1) = pixel of the shared
    // corner between the four tiles = coord(2) = 2*48+24 = 120 in each axis.
    const px = 2 * ts + border;
    const { move } = interpret(s, LEFT_BUTTON, { x: px, y: px });
    expect(move).toEqual({ type: "rotate", x: 1, y: 1, dir: 1 });
  });

  it("right-click rotates the other way", () => {
    const ts = 48;
    const border = 24;
    const px = 2 * ts + border;
    const { move } = interpret(s, RIGHT_BUTTON, { x: px, y: px });
    expect(move).toMatchObject({ type: "rotate", dir: -1 });
  });

  it("ignores a click whose region would fall off the edge", () => {
    // Click far outside the board.
    const { move } = interpret(s, LEFT_BUTTON, { x: 5, y: 5 });
    expect(move).toBeNull();
  });

  it("moves the cursor (clamped) and reveals it", () => {
    const ui = twiddleGame.newUi(s);
    // From (0,0): left is clamped (stays), but cursor becomes visible.
    const m1 = twiddleGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_LEFT);
    expect(m1).toBe(UI_UPDATE);
    expect(ui.curVisible).toBe(true);
    expect(ui.curX).toBe(0);
    // Right moves to 1 (origin space is (w-n+1)=3 wide: 0..2).
    twiddleGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_RIGHT);
    expect(ui.curX).toBe(1);
  });

  it("select rotates at the cursor once visible", () => {
    const ui = twiddleGame.newUi(s);
    ui.curVisible = true;
    ui.curX = 1;
    ui.curY = 0;
    expect(
      twiddleGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_SELECT),
    ).toEqual({ type: "rotate", x: 1, y: 0, dir: 1 });
    expect(
      twiddleGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_SELECT2),
    ).toEqual({ type: "rotate", x: 1, y: 0, dir: -1 });
  });

  it("first select only reveals the cursor", () => {
    const ui = twiddleGame.newUi(s);
    expect(twiddleGame.interpretMove(s, ui, null, { x: 0, y: 0 }, CURSOR_SELECT)).toBe(
      UI_UPDATE,
    );
    expect(ui.curVisible).toBe(true);
  });

  it("maps the corner letter keys", () => {
    const ch = (c: string) => c.charCodeAt(0);
    expect(interpret(s, ch("a")).move).toEqual({ type: "rotate", x: 0, y: 0, dir: 1 });
    expect(interpret(s, ch("A")).move).toEqual({ type: "rotate", x: 0, y: 0, dir: -1 });
    expect(interpret(s, ch("b")).move).toEqual({
      type: "rotate",
      x: p.w - p.n,
      y: 0,
      dir: 1,
    });
    expect(interpret(s, ch("d")).move).toEqual({
      type: "rotate",
      x: p.w - p.n,
      y: p.h - p.n,
      dir: 1,
    });
  });

  it("maps numpad corner rotations", () => {
    // numpad 7 → top-left.
    expect(interpret(s, MOD_NUM_KEYPAD | 0x37).move).toEqual({
      type: "rotate",
      x: 0,
      y: 0,
      dir: 1,
    });
    // numpad 5 → centre (w-n and h-n are 2, both even).
    expect(interpret(s, MOD_NUM_KEYPAD | 0x35).move).toEqual({
      type: "rotate",
      x: 1,
      y: 1,
      dir: 1,
    });
  });
});

describe("Twiddle game object", () => {
  it("reports the expected flags and id", () => {
    expect(twiddleGame.id).toBe("twiddle");
    expect(twiddleGame.wantsStatusbar).toBe(true);
    expect(twiddleGame.isTimed).toBe(false);
    expect(twiddleGame.canSolve).toBe(true);
    expect(twiddleGame.canFormatAsText).toBe(true);
    // Permutation puzzle: no mistake checking, no hint.
    expect(twiddleGame.findMistakes).toBeUndefined();
    expect(twiddleGame.hint).toBeUndefined();
  });

  it("formats as text, with orientation arrows when orientable", () => {
    const plain = twiddleGame.textFormat?.(
      stateFromNumbers(params(), [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    );
    expect(plain).toBe("1 2 3\n4 5 6\n7 8 9");

    // 2×2 orientable, orientations up/left/down/right → arrows ^ < v >.
    const oriented = twiddleGame.textFormat?.(
      stateFromNumbers(
        params({ w: 2, h: 2, orientable: true }),
        [1, 2, 3, 4],
        [0, 1, 2, 3],
      ),
    );
    expect(oriented).toBe("1^ 2<\n3v 4>");
  });

  it("solve returns the solve move", () => {
    const result = twiddleGame.solve?.(
      stateFromNumbers(params(), [2, 5, 3, 1, 4, 6, 7, 8, 9]),
      stateFromNumbers(params(), [2, 5, 3, 1, 4, 6, 7, 8, 9]),
    );
    expect(result).toEqual({ ok: true, move: { type: "solve" } as TwiddleMove });
  });
});
