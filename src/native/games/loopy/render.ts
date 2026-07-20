/**
 * Loopy rendering — port of `game_compute_size` / `game_colours` /
 * `game_new_drawstate` / the drawing half of `loopy.c`.
 *
 * There is **no per-tiling drawing code at all**: faces are never filled,
 * edges are always straight `dot1→dot2` segments, and dots are always
 * circles. Every visible difference between the 18 tilings comes out of
 * `grid.ts`'s geometry, so this file is far smaller than "18 tilings"
 * suggests.
 *
 * Two deliberate divergences from the C, both display-only (this project's
 * byte-parity scope covers generator/solver/codec, never rendering):
 *
 * - **No incremental redraw.** Upstream carries ~200 lines of `edge_bbox` /
 *   `dot_bbox` / `face_text_bbox` / `boxes_intersect` / clip / `draw_update`
 *   machinery to repaint sub-rectangles. Its stated reason is an artefact of
 *   drawing *over* an existing frame — an antialiased diagonal drawn over
 *   itself gets steadily thicker — which cannot happen in a renderer that
 *   clears and repaints. What survives is the part that carries meaning: the
 *   per-edge draw key (`lineErrors[i] ? DS_LINE_ERROR : lines[i]`), the
 *   per-face error/satisfied key, and the five-phase colour z-order, which is
 *   a real ordering — mistakes must paint over everything.
 * - **Whole-pixel coordinates** — see {@link border} and {@link toScreen}.
 *
 * The palette, by contrast, is upstream's exactly, *including* its known
 * misbehaviour on a dark background: adapting for that here would fight the
 * app's own dark-mode pipeline. See {@link colours}.
 *
 * `BORDER = DOT_RADIUS` rather than `tilesize / 2` is not a divergence at all:
 * it is the arm this fork's build selects (`NARROW_BORDERS`).
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { Grid } from "../../engine/grid.ts";
import { gridComputeSize, gridFindIncentre } from "../../engine/grid.ts";
import { gridTypeOf, type LoopyParams } from "./params.ts";
import {
  faceOrder,
  LINE_NO,
  LINE_UNKNOWN,
  LINE_YES,
  type LoopyState,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.5;

// --- palette (index-for-index with the loopy.c colour enum) ----------------
export const COL_BACKGROUND = 0;
export const COL_FOREGROUND = 1;
export const COL_LINEUNKNOWN = 2;
export const COL_HIGHLIGHT = 3;
export const COL_MISTAKE = 4;
export const COL_SATISFIED = 5;
export const COL_FAINT = 6;

/**
 * The subset of the game UI the renderer reads. The full `LoopyUi` lives in
 * `index.ts` and satisfies this structurally.
 */
export interface LoopyRenderUi {
  drawFaintLines: boolean;
}

/** Per-edge draw key: the line state, or this sentinel when the edge is part
 * of a highlighted error. Mirrors `DS_LINE_ERROR`, one past `LINE_NO`. */
const DS_LINE_ERROR = 3;

const clamp = (lo: number, v: number, hi: number): number =>
  Math.min(Math.max(lo, v), hi);

const dotRadius = (tileSize: number): number => clamp(1, (tileSize * 2.5) / 32, 3);
const lineThickness = (tileSize: number): number => clamp(1, (tileSize * 3) / 32, 3);
const faintLineThickness = (tileSize: number): number => clamp(0.5, tileSize / 24, 1.5);

/**
 * The gutter around the board, in pixels.
 *
 * `loopy.c` offers two arms; `puzzles/cmake/platforms/webapp.cmake` defines
 * `NARROW_BORDERS`, so the one this fork compiles is `BORDER = DOT_RADIUS`
 * (1–3 px) rather than `tilesize / 2` (16 px at the preferred tile size).
 * That is a very visible difference, so it was checked rather than assumed.
 *
 * Rounded **up** to a whole pixel, which the C does not do: it uses the raw
 * float in `game_compute_size` but truncates it in `grid_to_screen`, so a
 * boundary dot of radius 2.5 sits in a 2 px gutter and loses half a pixel.
 * A whole-pixel border keeps every coordinate integral (the pixel-centre
 * convention `Drawing` expects) and gives the dot exactly the room it needs.
 */
export function border(tileSize: number): number {
  return Math.ceil(dotRadius(tileSize));
}

export interface LoopyDrawState {
  started: boolean;
  tileSize: number;
  flashing: boolean;
  /** Cached **screen** position of each face's clue, `-1` when not yet
   * computed. Invalidated by {@link setTileSize}. */
  textx: Int32Array;
  texty: Int32Array;
  /** Per-edge draw key (a `LineState`, or {@link DS_LINE_ERROR}). */
  lines: Uint8Array;
  /** Per-face clue colouring keys, as booleans in a byte array. */
  clueError: Uint8Array;
  clueSatisfied: Uint8Array;
}

