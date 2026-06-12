// Tier-1 logic tests for the Same Game port: params, scoring, desc,
// gravity/completion, the two-click selection, and move execution.
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { LEFT_BUTTON, RIGHT_BUTTON } from "../../engine/pointer.ts";
import { randomNew } from "../../random/index.ts";
import { executeMove, samegameGame } from "./index.ts";
import {
  check,
  decodeParams,
  encodeParams,
  newDesc,
  newState,
  npoints,
  type SamegameParams,
  type SamegameState,
  type SamegameUi,
  snuggle,
  status,
  validateDesc,
  validateParams,
} from "./state.ts";

const TS = 32; // matches PREFERRED_TILE_SIZE; border = 16.
/** Pixel near the centre of cell (cx,cy) for a null-drawstate click. */
const at = (cx: number, cy: number) => ({ x: cx * TS + 16 + 10, y: cy * TS + 16 + 10 });

function state3x3(desc: string, params?: Partial<SamegameParams>): SamegameState {
  const p: SamegameParams = {
    w: 3,
    h: 3,
    ncols: 3,
    scoresub: 2,
    soluble: true,
    ...params,
  };
  return newState(p, desc);
}

describe("Same Game params", () => {
  it("round-trips and decodes leniently", () => {
    const p: SamegameParams = { w: 15, h: 10, ncols: 4, scoresub: 2, soluble: true };
    expect(encodeParams(p, true)).toBe("15x10c4s2");
    expect(decodeParams("15x10c4s2")).toEqual(p);

    const r: SamegameParams = { w: 15, h: 10, ncols: 4, scoresub: 2, soluble: false };
    expect(encodeParams(r, true)).toBe("15x10c4s2r");
    expect(decodeParams("15x10c4s2r")).toEqual(r);
    // `r` only appears with full encoding.
    expect(encodeParams(r, false)).toBe("15x10c4s2");

    // Lenient: a bare width yields a square board with the defaults.
    expect(decodeParams("5")).toEqual({
      w: 5,
      h: 5,
      ncols: 3,
      scoresub: 2,
      soluble: true,
    });
  });

  it("validates the soluble and random branches", () => {
    expect(
      validateParams({ w: 5, h: 5, ncols: 3, scoresub: 2, soluble: true }, true),
    ).toBeNull();
    // soluble needs ≥ 3 colours.
    expect(
      validateParams({ w: 5, h: 5, ncols: 2, scoresub: 2, soluble: true }, true),
    ).not.toBeNull();
    // random needs area ≥ 2·ncols.
    expect(
      validateParams({ w: 2, h: 2, ncols: 3, scoresub: 2, soluble: false }, true),
    ).not.toBeNull();
    // scoring system must be 1 or 2.
    expect(
      validateParams({ w: 5, h: 5, ncols: 3, scoresub: 3, soluble: true }, true),
    ).not.toBeNull();
  });
});

describe("Same Game scoring", () => {
  it("scores (n-scoresub)² clamped at zero", () => {
    expect(npoints(2, 4)).toBe(4);
    expect(npoints(2, 2)).toBe(0); // a pair scores nothing under (n-2)²
    expect(npoints(2, 1)).toBe(0);
    expect(npoints(1, 3)).toBe(4); // a triple scores 4 under (n-1)²
    expect(npoints(1, 2)).toBe(1);
  });
});

describe("Same Game desc", () => {
  it("round-trips through validate/newState", () => {
    const p: SamegameParams = { w: 3, h: 1, ncols: 3, scoresub: 2, soluble: true };
    expect(validateDesc(p, "1,2,3")).toBeNull();
    expect(newState(p, "1,2,3").tiles).toEqual([1, 2, 3]);
    // Wrong count / out-of-range colour are rejected.
    expect(validateDesc(p, "1,2")).not.toBeNull();
    expect(validateDesc(p, "1,2,9")).not.toBeNull();
  });

  it("a generated soluble board validates and decodes", () => {
    const p: SamegameParams = { w: 5, h: 5, ncols: 3, scoresub: 2, soluble: true };
    const { desc } = newDesc(p, randomNew("samegame-unit-a"));
    expect(validateDesc(p, desc)).toBeNull();
    expect(newState(p, desc).tiles.length).toBe(25);
  });
});

describe("Same Game gravity + completion", () => {
  it("falls tiles down and shuffles columns left", () => {
    // col1 occupied, col0 and col2 empty.
    const tiles = [0, 1, 0, 0, 1, 0, 0, 1, 0];
    snuggle(tiles, 3, 3);
    expect(tiles).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0]);
  });

  it("detects complete and impossible positions", () => {
    expect(check([0, 0, 0, 0], 2, 2)).toEqual({ complete: true, impossible: true });
    // Checkerboard: no two adjacent share a colour ⇒ impossible (stuck).
    expect(check([1, 2, 1, 2, 1, 2, 1, 2, 1], 3, 3)).toEqual({
      complete: false,
      impossible: true,
    });
    // A same-colour pair ⇒ a move remains.
    expect(check([1, 1, 2, 3], 2, 2).impossible).toBe(false);
  });
});

