/**
 * The border-grid renderer's contract, and that both its games use it.
 *
 * **The strongest guard on this module is not in this file.** Palisade and
 * Separate each ship a tier-2.5 render scenario whose snapshot records every
 * draw call with its coordinates and its resolved color — 225 and 237 ops — and
 * the extraction that created this module left both byte-identical. That is a
 * far better test of a renderer than any assertion here, because it exercises
 * the pieces *in composition* against a frozen frame.
 *
 * What this file adds is the two things those snapshots structurally cannot say:
 * that a *third* game cannot quietly re-implement the mechanic beside them, and
 * what each piece means on its own, so a failure names the piece rather than
 * two games at once.
 */

import { describe, expect, it } from "vitest";
import { BORDER, margin, moveBorderCursor } from "./border-grid.ts";
import {
  BORDER_ERROR,
  borderGridSize,
  CONTAINS_CURSOR,
  center,
  cursorBits,
  F_CORRECT,
  GAME_FLAG_SHIFT,
  mistakeEdgeBits,
  tileWidth,
} from "./border-grid-render.ts";
import { newCursor } from "./pointer.ts";

describe("geometry", () => {
  it("leaves room for the outer walls and a margin either side", () => {
    const ts = 48;
    const { w, h } = borderGridSize(5, 3, ts);
    expect(w).toBe(5 * ts + tileWidth(ts) + 2 * margin(ts));
    expect(h).toBe(3 * ts + tileWidth(ts) + 2 * margin(ts));
  });

  it("keeps a wall at least one pixel wide at any tile size", () => {
    for (let ts = 1; ts <= 200; ts++) expect(tileWidth(ts)).toBeGreaterThanOrEqual(1);
  });

  it("offsets a tile's center by half a wall", () => {
    const ts = 48;
    expect(center(ts)).toBe(Math.floor(ts / 2) + Math.floor(tileWidth(ts) / 2));
  });
});

describe("the cursor's diff-key bits", () => {
  // Nothing draws from these; they exist so a tile is redrawn when the cursor
  // moves across it, which is what erases the old one. A guard that only
  // checked "the cursor is somewhere" would pass against a constant.
  it("marks exactly the half-grid position the cursor is on", () => {
    const cursor = newCursor(3, 2, true);
    // (3, 2) is u = 3 - 2·1 = 1, v = 2 - 2·1 = 0 within tile (c, r) = (1, 1).
    expect(cursorBits(cursor, 1, 1)).toBe(CONTAINS_CURSOR(1 << (3 * 1 + 0)));
  });

  it("marks nothing in a tile the cursor is not in", () => {
    expect(cursorBits(newCursor(3, 2, true), 0, 0)).toBe(0);
  });

  it("marks nothing at all while the cursor is hidden", () => {
    expect(cursorBits(newCursor(3, 2, false), 1, 1)).toBe(0);
  });

  it("changes as the cursor steps, which is the whole point", () => {
    const cursor = newCursor(2, 2, true);
    const before = cursorBits(cursor, 1, 1);
    moveBorderCursor({ cursor }, { dx: 1, dy: 0 }, 4, 4);
    expect(cursorBits(cursor, 1, 1)).not.toBe(before);
  });
});

describe("the Check & Save overlay folds into the live error channel", () => {
  it("reddens the named edge of the named cell", () => {
    const mask = mistakeEdgeBits(3, 3, [{ x: 1, y: 2, dir: 1 }]);
    expect(mask[2 * 3 + 1]).toBe(BORDER_ERROR(BORDER(1)));
    expect(mask.filter((v) => v !== 0)).toHaveLength(1);
  });

  it("is empty when there are no mistakes, and when there is no overlay", () => {
    expect(mistakeEdgeBits(3, 3, []).some((v) => v !== 0)).toBe(false);
    expect(mistakeEdgeBits(3, 3, undefined).some((v) => v !== 0)).toBe(false);
  });
});

describe("the packed flags do not collide", () => {
  it("leaves a game's own bits clear of every shared one", () => {
    const shared =
      BORDER_ERROR(0xf) |
      F_CORRECT |
      CONTAINS_CURSOR(0x1ff) |
      // the border bits themselves, and their DISABLED companions
      0xff;
    // Every bit a game may use starts at GAME_FLAG_SHIFT, and the shared layout
    // must claim none of them. Asserted rather than eyeballed, because the two
    // grow independently and a collision is invisible — it would show up as a
    // tile that fails to redraw.
    expect(shared & ~((1 << GAME_FLAG_SHIFT) - 1)).toBe(0);
  });
});

describe("both border-grid games use the shared renderer", () => {
  // The reverse direction, and the one the byte-clean snapshots cannot see: a
  // third game could adopt `interpretBorderGridInput` and hand-roll the look
  // beside it, which is exactly how two renderers came to exist. What is being
  // asserted is that no such code exists, so it has to be a source scan.
  const sources = import.meta.glob<string>("../games/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });

  it("finds source to scan (vacuity guard)", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });

  it("every game using the border-grid input also uses its renderer", () => {
    const byGame = new Map<string, { input: boolean; render: boolean }>();
    for (const [path, text] of Object.entries(sources)) {
      if (path.includes(".test.")) continue;
      const game = path.split("/")[2];
      const seen = byGame.get(game) ?? { input: false, render: false };
      if (text.includes("interpretBorderGridInput")) seen.input = true;
      if (text.includes("border-grid-render.ts")) seen.render = true;
      byGame.set(game, seen);
    }

    const users = [...byGame].filter(([, s]) => s.input).map(([g]) => g);
    expect(users.sort(), "the border-grid games").toEqual(["palisade", "separate"]);

    const missing = users.filter((g) => !byGame.get(g)?.render);
    expect(
      missing,
      `${missing.join(", ")} use the border-grid input mechanic but draw the ` +
        "board themselves — the look is shared too (engine/border-grid-render.ts).",
    ).toEqual([]);
  });
});