export function newDrawState(s: LoopyState): LoopyDrawState {
  const { numFaces, numEdges } = s.grid;
  const lines = new Uint8Array(numEdges);
  lines.fill(LINE_UNKNOWN);
  return {
    started: false,
    tileSize: PREFERRED_TILE_SIZE,
    flashing: false,
    textx: new Int32Array(numFaces).fill(-1),
    texty: new Int32Array(numFaces).fill(-1),
    lines,
    clueError: new Uint8Array(numFaces),
    clueSatisfied: new Uint8Array(numFaces),
  };
}

/**
 * Adopt a new tile size, **discarding the clue-position cache**.
 *
 * Upstream never invalidates it, because its frontends call `game_set_size`
 * once before the first redraw. This project's `ResizeController` calls
 * `size()` on every layout perturbation, so a surviving cache would draw every
 * clue at its pre-resize position — the same class of stale-cache bug that
 * cost Flip three iterations (`fix-flip-canvas-reshape`).
 *
 * Only the *screen projection* is stale: the incentre itself is a property of
 * the face's shape, is tile-size-independent, and stays cached on the face by
 * `grid.ts`.
 */
export function setTileSize(ds: LoopyDrawState, tileSize: number): void {
  ds.tileSize = tileSize;
  ds.textx.fill(-1);
  ds.texty.fill(-1);
}

export function computeSize(p: LoopyParams, tileSize: number): Size {
  const g = gridComputeSize(gridTypeOf(p), p.w, p.h);
  const b = border(tileSize);
  // Multiply before dividing, to minimise rounding error on the integer
  // division (upstream's note).
  return {
    w: Math.floor((g.xExtent * tileSize) / g.tileSize) + 2 * b + 1,
    h: Math.floor((g.yExtent * tileSize) / g.tileSize) + 2 * b + 1,
  };
}

/**
 * The palette, index-for-index with the `loopy.c` colour enum — and
 * value-for-value identical to upstream's.
 *
 * `COL_FAINT` and `COL_LINEUNKNOWN` are derived by multiplying the background
 * by 0.9, which only ever moves *towards black*. Upstream flags that this
 * fails on a dark host, where the faint lines sink into the background, and
 * declines to fix it (`loopy.c:1046-1049`: *"Except if the background is
 * pretty dark already; then it ought to be a bit lighter. Oy vey."*).
 *
 * **That is not this fork's problem to solve here, and adapting for it in this
 * function would actively break dark mode.** `puzzle-view.ts` deliberately
 * hands every game a *light* background — in dark mode it passes pure white
 * (`oklchToColour([1, 0, 0])`) precisely because "puzzles often generate
 * colors by multiplying the background by a factor < 1.0 ... generates
 * near-blacks for dark ones" — then inverts and adapts the whole returned
 * palette in OKLCH, with per-puzzle `darkMode.paletteOverrides` from
 * `augmentation.ts` for anything the generic adaptation gets wrong. So this
 * function is *required* to derive against a light background; a second,
 * game-level adaptation would fight the one a layer up. Dark-mode tuning for
 * Loopy belongs in `augmentation.ts`, not here.
 *
 * (`COL_LINEUNKNOWN`'s blue component is zeroed rather than scaled, which is
 * what makes it a yellow rather than a grey.)
 */
export function colours(defaultBackground: Colour): Colour[] {
  const faint: Colour = [
    defaultBackground[0] * 0.9,
    defaultBackground[1] * 0.9,
    defaultBackground[2] * 0.9,
  ];

  const out: Colour[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_FOREGROUND] = [0, 0, 0];
  out[COL_LINEUNKNOWN] = [faint[0], faint[1], 0];
  out[COL_HIGHLIGHT] = [1, 1, 1];
  out[COL_MISTAKE] = [1, 0, 0];
  out[COL_SATISFIED] = [0, 0, 0];
  out[COL_FAINT] = faint;
  return out;
}

// --- drawing ---------------------------------------------------------------

/**
 * Project a grid coordinate onto the canvas. Mirrors `grid_to_screen`.
 *
 * Rounds to nearest where the C truncates (its `int` division, and its `int`
 * assignment of the fractional `BORDER`). Both that and {@link border}'s
 * ceiling are **deliberate display-side choices, not fidelity bugs** — they
 * keep every drawing coordinate integral, which is what `Drawing`'s
 * pixel-centre convention wants, and keep lines concentric with the dots they
 * join. Please don't "restore" the truncation.
 */
function toScreen(g: Grid, tileSize: number, gx: number, gy: number): [number, number] {
  const b = border(tileSize);
  return [
    Math.round(((gx - g.lowestX) * tileSize) / g.tileSize) + b,
    Math.round(((gy - g.lowestY) * tileSize) / g.tileSize) + b,
  ];
}

/** The clue's screen position, computed once per face per tile size. */
function faceTextPos(ds: LoopyDrawState, g: Grid, faceIndex: number): [number, number] {
  if (ds.textx[faceIndex] < 0) {
    const f = g.faces[faceIndex];
    gridFindIncentre(f);
    const [x, y] = toScreen(g, ds.tileSize, f.ix, f.iy);
    ds.textx[faceIndex] = x;
    ds.texty[faceIndex] = y;
  }
  return [ds.textx[faceIndex], ds.texty[faceIndex]];
}

