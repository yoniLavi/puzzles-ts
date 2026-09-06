/**
 * Flip's data model: params, state, moves, the `Ui`, and the hex bitmap codec
 * its desc is written in.
 *
 * The matrix is shared by reference across every state of one game — upstream
 * reference-counts it, we share it and let GC free it — so a move clones only
 * the grid.
 */

import type { GridCursor } from "../../engine/pointer.ts";

// --- types ----------------------------------------------------------

export type MatrixType = "crosses" | "random";

export interface FlipParams {
  w: number;
  h: number;
  matrixType: MatrixType;
}

export interface FlipState {
  readonly w: number;
  readonly h: number;
  /** wh×wh GF(2) toggle matrix, shared by reference across all states
   * of one game (C reference-counts it; we just share + let GC free). */
  readonly matrix: Uint8Array;
  /** wh cells; bit 0 = lit ("wrong"), bit 1 = solver-hint marker. */
  readonly grid: Uint8Array;
  readonly moves: number;
  readonly completed: boolean;
  readonly cheated: boolean;
  readonly hintsActive: boolean;
}

export type FlipMove =
  | { kind: "flip"; x: number; y: number }
  | { kind: "solve"; mask: number[] };

export interface FlipUi {
  cursor: GridCursor;
}

export function dupGrid(g: Uint8Array): Uint8Array {
  return g.slice();
}

// --- bitmap hex codec (flip.c encode_bitmap/decode_bitmap) ----------

const HEX = "0123456789abcdef";

export function encodeBitmap(bmp: Uint8Array, len: number): string {
  const slen = (len + 3) >> 2;
  let out = "";
  for (let i = 0; i < slen; i++) {
    let v = 0;
    for (let j = 0; j < 4; j++) {
      if (i * 4 + j < len && bmp[i * 4 + j]) v |= 8 >> j;
    }
    out += HEX[v];
  }
  return out;
}

export function decodeBitmap(bmp: Uint8Array, len: number, hex: string): void {
  const slen = (len + 3) >> 2;
  for (let i = 0; i < slen; i++) {
    const c = hex[i];
    let v: number;
    if (c >= "0" && c <= "9") v = c.charCodeAt(0) - 48;
    else if (c >= "A" && c <= "F") v = c.charCodeAt(0) - 65 + 10;
    else if (c >= "a" && c <= "f") v = c.charCodeAt(0) - 97 + 10;
    else v = 0;
    for (let j = 0; j < 4; j++) {
      if (i * 4 + j < len) bmp[i * 4 + j] = v & (8 >> j) ? 1 : 0;
    }
  }
}
