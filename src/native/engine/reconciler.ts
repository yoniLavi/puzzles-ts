/**
 * Scene-graph reconciler: diff two `SceneNode[]` trees and emit the
 * minimum draw operations on a `GameDrawing` that bring the canvas
 * from prev to next. Matching is by stable `id` within each
 * containing list; subtrees with referential equality (same object
 * reference between frames) short-circuit without comparison, so
 * games that memoise per-state get cheap full-tree skips.
 *
 * The midend frames each call with `startDraw`/`endDraw`; the
 * reconciler emits none of those itself. Per `design.md` D4, the
 * reconciler does not emit explicit "erase" ops — the new subtree's
 * paint overwrites old content within the clip, and nodes whose
 * content may shrink must declare an explicit `clip` (`group.clip`)
 * covering the worst-case bounding box.
 */

import type { DrawTextOptions, Point, Rect } from "../../puzzle/types.ts";
import type { GameDrawing } from "./game.ts";
import type { GroupNode, SceneNode } from "./scene.ts";

export function reconcile(
  prev: ReadonlyArray<SceneNode> | null,
  next: ReadonlyArray<SceneNode>,
  dr: GameDrawing,
): void {
  reconcileList(prev, next, dr);
}

function reconcileList(
  prev: ReadonlyArray<SceneNode> | null,
  next: ReadonlyArray<SceneNode>,
  dr: GameDrawing,
): void {
  // Empty prev ⇒ every node is added; paint them all.
  if (prev === null || prev.length === 0) {
    for (const node of next) paintWholesale(node, dr);
    return;
  }
  const prevById = new Map<string, SceneNode>();
  for (const node of prev) prevById.set(node.id, node);
  for (const node of next) {
    const match = prevById.get(node.id);
    if (match === node) continue; // referential equality short-circuit
    if (match !== undefined && nodesEqual(match, node)) continue;
    paintWholesale(node, dr);
  }
  // Removed nodes (in prev but not next) are intentionally NOT given
  // explicit "erase" ops — per the spec, removed-node pixels are
  // covered by their parent's repaint (which the reconciler is
  // already emitting because the parent's subtree differs) or by a
  // shrinking-node's explicit `clip` overpaint. Games whose removed
  // node leaks pixels outside their parent's clip must declare a
  // wider clip.
}

function paintWholesale(node: SceneNode, dr: GameDrawing): void {
  const bounds = clipBounds(node);
  if (bounds.w <= 0 || bounds.h <= 0) {
    // Degenerate / empty group: nothing to paint, nothing to clip.
    return;
  }
  dr.clip(bounds);
  emitDraws(node, dr);
  dr.unclip();
  dr.drawUpdate(bounds);
}

