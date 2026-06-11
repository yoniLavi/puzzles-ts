/**
 * Cube rendering: draw the arena's grid squares, then the polyhedron
 * projected to 2-D with its isometric shear and back-face culling, with a
 * roll animation interpolating the solid's orientation between squares.
 * Faithful port of `game_redraw` in cube.c.
 *
 * Cube fully repaints every frame (a handful of polygons — cheap), so
 * there is no per-tile cache. The engine emits no pixels of its own; the
 * background rect drawn here on every frame is the game's own fill.
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { type Bbox, enumGridSquares, findBbox } from "./grid.ts";
import { SOLIDS, transformPoly } from "./solids.ts";
import type { CubeParams, CubeState, KeyPair } from "./state.ts";

export const ROLLTIME = 0.13;
export const PREFERRED_TILE_SIZE = 48;

// Colour indices (matching cube.c's enum).
export const COL_BACKGROUND = 0;
export const COL_BORDER = 1;
export const COL_BLUE = 2;

export interface CubeDrawState {
  gridscale: number;
  /** Pixel position of the float origin. */
  ox: number;
  oy: number;
  bbox: Bbox;
  border: number;
}

export function colours(defaultBackground: Colour): Colour[] {
  const ret: Colour[] = [];
  ret[COL_BACKGROUND] = defaultBackground;
  ret[COL_BORDER] = [0, 0, 0];
  ret[COL_BLUE] = [0, 0, 1];
  return ret;
}

export function newDrawState(state: CubeState): CubeDrawState {
  return {
    gridscale: 0,
    ox: 0,
    oy: 0,
    bbox: findBbox(state.grid),
    border: SOLIDS[state.solidIndex].border,
  };
}

export function computeSize(p: CubeParams, tileSize: number): Size {
  const bb = findBbox(enumGridSquares(p.solid, p.d1, p.d2));
  const border = SOLIDS[p.solid].border;
  return {
    w: Math.trunc((bb.r - bb.l + 2 * border) * tileSize),
    h: Math.trunc((bb.d - bb.u + 2 * border) * tileSize),
  };
}

export function setTileSize(ds: CubeDrawState, tileSize: number): void {
  ds.gridscale = tileSize;
  ds.ox = Math.trunc(-(ds.bbox.l - ds.border) * tileSize);
  ds.oy = Math.trunc(-(ds.bbox.u - ds.border) * tileSize);
}

export function redraw(
  dr: GameDrawing,
  ds: CubeDrawState | null,
  prev: CubeState | null,
  state: CubeState,
  dir: number,
  _ui: unknown,
  animTime: number,
  _flashTime: number,
): void {
  if (!ds) return;
  const gs = ds.gridscale;
  const bb = ds.bbox;
  const xsize = Math.trunc((bb.r - bb.l + 2 * ds.border) * gs);
  const ysize = Math.trunc((bb.d - bb.u + 2 * ds.border) * gs);

  dr.drawRect({ x: 0, y: 0, w: xsize, h: ysize }, COL_BACKGROUND);

  let oldstate = prev;
  let cur = state;
  let at = animTime;

  // An undo runs the roll backwards: swap the states and reverse time.
  if (dir < 0 && oldstate) {
    const t = oldstate;
    oldstate = cur;
    cur = t;
    at = ROLLTIME - at;
  }

  let angle: number;
  let square: number;
  let pkey: KeyPair;
  let gkey: KeyPair;
  if (!oldstate) {
    oldstate = cur;
    angle = 0;
    square = cur.current;
    pkey = cur.dpkey;
    gkey = cur.dgkey;
  } else {
    angle = (cur.angle * at) / ROLLTIME;
    square = cur.previous;
    pkey = cur.spkey;
    gkey = cur.sgkey;
  }
  // Draw the OLD state's grid + face colours; the polyhedron rolls over
  // the edge from the old square as `angle` ramps to the full roll.
  const st = oldstate;
  const solid = SOLIDS[st.solidIndex];
  const grid = st.grid;

  for (let i = 0; i < grid.length; i++) {
    const sq = grid[i];
    const coords: Point[] = [];
    for (let j = 0; j < sq.npoints; j++) {
      coords.push({
        x: Math.trunc(sq.points[2 * j] * gs) + ds.ox,
        y: Math.trunc(sq.points[2 * j + 1] * gs) + ds.oy,
      });
    }
    dr.drawPolygon(coords, st.blue[i] ? COL_BLUE : COL_BACKGROUND, COL_BORDER);
  }

  // Compute and draw the polyhedron.
  const poly = transformPoly(solid, grid[square].flip, pkey[0], pkey[1], angle);

  // Translate so the two key points on the polyhedron align with the
  // same key points on the current grid square.
  const t = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let tc = 0;
    for (let j = 0; j < 2; j++) {
      const gridCoord = i < 2 ? grid[square].points[gkey[j] * 2 + i] : 0;
      tc += gridCoord - poly.vertices[pkey[j] * 3 + i];
    }
    t[i] = tc / 2;
  }
  for (let i = 0; i < poly.nvertices; i++) {
    poly.vertices[i * 3 + 0] += t[0];
    poly.vertices[i * 3 + 1] += t[1];
    poly.vertices[i * 3 + 2] += t[2];
  }

  for (let i = 0; i < poly.nfaces; i++) {
    const pts: number[] = [];
    for (let j = 0; j < poly.order; j++) {
      const f = poly.faces[i * poly.order + j];
      pts.push(poly.vertices[f * 3 + 0] - poly.vertices[f * 3 + 2] * poly.shear);
      pts.push(poly.vertices[f * 3 + 1] - poly.vertices[f * 3 + 2] * poly.shear);
    }

    // Back-face cull: discard faces whose corners wind anticlockwise
    // (turning right between the first two edges → facing the viewer).
    const v1x = pts[2] - pts[0];
    const v1y = pts[3] - pts[1];
    const v2x = pts[4] - pts[2];
    const v2y = pts[5] - pts[3];
    if (v1x * v2y - v1y * v2x <= 0) continue;

    const coords: Point[] = [];
    for (let j = 0; j < poly.order; j++) {
      coords.push({
        x: Math.floor(pts[j * 2] * gs) + ds.ox,
        y: Math.floor(pts[j * 2 + 1] * gs) + ds.oy,
      });
    }
    dr.drawPolygon(coords, st.faceColours[i] ? COL_BLUE : COL_BACKGROUND, COL_BORDER);
  }

  dr.drawUpdate({ x: 0, y: 0, w: xsize, h: ysize });
}
