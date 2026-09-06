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

/**
 * Cell index containing `pixel` along one axis. Returns a negative
 * index for pixels left of / above the first cell (inside the border),
 * so callers' bounds checks reject them — matching the upstream macro's
 * intent.
 *
 * **This is the collection's one spelling of the pixel→cell conversion.** Games
 * used to write it four ways — `floor((v - b + ts) / ts) - 1`,
 * `floor((v + (ts - b)) / ts) - 1`, `floor(v / ts) - 1` and the plain form —
 * all of which are *exactly* this function (verified numerically over 14,868
 * samples, fractional tile sizes and negative pixels included), transcribed
 * from a C macro whose `+k·ts / −k` dance TypeScript does not need.
 * `re-express-the-collection` B3 converged them.
 *
 * **The one legitimate override is `Math.trunc`**, and six games take it:
 * Blackbox, Crossing, Group, Mathrax, Rome and Seismic. Truncation rounds
 * toward zero, so a click inside the top/left border margin folds onto row or
 * column 0 instead of landing off-grid at −1 — upstream's behavior, and each of
 * those games says so at its own `fromCoord` and names this helper as the thing
 * it is declining. That is the difference to preserve: it is the *only* way the
 * two spellings differ, and it is player-visible.
 */
export function fromCoord(pixel: number, tileSize: number, border: number): number {
  return Math.floor((pixel - border) / tileSize);
}