/** The colour phases, in z-order: mistakes paint over everything. */
const PHASES = [
  COL_FAINT,
  COL_LINEUNKNOWN,
  COL_FOREGROUND,
  COL_HIGHLIGHT,
  COL_MISTAKE,
] as const;

/** The colour an edge draws in, from its draw key. */
function lineColour(key: number, flashing: boolean): number {
  if (key === DS_LINE_ERROR) return COL_MISTAKE;
  if (key === LINE_UNKNOWN) return COL_LINEUNKNOWN;
  if (key === LINE_NO) return COL_FAINT;
  return flashing ? COL_HIGHLIGHT : COL_FOREGROUND;
}

export function redraw(
  dr: GameDrawing,
  ds: LoopyDrawState | null,
  _prev: LoopyState | null,
  s: LoopyState,
  _dir: number,
  ui: LoopyRenderUi,
  _animTime: number,
  flashTime: number,
): void {
  if (ds === null) return;
  const g = s.grid;
  const ts = ds.tileSize;
  const b = border(ts);

  // Clue colouring. `clueError` and `clueSatisfied` are what the C diffs to
  // decide whether a face needs repainting; here they are simply the key that
  // selects the digit's colour, recomputed each frame.
  for (let i = 0; i < g.numFaces; i++) {
    const n = s.clues[i];
    if (n < 0) continue;
    const sides = g.faces[i].order;
    const yes = faceOrder(s, i, LINE_YES);
    // When the YES edges already form exactly one loop and nothing else,
    // UNKNOWN counts as NO for clue checking. Some people play Loopy without
    // ever right-clicking, so they never mark a line NO; without this they
    // could close a loop over an underfilled clue and be shown neither a
    // victory flash nor a reason why not. Lighting the underfilled clue at the
    // instant the loop closes is the earliest moment this style of play makes
    // the error detectable at all. (Overfilled clues are caught either way.)
    const no = s.exactlyOneLoop ? sides - yes : faceOrder(s, i, LINE_NO);
    ds.clueError[i] = yes > n || no > sides - n ? 1 : 0;
    ds.clueSatisfied[i] = yes === n && no === sides - n ? 1 : 0;
  }

  // The completion flash is three visible segments over FLASH_TIME.
  ds.flashing =
    flashTime > 0 && (flashTime <= FLASH_TIME / 3 || flashTime >= (FLASH_TIME * 2) / 3);

  // Bucket the edges by colour once, rather than upstream's scan-per-phase.
  const buckets = new Map<number, number[]>(PHASES.map((c) => [c, []]));
  for (let i = 0; i < g.numEdges; i++) {
    const key = s.lineErrors[i] ? DS_LINE_ERROR : s.lines[i];
    ds.lines[i] = key;
    buckets.get(lineColour(key, ds.flashing))?.push(i);
  }

  const w = Math.round(((g.highestX - g.lowestX) * ts) / g.tileSize) + 2 * b + 1;
  const h = Math.round(((g.highestY - g.lowestY) * ts) / g.tileSize) + 2 * b + 1;

  // The game paints its own background; the engine emits no pixels of its own
  // (`fix-flip-canvas-reshape`). Every frame is a full repaint, so this both
  // establishes the background on the first draw and erases the previous frame
  // on every later one.
  dr.drawRect({ x: 0, y: 0, w, h }, COL_BACKGROUND);

  for (let i = 0; i < g.numFaces; i++) {
    const n = s.clues[i];
    if (n < 0) continue;
    const [x, y] = faceTextPos(ds, g, i);
    dr.drawText(
      { x, y },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor(ts / 2),
      },
      ds.clueError[i]
        ? COL_MISTAKE
        : ds.clueSatisfied[i]
          ? COL_SATISFIED
          : COL_FOREGROUND,
      String(n),
    );
  }

  for (const colour of PHASES) {
    // Faint lines are the NO marks, which some players prefer not to see.
    if (colour === COL_FAINT && !ui.drawFaintLines) continue;
    const thickness = colour === COL_FAINT ? faintLineThickness(ts) : lineThickness(ts);
    for (const i of buckets.get(colour) ?? []) {
      const e = g.edges[i];
      const [x1, y1] = toScreen(g, ts, e.dot1.x, e.dot1.y);
      const [x2, y2] = toScreen(g, ts, e.dot2.x, e.dot2.y);
      dr.drawLine({ x: x1, y: y1 }, { x: x2, y: y2 }, colour, thickness);
    }
  }

  for (let i = 0; i < g.numDots; i++) {
    const d = g.dots[i];
    const [x, y] = toScreen(g, ts, d.x, d.y);
    dr.drawCircle({ x, y }, dotRadius(ts), COL_FOREGROUND, COL_FOREGROUND);
  }

  dr.drawUpdate({ x: 0, y: 0, w, h });
  ds.started = true;
}