describe("Same Game selection + execution", () => {
  // row0: 1 1 2 / row1: 3 3 3 / row2: 1 2 2
  const DESC = "1,1,2,3,3,3,1,2,2";
  const freshUi = (s: SamegameState) => samegameGame.newUi(s) as SamegameUi;

  it("first click selects a connected group, second click removes it", () => {
    const s = state3x3(DESC, { scoresub: 1 });
    const ui = freshUi(s);
    // Click the colour-3 group (cell (0,1) = index 3).
    const first = samegameGame.interpretMove(s, ui, null, at(0, 1), LEFT_BUTTON);
    expect(first).toBe(UI_UPDATE);
    expect(ui.nselected).toBe(3);
    expect([ui.selected[3], ui.selected[4], ui.selected[5]]).toEqual([
      true,
      true,
      true,
    ]);

    // Click again to confirm removal.
    const move = samegameGame.interpretMove(s, ui, null, at(0, 1), LEFT_BUTTON);
    expect(move).toEqual({ type: "remove", tiles: [3, 4, 5] });
    expect(ui.nselected).toBe(0); // selection cleared after the move

    const next = executeMove(s, move as { type: "remove"; tiles: number[] });
    expect(next.score).toBe(s.score + npoints(1, 3)); // (3-1)² = 4
    expect(s.tiles).toEqual([1, 1, 2, 3, 3, 3, 1, 2, 2]); // source unmutated
    // The cleared row's neighbours fell down.
    expect(next.tiles).toEqual([0, 0, 0, 1, 1, 2, 1, 2, 2]);
  });

  it("a lone tile cannot be selected or removed", () => {
    const s = state3x3(DESC);
    const ui = freshUi(s);
    // Cell (2,0) = index 2 (colour 2) has no same-colour orthogonal neighbour.
    const res = samegameGame.interpretMove(s, ui, null, at(2, 0), LEFT_BUTTON);
    expect(res).toBe(UI_UPDATE);
    expect(ui.nselected).toBe(0);
  });

  it("right-clicking a selection deselects it", () => {
    const s = state3x3(DESC);
    const ui = freshUi(s);
    samegameGame.interpretMove(s, ui, null, at(0, 1), LEFT_BUTTON); // select group
    expect(ui.nselected).toBe(3);
    const res = samegameGame.interpretMove(s, ui, null, at(0, 1), RIGHT_BUTTON);
    expect(res).toBe(UI_UPDATE);
    expect(ui.nselected).toBe(0);
  });

  it("clears the selection across a real transition (changedState)", () => {
    const s = state3x3(DESC);
    const ui = freshUi(s);
    samegameGame.interpretMove(s, ui, null, at(0, 1), LEFT_BUTTON);
    expect(ui.nselected).toBe(3);
    samegameGame.changedState?.(ui, s, s);
    expect(ui.nselected).toBe(0);
    expect(ui.selected.every((b) => !b)).toBe(true);
  });

  it("clearing the last tiles wins (status solved)", () => {
    const p: SamegameParams = { w: 2, h: 1, ncols: 3, scoresub: 2, soluble: true };
    const s = newState(p, "1,1");
    const ui = freshUi(s);
    samegameGame.interpretMove(s, ui, null, at(0, 0), LEFT_BUTTON); // select the pair
    const move = samegameGame.interpretMove(s, ui, null, at(0, 0), LEFT_BUTTON);
    const next = executeMove(s, move as { type: "remove"; tiles: number[] });
    expect(next.complete).toBe(true);
    expect(status(next)).toBe("solved");
    // A stuck board is "ongoing", never "lost".
    expect(status({ ...s, impossible: true })).toBe("ongoing");
  });

  it("statusbarText narrates score, selection, and terminal states", () => {
    const s = state3x3(DESC);
    const ui = freshUi(s);
    expect(samegameGame.statusbarText?.(s, ui)).toBe("Score: 0");
    samegameGame.interpretMove(s, ui, null, at(0, 1), LEFT_BUTTON); // select 3, scoresub 2
    expect(samegameGame.statusbarText?.(s, ui)).toBe("Score: 0  Selected: 3 (1)");
    expect(
      samegameGame.statusbarText?.({ ...s, complete: true, score: 7 }, freshUi(s)),
    ).toBe("COMPLETE! Score: 7");
    expect(
      samegameGame.statusbarText?.({ ...s, impossible: true, score: 4 }, freshUi(s)),
    ).toBe("Cannot move! Score: 4");
  });

  it("executeMove range-checks indices", () => {
    const s = state3x3("1,1,2,3,3,3,1,2,2");
    expect(() => executeMove(s, { type: "remove", tiles: [99] })).toThrow();
  });
});
