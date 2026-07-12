/**
 * Rendering for Bridges. STUB — the real imperative redraw (islands, bridges,
 * marks, drag preview, hint lines, cursor, flash) with a per-tile Int32Array
 * cache lands in task 4 of add-bridges-ts-port. The palette and size model are
 * ported here already so `index.ts` wires cleanly.
 */
import type { Colour } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { BridgesParams, BridgesState, BridgesUi } from "./state.ts";

export const PREFERRED_TILE_SIZE = 24;
/** Web build defines NARROW_BORDERS: BORDER = TILE/8 + 1 (bridges.c line 93). */
export function border(tileSize: number): number {
  return Math.floor(tileSize / 8) + 1;
}

/** Colour enum order (bridges.c lines 103-113), index-for-index; mistake appended. */
export const COL_BACKGROUND = 0;
export const COL_FOREGROUND = 1;
export const COL_HIGHLIGHT = 2;
export const COL_LOWLIGHT = 3;
export const COL_SELECTED = 4;
export const COL_MARK = 5;
export const COL_HINT = 6;
export const COL_GRID = 7;
export const COL_WARNING = 8;
export const COL_CURSOR = 9;
export const COL_MISTAKE = 10; // fork addition, past the upstream enum

export interface BridgesDrawState {
  started: boolean;
  tileSize: number;
  /** Per-cell packed descriptor cache (Int32Array; ~0 forces first draw). */
  grid: Int32Array;
  dragging: boolean;
}

export function newDrawState(state: BridgesState): BridgesDrawState {
  return {
    started: false,
    tileSize: 0,
    grid: new Int32Array(state.w * state.h).fill(-1),
    dragging: false,
  };
}

export function computeSize(
  p: BridgesParams,
  tileSize: number,
): { w: number; h: number } {
  const b = border(tileSize);
  return { w: p.w * tileSize + 2 * b, h: p.h * tileSize + 2 * b };
}

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const [br, bg, bb] = background;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const cursor: Colour = [clamp(br * 1.4), clamp(bg * 1.4), clamp(bb * 1.4)];
  const grid: Colour = [
    (lowlight[0] + br) / 2,
    (lowlight[1] + bg) / 2,
    (lowlight[2] + bb) / 2,
  ];
  // Index-for-index with bridges.c game_colours.
  return [
    background, // COL_BACKGROUND
    [0, 0, 0], // COL_FOREGROUND
    highlight, // COL_HIGHLIGHT
    lowlight, // COL_LOWLIGHT
    [0.25, 1, 0.25], // COL_SELECTED
    highlight, // COL_MARK (= HIGHLIGHT)
    lowlight, // COL_HINT (= LOWLIGHT)
    grid, // COL_GRID
    [1, 0.25, 0.25], // COL_WARNING
    cursor, // COL_CURSOR
    [1, 0.55, 0.25], // COL_MISTAKE (fork addition)
  ];
}

/** TODO: imperative redraw with a per-tile cache + first-draw bg fill. */
export function redrawBridges(
  _dr: GameDrawing,
  _ds: BridgesDrawState | null,
  _prev: BridgesState | null,
  _s: BridgesState,
  _ui?: BridgesUi,
): void {
  throw new Error("bridges render: not implemented");
}
