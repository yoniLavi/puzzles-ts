/**
 * Scene-graph primitives the framework reconciles into canvas writes.
 *
 * A game that implements `Game.scene` returns a fresh `SceneNode[]`
 * per frame; the engine diffs that against the previous frame's tree
 * by stable `id` and emits the minimum draw ops needed to bring the
 * canvas from previous to next. This replaces the imperative
 * `redraw` + per-tile cache pattern whose manual cache invalidation
 * caused three shipped-then-fixed defects in the Flip port.
 *
 * See `openspec/changes/add-scene-graph-reconciler/design.md` for the
 * why; the spec contract lives at `openspec/specs/ts-engine/spec.md`.
 */

import type { DrawTextOptions, Point, Rect } from "../../puzzle/types.ts";

export type { DrawTextOptions, Point, Rect } from "../../puzzle/types.ts";

/** A filled rectangle. `fill` is a palette index (the same convention
 * games use with `GameDrawing.drawRect`). */
export interface RectNode {
  readonly kind: "rect";
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill: number;
}

/** A line segment. `thickness` defaults to 1, matching
 * `GameDrawing.drawLine` for a no-thickness call. */
export interface LineNode {
  readonly kind: "line";
  readonly id: string;
  readonly from: Point;
  readonly to: Point;
  readonly colour: number;
  readonly thickness?: number;
}

/** A filled polygon with an outline (both palette indices, matching
 * `GameDrawing.drawPolygon`). */
export interface PolygonNode {
  readonly kind: "polygon";
  readonly id: string;
  readonly points: ReadonlyArray<Point>;
  readonly fill: number;
  readonly outline: number;
}

/** A filled circle with an outline (palette indices, matching
 * `GameDrawing.drawCircle`). */
export interface CircleNode {
  readonly kind: "circle";
  readonly id: string;
  readonly centre: Point;
  readonly radius: number;
  readonly fill: number;
  readonly outline: number;
}

/** Drawable text. The Drawing API renders text at `origin` according
 * to `options`. Text has no closed-form bounding box (the engine
 * doesn't measure fonts) — supply `bounds` so the reconciler can clip
 * to the right rectangle when this node changes between frames, or
 * wrap the node in a `group` with explicit `clip`. */
export interface TextNode {
  readonly kind: "text";
  readonly id: string;
  readonly origin: Point;
  readonly text: string;
  readonly options: DrawTextOptions;
  readonly colour: number;
  readonly bounds?: Rect;
}

/** A grouping node. `clip`, when present, declares the worst-case
 * pixel bounds of the group — the reconciler uses it to (a) bound
 * repaints on diff and (b) cover the case where the group's content
 * shrinks between frames and would otherwise leak stale pixels. The
 * `transform` field is reserved; setting it is currently an error
 * (no port needs it yet, and ignoring it silently would be a sharp
 * edge). */
export interface GroupNode {
  readonly kind: "group";
  readonly id: string;
  readonly children: ReadonlyArray<SceneNode>;
  readonly clip?: Rect;
  readonly transform?: { dx: number; dy: number };
}

export type SceneNode =
  | RectNode
  | LineNode
  | PolygonNode
  | CircleNode
  | TextNode
  | GroupNode;
