// Tier-1 tests for the shared border-marking mechanic (Palisade + Separate).
//
// The games' own suites already exercise this through their differentials and
// render snapshots, which is what proved the extraction was a no-op. These tests
// exist for the opposite reason: to pin the mechanic's contract *directly*, so a
// future change to it fails here — naming the rule it broke — rather than only
// as a moved fixture in two games.
import { describe, expect, it } from "vitest";
import {
  BORDER,
  type BorderGridState,
  type BorderGridUi,
  buildDsf,
  DISABLED,
  FLIP,
  initBorders,
  interpretBorderGridInput,
  pointerEdge,
  selectEdge,
} from "./border-grid.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
  newCursor,
  RIGHT_BUTTON,
} from "./pointer.ts";

const TS = 32;
const grid = (w: number, h: number, borders?: Uint8Array): BorderGridState => ({
  w,
  h,
  borders: borders ?? initBorders(w, h),
});
const ui = (x = 1, y = 1, show = false): BorderGridUi => ({
  cursor: newCursor(x, y, show),
});

/** Center of the edge between cell (x,y) and its neighbor in direction dir. */
const edgeMidpoint = (x: number, y: number, dir: number) => {
  const m = Math.floor(TS / 2);
  const cx = m + x * TS + TS / 2;
  const cy = m + y * TS + TS / 2;
  const dx = [0, +1, 0, -1][dir] * (TS / 2 - 2);
  const dy = [-1, 0, +1, 0][dir] * (TS / 2 - 2);
  return { x: Math.round(cx + dx), y: Math.round(cy + dy) };
};

describe("border vocabulary", () => {
  it("FLIP is an involution that faces the opposite direction", () => {
    for (const dir of [0, 1, 2, 3]) {
      expect(FLIP(FLIP(dir))).toBe(dir);
      expect(FLIP(dir)).not.toBe(dir);
    }
  });

  it("a border bit and its DISABLED companion never collide", () => {
    for (const dir of [0, 1, 2, 3]) {
      expect(BORDER(dir) & DISABLED(BORDER(dir))).toBe(0);
    }
  });

  it("initBorders walls the rim and nothing else", () => {
    const b = initBorders(3, 3);
    // The center cell of a 3x3 touches no rim.
    expect(b[4]).toBe(0);
    // Every other cell has at least one rim wall.
    for (const i of [0, 1, 2, 3, 5, 6, 7, 8]) expect(b[i]).not.toBe(0);
  });
});

describe("buildDsf", () => {
  it("black=true merges across an edge with no wall", () => {
    // 2x1 grid, no interior wall: the two cells are one region.
    const b = initBorders(2, 1);
    expect(buildDsf(2, 1, b, true).equivalent(0, 1)).toBe(true);
  });

  it("black=true separates across a wall", () => {
    const b = initBorders(2, 1);
    b[0] |= BORDER(1); // wall on cell 0's right
    expect(buildDsf(2, 1, b, true).equivalent(0, 1)).toBe(false);
  });

  it("black=false merges only across an edge marked NOT a wall", () => {
    const b = initBorders(2, 1);
    // Undecided proves nothing: the two are not yet committed to one region.
    expect(buildDsf(2, 1, b, false).equivalent(0, 1)).toBe(false);
    b[0] |= DISABLED(BORDER(1));
    expect(buildDsf(2, 1, b, false).equivalent(0, 1)).toBe(true);
  });
});

describe("pointerEdge", () => {
  it("left button cycles undecided → wall → undecided", () => {
    const s = grid(3, 3);
    const u = ui();
    const p = edgeMidpoint(1, 1, 1); // right edge of the center cell

    const first = pointerEdge(s, u, p.x, p.y, TS, true);
    expect(first).not.toBeNull();
    // Both cells the edge separates are edited, with facing bits.
    expect(first).toHaveLength(2);
    expect(first?.[0]).toEqual({ x: 1, y: 1, flag: BORDER(1) });
    expect(first?.[1]).toEqual({ x: 2, y: 1, flag: BORDER(FLIP(1)) });

    // Apply it, then press again: the wall comes back off.
    const b = initBorders(3, 3);
    b[1 * 3 + 1] |= BORDER(1);
    const second = pointerEdge(grid(3, 3, b), ui(), p.x, p.y, TS, true);
    expect(second?.[0]).toEqual({ x: 1, y: 1, flag: BORDER(1) });
  });

  it("right button marks NOT-a-wall, on the disabled nibble", () => {
    const s = grid(3, 3);
    const p = edgeMidpoint(1, 1, 1);
    const r = pointerEdge(s, ui(), p.x, p.y, TS, false);
    expect(r?.[0]).toEqual({ x: 1, y: 1, flag: DISABLED(BORDER(1)) });
    expect(r?.[1]).toEqual({ x: 2, y: 1, flag: DISABLED(BORDER(FLIP(1))) });
  });

  it("returns null outside the grid", () => {
    expect(pointerEdge(grid(3, 3), ui(), -50, -50, TS, true)).toBeNull();
  });

  it("breaks the tie toward the down edge at an exact tile centre", () => {
    // Not a rejection. At the exact center both axes are equidistant, so each
    // `<` test is false: the left and up bits go first, then left|right go
    // again, leaving down. Pinned because a center click is a genuinely
    // reachable input (a precise click, or a synthetic tap at a tile's midpoint)
    // and the alternative — resolving to nothing — would put a dead zone in the
    // middle of every tile.
    const s = grid(3, 3);
    const m = Math.floor(TS / 2);
    const center = { x: m + TS + TS / 2, y: m + TS + TS / 2 };
    const r = pointerEdge(s, ui(), center.x, center.y, TS, true);
    expect(r?.[0]).toEqual({ x: 1, y: 1, flag: BORDER(2) });
    expect(r?.[1]).toEqual({ x: 1, y: 2, flag: BORDER(FLIP(2)) });
  });

  it("returns null on a rim edge, which has no second cell to pair with", () => {
    const s = grid(3, 3);
    const p = edgeMidpoint(0, 0, 0); // top edge of the top-left cell
    expect(pointerEdge(s, ui(), p.x, p.y, TS, true)).toBeNull();
  });

  it("parks the cursor on the edge it hit and hides it", () => {
    const s = grid(3, 3);
    const u = ui(1, 1, true);
    const p = edgeMidpoint(1, 1, 1);
    pointerEdge(s, u, p.x, p.y, TS, true);
    // Half-cell coordinates: the edge right of cell (1,1) is at x = 2*1+1+1 = 4.
    expect(u.cursor.x).toBe(4);
    expect(u.cursor.y).toBe(3);
    expect(u.cursor.visible).toBe(false);
  });
});