function emitDraws(node: SceneNode, dr: GameDrawing): void {
  switch (node.kind) {
    case "rect":
      dr.drawRect(
        { x: node.x, y: node.y, w: node.w, h: node.h },
        node.fill,
      );
      return;
    case "line":
      dr.drawLine(node.from, node.to, node.colour, node.thickness ?? 1);
      return;
    case "polygon":
      // GameDrawing.drawPolygon takes Point[]; SceneNode keeps a
      // ReadonlyArray for caller-side immutability. The cast is safe
      // because GameDrawing only reads.
      dr.drawPolygon(node.points as Point[], node.fill, node.outline);
      return;
    case "circle":
      dr.drawCircle(node.centre, node.radius, node.fill, node.outline);
      return;
    case "text":
      dr.drawText(node.origin, node.options, node.colour, node.text);
      return;
    case "group":
      if (node.transform !== undefined) {
        // Transforms aren't honoured by the current implementation;
        // applying coordinate offsets per primitive is straightforward
        // but no port needs it today. Throw rather than silently
        // ignore so a future port that adds `transform` hits a clear
        // error instead of a misrender.
        throw new Error(
          `Scene group "${node.id}" sets transform; not yet implemented by the reconciler.`,
        );
      }
      for (const child of node.children) emitDraws(child, dr);
      return;
    default: {
      // Exhaustiveness: a new SceneNode variant without a case
      // fails to compile because `node` is no longer `never`.
      const _exhaustive: never = node;
      throw new Error(
        `Unhandled scene node: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function clipBounds(node: SceneNode): Rect {
  if (node.kind === "group" && node.clip !== undefined) return node.clip;
  return nodeBounds(node);
}

function nodeBounds(node: SceneNode): Rect {
  switch (node.kind) {
    case "rect":
      return { x: node.x, y: node.y, w: node.w, h: node.h };
    case "line": {
      const t = node.thickness ?? 1;
      const pad = Math.max(1, Math.ceil(t / 2));
      const x = Math.min(node.from.x, node.to.x) - pad;
      const y = Math.min(node.from.y, node.to.y) - pad;
      const w = Math.abs(node.to.x - node.from.x) + 2 * pad;
      const h = Math.abs(node.to.y - node.from.y) + 2 * pad;
      return { x, y, w, h };
    }
    case "polygon": {
      if (node.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = node.points[0].x;
      let minY = node.points[0].y;
      let maxX = minX;
      let maxY = minY;
      for (let i = 1; i < node.points.length; i++) {
        const p = node.points[i];
        if (p.x < minX) minX = p.x;
        else if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        else if (p.y > maxY) maxY = p.y;
      }
      // +1 covers the outline pixel on the far edges.
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
    case "circle":
      return {
        x: node.centre.x - node.radius,
        y: node.centre.y - node.radius,
        w: 2 * node.radius + 1,
        h: 2 * node.radius + 1,
      };
    case "text":
      if (node.bounds !== undefined) return node.bounds;
      throw new Error(
        `Scene text node "${node.id}" requires explicit bounds (or to be inside a group with explicit clip); the engine does not measure fonts.`,
      );
    case "group":
      return groupBounds(node);
  }
}

function groupBounds(node: GroupNode): Rect {
  if (node.clip !== undefined) return node.clip;
  if (node.children.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const child of node.children) {
    const cb = nodeBounds(child);
    if (cb.w <= 0 || cb.h <= 0) continue;
    if (cb.x < minX) minX = cb.x;
    if (cb.y < minY) minY = cb.y;
    if (cb.x + cb.w > maxX) maxX = cb.x + cb.w;
    if (cb.y + cb.h > maxY) maxY = cb.y + cb.h;
  }
  if (minX === Number.POSITIVE_INFINITY) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function nodesEqual(a: SceneNode, b: SceneNode): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.id !== b.id) return false;
  switch (a.kind) {
    case "rect": {
      const r = b as typeof a;
      return (
        a.x === r.x && a.y === r.y && a.w === r.w && a.h === r.h &&
        a.fill === r.fill
      );
    }
    case "line": {
      const l = b as typeof a;
      return (
        a.from.x === l.from.x &&
        a.from.y === l.from.y &&
        a.to.x === l.to.x &&
        a.to.y === l.to.y &&
        a.colour === l.colour &&
        (a.thickness ?? 1) === (l.thickness ?? 1)
      );
    }
    case "polygon": {
      const p = b as typeof a;
      if (a.fill !== p.fill || a.outline !== p.outline) return false;
      if (a.points.length !== p.points.length) return false;
      for (let i = 0; i < a.points.length; i++) {
        if (a.points[i].x !== p.points[i].x) return false;
        if (a.points[i].y !== p.points[i].y) return false;
      }
      return true;
    }
    case "circle": {
      const c = b as typeof a;
      return (
        a.centre.x === c.centre.x &&
        a.centre.y === c.centre.y &&
        a.radius === c.radius &&
        a.fill === c.fill &&
        a.outline === c.outline
      );
    }
    case "text": {
      const t = b as typeof a;
      return (
        a.origin.x === t.origin.x &&
        a.origin.y === t.origin.y &&
        a.text === t.text &&
        a.colour === t.colour &&
        drawTextOptionsEq(a.options, t.options) &&
        rectsEqualOptional(a.bounds, t.bounds)
      );
    }
    case "group": {
      const g = b as typeof a;
      if (!rectsEqualOptional(a.clip, g.clip)) return false;
      if ((a.transform?.dx ?? 0) !== (g.transform?.dx ?? 0)) return false;
      if ((a.transform?.dy ?? 0) !== (g.transform?.dy ?? 0)) return false;
      if (a.children.length !== g.children.length) return false;
      for (let i = 0; i < a.children.length; i++) {
        if (!nodesEqual(a.children[i], g.children[i])) return false;
      }
      return true;
    }
    default: {
      // Exhaustiveness: a new SceneNode variant without a case
      // fails to compile because `a` is no longer `never`.
      const _exhaustive: never = a;
      throw new Error(
        `Unhandled scene node in nodesEqual: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function drawTextOptionsEq(a: DrawTextOptions, b: DrawTextOptions): boolean {
  return (
    a.align === b.align &&
    a.baseline === b.baseline &&
    a.fontType === b.fontType &&
    a.size === b.size
  );
}

function rectsEqualOptional(a: Rect | undefined, b: Rect | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
