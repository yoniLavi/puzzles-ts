import { describe, expect, it } from "vitest";
import {
  blankGame,
  checkComplete,
  cloneState,
  decodeGame,
  encodeGame,
  F_DOT,
  F_DOT_BLACK,
  F_EDGE_SET,
  idx,
  inUi,
  isVerticalEdge,
  rebuildDots,
  SpaceType,
  spaceTypeAt,
} from "./state.ts";

describe("Galaxies geometry helpers", () => {
  it("spaceTypeAt classifies cells by parity", () => {
    expect(spaceTypeAt(0, 0)).toBe(SpaceType.Vertex);
    expect(spaceTypeAt(2, 0)).toBe(SpaceType.Vertex);
    expect(spaceTypeAt(0, 1)).toBe(SpaceType.Edge);
    expect(spaceTypeAt(1, 0)).toBe(SpaceType.Edge);
    expect(spaceTypeAt(1, 1)).toBe(SpaceType.Tile);
    expect(spaceTypeAt(3, 5)).toBe(SpaceType.Tile);
  });

  it("isVerticalEdge follows IS_VERTICAL_EDGE(x % 2 == 0)", () => {
    expect(isVerticalEdge(0)).toBe(true); // vertical edge at even col
    expect(isVerticalEdge(2)).toBe(true);
    expect(isVerticalEdge(1)).toBe(false);
    expect(isVerticalEdge(3)).toBe(false);
  });

  it("blankGame sets border edges only", () => {
    const s = blankGame(3, 3);
    expect(s.sx).toBe(7);
    expect(s.sy).toBe(7);
    // Outer perimeter edges set; interior unset.
    for (let x = 0; x < s.sx; x++) {
      const t0 = spaceTypeAt(x, 0);
      const t1 = spaceTypeAt(x, s.sy - 1);
      if (t0 === SpaceType.Edge) {
        expect(s.flags[idx(s, x, 0)] & F_EDGE_SET).toBeTruthy();
      }
      if (t1 === SpaceType.Edge) {
        expect(s.flags[idx(s, x, s.sy - 1)] & F_EDGE_SET).toBeTruthy();
      }
    }
    // Interior edge should be unset.
    expect(s.flags[idx(s, 2, 1)] & F_EDGE_SET).toBeFalsy();
  });
});

describe("Galaxies desc encode/decode", () => {
  it("round-trips a manually-crafted dot bitmap", () => {
    // 5x5: place a white dot at (3,3), a black dot at (5,5).
    const s = blankGame(5, 5);
    s.flags[idx(s, 3, 3)] |= F_DOT;
    s.flags[idx(s, 5, 5)] |= F_DOT;
    s.flags[idx(s, 5, 5)] |= F_DOT_BLACK;
    s.dots = rebuildDots(s);
    const desc = encodeGame(s);

    const decoded = blankGame(5, 5);
    const err = decodeGame(decoded, desc);
    expect(err).toBeNull();
    decoded.dots = rebuildDots(decoded);
    expect(decoded.dots).toEqual([
      { x: 3, y: 3 },
      { x: 5, y: 5 },
    ]);
    expect(decoded.flags[idx(decoded, 5, 5)] & F_DOT_BLACK).toBeTruthy();
    expect(decoded.flags[idx(decoded, 3, 3)] & F_DOT_BLACK).toBeFalsy();
  });

  it("rejects out-of-grid desc", () => {
    const s = blankGame(3, 3);
    // 'z' = 25 spaces (no dot), then 'b' = 1 space + white dot. On
    // a 3x3 grid the inner subcell area is 5x5 = 25 cells, so the
    // second token lands beyond the grid.
    const err = decodeGame(s, "zb");
    expect(err).toContain("Too much data");
  });

  it("rejects invalid characters", () => {
    const s = blankGame(3, 3);
    expect(decodeGame(s, "1")).toContain("Invalid characters");
  });
});

describe("checkComplete", () => {
  it("trivially complete: a single-dot puzzle with the dot at centre", () => {
    // 3x3 with one white dot at the centre (3,3). Outer border edges
    // are already set; no interior edges means everything is one
    // region centered on (3,3), which is symmetric.
    const s = blankGame(3, 3);
    s.flags[idx(s, 3, 3)] |= F_DOT;
    s.dots = rebuildDots(s);
    const { complete, colours } = checkComplete(s, true);
    expect(complete).toBe(true);
    expect(colours).toBeDefined();
    if (!colours) return;
    expect(Array.from(colours)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("clone preserves completion state", () => {
    const s = blankGame(3, 3);
    s.flags[idx(s, 3, 3)] |= F_DOT;
    s.dots = rebuildDots(s);
    const c = cloneState(s);
    expect(c.dots).toEqual(s.dots);
    expect(c.flags).not.toBe(s.flags);
    // Mutating clone doesn't affect original.
    c.flags[idx(c, 3, 3)] |= F_DOT_BLACK;
    expect(s.flags[idx(s, 3, 3)] & F_DOT_BLACK).toBeFalsy();
  });

  it("inUi excludes the perimeter", () => {
    const s = blankGame(3, 3);
    expect(inUi(s, 0, 1)).toBe(false);
    expect(inUi(s, 1, 0)).toBe(false);
    expect(inUi(s, 1, 1)).toBe(true);
    expect(inUi(s, s.sx - 1, 1)).toBe(false);
  });
});