describe("selectEdge", () => {
  it("the first press only reveals a hidden cursor", () => {
    const u = ui(2, 3, false);
    expect(selectEdge(grid(3, 3), u, false)).toBe("ui");
    expect(u.cursor.visible).toBe(true);
  });

  it("does nothing on a corner or a tile centre", () => {
    // Both coordinates odd = a tile center; both even = a corner. The mechanic
    // rejects each because `px === py`.
    expect(selectEdge(grid(3, 3), ui(3, 3, true), false)).toBeNull();
    expect(selectEdge(grid(3, 3), ui(2, 2, true), false)).toBeNull();
  });

  it("select toggles the wall, select2 the not-a-wall mark", () => {
    const s = grid(3, 3);
    const wall = selectEdge(s, ui(2, 3, true), false);
    expect(wall).toEqual([
      { x: 1, y: 1, flag: BORDER(3) },
      { x: 0, y: 1, flag: BORDER(FLIP(3)) },
    ]);
    const notWall = selectEdge(s, ui(2, 3, true), true);
    expect(notWall).toEqual([
      { x: 1, y: 1, flag: DISABLED(BORDER(3)) },
      { x: 0, y: 1, flag: DISABLED(BORDER(FLIP(3))) },
    ]);
  });
});

describe("interpretBorderGridInput", () => {
  it("dispatches pointer, cursor and select to the right path", () => {
    const s = grid(3, 3);
    const p = edgeMidpoint(1, 1, 1);

    expect(interpretBorderGridInput(s, ui(), p, LEFT_BUTTON, TS)).toHaveLength(2);
    expect(interpretBorderGridInput(s, ui(), p, RIGHT_BUTTON, TS)).toHaveLength(2);

    const u = ui(3, 3, true);
    expect(interpretBorderGridInput(s, u, p, CURSOR_UP, TS)).toBe("ui");
    expect(u.cursor.y).toBe(2);

    expect(interpretBorderGridInput(s, ui(2, 3, true), p, CURSOR_SELECT, TS)).toEqual([
      { x: 1, y: 1, flag: BORDER(3) },
      { x: 0, y: 1, flag: BORDER(FLIP(3)) },
    ]);
    expect(interpretBorderGridInput(s, ui(2, 3, true), p, CURSOR_SELECT2, TS)).toEqual([
      { x: 1, y: 1, flag: DISABLED(BORDER(3)) },
      { x: 0, y: 1, flag: DISABLED(BORDER(FLIP(3))) },
    ]);
  });

  it("ignores a button it does not handle", () => {
    expect(
      interpretBorderGridInput(grid(3, 3), ui(), { x: 0, y: 0 }, 0, TS),
    ).toBeNull();
  });

  // Both axes, and both ends of each. The first version of this test drove
  // only CURSOR_UP, so the `ui.x` clamp — the same line, on the other axis —
  // was never asserted and could be deleted with the suite green.
  it.each([
    ["up", CURSOR_UP, "y", 1],
    ["down", CURSOR_DOWN, "y", 5],
    ["left", CURSOR_LEFT, "x", 1],
    ["right", CURSOR_RIGHT, "x", 5],
  ] as const)("keeps the cursor inside the grid walking %s", (_name, key, axis, limit) => {
    // Half-cell coordinates on a 3×3 board run 1..2*3-1 = 1..5.
    const s = grid(3, 3);
    const u = ui(3, 3, true);
    for (let i = 0; i < 10; i++)
      interpretBorderGridInput(s, u, { x: 0, y: 0 }, key, TS);
    expect(u.cursor[axis]).toBe(limit);
    // The other axis did not drift while this one was clamped.
    expect(u.cursor[axis === "x" ? "y" : "x"]).toBe(3);
  });
});
