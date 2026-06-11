/**
 * Shared grid-coordinate helpers — the upstream `COORD` / `FROMCOORD`
 * mapping between cell indices and pixels, with the per-game border
 * supplied by the caller (most games use `Math.floor(tileSize / 2)`;
 * Sixteen uses a full tile).
 *
 * `fromCoord` floors directly with `Math.floor`, which is correct for
 * pixels in the border region (negative `pixel - border`) without the
 * `+k·tileSize / −k` truncating-division idiom that upstream's C macro
 * needs and that each game used to copy. See the `ts-engine` spec,
 * "shared grid-coordinate helpers".
 */

/** Top-left pixel of cell `pos` along one axis. */
export function coord(pos: number, tileSize: number, border: number): number {
  return pos * tileSize + border;
}

/** Cell index containing `pixel` along one axis. Returns a negative
 * index for pixels left of / above the first cell (inside the border),
 * so callers' bounds checks reject them — matching the upstream macro's
 * intent. */
export function fromCoord(pixel: number, tileSize: number, border: number): number {
  return Math.floor((pixel - border) / tileSize);
}
