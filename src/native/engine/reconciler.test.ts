import { describe, expect, it } from "vitest";
import type { GameDrawing } from "./game.ts";
import { reconcile } from "./reconciler.ts";
import type { GroupNode, RectNode, SceneNode } from "./scene.ts";

type Op =
  | { op: "startDraw" }
  | { op: "endDraw" }
  | { op: "clip"; rect: { x: number; y: number; w: number; h: number } }
  | { op: "unclip" }
  | { op: "drawUpdate"; rect: { x: number; y: number; w: number; h: number } }
  | {
      op: "drawRect";
      rect: { x: number; y: number; w: number; h: number };
      fill: number;
    }
  | { op: "drawLine"; colour: number; thickness: number }
  | { op: "drawPolygon"; fill: number; outline: number }
  | { op: "drawCircle"; fill: number; outline: number }
  | { op: "drawText"; colour: number };

function recordingDrawing(): { dr: GameDrawing; ops: Op[] } {
  const ops: Op[] = [];
  const dr: GameDrawing = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: (rect) => ops.push({ op: "drawUpdate", rect }),
    clip: (rect) => ops.push({ op: "clip", rect }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (rect, fill) => ops.push({ op: "drawRect", rect, fill }),
    drawLine: (_a, _b, colour, thickness) =>
      ops.push({ op: "drawLine", colour, thickness }),
    drawPolygon: (_p, fill, outline) =>
      ops.push({ op: "drawPolygon", fill, outline }),
    drawCircle: (_p, _r, fill, outline) =>
      ops.push({ op: "drawCircle", fill, outline }),
    drawText: (_p, _o, colour) => ops.push({ op: "drawText", colour }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  };
  return { dr, ops };
}

const tile = (
  id: string,
  x: number,
  y: number,
  fill: number,
): GroupNode => ({
  kind: "group",
  id,
  clip: { x, y, w: 10, h: 10 },
  children: [{ kind: "rect", id: `${id}-bg`, x, y, w: 10, h: 10, fill }],
});

const rect = (id: string, x: number, y: number, fill: number): RectNode => ({
  kind: "rect",
  id,
  x,
  y,
  w: 10,
  h: 10,
  fill,
});

describe("reconciler", () => {
  it("paints the full scene when prev is null", () => {
    const next: SceneNode[] = [tile("t-0,0", 0, 0, 1), tile("t-1,0", 10, 0, 2)];
    const { dr, ops } = recordingDrawing();
    reconcile(null, next, dr);
    // Two tiles, each: clip, drawRect, unclip, drawUpdate
    expect(ops.filter((o) => o.op === "drawRect")).toHaveLength(2);
    expect(ops.filter((o) => o.op === "clip")).toHaveLength(2);
    expect(ops.filter((o) => o.op === "unclip")).toHaveLength(2);
  });

  it("emits zero draw ops when prev and next are structurally equal", () => {
    const prev: SceneNode[] = [tile("t-0,0", 0, 0, 1), tile("t-1,0", 10, 0, 2)];
    const next: SceneNode[] = [tile("t-0,0", 0, 0, 1), tile("t-1,0", 10, 0, 2)];
    const { dr, ops } = recordingDrawing();
    reconcile(prev, next, dr);
    expect(ops).toEqual([]);
  });

  it("emits ops clipped to a changed node's bounds only", () => {
    const prev: SceneNode[] = [
      tile("t-0,0", 0, 0, 1),
      tile("t-1,0", 10, 0, 1),
      tile("t-2,0", 20, 0, 1),
    ];
    const next: SceneNode[] = [
      tile("t-0,0", 0, 0, 1), // unchanged
      tile("t-1,0", 10, 0, 9), // ← only this one changes (fill 1 → 9)
      tile("t-2,0", 20, 0, 1), // unchanged
    ];
    const { dr, ops } = recordingDrawing();
    reconcile(prev, next, dr);
    // Exactly one clip+unclip pair for the middle tile.
    expect(ops.filter((o) => o.op === "clip")).toHaveLength(1);
    expect(ops.filter((o) => o.op === "unclip")).toHaveLength(1);
    expect(ops.filter((o) => o.op === "drawRect")).toEqual([
      { op: "drawRect", rect: { x: 10, y: 0, w: 10, h: 10 }, fill: 9 },
    ]);
    const clipOps = ops.filter((o) => o.op === "clip");
    expect((clipOps[0] as Extract<Op, { op: "clip" }>).rect).toEqual({
      x: 10,
      y: 0,
      w: 10,
      h: 10,
    });
  });

  it("short-circuits a subtree by referential equality without deep-comparing", () => {
    // Build a "changed" tile that uses === to the prev tile's reference
    // but whose deep contents are intentionally also unchanged. We
    // assert no draw ops — even though deep-compare would return the
    // same result, the referential check fires first.
    const sharedTile = tile("t-0,0", 0, 0, 1);
    const prev: SceneNode[] = [sharedTile, tile("t-1,0", 10, 0, 2)];
    const next: SceneNode[] = [sharedTile, tile("t-1,0", 10, 0, 2)];
    const { dr, ops } = recordingDrawing();
    reconcile(prev, next, dr);
    // Both tiles equal (one by reference, one by deep-compare).
    expect(ops).toEqual([]);
  });

  it("treats an added node (no id match in prev) as a fresh paint", () => {
    const prev: SceneNode[] = [rect("a", 0, 0, 1)];
    const next: SceneNode[] = [rect("a", 0, 0, 1), rect("b", 10, 0, 2)];
    const { dr, ops } = recordingDrawing();
    reconcile(prev, next, dr);
    expect(ops.filter((o) => o.op === "drawRect")).toEqual([
      { op: "drawRect", rect: { x: 10, y: 0, w: 10, h: 10 }, fill: 2 },
    ]);
  });

  it("a removed-then-readded node round-trips correctly", () => {
    const start: SceneNode[] = [rect("a", 0, 0, 1), rect("b", 10, 0, 2)];
    const removed: SceneNode[] = [rect("a", 0, 0, 1)];
    const readded: SceneNode[] = [rect("a", 0, 0, 1), rect("b", 10, 0, 2)];

    // start → removed: nothing emitted for the removed node itself
    // (per spec, no separate erase op; surrounding paints cover it).
    const r1 = recordingDrawing();
    reconcile(start, removed, r1.dr);
    expect(r1.ops.filter((o) => o.op === "drawRect")).toEqual([]);

    // removed → readded: 'b' becomes an "added" node, repainted from
    // scratch with its bounds-sized clip.
    const r2 = recordingDrawing();
    reconcile(removed, readded, r2.dr);
    expect(r2.ops.filter((o) => o.op === "drawRect")).toEqual([
      { op: "drawRect", rect: { x: 10, y: 0, w: 10, h: 10 }, fill: 2 },
    ]);
  });

  it("emits clip + draws + unclip + drawUpdate in order for each painted node", () => {
    const next: SceneNode[] = [tile("t", 5, 5, 7)];
    const { dr, ops } = recordingDrawing();
    reconcile(null, next, dr);
    expect(ops.map((o) => o.op)).toEqual([
      "clip",
      "drawRect",
      "unclip",
      "drawUpdate",
    ]);
  });

  it("does not recurse into children for matched-but-unequal groups (whole group repaints)", () => {
    // A group whose only difference is in one of two child rects:
    // the spec says the whole subtree is repainted clipped to the
    // group's bounds — not just the changed child.
    const prev: SceneNode[] = [
      {
        kind: "group",
        id: "g",
        clip: { x: 0, y: 0, w: 20, h: 10 },
        children: [rect("a", 0, 0, 1), rect("b", 10, 0, 2)],
      },
    ];
    const next: SceneNode[] = [
      {
        kind: "group",
        id: "g",
        clip: { x: 0, y: 0, w: 20, h: 10 },
        children: [
          rect("a", 0, 0, 1),
          rect("b", 10, 0, 9), // only this differs
        ],
      },
    ];
    const { dr, ops } = recordingDrawing();
    reconcile(prev, next, dr);
    // Both child rects are repainted (wholesale group repaint) inside
    // one clip/unclip pair.
    expect(ops.filter((o) => o.op === "drawRect")).toHaveLength(2);
    expect(ops.filter((o) => o.op === "clip")).toHaveLength(1);
    expect(ops.filter((o) => o.op === "unclip")).toHaveLength(1);
  });

  it("computes a non-group node's bounding box from its geometry", () => {
    // A line node with no surrounding group still emits a clip — the
    // reconciler computes the bbox from the line's endpoints.
    const next: SceneNode[] = [
      {
        kind: "line",
        id: "l",
        from: { x: 5, y: 5 },
        to: { x: 15, y: 25 },
        colour: 3,
        thickness: 2,
      },
    ];
    const { dr, ops } = recordingDrawing();
    reconcile(null, next, dr);
    const clipOps = ops.filter((o): o is Extract<Op, { op: "clip" }> =>
      o.op === "clip",
    );
    expect(clipOps).toHaveLength(1);
    // bbox covers (5,5)→(15,25) with thickness-2 padding.
    expect(clipOps[0].rect.w).toBeGreaterThanOrEqual(10);
    expect(clipOps[0].rect.h).toBeGreaterThanOrEqual(20);
  });

  it("emits no startDraw/endDraw — the midend owns frame framing", () => {
    const next: SceneNode[] = [rect("a", 0, 0, 1)];
    const { dr, ops } = recordingDrawing();
    reconcile(null, next, dr);
    expect(ops.some((o) => o.op === "startDraw")).toBe(false);
    expect(ops.some((o) => o.op === "endDraw")).toBe(false);
  });

  it("throws when a group sets transform (not yet implemented)", () => {
    const next: SceneNode[] = [
      {
        kind: "group",
        id: "g",
        clip: { x: 0, y: 0, w: 10, h: 10 },
        children: [rect("a", 0, 0, 1)],
        transform: { dx: 5, dy: 0 },
      },
    ];
    const { dr } = recordingDrawing();
    expect(() => reconcile(null, next, dr)).toThrow(/transform/);
  });

  it("requires explicit bounds on a text node outside a clipped group", () => {
    const next: SceneNode[] = [
      {
        kind: "text",
        id: "t",
        origin: { x: 0, y: 0 },
        text: "hi",
        options: {
          align: "left",
          baseline: "alphabetic",
          fontType: "variable",
          size: 12,
        },
        colour: 1,
      },
    ];
    const { dr } = recordingDrawing();
    expect(() => reconcile(null, next, dr)).toThrow(/bounds/);
  });
});

